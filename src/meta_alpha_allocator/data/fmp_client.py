from __future__ import annotations

import json
import os
import time
from time import sleep
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import pandas as pd
import requests


FMP_BASE_URL = "https://financialmodelingprep.com/api/v3"
FMP_STABLE_BASE_URL = "https://financialmodelingprep.com/stable"
PLACEHOLDER_API_KEYS = {"replace_me", "your_key_here", "changeme", "todo", "none", "null", "dummy"}
DEFAULT_PROFILE_CACHE_TTL_SECONDS = 1800
DEFAULT_QUOTE_CACHE_TTL_SECONDS = 300
DEFAULT_TTM_CACHE_TTL_SECONDS = 21600
DEFAULT_ANALYST_ESTIMATES_CACHE_TTL_SECONDS = 21600
DEFAULT_QUARTERLY_STATEMENT_CACHE_TTL_SECONDS = 21600
DEFAULT_ANNUAL_STATEMENT_CACHE_TTL_SECONDS = 86400


def _usable_env_value(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    if not cleaned:
        return None
    if cleaned.lower() in PLACEHOLDER_API_KEYS:
        return None
    return cleaned


def _positive_int(value: Any, fallback: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = fallback
    return max(1, parsed)


def _payload_records(payload: Any, *wrapper_keys: str) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []
    for key in wrapper_keys:
        rows = payload.get(key)
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
        if isinstance(rows, dict):
            return [rows]
    return [payload] if payload else []


def _with_payload_as_of(record: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(record)
    if normalized.get("as_of"):
        return normalized

    timestamp = normalized.get("timestamp")
    try:
        numeric_timestamp = float(timestamp)
    except (TypeError, ValueError):
        numeric_timestamp = None
    if numeric_timestamp is not None:
        if numeric_timestamp > 10_000_000_000:
            numeric_timestamp /= 1000
        try:
            normalized["as_of"] = datetime.fromtimestamp(numeric_timestamp, tz=timezone.utc).isoformat()
            return normalized
        except (OverflowError, OSError, ValueError):
            pass

    for key in ("date", "lastUpdated", "updatedAt"):
        value = normalized.get(key)
        if value in (None, ""):
            continue
        parsed = pd.to_datetime(value, errors="coerce", utc=True)
        if not pd.isna(parsed):
            normalized["as_of"] = parsed.isoformat()
            break
    return normalized


def _raise_for_fmp_status(response: requests.Response, endpoint: str) -> None:
    if response.ok:
        return
    parsed = urlparse(response.url)
    safe_path = parsed.path.lstrip("/") or endpoint
    raise requests.HTTPError(f"FMP request failed ({response.status_code} {response.reason}) for {safe_path}", response=response)


@dataclass
class FMPClient:
    api_key: str
    cache_root: Path
    pause_seconds: float = 0.35
    price_cache_ttl_seconds: int = 1800
    max_retries: int = 4
    retry_base_seconds: float = 1.0
    profile_cache_ttl_seconds: int = DEFAULT_PROFILE_CACHE_TTL_SECONDS
    quote_cache_ttl_seconds: int = DEFAULT_QUOTE_CACHE_TTL_SECONDS
    ttm_cache_ttl_seconds: int = DEFAULT_TTM_CACHE_TTL_SECONDS
    analyst_estimates_cache_ttl_seconds: int = DEFAULT_ANALYST_ESTIMATES_CACHE_TTL_SECONDS
    quarterly_statement_cache_ttl_seconds: int = DEFAULT_QUARTERLY_STATEMENT_CACHE_TTL_SECONDS
    annual_statement_cache_ttl_seconds: int = DEFAULT_ANNUAL_STATEMENT_CACHE_TTL_SECONDS

    @classmethod
    def from_env(cls, cache_root: Path) -> "FMPClient | None":
        api_key = _usable_env_value(os.environ.get("FMP_API_KEY")) or _usable_env_value(os.environ.get("FINANCIAL_MODELING_PREP_API_KEY"))
        if not api_key:
            return None
        ttl = _positive_int(os.environ.get("FMP_PRICE_CACHE_TTL_SECONDS"), 1800)
        profile_ttl = _positive_int(os.environ.get("FMP_PROFILE_CACHE_TTL_SECONDS"), ttl)
        quote_ttl = _positive_int(os.environ.get("FMP_QUOTE_CACHE_TTL_SECONDS"), DEFAULT_QUOTE_CACHE_TTL_SECONDS)
        ttm_ttl = _positive_int(os.environ.get("FMP_TTM_CACHE_TTL_SECONDS"), DEFAULT_TTM_CACHE_TTL_SECONDS)
        analyst_estimates_ttl = _positive_int(
            os.environ.get("FMP_ANALYST_ESTIMATES_CACHE_TTL_SECONDS"),
            DEFAULT_ANALYST_ESTIMATES_CACHE_TTL_SECONDS,
        )
        quarterly_statement_ttl = _positive_int(
            os.environ.get("FMP_QUARTERLY_STATEMENT_CACHE_TTL_SECONDS"),
            DEFAULT_QUARTERLY_STATEMENT_CACHE_TTL_SECONDS,
        )
        annual_statement_ttl = _positive_int(
            os.environ.get("FMP_ANNUAL_STATEMENT_CACHE_TTL_SECONDS"),
            DEFAULT_ANNUAL_STATEMENT_CACHE_TTL_SECONDS,
        )
        pause_seconds = float(os.environ.get("FMP_REQUEST_PAUSE_SECONDS", "0.35"))
        max_retries = int(os.environ.get("FMP_MAX_RETRIES", "4"))
        retry_base_seconds = float(os.environ.get("FMP_RETRY_BASE_SECONDS", "1.0"))
        return cls(
            api_key=api_key,
            cache_root=cache_root,
            pause_seconds=max(0.0, pause_seconds),
            price_cache_ttl_seconds=ttl,
            max_retries=max(0, max_retries),
            retry_base_seconds=max(0.1, retry_base_seconds),
            profile_cache_ttl_seconds=profile_ttl,
            quote_cache_ttl_seconds=quote_ttl,
            ttm_cache_ttl_seconds=ttm_ttl,
            analyst_estimates_cache_ttl_seconds=analyst_estimates_ttl,
            quarterly_statement_cache_ttl_seconds=quarterly_statement_ttl,
            annual_statement_cache_ttl_seconds=annual_statement_ttl,
        )

    def _cache_path(self, group: str, name: str, suffix: str) -> Path:
        safe_name = name.replace("/", "_").replace("?", "_").replace("&", "_")
        path = self.cache_root / "fmp" / group / f"{safe_name}{suffix}"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _cache_is_fresh(self, cache_path: Path, ttl_seconds: int | None) -> bool:
        if not cache_path.exists():
            return False
        if ttl_seconds is None or ttl_seconds <= 0:
            return True
        age_seconds = time.time() - cache_path.stat().st_mtime
        return age_seconds <= ttl_seconds

    def _retry_delay(self, response: requests.Response, attempt: int) -> float:
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                return max(0.1, float(retry_after))
            except ValueError:
                pass
        return self.retry_base_seconds * (2**attempt)

    def _get_response_json(self, base_url: str, endpoint: str, params: dict[str, Any]) -> Any:
        query = dict(params)
        query["apikey"] = self.api_key
        response: requests.Response | None = None
        for attempt in range(self.max_retries + 1):
            response = requests.get(f"{base_url}/{endpoint}", params=query, timeout=30)
            if response.ok:
                return response.json()
            retryable = response.status_code == 429 or 500 <= response.status_code < 600
            if retryable and attempt < self.max_retries:
                sleep(self._retry_delay(response, attempt))
                continue
            _raise_for_fmp_status(response, endpoint)
        if response is not None:
            _raise_for_fmp_status(response, endpoint)
        raise RuntimeError(f"FMP request failed for {endpoint}")

    def _get_json(
        self,
        endpoint: str,
        params: dict[str, Any],
        cache_group: str,
        cache_name: str,
        *,
        ttl_seconds: int | None = None,
    ) -> Any:
        cache_path = self._cache_path(cache_group, cache_name, ".json")
        if self._cache_is_fresh(cache_path, ttl_seconds):
            return json.loads(cache_path.read_text(encoding="utf-8"))

        payload = self._get_response_json(FMP_BASE_URL, endpoint, params)
        cache_path.write_text(json.dumps(payload), encoding="utf-8")
        sleep(self.pause_seconds)
        return payload

    def _get_stable_json(
        self,
        endpoint: str,
        params: dict[str, Any],
        cache_group: str,
        cache_name: str,
        *,
        ttl_seconds: int | None = None,
    ) -> Any:
        cache_path = self._cache_path(cache_group, cache_name, ".json")
        if self._cache_is_fresh(cache_path, ttl_seconds):
            return json.loads(cache_path.read_text(encoding="utf-8"))

        payload = self._get_response_json(FMP_STABLE_BASE_URL, endpoint, params)
        cache_path.write_text(json.dumps(payload), encoding="utf-8")
        sleep(self.pause_seconds)
        return payload

    def get_historical_prices(self, symbol: str, start_date: str | None = None, end_date: str | None = None) -> pd.DataFrame:
        cache_name = f"{symbol}_{start_date or 'min'}_{end_date or 'max'}"
        cache_path = self._cache_path("prices", cache_name, ".csv")
        requested_end = pd.to_datetime(end_date).date() if end_date else None
        today_utc = datetime.now(timezone.utc).date()
        needs_recent_data = requested_end is None or requested_end >= today_utc - timedelta(days=1)
        ttl_seconds = _positive_int(self.price_cache_ttl_seconds, 1800) if needs_recent_data else None

        if self._cache_is_fresh(cache_path, ttl_seconds):
            frame = pd.read_csv(cache_path)
        else:
            raw_cache = self._cache_path("prices_raw", cache_name, ".json")
            if self._cache_is_fresh(raw_cache, ttl_seconds):
                payload = json.loads(raw_cache.read_text(encoding="utf-8"))
            else:
                payload = self._get_response_json(
                    FMP_STABLE_BASE_URL,
                    "historical-price-eod/full",
                    {
                        "symbol": symbol,
                        "from": start_date,
                        "to": end_date,
                    },
                )
                raw_cache.write_text(json.dumps(payload), encoding="utf-8")
                sleep(self.pause_seconds)
            rows = payload if isinstance(payload, list) else payload.get("historical", []) if isinstance(payload, dict) else []
            frame = pd.DataFrame(rows)
            if frame.empty:
                return pd.DataFrame(columns=["date", "close", "volume"])
            keep = [col for col in ["date", "close", "price", "adjClose", "volume"] if col in frame.columns]
            frame = frame.loc[:, keep]
            if "price" in frame.columns and "close" not in frame.columns:
                frame["close"] = frame["price"]
                frame = frame.drop(columns=["price"])
            if "adjClose" in frame.columns:
                frame["close"] = frame["adjClose"].combine_first(frame.get("close"))
                frame = frame.drop(columns=["adjClose"])
            frame.to_csv(cache_path, index=False)

        if frame.empty:
            return frame
        frame["date"] = pd.to_datetime(frame["date"])
        frame = frame.sort_values("date")
        if start_date:
            frame = frame.loc[frame["date"] >= pd.to_datetime(start_date)]
        if end_date:
            frame = frame.loc[frame["date"] <= pd.to_datetime(end_date)]
        return frame.reset_index(drop=True)

    def get_historical_eod_bars(
        self,
        symbol: str,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> pd.DataFrame:
        """Return raw EOD OHLCV fields for point-in-time technical calculations.

        ``get_historical_prices`` intentionally collapses adjusted close into
        ``close`` for fundamental consumers. Signal Intelligence needs the raw
        OHLC fields and the provider's adjustment separately so its normalizer
        can apply one explicit, auditable policy.
        """

        cache_name = f"{symbol}_{start_date or 'min'}_{end_date or 'max'}"
        cache_path = self._cache_path("eod_bars", cache_name, ".json")
        requested_end = pd.to_datetime(end_date).date() if end_date else None
        today_utc = datetime.now(timezone.utc).date()
        needs_recent_data = requested_end is None or requested_end >= today_utc - timedelta(days=1)
        ttl_seconds = _positive_int(self.price_cache_ttl_seconds, 1800) if needs_recent_data else None
        if self._cache_is_fresh(cache_path, ttl_seconds):
            payload = json.loads(cache_path.read_text(encoding="utf-8"))
        else:
            payload = self._get_response_json(
                FMP_STABLE_BASE_URL,
                "historical-price-eod/full",
                {"symbol": symbol, "from": start_date, "to": end_date},
            )
            cache_path.write_text(json.dumps(payload), encoding="utf-8")
            sleep(self.pause_seconds)
        rows = payload if isinstance(payload, list) else payload.get("historical", []) if isinstance(payload, dict) else []
        frame = pd.DataFrame(rows)
        if frame.empty:
            return pd.DataFrame(columns=["date", "open", "high", "low", "close", "adjClose", "volume"])
        if "close" not in frame.columns and "price" in frame.columns:
            frame["close"] = frame["price"]
        for column in ("open", "high", "low"):
            if column not in frame.columns and "close" in frame.columns:
                frame[column] = frame["close"]
        if "adjClose" not in frame.columns:
            frame["adjClose"] = frame.get("close")
        if "volume" not in frame.columns:
            frame["volume"] = pd.NA
        keep = ["date", "open", "high", "low", "close", "adjClose", "volume"]
        frame = frame.loc[:, [column for column in keep if column in frame.columns]]
        frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
        frame = frame.dropna(subset=["date"]).sort_values("date")
        if start_date:
            frame = frame.loc[frame["date"] >= pd.to_datetime(start_date)]
        if end_date:
            frame = frame.loc[frame["date"] <= pd.to_datetime(end_date)]
        return frame.reset_index(drop=True)

    def get_profile(self, symbol: str) -> dict[str, Any]:
        payload = self._get_stable_json(
            "profile",
            {"symbol": symbol},
            cache_group="profile",
            cache_name=symbol,
            ttl_seconds=_positive_int(self.profile_cache_ttl_seconds, DEFAULT_PROFILE_CACHE_TTL_SECONDS),
        )
        records = _payload_records(payload, "data", "profile")
        return _with_payload_as_of(records[0]) if records else {}

    def get_quote(self, symbol: str) -> dict[str, Any]:
        payload = self._get_stable_json(
            "quote",
            {"symbol": symbol},
            cache_group="quote",
            cache_name=symbol,
            ttl_seconds=_positive_int(self.quote_cache_ttl_seconds, DEFAULT_QUOTE_CACHE_TTL_SECONDS),
        )
        records = _payload_records(payload, "data", "quote")
        return _with_payload_as_of(records[0]) if records else {}

    def get_shares_float(self, symbol: str) -> dict[str, Any]:
        """Return FMP's current basic outstanding-share snapshot.

        This is deliberately kept separate from weighted-average diluted shares
        reported in the income statement: it is reconciliation evidence, not a
        drop-in valuation denominator.
        """
        payload = self._get_stable_json(
            "shares-float",
            {"symbol": symbol},
            cache_group="shares_float",
            cache_name=symbol,
            ttl_seconds=_positive_int(self.quote_cache_ttl_seconds, DEFAULT_QUOTE_CACHE_TTL_SECONDS),
        )
        records = _payload_records(payload, "data", "sharesFloat", "shares")
        return _with_payload_as_of(records[0]) if records else {}

    def get_key_metrics_ttm(self, symbol: str) -> dict[str, Any]:
        payload = self._get_stable_json(
            "key-metrics-ttm",
            {"symbol": symbol},
            cache_group="key_metrics_ttm",
            cache_name=symbol,
            ttl_seconds=_positive_int(self.ttm_cache_ttl_seconds, DEFAULT_TTM_CACHE_TTL_SECONDS),
        )
        records = _payload_records(payload, "data", "metrics")
        return _with_payload_as_of(records[0]) if records else {}

    def get_ratios_ttm(self, symbol: str) -> dict[str, Any]:
        payload = self._get_stable_json(
            "ratios-ttm",
            {"symbol": symbol},
            cache_group="ratios_ttm",
            cache_name=symbol,
            ttl_seconds=_positive_int(self.ttm_cache_ttl_seconds, DEFAULT_TTM_CACHE_TTL_SECONDS),
        )
        records = _payload_records(payload, "data", "ratios")
        return _with_payload_as_of(records[0]) if records else {}

    def _get_statement_ttm(self, symbol: str, *, endpoint: str, cache_group: str) -> pd.DataFrame:
        payload = self._get_stable_json(
            endpoint,
            {"symbol": symbol},
            cache_group=cache_group,
            cache_name=symbol,
            ttl_seconds=_positive_int(self.ttm_cache_ttl_seconds, DEFAULT_TTM_CACHE_TTL_SECONDS),
        )
        records = _payload_records(payload, "data", "statements", "financials")
        frame = pd.DataFrame(records)
        if frame.empty:
            return frame
        for column in ("date", "fillingDate", "acceptedDate"):
            if column in frame.columns:
                frame[column] = pd.to_datetime(frame[column], errors="coerce")
        if "date" in frame.columns:
            frame = frame.sort_values("date")
            frame["as_of"] = frame["date"].dt.strftime("%Y-%m-%d")
        return frame.reset_index(drop=True)

    def get_income_statement_ttm(self, symbol: str) -> pd.DataFrame:
        return self._get_statement_ttm(symbol, endpoint="income-statement-ttm", cache_group="income_statement_ttm")

    def get_cash_flow_statement_ttm(self, symbol: str) -> pd.DataFrame:
        return self._get_statement_ttm(symbol, endpoint="cash-flow-statement-ttm", cache_group="cash_flow_statement_ttm")

    def get_balance_sheet_statement_ttm(self, symbol: str) -> pd.DataFrame:
        return self._get_statement_ttm(symbol, endpoint="balance-sheet-statement-ttm", cache_group="balance_sheet_statement_ttm")

    def get_analyst_estimates(
        self,
        symbol: str,
        *,
        period: str = "annual",
        page: int = 0,
        limit: int = 10,
    ) -> pd.DataFrame:
        normalized_period = str(period or "annual").strip().lower()
        normalized_page = max(0, int(page))
        payload = self._get_stable_json(
            "analyst-estimates",
            {"symbol": symbol, "period": normalized_period, "page": normalized_page, "limit": limit},
            cache_group="analyst_estimates",
            cache_name=f"{symbol}_{normalized_period}_{normalized_page}_{limit}",
            ttl_seconds=_positive_int(
                self.analyst_estimates_cache_ttl_seconds,
                DEFAULT_ANALYST_ESTIMATES_CACHE_TTL_SECONDS,
            ),
        )
        records = _payload_records(payload, "data", "analystEstimates", "estimates")
        frame = pd.DataFrame(records)
        if frame.empty:
            return frame
        for column in ["date", "publishedDate", "updatedAt"]:
            if column in frame.columns:
                frame[column] = pd.to_datetime(frame[column], errors="coerce")
        if "date" in frame.columns:
            frame = frame.sort_values("date")
        return frame.reset_index(drop=True)

    def get_fundamental_snapshot(self, symbols: list[str]) -> pd.DataFrame:
        rows: list[dict[str, Any]] = []
        for symbol in symbols:
            profile = self.get_profile(symbol)
            metrics = self.get_key_metrics_ttm(symbol)
            ratios = self.get_ratios_ttm(symbol)
            row = {
                "ticker": symbol,
                "sector_fmp": profile.get("sector"),
                "industry_fmp": profile.get("industry"),
                "beta_fmp": profile.get("beta"),
                "market_cap_fmp": profile.get("marketCap") or profile.get("mktCap"),
                "pe_ttm_fmp": ratios.get("peRatioTTM") or ratios.get("priceEarningsRatioTTM"),
                "pb_ttm_fmp": ratios.get("priceToBookRatioTTM"),
                "roe_ttm_fmp": ratios.get("returnOnEquityTTM"),
                "roic_ttm_fmp": metrics.get("roicTTM"),
                "net_margin_ttm_fmp": ratios.get("netProfitMarginTTM"),
            }
            rows.append(row)
        return pd.DataFrame(rows)

    def _get_statement_frame(
        self,
        endpoint: str,
        symbol: str,
        *,
        period: str = "quarter",
        limit: int = 40,
        cache_group: str,
    ) -> pd.DataFrame:
        normalized_period = str(period or "quarter").strip().lower()
        statement_ttl = (
            self.annual_statement_cache_ttl_seconds
            if normalized_period == "annual"
            else self.quarterly_statement_cache_ttl_seconds
        )
        statement_ttl = _positive_int(
            statement_ttl,
            DEFAULT_ANNUAL_STATEMENT_CACHE_TTL_SECONDS
            if normalized_period == "annual"
            else DEFAULT_QUARTERLY_STATEMENT_CACHE_TTL_SECONDS,
        )
        payload = self._get_stable_json(
            endpoint,
            {"symbol": symbol, "period": normalized_period, "limit": limit},
            cache_group=cache_group,
            cache_name=f"{symbol}_{normalized_period}_{limit}",
            ttl_seconds=statement_ttl,
        )
        records = _payload_records(payload, "data", "statements", "financials")
        if not records:
            return pd.DataFrame()
        frame = pd.DataFrame(records)
        for column in ["date", "fillingDate", "acceptedDate"]:
            if column in frame.columns:
                frame[column] = pd.to_datetime(frame[column], errors="coerce")
        if "date" in frame.columns:
            frame = frame.sort_values("date")
            frame["as_of"] = frame["date"].dt.strftime("%Y-%m-%d")
        return frame.reset_index(drop=True)

    def get_income_statements(self, symbol: str, *, period: str = "quarter", limit: int = 40) -> pd.DataFrame:
        return self._get_statement_frame(
            "income-statement",
            symbol,
            period=period,
            limit=limit,
            cache_group="income_statement",
        )

    def get_cash_flow_statements(self, symbol: str, *, period: str = "quarter", limit: int = 40) -> pd.DataFrame:
        return self._get_statement_frame(
            "cash-flow-statement",
            symbol,
            period=period,
            limit=limit,
            cache_group="cash_flow_statement",
        )

    def get_balance_sheet_statements(self, symbol: str, *, period: str = "quarter", limit: int = 40) -> pd.DataFrame:
        return self._get_statement_frame(
            "balance-sheet-statement",
            symbol,
            period=period,
            limit=limit,
            cache_group="balance_sheet_statement",
        )
