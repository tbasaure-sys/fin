from __future__ import annotations

from copy import deepcopy
import json
import math

import pytest

from meta_alpha_allocator.research.institutional_valuation import (
    ARCHETYPE_BETA_PRIORS,
    _cost_of_capital,
    build_institutional_valuation,
)


MONETARY_ROW_FIELDS = {
    "revenue",
    "ebitda",
    "fcff",
    "free_cash_flow",
    "cash",
    "total_debt",
    "total_equity",
    "goodwill_and_intangibles",
    "preferred_stock",
    "minority_interest",
    "unfunded_pension_liability",
    "lease_liabilities_not_in_debt",
    "non_operating_investments",
    "net_income",
    "stock_based_compensation",
}
ESTIMATE_FIELDS = {
    "revenueLow",
    "revenueAvg",
    "revenueHigh",
    "ebitdaLow",
    "ebitdaAvg",
    "ebitdaHigh",
}


def _base_inputs() -> dict:
    annual_rows = [
        {
            "date": "2023-12-31",
            "revenue": 800.0,
            "ebitda": 200.0,
            "fcff": 120.0,
            "free_cash_flow": 100.0,
            "cash": 140.0,
            "total_debt": 110.0,
            "total_equity": 460.0,
            "goodwill_and_intangibles": 0.0,
            "preferred_stock": 0.0,
            "minority_interest": 0.0,
            "unfunded_pension_liability": 0.0,
            "lease_liabilities_not_in_debt": 0.0,
            "non_operating_investments": 0.0,
            "net_income": 72.0,
            "stock_based_compensation": 0.0,
            "diluted_shares": 10.0,
            "tax_rate": 0.21,
            "reported_currency": "USD",
        },
        {
            "date": "2024-12-31",
            "revenue": 900.0,
            "ebitda": 225.0,
            "fcff": 135.0,
            "free_cash_flow": 115.0,
            "cash": 145.0,
            "total_debt": 105.0,
            "total_equity": 500.0,
            "goodwill_and_intangibles": 0.0,
            "preferred_stock": 0.0,
            "minority_interest": 0.0,
            "unfunded_pension_liability": 0.0,
            "lease_liabilities_not_in_debt": 0.0,
            "non_operating_investments": 0.0,
            "net_income": 80.0,
            "stock_based_compensation": 0.0,
            "diluted_shares": 10.0,
            "tax_rate": 0.21,
            "reported_currency": "USD",
        },
        {
            "date": "2025-12-31",
            "revenue": 1_000.0,
            "ebitda": 250.0,
            "fcff": 150.0,
            "free_cash_flow": 130.0,
            "cash": 150.0,
            "total_debt": 100.0,
            "total_equity": 550.0,
            "goodwill_and_intangibles": 0.0,
            "preferred_stock": 0.0,
            "minority_interest": 0.0,
            "unfunded_pension_liability": 0.0,
            "lease_liabilities_not_in_debt": 0.0,
            "non_operating_investments": 0.0,
            "net_income": 90.0,
            "stock_based_compensation": 0.0,
            "diluted_shares": 10.0,
            "tax_rate": 0.21,
            "reported_currency": "USD",
        },
    ]
    ttm_row = {
        "date": "2026-06-30",
        "revenue": 1_100.0,
        "ebitda": 275.0,
        "fcff": 165.0,
        "free_cash_flow": 145.0,
        "cash": 150.0,
        "total_debt": 100.0,
        "total_equity": 600.0,
        "goodwill_and_intangibles": 0.0,
        "preferred_stock": 0.0,
        "minority_interest": 0.0,
        "unfunded_pension_liability": 0.0,
        "lease_liabilities_not_in_debt": 0.0,
        "non_operating_investments": 0.0,
        "net_income": 98.0,
        "stock_based_compensation": 0.0,
        "diluted_shares": 10.0,
        "tax_rate": 0.21,
        "reported_currency": "USD",
        "ttm_validation": {"status": "validated", "discrete_periods_confirmed": True},
    }
    estimates = []
    for year, revenue in enumerate((1_210.0, 1_320.0, 1_425.0, 1_525.0, 1_615.0), start=2027):
        estimates.append(
            {
                "date": f"{year}-12-31",
                "currency": "USD",
                "updatedAt": "2026-07-14",
                "numberAnalystsEstimatedRevenue": 5,
                "revenueLow": revenue * 0.95,
                "revenueAvg": revenue,
                "revenueHigh": revenue * 1.05,
                "ebitdaLow": revenue * 0.22,
                "ebitdaAvg": revenue * 0.25,
                "ebitdaHigh": revenue * 0.28,
            }
        )
    return {
        "annual_rows": annual_rows,
        "ttm_row": ttm_row,
        "profile": {
            "sector": "Technology",
            "industry": "Software - Infrastructure",
            "country": "US",
            "beta": 1.15,
            "price": 100.0,
            "marketCap": 1_000.0,
            "currency": "USD",
        },
        "quote": {"price": 100.0, "marketCap": 1_000.0, "as_of": "2026-07-14"},
        "prices": [{"date": "2026-07-14", "close": 100.0}],
        "analyst_estimates": estimates,
        "key_metrics_ttm": {"freeCashFlowToFirmTTM": 165.0},
        "ratios_ttm": {},
        "assumptions": {"base_revenue_growth": 0.08},
    }


def _build(inputs: dict) -> dict:
    return build_institutional_valuation(**inputs)


def _scale_company(inputs: dict, factor: float) -> dict:
    scaled = deepcopy(inputs)
    for row in [*scaled["annual_rows"], scaled["ttm_row"]]:
        for field in MONETARY_ROW_FIELDS:
            if row.get(field) is not None:
                row[field] *= factor
        row["diluted_shares"] *= factor
    for estimate in scaled["analyst_estimates"]:
        for field in ESTIMATE_FIELDS:
            estimate[field] *= factor
    scaled["key_metrics_ttm"]["freeCashFlowToFirmTTM"] *= factor
    scaled["profile"]["marketCap"] *= factor
    scaled["quote"]["marketCap"] *= factor
    return scaled


def _apply_split(inputs: dict, factor: float) -> dict:
    split = deepcopy(inputs)
    for row in [*split["annual_rows"], split["ttm_row"]]:
        row["diluted_shares"] *= factor
    split["profile"]["price"] /= factor
    split["quote"]["price"] /= factor
    for row in split["prices"]:
        row["close"] /= factor
    return split


def test_outlier_beta_is_winsorized_and_blended_with_capacity_cycle_prior() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"industry": "Semiconductors", "beta": 9.0})
    inputs["annual_rows"] = [
        {
            **deepcopy(inputs["annual_rows"][0]),
            "date": f"{year}-12-31",
            "revenue": 600.0 + index * 50,
            "fcff": (600.0 + index * 50) * margin,
            "free_cash_flow": (600.0 + index * 50) * (margin - 0.01),
        }
        for index, (year, margin) in enumerate(
            zip(range(2019, 2026), (-0.08, 0.04, 0.11, 0.18, 0.03, 0.14, 0.22))
        )
    ]

    valuation = _build(inputs)
    capital = valuation["cost_of_capital"]

    assert valuation["archetype"] == "capacity_cycle"
    assert capital["raw_beta"] == 9.0
    assert capital["winsorized_beta"] == 2.0
    assert capital["archetype_beta_prior"] == 1.25
    assert capital["adjusted_beta"] == pytest.approx(1.70)
    assert capital["beta"] == capital["adjusted_beta"]
    assert valuation["primary_method"] == "through_cycle_fcff_dcf"
    assert valuation["reliability"]["readiness_gates"]["independent_cross_check"]["passed"] is False
    assert valuation["status"] != "decision_ready"


def test_capacity_cycle_can_be_valued_in_a_current_trough_without_replacing_the_loss() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"industry": "Semiconductors", "beta": 1.4})
    margins = (-0.08, 0.04, 0.11, 0.18, 0.03, 0.14, 0.22)
    inputs["annual_rows"] = [
        {
            **deepcopy(inputs["annual_rows"][0]),
            "date": f"{year}-12-31",
            "revenue": 700.0 + index * 50.0,
            "fcff": (700.0 + index * 50.0) * margin,
            "free_cash_flow": (700.0 + index * 50.0) * (margin - 0.01),
        }
        for index, (year, margin) in enumerate(zip(range(2019, 2026), margins))
    ]
    inputs["ttm_row"].update({"fcff": -50.0, "free_cash_flow": -55.0})
    inputs["key_metrics_ttm"]["freeCashFlowToFirmTTM"] = -50.0

    valuation = _build(inputs)

    assert valuation["available"] is True
    assert valuation["primary_method"] == "through_cycle_fcff_dcf"
    assert valuation["cycle_normalization"]["coverage_complete"] is True
    assert valuation["cycle_normalization"]["observed_current_fcff"] == -50.0
    assert valuation["range"]["low"] < valuation["range"]["high"]
    assert valuation["reverse_dcf"]["available"] is False
    assert valuation["reverse_dcf"]["status"] == "unverified_price"


def test_capacity_cycle_abstains_when_current_loss_is_outside_the_observed_regime() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"industry": "Semiconductors", "beta": 1.4})
    margins = (-0.08, 0.04, 0.11, 0.18, 0.03, 0.14, 0.22)
    inputs["annual_rows"] = [
        {
            **deepcopy(inputs["annual_rows"][0]),
            "date": f"{year}-12-31",
            "revenue": 700.0 + index * 50.0,
            "fcff": (700.0 + index * 50.0) * margin,
            "free_cash_flow": (700.0 + index * 50.0) * (margin - 0.01),
        }
        for index, (year, margin) in enumerate(zip(range(2019, 2026), margins))
    ]
    inputs["ttm_row"].update({"fcff": -500.0, "free_cash_flow": -510.0})
    inputs["key_metrics_ttm"]["freeCashFlowToFirmTTM"] = -500.0

    valuation = _build(inputs)

    assert valuation["cycle_normalization"]["current_regime_supported"] is False
    assert valuation["status"] == "not_decision_ready"


def test_capacity_cycle_abstains_when_ttm_revenue_is_outside_the_observed_capacity_regime() -> None:
    inputs = _base_inputs()
    inputs["profile"]["industry"] = "Semiconductors"
    inputs["ttm_row"]["revenue"] = 2_000.0

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["cycle_revenue_normalization"]["current_level_supported"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert "ciclo histórico" in valuation["reason"].lower()


def test_quote_cannot_be_validated_against_a_catastrophically_different_prior_close() -> None:
    inputs = _base_inputs()
    inputs["quote"] = {"price": 100.0, "marketCap": 1_000.0, "as_of": "2026-07-14"}
    inputs["profile"].update({"price": 100.0, "marketCap": 1_000.0})
    inputs["prices"] = [{"date": "2026-07-13", "close": 1.0}]

    valuation = _build(inputs)

    check = next(item for item in valuation["price_validation"]["checks"] if item["key"] == "quote_vs_latest_close")
    assert check["required"] is True
    assert check["passed"] is False
    assert valuation["price_validation"]["status"] == "blocked"
    assert valuation["status"] != "decision_ready"


def test_stale_historical_close_is_not_used_as_current_price_corroboration() -> None:
    inputs = _base_inputs()
    inputs["profile"]["price"] = None
    inputs["prices"] = [{"date": "2026-06-01", "close": 100.0}]

    valuation = _build(inputs)

    check = next(item for item in valuation["price_validation"]["checks"] if item["key"] == "quote_vs_latest_close")
    assert check["required"] is False
    assert check["passed"] is None
    assert check["comparable"] is False
    assert valuation["price_validation"]["independent_price_observation"] is False
    assert valuation["price_validation"]["status"] == "single_source"
    assert valuation["status"] != "decision_ready"


def test_quote_and_profile_from_same_provider_do_not_replace_a_market_close() -> None:
    inputs = _base_inputs()
    inputs["prices"] = []

    valuation = _build(inputs)

    profile_check = next(item for item in valuation["price_validation"]["checks"] if item["key"] == "quote_vs_profile_price")
    assert profile_check["independent"] is False
    assert profile_check["required"] is False
    assert valuation["price_validation"]["independent_price_observation"] is False
    assert valuation["price_validation"]["status"] == "single_source"
    assert valuation["status"] != "decision_ready"


def test_quote_close_and_profile_from_one_vendor_are_only_provider_reconciled() -> None:
    valuation = _build(_base_inputs())

    price = valuation["price_validation"]
    assert price["status"] == "provider_reconciled"
    assert price["provider_corroborated"] is True
    assert price["independent_price_observation"] is False
    assert price["usable"] is False
    assert all(check.get("independent") is not True for check in price["checks"])
    assert valuation["reliability"]["readiness_gates"]["validated_price"]["passed"] is False
    assert valuation["status"] != "decision_ready"


def test_explicit_independent_close_can_validate_the_market_price() -> None:
    inputs = _base_inputs()
    inputs["prices"] = [
        {
            "date": "2026-07-14",
            "close": 100.0,
            "source_family": "independent_exchange_feed",
        }
    ]

    valuation = _build(inputs)

    price = valuation["price_validation"]
    assert price["status"] == "validated"
    assert price["usable"] is True
    assert price["independent_price_observation"] is True
    close_check = next(check for check in price["checks"] if check["key"] == "quote_vs_latest_close")
    assert close_check["independent"] is True
    assert close_check["source_family"] == "independent_exchange_feed"
    assert valuation["cost_of_capital"]["capital_structure_source"] == "apv_unlevered_archetype_operating_rate_no_implicit_tax_shield"


def test_price_provenance_alone_cannot_change_wacc_or_intrinsic_value() -> None:
    provider_inputs = _base_inputs()
    independent_inputs = _base_inputs()
    independent_inputs["prices"] = [
        {
            "date": "2026-07-14",
            "close": 100.0,
            "source_family": "independent_exchange_feed",
        }
    ]

    provider = _build(provider_inputs)
    independent = _build(independent_inputs)

    assert provider["price_validation"]["status"] == "provider_reconciled"
    assert independent["price_validation"]["status"] == "validated"
    assert independent["cost_of_capital"]["wacc"] == pytest.approx(provider["cost_of_capital"]["wacc"])
    assert independent["range"] == pytest.approx(provider["range"])


def test_unverified_market_price_cannot_move_intrinsic_value_through_wacc_weights() -> None:
    inputs = _base_inputs()
    shifted = _base_inputs()
    shifted["profile"].update({"price": 200.0, "marketCap": 2_000.0})
    shifted["quote"].update({"price": 200.0, "marketCap": 2_000.0})
    shifted["prices"] = [{"date": "2026-07-14", "close": 200.0}]

    base = _build(inputs)
    changed_price = _build(shifted)

    assert base["price_validation"]["status"] == "provider_reconciled"
    assert changed_price["price_validation"]["status"] == "provider_reconciled"
    assert base["cost_of_capital"]["capital_structure_source"] == "apv_unlevered_archetype_operating_rate_no_implicit_tax_shield"
    assert changed_price["cost_of_capital"]["capital_structure_source"] == "apv_unlevered_archetype_operating_rate_no_implicit_tax_shield"
    assert changed_price["cost_of_capital"]["wacc"] == pytest.approx(base["cost_of_capital"]["wacc"])
    assert changed_price["range"] == pytest.approx(base["range"])


def test_close_and_profile_from_one_vendor_cannot_be_called_independent() -> None:
    inputs = _base_inputs()
    inputs["quote"] = {}

    valuation = _build(inputs)

    price = valuation["price_validation"]
    assert price["status"] == "provider_reconciled"
    assert price["independent_price_observation"] is False
    assert price["usable"] is False


def test_six_day_old_close_cannot_corroborate_a_current_quote() -> None:
    inputs = _base_inputs()
    inputs["profile"]["price"] = None
    inputs["prices"] = [{"date": "2026-07-08", "close": 76.0}]

    valuation = _build(inputs)

    check = next(item for item in valuation["price_validation"]["checks"] if item["key"] == "quote_vs_latest_close")
    assert check["date_gap_days"] == 6
    assert check["comparable"] is False
    assert check["required"] is False
    assert valuation["price_validation"]["status"] == "single_source"


def test_future_market_date_is_rejected_instead_of_becoming_age_zero() -> None:
    inputs = _base_inputs()
    inputs["quote"]["as_of"] = "2099-01-01"
    inputs["prices"] = [{"date": "2099-01-01", "close": 100.0}]

    valuation = _build(inputs)

    assert valuation["price_validation"]["status"] == "blocked"
    assert valuation["price_validation"]["age_days"] is None
    assert valuation["reliability"]["readiness_gates"]["fresh_market_data"]["passed"] is False


def test_stable_estimate_field_names_feed_the_forecast_instead_of_being_discarded() -> None:
    inputs = _base_inputs()
    inputs["analyst_estimates"] = [
        {
            "date": row["date"],
            "estimatedRevenueLow": row["revenueLow"],
            "estimatedRevenueAvg": row["revenueAvg"],
            "estimatedRevenueHigh": row["revenueHigh"],
                "estimatedEbitdaLow": row["ebitdaLow"],
                "estimatedEbitdaAvg": row["ebitdaAvg"],
                "estimatedEbitdaHigh": row["ebitdaHigh"],
                "currency": row["currency"],
                "updatedAt": row["updatedAt"],
                "numberAnalystsEstimatedRevenue": row["numberAnalystsEstimatedRevenue"],
            }
        for row in inputs["analyst_estimates"]
    ]

    valuation = _build(inputs)

    base = next(item for item in valuation["scenarios"] if item["name"] == "base")
    assert len(base["forecast"]) == 5
    assert base["forecast"][0]["revenue"] > inputs["ttm_row"]["revenue"]


def test_duplicate_estimate_dates_count_as_one_annual_observation() -> None:
    inputs = _base_inputs()
    inputs["analyst_estimates"] = [
        deepcopy(inputs["analyst_estimates"][0]),
        deepcopy(inputs["analyst_estimates"][0]),
    ]

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["accepted_years"] == 1
    assert valuation["estimate_validation"]["duplicate_years"] == 1
    assert "future_estimate_support" in valuation["reliability"]["decision_ready_blockers"]


def test_quarterly_estimate_rows_do_not_masquerade_as_five_annual_years() -> None:
    inputs = _base_inputs()
    inputs["analyst_estimates"] = [
        {
            **deepcopy(inputs["analyst_estimates"][0]),
            "date": date,
            "period": period,
        }
        for date, period in (
            ("2026-09-30", "Q3"),
            ("2026-12-31", "Q4"),
            ("2027-03-31", "Q1"),
            ("2027-06-30", "Q2"),
            ("2027-09-30", "Q3"),
        )
    ]

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["accepted_years"] == 0
    assert valuation["estimate_validation"]["non_annual_rows"] == 5
    assert "future_estimate_support" in valuation["reliability"]["decision_ready_blockers"]


def test_estimates_with_decade_gaps_are_rejected_as_a_forecast_path() -> None:
    inputs = _base_inputs()
    inputs["analyst_estimates"] = [
        {**deepcopy(inputs["analyst_estimates"][0]), "date": "2036-12-31", "period": "FY"},
        {**deepcopy(inputs["analyst_estimates"][1]), "date": "2046-12-31", "period": "FY"},
        {**deepcopy(inputs["analyst_estimates"][2]), "date": "2056-12-31", "period": "FY"},
    ]

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["accepted_years"] == 0
    assert valuation["estimate_validation"]["cadence_rejections"] == 3


def test_estimates_in_another_currency_are_not_mixed_into_the_forecast() -> None:
    inputs = _base_inputs()
    inputs["analyst_estimates"] = [
        {**deepcopy(row), "currency": "JPY"}
        for row in inputs["analyst_estimates"]
    ]

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["accepted_years"] == 0
    assert valuation["estimate_validation"]["currency_rejections"] == 5
    assert "future_estimate_support" in valuation["reliability"]["decision_ready_blockers"]


def test_consensus_without_observation_date_and_analyst_count_is_not_used() -> None:
    inputs = _base_inputs()
    for row in inputs["analyst_estimates"]:
        row.pop("updatedAt")
        row.pop("numberAnalystsEstimatedRevenue")

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["provenance_complete"] is False
    assert valuation["estimate_validation"]["used_in_valuation"] is False
    assert valuation["status"] == "not_decision_ready"


def test_consensus_without_an_explicit_currency_is_not_used() -> None:
    inputs = _base_inputs()
    for row in inputs["analyst_estimates"]:
        row.pop("currency")

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["currency_complete"] is False
    assert valuation["estimate_validation"]["used_in_valuation"] is False
    assert valuation["status"] == "not_decision_ready"


def test_traced_current_provider_snapshot_can_support_consensus_provenance() -> None:
    inputs = _base_inputs()
    for row in inputs["analyst_estimates"]:
        row.pop("updatedAt")
        row.update(
            {
                "providerSnapshotAt": "2026-07-14T12:00:00+00:00",
                "sourceFamily": "FMP",
                "provenanceBasis": "current_provider_snapshot_retrieved_at",
            }
        )

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["provenance_complete"] is True
    assert set(valuation["estimate_validation"]["observation_bases"]) == {
        "current_provider_snapshot_retrieved_at"
    }
    assert valuation["estimate_validation"]["used_in_valuation"] is True


def test_duplicate_consensus_revision_uses_the_latest_observation_date() -> None:
    inputs = _base_inputs()
    revised = deepcopy(inputs["analyst_estimates"][0])
    revised.update(
        {
            "updatedAt": "2026-07-15",
            "revenueLow": revised["revenueLow"] * 1.05,
            "revenueAvg": revised["revenueAvg"] * 1.05,
            "revenueHigh": revised["revenueHigh"] * 1.05,
            "ebitdaLow": revised["ebitdaLow"] * 1.05,
            "ebitdaAvg": revised["ebitdaAvg"] * 1.05,
            "ebitdaHigh": revised["ebitdaHigh"] * 1.05,
        }
    )
    inputs["analyst_estimates"].insert(0, revised)

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["duplicate_years"] == 1
    assert valuation["estimate_validation"]["selected_observation_dates_by_year"]["2027"] == "2026-07-15"
    assert valuation["estimate_validation"]["conflicting_duplicate_years"] == 0


def test_conflicting_consensus_revisions_with_the_same_timestamp_are_rejected() -> None:
    inputs = _base_inputs()
    conflicting = deepcopy(inputs["analyst_estimates"][0])
    conflicting["revenueAvg"] *= 1.20
    conflicting["revenueHigh"] *= 1.20
    inputs["analyst_estimates"].insert(0, conflicting)

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["conflicting_duplicate_years"] == 1
    assert valuation["estimate_validation"]["used_in_valuation"] is False
    assert valuation["status"] == "not_decision_ready"


def test_consensus_average_outside_its_reported_range_is_rejected_not_clamped() -> None:
    inputs = _base_inputs()
    for row in inputs["analyst_estimates"]:
        row["revenueAvg"] *= 10.0

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["internal_consistency_rejections"] == 5
    assert valuation["estimate_validation"]["used_in_valuation"] is False
    assert valuation["status"] == "not_decision_ready"


def test_consensus_ebitda_average_outside_its_range_is_rejected_not_clamped() -> None:
    inputs = _base_inputs()
    for row in inputs["analyst_estimates"]:
        row["ebitdaAvg"] = row["revenueAvg"] * 10.0

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["ebitda_consistency_rejections"] == 5
    assert valuation["estimate_validation"]["used_in_valuation"] is False
    assert valuation["status"] == "not_decision_ready"


def test_same_timestamp_consensus_with_conflicting_analyst_counts_is_rejected() -> None:
    inputs = _base_inputs()
    conflicting = deepcopy(inputs["analyst_estimates"][0])
    conflicting["numberAnalystsEstimatedRevenue"] = 1
    inputs["analyst_estimates"].insert(0, conflicting)

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["conflicting_duplicate_years"] == 1
    assert valuation["estimate_validation"]["used_in_valuation"] is False


def test_estimate_ebitda_units_cannot_be_millions_when_revenue_is_in_units() -> None:
    inputs = _base_inputs()
    for row in inputs["analyst_estimates"]:
        row["ebitdaLow"] *= 1_000_000.0
        row["ebitdaAvg"] *= 1_000_000.0
        row["ebitdaHigh"] *= 1_000_000.0

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["ebitda_scale_rejections"] == 5
    assert valuation["estimate_validation"]["ebitda_coverage_years"] == 0
    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}


def test_impossible_forward_ebitda_margins_are_excluded_from_the_valuation() -> None:
    inputs = _base_inputs()
    for row in inputs["analyst_estimates"]:
        revenue = row["revenueAvg"]
        row.update(
            {
                "ebitdaLow": revenue * 1.6,
                "ebitdaAvg": revenue * 1.8,
                "ebitdaHigh": revenue * 2.0,
            }
        )

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["ebitda_scale_rejections"] == 5
    assert valuation["estimate_validation"]["used_in_valuation"] is False
    assert valuation["reliability"]["readiness_gates"]["future_estimate_support"]["passed"] is False
    assert valuation["status"] == "not_decision_ready"


def test_near_ninety_percent_forward_ebitda_margin_is_not_treated_as_ordinary_software() -> None:
    inputs = _base_inputs()
    for row in inputs["analyst_estimates"]:
        revenue = row["revenueAvg"]
        row.update(
            {
                "ebitdaLow": revenue * 0.88,
                "ebitdaAvg": revenue * 0.89,
                "ebitdaHigh": revenue * 0.90,
            }
        )

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["ebitda_scale_rejections"] == 5
    assert valuation["estimate_validation"]["used_in_valuation"] is False
    assert valuation["status"] == "not_decision_ready"


def test_large_forward_margin_jump_outside_company_history_is_not_capitalized() -> None:
    inputs = _base_inputs()
    for row, margin in zip(inputs["analyst_estimates"], (0.60, 0.65, 0.70, 0.70, 0.70)):
        revenue = row["revenueAvg"]
        row.update(
            {
                "ebitdaLow": revenue * (margin - 0.02),
                "ebitdaAvg": revenue * margin,
                "ebitdaHigh": revenue * (margin + 0.02),
            }
        )

    valuation = _build(inputs)

    margin_validation = valuation["estimate_validation"]["operating_margin_usage"]
    assert margin_validation["violations"] > 0
    assert valuation["estimate_validation"]["used_in_valuation"] is False
    assert valuation["status"] == "not_decision_ready"


def test_extreme_consensus_growth_is_not_silently_clipped_into_the_dcf() -> None:
    inputs = _base_inputs()
    previous_revenue = inputs["ttm_row"]["revenue"]
    for row in inputs["analyst_estimates"]:
        revenue = previous_revenue * 2.5
        row.update(
            {
                "revenueLow": revenue * 0.95,
                "revenueAvg": revenue,
                "revenueHigh": revenue * 1.05,
                "ebitdaLow": revenue * 0.20,
                "ebitdaAvg": revenue * 0.25,
                "ebitdaHigh": revenue * 0.30,
            }
        )
        previous_revenue = revenue
    valuation = _build(inputs)

    assert valuation["estimate_validation"]["growth_usage"]["material_clips"] > 0
    assert valuation["estimate_validation"]["used_in_valuation"] is False
    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert "incompatibles" in valuation["reason"].lower()
    assert valuation["status"] == "not_decision_ready"


def test_extreme_consensus_scenario_spread_cannot_invert_bear_and_bull_values() -> None:
    inputs = _base_inputs()
    for row in inputs["analyst_estimates"]:
        row["revenueLow"] = row["revenueAvg"] * 0.90
        row["revenueHigh"] = row["revenueAvg"] * 20.0

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["dispersion_rejections"] == 5
    assert valuation["estimate_validation"]["used_in_valuation"] is False
    assert valuation["status"] == "not_decision_ready"


def test_complete_capacity_cycle_can_ignore_corrupt_consensus_without_losing_its_historical_range() -> None:
    inputs = _base_inputs()
    inputs["profile"]["industry"] = "Semiconductors"
    margins = (-0.08, 0.04, 0.11, 0.18, 0.03, 0.14, 0.22)
    revenues = (700.0, 650.0, 820.0, 1_000.0, 620.0, 900.0, 1_100.0)
    inputs["annual_rows"] = [
        {
            **deepcopy(inputs["annual_rows"][0]),
            "date": f"{year}-12-31",
            "revenue": revenue,
            "fcff": revenue * margin,
            "free_cash_flow": revenue * (margin - 0.01),
        }
        for year, revenue, margin in zip(range(2019, 2026), revenues, margins)
    ]
    previous_revenue = inputs["ttm_row"]["revenue"]
    for row in inputs["analyst_estimates"]:
        revenue = previous_revenue * 2.5
        row.update(
            {
                "revenueLow": revenue * 0.95,
                "revenueAvg": revenue,
                "revenueHigh": revenue * 1.05,
                "ebitdaLow": revenue * 0.35,
                "ebitdaAvg": revenue * 0.40,
                "ebitdaHigh": revenue * 0.45,
            }
        )
        previous_revenue = revenue
    without_consensus = deepcopy(inputs)
    without_consensus["analyst_estimates"] = []

    valuation = _build(inputs)
    fallback = _build(without_consensus)

    assert valuation["primary_method"] == "through_cycle_fcff_dcf"
    assert valuation["cycle_normalization"]["coverage_complete"] is True
    assert valuation["cycle_revenue_normalization"]["coverage_complete"] is True
    assert valuation["estimate_validation"]["used_in_valuation"] is False
    assert valuation["range"] == pytest.approx(fallback["range"])
    assert valuation["status"] == "research_grade"


def test_mature_company_without_analyst_coverage_can_use_a_stable_five_year_history() -> None:
    inputs = _base_inputs()
    template = deepcopy(inputs["annual_rows"][0])
    older_rows = []
    for year, revenue in ((2021, 650.0), (2022, 720.0)):
        row = deepcopy(template)
        row.update(
            {
                "date": f"{year}-12-31",
                "revenue": revenue,
                "ebitda": revenue * 0.25,
                "fcff": revenue * 0.15,
                "free_cash_flow": revenue * 0.13,
                "net_income": revenue * 0.09,
                "total_equity": revenue * 0.58,
                "diluted_shares": 10.0,
            }
        )
        older_rows.append(row)
    inputs["annual_rows"] = [*older_rows, *inputs["annual_rows"]]
    inputs["analyst_estimates"] = []

    valuation = _build(inputs)

    gate = valuation["reliability"]["readiness_gates"]["future_estimate_support"]
    assert valuation["historical_trend_normalization"]["passed"] is True
    assert gate["basis"] == "historical_trend_normalization"
    assert gate["passed"] is True
    assert valuation["estimate_validation"]["used_in_valuation"] is False
    assert valuation["status"] == "research_grade"


def test_revenue_estimates_without_a_cash_driver_are_not_research_grade() -> None:
    inputs = _base_inputs()
    for row in inputs["analyst_estimates"]:
        for field in ("ebitdaLow", "ebitdaAvg", "ebitdaHigh"):
            row.pop(field, None)

    valuation = _build(inputs)

    assert valuation["estimate_validation"]["ebitda_coverage_years"] == 0
    assert valuation["reliability"]["readiness_gates"]["future_estimate_support"]["passed"] is False
    assert valuation["status"] == "not_decision_ready"


def test_estimate_date_must_still_be_future_as_of_today_not_only_after_ttm_date() -> None:
    inputs = _base_inputs()
    inputs["ttm_row"]["date"] = "2026-01-20"
    inputs["analyst_estimates"] = [
        {**deepcopy(inputs["analyst_estimates"][0]), "date": "2026-01-25", "period": "FY"},
        *inputs["analyst_estimates"][1:],
    ]

    valuation = _build(inputs)

    assert "2026-01-25" not in valuation["estimate_validation"]["accepted_dates"]


def test_explicit_zero_growth_is_not_replaced_with_positive_default_growth() -> None:
    inputs = _base_inputs()
    inputs["analyst_estimates"] = []
    inputs["assumptions"]["base_revenue_growth"] = 0.0
    template = deepcopy(inputs["annual_rows"][-1])
    inputs["annual_rows"] = [
        {
            **template,
            "date": f"{year}-12-31",
            "revenue": 1_000.0,
            "ebitda": 250.0,
            "fcff": 150.0,
            "free_cash_flow": 130.0,
            "net_income": 90.0,
            "total_equity": 550.0,
        }
        for year in range(2021, 2026)
    ]

    valuation = _build(inputs)

    base = next(item for item in valuation["scenarios"] if item["name"] == "base")
    assert 0.0 <= base["forecast"][0]["revenue_growth"] < 0.01


def test_uniformly_negative_forward_ebitda_blocks_a_positive_margin_fallback() -> None:
    inputs = _base_inputs()
    for row in inputs["analyst_estimates"]:
        row.update({"ebitdaLow": -80.0, "ebitdaAvg": -50.0, "ebitdaHigh": -20.0})

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert "pérdidas operativas" in valuation["reason"].lower()


def test_statement_and_listing_currency_mismatch_blocks_per_share_valuation() -> None:
    inputs = _base_inputs()
    inputs["ttm_row"]["reported_currency"] = "EUR"

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["status"] == "not_decision_ready"
    assert "FX" in valuation["reliability"]["limitations"][0]


def test_quote_currency_cannot_disagree_with_profile_currency() -> None:
    inputs = _base_inputs()
    inputs["quote"]["currency"] = "JPY"

    valuation = _build(inputs)

    assert valuation["price_validation"]["status"] == "blocked"
    assert any(check["key"] == "market_currency_identity" and check["passed"] is False for check in valuation["price_validation"]["checks"])


def test_explicit_security_symbols_must_identify_the_same_listing() -> None:
    inputs = _base_inputs()
    inputs["profile"]["symbol"] = "AAA"
    inputs["quote"]["symbol"] = "BBB"
    inputs["prices"] = [{"symbol": "CCC", "date": "2026-07-14", "close": 100.0}]

    valuation = _build(inputs)

    assert valuation["price_validation"]["status"] == "blocked"
    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}


def test_historical_statements_cannot_mix_currencies_behind_a_usd_ttm_row() -> None:
    inputs = _base_inputs()
    for row, currency in zip(inputs["annual_rows"], ("EUR", "USD", "EUR")):
        row["reported_currency"] = currency

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert "historial" in valuation["reason"].lower()
    assert "moneda" in valuation["reason"].lower()


def test_same_date_annual_duplicate_with_another_currency_is_a_conflict() -> None:
    inputs = _base_inputs()
    duplicate = deepcopy(inputs["annual_rows"][-1])
    duplicate["reported_currency"] = "EUR"
    inputs["annual_rows"].append(duplicate)

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["annual_history_validation"]["conflicting_duplicate_years"] == 1
    assert valuation["range"] == {"low": None, "central": None, "high": None}


def test_requested_ticker_is_part_of_the_security_identity_check() -> None:
    inputs = _base_inputs()
    inputs["expected_ticker"] = "MU"
    inputs["profile"]["symbol"] = "NVDA"
    inputs["quote"]["symbol"] = "NVDA"

    valuation = _build(inputs)

    assert valuation["price_validation"]["status"] == "blocked"
    assert any(check["key"] == "security_identity" and check["passed"] is False for check in valuation["price_validation"]["checks"])


def test_requested_ticker_must_be_corroborated_by_a_provider_symbol() -> None:
    inputs = _base_inputs()
    inputs["expected_ticker"] = "MU"

    valuation = _build(inputs)

    assert valuation["price_validation"]["status"] == "blocked"
    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    identity = next(check for check in valuation["price_validation"]["checks"] if check["key"] == "security_identity")
    assert identity["passed"] is False
    assert identity["observed_symbols"] == []


def test_mixed_statement_family_currencies_block_before_valuation() -> None:
    inputs = _base_inputs()
    inputs["ttm_row"].update(
        {
            "reported_currency": None,
            "reported_currencies": ["EUR", "GBP", "USD"],
            "currency_mismatch": True,
        }
    )

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["status"] == "not_decision_ready"
    assert "moneda" in valuation["reason"].lower()


def test_cfo_minus_capex_is_not_silently_relabelled_as_fcfe() -> None:
    inputs = _base_inputs()
    inputs["key_metrics_ttm"] = {}
    inputs["ttm_row"]["fcff"] = None
    for row in inputs["annual_rows"]:
        row["fcff"] = None

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["primary_method"] is None
    assert valuation["status"] == "not_decision_ready"


def test_provider_ttm_mismatch_blocks_valuation_instead_of_using_conflicted_flows() -> None:
    inputs = _base_inputs()
    inputs["ttm_row"]["ttm_validation"] = {
        "status": "provider_ttm_mismatch",
        "provider_ttm_reconciled": False,
    }

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["status"] == "not_decision_ready"
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert "no concuerdan" in valuation["reason"]


@pytest.mark.parametrize("status", ["missing", "date_sequence_only"])
def test_unreconciled_ttm_cannot_publish_a_research_grade_range(status: str) -> None:
    inputs = _base_inputs()
    inputs["ttm_row"]["ttm_validation"] = {
        "status": status,
        "provider_ttm_reconciled": False,
    }

    valuation = _build(inputs)

    assert valuation["reliability"]["readiness_gates"]["ttm_structure"]["passed"] is False
    assert valuation["status"] == "not_decision_ready"


def test_adr_ratio_is_applied_to_the_listed_security_denominator() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"isAdr": True, "adrRatio": 2.0, "marketCap": 500.0})
    inputs["quote"]["marketCap"] = 500.0

    valuation = _build(inputs)

    conversion = valuation["price_validation"]["adr_conversion"]
    assert conversion["convention"] == "ordinary_shares_divided_by_adr_ratio"
    assert conversion["reported_diluted_shares"] == 10.0
    assert conversion["listing_shares"] == 5.0
    assert valuation["price_validation"]["valuation_shares"] == 5.0
    base = next(item for item in valuation["scenarios"] if item["name"] == "base")
    assert base["intrinsic_value_per_share"] == pytest.approx(base["equity_value"] / 5.0)


def test_adr_valuation_blocks_when_ratio_cannot_reconcile_to_market_cap() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"isAdr": True, "adrRatio": 2.0, "marketCap": 750.0})
    inputs["quote"]["marketCap"] = 750.0

    valuation = _build(inputs)

    assert valuation["price_validation"]["status"] == "blocked"
    assert valuation["price_validation"]["valuation_shares"] is None
    assert valuation["available"] is False


def test_adr_ratio_cannot_be_ignored_without_an_explicit_listing_share_basis() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"isAdr": True, "adrRatio": 2.0})

    valuation = _build(inputs)

    assert valuation["price_validation"]["status"] == "blocked"
    assert valuation["price_validation"]["valuation_shares"] is None


def test_explicit_adr_listing_share_basis_can_use_reported_listing_units() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"isAdr": True, "adrRatio": 2.0, "shareCountBasis": "ADR"})

    valuation = _build(inputs)

    assert valuation["price_validation"]["adr_conversion"]["convention"] == "reported_shares_already_listing_units"
    assert valuation["price_validation"]["status"] == "provider_reconciled"


def test_adr_without_issuer_country_cannot_publish_a_valuation_range() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"isAdr": True, "adrRatio": 2.0, "marketCap": 500.0})
    inputs["profile"].pop("country")
    inputs["quote"]["marketCap"] = 500.0

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert "país" in valuation["reason"].lower()


def test_financial_statement_scale_must_reconcile_to_market_cap_and_shares() -> None:
    inputs = _base_inputs()
    for row in [*inputs["annual_rows"], inputs["ttm_row"]]:
        for field in MONETARY_ROW_FIELDS:
            if row.get(field) is not None:
                row[field] *= 1e-6
    for estimate in inputs["analyst_estimates"]:
        for field in ESTIMATE_FIELDS:
            estimate[field] *= 1e-6
    inputs["key_metrics_ttm"]["freeCashFlowToFirmTTM"] *= 1e-6

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["status"] == "not_decision_ready"
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert valuation["fundamental_scale_validation"]["passed"] is False
    assert "escala" in valuation["reason"].lower()


def test_common_thousands_vs_units_mismatch_is_not_treated_as_extreme_valuation() -> None:
    inputs = _base_inputs()
    for row in [*inputs["annual_rows"], inputs["ttm_row"]]:
        for field in MONETARY_ROW_FIELDS:
            if row.get(field) is not None:
                row[field] *= 1e-3
    for estimate in inputs["analyst_estimates"]:
        for field in ESTIMATE_FIELDS:
            estimate[field] *= 1e-3
    inputs["key_metrics_ttm"]["freeCashFlowToFirmTTM"] *= 1e-3

    valuation = _build(inputs)

    assert valuation["available"] is False
    failed_keys = {
        check["key"]
        for check in valuation["fundamental_scale_validation"]["checks"]
        if check["passed"] is False
    }
    assert "market_cap_to_revenue_scale" in failed_keys
    assert "market_cap_to_positive_fcff_scale" in failed_keys


def test_hundredfold_statement_scale_error_cannot_publish_a_range() -> None:
    inputs = _base_inputs()
    for row in [*inputs["annual_rows"], inputs["ttm_row"]]:
        for field in MONETARY_ROW_FIELDS:
            if row.get(field) is not None:
                row[field] *= 100.0
    for estimate in inputs["analyst_estimates"]:
        for field in ESTIMATE_FIELDS:
            estimate[field] *= 100.0
    inputs["key_metrics_ttm"]["freeCashFlowToFirmTTM"] *= 100.0

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["fundamental_scale_validation"]["passed"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}


def test_tenfold_asset_light_statement_scale_error_cannot_look_like_deep_value() -> None:
    inputs = _base_inputs()
    for row in [*inputs["annual_rows"], inputs["ttm_row"]]:
        for field in MONETARY_ROW_FIELDS:
            if row.get(field) is not None:
                row[field] *= 10.0
    for estimate in inputs["analyst_estimates"]:
        for field in ESTIMATE_FIELDS:
            estimate[field] *= 10.0
    inputs["key_metrics_ttm"]["freeCashFlowToFirmTTM"] *= 10.0

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["fundamental_scale_validation"]["passed"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}


def test_ttm_and_latest_annual_revenue_scale_must_be_continuous() -> None:
    inputs = _base_inputs()
    inputs["ttm_row"]["revenue"] *= 1e6

    valuation = _build(inputs)

    assert valuation["available"] is False
    check = next(
        item
        for item in valuation["fundamental_scale_validation"]["checks"]
        if item["key"] == "ttm_revenue_vs_latest_annual"
    )
    assert check["passed"] is False


@pytest.mark.parametrize("field", ["cash", "total_debt", "total_equity"])
def test_balance_sheet_fields_must_keep_the_same_scale_as_latest_annual(field: str) -> None:
    inputs = _base_inputs()
    inputs["ttm_row"][field] *= 1_000.0

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert any(
        check["key"] == f"ttm_{field}_vs_latest_annual" and check["passed"] is False
        for check in valuation["fundamental_scale_validation"]["checks"]
    )


def test_calculated_fcff_must_reconcile_to_provider_ttm_metric() -> None:
    inputs = _base_inputs()
    inputs["key_metrics_ttm"]["freeCashFlowToFirmTTM"] = 1_650_000.0

    valuation = _build(inputs)

    assert valuation["available"] is False
    check = next(
        item
        for item in valuation["fundamental_scale_validation"]["checks"]
        if item["key"] == "calculated_fcff_vs_provider_ttm"
    )
    assert check["passed"] is False


@pytest.mark.parametrize("ebitda", [2.75, 27.5, 2_750.0])
def test_ttm_ebitda_must_reconcile_with_history_and_fcff(ebitda: float) -> None:
    inputs = _base_inputs()
    inputs["ttm_row"]["ebitda"] = ebitda

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["fundamental_scale_validation"]["passed"] is False


def test_extreme_denominator_cannot_emit_infinity_or_invalid_json() -> None:
    inputs = _base_inputs()
    inputs["ttm_row"]["free_cash_flow"] = 1e-308

    valuation = _build(inputs)

    assert math.isfinite(valuation["multiples"]["price_to_fcf"])
    json.dumps(valuation, allow_nan=False)


@pytest.mark.parametrize(
    ("location", "field", "value"),
    [
        ("ttm", "revenue", 1e-308),
        ("ttm", "fcff", 1e-308),
        ("ttm", "date", float("nan")),
        ("ttm", "date", float("inf")),
        ("quote", "marketCap", 1e-308),
    ],
)
def test_all_blocked_payloads_remain_strict_json(location: str, field: str, value: float) -> None:
    inputs = _base_inputs()
    target = inputs["ttm_row"] if location == "ttm" else inputs["quote"]
    target[field] = value

    valuation = _build(inputs)

    json.dumps(valuation, allow_nan=False)


def test_unbounded_but_finite_inputs_are_rejected_before_arithmetic_overflow() -> None:
    inputs = _base_inputs()
    for row in [*inputs["annual_rows"], inputs["ttm_row"]]:
        for field in MONETARY_ROW_FIELDS:
            if row.get(field) is not None:
                row[field] = 9e307
        row["diluted_shares"] = 9e307
    inputs["profile"]["marketCap"] = 9e307
    inputs["quote"]["marketCap"] = 9e307
    inputs["key_metrics_ttm"]["freeCashFlowToFirmTTM"] = 9e307

    valuation = _build(inputs)

    assert valuation["available"] is False
    json.dumps(valuation, allow_nan=False)


@pytest.mark.parametrize(("field", "value"), [("cash", -150.0), ("total_debt", -100.0)])
def test_negative_balance_magnitudes_are_blocked_instead_of_coerced_to_zero(field: str, value: float) -> None:
    inputs = _base_inputs()
    inputs["ttm_row"][field] = value

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["status"] == "not_decision_ready"
    assert field in valuation["reliability"]["limitations"][0]


def test_valuation_is_invariant_to_consistent_unit_scale() -> None:
    inputs = _base_inputs()

    base = _build(inputs)
    scaled = _build(_scale_company(inputs, 1_000_000.0))

    assert scaled["range"]["central"] == pytest.approx(base["range"]["central"], rel=1e-10)
    assert scaled["range"]["low"] == pytest.approx(base["range"]["low"], rel=1e-10)
    assert scaled["range"]["high"] == pytest.approx(base["range"]["high"], rel=1e-10)
    assert scaled["cost_of_capital"]["wacc"] == pytest.approx(base["cost_of_capital"]["wacc"])


def test_stock_split_changes_only_per_share_outputs() -> None:
    inputs = _base_inputs()

    before = _build(inputs)
    after = _build(_apply_split(inputs, 10.0))

    assert after["range"]["central"] == pytest.approx(before["range"]["central"] / 10.0, rel=1e-10)
    assert after["range"]["low"] == pytest.approx(before["range"]["low"] / 10.0, rel=1e-10)
    assert after["range"]["high"] == pytest.approx(before["range"]["high"] / 10.0, rel=1e-10)
    assert after["multiples"]["market_cap"] == before["multiples"]["market_cap"]
    assert after["cost_of_capital"]["wacc"] == pytest.approx(before["cost_of_capital"]["wacc"])


def test_equity_bridge_deducts_preferred_minority_and_reconciled_finance_leases() -> None:
    base_inputs = _base_inputs()
    adjusted_inputs = _base_inputs()
    adjusted_inputs["ttm_row"].update(
        {
            "preferred_stock": 40.0,
            "minority_interest": 30.0,
            "unfunded_pension_liability": 0.0,
            "lease_liabilities_not_in_debt": 10.0,
        }
    )

    base = _build(base_inputs)
    adjusted = _build(adjusted_inputs)

    assert adjusted["equity_bridge"]["obligations_deducted"] == 180.0
    reduction = base["range"]["central"] - adjusted["range"]["central"]
    assert reduction == pytest.approx(8.0)
    assert adjusted["cost_of_capital"]["tax_shield_present_value"] == 0.0
    assert adjusted["cost_of_capital"]["debt_like_capital"] == 110.0


def test_unfunded_pension_claim_blocks_value_without_deficit_funding_normalization() -> None:
    inputs = _base_inputs()
    inputs["ttm_row"]["unfunded_pension_liability"] = 20.0

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert "pensión" in valuation["reason"].lower()


def test_equity_bridge_adds_non_operating_investments_once() -> None:
    base_inputs = _base_inputs()
    adjusted_inputs = _base_inputs()
    adjusted_inputs["ttm_row"]["non_operating_investments"] = 50.0

    base = _build(base_inputs)
    adjusted = _build(adjusted_inputs)

    assert adjusted["equity_bridge"]["assets_added"] == 178.0
    increase = adjusted["range"]["central"] - base["range"]["central"]
    assert 0 < increase < 5.0
    assert adjusted["equity_bridge"]["estimated_after_tax_non_operating_income"] > 0


def test_historical_share_dilution_is_disclosed_but_not_applied_without_a_financing_schedule() -> None:
    base_inputs = _base_inputs()
    diluted_inputs = _base_inputs()
    for row, shares in zip(diluted_inputs["annual_rows"], (8.0, 9.0, 10.0)):
        row["diluted_shares"] = shares

    base = _build(base_inputs)
    diluted = _build(diluted_inputs)

    assert diluted["share_dilution"]["observed_annual_dilution"] > 0
    assert diluted["share_dilution"]["projected_listing_shares_year_5"] > 10.0
    assert diluted["share_dilution"]["applied_to_valuation"] is False
    assert diluted["share_dilution"]["valuation_denominator_shares"] == 10.0
    assert diluted["range"]["central"] == pytest.approx(base["range"]["central"])


def test_stock_compensation_is_subtracted_when_future_dilution_is_not_modeled() -> None:
    base_inputs = _base_inputs()
    sbc_inputs = _base_inputs()
    for row in sbc_inputs["annual_rows"]:
        row["stock_based_compensation"] = 20.0
    sbc_inputs["ttm_row"]["stock_based_compensation"] = 20.0

    base = _build(base_inputs)
    adjusted = _build(sbc_inputs)

    assert adjusted["stock_compensation_treatment"]["complete"] is True
    assert adjusted["stock_compensation_treatment"]["fcff_after_sbc"] == 145.0
    assert adjusted["cash_flow_basis"] == "operating_FCFF_after_SBC"
    assert adjusted["range"]["central"] < base["range"]["central"]


def test_missing_stock_compensation_history_cannot_publish_an_unadjusted_fcff_range() -> None:
    inputs = _base_inputs()
    inputs["annual_rows"][0].pop("stock_based_compensation")

    valuation = _build(inputs)

    assert valuation["stock_compensation_treatment"]["complete"] is False
    assert valuation["reliability"]["readiness_gates"]["stock_compensation_treatment"]["passed"] is False
    assert valuation["status"] == "not_decision_ready"


def test_extreme_historical_dilution_is_not_silently_capped_and_published() -> None:
    inputs = _base_inputs()
    for row, shares in zip(inputs["annual_rows"], (5.0, 8.0, 12.0)):
        row["diluted_shares"] = shares
    inputs["ttm_row"]["diluted_shares"] = 12.5
    inputs["profile"]["marketCap"] = 1_250.0
    inputs["quote"]["marketCap"] = 1_250.0

    valuation = _build(inputs)

    assert valuation["share_dilution"]["historical_cagr"] > 0.15
    assert valuation["share_dilution"]["exceeds_supported_dilution"] is True
    assert valuation["share_dilution"]["passed"] is False
    assert valuation["reliability"]["readiness_gates"]["share_dilution_support"]["passed"] is False
    assert valuation["status"] == "not_decision_ready"


def test_missing_equity_bridge_adjustments_cannot_publish_a_research_range() -> None:
    inputs = _base_inputs()
    for field in (
        "preferred_stock",
        "minority_interest",
        "unfunded_pension_liability",
        "lease_liabilities_not_in_debt",
        "non_operating_investments",
    ):
        inputs["ttm_row"].pop(field)

    valuation = _build(inputs)

    assert valuation["equity_bridge"]["complete"] is False
    assert valuation["reliability"]["readiness_gates"]["equity_bridge_completeness"]["passed"] is False
    assert valuation["status"] == "not_decision_ready"


def test_material_price_mismatch_blocks_decision_readiness() -> None:
    inputs = _base_inputs()
    inputs["quote"] = {"price": 150.0, "marketCap": 1_500.0, "as_of": "2026-07-14"}
    inputs["profile"].update({"price": 50.0, "marketCap": 500.0})
    inputs["prices"] = [{"date": "2026-07-14", "close": 50.0}]

    valuation = _build(inputs)

    assert valuation["price_validation"]["status"] == "blocked"
    assert valuation["status"] == "not_decision_ready"
    assert valuation["reliability"]["usable"] is False
    assert valuation["reliability"]["readiness_gates"]["validated_price"]["passed"] is False


def test_thirty_percent_share_denominator_mismatch_cannot_be_validated_by_another_check() -> None:
    inputs = _base_inputs()
    inputs["profile"]["marketCap"] = 1_300.0
    inputs["quote"]["marketCap"] = 1_300.0

    valuation = _build(inputs)

    denominator_check = next(
        check for check in valuation["price_validation"]["checks"]
        if check["key"] == "price_times_shares_vs_market_cap"
    )
    assert denominator_check["passed"] is False
    assert valuation["price_validation"]["status"] != "validated"
    assert valuation["status"] != "decision_ready"


def test_ten_percent_share_denominator_mismatch_is_not_called_reconciled() -> None:
    inputs = _base_inputs()
    inputs["profile"]["marketCap"] = 1_100.0
    inputs["quote"]["marketCap"] = 1_100.0

    valuation = _build(inputs)

    denominator_check = next(
        check for check in valuation["price_validation"]["checks"]
        if check["key"] == "price_times_shares_vs_market_cap" and check["source"] == "quote_market_cap"
    )
    assert denominator_check["passed"] is False
    assert valuation["price_validation"]["status"] == "inconsistent"


def test_stale_market_and_financial_dates_are_hard_readiness_failures() -> None:
    inputs = _base_inputs()
    inputs["quote"]["as_of"] = "2020-07-14"
    inputs["prices"] = [{"date": "2020-07-14", "close": 100.0}]
    inputs["ttm_row"]["date"] = "2020-06-30"

    valuation = _build(inputs)

    assert valuation["price_validation"]["status"] == "stale"
    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert valuation["financial_data_validation"]["passed"] is False
    assert valuation["status"] == "not_decision_ready"


@pytest.mark.parametrize("date", ["2099-01-01", "not-a-date", "1926-06-30"])
def test_invalid_or_ancient_financial_date_never_publishes_a_range(date: str) -> None:
    inputs = _base_inputs()
    inputs["ttm_row"]["date"] = date

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["status"] == "not_decision_ready"
    assert valuation["range"] == {"low": None, "central": None, "high": None}


def test_future_annual_statements_cannot_support_a_current_valuation() -> None:
    inputs = _base_inputs()
    for index, row in enumerate(inputs["annual_rows"], start=2027):
        row["date"] = f"{index}-12-31"

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert "fecha" in valuation["reason"].lower()


def test_stale_annual_cycle_cannot_support_a_current_ttm_valuation() -> None:
    inputs = _base_inputs()
    inputs["profile"]["industry"] = "Semiconductors"
    inputs["annual_rows"] = [
        {
            **deepcopy(inputs["annual_rows"][0]),
            "date": f"{year}-12-31",
            "revenue": 800.0,
            "fcff": 800.0 * margin,
            "free_cash_flow": 800.0 * (margin - 0.01),
        }
        for year, margin in zip(range(1990, 1997), (-0.08, 0.04, 0.11, 0.18, 0.03, 0.14, 0.22))
    ]

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["annual_history_validation"]["latest_to_current_days"] > 550


def test_older_duplicate_annual_row_cannot_overwrite_the_latest_fiscal_year() -> None:
    inputs = _base_inputs()
    baseline = _build(inputs)
    duplicate = {
        **deepcopy(inputs["annual_rows"][0]),
        "date": "2023-01-01",
        "revenue": 1_000.0,
        "fcff": 500.0,
        "free_cash_flow": 490.0,
    }
    inputs["annual_rows"].append(duplicate)

    valuation = _build(inputs)

    assert valuation["annual_history_validation"]["duplicate_years"] == 1
    assert valuation["range"] == pytest.approx(baseline["range"])


def test_duplicate_years_do_not_create_a_complete_capacity_cycle() -> None:
    inputs = _base_inputs()
    inputs["profile"]["industry"] = "Semiconductors"
    inputs["annual_rows"] = [
        {
            **deepcopy(inputs["annual_rows"][0]),
            "date": "2019-12-31" if index < 4 else "2025-12-31",
            "revenue": 800.0,
            "fcff": 800.0 * margin,
        }
        for index, margin in enumerate((-0.1, -0.05, 0.01, 0.04, 0.08, 0.12, 0.16))
    ]

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert "duplicada" in valuation["reason"].lower()


def test_large_gaps_do_not_create_a_complete_capacity_cycle() -> None:
    inputs = _base_inputs()
    inputs["profile"]["industry"] = "Semiconductors"
    years = (2010, 2011, 2012, 2023, 2024, 2025, 2026)
    margins = (-0.08, 0.04, 0.11, 0.18, 0.03, 0.14, 0.22)
    inputs["annual_rows"] = [
        {
            **deepcopy(inputs["annual_rows"][0]),
            "date": f"{year}-01-01",
            "revenue": 800.0,
            "fcff": 800.0 * margin,
        }
        for year, margin in zip(years, margins)
    ]

    valuation = _build(inputs)

    assert valuation["available"] is True
    assert valuation["cycle_normalization"]["coverage_complete"] is False
    assert valuation["status"] == "not_decision_ready"


def test_material_method_disagreement_is_a_hard_decision_ready_gate() -> None:
    inputs = _base_inputs()
    for index, (estimate, margin) in enumerate(
        zip(inputs["analyst_estimates"], (0.30, 0.35, 0.40, 0.45, 0.45)),
        start=1,
    ):
        revenue = 1_100.0 * (1.25**index)
        estimate.update(
            {
                "revenueLow": revenue * 0.95,
                "revenueAvg": revenue,
                "revenueHigh": revenue * 1.05,
                "ebitdaLow": revenue * (margin - 0.02),
                "ebitdaAvg": revenue * margin,
                "ebitdaHigh": revenue * (margin + 0.02),
            }
        )

    valuation = _build(inputs)

    assert valuation["reliability"]["method_disagreement"] > 0.45
    assert valuation["reliability"]["readiness_gates"]["method_agreement"]["passed"] is False
    assert valuation["status"] != "decision_ready"


def test_excessive_terminal_value_share_is_a_hard_decision_ready_gate(monkeypatch: pytest.MonkeyPatch) -> None:
    inputs = _base_inputs()
    monkeypatch.setitem(ARCHETYPE_BETA_PRIORS, "asset_light_growth", 0.50)

    valuation = _build(inputs)

    assert valuation["reliability"]["terminal_value_share"] > 0.75
    assert valuation["reliability"]["readiness_gates"]["terminal_value_dependence"]["passed"] is False
    assert valuation["status"] != "decision_ready"


def test_explicit_zero_tax_rate_is_not_replaced_by_the_default_rate() -> None:
    inputs = _base_inputs()
    inputs["ttm_row"]["tax_rate"] = 0.0

    valuation = _build(inputs)

    assert valuation["cost_of_capital"]["effective_tax_rate"] == 0.0


def test_reverse_dcf_is_never_part_of_intrinsic_value_weighting() -> None:
    valuation = _build(_base_inputs())

    assert valuation["reverse_dcf"]["weight"] == 0
    assert all(method["key"] != "reverse_dcf" for method in valuation["methods"])
    assert math.isclose(sum(method["weight"] for method in valuation["methods"]), 1.0)
    assert "reverse_dcf_as_intrinsic_value" in valuation["model_policy"]["excluded"]


def test_reverse_dcf_requires_an_independently_validated_price() -> None:
    unverified = _build(_base_inputs())
    validated_inputs = _base_inputs()
    validated_inputs["prices"] = [
        {"date": "2026-07-14", "close": 100.0, "source_family": "independent_exchange_feed"}
    ]
    validated = _build(validated_inputs)

    assert unverified["reverse_dcf"]["available"] is False
    assert unverified["reverse_dcf"]["status"] == "unverified_price"
    assert validated["reverse_dcf"]["available"] is True


def test_correlated_cash_earnings_check_never_blends_into_selected_value() -> None:
    valuation = _build(_base_inputs())

    primary = next(method for method in valuation["methods"] if method["role"] == "primary")
    correlated = next(method for method in valuation["methods"] if method["key"] == "normalized_cash_earnings")
    assert primary["weight"] == 1.0
    assert correlated["weight"] == 0.0
    assert correlated["independence"] == "correlated_with_primary"
    assert valuation["selected_value"] == primary["value_per_share"]
    assert valuation["reliability"]["readiness_gates"]["independent_cross_check"]["passed"] is False


def test_turnaround_without_positive_historical_fcff_is_not_research_grade() -> None:
    inputs = _base_inputs()
    for row in inputs["annual_rows"]:
        row["fcff"] = -abs(row["fcff"])
        row["free_cash_flow"] = -abs(row["free_cash_flow"])

    valuation = _build(inputs)

    evidence = valuation["historical_cash_flow_evidence"]
    assert evidence["positive_years"] == 0
    assert evidence["passed"] is False
    assert valuation["reliability"]["readiness_gates"]["historical_cash_flow_support"]["passed"] is False
    assert valuation["status"] == "not_decision_ready"


def test_two_positive_years_out_of_ten_do_not_define_a_normal_cash_flow_regime() -> None:
    inputs = _base_inputs()
    inputs["annual_rows"] = [
        {
            **deepcopy(inputs["annual_rows"][0]),
            "date": f"{year}-12-31",
            "revenue": 1_000.0,
            "fcff": 100.0 if index >= 8 else -100.0,
            "free_cash_flow": 90.0 if index >= 8 else -110.0,
        }
        for index, year in enumerate(range(2016, 2026))
    ]

    valuation = _build(inputs)

    assert valuation["historical_cash_flow_evidence"]["positive_share"] == pytest.approx(0.2)
    assert valuation["historical_cash_flow_evidence"]["passed"] is False
    assert valuation["status"] == "not_decision_ready"


def test_bank_routes_to_residual_income_and_never_enterprise_fcff() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Financial Services", "industry": "Banks - Diversified"})

    valuation = _build(inputs)

    assert valuation["archetype"] == "financial"
    assert valuation["primary_method"] == "residual_income"
    assert valuation["cash_flow_basis"] == "residual_income"
    assert all(scenario["method"] == "residual_income" for scenario in valuation["scenarios"])
    assert all(scenario["enterprise_value"] is None for scenario in valuation["scenarios"])
    assert valuation["reverse_dcf"]["weight"] == 0
    assert valuation["status"] == "research_grade"
    assert valuation["reliability"]["method_disagreement"] is None
    assert valuation["reliability"]["readiness_gates"]["method_agreement"]["passed"] is False
    assert "method_agreement" in valuation["reliability"]["decision_ready_blockers"]
    assert valuation["multiples"]["enterprise_value"] is None
    assert valuation["multiples"]["ev_to_sales"] is None
    assert valuation["multiples"]["ev_to_ebitda"] is None
    assert valuation["multiples"]["price_to_fcf"] is None
    assert valuation["multiples"]["price_to_book"] is not None


def test_bank_net_income_cannot_jump_tenfold_without_failing_scale_and_roe_checks() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Financial Services", "industry": "Banks - Diversified"})
    inputs["ttm_row"]["net_income"] *= 10.0

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["fundamental_scale_validation"]["passed"] is False


@pytest.mark.parametrize("scale_error", [5.0, 100.0])
def test_bank_statement_scale_error_cannot_publish_residual_income(scale_error: float) -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Financial Services", "industry": "Banks - Diversified"})
    for row in [*inputs["annual_rows"], inputs["ttm_row"]]:
        for field in MONETARY_ROW_FIELDS:
            if row.get(field) is not None:
                row[field] *= scale_error
    for estimate in inputs["analyst_estimates"]:
        for field in ESTIMATE_FIELDS:
            estimate[field] *= scale_error
    inputs["key_metrics_ttm"]["freeCashFlowToFirmTTM"] *= scale_error

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["fundamental_scale_validation"]["passed"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}


def test_bank_requires_historical_tangible_common_equity_to_normalize_roe() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Financial Services", "industry": "Banks - Diversified"})
    for row in inputs["annual_rows"]:
        row.pop("goodwill_and_intangibles")
        row.pop("preferred_stock")

    valuation = _build(inputs)

    gate = valuation["reliability"]["readiness_gates"]["historical_tangible_book_support"]
    assert gate["passed"] is False
    assert valuation["status"] == "not_decision_ready"


def test_negative_historical_tangible_equity_is_not_counted_as_valid_roe_support() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Financial Services", "industry": "Banks - Diversified"})
    for row in inputs["annual_rows"]:
        row["goodwill_and_intangibles"] = row["total_equity"] + 100.0

    valuation = _build(inputs)

    gate = valuation["reliability"]["readiness_gates"]["historical_tangible_book_support"]
    assert gate["observed_years"] == 0
    assert gate["passed"] is False
    assert valuation["status"] == "not_decision_ready"


@pytest.mark.parametrize(
    ("industry", "expected"),
    [("Banking Software", "asset_light_growth"), ("Oilfield Software", "asset_light_growth")],
)
def test_industry_substrings_do_not_misroute_software_companies(industry: str, expected: str) -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Technology", "industry": industry})

    valuation = _build(inputs)

    assert valuation["archetype"] == expected


def test_payment_network_is_not_valued_like_a_deposit_taking_bank() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Financial Services", "industry": "Credit Services - Payment Network"})

    valuation = _build(inputs)

    assert valuation["archetype"] == "general"
    assert valuation["primary_method"] == "forward_fcff_dcf"


def test_credit_services_requires_explicit_payment_network_evidence() -> None:
    inputs = _base_inputs()
    inputs["profile"].update(
        {
            "companyName": "Capital One Financial Corporation",
            "sector": "Financial Services",
            "industry": "Financial - Credit Services",
            "description": "Consumer and commercial banking, credit cards, deposits, and lending.",
        }
    )

    valuation = _build(inputs)

    assert valuation["archetype"] == "specialized_financial"
    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}


def test_credit_services_payment_processor_can_use_operating_model() -> None:
    inputs = _base_inputs()
    inputs["profile"].update(
        {
            "companyName": "Example Payments Network",
            "sector": "Financial Services",
            "industry": "Financial - Credit Services",
            "description": "Operates a global transaction processing network for merchants and financial institutions.",
        }
    )

    valuation = _build(inputs)

    assert valuation["archetype"] == "general"
    assert valuation["primary_method"] == "forward_fcff_dcf"


def test_healthcare_plan_requires_insurance_specific_inputs() -> None:
    inputs = _base_inputs()
    inputs["profile"].update(
        {
            "companyName": "Example Managed Care",
            "sector": "Healthcare",
            "industry": "Medical - Healthcare Plans",
        }
    )

    valuation = _build(inputs)

    assert valuation["archetype"] == "specialized_financial"
    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}


@pytest.mark.parametrize("industry", ["", "Capital Markets", "Financial Conglomerates", "Asset Management"])
def test_underspecified_nonbank_financials_do_not_fall_into_generic_fcff(industry: str) -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Financial Services", "industry": industry})

    valuation = _build(inputs)

    assert valuation["archetype"] == "specialized_financial"
    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}


@pytest.mark.parametrize(
    "industry",
    ["Insurance - Diversified", "Reinsurance", "Mortgage Finance", "Consumer Finance"],
)
def test_nonbank_balance_sheet_financials_require_specialized_models(industry: str) -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Financial Services", "industry": industry})

    valuation = _build(inputs)

    assert valuation["archetype"] == "specialized_financial"
    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}


@pytest.mark.parametrize(
    "profile_update",
    [
        {"isEtf": True, "industry": "Exchange Traded Fund"},
        {"industry": "Closed End Fund"},
        {"industry": "Shell Companies", "companyName": "Example SPAC"},
        {"industry": "Business Development Company"},
        {"industry": "Royalty Trust"},
    ],
)
def test_specialized_securities_abstain_from_generic_corporate_dcf(profile_update: dict) -> None:
    inputs = _base_inputs()
    inputs["profile"].update(profile_update)

    valuation = _build(inputs)

    assert valuation["archetype"] == "specialized_security"
    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert valuation["scenarios"] == []
    assert valuation["methods"] == []
    assert valuation["reverse_dcf"]["weight"] == 0


def test_reit_with_positive_generic_cash_flow_still_requires_affo_and_nav() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Real Estate", "industry": "REIT - Industrial"})

    valuation = _build(inputs)

    assert valuation["archetype"] == "specialized_real_assets"
    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert valuation["scenarios"] == []
    assert valuation["methods"] == []
    assert "affo" in valuation["reason"].lower()


def test_non_usd_cash_flows_do_not_use_a_usd_discount_curve() -> None:
    inputs = _base_inputs()
    inputs["profile"]["currency"] = "JPY"
    inputs["quote"]["currency"] = "JPY"
    for row in [*inputs["annual_rows"], inputs["ttm_row"]]:
        row["reported_currency"] = "JPY"
    for row in inputs["analyst_estimates"]:
        row["currency"] = "JPY"

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert "USD" in valuation["reason"]
    assert valuation["range"] == {"low": None, "central": None, "high": None}


def test_quote_currency_cannot_bypass_the_discount_curve_when_profile_currency_is_missing() -> None:
    inputs = _base_inputs()
    inputs["profile"].pop("currency")
    inputs["quote"]["currency"] = "EUR"
    for row in [*inputs["annual_rows"], inputs["ttm_row"]]:
        row["reported_currency"] = "EUR"
    for row in inputs["analyst_estimates"]:
        row["currency"] = "EUR"

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert "USD" in valuation["reason"]


def test_missing_listing_currency_is_never_invented_as_usd() -> None:
    inputs = _base_inputs()
    inputs["profile"].pop("currency")
    inputs["quote"].pop("currency", None)
    for row in inputs["prices"]:
        row.pop("currency", None)

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["price_validation"]["currency"] is None
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert any(
        check["key"] == "market_currency_identity" and check["passed"] is False
        for check in valuation["price_validation"]["checks"]
    )


def test_foreign_usd_issuer_requires_a_country_risk_input() -> None:
    inputs = _base_inputs()
    inputs["profile"]["country"] = "Argentina"

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert "riesgo país" in valuation["reason"].lower()


def test_missing_issuer_country_blocks_the_us_discount_curve() -> None:
    inputs = _base_inputs()
    inputs["profile"].pop("country")

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert "país" in valuation["reason"].lower()


def test_pre_revenue_company_abstains_without_sourced_milestones() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Healthcare", "industry": "Biotechnology"})
    inputs["ttm_row"].update({"revenue": 0.0, "ebitda": -80.0, "fcff": -70.0, "free_cash_flow": -65.0})
    inputs["analyst_estimates"] = []
    inputs["key_metrics_ttm"] = {}

    valuation = _build(inputs)

    assert valuation["archetype"] == "early_stage"
    assert valuation["available"] is False
    assert valuation["status"] == "not_decision_ready"
    assert valuation["selected_value"] is None
    assert valuation["scenarios"] == []
    assert valuation["methods"] == []
    assert valuation["reverse_dcf"]["weight"] == 0


def test_early_stage_company_cannot_capitalize_financing_funded_fcfe() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Healthcare", "industry": "Biotechnology"})
    inputs["ttm_row"].update({"revenue": 100.0, "ebitda": -20.0, "fcff": -25.0, "free_cash_flow": -30.0})
    for row in inputs["annual_rows"]:
        row.update({"ebitda": -20.0, "fcff": -25.0, "free_cash_flow": -30.0})
    for estimate in inputs["analyst_estimates"]:
        estimate.update({"ebitdaLow": -30.0, "ebitdaAvg": -20.0, "ebitdaHigh": -10.0})
    inputs["key_metrics_ttm"] = {
        "freeCashFlowToFirmTTM": -25.0,
        "freeCashFlowToEquityTTM": 40.0,
    }

    valuation = _build(inputs)

    assert valuation["archetype"] == "early_stage"
    assert valuation["available"] is False
    assert valuation["status"] == "not_decision_ready"
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert "hitos" in valuation["reason"].lower()


def test_negative_book_equity_cannot_fall_back_to_an_unlevered_wacc() -> None:
    inputs = _base_inputs()
    inputs["ttm_row"]["total_equity"] = -100.0

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert "cost_of_capital" not in valuation


def test_two_loss_years_block_a_generic_persistent_cash_flow_regime() -> None:
    inputs = _base_inputs()
    inputs["annual_rows"] = [
        {
            **deepcopy(inputs["annual_rows"][0]),
            "date": f"{year}-12-31",
            "revenue": 800.0 + index * 50.0,
            "fcff": (-80.0 if index < 2 else 120.0 + index * 5.0),
            "stock_based_compensation": 0.0,
        }
        for index, year in enumerate(range(2021, 2026))
    ]

    valuation = _build(inputs)

    evidence = valuation["historical_cash_flow_evidence"]
    assert evidence["positive_share"] == pytest.approx(0.60)
    assert evidence["persistent_positive_regime"] is False
    assert valuation["reliability"]["readiness_gates"]["historical_cash_flow_support"]["passed"] is False
    assert valuation["status"] == "not_decision_ready"


def test_historical_fallback_uses_distinct_growth_quantiles_by_scenario() -> None:
    inputs = _base_inputs()
    revenues = (600.0, 660.0, 620.0, 750.0, 850.0)
    inputs["annual_rows"] = [
        {
            **deepcopy(inputs["annual_rows"][0]),
            "date": f"{year}-12-31",
            "revenue": revenue,
            "ebitda": revenue * 0.25,
            "fcff": revenue * 0.15,
            "free_cash_flow": revenue * 0.13,
            "stock_based_compensation": 0.0,
        }
        for year, revenue in zip(range(2021, 2026), revenues)
    ]
    inputs["analyst_estimates"] = []

    valuation = _build(inputs)

    trend = valuation["historical_trend_normalization"]
    assert trend["passed"] is True
    assert trend["bear"] < trend["bull"]
    by_name = {scenario["name"]: scenario for scenario in valuation["scenarios"]}
    assert by_name["bear"]["forecast"][0]["revenue_growth"] < by_name["bull"]["forecast"][0]["revenue_growth"]


def test_recent_adverse_consensus_cannot_be_replaced_by_an_optimistic_history() -> None:
    inputs = _base_inputs()
    previous_revenue = inputs["ttm_row"]["revenue"]
    for index, row in enumerate(inputs["analyst_estimates"]):
        revenue = previous_revenue * 0.60
        margin = 0.15 - index * 0.05
        row.update(
            {
                "revenueLow": revenue * 0.95,
                "revenueAvg": revenue,
                "revenueHigh": revenue * 1.05,
                "ebitdaLow": revenue * (margin - 0.01),
                "ebitdaAvg": revenue * margin,
                "ebitdaHigh": revenue * (margin + 0.01),
            }
        )
        previous_revenue = revenue

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert "pérdidas" in valuation["reason"].lower() or "incompatibles" in valuation["reason"].lower()


def test_capacity_cycle_blocks_consensus_below_its_verified_demand_regime() -> None:
    inputs = _base_inputs()
    inputs["profile"]["industry"] = "Semiconductors"
    margins = (-0.08, 0.04, 0.11, 0.18, 0.03, 0.14, 0.22)
    revenues = (700.0, 650.0, 820.0, 1_000.0, 620.0, 900.0, 1_100.0)
    inputs["annual_rows"] = [
        {
            **deepcopy(inputs["annual_rows"][0]),
            "date": f"{year}-12-31",
            "revenue": revenue,
            "fcff": revenue * margin,
            "free_cash_flow": revenue * (margin - 0.01),
        }
        for year, revenue, margin in zip(range(2019, 2026), revenues, margins)
    ]
    previous_revenue = inputs["ttm_row"]["revenue"]
    for row in inputs["analyst_estimates"]:
        revenue = previous_revenue * 0.40
        row.update(
            {
                "revenueLow": revenue * 0.95,
                "revenueAvg": revenue,
                "revenueHigh": revenue * 1.05,
                "ebitdaLow": revenue * 0.08,
                "ebitdaAvg": revenue * 0.10,
                "ebitdaHigh": revenue * 0.12,
            }
        )
        previous_revenue = revenue

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert "contracción" in valuation["reason"].lower()


def test_operating_cash_is_not_added_to_equity_or_capitalized_twice() -> None:
    valuation = _build(_base_inputs())

    separation = valuation["operating_cash_separation"]
    assert separation["complete"] is True
    assert separation["operating_cash_reserve"] == pytest.approx(22.0)
    assert valuation["equity_bridge"]["assets_added"] == pytest.approx(128.0)
    assert separation["operating_fcff_after_sbc"] < valuation["stock_compensation_treatment"]["fcff_after_sbc"]
    assert valuation["multiples"]["price_to_fcf"] == pytest.approx(
        valuation["multiples"]["market_cap"] / separation["operating_fcff_after_sbc"]
    )


def test_transient_ttm_cash_release_cannot_dominate_history() -> None:
    baseline = _build(_base_inputs())
    inputs = _base_inputs()
    inputs["ttm_row"]["fcff"] = 250.0
    inputs["key_metrics_ttm"]["freeCashFlowToFirmTTM"] = 250.0

    elevated = _build(inputs)

    increase = elevated["range"]["central"] / baseline["range"]["central"] - 1
    assert 0 < increase < 0.20


def test_material_non_debt_claims_require_an_explicit_cost_of_capital() -> None:
    inputs = _base_inputs()
    inputs["ttm_row"]["lease_liabilities_not_in_debt"] = 100.0

    valuation = _build(inputs)

    gate = valuation["reliability"]["readiness_gates"]["capital_structure_support"]
    assert gate["passed"] is False
    assert gate["other_claims_to_book_capital"] > 0.10
    assert valuation["status"] == "not_decision_ready"


def test_undated_policy_rates_can_never_be_presented_as_decision_ready() -> None:
    valuation = _build(_base_inputs())

    gate = valuation["reliability"]["readiness_gates"]["dated_capital_market_inputs"]
    assert gate == {
        "passed": False,
        "source": "fixed_policy_prior_not_live_market_data",
        "as_of": None,
    }
    assert valuation["status"] != "decision_ready"


def test_adr_ratio_alone_activates_denominator_reconciliation() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"adrRatio": 2.0})

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["price_validation"]["adr_conversion"] is not None
    assert any(
        check["key"] == "adr_denominator" and check["passed"] is False
        for check in valuation["price_validation"]["checks"]
    )


def test_missing_business_taxonomy_never_defaults_to_generic_dcf() -> None:
    inputs = _base_inputs()
    inputs["profile"].pop("industry")

    valuation = _build(inputs)

    assert valuation["archetype"] == "unknown"
    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}


def test_clinical_stage_biotech_uses_milestone_model_even_with_positive_ttm_cash() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Healthcare", "industry": "Clinical Stage Biotechnology"})

    valuation = _build(inputs)

    assert valuation["archetype"] == "early_stage"
    assert valuation["available"] is False
    assert "hitos" in valuation["reason"].lower()


def test_commercial_biotech_with_persistent_cash_history_can_use_corporate_valuation() -> None:
    inputs = _base_inputs()
    inputs["profile"].update({"sector": "Healthcare", "industry": "Biotechnology"})

    valuation = _build(inputs)

    assert valuation["archetype"] == "general"
    assert valuation["available"] is True


def test_extreme_historical_dilution_clears_all_per_share_values() -> None:
    inputs = _base_inputs()
    for row, shares in zip(inputs["annual_rows"], (5.0, 8.0, 12.0)):
        row["diluted_shares"] = shares
    inputs["ttm_row"]["diluted_shares"] = 12.5
    inputs["profile"].update({"price": 100.0, "marketCap": 1_250.0})
    inputs["quote"].update({"price": 100.0, "marketCap": 1_250.0})

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert valuation["share_dilution"]["passed"] is False


def test_debt_and_lease_classification_preserves_wacc_and_value() -> None:
    lease_inputs = _base_inputs()
    debt_inputs = _base_inputs()
    for row in [*lease_inputs["annual_rows"], lease_inputs["ttm_row"]]:
        row["lease_liabilities_not_in_debt"] = 69.0
        row["total_debt"] = 100.0
    for row in [*debt_inputs["annual_rows"], debt_inputs["ttm_row"]]:
        row["lease_liabilities_not_in_debt"] = 0.0
        row["total_debt"] = 169.0

    lease = _build(lease_inputs)
    debt = _build(debt_inputs)

    assert lease["cost_of_capital"]["debt_like_capital"] == debt["cost_of_capital"]["debt_like_capital"]
    assert lease["cost_of_capital"]["wacc"] == pytest.approx(debt["cost_of_capital"]["wacc"])
    assert lease["range"] == pytest.approx(debt["range"])


def test_book_equity_scale_does_not_move_apv_operating_discount_rate() -> None:
    baseline = _base_inputs()
    thin_equity = _base_inputs()
    thin_equity["ttm_row"]["total_equity"] = 1.0
    price_validation = {"price": 100.0, "market_cap": 1_000.0}

    base = _cost_of_capital(
        baseline["profile"], baseline["ttm_row"], price_validation, "asset_light_growth", baseline["annual_rows"]
    )
    thin = _cost_of_capital(
        thin_equity["profile"], thin_equity["ttm_row"], price_validation, "asset_light_growth", thin_equity["annual_rows"]
    )

    assert thin["operating_discount_rate"] == pytest.approx(base["operating_discount_rate"])
    assert thin["tax_shield_present_value"] == base["tax_shield_present_value"] == 0.0


def test_target_leverage_activates_continuously_for_immaterial_debt() -> None:
    no_debt_inputs = _base_inputs()
    tiny_debt_inputs = _base_inputs()
    for row in [*no_debt_inputs["annual_rows"], no_debt_inputs["ttm_row"]]:
        row["total_debt"] = 0.0
    for row in [*tiny_debt_inputs["annual_rows"], tiny_debt_inputs["ttm_row"]]:
        row["total_debt"] = 0.01

    no_debt = _build(no_debt_inputs)
    tiny_debt = _build(tiny_debt_inputs)

    assert tiny_debt["cost_of_capital"]["debt_weight"] < 0.0001
    assert abs(tiny_debt["cost_of_capital"]["wacc"] - no_debt["cost_of_capital"]["wacc"]) < 0.0001
    assert abs(tiny_debt["range"]["central"] - no_debt["range"]["central"]) < 0.05


def test_apv_does_not_create_an_implicit_perpetual_tax_shield_from_more_debt() -> None:
    levered_inputs = _base_inputs()
    unlevered_inputs = _base_inputs()
    for row in [*unlevered_inputs["annual_rows"], unlevered_inputs["ttm_row"]]:
        debt = row["total_debt"]
        row["total_debt"] = 0.0
        row["total_equity"] += debt

    levered = _build(levered_inputs)
    unlevered = _build(unlevered_inputs)
    levered_base = next(item for item in levered["scenarios"] if item["name"] == "base")
    unlevered_base = next(item for item in unlevered["scenarios"] if item["name"] == "base")

    assert levered["cost_of_capital"]["operating_discount_rate"] == pytest.approx(
        unlevered["cost_of_capital"]["operating_discount_rate"]
    )
    assert levered["cost_of_capital"]["tax_shield_present_value"] == 0.0
    assert levered["cost_of_capital"]["tax_shield_upper_bound"] == pytest.approx(21.0)
    assert levered_base["enterprise_value"] == pytest.approx(unlevered_base["enterprise_value"])
    assert unlevered["range"]["central"] - levered["range"]["central"] == pytest.approx(10.0)


def test_cyclical_revenue_level_cannot_move_the_operating_discount_rate() -> None:
    inputs = _base_inputs()
    peak = deepcopy(inputs["ttm_row"])
    trough = deepcopy(inputs["ttm_row"])
    peak["revenue"] = 2_000.0
    trough["revenue"] = 250.0
    price_validation = {"price": 100.0, "market_cap": 1_000.0}

    peak_capital = _cost_of_capital(
        inputs["profile"], peak, price_validation, "capacity_cycle", inputs["annual_rows"]
    )
    trough_capital = _cost_of_capital(
        inputs["profile"], trough, price_validation, "capacity_cycle", inputs["annual_rows"]
    )

    assert peak_capital["capital_weight_revenue_source"] == "median_last_five_complete_fiscal_years"
    assert trough_capital["capital_weight_revenue"] == peak_capital["capital_weight_revenue"]
    assert trough_capital["operating_discount_rate"] == peak_capital["operating_discount_rate"]


def test_high_growth_consensus_pays_for_incremental_reinvestment() -> None:
    inputs = _base_inputs()
    previous_revenue = inputs["ttm_row"]["revenue"]
    for row in inputs["analyst_estimates"]:
        revenue = previous_revenue * 1.40
        row.update(
            {
                "revenueLow": revenue * 0.95,
                "revenueAvg": revenue,
                "revenueHigh": revenue * 1.05,
                "ebitdaLow": revenue * 0.22,
                "ebitdaAvg": revenue * 0.25,
                "ebitdaHigh": revenue * 0.28,
            }
        )
        previous_revenue = revenue

    valuation = _build(inputs)

    base = next(item for item in valuation["scenarios"] if item["name"] == "base")
    assert valuation["reinvestment_support"]["passed"] is True
    assert all(row["incremental_reinvestment"] > 0 for row in base["forecast"])
    assert sum(row["incremental_reinvestment"] for row in base["forecast"]) > 0


def test_reinvestment_support_requires_the_same_full_history_as_cash_flow() -> None:
    inputs = _base_inputs()
    inputs["annual_rows"] = [
        {
            **deepcopy(inputs["annual_rows"][0]),
            "date": f"{year}-12-31",
            "revenue": 800.0 + index * 50.0,
            "fcff": 120.0 + index * 5.0,
            "stock_based_compensation": 0.0,
            "total_equity": None if index < 2 else 500.0,
        }
        for index, year in enumerate(range(2021, 2026))
    ]

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["reinvestment_support"]["passed"] is False
    assert valuation["reinvestment_support"]["missing_years"] == 2


def test_three_year_history_without_consensus_does_not_emit_a_range() -> None:
    inputs = _base_inputs()
    inputs["analyst_estimates"] = []

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert valuation["historical_trend_normalization"]["passed"] is False


def test_forward_growth_without_a_reinvestment_baseline_does_not_emit_a_range() -> None:
    inputs = _base_inputs()
    inputs["assumptions"] = {}

    valuation = _build(inputs)

    assert valuation["available"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    gate = valuation["reliability"]["readiness_gates"]["growth_reinvestment_support"]
    assert gate["passed"] is False
    assert valuation["reinvestment_support"]["baseline_source"] == "missing"
