from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from meta_alpha_allocator.config import PathConfig, ResearchSettings
from meta_alpha_allocator.research.forecast_baselines import run_forecast_baselines
from meta_alpha_allocator.research.statement_intel import run_statement_intelligence


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


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_run_forecast_baselines_produces_latest_and_metrics(tmp_path: Path) -> None:
    dates = pd.date_range("2023-01-01", periods=520, freq="B")
    prices = pd.DataFrame(
        {
            "SPY": 100 + np.cumsum(np.random.default_rng(1).normal(0.1, 1.0, len(dates))),
            "SHY": 100 + np.cumsum(np.random.default_rng(2).normal(0.02, 0.1, len(dates))),
            "IEF": 100 + np.cumsum(np.random.default_rng(3).normal(0.03, 0.25, len(dates))),
        },
        index=dates,
    ).abs()
    state = pd.DataFrame(
        {
            "date": dates,
            "crash_prob": np.linspace(0.2, 0.7, len(dates)),
            "tail_risk_score": np.linspace(0.25, 0.75, len(dates)),
            "legitimacy_risk": np.linspace(0.22, 0.72, len(dates)),
            "crowding_pct": np.linspace(0.3, 0.6, len(dates)),
            "tension_pct": np.linspace(0.25, 0.55, len(dates)),
            "memory_p_fail": np.linspace(0.2, 0.5, len(dates)),
            "recurrence": np.linspace(0.3, 0.58, len(dates)),
        }
    )
    settings = ResearchSettings(forecast_tickers=("SPY", "SHY", "IEF"), forecast_output_dir=tmp_path / "forecast")
    artifacts = run_forecast_baselines(_paths(tmp_path), settings, state, prices)
    assert "SPY" in artifacts.summary["latest"]
    assert any(row["ticker"] == "SPY" for row in artifacts.summary["metrics"])
    assert (settings.forecast_output_dir / "forecast_summary.json").exists()


def test_run_statement_intelligence_scores_names(tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    latest = paths.portfolio_manager_root / "output" / "latest"
    _write(
        latest / "screener.csv",
        "ticker;sector;industry;gross_margin;ebitda_margin;roic;fcf_yield;debt_to_ebitda;forward_pe;beta;momentum_6m;valuation_gap;quality_score;value_score;risk_score;growth_score;composite_score;suggested_position;thesis_bucket;analyst_consensus\n"
        "PAGS;Technology;Software;0.50;0.46;0.40;0.44;0.29;6.1;1.44;0.06;5.68;0.73;1.92;0.35;0.66;0.94;0.0;quality compounder;Buy\n"
        "ASTS;Technology;Communications;0.50;-0.10;-0.07;-0.03;7.20;120;2.8;1.38;-1.27;0.24;0.43;0.65;0.93;0.54;0.1;watchlist;Hold\n",
    )
    _write(latest / "valuation_summary.csv", "ticker;fair_value;upside;confidence\nPAGS;67.7;5.68;0.95\nASTS;-24.0;-1.27;0.65\n")
    _write(latest / "holdings_normalized.csv", "ticker;weight\nPAGS;0.03\nASTS;0.02\n")
    _write(latest / "portfolio_summary.json", json.dumps({"top_ideas": []}))
    settings = ResearchSettings(statement_output_dir=tmp_path / "statement")
    artifacts = run_statement_intelligence(paths, settings)
    assert not artifacts.panel.empty
    assert artifacts.panel.iloc[0]["ticker"] == "PAGS"
    assert "compounder_score" in artifacts.panel.columns
    assert "top_compounders" in artifacts.summary
    assert (settings.statement_output_dir / "statement_intelligence_summary.json").exists()
