from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..state_contract.policy_memory import load_policy_memory

_MAX_EVENTS = 100


def _output_root(snapshot: dict[str, Any], output_root: Path | None = None) -> Path:
    if output_root is not None:
        return output_root
    raw = snapshot.get("_output_root")
    if raw:
        return Path(str(raw))
    return Path(__file__).resolve().parents[3] / "output"


def _events_path(snapshot: dict[str, Any], output_root: Path | None = None) -> Path:
    return _output_root(snapshot, output_root) / "audit" / "latest" / "decision_events.json"


def _safe_json_load(path: Path) -> dict[str, Any] | list[dict[str, Any]] | None:
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8").replace("NaN", "null")
        payload = json.loads(text)
        if isinstance(payload, dict):
            return payload
        if isinstance(payload, list):
            return payload
    except Exception:
        return None
    return None


def _event_sort_key(event: dict[str, Any]) -> str:
    return str(
        event.get("sort_key")
        or event.get("occurred_at")
        or event.get("generated_at")
        or event.get("date")
        or ""
    )


def _append_or_replace(events: list[dict[str, Any]], event: dict[str, Any]) -> list[dict[str, Any]]:
    event_id = str(event.get("id") or "")
    if event_id:
        events = [item for item in events if str(item.get("id") or "") != event_id]
    events.append(event)
    events = sorted(events, key=_event_sort_key)
    if len(events) > _MAX_EVENTS:
        events = events[-_MAX_EVENTS:]
    return events


def _decision_packet(snapshot: dict[str, Any]) -> dict[str, Any]:
    return snapshot.get("decision_packet") or {}


def _refresh_event(snapshot: dict[str, Any]) -> dict[str, Any]:
    packet = _decision_packet(snapshot)
    portfolio = snapshot.get("portfolio", {}) or {}
    memory = packet.get("memory", {}) or {}
    current_read = packet.get("current_read") or []
    moves = packet.get("moves") or []
    best_move = moves[0] if moves else {}
    generated_at = str(snapshot.get("generated_at") or packet.get("generated_at") or snapshot.get("as_of_date") or "")
    as_of_date = str(snapshot.get("as_of_date") or snapshot.get("overview", {}).get("as_of_date") or "")
    return {
        "id": f"refresh::{generated_at}",
        "kind": "snapshot_refresh",
        "sort_key": generated_at or as_of_date,
        "occurred_at": generated_at,
        "as_of_date": as_of_date,
        "headline": packet.get("headline") or packet.get("title") or "Just advice",
        "recommended_action": snapshot.get("overview", {}).get("recommended_action") or packet.get("recommended_action"),
        "state_mode": packet.get("stateSummary", {}).get("mode") or snapshot.get("overview", {}).get("regime") or "Unknown",
        "recovery_chance": packet.get("stateSummary", {}).get("recoverability"),
        "false_rebound_risk": packet.get("stateSummary", {}).get("phantom"),
        "authority": packet.get("stateSummary", {}).get("authority"),
        "fiber_ambiguity": packet.get("fiberAmbiguity") or packet.get("fiberHeadline") or packet.get("fiberTakeaway"),
        "holdings_count": next((item.get("value") for item in current_read if item.get("label") == "Holdings"), None),
        "holdings_source": portfolio.get("holdings_source") or "shared_snapshot",
        "holdings_source_label": portfolio.get("holdings_source_label") or "Shared snapshot",
        "memory_available": bool(memory.get("available")),
        "memory_penalty_reason": memory.get("penalty_reason") or memory.get("penaltyReason"),
        "top_move": {
            "slot": best_move.get("slot"),
            "title": best_move.get("title"),
            "summary": best_move.get("summary"),
            "trigger": best_move.get("trigger"),
        } if best_move else None,
        "source": "snapshot_refresh",
    }


def _outcome_events(snapshot: dict[str, Any], output_root: Path | None = None) -> list[dict[str, Any]]:
    audit_path = _events_path(snapshot, output_root).parent / "audit_summary.json"
    audit_summary = _safe_json_load(audit_path)
    if not isinstance(audit_summary, dict):
        audit_summary = {}
    recent_decisions = audit_summary.get("recent_decisions", [])
    if not isinstance(recent_decisions, list):
        recent_decisions = []

    events: list[dict[str, Any]] = []
    for row in recent_decisions:
        if not isinstance(row, dict):
            continue
        date = str(row.get("date") or "")
        recommended = str(row.get("recommended") or "")
        if not date and not recommended:
            continue
        events.append({
            "id": f"outcome::{date}::{recommended}",
            "kind": "decision_outcome",
            "sort_key": date,
            "occurred_at": date,
            "date": date,
            "recommended_action": recommended or None,
            "best_ex_post": row.get("best_ex_post"),
            "was_correct": row.get("was_correct"),
            "confidence": row.get("confidence"),
            "utility_achieved": row.get("utility_achieved"),
            "utility_best": row.get("utility_best"),
            "utility_gap": row.get("utility_gap"),
            "regime": row.get("regime"),
            "source": "audit_summary",
        })
    return events


def summarize_decision_events(snapshot: dict[str, Any], output_root: Path | None = None) -> dict[str, Any]:
    path = _events_path(snapshot, output_root)
    payload = _safe_json_load(path)
    events: list[dict[str, Any]] = []
    if isinstance(payload, dict):
        existing = payload.get("events", [])
        if isinstance(existing, list):
            events.extend([item for item in existing if isinstance(item, dict)])
    elif isinstance(payload, list):
        events.extend([item for item in payload if isinstance(item, dict)])

    refresh_event = _refresh_event(snapshot)
    events = _append_or_replace(events, refresh_event)
    for event in _outcome_events(snapshot, output_root):
        events = _append_or_replace(events, event)

    latest_refresh = next((item for item in reversed(events) if item.get("kind") == "snapshot_refresh"), None)
    latest_outcome = next((item for item in reversed(events) if item.get("kind") == "decision_outcome"), None)
    narrative: list[str] = []
    if latest_refresh:
        headline = str(latest_refresh.get("headline") or "Just advice")
        recovery = str(latest_refresh.get("recovery_chance") or "-")
        narrative.append(f"Latest refresh: {headline} at recovery chance {recovery}.")
    if latest_outcome:
        outcome = "held up" if latest_outcome.get("was_correct") else "missed" if latest_outcome.get("was_correct") is False else "pending"
        narrative.append(
            f"Latest outcome: {latest_outcome.get('date')} {latest_outcome.get('recommended_action') or 'advice'} {outcome}."
        )
    if not narrative:
        narrative.append("No decision events are available yet.")

    counts = {
        "refresh": sum(1 for item in events if item.get("kind") == "snapshot_refresh"),
        "outcome": sum(1 for item in events if item.get("kind") == "decision_outcome"),
    }
    latest = latest_refresh or latest_outcome
    return {
        "available": bool(events),
        "updated_at": refresh_event.get("occurred_at"),
        "latest": latest,
        "latest_refresh": latest_refresh,
        "latest_outcome": latest_outcome,
        "events": events[-10:],
        "counts": counts,
        "narrative": narrative,
        "policy_memory": load_policy_memory({**snapshot, "_output_root": str(_output_root(snapshot, output_root))}),
    }


def record_decision_events(snapshot: dict[str, Any], output_root: Path | None = None) -> dict[str, Any]:
    summary = summarize_decision_events(snapshot, output_root=output_root)
    path = _events_path(snapshot, output_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "available": summary.get("available", False),
        "updated_at": summary.get("updated_at"),
        "latest": summary.get("latest"),
        "latest_refresh": summary.get("latest_refresh"),
        "latest_outcome": summary.get("latest_outcome"),
        "events": summary.get("events", []),
        "counts": summary.get("counts", {}),
        "narrative": summary.get("narrative", []),
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload
