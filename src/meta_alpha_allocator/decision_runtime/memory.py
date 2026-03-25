from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from ..state_contract.policy_memory import load_policy_memory


def _output_root(snapshot: dict[str, Any]) -> Path:
    raw = snapshot.get("_output_root")
    if raw:
        return Path(str(raw))
    return Path(os.environ.get("META_ALLOCATOR_OUTPUT_ROOT", Path(__file__).resolve().parents[3] / "output")).expanduser()


def _safe_json_load(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8").replace("NaN", "null")
        payload = json.loads(text)
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def summarize_decision_memory(snapshot: dict[str, Any]) -> dict[str, Any]:
    policy_memory = load_policy_memory(snapshot)
    audit_path = _output_root(snapshot) / "audit" / "latest" / "audit_summary.json"
    audit_summary = _safe_json_load(audit_path) or {}

    narrative: list[str] = []
    last_mode = str(policy_memory.get("last_mode") or "").strip()
    entered_at = str(policy_memory.get("mode_entered_at") or "").strip()
    if last_mode:
        narrative.append(f"Last policy mode was {last_mode.replace('_', ' ')}.")
    if entered_at:
        narrative.append(f"That mode entered on {entered_at}.")
    if audit_summary.get("accuracy_overall") is not None:
        narrative.append(f"Recent decision accuracy is {float(audit_summary['accuracy_overall']) * 100:.1f}%.")
    if audit_summary.get("penalty_reason"):
        narrative.append(str(audit_summary["penalty_reason"]))
    if not narrative:
        narrative.append("No decision memory is available yet.")

    recent_decisions = audit_summary.get("recent_decisions", [])
    if not isinstance(recent_decisions, list):
        recent_decisions = []

    return {
        "available": bool(policy_memory or audit_summary),
        "policy_memory": policy_memory,
        "audit_summary": audit_summary,
        "recent_decisions": recent_decisions[:5],
        "narrative": narrative,
        "confidence_penalty": audit_summary.get("confidence_penalty"),
        "penalty_reason": audit_summary.get("penalty_reason"),
        "recent_consecutive_errors": audit_summary.get("recent_consecutive_errors"),
        "accuracy_overall": audit_summary.get("accuracy_overall"),
        "calibration_gap": audit_summary.get("calibration_gap"),
    }
