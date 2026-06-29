# AURORA Causal Driver Graph v1

The initial ValuationOS guide says the core should be a causal graph, not an Excel extrapolation.

This layer is the first concrete version of that idea. It turns compiled AURORA drivers and belief objects into a directed economic graph with explicit equations, qualitative-driver mappings, derived metrics, and constraint checks.

## Core Equations

The graph encodes the two most important discipline checks from the guide:

```text
g_NPAT ~= reinvestment_rate * ROIIC
```

and:

```text
ROIC spread = ROIC - WACC
ROIC spread_{t+1} ~= phi * ROIC spread_t + betaX + epsilon
moat_half_life = ln(0.5) / ln(phi)
```

## What It Builds

`buildAuroraDriverGraph(input, options)` accepts a Belief Compiler output, a Priced Belief Object plus drivers, or a full pipeline output.

It returns:

- `nodes`: market price, growth, reinvestment, ROIIC, ROIC, WACC, ROIC spread, moat half-life, pricing power, demand visibility, capacity constraint, margin, FCF, value.
- `edges`: causal/economic relationships and equations.
- `derived`: implied ROIIC, ROIC spread, competitive persistence phi, moat half-life.
- `constraintViolations`: causal incompatibilities.
- `graphHealth`: coherent, usable with watches, fragile, or incoherent.
- `qualitativeDriverMap`: translation from qualitative concepts to quantitative drivers.

## Constraint Checks

v1 checks:

- high growth with near-zero reinvestment;
- heroic implied ROIIC;
- growth while ROIC is below WACC;
- terminal growth too close to WACC;
- bottleneck power asserted without pricing/demand/capacity evidence;
- high margin assumptions despite margin pressure and weak pricing support.

## CLI

```bash
node scripts/run_aurora_driver_graph.mjs --input compiled-or-pipeline.json --output driver-graph.json
```

Panel:

```bash
node scripts/run_aurora_driver_graph.mjs --input graph-panel.json --panel
```

## Pipeline Integration

The Belief Pipeline now includes `driverGraph`.

If the graph is incoherent or has multiple hard violations, the pipeline returns:

```text
decision.state = causal_model_violation
decision.action = repair_driver_assumptions
```

This matters because AURORA should not produce polished valuation language from assumptions that break the economics of the business.
