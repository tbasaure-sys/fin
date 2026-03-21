from __future__ import annotations

import warnings
from pathlib import Path

import pandas as pd

from meta_alpha_allocator.chile.desk import (
    _annual_vol,
    _build_from_market_data,
    _corr_to_benchmark,
    build_chile_market_snapshot,
)
from meta_alpha_allocator.config import PathConfig


def _paths(tmp_path: Path) -> PathConfig:
    return PathConfig(
        project_root=tmp_path,
        artifact_root=tmp_path / "artifacts",
        output_root=tmp_path / "output",
    )


def test_build_chile_market_snapshot_skips_network_on_cache_free_startup(tmp_path: Path, monkeypatch) -> None:
    paths = _paths(tmp_path)

    def _unexpected_fetch(*args, **kwargs):  # pragma: no cover - should never run
        raise AssertionError("startup should not fetch Chile desk data without a cache")

    monkeypatch.setattr("meta_alpha_allocator.chile.desk._fetch_price_panel", _unexpected_fetch)
    monkeypatch.setattr("meta_alpha_allocator.chile.desk._fetch_fundamentals", _unexpected_fetch)
    monkeypatch.setattr("meta_alpha_allocator.chile.desk._fetch_cmf_txt", _unexpected_fetch)

    snapshot = build_chile_market_snapshot(paths, refresh=False)

    assert snapshot["source"] == "deferred"
    assert "background refresh" in snapshot["headline"].lower()
    assert snapshot["rows"] == []
    assert snapshot["warnings"] == []


def test_chile_metric_helpers_do_not_emit_future_warnings() -> None:
    series = pd.Series([100.0, None, 102.0, 104.0, 103.0, 106.0])
    benchmark = pd.Series([200.0, 201.0, None, 203.0, 202.0, 205.0])

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", FutureWarning)
        _annual_vol(series, lookback=3)
        _corr_to_benchmark(series, benchmark, lookback=3)

    future_warnings = [warning for warning in caught if issubclass(warning.category, FutureWarning)]
    assert future_warnings == []


def test_build_from_market_data_blends_numeric_filing_fields_without_future_warnings() -> None:
    dates = pd.date_range("2025-01-01", periods=90, freq="B")
    prices = pd.DataFrame(
        {
            "AAA.SN": pd.Series(range(90), index=dates, dtype=float) + 100.0,
            "^IPSA": pd.Series(range(90), index=dates, dtype=float) + 5000.0,
            "CLP=X": pd.Series(range(90), index=dates, dtype=float) * 0.1 + 950.0,
        }
    )
    universe = pd.DataFrame(
        [
            {
                "ticker": "AAA.SN",
                "name": "AAA",
                "sector": "Utilities",
                "theme": "Yield",
            }
        ]
    )
    fundamentals = pd.DataFrame(
        [
            {
                "ticker": "AAA.SN",
                "market_cap": 1_000_000,
                "trailing_pe": 12.0,
                "price_to_book": 1.4,
                "enterprise_to_ebitda": 7.0,
                "roe": 0.12,
                "sector_live": "Utilities",
            }
        ]
    )
    cmf_fundamentals = pd.DataFrame(
        [
            {
                "ticker": "AAA.SN",
                "cmf_cash": 50.0,
                "cmf_revenue": 200.0,
                "cmf_net_income": 20.0,
                "cmf_equity": 100.0,
                "cmf_liabilities": 60.0,
                "cmf_margin": 0.10,
                "cmf_leverage": 0.60,
                "cmf_cash_buffer": 0.83,
            }
        ]
    )
    xbrl_fundamentals = pd.DataFrame(
        [
            {
                "ticker": "AAA.SN",
                "xbrl_cash": None,
                "xbrl_revenue": 210.0,
                "xbrl_net_income": 19.0,
                "xbrl_equity": 102.0,
                "xbrl_liabilities": 61.0,
                "xbrl_margin": None,
                "xbrl_leverage": None,
                "xbrl_cash_buffer": None,
            }
        ]
    )

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", FutureWarning)
        snapshot = _build_from_market_data(
            universe,
            prices,
            fundamentals,
            cmf_fundamentals,
            "202412",
            xbrl_fundamentals,
        )

    future_warnings = [warning for warning in caught if issubclass(warning.category, FutureWarning)]
    assert future_warnings == []
    assert snapshot["source"] == "yahoo_finance + xbrl + cmf_ifrs_txt"
    assert snapshot["rows"][0]["ticker"] == "AAA.SN"
