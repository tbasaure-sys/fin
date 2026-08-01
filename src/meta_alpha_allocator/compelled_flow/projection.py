from __future__ import annotations

from datetime import date
from math import isfinite
from typing import Any, Iterable, Mapping
from urllib.parse import urlparse


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


def _is_canonical_iso_date(value: Any) -> bool:
    if not isinstance(value, str) or not value or value != value.strip():
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def _is_https_url(value: Any) -> bool:
    if not isinstance(value, str) or not value or value != value.strip():
        return False
    parsed = urlparse(value)
    return parsed.scheme == "https" and bool(parsed.hostname)


def _is_documented_rule(rule: Mapping[str, Any], on_date: str) -> bool:
    document = rule.get("source_document")
    clauses = rule.get("source_clauses")
    if not isinstance(document, Mapping) or not isinstance(clauses, list) or not clauses:
        return False
    retrieved_at = document.get("retrieved_at")
    if (
        not isinstance(document.get("title"), str)
        or not document["title"].strip()
        or not _is_https_url(document.get("url"))
        or not _is_canonical_iso_date(retrieved_at)
        or date.fromisoformat(retrieved_at) > date.fromisoformat(on_date)
    ):
        return False
    return all(
        isinstance(clause, Mapping)
        and isinstance(clause.get("section"), str)
        and bool(clause["section"].strip())
        and isinstance(clause.get("extraction"), str)
        and bool(clause["extraction"].strip())
        for clause in clauses
    )


def _is_cited_number(item: Any, on_date: str) -> bool:
    if not isinstance(item, Mapping):
        return False
    value = item.get("value")
    as_of = item.get("as_of")
    lag_days = item.get("lag_days")
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and isfinite(float(value))
        and _is_canonical_iso_date(as_of)
        and date.fromisoformat(as_of) <= date.fromisoformat(on_date)
        and isinstance(lag_days, int)
        and not isinstance(lag_days, bool)
        and lag_days >= 0
        and _is_https_url(item.get("source_url"))
        and isinstance(item.get("source_clause"), str)
        and bool(item["source_clause"].strip())
    )


def _cited_value(
    state: Mapping[str, Any], key: str, on_date: str
) -> tuple[float | None, str | None]:
    item = state.get(key)
    if not _is_cited_number(item, on_date):
        return None, f"uncited_numeric_input:{key}"
    return float(item["value"]), None


def _worst_lag(state: Mapping[str, Any], keys: Iterable[str]) -> int:
    return max(int(state[key]["lag_days"]) for key in keys)


def project(rule: Mapping[str, Any], state: Mapping[str, Any], on_date: str) -> dict[str, Any]:
    """Project one documented compelled-flow rule, suppressing unverifiable output."""

    record = _base_record(rule, on_date)
    if not _is_canonical_iso_date(on_date):
        return _suppress(record, "invalid_projection_date")
    if rule.get("completeness") != "complete":
        return _suppress(record, "rule_incomplete")
    if not _is_documented_rule(rule, on_date):
        return _suppress(record, "rule_documentation_missing_or_invalid")

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
        value, error = _cited_value(state, key, on_date)
        if error:
            return _suppress(record, error)
        assert value is not None
        values[key] = value

    worst_lag = _worst_lag(state, input_keys)
    record["worst_input_lag_days"] = worst_lag
    if worst_lag > int(rule.get("anticipation_lag_days", -1)):
        return _suppress(record, "input_lag_exceeds_anticipation_window")

    raw_beta = rule.get("beta")
    if (
        isinstance(raw_beta, bool)
        or not isinstance(raw_beta, (int, float))
        or not isfinite(float(raw_beta))
        or float(raw_beta) in {0.0, 1.0}
    ):
        return _suppress(record, "invalid_leverage_beta")
    beta = float(raw_beta)
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
        value, error = _cited_value(state, key, record["date"])
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
    if not _is_canonical_iso_date(on_date):
        result["suppression_reason"] = "invalid_projection_date"
        return result
    if not rows:
        result["suppression_reason"] = "no_emitted_rules"
        return result
    if (
        isinstance(mandate_coverage, bool)
        or not isinstance(mandate_coverage, (int, float))
        or not isfinite(float(mandate_coverage))
        or not 0.0 <= float(mandate_coverage) <= 1.0
    ):
        result["suppression_reason"] = "invalid_mandate_coverage"
        return result
    if (
        isinstance(coverage_threshold, bool)
        or not isinstance(coverage_threshold, (int, float))
        or not isfinite(float(coverage_threshold))
        or not 0.0 <= float(coverage_threshold) <= 1.0
    ):
        result["suppression_reason"] = "invalid_coverage_threshold"
        return result
    for row in rows:
        if not isinstance(row, Mapping):
            result["suppression_reason"] = "malformed_rule_record"
            return result
        if row.get("material", True) and not row.get("emitted"):
            result["suppression_reason"] = f"material_rule_suppressed:{row.get('rule_id')}"
            return result
    if mandate_coverage < coverage_threshold:
        result["suppression_reason"] = "mandate_coverage_below_threshold"
        return result
    if not _is_cited_number(adv_20d, on_date):
        result["suppression_reason"] = "uncited_numeric_input:adv_20d"
        return result
    adv = float(adv_20d["value"])
    if adv <= 0:
        result["suppression_reason"] = "nonpositive_adv_20d"
        return result

    included = [row for row in rows if row.get("emitted")]
    if not included:
        result["suppression_reason"] = "no_emitted_rules"
        return result
    for row in included:
        flow = row.get("flow_notional")
        lag = row.get("worst_input_lag_days")
        if (
            isinstance(flow, bool)
            or not isinstance(flow, (int, float))
            or not isfinite(float(flow))
            or isinstance(lag, bool)
            or not isinstance(lag, int)
            or lag < 0
        ):
            result["suppression_reason"] = f"invalid_emitted_rule:{row.get('rule_id') or 'unknown'}"
            return result
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
