from __future__ import annotations

from hashlib import sha256
import json

import pytest

from meta_alpha_allocator.compelled_flow.projection import net, project
from meta_alpha_allocator.compelled_flow.proshares import (
    archive_holdings_snapshot,
    summarize_daily_holdings,
    update_snapshot_manifest,
)
from meta_alpha_allocator.compelled_flow.validation import (
    validate_prediction_package,
    validate_predictions,
)


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
        "source_document": {
            "title": "TQQQ Summary Prospectus",
            "url": "https://www.proshares.com/prospectus.pdf",
            "retrieved_at": "2026-07-29",
        },
        "source_clauses": [
            {
                "section": "Daily rebalance",
                "extraction": "The portfolio is rebalanced each day.",
            }
        ],
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
        "source_document": {
            "title": "Index methodology",
            "url": "https://www.spglobal.com/methodology.pdf",
            "retrieved_at": "2026-07-29",
        },
        "source_clauses": [
            {
                "section": "Equal weighting",
                "extraction": "Constituents are equally weighted at rebalance.",
            }
        ],
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


def test_project_requires_primary_rule_documentation_before_emitting() -> None:
    record = project(
        _leveraged_rule(source_document=None, source_clauses=[]),
        _leveraged_state(),
        "2026-07-30",
    )

    assert record["emitted"] is False
    assert record["suppression_reason"] == "rule_documentation_missing_or_invalid"


@pytest.mark.parametrize(
    "citation",
    [
        {**_citation(0.02), "as_of": "2026-07-31"},
        {**_citation(0.02), "as_of": "not-a-date"},
        {**_citation(0.02), "source_url": "fabricated"},
    ],
)
def test_project_rejects_future_or_malformed_input_citations(citation: dict) -> None:
    record = project(
        _leveraged_rule(),
        _leveraged_state(daily_return=citation),
        "2026-07-30",
    )

    assert record["emitted"] is False
    assert record["suppression_reason"] == "uncited_numeric_input:daily_return"


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


@pytest.mark.parametrize("beta", [None, "three", float("nan"), 0.0, 1.0])
def test_project_suppresses_an_invalid_leverage_rule_instead_of_crashing(beta: object) -> None:
    record = project(_leveraged_rule(beta=beta), _leveraged_state(), "2026-07-30")

    assert record["emitted"] is False
    assert record["flow_notional"] is None
    assert record["suppression_reason"] == "invalid_leverage_beta"


@pytest.mark.parametrize(
    ("records", "mandate_coverage", "coverage_threshold", "reason"),
    [
        ([], 1.0, 0.8, "no_emitted_rules"),
        ([{"emitted": True, "flow_notional": 1.0, "worst_input_lag_days": 0}], float("nan"), 0.8, "invalid_mandate_coverage"),
        ([{"emitted": True, "flow_notional": 1.0, "worst_input_lag_days": 0}], 1.0, 1.1, "invalid_coverage_threshold"),
    ],
)
def test_net_suppresses_empty_or_invalid_coverage_inputs(
    records: list[dict], mandate_coverage: float, coverage_threshold: float, reason: str
) -> None:
    result = net(
        records,
        instrument_id="NDX_DERIVATIVE_EXPOSURE",
        on_date="2026-07-30",
        adv_20d=_citation(60_000_000.0),
        mandate_coverage=mandate_coverage,
        coverage_threshold=coverage_threshold,
    )

    assert result["emitted"] is False
    assert result["net_compelled_flow"] is None
    assert result["suppression_reason"] == reason


@pytest.mark.parametrize(
    ("records", "reason"),
    [
        ([None], "malformed_rule_record"),
        ([{"rule_id": "bad", "emitted": True, "flow_notional": float("nan"), "worst_input_lag_days": 0}], "invalid_emitted_rule:bad"),
        ([{"rule_id": "bad", "emitted": True, "flow_notional": 1.0, "worst_input_lag_days": -1}], "invalid_emitted_rule:bad"),
    ],
)
def test_net_rejects_malformed_emitted_records(records: list, reason: str) -> None:
    result = net(
        records,
        instrument_id="NDX_DERIVATIVE_EXPOSURE",
        on_date="2026-07-30",
        adv_20d=_citation(60_000_000.0),
        mandate_coverage=1.0,
        coverage_threshold=0.8,
    )

    assert result["emitted"] is False
    assert result["suppression_reason"] == reason


CALENDAR_ID = "XNYS-2026-test-v1"
EXCHANGE_SESSIONS = [
    "2026-01-02",
    "2026-01-05",
    "2026-01-06",
    "2026-01-07",
    "2026-01-08",
    "2026-01-09",
    "2026-01-12",
    "2026-01-13",
    "2026-01-14",
    "2026-01-15",
    "2026-01-16",
    # 2026-01-19 is Martin Luther King Jr. Day, not an exchange session.
    "2026-01-20",
    "2026-01-21",
    "2026-01-22",
    "2026-01-23",
    "2026-01-26",
    "2026-01-27",
    "2026-01-28",
    "2026-01-29",
    "2026-01-30",
    "2026-02-02",
    "2026-02-03",
    "2026-02-04",
    "2026-02-05",
    "2026-02-06",
    "2026-02-09",
    "2026-02-10",
    "2026-02-11",
    "2026-02-12",
    "2026-02-13",
    # 2026-02-16 is Washington's Birthday, not an exchange session.
    "2026-02-17",
    "2026-02-18",
    "2026-02-19",
    "2026-02-20",
    "2026-02-23",
]


def _validation_rows(*, count: int = 30, start: int = 0, errors: list[float] | None = None) -> list[dict]:
    row_errors = errors if errors is not None else [0.0] * count
    return [
        {
            "date": EXCHANGE_SESSIONS[index],
            "observed_as_of": EXCHANGE_SESSIONS[index + 1],
            "prediction_snapshot_id": f"proshares:TQQQ:{EXCHANGE_SESSIONS[index]}",
            "observation_snapshot_id": f"proshares:TQQQ:{EXCHANGE_SESSIONS[index + 1]}",
            "prediction_generated_at": f"{EXCHANGE_SESSIONS[index]}T22:00:00+00:00",
            "predicted_exposure_change": 100.0,
            "observed_next_day_exposure_change": 100.0 * (1.0 + error),
        }
        for index, error in zip(range(start, start + count), row_errors)
    ]


def _validation_archive(tmp_path, rows: list[dict]) -> tuple[dict, dict]:
    archive_root = tmp_path / "archive"
    archive_root.mkdir()
    calendar_bytes = ("\n".join(EXCHANGE_SESSIONS) + "\n").encode("utf-8")
    calendar_evidence = {
        "calendar_id": CALENDAR_ID,
        "venue": "XNYS",
        "source_url": "https://www.nyse.com/markets/hours-calendars",
        "source_clause": "NYSE holidays and trading hours for 2026",
        "retrieved_at": "2025-12-15T12:00:00+00:00",
        "sessions_sha256": sha256(calendar_bytes).hexdigest(),
    }

    exposure_by_session = {EXCHANGE_SESSIONS[0]: 10_000.0}
    for row in rows:
        prior = exposure_by_session[row["date"]]
        exposure_by_session[row["observed_as_of"]] = (
            prior + float(row["observed_next_day_exposure_change"])
        )

    manifest: dict[str, dict] = {}
    snapshot_ids = [rows[0]["prediction_snapshot_id"], *[row["observation_snapshot_id"] for row in rows]]
    for snapshot_id, session in zip(snapshot_ids, EXCHANGE_SESSIONS[: len(snapshot_ids)]):
        raw_path = archive_root / f"{session}.csv"
        raw_bytes = f"official holdings snapshot,{session}\n".encode("utf-8")
        raw_path.write_bytes(raw_bytes)
        summary = {
            "schema_version": "compelled_flow_snapshot_v1",
            "snapshot_id": snapshot_id,
            "as_of": session,
            "captured_at": f"{session}T21:00:00+00:00",
            "source_url": "https://accounts.profunds.com/etfdata/psdlyhld.csv",
            "source_clause": "Official daily fund holdings",
            "raw_path": raw_path.name,
            "raw_sha256": sha256(raw_bytes).hexdigest(),
            "observed_index_exposure": exposure_by_session[session],
        }
        summary_path = archive_root / f"{session}.json"
        summary_bytes = (json.dumps(summary, sort_keys=True) + "\n").encode("utf-8")
        summary_path.write_bytes(summary_bytes)
        manifest[snapshot_id] = {
            "summary_path": summary_path.name,
            "summary_sha256": sha256(summary_bytes).hexdigest(),
        }
    return calendar_evidence, {"archive_root": archive_root, "snapshots": manifest}


def _validate_with_archive(rows: list[dict], tmp_path, **overrides: object) -> dict:
    calendar_evidence, snapshot_manifest = _validation_archive(tmp_path, rows)
    options = {
        "session_calendar": EXCHANGE_SESSIONS,
        "calendar_id": CALENDAR_ID,
        "calendar_evidence": calendar_evidence,
        "snapshot_manifest": snapshot_manifest,
    }
    options.update(overrides)
    return validate_predictions(rows, **options)


def test_validation_reports_hand_computable_error_metrics_and_passes(tmp_path) -> None:
    errors = [-0.05] * 15 + [0.05] * 15
    rows = _validation_rows(errors=errors)

    report = _validate_with_archive(rows, tmp_path)

    assert report["status"] == "pass"
    assert report["observation_count"] == 30
    assert report["validated_session_count"] == 30
    assert report["calendar_id"] == CALENDAR_ID
    assert report["calendar_session_count"] == len(EXCHANGE_SESSIONS)
    assert report["prediction_snapshot_ids"] == [row["prediction_snapshot_id"] for row in rows]
    assert report["observation_snapshot_ids"] == [row["observation_snapshot_id"] for row in rows]
    assert report["snapshot_chain"] == [
        rows[0]["prediction_snapshot_id"],
        *[row["observation_snapshot_id"] for row in rows],
    ]
    assert report["distinct_snapshot_count"] == 31
    assert report["median_absolute_error"] == pytest.approx(0.05)
    assert report["median_signed_bias"] == pytest.approx(0.0)
    assert report["p90_absolute_error"] == pytest.approx(0.05)
    assert report["calendar_evidence_verified"] is True
    assert report["snapshot_archive_verified"] is True
    assert report["ground_truth_source"] == "archived_snapshot_delta"


@pytest.mark.parametrize(
    ("rows", "reason"),
    [
        ([], "fewer_than_30_business_sessions"),
        (
            [
                {**row, "observed_next_day_exposure_change": None}
                for row in _validation_rows()
            ],
            "missing_observed_holdings_exposure",
        ),
    ],
)
def test_validation_blocks_instead_of_filling_ground_truth_gaps(rows: list[dict], reason: str) -> None:
    report = validate_predictions(rows, session_calendar=EXCHANGE_SESSIONS, calendar_id=CALENDAR_ID)

    assert report["status"] == "blocked"
    assert report["blocking_reason"] == reason
    assert report["median_absolute_error"] is None


@pytest.mark.parametrize(
    ("calendar", "calendar_id", "reason"),
    [
        (EXCHANGE_SESSIONS, " ", "blank_calendar_id"),
        ([*EXCHANGE_SESSIONS[:-1], "not-a-date"], CALENDAR_ID, "malformed_session_calendar"),
        (
            [EXCHANGE_SESSIONS[0], EXCHANGE_SESSIONS[0], *EXCHANGE_SESSIONS[2:]],
            CALENDAR_ID,
            "duplicate_session_calendar_date",
        ),
        (
            [EXCHANGE_SESSIONS[1], EXCHANGE_SESSIONS[0], *EXCHANGE_SESSIONS[2:]],
            CALENDAR_ID,
            "non_increasing_session_calendar",
        ),
        (EXCHANGE_SESSIONS[:30], CALENDAR_ID, "fewer_than_31_calendar_sessions"),
    ],
)
def test_validation_rejects_an_unusable_session_calendar(
    calendar: list[str], calendar_id: str, reason: str
) -> None:
    report = validate_predictions(
        _validation_rows(), session_calendar=calendar, calendar_id=calendar_id
    )

    assert report["status"] == "blocked"
    assert report["blocking_reason"] == reason


def test_validation_rejects_prediction_dates_outside_the_declared_calendar() -> None:
    rows = _validation_rows()
    rows[0]["date"] = "2026-01-01"

    report = validate_predictions(rows, session_calendar=EXCHANGE_SESSIONS, calendar_id=CALENDAR_ID)

    assert report["blocking_reason"] == "prediction_date_outside_session_calendar"


def test_validation_requires_strictly_ordered_prediction_dates() -> None:
    rows = _validation_rows()
    rows[10], rows[11] = rows[11], rows[10]

    report = validate_predictions(rows, session_calendar=EXCHANGE_SESSIONS, calendar_id=CALENDAR_ID)

    assert report["blocking_reason"] == "prediction_sessions_not_strictly_increasing"


def test_validation_rejects_noncontiguous_prediction_sessions() -> None:
    rows = _validation_rows(count=31)
    del rows[15]

    report = validate_predictions(rows, session_calendar=EXCHANGE_SESSIONS, calendar_id=CALENDAR_ID)

    assert report["blocking_reason"] == "noncontiguous_prediction_sessions"


def test_validation_rejects_a_final_prediction_without_a_calendar_successor() -> None:
    calendar = EXCHANGE_SESSIONS[:31]
    rows = _validation_rows(count=30, start=1)

    report = validate_predictions(rows, session_calendar=calendar, calendar_id=CALENDAR_ID)

    assert report["blocking_reason"] == "final_prediction_lacks_successor_session"


@pytest.mark.parametrize(
    "wrong_observed_as_of",
    [
        "2026-01-16",  # same day
        "2026-01-17",  # weekend
        "2026-01-19",  # exchange holiday
        "2026-01-21",  # skipped valid session
    ],
)
def test_validation_requires_observation_on_the_exact_next_exchange_session(
    wrong_observed_as_of: str,
) -> None:
    rows = _validation_rows()
    rows[10]["observed_as_of"] = wrong_observed_as_of

    report = validate_predictions(rows, session_calendar=EXCHANGE_SESSIONS, calendar_id=CALENDAR_ID)

    assert report["blocking_reason"] == "observed_as_of_not_next_session"


@pytest.mark.parametrize(
    ("field", "missing_value", "reason"),
    [
        ("prediction_snapshot_id", None, "missing_prediction_snapshot_id"),
        ("prediction_snapshot_id", " ", "missing_prediction_snapshot_id"),
        ("observation_snapshot_id", None, "missing_observation_snapshot_id"),
        ("observation_snapshot_id", "", "missing_observation_snapshot_id"),
    ],
)
def test_validation_requires_nonblank_snapshot_ids(
    field: str, missing_value: object, reason: str
) -> None:
    rows = _validation_rows()
    rows[0][field] = missing_value

    report = validate_predictions(rows, session_calendar=EXCHANGE_SESSIONS, calendar_id=CALENDAR_ID)

    assert report["blocking_reason"] == reason


@pytest.mark.parametrize(
    ("target_field", "source_field"),
    [
        ("prediction_snapshot_id", "prediction_snapshot_id"),
        ("observation_snapshot_id", "observation_snapshot_id"),
    ],
)
def test_validation_rejects_snapshot_id_reuse_across_inconsistent_sessions(
    target_field: str, source_field: str
) -> None:
    rows = _validation_rows()
    rows[1][target_field] = rows[0][source_field]

    report = validate_predictions(rows, session_calendar=EXCHANGE_SESSIONS, calendar_id=CALENDAR_ID)

    assert report["blocking_reason"] == "inconsistent_snapshot_id_reuse"


def test_validation_allows_a_snapshot_to_link_observation_then_next_prediction(tmp_path) -> None:
    rows = _validation_rows()

    report = _validate_with_archive(rows, tmp_path)

    assert rows[0]["observation_snapshot_id"] == rows[1]["prediction_snapshot_id"]
    assert report["status"] == "pass"


def test_validation_blocks_self_declared_ids_without_external_calendar_and_archive() -> None:
    report = validate_predictions(
        _validation_rows(),
        session_calendar=EXCHANGE_SESSIONS,
        calendar_id=CALENDAR_ID,
    )

    assert report["status"] == "blocked"
    assert report["blocking_reason"] == "missing_calendar_evidence"


def test_validation_blocks_a_tampered_archived_snapshot(tmp_path) -> None:
    rows = _validation_rows()
    calendar_evidence, snapshot_manifest = _validation_archive(tmp_path, rows)
    first_entry = snapshot_manifest["snapshots"][rows[0]["prediction_snapshot_id"]]
    summary_path = snapshot_manifest["archive_root"] / first_entry["summary_path"]
    summary_path.write_text('{"tampered": true}\n', encoding="utf-8")

    report = validate_predictions(
        rows,
        session_calendar=EXCHANGE_SESSIONS,
        calendar_id=CALENDAR_ID,
        calendar_evidence=calendar_evidence,
        snapshot_manifest=snapshot_manifest,
    )

    assert report["status"] == "blocked"
    assert report["blocking_reason"] == "snapshot_summary_hash_mismatch"


@pytest.mark.parametrize(
    ("field", "value", "reason"),
    [
        ("source_url", "https://example.test/fabricated.csv", "untrusted_snapshot_source"),
        ("captured_at", "2026-01-10T21:00:00+00:00", "snapshot_capture_too_late"),
    ],
)
def test_validation_rejects_untrusted_or_late_snapshot_evidence(
    tmp_path, field: str, value: str, reason: str
) -> None:
    rows = _validation_rows()
    calendar_evidence, snapshot_manifest = _validation_archive(tmp_path, rows)
    first_entry = snapshot_manifest["snapshots"][rows[0]["prediction_snapshot_id"]]
    summary_path = snapshot_manifest["archive_root"] / first_entry["summary_path"]
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    summary[field] = value
    summary_bytes = (json.dumps(summary, sort_keys=True) + "\n").encode("utf-8")
    summary_path.write_bytes(summary_bytes)
    first_entry["summary_sha256"] = sha256(summary_bytes).hexdigest()

    report = validate_predictions(
        rows,
        session_calendar=EXCHANGE_SESSIONS,
        calendar_id=CALENDAR_ID,
        calendar_evidence=calendar_evidence,
        snapshot_manifest=snapshot_manifest,
    )

    assert report["status"] == "blocked"
    assert report["blocking_reason"] == reason


def test_validation_rejects_row_ground_truth_that_disagrees_with_the_archive(tmp_path) -> None:
    rows = _validation_rows()
    calendar_evidence, snapshot_manifest = _validation_archive(tmp_path, rows)
    rows[0]["observed_next_day_exposure_change"] = 999.0

    report = validate_predictions(
        rows,
        session_calendar=EXCHANGE_SESSIONS,
        calendar_id=CALENDAR_ID,
        calendar_evidence=calendar_evidence,
        snapshot_manifest=snapshot_manifest,
    )

    assert report["status"] == "blocked"
    assert report["blocking_reason"] == "row_ground_truth_disagrees_with_archive"


def test_validation_rejects_prediction_generated_after_the_observation_snapshot(tmp_path) -> None:
    rows = _validation_rows()
    rows[0]["prediction_generated_at"] = f"{rows[0]['observed_as_of']}T22:00:00+00:00"

    report = _validate_with_archive(rows, tmp_path)

    assert report["status"] == "blocked"
    assert report["blocking_reason"] == "prediction_generated_after_observation_capture"


def test_validation_rejects_weekend_sessions_even_with_a_self_consistent_hash() -> None:
    weekend_calendar = [*EXCHANGE_SESSIONS]
    weekend_calendar[1] = "2026-01-03"
    calendar_bytes = ("\n".join(weekend_calendar) + "\n").encode("utf-8")
    calendar_evidence = {
        "calendar_id": CALENDAR_ID,
        "venue": "XNYS",
        "source_url": "https://www.nyse.com/markets/hours-calendars",
        "source_clause": "NYSE holidays and trading hours for 2026",
        "retrieved_at": "2025-12-15T12:00:00+00:00",
        "sessions_sha256": sha256(calendar_bytes).hexdigest(),
    }

    report = validate_predictions(
        _validation_rows(),
        session_calendar=weekend_calendar,
        calendar_id=CALENDAR_ID,
        calendar_evidence=calendar_evidence,
    )

    assert report["status"] == "blocked"
    assert report["blocking_reason"] == "non_exchange_weekend_session"


def test_operational_prediction_package_runs_the_archive_backed_validator(tmp_path) -> None:
    rows = _validation_rows(errors=[0.05] * 30)
    calendar_evidence, snapshot_manifest = _validation_archive(tmp_path, rows)
    predictions_path = tmp_path / "predictions.jsonl"
    predictions_path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )
    calendar_path = tmp_path / "calendar.json"
    calendar_path.write_text(
        json.dumps(
            {
                "calendar_id": CALENDAR_ID,
                "sessions": EXCHANGE_SESSIONS,
                "evidence": calendar_evidence,
            },
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    manifest_path = tmp_path / "snapshot_manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "archive_root": str(snapshot_manifest["archive_root"]),
                "snapshots": snapshot_manifest["snapshots"],
            },
            sort_keys=True,
        ),
        encoding="utf-8",
    )

    report = validate_prediction_package(
        predictions_path=predictions_path,
        calendar_path=calendar_path,
        snapshot_manifest_path=manifest_path,
    )

    assert report["status"] == "pass"
    assert report["validated_session_count"] == 30
    assert report["snapshot_archive_verified"] is True


def test_validation_rejects_an_unlinked_adjacent_snapshot_chain() -> None:
    rows = _validation_rows()
    rows[1]["prediction_snapshot_id"] = "independent-prediction:2026-01-05"

    report = validate_predictions(rows, session_calendar=EXCHANGE_SESSIONS, calendar_id=CALENDAR_ID)

    assert report["status"] == "blocked"
    assert report["blocking_reason"] == "unlinked_adjacent_snapshots"


def test_validation_rejects_duplicate_prediction_sessions() -> None:
    rows = _validation_rows()
    rows[-1]["date"] = rows[-2]["date"]

    report = validate_predictions(rows, session_calendar=EXCHANGE_SESSIONS, calendar_id=CALENDAR_ID)

    assert report["status"] == "blocked"
    assert report["blocking_reason"] == "prediction_sessions_not_strictly_increasing"


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

    paths = archive_holdings_snapshot(
        raw,
        "TQQQ",
        tmp_path,
        captured_at="2026-07-29T22:00:00+00:00",
    )

    assert paths["raw_path"].name == "2026-07-29.csv"
    assert paths["summary_path"].name == "2026-07-29.json"
    assert paths["raw_path"].read_text(encoding="utf-8") == raw
    summary = json.loads(paths["summary_path"].read_text(encoding="utf-8"))
    assert summary["snapshot_id"] == "proshares:TQQQ:2026-07-29"
    assert summary["captured_at"] == "2026-07-29T22:00:00+00:00"
    assert summary["raw_sha256"] == sha256(raw.encode("utf-8")).hexdigest()
    assert summary["observed_index_exposure"] is None
    assert paths["manifest_entry"]["summary_sha256"] == sha256(
        paths["summary_path"].read_bytes()
    ).hexdigest()

    manifest_path = update_snapshot_manifest(tmp_path, paths["manifest_entry"])
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["snapshots"][summary["snapshot_id"]]["summary_path"] == "TQQQ/2026-07-29.json"

    with pytest.raises(ValueError, match="official ProShares"):
        archive_holdings_snapshot(
            raw,
            "TQQQ",
            tmp_path / "untrusted",
            captured_at="2026-07-29T22:00:00+00:00",
            source_url="https://example.test/fabricated.csv",
        )
