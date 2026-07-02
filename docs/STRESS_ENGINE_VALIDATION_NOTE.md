# BLS Prime Stress Engine Validation Note

Status: research build, not production endpoint.

## What Is Served

The live `/market-simulation` endpoint currently serves a guarded, seeded, regime-conditioned covariance proxy. It uses portfolio weights, a stress regime, Cholesky correlation, stratified stress sampling, and visible warnings. It does not serve the offline PyTorch diffusion checkpoint.

This is intentional. The offline diffusion champion remains gated until it beats practical baselines on tail and correlation validation.

## Current Validation Surface

Visible user metrics should be:

- VaR 5% and VaR 1%.
- CVaR 5%.
- Probability of drawdown <= -10%.
- Historical replay coverage for COVID 2020, the 2022 inflation bear market, and 2023 bank stress.
- Tail contribution by position.
- Deterministic run ID and seed.

Diagnostics that should stay below the fold:

- MMD ratios.
- Sampler correlation fidelity against the target matrix.
- Distribution bin coverage.
- Model gate internals.

## Known Gate State

The v7 offline champion is a research artifact, not a production-served model.

Current scorecard:

- Beats Gaussian MMD: false.
- Beats Gaussian correlation: false.
- Stress walk-forward 1% coverage: true.
- Endpoint scenario count: acceptable for research stress runs.
- Ready for endpoint: false.

The live product should therefore be positioned as Stress Engine, not as Factor-DDPM.

## Baselines Required Before Promotion

The checkpoint should not be promoted until it is compared against:

- Gaussian covariance sampler.
- Student-t copula.
- Filtered historical simulation.
- Block bootstrap.
- GARCH-DCC or equivalent dynamic-correlation baseline.

Promotion requires materially better tail realism, realized-correlation behavior, and exception backtests. Architecture novelty is not enough.

## Exception Backtests To Add

Next validation pass should include:

- Kupiec unconditional coverage for VaR exceptions.
- Christoffersen independence test.
- PIT histogram review.
- Realized correlation MAE versus actual return windows.
- Crisis-window recall: whether synthetic q01 or q05 covers the next stress period without overfitting.

## Product Rule

Public surfaces sell the decision output: stress paths, CVaR, drawdown, replay, attribution, and auditability.

Architecture names, version labels, and internal model gates belong in methodology or diagnostics only.
