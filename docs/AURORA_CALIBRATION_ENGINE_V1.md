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
- priced-belief expectation-violation diagnostics
- Brier score for negative-return events
- log score for negative-return events
- return buckets for walk-forward diagnostics
- monotonicity between predicted and realized return buckets
- permanent-loss rate
- experiment-count pressure for backtest-overfitting risk
- contextual calibration segments by horizon, sector, archetype, horizon-archetype, horizon-sector, and decision state
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

## Expectation-Violation Calibration

The engine now also scores whether AURORA's priced-belief direction was right.

For each realized record it compares:

- predicted `beliefGap` from the priced-belief object
- observed realized-minus-implied outcome for:
  - growth
  - margin
  - ROIC
  - reinvestment
  - FCF margin

This produces:

- component-level gap bias
- component-level mean absolute error
- component-level direction accuracy
- composite expectation-violation bias
- composite expectation-violation mean absolute error
- composite expectation-violation direction accuracy

This matters because the product claim is not only "did the return forecast look good?" but also:

```text
Did AURORA correctly judge whether the future embedded in price was too hard or too easy?
```

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

## Contextual Calibration

The engine also emits:

```js
calibration.contextualCalibration
```

This prevents one global calibration average from silently overriding different business realities. AURORA now scores eligible segment policies for:

- `horizon`
- `sector`
- `archetype`
- `horizon_archetype`
- `horizon_sector`
- `decision_state`

Each segment includes:

- segment key and readable label
- scored outcome count
- segment decision
- segment recalibration policy
- segment authority packet
- eligibility flag

The integration packet can then select the most specific eligible segment matching the current prediction context. For example, a 3Y semiconductor/capacity-cycle record can use a `horizon_sector` or `horizon_archetype` policy instead of a global correction learned from unrelated 1Y or financial-sector outcomes.

This is intentionally bounded. The contextual policy is blended with the global policy rather than replacing it outright. Segment calibration is allowed to influence the calibrated branch only when enough realized outcomes exist for that segment and the segment is not failing coverage or negative-return probability checks.

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
- `contextualCalibration`: whether a matching contextual segment was used, which segment was selected, and why no segment was used if none matched
- `warnings`: integration caveats such as pending outcomes, shadow-only calibration, failed calibration, or backtest-overfitting pressure

Integration modes:

- `observe_only`: no scored history yet; collect outcomes without changing production behavior.
- `production_monitoring`: calibration is usable; the calibrated branch can be used with monitoring.
- `shadow`: calibration is imperfect; run the calibrated branch beside production before promotion.
- `conservative_override`: calibration is failing; freeze promotion, widen uncertainty, haircut confidence, and abstain.

The original forecast remains untouched. This is deliberate: product code can compare raw vs calibrated outputs and decide exactly when to adopt the calibrated branch.

### Integration-Ready Contract

Product code should read, in order:

1. `calibrationIntegration.calibrationAuthority`
2. `calibrationIntegration.contextualCalibration`
3. `calibrationIntegration.riskControls`
4. `calibrationIntegration.appliedAdjustments`

The calibration branch is ready for integration when:

- `calibrationAuthority.decisionRights` is not `observe_only` or `freeze_promotion`
- `riskControls.shouldAbstain` is false
- `contextualCalibration.applied` is true, or the global calibration authority is decision-grade
- hard blocks are empty

If these checks do not pass, the calibrated branch should be shown as shadow/diagnostic evidence, not as a production decision override.

## Calibration Authority

The engine now emits a compact `calibrationAuthority` object. This is the integration-facing contract for product code that should not reverse-engineer raw coverage, Brier, monotonicity, and experiment-risk metrics.

It answers:

```text
How much right does this calibrated branch have to influence an investor decision?
```

It includes:

- `authorityScore`: 0-1 score combining sample reliability, 80% interval coverage, negative-return Brier score, return-bucket monotonicity, and experiment-risk pressure.
- expectation-violation direction accuracy now also affects authority when enough realized labels exist.
- `evidenceTier`: `insufficient_history`, `decision_grade`, `research_grade`, `shadow_grade`, or `memo_only`.
- `decisionRights`: `observe_only`, `use_calibrated_branch_with_monitoring`, `stage_with_guardrails`, `shadow_or_memo_only`, or `freeze_promotion`.
- `mode`: product-friendly mode: `observe_only`, `production_monitoring`, `guardrailed_stage`, `shadow`, or `conservative_override`.
- `hardBlocks`: reasons production use is blocked, such as calibration failure, high backtest-overfitting pressure, insufficient realized outcomes, coverage failure, bad negative-return probability, or non-monotonic return buckets.
- `expectation_violation_inverted` is emitted when AURORA repeatedly points the priced-belief gap in the wrong direction on realized outcomes.
- `requiredEvidence`: the next evidence needed to earn more authority.

The integration packet copies this object into `calibrationIntegration.calibrationAuthority` and mirrors the key fields into `riskControls`:

- `authorityScore`
- `authorityMode`
- `decisionRights`
- `shouldAbstain`

This is intentionally stricter than `calibration.decision`. A calibration history can be directionally useful while still lacking enough realized outcomes to earn production decision rights.

## Calibration Contract

The integration packet now also emits:

```js
calibrationIntegration.calibrationContract
```

This is the narrow product contract. It is designed so the UI, API, or future portfolio-sizing layer can integrate calibration without reverse-engineering the whole scoring report.

It answers:

```text
Can the calibrated branch influence the decision, and if so, how much?
```

Key fields:

- `status`: `ready`, `guardrailed`, `shadow`, `observe`, or `blocked`.
- `branch`: which branch product code should treat as primary, for example `calibrated_primary`, `calibrated_with_size_cap`, `raw_primary_calibrated_shadow`, `raw_primary_collect_outcomes`, or `raw_primary_calibration_risk_override`.
- `canUseForDecision`: true only when authority, abstention, and hard-block checks all allow decision use.
- `adoption.calibratedWeight`: bounded weight for blending calibrated output into the displayed decision branch.
- `adoption.maxPositionSizeMultiplier`: sizing cap for decision or portfolio code. It is zero for observe/shadow/blocked states.
- `productRead`: compact values for product integration: primary branch, secondary branch, confidence, uncertainty scale, negative-return probability, abstention flag, and calibrated-vs-raw expected-return delta.
- `contextualCalibration`: whether a matching segment policy was actually used.
- `monitoring`: the metrics and revocation triggers that must be tracked after integration.

Contract statuses:

- `ready`: calibrated branch may be primary, with monitoring.
- `guardrailed`: calibrated branch may influence the decision, but raw comparison and sizing caps are required.
- `shadow`: show or log the calibrated branch beside raw output; do not let it drive decisions.
- `observe`: collect realized outcomes; do not use calibration for decisions.
- `blocked`: keep raw output primary, use calibration only as a risk override or warning, and abstain from calibrated decision use.

This contract is stricter than both `recalibrationPolicy.action` and `calibrationIntegration.mode`. The policy can say that recalibration is directionally useful, while the contract can still keep it in `guardrailed` or `shadow` until authority is high enough.

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
