from __future__ import annotations

import json
import math
import os
import zipfile
import sys
from datetime import datetime, timedelta, timezone
if sys.version_info >= (3, 11):
    from datetime import UTC
else:
    UTC = timezone.utc
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

import numpy as np
import pandas as pd

from ..config import AllocatorSettings, DashboardSettings, PathConfig, ResearchSettings, artifact_only_mode
from ..chile.desk import build_chile_market_snapshot
from ..data.adapters import load_fmp_market_proxy_panel, load_state_panel
from ..data.runtime_bootstrap import ensure_runtime_inputs
from ..data.fred_client import FREDClient
from ..data.fmp_client import FMPClient
from ..models import DashboardSnapshot
from ..decision_runtime.events import record_decision_events
from ..research.forecast_baselines import run_forecast_baselines
from ..research.behavioral_edges import summarize_owner_elasticity
from ..research.spectral_structure import run_spectral_structure_pipeline
from ..research.statement_intel import run_statement_intelligence
from ..policy.engine import build_policy_state_frame
from ..research.regime_labels import build_daily_regime_frame
from ..decision_runtime.packet import build_decision_packet
from ..storage.runtime_store import (
    has_runtime_frame,
    load_runtime_document,
    load_runtime_frame,
    load_runtime_snapshot,
    save_runtime_document,
    save_runtime_snapshot,
)
from ..state_contract import build_bls_state_contract_v1
from ..runtime import run_production
from ..utils import ensure_directory, time_safe_join


def _json_default(value: Any) -> Any:
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if isinstance(value, np.generic):
        return value.item()
    if pd.isna(value):
        return None
    raise TypeError(f"Object of type {type(value)!r} is not JSON serializable")


def _safe_json_load(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8").replace("NaN", "null")
    return json.loads(text)


def remote_snapshot_url() -> str:
    for name in ("META_ALLOCATOR_REMOTE_SNAPSHOT_URL", "BLS_PRIME_REMOTE_SNAPSHOT_URL"):
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def _safe_remote_json_load(url: str) -> dict[str, Any] | None:
    if not url:
        return None
    timeout = float(os.environ.get("META_ALLOCATOR_REMOTE_SNAPSHOT_TIMEOUT_SECONDS", "8"))
    request = Request(url, headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=timeout) as response:
            text = response.read().decode("utf-8").replace("NaN", "null")
            return json.loads(text)
    except Exception:
        return None


def _safe_csv_load(path: Path, *, sep: str = ",", decimal: str = ".", thousands: str | None = None, index_col: int | None = None) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, sep=sep, decimal=decimal, thousands=thousands, index_col=index_col)


def _safe_semicolon_csv(path: Path) -> pd.DataFrame:
    return _safe_csv_load(path, sep=";", decimal=",", thousands=".")


def _load_runtime_backed_csv(path: Path, dataset_key: str, *, sep: str = ",", decimal: str = ".", thousands: str | None = None) -> pd.DataFrame:
    if path.exists():
        return _safe_csv_load(path, sep=sep, decimal=decimal, thousands=thousands)
    return load_runtime_frame(dataset_key)


def _load_runtime_backed_semicolon_csv(path: Path, dataset_key: str) -> pd.DataFrame:
    if path.exists():
        return _safe_semicolon_csv(path)
    return load_runtime_frame(dataset_key)


def _frame_columns(frame: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame(columns=columns)
    available = [column for column in columns if column in frame.columns]
    if not available:
        return pd.DataFrame(columns=columns)
    subset = frame[available].copy()
    for column in columns:
        if column not in subset.columns:
            subset[column] = None
    return subset.loc[:, columns]


def _required_production_inputs(paths: PathConfig) -> list[Path]:
    latest_root = paths.resolve_portfolio_manager_latest_root(
        "screener.csv",
        "valuation_summary.csv",
        "holdings_normalized.csv",
    )
    return [
        paths.fin_model_root / "data_processed" / "tension_metrics.csv",
        paths.caria_data_root / "sp500_constituents_history.csv",
        paths.caria_data_root / "sp500_universe_fmp.parquet",
        latest_root / "screener.csv",
        latest_root / "valuation_summary.csv",
        latest_root / "holdings_normalized.csv",
    ]


def _has_runtime_input(path: Path, paths: PathConfig) -> bool:
    latest_root = paths.resolve_portfolio_manager_latest_root(
        "screener.csv",
        "valuation_summary.csv",
        "holdings_normalized.csv",
    )
    runtime_keys = {
        paths.fin_model_root / "data_processed" / "tension_metrics.csv": "state_panel",
        paths.caria_data_root / "sp500_constituents_history.csv": "market:sp500_constituents_history",
        paths.caria_data_root / "sp500_universe_fmp.parquet": "market:sp500_price_panel",
        latest_root / "screener.csv": "portfolio_priors:screener",
        latest_root / "valuation_summary.csv": "portfolio_priors:valuation_summary",
        latest_root / "holdings_normalized.csv": "portfolio_priors:holdings_normalized",
    }
    dataset_key = runtime_keys.get(path)
    return has_runtime_frame(dataset_key) if dataset_key else False


def _missing_production_inputs(paths: PathConfig) -> list[Path]:
    return [
        path
        for path in _required_production_inputs(paths)
        if not path.exists() and not _has_runtime_input(path, paths)
    ]


def _format_missing_input(path: Path, project_root: Path) -> str:
    try:
        return str(path.relative_to(project_root))
    except ValueError:
        return str(path)


def _artifact_snapshot_candidates(paths: PathConfig, dashboard_settings: DashboardSettings) -> list[Path]:
    artifact_paths = [
        paths.artifact_root / "dashboard" / "latest" / "dashboard_snapshot.json",
        paths.artifact_root / "dashboard_snapshot.json",
    ]
    local_cache = dashboard_settings.output_dir / "dashboard_snapshot.json"
    return [*artifact_paths, local_cache] if artifact_only_mode() else [local_cache, *artifact_paths]


def _load_preferred_screener(latest_root: Path) -> pd.DataFrame:
    discovery_path = latest_root / "discovery_screener.csv"
    if discovery_path.exists():
        return _safe_semicolon_csv(discovery_path)
    return _safe_semicolon_csv(latest_root / "screener.csv")


def _path_mtime(path: Path) -> pd.Timestamp | None:
    if not path.exists():
        return None
    return pd.to_datetime(datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)).tz_convert(None)


def _staleness_days(reference: pd.Timestamp | None, as_of: pd.Timestamp | None) -> int | None:
    if reference is None or as_of is None:
        return None
    return max(int((pd.to_datetime(as_of) - pd.to_datetime(reference)).days), 0)


def _percent(value: float | None) -> float | None:
    if value is None or pd.isna(value):
        return None
    return float(value)


def _frame_to_records(frame: pd.DataFrame, limit: int | None = None) -> list[dict[str, Any]]:
    if frame.empty:
        return []
    data = frame.copy()
    if limit is not None:
        data = data.head(limit)
    data = data.replace({np.nan: None})
    return json.loads(data.to_json(orient="records", date_format="iso"))


def _series_growth(returns: pd.Series) -> pd.Series:
    clean = returns.fillna(0.0)
    return (1.0 + clean).cumprod()


def _series_drawdown(returns: pd.Series) -> pd.Series:
    wealth = _series_growth(returns)
    return wealth / wealth.cummax() - 1.0


def _rolling_sharpe(returns: pd.Series, window: int = 63) -> pd.Series:
    rolling_mean = returns.rolling(window).mean() * 252.0
    rolling_vol = returns.rolling(window).std() * np.sqrt(252.0)
    return rolling_mean / rolling_vol.replace(0.0, np.nan)


def _rolling_vol(returns: pd.Series, window: int = 63) -> pd.Series:
    return returns.rolling(window).std() * np.sqrt(252.0)


def _histogram(values: pd.Series, bins: int = 12) -> list[dict[str, float]]:
    numeric = pd.to_numeric(values, errors="coerce").dropna()
    if numeric.empty:
        return []
    counts, edges = np.histogram(numeric, bins=bins)
    hist: list[dict[str, float]] = []
    for idx, count in enumerate(counts):
        hist.append({"x0": float(edges[idx]), "x1": float(edges[idx + 1]), "count": int(count)})
    return hist


def _latest_non_null(frame: pd.DataFrame, column: str) -> Any:
    if frame.empty or column not in frame.columns:
        return None
    series = frame[column].dropna()
    if series.empty:
        return None
    return series.iloc[-1]


def _read_workbook_meta(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"available": False, "sheets": []}
    try:
        with zipfile.ZipFile(path) as workbook:
            root = ET.fromstring(workbook.read("xl/workbook.xml"))
            ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            sheets_root = root.find("x:sheets", ns)
            sheet_names = [sheet.attrib.get("name", "") for sheet in sheets_root] if sheets_root is not None else []
        return {"available": True, "path": str(path), "sheets": sheet_names}
    except Exception as exc:
        return {"available": True, "path": str(path), "sheets": [], "warning": f"workbook metadata unavailable: {exc}"}


def _build_live_market_panel(
    paths: PathConfig,
    dashboard_settings: DashboardSettings,
    tickers: list[str],
    *,
    fmp_client: FMPClient | None,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    end_date = pd.Timestamp.today().normalize().date().isoformat()
    start_date = (pd.Timestamp.today().normalize() - pd.Timedelta(days=max(dashboard_settings.market_lookback_days * 2, 400))).date().isoformat()
    unique_tickers = tuple(sorted({ticker for ticker in tickers if ticker and ticker != "DWBDS"}))
    panel = load_fmp_market_proxy_panel(
        paths,
        tickers=unique_tickers,
        start_date=start_date,
        end_date=end_date,
        fmp_client=fmp_client,
    )
    quote_rows: list[dict[str, Any]] = []
    latest_quote_dates: list[pd.Timestamp] = []
    for ticker in unique_tickers:
        if ticker not in panel.columns:
            quote_rows.append({"ticker": ticker, "price": None, "return_1d": None, "return_20d": None, "source": "cache", "as_of": None})
            continue
        series = panel[ticker].dropna()
        if series.empty:
            quote_rows.append({"ticker": ticker, "price": None, "return_1d": None, "return_20d": None, "source": "cache", "as_of": None})
            continue
        latest_quote_dates.append(pd.to_datetime(series.index[-1]))
        quote_rows.append(
            {
                "ticker": ticker,
                "price": float(series.iloc[-1]),
                "return_1d": float(series.pct_change().iloc[-1]) if len(series) >= 2 else None,
                "return_20d": float(series.iloc[-1] / series.iloc[-21] - 1.0) if len(series) >= 21 else None,
                "source": "fmp_or_fallback",
                "as_of": pd.to_datetime(series.index[-1]).date().isoformat(),
            }
        )
    latest_quote_date = max(latest_quote_dates) if latest_quote_dates else None
    quote_stale_days = _staleness_days(latest_quote_date, pd.Timestamp.today().normalize())
    return panel, {
        "quotes": quote_rows,
        "quotes_as_of": latest_quote_date.date().isoformat() if latest_quote_date is not None else None,
        "quotes_stale_days": quote_stale_days,
        "quotes_source": "fmp_or_fallback" if quote_rows else "unavailable",
    }


def _build_performance_snapshot(paths: PathConfig, dashboard_settings: DashboardSettings) -> dict[str, Any]:
    research_root = paths.output_root / "research" / "latest"
    policy_root = paths.output_root / "policy" / "latest"
    research_summary = _safe_json_load(research_root / "research_summary.json") or {}
    policy_summary = _safe_json_load(policy_root / "policy_backtest_summary.json") or {}
    research_daily = _safe_csv_load(research_root / "daily_returns.csv", index_col=0)
    policy_daily = _safe_csv_load(policy_root / "policy_daily_returns.csv", index_col=0)

    if not research_daily.empty:
        research_daily.index = pd.to_datetime(research_daily.index)
    if not policy_daily.empty:
        policy_daily.index = pd.to_datetime(policy_daily.index)

    merged = research_daily.copy()
    if not policy_daily.empty:
        merged = merged.join(policy_daily, how="outer")
    merged = merged.sort_index().tail(dashboard_settings.chart_history_points)

    growth_columns = [column for column in ["spy", "state_overlay", "policy_overlay", "meta_allocator", "selection_standalone", "trend_following", "vol_target"] if column in merged.columns]
    growth = pd.DataFrame(index=merged.index)
    drawdown = pd.DataFrame(index=merged.index)
    rolling = pd.DataFrame(index=merged.index)
    for column in growth_columns:
        growth[f"{column}_growth"] = _series_growth(merged[column])
        drawdown[f"{column}_drawdown"] = _series_drawdown(merged[column])
        rolling[f"{column}_sharpe_63"] = _rolling_sharpe(merged[column])
        rolling[f"{column}_vol_63"] = _rolling_vol(merged[column])

    benchmark_table: list[dict[str, Any]] = []
    for label, payload in [
        ("Policy overlay", research_summary.get("policy_overlay") or policy_summary.get("policy_overlay")),
        ("Heuristic state overlay", research_summary.get("state_overlay") or policy_summary.get("heuristic_state_overlay")),
        ("SPY buy and hold", research_summary.get("benchmark_spy") or policy_summary.get("benchmark_spy")),
        ("Vol target", research_summary.get("policy_benchmarks", {}).get("vol_target") or policy_summary.get("vol_target")),
        ("Trend following", research_summary.get("policy_benchmarks", {}).get("trend_following") or policy_summary.get("trend_following")),
    ]:
        if payload:
            benchmark_table.append({"label": label, **payload})

    return {
        "summary_metrics": research_summary,
        "policy_summary": policy_summary,
        "oos_blocks": research_summary.get("oos_blocks", []),
        "regime_performance": research_summary.get("regime_performance", []),
        "episode_performance": research_summary.get("episode_performance", []),
        "confidence_split": research_summary.get("policy_high_vs_low_confidence", policy_summary.get("high_vs_low_confidence", {})),
        "series": _frame_to_records(growth.join(drawdown).join(rolling).reset_index().rename(columns={"index": "date"})),
        "benchmark_table": benchmark_table,
        "as_of_date": str(merged.index.max().date()) if not merged.empty else None,
        "stale_days": _staleness_days(_path_mtime(research_root / "research_summary.json"), pd.Timestamp.today().normalize()),
    }


def _build_portfolio_snapshot(
    paths: PathConfig,
    overview: dict[str, Any],
    market_panel: pd.DataFrame,
    market_quotes: dict[str, Any],
) -> dict[str, Any]:
    latest_root = paths.resolve_portfolio_manager_latest_root(
        "screener.csv",
        "valuation_summary.csv",
        "holdings_normalized.csv",
    )
    portfolio_summary = _safe_json_load(latest_root / "portfolio_summary.json") or {}
    holdings = _load_runtime_backed_semicolon_csv(latest_root / "holdings_normalized.csv", "portfolio_priors:holdings_normalized")
    valuation = _load_runtime_backed_semicolon_csv(latest_root / "valuation_summary.csv", "portfolio_priors:valuation_summary")
    screener = _load_runtime_backed_semicolon_csv(latest_root / "screener.csv", "portfolio_priors:screener")
    simulation = _safe_semicolon_csv(latest_root / "simulation_summary.csv")
    workbook_meta = _read_workbook_meta(latest_root / "portfolio_snapshot.xlsx")

    analytics = portfolio_summary.get("analytics", {})
    macro = portfolio_summary.get("macro", {})

    if not holdings.empty:
        holdings["weight"] = pd.to_numeric(holdings.get("weight"), errors="coerce").fillna(0.0)
        holdings["market_value_usd"] = pd.to_numeric(holdings.get("market_value_usd"), errors="coerce")
        holdings["current_price_usd"] = pd.to_numeric(holdings.get("current_price_usd"), errors="coerce")
        holdings["ticker"] = holdings["ticker"].astype(str)

    if not valuation.empty:
        valuation["upside"] = pd.to_numeric(valuation.get("upside"), errors="coerce")
        valuation["current_price"] = pd.to_numeric(valuation.get("current_price"), errors="coerce")
        valuation["fair_value"] = pd.to_numeric(valuation.get("fair_value"), errors="coerce")

    if not screener.empty:
        for column in ["composite_score", "quality_score", "value_score", "risk_score", "momentum_6m", "suggested_position", "valuation_gap"]:
            if column in screener.columns:
                screener[column] = pd.to_numeric(screener[column], errors="coerce")

    merged_holdings = holdings.merge(
        _frame_columns(valuation, ["ticker", "fair_value", "upside", "confidence"]),
        on="ticker",
        how="left",
    ).merge(
        _frame_columns(
            screener,
            [
                "ticker",
                "composite_score",
                "quality_score",
                "value_score",
                "risk_score",
                "momentum_6m",
                "thesis_bucket",
                "suggested_position",
                "analyst_consensus",
            ],
        ),
        on="ticker",
        how="left",
    )
    merged_holdings = merged_holdings.sort_values("weight", ascending=False)
    holdings_source = "backend_portfolio_manager" if not merged_holdings.empty else "shared_snapshot"
    holdings_source_label = "Backend portfolio book" if not merged_holdings.empty else "Shared snapshot"

    sector_weights = (
        merged_holdings.groupby("sector", dropna=False)["weight"].sum().sort_values(ascending=False).reset_index().rename(columns={"weight": "portfolio_weight"})
        if not merged_holdings.empty
        else pd.DataFrame(columns=["sector", "portfolio_weight"])
    )
    top_holdings = merged_holdings[["ticker", "sector", "industry", "weight", "market_value_usd", "current_price_usd", "upside", "composite_score", "momentum_6m", "thesis_bucket"]].head(12)

    preferred_sectors = [sector for sector in (record.get("sector") for record in overview.get("sectors", {}).get("preferred", [])[:3]) if isinstance(sector, str) and sector]
    current_regime = overview.get("regime")
    selected_hedge = overview.get("selected_hedge")
    top_sector_names = [sector for sector in (sector_weights["sector"].head(3).tolist() if not sector_weights.empty else []) if isinstance(sector, str) and sector]
    mismatches = [sector for sector in top_sector_names if sector not in preferred_sectors]
    selected_hedge_weight = float(merged_holdings.loc[merged_holdings["ticker"] == selected_hedge, "weight"].sum()) if selected_hedge else 0.0
    beta_target = overview.get("beta_target")
    portfolio_beta = analytics.get("Beta")
    notes = []
    if mismatches:
        notes.append(f"Current top sectors diverge from the preferred map: {', '.join(mismatches[:3])}.")
    if selected_hedge and selected_hedge_weight == 0:
        notes.append(f"Selected hedge {selected_hedge} is not currently present in the portfolio.")
    if beta_target is not None and portfolio_beta is not None and portfolio_beta > beta_target + 0.25:
        notes.append("Portfolio beta is materially above the current system beta target.")
    if current_regime in {"DEFENSIVE", "CRISIS"} and analytics.get("Holdings Count", 0) > 25:
        notes.append("Regime is defensive while the live portfolio remains broadly invested.")

    history_rows: list[dict[str, Any]] = []
    liquid_holdings = merged_holdings.loc[(merged_holdings["asset_type"] != "cash") & merged_holdings["ticker"].isin(market_panel.columns)].copy()
    if not liquid_holdings.empty and "SPY" in market_panel.columns:
        weights = liquid_holdings.set_index("ticker")["weight"].fillna(0.0)
        returns = market_panel.loc[:, weights.index.union(pd.Index(["SPY"]))].pct_change().fillna(0.0)
        portfolio_returns = returns[weights.index].mul(weights, axis=1).sum(axis=1)
        growth = pd.DataFrame(
            {
                "date": returns.index,
                "portfolio_growth": _series_growth(portfolio_returns),
                "spy_growth": _series_growth(returns["SPY"]),
            }
        ).tail(180)
        history_rows = _frame_to_records(growth)

    valuation_hist = _histogram(merged_holdings["upside"] if "upside" in merged_holdings.columns else pd.Series(dtype=float))
    simulation_focus = simulation[["ticker", "prob_loss", "expected_return", "suggested_position", "var_95", "cvar_95"]].copy() if not simulation.empty else pd.DataFrame()
    if not simulation_focus.empty:
        simulation_focus = simulation_focus.sort_values(["suggested_position", "expected_return"], ascending=[False, False])

    return {
        "as_of": analytics.get("As of"),
        "analytics": analytics,
        "macro": macro,
        "quotes": market_quotes.get("quotes", []),
        "holdings": _frame_to_records(merged_holdings),
        "top_holdings": _frame_to_records(top_holdings),
        "sector_weights": _frame_to_records(sector_weights),
        "current_mix_vs_spy": history_rows,
        "valuation_histogram": valuation_hist,
        "simulation_rank": _frame_to_records(simulation_focus, limit=15),
        "alignment": {
            "preferred_sectors": preferred_sectors,
            "portfolio_top_sectors": top_sector_names,
            "mismatched_sectors": mismatches,
            "selected_hedge": selected_hedge,
            "selected_hedge_weight": selected_hedge_weight,
            "beta_target": beta_target,
            "portfolio_beta": portfolio_beta,
            "notes": notes,
        },
        "holdings_source": holdings_source,
        "holdings_source_label": holdings_source_label,
        "workbook": workbook_meta,
        "stale_days": _staleness_days(_path_mtime(latest_root / "portfolio_summary.json"), pd.Timestamp.today().normalize()),
    }


def _refresh_cached_snapshot_market_data(
    cached: dict[str, Any],
    paths: PathConfig,
    research_settings: ResearchSettings,
    dashboard_settings: DashboardSettings,
) -> dict[str, Any]:
    refreshed = json.loads(json.dumps(cached, default=_json_default))
    portfolio = dict(refreshed.get("portfolio", {}) or {})
    holdings_rows = portfolio.get("holdings") or portfolio.get("top_holdings") or []
    holding_tickers = [
        str(row.get("ticker"))
        for row in holdings_rows
        if isinstance(row, dict) and row.get("ticker")
    ]
    selected_hedge = refreshed.get("overview", {}).get("selected_hedge")
    market_tickers = holding_tickers + ["SPY", *(research_settings.hedge_tickers or []), *(research_settings.market_proxy_tickers or [])]
    if selected_hedge:
        market_tickers.append(str(selected_hedge))

    fmp_client = FMPClient.from_env(paths.cache_root)
    market_panel, market_quotes = _build_live_market_panel(paths, dashboard_settings, market_tickers, fmp_client=fmp_client)
    quote_map = {
        str(row.get("ticker")): row
        for row in (market_quotes.get("quotes") or [])
        if isinstance(row, dict) and row.get("ticker")
    }

    refreshed_holdings: list[dict[str, Any]] = []
    for row in holdings_rows:
        if not isinstance(row, dict):
            continue
        updated = dict(row)
        quote = quote_map.get(str(row.get("ticker")))
        price = quote.get("price") if quote else None
        if price is not None:
            updated["current_price_usd"] = float(price)
            quantity = pd.to_numeric(updated.get("quantity"), errors="coerce")
            if pd.notna(quantity):
                updated["market_value_usd"] = float(quantity) * float(price)
        refreshed_holdings.append(updated)

    if refreshed_holdings:
        total_value = sum(max(float(row.get("market_value_usd") or 0), 0.0) for row in refreshed_holdings)
        for row in refreshed_holdings:
            market_value = pd.to_numeric(row.get("market_value_usd"), errors="coerce")
            row["weight"] = float(market_value / total_value) if pd.notna(market_value) and total_value > 0 else row.get("weight")

        weighted_rows = [row for row in refreshed_holdings if row.get("ticker") in market_panel.columns]
        if weighted_rows and "SPY" in market_panel.columns:
            weights = pd.Series(
                {str(row["ticker"]): float(pd.to_numeric(row.get("weight"), errors="coerce") or 0.0) for row in weighted_rows},
                dtype=float,
            )
            if not weights.empty and float(weights.sum()) > 0:
                weights = weights / float(weights.sum())
                returns = market_panel.loc[:, list(weights.index) + ["SPY"]].pct_change().fillna(0.0)
                portfolio_returns = returns[list(weights.index)].mul(weights, axis=1).sum(axis=1)
                growth = pd.DataFrame(
                    {
                        "date": returns.index,
                        "portfolio_growth": _series_growth(portfolio_returns),
                        "spy_growth": _series_growth(returns["SPY"]),
                    }
                ).tail(180)
                portfolio["current_mix_vs_spy"] = _frame_to_records(growth)

        sector_weights = (
            pd.DataFrame(refreshed_holdings)
            .assign(weight=lambda frame: pd.to_numeric(frame.get("weight"), errors="coerce").fillna(0.0))
            .groupby("sector", dropna=False)["weight"]
            .sum()
            .sort_values(ascending=False)
            .reset_index()
            .rename(columns={"weight": "portfolio_weight"})
        )
        portfolio["holdings"] = refreshed_holdings
        portfolio["top_holdings"] = sorted(
            refreshed_holdings,
            key=lambda row: float(pd.to_numeric(row.get("market_value_usd"), errors="coerce") or 0.0),
            reverse=True,
        )[:12]
        portfolio["sector_weights"] = _frame_to_records(sector_weights)

    portfolio["quotes"] = market_quotes.get("quotes", [])
    portfolio["quotes_as_of"] = market_quotes.get("quotes_as_of")
    portfolio["quotes_stale_days"] = market_quotes.get("quotes_stale_days")
    portfolio["quotes_source"] = market_quotes.get("quotes_source")
    portfolio["stale_days"] = market_quotes.get("quotes_stale_days")
    portfolio["holdings_source_label"] = portfolio.get("holdings_source_label") or "Cached research snapshot"

    refreshed["portfolio"] = portfolio
    refreshed["generated_at"] = datetime.now(tz=UTC).isoformat()
    if market_quotes.get("quotes_as_of"):
        refreshed["as_of_date"] = market_quotes.get("quotes_as_of")
        refreshed.setdefault("overview", {})
        refreshed["overview"]["as_of_date"] = market_quotes.get("quotes_as_of")
    return refreshed


def _number_or(value: Any, fallback: float | None = None) -> float | None:
    try:
        if value is None or pd.isna(value):
            return fallback
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _humanize_label(value: str) -> str:
    return value.replace("_", " ").strip().title()


def _describe_trust_state(trust_score: float) -> str:
    if trust_score >= 0.75:
        return "Act"
    if trust_score >= 0.55:
        return "Stage"
    if trust_score >= 0.35:
        return "Observe"
    return "Protect"


def _describe_decision_rights(trust_score: float, autonomy_score: float) -> str:
    if trust_score >= 0.78 and autonomy_score >= 0.70:
        return "Sleeve automation allowed"
    if trust_score >= 0.62 and autonomy_score >= 0.55:
        return "Stage position"
    if trust_score >= 0.48 and autonomy_score >= 0.40:
        return "Guardrail required"
    if trust_score >= 0.34:
        return "Suggest only"
    return "Explain only"


def _describe_recoverability(frontier_distance: float) -> str:
    if frontier_distance >= 0.05:
        return "Healthy"
    if frontier_distance >= -0.02:
        return "Narrow"
    return "Tight"


def _pick_shadow_sleeve(screener: dict[str, Any]) -> list[str]:
    rows = screener.get("rows", [])
    sectors = {
        str(row.get("sector"))
        for row in rows[:12]
        if not row.get("is_current_holding") and row.get("sector")
    }
    sleeves: list[str] = []
    if "Utilities" not in sectors and "Consumer Staples" not in sectors:
        sleeves.append("Defensive dividend quality")
    if "Financials" not in sectors:
        sleeves.append("Broadening basket")
    sleeves.append("Rate-sensitive cash generators")
    return sleeves[:3]


def _pick_trim_signal(portfolio: dict[str, Any], screener: dict[str, Any]) -> dict[str, Any] | None:
    screener_rows = screener.get("rows", [])
    held_rows = [row for row in screener_rows if row.get("is_current_holding")]
    if held_rows:
        return min(
            held_rows,
            key=lambda row: (
                _number_or(row.get("valuation_gap"), 0.0),
                -_number_or(row.get("discovery_score"), _number_or(row.get("composite_score"), 0.0)),
            ),
        )
    holdings = portfolio.get("holdings") or portfolio.get("top_holdings") or []
    with_upside = [row for row in holdings if _number_or(row.get("upside")) is not None]
    if not with_upside:
        return None
    return min(with_upside, key=lambda row: _number_or(row.get("upside"), 0.0))


def _build_protocol_snapshot(
    overview: dict[str, Any],
    risk: dict[str, Any],
    hedges: dict[str, Any],
    portfolio: dict[str, Any],
    screener: dict[str, Any],
    *,
    warnings: list[str],
) -> dict[str, Any]:
    confidence = _number_or(overview.get("confidence"), 0.5) or 0.5
    stale_days = [
        _number_or(payload.get("stale_days"))
        for payload in (risk, hedges, portfolio, screener)
        if isinstance(payload, dict)
    ]
    stale_days = [int(value) for value in stale_days if value is not None]
    has_stale = any(value > 30 for value in stale_days)
    has_aging = any(value > 7 for value in stale_days)
    freshness = 0.72 if warnings else 0.92
    if has_aging:
        freshness -= 0.08
    if has_stale:
        freshness -= 0.12
    freshness = _clamp01(max(freshness, 0.35))
    drift_penalty = 0.20 if has_stale else 0.12 if has_aging else 0.08
    trust_score = _clamp01(confidence * freshness * (1.0 - drift_penalty))

    crash_prob = _number_or(overview.get("crash_prob"), 0.35) or 0.35
    tail_risk = _number_or(overview.get("tail_risk_score"), 0.35) or 0.35
    compression = (
        _number_or(risk.get("spectral", {}).get("latest", {}).get("compression_score"))
        or _number_or(overview.get("compression_score"))
        or 0.45
    )
    alignment = portfolio.get("alignment", {})
    analytics = portfolio.get("analytics", {})
    beta_target = _number_or(overview.get("beta_target"), _number_or(alignment.get("beta_target")))
    current_beta = _number_or(alignment.get("portfolio_beta"), _number_or(analytics.get("Beta")))
    beta_penalty = max((current_beta or 0.0) - (beta_target or 0.0), 0.0) if beta_target is not None and current_beta is not None else 0.08
    hedge_weight = _number_or(alignment.get("selected_hedge_weight"), 0.06) or 0.06
    mismatch_count = len(alignment.get("mismatched_sectors") or []) or 1

    autonomy_score = _clamp01(
        0.68
        + hedge_weight * 0.90
        - crash_prob * 0.28
        - tail_risk * 0.18
        - compression * 0.16
        - mismatch_count * 0.04
        - beta_penalty * 0.35
    )
    reserve_target = 0.52 + crash_prob * 0.18 + mismatch_count * 0.03
    frontier_distance = autonomy_score - reserve_target
    trust_state = _describe_trust_state(trust_score)
    decision_rights = _describe_decision_rights(trust_score, autonomy_score)
    recoverability_budget = _describe_recoverability(frontier_distance)

    trim_signal = _pick_trim_signal(portfolio, screener) or {}
    support_dependency = {
        "passive_flows": _clamp01(compression * 0.55 + crash_prob * 0.12),
        "valuation_tolerance": _clamp01(abs(_number_or(trim_signal.get("valuation_gap"), 0.18) or 0.18)),
        "cheap_refinancing": _clamp01(0.12 + beta_penalty * 0.60 + tail_risk * 0.12),
        "narrative_breadth": _clamp01(0.15 + mismatch_count * 0.07),
    }
    top_hedge_score = _number_or((hedges.get("ranking") or [{}])[0].get("score"), 0.08) or 0.08
    protective_value = {
        "cash": _clamp01(hedge_weight),
        "duration": _clamp01(hedge_weight + 0.04),
        "convexity": _clamp01(top_hedge_score),
        "quality": _clamp01(0.08 + confidence * 0.08),
    }

    if trust_state == "Protect":
        protocol = "protect_and_rebuild"
    elif frontier_distance < -0.05:
        protocol = "wean_and_rebuild"
    elif trust_state == "Stage":
        protocol = "challenge_and_stage"
    else:
        protocol = "preserve_and_compound"

    step_down_trials = []
    for name, shock, sensitivity in [
        ("Flow withdrawal", "Reduce passive support by 20%", support_dependency["passive_flows"] * 0.22),
        ("Valuation compression", "Compress valuation tolerance by 1 standard deviation", support_dependency["valuation_tolerance"] * 0.26),
        ("Breadth collapse", "Narrow idea breadth across the book", support_dependency["narrative_breadth"] * 0.21),
    ]:
        trial_score = _clamp01(autonomy_score - sensitivity)
        verdict = "Still recoverable" if trial_score >= 0.55 else "Needs staged response" if trial_score >= 0.40 else "Protection first"
        step_down_trials.append(
            {
                "name": name,
                "shock": shock,
                "autonomy_score": trial_score,
                "verdict": verdict,
            }
        )

    stability_gap = _clamp01(compression * 0.45 + crash_prob * 0.30 + tail_risk * 0.25)
    recoverability_gap = max(-frontier_distance, 0.0)
    epistemic_gap = _clamp01(1.0 - trust_score)

    return {
        "protocol": protocol,
        "protocol_label": _humanize_label(protocol),
        "trust_score": trust_score,
        "trust_state": trust_state,
        "decision_rights": decision_rights,
        "autonomy_score": autonomy_score,
        "frontier_distance": frontier_distance,
        "recoverability_budget": recoverability_budget,
        "support_dependency": support_dependency,
        "protective_value": protective_value,
        "step_down_trials": step_down_trials,
        "disproof_sleeve": _pick_shadow_sleeve(screener),
        "gaps": {
            "stability_gap": stability_gap,
            "recoverability_gap": recoverability_gap,
            "epistemic_gap": epistemic_gap,
        },
        "notes": [
            f"Decision rights are currently {decision_rights.lower()}.",
            f"Trust is in {trust_state.lower()} mode, so the system should {'speak clearly' if trust_state == 'Act' else 'add in stages' if trust_state == 'Stage' else 'watch more than add' if trust_state == 'Observe' else 'protect capital first'}.",
            f"Recoverability budget is {recoverability_budget.lower()}, with frontier distance {frontier_distance:+.1%}.",
        ],
        "stale_days": max(stale_days) if stale_days else None,
    }


def _build_screener_snapshot(paths: PathConfig, statement_overlay: pd.DataFrame | None = None) -> dict[str, Any]:
    latest_root = paths.resolve_portfolio_manager_latest_root(
        "screener.csv",
        "valuation_summary.csv",
        "holdings_normalized.csv",
    )
    screener_source = latest_root / "discovery_screener.csv" if (latest_root / "discovery_screener.csv").exists() else latest_root / "screener.csv"
    screener = _load_preferred_screener(latest_root)
    daily_hits = _safe_csv_load(latest_root / "daily_screener_hits.csv", sep=";", decimal=",", thousands=".")
    if not screener.empty:
        for column in ["composite_score", "quality_score", "value_score", "risk_score", "growth_score", "momentum_6m", "valuation_gap", "suggested_position", "fair_value", "current_price"]:
            if column in screener.columns:
                screener[column] = pd.to_numeric(screener[column], errors="coerce")
        for column in ["discovery_score", "owner_elasticity_score", "market_cap", "current_volume", "avg_volume_20", "volume_ratio_20", "dollar_volume_20"]:
            if column in screener.columns:
                screener[column] = pd.to_numeric(screener[column], errors="coerce")
        if statement_overlay is not None and not statement_overlay.empty:
            overlay_columns = [
                "ticker",
                "statement_score",
                "statement_conviction_score",
                "statement_bucket",
                "earnings_cash_kernel_score",
                "earnings_cash_kernel_bucket",
                "kernel_data_quality",
            ]
            available_overlay_columns = [column for column in overlay_columns if column in statement_overlay.columns]
            screener = screener.merge(statement_overlay[available_overlay_columns].copy(), on="ticker", how="left")
        primary_sort = "discovery_score" if "discovery_score" in screener.columns else "composite_score"
        screener = screener.sort_values([primary_sort, "suggested_position"], ascending=[False, False])
    owner_elasticity = summarize_owner_elasticity(screener)
    return {
        "rows": _frame_to_records(screener),
        "columns": list(screener.columns),
        "daily_hits": _frame_to_records(daily_hits),
        "owner_elasticity_top_names": owner_elasticity.get("top_names", []),
        "owner_elasticity_sector_breadth": owner_elasticity.get("sector_breadth", []),
        "default_sort": {"column": "discovery_score" if "discovery_score" in screener.columns else "composite_score", "direction": "desc"},
        "source_file": screener_source.name,
        "as_of": _path_mtime(screener_source).isoformat() if _path_mtime(screener_source) is not None else None,
        "stale_days": _staleness_days(_path_mtime(screener_source), pd.Timestamp.today().normalize()),
    }


def _build_risk_snapshot(
    state_panel: pd.DataFrame,
    proxy_prices: pd.DataFrame,
    overview_payload: dict[str, Any],
    policy_decision: dict[str, Any],
    research_settings: ResearchSettings,
    forecast_summary: dict[str, Any],
    *,
    fred_client: FREDClient | None,
    spectral_summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    as_of_date = pd.to_datetime(overview_payload.get("as_of_date") or pd.Timestamp.today().normalize())
    latest_policy_state = build_policy_state_frame(pd.DatetimeIndex([as_of_date]), state_panel, proxy_prices, research_settings)
    latest_row = latest_policy_state.iloc[-1].to_dict() if not latest_policy_state.empty else {}

    macro = {
        "term_spread": latest_row.get("fred_term_spread"),
        "high_yield_spread": latest_row.get("fred_hy_spread"),
        "hy_ig_gap": latest_row.get("fred_hy_ig_gap"),
        "m2_yoy": latest_row.get("fred_m2_yoy"),
        "balance_sheet_yoy": latest_row.get("fred_balance_sheet_yoy"),
    }
    if fred_client is not None:
        try:
            fred_panel = fred_client.get_macro_panel(research_settings.fred_series, (as_of_date - pd.Timedelta(days=500)).date().isoformat(), as_of_date.date().isoformat())
            if not fred_panel.empty:
                latest = fred_panel.sort_values("date").iloc[-1].to_dict()
                macro.update(
                    {
                        "dgs10": latest.get("DGS10"),
                        "dgs2": latest.get("DGS2"),
                        "fedfunds": latest.get("FEDFUNDS"),
                        "vix": latest.get("VIXCLS"),
                        "m2_level": latest.get("M2SL"),
                        "walcl": latest.get("WALCL"),
                    }
                )
        except Exception:
            pass

    historical_context = build_daily_regime_frame([as_of_date]).iloc[-1].to_dict()
    if isinstance(historical_context.get("date"), pd.Timestamp):
        historical_context["date"] = historical_context["date"].date().isoformat()

    return {
        "state": overview_payload.get("state", {}),
        "tail_risk": overview_payload.get("tail_risk_latest", {}),
        "historical_context": historical_context,
        "spectral": spectral_summary or {},
        "structure": {
            "crowding_pct": latest_row.get("crowding_pct"),
            "breadth_20d": latest_row.get("breadth_20d"),
            "dispersion_20d": latest_row.get("dispersion_20d"),
            "mean_corr_20d": latest_row.get("mean_corr_20d"),
            "effective_dimension_20d": latest_row.get("d_eff_20d"),
            "avg_pair_corr_60d": latest_row.get("avg_pair_corr_60d"),
            "pct_positive_20d": latest_row.get("pct_positive_20d"),
            "advance_decline_ratio": latest_row.get("advance_decline_ratio"),
            "momentum_concentration_60d": latest_row.get("momentum_concentration_60d"),
            "realized_cross_sectional_vol": latest_row.get("realized_cross_sectional_vol"),
            "spy_mom_20d": latest_row.get("spy_mom_20d"),
            "spy_vol_20d": latest_row.get("spy_vol_20d"),
            "spy_drawdown_20d": latest_row.get("spy_drawdown_20d"),
            "gold_return_3m": latest_row.get("gold_return_3m"),
            "dollar_return_3m": latest_row.get("dollar_return_3m"),
            "oil_return_3m": latest_row.get("oil_return_3m"),
            "gold_commodity_ratio": latest_row.get("gold_commodity_ratio"),
        },
        "macro": macro,
        "explanation": policy_decision.get("explanation_fields", {}),
        "forecast_baseline": forecast_summary,
    }


def _build_status(snapshot: dict[str, Any], warnings: list[str]) -> dict[str, Any]:
    panels = []
    for name in ["performance", "risk", "hedges", "sectors", "international", "portfolio", "protocol", "screener", "forecast", "statement_intelligence"]:
        payload = snapshot.get(name, {})
        stale_days = payload.get("stale_days")
        status = "fresh"
        if stale_days is None:
            status = "unknown"
        elif stale_days > 30:
            status = "stale"
        elif stale_days > 7:
            status = "aging"
        panels.append({"name": name, "stale_days": stale_days, "status": status})
    bls_state = snapshot.get("bls_state_v1") or {}
    contract_status = "fallback_legacy"
    if bls_state:
        contract_status = bls_state.get("status", {}).get("contract_status", "canonical_valid")
    return {
        "warnings": warnings,
        "panels": panels,
        "last_refresh": snapshot.get("generated_at"),
        "contract_status": contract_status,
        "contract_version": bls_state.get("contract_version"),
        "model_version": bls_state.get("model_version"),
        "contract_validation": bls_state.get("status", {}).get("contract_validation", {}),
    }


def _extract_overview(payload: dict[str, Any]) -> dict[str, Any]:
    overlay = payload.get("overlay_report", {})
    policy = payload.get("policy_decision", {})
    behavioral_state = policy.get("behavioral_state", payload.get("behavioral_state", {}))
    weights = payload.get("weights", {})
    return {
        "as_of_date": overlay.get("as_of_date"),
        "regime": overlay.get("state", {}).get("regime"),
        "crash_prob": overlay.get("state", {}).get("crash_prob"),
        "tail_risk_score": overlay.get("state", {}).get("tail_risk_score"),
        "legitimacy_risk": overlay.get("state", {}).get("legitimacy_risk"),
        "beta_target": payload.get("beta_target", policy.get("beta_target")),
        "selected_hedge": payload.get("selected_hedge", policy.get("selected_hedge")),
        "confidence": payload.get("policy_confidence", policy.get("confidence")),
        "expected_utility": payload.get("policy_expected_utility", policy.get("expected_utility")),
        "consensus_fragility_score": behavioral_state.get("consensus_fragility_score"),
        "belief_capacity_misalignment": behavioral_state.get("belief_capacity_misalignment"),
        "consensus_fragility_narrative": behavioral_state.get("consensus_fragility_narrative", []),
        "alternative_action": payload.get("best_alternative_action", policy.get("alternative_action")),
        "recommended_action": payload.get("recommended_policy", policy.get("recommended_action")),
        "policy_recommended_action": policy.get("policy_recommended_action"),
        "best_hedge_now": payload.get("best_hedge_now", policy.get("selected_hedge")),
        "why_this_action": policy.get("explanation_fields", {}).get("why_this_action", []),
        "conditions_that_flip": policy.get("explanation_fields", {}).get("conditions_that_flip_decision", []),
        "scenario_narrative": policy.get("explanation_fields", {}).get("scenario_narrative", []),
        "scenario_synthesis": policy.get("scenario_synthesis", {}),
        "current_weights": weights,
        "tail_risk_latest": payload.get("tail_risk", {}),
        "spectral_state": payload.get("spectral", {}).get("latest", {}).get("structural_state"),
        "compression_score": payload.get("spectral", {}).get("latest", {}).get("compression_score"),
        "freedom_score": payload.get("spectral", {}).get("latest", {}).get("freedom_score"),
        "structural_beta_ceiling": payload.get("spectral", {}).get("latest", {}).get("structural_beta_ceiling"),
        "structural_suggested_stance": payload.get("spectral", {}).get("latest", {}).get("suggested_stance"),
        "vix": overlay.get("macro", {}).get("vix") or payload.get("risk", {}).get("macro", {}).get("vix"),
    }


def load_cached_snapshot(paths: PathConfig, dashboard_settings: DashboardSettings) -> dict[str, Any] | None:
    remote_url = remote_snapshot_url()
    if remote_url:
        payload = _safe_remote_json_load(remote_url)
        if payload is not None:
            return payload
    persisted_snapshot = load_runtime_snapshot("dashboard/latest")
    if persisted_snapshot is not None:
        return persisted_snapshot
    persisted = load_runtime_document("dashboard_snapshot")
    if persisted is not None:
        return persisted
    for snapshot_path in _artifact_snapshot_candidates(paths, dashboard_settings):
        payload = _safe_json_load(snapshot_path)
        if payload is not None:
            return payload
    return None


def _empty_snapshot(*, generated_at: str, warnings: list[str]) -> dict[str, Any]:
    snapshot = {
        "generated_at": generated_at,
        "as_of_date": None,
        "overview": {},
        "performance": {"summary_metrics": {}, "benchmark_table": [], "series": [], "oos_blocks": [], "regime_performance": [], "episode_performance": [], "confidence_split": {}},
        "risk": {"state": {}, "tail_risk": {}, "historical_context": {}, "spectral": {}, "structure": {}, "macro": {}, "explanation": {}, "forecast_baseline": {}},
        "forecast": {"latest": {}, "metrics": [], "warnings": []},
        "hedges": {"ranking": []},
        "sectors": {"records": [], "preferred": [], "deteriorating": []},
        "international": {"records": [], "preferred": []},
        "portfolio": {"top_holdings": [], "sector_weights": [], "alignment": {"notes": ["No portfolio data is available yet."]}},
        "protocol": {
            "protocol": "protect_and_rebuild",
            "protocol_label": "Protect And Rebuild",
            "trust_score": 0.24,
            "trust_state": "Protect",
            "decision_rights": "Explain only",
            "autonomy_score": 0.22,
            "frontier_distance": -0.22,
            "recoverability_budget": "Tight",
            "support_dependency": {
                "passive_flows": 0.18,
                "valuation_tolerance": 0.14,
                "cheap_refinancing": 0.12,
                "narrative_breadth": 0.10,
            },
            "protective_value": {
                "cash": 0.04,
                "duration": 0.06,
                "convexity": 0.03,
                "quality": 0.05,
            },
            "step_down_trials": [],
            "disproof_sleeve": [
                "Defensive dividend quality",
                "Broadening basket",
                "Rate-sensitive cash generators",
            ],
            "gaps": {
                "stability_gap": 0.32,
                "recoverability_gap": 0.22,
                "epistemic_gap": 0.76,
            },
            "notes": [
                "Decision rights are currently explain only.",
                "Trust is in protect mode, so the system should protect capital first.",
                "Recoverability budget is tight until fresh portfolio and research data arrive.",
            ],
            "stale_days": None,
        },
        "screener": {"rows": [], "count": 0, "default_sort": {"column": "discovery_score", "direction": "desc"}},
        "statement_intelligence": {
            "top_statement_names": [],
            "top_compounders": [],
            "top_cash_generators": [],
            "top_kernel_names": [],
            "cash_mismatch_names": [],
            "kernel_sector_breadth": [],
            "kernel_research_utility": {},
            "risk_names": [],
            "coverage": 0,
            "holdings_coverage": 0,
        },
        "bls_state_v1": None,
    }
    snapshot["status"] = _build_status(snapshot, warnings)
    return snapshot


def _write_snapshot_files(snapshot: dict[str, Any], output_dir: Path) -> None:
    bls_state = snapshot.get("bls_state_v1") or {}
    files = {
        "dashboard_snapshot.json": snapshot,
        "decision_packet.json": snapshot.get("decision_packet", {}),
        "overview.json": snapshot.get("overview", {}),
        "performance.json": snapshot.get("performance", {}),
        "risk.json": snapshot.get("risk", {}),
        "spectral.json": snapshot.get("risk", {}).get("spectral", {}),
        "forecast.json": snapshot.get("forecast", {}),
        "hedges.json": snapshot.get("hedges", {}),
        "sectors.json": snapshot.get("sectors", {}),
        "international.json": snapshot.get("international", {}),
        "portfolio.json": snapshot.get("portfolio", {}),
        "protocol.json": snapshot.get("protocol", {}),
        "screener.json": snapshot.get("screener", {}),
        "statement_intelligence.json": snapshot.get("statement_intelligence", {}),
        "statement_kernel.json": {
            "top_kernel_names": snapshot.get("statement_intelligence", {}).get("top_kernel_names", []),
            "cash_mismatch_names": snapshot.get("statement_intelligence", {}).get("cash_mismatch_names", []),
            "kernel_sector_breadth": snapshot.get("statement_intelligence", {}).get("kernel_sector_breadth", []),
            "kernel_research_utility": snapshot.get("statement_intelligence", {}).get("kernel_research_utility", {}),
        },
        "bls_state_v1.json": bls_state,
        "state-contract.json": bls_state,
        "state.json": {
            "as_of": bls_state.get("as_of"),
            "portfolio_id": bls_state.get("portfolio_id"),
            "horizon_days": bls_state.get("horizon_days"),
            "contract_version": bls_state.get("contract_version"),
            "model_version": bls_state.get("model_version"),
            "measured_state": bls_state.get("measured_state", {}),
            "probabilistic_state": bls_state.get("probabilistic_state", {}),
            "uncertainty": bls_state.get("uncertainty", {}),
        },
        "policy.json": {
            "as_of": bls_state.get("as_of"),
            "portfolio_id": bls_state.get("portfolio_id"),
            "horizon_days": bls_state.get("horizon_days"),
            "contract_version": bls_state.get("contract_version"),
            "model_version": bls_state.get("model_version"),
            "policy_state": bls_state.get("policy_state", {}),
            "uncertainty": bls_state.get("uncertainty", {}),
        },
        "repairs.json": {
            "as_of": bls_state.get("as_of"),
            "portfolio_id": bls_state.get("portfolio_id"),
            "horizon_days": bls_state.get("horizon_days"),
            "contract_version": bls_state.get("contract_version"),
            "model_version": bls_state.get("model_version"),
            "baseline_recoverability": bls_state.get("probabilistic_state", {}).get("p_portfolio_recoverability"),
            "baseline_phantom_rebound": bls_state.get("probabilistic_state", {}).get("p_phantom_rebound"),
            "repair_candidates": bls_state.get("repair_candidates", []),
            "uncertainty": bls_state.get("uncertainty", {}),
        },
        "analogs.json": {
            "as_of": bls_state.get("as_of"),
            "portfolio_id": bls_state.get("portfolio_id"),
            "horizon_days": bls_state.get("horizon_days"),
            "contract_version": bls_state.get("contract_version"),
            "model_version": bls_state.get("model_version"),
            "analogs": bls_state.get("analogs", []),
            "uncertainty": bls_state.get("uncertainty", {}),
        },
        "status.json": snapshot.get("status", {}),
    }
    local_write_error: Exception | None = None
    try:
        ensure_directory(output_dir)
        for name, payload in files.items():
            (output_dir / name).write_text(json.dumps(payload, indent=2, default=_json_default), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        local_write_error = exc
        print(f"[dashboard] local snapshot cache write failed: {exc}")

    runtime_write_error: Exception | None = None
    try:
        save_runtime_document(
            "dashboard_snapshot",
            snapshot,
            {
                "generated_at": snapshot.get("generated_at"),
                "as_of_date": snapshot.get("as_of_date"),
                "source": "dashboard_snapshot",
            },
        )
    except Exception as exc:  # noqa: BLE001
        runtime_write_error = exc
        print(f"[dashboard] runtime snapshot cache write failed: {exc}")

    try:
        save_runtime_snapshot(
            snapshot,
            snapshot_key="dashboard/latest",
            source="dashboard_snapshot",
            status="ready",
        )
    except Exception as exc:  # noqa: BLE001
        if runtime_write_error is None:
            runtime_write_error = exc
        print(f"[dashboard] runtime snapshot table write failed: {exc}")

    if local_write_error is not None and runtime_write_error is not None:
        raise local_write_error


def _load_current_payload(paths: PathConfig) -> dict[str, Any] | None:
    local_payload = _safe_json_load(paths.output_root / "production" / "latest" / "current_allocator_decision.json")
    if local_payload is not None:
        save_runtime_document(
            "current_allocator_decision",
            local_payload,
            {
                "source": "local_output",
            },
        )
        return local_payload
    return load_runtime_document("current_allocator_decision")


def build_dashboard_snapshot(
    paths: PathConfig,
    research_settings: ResearchSettings,
    allocator_settings: AllocatorSettings,
    dashboard_settings: DashboardSettings,
    *,
    refresh_outputs: bool = True,
) -> dict[str, Any]:
    warnings: list[str] = []
    chile_market = build_chile_market_snapshot(paths, refresh=refresh_outputs)
    if chile_market.get("warnings"):
        warnings.extend(chile_market["warnings"])
    current_payload = None
    if refresh_outputs:
        bootstrap_result = ensure_runtime_inputs(paths, research_settings, fmp_client=FMPClient.from_env(paths.cache_root))
        if bootstrap_result.bootstrapped:
            warnings.append(
                "runtime bootstrap populated: " + ", ".join(bootstrap_result.bootstrapped[:6])
                + ("..." if len(bootstrap_result.bootstrapped) > 6 else "")
            )
        missing_inputs = _missing_production_inputs(paths)
        if missing_inputs:
            missing_labels = ", ".join(_format_missing_input(path, paths.project_root) for path in missing_inputs[:6])
            warnings.append(f"production refresh skipped: missing required inputs ({missing_labels})")
            current_payload = _load_current_payload(paths)
        else:
            try:
                current_payload = run_production(paths, research_settings, allocator_settings)
            except Exception as exc:
                warnings.append(f"production refresh failed: {exc}")
                current_payload = _load_current_payload(paths)
    else:
        current_payload = _load_current_payload(paths)

    if current_payload is None:
        cached = load_cached_snapshot(paths, dashboard_settings)
        if cached is not None:
            try:
                cached = _refresh_cached_snapshot_market_data(cached, paths, research_settings, dashboard_settings)
                warnings.append("using cached research snapshot with refreshed market data")
            except Exception as exc:
                warnings.append(f"market refresh on cached snapshot failed: {exc}")
            cached.setdefault("status", {})
            cached["status"]["warnings"] = list(cached["status"].get("warnings", [])) + warnings + ["using cached snapshot because current payload is unavailable"]
            if not cached.get("bls_state_v1"):
                try:
                    cached["_output_root"] = str(paths.output_root)
                    cached["bls_state_v1"] = build_bls_state_contract_v1(cached, paths=paths)
                except Exception as exc:  # noqa: BLE001
                    cached["status"]["warnings"].append(f"bls state contract build failed on cached snapshot: {exc}")
                    cached["bls_state_v1"] = None
            cached["_output_root"] = str(paths.output_root)
            cached["decision_packet"] = build_decision_packet(cached)
            cached["decision_event_log"] = record_decision_events(cached, paths.output_root)
            cached["decision_events"] = cached["decision_event_log"].get("events", [])
            cached["decision_event"] = cached["decision_event_log"].get("latest_refresh")
            cached.pop("_output_root", None)
            cached["status"] = _build_status(cached, cached["status"]["warnings"])
            cached["status"]["auto_refresh_seconds"] = dashboard_settings.auto_refresh_seconds
            _write_snapshot_files(cached, dashboard_settings.output_dir)
            return cached
        empty = _empty_snapshot(
            generated_at=datetime.now(tz=UTC).isoformat(),
            warnings=warnings + ["no current allocator payload or cached snapshot is available"],
        )
        empty["chile_market"] = chile_market
        empty["_output_root"] = str(paths.output_root)
        empty["decision_packet"] = build_decision_packet(empty)
        empty["decision_event_log"] = record_decision_events(empty, paths.output_root)
        empty["decision_events"] = empty["decision_event_log"].get("events", [])
        empty["decision_event"] = empty["decision_event_log"].get("latest_refresh")
        empty.pop("_output_root", None)
        empty["status"]["auto_refresh_seconds"] = dashboard_settings.auto_refresh_seconds
        _write_snapshot_files(empty, dashboard_settings.output_dir)
        return empty

    overview = _extract_overview(current_payload)
    fmp_client = FMPClient.from_env(paths.cache_root)
    fred_client = FREDClient.from_env(paths.cache_root)
    state_panel = load_state_panel(paths)
    tail_risk_panel = _safe_csv_load(paths.output_root / "tail_risk" / "latest" / "tail_risk_predictions.csv")
    if not tail_risk_panel.empty and "date" in tail_risk_panel.columns:
        merge_cols = ["date"] + [column for column in tail_risk_panel.columns if column != "date" and column not in state_panel.columns]
        state_panel = time_safe_join(state_panel, tail_risk_panel[merge_cols], on="date")
    latest_root = paths.resolve_portfolio_manager_latest_root(
        "screener.csv",
        "valuation_summary.csv",
        "holdings_normalized.csv",
    )
    holdings = _safe_semicolon_csv(latest_root / "holdings_normalized.csv")
    holding_tickers = holdings["ticker"].astype(str).tolist() if not holdings.empty and "ticker" in holdings.columns else []
    market_tickers = holding_tickers + ["SPY", *research_settings.hedge_tickers, *research_settings.market_proxy_tickers]
    market_panel, market_quotes = _build_live_market_panel(paths, dashboard_settings, market_tickers, fmp_client=fmp_client)

    production_root = paths.output_root / "production" / "latest"
    sector_map = _load_runtime_backed_csv(production_root / "current_sector_map.csv", "production:current_sector_map")
    international_map = _load_runtime_backed_csv(production_root / "current_international_map.csv", "production:current_international_map")
    hedge_ranking = _load_runtime_backed_csv(production_root / "current_hedge_ranking.csv", "production:current_hedge_ranking")

    sectors = {
        "records": _frame_to_records(sector_map),
        "preferred": _frame_to_records(sector_map.loc[sector_map.get("view", pd.Series(dtype=str)) == "preferred"], limit=6),
        "deteriorating": _frame_to_records(sector_map.sort_values("defense_fit", ascending=False), limit=5) if "defense_fit" in sector_map.columns else [],
        "cross_section_staleness_days": current_payload.get("overlay_report", {}).get("selection_context", {}).get("cross_section_staleness_days"),
        "stale_days": _staleness_days(_path_mtime(production_root / "current_sector_map.csv"), pd.Timestamp.today().normalize()),
    }
    international = {
        "records": _frame_to_records(international_map),
        "preferred": _frame_to_records(international_map.loc[international_map.get("view", pd.Series(dtype=str)) == "preferred"], limit=6),
        "stale_days": _staleness_days(_path_mtime(production_root / "current_international_map.csv"), pd.Timestamp.today().normalize()),
    }
    hedges = {
        "selected_hedge": current_payload.get("selected_hedge"),
        "best_hedge_now": current_payload.get("best_hedge_now"),
        "alternative_hedge": current_payload.get("overlay_report", {}).get("hedge_summary", {}).get("secondary_hedge"),
        "us_treasuries_best_hedge": current_payload.get("overlay_report", {}).get("hedge_summary", {}).get("us_treasuries_best_hedge"),
        "ranking": _frame_to_records(hedge_ranking),
        "stale_days": _staleness_days(_path_mtime(production_root / "current_hedge_ranking.csv"), pd.Timestamp.today().normalize()),
    }
    try:
        forecast_artifacts = run_forecast_baselines(paths, research_settings, state_panel, market_panel)
    except Exception as exc:
        warnings.append(f"forecast baseline refresh failed: {exc}")
        forecast_artifacts = type("ForecastFallback", (), {"summary": {"latest": {}, "metrics": [], "warnings": [str(exc)]}})()
    forecast_latest = forecast_artifacts.summary.get("latest", {})
    try:
        spectral_artifacts = run_spectral_structure_pipeline(
            paths,
            research_settings,
            market_panel,
            current_payload.get("weights", {}),
        )
    except Exception as exc:
        warnings.append(f"spectral structure refresh failed: {exc}")
        spectral_artifacts = type("SpectralFallback", (), {"summary": {"latest": {}, "history": [], "monte_carlo": {}}})()
    current_payload["spectral"] = spectral_artifacts.summary
    risk = _build_risk_snapshot(
        state_panel,
        market_panel,
        current_payload.get("overlay_report", {}),
        current_payload.get("policy_decision", {}),
        research_settings,
        forecast_latest,
        fred_client=fred_client,
        spectral_summary=spectral_artifacts.summary,
    )
    risk["stale_days"] = max(
        _staleness_days(_path_mtime(paths.output_root / "tail_risk" / "latest" / "tail_risk_summary.json"), pd.Timestamp.today().normalize()) or 0,
        _staleness_days(_path_mtime(research_settings.spectral_output_dir / "spectral_summary.json"), pd.Timestamp.today().normalize()) or 0,
    )
    performance = _build_performance_snapshot(paths, dashboard_settings)
    overview["sectors"] = {"preferred": sectors["preferred"]}
    overview["forecast_baseline"] = forecast_latest
    overview["spectral_state"] = spectral_artifacts.summary.get("latest", {}).get("structural_state")
    overview["compression_score"] = spectral_artifacts.summary.get("latest", {}).get("compression_score")
    overview["freedom_score"] = spectral_artifacts.summary.get("latest", {}).get("freedom_score")
    overview["structural_beta_ceiling"] = spectral_artifacts.summary.get("latest", {}).get("structural_beta_ceiling")
    overview["structural_suggested_stance"] = spectral_artifacts.summary.get("latest", {}).get("suggested_stance")
    overview["vix"] = risk.get("macro", {}).get("vix")
    try:
        statement_artifacts = run_statement_intelligence(paths, research_settings)
    except Exception as exc:
        warnings.append(f"statement intelligence refresh failed: {exc}")
        statement_artifacts = type("StatementFallback", (), {"summary": {"top_statement_names": [], "risk_names": [], "coverage": 0, "holdings_coverage": 0}, "panel": pd.DataFrame(columns=["ticker", "statement_score", "statement_bucket", "statement_commentary"])})()
    if not sector_map.empty and statement_artifacts.summary.get("kernel_sector_breadth"):
        kernel_sector = pd.DataFrame(statement_artifacts.summary["kernel_sector_breadth"])
        if not kernel_sector.empty and "sector" in kernel_sector.columns:
            sector_map = sector_map.merge(kernel_sector, on="sector", how="left")
    portfolio = _build_portfolio_snapshot(paths, overview, market_panel, market_quotes)
    portfolio["statement_intelligence"] = statement_artifacts.summary
    screener = _build_screener_snapshot(paths, statement_artifacts.panel)
    protocol = _build_protocol_snapshot(
        overview,
        risk,
        hedges,
        portfolio,
        screener,
        warnings=warnings,
    )
    screener_overlay_columns = [
        "ticker",
        "statement_score",
        "statement_conviction_score",
        "statement_bucket",
        "statement_commentary",
        "earnings_cash_kernel_score",
        "earnings_cash_kernel_bucket",
        "earnings_cash_kernel_commentary",
        "kernel_data_quality",
    ]
    available_screener_overlay_columns = [column for column in screener_overlay_columns if column in statement_artifacts.panel.columns]
    screener["statement_overlay"] = _frame_to_records(statement_artifacts.panel[available_screener_overlay_columns], limit=200)

    snapshot_dict = {
        "generated_at": datetime.now(tz=UTC).isoformat(),
        "as_of_date": overview.get("as_of_date"),
        "_output_root": str(paths.output_root),
        "overview": overview,
        "performance": performance,
        "risk": risk,
        "forecast": {
            "latest": forecast_latest,
            "metrics": forecast_artifacts.summary.get("metrics", []),
            "warnings": forecast_artifacts.summary.get("warnings", []),
            "stale_days": _staleness_days(_path_mtime(research_settings.forecast_output_dir / "forecast_summary.json"), pd.Timestamp.today().normalize()),
        },
        "hedges": hedges,
        "sectors": sectors,
        "international": international,
        "chile_market": chile_market,
        "portfolio": portfolio,
        "protocol": protocol,
        "screener": screener,
        "statement_intelligence": {
            "top_statement_names": statement_artifacts.summary.get("top_statement_names", []),
            "top_compounders": statement_artifacts.summary.get("top_compounders", []),
            "top_cash_generators": statement_artifacts.summary.get("top_cash_generators", []),
            "top_kernel_names": statement_artifacts.summary.get("top_kernel_names", []),
            "cash_mismatch_names": statement_artifacts.summary.get("cash_mismatch_names", []),
            "kernel_sector_breadth": statement_artifacts.summary.get("kernel_sector_breadth", []),
            "kernel_research_utility": statement_artifacts.summary.get("kernel_research_utility", {}),
            "risk_names": statement_artifacts.summary.get("risk_names", []),
            "coverage": statement_artifacts.summary.get("coverage", 0),
            "holdings_coverage": statement_artifacts.summary.get("holdings_coverage", 0),
            "stale_days": _staleness_days(_path_mtime(research_settings.statement_output_dir / "statement_intelligence_summary.json"), pd.Timestamp.today().normalize()),
        },
    }
    try:
        snapshot_dict["bls_state_v1"] = build_bls_state_contract_v1(snapshot_dict, paths=paths)
    except Exception as exc:  # noqa: BLE001
        warnings.append(f"bls state contract build failed: {exc}")
        snapshot_dict["bls_state_v1"] = None
    snapshot_dict["decision_packet"] = build_decision_packet(snapshot_dict)
    snapshot_dict["decision_event_log"] = record_decision_events(snapshot_dict, paths.output_root)
    snapshot_dict["decision_events"] = snapshot_dict["decision_event_log"].get("events", [])
    snapshot_dict["decision_event"] = snapshot_dict["decision_event_log"].get("latest_refresh")
    snapshot_dict.pop("_output_root", None)
    snapshot_dict["status"] = _build_status(snapshot_dict, warnings)
    snapshot_dict["status"]["auto_refresh_seconds"] = dashboard_settings.auto_refresh_seconds
    snapshot = DashboardSnapshot(**snapshot_dict)
    payload = snapshot.__dict__
    _write_snapshot_files(payload, dashboard_settings.output_dir)
    return payload


def apply_screener_query(snapshot: dict[str, Any], query_string: str) -> dict[str, Any]:
    screener = snapshot.get("screener", {})
    rows = pd.DataFrame(screener.get("rows", []))
    params = parse_qs(query_string)
    search = (params.get("search") or [""])[0].strip().lower()
    sort_by = (params.get("sort_by") or [screener.get("default_sort", {}).get("column", "composite_score")])[0]
    direction = (params.get("direction") or [screener.get("default_sort", {}).get("direction", "desc")])[0]
    limit = int((params.get("limit") or ["100"])[0])
    if not rows.empty and search:
        mask = pd.Series(False, index=rows.index)
        for column in ["ticker", "sector", "industry", "thesis_bucket", "analyst_consensus"]:
            if column in rows.columns:
                mask = mask | rows[column].astype(str).str.lower().str.contains(search, na=False)
        rows = rows.loc[mask]
    if not rows.empty and sort_by in rows.columns:
        ascending = direction == "asc"
        rows = rows.sort_values(sort_by, ascending=ascending, na_position="last")
    return {
        "rows": _frame_to_records(rows, limit=limit),
        "count": int(len(rows)),
        "sort_by": sort_by,
        "direction": direction,
        "search": search,
    }
