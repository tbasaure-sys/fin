from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import requests


FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations"


@dataclass
class FREDClient:
    api_key: str
    cache_root: Path
    pause_seconds: float = 0.1

    @classmethod
    def from_env(cls, cache_root: Path) -> "FREDClient | None":
        api_key = os.environ.get("FRED_API_KEY")
        if not api_key:
            return None
        return cls(api_key=api_key, cache_root=cache_root)

    def _cache_path(self, series_id: str) -> Path:
        path = self.cache_root / "fred" / f"{series_id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def get_series(self, series_id: str, start_date: str | None = None, end_date: str | None = None) -> pd.DataFrame:
        cache_key = f"{series_id}_{start_date or 'min'}_{end_date or 'max'}"
        cache_path = self._cache_path(cache_key)
        if cache_path.exists():
            payload = json.loads(cache_path.read_text(encoding="utf-8"))
        else:
            params = {
                "series_id": series_id,
                "api_key": self.api_key,
                "file_type": "json",
                "observation_start": start_date,
                "observation_end": end_date,
            }
            response = requests.get(FRED_BASE_URL, params=params, timeout=30)
            response.raise_for_status()
            payload = response.json()
            cache_path.write_text(json.dumps(payload), encoding="utf-8")
            time.sleep(self.pause_seconds)

        observations = payload.get("observations", [])
        frame = pd.DataFrame(observations)
        if frame.empty:
            return pd.DataFrame(columns=["date", series_id])
        frame = frame.loc[:, ["date", "value"]]
        frame["date"] = pd.to_datetime(frame["date"])
        frame[series_id] = pd.to_numeric(frame["value"].replace(".", pd.NA), errors="coerce")
        frame = frame.drop(columns=["value"]).dropna(subset=[series_id])
        return frame

    def get_macro_panel(self, series_ids: tuple[str, ...], start_date: str, end_date: str | None) -> pd.DataFrame:
        merged: pd.DataFrame | None = None
        for series_id in series_ids:
            frame = self.get_series(series_id, start_date, end_date)
            if frame.empty:
                continue
            if merged is None:
                merged = frame
            else:
                merged = merged.merge(frame, on="date", how="outer")
        if merged is None:
            return pd.DataFrame(columns=["date"])
        merged = merged.sort_values("date")
        return merged
