from __future__ import annotations

import json
import os
import threading
import webbrowser
from functools import partial
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from ..config import AllocatorSettings, DashboardSettings, PathConfig, ResearchSettings
from .snapshot import apply_screener_query, build_dashboard_snapshot, load_cached_snapshot


STATIC_ROOT = Path(__file__).resolve().parent / "static"
CORS_ORIGIN = os.environ.get("META_ALLOCATOR_CORS_ORIGIN", "*")


class DashboardService:
    def __init__(
        self,
        paths: PathConfig,
        research_settings: ResearchSettings,
        allocator_settings: AllocatorSettings,
        dashboard_settings: DashboardSettings,
    ) -> None:
        self.paths = paths
        self.research_settings = research_settings
        self.allocator_settings = allocator_settings
        self.dashboard_settings = dashboard_settings
        self._lock = threading.Lock()
        self._snapshot = load_cached_snapshot(paths, dashboard_settings)
        if self._snapshot is None:
            self._snapshot = build_dashboard_snapshot(
                paths,
                research_settings,
                allocator_settings,
                dashboard_settings,
                refresh_outputs=True,
            )

    def snapshot(self) -> dict:
        with self._lock:
            return self._snapshot

    def refresh(self) -> dict:
        with self._lock:
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

        def _send_json(self, payload: dict, status: int = 200) -> None:
            body = _json_bytes(payload)
            self.send_response(status)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
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
                "/api/status": snapshot.get("status", {}),
            }
            if parsed.path == "/api/screener":
                self._send_json(apply_screener_query(snapshot, parsed.query))
                return
            if parsed.path in route_map:
                self._send_json(route_map[parsed.path])
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
    server = ThreadingHTTPServer((dashboard_settings.host, dashboard_settings.port), _build_handler(service))
    url = f"http://{dashboard_settings.host}:{dashboard_settings.port}"
    print(f"Dashboard available at {url}")
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
