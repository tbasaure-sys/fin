# AURORA Probabilistic Valuation v1

This layer implements the first production-shaped piece of Núcleo 2 from `valuation_idea.txt`: probabilistic valuation.

It answers:

```text
What is the distribution of value and five-year IRR after correlated business assumptions are sampled?
```

It does not replace the Bayesian Forecast Engine. It consumes the posterior forecast and the Calibration Integration Packet, then emits a reproducible quasi-Monte Carlo distribution.

## Function

`buildAuroraProbabilisticValuation(input, options)` accepts:

- compiled drivers
- posterior forecast distributions
- optional calibrated forecast branch
- valuation ensemble

It returns:

- value distribution: mean, P5/P10/P25/P50/P75/P90/P95
- five-year IRR distribution
- probability of value below price
- probability of negative IRR
- probability of permanent loss
- downside CVaR for IRR and value
- first-order variance sensitivity for IRR and value
- retained sample paths for UI/debugging
- decision label
- memo

## Sampling

The sampler is deterministic:

```text
quasi_monte_carlo_halton_v1
```

It uses low-discrepancy Halton points, inverse-normal transforms, and an explicit correlation matrix across:

- growth
- margin
- ROIC
- reinvestment
- WACC
- terminal growth

This follows the guide's warning:

```text
Monte Carlo por si solo no crea inteligencia.
```

The point is not to add random noise. The point is to propagate posterior uncertainty through an auditable valuation equation.

## Sensitivity

The engine emits:

```text
sobol_style_first_order_variance_decomposition
```

This is a first-order variance decomposition over the quasi-Monte Carlo paths. It is suitable for ranking dominant drivers in the dashboard. It should not yet be described as a full Saltelli/Sobol total-order analysis.

## Pipeline Role

`runAuroraBeliefPipeline` now emits:

```js
probabilisticValuation
```

The pipeline memo surfaces:

```text
Probabilistic valuation: <decision>.
```

The probabilistic decision is intentionally non-blocking in v1. It informs the dashboard and future Decision Engine, but it does not override existing hard gates such as causal incoherence, calibration failure, assumption-ledger trips, management reliability, or thesis monitor breaks.

## Dashboard Role

The Dashboard Contract now prefers this layer for:

- value P10/P50/P90
- five-year IRR distribution
- probability of negative IRR
- value-below-price probability
- Sobol-style sensitivity readiness

If this layer is present, the `sobol_sensitivity` slot becomes `ready` instead of `proxy`.

## Decisions

- `probabilistic_distribution_usable`: distribution is usable as a probabilistic read.
- `probabilistic_wide_distribution`: uncertainty is wide; show the range, not a precise value.
- `probabilistic_extreme_downside`: permanent-loss or downside CVaR risk is high.
- `probabilistic_insufficient`: the distribution cannot be computed.

## Why This Layer Matters

The system now has the first real distributional bridge from:

```text
posterior assumptions -> correlated paths -> value distribution -> IRR distribution -> downside risk -> sensitivity
```

That is the missing link between the reverse DCF / ROIC fade spine and an eventual decision engine that can reason about permanent loss, CVaR, and prudent sizing.
