# AURORA Priced Belief Backtest v1

This module exists to move AURORA closer to the real product thesis:

```text
price -> implied belief -> realized business outcome -> memo truth -> error genome
```

The goal is not to backtest another expected-return model. The goal is to create a historical audit trail of what the market price required, what the business later delivered, and what kind of reasoning error occurred when AURORA was wrong.

## What It Does

`buildAuroraPricedBeliefBacktest(input, options)` accepts records with:

- `prediction`, `pipeline`, or `compiled` AURORA objects
- `actuals` or realized outcomes

It returns a durable backtest object with:

- `marketImpliedBeliefs`
- `realizedOutcomes`
- `expectationViolation`
- `memoTruth`
- `errorGenome`

## Expectation Violation

For each row the backtest compares:

- implied growth vs realized growth
- implied margin vs realized margin
- implied ROIC vs realized ROIC
- implied FCF margin vs realized FCF margin
- implied dilution vs realized dilution

It then builds:

- component-level expectation violations
- a weighted composite expectation-violation score
- direction matching between predicted belief-gap and realized business outcome

This answers:

```text
Did the business beat or miss the future embedded in price?
```

## Memo Truth

The backtest also scores whether the memo was structurally right:

- was the implied-belief direction right?
- did AURORA identify the value driver that actually dominated the realized outcome?
- did the predicted abstention look sensible?
- did the key falsifier trigger?

This begins to align validation with the actual product claim: AURORA should support a professional investment memo, not only a noisy return estimate.

## Error Genome

Every row is also classified into a first-pass error taxonomy:

- `price_implied_error`
- `fundamental_forecast_error`
- `value_driver_error`
- `falsifier_error`
- `evidence_error`
- `abstention_error`
- `multiple_or_timing_error`
- `reflexivity_or_timing_error`

This is intentionally simple, but it gives the learning loop a durable place to start.

## Why This Matters

Without this layer, the priced-belief object is intellectually interesting but historically mute.

With this layer, AURORA can begin to answer:

- which belief distortions actually resolved?
- which memo claims were true?
- which falsifiers mattered?
- when were we right on fundamentals but wrong on market timing?
- which kind of error keeps repeating?

That is much closer to a market-belief intelligence system than to a smarter valuation score.

## Usage

```bash
node scripts/run_aurora_priced_belief_backtest.mjs --input priced-belief-records.json --output priced-belief-backtest.json
```

Example input:

```json
{
  "records": [
    {
      "prediction": {
        "beliefObject": {
          "ticker": "ASML"
        }
      },
      "actuals": {
        "growth": 0.14,
        "margin": 0.31,
        "roic": 0.27,
        "fcfMargin": 0.21,
        "dilution": 0.005,
        "realizedReturn": 0.18
      }
    }
  ]
}
```

## Integration Path

1. Run this over historical AURORA predictions with matured outcomes.
2. Feed the summary into calibration authority and memo validation.
3. Track repeated error-genome patterns by sector, archetype, and regime.
4. Use memo-truth labels to improve falsifier and value-driver generation.
5. Promote only when priced-belief direction, memo truth, and abstention all behave well together.
