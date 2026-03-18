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


def build_recoverability_budget(
    measured_state: dict[str, Any],
    probabilistic_state: dict[str, Any],
    healing_dynamics: dict[str, Any],
    rebound_sponsorship: dict[str, Any],
    repair_candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    recoverability = _num(probabilistic_state.get("p_portfolio_recoverability"), 0.0)
    liquidity = _num(measured_state.get("portfolio_liquidity_buffer"), 0.0)
    factor_dimension = _num(measured_state.get("portfolio_factor_dimension"), 1.0)
    fragility = _num(measured_state.get("portfolio_fragility_exposure"), 0.5)
    concentration = _num(measured_state.get("portfolio_hhi"), 0.0)
    compression = _num(measured_state.get("market_compression"), 0.0)
    phantom = _num(probabilistic_state.get("p_phantom_rebound"), 0.0)
    healing = _num(healing_dynamics.get("healing_velocity"), 0.0)
    support_dependency = _num(rebound_sponsorship.get("support_dependency"), 0.0)

    total_budget = _clamp01(
        0.45 * recoverability
        + 0.20 * liquidity
        + 0.15 * min(factor_dimension / 4.0, 1.0)
        + 0.20 * max(healing, 0.0)
    )
    used_budget = _clamp01(
        0.30 * fragility
        + 0.25 * concentration
        + 0.20 * compression
        + 0.15 * phantom
        + 0.10 * support_dependency
    )
    remaining = _clamp01(max(total_budget - used_budget, 0.0))
    burn_rate = _clamp01(
        0.40 * max(-healing, 0.0)
        + 0.35 * phantom
        + 0.25 * compression
    )
    repair_gain_capacity = _clamp01(max((_num(row.get("delta_recoverability"), 0.0) for row in repair_candidates), default=0.0))

    if remaining >= 0.40:
        budget_state = "ample"
    elif remaining >= 0.18:
        budget_state = "narrowing"
    else:
        budget_state = "depleted"

    return {
        "total_budget": total_budget,
        "used_budget": used_budget,
        "remaining_budget": remaining,
        "burn_rate_5d": burn_rate,
        "repair_gain_capacity": repair_gain_capacity,
        "budget_state": budget_state,
        "drivers": [
            {"label": "concentration", "contribution": concentration},
            {"label": "fragility", "contribution": fragility},
            {"label": "liquidity", "contribution": liquidity},
            {"label": "compression", "contribution": compression},
        ],
    }
