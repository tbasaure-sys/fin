from __future__ import annotations

from typing import Any

from .measured import _portfolio_factor_dimension, _portfolio_fragility_exposure, _portfolio_liquidity_buffer
from .model_registry import load_probability_package
from .probability_calibration import apply_piecewise_calibrator
from .probability_features import build_live_probability_features
from .probability_models import score_probability


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        parsed = float(value)
        return default if parsed != parsed else parsed
    except (TypeError, ValueError):
        return default


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _classify(delta_recoverability: float, delta_phantom: float) -> str:
    if delta_recoverability >= 0.08 and delta_phantom <= -0.04:
        return 'real_repair'
    if delta_recoverability >= 0.04:
        return 'optionality_preserving_defense'
    return 'cosmetic_de_risking'


def _infer_sleeve(row: dict[str, Any]) -> str:
    ticker = str(row.get('ticker') or '').upper()
    asset_type = str(row.get('asset_type') or '').lower()
    sector = str(row.get('sector') or '').lower()
    momentum = _num(row.get('momentum_6m'), 0.0)
    if ticker in {'SGOV', 'BIL', 'SHY'}:
        return 'cash_equivalents' if ticker in {'SGOV', 'BIL'} else 'index_hedge'
    if ticker in {'TLT', 'IEF', 'GLD', 'SH', 'SDS', 'SPXU'}:
        return 'index_hedge'
    if asset_type == 'etf' and sector == 'etf':
        return 'index_hedge'
    if momentum <= -0.05:
        return 'oversold_rebound'
    if momentum >= 0.08:
        return 'crowded_thematic_growth'
    return 'defensive_compounders'


def _score_from_package(snapshot: dict[str, Any], measured_state: dict[str, Any], probabilistic_state: dict[str, Any]) -> dict[str, float] | None:
    package = load_probability_package(snapshot)
    if not package or not package.get('targets'):
        return None
    live = build_live_probability_features(measured_state, probabilistic_state)
    outputs = {}
    mapping = {
        'p_visible_correction': 'visible_correction',
        'p_structural_restoration': 'structural_restoration',
        'p_phantom_rebound': 'phantom_rebound',
        'p_portfolio_recoverability': 'portfolio_recoverability',
        'p_extreme_drawdown': 'extreme_drawdown',
    }
    for out_key, target_key in mapping.items():
        target = package['targets'].get(target_key)
        if not target:
            return None
        raw = score_probability(live, target)
        outputs[out_key] = apply_piecewise_calibrator(raw, target.get('calibrator'))
    outputs['p_phantom_rebound'] = min(outputs['p_phantom_rebound'], outputs['p_visible_correction'])
    return outputs


def _normalize_holdings(holdings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    total = 0.0
    for row in holdings or []:
        weight = max(_num(row.get('weight'), 0.0), 0.0)
        item = dict(row)
        item['weight'] = weight
        normalized.append(item)
        total += weight
    if total <= 0:
        return normalized
    for row in normalized:
        row['weight'] = row['weight'] / total
    return normalized


def _upsert_holding(holdings: list[dict[str, Any]], row: dict[str, Any], delta_weight: float) -> list[dict[str, Any]]:
    out = [dict(item) for item in holdings]
    ticker = str(row.get('ticker'))
    for item in out:
        if str(item.get('ticker')) == ticker:
            item['weight'] = max(_num(item.get('weight'), 0.0) + delta_weight, 0.0)
            return out
    candidate = dict(row)
    candidate['weight'] = max(delta_weight, 0.0)
    out.append(candidate)
    return out


def _cashlike_stub(weight: float) -> dict[str, Any]:
    return {'ticker': 'SGOV', 'asset_type': 'etf', 'sector': 'ETF', 'momentum_6m': 0.0, 'upside': 0.0, 'weight': max(weight, 0.0)}


def _apply_bundle(holdings: list[dict[str, Any]], bundle: list[dict[str, Any]]) -> list[dict[str, Any]]:
    current = _normalize_holdings(holdings)
    out = [dict(item) for item in current]
    cash_buffer = 0.0
    for move in bundle:
        kind = move['kind']
        if kind == 'trim':
            ticker = move['ticker']
            amount = move['weight']
            for item in out:
                if str(item.get('ticker')) == ticker:
                    actual = min(_num(item.get('weight'), 0.0), amount)
                    item['weight'] = max(_num(item.get('weight'), 0.0) - actual, 0.0)
                    cash_buffer += actual
                    break
        elif kind == 'add':
            amount = min(move['weight'], cash_buffer if cash_buffer > 0 else move['weight'])
            out = _upsert_holding(out, move['row'], amount)
            cash_buffer = max(cash_buffer - amount, 0.0)
        elif kind == 'hedge':
            amount = min(move['weight'], cash_buffer if cash_buffer > 0 else move['weight'])
            out = _upsert_holding(out, move['row'], amount)
            cash_buffer = max(cash_buffer - amount, 0.0)
    if cash_buffer > 0:
        out = _upsert_holding(out, _cashlike_stub(0.0), cash_buffer)
    out = [item for item in out if _num(item.get('weight'), 0.0) > 1e-4]
    return _normalize_holdings(out)


def _holdings_measured_state(base: dict[str, Any], holdings: list[dict[str, Any]]) -> dict[str, Any]:
    weights = [max(_num(row.get('weight'), 0.0), 0.0) for row in holdings]
    hhi = sum(weight * weight for weight in weights)
    state = dict(base)
    state['portfolio_hhi'] = _clamp01(hhi)
    state['portfolio_factor_dimension'] = _portfolio_factor_dimension(holdings)
    state['portfolio_fragility_exposure'] = _portfolio_fragility_exposure(holdings)
    state['portfolio_liquidity_buffer'] = _portfolio_liquidity_buffer(holdings, {})
    return state


def _bundle_to_candidate(bundle: list[dict[str, Any]], snapshot: dict[str, Any], holdings: list[dict[str, Any]], measured_state: dict[str, Any], probabilistic_state: dict[str, Any], constraints: list[str], funding_source: str) -> dict[str, Any] | None:
    reassembled = _apply_bundle(holdings, bundle)
    scored = _score_from_package(snapshot, _holdings_measured_state(measured_state, reassembled), probabilistic_state)
    if not scored:
        return None
    base_recoverability = _num(probabilistic_state.get('p_portfolio_recoverability'), 0.0)
    delta_recoverability = max(-1.0, min(1.0, _clamp01(scored['p_portfolio_recoverability']) - base_recoverability))
    delta_phantom = scored['p_phantom_rebound'] - _num(probabilistic_state.get('p_phantom_rebound'), 0.0)
    delta_extreme = scored['p_extreme_drawdown'] - _num(probabilistic_state.get('p_extreme_drawdown'), 0.0)
    turnover = sum(abs(_num(move.get('weight'), 0.0)) for move in bundle)
    trade_set = [move['label'] for move in bundle]
    return {
        'id': '-'.join(move['id'] for move in bundle),
        'trade_set': trade_set,
        'turnover': turnover,
        'delta_recoverability': delta_recoverability,
        'delta_phantom': delta_phantom,
        'delta_extreme_drawdown': delta_extreme,
        'repair_efficiency': max(-3.0, min(3.0, (0.45 * delta_recoverability + 0.20 * max(-delta_phantom, 0.0) + 0.15 * max(-delta_extreme, 0.0)) / max(turnover, 0.01))),
        'classification': _classify(delta_recoverability, delta_phantom),
        'binding_constraints': constraints,
        'funding_source': funding_source,
        'invalidation': ['authority falls below 0.45', 'recoverability regime worsens materially'],
        'probability_engine': 'offline_probability_package_v1',
    }


def _frontier_ok(candidate: dict[str, Any], probabilistic_state: dict[str, Any], policy_state: dict[str, Any]) -> bool:
    recoverability = _num(probabilistic_state.get('p_portfolio_recoverability'), 0.0) + _num(candidate.get('delta_recoverability'), 0.0)
    phantom = _num(probabilistic_state.get('p_phantom_rebound'), 0.0) + _num(candidate.get('delta_phantom'), 0.0)
    extreme = _num(probabilistic_state.get('p_extreme_drawdown'), 0.0) + _num(candidate.get('delta_extreme_drawdown'), 0.0)
    mode = policy_state.get('mode') or 'observe'
    floors = {'protect': (0.30, 0.60, 0.40), 'observe': (0.42, 0.48, 0.30), 'stage': (0.50, 0.40, 0.26), 'act': (0.60, 0.28, 0.22)}
    recoverability_floor, phantom_ceiling, extreme_ceiling = floors.get(mode, floors['observe'])
    turnover_cap = _num(policy_state.get('max_turnover'), 1.0)
    return recoverability >= recoverability_floor and phantom <= phantom_ceiling and extreme <= extreme_ceiling and _num(candidate.get('turnover'), 0.0) <= turnover_cap


def _bundle_allowed(bundle: list[dict[str, Any]], policy_state: dict[str, Any]) -> bool:
    allowed = set(policy_state.get('allowed_sleeves') or [])
    forbidden = set(policy_state.get('forbidden_sleeves') or [])
    for move in bundle:
        if move['kind'] not in {'add', 'hedge'}:
            continue
        sleeve = _infer_sleeve(move.get('row') or {})
        if sleeve in forbidden:
            return False
        if allowed and sleeve not in allowed:
            return False
    return True


def build_repair_candidates(snapshot: dict[str, Any], measured_state: dict[str, Any], probabilistic_state: dict[str, Any], policy_state: dict[str, Any]) -> list[dict[str, Any]]:
    portfolio = snapshot.get('portfolio', {})
    screener = snapshot.get('screener', {})
    holdings = portfolio.get('holdings') or portfolio.get('top_holdings') or []
    holdings = _normalize_holdings(holdings)
    sim_rank = portfolio.get('simulation_rank') or []
    hedge_ticker = snapshot.get('hedges', {}).get('selected_hedge') or snapshot.get('overview', {}).get('selected_hedge') or 'SHY'
    discovery = [row for row in screener.get('rows', []) if not row.get('is_current_holding')]
    max_single = _num(policy_state.get('max_single_name_add'), 0.0)
    max_gross = _num(policy_state.get('max_gross_add'), 0.0)
    mode = policy_state.get('mode') or 'observe'
    weakest = None
    if sim_rank:
        weakest = max(sim_rank, key=lambda row: _num(row.get('prob_loss'), 0.0))
    elif holdings:
        weakest = min(holdings, key=lambda row: _num(row.get('upside'), 0.0))
    add_pool = sorted(discovery, key=lambda row: _num(row.get('discovery_score'), _num(row.get('composite_score'), 0.0)), reverse=True)[:3]
    hedge_row = {'ticker': hedge_ticker, 'asset_type': 'etf', 'sector': 'ETF', 'momentum_6m': 0.0, 'upside': 0.0}
    bundles = []
    if weakest is not None:
        trim_size = min(max(_num(weakest.get('weight'), _num(weakest.get('suggested_position'), 0.05)) * 0.5, 0.02), 0.10)
        bundles.append(([{'id': f"trim-{str(weakest.get('ticker')).lower()}", 'kind': 'trim', 'ticker': weakest.get('ticker'), 'weight': trim_size, 'label': f"Trim {weakest.get('ticker')} by {trim_size:.0%}"}], ['turnover_budget'], str(weakest.get('ticker'))))
        hedge_size = min(max_gross, max(_num(policy_state.get('hedge_floor'), 0.05) * 0.5, 0.03))
        if hedge_size > 0:
            bundles.append(([
                {'id': f"trim-{str(weakest.get('ticker')).lower()}", 'kind': 'trim', 'ticker': weakest.get('ticker'), 'weight': trim_size, 'label': f"Trim {weakest.get('ticker')} by {trim_size:.0%}"},
                {'id': f"hedge-{str(hedge_ticker).lower()}", 'kind': 'hedge', 'row': hedge_row, 'weight': hedge_size, 'label': f"Raise {hedge_ticker} by {hedge_size:.0%}"},
            ], ['turnover_budget', 'hedge_floor'], str(weakest.get('ticker'))))
        for add_row in add_pool:
            add_size = min(max_single, trim_size, max_gross)
            if add_size <= 0 or mode == 'protect':
                continue
            bundles.append(([
                {'id': f"trim-{str(weakest.get('ticker')).lower()}", 'kind': 'trim', 'ticker': weakest.get('ticker'), 'weight': trim_size, 'label': f"Trim {weakest.get('ticker')} by {trim_size:.0%}"},
                {'id': f"add-{str(add_row.get('ticker')).lower()}", 'kind': 'add', 'row': add_row, 'weight': add_size, 'label': f"Add {add_row.get('ticker')} at {add_size:.0%}"},
            ], ['single_name_add_limit', 'gross_add_limit'], str(weakest.get('ticker'))))
            if hedge_size > 0 and (trim_size + add_size + hedge_size) <= _num(policy_state.get('max_turnover'), 1.0):
                bundles.append(([
                    {'id': f"trim-{str(weakest.get('ticker')).lower()}", 'kind': 'trim', 'ticker': weakest.get('ticker'), 'weight': trim_size, 'label': f"Trim {weakest.get('ticker')} by {trim_size:.0%}"},
                    {'id': f"add-{str(add_row.get('ticker')).lower()}", 'kind': 'add', 'row': add_row, 'weight': add_size, 'label': f"Add {add_row.get('ticker')} at {add_size:.0%}"},
                    {'id': f"hedge-{str(hedge_ticker).lower()}", 'kind': 'hedge', 'row': hedge_row, 'weight': hedge_size, 'label': f"Raise {hedge_ticker} by {hedge_size:.0%}"},
                ], ['single_name_add_limit', 'gross_add_limit', 'hedge_floor', 'turnover_budget'], str(weakest.get('ticker'))))
    if max_gross > 0:
        hedge_size = min(max_gross, max(_num(policy_state.get('hedge_floor'), 0.05) * 0.5, 0.03))
        bundles.append(([{'id': f"hedge-{str(hedge_ticker).lower()}", 'kind': 'hedge', 'row': hedge_row, 'weight': hedge_size, 'label': f"Raise {hedge_ticker} by {hedge_size:.0%}"}], ['hedge_floor'], 'cash sleeve'))

    candidates = []
    for bundle, constraints, funding_source in bundles:
        if not _bundle_allowed(bundle, policy_state):
            continue
        candidate = _bundle_to_candidate(bundle, snapshot, holdings, measured_state, probabilistic_state, constraints, funding_source)
        if candidate and _frontier_ok(candidate, probabilistic_state, policy_state):
            candidates.append(candidate)
    candidates.sort(key=lambda row: (_num(row.get('repair_efficiency'), -99.0), _num(row.get('delta_recoverability'), -99.0)), reverse=True)
    return candidates[:10]
