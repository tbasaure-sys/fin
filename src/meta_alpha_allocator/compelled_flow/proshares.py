from __future__ import annotations

import csv
from datetime import datetime, timezone
from hashlib import sha256
from io import StringIO
import json
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse


PROSHARES_HOLDINGS_URL = "https://accounts.profunds.com/etfdata/psdlyhld.csv"


def _is_official_proshares_url(value: str) -> bool:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and any(
        host == domain or host.endswith(f".{domain}")
        for domain in ("proshares.com", "profunds.com")
    )


def _number(value: str | None) -> float:
    text = (value or "").strip().replace(",", "")
    return float(text) if text else 0.0


def summarize_daily_holdings(raw_csv: str, ticker: str) -> dict[str, Any]:
    """Summarize a ProShares daily file without inventing security classifications."""

    lines = raw_csv.splitlines()
    as_of_line = next((line for line in lines if line.upper().startswith("AS OF ")), None)
    if as_of_line is None:
        raise ValueError("missing ProShares AS OF preamble")
    raw_date = as_of_line.split(",", 1)[0][len("AS OF ") :].strip()
    as_of = datetime.strptime(raw_date, "%m/%d/%Y").date().isoformat()

    header_index = next(
        (index for index, line in enumerate(lines) if line.lstrip().startswith("Fund Ticker,")),
        None,
    )
    if header_index is None:
        raise ValueError("missing ProShares holdings header")
    reader = csv.DictReader(StringIO("\n".join(lines[header_index:])), skipinitialspace=True)
    rows = [
        {str(key).strip(): value for key, value in row.items()}
        for row in reader
        if (row.get("Fund Ticker") or "").strip().upper() == ticker.upper()
    ]
    if not rows:
        raise ValueError(f"ticker not present in holdings file: {ticker}")

    derivative_exposure = 0.0
    security_market_value = 0.0
    net_other_assets = 0.0
    for row in rows:
        description = (row.get("Security Description") or "").strip()
        exposure_text = row.get("Exposure Value (Notional + G/L)")
        market_value = _number(row.get("Market Value"))
        if (exposure_text or "").strip():
            derivative_exposure += _number(exposure_text)
        elif description.casefold() == "net other assets (liabilities)".casefold():
            net_other_assets += market_value
        else:
            security_market_value += market_value

    return {
        "ticker": ticker.upper(),
        "as_of": as_of,
        "row_count": len(rows),
        "reported_derivative_exposure_notional": derivative_exposure,
        "reported_security_market_value": security_market_value,
        "net_other_assets": net_other_assets,
        "observed_index_exposure": None,
        "blocking_reason": "missing_primary_classification_of_cash_security_index_exposure",
    }


def archive_holdings_snapshot(
    raw_csv: str,
    ticker: str,
    archive_root: str | Path,
    *,
    captured_at: str | None = None,
    source_url: str = PROSHARES_HOLDINGS_URL,
    source_clause: str = "Official ProShares daily holdings file",
) -> dict[str, Any]:
    """Persist immutable raw evidence plus its fail-closed parsed summary."""

    summary = summarize_daily_holdings(raw_csv, ticker)
    captured_text = captured_at or datetime.now(timezone.utc).isoformat()
    try:
        captured = datetime.fromisoformat(captured_text.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("captured_at must be an ISO-8601 timestamp") from error
    if captured.tzinfo is None or captured.utcoffset() is None:
        raise ValueError("captured_at must include a timezone")
    if captured.date() < datetime.fromisoformat(summary["as_of"]).date():
        raise ValueError("captured_at cannot precede the holdings as-of date")
    if not _is_official_proshares_url(source_url):
        raise ValueError("source_url must be an official ProShares HTTPS URL")
    if not source_clause.strip():
        raise ValueError("source_clause is required")

    root = Path(archive_root)
    target = root / ticker.upper()
    target.mkdir(parents=True, exist_ok=True)
    raw_path = target / f"{summary['as_of']}.csv"
    summary_path = target / f"{summary['as_of']}.json"
    raw_bytes = raw_csv.encode("utf-8")
    raw_hash = sha256(raw_bytes).hexdigest()
    archived_summary = {
        **summary,
        "schema_version": "compelled_flow_snapshot_v1",
        "snapshot_id": f"proshares:{ticker.upper()}:{summary['as_of']}",
        "captured_at": captured_text,
        "source_url": source_url,
        "source_clause": source_clause.strip(),
        "raw_path": raw_path.name,
        "raw_sha256": raw_hash,
    }
    summary_bytes = (json.dumps(archived_summary, indent=2, sort_keys=True) + "\n").encode("utf-8")

    for path, payload in ((raw_path, raw_bytes), (summary_path, summary_bytes)):
        if path.exists() and path.read_bytes() != payload:
            raise FileExistsError(f"different snapshot evidence already archived: {path.name}")
        if not path.exists():
            path.write_bytes(payload)

    manifest_entry = {
        "snapshot_id": archived_summary["snapshot_id"],
        "summary_path": summary_path.relative_to(root).as_posix(),
        "summary_sha256": sha256(summary_bytes).hexdigest(),
    }
    return {
        "raw_path": raw_path,
        "summary_path": summary_path,
        "manifest_entry": manifest_entry,
    }


def update_snapshot_manifest(
    archive_root: str | Path,
    manifest_entry: Mapping[str, Any],
) -> Path:
    """Append one immutable snapshot reference to the operational archive manifest."""

    root = Path(archive_root)
    root.mkdir(parents=True, exist_ok=True)
    snapshot_id = str(manifest_entry.get("snapshot_id") or "").strip()
    summary_path = str(manifest_entry.get("summary_path") or "").strip()
    summary_hash = str(manifest_entry.get("summary_sha256") or "").strip().lower()
    if not snapshot_id or not summary_path or len(summary_hash) != 64:
        raise ValueError("manifest_entry is incomplete")
    entry = {
        "summary_path": summary_path,
        "summary_sha256": summary_hash,
    }
    manifest_path = root / "snapshot_manifest.json"
    if manifest_path.exists():
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or not isinstance(payload.get("snapshots"), dict):
            raise ValueError("existing snapshot manifest is malformed")
    else:
        payload = {
            "schema_version": "compelled_flow_snapshot_manifest_v1",
            "archive_root": ".",
            "snapshots": {},
        }
    existing = payload["snapshots"].get(snapshot_id)
    if existing is not None and existing != entry:
        raise FileExistsError(f"snapshot manifest conflict: {snapshot_id}")
    payload["snapshots"][snapshot_id] = entry
    manifest_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest_path
