# AURORA Omega V8 Blend V2 Results

Date: 2026-06-29

## What changed

Blend V2 keeps the winning base architecture from the first blend test:

- base engine: `single_stage_hist_gbr` trained on `research_priority_target`
- belief probe: `rf` trained on `expectation_violation_score`

Then it adds three explicit policy adjustments:

1. regime-aware belief weights
2. expensive-compounder expectation/duration penalty
3. bottleneck-regime overlay

This keeps the belief signal as a corrective layer instead of forcing the full two-stage stack to relearn the ranking.

## Blend V2 policy

Regime belief weights:

- `quality_compounder`: `0.30`
- `commodity_resource`: `0.30`
- `bottleneck_oligopoly`: `0.30`
- `regulated_utility_infrastructure`: `0.25`
- `general_intrinsic`: `0.25`
- `asset_heavy_cyclical`: `0.20`
- `financial_book_capital`: `0.15`
- `pre_profit_platform`: `0.10`
- `expensive_compounder`: `0.05`

Additional overlays:

- expensive compounders: penalize combined expectation pressure and duration risk
- expensive compounders: add a small feasibility offset
- bottleneck oligopolies: add a bottleneck-strength overlay

## Main result

Blend V2 became the new shadow champion.

### Leaderboard

`blend_v2`

- folds: `5`
- mean return IC: `0.2262`
- mean decile spread: `0.1444`
- positive spread share: `1.00`
- sector-neutral return IC: `0.1081`
- sector-neutral spread: `0.0713`

`belief_adjusted_blend`

- mean return IC: `0.2206`
- mean decile spread: `0.1255`
- positive spread share: `0.80`

`single_stage_hist_gbr`

- mean return IC: `0.2127`
- mean decile spread: `0.1178`
- positive spread share: `0.80`

`two_stage`

- mean return IC: `0.1842`
- mean decile spread: `0.1279`
- positive spread share: `1.00`

`formula_baseline`

- mean return IC: `0.0586`
- mean decile spread: `-0.0221`

## Why this matters

Blend V2 improves on the previous champion on the metrics that matter most for AURORA:

- higher return IC
- higher decile spread
- all evaluated folds positive on spread
- stronger sector-neutral behavior

This is a better fit for the product thesis than a raw return model or a pure two-stage learner.

## Per-fold read

Blend V2 did not win every year on return IC, but it improved the worst cases:

- 2020: single-stage spread was negative, Blend V2 turned it positive
- 2021: Blend V2 improved return IC and spread versus single-stage
- 2022: Blend V2 kept spread positive

This is exactly what the belief correction is supposed to do: reduce fragile ranking failures.

## Regime read

Blend V2 is strongest in:

- `regulated_utility_infrastructure`
- `quality_compounder`
- `bottleneck_oligopoly`
- `commodity_resource`

It remains weaker in:

- `financial_book_capital`
- `expensive_compounder`

The expensive-compounder penalty improved the regime from clearly negative to roughly flat on return IC, but decile spread remains negative. That regime still needs its own expectation-feasibility engine.

## Current interpretation

The best current AURORA Omega V8 architecture is:

`research_priority_base + belief_probe + regime_policy_overlay`

not:

- formula-only
- full learned two-stage
- raw 3Y return prediction

## Next step

Build Blend V3 around the remaining weak regime:

`expensive_compounder`

That next layer should focus on:

- explicit duration-risk scoring
- market-implied growth and margin burden
- terminal multiple fragility
- quality/ROIC offset only when feasibility is strong

The goal is not to over-penalize expensive names. The goal is to distinguish:

- expensive but feasible compounders
- expensive expectation traps

That distinction is central to the priced-belief vision.
