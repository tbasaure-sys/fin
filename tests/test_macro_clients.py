from __future__ import annotations

from pathlib import Path

from meta_alpha_allocator.data.fred_client import FREDClient


def test_fred_client_from_env(monkeypatch) -> None:
    monkeypatch.setenv("FRED_API_KEY", "dummy")
    client = FREDClient.from_env(Path("C:/tmp"))
    assert client is not None
    assert client.api_key == "dummy"
