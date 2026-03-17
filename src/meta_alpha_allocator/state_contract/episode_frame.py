from __future__ import annotations

from typing import Any

import pandas as pd


def _clean_date(frame: pd.DataFrame, column: str = 'Date') -> pd.DataFrame:
    if frame is None or frame.empty:
        return pd.DataFrame()
    copy = frame.copy()
    if column not in copy.columns:
        if 'as_of' in copy.columns:
            column = 'as_of'
        else:
            return copy
    copy[column] = pd.to_datetime(copy[column], errors='coerce').dt.normalize()
    copy = copy.dropna(subset=[column])
    return copy


def build_episode_frame(research_artifacts: dict[str, Any]) -> pd.DataFrame:
    action_epochs = _clean_date(research_artifacts.get('prob_recoverability_action_epochs', {}).get('frame', pd.DataFrame()))
    challenge = _clean_date(research_artifacts.get('prob_recoverability_challenge', {}).get('frame', pd.DataFrame()))
    spectral = _clean_date(research_artifacts.get('daily_spectral_metrics', {}).get('frame', pd.DataFrame()))
    episodes = _clean_date(research_artifacts.get('recoverability_episodes', {}).get('frame', pd.DataFrame()))
    recovery = _clean_date(research_artifacts.get('structural_recovery', {}).get('frame', pd.DataFrame()))
    recovery_events = _clean_date(research_artifacts.get('recovery_events', {}).get('frame', pd.DataFrame()))
    phantom = _clean_date(research_artifacts.get('phantom_detector', {}).get('frame', pd.DataFrame()))

    if action_epochs.empty and episodes.empty and spectral.empty:
        return pd.DataFrame()

    frame = action_epochs.rename(columns={'Date': 'as_of'}) if not action_epochs.empty else pd.DataFrame(columns=['as_of'])
    for addon in [challenge, spectral, episodes, recovery, phantom]:
        if addon.empty:
            continue
        date_col = 'Date' if 'Date' in addon.columns else 'as_of'
        current = addon.rename(columns={date_col: 'as_of'})
        if frame.empty:
            frame = current
            continue
        frame = pd.merge_asof(
            frame.sort_values('as_of'),
            current.sort_values('as_of'),
            on='as_of',
            direction='backward',
            tolerance=pd.Timedelta(days=3),
            suffixes=('', '_dup'),
        )
        dupes = [column for column in frame.columns if column.endswith('_dup')]
        if dupes:
            frame = frame.drop(columns=dupes)

    if not recovery_events.empty and not frame.empty:
        events = recovery_events.rename(columns={'Date': 'as_of', 'recovered': 'event_recovered', 'days_to_recovery': 'event_days_to_recovery'})
        keep = [column for column in ['as_of', 'event_recovered', 'event_days_to_recovery', 'drawdown_at_entry', 'R_index_v2'] if column in events.columns]
        frame = pd.merge_asof(
            frame.sort_values('as_of'),
            events[keep].sort_values('as_of'),
            on='as_of',
            direction='nearest',
            tolerance=pd.Timedelta(days=5),
            suffixes=('', '_event'),
        )

    for column in ['visible_correction', 'recovered', 'event_recovered', 'event_days_to_recovery', 'non_recovery', 'stress_score', 'SPY_drawdown', 'D_eff', 'eq_breadth_20', 'cross_corr_60', 'VIX', 'VIXCLS', 'phantom_score', 'fragility_pct', 'success_no_relief']:
        if column in frame.columns:
            frame[column] = pd.to_numeric(frame[column], errors='coerce')
    return frame.drop_duplicates(subset=['as_of']).sort_values('as_of').reset_index(drop=True)
