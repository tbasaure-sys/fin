from __future__ import annotations

from datetime import date, timedelta

import pytest

from meta_alpha_allocator.compelled_flow.projection import net, project
from meta_alpha_allocator.compelled_flow.proshares import archive_holdings_snapshot, summarize_daily_holdings
from meta_alpha_allocator.compelled_flow.validation import validate_predictions


def _citation(value: float, *, lag: int = 0) -> dict:
    return {
        "value": value,
        "as_of": "2026-07-29",
        "lag_days": lag,
        "source_url": "https://example.test/primary",
        "source_clause": "Primary document, section 1",
    }


def _leveraged_rule(**overrides: object) -> dict:
    rule = {
        "rule_id": "tqqq_daily_rebalance_v1",
        "instrument_id": "NDX_DERIVATIVE_EXPOSURE",
        "formula_kind": "leveraged_daily_rebalance",
        "beta": 3.0,
        "scope": "index_derivatives",
        "output_mode": "execution_timing",
        "anticipation_lag_days": 1,
        "completeness": "complete",
        "coverage_threshold": 1.0,
    }
    rule.update(overrides)
    return rule


def _leveraged_state(**overrides: object) -> dict:
    state = {
        "nav_assets_prev": _citation(100_000_000.0),
        "daily_return": _citation(0.02),
        "creation_redemption_notional": _citation(0.0),
        "adv_20d": _citation(60_000_000.0),
    }
    state.update(overrides)
    return state


def test_project_computes_an_index_weight_change_in_shares_adv_and_float() -> None:
    rule = {
        "rule_id": "equal_weight_rebalance_v1",
        "instrument_id": "AAPL",
        "formula_kind": "index_weight_delta",
        "scope": "single_equity",
        "output_mode": "execution_timing",
        "anticipation_lag_days": 5,
        "completeness": "complete",
    }
    state = {
        "agent_pool_usd": _citation(10_000_000_000.0, lag=2),
        "target_weight": _citation(0.002, lag=1),
        "current_weight": _citation(0.0015, lag=1),
        "reference_price": _citation(250.0),
        "adv_20d": _citation(5_000_000_000.0),
        "free_float_shares": _citation(15_000_000_000.0, lag=3),
    }

    record = project(rule, state, "2026-07-30")

    assert record["emitted"] is True
    assert record["flow_notional"] == pytest.approx(5_000_000.0)
    assert record["flow_shares"] == pytest.approx(20_000.0)
    assert record["days_adv"] == pytest.approx(0.001)
    assert record["float_pct"] == pytest.approx(20_000.0 / 15_000_000_000.0)
    assert record["direction"] == "buy"
    assert record["worst_input_lag_days"] == 3


def test_project_computes_the_derived_leveraged_rebalance_formula() -> None:
    record = project(_leveraged_rule(), _leveraged_state(), "2026-07-30")

    assert record["emitted"] is True
    assert record["flow_notional"] == pytest.approx(12_000_000.0)
    assert record["days_adv"] == pytest.approx(0.2)
    assert record["direction"] == "buy"
    assert record["flow_shares"] is None
    assert record["float_pct"] is None
    assert record["worst_input_lag_days"] == 0
    assert record["suppression_reason"] is None


@pytest.mark.parametrize("beta", [2.0, 3.0, -1.0, -2.0, -3.0])
def test_standard_long_and_inverse_leverage_rebalance_in_the_move_direction(beta: float) -> None:
    record = project(_leveraged_rule(beta=beta), _leveraged_state(), "2026-07-30")

    assert record["flow_notional"] > 0
    assert record["direction"] == "buy"


def test_creation_redemption_adjustment_is_explicitly_included_in_assets() -> None:
    record = project(
        _leveraged_rule(),
        _leveraged_state(creation_redemption_notional=_citation(10_000_000.0)),
        "2026-07-30",
    )

    assert record["flow_notional"] == pytest.approx(13_200_000.0)


@pytest.mark.parametrize(
    ("rule", "state", "reason"),
    [
        (_leveraged_rule(completeness="partial"), _leveraged_state(), "rule_incomplete"),
        (
            _leveraged_rule(),
            _leveraged_state(daily_return={"value": 0.02, "as_of": "2026-07-29", "lag_days": 0}),
            "uncited_numeric_input:daily_return",
        ),
        (
            _leveraged_rule(),
            _leveraged_state(daily_return=_citation(0.02, lag=2)),
            "input_lag_exceeds_anticipation_window",
        ),
    ],
)
def test_project_fails_closed_and_still_returns_a_suppressed_record(
    rule: dict, state: dict, reason: str
) -> None:
    record = project(rule, state, "2026-07-30")

    assert record["emitted"] is False
    assert record["flow_notional"] is None
    assert record["suppression_reason"] == reason


def test_project_refuses_derivative_scope_to_single_stock_without_transmission_model() -> None:
    record = project(
        _leveraged_rule(),
        _leveraged_state(target_scope="single_equity", transmission_model=None),
        "2026-07-30",
    )

    assert record["emitted"] is False
    assert record["suppression_reason"] == "missing_derivative_to_equity_transmission_model"


def test_net_sums_signed_flows_normalizes_and_propagates_worst_lag() -> None:
    first = project(_leveraged_rule(rule_id="one"), _leveraged_state(), "2026-07-30")
    second = {**first, "rule_id": "two", "flow_notional": -3_000_000.0, "worst_input_lag_days": 1}

    result = net(
        [first, second],
        instrument_id="NDX_DERIVATIVE_EXPOSURE",
        on_date="2026-07-30",
        adv_20d=_citation(60_000_000.0),
        mandate_coverage=1.0,
        coverage_threshold=0.8,
    )

    assert result["emitted"] is True
    assert result["net_compelled_flow"] == pytest.approx(9_000_000.0)
    assert result["absorption_deficit"] == pytest.approx(0.15)
    assert result["worst_input_lag_days"] == 1


def test_net_fails_closed_when_a_material_rule_is_suppressed() -> None:
    emitted = project(_leveraged_rule(), _leveraged_state(), "2026-07-30")
    suppressed = {**emitted, "rule_id": "missing", "emitted": False, "suppression_reason": "rule_incomplete"}

    result = net(
        [emitted, suppressed],
        instrument_id="NDX_DERIVATIVE_EXPOSURE",
        on_date="2026-07-30",
        adv_20d=_citation(60_000_000.0),
        mandate_coverage=1.0,
        coverage_threshold=0.8,
    )

    assert result["emitted"] is False
    assert result["net_compelled_flow"] is None
    assert result["suppression_reason"] == "material_rule_suppressed:missing"


def test_net_fails_closed_below_declared_coverage_threshold() -> None:
    record = project(_leveraged_rule(), _leveraged_state(), "2026-07-30")

    result = net(
        [record],
        instrument_id="NDX_DERIVATIVE_EXPOSURE",
        on_date="2026-07-30",
        adv_20d=_citation(60_000_000.0),
        mandate_coverage=0.79,
        coverage_threshold=0.8,
    )

    assert result["emitted"] is False
    assert result["suppression_reason"] == "mandate_coverage_below_threshold"


def _business_dates(count: int) -> list[str]:
    cursor = date(2026, 1, 2)
    dates: list[str] = []
    while len(dates) < count:
        if cursor.weekday() < 5:
            dates.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return dates


def test_validation_reports_hand_computable_error_metrics_and_passes() -> None:
    errors = [-0.05] * 15 + [0.05] * 15
    rows = [
        {
            "date": day,
            "predicted_exposure_change": 100.0,
            "observed_next_day_exposure_change": 100.0 * (1.0 + error),
        }
        for day, error in zip(_business_dates(30), errors)
    ]

    report = validate_predictions(rows)

    assert report["status"] == "pass"
    assert report["observation_count"] == 30
    assert report["median_absolute_error"] == pytest.approx(0.05)
    assert report["median_signed_bias"] == pytest.approx(0.0)
    assert report["p90_absolute_error"] == pytest.approx(0.05)


@pytest.mark.parametrize(
    ("rows", "reason"),
    [
        ([], "fewer_than_30_business_sessions"),
        (
            [
                {
                    "date": day,
                    "predicted_exposure_change": 100.0,
                    "observed_next_day_exposure_change": None,
                }
                for day in _business_dates(30)
            ],
            "missing_observed_holdings_exposure",
        ),
    ],
)
def test_validation_blocks_instead_of_filling_ground_truth_gaps(rows: list[dict], reason: str) -> None:
    report = validate_predictions(rows)

    assert report["status"] == "blocked"
    assert report["blocking_reason"] == reason
    assert report["median_absolute_error"] is None


def test_validation_rejects_duplicate_sessions() -> None:
    rows = [
        {
            "date": day,
            "predicted_exposure_change": 100.0,
            "observed_next_day_exposure_change": 100.0,
        }
        for day in _business_dates(30)
    ]
    rows[-1]["date"] = rows[-2]["date"]

    report = validate_predictions(rows)

    assert report["status"] == "blocked"
    assert report["blocking_reason"] == "duplicate_business_sessions"


def test_proshares_holdings_parser_preserves_preamble_and_refuses_to_infer_index_exposure() -> None:
    raw = """PORTFOLIO HOLDINGS INFORMATION,,,,
AS OF 7/29/2026,,,,
,,,,
Fund Ticker,Fund Name,Security Ticker,Security Sedol,Security Description,Coupon,Maturity Date,Shares/Contracts,Exposure Value (Notional + G/L),Market Value
TQQQ,UltraPro QQQ,,,NASDAQ 100 Index SWAP,,,,1200,
TQQQ,UltraPro QQQ,AAPL,,APPLE INC,,,,,300
TQQQ,UltraPro QQQ,,,Net Other Assets (Liabilities),,,,,-50
OTHER,Other Fund,,,OTHER SWAP,,,,900,
"""

    summary = summarize_daily_holdings(raw, "TQQQ")

    assert summary["as_of"] == "2026-07-29"
    assert summary["row_count"] == 3
    assert summary["reported_derivative_exposure_notional"] == pytest.approx(1200.0)
    assert summary["reported_security_market_value"] == pytest.approx(300.0)
    assert summary["net_other_assets"] == pytest.approx(-50.0)
    assert summary["observed_index_exposure"] is None
    assert summary["blocking_reason"] == "missing_primary_classification_of_cash_security_index_exposure"


def test_holdings_archive_keeps_the_raw_primary_snapshot_and_summary(tmp_path) -> None:
    raw = """PORTFOLIO HOLDINGS INFORMATION,,,,
AS OF 7/29/2026,,,,
,,,,
Fund Ticker,Fund Name,Security Ticker,Security Sedol,Security Description,Coupon,Maturity Date,Shares/Contracts,Exposure Value (Notional + G/L),Market Value
TQQQ,UltraPro QQQ,,,NASDAQ 100 Index SWAP,,,,1200,
TQQQ,UltraPro QQQ,AAPL,,APPLE INC,,,,,300
"""

    paths = archive_holdings_snapshot(raw, "TQQQ", tmp_path)

    assert paths["raw_path"].name == "2026-07-29.csv"
    assert paths["summary_path"].name == "2026-07-29.json"
    assert paths["raw_path"].read_text(encoding="utf-8") == raw
    assert '"observed_index_exposure": null' in paths["summary_path"].read_text(encoding="utf-8")
