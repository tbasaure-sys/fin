# AURORA V3 Champion Execution Diagnosis

Date: 2026-06-28

## Why V2 Was Not Enough

The hard V2 notebook did not crash. It ran end to end, but it did not earn production.

Observed validation metrics from the submitted V2 run:

- `val_hard_mae`: 0.16396
- `val_spine_mae`: 0.16554
- `val_uniform_mae`: 0.17200
- `val_best_single_mae`: 0.16432, from `reverseDcf`
- `val_hard_ic`: -0.01181
- `val_spine_ic`: 0.00139
- `val_hard_decile_spread`: -0.14766

The neural model slightly improved MAE versus the deterministic spine and barely beat the best single lens by raw MAE, but it failed ranking. Negative IC and negative decile spread mean it did not identify better opportunities; it mostly learned a small average correction.

Two methodological problems were also visible:

1. The validation set included 2023-2024 rows for a 3Y forward target. Those horizons have not fully matured as of 2026-06-28, so they cannot be treated as true 3Y outcomes.
2. The featured panel was loaded from cache. That can preserve stale target columns even after package-level fixes.

The confidence head was also not meaningful. `mean_conf_val` and `p80_conf_val` were almost identical, so high confidence was effectively a constant bucket, not calibrated conviction.

## V3 Decision

V3 stops trying to promote a neural model by force. It reframes the task as a champion/challenger tournament:

1. Rebuild featured data from the raw panel every run.
2. Filter to common operating equities.
3. Mask immature 3Y forward returns using `asof_date + 3 years <= DATA_CUTOFF_DATE`.
4. Train a deterministic train-only valuation spine.
5. Train several residual challengers over the spine.
6. Tune the residual blend only on 2019-2020.
7. Evaluate on mature 2021+ rows only.
8. Promote only if the winning challenger beats spine, uniform, and best single lens in MAE and has positive ranking diagnostics.

## Files

- `notebooks/AURORA_OMEGA_MAX_V3_CHAMPION_EXECUTION.ipynb`
- `C:\Users\T14 Ultra 7\Downloads\AURORA_OMEGA_MAX_V3_CHAMPION_EXECUTION.ipynb`

## Expected Interpretations

If V3 passes gates, the residual champion can be considered a production candidate after one more rolling-origin validation.

If V3 fails gates but the spine remains decent, the product should be:

`spine_reverse_dcf_memo_with_ml_shadow`

That is not failure. It means the production system is the valuation question/memo engine, with ML used as a monitored challenger.

If both spine and residual fail ranking, the next unlock is not more architecture. It is better labels and better lens construction, especially reverse DCF, asset value, residual income, and bottleneck/capital-cycle evidence.

## First V3 Run

The first submitted V3 run passed the hard gate:

- winner: `hgb_residual`
- validation rows: 1,379 mature rows
- winner MAE: 0.16858
- spine MAE: 0.17843
- uniform MAE: 0.18449
- best single lens: `reverseDcf`, MAE 0.17674
- winner IC: 0.04222
- spine IC: -0.06487
- winner decile spread: 0.07069

This is the first AURORA run that improved both absolute error and ranking diagnostics.

Two corrections were made after reviewing the run:

1. The common-equity filter had been too aggressive with symbols ending in `X`, removing valid operating companies such as `CVX`, `BSX`, `BDX`, and `EQIX`. V3.1 keeps normal operating tickers and filters fund-like symbols using ticker, sector, industry, and company-name text together.
2. The production gate now evaluates primary validation years with at least 100 rows. Sparse mature 2023 rows remain diagnostic, but 2021-2022 are the main gate until more 2023/2024 outcomes mature.

The next run should be treated as V3.1. If it still passes, the model is a legitimate production candidate, but it still needs one rolling-origin check before hard deployment.

## V4 Meta Champion Upgrade

After V3.1 passed, the next improvement is not a bigger neural net. It is stricter model selection.

V4 adds:

- validation-safe model selection: the champion is selected on 2019-2020 tune score, not on 2021-2022 validation;
- improved operating-equity filter that keeps valid symbols ending in `X` and REITs while excluding fund-like products by text evidence;
- feature hygiene that removes all `pred_*`, forward-return, future, and price target fields from residual model features;
- a richer residual challenger library with HGB, random forest, extra trees, ridge, elastic net, and Huber variants;
- tune-selected pairwise and top-k meta-ensembles;
- confidence/abstention diagnostics based on disagreement across the top challenger models;
- stricter production gates: validation-safe selection, mature rows, MAE lift against spine/uniform/best-single, positive IC, IC lift over spine, positive decile spread, and high-confidence rows that are not worse than the full champion.

V4 is the first notebook that should be considered a real production-candidate test. If it passes, the next hardening step is rolling-origin validation and then wiring the exported manifest into Valuation OS as an AURORA residual champion, with the deterministic spine retained as the fallback.

## V4 First Run and V4.1 Hardening

The submitted V4 run passed all V4 gates:

- champion: `hgb_abs_deep`
- validation rows: 1,498 primary mature rows from 2021-2022
- champion MAE: 0.15870
- deterministic spine MAE: 0.16822
- uniform blend MAE: 0.17468
- best single lens: `reverseDcf`, MAE 0.16657
- champion IC: 0.05870
- champion decile spread: 0.11114
- high-confidence MAE: 0.13232 vs full champion MAE 0.15870
- `production_candidate`: true

However, the exported memo sample revealed a universe leak: `ABALX` survived the common-equity filter. That is not acceptable for a professional operating-equity valuation router, even if the model metrics still pass. The issue was that fund share-class exclusion depended on sparse FMP text evidence. V4.1 fixes that directly.

V4.1 adds:

- direct product/fund canaries: `ABALX`, `FNILX`, `VTSAX`, crypto/commodity trusts, and common ETF tickers must not survive;
- operating-company canaries: `CVX`, `BSX`, `BDX`, `EQIX`, `X`, and class-share forms such as `BRK-B` are preserved when present;
- a rule that excludes exactly five-letter tickers ending in `X`, instead of excluding all tickers ending in `X`;
- a feature-leakage audit that fails if forward returns, future fields, target fields, price-target fields, lens predictions, or Omega weights enter the residual model features;
- per-primary-year gates requiring the champion to beat spine/uniform MAE and keep positive IC in each 2021/2022 validation year;
- stricter confidence gates: high-confidence rows must have a real MAE lift and positive rank signal.

New notebook:

- `notebooks/AURORA_OMEGA_MAX_V4_1_HARDENED_META_CHAMPION.ipynb`
- `C:\Users\T14 Ultra 7\Downloads\AURORA_OMEGA_MAX_V4_1_HARDENED_META_CHAMPION.ipynb`

The next Colab run should use V4.1. If it remains `production_candidate=true`, the next step is not another notebook variant; it is rolling-origin validation plus integration into Valuation OS with the deterministic reverse-DCF spine as fallback.
