from __future__ import annotations

import numpy as np
import pandas as pd


def _average_pairwise_correlation(window: pd.DataFrame) -> tuple[float, float]:
    clean = window.dropna(axis=1, how="any")
    if clean.shape[1] < 2:
        return np.nan, np.nan
    corr = clean.corr().to_numpy()
    upper = corr[np.triu_indices_from(corr, k=1)]
    upper = upper[np.isfinite(upper)]
    if len(upper) == 0:
        return np.nan, np.nan
    return float(upper.mean()), float(np.quantile(upper, 0.9))


def build_market_structure_features(
    prices: pd.DataFrame,
    *,
    correlation_window: int = 60,
    momentum_window: int = 60,
) -> pd.DataFrame:
    clean_prices = prices.sort_index().ffill().dropna(how="all")
    returns = clean_prices.pct_change()
    features = pd.DataFrame(index=clean_prices.index)

    daily_dispersion = returns.std(axis=1)
    features["return_dispersion_1d"] = daily_dispersion
    features["return_dispersion_20d"] = daily_dispersion.rolling(20, min_periods=10).mean()
    features["return_mean_1d"] = returns.mean(axis=1)
    features["return_median_1d"] = returns.median(axis=1)
    features["return_skew_1d"] = returns.skew(axis=1)

    advancers = (returns > 0).sum(axis=1)
    decliners = (returns <= 0).sum(axis=1)
    features["pct_positive_1d"] = (returns > 0).mean(axis=1)
    features["pct_positive_5d"] = (returns.rolling(5).mean() > 0).mean(axis=1)
    features["pct_positive_20d"] = (returns.rolling(20).mean() > 0).mean(axis=1)
    features["pct_up_strong_1d"] = (returns > 0.02).mean(axis=1)
    features["pct_down_strong_1d"] = (returns < -0.02).mean(axis=1)
    features["advance_decline_ratio"] = advancers / decliners.replace(0, np.nan)

    momentum = clean_prices.pct_change(momentum_window)
    momentum_median = momentum.median(axis=1)
    momentum_std = momentum.std(axis=1)
    top_decile = momentum.quantile(0.9, axis=1)
    bottom_decile = momentum.quantile(0.1, axis=1)
    features["momentum_median_60d"] = momentum_median
    features["momentum_std_60d"] = momentum_std
    features["momentum_top_decile_60d"] = top_decile
    features["momentum_bottom_decile_60d"] = bottom_decile
    features["momentum_concentration_60d"] = (top_decile - momentum_median) / (momentum_std + 1e-6)

    pairwise_rows: list[dict[str, float | pd.Timestamp]] = []
    for date in clean_prices.index:
        window = returns.loc[:date].tail(correlation_window)
        avg_corr, corr_90 = _average_pairwise_correlation(window)
        pairwise_rows.append({"date": date, "avg_pair_corr_60d": avg_corr, "corr_90th_pct_60d": corr_90})
    pairwise = pd.DataFrame(pairwise_rows).set_index("date")
    features = features.join(pairwise, how="left")

    features["realized_cross_sectional_vol"] = daily_dispersion.rolling(20, min_periods=10).mean() * np.sqrt(252.0)
    features["low_dispersion_flag"] = (
        features["return_dispersion_20d"] < features["return_dispersion_20d"].rolling(120, min_periods=40).quantile(0.25)
    ).astype(float)
    features["high_correlation_flag"] = (
        features["avg_pair_corr_60d"] > features["avg_pair_corr_60d"].rolling(120, min_periods=40).quantile(0.75)
    ).astype(float)
    features["narrow_breadth_flag"] = (features["pct_positive_20d"] < 0.40).astype(float)
    features["broad_selloff_flag"] = (features["pct_down_strong_1d"] > 0.30).astype(float)
    features["high_momentum_concentration_flag"] = (
        features["momentum_concentration_60d"] > features["momentum_concentration_60d"].rolling(120, min_periods=40).quantile(0.80)
    ).astype(float)

    return features.reset_index(names="date")
