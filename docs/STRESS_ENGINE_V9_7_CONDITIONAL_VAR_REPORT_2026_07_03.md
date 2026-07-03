# BLS Prime Market Simulation - v9.7 Conditional VaR Report

Date: 2026-07-03

## Verdict

v9.7 is the correct promoted contract:

- Stress endpoint: ready.
- Conditional daily VaR endpoint: ready for VaR5.
- Static unconditional scenario book: diagnostic only.

This resolves the v9.6-rc issue without retuning the scenario engine. The stress book remains the same deployable product engine; the validation mistake was asking one frozen scenario book to pass a daily VaR test. v9.7 replaces that with a rolling conditional FHS backtest.

## Conditional VaR backtest

Method:

- Train-only standardized innovation distribution.
- EWMA volatility with lambda 0.94.
- Validation VaR at day t uses volatility observable through t-1.
- Backtests: Kupiec exception count plus Christoffersen independence and conditional coverage.

VaR5 result:

- Validation days: 1,634.
- Exceedances: 82.
- Expected exceedances: 81.7.
- Kupiec p-value: 0.9729.
- Christoffersen independence p-value: 0.3573.
- Conditional coverage p-value: 0.6543.
- Gate: pass.

VaR1 diagnostic:

- Exceedances: 15 vs 16.34 expected.
- Kupiec p-value: 0.7355.
- Christoffersen independence p-value: 0.0063.
- Conditional coverage p-value: 0.0226.
- Decision: count passes, independence fails; keep VaR1 diagnostic, not a promoted gate.

## Stress engine status

The v9 stress engine remains unchanged and ready:

- `fhs_v9_stress` remains the product candidate.
- Multi-seed MMD ratio vs Gaussian: 0.6618x.
- Endpoint stress q01: -33.53%.
- Walk-forward stress coverage: all three refits pass.
- Raw PIT member-day coverage: 86.38%.

## Contract update

Production contract now points to:

`fhs_v9_7_run_20260703_023947`

Key fields:

- `ready_for_endpoint: true`
- `ready_for_stress_endpoint: true`
- `ready_for_conditional_var_endpoint: true`
- `unconditional_book_status: diagnostic_static_book_not_promoted; daily_var_uses_conditional_rolling_fhs`

## Product framing

The public page should say:

> BLS Prime runs adverse portfolio scenarios from a point-in-time FHS factor bank and validates daily VaR with a rolling conditional FHS backtest.

It should not say:

> The static unconditional scenario book predicts daily risk.

That is the wrong object and v9.6-rc proved it.
