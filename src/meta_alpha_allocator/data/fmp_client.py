from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd
import requests


FMP_BASE_URL = "https://financialmodelingprep.com/api/v3"


@dataclass
class FMPClient:
    api_key: str
    cache_root: Path
    pause_seconds: float = 0.15

    @classmethod
    def from_env(cls, cache_root: Path) -> "FMPClient | None":
        api_key = os.environ.get("FMP_API_KEY") or os.environ.get("FINANCIAL_MODELING_PREP_API_KEY")
        if not api_key:
            return None
        return cls(api_key=api_key, cache_root=cache_root)

    def _cache_path(self, group: str, name: str, suffix: str) -> Path:
        safe_name = name.replace("/", "_").replace("?", "_").replace("&", "_")
        path = self.cache_root / "fmp" / group / f"{safe_name}{suffix}"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _get_json(self, endpoint: str, params: dict[str, Any], cache_group: str, cache_name: str) -> Any:
        cache_path = self._cache_path(cache_group, cache_name, ".json")
        if cache_path.exists():
            return json.loads(cache_path.read_text(encoding="utf-8"))

        query = dict(params)
        query["apikey"] = self.api_key
        response = requests.get(f"{FMP_BASE_URL}/{endpoint}", params=query, timeout=30)
        response.raise_for_status()
        payload = response.json()
        cache_path.write_text(json.dumps(payload), encoding="utf-8")
        time.sleep(self.pause_seconds)
        return payload

    def get_historical_prices(self, symbol: str, start_date: str | None = None, end_date: str | None = None) -> pd.DataFrame:
        cache_name = f"{symbol}_{start_date or 'min'}_{end_date or 'max'}"
        cache_path = self._cache_path("prices", cache_name, ".csv")
        if cache_path.exists():
            frame = pd.read_csv(cache_path)
        else:
            payload = self._get_json(
                f"historical-price-full/{symbol}",
                {"from": start_date, "to": end_date, "serietype": "line"},
                cache_group="prices_raw",
                cache_name=cache_name,
            )
            rows = payload.get("historical", []) if isinstance(payload, dict) else []
            frame = pd.DataFrame(rows)
            if frame.empty:
                return pd.DataFrame(columns=["date", "close", "volume"])
            keep = [col for col in ["date", "close", "adjClose", "volume"] if col in frame.columns]
            frame = frame.loc[:, keep]
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
        payload = self._get_json(f"profile/{symbol}", {}, cache_group="profile", cache_name=symbol)
        if isinstance(payload, list) and payload:
            return payload[0]
        return payload if isinstance(payload, dict) else {}

    def get_key_metrics_ttm(self, symbol: str) -> dict[str, Any]:
        payload = self._get_json(f"key-metrics-ttm/{symbol}", {}, cache_group="key_metrics_ttm", cache_name=symbol)
        if isinstance(payload, list) and payload:
            return payload[0]
        return payload if isinstance(payload, dict) else {}

    def get_ratios_ttm(self, symbol: str) -> dict[str, Any]:
        payload = self._get_json(f"ratios-ttm/{symbol}", {}, cache_group="ratios_ttm", cache_name=symbol)
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
        payload = self._get_json(
            f"{endpoint}/{symbol}",
            {"period": period, "limit": limit},
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
