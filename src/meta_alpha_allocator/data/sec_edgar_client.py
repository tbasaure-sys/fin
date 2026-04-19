from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests


SEC_FILES_BASE_URL = "https://www.sec.gov/files"
SEC_DATA_BASE_URL = "https://data.sec.gov"


@dataclass
class SECEdgarClient:
    user_agent: str
    cache_root: Path
    pause_seconds: float = 0.12
    cache_ttl_seconds: int = 86_400

    @classmethod
    def from_env(cls, cache_root: Path) -> "SECEdgarClient | None":
        user_agent = os.environ.get("SEC_USER_AGENT") or os.environ.get("EDGAR_USER_AGENT")
        if not user_agent:
            return None
        pause_seconds = float(os.environ.get("SEC_EDGAR_PAUSE_SECONDS", "0.12"))
        ttl_seconds = int(os.environ.get("SEC_EDGAR_CACHE_TTL_SECONDS", "86400"))
        return cls(user_agent=user_agent, cache_root=cache_root, pause_seconds=max(pause_seconds, 0.11), cache_ttl_seconds=ttl_seconds)

    def _cache_path(self, group: str, name: str) -> Path:
        safe_name = "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in name)
        path = self.cache_root / "sec_edgar" / group / f"{safe_name}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _cache_is_fresh(self, cache_path: Path, ttl_seconds: int | None) -> bool:
        if not cache_path.exists():
            return False
        if ttl_seconds is None or ttl_seconds <= 0:
            return True
        return (time.time() - cache_path.stat().st_mtime) <= ttl_seconds

    def _get_json(self, url: str, cache_group: str, cache_name: str, *, ttl_seconds: int | None = None) -> Any:
        cache_path = self._cache_path(cache_group, cache_name)
        ttl = self.cache_ttl_seconds if ttl_seconds is None else ttl_seconds
        if self._cache_is_fresh(cache_path, ttl):
            return json.loads(cache_path.read_text(encoding="utf-8"))

        response = requests.get(
            url,
            headers={
                "User-Agent": self.user_agent,
                "Accept-Encoding": "gzip, deflate",
                "Host": url.split("/")[2],
            },
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        cache_path.write_text(json.dumps(payload), encoding="utf-8")
        time.sleep(self.pause_seconds)
        return payload

    def get_company_tickers(self) -> dict[str, Any]:
        payload = self._get_json(f"{SEC_FILES_BASE_URL}/company_tickers.json", "lookup", "company_tickers")
        return payload if isinstance(payload, dict) else {}

    def lookup_cik(self, ticker: str) -> str | None:
        symbol = str(ticker or "").upper().strip()
        if not symbol:
            return None
        for item in self.get_company_tickers().values():
            if str(item.get("ticker") or "").upper() == symbol:
                cik = str(item.get("cik_str") or "").strip()
                return cik.zfill(10) if cik else None
        return None

    def get_submissions(self, ticker: str) -> dict[str, Any]:
        cik = self.lookup_cik(ticker)
        if not cik:
            return {}
        return self._get_json(f"{SEC_DATA_BASE_URL}/submissions/CIK{cik}.json", "submissions", f"CIK{cik}")

    def get_company_facts(self, ticker: str) -> dict[str, Any]:
        cik = self.lookup_cik(ticker)
        if not cik:
            return {}
        return self._get_json(f"{SEC_DATA_BASE_URL}/api/xbrl/companyfacts/CIK{cik}.json", "companyfacts", f"CIK{cik}")

    def get_recent_filings(self, ticker: str, *, forms: tuple[str, ...] = ("10-K", "10-Q", "20-F", "40-F"), limit: int = 8) -> list[dict[str, Any]]:
        submissions = self.get_submissions(ticker)
        recent = submissions.get("filings", {}).get("recent", {}) if isinstance(submissions, dict) else {}
        form_values = recent.get("form") or []
        accession_values = recent.get("accessionNumber") or []
        filing_dates = recent.get("filingDate") or []
        report_dates = recent.get("reportDate") or []
        primary_documents = recent.get("primaryDocument") or []

        filings: list[dict[str, Any]] = []
        allowed = set(forms)
        for index, form in enumerate(form_values):
            if form not in allowed:
                continue
            accession = accession_values[index] if index < len(accession_values) else ""
            cik = str(submissions.get("cik") or "").zfill(10)
            accession_path = str(accession).replace("-", "")
            primary_document = primary_documents[index] if index < len(primary_documents) else ""
            filings.append(
                {
                    "form": form,
                    "accession_number": accession,
                    "filing_date": filing_dates[index] if index < len(filing_dates) else None,
                    "report_date": report_dates[index] if index < len(report_dates) else None,
                    "primary_document": primary_document,
                    "filing_url": f"https://www.sec.gov/Archives/edgar/data/{int(cik) if cik else ''}/{accession_path}/{primary_document}" if cik and accession_path and primary_document else None,
                }
            )
            if len(filings) >= limit:
                break
        return filings
