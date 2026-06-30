# AURORA Omega V8 First Rolling Results

Date: 2026-06-29

## Verdict

The priced-belief dataset is real enough to keep pushing.

This was not a dead-end run. The first purged rolling-origin test produced three important signals:

1. `research_priority_target` is currently the best overall product target.
2. `expectation_violation_score` has the sharpest pure return-sorting signal, but on fewer mature folds.
3. The hand-written formula baseline is materially weaker than learned nonlinear models.

That means AURORA should keep moving toward a belief-ranking system, not back toward a plain formulaic router.

## Leaderboard read

### 1. `expectation_violation_score`

- `rf`: return IC `0.244`, decile spread `0.094`, folds `3`
- `hist_gbr`: return IC `0.136`, decile spread `0.032`, folds `3`
- `formula_baseline`: weak and negative spread

Interpretation:

- This target may be the best "truth probe" for whether market-implied beliefs are wrong.
- It is promising, but we only have `3` mature folds here, so it is not yet the main production objective.

### 2. `research_priority_target`

- `hist_gbr`: return IC `0.216`, decile spread `0.136`, positive spread share `0.833`
- `rf`: return IC `0.195`, decile spread `0.106`, positive spread share `0.833`
- `ridge`: weaker IC, but surprisingly stable positive spread `1.000`
- `formula_baseline`: clearly poor

Interpretation:

- This is the current best product-facing objective.
- It best matches the actual AURORA claim: rank what deserves research attention, not only what minimizes return MAE.

### 3. `ann_return_3y_fwd`

- `rf`: return IC `0.188`, decile spread `0.112`
- `hist_gbr`: return IC `0.183`, decile spread `0.154`
- `ridge`: weaker but positive
- `formula_baseline`: poor

Interpretation:

- Plain return prediction still works reasonably well.
- But it does not beat the richer `research_priority_target` on IC.
- This supports the thesis that the product should optimize for ranked thesis quality, not raw return alone.

## What this means strategically

The main conclusion is not "random forest wins."

The main conclusion is:

`research_priority_target` appears closer to the real product than raw return prediction.

That is exactly the direction we wanted:

- AURORA should not become only a return forecaster.
- AURORA should rank where priced beliefs look wrong and where research is likely to pay off.

At the same time:

- `expectation_violation_score` looks like a strong sub-engine.
- It may become the belief-distortion component inside the larger research-priority system.

## Recommended architecture move

Do not jump to a bigger neural model yet.

The next step should be a two-layer champion path:

### Layer A: belief error engine

Use `expectation_violation_score` to estimate where market-implied assumptions are likely wrong.

### Layer B: research prioritization engine

Use `research_priority_target` as the main ranking objective for the product.

Then combine them:

- belief distortion
- feasibility
- downside anchor
- falsifiability / monitoring quality

This is much closer to AURORA as a market-belief intelligence system.

## Immediate next experiments

### 1. Champion selection with diagnostics

Run a fuller comparison between:

- `hist_gbr`
- `rf`
- `ridge`

for both:

- `research_priority_target`
- `expectation_violation_score`

But add:

- by-regime IC
- sector-neutral IC
- per-fold spread stability
- top-decile overlap

### 2. Two-stage ranker

Build:

- Stage 1: model `expectation_violation_score`
- Stage 2: combine Stage 1 output with Omega feasibility / anchors into `research_priority_target`

This is the cleanest next attempt to turn the ontology into a usable ranker.

### 3. Monotonic / constrained challenger

Try a more disciplined model class:

- monotonic gradient boosting if feasible
- or a constrained additive model

Reason:

- `ridge` had weaker IC but surprisingly stable spread behavior.
- That suggests some of the signal may benefit from more disciplined inductive bias.

### 4. Regime diagnostics before scale-up

Before any production-style promotion, audit:

- compounders
- financials
- cyclicals
- bottleneck names
- pre-profit platforms

We need to know whether the current edge is broad or concentrated.

## Current recommendation

For now:

- Treat `hist_gbr` on `research_priority_target` as the provisional champion.
- Treat `rf` on `expectation_violation_score` as the best belief-error probe.
- Treat the formula baseline as obsolete except as a sanity anchor.

## North star preserved

These results support the ambitious thesis rather than weaken it.

The correct reading is:

The first historical test already suggests that the market-belief framing is more useful than a plain return target.

That is the right direction for AURORA Omega.
