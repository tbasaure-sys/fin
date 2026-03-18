from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8").replace("NaN", "null"))


def _dump_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def _redact_portfolio(payload: dict) -> dict:
    portfolio = dict(payload.get("portfolio", {}) or {})
    portfolio.pop("holdings", None)
    portfolio.pop("top_holdings", None)
    next_payload = dict(payload)
    next_payload["portfolio"] = portfolio
    return next_payload


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: redact_dashboard_artifact.py <source_dir> <target_dir>")
        return 2

    source_dir = Path(argv[1]).expanduser().resolve()
    target_dir = Path(argv[2]).expanduser().resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    for source_path in source_dir.glob("*.json"):
        target_path = target_dir / source_path.name
        if source_path.name == "dashboard_snapshot.json":
            _dump_json(target_path, _redact_portfolio(_load_json(source_path)))
        elif source_path.name == "portfolio.json":
            payload = _load_json(source_path)
            payload.pop("holdings", None)
            payload.pop("top_holdings", None)
            _dump_json(target_path, payload)
        else:
            shutil.copy2(source_path, target_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
