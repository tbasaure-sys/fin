from datetime import date

import numpy as np
import pandas as pd

from meta_alpha_allocator.signal_intelligence.data import AssetSpec
from meta_alpha_allocator.signal_intelligence.storage import MemorySignalRepository
from meta_alpha_allocator.signal_intelligence.worker import SignalWorker, confirmed_state_change, run_from_environment


def _bars(count=620):
    dates = pd.date_range("2024-01-01", periods=count, freq="D")
    close = 100 * np.exp(np.arange(count) * 0.004)
    return pd.DataFrame(
        {
            "date": dates,
            "open": close * 0.998,
            "high": close * 1.01,
            "low": close * 0.99,
            "close": close,
            "adjClose": close,
            "volume": 1000 + np.arange(count) * 10,
        }
    )


class FakeFmp:
    def get_historical_eod_bars(self, symbol, start_date=None, end_date=None):
        return _bars()


def test_worker_writes_idempotent_eod_run_and_receipt():
    repo = MemorySignalRepository(
        assets=[
            AssetSpec(
                key="SPY",
                provider_symbol="SPY",
                asset_class="etf",
                rights_status="approved",
                volume_kind="exchange",
            )
        ]
    )
    worker = SignalWorker(repository=repo, fmp_client=FakeFmp(), enabled=True, validation_years=1)

    first = worker.run_once(as_of=date(2025, 9, 11))
    second = worker.run_once(as_of=date(2025, 9, 11))

    assert first["writtenRuns"] == 1
    assert second["writtenRuns"] == 1
    assert len(repo.runs) == 1
    assert repo.runs[0]["payload"]["receipt"]["engineVersion"] == "signal-genome.v1"
    assert repo.runs[0]["payload"]["status"] == "ready"
    assert repo.refresh_runs["signal-intelligence:eod:2025-09-11"]["status"] == "completed"


def test_worker_blocks_unapproved_asset_without_calling_provider():
    class ExplodingFmp:
        def get_historical_eod_bars(self, *args, **kwargs):
            raise AssertionError("blocked assets must not call FMP")

    repo = MemorySignalRepository(
        assets=[AssetSpec(key="SPY", provider_symbol="SPY", asset_class="etf", rights_status="pending")]
    )
    worker = SignalWorker(repository=repo, fmp_client=ExplodingFmp(), enabled=True)

    result = worker.run_once(as_of=date(2024, 5, 19))

    assert result["writtenRuns"] == 1
    assert repo.runs[0]["payload"]["status"] == "blocked"


def test_worker_backfills_only_visible_point_in_time_history_when_enabled():
    repo = MemorySignalRepository(
        assets=[AssetSpec(key="SPY", provider_symbol="SPY", asset_class="etf", rights_status="approved", volume_kind="exchange")]
    )
    worker = SignalWorker(
        repository=repo,
        fmp_client=FakeFmp(),
        enabled=True,
        validation_years=1,
        persist_history=True,
    )

    worker.run_once(as_of=date(2025, 9, 11))

    dates = {record["asOfDate"] for record in repo.runs}
    assert len(dates) > 1
    assert len(repo.runs) == len(dates)
    assert max(dates) == "2025-09-11"


def test_worker_disabled_mode_has_no_side_effects():
    repo = MemorySignalRepository(
        assets=[AssetSpec(key="SPY", provider_symbol="SPY", asset_class="etf", rights_status="approved")]
    )

    result = SignalWorker(repository=repo, fmp_client=FakeFmp(), enabled=False).run_once(as_of=date(2024, 5, 19))

    assert result == {"enabled": False, "writtenRuns": 0, "blocked": 0, "errors": 0}
    assert repo.runs == []


def test_environment_kill_switch_returns_without_database_or_provider(monkeypatch):
    monkeypatch.setenv("BLS_SIGNAL_INTELLIGENCE_ENABLED", "false")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("FMP_API_KEY", raising=False)

    assert run_from_environment() == {"enabled": False, "writtenRuns": 0, "blocked": 0, "errors": 0}


def test_confirmed_state_change_requires_two_ready_runs_after_an_older_state():
    runs = [
        {"asOfDate": "2024-05-19", "payload": {"status": "ready", "state": "trend_up"}},
        {"asOfDate": "2024-05-18", "payload": {"status": "ready", "state": "trend_up"}},
        {"asOfDate": "2024-05-17", "payload": {"status": "ready", "state": "range"}},
    ]

    candidate = confirmed_state_change(runs)

    assert candidate == {"confirmed": True, "state": "trend_up", "asOfDate": "2024-05-19"}
