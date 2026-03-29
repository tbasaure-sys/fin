from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from meta_alpha_allocator.research import phantom_diversification as pdx


def _synthetic_price_panel() -> pd.DataFrame:
    rng = np.random.default_rng(42)
    index = pd.date_range("2024-01-02", periods=280, freq="B")
    covariance = np.array(
        [
            [0.00022, 0.00016, 0.00006],
            [0.00016, 0.00025, 0.00005],
            [0.00006, 0.00005, 0.00018],
        ],
        dtype=float,
    )
    drift = np.array([0.0004, 0.00035, 0.00028], dtype=float)
    returns = rng.multivariate_normal(drift, covariance, size=len(index))
    prices = 100 * np.exp(np.cumsum(returns, axis=0))
    return pd.DataFrame(prices, index=index, columns=["AAPL", "MSFT", "XOM"])


def test_current_window_metrics_respects_paper_formula() -> None:
    panel = _synthetic_price_panel()
    returns = np.log(panel / panel.shift(1)).dropna()
    weights = np.array([0.4, 0.35, 0.25], dtype=float)

    metrics = pdx._current_window_metrics(returns.iloc[-pdx.WINDOW_DAYS :], weights)

    assert metrics["raw_breadth"] > 1.0
    assert metrics["real_breadth"] == pytest.approx(metrics["raw_breadth"] * metrics["correction_factor"], rel=1e-6)
    assert metrics["phantom_breadth"] == pytest.approx(metrics["raw_breadth"] - metrics["real_breadth"], rel=1e-6)
    assert metrics["phantom_share"] == pytest.approx(1.0 - metrics["correction_factor"], rel=1e-6)


def test_analyze_portfolio_returns_expected_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    panel = _synthetic_price_panel()

    def fake_load_price_panel(tickers: list[str], paths: object) -> tuple[pd.DataFrame, list[str], list[str], list[str]]:
        return panel.reindex(columns=tickers), tickers, [], ["synthetic"]

    monkeypatch.setattr(pdx, "_load_price_panel", fake_load_price_panel)

    payload = pdx.analyze_portfolio(
        [
            {"ticker": "AAPL", "weight": 45},
            {"ticker": "MSFT", "weight": 35},
            {"ticker": "XOM", "weight": 20},
        ],
        workspace_id="workspace-test",
    )

    assert payload["workspace_id"] == "workspace-test"
    assert payload["current"]["holdings_count"] == 3
    assert payload["current"]["raw_breadth"] >= payload["current"]["real_breadth"]
    assert payload["diagnostics"]["source_labels"] == ["synthetic"]
    assert len(payload["series"]) >= 100
    assert len(payload["contributors"]) == 3


def test_analyze_portfolio_rejects_unsupported_tickers(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_load_price_panel(tickers: list[str], paths: object) -> tuple[pd.DataFrame, list[str], list[str], list[str]]:
        return pd.DataFrame(), [], ["FAKE"], ["synthetic"]

    monkeypatch.setattr(pdx, "_load_price_panel", fake_load_price_panel)

    with pytest.raises(pdx.PhantomDiversificationError, match="Unsupported tickers"):
        pdx.analyze_portfolio(
            [
                {"ticker": "AAPL", "weight": 50},
                {"ticker": "MSFT", "weight": 25},
                {"ticker": "FAKE", "weight": 25},
            ]
        )


def test_contributor_role_labels_cover_all_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    holdings = [
        pdx.PortfolioHolding("AAPL", 0.4),
        pdx.PortfolioHolding("MSFT", 0.35),
        pdx.PortfolioHolding("XOM", 0.25),
    ]
    current = {"raw_breadth": 3.0, "real_breadth": 2.0, "phantom_breadth": 1.0}
    outcomes = iter(
        [
            {"raw_breadth": 2.0, "real_breadth": 1.5, "phantom_breadth": 0.5},
            {"raw_breadth": 2.4, "real_breadth": 2.0, "phantom_breadth": 0.4},
            {"raw_breadth": 3.2, "real_breadth": 2.3, "phantom_breadth": 0.9},
        ]
    )

    def fake_series_metrics(price_panel: pd.DataFrame, reduced_holdings: list[pdx.PortfolioHolding]) -> tuple[list[dict[str, float]], dict[str, float]]:
        return [], next(outcomes)

    monkeypatch.setattr(pdx, "_series_metrics", fake_series_metrics)

    rows = pdx._contributor_rows(pd.DataFrame(), holdings, current)
    role_map = {row["ticker"]: row["role"] for row in rows}

    assert set(role_map.values()) == {"real diversifier", "phantom diversifier", "crowding source"}
