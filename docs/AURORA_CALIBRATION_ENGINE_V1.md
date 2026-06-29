# AURORA Calibration Engine v1

This layer implements the calibration section of `valuation_idea.txt`.

It answers:

```text
Is AURORA actually calibrated, or does it only sound sophisticated?
```

## Function

`buildAuroraCalibrationEngine(input, options)` accepts either:

- one prediction snapshot, which becomes `pending_outcome`
- `{ records: [{ prediction, actuals }] }`, which becomes scored calibration history

It returns:

- record-level forecast errors
- 80% interval coverage
- CRPS-style continuous scores
- Brier score for negative-return events
- log score for negative-return events
- return buckets for walk-forward diagnostics
- monotonicity between predicted and realized return buckets
- permanent-loss rate
- experiment-count pressure for backtest-overfitting risk
- a recalibration policy that can be applied by downstream engines

## Continuous Calibration

The engine scores:

- growth
- margin
- ROIC
- reinvestment
- value

For each variable it reports:

- bias
- mean absolute error
- 80% interval coverage
- interval width
- CRPS

## Investment Calibration

The engine scores:

- predicted return vs realized return
- probability of negative return
- observed negative return
- average predicted negative-return probability
- observed negative-return rate
- Brier score
- log score
- permanent loss
- return buckets
- monotonicity

This follows the guide's instruction to evaluate probabilistic distributions, not just point estimates.

## Recalibration Policy

The engine now emits `recalibrationPolicy`, a compatible output branch for integration work.

It answers:

```text
Given the outcomes we have seen, how should AURORA adjust future predictions?
```

The policy includes:

- variable-level center shifts for growth, margin, ROIC, reinvestment, and value
- variable-level interval scaling against the 80% coverage target
- global return-bias shift
- negative-return probability shift
- uncertainty scaling
- confidence haircut
- abstention-threshold shift
- reliability based on the number of scored outcomes

Policy actions:

- `collect_realized_outcomes`: no scored history yet.
- `apply_recalibration_with_monitoring`: history is usable enough to apply modest adjustments.
- `apply_recalibration_in_shadow`: calibration is watch-level; apply in shadow before changing production decisions.
- `freeze_promotion_and_apply_conservative_overrides`: calibration is failing; do not promote, widen uncertainty, haircut confidence, and raise abstention.

## Decisions

- `calibration_pending`: no realized outcomes supplied.
- `calibration_usable`: coverage and event scores are within a usable range.
- `calibration_watch`: calibration is imperfect or return buckets are not monotonic.
- `calibration_failing`: coverage or event scores indicate model failure.

## Pipeline Role

In the belief pipeline, calibration is non-blocking by default because a fresh prediction usually has no realized outcome yet.

If `actuals`, `calibrationRecords`, or `calibrationHistory` are supplied, the pipeline scores them and can emit `calibration_review` when the history is failing.

The pipeline memo also surfaces the recalibration action, so a product integration can read the policy directly instead of reverse-engineering raw calibration metrics.

## Why This Layer Matters

The original guide explicitly warns against optimized backtests and false precision. This layer keeps a running audit trail of whether AURORA's distributions are honest:

```text
An 80% interval should contain roughly 80% of outcomes.
High expected-return buckets should do better than low expected-return buckets.
Negative-return probabilities should behave like probabilities.
```
