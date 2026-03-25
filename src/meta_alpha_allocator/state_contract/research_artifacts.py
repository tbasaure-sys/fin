from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pandas as pd

from ..storage.runtime_store import load_runtime_frame, save_runtime_frame

if TYPE_CHECKING:
    from ..config import PathConfig

ARTIFACT_FILE_MAP = {
    'recoverability_summary': 'Finance_Recoverability_v5_Summary.csv',
    'recoverability_predictions': 'Finance_Recoverability_v5_Predictions.csv',
    'recoverability_episodes': 'Finance_Recoverability_v5_Episodes.csv',
    'prob_recoverability_summary': 'Finance_ProbabilityRecoverability_Summary.csv',
    'prob_recoverability_challenge': 'Finance_ProbabilityRecoverability_Challenge.csv',
    'prob_recoverability_action_epochs': 'Finance_ProbabilityRecoverability_ActionEpochs.csv',
    'phantom_headline': 'Finance_PhantomShare_Headline.csv',
    'phantom_by_fragility': 'Finance_PhantomShare_ByFragility.csv',
    'phantom_detector': 'Phantom_Stability_Detector.csv',
    'structural_recovery': 'Structural_Recovery_Analysis.csv',
    'recovery_events': 'Recovery_Events_Analysis.csv',
    'daily_spectral_metrics': 'Finance_Theorem_v1_DailySpectralMetrics.csv',
    'prospective_stress_panel': 'Finance_Theorem_v1_ProspectiveStressPanel.csv',
    'shock_support_summary': 'Finance_ShockSupportSurface_Summary.csv',
    'shock_support_nfci_surface': 'Finance_ShockSupportSurface_nfci_support_Surface.csv',
    'shock_support_dff_surface': 'Finance_ShockSupportSurface_dff_support_Surface.csv',
    'tightening_summary': 'Finance_TighteningChallenge_Summary.csv',
    'tightening_panel': 'Finance_TighteningChallenge_Panel.csv',
    'state_dependent_intervention': 'Finance_StateDependent_Intervention_Table.csv',
    'autopsy_timeseries': 'Finance_Autopsy_Timeseries.csv',
    'autopsy_results': 'Finance_Autopsy_Results.csv',
    'legacy_recoverability_summary': 'Recoverability_Summary.csv',
    'legacy_recoverability_analysis': 'Recoverability_Analysis.csv',
}
REQUIRED_ARTIFACT_KEYS = {
    'recoverability_summary',
    'recoverability_episodes',
    'prob_recoverability_summary',
    'prob_recoverability_action_epochs',
    'daily_spectral_metrics',
}
PROBABILITY_PACKAGE_KEYS = {
    'recoverability_episodes',
    'prob_recoverability_challenge',
    'prob_recoverability_action_epochs',
    'phantom_detector',
    'daily_spectral_metrics',
    'structural_recovery',
}


def _safe_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    try:
        return pd.read_csv(path)
    except Exception:
        return pd.DataFrame()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(65536), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _root_family(path: Path) -> str:
    value = str(path)
    if '/mnt/c/Users/' in value:
        return 'onedrive_windows'
    if '/workspace/CT/' in value:
        return 'workspace_ct'
    if '/code/CT/' in value:
        return 'code_ct'
    if value.startswith('/home/'):
        return 'linux_local'
    return 'custom'


def _candidate_roots(paths: 'PathConfig | None') -> list[Path]:
    roots: list[Path] = []
    env_root = os.environ.get('META_ALLOCATOR_RESEARCH_ARTIFACT_ROOT')
    if env_root:
        roots.append(Path(env_root).expanduser())
    env_roots = os.environ.get('META_ALLOCATOR_RESEARCH_ARTIFACT_ROOTS', '')
    for chunk in env_roots.split(os.pathsep):
        text = chunk.strip()
        if text:
            roots.append(Path(text).expanduser())
    if paths is not None:
        roots.extend([paths.finance_root / 'data_processed', paths.ct_root / '02_Finance' / 'data_processed'])
    home = Path.home()
    home_patterns = [
        'workspace/CT/02_Finance/data_processed',
        'code/CT/02_Finance/data_processed',
    ]
    custom_home_patterns = os.environ.get('META_ALLOCATOR_RESEARCH_ARTIFACT_HOME_PATTERNS', '')
    if custom_home_patterns.strip():
        home_patterns = [item.strip() for item in custom_home_patterns.split(',') if item.strip()]
    roots.extend([home / pattern for pattern in home_patterns])
    users_root = Path('/mnt/c/Users')
    if users_root.exists():
        windows_patterns = ['*/OneDrive/Escritorio/CT/02_Finance/data_processed', '*/OneDrive/Desktop/CT/02_Finance/data_processed']
        custom_windows_patterns = os.environ.get('META_ALLOCATOR_RESEARCH_ARTIFACT_WINDOWS_PATTERNS', '')
        if custom_windows_patterns.strip():
            windows_patterns = [item.strip() for item in custom_windows_patterns.split(',') if item.strip()]
        for pattern in windows_patterns:
            roots.extend(users_root.glob(pattern))
    deduped: list[Path] = []
    seen = set()
    for root in roots:
        if not root.exists():
            continue
        key = str(root.resolve())
        if key in seen:
            continue
        seen.add(key)
        deduped.append(root)
    return deduped


def _artifact_metadata(path: Path, frame: pd.DataFrame) -> dict[str, Any]:
    stat = path.stat()
    return {
        'source_path': str(path),
        'source_filename': path.name,
        'mtime_utc': pd.Timestamp(stat.st_mtime, unit='s', tz='UTC').isoformat(),
        'row_count': int(len(frame.index)) if frame is not None else 0,
        'column_count': int(len(frame.columns)) if frame is not None else 0,
        'sha256': _sha256(path),
        'root_family': _root_family(path),
        'loaded': not frame.empty,
    }


def build_research_provenance(research_artifacts: dict[str, Any]) -> dict[str, Any]:
    artifacts = []
    roots = []
    conflict_count = 0
    missing_required = []
    for key in sorted(ARTIFACT_FILE_MAP):
        payload = research_artifacts.get(key)
        if not payload:
            if key in REQUIRED_ARTIFACT_KEYS:
                missing_required.append(key)
            continue
        metadata = payload.get('metadata', {}).copy()
        metadata['artifact_key'] = key
        artifacts.append(metadata)
        root_family = metadata.get('root_family')
        if root_family:
            roots.append(root_family)
        if payload.get('conflicts'):
            conflict_count += len(payload['conflicts'])
    coverage_ratio = len([key for key in REQUIRED_ARTIFACT_KEYS if key in research_artifacts]) / max(len(REQUIRED_ARTIFACT_KEYS), 1)
    root_family = max(set(roots), key=roots.count) if roots else None
    return {
        'artifacts': artifacts,
        'coverage_ratio': coverage_ratio,
        'missing_required': missing_required,
        'root_family': root_family,
        'root_conflict': conflict_count > 0,
        'conflict_count': conflict_count,
    }


def build_probability_artifact_fingerprint(research_artifacts: dict[str, Any]) -> dict[str, Any]:
    items = []
    missing_required = []
    for key in sorted(PROBABILITY_PACKAGE_KEYS):
        payload = research_artifacts.get(key)
        if not payload:
            missing_required.append(key)
            continue
        metadata = payload.get('metadata', {})
        item = {
            'artifact_key': key,
            'sha256': metadata.get('sha256'),
            'row_count': metadata.get('row_count'),
            'mtime_utc': metadata.get('mtime_utc'),
        }
        items.append(item)
    digest = hashlib.sha256(repr(items).encode('utf-8')).hexdigest() if items else None
    return {
        'fingerprint_hash': digest,
        'artifacts': items,
        'missing_required': missing_required,
        'complete': len(missing_required) == 0 and bool(items),
    }


def phantom_fragility_prior(research_artifacts: dict[str, Any], fragility_value: float | None, *, visible_context: bool = True) -> dict[str, Any] | None:
    payload = research_artifacts.get('phantom_by_fragility')
    frame = payload.get('frame') if payload else None
    if frame is None or frame.empty:
        return None
    working = frame.copy()
    working['decile_rank'] = pd.to_numeric(working.get('decile_rank'), errors='coerce')
    working['phantom_share_visible'] = pd.to_numeric(working.get('phantom_share_visible'), errors='coerce')
    working['phantom_share_all'] = pd.to_numeric(working.get('phantom_share_all'), errors='coerce')
    working = working.dropna(subset=['decile_rank'])
    if working.empty:
        return None
    bounded_fragility = min(max(float(fragility_value or 0.0), 0.0), 1.0)
    decile = min(10, max(1, int((bounded_fragility * 10) + 0.999999)))
    row = working.loc[working['decile_rank'].astype(int) == decile]
    if row.empty:
        row = working.iloc[[int((bounded_fragility) * (len(working.index) - 1))]]
    selected = row.iloc[0]
    prior_key = 'phantom_share_visible' if visible_context else 'phantom_share_all'
    prior = selected.get(prior_key)
    if pd.isna(prior):
        prior = selected.get('phantom_share_all')
    if pd.isna(prior):
        return None
    return {
        'prior': float(prior),
        'decile_rank': int(selected.get('decile_rank', decile)),
        'visible_context': visible_context,
    }


def load_research_artifacts(paths: 'PathConfig | None') -> dict[str, Any]:
    loaded: dict[str, Any] = {}
    conflicts: dict[str, list[dict[str, Any]]] = {}
    selected_family: str | None = None
    for root in _candidate_roots(paths):
        family = _root_family(root)
        for key, filename in ARTIFACT_FILE_MAP.items():
            candidate = root / filename
            if not candidate.exists():
                continue
            frame = _safe_csv(candidate)
            payload = {'path': candidate, 'frame': frame, 'metadata': _artifact_metadata(candidate, frame), 'conflicts': []}
            if key not in loaded:
                loaded[key] = payload
                if selected_family is None:
                    selected_family = family
                continue
            current = loaded[key]
            same_hash = current['metadata'].get('sha256') == payload['metadata'].get('sha256')
            if same_hash:
                continue
            conflicts.setdefault(key, []).append(payload['metadata'])
            if current['metadata'].get('root_family') != selected_family and family == selected_family:
                loaded[key] = payload
    for key, entries in conflicts.items():
        if key in loaded:
            loaded[key]['conflicts'] = entries
    for key, payload in loaded.items():
        frame = payload.get('frame')
        if isinstance(frame, pd.DataFrame) and not frame.empty:
            save_runtime_frame(
                f"research_artifact:{key}",
                frame,
                {
                    **(payload.get('metadata') or {}),
                    'artifact_key': key,
                    'source': 'local_research_artifact',
                },
            )
    if loaded:
        return loaded
    for key in ARTIFACT_FILE_MAP:
        frame = load_runtime_frame(f"research_artifact:{key}")
        if frame.empty:
            continue
        loaded[key] = {
            'path': None,
            'frame': frame,
            'metadata': {
                'artifact_key': key,
                'source_path': 'runtime_store',
                'source_filename': ARTIFACT_FILE_MAP[key],
                'root_family': 'runtime_store',
                'row_count': int(len(frame.index)),
                'column_count': int(len(frame.columns)),
                'loaded': True,
            },
            'conflicts': [],
        }
    return loaded


def artifact_frame(research_artifacts: dict[str, Any], key: str) -> pd.DataFrame:
    payload = research_artifacts.get(key) or {}
    frame = payload.get('frame')
    return frame.copy() if isinstance(frame, pd.DataFrame) else pd.DataFrame()
