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

## Integration Packet

The engine also exports:

```js
buildAuroraCalibrationIntegrationPacket(prediction, calibration, options)
```

This is the production-facing adapter. It applies the recalibration policy to a copy of the prediction, not to the original forecast object.

It returns:

- `calibratedForecast`: posterior distributions and scenarios with center shifts and uncertainty scaling applied
- `calibratedValuationEnsemble`: value range, weighted fair value, expected return, and disagreement adjusted by the policy
- `riskControls`: confidence haircut, negative-return probability, uncertainty scale, abstention threshold, and `shouldAbstain`
- `appliedAdjustments`: the exact variable and global adjustments used
- `warnings`: integration caveats such as pending outcomes, shadow-only calibration, failed calibration, or backtest-overfitting pressure

Integration modes:

- `observe_only`: no scored history yet; collect outcomes without changing production behavior.
- `production_monitoring`: calibration is usable; the calibrated branch can be used with monitoring.
- `shadow`: calibration is imperfect; run the calibrated branch beside production before promotion.
- `conservative_override`: calibration is failing; freeze promotion, widen uncertainty, haircut confidence, and abstain.

The original forecast remains untouched. This is deliberate: product code can compare raw vs calibrated outputs and decide exactly when to adopt the calibrated branch.

## Calibration Authority

The engine now emits a compact `calibrationAuthority` object. This is the integration-facing contract for product code that should not reverse-engineer raw coverage, Brier, monotonicity, and experiment-risk metrics.

It answers:

```text
How much right does this calibrated branch have to influence an investor decision?
```

It includes:

- `authorityScore`: 0-1 score combining sample reliability, 80% interval coverage, negative-return Brier score, return-bucket monotonicity, and experiment-risk pressure.
- `evidenceTier`: `insufficient_history`, `decision_grade`, `research_grade`, `shadow_grade`, or `memo_only`.
- `decisionRights`: `observe_only`, `use_calibrated_branch_with_monitoring`, `stage_with_guardrails`, `shadow_or_memo_only`, or `freeze_promotion`.
- `mode`: product-friendly mode: `observe_only`, `production_monitoring`, `guardrailed_stage`, `shadow`, or `conservative_override`.
- `hardBlocks`: reasons production use is blocked, such as calibration failure, high backtest-overfitting pressure, insufficient realized outcomes, coverage failure, bad negative-return probability, or non-monotonic return buckets.
- `requiredEvidence`: the next evidence needed to earn more authority.

The integration packet copies this object into `calibrationIntegration.calibrationAuthority` and mirrors the key fields into `riskControls`:

- `authorityScore`
- `authorityMode`
- `decisionRights`
- `shouldAbstain`

This is intentionally stricter than `calibration.decision`. A calibration history can be directionally useful while still lacking enough realized outcomes to earn production decision rights.

## Decisions

- `calibration_pending`: no realized outcomes supplied.
- `calibration_usable`: coverage and event scores are within a usable range.
- `calibration_watch`: calibration is imperfect or return buckets are not monotonic.
- `calibration_failing`: coverage or event scores indicate model failure.

## Pipeline Role

In the belief pipeline, calibration is non-blocking by default because a fresh prediction usually has no realized outcome yet.

If `actuals`, `calibrationRecords`, or `calibrationHistory` are supplied, the pipeline scores them and can emit `calibration_review` when the history is failing.

The pipeline memo surfaces both the recalibration action and the integration mode, so a product integration can read the policy directly instead of reverse-engineering raw calibration metrics.

## Why This Layer Matters

The original guide explicitly warns against optimized backtests and false precision. This layer keeps a running audit trail of whether AURORA's distributions are honest:

```text
An 80% interval should contain roughly 80% of outcomes.
High expected-return buckets should do better than low expected-return buckets.
Negative-return probabilities should behave like probabilities.
```
