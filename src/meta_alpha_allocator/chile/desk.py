from __future__ import annotations

import json
from datetime import datetime, timezone
import io
from pathlib import Path
from typing import Any
import unicodedata

import numpy as np
import pandas as pd
import requests
import yfinance as yf

from ..config import PathConfig
from ..utils import ensure_directory
from .xbrl import load_local_xbrl_fundamentals


UTC = timezone.utc
DEFAULT_BENCHMARK = "^IPSA"
DEFAULT_FX_TICKER = "CLP=X"
FALLBACK_BENCHMARK = "ECH"
CMF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    "Referer": "https://www.cmfchile.cl/institucional/estadisticas/estadisticas_ifrs.php",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
CMF_CONCEPT_MAP: dict[str, tuple[str, ...]] = {
    "cmf_cash": ("efectivo y equivalentes al efectivo",),
    "cmf_revenue": ("ingresos de actividades ordinarias", "ingresos ordinarios"),
    "cmf_net_income": (
        "ganancia (perdida), atribuible a los propietarios de la controladora",
        "ganancia (perdida)",
    ),
    "cmf_equity": ("patrimonio total",),
    "cmf_liabilities": ("pasivos totales",),
}


def _safe_json_load(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8").replace("NaN", "null"))


def _rank_score(series: pd.Series, *, ascending: bool = True) -> pd.Series:
    clean = pd.to_numeric(series, errors="coerce")
    if clean.dropna().empty:
        return pd.Series(np.nan, index=series.index)
    return clean.rank(pct=True, ascending=ascending)


def _clamp_series(series: pd.Series, low: float, high: float) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").clip(lower=low, upper=high)


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if np.isnan(numeric) or np.isinf(numeric):
        return None
    return numeric


def _safe_pct(value: Any) -> float | None:
    numeric = _safe_float(value)
    if numeric is None:
        return None
    if abs(numeric) > 10:
        return None
    return numeric


def _normalize_text(value: Any) -> str:
    text = "" if value is None else str(value)
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return " ".join(normalized.lower().split())


def _coerce_numeric_columns(frame: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    for column in columns:
        if column in frame.columns:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
    return frame


def _pct_change_no_pad(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").pct_change(fill_method=None)


def _empty_chile_snapshot(
    *,
    source: str,
    headline: str,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "generated_at": datetime.now(tz=UTC).isoformat(),
        "as_of_date": None,
        "source": source,
        "headline": headline,
        "benchmark": {},
        "fx": {},
        "overview": {},
        "leaders": [],
        "laggards": [],
        "sector_map": [],
        "preferred": [],
        "opportunity_map": [],
        "rows": [],
        "warnings": warnings or [],
        "stale_days": None,
    }


def _load_universe(paths: PathConfig) -> pd.DataFrame:
    custom_path = Path(paths.project_root / "artifacts" / "chile" / "universe.csv")
    if custom_path.exists():
        return pd.read_csv(custom_path)
    return pd.DataFrame(columns=["ticker", "name", "sector", "theme", "cmf_entity", "cmf_aliases"])


def _extract_close_panel(download: pd.DataFrame) -> pd.DataFrame:
    if download.empty:
        return pd.DataFrame()
    if isinstance(download.columns, pd.MultiIndex):
        if "Close" in download.columns.get_level_values(0):
            panel = download["Close"].copy()
        elif "Adj Close" in download.columns.get_level_values(0):
            panel = download["Adj Close"].copy()
        else:
            panel = download.xs(download.columns.levels[0][0], axis=1, level=0).copy()
    else:
        column = "Close" if "Close" in download.columns else download.columns[0]
        panel = download[[column]].copy()
        panel.columns = ["Close"]
    if isinstance(panel, pd.Series):
        panel = panel.to_frame()
    panel.index = pd.to_datetime(panel.index).tz_localize(None)
    return panel


def _fetch_price_panel(tickers: list[str]) -> pd.DataFrame:
    if not tickers:
        return pd.DataFrame()
    download = yf.download(
        tickers=tickers,
        period="2y",
        interval="1d",
        auto_adjust=True,
        progress=False,
        group_by="column",
        threads=False,
    )
    panel = _extract_close_panel(download)
    if len(tickers) == 1 and "Close" in panel.columns:
        panel.columns = [tickers[0]]
    return panel.dropna(how="all")


def _fetch_fundamentals(tickers: list[str]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for ticker in tickers:
        try:
            info = yf.Ticker(ticker).info
        except Exception:
            info = {}
        rows.append(
            {
                "ticker": ticker,
                "market_cap": _safe_float(info.get("marketCap")),
                "trailing_pe": _safe_float(info.get("trailingPE")),
                "price_to_book": _safe_float(info.get("priceToBook")),
                "enterprise_to_ebitda": _safe_float(info.get("enterpriseToEbitda")),
                "roe": _safe_float(info.get("returnOnEquity")),
                "sector_live": info.get("sector"),
            }
        )
    return pd.DataFrame(rows)


def _quarter_candidate_months(reference: datetime, periods: int = 6) -> list[str]:
    months: list[str] = []
    quarter_end_months = [12, 9, 6, 3]
    year = reference.year
    while len(months) < periods:
        for month in quarter_end_months:
            if year == reference.year and month >= reference.month:
                continue
            months.append(f"{year}{month:02d}")
            if len(months) >= periods:
                break
        year -= 1
    return months


def _fetch_cmf_txt(paths: PathConfig) -> tuple[str | None, str | None]:
    output_dir = paths.output_root / "chile" / "latest"
    ensure_directory(output_dir)
    latest_text_path = output_dir / "cmf_ifrs_latest.txt"
    latest_meta_path = output_dir / "cmf_ifrs_latest.json"
    for period in _quarter_candidate_months(datetime.now(tz=UTC)):
        url = f"https://www.cmfchile.cl/institucional/estadisticas/ver_archivo.php?inicio={period}&termino={period}"
        response = requests.get(url, headers=CMF_HEADERS, timeout=45)
        if response.status_code != 200 or not response.text.strip():
            continue
        latest_text_path.write_text(response.text, encoding="utf-8")
        latest_meta_path.write_text(json.dumps({"period": period, "url": url}, indent=2), encoding="utf-8")
        return period, response.text
    if latest_text_path.exists():
        meta = _safe_json_load(latest_meta_path) or {}
        return meta.get("period"), latest_text_path.read_text(encoding="utf-8")
    return None, None


def _extract_cmf_fundamentals(universe: pd.DataFrame, cmf_text: str | None) -> pd.DataFrame:
    if not cmf_text:
        return pd.DataFrame(columns=["ticker"])
    frame = pd.read_csv(
        io.StringIO(cmf_text),
        sep=";",
        header=None,
        names=["period", "rut", "entity", "filing_type", "currency", "item", "value", "tax", "statement"],
        dtype={"period": str, "rut": str, "entity": str, "filing_type": str, "currency": str, "item": str, "tax": str, "statement": str},
        on_bad_lines="skip",
    )
    if frame.empty:
        return pd.DataFrame(columns=["ticker"])
    frame["entity_norm"] = frame["entity"].map(_normalize_text)
    frame["item_norm"] = frame["item"].map(_normalize_text)
    frame["value"] = pd.to_numeric(frame["value"], errors="coerce")
    base_frame = frame.copy()
    valid_entities = universe[["ticker", "cmf_entity", "cmf_aliases"]].copy()
    valid_entities = valid_entities.loc[valid_entities["cmf_entity"].notna() | valid_entities["cmf_aliases"].notna()].copy()
    if valid_entities.empty:
        return pd.DataFrame(columns=["ticker"])
    alias_rows: list[dict[str, Any]] = []
    for item in valid_entities.to_dict(orient="records"):
        alias_text = "" if pd.isna(item.get("cmf_aliases")) else str(item.get("cmf_aliases") or "")
        aliases = [item.get("cmf_entity"), *alias_text.split("|")]
        for alias in aliases:
            alias_norm = _normalize_text(alias)
            if alias_norm and alias_norm != "nan":
                alias_rows.append({"ticker": item["ticker"], "entity_norm": alias_norm})
    alias_frame = pd.DataFrame(alias_rows).drop_duplicates()
    frame = frame.merge(alias_frame, on="entity_norm", how="inner")
    if frame.empty:
        matched_rows: list[dict[str, Any]] = []
        unique_entities = base_frame[["entity_norm"]].drop_duplicates()
        for item in alias_rows:
            alias_norm = item["entity_norm"]
            for entity_norm in unique_entities.get("entity_norm", []):
                if len(alias_norm) < 8:
                    continue
                if alias_norm in entity_norm or entity_norm in alias_norm:
                    matched_rows.append({"ticker": item["ticker"], "entity_norm": entity_norm})
        if matched_rows:
            frame = base_frame.merge(pd.DataFrame(matched_rows).drop_duplicates(), on="entity_norm", how="inner")
    if frame.empty:
        return pd.DataFrame(columns=["ticker"])

    rows: list[dict[str, Any]] = []
    for ticker, group in frame.groupby("ticker"):
        payload: dict[str, Any] = {"ticker": ticker}
        for key, patterns in CMF_CONCEPT_MAP.items():
            matches = group[group["item_norm"].apply(lambda value: any(pattern in value for pattern in patterns))]
            if matches.empty:
                payload[key] = None
                continue
            match = matches.loc[matches["value"].abs().idxmax()]
            payload[key] = _safe_float(match["value"])
        rows.append(payload)
    fundamentals = pd.DataFrame(rows)
    if fundamentals.empty:
        return fundamentals
    numeric_cols = [column for column in fundamentals.columns if column != "ticker"]
    fundamentals = _coerce_numeric_columns(fundamentals, numeric_cols)
    fundamentals["cmf_margin"] = fundamentals["cmf_net_income"] / fundamentals["cmf_revenue"]
    fundamentals["cmf_leverage"] = fundamentals["cmf_liabilities"] / fundamentals["cmf_equity"]
    fundamentals["cmf_cash_buffer"] = fundamentals["cmf_cash"] / fundamentals["cmf_liabilities"]
    fundamentals[numeric_cols] = fundamentals[numeric_cols].mask(np.isinf(fundamentals[numeric_cols]), np.nan)
    return fundamentals


def _latest_price(series: pd.Series) -> float | None:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if clean.empty:
        return None
    return float(clean.iloc[-1])


def _period_return(series: pd.Series, days: int) -> float | None:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if len(clean) <= days:
        return None
    return float(clean.iloc[-1] / clean.iloc[-(days + 1)] - 1.0)


def _drawdown_from_high(series: pd.Series, lookback: int = 252) -> float | None:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if clean.empty:
        return None
    window = clean.tail(lookback)
    return float(window.iloc[-1] / window.max() - 1.0)


def _annual_vol(series: pd.Series, lookback: int = 63) -> float | None:
    clean = _pct_change_no_pad(series).dropna()
    if len(clean) < min(lookback, 20):
        return None
    return float(clean.tail(lookback).std() * np.sqrt(252.0))


def _corr_to_benchmark(series: pd.Series, benchmark: pd.Series, lookback: int = 63) -> float | None:
    asset = _pct_change_no_pad(series)
    bench = _pct_change_no_pad(benchmark)
    frame = pd.concat([asset, bench], axis=1, keys=["asset", "bench"]).dropna()
    if len(frame) < min(lookback, 20):
        return None
    return float(frame.tail(lookback)["asset"].corr(frame.tail(lookback)["bench"]))


def _json_default(value: Any) -> Any:
    if isinstance(value, (datetime, pd.Timestamp)):
        return value.isoformat()
    if isinstance(value, np.generic):
        return value.item()
    if pd.isna(value):
        return None
    raise TypeError(f"Object of type {type(value)!r} is not JSON serializable")


def _choose_benchmark(prices: pd.DataFrame) -> tuple[str, pd.Series]:
    primary = prices.get(DEFAULT_BENCHMARK, pd.Series(dtype=float))
    fallback = prices.get(FALLBACK_BENCHMARK, pd.Series(dtype=float))
    if pd.to_numeric(primary, errors="coerce").dropna().shape[0] >= 64:
        return DEFAULT_BENCHMARK, primary
    if pd.to_numeric(fallback, errors="coerce").dropna().shape[0] >= 64:
        return FALLBACK_BENCHMARK, fallback
    if not primary.empty:
        return DEFAULT_BENCHMARK, primary
    return FALLBACK_BENCHMARK, fallback


def _build_from_market_data(
    universe: pd.DataFrame,
    prices: pd.DataFrame,
    fundamentals: pd.DataFrame,
    cmf_fundamentals: pd.DataFrame,
    cmf_period: str | None,
    xbrl_fundamentals: pd.DataFrame,
) -> dict[str, Any]:
    benchmark_ticker, benchmark = _choose_benchmark(prices)
    fx_ticker = DEFAULT_FX_TICKER if DEFAULT_FX_TICKER in prices.columns else None
    rows: list[dict[str, Any]] = []
    for item in universe.to_dict(orient="records"):
        ticker = item["ticker"]
        if ticker not in prices.columns:
            continue
        series = prices[ticker]
        fundamentals_row = fundamentals.loc[fundamentals["ticker"] == ticker]
        cmf_row = cmf_fundamentals.loc[cmf_fundamentals["ticker"] == ticker]
        xbrl_row = xbrl_fundamentals.loc[xbrl_fundamentals["ticker"] == ticker]
        fundamentals_payload = fundamentals_row.iloc[0].to_dict() if not fundamentals_row.empty else {}
        cmf_payload = cmf_row.iloc[0].to_dict() if not cmf_row.empty else {}
        xbrl_payload = xbrl_row.iloc[0].to_dict() if not xbrl_row.empty else {}
        momentum_3m = _period_return(series, 63)
        momentum_6m = _period_return(series, 126)
        drawdown = _drawdown_from_high(series)
        volatility = _annual_vol(series)
        correlation = _corr_to_benchmark(series, benchmark) if not benchmark.empty else None
        rows.append(
            {
                "ticker": ticker,
                "name": item.get("name") or ticker,
                "sector": item.get("sector") or fundamentals_payload.get("sector_live") or "Unknown",
                "theme": item.get("theme") or "",
                "price": _latest_price(series),
                "return_1m": _period_return(series, 21),
                "return_3m": momentum_3m,
                "return_6m": momentum_6m,
                "drawdown_1y": drawdown,
                "volatility_3m": volatility,
                "corr_to_ipsa": correlation,
                "market_cap": fundamentals_payload.get("market_cap"),
                "trailing_pe": fundamentals_payload.get("trailing_pe"),
                "price_to_book": fundamentals_payload.get("price_to_book"),
                "enterprise_to_ebitda": fundamentals_payload.get("enterprise_to_ebitda"),
                "roe": fundamentals_payload.get("roe"),
                "xbrl_cash": xbrl_payload.get("xbrl_cash"),
                "xbrl_revenue": xbrl_payload.get("xbrl_revenue"),
                "xbrl_net_income": xbrl_payload.get("xbrl_net_income"),
                "xbrl_equity": xbrl_payload.get("xbrl_equity"),
                "xbrl_liabilities": xbrl_payload.get("xbrl_liabilities"),
                "xbrl_margin": xbrl_payload.get("xbrl_margin"),
                "xbrl_leverage": xbrl_payload.get("xbrl_leverage"),
                "xbrl_cash_buffer": xbrl_payload.get("xbrl_cash_buffer"),
                "cmf_cash": cmf_payload.get("cmf_cash"),
                "cmf_revenue": cmf_payload.get("cmf_revenue"),
                "cmf_net_income": cmf_payload.get("cmf_net_income"),
                "cmf_equity": cmf_payload.get("cmf_equity"),
                "cmf_liabilities": cmf_payload.get("cmf_liabilities"),
                "cmf_margin": cmf_payload.get("cmf_margin"),
                "cmf_leverage": cmf_payload.get("cmf_leverage"),
                "cmf_cash_buffer": cmf_payload.get("cmf_cash_buffer"),
            }
        )

    frame = pd.DataFrame(rows)
    if frame.empty:
        return _empty_chile_snapshot(
            source="empty",
            headline="Chile desk is waiting for its first market pull.",
        )

    numeric_cols = [
        "price",
        "return_1m",
        "return_3m",
        "return_6m",
        "drawdown_1y",
        "volatility_3m",
        "corr_to_ipsa",
        "market_cap",
        "trailing_pe",
        "price_to_book",
        "enterprise_to_ebitda",
        "roe",
        "xbrl_cash",
        "xbrl_revenue",
        "xbrl_net_income",
        "xbrl_equity",
        "xbrl_liabilities",
        "xbrl_margin",
        "xbrl_leverage",
        "xbrl_cash_buffer",
        "cmf_cash",
        "cmf_revenue",
        "cmf_net_income",
        "cmf_equity",
        "cmf_liabilities",
        "cmf_margin",
        "cmf_leverage",
        "cmf_cash_buffer",
    ]
    frame = _coerce_numeric_columns(frame, numeric_cols)

    frame["filing_margin"] = frame["xbrl_margin"].combine_first(frame["cmf_margin"])
    frame["filing_cash_buffer"] = frame["xbrl_cash_buffer"].combine_first(frame["cmf_cash_buffer"])
    frame["filing_leverage"] = frame["xbrl_leverage"].combine_first(frame["cmf_leverage"])
    yahoo_quality = _rank_score(_clamp_series(frame["roe"], -1, 1), ascending=True).fillna(0.45)
    filing_quality = (
        _rank_score(_clamp_series(frame["filing_margin"], -1, 1), ascending=True).fillna(0.45) * 0.45
        + _rank_score(_clamp_series(frame["filing_cash_buffer"], -1, 2), ascending=True).fillna(0.45) * 0.35
        + _rank_score(_clamp_series(frame["filing_leverage"], 0, 10), ascending=False).fillna(0.45) * 0.20
    )
    frame["quality_score"] = yahoo_quality * 0.4 + filing_quality * 0.6
    frame["value_score"] = (
        _rank_score(_clamp_series(frame["trailing_pe"], 0, 80), ascending=False).fillna(0.5) * 0.6
        + _rank_score(_clamp_series(frame["price_to_book"], 0, 15), ascending=False).fillna(0.5) * 0.4
    )
    frame["momentum_score"] = _rank_score(frame["return_6m"], ascending=True)
    frame["independence_score"] = _rank_score(frame["corr_to_ipsa"], ascending=False)
    frame["opportunity_score"] = (
        frame["quality_score"].fillna(0.45) * 0.3
        + frame["value_score"].fillna(0.45) * 0.25
        + frame["momentum_score"].fillna(0.45) * 0.25
        + frame["independence_score"].fillna(0.45) * 0.2
    )
    frame["fragility_score"] = (
        _rank_score(frame["volatility_3m"], ascending=True).fillna(0.5) * 0.5
        + _rank_score(frame["drawdown_1y"], ascending=False).fillna(0.5) * 0.5
    )
    frame = frame.sort_values("opportunity_score", ascending=False, na_position="last").reset_index(drop=True)

    sector_summary = (
        frame.groupby("sector", dropna=False)
        .agg(
            names=("ticker", "count"),
            avg_score=("opportunity_score", "mean"),
            avg_return_3m=("return_3m", "mean"),
        )
        .reset_index()
        .sort_values("avg_score", ascending=False)
    )
    broad_positive = int((pd.to_numeric(frame["return_3m"], errors="coerce") > 0).sum())
    as_of_date = prices.index.max().date().isoformat() if not prices.empty else None
    benchmark_price = _latest_price(benchmark) if not benchmark.empty else None
    fx_series = prices.get(fx_ticker, pd.Series(dtype=float)) if fx_ticker else pd.Series(dtype=float)
    cmf_coverage = int(frame["cmf_revenue"].notna().sum()) if "cmf_revenue" in frame.columns else 0
    xbrl_coverage = int(frame["xbrl_revenue"].notna().sum()) if "xbrl_revenue" in frame.columns else 0

    return {
        "as_of_date": as_of_date,
        "source": "yahoo_finance + xbrl + cmf_ifrs_txt" if xbrl_coverage else ("yahoo_finance + cmf_ifrs_txt" if cmf_coverage else "yahoo_finance"),
        "headline": (
            f"Chile breadth is {'constructive' if broad_positive >= max(len(frame) // 2, 3) else 'narrow'}, "
            f"with {frame.iloc[0]['ticker']} currently leading the opportunity map."
            + (f" XBRL coverage is live for {xbrl_coverage} names." if xbrl_coverage else "")
            + (f" CMF coverage is live for {cmf_coverage} names." if cmf_coverage else "")
        ),
        "benchmark": {
            "ticker": benchmark_ticker,
            "price": benchmark_price,
            "return_1m": _period_return(benchmark, 21) if not benchmark.empty else None,
            "return_3m": _period_return(benchmark, 63) if not benchmark.empty else None,
        },
        "fx": {
            "ticker": fx_ticker or DEFAULT_FX_TICKER,
            "price": _latest_price(fx_series) if not fx_series.empty else None,
            "return_1m": _period_return(fx_series, 21) if not fx_series.empty else None,
            "return_3m": _period_return(fx_series, 63) if not fx_series.empty else None,
        },
        "overview": {
            "breadth_positive_ratio": broad_positive / max(len(frame), 1),
            "average_return_3m": _safe_float(frame["return_3m"].mean()),
            "median_volatility_3m": _safe_float(frame["volatility_3m"].median()),
            "coverage_count": int(len(frame)),
            "xbrl_coverage_count": xbrl_coverage,
            "cmf_coverage_count": cmf_coverage,
            "cmf_period": cmf_period,
        },
        "leaders": frame.sort_values("return_1m", ascending=False).head(5).replace({np.nan: None}).to_dict(orient="records"),
        "laggards": frame.sort_values("return_1m", ascending=True).head(5).replace({np.nan: None}).to_dict(orient="records"),
        "sector_map": sector_summary.replace({np.nan: None}).to_dict(orient="records"),
        "preferred": frame.head(6).replace({np.nan: None}).to_dict(orient="records"),
        "opportunity_map": frame.head(10).replace({np.nan: None}).to_dict(orient="records"),
        "rows": frame.replace({np.nan: None}).to_dict(orient="records"),
        "stale_days": 0,
    }


def build_chile_market_snapshot(paths: PathConfig, *, refresh: bool = False) -> dict[str, Any]:
    output_dir = paths.output_root / "chile" / "latest"
    cache_path = output_dir / "chile_market.json"
    artifact_path = paths.artifact_root / "chile" / "latest" / "chile_market.json"
    if not refresh:
        for path in [cache_path, artifact_path]:
            cached = _safe_json_load(path)
            if cached is not None:
                return cached
        return _empty_chile_snapshot(
            source="deferred",
            headline="Chile desk is waiting for the background refresh to build its first market snapshot.",
        )

    universe = _load_universe(paths)
    tickers = universe["ticker"].dropna().astype(str).tolist()
    request_tickers = [*tickers, DEFAULT_BENCHMARK, "ECH", DEFAULT_FX_TICKER]
    try:
        prices = _fetch_price_panel(request_tickers)
        fundamentals = _fetch_fundamentals(tickers)
        cmf_period, cmf_text = _fetch_cmf_txt(paths)
        cmf_fundamentals = _extract_cmf_fundamentals(universe, cmf_text)
        xbrl_fundamentals = load_local_xbrl_fundamentals(paths, universe)
        snapshot = _build_from_market_data(universe, prices, fundamentals, cmf_fundamentals, cmf_period, xbrl_fundamentals)
        snapshot["generated_at"] = datetime.now(tz=UTC).isoformat()
        ensure_directory(output_dir)
        ensure_directory(artifact_path.parent)
        payload = json.dumps(snapshot, indent=2, default=_json_default)
        cache_path.write_text(payload, encoding="utf-8")
        artifact_path.write_text(payload, encoding="utf-8")
        return snapshot
    except Exception as exc:
        cached = _safe_json_load(cache_path) or _safe_json_load(artifact_path)
        if cached is not None:
            cached.setdefault("warnings", [])
            cached["warnings"] = list(cached.get("warnings", [])) + [f"using cached Chile desk because refresh failed: {exc}"]
            return cached
        return _empty_chile_snapshot(
            source="fallback",
            headline="Chile desk is mounted, but the first price pull failed.",
            warnings=[f"chile market refresh failed: {exc}"],
        )
