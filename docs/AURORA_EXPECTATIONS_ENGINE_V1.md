# AURORA Expectations Engine v1

This layer implements the guide's instruction that reverse DCF should be a surface, not a single number.

The Valuation Ensemble estimates intrinsic value. The Expectations Engine turns market price into a question:

```text
What combinations of growth, margin, ROIC, reinvestment, and cost of capital make the current price reasonable?
```

## Function

`buildAuroraExpectationsEngine(input, options)` accepts a belief-pipeline output with:

- `forecast`
- `valuationEnsemble`
- `accounting`
- `compiled`

It returns:

- a growth x margin reverse DCF surface
- a market-clearing contour
- posterior overlays for growth, margin, ROIC, and reinvestment
- management / consensus scenario overlays when provided
- feasibility scores for each surface cell
- a decision label

## Surface

Each cell contains:

- growth
- margin
- inferred ROIC
- inferred reinvestment
- WACC
- terminal growth
- value
- value-to-price
- feasibility
- region label

The key regions are:

- `value_above_price`
- `value_below_price`
- `near_market_contour`

## Market Contour

The contour is the set of cells closest to the current market price.

This is the reverse DCF answer. It does not say "the stock is worth X." It says:

```text
The market roughly requires this bundle of operating outcomes.
```

## Feasibility

Feasibility compares each cell to the Bayesian posterior and basic economic constraints:

- high growth needs reinvestment
- margin and ROIC must be coherent
- growth below cost of capital is penalized
- heroic cells can exist, but they are marked as low feasibility

If the current price is far above the intrinsic ensemble, the grid expands into a more demanding region instead of hiding the heroic assumptions off-chart.

## Decisions

- `market_expectations_feasible_with_upside`: posterior and surface imply price is not demanding.
- `market_expectations_balanced`: market price is roughly aligned with feasible outcomes.
- `market_expectations_demanding`: market price requires demanding assumptions.
- `market_expectations_heroic`: market price requires low-feasibility assumptions.
- `expectations_surface_insufficient`: surface could not be built.

## Why This Layer Matters

This is the interface shift described in the original guide:

```text
Not: Is it cheap?
But: Is the company likely to reach the set of outcomes the quote requires?
```

The next natural layer is the feasibility manifold: learning which parts of this surface are historically and economically plausible for each sector.

