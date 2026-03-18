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


def build_policy_state_v2(
    probabilistic_state: dict[str, Any],
    uncertainty: dict[str, Any],
    recoverability_budget: dict[str, Any],
    healing_dynamics: dict[str, Any],
    rebound_sponsorship: dict[str, Any],
    legitimacy_surface: dict[str, Any],
    failure_modes: dict[str, Any],
) -> dict[str, Any]:
    authority = _num(uncertainty.get("authority_score"), 0.0)
    recoverability = _num(probabilistic_state.get("p_portfolio_recoverability"), 0.0)
    extreme = _num(probabilistic_state.get("p_extreme_drawdown"), 0.0)
    phantom = _num(probabilistic_state.get("p_phantom_rebound"), 0.0)
    remaining_budget = _num(recoverability_budget.get("remaining_budget"), 0.0)
    burn_rate = _num(recoverability_budget.get("burn_rate_5d"), 0.0)
    healing = _num(healing_dynamics.get("healing_velocity"), 0.0)
    support_dependency = _num(rebound_sponsorship.get("support_dependency"), 0.0)
    global_legitimacy = str(legitimacy_surface.get("global_state") or "closed")
    dominant_failure = str(failure_modes.get("dominant_failure_mode") or "none_material")
    action_surface = legitimacy_surface.get("action_surface") or []
    allowed_actions = {row.get("action_family") for row in action_surface if row.get("status") == "allowed"}
    conditional_actions = {row.get("action_family") for row in action_surface if row.get("status") == "conditional"}

    if (
        remaining_budget < 0.18
        or healing < -0.08
        or dominant_failure != "none_material"
        or global_legitimacy == "closed"
        or extreme > 0.30
        or authority < 0.40
    ):
        mode = "protect"
    elif (
        remaining_budget >= 0.42
        and healing >= 0.10
        and authority >= 0.65
        and extreme <= 0.18
        and "gross_beta_add" in allowed_actions
        and "single_name_add" in allowed_actions
    ):
        mode = "act"
    elif (
        remaining_budget >= 0.24
        and healing >= 0.0
        and authority >= 0.50
        and (
            "single_name_add" in allowed_actions
            or "funded_rotation" in allowed_actions
            or "single_name_add" in conditional_actions
            or "funded_rotation" in conditional_actions
        )
    ):
        mode = "stage"
    else:
        mode = "observe"

    mode_caps = {
        "protect": (0.00, 0.00, 0.06),
        "observe": (0.03, 0.01, 0.10),
        "stage": (0.08, 0.025, 0.14),
        "act": (0.16, 0.05, 0.22),
    }
    gross_cap, single_cap, turnover_cap = mode_caps[mode]
    legitimacy_boost = 1.0 if global_legitimacy == "open" else 0.82 if global_legitimacy == "selective" else 0.60 if global_legitimacy == "restricted" else 0.25
    gross_add = min(gross_cap, _clamp01(gross_cap * max(remaining_budget, 0.15) * max(1.0 - phantom, 0.25) * legitimacy_boost))
    if "gross_beta_add" not in allowed_actions and mode != "act":
        gross_add = min(gross_add, 0.0 if mode == "protect" else 0.02 if mode == "observe" else gross_add)
    single_add = min(single_cap, _clamp01(max(gross_add * 0.45, 0.0)))
    if "single_name_add" not in allowed_actions and "single_name_add" not in conditional_actions:
        single_add = 0.0

    hedge_floor = _clamp01(
        0.05
        + 0.20 * support_dependency
        + 0.18 * burn_rate
        + 0.12 * max(0.40 - remaining_budget, 0.0)
        + 0.10 * max(-healing, 0.0)
    )

    allowed = ["defensive_compounders", "index_hedge"]
    forbidden = []
    if mode in {"act", "stage"} and ("funded_rotation" in allowed_actions or "funded_rotation" in conditional_actions):
        allowed.append("funded_rotation")
    if mode == "act" and "single_name_add" in allowed_actions:
        allowed.append("selective_growth")
    if mode == "protect":
        forbidden.extend(["net_new_risk_adds", "gross_beta_adds", "single_name_adds"])
    if support_dependency >= 0.55 or phantom >= 0.35:
        forbidden.append("relief_rally_chasing")
    if dominant_failure in {"narrow_rebound_failure", "support_withdrawal_failure", "false_healing_failure"}:
        forbidden.append("high_beta_cyclicals")

    review_cadence = "8h" if mode == "protect" else "24h" if mode == "observe" else "48h" if mode == "stage" else "72h"
    rebalance_delay = "0d" if mode == "protect" else "1d" if mode == "observe" else "2d" if mode == "stage" else "3d"

    if mode == "protect":
        required_confirmation = "healing_velocity_positive_and_budget_recovers"
    elif global_legitimacy == "restricted":
        required_confirmation = "legitimacy_surface_reopens"
    elif support_dependency >= 0.55:
        required_confirmation = "support_dependency_falls_and_breadth_confirms"
    else:
        required_confirmation = "breadth_up_and_dom_down"

    invalidation = [
        "remaining_budget_below_0_18",
        "healing_velocity_below_-0_08",
        "phantom_rebound_above_0_35",
        "authority_score_below_0_40",
    ]
    if dominant_failure != "none_material":
        invalidation.append(f"dominant_failure_mode_is_{dominant_failure}")

    return {
        "mode": mode,
        "max_gross_add": gross_add,
        "max_single_name_add": single_add,
        "max_turnover": turnover_cap,
        "hedge_floor": hedge_floor,
        "allowed_sleeves": sorted(set(allowed)),
        "forbidden_sleeves": sorted(set(forbidden)),
        "review_cadence": review_cadence,
        "rebalance_delay": rebalance_delay,
        "required_confirmation": required_confirmation,
        "invalidation_rules": invalidation,
    }
