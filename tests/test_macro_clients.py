from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from meta_alpha_allocator.data.fmp_client import FMPClient
from meta_alpha_allocator.data.fred_client import FREDClient
from meta_alpha_allocator.data.sec_edgar_client import SECEdgarClient


class _FakeResponse:
    def __init__(
        self,
        payload: Any,
        *,
        ok: bool = True,
        status_code: int = 200,
        reason: str = "OK",
        url: str = "https://example.test",
        headers: dict[str, str] | None = None,
    ) -> None:
        self._payload = payload
        self.ok = ok
        self.status_code = status_code
        self.reason = reason
        self.url = url
        self.headers = headers or {}

    def json(self) -> Any:
        return self._payload


def test_fred_client_from_env(monkeypatch) -> None:
    monkeypatch.setenv("FRED_API_KEY", "live_fred_key")
    client = FREDClient.from_env(Path("C:/tmp"))
    assert client is not None
    assert client.api_key == "live_fred_key"


def test_provider_clients_ignore_placeholder_env_values(monkeypatch) -> None:
    monkeypatch.setenv("FMP_API_KEY", "replace_me")
    monkeypatch.setenv("FINANCIAL_MODELING_PREP_API_KEY", "your_key_here")
    monkeypatch.setenv("FRED_API_KEY", "dummy")
    monkeypatch.setenv("SEC_USER_AGENT", "MetaAlphaAllocator your_email@example.com")

    assert FMPClient.from_env(Path("C:/tmp")) is None
    assert FREDClient.from_env(Path("C:/tmp")) is None
    assert SECEdgarClient.from_env(Path("C:/tmp")) is None


def test_sec_edgar_client_derives_user_agent_from_contact_env(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("SEC_USER_AGENT", raising=False)
    monkeypatch.delenv("SEC_EDGAR_USER_AGENT", raising=False)
    monkeypatch.delenv("EDGAR_USER_AGENT", raising=False)
    monkeypatch.setenv("BLS_PRIME_INVITE_CONTACT", "research@example.com")

    client = SECEdgarClient.from_env(tmp_path)

    assert client is not None
    assert client.user_agent == "MetaAlphaAllocator research@example.com"


def test_sec_edgar_client_accepts_forwarded_user_agent(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("SEC_USER_AGENT", "MetaAlphaAllocator env@example.com")

    client = SECEdgarClient.from_env(tmp_path, user_agent="MetaAlphaAllocator forwarded@example.com")

    assert client is not None
    assert client.user_agent == "MetaAlphaAllocator forwarded@example.com"


def test_fmp_statement_calls_use_stable_symbol_query(monkeypatch, tmp_path) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []

    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> _FakeResponse:
        calls.append((url, params))
        return _FakeResponse([{"date": "2024-12-31", "revenue": 100.0}], url=url)

    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.requests.get", fake_get)

    client = FMPClient(api_key="live_fmp_key", cache_root=tmp_path, pause_seconds=0)
    frame = client.get_income_statements("AAPL", period="annual", limit=10)

    assert frame.loc[0, "revenue"] == 100.0
    assert calls == [
        (
            "https://financialmodelingprep.com/stable/income-statement",
            {"symbol": "AAPL", "period": "annual", "limit": 10, "apikey": "live_fmp_key"},
        )
    ]


def test_fmp_http_errors_do_not_leak_api_keys(monkeypatch, tmp_path) -> None:
    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> _FakeResponse:
        full_url = f"{url}?apikey={params['apikey']}&symbol={params.get('symbol', '')}"
        return _FakeResponse({}, ok=False, status_code=403, reason="Forbidden", url=full_url)

    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.requests.get", fake_get)

    client = FMPClient(api_key="live_secret_key", cache_root=tmp_path, pause_seconds=0)
    with pytest.raises(Exception) as exc_info:
        client.get_profile("AAPL")

    message = str(exc_info.value)
    assert "403 Forbidden" in message
    assert "stable/profile" in message
    assert "live_secret_key" not in message
    assert "apikey" not in message


def test_fmp_retries_rate_limit_with_retry_after(monkeypatch, tmp_path) -> None:
    calls = 0
    sleeps: list[float] = []

    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> _FakeResponse:
        nonlocal calls
        calls += 1
        if calls == 1:
            return _FakeResponse({}, ok=False, status_code=429, reason="Too Many Requests", url=url, headers={"Retry-After": "0.25"})
        return _FakeResponse([{"date": "2024-12-31", "revenue": 100.0}], url=url)

    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.requests.get", fake_get)
    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.time.sleep", lambda seconds: sleeps.append(seconds))

    client = FMPClient(api_key="live_fmp_key", cache_root=tmp_path, pause_seconds=0, max_retries=2, retry_base_seconds=0.1)
    frame = client.get_income_statements("BABA", period="annual", limit=10)

    assert frame.loc[0, "revenue"] == 100.0
    assert calls == 2
    assert sleeps == [0.25, 0]
