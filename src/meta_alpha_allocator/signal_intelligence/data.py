from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Iterable

import pandas as pd


@dataclass(frozen=True)
class AssetSpec:
    key: str
    provider_symbol: str
    asset_class: str
    currency: str = "USD"
    benchmark_key: str | None = None
    volume_kind: str = "none"
    calendar: str = "business"
    rights_status: str = "pending"
    coverage_status: str = "unknown"
    coverage_pct: float = 0.0
    last_data_date: str | None = None


_CONTEXT_OVERRIDES = {
    "SPX": ("^GSPC", "index", "none"),
    "NDX": ("^NDX", "index", "none"),
    "RUT": ("^RUT", "index", "none"),
    "VIX": ("^VIX", "index", "none"),
    "BTC/USD": ("BTCUSD", "crypto", "exchange"),
    "ETH/USD": ("ETHUSD", "crypto", "exchange"),
    "EUR/USD": ("EURUSD", "fx", "none"),
    "USD/JPY": ("USDJPY", "fx", "none"),
    "GBP/USD": ("GBPUSD", "fx", "none"),
    "USD/CLP": ("USDCLP", "fx", "none"),
    "GOLD": ("GCUSD", "commodity", "none"),
    "WTI": ("CLUSD", "commodity", "none"),
}


def asset_spec_for_key(key: str) -> AssetSpec:
    canonical = str(key or "").strip().upper()
    provider_symbol, asset_class, volume_kind = _CONTEXT_OVERRIDES.get(canonical, (canonical, "equity", "exchange"))
    benchmark = "SPX" if asset_class in {"equity", "etf"} else None
    return AssetSpec(
        key=canonical,
        provider_symbol=provider_symbol,
        asset_class=asset_class,
        benchmark_key=benchmark,
        volume_kind=volume_kind,
        rights_status="pending",
    )


def default_context_specs(keys: Iterable[str]) -> list[AssetSpec]:
    return [asset_spec_for_key(key) for key in keys]


def _records(rows: Any) -> list[dict[str, Any]]:
    if isinstance(rows, pd.DataFrame):
        return rows.to_dict(orient="records")
    if isinstance(rows, dict):
        rows = rows.get("historical", rows.get("data", rows))
    return [dict(row) for row in rows or [] if isinstance(row, dict)]


def normalize_eod_bars(rows: Iterable[dict[str, Any]] | pd.DataFrame, *, asset_key: str, asset_class: str) -> pd.DataFrame:
    records = _records(rows)
    if not records:
        return pd.DataFrame(
            columns=["date", "open", "high", "low", "close", "adj_close", "volume", "raw_close", "adjustment_factor", "input_hash"]
        )
    frame = pd.DataFrame(records)
    date_column = "date" if "date" in frame.columns else "calendarDate" if "calendarDate" in frame.columns else None
    if not date_column:
        raise ValueError("EOD data requires a date")
    frame["date"] = pd.to_datetime(frame[date_column], errors="coerce", utc=True).dt.tz_convert(None).dt.normalize()
    if frame["date"].isna().any():
        raise ValueError("EOD data contains invalid dates")
    if frame["date"].duplicated().any():
        raise ValueError("EOD data contains duplicate dates")
    for column in ("open", "high", "low", "close", "adjClose", "adj_close", "volume"):
        if column in frame:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
    if "close" not in frame:
        if "price" in frame:
            frame["close"] = frame["price"]
        else:
            raise ValueError("EOD data requires close")
    for column in ("open", "high", "low"):
        if column not in frame:
            frame[column] = frame["close"]
    if "adjClose" in frame:
        frame["adj_close"] = frame["adjClose"].combine_first(frame["close"])
    elif "adj_close" not in frame:
        frame["adj_close"] = frame["close"]
    frame["raw_close"] = frame["close"]
    frame["adjustment_factor"] = (frame["adj_close"] / frame["raw_close"].replace(0, pd.NA)).fillna(1.0)
    for column in ("open", "high", "low", "close"):
        frame[column] = frame[column] * frame["adjustment_factor"]
    if "volume" not in frame:
        frame["volume"] = pd.NA
    frame = frame.sort_values("date", kind="stable").reset_index(drop=True)
    if (frame[["high", "low", "close"]].isna().any().any()) or (frame["low"] > frame["high"]).any():
        raise ValueError("EOD data contains invalid OHLC values")
    canonical = frame[["date", "open", "high", "low", "close", "adj_close", "volume", "raw_close", "adjustment_factor"]].copy()
    canonical["date"] = canonical["date"].dt.strftime("%Y-%m-%d")
    raw = json.dumps(canonical.where(canonical.notna(), None).to_dict(orient="records"), sort_keys=True, separators=(",", ":"))
    frame["input_hash"] = hashlib.sha256(f"{asset_key}:{asset_class}:{raw}".encode("utf-8")).hexdigest()
    return frame[["date", "open", "high", "low", "close", "adj_close", "volume", "raw_close", "adjustment_factor", "input_hash"]]


def coverage_pct(frame: pd.DataFrame, expected_sessions: Iterable[Any]) -> float:
    expected = pd.to_datetime(list(expected_sessions), errors="coerce", utc=True).tz_convert(None).normalize()
    if len(expected) == 0:
        return 0.0
    if frame is None or frame.empty or "date" not in frame:
        return 0.0
    observed = set(pd.to_datetime(frame["date"], errors="coerce", utc=True).dt.tz_convert(None).dt.normalize().dropna())
    return float(sum(day in observed for day in expected) / len(expected))


def is_stale(last_date: Any, *, as_of: Any, asset_class: str) -> bool:
    if last_date in (None, ""):
        return True
    last = pd.Timestamp(last_date).normalize()
    current = pd.Timestamp(as_of).normalize()
    threshold_days = 2 if asset_class.lower() == "crypto" else 4
    return (current - last).days > threshold_days
