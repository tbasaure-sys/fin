# AURORA Dashboard Contract v1

This layer implements the dashboard section of `valuation_idea.txt`.

It answers:

```text
What should an investor-facing AURORA screen show, and which views are actually supported by current evidence?
```

It is not a React component. It is a stable contract between the AURORA engines and any future UI.

## Function

`buildAuroraDashboardContract(input, options)` accepts a full belief-pipeline output or the same component outputs:

- compiled drivers and belief object
- Bayesian forecast
- calibrated forecast branch
- valuation ensemble
- expectations surface
- feasibility manifold
- driver graph
- competitor graph
- semiconductor sector twin
- assumption ledger
- calibration history
- calibration authority and decision rights
- capital allocation scorecard
- optional expectation history and analog paths

It returns:

- `primaryPanel`
- `visualizations`
- `readiness`
- `decisionPacket`
- `sensitivityProxy`
- `warnings`
- `investorQuestions`
- `memo`

## Primary Panel

The panel is shaped around the guide's required metrics:

- value P10/P50/P90
- probability that value is below price
- expected five-year IRR
- IRR distribution
- probability of negative IRR
- moat half-life
- posterior ROIC / ROIIC proxy
- market-implied revenue CAGR
- market-implied terminal margin
- expected dilution
- dominant drivers
- data quality
- model disagreement

The contract prefers the calibrated branch when the Calibration Integration Packet is available, but it does not mutate the raw forecast.

It also exposes `primaryPanel.calibrationAuthority` so the UI can show whether calibration has earned production rights, should remain in shadow, or must force abstention. Product code should read this compact authority packet before deciding how strongly to present calibrated values.

It exposes `primaryPanel.sectorTwin` for sector-kernel outputs. In v1 the first concrete kernel is `semiconductorTwin`, which separates durable bottleneck evidence from capacity, inventory, ASP, and capex-cycle risk.

It exposes `primaryPanel.competitiveMoat` for competitor graph outputs. This lets the UI show the top rival threat, adjusted moat half-life, and whether peer pressure is strong enough to challenge ROIC fade assumptions.

## Visualization Slots

The contract emits explicit slots for the guide's fundamental visuals:

- `fan_chart`
- `intrinsic_value_distribution`
- `reverse_dcf_surface`
- `sobol_sensitivity`
- `valuation_bridge`
- `market_expectations_history`
- `causal_driver_graph`
- `historical_analog_paths`
- `capital_allocation_scorecard`
- `calibration_history`

It also includes `feasibility_manifold`, because the current AURORA architecture has already created that surface and it is a natural companion to reverse DCF.

Each slot has:

- `status`: `ready`, `partial`, `proxy`, or `missing`
- `reason`
- `dataRef`

This keeps the UI honest. If `probabilisticValuation.sensitivity` is available, the Sobol-style sensitivity slot is `ready`. If it is missing, the dashboard can fall back to a `proxy` based on assumption-burden and driver-graph sensitivity.

## Readiness

`readiness` summarizes how much of the investor view is actually supported.

Levels:

- `dashboard_ready`
- `usable_with_gaps`
- `research_view_only`
- `insufficient`

This is intentionally separate from the investment decision state. A company can have a complete dashboard and still be a bad investment, or a sparse dashboard and still be interesting research.

## Decision Packet

When the Decision Engine is present, the contract exposes:

```js
dashboardContract.decisionPacket
```

This includes:

- decision rights
- action label and reason
- max position cap
- allowed actions
- blocked actions
- hard blocks
- adverse scenarios
- reopen triggers

This lets the UI show what can be done now, what is blocked, and what evidence would reopen the decision without turning valuation output into an automatic trade.

## Pipeline Role

`runAuroraBeliefPipeline` now emits `dashboardContract`.

The pipeline memo also includes:

```text
Dashboard contract: <readiness level>.
```

This lets product code render a stable investor view without reverse-engineering raw engine internals.

## Why This Layer Matters

The guide explicitly warned against starting with a fake precise fair value. This contract follows that principle:

```text
Do not begin with "fair value: $73.42".
Begin with ranges, probabilities, market-implied expectations, drivers, disagreement, data quality, and falsifiers.
```

The dashboard contract is the first AURORA product object that turns the engine stack into a screenable investor surface while preserving uncertainty and missing-data honesty.
