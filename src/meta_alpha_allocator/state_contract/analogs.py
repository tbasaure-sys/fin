from __future__ import annotations

import math
from typing import Any

import pandas as pd

from .analog_corpus import build_analog_corpus


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        parsed = float(value)
        return default if math.isnan(parsed) else parsed
    except (TypeError, ValueError):
        return default


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _normalize_vix(vix: float | None) -> float:
    if vix is None:
        return 0.35
    return _clamp01((float(vix) - 12.0) / 28.0)


def _state_distance(current: dict[str, Any], row: dict[str, Any], cluster_match: bool) -> float:
    base = (
        0.22 * abs(_num(current.get('market_effective_dimension'), 4.0) - _num(row.get('market_effective_dimension'), 4.0)) / 6.0 +
        0.18 * abs(_num(current.get('market_dominance_share'), 0.5) - _num(row.get('market_dominance_share'), 0.5)) +
        0.18 * abs(_num(current.get('market_compression'), 0.5) - _num(row.get('market_compression'), 0.5)) +
        0.14 * abs(_num(current.get('breadth'), 0.5) - _num(row.get('breadth'), 0.5)) +
        0.12 * abs(_num(current.get('median_pairwise_corr'), 0.5) - _num(row.get('median_pairwise_corr'), 0.5)) +
        0.10 * abs(_normalize_vix(current.get('macro_vix')) - _normalize_vix(row.get('macro_vix'))) +
        0.06 * abs(_num(current.get('portfolio_fragility_exposure'), 0.5) - _num(row.get('phantom_score'), 0.5))
    )
    return base + (0.20 if not cluster_match else 0.0)


def _build_research_analogs(measured_state: dict[str, Any], probabilistic_state: dict[str, Any], research_artifacts: dict[str, Any]) -> list[dict[str, Any]]:
    corpus = build_analog_corpus(research_artifacts)
    if corpus.empty:
        return []
    current = measured_state.copy()
    ranked = []
    live_cluster = probabilistic_state.get('cluster_type', 'mixed')
    for idx, row in corpus.iterrows():
        restorative = _clamp01(1.0 - _num(row.get('non_recovery'), 1.0 - _num(row.get('recovered'), 0.0)))
        visible = _clamp01(_num(row.get('visible_correction'), 0.5))
        cluster_match = True
        if live_cluster == 'G-dominated':
            cluster_match = _num(row.get('stress_score'), 0.5) >= 0.5
        elif live_cluster == 'R-dominated':
            cluster_match = _num(row.get('stress_score'), 0.5) < 0.7
        distance = _state_distance(current, row.to_dict(), cluster_match)
        ranked.append({
            'analog_id': f'research-analog-{idx}',
            'as_of': row.get('as_of').isoformat() if hasattr(row.get('as_of'), 'isoformat') else row.get('as_of'),
            'distance': round(distance, 4),
            'cluster_type': live_cluster,
            'p_visible_correction_realized': visible,
            'p_structural_restoration_realized': restorative,
            'days_to_visible_correction': int(_num(row.get('days_to_recovery'), 12) or 12),
            'days_to_structural_restoration': int(_num(row.get('days_to_recovery'), 45) or 45),
            'max_drawdown_from_state': -abs(_num(row.get('max_drawdown_from_state'), 0.1)),
            'summary_tags': ['research-artifact', str(row.get('period') or row.get('regime') or 'episode')],
            'provenance_ref': 'research_artifacts',
        })
    ranked.sort(key=lambda item: item['distance'])
    return ranked[:8]


def _distance(current: dict[str, Any], row: dict[str, Any]) -> float:
    return (
        abs(_num(current.get('compression_score'), 0.5) - _num(row.get('compression_score'), 0.5)) +
        abs(_num(current.get('freedom_score'), 0.5) - _num(row.get('freedom_score'), 0.5)) +
        abs(_num(current.get('effective_dimension'), 2.0) - _num(row.get('effective_dimension'), 2.0)) / 5.0 +
        abs(_num(current.get('top_eigenvalue_share') or current.get('dominance_share'), 0.5) - _num(row.get('top_eigenvalue_share') or row.get('dominance_share'), 0.5))
    )


def build_analogs(snapshot: dict[str, Any], probabilistic_state: dict[str, Any], *, measured_state: dict[str, Any] | None = None, research_artifacts: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    measured_state = measured_state or {}
    research_artifacts = research_artifacts or {}
    research_analogs = _build_research_analogs(measured_state, probabilistic_state, research_artifacts)
    if research_analogs:
        return research_analogs

    spectral = snapshot.get('risk', {}).get('spectral', {})
    latest = spectral.get('latest', {})
    history = spectral.get('history') or []
    if not history:
        return []
    ranked = []
    for idx, row in enumerate(history[:-1] or history):
        distance = _distance(latest, row)
        restorative = _clamp01(0.45 + 0.20 * _num(row.get('freedom_score'), 0.0) - 0.25 * _num(row.get('compression_score'), 0.0))
        visible = _clamp01(0.52 + 0.18 * _num(row.get('structural_state') == 'open', 0.0) + 0.12 * _num(row.get('freedom_score'), 0.0))
        cluster_type = probabilistic_state.get('cluster_type', 'mixed')
        ranked.append({
            'analog_id': f'analog-{idx}',
            'as_of': row.get('date') or row.get('as_of') or row.get('timestamp'),
            'distance': round(distance, 4),
            'cluster_type': cluster_type,
            'p_visible_correction_realized': visible,
            'p_structural_restoration_realized': restorative,
            'days_to_visible_correction': 5 if visible >= 0.55 else 12,
            'days_to_structural_restoration': 20 if restorative >= 0.55 else 45,
            'max_drawdown_from_state': -_clamp01(_num(row.get('compression_score'), 0.0) * 0.18 + (1.0 - _num(row.get('freedom_score'), 0.0)) * 0.12),
            'summary_tags': [row.get('structural_state') or 'unknown', 'spectral-history'],
            'provenance_ref': 'spectral_history',
        })
    ranked.sort(key=lambda row: row['distance'])
    return ranked[:8]
