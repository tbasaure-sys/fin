from __future__ import annotations

from typing import Any


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def build_rebound_sponsorship(
    measured_state: dict[str, Any],
    probabilistic_state: dict[str, Any],
    healing_dynamics: dict[str, Any],
    transition_memory: dict[str, Any],
) -> dict[str, Any]:
    visible = _num(probabilistic_state.get("p_visible_correction"), 0.0)
    restoration = _num(probabilistic_state.get("p_structural_restoration"), 0.0)
    phantom = _num(probabilistic_state.get("p_phantom_rebound"), 0.0)
    healing = _num(healing_dynamics.get("healing_velocity"), 0.0)
    breadth = _num(measured_state.get("breadth"), 0.0)
    compression = _num(measured_state.get("market_compression"), 0.0)
    dominance = _num(measured_state.get("market_dominance_share"), 0.0)
    entropy = _num(transition_memory.get("state_entropy"), 0.5)

    breadth_score = _clamp01(0.45 * breadth + 0.35 * max(healing, 0.0) + 0.20 * restoration)
    support_dependency = _clamp01(0.45 * phantom + 0.30 * compression + 0.25 * entropy)
    fragility_transfer_risk = _clamp01(0.40 * dominance + 0.35 * phantom + 0.25 * max(-healing, 0.0))

    if visible >= 0.45 and restoration >= 0.55 and healing >= 0.12 and breadth_score >= 0.55:
        sponsorship_type = "broad_repair"
    elif visible >= 0.35 and support_dependency >= 0.58 and breadth_score < 0.48:
        sponsorship_type = "policy_relief"
    elif visible >= 0.30 and dominance >= 0.58 and breadth_score < 0.45:
        sponsorship_type = "narrow_leadership"
    elif visible >= 0.30 and fragility_transfer_risk >= 0.55 and phantom >= 0.25:
        sponsorship_type = "short_covering"
    elif visible >= 0.25 and restoration < 0.40 and breadth_score < 0.45:
        sponsorship_type = "defensive_rotation"
    else:
        sponsorship_type = "mixed"

    confidence = _clamp01(
        0.35
        + 0.25 * abs(restoration - phantom)
        + 0.20 * abs(healing)
        + 0.20 * abs(breadth_score - support_dependency)
    )
    narrative = [
        f"Rebound sponsorship is classified as {sponsorship_type.replace('_', ' ')}.",
        "Breadth and healing matter more than nominal price relief for this read.",
    ]
    if support_dependency >= 0.55:
        narrative.append("Support dependency is elevated, so relief can fade before structure heals.")
    if fragility_transfer_risk >= 0.55:
        narrative.append("Fragility transfer risk is elevated; apparent improvement may be relocating damage.")

    return {
        "type": sponsorship_type,
        "confidence": confidence,
        "breadth_score": breadth_score,
        "support_dependency": support_dependency,
        "fragility_transfer_risk": fragility_transfer_risk,
        "narrative": narrative,
    }
