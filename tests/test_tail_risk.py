from __future__ import annotations

import numpy as np
import pandas as pd

from meta_alpha_allocator.research.tail_risk import _fit_horizon_model, _market_feature_frame


def test_fit_horizon_model_returns_probability_vector() -> None:
    features = pd.DataFrame(
        {
            "date": pd.date_range("2024-01-01", periods=30, freq="B"),
            "x1": [i / 100 for i in range(30)],
            "x2": [(-1) ** i * 0.1 for i in range(30)],
            "regime": ["RISK_ON"] * 30,
        }
    )
    labels = pd.Series(([0] * 15) + ([1] * 15), dtype=float)
    probs, stats = _fit_horizon_model(features, labels)
    assert len(probs) == len(features)
    assert 0.0 <= min(probs) <= max(probs) <= 1.0
    assert "event_rate" in stats


def test_market_feature_frame_includes_macro_leads_and_structure() -> None:
    dates = pd.date_range("2023-01-01", periods=220, freq="B")
    prices = pd.DataFrame(
        {
            "SPY": 100 + np.linspace(0, 20, len(dates)),
            "GLD": 180 + np.linspace(0, 18, len(dates)),
            "UUP": 100 + np.linspace(0, 6, len(dates)),
            "DBC": 25 + np.linspace(0, 8, len(dates)),
            "HYG": 80 + np.linspace(0, 4, len(dates)),
            "LQD": 100 + np.linspace(0, 2, len(dates)),
            "TLT": 110 + np.linspace(0, 3, len(dates)),
            "IEF": 100 + np.linspace(0, 2, len(dates)),
            "XLK": 150 + np.linspace(0, 25, len(dates)),
            "XLU": 60 + np.linspace(0, 5, len(dates)),
        },
        index=dates,
    )
    state = pd.DataFrame({"date": dates, "crash_prob": 0.5, "tension_pct": 0.5, "memory_p_fail": 0.5, "recurrence": 0.5, "crowding_pct": 0.5, "regime": "NEUTRAL", "legitimacy_risk": 0.5})
    fred = pd.DataFrame(
        {
            "date": dates,
            "DCOILWTICO": 70 + np.linspace(0, 10, len(dates)),
            "DTWEXBGS": 120 + np.linspace(0, 5, len(dates)),
        }
    )
    features = _market_feature_frame(prices, state, fred_panel=fred)
    latest = features.iloc[-1]
    for column in ["avg_pair_corr_60d", "gold_return_3m", "dollar_return_3m", "oil_return_3m", "gold_commodity_ratio"]:
        assert column in features.columns
        assert pd.notna(latest[column])
