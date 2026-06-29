# AURORA Bayesian Forecast Engine v1

This layer implements the Bayesian section of `valuation_idea.txt`.

It does not output a single magic fair value. It converts the current belief object, accounting adjustments, evidence, equilibrium pressure, and causal driver graph into a posterior distribution over the key economic assumptions.

## Function

`buildAuroraBayesianForecastEngine(input, options)` accepts a belief-pipeline output, compiler output, or raw drivers plus optional:

- `accounting`
- `evidence`
- `equilibrium`
- `driverGraph`

It returns:

- hierarchical priors
- posterior distributions for growth, margin, ROIC, reinvestment, WACC, and terminal growth
- bear/base/bull valuation scenarios
- expected fair value and expected return
- posterior predictive checks
- aleatoric vs epistemic uncertainty
- a decision label

## Why This Layer Exists

The original guide says the system should avoid independent, naive assumptions. Growth, margin, reinvestment, ROIC, WACC, and terminal growth have to move together.

This engine makes that explicit:

- global priors set base rates
- sector and archetype priors encode business-model context
- company priors use current compiled drivers
- evidence priors translate text and equilibrium signals
- dependence adjustments enforce economic coherence
- posterior predictive checks flag impossible tails

## Decisions

- `forecast_distribution_usable`: posterior is coherent enough for memo-level use.
- `wide_distribution_use_caution`: distribution is broad; use as uncertainty map, not precise fair value.
- `forecast_requires_review`: posterior assumptions are too fragile or internally dangerous.

## Uncertainty

The output separates:

- `aleatoric`: spread inside the business/value distribution.
- `epistemic`: model and data uncertainty.
- `total`: combined uncertainty score.

The decomposition is reported as:

```text
Var(V) = E[Var(V|theta)] + Var(E[V|theta])
```

This matters because a volatile business and a weak model are different problems. AURORA should be able to say which one it is seeing.

## CLI

```bash
node scripts/run_aurora_bayesian_forecast.mjs --input pipeline-output.json --output forecast.json
```

## Current Limits

This remains a deterministic Bayesian approximation. It now feeds `AURORA Probabilistic Valuation v1`, which samples correlated posterior paths with quasi-Monte Carlo and exposes value, IRR, downside, and sensitivity distributions for the dashboard and future Decision Engine.
