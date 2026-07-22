from __future__ import annotations

import os
from pathlib import Path
import time
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
    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.sleep", lambda seconds: sleeps.append(seconds))

    client = FMPClient(api_key="live_fmp_key", cache_root=tmp_path, pause_seconds=0, max_retries=2, retry_base_seconds=0.1)
    frame = client.get_income_statements("BABA", period="annual", limit=10)

    assert frame.loc[0, "revenue"] == 100.0
    assert calls == 2
    assert sleeps == [0.25, 0]


def _expire(path: Path, *, seconds: int = 120) -> None:
    expired_at = time.time() - seconds
    os.utime(path, (expired_at, expired_at))


def test_fmp_profile_cache_refreshes_only_after_ttl(monkeypatch, tmp_path) -> None:
    calls: list[dict[str, Any]] = []
    payloads = [
        [{"symbol": "MU", "price": 900.0}],
        [{"symbol": "MU", "price": 983.12}],
    ]

    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> _FakeResponse:
        calls.append(params)
        return _FakeResponse(payloads[len(calls) - 1], url=url)

    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.requests.get", fake_get)
    client = FMPClient(
        api_key="live_fmp_key",
        cache_root=tmp_path,
        pause_seconds=0,
        profile_cache_ttl_seconds=60,
    )

    assert client.get_profile("MU")["price"] == 900.0
    assert client.get_profile("MU")["price"] == 900.0
    assert len(calls) == 1

    _expire(tmp_path / "fmp" / "profile" / "MU.json")
    assert client.get_profile("MU")["price"] == 983.12
    assert len(calls) == 2


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ([{"symbol": "MU", "price": 983.12, "timestamp": 1784064853}], 983.12),
        ({"symbol": "MU", "price": 984.0, "timestamp": 1784064913}, 984.0),
        ({"data": [{"symbol": "MU", "price": 985.0, "timestamp": 1784064973}]}, 985.0),
    ],
)
def test_fmp_quote_normalizes_supported_payload_shapes(monkeypatch, tmp_path, payload, expected) -> None:
    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> _FakeResponse:
        return _FakeResponse(payload, url=url)

    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.requests.get", fake_get)
    client = FMPClient(api_key="live_fmp_key", cache_root=tmp_path, pause_seconds=0)

    quote = client.get_quote("MU")

    assert quote["price"] == expected
    assert quote["as_of"].endswith("+00:00")


def test_fmp_quote_cache_expires(monkeypatch, tmp_path) -> None:
    calls = 0

    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> _FakeResponse:
        nonlocal calls
        calls += 1
        return _FakeResponse([{"symbol": "MU", "price": 900.0 + calls, "timestamp": 1784064853 + calls}], url=url)

    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.requests.get", fake_get)
    client = FMPClient(
        api_key="live_fmp_key",
        cache_root=tmp_path,
        pause_seconds=0,
        quote_cache_ttl_seconds=60,
    )

    assert client.get_quote("MU")["price"] == 901.0
    assert client.get_quote("MU")["price"] == 901.0
    _expire(tmp_path / "fmp" / "quote" / "MU.json")
    assert client.get_quote("MU")["price"] == 902.0
    assert calls == 2


def test_fmp_analyst_estimates_normalizes_wrapped_payload_and_ttl(monkeypatch, tmp_path) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []
    payloads = [
        {"data": [{"symbol": "MU", "date": "2027-08-31", "estimatedRevenueAvg": 120_000.0}]},
        {"data": [{"symbol": "MU", "date": "2027-08-31", "estimatedRevenueAvg": 130_000.0}]},
    ]

    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> _FakeResponse:
        calls.append((url, params))
        return _FakeResponse(payloads[len(calls) - 1], url=url)

    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.requests.get", fake_get)
    client = FMPClient(
        api_key="live_fmp_key",
        cache_root=tmp_path,
        pause_seconds=0,
        analyst_estimates_cache_ttl_seconds=60,
    )

    first = client.get_analyst_estimates("MU", period="annual", page=0, limit=8)
    cached = client.get_analyst_estimates("MU", period="annual", page=0, limit=8)
    assert first.loc[0, "estimatedRevenueAvg"] == 120_000.0
    assert cached.loc[0, "estimatedRevenueAvg"] == 120_000.0
    assert calls == [
        (
            "https://financialmodelingprep.com/stable/analyst-estimates",
            {"symbol": "MU", "period": "annual", "page": 0, "limit": 8, "apikey": "live_fmp_key"},
        )
    ]

    _expire(tmp_path / "fmp" / "analyst_estimates" / "MU_annual_0_8.json")
    refreshed = client.get_analyst_estimates("MU", period="annual", page=0, limit=8)
    assert refreshed.loc[0, "estimatedRevenueAvg"] == 130_000.0
    assert len(calls) == 2


def test_fmp_shares_float_returns_current_outstanding_shares_with_lineage(monkeypatch, tmp_path) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []

    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> _FakeResponse:
        calls.append((url, params))
        return _FakeResponse(
            [
                {
                    "symbol": "MU",
                    "date": "2026-07-14",
                    "outstandingShares": 1_119_000_000.0,
                    "floatShares": 1_101_000_000.0,
                    "freeFloat": 98.39,
                }
            ],
            url=url,
        )

    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.requests.get", fake_get)

    client = FMPClient(api_key="live_fmp_key", cache_root=tmp_path, pause_seconds=0)
    result = client.get_shares_float("MU")

    assert result["symbol"] == "MU"
    assert result["outstandingShares"] == 1_119_000_000.0
    assert result["floatShares"] == 1_101_000_000.0
    assert result["as_of"].startswith("2026-07-14")
    assert calls == [
        (
            "https://financialmodelingprep.com/stable/shares-float",
            {"symbol": "MU", "apikey": "live_fmp_key"},
        )
    ]

def test_fmp_quarterly_statements_use_live_ttl_and_preserve_period_end(monkeypatch, tmp_path) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []
    payloads = [
        [{"date": "2026-02-26", "revenue": 23_860.0}],
        [{"date": "2026-05-28", "revenue": 41_456.0}],
    ]

    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> _FakeResponse:
        calls.append((url, params))
        return _FakeResponse(payloads[len(calls) - 1], url=url)

    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.requests.get", fake_get)
    client = FMPClient(
        api_key="live_fmp_key",
        cache_root=tmp_path,
        pause_seconds=0,
        quarterly_statement_cache_ttl_seconds=60,
    )

    first = client.get_income_statements("MU", period="quarter", limit=12)
    cached = client.get_income_statements("MU", period="quarter", limit=12)
    assert first.loc[0, "date"] == cached.loc[0, "date"]
    assert str(first.loc[0, "date"].date()) == "2026-02-26"
    assert first.loc[0, "as_of"] == "2026-02-26"
    assert len(calls) == 1

    _expire(tmp_path / "fmp" / "income_statement" / "MU_quarter_12.json")
    refreshed = client.get_income_statements("MU", period="quarter", limit=12)
    assert refreshed.loc[0, "as_of"] == "2026-05-28"
    assert refreshed.loc[0, "revenue"] == 41_456.0
    assert len(calls) == 2
    assert calls[0][1] == {"symbol": "MU", "period": "quarter", "limit": 12, "apikey": "live_fmp_key"}


def test_fmp_ttm_cache_is_not_indefinite(monkeypatch, tmp_path) -> None:
    calls = 0

    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> _FakeResponse:
        nonlocal calls
        calls += 1
        return _FakeResponse([{"symbol": "MU", "revenuePerShareTTM": 80.0 + calls}], url=url)

    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.requests.get", fake_get)
    client = FMPClient(
        api_key="live_fmp_key",
        cache_root=tmp_path,
        pause_seconds=0,
        ttm_cache_ttl_seconds=60,
    )

    assert client.get_key_metrics_ttm("MU")["revenuePerShareTTM"] == 81.0
    assert client.get_key_metrics_ttm("MU")["revenuePerShareTTM"] == 81.0
    _expire(tmp_path / "fmp" / "key_metrics_ttm" / "MU.json")
    assert client.get_key_metrics_ttm("MU")["revenuePerShareTTM"] == 82.0
    assert calls == 2


@pytest.mark.parametrize(
    ("method_name", "endpoint", "field"),
    [
        ("get_income_statement_ttm", "income-statement-ttm", "revenue"),
        ("get_cash_flow_statement_ttm", "cash-flow-statement-ttm", "operatingCashFlow"),
        ("get_balance_sheet_statement_ttm", "balance-sheet-statement-ttm", "totalAssets"),
    ],
)
def test_fmp_statement_ttm_endpoints_preserve_provider_observation(
    monkeypatch,
    tmp_path,
    method_name: str,
    endpoint: str,
    field: str,
) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []

    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> _FakeResponse:
        calls.append((url, params))
        return _FakeResponse([{"symbol": "MU", "date": "2026-05-28", "period": "TTM", field: 123.0}], url=url)

    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.requests.get", fake_get)
    client = FMPClient(api_key="live_fmp_key", cache_root=tmp_path, pause_seconds=0, ttm_cache_ttl_seconds=60)

    frame = getattr(client, method_name)("MU")

    assert frame.loc[0, field] == 123.0
    assert str(frame.loc[0, "date"].date()) == "2026-05-28"
    assert frame.loc[0, "as_of"] == "2026-05-28"
    assert calls == [
        (
            f"https://financialmodelingprep.com/stable/{endpoint}",
            {"symbol": "MU", "apikey": "live_fmp_key"},
        )
    ]


def test_fmp_live_ttls_are_configurable_from_env_and_never_zero(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("FMP_API_KEY", "live_fmp_key")
    monkeypatch.setenv("FMP_PRICE_CACHE_TTL_SECONDS", "0")
    monkeypatch.setenv("FMP_PROFILE_CACHE_TTL_SECONDS", "45")
    monkeypatch.setenv("FMP_QUOTE_CACHE_TTL_SECONDS", "15")
    monkeypatch.setenv("FMP_TTM_CACHE_TTL_SECONDS", "90")
    monkeypatch.setenv("FMP_ANALYST_ESTIMATES_CACHE_TTL_SECONDS", "120")
    monkeypatch.setenv("FMP_QUARTERLY_STATEMENT_CACHE_TTL_SECONDS", "180")
    monkeypatch.setenv("FMP_ANNUAL_STATEMENT_CACHE_TTL_SECONDS", "360")

    client = FMPClient.from_env(tmp_path)

    assert client is not None
    assert client.price_cache_ttl_seconds == 1
    assert client.profile_cache_ttl_seconds == 45
    assert client.quote_cache_ttl_seconds == 15
    assert client.ttm_cache_ttl_seconds == 90
    assert client.analyst_estimates_cache_ttl_seconds == 120
    assert client.quarterly_statement_cache_ttl_seconds == 180
    assert client.annual_statement_cache_ttl_seconds == 360


def test_fmp_annual_statement_cache_cannot_become_indefinite(monkeypatch, tmp_path) -> None:
    calls = 0

    def fake_get(url: str, *, params: dict[str, Any], timeout: int) -> _FakeResponse:
        nonlocal calls
        calls += 1
        return _FakeResponse([{"date": "2025-08-28", "revenue": 37_000.0 + calls}], url=url)

    monkeypatch.setattr("meta_alpha_allocator.data.fmp_client.requests.get", fake_get)
    client = FMPClient(
        api_key="live_fmp_key",
        cache_root=tmp_path,
        pause_seconds=0,
        annual_statement_cache_ttl_seconds=0,
    )

    assert client.get_income_statements("MU", period="annual", limit=10).loc[0, "revenue"] == 37_001.0
    _expire(tmp_path / "fmp" / "income_statement" / "MU_annual_10.json")
    assert client.get_income_statements("MU", period="annual", limit=10).loc[0, "revenue"] == 37_002.0
    assert calls == 2
