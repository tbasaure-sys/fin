from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..config import PathConfig, ResearchSettings
from ..storage.runtime_store import has_runtime_frame, save_runtime_frame
from ..utils import expanding_percentile, to_datetime_index
from .fmp_client import FMPClient


def _yahoo_symbol(symbol: str) -> str:
    return str(symbol or "").strip().replace(".", "-")


def _safe_business_range(start_date: str, end_date: str | None) -> pd.DatetimeIndex:
    start = pd.to_datetime(start_date)
    end = pd.to_datetime(end_date) if end_date else pd.Timestamp.today().normalize()
    return pd.date_range(start=start, end=end, freq="B")


def _fetch_current_sp500_membership(start_date: str) -> pd.DataFrame:
    sources = [
        "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
    ]
    start = pd.to_datetime(start_date).normalize()
    for source in sources:
        try:
            tables = pd.read_html(source)
        except Exception:
            continue
        for table in tables:
            columns = {str(column).strip().lower(): column for column in table.columns}
            symbol_col = columns.get("symbol")
            security_col = columns.get("security")
            sector_col = columns.get("gics sector") or columns.get("sector")
            industry_col = columns.get("gics sub-industry") or columns.get("industry")
            if not symbol_col:
                continue
            membership = pd.DataFrame({
                "date": start,
                "ticker": table[symbol_col].astype(str).str.replace(".", "-", regex=False),
                "security": table[security_col].astype(str) if security_col else "",
                "sector": table[sector_col].astype(str) if sector_col else "Unknown",
                "industry": table[industry_col].astype(str) if industry_col else "Unknown",
            })
            membership = membership.dropna(subset=["ticker"])
            membership = membership.loc[membership["ticker"].str.len() > 0].drop_duplicates(["date", "ticker"])
            if not membership.empty:
                return membership
    return pd.DataFrame(columns=["date", "ticker", "security", "sector", "industry"])


def _download_yfinance_panel(tickers: list[str], start_date: str, end_date: str | None) -> tuple[pd.DataFrame, pd.DataFrame]:
    if not tickers:
        return pd.DataFrame(), pd.DataFrame()
    try:
        import yfinance as yf
    except Exception:
        return pd.DataFrame(), pd.DataFrame()

    close_frames: list[pd.DataFrame] = []
    volume_frames: list[pd.DataFrame] = []
    unique = list(dict.fromkeys(_yahoo_symbol(ticker) for ticker in tickers if ticker))
    for offset in range(0, len(unique), 80):
        chunk = unique[offset: offset + 80]
        if not chunk:
            continue
        try:
            download = yf.download(
                chunk,
                start=start_date,
                end=end_date,
                auto_adjust=True,
                progress=False,
                group_by="ticker",
                threads=True,
            )
        except Exception:
            continue
        if download.empty:
            continue
        if isinstance(download.columns, pd.MultiIndex):
            close = download.xs("Close", axis=1, level=1, drop_level=False)
            volume = download.xs("Volume", axis=1, level=1, drop_level=False)
            close.columns = [column[0] for column in close.columns]
            volume.columns = [column[0] for column in volume.columns]
        else:
            close = download[["Close"]].rename(columns={"Close": chunk[0]})
            volume = download[["Volume"]].rename(columns={"Volume": chunk[0]})
        close.index = pd.to_datetime(close.index)
        volume.index = pd.to_datetime(volume.index)
        close_frames.append(close)
        volume_frames.append(volume)

    if not close_frames:
        return pd.DataFrame(), pd.DataFrame()

    close_panel = pd.concat(close_frames, axis=1).sort_index()
    close_panel = close_panel.loc[:, ~close_panel.columns.duplicated()].ffill().dropna(how="all")
    volume_panel = pd.concat(volume_frames, axis=1).sort_index()
    volume_panel = volume_panel.loc[:, ~volume_panel.columns.duplicated()].ffill().dropna(how="all")
    return close_panel, volume_panel


def _build_state_panel_from_prices(prices: pd.DataFrame) -> pd.DataFrame:
    prices = to_datetime_index(prices).sort_index().ffill().dropna(how="all")
    if prices.empty:
        return pd.DataFrame()
    benchmark = prices["SPY"] if "SPY" in prices.columns else prices.mean(axis=1, skipna=True)
    benchmark = benchmark.dropna()
    if benchmark.empty:
        return pd.DataFrame()
    returns = benchmark.pct_change().fillna(0.0)
    drawdown = (benchmark / benchmark.cummax() - 1.0).fillna(0.0)
    market_returns = prices.pct_change()
    sign_alignment = market_returns.fillna(0.0).apply(lambda column: np.sign(column)).eq(np.sign(returns), axis=0)
    crowding_raw = sign_alignment.mean(axis=1).rolling(20).mean().fillna(0.5)
    vol20 = returns.rolling(20).std().fillna(returns.std())
    tension_pct = expanding_percentile(vol20, min_periods=20).fillna(0.5)
    memory_p_fail = (-drawdown).clip(lower=0.0, upper=1.0)
    recurrence = returns.lt(0).rolling(20).mean().fillna(0.5)
    crowding_pct = crowding_raw.clip(lower=0.0, upper=1.0)
    crash_prob = pd.concat([tension_pct, memory_p_fail, crowding_pct], axis=1).mean(axis=1).clip(0.0, 1.0)
    legitimacy_risk = (
        0.45 * crash_prob
        + 0.20 * crowding_pct
        + 0.20 * recurrence
        + 0.15 * memory_p_fail
    ).clip(0.0, 1.0)

    def _regime(value: float) -> str:
        if value >= 0.80:
            return "CRISIS"
        if value >= 0.65:
            return "DEFENSIVE"
        if value >= 0.45:
            return "NEUTRAL"
        return "RISK_ON"

    state = pd.DataFrame({
        "date": pd.to_datetime(benchmark.index),
        "crash_prob": crash_prob.values,
        "tension_pct": tension_pct.values,
        "memory_p_fail": memory_p_fail.reindex(benchmark.index).fillna(0.5).values,
        "recurrence": recurrence.reindex(benchmark.index).fillna(0.5).values,
        "crowding_pct": crowding_pct.reindex(benchmark.index).fillna(0.5).values,
        "legitimacy_risk": legitimacy_risk.values,
    })
    state["regime"] = state["legitimacy_risk"].map(_regime)
    return state


def _build_portfolio_prior_frames(prices: pd.DataFrame, membership: pd.DataFrame, fmp_client: FMPClient | None) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    prices = to_datetime_index(prices).sort_index().ffill().dropna(how="all")
    tickers = [ticker for ticker in prices.columns if ticker and ticker != "SPY"]
    if not tickers:
        empty_holdings = pd.DataFrame(columns=["ticker", "sector", "industry"])
        empty_screener = pd.DataFrame(columns=["ticker", "quality_score", "value_score", "risk_score", "growth_score", "composite_score", "momentum_6m", "sector", "industry", "beta"])
        empty_valuation = pd.DataFrame(columns=["ticker", "upside"])
        return empty_valuation, empty_screener, empty_holdings

    latest_prices = prices[tickers]
    returns = latest_prices.pct_change()
    momentum_6m = latest_prices.pct_change(126).iloc[-1].replace([np.inf, -np.inf], np.nan).fillna(0.0)
    volatility = returns.rolling(63).std().iloc[-1].replace([np.inf, -np.inf], np.nan)
    market_returns = returns.mean(axis=1, skipna=True)
    market_var = market_returns.var()
    beta = returns.apply(
        lambda column: (column.cov(market_returns) / market_var) if market_var and pd.notna(market_var) else np.nan,
        axis=0,
    ).replace([np.inf, -np.inf], np.nan)

    quality_score = (1.0 - volatility.rank(pct=True, ascending=True)).fillna(0.5)
    value_score = (-momentum_6m).rank(pct=True).fillna(0.5)
    risk_score = volatility.rank(pct=True).fillna(0.5)
    growth_score = momentum_6m.rank(pct=True).fillna(0.5)
    composite_score = pd.concat([quality_score, value_score, 1.0 - risk_score, growth_score], axis=1).mean(axis=1).fillna(0.5)

    membership_latest = membership.sort_values("date").drop_duplicates("ticker", keep="last").set_index("ticker")
    screener = pd.DataFrame({
        "ticker": tickers,
        "quality_score": quality_score.reindex(tickers).fillna(0.5).values,
        "value_score": value_score.reindex(tickers).fillna(0.5).values,
        "risk_score": risk_score.reindex(tickers).fillna(0.5).values,
        "growth_score": growth_score.reindex(tickers).fillna(0.5).values,
        "composite_score": composite_score.reindex(tickers).fillna(0.5).values,
        "momentum_6m": momentum_6m.reindex(tickers).fillna(0.0).values,
        "sector": membership_latest.reindex(tickers)["sector"].fillna("Unknown").values if "sector" in membership_latest.columns else "Unknown",
        "industry": membership_latest.reindex(tickers)["industry"].fillna("Unknown").values if "industry" in membership_latest.columns else "Unknown",
        "beta": beta.reindex(tickers).fillna(1.0).values,
    })

    valuation = pd.DataFrame({
        "ticker": tickers,
        "upside": (value_score.reindex(tickers).fillna(0.5) - 0.5).values,
    })

    holdings = screener[["ticker", "sector", "industry"]].copy()

    if fmp_client is not None:
        try:
            snapshot = fmp_client.get_fundamental_snapshot(tickers).set_index("ticker")
            screener["sector"] = screener["sector"].where(screener["sector"].ne("Unknown"), snapshot.reindex(tickers)["sector_fmp"].fillna("Unknown").values)
            screener["industry"] = screener["industry"].where(screener["industry"].ne("Unknown"), snapshot.reindex(tickers)["industry_fmp"].fillna("Unknown").values)
            screener["beta"] = screener["beta"].where(pd.notna(screener["beta"]), pd.to_numeric(snapshot.reindex(tickers)["beta_fmp"], errors="coerce").fillna(1.0).values)
            holdings["sector"] = screener["sector"]
            holdings["industry"] = screener["industry"]
            pe = pd.to_numeric(snapshot.reindex(tickers)["pe_ttm_fmp"], errors="coerce")
            roic = pd.to_numeric(snapshot.reindex(tickers)["roic_ttm_fmp"], errors="coerce")
            if pe.notna().any():
                valuation["upside"] = ((-pe.rank(pct=True).fillna(0.5)) + 0.5).clip(-1.0, 1.0).values
                screener["value_score"] = (-pe.rank(pct=True).fillna(0.5)).abs().values
            if roic.notna().any():
                screener["quality_score"] = roic.rank(pct=True).fillna(screener["quality_score"]).values
            screener["composite_score"] = screener[["quality_score", "value_score", "growth_score"]].mean(axis=1).fillna(0.5)
        except Exception:
            pass

    return valuation, screener, holdings


@dataclass
class RuntimeBootstrapResult:
    bootstrapped: list[str]


def ensure_runtime_inputs(paths: PathConfig, research_settings: ResearchSettings, *, fmp_client: FMPClient | None = None) -> RuntimeBootstrapResult:
    bootstrapped: list[str] = []

    need_membership = not has_runtime_frame("market:sp500_constituents_history") and not (paths.caria_data_root / "sp500_constituents_history.csv").exists()
    need_prices = not has_runtime_frame("market:sp500_price_panel") and not (paths.caria_data_root / "sp500_universe_fmp.parquet").exists()
    need_alpha_volume = not has_runtime_frame("market:alpha_volume_panel")
    need_state = not has_runtime_frame("state_panel") and not (paths.fin_model_root / "data_processed" / "tension_metrics.csv").exists()
    need_priors = any(
        not has_runtime_frame(key)
        for key in (
            "portfolio_priors:screener",
            "portfolio_priors:valuation_summary",
            "portfolio_priors:holdings_normalized",
        )
    )

    if not any([need_membership, need_prices, need_alpha_volume, need_state, need_priors]):
        return RuntimeBootstrapResult(bootstrapped=bootstrapped)

    membership = _fetch_current_sp500_membership(research_settings.start_date) if need_membership else pd.DataFrame()
    if not membership.empty:
        save_runtime_frame("market:sp500_constituents_history", membership, {"source": "bootstrap:wikipedia"})
        bootstrapped.append("market:sp500_constituents_history")

    universe = membership["ticker"].tolist() if not membership.empty else []
    if "SPY" not in universe:
        universe.append("SPY")

    prices, volume = _download_yfinance_panel(universe, research_settings.start_date, research_settings.end_date)
    if need_prices and not prices.empty:
        save_runtime_frame("market:sp500_price_panel", prices, {"source": "bootstrap:yfinance"})
        bootstrapped.append("market:sp500_price_panel")
    if need_alpha_volume and not prices.empty and not volume.empty:
        aligned_close = prices.reindex(columns=[column for column in prices.columns if column in volume.columns]).ffill()
        aligned_volume = volume.reindex(columns=aligned_close.columns).fillna(0.0)
        alpha_volume = (aligned_close * aligned_volume).dropna(how="all")
        if not alpha_volume.empty:
            save_runtime_frame("market:alpha_volume_panel", alpha_volume, {"source": "bootstrap:yfinance"})
            bootstrapped.append("market:alpha_volume_panel")

    if need_state and not prices.empty:
        state_panel = _build_state_panel_from_prices(prices)
        if not state_panel.empty:
            save_runtime_frame("state_panel", state_panel, {"source": "bootstrap:derived"})
            bootstrapped.append("state_panel")

    if need_priors and not prices.empty:
        if membership.empty:
            membership = _fetch_current_sp500_membership(research_settings.start_date)
        valuation, screener, holdings = _build_portfolio_prior_frames(prices, membership, fmp_client)
        if not valuation.empty:
            save_runtime_frame("portfolio_priors:valuation_summary", valuation, {"source": "bootstrap:derived"})
            bootstrapped.append("portfolio_priors:valuation_summary")
        if not screener.empty:
            save_runtime_frame("portfolio_priors:screener", screener, {"source": "bootstrap:derived"})
            bootstrapped.append("portfolio_priors:screener")
        if not holdings.empty:
            save_runtime_frame("portfolio_priors:holdings_normalized", holdings, {"source": "bootstrap:derived"})
            bootstrapped.append("portfolio_priors:holdings_normalized")

    return RuntimeBootstrapResult(bootstrapped=bootstrapped)
