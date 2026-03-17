from __future__ import annotations

from datetime import date
from typing import Any

from .mandates import BLS_PRIME_DEFAULT
from .policy_memory import load_policy_memory, write_policy_memory


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _decide_mode(recoverability: float, phantom: float, extreme: float, authority: float) -> str:
    if recoverability < 0.45 or phantom > 0.50 or authority < 0.40 or extreme > 0.35:
        return 'protect'
    if recoverability >= 0.72 and phantom <= 0.20 and authority >= 0.65 and extreme <= 0.18:
        return 'act'
    if recoverability >= 0.60 and phantom <= 0.35 and authority >= 0.50:
        return 'stage'
    return 'observe'


def _apply_hysteresis(last_mode: str | None, fresh_mode: str, recoverability: float, phantom: float, extreme: float, authority: float) -> tuple[str, str]:
    if not last_mode or last_mode == fresh_mode:
        return fresh_mode, 'fresh_threshold_match'
    if last_mode == 'act' and recoverability >= 0.62 and phantom <= 0.30 and authority >= 0.50 and extreme <= 0.24:
        return 'act', 'act_hysteresis_hold'
    if last_mode == 'stage' and recoverability >= 0.55 and phantom <= 0.40 and authority >= 0.45:
        return 'stage', 'stage_hysteresis_hold'
    if last_mode == 'observe' and recoverability >= 0.42 and phantom <= 0.48 and authority >= 0.38:
        return 'observe', 'observe_hysteresis_hold'
    return fresh_mode, f'{last_mode}_exit_threshold_breach'


def build_policy_state(snapshot: dict[str, Any], measured_state: dict[str, Any], probabilistic_state: dict[str, Any], uncertainty: dict[str, Any]) -> dict[str, Any]:
    recoverability = _num(probabilistic_state.get('p_portfolio_recoverability'), 0.0)
    phantom = _num(probabilistic_state.get('p_phantom_rebound'), 0.0)
    extreme = _num(probabilistic_state.get('p_extreme_drawdown'), 0.0)
    authority = _num(uncertainty.get('authority', {}).get('authority_policy_gate', uncertainty.get('authority_score')), 0.0)
    structural = _num(probabilistic_state.get('p_structural_dominance'), 0.0)
    regime = _num(probabilistic_state.get('p_regime_shock_dominance'), 0.0)
    mandate = BLS_PRIME_DEFAULT
    memory = load_policy_memory(snapshot)

    fresh_mode = _decide_mode(recoverability, phantom, extreme, authority)
    mode, transition_reason = _apply_hysteresis(memory.get('last_mode'), fresh_mode, recoverability, phantom, extreme, authority)

    gross_cap = mandate['gross_add_cap_by_mode'][mode]
    single_cap = mandate['single_name_cap_by_mode'][mode]
    gross_add = min(gross_cap, _clamp01(gross_cap * max(authority, 0.35) * max(1.0 - phantom, 0.25)))
    single_add = min(single_cap, _clamp01(max(gross_add * 0.4, 0.0)))
    hedge_floor = max(mandate['hedge_floor_by_mode'][mode], _clamp01(0.06 + 0.24 * structural + 0.18 * extreme + 0.10 * max(0.60 - recoverability, 0.0)))
    allowed = list(mandate['allowed_sleeves_by_mode'][mode])
    forbidden = list(mandate['forbidden_sleeves_by_mode'][mode])
    if mode in {'act', 'stage'} and regime >= structural and phantom <= 0.35 and 'oversold_rebound' not in allowed:
        allowed.append('oversold_rebound')
    if mode == 'act' and structural < 0.50 and 'selective_growth' not in allowed:
        allowed.append('selective_growth')
    if structural >= 0.58 and 'high_beta_cyclicals' not in forbidden:
        forbidden.extend(['high_beta_cyclicals', 'crowded_thematic_growth'])
    if phantom >= 0.55 and 'relief_rally_chasing' not in forbidden:
        forbidden.append('relief_rally_chasing')
    review_cadence = '8h' if mode == 'protect' else '24h' if mode == 'observe' else '48h' if mode == 'stage' else '72h'
    rebalance_delay = '0d' if mode == 'protect' else '1d' if mode == 'observe' else '2d' if mode == 'stage' else '3d'
    required_confirmation = (
        'breadth_up_and_dom_down' if mode in {'observe', 'stage'} and structural >= regime else
        'visible_correction_plus_authority' if mode == 'act' else
        'drawdown_stabilizes_and_phantom_falls'
    )
    invalidation = [
        'p_portfolio_recoverability_below_0_42',
        'p_phantom_rebound_above_0_48',
        'authority_score_below_0_40',
    ]

    entered_at = memory.get('mode_entered_at') if memory.get('last_mode') == mode else (snapshot.get('as_of_date') or str(date.today()))
    new_memory = {
        'as_of': snapshot.get('as_of_date'),
        'last_mode': mode,
        'mode_entered_at': entered_at,
        'last_transition_reason': transition_reason,
        'prior_recoverability': recoverability,
        'prior_phantom': phantom,
        'prior_authority': authority,
    }
    write_policy_memory(snapshot, new_memory)
    return {
        'mode': mode,
        'max_gross_add': gross_add,
        'max_single_name_add': single_add,
        'max_turnover': mandate['max_turnover_by_mode'][mode],
        'hedge_floor': hedge_floor,
        'allowed_sleeves': allowed,
        'forbidden_sleeves': forbidden,
        'review_cadence': review_cadence,
        'rebalance_delay': rebalance_delay,
        'required_confirmation': required_confirmation,
        'invalidation_rules': invalidation,
        'mode_entered_at': entered_at,
        'mode_persistence_days': 0,
        'transition_reason': transition_reason,
        'hysteresis_state': {
            'fresh_mode': fresh_mode,
            'last_mode': memory.get('last_mode'),
        },
    }
