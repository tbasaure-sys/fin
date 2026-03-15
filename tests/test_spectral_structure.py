from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from meta_alpha_allocator.config import PathConfig, ResearchSettings
from meta_alpha_allocator.research.spectral_structure import run_spectral_structure_pipeline


def _paths(tmp_path: Path) -> PathConfig:
    project_root = tmp_path / "meta_alpha_allocator"
    finance_root = tmp_path
    ct_root = tmp_path.parent
    return PathConfig(
        project_root=project_root,
        finance_root=finance_root,
        ct_root=ct_root,
        fin_model_root=finance_root / "Fin_model",
        portfolio_manager_root=finance_root / "portfolio_manager",
        polymarket_root=ct_root / "polymarket_paper_trader",
        caria_data_root=ct_root / "caria_data",
        output_root=project_root / "output",
        cache_root=project_root / "cache",
    )


def test_spectral_structure_pipeline_builds_state_and_monte_carlo(tmp_path: Path) -> None:
    rng = np.random.default_rng(7)
    dates = pd.date_range("2024-01-01", periods=220, freq="B")
    base = rng.normal(0.0004, 0.01, size=len(dates))
    prices = pd.DataFrame(
        {
            "SPY": 100 * np.cumprod(1 + base + rng.normal(0, 0.004, len(dates))),
            "QQQ": 120 * np.cumprod(1 + base * 1.1 + rng.normal(0, 0.005, len(dates))),
            "IWM": 90 * np.cumprod(1 + base * 0.9 + rng.normal(0, 0.006, len(dates))),
            "SHY": 100 * np.cumprod(1 + rng.normal(0.0001, 0.0007, len(dates))),
            "GLD": 180 * np.cumprod(1 + rng.normal(0.0002, 0.006, len(dates))),
        },
        index=dates,
    )

    artifacts = run_spectral_structure_pipeline(
        _paths(tmp_path),
        ResearchSettings(),
        prices,
        {"SPY": 0.6, "QQQ": 0.2, "SHY": 0.2},
    )

    latest = artifacts.summary["latest"]
    assert latest["structural_state"] in {"open", "transition", "compressed"}
    assert 0.0 <= latest["compression_score"] <= 1.0
    assert artifacts.summary["monte_carlo"]["21"]["probability_loss"] >= 0.0
    assert len(artifacts.summary["monte_carlo"]["63"]["path_percentiles"]) == 63
