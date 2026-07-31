from __future__ import annotations

import csv
from datetime import datetime
from io import StringIO
import json
from pathlib import Path
from typing import Any


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
    raw_csv: str, ticker: str, archive_root: str | Path
) -> dict[str, Path]:
    """Persist immutable raw evidence plus its fail-closed parsed summary."""

    summary = summarize_daily_holdings(raw_csv, ticker)
    target = Path(archive_root) / ticker.upper()
    target.mkdir(parents=True, exist_ok=True)
    raw_path = target / f"{summary['as_of']}.csv"
    summary_path = target / f"{summary['as_of']}.json"
    if raw_path.exists() and raw_path.read_text(encoding="utf-8") != raw_csv:
        raise FileExistsError(f"different snapshot already archived for {summary['as_of']}")
    raw_path.write_text(raw_csv, encoding="utf-8")
    summary_path.write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return {"raw_path": raw_path, "summary_path": summary_path}
