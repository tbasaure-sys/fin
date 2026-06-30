# AURORA Omega Spine v1

This is the first composed kernel that starts behaving like the AURORA Omega product vision rather than a collection of adjacent engines.

It does not replace the belief compiler, expectations surface, feasibility manifold, or probabilistic valuation. It composes them into one investor-facing object that answers:

```text
What is the market underwriting?
What variable actually matters most?
What is the smallest business change that flips the case?
```

## Function

`buildAuroraOmegaSpine(input, options)` consumes a pipeline-like object with:

- `compiled`
- `expectations`
- `feasibilityManifold`
- `probabilisticValuation`

and returns:

- `marketBeliefFamily`
- `valueDriverGradient`
- `counterfactualArena`
- `monitoringFocus`

## Market Belief Family

The engine starts from the market-clearing expectation contour and the annotated feasibility manifold.

It groups nearby clearing assumptions into belief families such as:

- `bottleneck_compounder`
- `scaling_platform`
- `cyclical_reset`
- `bond_proxy_maturity`
- `heroic_compounder`
- `durable_compounder`

This begins to move AURORA from "single reverse DCF answer" toward "family of futures that can justify price."

## Value Driver Gradient

The engine reads probabilistic valuation sensitivity and converts it into an investor-facing gradient:

- dominant factor
- ordered driver shares
- concentration across the top drivers

This is the first operational answer to:

```text
What is this thesis really about?
```

If the dominant factor is margin rather than growth, the memo can say so explicitly.

## Counterfactual Arena

The engine searches the feasible surface for:

- `minimumViableBullCase`
- `minimumViableBearCase`
- `decisionFlip`

These are not fully causal worlds yet. They are the smallest nearby economically feasible states that would make the business look clearly above or below price.

That makes the output much more useful than a static bull/bear paragraph:

- what must improve?
- what must fail?
- which variable is the easiest decision-flip lever?

## Monitoring Focus

The spine also produces a narrow monitoring object:

- primary variable to watch
- leading falsifier
- next bull lever

This is the bridge from valuation to living thesis management.

## Why This Matters

Before this layer, the repo had the ingredients of AURORA Omega, but not the composed spine:

- beliefs
- expectation surface
- economic manifold
- probabilistic sensitivity

After this layer, the system can begin to say:

```text
The market is underwriting this family of futures.
This variable dominates value.
This is the minimal shift that changes the case.
```

That is much closer to a priced-belief operating system than to a smarter valuation score.

## Usage

```bash
node scripts/run_aurora_omega_spine.mjs --input aurora-pipeline.json --output omega-spine.json
```

## Current Limits

This is still v1. It does not yet:

- solve a full reverse-valuation manifold from first principles
- infer narrative from filing text deeply
- run a courtroom-style adversarial memo process
- learn counterfactuals causally

But it does establish the correct architectural seam for those upgrades.
