from __future__ import annotations

from math import isfinite
from typing import Any, Iterable, Mapping


Citation = Mapping[str, Any]


def _base_record(rule: Mapping[str, Any], on_date: str) -> dict[str, Any]:
    return {
        "instrument_id": rule.get("instrument_id"),
        "date": on_date,
        "flow_notional": None,
        "flow_shares": None,
        "days_adv": None,
        "float_pct": None,
        "direction": None,
        "rule_id": rule.get("rule_id"),
        "worst_input_lag_days": None,
        "emitted": False,
        "suppression_reason": None,
        "output_mode": rule.get("output_mode"),
        "scope": rule.get("scope"),
        "material": True,
    }


def _suppress(record: dict[str, Any], reason: str) -> dict[str, Any]:
    record["suppression_reason"] = reason
    return record


def _is_cited_number(item: Any) -> bool:
    if not isinstance(item, Mapping):
        return False
    value = item.get("value")
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and isfinite(float(value))
        and bool(item.get("as_of"))
        and isinstance(item.get("lag_days"), int)
        and item.get("lag_days", -1) >= 0
        and bool(item.get("source_url"))
        and bool(item.get("source_clause"))
    )


def _cited_value(state: Mapping[str, Any], key: str) -> tuple[float | None, str | None]:
    item = state.get(key)
    if not _is_cited_number(item):
        return None, f"uncited_numeric_input:{key}"
    return float(item["value"]), None


def _worst_lag(state: Mapping[str, Any], keys: Iterable[str]) -> int:
    return max(int(state[key]["lag_days"]) for key in keys)


def project(rule: Mapping[str, Any], state: Mapping[str, Any], on_date: str) -> dict[str, Any]:
    """Project one documented compelled-flow rule, suppressing unverifiable output."""

    record = _base_record(rule, on_date)
    if rule.get("completeness") != "complete":
        return _suppress(record, "rule_incomplete")

    if (
        rule.get("scope") == "index_derivatives"
        and state.get("target_scope") == "single_equity"
        and not state.get("transmission_model")
    ):
        return _suppress(record, "missing_derivative_to_equity_transmission_model")

    formula_kind = rule.get("formula_kind")
    if formula_kind == "index_weight_delta":
        return _project_index_weight_delta(rule, state, record)
    if formula_kind != "leveraged_daily_rebalance":
        return _suppress(record, f"unsupported_formula_kind:{formula_kind}")

    input_keys = (
        "nav_assets_prev",
        "daily_return",
        "creation_redemption_notional",
        "adv_20d",
    )
    values: dict[str, float] = {}
    for key in input_keys:
        value, error = _cited_value(state, key)
        if error:
            return _suppress(record, error)
        assert value is not None
        values[key] = value

    worst_lag = _worst_lag(state, input_keys)
    record["worst_input_lag_days"] = worst_lag
    if worst_lag > int(rule.get("anticipation_lag_days", -1)):
        return _suppress(record, "input_lag_exceeds_anticipation_window")

    beta = float(rule["beta"])
    adjusted_assets = values["nav_assets_prev"] + values["creation_redemption_notional"]
    if adjusted_assets < 0:
        return _suppress(record, "negative_creation_adjusted_assets")
    if values["adv_20d"] <= 0:
        return _suppress(record, "nonpositive_adv_20d")

    flow_notional = beta * (beta - 1.0) * adjusted_assets * values["daily_return"]
    record.update(
        {
            "flow_notional": flow_notional,
            "days_adv": abs(flow_notional) / values["adv_20d"],
            "direction": "buy" if flow_notional > 0 else "sell" if flow_notional < 0 else "flat",
            "emitted": True,
        }
    )
    return record


def _project_index_weight_delta(
    rule: Mapping[str, Any], state: Mapping[str, Any], record: dict[str, Any]
) -> dict[str, Any]:
    input_keys = (
        "agent_pool_usd",
        "target_weight",
        "current_weight",
        "reference_price",
        "adv_20d",
        "free_float_shares",
    )
    values: dict[str, float] = {}
    for key in input_keys:
        value, error = _cited_value(state, key)
        if error:
            return _suppress(record, error)
        assert value is not None
        values[key] = value

    worst_lag = _worst_lag(state, input_keys)
    record["worst_input_lag_days"] = worst_lag
    if worst_lag > int(rule.get("anticipation_lag_days", -1)):
        return _suppress(record, "input_lag_exceeds_anticipation_window")
    if values["agent_pool_usd"] < 0:
        return _suppress(record, "negative_agent_pool_usd")
    if values["reference_price"] <= 0:
        return _suppress(record, "nonpositive_reference_price")
    if values["adv_20d"] <= 0:
        return _suppress(record, "nonpositive_adv_20d")
    if values["free_float_shares"] <= 0:
        return _suppress(record, "nonpositive_free_float_shares")

    flow_notional = values["agent_pool_usd"] * (
        values["target_weight"] - values["current_weight"]
    )
    flow_shares = flow_notional / values["reference_price"]
    record.update(
        {
            "flow_notional": flow_notional,
            "flow_shares": flow_shares,
            "days_adv": abs(flow_notional) / values["adv_20d"],
            "float_pct": abs(flow_shares) / values["free_float_shares"],
            "direction": "buy" if flow_notional > 0 else "sell" if flow_notional < 0 else "flat",
            "emitted": True,
        }
    )
    return record


def net(
    records: Iterable[Mapping[str, Any]],
    *,
    instrument_id: str,
    on_date: str,
    adv_20d: Citation,
    mandate_coverage: float,
    coverage_threshold: float,
) -> dict[str, Any]:
    """Net signed compelled flows only when every material contributor is usable."""

    result = {
        "instrument_id": instrument_id,
        "date": on_date,
        "net_compelled_flow": None,
        "absorption_deficit": None,
        "worst_input_lag_days": None,
        "emitted": False,
        "suppression_reason": None,
        "mandate_coverage": mandate_coverage,
        "coverage_threshold": coverage_threshold,
    }
    rows = list(records)
    for row in rows:
        if row.get("material", True) and not row.get("emitted"):
            result["suppression_reason"] = f"material_rule_suppressed:{row.get('rule_id')}"
            return result
    if mandate_coverage < coverage_threshold:
        result["suppression_reason"] = "mandate_coverage_below_threshold"
        return result
    if not _is_cited_number(adv_20d):
        result["suppression_reason"] = "uncited_numeric_input:adv_20d"
        return result
    adv = float(adv_20d["value"])
    if adv <= 0:
        result["suppression_reason"] = "nonpositive_adv_20d"
        return result

    included = [row for row in rows if row.get("emitted")]
    net_flow = sum(float(row["flow_notional"]) for row in included)
    lags = [int(row["worst_input_lag_days"]) for row in included if row.get("worst_input_lag_days") is not None]
    lags.append(int(adv_20d["lag_days"]))
    result.update(
        {
            "net_compelled_flow": net_flow,
            "absorption_deficit": net_flow / adv,
            "worst_input_lag_days": max(lags),
            "emitted": True,
        }
    )
    return result
