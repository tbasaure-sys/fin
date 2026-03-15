from __future__ import annotations

import numpy as np
import pandas as pd


def _rolling_beta(returns: pd.DataFrame, market_returns: pd.Series, window: int = 63) -> pd.DataFrame:
    market_var = market_returns.rolling(window).var().replace(0.0, np.nan)
    beta = returns.rolling(window).cov(market_returns).div(market_var, axis=0)
    return beta


def _rolling_signal_to_noise(frame: pd.DataFrame, short_window: int, long_window: int) -> pd.DataFrame:
    short_mean = frame.rolling(short_window).mean()
    long_vol = frame.rolling(long_window).std().replace(0.0, np.nan)
    return short_mean.div(long_vol)


def _expand_membership_snapshots(
    membership: pd.DataFrame,
    target_index: pd.DatetimeIndex,
    tickers: list[str],
) -> pd.DataFrame:
    snapshots = membership.copy()
    snapshots["date"] = pd.to_datetime(snapshots["date"])
    snapshots = snapshots.loc[snapshots["ticker"].isin(tickers)].copy()
    if snapshots.empty:
        return pd.DataFrame(0.0, index=target_index, columns=tickers)
    snapshots["active"] = 1.0
    membership_matrix = (
        snapshots.pivot_table(index="date", columns="ticker", values="active", aggfunc="max", fill_value=0.0)
        .reindex(columns=tickers, fill_value=0.0)
        .sort_index()
    )
    expanded_index = membership_matrix.index.union(target_index).sort_values()
    membership_matrix = membership_matrix.reindex(expanded_index).ffill().fillna(0.0)
    return membership_matrix.reindex(target_index).fillna(0.0)


def build_asset_feature_panel(
    prices: pd.DataFrame,
    membership: pd.DataFrame,
    priors: pd.DataFrame,
    dollar_volume: pd.DataFrame | None = None,
) -> pd.DataFrame:
    prices = prices.sort_index().ffill()
    returns = prices.pct_change()
    market_returns = returns.mean(axis=1, skipna=True)
    log_returns = np.log(prices / prices.shift(1))

    momentum_intermediate = prices.pct_change(252) - prices.pct_change(21)
    short_reversal = -prices.pct_change(5)
    beta = _rolling_beta(returns, market_returns, window=63)
    residual = log_returns.sub(beta.mul(market_returns, axis=0), fill_value=np.nan)
    residual_momentum = residual.rolling(126).sum() - residual.rolling(21).sum()
    idio_vol = residual.rolling(63).std()
    liquidity = None
    if dollar_volume is not None and not dollar_volume.empty:
        liquidity = np.log1p(dollar_volume).rolling(63).mean()
    fallback_liquidity = 1.0 / returns.rolling(21).std().replace(0.0, np.nan)
    if liquidity is None:
        liquidity = fallback_liquidity
    else:
        liquidity = liquidity.combine_first(fallback_liquidity)
    crowding = returns.rolling(63).corr(market_returns).abs()
    overextension = _rolling_signal_to_noise(returns, short_window=20, long_window=63)
    crowding_unwind = -(crowding.clip(lower=0.0) * overextension.clip(lower=0.0))
    defensive_momentum = (residual_momentum - crowding.clip(lower=0.0) * idio_vol.clip(lower=0.0)).replace([np.inf, -np.inf], np.nan)

    def _stack(frame: pd.DataFrame, value_name: str) -> pd.DataFrame:
        stacked = frame.stack().rename(value_name).reset_index()
        stacked.columns = ["date", "ticker", value_name]
        return stacked

    panel = _stack(momentum_intermediate, "momentum_intermediate")
    for name, frame in [
        ("residual_momentum", residual_momentum),
        ("short_reversal", short_reversal),
        ("beta_market", beta),
        ("idio_vol", idio_vol),
        ("liquidity", liquidity),
        ("crowding", crowding),
        ("crowding_unwind", crowding_unwind),
        ("defensive_momentum", defensive_momentum),
        ("close", prices),
        ("ret_1d", returns),
    ]:
        panel = panel.merge(_stack(frame, name), on=["date", "ticker"], how="left")

    membership_matrix = _expand_membership_snapshots(membership, prices.index, list(prices.columns))
    membership_panel = _stack(membership_matrix, "universe_member")
    membership_panel["universe_member"] = membership_panel["universe_member"].fillna(0.0) > 0.0
    panel = panel.merge(membership_panel, on=["date", "ticker"], how="left")
    panel["universe_member"] = panel["universe_member"].fillna(False)
    panel = panel.loc[panel["universe_member"]].copy()

    priors_reset = priors.reset_index()
    panel = panel.merge(priors_reset, on="ticker", how="left")
    panel["sector"] = panel["sector"].fillna("Unknown")
    panel["industry"] = panel["industry"].fillna("Unknown")
    panel["quality"] = panel["quality"].fillna(1.0 - panel.groupby("date")["idio_vol"].rank(pct=True))
    panel["value"] = panel["value"].combine_first(panel["valuation_gap"])
    panel["value"] = panel["value"].fillna(panel.groupby("date")["value"].transform("median")).fillna(0.0)
    panel["residual_momentum"] = panel["residual_momentum"].fillna(panel["defensive_momentum"])
    panel["residual_momentum"] = panel["residual_momentum"].fillna(panel.groupby("date")["residual_momentum"].transform("median"))
    panel["momentum_intermediate"] = panel["momentum_intermediate"].fillna(panel.groupby("date")["momentum_intermediate"].transform("median"))
    panel["short_reversal"] = panel["short_reversal"].fillna(panel.groupby("date")["short_reversal"].transform("median"))
    panel["liquidity"] = panel["liquidity"].fillna(panel.groupby("date")["liquidity"].transform("median"))
    panel["beta"] = panel["beta_market"].combine_first(panel.get("beta"))
    panel["beta"] = panel["beta"].fillna(panel.groupby("date")["beta"].transform("median"))
    panel["idio_vol"] = panel["idio_vol"].fillna(panel.groupby("date")["idio_vol"].transform("median"))
    panel["crowding"] = panel["crowding"].fillna(panel.groupby("date")["crowding"].transform("median"))
    panel["crowding_unwind"] = panel["crowding_unwind"].fillna(panel.groupby("date")["crowding_unwind"].transform("median"))

    return panel.sort_values(["date", "ticker"]).reset_index(drop=True)
