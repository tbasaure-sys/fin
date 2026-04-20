"""WSGI entry point for production deployment (gunicorn / waitress).

Usage with gunicorn (recommended for Railway):
    gunicorn "meta_alpha_allocator.dashboard.wsgi:create_app()" \
        --workers 1 --threads 4 --timeout 120 \
        --bind 0.0.0.0:${PORT:-8000}

Usage with waitress (Windows-friendly alternative):
    waitress-serve --port 8000 "meta_alpha_allocator.dashboard.wsgi:create_app()"

The app is built lazily via ``create_app()`` so that importing this module
does not trigger any I/O or heavy computation.  gunicorn calls create_app()
once per worker process.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from ..config import AllocatorSettings, DashboardSettings, PathConfig, ResearchSettings
from .server import DashboardService, CORS_ORIGIN, _bls_contract_routes, _contract_headers_for_path
from .snapshot import apply_screener_query
# chrono_alert is exposed via service.chrono_alert() — no extra import needed here

STATIC_ROOT = Path(__file__).resolve().parent / "static"


def _cors_headers() -> list[tuple[str, str]]:
    return [
        ("Access-Control-Allow-Origin", CORS_ORIGIN),
        ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
        ("Access-Control-Allow-Headers", "Content-Type, X-SEC-User-Agent"),
    ]


def _sec_user_agent_from_environ(environ: dict) -> str | None:
    value = str(environ.get("HTTP_X_SEC_USER_AGENT") or "").strip()
    return value or None


def _json_response(start_response, payload: dict, status: int = 200, extra_headers: list[tuple[str, str]] | None = None) -> list[bytes]:
    body = json.dumps(payload, indent=2).encode("utf-8")
    headers = [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Content-Length", str(len(body))),
        ("Cache-Control", "no-store"),
        *(extra_headers or []),
        *_cors_headers(),
    ]
    status_map = {
        200: "200 OK",
        202: "202 Accepted",
        400: "400 Bad Request",
        404: "404 Not Found",
        405: "405 Method Not Allowed",
    }
    start_response(status_map.get(status, f"{status} Unknown"), headers)
    return [body]


def _static_response(start_response, path: Path) -> list[bytes]:
    if not path.exists():
        start_response("404 Not Found", [("Content-Type", "text/plain")])
        return [b"Not found"]
    body = path.read_bytes()
    if path.suffix == ".js":
        content_type = "application/javascript; charset=utf-8"
    elif path.suffix == ".css":
        content_type = "text/css; charset=utf-8"
    else:
        content_type = "text/html; charset=utf-8"
    headers = [
        ("Content-Type", content_type),
        ("Content-Length", str(len(body))),
        ("Cache-Control", "no-store"),
        *_cors_headers(),
    ]
    start_response("200 OK", headers)
    return [body]


def create_app(
    paths: PathConfig | None = None,
    research_settings: ResearchSettings | None = None,
    allocator_settings: AllocatorSettings | None = None,
    dashboard_settings: DashboardSettings | None = None,
):
    """Build and return a WSGI callable backed by ``DashboardService``."""
    paths = paths or PathConfig()
    research_settings = research_settings or ResearchSettings()
    allocator_settings = allocator_settings or AllocatorSettings()
    dashboard_settings = dashboard_settings or DashboardSettings()

    service = DashboardService(paths, research_settings, allocator_settings, dashboard_settings)

    def app(environ, start_response):
        method = environ.get("REQUEST_METHOD", "GET").upper()
        path_info = environ.get("PATH_INFO", "/")
        query_string = environ.get("QUERY_STRING", "")

        # ── OPTIONS preflight ─────────────────────────────────────────────
        if method == "OPTIONS":
            start_response("204 No Content", list(_cors_headers()))
            return [b""]

        # ── Health check — must be instant ────────────────────────────────
        if path_info in {"/health", "/healthz", "/ping"}:
            return _json_response(start_response, {
                "ok": True,
                "refreshing": service.is_refreshing(),
                "uptime_seconds": round(time.monotonic() - service._started_at, 1),
            })

        # ── Static assets ─────────────────────────────────────────────────
        static_map = {
            "/": STATIC_ROOT / "index.html",
            "/index.html": STATIC_ROOT / "index.html",
            "/app.js": STATIC_ROOT / "app.js",
            "/config.js": STATIC_ROOT / "config.js",
            "/styles.css": STATIC_ROOT / "styles.css",
        }
        if path_info in static_map and method == "GET":
            return _static_response(start_response, static_map[path_info])

        # ── POST /api/refresh ─────────────────────────────────────────────
        if path_info == "/api/equity-research/jobs" and method == "POST":
            try:
                content_length = int(environ.get("CONTENT_LENGTH") or 0)
                body = environ["wsgi.input"].read(content_length) if content_length > 0 else b"{}"
                payload = json.loads(body.decode("utf-8") or "{}")
            except (json.JSONDecodeError, ValueError):
                return _json_response(start_response, {"ok": False, "error": "Invalid JSON body."}, status=400)
            result = service.start_equity_research_job(
                str(payload.get("ticker") or "").strip(),
                mode=str(payload.get("mode") or "quick").strip(),
                client_run_id=str(payload.get("client_run_id") or payload.get("run_id") or "").strip(),
                sec_user_agent=str(payload.get("sec_user_agent") or _sec_user_agent_from_environ(environ) or "").strip() or None,
            )
            return _json_response(start_response, result, status=202)

        if path_info == "/api/refresh" and method == "POST":
            snapshot = service.refresh()
            return _json_response(start_response, {
                "ok": True,
                "generated_at": snapshot.get("generated_at"),
                "overview": snapshot.get("overview", {}),
                "status": snapshot.get("status", {}),
            })

        # ── POST /api/phantom-diversification ─────────────────────────────
        if path_info == "/api/phantom-diversification" and method == "POST":
            from ..research.phantom_diversification import PhantomDiversificationError, analyze_portfolio
            try:
                content_length = int(environ.get("CONTENT_LENGTH") or 0)
                body = environ["wsgi.input"].read(content_length) if content_length > 0 else b"{}"
                payload = json.loads(body)
                result = analyze_portfolio(
                    payload.get("holdings") or [],
                    workspace_id=payload.get("workspace_id"),
                )
                return _json_response(start_response, result)
            except PhantomDiversificationError as error:
                return _json_response(start_response, {"error": str(error)}, status=400)
            except Exception as error:
                return _json_response(start_response, {"error": f"Unexpected phantom diversification failure: {error}"}, status=500)

        # ── GET API routes ────────────────────────────────────────────────
        if method != "GET":
            return _json_response(start_response, {"error": "Method not allowed"}, status=405)

        if path_info.startswith("/api/equity-research/jobs/"):
            job_id = unquote(path_info.rsplit("/", 1)[-1])
            job = service.equity_research_job(job_id)
            return _json_response(start_response, job, status=404 if job.get("status") == "not_found" else 200)

        if path_info == "/api/equity-research" or path_info.startswith("/api/equity-research/"):
            params = parse_qs(query_string)
            path_ticker = ""
            if path_info.startswith("/api/equity-research/"):
                path_ticker = unquote(path_info.rsplit("/", 1)[-1])
            ticker = (params.get("ticker") or [path_ticker])[0]
            mode = (params.get("mode") or ["quick"])[0]
            return _json_response(start_response, service.equity_research(ticker, mode=mode, sec_user_agent=_sec_user_agent_from_environ(environ)))

        snapshot = service.snapshot()

        if path_info == "/api/snapshot":
            return _json_response(start_response, snapshot)

        if path_info == "/api/screener":
            return _json_response(start_response, apply_screener_query(snapshot, query_string))

        route_map = {
            "/api/overview": snapshot.get("overview", {}),
            "/api/decision-packet": snapshot.get("decision_packet", {}),
            "/api/decision-events": snapshot.get("decision_event_log", {}),
            "/api/performance": snapshot.get("performance", {}),
            "/api/risk": snapshot.get("risk", {}),
            "/api/spectral": snapshot.get("risk", {}).get("spectral", {}),
            "/api/forecast": snapshot.get("forecast", {}),
            "/api/hedges": snapshot.get("hedges", {}),
            "/api/sectors": snapshot.get("sectors", {}),
            "/api/international": snapshot.get("international", {}),
            "/api/chile": snapshot.get("chile_market", {}),
            "/api/portfolio": snapshot.get("portfolio", {}),
            "/api/protocol": snapshot.get("protocol", {}),
            "/api/statement-intelligence": snapshot.get("statement_intelligence", {}),
            "/api/statement-kernel": {
                "top_kernel_names": snapshot.get("statement_intelligence", {}).get("top_kernel_names", []),
                "cash_mismatch_names": snapshot.get("statement_intelligence", {}).get("cash_mismatch_names", []),
                "kernel_sector_breadth": snapshot.get("statement_intelligence", {}).get("kernel_sector_breadth", []),
                "kernel_research_utility": snapshot.get("statement_intelligence", {}).get("kernel_research_utility", {}),
            },
            "/api/status": {
                **snapshot.get("status", {}),
                "refreshing": service.is_refreshing(),
            },
            "/api/audit": service.audit_summary(),
            "/api/chrono": service.chrono_alert(),
        }
        route_map.update(_bls_contract_routes(snapshot))

        if path_info in route_map:
            extra_headers = _contract_headers_for_path(snapshot, path_info)
            extra_headers = list(extra_headers.items()) if extra_headers else None
            return _json_response(start_response, route_map[path_info], extra_headers=extra_headers)

        return _json_response(start_response, {"error": "Not found"}, status=404)

    return app
