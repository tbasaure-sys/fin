from __future__ import annotations

import pandas as pd

from meta_alpha_allocator.research.features import build_asset_feature_panel


def test_feature_builder_falls_back_without_volume_or_priors() -> None:
    dates = pd.date_range("2024-01-01", periods=300, freq="B")
    prices = pd.DataFrame(
        {
            "AAA": range(100, 400),
            "BBB": range(50, 350),
        },
        index=dates,
        dtype=float,
    )
    membership = pd.DataFrame(
        {
            "date": list(dates) * 2,
            "ticker": ["AAA"] * len(dates) + ["BBB"] * len(dates),
        }
    )
    priors = pd.DataFrame(columns=["sector", "industry", "quality", "value", "risk", "growth", "momentum_6m", "beta", "valuation_gap"])
    priors.index.name = "ticker"
    panel = build_asset_feature_panel(prices, membership, priors, dollar_volume=pd.DataFrame())
    latest = panel.loc[panel["date"] == panel["date"].max()]
    assert latest["liquidity"].notna().all()
    assert latest["quality"].notna().all()
    assert latest["residual_momentum"].notna().all()
    assert latest["crowding_unwind"].notna().all()
    assert set(latest["sector"]) == {"Unknown"}


def test_feature_builder_expands_sparse_membership_snapshots() -> None:
    dates = pd.date_range("2024-01-01", periods=300, freq="B")
    prices = pd.DataFrame(
        {
            "AAA": range(100, 400),
            "BBB": range(50, 350),
        },
        index=dates,
        dtype=float,
    )
    membership = pd.DataFrame(
        {
            "date": [dates[0], dates[120], dates[-1], dates[0], dates[120], dates[-1]],
            "ticker": ["AAA", "AAA", "AAA", "BBB", "BBB", "BBB"],
        }
    )
    priors = pd.DataFrame(columns=["sector", "industry", "quality", "value", "risk", "growth", "momentum_6m", "beta", "valuation_gap"])
    priors.index.name = "ticker"
    panel = build_asset_feature_panel(prices, membership, priors, dollar_volume=pd.DataFrame())
    latest = panel.loc[panel["date"] == panel["date"].max()]
    assert set(latest["ticker"]) == {"AAA", "BBB"}
