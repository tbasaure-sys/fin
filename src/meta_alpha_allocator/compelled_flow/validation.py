from __future__ import annotations

from datetime import date, datetime
from hashlib import sha256
import json
from math import ceil, isfinite
from pathlib import Path
from statistics import median
from typing import Any, Iterable, Mapping
from urllib.parse import urlparse


def _blocked(
    reason: str,
    observation_count: int,
    *,
    calendar_id: str | None = None,
    calendar_session_count: int = 0,
    prediction_snapshot_ids: list[str] | None = None,
    observation_snapshot_ids: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "status": "blocked",
        "blocking_reason": reason,
        "observation_count": observation_count,
        "validated_session_count": 0,
        "calendar_id": calendar_id,
        "calendar_session_count": calendar_session_count,
        "prediction_snapshot_ids": prediction_snapshot_ids or [],
        "observation_snapshot_ids": observation_snapshot_ids or [],
        "snapshot_chain": [],
        "median_absolute_error": None,
        "median_signed_bias": None,
        "p90_absolute_error": None,
    }


def _nearest_rank(values: list[float], probability: float) -> float:
    ordered = sorted(values)
    index = max(0, ceil(probability * len(ordered)) - 1)
    return ordered[index]


def _is_canonical_iso_date(value: Any) -> bool:
    if not isinstance(value, str) or not value or value != value.strip():
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def _calendar_hash(sessions: list[str]) -> str:
    return sha256(("\n".join(sessions) + "\n").encode("utf-8")).hexdigest()


def _is_sha256(value: Any) -> bool:
    text = str(value or "").strip().lower()
    return len(text) == 64 and all(character in "0123456789abcdef" for character in text)


def _aware_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value or value != value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None and parsed.utcoffset() is not None else None


def _https_host(value: Any) -> str | None:
    if not isinstance(value, str) or not value or value != value.strip():
        return None
    parsed = urlparse(value)
    return (parsed.hostname or "").lower() if parsed.scheme == "https" else None


def _is_official_proshares_host(host: str | None) -> bool:
    return bool(
        host
        and any(
            host == domain or host.endswith(f".{domain}")
            for domain in ("proshares.com", "profunds.com")
        )
    )


def _finite_number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    parsed = float(value)
    return parsed if isfinite(parsed) else None


def _verified_calendar_reason(
    calendar: list[str],
    calendar_id: str,
    evidence: Mapping[str, Any] | None,
) -> str | None:
    if not isinstance(evidence, Mapping):
        return "missing_calendar_evidence"
    venue = str(evidence.get("venue") or "").strip().upper()
    if evidence.get("calendar_id") != calendar_id or venue not in {"XNYS", "XNAS"}:
        return "calendar_evidence_mismatch"
    if not calendar_id.upper().startswith(f"{venue}-"):
        return "calendar_evidence_mismatch"
    if any(date.fromisoformat(session).weekday() >= 5 for session in calendar):
        return "non_exchange_weekend_session"
    host = _https_host(evidence.get("source_url"))
    trusted_hosts = {
        "XNYS": ("nyse.com",),
        "XNAS": ("nasdaq.com", "nasdaqtrader.com"),
    }
    if host is None or not any(host == domain or host.endswith(f".{domain}") for domain in trusted_hosts[venue]):
        return "untrusted_calendar_source"
    if not isinstance(evidence.get("source_clause"), str) or not evidence["source_clause"].strip():
        return "missing_calendar_source_clause"
    if _aware_timestamp(evidence.get("retrieved_at")) is None:
        return "malformed_calendar_retrieved_at"
    expected_hash = str(evidence.get("sessions_sha256") or "").strip().lower()
    if not _is_sha256(expected_hash) or expected_hash != _calendar_hash(calendar):
        return "calendar_hash_mismatch"
    return None


def _archive_path(root: Path, value: Any) -> Path | None:
    if not isinstance(value, str) or not value.strip():
        return None
    candidate = (root / value).resolve() if not Path(value).is_absolute() else Path(value).resolve()
    return candidate if candidate == root or root in candidate.parents else None


def _file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verify_snapshot(
    snapshot_id: str,
    expected_session: str,
    *,
    archive_root: Path,
    entries: Mapping[str, Any],
) -> tuple[dict[str, Any] | None, str | None]:
    entry = entries.get(snapshot_id)
    if not isinstance(entry, Mapping):
        return None, "snapshot_missing_from_manifest"
    summary_path = _archive_path(archive_root, entry.get("summary_path"))
    expected_summary_hash = str(entry.get("summary_sha256") or "").strip().lower()
    if summary_path is None:
        return None, "snapshot_path_outside_archive"
    if not summary_path.is_file():
        return None, "snapshot_summary_missing"
    if not _is_sha256(expected_summary_hash) or _file_sha256(summary_path) != expected_summary_hash:
        return None, "snapshot_summary_hash_mismatch"
    try:
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None, "malformed_snapshot_summary"
    if not isinstance(summary, Mapping):
        return None, "malformed_snapshot_summary"
    if summary.get("snapshot_id") != snapshot_id or summary.get("as_of") != expected_session:
        return None, "snapshot_identity_or_session_mismatch"
    captured_at = _aware_timestamp(summary.get("captured_at"))
    if captured_at is None:
        return None, "malformed_snapshot_capture_time"
    if captured_at.date() < date.fromisoformat(expected_session):
        return None, "snapshot_captured_before_as_of"
    if (captured_at.date() - date.fromisoformat(expected_session)).days > 7:
        return None, "snapshot_capture_too_late"
    if not snapshot_id.startswith("proshares:") or not _is_official_proshares_host(
        _https_host(summary.get("source_url"))
    ):
        return None, "untrusted_snapshot_source"
    if not isinstance(summary.get("source_clause"), str) or not summary["source_clause"].strip():
        return None, "missing_snapshot_source_clause"
    raw_path = _archive_path(archive_root, summary.get("raw_path"))
    expected_raw_hash = str(summary.get("raw_sha256") or "").strip().lower()
    if raw_path is None:
        return None, "snapshot_raw_path_outside_archive"
    if not raw_path.is_file():
        return None, "snapshot_raw_file_missing"
    if not _is_sha256(expected_raw_hash) or _file_sha256(raw_path) != expected_raw_hash:
        return None, "snapshot_raw_hash_mismatch"
    exposure = _finite_number(summary.get("observed_index_exposure"))
    if exposure is None:
        return None, "missing_archived_index_exposure"
    return {
        "snapshot_id": snapshot_id,
        "as_of": expected_session,
        "captured_at": captured_at,
        "exposure": exposure,
        "summary_sha256": expected_summary_hash,
        "raw_sha256": expected_raw_hash,
        "source_url": summary["source_url"],
    }, None


def validate_predictions(
    rows: Iterable[Mapping[str, Any]],
    *,
    session_calendar: Iterable[str],
    calendar_id: str,
    calendar_evidence: Mapping[str, Any] | None = None,
    snapshot_manifest: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Validate >=30 linked forecasts against hashed external archive evidence."""

    try:
        observations = list(rows)
    except TypeError:
        observations = []

    normalized_calendar_id = calendar_id.strip() if isinstance(calendar_id, str) else ""
    if not normalized_calendar_id:
        return _blocked("blank_calendar_id", len(observations))

    try:
        calendar = list(session_calendar)
    except TypeError:
        return _blocked(
            "malformed_session_calendar",
            len(observations),
            calendar_id=normalized_calendar_id,
        )
    if any(not _is_canonical_iso_date(session) for session in calendar):
        return _blocked(
            "malformed_session_calendar",
            len(observations),
            calendar_id=normalized_calendar_id,
            calendar_session_count=len(calendar),
        )
    if len(set(calendar)) != len(calendar):
        return _blocked(
            "duplicate_session_calendar_date",
            len(observations),
            calendar_id=normalized_calendar_id,
            calendar_session_count=len(calendar),
        )
    if any(previous >= current for previous, current in zip(calendar, calendar[1:])):
        return _blocked(
            "non_increasing_session_calendar",
            len(observations),
            calendar_id=normalized_calendar_id,
            calendar_session_count=len(calendar),
        )
    if normalized_calendar_id.upper().startswith(("XNYS-", "XNAS-")) and any(
        date.fromisoformat(session).weekday() >= 5 for session in calendar
    ):
        return _blocked(
            "non_exchange_weekend_session",
            len(observations),
            calendar_id=normalized_calendar_id,
            calendar_session_count=len(calendar),
        )
    if len(calendar) < 31:
        return _blocked(
            "fewer_than_31_calendar_sessions",
            len(observations),
            calendar_id=normalized_calendar_id,
            calendar_session_count=len(calendar),
        )

    prediction_snapshot_ids: list[str] = []
    observation_snapshot_ids: list[str] = []

    def blocked(reason: str) -> dict[str, Any]:
        return _blocked(
            reason,
            len(observations),
            calendar_id=normalized_calendar_id,
            calendar_session_count=len(calendar),
            prediction_snapshot_ids=prediction_snapshot_ids,
            observation_snapshot_ids=observation_snapshot_ids,
        )

    if len(observations) < 30:
        return blocked("fewer_than_30_business_sessions")
    if any(not isinstance(row, Mapping) for row in observations):
        return blocked("malformed_prediction_row")

    dates = [row.get("date") for row in observations]
    if any(not _is_canonical_iso_date(session) for session in dates):
        return blocked("malformed_prediction_session_date")

    calendar_indices = {session: index for index, session in enumerate(calendar)}
    if any(session not in calendar_indices for session in dates):
        return blocked("prediction_date_outside_session_calendar")
    prediction_indices = [calendar_indices[session] for session in dates]
    if any(previous >= current for previous, current in zip(prediction_indices, prediction_indices[1:])):
        return blocked("prediction_sessions_not_strictly_increasing")
    if any(current != previous + 1 for previous, current in zip(prediction_indices, prediction_indices[1:])):
        return blocked("noncontiguous_prediction_sessions")
    if prediction_indices[-1] >= len(calendar) - 1:
        return blocked("final_prediction_lacks_successor_session")

    snapshot_sessions: dict[str, str] = {}
    for row, prediction_index in zip(observations, prediction_indices):
        expected_observation_session = calendar[prediction_index + 1]
        if row.get("observed_as_of") != expected_observation_session:
            return blocked("observed_as_of_not_next_session")

        prediction_snapshot_id = row.get("prediction_snapshot_id")
        if not isinstance(prediction_snapshot_id, str) or not prediction_snapshot_id.strip():
            return blocked("missing_prediction_snapshot_id")
        observation_snapshot_id = row.get("observation_snapshot_id")
        if not isinstance(observation_snapshot_id, str) or not observation_snapshot_id.strip():
            return blocked("missing_observation_snapshot_id")

        prediction_snapshot_id = prediction_snapshot_id.strip()
        observation_snapshot_id = observation_snapshot_id.strip()
        prediction_snapshot_ids.append(prediction_snapshot_id)
        observation_snapshot_ids.append(observation_snapshot_id)

        for snapshot_id, snapshot_session in (
            (prediction_snapshot_id, row["date"]),
            (observation_snapshot_id, expected_observation_session),
        ):
            prior_session = snapshot_sessions.get(snapshot_id)
            if prior_session is not None and prior_session != snapshot_session:
                return blocked("inconsistent_snapshot_id_reuse")
            snapshot_sessions[snapshot_id] = snapshot_session

    if any(
        observation_snapshot_id != next_prediction_snapshot_id
        for observation_snapshot_id, next_prediction_snapshot_id in zip(
            observation_snapshot_ids, prediction_snapshot_ids[1:]
        )
    ):
        return blocked("unlinked_adjacent_snapshots")

    snapshot_chain = [prediction_snapshot_ids[0], *observation_snapshot_ids]

    if any(row.get("observed_next_day_exposure_change") is None for row in observations):
        return blocked("missing_observed_holdings_exposure")

    calendar_evidence_reason = _verified_calendar_reason(
        calendar,
        normalized_calendar_id,
        calendar_evidence,
    )
    if calendar_evidence_reason:
        return blocked(calendar_evidence_reason)

    if not isinstance(snapshot_manifest, Mapping):
        return blocked("missing_snapshot_manifest")
    entries = snapshot_manifest.get("snapshots")
    archive_root_value = snapshot_manifest.get("archive_root")
    if not isinstance(entries, Mapping) or not isinstance(archive_root_value, (str, Path)):
        return blocked("malformed_snapshot_manifest")
    try:
        archive_root = Path(archive_root_value).resolve()
    except (OSError, TypeError, ValueError):
        return blocked("malformed_snapshot_manifest")
    if not archive_root.is_dir():
        return blocked("snapshot_archive_root_missing")

    verified_snapshots: dict[str, dict[str, Any]] = {}
    for snapshot_id, snapshot_session in snapshot_sessions.items():
        verified, verification_reason = _verify_snapshot(
            snapshot_id,
            snapshot_session,
            archive_root=archive_root,
            entries=entries,
        )
        if verification_reason:
            return blocked(verification_reason)
        verified_snapshots[snapshot_id] = verified or {}

    errors: list[float] = []
    for row in observations:
        predicted = row.get("predicted_exposure_change")
        reported_observed = row.get("observed_next_day_exposure_change")
        if not isinstance(predicted, (int, float)) or not isfinite(float(predicted)) or predicted == 0:
            return blocked("invalid_or_zero_predicted_exposure_change")
        if not isinstance(reported_observed, (int, float)) or not isfinite(float(reported_observed)):
            return blocked("invalid_observed_holdings_exposure")
        prediction_snapshot = verified_snapshots[row["prediction_snapshot_id"].strip()]
        observation_snapshot = verified_snapshots[row["observation_snapshot_id"].strip()]
        generated_at = _aware_timestamp(row.get("prediction_generated_at"))
        if generated_at is None:
            return blocked("missing_or_malformed_prediction_generated_at")
        if generated_at < prediction_snapshot["captured_at"]:
            return blocked("prediction_generated_before_prediction_capture")
        if generated_at >= observation_snapshot["captured_at"]:
            return blocked("prediction_generated_after_observation_capture")
        observed = observation_snapshot["exposure"] - prediction_snapshot["exposure"]
        tolerance = max(1e-9, abs(observed) * 1e-9)
        if abs(float(reported_observed) - observed) > tolerance:
            return blocked("row_ground_truth_disagrees_with_archive")
        errors.append((float(observed) - float(predicted)) / abs(float(predicted)))

    absolute_errors = [abs(error) for error in errors]
    med_abs = median(absolute_errors)
    bias = median(errors)
    p90 = _nearest_rank(absolute_errors, 0.90)
    if med_abs <= 0.10 and abs(bias) <= 0.10:
        status = "pass"
    elif med_abs > 0.25:
        status = "fail"
    else:
        status = "review"
    return {
        "status": status,
        "blocking_reason": None,
        "observation_count": len(observations),
        "validated_session_count": len(observations),
        "calendar_id": normalized_calendar_id,
        "calendar_session_count": len(calendar),
        "prediction_snapshot_ids": prediction_snapshot_ids,
        "observation_snapshot_ids": observation_snapshot_ids,
        "snapshot_chain": snapshot_chain,
        "distinct_snapshot_count": len(snapshot_sessions),
        "calendar_evidence_verified": True,
        "snapshot_archive_verified": True,
        "ground_truth_source": "archived_snapshot_delta",
        "verified_snapshot_hashes": {
            snapshot_id: {
                "summary_sha256": snapshot["summary_sha256"],
                "raw_sha256": snapshot["raw_sha256"],
            }
            for snapshot_id, snapshot in verified_snapshots.items()
        },
        "prediction_session_start": dates[0],
        "prediction_session_end": dates[-1],
        "observation_session_end": observations[-1]["observed_as_of"],
        "median_absolute_error": med_abs,
        "median_signed_bias": bias,
        "p90_absolute_error": p90,
        "error_definition": "(observed_next_day_exposure_change - predicted_exposure_change) / abs(predicted_exposure_change)",
        "pass_threshold": {"median_absolute_error_max": 0.10, "absolute_median_bias_max": 0.10},
        "fail_threshold": {"median_absolute_error_gt": 0.25},
    }


def validate_prediction_package(
    *,
    predictions_path: str | Path,
    calendar_path: str | Path,
    snapshot_manifest_path: str | Path,
) -> dict[str, Any]:
    """Load one on-disk validation package and apply the archive-backed gate."""

    try:
        prediction_file = Path(predictions_path)
        calendar_file = Path(calendar_path)
        manifest_file = Path(snapshot_manifest_path)
        rows = [
            json.loads(line)
            for line in prediction_file.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        calendar_payload = json.loads(calendar_file.read_text(encoding="utf-8"))
        manifest_payload = json.loads(manifest_file.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return _blocked("malformed_validation_package", 0)

    if (
        not isinstance(calendar_payload, Mapping)
        or not isinstance(manifest_payload, Mapping)
        or any(not isinstance(row, Mapping) for row in rows)
    ):
        return _blocked("malformed_validation_package", len(rows))

    archive_root = manifest_payload.get("archive_root")
    if isinstance(archive_root, str) and archive_root and not Path(archive_root).is_absolute():
        archive_root = str((manifest_file.parent / archive_root).resolve())
    resolved_manifest = {
        **manifest_payload,
        "archive_root": archive_root,
    }
    return validate_predictions(
        rows,
        session_calendar=calendar_payload.get("sessions") or [],
        calendar_id=calendar_payload.get("calendar_id") or "",
        calendar_evidence=calendar_payload.get("evidence"),
        snapshot_manifest=resolved_manifest,
    )
