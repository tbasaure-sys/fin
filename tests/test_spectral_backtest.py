from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from meta_alpha_allocator.config import PathConfig, ResearchSettings
from meta_alpha_allocator.research.spectral_backtest import run_spectral_backtest


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


def test_spectral_backtest_produces_summary(tmp_path: Path, monkeypatch) -> None:
    paths = _paths(tmp_path)
    research_output = paths.output_root / "research" / "latest"
    spectral_output = paths.output_root / "spectral" / "latest"
    research_output.mkdir(parents=True, exist_ok=True)
    spectral_output.mkdir(parents=True, exist_ok=True)

    dates = pd.date_range("2024-01-01", periods=140, freq="B")
    daily = pd.DataFrame(
        {
            "state_overlay": np.linspace(0.001, 0.0002, len(dates)),
            "spy": np.linspace(0.0012, 0.0003, len(dates)),
            "policy_overlay": np.linspace(0.0008, 0.0001, len(dates)),
        },
        index=dates,
    )
    daily.to_csv(research_output / "daily_returns.csv")

    decisions = pd.DataFrame(
        {
            "date": dates,
            "defense_weight": np.where(np.arange(len(dates)) % 30 < 15, 0.25, 0.45),
        }
    )
    decisions.to_csv(research_output / "allocator_decisions.csv", index=False)

    price_frame = pd.DataFrame(
        {
            "SPY": 100 * np.cumprod(1 + daily["spy"].to_numpy()),
            "IEF": 100 * np.cumprod(1 + 0.0002 + np.zeros(len(dates))),
            "BIL": 100 * np.cumprod(1 + 0.00008 + np.zeros(len(dates))),
            "QQQ": 120 * np.cumprod(1 + 0.001 + np.zeros(len(dates))),
        },
        index=dates,
    )

    monkeypatch.setattr("meta_alpha_allocator.research.spectral_backtest.FMPClient.from_env", lambda cache_root: None)
    monkeypatch.setattr("meta_alpha_allocator.research.spectral_backtest.load_defense_price_panel", lambda *args, **kwargs: (price_frame[["SPY", "IEF", "BIL"]], []))
    monkeypatch.setattr("meta_alpha_allocator.research.spectral_backtest.load_fmp_market_proxy_panel", lambda *args, **kwargs: price_frame)

    def _fake_spectral(*args, **kwargs):
        truncated_prices = args[2]
        last_date = pd.to_datetime(truncated_prices.index.max())
        return type(
            "SpectralStub",
            (),
            {
                "summary": {
                    "latest": {
                        "compression_score": 0.7 if last_date.month % 2 == 0 else 0.3,
                        "structural_state": "compressed" if last_date.month % 2 == 0 else "open",
                        "structural_beta_ceiling": 0.45 if last_date.month % 2 == 0 else 0.85,
                        "suggested_stance": "defensive" if last_date.month % 2 == 0 else "run_risk",
                        "p_compressed": 0.7 if last_date.month % 2 == 0 else 0.3,
                    }
                }
            },
        )()

    monkeypatch.setattr("meta_alpha_allocator.research.spectral_backtest.run_spectral_structure_pipeline", _fake_spectral)

    settings = ResearchSettings(
        output_dir=research_output,
        spectral_output_dir=spectral_output,
        start_date="2024-01-01",
    )
    artifacts = run_spectral_backtest(paths, settings)

    assert "state_overlay_structural" in artifacts.summary
    assert "acceptance_checks" in artifacts.summary
    assert (spectral_output / "spectral_backtest_summary.json").exists()
