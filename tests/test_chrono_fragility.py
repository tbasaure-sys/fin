from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from meta_alpha_allocator.config import PathConfig, ResearchSettings
from meta_alpha_allocator.research.chrono_fragility import (
    _spectral_metrics,
    build_chrono_feature_frame,
    run_chrono_fragility,
)
from meta_alpha_allocator.research.regime_labels import Episode


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


def _synthetic_state_and_prices(periods: int = 420) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(42)
    dates = pd.date_range("2020-01-01", periods=periods, freq="B")
    common = rng.normal(0.0003, 0.007, size=periods)
    stress = np.zeros(periods)
    stress_start = max(int(periods * 0.48), 10)
    stress_len = min(45, max(periods - stress_start - 5, 5))
    stress[stress_start : stress_start + stress_len] = rng.normal(-0.004, 0.015, size=stress_len)
    regime_push = common + stress

    prices = pd.DataFrame(
        {
            "SPY": 100 * np.cumprod(1 + regime_push + rng.normal(0, 0.003, size=periods)),
            "QQQ": 120 * np.cumprod(1 + regime_push * 1.15 + rng.normal(0, 0.004, size=periods)),
            "IWM": 90 * np.cumprod(1 + regime_push * 0.95 + rng.normal(0, 0.005, size=periods)),
            "HYG": 80 * np.cumprod(1 + regime_push * 0.65 + rng.normal(0, 0.0035, size=periods)),
            "LQD": 100 * np.cumprod(1 + common * 0.35 + rng.normal(0, 0.002, size=periods)),
            "TLT": 110 * np.cumprod(1 - regime_push * 0.45 + rng.normal(0, 0.003, size=periods)),
            "IEF": 105 * np.cumprod(1 - regime_push * 0.25 + rng.normal(0, 0.0015, size=periods)),
            "SHY": 100 * np.cumprod(1 + rng.normal(0.00008, 0.0006, size=periods)),
            "GLD": 170 * np.cumprod(1 - regime_push * 0.15 + rng.normal(0, 0.004, size=periods)),
            "UUP": 25 * np.cumprod(1 - regime_push * 0.10 + rng.normal(0, 0.002, size=periods)),
            "EEM": 40 * np.cumprod(1 + regime_push * 1.05 + rng.normal(0, 0.0045, size=periods)),
            "EFA": 60 * np.cumprod(1 + regime_push * 0.9 + rng.normal(0, 0.004, size=periods)),
            "XLK": 90 * np.cumprod(1 + regime_push * 1.2 + rng.normal(0, 0.0045, size=periods)),
            "XLF": 35 * np.cumprod(1 + regime_push * 0.85 + rng.normal(0, 0.0038, size=periods)),
            "XLU": 55 * np.cumprod(1 + regime_push * 0.45 + rng.normal(0, 0.002, size=periods)),
        },
        index=dates,
    )

    rolling_spy = prices["SPY"].pct_change().rolling(20)
    state = pd.DataFrame(
        {
            "date": dates,
            "crash_prob": np.clip(0.25 + (-prices["SPY"].pct_change(10).fillna(0.0) * 8.0), 0.05, 0.95),
            "tension_pct": np.clip(rolling_spy.std().fillna(0.01) * 40.0, 0.05, 0.95),
            "memory_p_fail": np.clip(0.20 + (-prices["QQQ"].pct_change(20).fillna(0.0) * 6.0), 0.05, 0.95),
            "recurrence": np.clip((prices["SPY"].pct_change(60).fillna(0.0) < 0).astype(float) * 0.6 + 0.1, 0.05, 0.95),
            "asset__mean_corr_63_pct": np.clip(0.3 + pd.Series(common, index=dates).rolling(40).std().fillna(0.01) * 20.0, 0.05, 0.95),
            "M_fin_pct": np.clip(0.25 + pd.Series(stress, index=dates).abs().rolling(20).mean().fillna(0.0) * 40.0, 0.05, 0.95),
            "GFL_pct": np.clip(0.30 + (prices["TLT"].pct_change(20).fillna(0.0) * 3.0), 0.05, 0.95),
        }
    )
    return state, prices


def test_spectral_metrics_detect_concentration() -> None:
    rng = np.random.default_rng(10)
    factor = rng.normal(size=(80, 1))
    mostly_one_factor = np.hstack([factor, factor * 0.95 + rng.normal(scale=0.05, size=(80, 1)), rng.normal(scale=0.1, size=(80, 1))])

    metrics = _spectral_metrics(mostly_one_factor)

    assert 0.0 <= metrics["eig1_share"] <= 1.0
    assert metrics["eig1_share"] > 0.6
    assert 1.0 <= metrics["effective_dim"] <= mostly_one_factor.shape[1]


def test_build_chrono_feature_frame_contains_core_columns() -> None:
    state, prices = _synthetic_state_and_prices(periods=140)
    frame = build_chrono_feature_frame(
        state,
        prices,
        ResearchSettings(chrono_prediction_horizon_days=10),
    )

    expected_columns = {
        "date",
        "spy_ret_1d",
        "spy_ret_20d",
        "spy_vol_20d",
        "spy_dd_60d",
        "breadth_20d",
        "dispersion_20d",
        "mean_corr_20d",
        "effective_dim_60d",
        "crash_prob",
        "target_regime",
        "fwd_return",
    }
    assert expected_columns.issubset(frame.columns)
    assert frame["target_regime"].dropna().isin({"BEAR", "CHOP", "BULL"}).all()


def test_run_chrono_fragility_writes_outputs(tmp_path: Path, monkeypatch) -> None:
    state, prices = _synthetic_state_and_prices(periods=420)
    paths = _paths(tmp_path)
    settings = ResearchSettings(
        chrono_initial_train_days=120,
        chrono_prediction_horizon_days=10,
        chrono_embedding_window=30,
        chrono_hidden_sizes=(12, 6),
        chrono_output_dir=paths.output_root / "chrono_fragility" / "latest",
        start_date="2020-01-01",
    )

    monkeypatch.setattr("meta_alpha_allocator.research.chrono_fragility.FMPClient.from_env", lambda cache_root: None)
    monkeypatch.setattr("meta_alpha_allocator.research.chrono_fragility.load_state_panel", lambda _: state)
    monkeypatch.setattr(
        "meta_alpha_allocator.research.chrono_fragility.load_fmp_market_proxy_panel",
        lambda *args, **kwargs: prices,
    )
    monkeypatch.setattr(
        "meta_alpha_allocator.research.chrono_fragility.load_defense_price_panel",
        lambda *args, **kwargs: (prices[["SPY", "TLT", "IEF", "SHY", "GLD", "UUP", "HYG", "LQD"]], {}),
    )
    monkeypatch.setattr(
        "meta_alpha_allocator.research.chrono_fragility.load_episodes",
        lambda: [
            Episode(
                name="synthetic_stress",
                start=pd.Timestamp("2020-10-01"),
                end=pd.Timestamp("2020-11-16"),
                regime="crash",
                group="synthetic",
            )
        ],
    )

    artifacts = run_chrono_fragility(paths, settings)

    assert not artifacts.panel.empty
    assert {"chrono_fragility_score", "chrono_state", "confidence", "surprise"}.issubset(artifacts.panel.columns)
    assert artifacts.summary["sample"]["observations"] == len(artifacts.panel)
    assert artifacts.summary["predictive_metrics"]["accuracy"] >= 0.0
    assert artifacts.summary["latest"]["chrono_state"] in {"open", "transition", "compressed"}
    assert (settings.chrono_output_dir / "chrono_fragility_panel.csv").exists()
    assert (settings.chrono_output_dir / "chrono_fragility_event_study.csv").exists()
    assert (settings.chrono_output_dir / "chrono_fragility_summary.json").exists()
