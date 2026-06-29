# AURORA Assumption Ledger Engine v1

This layer implements section 18 of `valuation_idea.txt`.

It answers:

```text
Which assumptions are carrying the valuation, what evidence supports them, and what would force us to update or reject them?
```

## Function

`buildAuroraAssumptionLedgerEngine(input, options)` accepts either:

- explicit `assumptionLedger`
- explicit `assumptionRecords`
- `assumptions: { ledger: [...] }`
- a pipeline snapshot with `compiled`, `driverGraph`, `forecast`, and `beliefObject`

It returns:

- normalized assumption objects
- completeness checks
- falsifier checks
- observation shock checks
- update recommendations
- valuation bridge attribution
- review questions
- decision state

## Assumption Object

Each assumption should exist as an object:

```yaml
driver: gross_margin
asOf: 2026-03-31
distribution: logistic_normal
priorMean: 0.62
priorSd: 0.04
source: filing_2026_q1_segment_note
economicMechanism: mix_and_utilization
dependencies:
  - utilization
  - pricing
  - input_costs
falsifier:
  - two_quarters_below_0.55_without_mix_explanation
owner: Tomas
```

The engine can also derive a first ledger from the pipeline posterior and belief-object falsifiers.

## Completeness

The engine checks that each assumption has:

- driver
- as-of date
- distribution
- mean
- uncertainty
- source
- economic mechanism
- dependencies
- falsifier
- owner

Missing fields make the ledger incomplete before underwriting.

## Quarterly Review

When new observations arrive, the engine asks:

1. Which assumptions changed?
2. Which evidence modified them?
3. Should the mean change, or only uncertainty?
4. Did a falsifier occur?
5. Did valuation change because of business, discount rate, or price?

These questions are returned in `reviewQuestions`.

## Update Recommendations

Per assumption:

- `no_material_update`
- `widen_uncertainty_or_wait_for_confirmation`
- `update_mean_and_uncertainty`
- `explain_assumption_change`
- `falsifier_tripped_reunderwrite`

## Decisions

- `assumption_ledger_pending`: no assumptions available.
- `assumption_ledger_incomplete`: assumptions exist but lack required audit fields.
- `assumption_update_required`: new evidence materially challenges at least one assumption.
- `assumption_falsifier_tripped`: a falsifier has occurred.
- `assumption_ledger_usable`: assumptions are complete enough and no major update is required.

## Pipeline Role

The belief pipeline now emits:

```text
assumption_ledger_review
```

when an explicit assumption falsifier trips or the ledger is incomplete.

## Why This Layer Matters

AURORA should not hide valuation logic inside sliders or cells.

Every assumption needs:

- provenance
- uncertainty
- mechanism
- dependency map
- falsifier
- owner

That turns valuation from a static DCF into a living, auditable thesis.
