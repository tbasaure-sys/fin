import numpy as np
import pandas as pd
import pytest

from meta_alpha_allocator.signal_intelligence.context import build_context_adapter
from meta_alpha_allocator.signal_intelligence.contracts import validate_market_state_payload
from meta_alpha_allocator.signal_intelligence.engine import compute_market_state, compute_market_state_history


def _bars(count=620, *, slope=0.004, with_volume=True):
    dates = pd.date_range("2024-01-01", periods=count, freq="D")
    close = 100 * np.exp(np.arange(count) * slope)
    frame = pd.DataFrame(
        {
            "date": dates,
            "open": close * 0.998,
            "high": close * 1.01,
            "low": close * 0.99,
            "close": close,
        }
    )
    if with_volume:
        frame["volume"] = 1000 + np.arange(count) * 10
    return frame


def test_market_state_exposes_family_evidence_without_a_master_score():
    payload = compute_market_state(_bars(), asset_key="SPY", asset_class="etf")

    assert payload["schemaVersion"] == "market-state.v1"
    assert payload["status"] == "ready"
    assert payload["state"] in {"trend_up", "transition", "uncertain"}
    assert {family["key"] for family in payload["families"]} >= {
        "trend",
        "momentum",
        "volatility",
        "structure",
        "participation",
        "relative",
    }
    assert "score" not in payload
    validate_market_state_payload(payload)


def test_future_bars_do_not_rewrite_a_published_prior_state():
    base = _bars(560)
    extended = _bars(620)

    base_history = compute_market_state_history(base, asset_key="SPY", asset_class="etf")
    extended_history = compute_market_state_history(extended, asset_key="SPY", asset_class="etf")
    extended_by_date = {row["asOfDate"]: row for row in extended_history}

    for row in base_history:
        later = extended_by_date[row["asOfDate"]]
        assert row["state"] == later["state"]
        assert row["families"] == later["families"]


def test_missing_volume_is_explicitly_unavailable():
    payload = compute_market_state(_bars(with_volume=False), asset_key="EUR/USD", asset_class="fx")

    participation = next(family for family in payload["families"] if family["key"] == "participation")
    assert participation["state"] == "unavailable"
    assert participation["available"] is False


def test_unapproved_rights_fail_closed_before_signal_generation():
    payload = compute_market_state(
        _bars(),
        asset_key="SPY",
        asset_class="etf",
        availability={"rightsApproved": False, "coveragePct": 1.0, "stale": False},
    )

    assert payload["status"] == "blocked"
    assert payload["state"] is None


def test_contract_rejects_master_score():
    payload = compute_market_state(_bars(), asset_key="SPY", asset_class="etf")
    payload["score"] = 77

    with pytest.raises(ValueError, match="master score"):
        validate_market_state_payload(payload)


def test_context_family_is_independent_and_fails_closed_when_sources_are_missing():
    payload = compute_market_state(
        _bars(),
        asset_key="SPY",
        asset_class="etf",
        context=build_context_adapter(
            mosaic={"state": "favorable", "asOfDate": "2025-09-11"},
            compelled_flow={"state": "adverse", "asOfDate": "2025-09-11"},
            as_of="2025-09-11",
        ),
    )
    context = next(family for family in payload["families"] if family["key"] == "context")
    assert context["state"] == "mixed"
    assert context["available"] is True
    unavailable = build_context_adapter(as_of="2025-09-11")
    assert unavailable["available"] is False
