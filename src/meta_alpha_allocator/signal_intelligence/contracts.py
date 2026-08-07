from __future__ import annotations

import hashlib
from typing import Any


SIGNAL_SCHEMA_VERSION = "market-state.v1"
SIGNAL_ENGINE_VERSION = "signal-genome.v1"
SIGNAL_CONFIG_VERSION = "signal-genome-config.v1"
SIGNAL_CONFIG_FINGERPRINT = hashlib.sha256(
    b"ema20-ema50-atr14-ols20-dmi14-rsi14-roc21-macd12-26-9-rv21-126-atr-percentile-range20-breakout20-55-pivot-confirmed-2-failed-breakout-3-volume-z60-obv20-relative21-63"
).hexdigest()
TECHNICAL_BURN_IN_BARS = 504
QUALIFICATION_MIN_BARS = 750
CONTEXT_ASSETS = (
    "SPY",
    "QQQ",
    "IWM",
    "EFA",
    "EEM",
    "TLT",
    "HYG",
    "GLD",
    "USO",
    "UUP",
    "SPX",
    "NDX",
    "RUT",
    "VIX",
    "BTC/USD",
    "ETH/USD",
    "EUR/USD",
    "USD/JPY",
    "GBP/USD",
    "USD/CLP",
    "GOLD",
    "WTI",
)

VALID_STATUSES = {"ready", "insufficient_data", "stale", "blocked"}
VALID_STATES = {"trend_up", "trend_down", "range", "transition", "uncertain", None}


def validate_market_state_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate the public contract and return the original payload."""

    if not isinstance(payload, dict):
        raise ValueError("market state must be an object")
    if payload.get("schemaVersion") != SIGNAL_SCHEMA_VERSION:
        raise ValueError("unsupported market state schema")
    if payload.get("status") not in VALID_STATUSES:
        raise ValueError("invalid market state status")
    if payload.get("state") not in VALID_STATES:
        raise ValueError("invalid market state state")
    if not isinstance(payload.get("families"), list):
        raise ValueError("market state families must be a list")
    if not isinstance(payload.get("disagreements"), list):
        raise ValueError("market state disagreements must be a list")
    if "score" in payload or "masterScore" in payload:
        raise ValueError("market state cannot expose a master score")
    receipt = payload.get("receipt")
    if receipt is not None and not isinstance(receipt, dict):
        raise ValueError("market state receipt must be an object")
    for family in payload["families"]:
        if not isinstance(family, dict):
            raise ValueError("market state families must contain objects")
        if "score" in family or "masterScore" in family:
            raise ValueError("market state families cannot expose a score")
    return payload
