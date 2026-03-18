from __future__ import annotations

from typing import Any


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp_signed(value: float, limit: float = 1.0) -> float:
    return max(-limit, min(limit, float(value)))


def _delta(rows: list[dict[str, Any]], key: str, span: int) -> float:
    if len(rows) <= span:
        return 0.0
    latest = _num(rows[-1].get(key), 0.0)
    prior = _num(rows[-(span + 1)].get(key), latest)
    return latest - prior


def build_healing_dynamics(snapshot: dict[str, Any], measured_state: dict[str, Any]) -> dict[str, Any]:
    history = snapshot.get("risk", {}).get("spectral", {}).get("history") or []
    if not history:
        return {
            "healing_velocity": 0.0,
            "breadth_healing_velocity": 0.0,
            "dimension_healing_velocity": 0.0,
            "compression_relief_velocity": 0.0,
            "fragility_relief_velocity": 0.0,
            "state": "flat",
            "confidence": 0.25,
        }

    compression_relief = _clamp_signed(-_delta(history, "compression_score", 5))
    dimension_healing = _clamp_signed(_delta(history, "effective_dimension", 5) / 4.0)
    breadth_healing = _clamp_signed(_delta(history, "freedom_score", 5))
    fragility_relief = _clamp_signed(0.5 - _num(measured_state.get("portfolio_fragility_exposure"), 0.5))
    healing_velocity = _clamp_signed(
        0.35 * compression_relief
        + 0.30 * dimension_healing
        + 0.25 * breadth_healing
        + 0.10 * fragility_relief
    )
    if healing_velocity >= 0.12:
        state = "healing"
    elif healing_velocity <= -0.08:
        state = "decaying"
    else:
        state = "flat"

    confidence = min(1.0, max(0.25, len(history) / 30.0))
    return {
        "healing_velocity": healing_velocity,
        "breadth_healing_velocity": breadth_healing,
        "dimension_healing_velocity": dimension_healing,
        "compression_relief_velocity": compression_relief,
        "fragility_relief_velocity": fragility_relief,
        "state": state,
        "confidence": confidence,
    }
