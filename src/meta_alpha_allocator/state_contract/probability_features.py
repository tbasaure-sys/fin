from __future__ import annotations

from typing import Any

import pandas as pd


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        parsed = float(value)
        return default if pd.isna(parsed) else parsed
    except (TypeError, ValueError):
        return default


def build_live_probability_features(measured_state: dict[str, Any], heuristics: dict[str, Any]) -> dict[str, float]:
    return {
        'D_eff': _num(measured_state.get('market_effective_dimension'), 4.0),
        'stress_score': _num(measured_state.get('market_compression'), 0.5),
        'eq_breadth_20': _num(measured_state.get('breadth'), 0.5),
        'cross_corr_60': _num(measured_state.get('median_pairwise_corr'), 0.5),
        'VIX': _num(measured_state.get('macro_vix'), 20.0),
        'phantom_score': _num(heuristics.get('p_phantom_rebound'), 0.4),
        'fragility_pct': _num(measured_state.get('portfolio_fragility_exposure'), 0.5),
        'drawdown_proxy': abs(_num(measured_state.get('benchmark_drawdown', measured_state.get('portfolio_drawdown', -0.08)), -0.08)),
        'dominance_proxy': _num(measured_state.get('market_dominance_share'), 0.5),
    }


def build_training_probability_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if frame is None or frame.empty:
        return pd.DataFrame()
    training = frame.copy()
    if 'as_of' in training.columns:
        training['as_of'] = pd.to_datetime(training['as_of'], errors='coerce').dt.normalize()
    for col in ['D_eff', 'stress_score', 'eq_breadth_20', 'cross_corr_60', 'VIX', 'VIXCLS', 'phantom_score', 'fragility_pct', 'corr_gap', 'phantom_div_pct', 'liquidity_pct', 'visible_correction', 'recovered', 'non_recovery', 'success_no_relief', 'SPY_drawdown', 'Absorption_Ratio', 'D_raw', 'D_tested', 'D_raw_d20', 'D_tested_d20', 'future_max_relief', 'support_relief_5d', 'V_no_relief', 'F_risk', 'R_gain', 'action_relief', 'cross_corr_60_d20', 'eq_breadth_20_d20', 'worst_drawdown_h', 'adaptation_cost']:
        if col in training.columns:
            training[col] = pd.to_numeric(training[col], errors='coerce')
    if 'VIX' not in training.columns and 'VIXCLS' in training.columns:
        training['VIX'] = training['VIXCLS']
    training['drawdown_proxy'] = pd.to_numeric(training.get('SPY_drawdown', 0.0), errors='coerce').abs()
    dominance = pd.to_numeric(training.get('Absorption_Ratio', pd.Series(index=training.index, dtype=float)), errors='coerce')
    if dominance.isna().all():
        dominance = pd.to_numeric(training.get('cross_corr_60', 0.5), errors='coerce')
    training['dominance_proxy'] = dominance.fillna(pd.to_numeric(training.get('cross_corr_60', 0.5), errors='coerce').fillna(0.5)).clip(0.0, 1.0)
    if 'y_visible_correction' not in training.columns:
        visible = pd.to_numeric(training.get('visible_correction', pd.Series(index=training.index, dtype=float)), errors='coerce')
        visible_score = pd.Series(0.0, index=training.index)
        if 'future_max_relief' in training.columns:
            visible_score += (pd.to_numeric(training.get('future_max_relief'), errors='coerce').fillna(0.0) >= 0.06).astype(float)
        if 'support_relief_5d' in training.columns:
            visible_score += (pd.to_numeric(training.get('support_relief_5d'), errors='coerce').fillna(0.0) > 0.0).astype(float)
        if 'action_relief' in training.columns:
            visible_score += (pd.to_numeric(training.get('action_relief'), errors='coerce').fillna(0.0) >= 1.0).astype(float)
        fallback_visible = (visible_score >= 2.0).astype(float)
        if visible.notna().any():
            training['y_visible_correction'] = pd.concat([visible.fillna(0.0), fallback_visible], axis=1).max(axis=1)
        else:
            training['y_visible_correction'] = fallback_visible
    if 'y_structural_restoration' not in training.columns:
        event_recovered = pd.to_numeric(training.get('event_recovered', pd.Series(index=training.index, dtype=float)), errors='coerce')
        event_days = pd.to_numeric(training.get('event_days_to_recovery', pd.Series(index=training.index, dtype=float)), errors='coerce')
        recovered = pd.to_numeric(training.get('recovered', pd.Series(index=training.index, dtype=float)), errors='coerce')
        restoration_score = pd.Series(0.0, index=training.index)
        if 'future_max_relief' in training.columns:
            restoration_score += (pd.to_numeric(training.get('future_max_relief'), errors='coerce').fillna(0.0) >= 0.10).astype(float)
        if 'D_tested_d20' in training.columns and 'D_tested' in training.columns:
            restoration_score += ((pd.to_numeric(training.get('D_tested_d20'), errors='coerce') - pd.to_numeric(training.get('D_tested'), errors='coerce')) >= 0.03).astype(float)
        elif 'D_raw_d20' in training.columns and 'D_raw' in training.columns:
            restoration_score += ((pd.to_numeric(training.get('D_raw_d20'), errors='coerce') - pd.to_numeric(training.get('D_raw'), errors='coerce')) <= -0.03).astype(float)
        if 'cross_corr_60_d20' in training.columns and 'cross_corr_60' in training.columns:
            restoration_score += ((pd.to_numeric(training.get('cross_corr_60_d20'), errors='coerce') - pd.to_numeric(training.get('cross_corr_60'), errors='coerce')) <= -0.02).astype(float)
        if 'eq_breadth_20_d20' in training.columns and 'eq_breadth_20' in training.columns:
            restoration_score += ((pd.to_numeric(training.get('eq_breadth_20_d20'), errors='coerce') - pd.to_numeric(training.get('eq_breadth_20'), errors='coerce')) >= 0.10).astype(float)
        fallback_restoration = (restoration_score >= 2.0).astype(float)
        if event_recovered.notna().any():
            event_label = ((event_recovered >= 0.5) & ((event_days.isna()) | (event_days <= 90))).astype(float)
            training['y_structural_restoration'] = event_label.where(event_recovered.notna(), fallback_restoration)
        elif recovered.notna().any():
            training['y_structural_restoration'] = recovered.where(recovered.notna(), fallback_restoration)
        elif 'non_recovery' in training.columns:
            training['y_structural_restoration'] = (1.0 - pd.to_numeric(training['non_recovery'], errors='coerce')).where(pd.to_numeric(training['non_recovery'], errors='coerce').notna(), fallback_restoration)
        else:
            training['y_structural_restoration'] = fallback_restoration
    if 'y_phantom_rebound' not in training.columns:
        visible = training.get('y_visible_correction', pd.Series(index=training.index, dtype=float)).fillna(0.0)
        restoration = training.get('y_structural_restoration', pd.Series(index=training.index, dtype=float)).fillna(0.0)
        phantom_score = pd.to_numeric(training.get('phantom_score', 0.5), errors='coerce').fillna(0.5)
        corr_gap = pd.to_numeric(training.get('corr_gap', 0.0), errors='coerce').fillna(0.0)
        phantom_div = pd.to_numeric(training.get('phantom_div_pct', 0.0), errors='coerce').fillna(0.0)
        liquidity = pd.to_numeric(training.get('liquidity_pct', 0.0), errors='coerce').fillna(0.0)
        phantom_detector_label = (
            (phantom_score >= 0.58)
            | (corr_gap >= corr_gap.quantile(0.7))
            | (phantom_div >= phantom_div.quantile(0.7))
            | (liquidity >= liquidity.quantile(0.7))
        )
        training['y_phantom_rebound'] = ((visible >= 0.5) & ((restoration < 0.5) | phantom_detector_label)).astype(float)
    if 'y_portfolio_recoverability' not in training.columns:
        success = pd.to_numeric(training.get('success_no_relief', pd.Series(index=training.index, dtype=float)), errors='coerce')
        recoverability_score = pd.Series(0.0, index=training.index)
        if 'future_max_relief' in training.columns:
            recoverability_score += (pd.to_numeric(training.get('future_max_relief'), errors='coerce').fillna(0.0) >= 0.08).astype(float)
        if 'V_no_relief' in training.columns:
            recoverability_score += (pd.to_numeric(training.get('V_no_relief'), errors='coerce').fillna(1.0) <= 0.15).astype(float)
        if 'R_gain' in training.columns:
            recoverability_score += (pd.to_numeric(training.get('R_gain'), errors='coerce').fillna(0.0) >= 0.0).astype(float)
        if 'action_relief' in training.columns:
            recoverability_score += (pd.to_numeric(training.get('action_relief'), errors='coerce').fillna(0.0) >= 1.0).astype(float)
        if 'worst_drawdown_h' in training.columns:
            recoverability_score += (pd.to_numeric(training.get('worst_drawdown_h'), errors='coerce').fillna(-1.0) >= -0.20).astype(float)
        if 'adaptation_cost' in training.columns:
            recoverability_score += (pd.to_numeric(training.get('adaptation_cost'), errors='coerce').fillna(1.0) <= 0.45).astype(float)
        fallback_recoverability = (recoverability_score >= 3.0).astype(float)
        if success.notna().any():
            training['y_portfolio_recoverability'] = success.where(success.notna(), fallback_recoverability)
        elif 'non_recovery' in training.columns:
            training['y_portfolio_recoverability'] = (1.0 - pd.to_numeric(training['non_recovery'], errors='coerce')).where(pd.to_numeric(training['non_recovery'], errors='coerce').notna(), fallback_recoverability)
        else:
            training['y_portfolio_recoverability'] = fallback_recoverability
    if 'y_extreme_drawdown' not in training.columns:
        drawdown = pd.to_numeric(training.get('worst_drawdown_h', training.get('SPY_drawdown')), errors='coerce')
        training['y_extreme_drawdown'] = (drawdown <= -0.15).astype(float)
    norm_vix = (pd.to_numeric(training.get('VIX', pd.Series(index=training.index, dtype=float)), errors='coerce').fillna(20.0) - 12.0) / 28.0
    support_relief = pd.to_numeric(training.get('support_relief_5d', 0.0), errors='coerce').fillna(0.0)
    future_relief = pd.to_numeric(training.get('future_max_relief', 0.0), errors='coerce').fillna(0.0)
    no_relief = pd.to_numeric(training.get('V_no_relief', 1.0), errors='coerce').fillna(1.0)
    d_struct = pd.to_numeric(training.get('D_tested', training.get('D_raw', 0.5)), errors='coerce').fillna(0.5)
    d_future = pd.to_numeric(training.get('D_tested_d20', training.get('D_raw_d20', 0.0)), errors='coerce').fillna(0.0)
    breadth_delta = pd.to_numeric(training.get('eq_breadth_20_d20', 0.0), errors='coerce').fillna(0.0) - pd.to_numeric(training.get('eq_breadth_20', 0.0), errors='coerce').fillna(0.0)
    corr_delta = pd.to_numeric(training.get('cross_corr_60_d20', 0.0), errors='coerce').fillna(0.0) - pd.to_numeric(training.get('cross_corr_60', 0.0), errors='coerce').fillna(0.0)
    structural_persistence = (
        0.35 * d_struct.clip(lower=0.0)
        + 0.20 * (d_future <= 0).astype(float)
        + 0.15 * (breadth_delta <= 0).astype(float)
        + 0.15 * (corr_delta >= 0).astype(float)
        + 0.15 * (no_relief >= 0.20).astype(float)
    )
    regime_response = (
        0.30 * (support_relief > 0).astype(float)
        + 0.25 * (future_relief >= 0.06).astype(float)
        + 0.20 * (pd.to_numeric(training.get('action_relief', 0.0), errors='coerce').fillna(0.0) >= 1.0).astype(float)
        + 0.15 * (no_relief <= 0.10).astype(float)
        + 0.10 * (norm_vix.clip(0.0, 1.0) >= 0.45).astype(float)
    )
    training['y_g_dominance'] = ((structural_persistence >= 0.45) & (structural_persistence >= regime_response + 0.05)).astype(float)
    training['y_r_dominance'] = ((regime_response >= 0.45) & (regime_response >= structural_persistence + 0.05)).astype(float)
    cols = ['as_of', 'D_eff', 'stress_score', 'eq_breadth_20', 'cross_corr_60', 'VIX', 'phantom_score', 'fragility_pct', 'drawdown_proxy', 'dominance_proxy', 'y_g_dominance', 'y_r_dominance', 'y_visible_correction', 'y_structural_restoration', 'y_phantom_rebound', 'y_portfolio_recoverability', 'y_extreme_drawdown']
    for col in cols:
        if col not in training.columns:
            training[col] = pd.NaT if col == 'as_of' else pd.NA
    return training[cols].copy()
