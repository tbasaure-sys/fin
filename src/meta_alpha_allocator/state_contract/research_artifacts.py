from __future__ import annotations

from pathlib import Path
import hashlib
from typing import TYPE_CHECKING, Any

import pandas as pd

if TYPE_CHECKING:
    from ..config import PathConfig


def _safe_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    try:
        return pd.read_csv(path)
    except Exception:
        return pd.DataFrame()


def _candidate_roots(paths: "PathConfig | None") -> list[Path]:
    roots: list[Path] = []
    if paths is not None:
        roots.extend(
            [
                paths.finance_root / "data_processed",
                paths.ct_root / "02_Finance" / "data_processed",
                paths.finance_root.parent / "CT" / "02_Finance" / "data_processed",
            ]
        )
    roots.extend(
        [
            Path("/home/t14_ultra_7_tomas/workspace/CT/02_Finance/data_processed"),
            Path("/mnt/c/Users/T14 Ultra 7/OneDrive/Escritorio/CT/02_Finance/data_processed"),
        ]
    )
    deduped: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        key = str(root)
        if key in seen:
            continue
        seen.add(key)
        if root.exists():
            deduped.append(root)
    return deduped


def _root_family(path: Path) -> str:
    path_str = str(path)
    if "OneDrive" in path_str:
        return "onedrive_ct"
    if "/workspace/CT/" in path_str:
        return "workspace_ct"
    if "02_Finance" in path_str:
        return "finance_ct"
    return "local"


def _frame_meta(path: Path, frame: pd.DataFrame) -> dict[str, Any]:
    digest = hashlib.sha256()
    try:
        digest.update(path.read_bytes())
    except Exception:
        digest.update(str(path).encode("utf-8"))
    return {
        "path": path,
        "source_filename": path.name,
        "root_family": _root_family(path),
        "mtime_utc": path.stat().st_mtime if path.exists() else None,
        "row_count": int(len(frame.index)),
        "column_count": int(len(frame.columns)),
        "sha256": digest.hexdigest(),
    }


def load_research_artifacts(paths: "PathConfig | None") -> dict[str, Any]:
    file_map = {
        "recoverability_summary": "Finance_Recoverability_v5_Summary.csv",
        "recoverability_predictions": "Finance_Recoverability_v5_Predictions.csv",
        "recoverability_episodes": "Finance_Recoverability_v5_Episodes.csv",
        "prob_recoverability_summary": "Finance_ProbabilityRecoverability_Summary.csv",
        "prob_recoverability_challenge": "Finance_ProbabilityRecoverability_Challenge.csv",
        "prob_recoverability_action_epochs": "Finance_ProbabilityRecoverability_ActionEpochs.csv",
        "phantom_headline": "Finance_PhantomShare_Headline.csv",
        "phantom_by_fragility": "Finance_PhantomShare_ByFragility.csv",
        "phantom_detector": "Phantom_Stability_Detector.csv",
        "structural_recovery": "Structural_Recovery_Analysis.csv",
        "recovery_events": "Recovery_Events_Analysis.csv",
        "daily_spectral_metrics": "Finance_Theorem_v1_DailySpectralMetrics.csv",
        "prospective_stress_panel": "Finance_Theorem_v1_ProspectiveStressPanel.csv",
        "shock_support_summary": "Finance_ShockSupportSurface_Summary.csv",
        "shock_support_nfci_surface": "Finance_ShockSupportSurface_nfci_support_Surface.csv",
        "shock_support_dff_surface": "Finance_ShockSupportSurface_dff_support_Surface.csv",
        "tightening_summary": "Finance_TighteningChallenge_Summary.csv",
        "tightening_panel": "Finance_TighteningChallenge_Panel.csv",
        "state_dependent_intervention": "Finance_StateDependent_Intervention_Table.csv",
        "autopsy_timeseries": "Finance_Autopsy_Timeseries.csv",
        "autopsy_results": "Finance_Autopsy_Results.csv",
        "legacy_recoverability_summary": "Recoverability_Summary.csv",
        "legacy_recoverability_analysis": "Recoverability_Analysis.csv",
    }
    loaded: dict[str, Any] = {}
    for root in _candidate_roots(paths):
        for key, filename in file_map.items():
            if key in loaded:
                continue
            candidate = root / filename
            if candidate.exists():
                frame = _safe_csv(candidate)
                loaded[key] = {
                    "path": candidate,
                    "frame": frame,
                    "meta": _frame_meta(candidate, frame),
                }
    return loaded


def artifact_frame(artifacts: dict[str, Any], key: str) -> pd.DataFrame:
    entry = artifacts.get(key) or {}
    frame = entry.get("frame")
    return frame.copy() if isinstance(frame, pd.DataFrame) else pd.DataFrame()
