from __future__ import annotations

from typing import Any

import pandas as pd

from .episode_frame import build_episode_frame


CANONICAL_COLUMNS = [
    'market_effective_dimension',
    'market_dominance_share',
    'market_compression',
    'breadth',
    'median_pairwise_corr',
    'macro_vix',
    'stress_score',
    'credit_stress_proxy',
]


def build_analog_corpus(research_artifacts: dict[str, Any]) -> pd.DataFrame:
    frame = build_episode_frame(research_artifacts)
    if frame.empty:
        return frame
    corpus = pd.DataFrame({
        'as_of': frame['as_of'],
        'market_effective_dimension': pd.to_numeric(frame.get('D_eff', pd.Series(index=frame.index, dtype=float)), errors='coerce'),
        'market_dominance_share': pd.to_numeric(frame.get('Absorption_Ratio', pd.Series(index=frame.index, dtype=float)), errors='coerce'),
        'market_compression': pd.to_numeric(frame.get('stress_score', pd.Series(index=frame.index, dtype=float)), errors='coerce').clip(lower=0, upper=1),
        'breadth': pd.to_numeric(frame.get('eq_breadth_20', pd.Series(index=frame.index, dtype=float)), errors='coerce'),
        'median_pairwise_corr': pd.to_numeric(frame.get('cross_corr_60', pd.Series(index=frame.index, dtype=float)), errors='coerce'),
        'macro_vix': pd.to_numeric(frame.get('VIXCLS', frame.get('VIX', pd.Series(index=frame.index, dtype=float))), errors='coerce'),
        'stress_score': pd.to_numeric(frame.get('stress_score', pd.Series(index=frame.index, dtype=float)), errors='coerce'),
        'credit_stress_proxy': pd.to_numeric(frame.get('BAMLH0A0HYM2', frame.get('BAMLC0A4CBBB', pd.Series(index=frame.index, dtype=float))), errors='coerce'),
        'visible_correction': pd.to_numeric(frame.get('visible_correction', pd.Series(index=frame.index, dtype=float)), errors='coerce'),
        'recovered': pd.to_numeric(frame.get('recovered', pd.Series(index=frame.index, dtype=float)), errors='coerce'),
        'non_recovery': pd.to_numeric(frame.get('non_recovery', pd.Series(index=frame.index, dtype=float)), errors='coerce'),
        'days_to_recovery': pd.to_numeric(frame.get('days_to_recovery', pd.Series(index=frame.index, dtype=float)), errors='coerce'),
        'max_drawdown_from_state': pd.to_numeric(frame.get('worst_drawdown_h', frame.get('drawdown_at_entry', frame.get('SPY_drawdown', pd.Series(index=frame.index, dtype=float)))), errors='coerce'),
        'phantom_score': pd.to_numeric(frame.get('phantom_score', pd.Series(index=frame.index, dtype=float)), errors='coerce'),
        'period': frame.get('period', pd.Series(index=frame.index, dtype='object')),
        'regime': frame.get('regime', pd.Series(index=frame.index, dtype='object')),
    })
    return corpus.drop_duplicates(subset=['as_of']).reset_index(drop=True)
