from __future__ import annotations

import json
import os
import sys
from contextlib import contextmanager
from datetime import date, datetime, timezone
from io import StringIO
from typing import Any, Iterator

import pandas as pd

if sys.version_info >= (3, 11):
    from datetime import UTC
else:
    UTC = timezone.utc

try:
    import psycopg
    from psycopg.types.json import Json
except Exception:  # pragma: no cover - optional until installed in runtime
    psycopg = None
    Json = None


def _database_url() -> str:
    return os.environ.get("DATABASE_URL", "").strip()


def _json_default(value: Any) -> Any:
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:  # noqa: BLE001
            pass
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:  # noqa: BLE001
            pass
    try:
        if pd.isna(value):
            return None
    except Exception:  # noqa: BLE001
        pass
    return str(value)


def _safe_json(value: Any) -> Any:
    return json.loads(json.dumps(value, default=_json_default))


def runtime_store_enabled() -> bool:
    return bool(_database_url()) and psycopg is not None


@contextmanager
def _connect() -> Iterator[Any]:
    if not runtime_store_enabled():
        yield None
        return
    connection = psycopg.connect(_database_url())
    try:
        yield connection
    finally:
        connection.close()


def load_runtime_document(document_key: str) -> dict[str, Any] | None:
    if not runtime_store_enabled():
        return None
    with _connect() as connection:
        if connection is None:
            return None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT payload
                FROM bls_runtime_documents
                WHERE document_key = %s
                """,
                (document_key,),
            )
            row = cursor.fetchone()
    if not row:
        return None
    payload = row[0]
    return payload if isinstance(payload, dict) else None


def save_runtime_document(document_key: str, payload: dict[str, Any], metadata: dict[str, Any] | None = None) -> None:
    if not runtime_store_enabled() or Json is None:
        return
    safe_payload = _safe_json(payload)
    safe_metadata = _safe_json(metadata or {})
    source = str(safe_metadata.pop("source", "unknown") or "unknown").strip() or "unknown"
    generated_at = safe_metadata.pop("generated_at", None)
    with _connect() as connection:
        if connection is None:
            return
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO bls_runtime_documents (
                  document_key,
                  source,
                  generated_at,
                  payload,
                  metadata,
                  updated_at
                )
                VALUES (%s, %s, %s, %s, %s, NOW())
                ON CONFLICT (document_key)
                DO UPDATE SET
                  source = EXCLUDED.source,
                  generated_at = EXCLUDED.generated_at,
                  payload = EXCLUDED.payload,
                  metadata = EXCLUDED.metadata,
                  updated_at = NOW()
                """,
                (
                    document_key,
                    source,
                    generated_at,
                    Json(safe_payload),
                    Json(safe_metadata),
                ),
            )
        connection.commit()


def load_runtime_frame(dataset_key: str) -> pd.DataFrame:
    if not runtime_store_enabled():
        return pd.DataFrame()
    with _connect() as connection:
        if connection is None:
            return pd.DataFrame()
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT table_payload
                FROM bls_runtime_tables
                WHERE dataset_key = %s
                """,
                (dataset_key,),
            )
            row = cursor.fetchone()
    if not row or not row[0]:
        return pd.DataFrame()
    try:
        return pd.read_json(StringIO(json.dumps(row[0])), orient="table")
    except Exception:
        return pd.DataFrame()


def has_runtime_frame(dataset_key: str) -> bool:
    if not runtime_store_enabled():
        return False
    with _connect() as connection:
        if connection is None:
            return False
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT 1
                FROM bls_runtime_tables
                WHERE dataset_key = %s
                LIMIT 1
                """,
                (dataset_key,),
            )
            row = cursor.fetchone()
    return bool(row)


def save_runtime_frame(dataset_key: str, frame: pd.DataFrame, metadata: dict[str, Any] | None = None) -> None:
    if not runtime_store_enabled() or Json is None:
        return
    if frame is None or frame.empty:
        return
    try:
        payload = json.loads(frame.to_json(orient="table", date_format="iso"))
    except Exception:
        return
    safe_metadata = _safe_json({
        "rows": int(len(frame.index)),
        "columns": list(frame.columns),
        **(metadata or {}),
    })
    with _connect() as connection:
        if connection is None:
            return
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO bls_runtime_tables (dataset_key, table_payload, metadata, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (dataset_key)
                DO UPDATE SET
                  table_payload = EXCLUDED.table_payload,
                  metadata = EXCLUDED.metadata,
                  updated_at = NOW()
                """,
                (dataset_key, Json(payload), Json(safe_metadata)),
            )
        connection.commit()


def load_runtime_snapshot(snapshot_key: str = "dashboard/latest") -> dict[str, Any] | None:
    if not runtime_store_enabled():
        return None
    with _connect() as connection:
        if connection is None:
            return None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT payload
                FROM bls_runtime_snapshots
                WHERE snapshot_key = %s
                LIMIT 1
                """,
                (snapshot_key,),
            )
            row = cursor.fetchone()
    if not row:
        return None
    payload = row[0]
    return payload if isinstance(payload, dict) else None


def save_runtime_snapshot(
    payload: dict[str, Any],
    *,
    snapshot_key: str = "dashboard/latest",
    source: str = "dashboard",
    status: str = "ready",
) -> None:
    if not runtime_store_enabled() or Json is None:
        return

    safe_payload = _safe_json(payload)
    generated_at = safe_payload.get("generated_at")
    as_of_date = safe_payload.get("as_of_date")
    if hasattr(as_of_date, "isoformat"):
        as_of_date = as_of_date.isoformat()

    with _connect() as connection:
        if connection is None:
            return
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO bls_runtime_snapshots (
                  snapshot_key,
                  source,
                  status,
                  generated_at,
                  as_of_date,
                  payload,
                  updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (snapshot_key)
                DO UPDATE SET
                  source = EXCLUDED.source,
                  status = EXCLUDED.status,
                  generated_at = EXCLUDED.generated_at,
                  as_of_date = EXCLUDED.as_of_date,
                  payload = EXCLUDED.payload,
                  updated_at = NOW()
                """,
                (
                    snapshot_key,
                    source,
                    status,
                    generated_at,
                    as_of_date,
                    Json(safe_payload),
                ),
            )
        connection.commit()


def mark_refresh_run(
    refresh_key: str,
    *,
    trigger_source: str,
    status: str,
    error_message: str | None = None,
    details: dict[str, Any] | None = None,
    completed_at: datetime | None = None,
) -> None:
    if not runtime_store_enabled() or Json is None:
        return
    safe_details = _safe_json(details or {})
    with _connect() as connection:
        if connection is None:
            return
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO bls_runtime_refresh_runs (
                  refresh_key,
                  trigger_source,
                  status,
                  started_at,
                  completed_at,
                  error_message,
                  details
                )
                VALUES (%s, %s, %s, NOW(), %s, %s, %s)
                ON CONFLICT (refresh_key)
                DO UPDATE SET
                  trigger_source = EXCLUDED.trigger_source,
                  status = EXCLUDED.status,
                  completed_at = EXCLUDED.completed_at,
                  error_message = EXCLUDED.error_message,
                  details = EXCLUDED.details
                """,
                (
                    refresh_key,
                    trigger_source,
                    status,
                    completed_at,
                    error_message,
                    Json(safe_details),
                ),
            )
        connection.commit()
