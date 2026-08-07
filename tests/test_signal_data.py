import pandas as pd
import pytest

from meta_alpha_allocator.data.fmp_client import FMPClient
from meta_alpha_allocator.signal_intelligence.data import coverage_pct, normalize_eod_bars


def test_normalize_eod_bars_applies_split_adjustment_to_all_price_fields():
    rows = [
        {"date": "2024-01-02", "open": 100, "high": 110, "low": 95, "close": 100, "adjClose": 50, "volume": 1000},
        {"date": "2024-01-03", "open": 52, "high": 55, "low": 49, "close": 50, "adjClose": 50, "volume": 1200},
    ]

    frame = normalize_eod_bars(rows, asset_key="TEST", asset_class="equity")

    assert frame.loc[0, "open"] == 50
    assert frame.loc[0, "high"] == 55
    assert frame.loc[0, "low"] == 47.5
    assert frame.loc[0, "close"] == 50
    assert frame.loc[0, "raw_close"] == 100
    assert frame.loc[0, "volume"] == 1000


def test_normalize_eod_bars_rejects_duplicate_dates_and_keeps_missing_volume_nullable():
    rows = [
        {"date": "2024-01-02", "open": 1, "high": 2, "low": 0.5, "close": 1.5},
        {"date": "2024-01-02", "open": 1, "high": 2, "low": 0.5, "close": 1.5},
    ]

    with pytest.raises(ValueError, match="duplicate dates"):
        normalize_eod_bars(rows, asset_key="EUR/USD", asset_class="fx")


def test_coverage_pct_uses_expected_sessions_not_calendar_days():
    frame = pd.DataFrame({"date": pd.to_datetime(["2024-01-02", "2024-01-03", "2024-01-05"])})
    expected = pd.date_range("2024-01-02", "2024-01-05", freq="B")

    assert coverage_pct(frame, expected) == pytest.approx(0.75)


def test_fmp_client_exposes_raw_ohlc_for_signal_engine(monkeypatch, tmp_path):
    client = FMPClient(api_key="test", cache_root=tmp_path, pause_seconds=0)
    monkeypatch.setattr(
        client,
        "_get_response_json",
        lambda _base, _endpoint, _params: [
            {"date": "2024-01-02", "open": 1, "high": 2, "low": 0.5, "close": 1.5, "adjClose": 1.4, "volume": 10}
        ],
    )

    frame = client.get_historical_eod_bars("TEST", start_date="2024-01-01", end_date="2024-01-03")

    assert list(frame.columns) == ["date", "open", "high", "low", "close", "adjClose", "volume"]
    assert frame.iloc[0]["high"] == 2
