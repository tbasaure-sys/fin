from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MEMORY_FILE = 'policy_memory.json'


def _memory_path(snapshot: dict[str, Any]) -> Path:
    output_root = Path(snapshot.get('_output_root') or Path(__file__).resolve().parents[3] / 'output')
    return output_root / 'state_contract' / 'latest' / MEMORY_FILE


def load_policy_memory(snapshot: dict[str, Any]) -> dict[str, Any]:
    path = _memory_path(snapshot)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {}


def write_policy_memory(snapshot: dict[str, Any], memory: dict[str, Any]) -> None:
    path = _memory_path(snapshot)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        **memory,
        'updated_at': datetime.now(tz=timezone.utc).isoformat(),
    }
    path.write_text(json.dumps(payload, indent=2), encoding='utf-8')
