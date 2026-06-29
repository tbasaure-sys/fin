# AURORA Feasibility Manifold v1

This layer implements one of the most original ideas in `valuation_idea.txt`: use ML-style geometry for plausibility, not as a magic return predictor.

The Expectations Engine asks:

```text
What growth and margin surface does the market price require?
```

The Feasibility Manifold asks:

```text
Which regions of that surface are economically plausible for this kind of business?
```

## Function

`buildAuroraFeasibilityManifold(input, options)` accepts a belief-pipeline output with:

- `expectations`
- `accounting`
- `equilibrium`
- `compiled`

It returns:

- annotated surface cells
- sector archetype
- deterministic sector kernel
- nearest synthetic trajectory for each cell
- explicit constraint violations
- plausible / stretched / implausible / impossible classes
- market-contour feasibility
- decision label

## Kernels

V1 uses auditable deterministic kernels instead of a trained model:

- `financial`
- `asset_light_platform`
- `asset_heavy`
- `capacity_cycle`
- `event_driven`
- `general`

Each kernel has prototype trajectories and spreads for:

- growth
- margin
- ROIC
- reinvestment

This is deliberately not a universal model. A bank, SaaS company, semicap bottleneck, miner, and biotech option should not share the same geometry.

## Constraints

The manifold penalizes explicit economic impossibilities:

- high growth without reinvestment
- physical growth without capacity / capex / utilization pressure
- high margins without pricing power or bottleneck evidence
- very high ROIC at scale with low asset turnover
- levered growth funding gaps
- growth below cost of capital

## Decisions

- `manifold_usable`: market contour is inside plausible or stretched economic geometry.
- `market_contour_stretched`: current price requires assumptions near the edge of plausible geometry.
- `market_contour_implausible`: market contour is mostly implausible or impossible.
- `manifold_insufficient`: no surface cells are available.

## Why This Layer Matters

The guide warns against arbitrary Monte Carlo and arbitrary DCF assumptions. This layer turns that warning into a product primitive.

It lets AURORA say:

```text
The quote requires this operating outcome,
and that outcome is outside the historically/economically plausible manifold
for this type of business.
```

Future versions can replace the deterministic kernels with trained historical geometry: Gaussian mixtures, normalizing flows, isolation forests, or nearest historical trajectories.

