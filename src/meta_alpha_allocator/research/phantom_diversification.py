from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd
from sklearn.covariance import LedoitWolf

from ..config import PathConfig
from ..data.adapters import load_sp500_price_panel
from ..data.fmp_client import FMPClient
from ..storage.runtime_store import load_runtime_frame


WINDOW_DAYS = 63
CORRECTION_K = 100.0
SERIES_POINTS = 252


class PhantomDiversificationError(RuntimeError):
    pass


@dataclass(frozen=True)
class PortfolioHolding:
    ticker: str
    weight: float


def _normalize_holdings(rows: list[dict[str, Any]]) -> list[PortfolioHolding]:
  aggregated: dict[str, float] = {}
  for row in rows:
    ticker = str(row.get("ticker") or "").strip().upper()
    if not ticker:
      continue
    weight = float(row.get("weight") or 0.0)
    if weight <= 0:
      continue
    aggregated[ticker] = aggregated.get(ticker, 0.0) + weight
  total = sum(aggregated.values())
  if total <= 0:
    raise PhantomDiversificationError("Holdings weights must sum to more than zero.")
  normalized = [
    PortfolioHolding(ticker=ticker, weight=value / total)
    for ticker, value in aggregated.items()
  ]
  if len(normalized) < 3:
    raise PhantomDiversificationError("At least 3 supported holdings are required for analysis.")
  return sorted(normalized, key=lambda row: row.weight, reverse=True)


def _business_start(days: int = 900) -> tuple[str, str]:
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days)
    return start.isoformat(), today.isoformat()


def _sanitize_price_panel(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame()
    panel = frame.copy()
    panel.columns = [str(column).upper().replace("-", ".") for column in panel.columns]
    panel.index = pd.to_datetime(panel.index)
    return panel.sort_index().ffill().dropna(how="all")


def _download_yfinance_panel(tickers: list[str], start_date: str, end_date: str) -> pd.DataFrame:
    try:
        import yfinance as yf
    except Exception:
        return pd.DataFrame()

    panels: list[pd.DataFrame] = []
    unique = list(dict.fromkeys(ticker.replace(".", "-") for ticker in tickers if ticker))
    for offset in range(0, len(unique), 40):
        chunk = unique[offset: offset + 40]
        if not chunk:
            continue
        try:
            frame = yf.download(
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
        if frame.empty:
            continue
        if isinstance(frame.columns, pd.MultiIndex):
            close = frame.xs("Close", axis=1, level=1, drop_level=False)
            close.columns = [column[0] for column in close.columns]
        else:
            close = frame[["Close"]].rename(columns={"Close": chunk[0]})
        close.index = pd.to_datetime(close.index)
        panels.append(close)
    if not panels:
        return pd.DataFrame()
    merged = pd.concat(panels, axis=1).sort_index()
    return _sanitize_price_panel(merged.loc[:, ~merged.columns.duplicated()])


def _download_fmp_panel(tickers: list[str], start_date: str, end_date: str, paths: PathConfig) -> pd.DataFrame:
    client = FMPClient.from_env(paths.cache_root)
    if client is None:
        return pd.DataFrame()
    series: dict[str, pd.Series] = {}
    for ticker in tickers:
        try:
            frame = client.get_historical_prices(ticker, start_date, end_date)
        except Exception:
            continue
        if frame.empty or "date" not in frame.columns or "close" not in frame.columns:
            continue
        close = frame[["date", "close"]].dropna()
        if close.empty:
            continue
        series[ticker] = close.set_index("date")["close"].rename(ticker).sort_index()
    return _sanitize_price_panel(pd.DataFrame(series)) if series else pd.DataFrame()


def _load_price_panel(tickers: list[str], paths: PathConfig) -> tuple[pd.DataFrame, list[str], list[str], list[str]]:
    start_date, end_date = _business_start()
    panel = pd.DataFrame()
    source_labels: list[str] = []

    runtime = _sanitize_price_panel(load_runtime_frame("market:sp500_price_panel"))
    if not runtime.empty:
        runtime = runtime.reindex(columns=[ticker for ticker in tickers if ticker in runtime.columns]).copy()
        if not runtime.empty:
            panel = runtime
            source_labels.append("runtime_store")

    sp500_panel = _sanitize_price_panel(load_sp500_price_panel(paths, start_date, end_date))
    missing = [ticker for ticker in tickers if ticker not in panel.columns]
    if not sp500_panel.empty and missing:
        sp500_panel = sp500_panel.reindex(columns=[ticker for ticker in missing if ticker in sp500_panel.columns]).copy()
        if not sp500_panel.empty:
            panel = panel.join(sp500_panel, how="outer") if not panel.empty else sp500_panel
            source_labels.append("sp500_local_panel")

    missing = [ticker for ticker in tickers if ticker not in panel.columns]
    if missing:
        fmp_panel = _download_fmp_panel(missing, start_date, end_date, paths)
        if not fmp_panel.empty:
            panel = panel.join(fmp_panel, how="outer") if not panel.empty else fmp_panel
            source_labels.append("financial_modeling_prep")

    missing = [ticker for ticker in tickers if ticker not in panel.columns]
    if missing:
        yf_panel = _download_yfinance_panel(missing, start_date, end_date)
        if not yf_panel.empty:
            panel = panel.join(yf_panel, how="outer") if not panel.empty else yf_panel
            source_labels.append("yfinance")

    panel = _sanitize_price_panel(panel)
    supported = [ticker for ticker in tickers if ticker in panel.columns]
    unsupported = [ticker for ticker in tickers if ticker not in supported]
    return panel.reindex(columns=supported), supported, unsupported, source_labels or ["none"]


def _weighted_correlation(corr: np.ndarray, weights: np.ndarray) -> np.ndarray:
    sqrt_weights = np.sqrt(np.clip(weights, 0.0, None))
    return np.diag(sqrt_weights) @ corr @ np.diag(sqrt_weights)


def _current_window_metrics(window_returns: pd.DataFrame, weights: np.ndarray) -> dict[str, float]:
    if len(window_returns.index) < WINDOW_DAYS - 1:
        raise PhantomDiversificationError("Not enough overlapping history to compute the 63-day window.")

    model = LedoitWolf().fit(window_returns.to_numpy(dtype=float))
    cov = np.asarray(model.covariance_, dtype=float)
    diag = np.sqrt(np.clip(np.diag(cov), 1e-12, None))
    corr = cov / np.outer(diag, diag)
    corr = np.nan_to_num(corr, nan=0.0, posinf=0.0, neginf=0.0)
    np.fill_diagonal(corr, 1.0)

    weighted_corr = _weighted_correlation(corr, weights)
    eigvals = np.linalg.eigvalsh(weighted_corr)
    eigvals = np.clip(np.sort(eigvals), 1e-12, None)
    probs = eigvals / eigvals.sum()
    entropy = float(-(probs * np.log(probs)).sum())
    raw_breadth = float(np.exp(entropy))
    normalized_entropy = float(entropy / np.log(max(len(weights), 2)))
    portfolio_variance = float(weights @ cov @ weights)
    correction_factor = float(np.clip(1.0 - np.exp(-(CORRECTION_K * portfolio_variance)), 0.0, 1.0))
    real_breadth = float(raw_breadth * correction_factor)
    phantom_breadth = float(max(raw_breadth - real_breadth, 0.0))
    tested_ratio = float(real_breadth / raw_breadth) if raw_breadth > 0 else 0.0
    hhi = float(np.square(weights).sum())
    naive_breadth = float(1.0 / hhi) if hhi > 0 else 0.0

    return {
        "raw_breadth": raw_breadth,
        "real_breadth": real_breadth,
        "phantom_breadth": phantom_breadth,
        "phantom_share": float(np.clip(1.0 - correction_factor, 0.0, 1.0)),
        "correction_factor": correction_factor,
        "realized_variance": portfolio_variance,
        "tested_ratio": tested_ratio,
        "naive_breadth": naive_breadth,
        "entropy_ratio": normalized_entropy,
        "hhi": hhi,
    }


def _classification(tested_ratio: float) -> str:
    if tested_ratio >= 0.67:
        return "real-dominant"
    if tested_ratio >= 0.34:
        return "mixed"
    return "phantom-dominant"


def _verdict_copy(tested_ratio: float) -> tuple[str, str, str]:
    if tested_ratio >= 0.67:
        return (
            "Most of the portfolio's visible breadth survives the paper's stress-conditioning filter.",
            "Phantom diversification is present, but it is not dominating the structure.",
            "Improvement now comes more from reducing concentration than from adding unrelated names at random.",
        )
    if tested_ratio >= 0.34:
        return (
            "The portfolio has some real diversification, but a meaningful share disappears once variance stress is applied.",
            "Phantom diversification is doing enough work that the headline breadth number overstates resilience.",
            "The cleanest upgrade is adding holdings that raise tested breadth, not just raw breadth.",
        )
    return (
        "The portfolio looks wider on paper than it remains once the paper's variance-conditioning filter is applied.",
        "Most of the visible diversification is phantom and depends on a calm regime continuing.",
        "Improvement should come from removing crowding and adding positions that lift tested breadth in leave-one-out analysis.",
    )


def _series_metrics(price_panel: pd.DataFrame, holdings: list[PortfolioHolding]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    weights = np.asarray([holding.weight for holding in holdings], dtype=float)
    prices = price_panel.reindex(columns=[holding.ticker for holding in holdings]).sort_index().ffill().dropna()
    if len(prices.index) < WINDOW_DAYS + 1:
        raise PhantomDiversificationError("Not enough overlapping history to compute the 63-day window.")

    log_returns = np.log(prices / prices.shift(1)).dropna(how="any")
    records: list[dict[str, Any]] = []
    for end in range(WINDOW_DAYS - 1, len(log_returns.index)):
        window = log_returns.iloc[end - (WINDOW_DAYS - 1): end + 1]
        metrics = _current_window_metrics(window, weights)
        records.append({
            "date": pd.to_datetime(log_returns.index[end]).date().isoformat(),
            **metrics,
        })

    if not records:
        raise PhantomDiversificationError("No rolling window could be computed for this portfolio.")
    return records[-SERIES_POINTS:], records[-1]


def _contributor_rows(price_panel: pd.DataFrame, holdings: list[PortfolioHolding], current: dict[str, Any]) -> list[dict[str, Any]]:
    contributors: list[dict[str, Any]] = []
    for holding in holdings:
        reduced = [row for row in holdings if row.ticker != holding.ticker]
        if len(reduced) < 2:
            continue
        reduced_total = sum(row.weight for row in reduced)
        reduced_weights = [
            PortfolioHolding(ticker=row.ticker, weight=row.weight / reduced_total)
            for row in reduced
            if reduced_total > 0
        ]
        _, reduced_current = _series_metrics(price_panel, reduced_weights)
        delta_raw = current["raw_breadth"] - reduced_current["raw_breadth"]
        delta_real = current["real_breadth"] - reduced_current["real_breadth"]
        delta_phantom = current["phantom_breadth"] - reduced_current["phantom_breadth"]
        if delta_real > 0:
            role = "real diversifier"
        elif delta_raw > 0:
            role = "phantom diversifier"
        else:
            role = "crowding source"
        contributors.append({
            "ticker": holding.ticker,
            "weight": holding.weight,
            "delta_raw_breadth": round(float(delta_raw), 4),
            "delta_real_breadth": round(float(delta_real), 4),
            "delta_phantom_breadth": round(float(delta_phantom), 4),
            "role": role,
        })
    return sorted(contributors, key=lambda row: row["delta_real_breadth"], reverse=True)


def analyze_portfolio(rows: list[dict[str, Any]], *, workspace_id: str | None = None) -> dict[str, Any]:
    holdings = _normalize_holdings(rows)
    tickers = [holding.ticker for holding in holdings]
    paths = PathConfig()
    price_panel, supported, unsupported, source_labels = _load_price_panel(tickers, paths)

    if unsupported:
        raise PhantomDiversificationError(
            f"Unsupported tickers for live history: {', '.join(sorted(unsupported))}."
        )

    common_panel = price_panel.reindex(columns=tickers).dropna(how="any")
    if len(common_panel.index) < WINDOW_DAYS + 1:
        raise PhantomDiversificationError("The selected holdings do not share enough overlapping history for a 63-day analysis.")

    series, current = _series_metrics(common_panel, holdings)
    contributors = _contributor_rows(common_panel, holdings, current)
    verdict, phantom_text, improve_text = _verdict_copy(current["tested_ratio"])
    latest_date = series[-1]["date"]

    return {
        "workspace_id": workspace_id,
        "as_of": latest_date,
        "input": {
            "holdings": [{"ticker": row.ticker, "weight": row.weight} for row in holdings],
        },
        "current": {
            "holdings_count": len(holdings),
            "holdings_hhi_breadth": round(float(current["naive_breadth"]), 3),
            "raw_breadth": round(float(current["raw_breadth"]), 3),
            "real_breadth": round(float(current["real_breadth"]), 3),
            "phantom_breadth": round(float(current["phantom_breadth"]), 3),
            "phantom_share": round(float(current["phantom_share"]), 4),
            "correction_factor": round(float(current["correction_factor"]), 4),
            "realized_variance": round(float(current["realized_variance"]), 6),
            "classification": _classification(float(current["tested_ratio"])),
            "tested_ratio": round(float(current["tested_ratio"]), 4),
            "entropy_ratio": round(float(current["entropy_ratio"]), 4),
        },
        "series": [
            {
                "date": row["date"],
                "raw_breadth": round(float(row["raw_breadth"]), 3),
                "real_breadth": round(float(row["real_breadth"]), 3),
                "phantom_breadth": round(float(row["phantom_breadth"]), 3),
                "realized_variance": round(float(row["realized_variance"]), 6),
                "correction_factor": round(float(row["correction_factor"]), 4),
            }
            for row in series
        ],
        "contributors": [
            {
                **row,
                "weight": round(float(row["weight"]), 4),
            }
            for row in contributors
        ],
        "diagnostics": {
            "common_history_days": int(len(common_panel.index)),
            "window_days": WINDOW_DAYS,
            "correction_k": CORRECTION_K,
            "covariance_method": "Ledoit-Wolf shrinkage",
            "supported_tickers": supported,
            "source_labels": source_labels,
            "paper_formula": "D_tested = D_raw * (1 - exp(-100 * V))",
            "portfolio_adaptation": "Weighted correlation spectrum using current portfolio weights.",
        },
        "copy": {
            "verdict": verdict,
            "phantom": phantom_text,
            "improve": improve_text,
        },
    }
