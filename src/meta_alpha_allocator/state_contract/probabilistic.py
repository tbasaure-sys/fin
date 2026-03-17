from __future__ import annotations

import math
from typing import Any

import pandas as pd

from .episode_frame import build_episode_frame
from .model_registry import PACKAGE_VERSION, load_probability_manifest, load_probability_package, save_probability_package
from .probability_calibration import apply_piecewise_calibrator
from .probability_features import build_live_probability_features, build_training_probability_frame
from .probability_models import build_probability_packages, score_probability
from .research_artifacts import build_probability_artifact_fingerprint, phantom_fragility_prior


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        parsed = float(value)
        return default if math.isnan(parsed) else parsed
    except (TypeError, ValueError):
        return default


def _normalize_vix(vix: float | None) -> float:
    if vix is None:
        return 0.35
    return _clamp01((float(vix) - 12.0) / 28.0)


def _dimension_score(effective_dimension: float, floor: float = 2.0, ceiling: float = 8.0) -> float:
    span = max(ceiling - floor, 1e-6)
    return _clamp01((effective_dimension - floor) / span)


def _weighted_average(values: list[float], weights: list[float]) -> float:
    total = sum(weights)
    if total <= 0:
        return sum(values) / max(len(values), 1)
    return sum(value * weight for value, weight in zip(values, weights)) / total


def _heuristic_probabilities(snapshot: dict[str, Any], measured_state: dict[str, Any], uncertainty: dict[str, Any], horizon_days: int) -> dict[str, Any]:
    crash_prob = _clamp01(_num(snapshot.get('overview', {}).get('crash_prob'), 0.35))
    tail_risk = _clamp01(_num(snapshot.get('overview', {}).get('tail_risk_score'), 0.35))
    legitimacy_risk = _clamp01(_num(snapshot.get('overview', {}).get('legitimacy_risk'), 0.35))
    compression = _clamp01(_num(measured_state.get('market_compression'), 0.5))
    dominance = _clamp01(_num(measured_state.get('market_dominance_share'), 0.5))
    effective_dimension = max(_num(measured_state.get('market_effective_dimension'), 2.0), 1.0)
    breadth = _clamp01(_num(measured_state.get('breadth'), 0.5))
    corr = _clamp01(_num(measured_state.get('median_pairwise_corr'), 0.5))
    fragility = _clamp01(_num(measured_state.get('portfolio_fragility_exposure'), 0.5))
    liquidity = _clamp01(_num(measured_state.get('portfolio_liquidity_buffer'), 0.1))
    drawdown = abs(_num(measured_state.get('portfolio_drawdown'), -0.05))
    benchmark_drawdown = abs(_num(measured_state.get('benchmark_drawdown'), -0.05))
    factor_dimension = max(_num(measured_state.get('portfolio_factor_dimension'), 2.0), 1.0)
    concentration = _clamp01(_num(measured_state.get('portfolio_hhi'), 0.1))
    vix_norm = _normalize_vix(measured_state.get('macro_vix'))
    market_dimension_score = _dimension_score(effective_dimension)
    portfolio_dimension_score = _dimension_score(factor_dimension, floor=1.0, ceiling=5.0)

    p_structural = _clamp01(0.28 * compression + 0.24 * dominance + 0.18 * corr + 0.18 * (1.0 - market_dimension_score) + 0.12 * (1.0 - breadth))
    p_regime = _clamp01(0.30 * crash_prob + 0.24 * tail_risk + 0.18 * vix_norm + 0.16 * min(benchmark_drawdown / 0.20, 1.0) + 0.12 * legitimacy_risk)
    gap = p_structural - p_regime
    if p_structural >= 0.6 and p_regime >= 0.6:
        cluster_type = 'compound'
    elif abs(gap) <= 0.08:
        cluster_type = 'mixed'
    elif gap > 0:
        cluster_type = 'G-dominated'
    else:
        cluster_type = 'R-dominated'

    p_visible_correction = _clamp01(0.48 + 0.28 * p_regime - 0.18 * p_structural - 0.10 * min(drawdown / 0.25, 1.0) + 0.08 * breadth)
    p_structural_restoration = _clamp01(0.40 + 0.22 * breadth + 0.15 * liquidity + 0.12 * portfolio_dimension_score - 0.22 * compression - 0.12 * fragility)
    phantom_base = _clamp01(0.35 + 0.35 * p_structural + 0.18 * compression - 0.42 * p_structural_restoration + 0.08 * concentration)
    p_phantom_rebound = min(p_visible_correction, phantom_base)
    p_extreme_drawdown = _clamp01(0.24 * crash_prob + 0.20 * tail_risk + 0.16 * p_structural + 0.14 * fragility + 0.14 * min(drawdown / 0.25, 1.0) + 0.12 * (1.0 - liquidity))

    challenge_scores = [
        1.0 - _clamp01(0.60 * compression + 0.25 * fragility + 0.15 * (1.0 - liquidity)),
        1.0 - _clamp01(0.45 * vix_norm + 0.30 * crash_prob + 0.25 * (1.0 - liquidity)),
        1.0 - _clamp01(0.50 * tail_risk + 0.25 * corr + 0.25 * fragility),
        1.0 - _clamp01(0.55 * fragility + 0.25 * concentration + 0.20 * min(drawdown / 0.25, 1.0)),
        1.0 - _clamp01(0.35 * p_structural + 0.25 * p_regime + 0.20 * compression + 0.20 * min(benchmark_drawdown / 0.20, 1.0)),
    ]
    challenge_weights = [
        0.18 + (0.22 * compression),
        0.18 + (0.18 * vix_norm),
        0.18 + (0.20 * tail_risk),
        0.18 + (0.20 * concentration),
        0.18 + (0.22 * max(p_structural, p_regime)),
    ]
    p_portfolio_recoverability = _clamp01(_weighted_average(challenge_scores, challenge_weights))
    authority_score = _clamp01(_num(uncertainty.get('authority_score'), 0.0))
    return {
        'horizon_days': horizon_days,
        'p_structural_dominance': p_structural,
        'p_regime_shock_dominance': p_regime,
        'cluster_type': cluster_type,
        'p_visible_correction': p_visible_correction,
        'p_structural_restoration': p_structural_restoration,
        'p_phantom_rebound': p_phantom_rebound,
        'p_portfolio_recoverability': p_portfolio_recoverability,
        'p_extreme_drawdown': p_extreme_drawdown,
        'authority_score': authority_score,
        'source': 'heuristic_fallback_v1',
    }


def _ensure_probability_package(snapshot: dict[str, Any], research_artifacts: dict[str, Any]) -> dict[str, Any] | None:
    fingerprint = build_probability_artifact_fingerprint(research_artifacts)
    manifest = load_probability_manifest(snapshot)
    package = load_probability_package(snapshot)
    invalidation_reason = 'cache_hit'
    manifest_version_ok = manifest and manifest.get('version') == PACKAGE_VERSION
    if package and manifest and manifest_version_ok and manifest.get('artifact_fingerprint_hash') == fingerprint.get('fingerprint_hash'):
        package['_package_meta'] = {
            'package_invalidation_reason': invalidation_reason,
            'artifact_fingerprint_hash': fingerprint.get('fingerprint_hash'),
        }
        return package
    if not package:
        invalidation_reason = 'package_missing'
    elif not manifest_version_ok:
        invalidation_reason = 'package_version_mismatch'
    else:
        invalidation_reason = 'artifact_fingerprint_mismatch'
    if not fingerprint.get('complete'):
        return None
    frame = build_training_probability_frame(build_episode_frame(research_artifacts))
    package = build_probability_packages(frame, embargo_days=20)
    if not package.get('targets'):
        return None
    package['package_version'] = PACKAGE_VERSION
    package['_package_meta'] = {
        'package_invalidation_reason': invalidation_reason,
        'artifact_fingerprint_hash': fingerprint.get('fingerprint_hash'),
    }
    save_probability_package(snapshot, package, artifact_fingerprint=fingerprint)
    return package


def _package_probabilities(snapshot: dict[str, Any], measured_state: dict[str, Any], heuristics: dict[str, Any], research_artifacts: dict[str, Any]) -> dict[str, Any] | None:
    package = _ensure_probability_package(snapshot, research_artifacts)
    if not package or not package.get('targets'):
        return None
    live = build_live_probability_features(measured_state, heuristics)
    outputs = {}
    target_map = {
        'p_structural_dominance': 'g_dominance',
        'p_regime_shock_dominance': 'r_dominance',
        'p_visible_correction': 'visible_correction',
        'p_structural_restoration': 'structural_restoration',
        'p_phantom_rebound': 'phantom_rebound',
        'p_portfolio_recoverability': 'portfolio_recoverability',
        'p_extreme_drawdown': 'extreme_drawdown',
    }
    available = 0
    for output_key, target_key in target_map.items():
        target_package = package['targets'].get(target_key)
        if not target_package:
            continue
        raw = score_probability(live, target_package)
        outputs[output_key] = apply_piecewise_calibrator(raw, target_package.get('calibrator'))
        available += 1
    if available < 4:
        return None
    outputs['p_phantom_rebound'] = min(outputs['p_visible_correction'], outputs['p_phantom_rebound'])
    outputs['source'] = 'offline_probability_package_v1'
    outputs['feature_coverage'] = len([value for value in live.values() if value is not None])
    outputs['model_package_version'] = package.get('package_version', PACKAGE_VERSION)
    outputs['package_invalidation_reason'] = package.get('_package_meta', {}).get('package_invalidation_reason')
    outputs['artifact_fingerprint_hash'] = package.get('_package_meta', {}).get('artifact_fingerprint_hash')
    outputs['package_metrics'] = package.get('metrics', [])
    outputs['neighbor_count'] = None
    return outputs


def _research_probabilities(measured_state: dict[str, Any], heuristics: dict[str, Any], research_artifacts: dict[str, Any]) -> dict[str, Any] | None:
    frame = build_episode_frame(research_artifacts)
    if frame.empty:
        return None
    live = build_live_probability_features(measured_state, heuristics)
    use_cols = ['D_eff', 'stress_score', 'eq_breadth_20', 'cross_corr_60', 'VIX', 'phantom_score', 'fragility_pct']
    for col in use_cols:
        if col not in frame.columns:
            frame[col] = pd.NA
        frame[col] = pd.to_numeric(frame[col], errors='coerce')
    working = frame.dropna(subset=['D_eff', 'stress_score'])
    if working.empty:
        return None
    distances = []
    for _, row in working.iterrows():
        distance = 0.0
        weights = 0.0
        for col, weight, denom in [
            ('D_eff', 0.20, 6.0),
            ('stress_score', 0.20, 1.0),
            ('eq_breadth_20', 0.15, 1.0),
            ('cross_corr_60', 0.15, 1.0),
            ('VIX', 0.15, 30.0),
            ('phantom_score', 0.10, 1.0),
            ('fragility_pct', 0.05, 1.0),
        ]:
            if pd.isna(row.get(col)):
                continue
            distance += weight * (abs(float(row[col]) - live[col]) / max(denom, 1e-6))
            weights += weight
        if weights <= 0:
            continue
        distances.append((distance / weights, row))
    if not distances:
        return None
    distances.sort(key=lambda item: item[0])
    nearest = distances[: min(25, len(distances))]
    scored = []
    for distance, row in nearest:
        scored.append((1.0 / max(distance, 0.05), row))
    total_weight = sum(weight for weight, _ in scored)
    if total_weight <= 0:
        return None

    def avg(column: str, fallback: float) -> float:
        vals = []
        ws = []
        for weight, row in scored:
            value = row.get(column)
            if pd.isna(value):
                continue
            vals.append(float(value))
            ws.append(weight)
        if not vals:
            return fallback
        return _weighted_average(vals, ws)

    visible = _clamp01(avg('visible_correction', heuristics['p_visible_correction']))
    restoration = _clamp01(avg('recovered', heuristics['p_structural_restoration']))
    if 'non_recovery' in working.columns:
        restoration = _clamp01(max(restoration, 1.0 - avg('non_recovery', 1.0 - restoration)))
    phantom = min(visible, _clamp01(avg('phantom_score', heuristics['p_phantom_rebound'])))
    recoverability = _clamp01(avg('success_no_relief', heuristics['p_portfolio_recoverability']) if 'success_no_relief' in working.columns else 1.0 - avg('non_recovery', 1.0 - heuristics['p_portfolio_recoverability']))
    extreme = _clamp01(max(heuristics['p_extreme_drawdown'], avg('stress_score', heuristics['p_extreme_drawdown']) * 0.8))
    return {
        'p_visible_correction': visible,
        'p_structural_restoration': restoration,
        'p_phantom_rebound': phantom,
        'p_portfolio_recoverability': recoverability,
        'p_extreme_drawdown': extreme,
        'source': 'research_artifact_neighbors_v1',
        'feature_coverage': len(use_cols) - int(sum(pd.isna(working.iloc[0][use_cols]))) if not working.empty else 0,
        'neighbor_count': len(scored),
    }


def build_probabilistic_state(snapshot: dict[str, Any], measured_state: dict[str, Any], uncertainty: dict[str, Any], horizon_days: int = 20, *, research_artifacts: dict[str, Any] | None = None) -> dict[str, Any]:
    heuristics = _heuristic_probabilities(snapshot, measured_state, uncertainty, horizon_days)
    p_structural = heuristics['p_structural_dominance']
    p_regime = heuristics['p_regime_shock_dominance']
    research_artifacts = research_artifacts or {}
    package = _package_probabilities(snapshot, measured_state, heuristics, research_artifacts)
    research = _research_probabilities(measured_state, heuristics, research_artifacts)
    if package:
        heuristics.update(package)
        if research:
            for key in ['p_visible_correction', 'p_structural_restoration', 'p_phantom_rebound', 'p_portfolio_recoverability', 'p_extreme_drawdown']:
                if key not in package:
                    heuristics[key] = research[key]
            if 'p_structural_restoration' not in package:
                heuristics['source'] = f"{heuristics.get('source', 'offline_probability_package_v1')}+research_restoration"
                heuristics['neighbor_count'] = research.get('neighbor_count')
    elif research:
        heuristics.update({
            'p_structural_dominance': heuristics['p_structural_dominance'],
            'p_regime_shock_dominance': heuristics['p_regime_shock_dominance'],
            'p_visible_correction': research['p_visible_correction'],
            'p_structural_restoration': research['p_structural_restoration'],
            'p_phantom_rebound': min(research['p_visible_correction'], research['p_phantom_rebound']),
            'p_portfolio_recoverability': research['p_portfolio_recoverability'],
            'p_extreme_drawdown': research['p_extreme_drawdown'],
            'source': research['source'],
            'feature_coverage': research['feature_coverage'],
            'neighbor_count': research['neighbor_count'],
            'model_package_version': None,
        })
    phantom_prior = phantom_fragility_prior(
        research_artifacts,
        measured_state.get('portfolio_fragility_exposure'),
        visible_context=_num(heuristics.get('p_visible_correction'), 0.0) >= 0.18,
    )
    if phantom_prior:
        prior = _clamp01(phantom_prior['prior'])
        current = _clamp01(_num(heuristics.get('p_phantom_rebound'), 0.0))
        blended = _clamp01((current * 0.72) + (prior * 0.28))
        heuristics['p_phantom_rebound'] = min(_clamp01(_num(heuristics.get('p_visible_correction'), 1.0)), blended)
        heuristics['phantom_fragility_prior'] = prior
        heuristics['phantom_fragility_decile'] = phantom_prior['decile_rank']
    gap = p_structural - p_regime
    if p_structural >= 0.6 and p_regime >= 0.6:
        cluster_type = 'compound'
    elif abs(gap) <= 0.08:
        cluster_type = 'mixed'
    elif gap > 0:
        cluster_type = 'G-dominated'
    else:
        cluster_type = 'R-dominated'
    heuristics['cluster_type'] = cluster_type
    heuristics['authority_score'] = _clamp01(_num(uncertainty.get('authority', {}).get('authority_policy_gate', uncertainty.get('authority_score')), 0.0))
    return heuristics
