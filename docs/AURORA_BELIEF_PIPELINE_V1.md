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
- priced belief object
- optional thesis monitor result
- decision state
- short memo

## Decision States

- `repair_inputs`: critical data is missing; do not interpret.
- `memo_only`: belief object abstains; use as research memo.
- `causal_model_violation`: driver assumptions break causal/economic constraints; repair before underwriting.
- `equilibrium_pressure_review`: product-market, equity-flow, or reflexivity pressure requires separate review.
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
7. What does price imply?
8. What would falsify the thesis?
9. Did fresh evidence trip anything?
10. What should the investor do next?

That is the production skeleton we can now expose in the UI or feed into future ML.
