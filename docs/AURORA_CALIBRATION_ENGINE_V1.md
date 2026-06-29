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
- Brier score
- log score
- permanent loss
- return buckets
- monotonicity

This follows the guide's instruction to evaluate probabilistic distributions, not just point estimates.

## Decisions

- `calibration_pending`: no realized outcomes supplied.
- `calibration_usable`: coverage and event scores are within a usable range.
- `calibration_watch`: calibration is imperfect or return buckets are not monotonic.
- `calibration_failing`: coverage or event scores indicate model failure.

## Pipeline Role

In the belief pipeline, calibration is non-blocking by default because a fresh prediction usually has no realized outcome yet.

If `actuals`, `calibrationRecords`, or `calibrationHistory` are supplied, the pipeline scores them and can emit `calibration_review` when the history is failing.

## Why This Layer Matters

The original guide explicitly warns against optimized backtests and false precision. This layer keeps a running audit trail of whether AURORA's distributions are honest:

```text
An 80% interval should contain roughly 80% of outcomes.
High expected-return buckets should do better than low expected-return buckets.
Negative-return probabilities should behave like probabilities.
```

