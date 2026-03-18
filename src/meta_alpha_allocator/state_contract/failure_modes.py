from __future__ import annotations

from typing import Any


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def build_failure_modes(
    measured_state: dict[str, Any],
    probabilistic_state: dict[str, Any],
    healing_dynamics: dict[str, Any],
    rebound_sponsorship: dict[str, Any],
    recoverability_budget: dict[str, Any],
    transition_memory: dict[str, Any],
) -> dict[str, Any]:
    phantom = _num(probabilistic_state.get("p_phantom_rebound"), 0.0)
    healing = _num(healing_dynamics.get("healing_velocity"), 0.0)
    compression = _num(measured_state.get("market_compression"), 0.0)
    support_dependency = _num(rebound_sponsorship.get("support_dependency"), 0.0)
    fragility_transfer = _num(rebound_sponsorship.get("fragility_transfer_risk"), 0.0)
    remaining_budget = _num(recoverability_budget.get("remaining_budget"), 0.0)
    entropy = _num(transition_memory.get("state_entropy"), 0.0)
    sponsorship_type = str(rebound_sponsorship.get("type") or "mixed")

    if sponsorship_type == "narrow_leadership" and healing <= 0.0:
        dominant = "narrow_rebound_failure"
    elif support_dependency >= 0.6 and entropy >= 0.45:
        dominant = "support_withdrawal_failure"
    elif fragility_transfer >= 0.58:
        dominant = "fragility_transfer_failure"
    elif compression >= 0.62 and healing < 0.0:
        dominant = "compression_reacceleration"
    elif phantom >= 0.35:
        dominant = "false_healing_failure"
    elif remaining_budget <= 0.18:
        dominant = "liquidity_gap_failure"
    else:
        dominant = "none_material"

    secondary = []
    if dominant != "compression_reacceleration" and compression >= 0.55:
        secondary.append("compression_reacceleration")
    if dominant != "support_withdrawal_failure" and support_dependency >= 0.5:
        secondary.append("support_withdrawal_failure")
    if dominant != "fragility_transfer_failure" and fragility_transfer >= 0.5:
        secondary.append("fragility_transfer_failure")

    trigger_map = [
        {
            "signal": "breadth_healing_velocity",
            "condition": "<= 0",
            "meaning": "Rebound is not broadening enough to trust.",
        },
        {
            "signal": "support_dependency",
            "condition": ">= 0.55",
            "meaning": "Relief remains too dependent on external sponsorship.",
        },
        {
            "signal": "remaining_budget",
            "condition": "< 0.18",
            "meaning": "Recoverability budget is near exhaustion.",
        },
    ]
    return {
        "dominant_failure_mode": dominant,
        "secondary_failure_modes": secondary[:3],
        "trigger_map": trigger_map,
        "monitoring_priority": "high" if dominant != "none_material" else "medium",
        "time_to_failure_risk_window_days": 10 if dominant != "none_material" else 20,
    }
