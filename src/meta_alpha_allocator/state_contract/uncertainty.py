from __future__ import annotations

from typing import Any


CONTRACT_VERSION = "state_contract_v1"
MODEL_VERSION = "bls_state_v1.0"


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _count_present(values: list[Any]) -> float:
    if not values:
        return 0.0
    present = 0
    for value in values:
        if value is None:
            continue
        present += 1
    return present / len(values)


def build_uncertainty(snapshot: dict[str, Any], measured_state: dict[str, Any]) -> dict[str, Any]:
    stale_values = []
    for key in ["risk", "portfolio", "screener", "forecast", "statement_intelligence"]:
        try:
            stale = snapshot.get(key, {}).get("stale_days")
            if stale is not None:
                stale_values.append(float(stale))
        except (TypeError, ValueError):
            continue
    max_stale = max(stale_values) if stale_values else 0.0
    warnings = snapshot.get("status", {}).get("warnings", []) or []
    coverage_component = _count_present(list(measured_state.values()))
    calibration_component = _clamp01(0.82 - 0.02 * max_stale - 0.06 * len(warnings))
    stability_component = _clamp01(0.78 - 0.015 * max_stale)
    holdings_coverage = snapshot.get("statement_intelligence", {}).get("holdings_coverage")
    if holdings_coverage is None:
        holdings_coverage = snapshot.get("statement_intelligence", {}).get("coverage")
    try:
        holdings_coverage = float(holdings_coverage)
    except (TypeError, ValueError):
        holdings_coverage = 0.5
    data_component = _clamp01(0.55 + 0.45 * holdings_coverage - 0.02 * len(warnings))
    authority = min(coverage_component, 4.0 / max(sum(1.0 / max(component, 1e-6) for component in [calibration_component, coverage_component, stability_component, data_component]), 1e-6))
    if authority >= 0.72:
        evidence_tier = "production"
    elif authority >= 0.48:
        evidence_tier = "beta"
    else:
        evidence_tier = "alpha"
    return {
        "calibration_component": calibration_component,
        "coverage_component": coverage_component,
        "stability_component": stability_component,
        "data_component": data_component,
        "evidence_tier": evidence_tier,
        "model_version": MODEL_VERSION,
        "contract_version": CONTRACT_VERSION,
        "authority_score": authority,
    }
