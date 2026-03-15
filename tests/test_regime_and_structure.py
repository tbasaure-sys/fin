from __future__ import annotations

import numpy as np
import pandas as pd

from meta_alpha_allocator.research.market_structure import build_market_structure_features
from meta_alpha_allocator.research.regime_labels import build_daily_regime_frame, summarize_performance_by_regime


def test_build_daily_regime_frame_marks_covid_episode() -> None:
    dates = pd.date_range("2020-02-15", periods=10, freq="D")
    frame = build_daily_regime_frame(dates)
    assert "2020_covid" in set(frame["episode_name"].dropna())
    assert "crash" in set(frame["regime_label"].dropna())


def test_summarize_performance_by_regime_returns_rows() -> None:
    dates = pd.date_range("2020-02-15", periods=30, freq="B")
    returns = pd.Series(np.linspace(-0.02, 0.02, len(dates)), index=dates)
    summary = summarize_performance_by_regime(returns, build_daily_regime_frame(dates))
    assert summary
    assert any(row["regime"] in {"crash", "normal"} for row in summary)


def test_market_structure_features_include_core_columns() -> None:
    dates = pd.date_range("2023-01-01", periods=180, freq="B")
    rng = np.random.default_rng(7)
    prices = pd.DataFrame(
        {
            "SPY": 100 + np.cumsum(rng.normal(0.1, 1.0, len(dates))),
            "QQQ": 120 + np.cumsum(rng.normal(0.12, 1.1, len(dates))),
            "IWM": 90 + np.cumsum(rng.normal(0.08, 1.2, len(dates))),
            "XLK": 80 + np.cumsum(rng.normal(0.09, 1.0, len(dates))),
        },
        index=dates,
    ).abs()
    features = build_market_structure_features(prices)
    latest = features.iloc[-1]
    for column in [
        "avg_pair_corr_60d",
        "pct_positive_20d",
        "advance_decline_ratio",
        "momentum_concentration_60d",
        "realized_cross_sectional_vol",
    ]:
        assert column in features.columns
        assert pd.notna(latest[column])
