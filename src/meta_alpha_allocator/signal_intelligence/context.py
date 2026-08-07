"""Fail-closed adapters for non-bar context sources.

These adapters only consume already-normalized, dated context payloads. They
never substitute for EOD bars and never turn a missing source into a neutral
vote that could be mistaken for evidence.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Mapping


def _source_date(payload: Mapping[str, Any]) -> str | None:
    for key in ("asOfDate", "as_of_date", "availableAt", "available_at", "capturedAt", "captured_at"):
        value = payload.get(key)
        if value:
            return str(value)[:10]
    return None


def _direction(payload: Mapping[str, Any]) -> int:
    raw = payload.get("direction", payload.get("signalDirection"))
    if raw is None:
        state = str(payload.get("state", payload.get("stance", ""))).lower()
        if state in {"favorable", "supportive", "bullish", "positive", "tailwind"}:
            return 1
        if state in {"adverse", "hostile", "bearish", "negative", "headwind"}:
            return -1
        return 0
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return 0
    return value if value in {-1, 0, 1} else 0


def _vote(source: str, payload: Any, as_of: date | str | None) -> dict[str, Any] | None:
    if not isinstance(payload, Mapping):
        return None
    if payload.get("status") in {"blocked", "stale", "unavailable", "insufficient_data"}:
        return None
    source_date = _source_date(payload)
    if as_of and source_date and source_date > str(as_of)[:10]:
        return None
    direction = _direction(payload)
    if direction == 0:
        return None
    return {"primitive": source, "direction": direction, "asOfDate": source_date}


def build_context_adapter(
    *,
    mosaic: Mapping[str, Any] | None = None,
    compelled_flow: Mapping[str, Any] | None = None,
    fred: Mapping[str, Any] | None = None,
    as_of: date | str | None = None,
) -> dict[str, Any]:
    votes = []
    for source, payload in (("mosaic", mosaic), ("compelled_flow", compelled_flow), ("fred", fred)):
        vote = _vote(source, payload, as_of)
        if vote:
            votes.append(vote)
    if not votes:
        return {
            "available": False,
            "state": "unavailable",
            "direction": 0,
            "votes": [],
            "source": "MOSAIC/Compelled Flow/FRED",
            "warnings": ["context_sources_unavailable"],
        }
    total = sum(vote["direction"] for vote in votes)
    state = "favorable" if total > 0 and all(vote["direction"] > 0 for vote in votes) else "adverse" if total < 0 and all(vote["direction"] < 0 for vote in votes) else "mixed"
    direction = 1 if total > 0 else -1 if total < 0 else 0
    return {
        "available": True,
        "state": state,
        "direction": direction,
        "votes": votes,
        "source": "MOSAIC/Compelled Flow/FRED",
        "warnings": [],
    }
