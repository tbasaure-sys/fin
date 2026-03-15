from __future__ import annotations

import pandas as pd

from meta_alpha_allocator.utils import expanding_percentile, performance_summary, time_safe_join


def test_expanding_percentile_is_time_safe() -> None:
    series = pd.Series([1.0, 2.0, 3.0, 2.0], index=pd.date_range("2024-01-01", periods=4))
    result = expanding_percentile(series, min_periods=2)
    assert pd.isna(result.iloc[0])
    assert result.iloc[1] == 1.0
    assert result.iloc[2] == 1.0
    assert abs(result.iloc[3] - 0.625) < 1e-9


def test_time_safe_join_uses_last_available_row() -> None:
    left = pd.DataFrame(
        {
            "date": pd.to_datetime(["2024-01-02", "2024-01-03"]),
            "ticker": ["AAA", "AAA"],
            "value": [1, 2],
        }
    )
    right = pd.DataFrame(
        {
            "date": pd.to_datetime(["2024-01-01", "2024-01-04"]),
            "state": [10, 99],
        }
    )
    joined = time_safe_join(left, right, on="date")
    assert joined["state"].tolist() == [10, 10]


def test_performance_summary_reports_drawdown() -> None:
    returns = pd.Series([0.10, -0.20, 0.05])
    summary = performance_summary(returns)
    assert summary["total_return"] < 0.0
    assert summary["max_drawdown"] <= -0.19
