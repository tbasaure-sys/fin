from __future__ import annotations

from math import ceil, isfinite
from statistics import median
from typing import Any, Iterable, Mapping


def _blocked(reason: str, observation_count: int) -> dict[str, Any]:
    return {
        "status": "blocked",
        "blocking_reason": reason,
        "observation_count": observation_count,
        "median_absolute_error": None,
        "median_signed_bias": None,
        "p90_absolute_error": None,
    }


def _nearest_rank(values: list[float], probability: float) -> float:
    ordered = sorted(values)
    index = max(0, ceil(probability * len(ordered)) - 1)
    return ordered[index]


def validate_predictions(rows: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    """Compare projected changes with next-day holdings exposure for >=30 sessions."""

    observations = list(rows)
    if len(observations) < 30:
        return _blocked("fewer_than_30_business_sessions", len(observations))

    dates = [row.get("date") for row in observations]
    if len(set(dates)) != len(dates):
        return _blocked("duplicate_business_sessions", len(observations))
    if any(row.get("observed_next_day_exposure_change") is None for row in observations):
        return _blocked("missing_observed_holdings_exposure", len(observations))

    errors: list[float] = []
    for row in observations:
        predicted = row.get("predicted_exposure_change")
        observed = row.get("observed_next_day_exposure_change")
        if not isinstance(predicted, (int, float)) or not isfinite(float(predicted)) or predicted == 0:
            return _blocked("invalid_or_zero_predicted_exposure_change", len(observations))
        if not isinstance(observed, (int, float)) or not isfinite(float(observed)):
            return _blocked("invalid_observed_holdings_exposure", len(observations))
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
        "median_absolute_error": med_abs,
        "median_signed_bias": bias,
        "p90_absolute_error": p90,
        "error_definition": "(observed_next_day_exposure_change - predicted_exposure_change) / abs(predicted_exposure_change)",
        "pass_threshold": {"median_absolute_error_max": 0.10, "absolute_median_bias_max": 0.10},
        "fail_threshold": {"median_absolute_error_gt": 0.25},
    }
