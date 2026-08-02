from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from .contracts import CONTEXT_ASSETS, SIGNAL_CONFIG_FINGERPRINT, SIGNAL_CONFIG_VERSION, SIGNAL_ENGINE_VERSION, SIGNAL_SCHEMA_VERSION
from .data import AssetSpec, asset_spec_for_key, coverage_pct, default_context_specs, is_stale, normalize_eod_bars
from .engine import compute_market_state, compute_market_state_history
from .storage import NeonSignalRepository


def _empty_bars() -> pd.DataFrame:
    return pd.DataFrame(columns=["date", "high", "low", "close"])


def _blocked_payload(asset: AssetSpec, *, reason: str, as_of: date) -> dict[str, Any]:
    return {
        "schemaVersion": SIGNAL_SCHEMA_VERSION,
        "runType": "market_state_eod",
        "subject": {"type": "asset", "key": asset.key, "assetClass": asset.asset_class},
        "asOfDate": as_of.isoformat(),
        "availableAt": (as_of + timedelta(days=1)).isoformat() + "T00:00:00Z",
        "status": "blocked",
        "state": None,
        "technicalReady": False,
        "evidencePromoted": False,
        "families": [],
        "disagreements": [],
        "dataQuality": {"rightsApproved": False, "coveragePct": 0.0, "barCount": 0, "reason": reason},
        "receipt": {
            "engineVersion": SIGNAL_ENGINE_VERSION,
            "configVersion": SIGNAL_CONFIG_VERSION,
            "configFingerprint": SIGNAL_CONFIG_FINGERPRINT,
            "source": "normalized_eod_bars",
            "inputBarCount": 0,
        },
    }


def confirmed_state_change(runs: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = sorted(runs, key=lambda item: str(item.get("asOfDate", "")), reverse=True)
    if len(ordered) < 3:
        return {"confirmed": False, "state": None, "asOfDate": None}
    current, previous, older = ordered[:3]
    current_payload = current.get("payload", {})
    previous_payload = previous.get("payload", {})
    older_payload = older.get("payload", {})
    state = current_payload.get("state")
    confirmed = bool(
        current_payload.get("status") == "ready"
        and previous_payload.get("status") == "ready"
        and state
        and state == previous_payload.get("state")
        and state != "uncertain"
        and older_payload.get("state") != state
    )
    return {"confirmed": confirmed, "state": state if confirmed else None, "asOfDate": current.get("asOfDate") if confirmed else None}


@dataclass
class SignalWorker:
    repository: Any
    fmp_client: Any
    enabled: bool = False
    lookback_years: int = 10
    validation_years: int = 5
    seed_context: bool = False
    workspace_ids: tuple[str, ...] = ()
    alerts_enabled: bool = False
    context_provider: Any = None
    persist_history: bool = False

    def run_once(self, *, as_of: date | None = None) -> dict[str, int | bool]:
        if not self.enabled:
            return {"enabled": False, "writtenRuns": 0, "blocked": 0, "errors": 0}
        if self.seed_context and hasattr(self.repository, "upsert_asset"):
            for spec in default_context_specs(CONTEXT_ASSETS):
                self.repository.upsert_asset(spec)
            for workspace_id in self.workspace_ids:
                if not hasattr(self.repository, "workspace_asset_keys"):
                    continue
                for asset_key in self.repository.workspace_asset_keys(workspace_id):
                    self.repository.upsert_asset(asset_spec_for_key(asset_key))
        cutoff = as_of or date.today()
        result = {"enabled": True, "writtenRuns": 0, "blocked": 0, "errors": 0}
        refresh_key = f"signal-intelligence:eod:{cutoff.isoformat()}"
        if hasattr(self.repository, "start_refresh_run"):
            self.repository.start_refresh_run(refresh_key, details={"asOfDate": cutoff.isoformat(), "mode": "eod"})
        for asset in self.repository.list_assets():
            try:
                if asset.rights_status != "approved":
                    payload = _blocked_payload(asset, reason="rights_not_approved", as_of=cutoff)
                    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
                    self.repository.upsert_run(
                        workspace_id=None,
                        run_type="market_state_eod",
                        subject_type="asset",
                        subject_key=asset.key,
                        as_of_date=cutoff.isoformat(),
                        available_at=payload["availableAt"],
                        status=payload["status"],
                        engine_version=SIGNAL_ENGINE_VERSION,
                        input_fingerprint=fingerprint,
                        payload=payload,
                        receipt=payload["receipt"],
                    )
                    if hasattr(self.repository, "update_asset_quality"):
                        self.repository.update_asset_quality(
                            asset_key=asset.key,
                            coverage_status="blocked",
                            coverage_pct=0.0,
                            last_data_date=None,
                        )
                    result["writtenRuns"] += 1
                    result["blocked"] += 1
                    continue
                start_date = cutoff - timedelta(days=365 * self.lookback_years)
                raw = self.fmp_client.get_historical_eod_bars(asset.provider_symbol, start_date=start_date.isoformat(), end_date=cutoff.isoformat())
                frame = normalize_eod_bars(raw, asset_key=asset.key, asset_class=asset.asset_class)
                frame = frame.loc[pd.to_datetime(frame["date"]) <= pd.Timestamp(cutoff).normalize()].reset_index(drop=True)
                if frame.empty:
                    raise ValueError("provider returned no EOD bars")
                self.repository.save_bars(asset, frame)
                expected_frequency = "D" if asset.calendar.lower() == "daily" or asset.asset_class.lower() == "crypto" else "B"
                validation_start = pd.Timestamp(cutoff).normalize() - pd.DateOffset(years=self.validation_years)
                expected = pd.date_range(validation_start, pd.Timestamp(cutoff).normalize(), freq=expected_frequency)
                coverage = coverage_pct(frame, expected)
                last_data_date = pd.Timestamp(frame["date"].iloc[-1]).date().isoformat()
                stale = is_stale(frame["date"].iloc[-1], as_of=cutoff, asset_class=asset.asset_class)
                coverage_status = "stale" if stale else "ready" if coverage >= 0.95 else "insufficient_data"
                if hasattr(self.repository, "update_asset_quality"):
                    self.repository.update_asset_quality(
                        asset_key=asset.key,
                        coverage_status=coverage_status,
                        coverage_pct=coverage,
                        last_data_date=last_data_date,
                    )
                context = self.context_provider(asset, cutoff) if callable(self.context_provider) else None
                payload = compute_market_state(
                    frame,
                    asset_key=asset.key,
                    asset_class=asset.asset_class,
                    context=context,
                    availability={
                        "rightsApproved": True,
                        "coveragePct": coverage,
                        "stale": stale,
                        "provider": "fmp",
                        "lastBarDate": last_data_date,
                        "warnings": [
                            *([] if coverage >= 0.95 else ["coverage_below_95_percent"]),
                            *( [] if len(frame) >= 750 else ["validation_history_below_750_bars"]),
                        ],
                        "qualificationReady": len(frame) >= 750,
                    },
                )
                fingerprint = str(frame["input_hash"].iloc[0])
                payload["receipt"]["inputFingerprint"] = fingerprint
                payload["receipt"]["provider"] = "fmp"
                payload["receipt"]["providerEndpoint"] = "stable/historical-price-eod/full"
                payload["receipt"]["fetchedAt"] = pd.Timestamp.now(tz="UTC").isoformat()
                self.repository.upsert_run(
                    workspace_id=None,
                    run_type="market_state_eod",
                    subject_type="asset",
                    subject_key=asset.key,
                    as_of_date=cutoff.isoformat(),
                    available_at=payload["availableAt"],
                    status=payload["status"],
                    engine_version=SIGNAL_ENGINE_VERSION,
                    input_fingerprint=fingerprint,
                    payload=payload,
                    receipt=payload["receipt"],
                )
                if self.persist_history and hasattr(self.repository, "recent_runs") and len(self.repository.recent_runs(subject_key=asset.key, limit=504)) < 504:
                    history = compute_market_state_history(
                        frame,
                        asset_key=asset.key,
                        asset_class=asset.asset_class,
                        context=context,
                        availability={
                            "rightsApproved": True,
                            "coveragePct": coverage,
                            "stale": False,
                            "provider": "fmp",
                            "lastBarDate": last_data_date,
                            "warnings": payload["dataQuality"].get("warnings", []),
                        },
                    )[-504:]
                    for historical in history:
                        historical_date = historical.get("asOfDate")
                        if not historical_date or historical_date == cutoff.isoformat():
                            continue
                        historical_fingerprint = hashlib.sha256(f"{fingerprint}:{historical_date}".encode("utf-8")).hexdigest()
                        self.repository.upsert_run(
                            workspace_id=None,
                            run_type="market_state_eod",
                            subject_type="asset",
                            subject_key=asset.key,
                            as_of_date=historical_date,
                            available_at=historical.get("availableAt"),
                            status=historical.get("status", "ready"),
                            engine_version=SIGNAL_ENGINE_VERSION,
                            input_fingerprint=historical_fingerprint,
                            payload=historical,
                            receipt=historical.get("receipt", {}),
                        )
                result["writtenRuns"] += 1
            except Exception as error:
                result["errors"] += 1
                previous = self.repository.previous_run(subject_key=asset.key, as_of_date=cutoff.isoformat())
                payload = dict(previous["payload"]) if previous else _blocked_payload(asset, reason="provider_error", as_of=cutoff)
                payload["status"] = "stale"
                payload["state"] = payload.get("state")
                payload.setdefault("dataQuality", {})["reason"] = "provider_error"
                payload["dataQuality"]["errorType"] = type(error).__name__
                fingerprint = hashlib.sha256(f"stale:{asset.key}:{cutoff.isoformat()}".encode("utf-8")).hexdigest()
                self.repository.upsert_run(
                    workspace_id=None,
                    run_type="market_state_eod",
                    subject_type="asset",
                    subject_key=asset.key,
                    as_of_date=cutoff.isoformat(),
                    available_at=payload.get("availableAt"),
                    status="stale",
                    engine_version=SIGNAL_ENGINE_VERSION,
                    input_fingerprint=fingerprint,
                    payload=payload,
                    receipt=payload.get("receipt", {}),
                )
                if hasattr(self.repository, "update_asset_quality"):
                    self.repository.update_asset_quality(
                        asset_key=asset.key,
                        coverage_status="stale",
                        coverage_pct=float(payload.get("dataQuality", {}).get("coveragePct") or 0),
                        last_data_date=payload.get("dataQuality", {}).get("lastBarDate"),
                    )
                result["writtenRuns"] += 1
        if self.alerts_enabled and hasattr(self.repository, "workspace_asset_keys"):
            for workspace_id in self.workspace_ids:
                for asset_key in self.repository.workspace_asset_keys(workspace_id):
                    recent = self.repository.recent_runs(subject_key=asset_key, limit=3)
                    candidate = confirmed_state_change(recent)
                    if not candidate["confirmed"]:
                        pass
                    else:
                        alert_id = f"signal-state:{workspace_id}:{asset_key}:{candidate['state']}:{candidate['asOfDate']}"
                        self.repository.upsert_alert(
                            workspace_id=workspace_id,
                            alert_id=alert_id,
                            payload={
                                "severity": "medium",
                                "title": f"{asset_key} market state changed",
                                "body": f"The {asset_key} state was confirmed as {candidate['state']} after two completed daily closes.",
                                "action": f"signal-intelligence:{asset_key}",
                                "source": "signal-intelligence",
                            },
                        )
                    if len(recent) >= 2:
                        current = recent[0].get("payload", {})
                        previous = recent[1].get("payload", {})
                        current_disagreements = {
                            (str(item.get("left")), str(item.get("right")), str(item.get("kind")))
                            for item in current.get("disagreements", [])
                            if isinstance(item, dict)
                        }
                        previous_disagreements = {
                            (str(item.get("left")), str(item.get("right")), str(item.get("kind")))
                            for item in previous.get("disagreements", [])
                            if isinstance(item, dict)
                        }
                        new_disagreements = current_disagreements - previous_disagreements
                        if current.get("status") == "ready" and new_disagreements:
                            confirmation_date = recent[0].get("asOfDate")
                            disagreement_id = f"signal-disagreement:{workspace_id}:{asset_key}:{confirmation_date}"
                            self.repository.upsert_alert(
                                workspace_id=workspace_id,
                                alert_id=disagreement_id,
                                payload={
                                    "severity": "low",
                                    "title": f"{asset_key} evidence disagreement",
                                    "body": f"New disagreement among available signal families for {asset_key}; open the market-state detail for the evidence.",
                                    "action": f"signal-intelligence:{asset_key}",
                                    "source": "signal-intelligence",
                                },
                            )
        if hasattr(self.repository, "finish_refresh_run"):
            self.repository.finish_refresh_run(refresh_key, status="completed", details=result)
        return result


def run_from_environment() -> dict[str, int | bool]:
    enabled = os.environ.get("BLS_SIGNAL_INTELLIGENCE_ENABLED", "false").strip().lower() == "true"
    if not enabled:
        return {"enabled": False, "writtenRuns": 0, "blocked": 0, "errors": 0}
    repository = NeonSignalRepository.from_env()
    from meta_alpha_allocator.data.fmp_client import FMPClient

    cache_root = Path(os.environ.get("META_ALLOCATOR_CACHE_ROOT", "cache"))
    client = FMPClient.from_env(cache_root=cache_root)
    if client is None:
        raise RuntimeError("FMP_API_KEY is required for Signal Intelligence worker")
    workspace_ids = tuple(value.strip() for value in os.environ.get("BLS_SIGNAL_BETA_WORKSPACE_IDS", "").split(",") if value.strip())
    alerts_enabled = os.environ.get("BLS_SIGNAL_ALERTS_ENABLED", "false").strip().lower() == "true"
    return SignalWorker(
        repository=repository,
        fmp_client=client,
        enabled=enabled,
        seed_context=True,
        workspace_ids=workspace_ids,
        alerts_enabled=alerts_enabled,
        persist_history=True,
    ).run_once()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run the BLS Signal Intelligence EOD worker")
    parser.add_argument("--mode", choices=("eod",), default="eod")
    parser.parse_args()
    print(json.dumps(run_from_environment(), sort_keys=True))
