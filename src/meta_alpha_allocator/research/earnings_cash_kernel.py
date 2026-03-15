from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..config import PathConfig, ResearchSettings
from ..data.adapters import load_fmp_market_proxy_panel
from ..data.fmp_client import FMPClient
from ..utils import ensure_directory


KERNEL_FORWARD_HORIZONS = (21, 63)


@dataclass(frozen=True)
class EarningsCashKernelArtifacts:
    latest_panel: pd.DataFrame
    history_panel: pd.DataFrame
    summary: dict


def _safe_semicolon_csv(path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, sep=";", decimal=",", thousands=".")


def _json_default(value):
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, np.generic):
        return value.item()
    if pd.isna(value):
        return None
    raise TypeError(f"Object of type {type(value)!r} is not JSON serializable")


def _sanitize_error_message(exc: Exception) -> str:
    text = str(exc)
    if "apikey=" in text:
        prefix, _, remainder = text.partition("apikey=")
        replacement = "[redacted]"
        if "&" in remainder:
            _, suffix = remainder.split("&", 1)
            return f"{prefix}apikey={replacement}&{suffix}"
        return f"{prefix}apikey={replacement}"
    return text


def _scalar_score(value: float | None, low: float, high: float, *, reverse: bool = False, neutral: float = 0.5) -> float:
    if value is None or pd.isna(value):
        return neutral
    if high == low:
        return neutral
    scaled = (float(value) - low) / (high - low)
    scaled = max(0.0, min(1.0, scaled))
    return 1.0 - scaled if reverse else scaled


def _first_available(frame: pd.DataFrame, columns: list[str]) -> pd.Series:
    series = pd.Series(np.nan, index=frame.index, dtype="object")
    for column in columns:
        if column in frame.columns:
            series = series.combine_first(frame[column])
    return series


def _build_universe(paths: PathConfig) -> pd.DataFrame:
    latest_root = paths.portfolio_manager_root / "output" / "latest"
    screener = _safe_semicolon_csv(latest_root / "screener.csv")
    holdings = _safe_semicolon_csv(latest_root / "holdings_normalized.csv")
    daily_hits = _safe_semicolon_csv(latest_root / "daily_screener_hits.csv")

    if not screener.empty:
        screener["ticker"] = screener["ticker"].astype(str)
    if not holdings.empty:
        holdings["ticker"] = holdings["ticker"].astype(str)
    if not daily_hits.empty and "ticker" in daily_hits.columns:
        daily_hits["ticker"] = daily_hits["ticker"].astype(str)

    universe = pd.DataFrame(columns=["ticker", "asset_type", "sector", "industry", "is_current_holding", "in_screener", "in_daily_hits"])
    if not screener.empty:
        screener_slice = screener[[column for column in ["ticker", "asset_type", "sector", "industry"] if column in screener.columns]].copy()
        screener_slice["in_screener"] = True
        universe = screener_slice
    if not holdings.empty:
        holdings_slice = holdings[[column for column in ["ticker", "asset_type", "sector", "industry"] if column in holdings.columns]].copy()
        holdings_slice["is_current_holding"] = True
        universe = universe.merge(holdings_slice, on="ticker", how="outer", suffixes=("", "_holding")) if not universe.empty else holdings_slice
    if not daily_hits.empty:
        hit_columns = [column for column in ["ticker", "asset_type", "sector", "industry"] if column in daily_hits.columns]
        hits_slice = daily_hits[hit_columns].drop_duplicates("ticker").copy()
        hits_slice["in_daily_hits"] = True
        universe = universe.merge(hits_slice, on="ticker", how="outer", suffixes=("", "_hits")) if not universe.empty else hits_slice

    if universe.empty:
        return universe

    for column in ["asset_type", "sector", "industry"]:
        candidates = [name for name in universe.columns if name == column or name.startswith(f"{column}_")]
        if len(candidates) > 1:
            universe[column] = _first_available(universe, candidates)
            drop_columns = [name for name in candidates if name != column]
            if drop_columns:
                universe = universe.drop(columns=drop_columns)

    for flag in ["is_current_holding", "in_screener", "in_daily_hits"]:
        if flag not in universe.columns:
            universe[flag] = False
        universe[flag] = universe[flag].fillna(False).astype(bool)

    universe["asset_type"] = universe.get("asset_type", pd.Series("equity", index=universe.index)).fillna("equity")
    universe["sector"] = universe.get("sector", pd.Series("Unknown", index=universe.index)).fillna("Unknown")
    universe["industry"] = universe.get("industry", pd.Series("Unknown", index=universe.index)).fillna("Unknown")
    return universe.drop_duplicates("ticker").sort_values(["is_current_holding", "in_screener", "ticker"], ascending=[False, False, True]).reset_index(drop=True)


def _prepare_statement_history(symbol: str, client: FMPClient) -> pd.DataFrame:
    income = client.get_income_statements(symbol, period="quarter", limit=40)
    cash = client.get_cash_flow_statements(symbol, period="quarter", limit=40)
    balance = client.get_balance_sheet_statements(symbol, period="quarter", limit=40)
    if income.empty and cash.empty and balance.empty:
        return pd.DataFrame()

    income_keep = [column for column in ["date", "calendarYear", "period", "acceptedDate", "fillingDate", "revenue", "netIncome"] if column in income.columns]
    cash_keep = [column for column in ["date", "calendarYear", "period", "acceptedDate", "fillingDate", "netCashProvidedByOperatingActivities", "freeCashFlow", "capitalExpenditure", "changeInWorkingCapital"] if column in cash.columns]
    balance_keep = [column for column in ["date", "calendarYear", "period", "acceptedDate", "fillingDate", "totalAssets", "totalCurrentAssets", "totalCurrentLiabilities"] if column in balance.columns]

    merged = income[income_keep].copy() if income_keep else pd.DataFrame()
    if merged.empty and cash_keep:
        merged = cash[cash_keep].copy()
    elif cash_keep:
        merged = merged.merge(cash[cash_keep], on="date", how="outer", suffixes=("", "_cf"))
    if balance_keep:
        merged = balance[balance_keep].copy() if merged.empty else merged.merge(balance[balance_keep], on="date", how="outer", suffixes=("", "_bs"))
    if merged.empty:
        return pd.DataFrame()

    merged["ticker"] = symbol
    merged["calendarYear"] = _first_available(merged, ["calendarYear", "calendarYear_cf", "calendarYear_bs"])
    merged["period"] = _first_available(merged, ["period", "period_cf", "period_bs"])
    merged["acceptedDate"] = pd.to_datetime(_first_available(merged, ["acceptedDate", "acceptedDate_cf", "acceptedDate_bs"]), errors="coerce")
    merged["fillingDate"] = pd.to_datetime(_first_available(merged, ["fillingDate", "fillingDate_cf", "fillingDate_bs"]), errors="coerce")
    merged["report_date"] = pd.to_datetime(merged["acceptedDate"].combine_first(merged["fillingDate"]).combine_first(merged["date"]), errors="coerce")

    numeric_columns = [
        "revenue",
        "netIncome",
        "netCashProvidedByOperatingActivities",
        "freeCashFlow",
        "capitalExpenditure",
        "changeInWorkingCapital",
        "totalAssets",
        "totalCurrentAssets",
        "totalCurrentLiabilities",
    ]
    for column in numeric_columns:
        if column in merged.columns:
            merged[column] = pd.to_numeric(merged[column], errors="coerce")

    merged = merged.sort_values("report_date").dropna(subset=["report_date"]).reset_index(drop=True)
    if merged.empty:
        return merged

    merged["working_capital"] = merged.get("totalCurrentAssets", pd.Series(np.nan, index=merged.index)) - merged.get("totalCurrentLiabilities", pd.Series(np.nan, index=merged.index))
    for column in ["revenue", "netIncome", "netCashProvidedByOperatingActivities", "freeCashFlow", "capitalExpenditure", "changeInWorkingCapital"]:
        if column in merged.columns:
            merged[f"{column}_ttm"] = merged.groupby("ticker")[column].transform(lambda series: series.rolling(4, min_periods=4).sum())
            merged[f"{column}_yoy"] = merged.groupby("ticker")[column].transform(lambda series: series.pct_change(4).replace([np.inf, -np.inf], np.nan))
    merged["average_assets"] = merged.groupby("ticker")["totalAssets"].transform(lambda series: (series + series.shift(4)) / 2.0)
    merged["quarters_available"] = merged.groupby("ticker").cumcount() + 1
    return merged


def _prepare_statement_history_from_yfinance(symbol: str) -> pd.DataFrame:
    try:
        import yfinance as yf
    except Exception:
        return pd.DataFrame()

    ticker = yf.Ticker(symbol)
    income = getattr(ticker, "quarterly_income_stmt", pd.DataFrame())
    cash = getattr(ticker, "quarterly_cash_flow", pd.DataFrame())
    balance = getattr(ticker, "quarterly_balance_sheet", pd.DataFrame())
    if income is None or income.empty:
        income = pd.DataFrame()
    if cash is None or cash.empty:
        cash = pd.DataFrame()
    if balance is None or balance.empty:
        balance = pd.DataFrame()
    if income.empty and cash.empty and balance.empty:
        return pd.DataFrame()

    def _extract_value(frame: pd.DataFrame, report_date: pd.Timestamp, names: list[str]):
        if frame.empty or report_date not in frame.columns:
            return np.nan
        for name in names:
            if name in frame.index:
                return frame.at[name, report_date]
        return np.nan

    report_dates = sorted(
        {
            pd.to_datetime(column)
            for frame in [income, cash, balance]
            for column in getattr(frame, "columns", [])
            if pd.notna(column)
        }
    )
    if not report_dates:
        return pd.DataFrame()

    rows: list[dict] = []
    for report_date in report_dates:
        rows.append(
            {
                "ticker": symbol,
                "date": pd.to_datetime(report_date),
                "calendarYear": str(pd.to_datetime(report_date).year),
                "period": f"Q{(((pd.to_datetime(report_date).month - 1) // 3) + 1)}",
                "acceptedDate": pd.to_datetime(report_date) + pd.Timedelta(days=45),
                "fillingDate": pd.to_datetime(report_date) + pd.Timedelta(days=45),
                "revenue": _extract_value(income, report_date, ["Total Revenue", "Operating Revenue"]),
                "netIncome": _extract_value(income, report_date, ["Net Income", "Net Income Common Stockholders"]),
                "netCashProvidedByOperatingActivities": _extract_value(cash, report_date, ["Operating Cash Flow", "Cash Flow From Continuing Operating Activities"]),
                "freeCashFlow": _extract_value(cash, report_date, ["Free Cash Flow"]),
                "capitalExpenditure": _extract_value(cash, report_date, ["Capital Expenditure"]),
                "changeInWorkingCapital": _extract_value(cash, report_date, ["Change In Working Capital"]),
                "totalAssets": _extract_value(balance, report_date, ["Total Assets"]),
                "totalCurrentAssets": _extract_value(balance, report_date, ["Current Assets", "Total Current Assets"]),
                "totalCurrentLiabilities": _extract_value(balance, report_date, ["Current Liabilities", "Total Current Liabilities"]),
            }
        )

    merged = pd.DataFrame(rows)
    numeric_columns = [
        "revenue",
        "netIncome",
        "netCashProvidedByOperatingActivities",
        "freeCashFlow",
        "capitalExpenditure",
        "changeInWorkingCapital",
        "totalAssets",
        "totalCurrentAssets",
        "totalCurrentLiabilities",
    ]
    for column in numeric_columns:
        merged[column] = pd.to_numeric(merged[column], errors="coerce")
    merged["report_date"] = merged["acceptedDate"].combine_first(merged["fillingDate"]).combine_first(merged["date"])
    merged = merged.sort_values("report_date").reset_index(drop=True)
    merged["working_capital"] = merged["totalCurrentAssets"] - merged["totalCurrentLiabilities"]
    for column in ["revenue", "netIncome", "netCashProvidedByOperatingActivities", "freeCashFlow", "capitalExpenditure", "changeInWorkingCapital"]:
        merged[f"{column}_ttm"] = merged.groupby("ticker")[column].transform(lambda series: series.rolling(4, min_periods=4).sum())
        merged[f"{column}_yoy"] = merged.groupby("ticker")[column].transform(lambda series: series.pct_change(4).replace([np.inf, -np.inf], np.nan))
    merged["average_assets"] = merged.groupby("ticker")["totalAssets"].transform(lambda series: (series + series.shift(4)) / 2.0)
    merged["quarters_available"] = merged.groupby("ticker").cumcount() + 1
    return merged


def _score_kernel_panel(history: pd.DataFrame) -> pd.DataFrame:
    if history.empty:
        return history

    scored = history.copy()
    ni_ttm = scored.get("netIncome_ttm", pd.Series(np.nan, index=scored.index))
    ocf_ttm = scored.get("netCashProvidedByOperatingActivities_ttm", pd.Series(np.nan, index=scored.index))
    fcf_ttm = scored.get("freeCashFlow_ttm", pd.Series(np.nan, index=scored.index))
    rev_ttm = scored.get("revenue_ttm", pd.Series(np.nan, index=scored.index))
    capex_ttm = scored.get("capitalExpenditure_ttm", pd.Series(np.nan, index=scored.index))
    wc_ttm = scored.get("changeInWorkingCapital_ttm", pd.Series(np.nan, index=scored.index))
    avg_assets = scored.get("average_assets", pd.Series(np.nan, index=scored.index))

    denom_income = ni_ttm.abs().replace(0.0, np.nan)
    denom_revenue = rev_ttm.abs().replace(0.0, np.nan)
    denom_assets = avg_assets.abs().replace(0.0, np.nan)

    scored["ocf_to_net_income"] = ocf_ttm / denom_income
    scored["fcf_to_net_income"] = fcf_ttm / denom_income
    scored["accrual_intensity"] = (ni_ttm - ocf_ttm) / denom_assets
    scored["capex_burden"] = capex_ttm.abs() / denom_revenue
    scored["working_capital_drag"] = wc_ttm / denom_revenue
    scored["earnings_growth_yoy"] = scored.get("netIncome_yoy", pd.Series(np.nan, index=scored.index))
    scored["ocf_growth_yoy"] = scored.get("netCashProvidedByOperatingActivities_yoy", pd.Series(np.nan, index=scored.index))
    scored["fcf_growth_yoy"] = scored.get("freeCashFlow_yoy", pd.Series(np.nan, index=scored.index))
    scored["revenue_growth_yoy"] = scored.get("revenue_yoy", pd.Series(np.nan, index=scored.index))
    scored["conversion_gap_growth"] = scored["ocf_growth_yoy"] - scored["earnings_growth_yoy"]
    scored["conversion_persistence"] = scored.groupby("ticker")["ocf_to_net_income"].transform(lambda series: (series.gt(0.8)).rolling(4, min_periods=2).mean())

    component_series = {
        "ocf_to_net_income_score": scored["ocf_to_net_income"].map(lambda value: _scalar_score(value, 0.4, 1.4)),
        "fcf_to_net_income_score": scored["fcf_to_net_income"].map(lambda value: _scalar_score(value, -0.1, 1.0)),
        "accrual_intensity_score": scored["accrual_intensity"].map(lambda value: _scalar_score(value, -0.05, 0.12, reverse=True)),
        "capex_burden_score": scored["capex_burden"].map(lambda value: _scalar_score(value, 0.02, 0.35, reverse=True)),
        "working_capital_drag_score": scored["working_capital_drag"].map(lambda value: _scalar_score(value, -0.03, 0.08, reverse=True)),
        "conversion_gap_growth_score": scored["conversion_gap_growth"].map(lambda value: _scalar_score(value, -0.4, 0.4)),
        "persistence_score": scored["conversion_persistence"].map(lambda value: _scalar_score(value, 0.0, 1.0)),
    }
    weights = {
        "ocf_to_net_income_score": 0.24,
        "fcf_to_net_income_score": 0.20,
        "accrual_intensity_score": 0.14,
        "capex_burden_score": 0.10,
        "working_capital_drag_score": 0.10,
        "conversion_gap_growth_score": 0.10,
        "persistence_score": 0.12,
    }

    for name, series in component_series.items():
        scored[name] = series

    weighted_sum = pd.Series(0.0, index=scored.index, dtype=float)
    weight_sum = pd.Series(0.0, index=scored.index, dtype=float)
    for name, weight in weights.items():
        valid = scored[name].notna()
        weighted_sum = weighted_sum + scored[name].fillna(0.0) * weight
        weight_sum = weight_sum + valid.astype(float) * weight
    scored["kernel_data_quality"] = (weight_sum / sum(weights.values())).clip(0.0, 1.0)
    scored["earnings_cash_kernel_score"] = (weighted_sum / weight_sum.replace(0.0, np.nan)).clip(0.0, 1.0)

    def _bucket(row: pd.Series) -> str:
        if row.get("quarters_available", 0) < 6 or row.get("kernel_data_quality", 0.0) < 0.45:
            return "insufficient_history"
        if row.get("earnings_cash_kernel_score", np.nan) >= 0.70 and row.get("ocf_to_net_income", np.nan) >= 0.85 and row.get("fcf_to_net_income", np.nan) >= 0.35:
            return "cash_confirmed"
        if row.get("earnings_cash_kernel_score", np.nan) >= 0.55 and row.get("conversion_gap_growth", np.nan) >= -0.08:
            return "cash_improving"
        if (row.get("ocf_to_net_income", np.nan) < 0.40) or (row.get("netIncome_ttm", np.nan) > 0 and row.get("netCashProvidedByOperatingActivities_ttm", np.nan) < 0):
            return "fragile_conversion"
        return "earnings_only"

    def _commentary(row: pd.Series) -> str:
        if row["earnings_cash_kernel_bucket"] == "insufficient_history":
            return "Insufficient filing history to assess whether accounting earnings are converting into durable cash."
        strengths: list[str] = []
        risks: list[str] = []
        if pd.notna(row.get("ocf_to_net_income")) and row["ocf_to_net_income"] >= 1.0:
            strengths.append("operating cash flow fully confirms earnings")
        if pd.notna(row.get("fcf_to_net_income")) and row["fcf_to_net_income"] >= 0.45:
            strengths.append("free cash flow conversion is healthy")
        if pd.notna(row.get("conversion_gap_growth")) and row["conversion_gap_growth"] >= 0.05:
            strengths.append("cash is improving faster than accounting earnings")
        if pd.notna(row.get("accrual_intensity")) and row["accrual_intensity"] <= 0.03:
            strengths.append("accrual intensity remains controlled")
        if pd.notna(row.get("ocf_to_net_income")) and row["ocf_to_net_income"] < 0.6:
            risks.append("earnings are not converting well into operating cash")
        if pd.notna(row.get("fcf_to_net_income")) and row["fcf_to_net_income"] < 0.1:
            risks.append("free cash flow support is weak")
        if pd.notna(row.get("working_capital_drag")) and row["working_capital_drag"] > 0.03:
            risks.append("working capital is consuming cash")
        if pd.notna(row.get("capex_burden")) and row["capex_burden"] > 0.2:
            risks.append("capex burden is heavy relative to revenue")
        strength_text = ", ".join(strengths[:2]) if strengths else "limited cash confirmation"
        risk_text = ", ".join(risks[:2]) if risks else "no major cash-conversion red flag"
        return f"Cash view: {strength_text}. Risks: {risk_text}."

    scored["earnings_cash_kernel_bucket"] = scored.apply(_bucket, axis=1)
    scored["earnings_cash_kernel_commentary"] = scored.apply(_commentary, axis=1)
    scored["kernel_components"] = scored.apply(
        lambda row: json.dumps(
            {
                "ocf_to_net_income_score": row.get("ocf_to_net_income_score"),
                "fcf_to_net_income_score": row.get("fcf_to_net_income_score"),
                "accrual_intensity_score": row.get("accrual_intensity_score"),
                "capex_burden_score": row.get("capex_burden_score"),
                "working_capital_drag_score": row.get("working_capital_drag_score"),
                "conversion_gap_growth_score": row.get("conversion_gap_growth_score"),
                "persistence_score": row.get("persistence_score"),
            },
            default=_json_default,
        ),
        axis=1,
    )
    return scored


def _forward_return(series: pd.Series, report_date: pd.Timestamp, horizon_days: int) -> float | None:
    if series.empty or pd.isna(report_date):
        return None
    indexer = series.index.searchsorted(pd.Timestamp(report_date), side="left")
    if indexer >= len(series):
        return None
    end_idx = indexer + horizon_days
    if end_idx >= len(series):
        return None
    start_price = series.iloc[indexer]
    end_price = series.iloc[end_idx]
    if pd.isna(start_price) or pd.isna(end_price) or start_price == 0:
        return None
    return float(end_price / start_price - 1.0)


def _attach_forward_returns(history: pd.DataFrame, price_panel: pd.DataFrame) -> pd.DataFrame:
    if history.empty or price_panel.empty:
        return history
    enriched = history.copy()
    for horizon in KERNEL_FORWARD_HORIZONS:
        values: list[float | None] = []
        for row in enriched.itertuples(index=False):
            ticker = getattr(row, "ticker")
            report_date = getattr(row, "report_date")
            if ticker not in price_panel.columns:
                values.append(None)
                continue
            values.append(_forward_return(price_panel[ticker].dropna(), pd.to_datetime(report_date), horizon))
        enriched[f"fwd_return_{horizon}d"] = values
    return enriched


def _build_research_utility(history: pd.DataFrame) -> dict:
    evaluation = history.loc[
        history["earnings_cash_kernel_bucket"] != "insufficient_history",
        ["report_date", "ticker", "sector", "earnings_cash_kernel_score", "earnings_cash_kernel_bucket", "fwd_return_21d", "fwd_return_63d"],
    ].dropna(subset=["earnings_cash_kernel_score"])
    if evaluation.empty:
        return {"coverage": 0, "warnings": ["kernel history is empty or lacks forward-return coverage"]}

    bucket_stats = (
        evaluation.groupby("earnings_cash_kernel_bucket", dropna=False)[["fwd_return_21d", "fwd_return_63d"]]
        .agg(["mean", "median", "count"])
        .reset_index()
    )
    bucket_stats.columns = ["_".join([str(part) for part in column if part]) for column in bucket_stats.columns.to_flat_index()]

    rank_labels = ["low", "mid", "high"]
    rank_count = min(3, evaluation["earnings_cash_kernel_score"].nunique())
    if rank_count >= 2:
        evaluation["kernel_rank_bucket"] = pd.qcut(evaluation["earnings_cash_kernel_score"], q=rank_count, labels=rank_labels[:rank_count], duplicates="drop")
    else:
        evaluation["kernel_rank_bucket"] = "mid"

    rank_stats = (
        evaluation.groupby("kernel_rank_bucket", dropna=False)[["fwd_return_21d", "fwd_return_63d"]]
        .agg(["mean", "median", "count"])
        .reset_index()
    )
    rank_stats.columns = ["_".join([str(part) for part in column if part]) for column in rank_stats.columns.to_flat_index()]
    rank_lookup = {row["kernel_rank_bucket"]: row for row in rank_stats.to_dict(orient="records")}
    top = rank_lookup.get("high") or {}
    bottom = rank_lookup.get("low") or {}

    sorted_eval = evaluation.sort_values("report_date").reset_index(drop=True)
    oos_blocks: list[dict] = []
    if len(sorted_eval) >= 12:
        for block_id, block_index in enumerate(np.array_split(sorted_eval.index.to_numpy(), 3), start=1):
            block = sorted_eval.loc[block_index].copy()
            if block.empty:
                continue
            block_rank_count = min(3, block["earnings_cash_kernel_score"].nunique())
            if block_rank_count >= 2:
                block["kernel_rank_bucket"] = pd.qcut(block["earnings_cash_kernel_score"], q=block_rank_count, labels=rank_labels[:block_rank_count], duplicates="drop")
            else:
                block["kernel_rank_bucket"] = "mid"
            block_high = block.loc[block["kernel_rank_bucket"] == "high", "fwd_return_63d"].mean()
            block_low = block.loc[block["kernel_rank_bucket"] == "low", "fwd_return_63d"].mean()
            spread_63d = None if pd.isna(block_high) or pd.isna(block_low) else float(block_high - block_low)
            oos_blocks.append(
                {
                    "block": block_id,
                    "start": pd.to_datetime(block["report_date"].min()).date().isoformat(),
                    "end": pd.to_datetime(block["report_date"].max()).date().isoformat(),
                    "spread_63d": spread_63d,
                    "mean_score": float(block["earnings_cash_kernel_score"].mean()),
                    "observations": int(len(block)),
                    "directionally_positive": bool(spread_63d is not None and spread_63d > 0),
                }
            )

    return {
        "coverage": int(len(evaluation)),
        "score_corr_21d": float(evaluation["earnings_cash_kernel_score"].corr(evaluation["fwd_return_21d"], method="spearman")) if evaluation["fwd_return_21d"].notna().sum() > 3 else None,
        "score_corr_63d": float(evaluation["earnings_cash_kernel_score"].corr(evaluation["fwd_return_63d"], method="spearman")) if evaluation["fwd_return_63d"].notna().sum() > 3 else None,
        "top_bottom_spread_21d": None
        if pd.isna(top.get("fwd_return_21d_mean")) or pd.isna(bottom.get("fwd_return_21d_mean"))
        else float(top["fwd_return_21d_mean"] - bottom["fwd_return_21d_mean"]),
        "top_bottom_spread_63d": None
        if pd.isna(top.get("fwd_return_63d_mean")) or pd.isna(bottom.get("fwd_return_63d_mean"))
        else float(top["fwd_return_63d_mean"] - bottom["fwd_return_63d_mean"]),
        "bucket_returns": json.loads(bucket_stats.to_json(orient="records", default_handler=_json_default)),
        "rank_returns": json.loads(rank_stats.to_json(orient="records", default_handler=_json_default)),
        "oos_blocks": oos_blocks,
        "positive_oos_blocks_63d": int(sum(1 for block in oos_blocks if block.get("directionally_positive"))),
        "warnings": [],
    }


def _build_sector_summary(latest_panel: pd.DataFrame) -> list[dict]:
    valid = latest_panel.loc[latest_panel["earnings_cash_kernel_bucket"] != "insufficient_history"].copy()
    if valid.empty:
        return []
    sector = (
        valid.groupby("sector", dropna=False)
        .agg(
            coverage=("ticker", "count"),
            median_kernel_score=("earnings_cash_kernel_score", "median"),
            mean_kernel_score=("earnings_cash_kernel_score", "mean"),
            cash_confirmed_share=("earnings_cash_kernel_bucket", lambda series: float((series == "cash_confirmed").mean())),
            earnings_only_share=("earnings_cash_kernel_bucket", lambda series: float((series == "earnings_only").mean())),
        )
        .reset_index()
        .sort_values(["median_kernel_score", "cash_confirmed_share"], ascending=[False, False])
    )
    return json.loads(sector.to_json(orient="records"))


def _placeholder_row(row: pd.Series, warning: str) -> dict:
    return {
        "ticker": row["ticker"],
        "asset_type": row.get("asset_type", "equity"),
        "sector": row.get("sector", "Unknown"),
        "industry": row.get("industry", "Unknown"),
        "report_date": pd.NaT,
        "quarters_available": 0,
        "earnings_cash_kernel_score": np.nan,
        "earnings_cash_kernel_bucket": "insufficient_history",
        "earnings_cash_kernel_commentary": warning,
        "kernel_components": json.dumps({}),
        "kernel_data_quality": 0.0,
        "ocf_to_net_income": np.nan,
        "fcf_to_net_income": np.nan,
        "accrual_intensity": np.nan,
        "conversion_gap_growth": np.nan,
        "fwd_return_21d": np.nan,
        "fwd_return_63d": np.nan,
    }


def _load_cached_artifacts(settings: ResearchSettings) -> EarningsCashKernelArtifacts | None:
    summary_path = settings.statement_kernel_output_dir / "earnings_cash_kernel_summary.json"
    panel_path = settings.statement_kernel_output_dir / "earnings_cash_kernel_panel.csv"
    history_path = settings.statement_kernel_output_dir / "earnings_cash_kernel_history.csv"
    if not summary_path.exists() or not panel_path.exists():
        return None
    latest_panel = pd.read_csv(panel_path)
    if history_path.exists():
        try:
            history_panel = pd.read_csv(history_path)
        except pd.errors.EmptyDataError:
            history_panel = pd.DataFrame()
    else:
        history_panel = pd.DataFrame()
    summary = json.loads(summary_path.read_text(encoding="utf-8").replace("NaN", "null"))
    return EarningsCashKernelArtifacts(latest_panel=latest_panel, history_panel=history_panel, summary=summary)


def run_earnings_cash_kernel(
    paths: PathConfig,
    settings: ResearchSettings,
    *,
    fmp_client: FMPClient | None = None,
) -> EarningsCashKernelArtifacts:
    ensure_directory(settings.statement_kernel_output_dir)
    client = fmp_client or FMPClient.from_env(paths.cache_root)
    universe = _build_universe(paths)
    if universe.empty:
        summary = {"coverage": 0, "warnings": ["kernel universe is empty"], "research_utility": {"coverage": 0, "warnings": ["kernel universe is empty"]}}
        return EarningsCashKernelArtifacts(latest_panel=pd.DataFrame(), history_panel=pd.DataFrame(), summary=summary)

    if client is None:
        cached = _load_cached_artifacts(settings)
        if cached is not None:
            cached.summary.setdefault("warnings", []).append("FMP client unavailable; using cached earnings-to-cash kernel artifacts.")
            return cached
        placeholders = pd.DataFrame([_placeholder_row(row, "FMP client unavailable; no cached statement kernel found.") for _, row in universe.iterrows()])
        summary = {
            "coverage": 0,
            "history_observations": 0,
            "top_kernel_names": [],
            "cash_mismatch_names": [],
            "sector_kernel_breadth": [],
            "research_utility": {"coverage": 0, "warnings": ["FMP client unavailable"]},
            "warnings": ["FMP client unavailable"],
        }
        placeholders.to_csv(settings.statement_kernel_output_dir / "earnings_cash_kernel_panel.csv", index=False)
        (settings.statement_kernel_output_dir / "earnings_cash_kernel_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        return EarningsCashKernelArtifacts(latest_panel=placeholders, history_panel=pd.DataFrame(), summary=summary)

    histories: list[pd.DataFrame] = []
    placeholders: list[dict] = []
    warnings: list[str] = []
    for row in universe.itertuples(index=False):
        meta = pd.Series(row._asdict())
        asset_type = str(meta.get("asset_type", "equity")).lower()
        if asset_type in {"etf", "fund", "cash"}:
            placeholders.append(_placeholder_row(meta, "Instrument does not have operating financial statements suitable for the kernel."))
            continue
        used_yfinance_fallback = False
        try:
            history = _prepare_statement_history(meta["ticker"], client)
        except Exception as exc:
            warnings.append(f"{meta['ticker']}: FMP statement fetch failed ({_sanitize_error_message(exc)})")
            history = _prepare_statement_history_from_yfinance(meta["ticker"])
            used_yfinance_fallback = not history.empty
        if history.empty:
            history = _prepare_statement_history_from_yfinance(meta["ticker"])
            used_yfinance_fallback = used_yfinance_fallback or not history.empty
        if history.empty:
            placeholders.append(_placeholder_row(meta, "No quarterly statement history available from FMP or yfinance."))
            continue
        if used_yfinance_fallback:
            warnings.append(f"{meta['ticker']}: using yfinance statement fallback.")
        history["asset_type"] = meta.get("asset_type", "equity")
        history["sector"] = meta.get("sector", "Unknown")
        history["industry"] = meta.get("industry", "Unknown")
        history["is_current_holding"] = bool(meta.get("is_current_holding", False))
        history["in_screener"] = bool(meta.get("in_screener", False))
        history["in_daily_hits"] = bool(meta.get("in_daily_hits", False))
        histories.append(history)

    history_panel = pd.concat(histories, ignore_index=True) if histories else pd.DataFrame()
    if not history_panel.empty:
        history_panel = _score_kernel_panel(history_panel)
        start_date = (pd.to_datetime(history_panel["report_date"].min()) - pd.Timedelta(days=30)).date().isoformat()
        tickers = tuple(sorted(history_panel["ticker"].dropna().unique().tolist()))
        price_panel = load_fmp_market_proxy_panel(
            paths,
            tickers=tickers,
            start_date=start_date,
            end_date=settings.end_date,
            fmp_client=client,
        )
        history_panel = _attach_forward_returns(history_panel, price_panel)

    latest_panel = history_panel.sort_values("report_date").groupby("ticker", as_index=False).tail(1) if not history_panel.empty else pd.DataFrame()
    if placeholders:
        latest_panel = pd.concat([latest_panel, pd.DataFrame(placeholders)], ignore_index=True, sort=False)
    if latest_panel.empty:
        latest_panel = pd.DataFrame([_placeholder_row(row, "No earnings-to-cash kernel coverage for this universe.") for _, row in universe.iterrows()])

    latest_panel = universe.merge(latest_panel, on=["ticker", "asset_type", "sector", "industry"], how="left")
    holding_left = latest_panel["is_current_holding_x"] if "is_current_holding_x" in latest_panel.columns else latest_panel.get("is_current_holding", pd.Series(False, index=latest_panel.index))
    holding_right = latest_panel["is_current_holding_y"] if "is_current_holding_y" in latest_panel.columns else pd.Series(False, index=latest_panel.index)
    screener_left = latest_panel["in_screener_x"] if "in_screener_x" in latest_panel.columns else latest_panel.get("in_screener", pd.Series(False, index=latest_panel.index))
    screener_right = latest_panel["in_screener_y"] if "in_screener_y" in latest_panel.columns else pd.Series(False, index=latest_panel.index)
    hits_left = latest_panel["in_daily_hits_x"] if "in_daily_hits_x" in latest_panel.columns else latest_panel.get("in_daily_hits", pd.Series(False, index=latest_panel.index))
    hits_right = latest_panel["in_daily_hits_y"] if "in_daily_hits_y" in latest_panel.columns else pd.Series(False, index=latest_panel.index)
    latest_panel["is_current_holding"] = pd.Series(holding_left, index=latest_panel.index).combine_first(pd.Series(holding_right, index=latest_panel.index))
    latest_panel["in_screener"] = pd.Series(screener_left, index=latest_panel.index).combine_first(pd.Series(screener_right, index=latest_panel.index))
    latest_panel["in_daily_hits"] = pd.Series(hits_left, index=latest_panel.index).combine_first(pd.Series(hits_right, index=latest_panel.index))
    latest_panel = latest_panel.drop(columns=[column for column in latest_panel.columns if column.endswith("_x") or column.endswith("_y")], errors="ignore")
    latest_panel["earnings_cash_kernel_bucket"] = latest_panel["earnings_cash_kernel_bucket"].fillna("insufficient_history")
    latest_panel["earnings_cash_kernel_commentary"] = latest_panel["earnings_cash_kernel_commentary"].fillna("Insufficient filing history to assess cash conversion.")
    latest_panel["kernel_components"] = latest_panel["kernel_components"].fillna(json.dumps({}))
    latest_panel["kernel_data_quality"] = pd.to_numeric(latest_panel["kernel_data_quality"], errors="coerce").fillna(0.0)
    latest_panel["earnings_cash_kernel_score"] = pd.to_numeric(latest_panel["earnings_cash_kernel_score"], errors="coerce")
    latest_panel = latest_panel.sort_values(["is_current_holding", "earnings_cash_kernel_score", "ticker"], ascending=[False, False, True]).reset_index(drop=True)

    research_utility = _build_research_utility(history_panel) if not history_panel.empty else {"coverage": 0, "warnings": ["no historical panel available"]}
    top_kernel_names = (
        latest_panel.loc[latest_panel["earnings_cash_kernel_bucket"] != "insufficient_history"]
        .sort_values(["earnings_cash_kernel_score", "is_current_holding"], ascending=[False, False])[
            [
                "ticker",
                "sector",
                "earnings_cash_kernel_score",
                "earnings_cash_kernel_bucket",
                "earnings_cash_kernel_commentary",
            ]
        ]
        .head(12)
    )
    cash_mismatch_names = latest_panel.loc[
        latest_panel["earnings_cash_kernel_bucket"].isin(["earnings_only", "fragile_conversion"]),
        ["ticker", "sector", "earnings_cash_kernel_score", "earnings_cash_kernel_bucket", "earnings_cash_kernel_commentary"],
    ].sort_values("earnings_cash_kernel_score", ascending=True).head(12)
    sector_kernel_breadth = _build_sector_summary(latest_panel)

    summary = {
        "coverage": int((latest_panel["earnings_cash_kernel_bucket"] != "insufficient_history").sum()),
        "history_observations": int(len(history_panel)),
        "top_kernel_names": json.loads(top_kernel_names.to_json(orient="records")),
        "cash_mismatch_names": json.loads(cash_mismatch_names.to_json(orient="records")),
        "sector_kernel_breadth": sector_kernel_breadth,
        "research_utility": research_utility,
        "warnings": warnings + research_utility.get("warnings", []),
    }

    latest_panel.to_csv(settings.statement_kernel_output_dir / "earnings_cash_kernel_panel.csv", index=False)
    history_panel.to_csv(settings.statement_kernel_output_dir / "earnings_cash_kernel_history.csv", index=False)
    (settings.statement_kernel_output_dir / "earnings_cash_kernel_summary.json").write_text(
        json.dumps(summary, indent=2, default=_json_default),
        encoding="utf-8",
    )
    return EarningsCashKernelArtifacts(latest_panel=latest_panel, history_panel=history_panel, summary=summary)
