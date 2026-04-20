from __future__ import annotations

import json
import os
import time
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


def _usable_env_value(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    if not cleaned:
        return None
    if cleaned.lower() in PLACEHOLDER_API_KEYS:
        return None
    return cleaned


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

    @classmethod
    def from_env(cls, cache_root: Path) -> "FMPClient | None":
        api_key = _usable_env_value(os.environ.get("FMP_API_KEY")) or _usable_env_value(os.environ.get("FINANCIAL_MODELING_PREP_API_KEY"))
        if not api_key:
            return None
        ttl = int(os.environ.get("FMP_PRICE_CACHE_TTL_SECONDS", "1800"))
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
                time.sleep(self._retry_delay(response, attempt))
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
        time.sleep(self.pause_seconds)
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
        time.sleep(self.pause_seconds)
        return payload

    def get_historical_prices(self, symbol: str, start_date: str | None = None, end_date: str | None = None) -> pd.DataFrame:
        cache_name = f"{symbol}_{start_date or 'min'}_{end_date or 'max'}"
        cache_path = self._cache_path("prices", cache_name, ".csv")
        requested_end = pd.to_datetime(end_date).date() if end_date else None
        today_utc = datetime.now(timezone.utc).date()
        needs_recent_data = requested_end is None or requested_end >= today_utc - timedelta(days=1)
        ttl_seconds = self.price_cache_ttl_seconds if needs_recent_data else None

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
                time.sleep(self.pause_seconds)
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

    def get_profile(self, symbol: str) -> dict[str, Any]:
        payload = self._get_stable_json("profile", {"symbol": symbol}, cache_group="profile", cache_name=symbol)
        if isinstance(payload, list) and payload:
            return payload[0]
        return payload if isinstance(payload, dict) else {}

    def get_key_metrics_ttm(self, symbol: str) -> dict[str, Any]:
        payload = self._get_stable_json("key-metrics-ttm", {"symbol": symbol}, cache_group="key_metrics_ttm", cache_name=symbol)
        if isinstance(payload, list) and payload:
            return payload[0]
        return payload if isinstance(payload, dict) else {}

    def get_ratios_ttm(self, symbol: str) -> dict[str, Any]:
        payload = self._get_stable_json("ratios-ttm", {"symbol": symbol}, cache_group="ratios_ttm", cache_name=symbol)
        if isinstance(payload, list) and payload:
            return payload[0]
        return payload if isinstance(payload, dict) else {}

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
                "market_cap_fmp": profile.get("mktCap"),
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
        payload = self._get_stable_json(
            endpoint,
            {"symbol": symbol, "period": period, "limit": limit},
            cache_group=cache_group,
            cache_name=f"{symbol}_{period}_{limit}",
        )
        if not isinstance(payload, list) or not payload:
            return pd.DataFrame()
        frame = pd.DataFrame(payload)
        for column in ["date", "fillingDate", "acceptedDate"]:
            if column in frame.columns:
                frame[column] = pd.to_datetime(frame[column], errors="coerce")
        if "date" in frame.columns:
            frame = frame.sort_values("date")
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
