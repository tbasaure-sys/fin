# AURORA Belief Pipeline v1

The pipeline is the first end-to-end isolated AURORA intelligence loop.

It composes the layers we built without wiring them into the older Valuation OS router yet:

```text
documents / raw evidence
  -> Evidence Signal Extractor
financial statements
  -> Accounting Engine
product/equity market inputs
  -> Equilibrium Engine
  -> Belief Compiler
  -> Causal Driver Graph
  -> Bayesian Forecast Engine
  -> Valuation Ensemble
  -> Priced Belief Object
  -> Thesis Monitor
  -> Pipeline Decision
```

## Function

`runAuroraBeliefPipeline(input, options)` accepts:

- `company`
- `market`
- `macro`
- `financials`
- `documents` or prebuilt `evidence`
- optional `observations`

It returns:

- extracted evidence
- economic accounting adjustments
- product-market and equity-market equilibrium pressure
- merged compiler evidence
- compiled drivers
- causal driver graph
- posterior forecast distribution
- valuation ensemble and method disagreement
- priced belief object
- optional thesis monitor result
- decision state
- short memo

## Decision States

- `repair_inputs`: critical data is missing; do not interpret.
- `memo_only`: belief object abstains; use as research memo.
- `causal_model_violation`: driver assumptions break causal/economic constraints; repair before underwriting.
- `equilibrium_pressure_review`: product-market, equity-flow, or reflexivity pressure requires separate review.
- `forecast_requires_review`: Bayesian posterior assumptions or forecast uncertainty require review.
- `valuation_ensemble_review`: intrinsic valuation methods disagree too much or too few lenses are usable.
- `priced_belief_ready`: compiled object is ready, but no monitor has run.
- `active_thesis_intact`: monitor ran and falsifiers are intact.
- `thesis_deteriorating`: evidence is worsening but no hard falsifier has tripped.
- `thesis_broken_or_needs_reunderwriting`: at least one falsifier tripped.
- `refresh_required`: thesis half-life expired.

## CLI

Single company:

```bash
node scripts/run_aurora_belief_pipeline.mjs --input pipeline.json --output result.json
```

Panel:

```bash
node scripts/run_aurora_belief_pipeline.mjs --input pipeline-panel.json --panel --output panel.json
```

## Why This Layer Matters

This is the first place AURORA behaves like a coherent system instead of separate utilities.

It does not train a model and it does not claim magic. It forces the workflow to be explicit:

1. What evidence was read?
2. What signals were extracted?
3. What accounting adjustments were made?
4. What is product-market and equity-market pressure?
5. What drivers were compiled?
6. Are those drivers causally compatible?
7. What posterior distribution follows from the priors, evidence, dependencies, and price?
8. What do distinct valuation lenses say each future is worth?
9. What does price imply?
10. What would falsify the thesis?
11. Did fresh evidence trip anything?
12. What should the investor do next?

That is the production skeleton we can now expose in the UI or feed into future ML.
