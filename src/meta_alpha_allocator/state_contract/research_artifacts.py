from __future__ import annotations

from pathlib import Path
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
            ]
        )
    return [root for root in roots if root.exists()]


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
                loaded[key] = {
                    "path": candidate,
                    "frame": _safe_csv(candidate),
                }
    return loaded
