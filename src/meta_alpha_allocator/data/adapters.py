from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from ..config import PathConfig
from ..utils import expanding_percentile, to_datetime_index
from .fmp_client import FMPClient


def _parse_semicolon_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, sep=";", decimal=",", thousands=".")


def _safe_json_load(path: Path) -> dict:
    text = path.read_text(encoding="utf-8").replace("NaN", "null")
    return json.loads(text)


def load_state_panel(paths: PathConfig) -> pd.DataFrame:
    tension_path = paths.fin_model_root / "data_processed" / "tension_metrics.csv"
    state = pd.read_csv(tension_path)
    state["date"] = pd.to_datetime(state["date"])
    state = state.sort_values("date")

    state["tension_pct"] = state["T_comp_pct"].astype(float).where(state["T_comp_pct"].astype(float) <= 1.0, state["T_comp_pct"].astype(float) / 100.0)
    state["memory_p_fail"] = state["mem_30d__mem__p_fail"].astype(float).clip(lower=0.0, upper=1.0)
    recurrence_raw = state["mem_30d__mem__recurrence"].astype(float)
    state["recurrence"] = expanding_percentile(recurrence_raw, min_periods=60).fillna(0.5)
    crowding_raw = state["asset__mean_corr_63_pct"].astype(float)
    state["crowding_pct"] = crowding_raw.where(crowding_raw <= 1.0, crowding_raw / 100.0).fillna(0.5)
    mfin_raw = state["M_fin_pct"].astype(float)
    state["mfin_pct"] = mfin_raw.where(mfin_raw <= 1.0, mfin_raw / 100.0).fillna(0.5)
    gfl_raw = state["GFL_pct"].astype(float)
    state["gfl_pct"] = gfl_raw.where(gfl_raw <= 1.0, gfl_raw / 100.0).fillna(0.5)

    components = pd.concat(
        [
            state["mfin_pct"],
            state["memory_p_fail"],
            state["tension_pct"],
            state["crowding_pct"],
            state["gfl_pct"],
        ],
        axis=1,
    )
    state["crash_prob"] = components.mean(axis=1, skipna=True).fillna(0.5).clip(0.0, 1.0)
    state["legitimacy_risk"] = (
        0.45 * state["crash_prob"]
        + 0.20 * state["crowding_pct"]
        + 0.20 * state["recurrence"]
        + 0.15 * state["memory_p_fail"].fillna(0.5)
    ).clip(0.0, 1.0)

    def _regime(value: float) -> str:
        if value >= 0.80:
            return "CRISIS"
        if value >= 0.65:
            return "DEFENSIVE"
        if value >= 0.45:
            return "NEUTRAL"
        return "RISK_ON"

    state["regime"] = state["legitimacy_risk"].map(_regime)

    current_signal_path = paths.fin_model_root / "validation_output" / "current_signal.json"
    if current_signal_path.exists():
        current_signal = _safe_json_load(current_signal_path)
        latest_date = pd.to_datetime(current_signal.get("date")) if current_signal.get("date") else None
        if latest_date is not None and latest_date in set(state["date"]):
            crash_prob = current_signal.get("crash_prob")
            if crash_prob is not None:
                mask = state["date"] == latest_date
                state.loc[mask, "crash_prob"] = float(crash_prob)

    columns = [
        "date",
        "crash_prob",
        "tension_pct",
        "memory_p_fail",
        "recurrence",
        "crowding_pct",
        "regime",
        "legitimacy_risk",
    ]
    return state.loc[:, columns]


def load_portfolio_priors(paths: PathConfig, fmp_client: FMPClient | None = None) -> pd.DataFrame:
    output_root = paths.resolve_portfolio_manager_latest_root(
        "screener.csv",
        "valuation_summary.csv",
        "holdings_normalized.csv",
    )
    valuation = _parse_semicolon_csv(output_root / "valuation_summary.csv")
    screener = _parse_semicolon_csv(output_root / "screener.csv")
    holdings = _parse_semicolon_csv(output_root / "holdings_normalized.csv")

    valuation = valuation.rename(columns={"ticker": "ticker"})
    screener = screener.rename(columns={"ticker": "ticker"})
    holdings = holdings.rename(columns={"ticker": "ticker"})

    priors = valuation.merge(
        screener[
            [
                "ticker",
                "quality_score",
                "value_score",
                "risk_score",
                "growth_score",
                "composite_score",
                "momentum_6m",
                "sector",
                "industry",
                "beta",
            ]
        ],
        on="ticker",
        how="outer",
        suffixes=("_valuation", ""),
    )
    priors = priors.merge(
        holdings[["ticker", "sector", "industry"]],
        on="ticker",
        how="left",
        suffixes=("", "_holding"),
    )

    priors["sector"] = priors["sector"].fillna(priors["sector_holding"]).fillna("Unknown")
    priors["industry"] = priors["industry"].fillna(priors["industry_holding"]).fillna("Unknown")
    priors["valuation_gap"] = pd.to_numeric(priors.get("upside"), errors="coerce")
    priors["quality"] = pd.to_numeric(priors.get("quality_score"), errors="coerce")
    priors["value"] = pd.to_numeric(priors.get("value_score"), errors="coerce")
    priors["risk"] = pd.to_numeric(priors.get("risk_score"), errors="coerce")
    priors["growth"] = pd.to_numeric(priors.get("growth_score"), errors="coerce")
    priors["momentum_6m"] = pd.to_numeric(priors.get("momentum_6m"), errors="coerce")
    priors["beta"] = pd.to_numeric(priors.get("beta"), errors="coerce")

    columns = ["sector", "industry", "quality", "value", "risk", "growth", "momentum_6m", "beta", "valuation_gap"]
    priors = priors.set_index("ticker")[columns]

    if fmp_client is not None and not priors.empty:
        try:
            snapshot = fmp_client.get_fundamental_snapshot(priors.index.tolist()).set_index("ticker")
            priors = priors.join(snapshot, how="left")
            priors["sector"] = priors["sector"].fillna(priors["sector_fmp"])
            priors["industry"] = priors["industry"].fillna(priors["industry_fmp"])
            priors["beta"] = priors["beta"].combine_first(pd.to_numeric(priors["beta_fmp"], errors="coerce"))
            priors["quality"] = priors["quality"].combine_first(pd.to_numeric(priors["roic_ttm_fmp"], errors="coerce"))
            priors["value"] = priors["value"].combine_first(-pd.to_numeric(priors["pe_ttm_fmp"], errors="coerce"))
        except Exception:
            pass

    return priors


def load_membership_history(paths: PathConfig) -> pd.DataFrame:
    membership = pd.read_csv(paths.caria_data_root / "sp500_constituents_history.csv")
    membership["date"] = pd.to_datetime(membership["date"])
    membership["ticker"] = membership["ticker"].astype(str)
    return membership.drop_duplicates(["date", "ticker"])


def load_sp500_price_panel(paths: PathConfig, start_date: str | None = None, end_date: str | None = None) -> pd.DataFrame:
    prices = pd.read_parquet(paths.caria_data_root / "sp500_universe_fmp.parquet")
    prices = to_datetime_index(prices)
    if start_date:
        prices = prices.loc[pd.to_datetime(start_date) :]
    if end_date:
        prices = prices.loc[: pd.to_datetime(end_date)]
    prices = prices.sort_index()
    return prices


def load_alpha_volume_panel(
    paths: PathConfig,
    tickers: list[str],
    start_date: str | None = None,
    end_date: str | None = None,
) -> pd.DataFrame:
    panel: dict[str, pd.Series] = {}
    alpha_dir = paths.caria_data_root / "sp500_prices_alpha"
    start_ts = pd.to_datetime(start_date) if start_date else None
    end_ts = pd.to_datetime(end_date) if end_date else None
    for ticker in tickers:
        csv_path = alpha_dir / f"{ticker}.csv"
        if not csv_path.exists():
            continue
        frame = pd.read_csv(csv_path, usecols=["date", "adjClose", "volume"])
        frame["date"] = pd.to_datetime(frame["date"])
        if start_ts is not None:
            frame = frame.loc[frame["date"] >= start_ts]
        if end_ts is not None:
            frame = frame.loc[frame["date"] <= end_ts]
        frame = frame.dropna(subset=["adjClose", "volume"])
        if frame.empty:
            continue
        panel[ticker] = (frame["adjClose"] * frame["volume"]).rename(ticker).set_axis(frame["date"])
    if not panel:
        return pd.DataFrame()
    return pd.DataFrame(panel).sort_index()


def _load_local_eod_csv(csv_path: Path) -> pd.Series:
    frame = pd.read_csv(csv_path, usecols=["date", "close"])
    frame["date"] = pd.to_datetime(frame["date"])
    return frame.set_index("date")["close"].sort_index()


def load_defense_price_panel(
    paths: PathConfig,
    start_date: str,
    end_date: str | None,
    tickers: tuple[str, ...] = ("SPY", "IEF", "BIL"),
    fmp_client: FMPClient | None = None,
) -> tuple[pd.DataFrame, list[str]]:
    warnings: list[str] = []
    series_map: dict[str, pd.Series] = {}
    fmp_dir = paths.caria_data_root / "data_fmp_1990"
    local_map = {"SPY": fmp_dir / "SPY_EOD_full.csv"}
    start_ts = pd.to_datetime(start_date)
    end_ts = pd.to_datetime(end_date) if end_date else None

    incomplete: list[str] = []
    for ticker in tickers:
        csv_path = local_map.get(ticker)
        if csv_path and csv_path.exists():
            series = _load_local_eod_csv(csv_path)
            if start_ts is not None:
                series = series.loc[start_ts:]
            if end_ts is not None:
                series = series.loc[:end_ts]
            series_map[ticker] = series
            if series.dropna().empty or series.dropna().index.min() > start_ts + pd.Timedelta(days=45):
                incomplete.append(ticker)

    missing = [ticker for ticker in tickers if ticker not in series_map or ticker in incomplete]
    if fmp_client is not None:
        for ticker in list(missing):
            try:
                frame = fmp_client.get_historical_prices(ticker, start_date, end_date)
            except Exception:
                continue
            if not frame.empty:
                fetched = frame.set_index("date")["close"].sort_index()
                if ticker in series_map:
                    series_map[ticker] = fetched.combine_first(series_map[ticker])
                else:
                    series_map[ticker] = fetched
                missing.remove(ticker)
    if missing:
        try:
            import yfinance as yf

            download = yf.download(
                missing,
                start=start_date,
                end=end_date,
                auto_adjust=True,
                progress=False,
            )
            if not download.empty:
                close = download["Close"] if isinstance(download.columns, pd.MultiIndex) else download.rename(columns={"Close": missing[0]})
                if isinstance(close, pd.Series):
                    close = close.to_frame(missing[0])
                close.index = pd.to_datetime(close.index)
                for ticker in missing:
                    if ticker in close.columns:
                        fetched = close[ticker].dropna()
                        if ticker in series_map:
                            series_map[ticker] = fetched.combine_first(series_map[ticker])
                        else:
                            series_map[ticker] = fetched
        except Exception as exc:
            warnings.append(f"yfinance defense fallback failed: {exc}")

    for ticker in tickers:
        if ticker not in series_map:
            warnings.append(f"{ticker} history unavailable; using synthetic flat series.")
            index = pd.date_range(start=start_ts, end=end_ts or pd.Timestamp.today(), freq="B")
            series_map[ticker] = pd.Series(100.0, index=index, name=ticker)

    panel = pd.DataFrame(series_map).sort_index().ffill().dropna(how="all")
    return panel, warnings


def load_fmp_market_proxy_panel(
    paths: PathConfig,
    tickers: tuple[str, ...],
    start_date: str,
    end_date: str | None,
    fmp_client: FMPClient | None = None,
) -> pd.DataFrame:
    series_map: dict[str, pd.Series] = {}
    fmp_dir = paths.caria_data_root / "data_fmp_1990"
    local_map = {"SPY": fmp_dir / "SPY_EOD_full.csv"}
    start_ts = pd.to_datetime(start_date)
    end_ts = pd.to_datetime(end_date) if end_date else None

    for ticker in tickers:
        csv_path = local_map.get(ticker)
        if csv_path and csv_path.exists():
            series = _load_local_eod_csv(csv_path)
            if start_ts is not None:
                series = series.loc[start_ts:]
            if end_ts is not None:
                series = series.loc[:end_ts]
            series_map[ticker] = series

    if fmp_client is not None:
        for ticker in tickers:
            try:
                frame = fmp_client.get_historical_prices(ticker, start_date, end_date)
            except Exception:
                continue
            if frame.empty:
                continue
            fetched = frame.set_index("date")["close"].sort_index()
            if ticker in series_map:
                series_map[ticker] = fetched.combine_first(series_map[ticker])
            else:
                series_map[ticker] = fetched

    missing = [ticker for ticker in tickers if ticker not in series_map or series_map[ticker].dropna().empty]
    if missing:
        try:
            import yfinance as yf

            download = yf.download(
                missing,
                start=start_date,
                end=end_date,
                auto_adjust=True,
                progress=False,
            )
            if not download.empty:
                close = download["Close"] if isinstance(download.columns, pd.MultiIndex) else download.rename(columns={"Close": missing[0]})
                if isinstance(close, pd.Series):
                    close = close.to_frame(missing[0])
                close.index = pd.to_datetime(close.index)
                for ticker in missing:
                    if ticker in close.columns:
                        fetched = close[ticker].dropna()
                        if ticker in series_map:
                            series_map[ticker] = fetched.combine_first(series_map[ticker])
                        else:
                            series_map[ticker] = fetched
        except Exception:
            pass
    if not series_map:
        return pd.DataFrame()
    panel = pd.DataFrame(series_map).sort_index().ffill().dropna(how="all")
    return panel
