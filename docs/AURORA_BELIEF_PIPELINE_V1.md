# AURORA Belief Pipeline v1

The pipeline is the first end-to-end isolated AURORA intelligence loop.

It composes the layers we built without wiring them into the older Valuation OS router yet:

```text
documents / raw evidence
  -> Source Governance Engine
  -> Evidence Signal Extractor
financial statements
  -> Accounting Engine
product/equity market inputs
  -> Equilibrium Engine
  -> Belief Compiler
  -> Causal Driver Graph
  -> Semiconductor Twin
  -> Competitive Moat Engine
  -> Bayesian Forecast Engine
  -> Assumption Ledger Engine
  -> Valuation Ensemble
  -> Expectations Engine
  -> Feasibility Manifold
  -> Calibration Engine
  -> Management Reliability Engine
  -> Capital Allocation Engine
  -> Priced Belief Object
  -> Thesis Monitor
  -> Pipeline Decision
```

## Function

`runAuroraBeliefPipeline(input, options)` accepts:

- `company`
- `market`
- `macro`
- `financials`
- `documents` or prebuilt `evidence`
- optional `observations`

It returns:

- source governance and valuation-use permissions
- extracted evidence
- economic accounting adjustments
- product-market and equity-market equilibrium pressure
- merged compiler evidence
- compiled drivers
- causal driver graph
- semiconductor sector twin when the company belongs to semis, semicap, memory, foundry, lithography, GPU, chip, wafer, or fab economics
- competitive moat graph with peer threats and adjusted moat half-life when competitors are supplied
- posterior forecast distribution
- assumption ledger with sources, distributions, dependencies, and falsifiers
- valuation ensemble and method disagreement
- market-implied expectations surface
- economic feasibility manifold
- calibration status and scored outcomes when supplied
- recalibration policy for bias, uncertainty, confidence, and abstention adjustments
- calibration integration packet with calibrated forecast branch, risk controls, and integration mode
- calibration authority with decision rights, evidence tier, hard blocks, and required realized outcomes
- probabilistic valuation with correlated quasi-Monte Carlo paths, IRR distribution, CVaR, and sensitivity
- decision engine with decision rights, prudent sizing cap, adverse scenarios, and reopen triggers
- management guidance reliability when supplied
- capital allocation discipline when allocation history is supplied
- dashboard contract with primary panel metrics, visualization readiness, warnings, and investor questions
- priced belief object
- optional thesis monitor result
- decision state
- short memo

## Decision States

- `repair_inputs`: critical data is missing; do not interpret.
- `source_governance_review`: a valuation source, usually alternative data, lacks required governance controls.
- `memo_only`: belief object abstains; use as research memo.
- `causal_model_violation`: driver assumptions break causal/economic constraints; repair before underwriting.
- `equilibrium_pressure_review`: product-market, equity-flow, or reflexivity pressure requires separate review.
- `forecast_requires_review`: Bayesian posterior assumptions or forecast uncertainty require review.
- `assumption_ledger_review`: assumptions are incomplete or a ledger falsifier has tripped.
- `valuation_ensemble_review`: intrinsic valuation methods disagree too much or too few lenses are usable.
- `expectations_surface_review`: market-implied expectations are heroic or the surface is insufficient.
- `feasibility_manifold_review`: market-clearing assumptions fall outside plausible economic geometry.
- `calibration_review`: supplied outcome history indicates calibration failure.
- `management_reliability_review`: management guidance history is poor and should be haircut before underwriting.
- `capital_allocation_review`: buybacks, acquisitions, reinvestment, or other uses of capital appear value destructive.
- `priced_belief_ready`: compiled object is ready, but no monitor has run.
- `active_thesis_intact`: monitor ran and falsifiers are intact.
- `thesis_deteriorating`: evidence is worsening but no hard falsifier has tripped.
- `thesis_broken_or_needs_reunderwriting`: at least one falsifier tripped.
- `refresh_required`: thesis half-life expired.

## CLI

Single company:

```bash
node scripts/run_aurora_belief_pipeline.mjs --input pipeline.json --output result.json
```

Panel:

```bash
node scripts/run_aurora_belief_pipeline.mjs --input pipeline-panel.json --panel --output panel.json
```

## Why This Layer Matters

This is the first place AURORA behaves like a coherent system instead of separate utilities.

It does not train a model and it does not claim magic. It forces the workflow to be explicit:

1. What sources were used, and are they allowed to influence valuation?
2. What evidence was read?
3. What signals were extracted?
4. What accounting adjustments were made?
5. What is product-market and equity-market pressure?
6. What drivers were compiled?
7. Are those drivers causally compatible?
8. For semiconductor businesses, is this a durable bottleneck or a capacity/inventory/ASP cycle?
9. Which competitor can shorten the moat half-life?
10. What posterior distribution follows from the priors, evidence, dependencies, and price?
11. Which assumptions carry that posterior, who owns them, and what would falsify them?
12. What do distinct valuation lenses say each future is worth?
13. What growth/margin/ROIC surface does the market price require?
14. Is that surface economically plausible for this kind of business?
15. Is the model calibrated against realized outcomes?
16. If not, how should future forecasts be shifted, widened, or confidence-haircut?
17. What calibrated branch and risk controls should downstream product code consume?
18. How much authority has calibration earned: observe, shadow, stage, monitor, or freeze?
19. What value, IRR, downside, and sensitivity distribution follows from correlated paths?
20. What decision rights and sizing cap follow from the risk distribution and hard review states?
21. Is management guidance historically reliable?
22. Does management convert business economics into owner economics through capital allocation?
23. What should the investor dashboard show, and which views are truly ready?
24. What would falsify the thesis?
25. Did fresh evidence trip anything?
26. What should the investor do next?

That is the production skeleton we can now expose in the UI or feed into future ML.
