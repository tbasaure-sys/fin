from __future__ import annotations

from typing import Any


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def build_policy_state(snapshot: dict[str, Any], measured_state: dict[str, Any], probabilistic_state: dict[str, Any], uncertainty: dict[str, Any]) -> dict[str, Any]:
    recoverability = _num(probabilistic_state.get("p_portfolio_recoverability"), 0.0)
    phantom = _num(probabilistic_state.get("p_phantom_rebound"), 0.0)
    extreme = _num(probabilistic_state.get("p_extreme_drawdown"), 0.0)
    authority = _num(uncertainty.get("authority_score"), 0.0)
    structural = _num(probabilistic_state.get("p_structural_dominance"), 0.0)
    regime = _num(probabilistic_state.get("p_regime_shock_dominance"), 0.0)

    if recoverability < 0.45 or phantom > 0.50 or authority < 0.40 or extreme > 0.35:
        mode = "protect"
    elif recoverability >= 0.72 and phantom <= 0.20 and authority >= 0.65 and extreme <= 0.18:
        mode = "act"
    elif recoverability >= 0.60 and phantom <= 0.35 and authority >= 0.50:
        mode = "stage"
    else:
        mode = "observe"

    mode_caps = {
        "protect": (0.00, 0.00),
        "observe": (0.04, 0.01),
        "stage": (0.10, 0.03),
        "act": (0.18, 0.05),
    }
    gross_cap, single_cap = mode_caps[mode]
    gross_add = min(gross_cap, _clamp01(gross_cap * max(authority, 0.35) * max(1.0 - phantom, 0.25)))
    single_add = min(single_cap, _clamp01(max(gross_add * 0.4, 0.0)))
    hedge_floor = _clamp01(0.06 + 0.24 * structural + 0.18 * extreme + 0.10 * max(0.60 - recoverability, 0.0))
    allowed = ["defensive_compounders", "index_hedge"]
    forbidden = []
    if mode in {"act", "stage"} and regime >= structural and phantom <= 0.35:
        allowed.append("oversold_rebound")
    if mode == "act" and structural < 0.50:
        allowed.append("selective_growth")
    if structural >= 0.58:
        forbidden.extend(["high_beta_cyclicals", "crowded_thematic_growth"])
    if phantom >= 0.55:
        forbidden.append("relief_rally_chasing")
    if mode == "protect":
        forbidden.append("net_new_risk_adds")
    review_cadence = "8h" if mode == "protect" else "24h" if mode == "observe" else "48h" if mode == "stage" else "72h"
    rebalance_delay = "0d" if mode == "protect" else "1d" if mode == "observe" else "2d" if mode == "stage" else "3d"
    required_confirmation = (
        "breadth_up_and_dom_down"
        if mode in {"observe", "stage"} and structural >= regime
        else "visible_correction_plus_authority"
        if mode == "act"
        else "drawdown_stabilizes_and_phantom_falls"
    )
    invalidation = [
        "p_portfolio_recoverability_below_0_42",
        "p_phantom_rebound_above_0_48",
        "authority_score_below_0_40",
    ]
    return {
        "mode": mode,
        "max_gross_add": gross_add,
        "max_single_name_add": single_add,
        "hedge_floor": hedge_floor,
        "allowed_sleeves": allowed,
        "forbidden_sleeves": forbidden,
        "review_cadence": review_cadence,
        "rebalance_delay": rebalance_delay,
        "required_confirmation": required_confirmation,
        "invalidation_rules": invalidation,
    }
