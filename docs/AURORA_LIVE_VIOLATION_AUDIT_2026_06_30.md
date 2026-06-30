# AURORA Live Violation Audit

Date: 2026-06-30
Status: decisive execution test, not production evidence
Artifact: `artifacts/aurora_live_violation_audit/20260630_030821`

## Question

The strongest evidence in the prior audits was not the deployed blend. It was the ex-post belief-error ceiling:

```text
expectation_violation_score residualized against 13 factors:
return IC = 0.2737
```

That result says:

> When we know the realized future fundamental trajectory, the belief-error channel is strongly factor-orthogonal.

But it is not deployable because `expectation_violation_score` uses future realized fundamentals.

So the real question became:

```text
How much of the ex-post 0.27 residual IC can be recovered live,
using only information available at time t?
```

## Implementation

Built:

```text
scripts/run_aurora_live_violation_audit.py
```

For each validation year, the script:

1. uses only historically matured rows up to `validation_year - 3`;
2. estimates base-rate feasible future fundamentals using grouped transition tables;
3. compares those base-rate forecasts to market-implied burdens;
4. builds a live `live_base_rate_violation_score`;
5. evaluates raw and factor-residualized scores against forward 3Y returns;
6. includes the ex-post `expectation_violation_score` as a ceiling, explicitly marked as look-ahead.

Components:

| Component | Base-rate target | Implied burden |
|---|---|---|
| Growth | `realized_revenue_cagr_3y` | `implied_revenue_cagr` |
| Margin | `realized_ebit_margin_3y` | `implied_terminal_ebit_margin` |
| ROIC | `realized_roic_3y` | `implied_incremental_roic` |
| FCF | `realized_fcf_margin_3y` | current `fcf_margin` |
| Multiple | `realized_multiple_change_3y` | negative expected multiple change |

Weights matched the ex-post violation score:

```text
growth 25%
margin 25%
ROIC   25%
FCF    15%
multiple 10%
```

## Result

| Model | Folds | Return IC | Return spread | Sector-neutral IC | Ex-post violation IC |
|---|---:|---:|---:|---:|---:|
| Ex-post expectation violation | 3 | 0.3426 | 0.0979 | 0.2955 | 1.0000 |
| Ex-post expectation violation residualized | 3 | 0.2737 | 0.1022 | 0.2704 | 0.8342 |
| Blend selector V1 | 5 | 0.2268 | 0.1408 | 0.1334 | 0.3285 |
| Blend V2 | 5 | 0.2262 | 0.1426 | 0.1315 | 0.3289 |
| Factor HistGBR | 6 | 0.1724 | 0.1164 | 0.1252 | 0.1745 |
| Blend selector V1 residualized | 5 | 0.1219 | 0.0602 | 0.1045 | 0.1798 |
| Blend V2 residualized | 5 | 0.1191 | 0.0659 | 0.1012 | 0.1799 |
| Live base-rate violation | 6 | 0.0789 | 0.0308 | 0.0481 | 0.0805 |
| Factor composite | 6 | 0.0604 | -0.0516 | 0.0740 | 0.0953 |
| Live base-rate violation residualized | 6 | -0.0070 | -0.0076 | -0.0159 | 0.0000 |

## Interpretation

This is a hard result.

The ex-post belief-error ceiling is real:

```text
ex-post residual IC = 0.2737
```

But this first live construction does **not** recover it:

```text
live raw IC = 0.0789
live residual IC = -0.0070
```

That means this implementation of base-rate feasibility is not enough. Once standard factors are removed, the live score has no orthogonal return signal.

## What This Means

This does **not** kill the AURORA thesis.

It does answer the current implementation question:

> Simple grouped base-rate transition tables do not recover the ex-post belief-error signal.

The bottleneck is still the live information set and belief-forecasting method.

The ex-post score says there is a valuable phenomenon:

```text
market-implied future vs realized fundamental future
```

The live score says our current approximation of the feasible future is too weak:

```text
market-implied future vs simple historical base-rate future
```

Those are not the same thing.

## Updated Verdict

The prior critique was right in spirit:

> Orthogonal output requires orthogonal input.

But the first attempt at live orthogonal input did not work.

Current state:

- Ex-post belief violation is powerful and factor-orthogonal.
- Deployed blends contain a weaker residual channel around `0.12` IC.
- Simple live base-rate violation collapses after factor residualization.
- Therefore the recoverable gap from `0.27 -> 0.12` is not solved yet.

The honest status:

```text
The idea is still alive.
This live base-rate implementation failed the orthogonal-signal test.
```

## Next Step

Do not return to blend tuning.

Improve the live feasible-future engine.

The next implementation should replace grouped medians with a stronger but still auditable transition model:

1. train fold-purged models for each future fundamental:
   - revenue CAGR;
   - margin;
   - ROIC;
   - FCF margin;
   - multiple change;
2. constrain them with business physics and base-rate calibration;
3. produce distributional forecasts, not point medians;
4. compare market-implied burdens against expected value, percentile, and tail probability;
5. rerun the same factor-null.

The target is explicit:

```text
Recover materially more than 0.12 residual IC live,
without using future fundamentals,
and without collapsing under factor residualization.
```

If a stronger live feasible-future model still collapses, AURORA should stop chasing standalone return alpha and become a research-prioritization / memo-truth / abstention system.

If it survives, the belief channel is deployable.
