# AURORA Omega V8 Two-Stage and Blend Results

Date: 2026-06-29

## What we tested

After the first rolling-origin result showed that:

- `research_priority_target` was the best product objective,
- `expectation_violation_score` was a strong belief-error probe,

we tested the next architecture layer:

1. strict two-stage ranker
   - Stage 1: `rf` predicts `expectation_violation_score`
   - Stage 2: `hist_gbr` predicts `research_priority_target` using Stage 1 output
2. disciplined challenger
   - Stage 2 with `ridge`
3. belief-adjusted blend
   - `0.75 * single_stage_hist_gbr_z + 0.25 * stage1_belief_probe_z`

The goal was not just better target fit. The real test was:

- return IC
- decile spread
- spread stability
- sector-neutral behavior
- by-regime behavior

## Main result

The pure two-stage model did **not** become the new champion.

But the belief-adjusted blend **did**.

## Leaderboard

### Belief-adjusted blend

- folds: `5`
- mean return IC: `0.2206`
- mean decile spread: `0.1255`
- positive spread share: `0.80`
- mean sector-neutral return IC: `0.0987`

### Previous single-stage champion

`single_stage_hist_gbr`

- folds: `5`
- mean return IC: `0.2127`
- mean decile spread: `0.1178`
- positive spread share: `0.80`
- mean sector-neutral return IC: `0.0957`

### Other models

`single_stage_rf`

- mean return IC: `0.1963`
- mean decile spread: `0.1058`

`two_stage`

- mean return IC: `0.1842`
- mean decile spread: `0.1279`
- positive spread share: `1.00`

`formula_baseline`

- clearly inferior

## Interpretation

This is the key architectural insight:

The Stage 1 belief probe is useful, but the fully learned Stage 2 stack is too aggressive.

The market-belief signal helps most when it is used as a **small corrective layer** on top of the best single-stage research-priority model.

In plain terms:

- single-stage `hist_gbr` remains the strongest base engine
- Stage 1 belief distortion adds incremental value
- a light blend is better than a full hierarchical model, at least right now

## What failed

### Pure two-stage stack

The two-stage model improved stability of spread, but it lost too much IC versus the single-stage champion.

This suggests:

- the Stage 1 signal is real
- but the second learned layer is probably overfitting or discarding useful base-ranker information

### Ridge Stage 2

The ridge version was clearly worse.

So the answer is not "make Stage 2 simpler" in a naive way.

## Why the blend matters

This is the first result that actually strengthens the product thesis:

The best ranker is no longer just a return model or just a composite target model.
It is a research-priority model that is slightly corrected by a market-belief error signal.

That is much closer to the intended AURORA architecture:

price -> implied belief -> belief error probe -> research priority ranking

## Regime read

The belief-adjusted blend is strongest in:

- `regulated_utility_infrastructure`
- `quality_compounder`
- `commodity_resource`
- `bottleneck_oligopoly`

It is weakest in:

- `expensive_compounder`

That last point matters. It suggests one of two things:

1. the expensive-compounder belief probe is still too noisy, or
2. that regime needs a more explicit expectation-feasibility / duration-risk treatment

## Strategic conclusion

The next production-style shadow champion should be:

`belief_adjusted_blend`

not:

- the old formula baseline
- the raw two-stage stack
- or plain return prediction alone

## Recommended next step

Build **Blend V2**, not Two-Stage V2.

### Blend V2 should add:

1. regime-aware blend weights
   - different belief-correction strength by regime
2. explicit expensive-compounder penalty logic
   - duration / expectation pressure / terminal-fragility wedge
3. stronger bottleneck and capital-cycle overlays where those regimes are active
4. per-regime champion diagnostics written automatically to artifacts

## Practical north star

The architecture is clarifying:

- Base engine: `single_stage_hist_gbr` on `research_priority_target`
- Belief probe: `rf` on `expectation_violation_score`
- Product candidate: belief-adjusted blend

That is the cleanest current path toward AURORA as a market-belief intelligence system.
