from __future__ import annotations

import pandas as pd


def build_forward_return_labels(
    prices: pd.DataFrame,
    horizon_days: int,
    benchmark_ticker: str = "SPY",
) -> pd.DataFrame:
    labels = prices.pct_change(horizon_days).shift(-horizon_days)
    stacked = labels.stack().rename("fwd_return").reset_index()
    stacked.columns = ["date", "ticker", "fwd_return"]

    if benchmark_ticker in prices.columns:
        benchmark = prices[benchmark_ticker].pct_change(horizon_days).shift(-horizon_days).rename("fwd_benchmark_return")
        stacked = stacked.merge(benchmark.reset_index(), on="date", how="left")
        stacked["fwd_excess_return"] = stacked["fwd_return"] - stacked["fwd_benchmark_return"]
    else:
        stacked["fwd_benchmark_return"] = 0.0
        stacked["fwd_excess_return"] = stacked["fwd_return"]

    return stacked.sort_values(["date", "ticker"]).reset_index(drop=True)
