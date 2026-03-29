from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd
from sklearn.covariance import LedoitWolf

from ..config import PathConfig, ResearchSettings
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
    sector: str | None = None
    country: str | None = None
    proxy_hint: str | None = None
    history_symbol: str | None = None
    history_source: str = "ticker"
    history_label: str | None = None


def _clean_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _normalize_proxy_hint(value: str | None) -> str | None:
    text = _clean_text(value)
    if not text:
        return None
    if 1 <= len(text) <= 16 and all(char.isalnum() or char in {".", "-"} for char in text):
        return text.upper()
    return text


def _normalize_holdings(rows: list[dict[str, Any]]) -> list[PortfolioHolding]:
    aggregated: dict[str, dict[str, Any]] = {}
    for row in rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        weight = float(row.get("weight") or 0.0)
        if weight <= 0:
            continue
        current = aggregated.setdefault(
            ticker,
            {
                "weight": 0.0,
                "sector": None,
                "country": None,
                "proxy_hint": None,
            },
        )
        current["weight"] += weight
        current["sector"] = current["sector"] or _clean_text(row.get("sector"))
        current["country"] = current["country"] or _clean_text(row.get("country"))
        current["proxy_hint"] = current["proxy_hint"] or _normalize_proxy_hint(row.get("proxy"))

    total = sum(item["weight"] for item in aggregated.values())
    if total <= 0:
        raise PhantomDiversificationError("Holdings weights must sum to more than zero.")

    normalized = [
        PortfolioHolding(
            ticker=ticker,
            weight=item["weight"] / total,
            sector=item["sector"],
            country=item["country"],
            proxy_hint=item["proxy_hint"],
        )
        for ticker, item in aggregated.items()
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


def _sector_proxy_lookup(settings: ResearchSettings) -> dict[str, str]:
    return {str(label).strip().lower(): str(ticker).strip().upper() for label, ticker in settings.sector_proxy_map}


def _country_proxy_lookup(settings: ResearchSettings) -> dict[str, str]:
    return {str(label).strip().lower(): str(ticker).strip().upper() for label, ticker in settings.international_proxy_map}


def _resolve_history_binding(holding: PortfolioHolding, settings: ResearchSettings) -> PortfolioHolding:
    market_proxy_tickers = {str(ticker).strip().upper() for ticker in settings.market_proxy_tickers}
    sector_lookup = _sector_proxy_lookup(settings)
    country_lookup = _country_proxy_lookup(settings)

    def bind(symbol: str, source: str, label: str | None = None) -> PortfolioHolding:
        return PortfolioHolding(
            ticker=holding.ticker,
            weight=holding.weight,
            sector=holding.sector,
            country=holding.country,
            proxy_hint=holding.proxy_hint,
            history_symbol=symbol,
            history_source=source,
            history_label=label,
        )

    proxy_hint = _normalize_proxy_hint(holding.proxy_hint)
    if proxy_hint:
        if proxy_hint in market_proxy_tickers:
            return bind(proxy_hint, "explicit_proxy_ticker", proxy_hint)
        if proxy_hint.lower() in sector_lookup:
            symbol = sector_lookup[proxy_hint.lower()]
            return bind(symbol, "sector_proxy", holding.proxy_hint)
        if proxy_hint.lower() in country_lookup:
            symbol = country_lookup[proxy_hint.lower()]
            return bind(symbol, "country_proxy", holding.proxy_hint)

    if holding.country and holding.country.strip().lower() in country_lookup:
        symbol = country_lookup[holding.country.strip().lower()]
        return bind(symbol, "country_proxy", holding.country)

    if holding.sector and holding.sector.strip().lower() in sector_lookup:
        symbol = sector_lookup[holding.sector.strip().lower()]
        return bind(symbol, "sector_proxy", holding.sector)

    return bind(holding.ticker, "ticker", None)


def _load_price_panel(
    holdings: list[PortfolioHolding],
    paths: PathConfig,
) -> tuple[pd.DataFrame, list[PortfolioHolding], list[PortfolioHolding], list[str]]:
    start_date, end_date = _business_start()
    source_labels: list[str] = []
    symbol_panel = pd.DataFrame()
    history_symbols = list(dict.fromkeys(holding.history_symbol or holding.ticker for holding in holdings))

    runtime = _sanitize_price_panel(load_runtime_frame("market:sp500_price_panel"))
    if not runtime.empty:
        runtime = runtime.reindex(columns=[symbol for symbol in history_symbols if symbol in runtime.columns]).copy()
        if not runtime.empty:
            symbol_panel = runtime
            source_labels.append("runtime_store")

    sp500_panel = _sanitize_price_panel(load_sp500_price_panel(paths, start_date, end_date))
    missing = [symbol for symbol in history_symbols if symbol not in symbol_panel.columns]
    if not sp500_panel.empty and missing:
        sp500_panel = sp500_panel.reindex(columns=[symbol for symbol in missing if symbol in sp500_panel.columns]).copy()
        if not sp500_panel.empty:
            symbol_panel = symbol_panel.join(sp500_panel, how="outer") if not symbol_panel.empty else sp500_panel
            source_labels.append("sp500_local_panel")

    missing = [symbol for symbol in history_symbols if symbol not in symbol_panel.columns]
    if missing:
        fmp_panel = _download_fmp_panel(missing, start_date, end_date, paths)
        if not fmp_panel.empty:
            symbol_panel = symbol_panel.join(fmp_panel, how="outer") if not symbol_panel.empty else fmp_panel
            source_labels.append("financial_modeling_prep")

    missing = [symbol for symbol in history_symbols if symbol not in symbol_panel.columns]
    if missing:
        yf_panel = _download_yfinance_panel(missing, start_date, end_date)
        if not yf_panel.empty:
            symbol_panel = symbol_panel.join(yf_panel, how="outer") if not symbol_panel.empty else yf_panel
            source_labels.append("yfinance")

    symbol_panel = _sanitize_price_panel(symbol_panel)
    missing = [symbol for symbol in history_symbols if symbol not in symbol_panel.columns]
    if missing:
        runtime_panel = to_datetime_index(load_runtime_frame("market:fmp_market_proxy_panel"))
        used_runtime_proxy = False
        for symbol in list(missing):
            if symbol not in runtime_panel.columns:
                continue
            fetched = runtime_panel[symbol].dropna()
            if fetched.empty:
                continue
            used_runtime_proxy = True
            if symbol in symbol_panel:
                symbol_panel[symbol] = fetched.combine_first(symbol_panel[symbol])
            else:
                symbol_panel[symbol] = fetched
        symbol_panel = _sanitize_price_panel(symbol_panel)
        if used_runtime_proxy:
            source_labels.append("runtime_proxy_panel")

    expanded: dict[str, pd.Series] = {}
    supported: list[PortfolioHolding] = []
    unsupported: list[PortfolioHolding] = []
    for holding in holdings:
        history_symbol = holding.history_symbol or holding.ticker
        if history_symbol not in symbol_panel.columns:
            unsupported.append(holding)
            continue
        series = symbol_panel[history_symbol].dropna()
        if series.empty:
            unsupported.append(holding)
            continue
        expanded[holding.ticker] = series.rename(holding.ticker)
        supported.append(holding)

    return _sanitize_price_panel(pd.DataFrame(expanded)), supported, unsupported, source_labels or ["none"]


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


def _classification_label(classification: str) -> str:
    return {
        "real-dominant": "Diversification holding up well",
        "mixed": "Some diversification is real, some is fragile",
        "phantom-dominant": "Diversification looks weaker under stress",
    }.get(classification, "Diversification read pending")


def _verdict_copy(tested_ratio: float) -> tuple[str, str, str]:
    if tested_ratio >= 0.67:
        return (
            "Most of your diversification still holds up when positions start moving together.",
            "That means the portfolio is not just wide on paper. A good share of the names are still acting like distinct bets.",
            "The next improvement is usually concentration control: trim oversized names before adding more random positions.",
        )
    if tested_ratio >= 0.34:
        return (
            "Part of your diversification is real, but a meaningful part disappears in tougher conditions.",
            "The portfolio is more diversified than a concentrated book, but less diversified than the headline number suggests.",
            "The cleanest upgrade is replacing overlapping names with holdings that truly behave differently from the rest of the book.",
        )
    return (
        "A large part of the diversification disappears once the portfolio is stress-tested.",
        "This usually means many positions are giving you the feeling of diversification without enough real independence underneath.",
        "Focus first on reducing overlap and adding exposures from different sectors, countries, or drivers of return.",
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


def _role_copy(delta_real: float, delta_raw: float) -> tuple[str, str]:
    if delta_real > 0:
        return "real diversifier", "This holding is adding diversification that still survives in tougher conditions."
    if delta_raw > 0:
        return "phantom diversifier", "This holding improves the headline breadth, but much of that benefit fades under stress."
    return "crowding source", "This holding overlaps with the rest of the portfolio enough that removing it does not hurt diversification."


def _contributor_rows(price_panel: pd.DataFrame, holdings: list[PortfolioHolding], current: dict[str, Any]) -> list[dict[str, Any]]:
    contributors: list[dict[str, Any]] = []
    for holding in holdings:
        reduced = [row for row in holdings if row.ticker != holding.ticker]
        if len(reduced) < 2:
            continue
        reduced_total = sum(row.weight for row in reduced)
        reduced_weights = [
            PortfolioHolding(
                ticker=row.ticker,
                weight=row.weight / reduced_total,
                sector=row.sector,
                country=row.country,
                proxy_hint=row.proxy_hint,
                history_symbol=row.history_symbol,
                history_source=row.history_source,
                history_label=row.history_label,
            )
            for row in reduced
            if reduced_total > 0
        ]
        _, reduced_current = _series_metrics(price_panel, reduced_weights)
        delta_raw = current["raw_breadth"] - reduced_current["raw_breadth"]
        delta_real = current["real_breadth"] - reduced_current["real_breadth"]
        delta_phantom = current["phantom_breadth"] - reduced_current["phantom_breadth"]
        role, role_summary = _role_copy(delta_real, delta_raw)
        contributors.append({
            "ticker": holding.ticker,
            "weight": holding.weight,
            "delta_raw_breadth": round(float(delta_raw), 4),
            "delta_real_breadth": round(float(delta_real), 4),
            "delta_phantom_breadth": round(float(delta_phantom), 4),
            "role": role,
            "role_summary": role_summary,
            "history_source": holding.history_source,
            "history_symbol": holding.history_symbol or holding.ticker,
            "history_label": holding.history_label,
        })
    return sorted(contributors, key=lambda row: row["delta_real_breadth"], reverse=True)


def analyze_portfolio(rows: list[dict[str, Any]], *, workspace_id: str | None = None) -> dict[str, Any]:
    settings = ResearchSettings()
    holdings = _normalize_holdings(rows)
    resolved_holdings = [_resolve_history_binding(holding, settings) for holding in holdings]
    paths = PathConfig()
    price_panel, supported_holdings, unsupported_holdings, source_labels = _load_price_panel(resolved_holdings, paths)

    if unsupported_holdings:
        unresolved = ", ".join(sorted(holding.ticker for holding in unsupported_holdings))
        raise PhantomDiversificationError(
            "Unsupported holdings for live history or proxy mapping: "
            f"{unresolved}. Add a sector, country, or ETF proxy such as Technology, Canada, or XLK."
        )

    common_panel = price_panel.reindex(columns=[holding.ticker for holding in resolved_holdings]).dropna(how="any")
    if len(common_panel.index) < WINDOW_DAYS + 1:
        raise PhantomDiversificationError("The selected holdings do not share enough overlapping history for a 63-day analysis.")

    series, current = _series_metrics(common_panel, resolved_holdings)
    contributors = _contributor_rows(common_panel, resolved_holdings, current)
    verdict, phantom_text, improve_text = _verdict_copy(current["tested_ratio"])
    latest_date = series[-1]["date"]
    classification = _classification(float(current["tested_ratio"]))
    proxy_assignments = [
        {
            "ticker": holding.ticker,
            "history_symbol": holding.history_symbol or holding.ticker,
            "history_source": holding.history_source,
            "history_label": holding.history_label,
            "proxy_used": holding.history_source != "ticker",
        }
        for holding in supported_holdings
    ]
    proxied_holdings = [row for row in proxy_assignments if row["proxy_used"]]

    return {
        "workspace_id": workspace_id,
        "as_of": latest_date,
        "input": {
            "holdings": [{"ticker": row.ticker, "weight": row.weight} for row in resolved_holdings],
        },
        "current": {
            "holdings_count": len(resolved_holdings),
            "holdings_hhi_breadth": round(float(current["naive_breadth"]), 3),
            "raw_breadth": round(float(current["raw_breadth"]), 3),
            "real_breadth": round(float(current["real_breadth"]), 3),
            "phantom_breadth": round(float(current["phantom_breadth"]), 3),
            "phantom_share": round(float(current["phantom_share"]), 4),
            "correction_factor": round(float(current["correction_factor"]), 4),
            "realized_variance": round(float(current["realized_variance"]), 6),
            "classification": classification,
            "classification_label": _classification_label(classification),
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
            "supported_tickers": [holding.ticker for holding in supported_holdings],
            "source_labels": source_labels,
            "paper_formula": "D_tested = D_raw * (1 - exp(-100 * V))",
            "portfolio_adaptation": "Weighted correlation spectrum using current portfolio weights.",
            "proxy_assignments": proxy_assignments,
            "proxied_holdings": proxied_holdings,
            "unsupported_tickers": [holding.ticker for holding in unsupported_holdings],
        },
        "copy": {
            "verdict": verdict,
            "phantom": phantom_text,
            "improve": improve_text,
            "naive_breadth": "Visible breadth: how diversified the portfolio looks if you only inspect position sizes.",
            "raw_breadth": "Market breadth: how many separate bets the price history suggests in calmer conditions.",
            "real_breadth": "Stress-tested breadth: how many separate bets still remain after penalizing crowding and co-movement.",
            "phantom_share": "Diversification at risk: the share that disappears when holdings start behaving too similarly.",
            "leave_one_out": "Remove one holding at a time to see whether it is adding real diversification, mostly cosmetic diversification, or overlap.",
            "proxy_note": "When a ticker has no usable history, the module can analyze it through a sector ETF, country ETF, or a proxy ticker you provide.",
        },
    }


def to_datetime_index(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame
    result = frame.copy()
    result.index = pd.to_datetime(result.index)
    return result.sort_index()
