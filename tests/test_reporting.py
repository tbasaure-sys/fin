from __future__ import annotations

import numpy as np
import pandas as pd

from meta_alpha_allocator.config import ResearchSettings
from meta_alpha_allocator.production.reporting import (
    TREASURY_HEDGES,
    build_hedge_ranking,
    build_overlay_report,
    build_sector_opportunity_map,
)


def _proxy_prices() -> pd.DataFrame:
    dates = pd.date_range("2025-01-01", periods=90, freq="B")
    spy = pd.Series(np.linspace(100, 92, len(dates)), index=dates)
    prices = pd.DataFrame(
        {
            "SPY": spy,
            "XLK": np.linspace(100, 111, len(dates)),
            "XLU": np.linspace(100, 104, len(dates)),
            "XLF": np.linspace(100, 107, len(dates)),
            "EFA": np.linspace(100, 106, len(dates)),
            "EEM": np.linspace(100, 103, len(dates)),
            "VGK": np.linspace(100, 108, len(dates)),
            "IEF": np.linspace(100, 109, len(dates)),
            "TLT": np.linspace(100, 112, len(dates)),
            "SHY": np.linspace(100, 102, len(dates)),
            "BIL": np.linspace(100, 101, len(dates)),
            "GLD": np.linspace(100, 107, len(dates)),
            "UUP": np.linspace(100, 103, len(dates)),
        },
        index=dates,
    )
    return prices


def _latest_scored(date: str = "2025-05-06") -> pd.DataFrame:
    return pd.DataFrame(
        {
            "date": [pd.Timestamp(date)] * 6,
            "ticker": ["A", "B", "C", "D", "E", "F"],
            "sector": ["Technology", "Technology", "Utilities", "Utilities", "Financial", "Financial"],
            "selection_score": [0.9, 0.7, 0.4, 0.2, 0.3, 0.1],
            "selection_rank": [0.99, 0.85, 0.70, 0.45, 0.35, 0.10],
            "quality": [0.8, 0.7, 0.6, 0.65, 0.45, 0.35],
            "residual_momentum": [1.2, 1.0, 0.4, 0.3, 0.2, 0.1],
            "crowding": [0.35, 0.40, 0.20, 0.18, 0.50, 0.55],
        }
    )


def test_build_sector_opportunity_map_prefers_stronger_sector() -> None:
    settings = ResearchSettings()
    latest_state = pd.Series({"tail_risk_score": 0.35, "crash_prob": 0.35})
    sector_map = build_sector_opportunity_map(_latest_scored(), _proxy_prices(), pd.Timestamp("2025-05-06"), latest_state, settings)
    assert not sector_map.empty
    assert sector_map.iloc[0]["sector"] == "Technology"
    assert {"opportunity_score", "signal_score", "defense_fit"}.issubset(sector_map.columns)


def test_build_hedge_ranking_can_prefer_treasuries() -> None:
    settings = ResearchSettings()
    latest_state = pd.Series({"tail_risk_score": 0.85, "crash_prob": 0.80})
    ranking = build_hedge_ranking(_proxy_prices(), pd.Timestamp("2025-05-06"), latest_state, settings)
    assert not ranking.empty
    assert ranking.iloc[0]["ticker"] in TREASURY_HEDGES
    assert bool(ranking.iloc[0]["is_treasury"])


def test_build_overlay_report_returns_summary_and_maps() -> None:
    settings = ResearchSettings()
    latest_state = pd.Series({"tail_risk_score": 0.75, "crash_prob": 0.70, "legitimacy_risk": 0.65, "regime": "DEFENSIVE"})
    report = build_overlay_report(
        latest_state=latest_state,
        latest_scored=_latest_scored(),
        proxy_prices=_proxy_prices(),
        as_of_date=pd.Timestamp("2025-05-06"),
        settings=settings,
        decision_payload={"core_beta_weight": 0.45, "defense_weight": 0.35, "selection_weight": 0.20, "risk_mode": "defensive"},
        selection_diagnostics={"selection_strength": 0.7, "breadth": 0.6, "top_spread": 0.4, "coverage": 0.9},
        tail_risk_latest={"tail_risk_score": 0.75},
    )
    assert report.overview["hedge_summary"]["primary_hedge"] is not None
    assert not report.sector_map.empty
    assert not report.hedge_ranking.empty
