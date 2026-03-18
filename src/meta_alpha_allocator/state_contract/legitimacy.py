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


def build_legitimacy_surface(
    snapshot: dict[str, Any],
    probabilistic_state: dict[str, Any],
    policy_state: dict[str, Any],
    uncertainty: dict[str, Any],
    recoverability_budget: dict[str, Any],
    healing_dynamics: dict[str, Any],
    rebound_sponsorship: dict[str, Any],
    failure_modes: dict[str, Any] | None = None,
) -> dict[str, Any]:
    authority = _num(uncertainty.get("authority_score"), 0.0)
    remaining_budget = _num(recoverability_budget.get("remaining_budget"), 0.0)
    healing = _num(healing_dynamics.get("healing_velocity"), 0.0)
    phantom = _num(probabilistic_state.get("p_phantom_rebound"), 0.0)
    support_dependency = _num(rebound_sponsorship.get("support_dependency"), 0.0)
    mode = str(policy_state.get("mode") or "observe")
    dominant_failure = str((failure_modes or {}).get("dominant_failure_mode") or "")

    opportunity_inputs = snapshot.get("overview", {})
    raw_beta = _clamp01(0.50 * _num(opportunity_inputs.get("confidence"), 0.5) + 0.50 * _num(probabilistic_state.get("p_visible_correction"), 0.0))
    raw_single = _clamp01(0.35 + 0.25 * _num(probabilistic_state.get("p_structural_restoration"), 0.0) + 0.20 * authority)
    raw_rotation = _clamp01(0.40 + 0.30 * _num(probabilistic_state.get("p_portfolio_recoverability"), 0.0))
    raw_hedge = _clamp01(0.35 + 0.30 * _num(probabilistic_state.get("p_extreme_drawdown"), 0.0) + 0.20 * phantom)
    raw_trim = _clamp01(0.30 + 0.25 * support_dependency + 0.20 * _num(snapshot.get("portfolio", {}).get("analytics", {}).get("Concentration HHI"), 0.0))
    raw_hold = _clamp01(0.25 + 0.30 * remaining_budget + 0.20 * authority)

    base_legitimacy = _clamp01(0.35 * remaining_budget + 0.25 * authority + 0.20 * max(healing, 0.0) + 0.20 * (1.0 - phantom))
    if mode == "protect":
        beta_legitimacy = _clamp01(base_legitimacy * 0.20)
        single_legitimacy = _clamp01(base_legitimacy * 0.25)
        rotation_legitimacy = _clamp01(base_legitimacy * 0.45)
        hedge_legitimacy = _clamp01(0.60 + 0.20 * support_dependency)
        trim_legitimacy = _clamp01(0.65 + 0.15 * support_dependency)
        hold_legitimacy = _clamp01(0.70 + 0.15 * remaining_budget)
    else:
        beta_legitimacy = base_legitimacy
        single_legitimacy = _clamp01(base_legitimacy * 0.95)
        rotation_legitimacy = _clamp01(base_legitimacy * 1.05)
        hedge_legitimacy = _clamp01(0.35 + 0.35 * support_dependency + 0.20 * phantom)
        trim_legitimacy = _clamp01(0.45 + 0.25 * support_dependency)
        hold_legitimacy = _clamp01(0.40 + 0.30 * remaining_budget)

    if dominant_failure in {"narrow_rebound_failure", "support_withdrawal_failure"}:
        beta_legitimacy = _clamp01(beta_legitimacy * 0.75)
        single_legitimacy = _clamp01(single_legitimacy * 0.8)

    action_defs = [
        ("gross_beta_add", raw_beta, beta_legitimacy, "healing_velocity_positive", "phantom_rebound_above_0_35"),
        ("single_name_add", raw_single, single_legitimacy, "restoration_and_authority_upgrade", "authority_below_0_50"),
        ("funded_rotation", raw_rotation, rotation_legitimacy, "repair_candidate_valid", "budget_state_depleted"),
        ("hedge_raise", raw_hedge, hedge_legitimacy, "none", "mode_upgrades_to_act"),
        ("trim_concentration", raw_trim, trim_legitimacy, "concentration_remains_binding", "rebound_broadens_and_budget_recovers"),
        ("do_nothing", raw_hold, hold_legitimacy, "none", "legitimacy_surface_opens"),
    ]

    surface = []
    for family, raw_score, legitimacy_score, required_confirmation, invalidation in action_defs:
        spread = raw_score - legitimacy_score
        if legitimacy_score >= 0.65:
            status = "allowed"
        elif legitimacy_score >= 0.40:
            status = "conditional"
        else:
            status = "blocked"
        surface.append({
            "action_family": family,
            "raw_opportunity_score": raw_score,
            "legitimacy_score": legitimacy_score,
            "spread": spread,
            "status": status,
            "required_confirmation": required_confirmation,
            "invalidation": invalidation,
        })

    risk_add_statuses = {
        item["status"]
        for item in surface
        if item["action_family"] in {"gross_beta_add", "single_name_add", "funded_rotation"}
    }
    defensive_statuses = {
        item["status"]
        for item in surface
        if item["action_family"] in {"hedge_raise", "trim_concentration", "do_nothing"}
    }
    if "allowed" in risk_add_statuses and mode == "act":
        global_state = "open"
    elif "allowed" in risk_add_statuses or "conditional" in risk_add_statuses:
        global_state = "selective"
    elif "allowed" in defensive_statuses or "conditional" in defensive_statuses:
        global_state = "restricted"
    else:
        global_state = "closed"
    return {
        "global_state": global_state,
        "risk_add_state": "open" if "allowed" in risk_add_statuses else "conditional" if "conditional" in risk_add_statuses else "closed",
        "defensive_state": "open" if "allowed" in defensive_statuses else "conditional" if "conditional" in defensive_statuses else "closed",
        "legitimacy_spread": {item["action_family"]: item["spread"] for item in surface},
        "action_surface": surface,
    }
