from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Iterable
from uuid import NAMESPACE_URL, UUID, uuid5

import pandas as pd

from .data import AssetSpec


def deterministic_run_id(idempotency_key: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"bls-prime:{idempotency_key}"))


@dataclass
class MemorySignalRepository:
    assets: list[AssetSpec] = field(default_factory=list)
    bars: dict[tuple[str, str], Any] = field(default_factory=dict)
    runs: list[dict[str, Any]] = field(default_factory=list)
    alerts: dict[tuple[str, str], dict[str, Any]] = field(default_factory=dict)
    workspace_assets: dict[str, list[str]] = field(default_factory=dict)
    refresh_runs: dict[str, dict[str, Any]] = field(default_factory=dict)

    def list_assets(self) -> list[AssetSpec]:
        return list(self.assets)

    def upsert_asset(self, asset: AssetSpec) -> None:
        for index, current in enumerate(self.assets):
            if current.key == asset.key:
                self.assets[index] = AssetSpec(
                    key=current.key,
                    provider_symbol=asset.provider_symbol or current.provider_symbol,
                    asset_class=asset.asset_class or current.asset_class,
                    currency=asset.currency or current.currency,
                    benchmark_key=asset.benchmark_key or current.benchmark_key,
                    volume_kind=asset.volume_kind or current.volume_kind,
                    calendar=asset.calendar or current.calendar,
                    rights_status=current.rights_status,
                    coverage_status=current.coverage_status,
                    coverage_pct=current.coverage_pct,
                    last_data_date=current.last_data_date,
                )
                return
        self.assets.append(asset)

    def update_asset_quality(self, *, asset_key: str, coverage_status: str, coverage_pct: float, last_data_date: str | None) -> None:
        for index, current in enumerate(self.assets):
            if current.key == asset_key:
                self.assets[index] = AssetSpec(
                    key=current.key,
                    provider_symbol=current.provider_symbol,
                    asset_class=current.asset_class,
                    currency=current.currency,
                    benchmark_key=current.benchmark_key,
                    volume_kind=current.volume_kind,
                    calendar=current.calendar,
                    rights_status=current.rights_status,
                    coverage_status=coverage_status,
                    coverage_pct=float(coverage_pct),
                    last_data_date=last_data_date,
                )
                return

    def save_bars(self, asset: AssetSpec, frame: Any) -> None:
        self.bars[(asset.key, str(frame["date"].iloc[-1].date()))] = frame.copy()

    def upsert_run(
        self,
        *,
        workspace_id: str | None,
        run_type: str,
        subject_type: str,
        subject_key: str,
        as_of_date: str,
        available_at: str | None,
        status: str,
        engine_version: str,
        input_fingerprint: str,
        payload: dict[str, Any],
        receipt: dict[str, Any],
    ) -> tuple[dict[str, Any], bool]:
        idempotency_key = "|".join(
            [str(workspace_id or "global"), run_type, subject_type, subject_key, as_of_date, engine_version, input_fingerprint]
        )
        for record in self.runs:
            if record["idempotencyKey"] == idempotency_key:
                return record, False
        record = {
            "id": deterministic_run_id(idempotency_key),
            "workspaceId": workspace_id,
            "runType": run_type,
            "subjectType": subject_type,
            "subjectKey": subject_key,
            "asOfDate": as_of_date,
            "availableAt": available_at,
            "status": status,
            "engineVersion": engine_version,
            "inputFingerprint": input_fingerprint,
            "idempotencyKey": idempotency_key,
            "payload": payload,
            "receipt": receipt,
        }
        self.runs.append(record)
        return record, True

    def previous_run(self, *, subject_key: str, as_of_date: str) -> dict[str, Any] | None:
        candidates = [
            record
            for record in self.runs
            if record["subjectType"] == "asset" and record["subjectKey"] == subject_key and record["asOfDate"] < as_of_date
        ]
        return sorted(candidates, key=lambda record: record["asOfDate"])[-1] if candidates else None

    def recent_runs(self, *, subject_key: str, limit: int = 3) -> list[dict[str, Any]]:
        candidates = [record for record in self.runs if record["subjectType"] == "asset" and record["subjectKey"] == subject_key]
        return sorted(candidates, key=lambda record: record["asOfDate"], reverse=True)[:limit]

    def workspace_asset_keys(self, workspace_id: str) -> list[str]:
        return list(self.workspace_assets.get(workspace_id, []))

    def upsert_alert(self, *, workspace_id: str, alert_id: str, payload: dict[str, Any]) -> bool:
        key = (workspace_id, alert_id)
        if key in self.alerts:
            return False
        self.alerts[key] = {"workspaceId": workspace_id, "alertId": alert_id, **payload}
        return True

    def start_refresh_run(self, refresh_key: str, *, details: dict[str, Any] | None = None) -> None:
        self.refresh_runs[refresh_key] = {
            "refreshKey": refresh_key,
            "triggerSource": "signal-intelligence-eod",
            "status": "started",
            "details": details or {},
        }

    def finish_refresh_run(self, refresh_key: str, *, status: str, details: dict[str, Any] | None = None, error_message: str | None = None) -> None:
        record = self.refresh_runs.setdefault(refresh_key, {"refreshKey": refresh_key})
        record.update({"status": status, "details": details or {}, "errorMessage": error_message})


class NeonSignalRepository:
    """Small psycopg repository used only by the Railway EOD worker."""

    def __init__(self, database_url: str):
        self.database_url = str(database_url or "").strip()
        if not self.database_url:
            raise ValueError("DATABASE_URL is required for NeonSignalRepository")

    @classmethod
    def from_env(cls) -> "NeonSignalRepository":
        return cls(os.environ.get("DATABASE_URL", ""))

    def _connect(self):
        import psycopg

        return psycopg.connect(self.database_url)

    def list_assets(self) -> list[AssetSpec]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT asset_key, provider_symbol, asset_class, currency, benchmark_key,
                       volume_kind, calendar_key, rights_status, coverage_status,
                       coverage_pct, last_data_date
                FROM bls_market_assets
                WHERE is_active = TRUE
                ORDER BY asset_key
                """
            ).fetchall()
        return [
            AssetSpec(
                key=row[0],
                provider_symbol=row[1],
                asset_class=row[2],
                currency=row[3] or "USD",
                benchmark_key=row[4],
                volume_kind=row[5] or "none",
                calendar=row[6] or "business",
                rights_status=row[7] or "pending",
                coverage_status=row[8] or "unknown",
                coverage_pct=float(row[9] or 0),
                last_data_date=row[10].isoformat() if row[10] else None,
            )
            for row in rows
        ]

    def upsert_asset(self, asset: AssetSpec) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO bls_market_assets (
                  asset_key, provider_symbol, asset_class, currency, benchmark_key,
                  volume_kind, calendar_key, rights_status, coverage_status,
                  coverage_pct, last_data_date
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (asset_key) DO UPDATE SET
                  provider_symbol = EXCLUDED.provider_symbol,
                  asset_class = EXCLUDED.asset_class,
                  currency = EXCLUDED.currency,
                  benchmark_key = EXCLUDED.benchmark_key,
                  volume_kind = EXCLUDED.volume_kind,
                  calendar_key = EXCLUDED.calendar_key,
                  updated_at = NOW()
                """,
                (
                    asset.key,
                    asset.provider_symbol,
                    asset.asset_class,
                    asset.currency,
                    asset.benchmark_key,
                    asset.volume_kind,
                    asset.calendar,
                    asset.rights_status,
                    asset.coverage_status,
                    asset.coverage_pct,
                    asset.last_data_date,
                ),
            )

    def update_asset_quality(self, *, asset_key: str, coverage_status: str, coverage_pct: float, last_data_date: str | None) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE bls_market_assets
                SET coverage_status = %s, coverage_pct = %s, last_data_date = %s, updated_at = NOW()
                WHERE asset_key = %s
                """,
                (coverage_status, float(coverage_pct), last_data_date, asset_key),
            )

    def save_bars(self, asset: AssetSpec, frame: Any) -> None:
        rows = []
        for _, row in frame.iterrows():
            rows.append(
                (
                    asset.key,
                    asset.provider_symbol,
                    row["date"].date(),
                    row["open"],
                    row["high"],
                    row["low"],
                    row["close"],
                    row["adj_close"],
                    row["raw_close"],
                    row["adjustment_factor"],
                    None if _is_missing(row["volume"]) else row["volume"],
                    row["input_hash"],
                )
            )
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO bls_market_bars_eod (
                  asset_key, provider, session_date, open, high, low, close,
                  adj_close, raw_close, adjustment_factor, volume, input_hash
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (asset_key, provider, session_date)
                DO UPDATE SET
                  open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
                  close = EXCLUDED.close, adj_close = EXCLUDED.adj_close,
                  raw_close = EXCLUDED.raw_close, adjustment_factor = EXCLUDED.adjustment_factor,
                  volume = EXCLUDED.volume, input_hash = EXCLUDED.input_hash,
                  fetched_at = NOW()
                """,
                rows,
            )

    def upsert_run(self, **kwargs: Any) -> tuple[dict[str, Any], bool]:
        workspace_id = kwargs.get("workspace_id")
        idempotency_key = "|".join(
            [
                str(workspace_id or "global"),
                str(kwargs["run_type"]),
                str(kwargs["subject_type"]),
                str(kwargs["subject_key"]),
                str(kwargs["as_of_date"]),
                str(kwargs["engine_version"]),
                str(kwargs["input_fingerprint"]),
            ]
        )
        run_id = deterministic_run_id(idempotency_key)
        with self._connect() as connection:
            row = connection.execute(
                """
                INSERT INTO bls_analysis_runs (
                  id, workspace_id, run_type, subject_type, subject_key, as_of_date,
                  available_at, status, engine_version, input_fingerprint,
                  idempotency_key, payload, receipt
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                ON CONFLICT (idempotency_key) DO NOTHING
                RETURNING id
                """,
                (
                    UUID(run_id), workspace_id, kwargs["run_type"], kwargs["subject_type"], kwargs["subject_key"],
                    kwargs["as_of_date"], kwargs["available_at"], kwargs["status"], kwargs["engine_version"],
                    kwargs["input_fingerprint"], idempotency_key, json.dumps(kwargs["payload"]), json.dumps(kwargs["receipt"]),
                ),
            ).fetchone()
        return {"id": run_id, "idempotencyKey": idempotency_key, **kwargs}, bool(row)

    def upsert_alert(self, *, workspace_id: str, alert_id: str, payload: dict[str, Any]) -> bool:
        with self._connect() as connection:
            row = connection.execute(
                """
                INSERT INTO bls_workspace_alerts (workspace_id, alert_id, severity, title, body, action, source)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (workspace_id, alert_id) DO NOTHING
                RETURNING id
                """,
                (workspace_id, alert_id, payload.get("severity", "medium"), payload["title"], payload.get("body"), payload.get("action"), payload.get("source", "signal-intelligence")),
            ).fetchone()
        return bool(row)

    def start_refresh_run(self, refresh_key: str, *, details: dict[str, Any] | None = None) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO bls_runtime_refresh_runs (refresh_key, trigger_source, status, details)
                VALUES (%s, 'signal-intelligence-eod', 'started', %s::jsonb)
                ON CONFLICT (refresh_key) DO UPDATE SET
                  trigger_source = EXCLUDED.trigger_source,
                  status = 'started',
                  started_at = NOW(),
                  completed_at = NULL,
                  error_message = NULL,
                  details = EXCLUDED.details
                """,
                (refresh_key, json.dumps(details or {})),
            )

    def finish_refresh_run(self, refresh_key: str, *, status: str, details: dict[str, Any] | None = None, error_message: str | None = None) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE bls_runtime_refresh_runs
                   SET status = %s, completed_at = NOW(), error_message = %s, details = %s::jsonb
                 WHERE refresh_key = %s
                """,
                (status, error_message, json.dumps(details or {}), refresh_key),
            )

    def previous_run(self, *, subject_key: str, as_of_date: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, workspace_id, run_type, subject_type, subject_key, as_of_date,
                       available_at, status, engine_version, input_fingerprint, payload, receipt
                FROM bls_analysis_runs
                WHERE workspace_id IS NULL AND subject_type = 'asset'
                  AND subject_key = %s AND as_of_date < %s
                ORDER BY as_of_date DESC, created_at DESC
                LIMIT 1
                """,
                (subject_key, as_of_date),
            ).fetchone()
        if not row:
            return None
        payload = row[10] if isinstance(row[10], dict) else json.loads(row[10])
        receipt = row[11] if isinstance(row[11], dict) else json.loads(row[11])
        return {"id": str(row[0]), "asOfDate": row[5].isoformat(), "payload": payload, "receipt": receipt}

    def recent_runs(self, *, subject_key: str, limit: int = 3) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id::text, as_of_date, payload, receipt
                FROM bls_analysis_runs
                WHERE workspace_id IS NULL AND subject_type = 'asset'
                  AND subject_key = %s
                ORDER BY as_of_date DESC, created_at DESC
                LIMIT %s
                """,
                (subject_key, limit),
            ).fetchall()
        return [
            {
                "id": str(row[0]),
                "asOfDate": row[1].isoformat(),
                "payload": row[2] if isinstance(row[2], dict) else json.loads(row[2]),
                "receipt": row[3] if isinstance(row[3], dict) else json.loads(row[3]),
            }
            for row in rows
        ]

    def workspace_asset_keys(self, workspace_id: str) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT ticker FROM bls_portfolio_positions WHERE workspace_id = %s
                UNION SELECT symbol FROM bls_watchlist_items WHERE workspace_id = %s
                UNION SELECT ticker FROM bls_escrow_decisions
                  WHERE workspace_id = %s AND status NOT IN ('executed', 'expired')
                UNION SELECT ticker FROM bls_equity_research_runs
                  WHERE workspace_id = %s
                """,
                (workspace_id, workspace_id, workspace_id, workspace_id),
            ).fetchall()
        return sorted({str(row[0]).strip().upper() for row in rows if row[0]})


def _is_missing(value: Any) -> bool:
    if value is None:
        return True
    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False
