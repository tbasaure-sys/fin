# BLS Prime Stress Engine Validation Note

Status: v8 pivot executed. The served product is the calibrated factor stress engine; DDPM is research-only.

## What V8 Found

The honest v8 evaluation rejected the Factor-DDPM as the served champion.

Headline metrics:

- DDPM base multi-seed MMD: `0.142561`.
- Gaussian covariance multi-seed MMD: `0.021844`.
- Student-t copula multi-seed MMD: `0.018571`.
- Filtered historical simulation multi-seed MMD: `0.016969`.
- Same-stack Gaussian factor calibration multi-seed MMD: `0.016790`.
- DDPM base correlation MAE: `0.146841`.
- Same-stack Gaussian correlation MAE: `0.114396`.
- DDPM base eigen RMSE: `8.094619`.
- Same-stack Gaussian eigen RMSE: `3.465929`.

The decisive ablation is `gaussian_factor_same_calibration_stack`: Gaussian factor noise pushed through the same calibration, reconstruction, and residual-bootstrap stack beats the diffusion model. The product should therefore serve the calibrated stress engine and keep DDPM as a challenger.

## What Is Served

The live `/market-simulation` endpoint is framed as a calibrated factor stress engine with a CPU runtime, Cholesky correlation, stratified stress sampling, deterministic seeds, and visible warnings.

It does not claim the PyTorch DDPM checkpoint is the production champion.

## Current Validation Surface

Visible user metrics should be:

- VaR 5% and VaR 1%.
- CVaR 5%.
- Probability of drawdown <= -10%.
- Stress-floor status, not episode-conditioned replay.
- Tail contribution by position.
- Deterministic run ID and seed.

Diagnostics that should stay below the fold:

- DDPM MMD gap versus the served champion.
- Sampler correlation fidelity against the target matrix.
- Distribution bin coverage.
- Model gate internals.

## Known Limits

- `non_overlapping_eval_windows` is false in the v8 run, so headline numbers should be treated as a decision-grade ranking, not final publishable evidence.
- `valid_target_regime` gives only 78 evaluation windows; tail metrics need bootstrap confidence intervals or an all-regime weighted validation companion.
- The stress table compares one unconditional stress ladder against three historical episodes. It is a stress-floor diagnostic, not episode-conditioned crisis replay.
- The pooled stress q01 of `-44.6%` is a ladder output. Report quantiles per multiplier sleeve before treating it as an estimated market tail.

## Product Rule

Public surfaces sell the decision output: stress paths, CVaR, drawdown, stress-floor status, attribution, and auditability.

Do not brand the live surface as DDPM. Architecture names and internal gates belong in diagnostics or methodology only.
