# BLS Prime Market Simulation - v9.6-rc and Endpoint Integration

Date: 2026-07-03

## Executive verdict

The v9 stress engine is deployable as an adverse scenario engine, but the unconditional book remains diagnostic.

The clean v9.6-rc test fixed the main methodological concern from v9.5: the daily VaR safety margin is now derived from train tail shape only, then frozen before validation. With that correction, unconditional Kupiec VaR5 fails:

- Kupiec unconditional VaR5: p = 0.0343, fail at the 0.05 gate.
- Kupiec unconditional VaR1: p = 0.5509, pass.
- Stress walk-forward coverage: pass.
- Stress MMD vs Gaussian: 0.6618x, pass.
- Correlation near Gaussian: pass.
- Endpoint stress q01: -33.53%.

So the correct product contract is split:

- Serve `fhs_v9_stress` as the stress endpoint engine.
- Keep unconditional/base books as diagnostics until a train-only calibration passes.
- Do not describe the endpoint as a complete forecast distribution.

## What changed in v9.6-rc

v9.5 used a daily VaR safety multiplier of 1.60. That number passed validation, but it was selected after seeing validation behavior.

v9.6-rc replaces that with:

`train_tail_shape_q05_minus_half_q01_gap`

The resulting train-only unconditional implied multiplier was 1.4302, with a daily tail shift of -0.00657. This did not pass validation VaR5, which is the honest result.

## PIT coverage audit

The old 100.0% PIT coverage was not wrong, but it was scoped too narrowly: it was measured after filtering to usable downloaded symbols.

v9.6-rc reports both:

- Selected/downloaded usable symbol coverage: 100.0%.
- Raw PIT member-day coverage before symbol filtering: 86.38%.

The manifest and endpoint contract should cite the raw figure when making survivorship claims.

## Endpoint integration

The endpoint now serves the compact v9 factor scenario bank as primary risk when portfolio coverage is sufficient.

Implemented contract:

- `served_engine`: `fhs_v9_stress_factor_bank_projection`
- `ready_for_stress_endpoint`: true
- `ready_for_endpoint`: false
- Scenario bank role: `fhs_v9_stress_served_primary_when_covered`
- Primary serving requires at least 70% matched portfolio-weight coverage.
- If coverage is insufficient, the endpoint falls back to the visible historical-return runtime instead of silently pretending full coverage.

## Validation

Node endpoint tests pass:

`node --test tests-node/diffusion-market-simulator.test.mjs`

Result: 6/6 passing.

## Product language

Use this framing:

> BLS Prime runs adverse market scenarios from a point-in-time FHS factor bank. It estimates where portfolio damage concentrates under stressed but auditable scenarios. It is not a full unconditional forecast distribution.

Avoid this framing:

> AI predicts the next crisis.

Avoid also:

> The base/unconditional book is endpoint-ready.

It is not, after v9.6-rc.
