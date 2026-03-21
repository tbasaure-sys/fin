from __future__ import annotations

import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


_load_env_file(ROOT / ".env")
_load_env_file(ROOT / ".env.local")

from meta_alpha_allocator.config import AllocatorSettings, PathConfig, ResearchSettings  # noqa: E402
from meta_alpha_allocator.data.fmp_client import FMPClient  # noqa: E402
from meta_alpha_allocator.data.runtime_bootstrap import ensure_runtime_inputs  # noqa: E402
from meta_alpha_allocator.dashboard.snapshot import _safe_json_load  # noqa: E402
from meta_alpha_allocator.storage.runtime_store import save_runtime_document, save_runtime_snapshot  # noqa: E402


def main() -> int:
    if not os.environ.get("DATABASE_URL", "").strip():
        print("DATABASE_URL is required to seed the runtime store.", file=sys.stderr)
        return 1

    paths = PathConfig()
    research_settings = ResearchSettings()
    allocator_settings = AllocatorSettings()
    fmp_client = FMPClient.from_env(paths.cache_root)

    dashboard_snapshot = (
        _safe_json_load(paths.output_root / "dashboard" / "latest" / "dashboard_snapshot.json")
        or _safe_json_load(paths.artifact_root / "dashboard" / "latest" / "dashboard_snapshot.json")
    )
    current_allocator_decision = _safe_json_load(paths.output_root / "production" / "latest" / "current_allocator_decision.json")

    seeded: list[str] = []
    if dashboard_snapshot:
        save_runtime_document(
            "dashboard_snapshot",
            dashboard_snapshot,
            {"source": "seed:dashboard_snapshot", "generated_at": dashboard_snapshot.get("generated_at")},
        )
        save_runtime_snapshot(
            dashboard_snapshot,
            snapshot_key="dashboard/latest",
            source="seed:dashboard_snapshot",
            status="ready",
        )
        seeded.extend(["dashboard_snapshot", "dashboard/latest"])
    if current_allocator_decision:
        save_runtime_document(
            "current_allocator_decision",
            current_allocator_decision,
            {"source": "seed:current_allocator_decision"},
        )
        seeded.append("current_allocator_decision")

    bootstrap = ensure_runtime_inputs(paths, research_settings, fmp_client=fmp_client)
    seeded.extend(bootstrap.bootstrapped)

    print(json.dumps({"seeded": seeded}, indent=2))
    return 0 if seeded else 1


if __name__ == "__main__":
    raise SystemExit(main())
