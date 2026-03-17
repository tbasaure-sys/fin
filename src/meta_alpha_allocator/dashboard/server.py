from __future__ import annotations

import json
import os
import threading
import time
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from ..config import AllocatorSettings, DashboardSettings, PathConfig, ResearchSettings, artifact_only_mode
from ..research.chrono_fragility import latest_chrono_alert
from ..research.decision_audit import DecisionAudit, AuditSummary
from .snapshot import apply_screener_query, build_dashboard_snapshot, load_cached_snapshot


STATIC_ROOT = Path(__file__).resolve().parent / "static"
CORS_ORIGIN = os.environ.get("META_ALLOCATOR_CORS_ORIGIN", "*")

# How long to wait after startup before auto-refreshing in background (seconds).
# Set to 0 to disable background refresh on boot.
_BOOT_REFRESH_DELAY = int(os.environ.get("META_ALLOCATOR_BOOT_REFRESH_DELAY", "5"))


class DashboardService:
    """Serves a pre-built snapshot immediately on startup.

    On construction the service loads the cached snapshot from disk (if
    available) and returns it right away so the HTTP server can start
    accepting requests without running any heavy pipeline.  A background
    thread then refreshes the snapshot after ``boot_refresh_delay`` seconds.
    """

    def __init__(
        self,
        paths: PathConfig,
        research_settings: ResearchSettings,
        allocator_settings: AllocatorSettings,
        dashboard_settings: DashboardSettings,
        *,
        boot_refresh_delay: int = _BOOT_REFRESH_DELAY,
    ) -> None:
        self.paths = paths
        self.research_settings = research_settings
        self.allocator_settings = allocator_settings
        self.dashboard_settings = dashboard_settings
        self._lock = threading.Lock()
        self._refreshing = False
        self._started_at = time.monotonic()
        self._artifact_only = artifact_only_mode()

        # Always load cached snapshot first — never block startup.
        self._snapshot = load_cached_snapshot(paths, dashboard_settings)
        if self._snapshot is None:
            try:
                self._snapshot = build_dashboard_snapshot(
                    self.paths,
                    self.research_settings,
                    self.allocator_settings,
                    self.dashboard_settings,
                    refresh_outputs=False,
                )
            except Exception:
                self._snapshot = None

        if self._snapshot is None:
            # No cache at all: build a lightweight empty shell so the server
            # can still respond while the background refresh runs.
            from .snapshot import _empty_snapshot
            import sys as _sys
            from datetime import datetime
            from datetime import timezone as _tz
            UTC = getattr(__import__("datetime"), "UTC", _tz.utc)
            self._snapshot = _empty_snapshot(
                generated_at=datetime.now(tz=UTC).isoformat(),
                warnings=["snapshot not yet available — refresh in progress"],
            )
            self._snapshot["status"]["auto_refresh_seconds"] = dashboard_settings.auto_refresh_seconds

        if boot_refresh_delay >= 0:
            t = threading.Thread(target=self._background_refresh, args=(boot_refresh_delay,), daemon=True)
            t.start()

    def _background_refresh(self, delay: int) -> None:
        if delay > 0:
            time.sleep(delay)
        try:
            if self._artifact_only:
                cached = load_cached_snapshot(self.paths, self.dashboard_settings)
                if cached is not None:
                    with self._lock:
                        self._snapshot = cached
                return
            with self._lock:
                self._refreshing = True
            new_snapshot = build_dashboard_snapshot(
                self.paths,
                self.research_settings,
                self.allocator_settings,
                self.dashboard_settings,
                refresh_outputs=True,
            )
            with self._lock:
                self._snapshot = new_snapshot
                self._refreshing = False
        except Exception as exc:  # noqa: BLE001
            with self._lock:
                self._refreshing = False
            print(f"[dashboard] background refresh failed: {exc}")

    def snapshot(self) -> dict:
        with self._lock:
            return self._snapshot

    def is_refreshing(self) -> bool:
        with self._lock:
            return self._refreshing

    def audit_summary(self) -> dict:
        """Return the latest audit summary, loading from disk if needed."""
        # Try cached audit output first (written by run_decision_audit on refresh).
        audit_path = self.paths.output_root / "audit" / "latest" / "audit_summary.json"
        if audit_path.exists():
            try:
                text = audit_path.read_text(encoding="utf-8").replace("NaN", "null")
                return json.loads(text)
            except Exception:
                pass
        # Fall back: build live from CSV history and serialise via write_outputs.
        try:
            audit = DecisionAudit.from_paths(self.paths)
            summary = audit.build_summary()
            # write_outputs serialises the dataclass tree to a plain dict via JSON round-trip.
            audit.write_outputs(summary)
            text = audit_path.read_text(encoding="utf-8").replace("NaN", "null")
            return json.loads(text)
        except Exception as exc:
            return {"error": str(exc), "available": False}

    def chrono_alert(self) -> dict:
        """Return the latest chrono alert dict, loaded from the cached CSV panel."""
        try:
            return latest_chrono_alert(self.paths)
        except Exception as exc:
            return {"available": False, "error": str(exc)}

    def refresh(self) -> dict:
        """Trigger a synchronous refresh (called via POST /api/refresh)."""
        with self._lock:
            if self._artifact_only:
                cached = load_cached_snapshot(self.paths, self.dashboard_settings)
                if cached is not None:
                    self._snapshot = cached
                return self._snapshot

            self._snapshot = build_dashboard_snapshot(
                self.paths,
                self.research_settings,
                self.allocator_settings,
                self.dashboard_settings,
                refresh_outputs=True,
            )
            return self._snapshot


def _json_bytes(payload: dict) -> bytes:
    return json.dumps(payload, indent=2).encode("utf-8")


def _contract_headers(bls_state: dict) -> dict[str, str]:
    probabilistic = bls_state.get("probabilistic_state", {}) if bls_state else {}
    uncertainty = bls_state.get("uncertainty", {}) if bls_state else {}
    metrics = uncertainty.get("probability_package_metrics") or []
    recoverability_metric = next((row for row in metrics if row.get("target") == "portfolio_recoverability"), metrics[0] if metrics else {})
    return {
        "X-BLS-Contract-Version": str(bls_state.get("contract_version") or ""),
        "X-BLS-Model-Version": str(bls_state.get("model_version") or ""),
        "X-BLS-Contract-Status": str(bls_state.get("status", {}).get("contract_status") or ""),
        "X-BLS-Probability-Source": str(probabilistic.get("source") or ""),
        "X-BLS-Model-Package": str(probabilistic.get("model_package_version") or ""),
        "X-BLS-Fold-Count": str(recoverability_metric.get("fold_count") or ""),
        "X-BLS-Brier-OOF": str(recoverability_metric.get("brier_oof_calibrated") or ""),
        "X-BLS-Sample-Count": str(recoverability_metric.get("sample_count") or ""),
    }


def _bls_contract_routes(snapshot: dict) -> dict[str, dict]:
    bls_state = snapshot.get("bls_state_v1") or {}
    bls_state_v2 = snapshot.get("bls_state_v2") or {}
    return {
        "/api/state-contract": bls_state,
        "/api/state": {
            "as_of": bls_state.get("as_of"),
            "portfolio_id": bls_state.get("portfolio_id"),
            "horizon_days": bls_state.get("horizon_days"),
            "contract_version": bls_state.get("contract_version"),
            "model_version": bls_state.get("model_version"),
            "measured_state": bls_state.get("measured_state", {}),
            "probabilistic_state": bls_state.get("probabilistic_state", {}),
            "uncertainty": bls_state.get("uncertainty", {}),
        },
        "/api/policy": {
            "as_of": bls_state.get("as_of"),
            "portfolio_id": bls_state.get("portfolio_id"),
            "horizon_days": bls_state.get("horizon_days"),
            "contract_version": bls_state.get("contract_version"),
            "model_version": bls_state.get("model_version"),
            "policy_state": bls_state.get("policy_state", {}),
            "uncertainty": bls_state.get("uncertainty", {}),
        },
        "/api/repairs": {
            "as_of": bls_state.get("as_of"),
            "portfolio_id": bls_state.get("portfolio_id"),
            "horizon_days": bls_state.get("horizon_days"),
            "contract_version": bls_state.get("contract_version"),
            "model_version": bls_state.get("model_version"),
            "baseline_recoverability": bls_state.get("probabilistic_state", {}).get("p_portfolio_recoverability"),
            "baseline_phantom_rebound": bls_state.get("probabilistic_state", {}).get("p_phantom_rebound"),
            "repair_candidates": bls_state.get("repair_candidates", []),
            "uncertainty": bls_state.get("uncertainty", {}),
        },
        "/api/analogs": {
            "as_of": bls_state.get("as_of"),
            "portfolio_id": bls_state.get("portfolio_id"),
            "horizon_days": bls_state.get("horizon_days"),
            "contract_version": bls_state.get("contract_version"),
            "model_version": bls_state.get("model_version"),
            "analogs": bls_state.get("analogs", []),
            "uncertainty": bls_state.get("uncertainty", {}),
        },
        "/api/state-v2": {
            "as_of": bls_state_v2.get("as_of"),
            "portfolio_id": bls_state_v2.get("portfolio_id"),
            "horizon_days": bls_state_v2.get("horizon_days"),
            "contract_version": bls_state_v2.get("contract_version"),
            "model_version": bls_state_v2.get("model_version"),
            "measured_state": bls_state_v2.get("measured_state", {}),
            "probabilistic_state": bls_state_v2.get("probabilistic_state", {}),
            "policy_state": bls_state_v2.get("policy_state", {}),
            "recoverability_budget": bls_state_v2.get("recoverability_budget", {}),
            "healing_dynamics": bls_state_v2.get("healing_dynamics", {}),
            "rebound_sponsorship": bls_state_v2.get("rebound_sponsorship", {}),
            "legitimacy_surface": bls_state_v2.get("legitimacy_surface", {}),
            "failure_modes": bls_state_v2.get("failure_modes", {}),
            "transition_memory": bls_state_v2.get("transition_memory", {}),
            "repair_candidates": bls_state_v2.get("repair_candidates", []),
            "analogs": bls_state_v2.get("analogs", []),
            "uncertainty": bls_state_v2.get("uncertainty", {}),
        },
        "/api/legitimacy": {
            "as_of": bls_state_v2.get("as_of"),
            "portfolio_id": bls_state_v2.get("portfolio_id"),
            "contract_version": bls_state_v2.get("contract_version"),
            "model_version": bls_state_v2.get("model_version"),
            "legitimacy_surface": bls_state_v2.get("legitimacy_surface", {}),
            "uncertainty": bls_state_v2.get("uncertainty", {}),
        },
        "/api/failure-modes": {
            "as_of": bls_state_v2.get("as_of"),
            "portfolio_id": bls_state_v2.get("portfolio_id"),
            "contract_version": bls_state_v2.get("contract_version"),
            "model_version": bls_state_v2.get("model_version"),
            "failure_modes": bls_state_v2.get("failure_modes", {}),
            "uncertainty": bls_state_v2.get("uncertainty", {}),
        },
        "/api/transitions": {
            "as_of": bls_state_v2.get("as_of"),
            "portfolio_id": bls_state_v2.get("portfolio_id"),
            "contract_version": bls_state_v2.get("contract_version"),
            "model_version": bls_state_v2.get("model_version"),
            "transition_memory": bls_state_v2.get("transition_memory", {}),
            "uncertainty": bls_state_v2.get("uncertainty", {}),
        },
    }


def _content_type(path: Path) -> str:
    if path.suffix == ".js":
        return "application/javascript; charset=utf-8"
    if path.suffix == ".css":
        return "text/css; charset=utf-8"
    return "text/html; charset=utf-8"


def _build_handler(service: DashboardService) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def _send_cors_headers(self) -> None:
            self.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def _send_json(self, payload: dict, status: int = 200, extra_headers: dict[str, str] | None = None) -> None:
            body = _json_bytes(payload)
            self.send_response(status)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            for key, value in (extra_headers or {}).items():
                if value:
                    self.send_header(key, value)
            self.end_headers()
            self.wfile.write(body)

        def _send_static(self, asset_path: Path) -> None:
            if not asset_path.exists():
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            body = asset_path.read_bytes()
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", _content_type(asset_path))
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)

            # ── Health check ─────────────────────────────────────────────────
            # Railway/Vercel/K8s hit this before declaring the deploy alive.
            # It MUST respond instantly, even when the snapshot isn't ready.
            if parsed.path in {"/health", "/healthz", "/ping"}:
                self._send_json(
                    {
                        "ok": True,
                        "refreshing": service.is_refreshing(),
                        "uptime_seconds": round(time.monotonic() - service._started_at, 1),
                    }
                )
                return

            if parsed.path in {"/", "/index.html"}:
                self._send_static(STATIC_ROOT / "index.html")
                return
            if parsed.path == "/app.js":
                self._send_static(STATIC_ROOT / "app.js")
                return
            if parsed.path == "/config.js":
                self._send_static(STATIC_ROOT / "config.js")
                return
            if parsed.path == "/styles.css":
                self._send_static(STATIC_ROOT / "styles.css")
                return
            if parsed.path == "/api/snapshot":
                self._send_json(service.snapshot())
                return

            snapshot = service.snapshot()
            route_map = {
                "/api/overview": snapshot.get("overview", {}),
                "/api/performance": snapshot.get("performance", {}),
                "/api/risk": snapshot.get("risk", {}),
                "/api/spectral": snapshot.get("risk", {}).get("spectral", {}),
                "/api/forecast": snapshot.get("forecast", {}),
                "/api/hedges": snapshot.get("hedges", {}),
                "/api/sectors": snapshot.get("sectors", {}),
                "/api/international": snapshot.get("international", {}),
                "/api/portfolio": snapshot.get("portfolio", {}),
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
            if parsed.path == "/api/screener":
                self._send_json(apply_screener_query(snapshot, parsed.query))
                return
            if parsed.path in route_map:
                extra_headers = _contract_headers(snapshot.get("bls_state_v1") or {}) if parsed.path.startswith("/api/state") or parsed.path.startswith("/api/policy") or parsed.path.startswith("/api/repairs") or parsed.path.startswith("/api/analogs") else None
                self._send_json(route_map[parsed.path], extra_headers=extra_headers)
                return
            self.send_error(HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path != "/api/refresh":
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            snapshot = service.refresh()
            self._send_json(
                {
                    "ok": True,
                    "generated_at": snapshot.get("generated_at"),
                    "overview": snapshot.get("overview", {}),
                    "status": snapshot.get("status", {}),
                }
            )

        def do_OPTIONS(self) -> None:  # noqa: N802
            self.send_response(204)
            self._send_cors_headers()
            self.end_headers()

        def log_message(self, format: str, *args: object) -> None:  # noqa: A003
            return

    return Handler


def run_dashboard_server(
    paths: PathConfig,
    research_settings: ResearchSettings,
    allocator_settings: AllocatorSettings,
    dashboard_settings: DashboardSettings,
    *,
    open_browser: bool = False,
) -> None:
    service = DashboardService(paths, research_settings, allocator_settings, dashboard_settings)
    url = f"http://{dashboard_settings.host}:{dashboard_settings.port}"
    print(f"Dashboard available at {url}")
    if open_browser:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    # ── Prefer waitress in production, fall back to stdlib for local dev ──
    try:
        from waitress import serve as waitress_serve  # type: ignore[import]
        wsgi_app = _make_wsgi_app(service)
        print("[dashboard] serving via waitress")
        waitress_serve(wsgi_app, host=dashboard_settings.host, port=dashboard_settings.port, threads=4)
    except ImportError:
        print("[dashboard] waitress not installed — falling back to stdlib ThreadingHTTPServer")
        server = ThreadingHTTPServer(
            (dashboard_settings.host, dashboard_settings.port),
            _build_handler(service),
        )
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
