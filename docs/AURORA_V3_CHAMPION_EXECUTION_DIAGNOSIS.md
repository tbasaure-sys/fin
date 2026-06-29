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

## First V4.1 Run

The first submitted V4.1 run stayed production-positive after the harder canaries and gates:

- champion: `ens_hgb_abs_shallow_hgb_abs_deep_0.85_0.15`
- product mode: `hardened_meta_residual_champion`
- artifact directory: `/content/drive/MyDrive/blsprime_aurora_omega/artifacts/omega_v4_1_hardened_meta_champion_20260629_003731`
- filtered universe: 13,410 rows / 775 tickers to 12,897 rows / 729 tickers
- product/fund survivors: none
- wrongly removed operating canaries: none
- feature leakage count: 0
- validation rows: 1,419 primary mature rows from 2021-2022
- champion MAE: 0.16424
- deterministic spine MAE: 0.17405
- uniform blend MAE: 0.18031
- best single lens: `reverseDcf`, MAE 0.17238
- champion IC: 0.03967
- champion decile spread: 0.06171
- all-mature champion MAE: 0.16631
- all-mature champion IC: 0.04189
- high-confidence rows: 739
- high-confidence MAE: 0.13875
- high-confidence IC: 0.02377
- `production_candidate`: true

By primary validation year:

- 2021: 704 rows, champion MAE 0.14201 vs spine 0.14622 vs uniform 0.15196; champion IC 0.05018
- 2022: 715 rows, champion MAE 0.18612 vs spine 0.20146 vs uniform 0.20822; champion IC 0.01354

Interpretation: this is the first AURORA result that is both materially useful and cleaner at the dataset/process layer. It should still be described as a production candidate, not a final proven model. The 2022 IC is positive but thin, and the high-confidence bucket mainly improves absolute error rather than decile spread. That means V4.1 can support the Valuation OS memo/routing layer, while position sizing or aggressive ranking claims should wait for rolling-origin validation.

## V5 Rolling-Origin Validation

The next hardening notebook is:

- `notebooks/AURORA_OMEGA_MAX_V5_ROLLING_ORIGIN_VALIDATION.ipynb`
- `C:\Users\T14 Ultra 7\Downloads\AURORA_OMEGA_MAX_V5_ROLLING_ORIGIN_VALIDATION.ipynb`

V5 is designed to answer the real question: does the V4.1 logic survive repeated walk-forward evaluation, or did it mainly fit the 2021-2022 validation window?

Fold design:

- validation years: 2015-2022
- for each validation year `Y`, train the spine and residual models using years `<= Y-3`
- tune model selection and residual blend using only `Y-2` and `Y-1`
- evaluate only on year `Y`
- no validation year is used to select that fold's champion

V5 keeps the V4.1 safeguards:

- same operating-equity filter and product/fund canaries
- same no-leakage feature audit
- deterministic reverse-DCF/asset-value spine retained as baseline and fallback
- challenger library includes HGB, RF, ExtraTrees, ridge, elastic net, Huber, and tune-selected small ensembles

V5 exports:

- `rolling_origin_folds.csv`
- `rolling_origin_predictions.csv`
- `summary.json`
- `filter_audit.json`
- `manifest.json`

V5 promotion gates are intentionally stricter than the two-year V4.1 gate:

- at least 6 completed folds
- at least 2,500 total validation rows
- no product/fund canary survivors
- no wrongly removed operating canaries
- pooled MAE beats spine and uniform by at least 20 bps
- champion beats spine in at least 70% of folds
- champion beats uniform in at least 70% of folds
- champion beats best single lens in at least 60% of folds
- pooled IC above 0.025
- positive IC in at least 60% of folds
- pooled decile spread above 0.030
- positive decile spread in at least 50% of folds

Interpretation rule:

- If V5 passes, AURORA can be described as a rolling-origin-validated memo/routing component, still with deterministic fallback.
- If V5 fails but V4.1 remains strong, keep AURORA as a production candidate for memo/routing only and inspect which years/regimes broke.
- If V5 fails on IC/decile but not MAE, do not promote ranking or position-sizing language.

## First V5 Run and Audit Rejection

The first V5 run mechanically passed all gates:

- completed folds: 8
- validation years: 2015-2022
- total validation rows: 5,399
- pooled champion MAE: 0.13961
- pooled spine MAE: 0.15141
- pooled uniform MAE: 0.15592
- pooled champion IC: 0.18862
- pooled champion decile spread: 0.16417
- fold win share vs spine/uniform/best single: 100%
- decision printed by notebook: `PROMOTE_ROLLING_ORIGIN_VALIDATED_MEMO_ROUTER`

However, fresh audit found a serious methodological issue: V5 tuned model selection and residual blend on `Y-2` and `Y-1` while validating year `Y`. With a 3Y forward target, those tune labels would not be known at the validation decision date. This is label-availability leakage in model selection.

Therefore the first V5 result must not be promoted, even though the metrics are strong. It should be kept only as a diagnostic showing that the model family is promising.

## V5.1 Purged Rolling-Origin Validation

The corrected notebook is:

- `notebooks/AURORA_OMEGA_MAX_V5_1_PURGED_ROLLING_ORIGIN_VALIDATION.ipynb`
- `C:\Users\T14 Ultra 7\Downloads\AURORA_OMEGA_MAX_V5_1_PURGED_ROLLING_ORIGIN_VALIDATION.ipynb`

V5.1 fixes the leakage by enforcing purged label availability:

- validate year `Y`
- tune model selection and residual blend on `Y-5` and `Y-4`
- train the spine and residual models on years `<= Y-6`
- latest tune label matures in `Y-1`, before validation year `Y`
- each fold asserts `latest_tune_label_year < val_year`

V5.1 also expands validation years to 2013-2022 when enough data exists. This gives the model more cycles and makes the test harder.

Interpretation rule:

- If V5.1 passes, AURORA can be called a purged rolling-origin validated memo/routing component.
- If V5.1 weakens but remains directionally positive, keep the system as production-candidate with deterministic fallback and inspect weak years.
- If V5.1 fails IC/decile while keeping MAE lift, do not use ranking language; use only memo/routing plus uncertainty.

## First V5.1 Purged Run

The first submitted V5.1 run passed the corrected purged rolling-origin gate:

- artifact directory: `/content/drive/MyDrive/blsprime_aurora_omega/artifacts/omega_v5_1_purged_rolling_origin_validation_20260629_023944`
- completed folds: 10
- validation years: 2013-2022
- total validation rows: 6,619
- purged selection clean share: 100%
- product/fund survivors: none
- wrongly removed operating canaries: none
- pooled champion MAE: 0.13636
- pooled spine MAE: 0.14503
- pooled uniform MAE: 0.14851
- MAE lift vs spine: 0.00867
- MAE lift vs uniform: 0.01215
- pooled champion IC: 0.16220
- pooled champion decile spread: 0.13726
- fold win share vs spine: 80%
- fold win share vs uniform: 90%
- fold win share vs best single lens: 90%
- positive IC share: 100%
- positive decile share: 100%
- `production_candidate`: true
- decision: `PROMOTE_ROLLING_ORIGIN_VALIDATED_MEMO_ROUTER`

Weak folds:

- 2013: champion MAE 0.12693 vs spine 0.11006, uniform 0.10999, best single `reverseDcf` 0.10708. Ranking still positive: IC 0.04548, decile spread 0.03661.
- 2019: champion MAE 0.13583 vs spine 0.13590, effectively flat but just below the strict fold margin; still beats uniform and best single lens, with IC 0.08980 and decile spread 0.01660.

Interpretation: V5.1 is the first defensible validation result. The earlier V5 result was stronger numerically but rejected for label-availability leakage. V5.1 is weaker, as expected, but still passes all purged gates. AURORA can now be promoted as a rolling-origin-validated memo/routing component with deterministic fallback. It should still not be described as a position-sizing or autonomous portfolio model until portfolio-level backtests, sector/regime diagnostics, turnover/capacity tests, and calibration checks are added.

## V6 Economic Gap Model

The next notebook is:

- `notebooks/AURORA_OMEGA_MAX_V6_ECONOMIC_GAP_MODEL.ipynb`
- `C:\Users\T14 Ultra 7\Downloads\AURORA_OMEGA_MAX_V6_ECONOMIC_GAP_MODEL.ipynb`

V6 addresses the main conceptual objection to V5.1: the purged champion can still look like a tournament that picks the least weak residual model. V6 is designed as a better model, not a bigger model.

The architecture changes the target decomposition:

1. Keep reverse DCF as the market-implied expectations decoder.
2. Forecast future business fundamentals first: 3Y revenue CAGR, operating margin, ROIC, and FCF margin.
3. Compare those predicted fundamentals against what the price appears to require.
4. Convert the economic gap into a small, clipped adjustment to the deterministic spine.
5. Validate the result with the same purged rolling-origin protocol as V5.1.

This makes the model's claim more economic:

`future business capacity - market-implied expectations = valuation gap`

The V6 notebook intentionally avoids FMP redownloads. It reads the cached Drive panel, rebuilds features and reverse-DCF expectations from the repo code, reuses the hardened common-equity filter and canaries, masks immature 3Y labels, and exports fold metrics plus predictions under:

`/content/drive/MyDrive/blsprime_aurora_omega/artifacts/omega_v6_economic_gap_model_*`

Promotion gates remain strict:

- enough folds and rows;
- clean product/fund and operating-company canaries;
- purged selection in every fold;
- pooled MAE lift versus spine and uniform;
- fold-level win share versus spine, uniform, and best single lens;
- positive pooled IC and decile spread;
- positive IC/decile share across folds.

Interpretation rule:

- If V6 beats V5.1 while passing gates, it is a stronger candidate because it improved the economic mechanism, not only the model-selection wrapper.
- If V6 passes but does not beat V5.1, keep V5.1 as champion and treat V6 as a more interpretable challenger.
- If V6 fails MAE but improves IC/decile or regime diagnostics, inspect it as a ranking/explanation module rather than forcing promotion.
- If V6 fails broadly, the next unlock is not more residual modeling. It is better valuation lenses and richer point-in-time evidence, especially text, capital-cycle, bottleneck, and segment-level signals.

Patch note: the first V6 Colab run exposed a fold-2 feature-count bug in the fundamental transition models. The notebook originally reused one fitted `ColumnTransformer` across several target pipelines; later one-hot fits could mutate earlier pipelines and produce `n_features` mismatches. The patched notebook now builds a fresh preprocessor per target and runs a fold-local smoke prediction after fitting the fundamental models.

## First V6 Run

The first completed V6 run used the patched fundamental preprocessors and finished all ten purged folds:

- artifact directory: `/content/drive/MyDrive/blsprime_aurora_omega/artifacts/omega_v6_economic_gap_model_20260629_043752`
- completed folds: 10
- validation years: 2013-2022
- total validation rows: 6,786
- pooled economic-gap MAE: 0.13588
- pooled formula MAE: 0.14125
- pooled spine MAE: 0.14348
- pooled uniform MAE: 0.14666
- MAE lift vs spine: 0.00760
- MAE lift vs uniform: 0.01077
- pooled economic-gap IC: 0.05462
- pooled formula IC: 0.07215
- pooled spine IC: 0.08008
- pooled economic-gap decile spread: 0.07215
- fold win share vs spine: 70%
- fold win share vs uniform: 80%
- fold win share vs best single lens: 60%
- positive IC share: 60%
- positive decile share: 70%

The run initially printed `production_candidate: false` because of a canary-audit bug, not because the performance gates failed. The filter compared the filtered universe against all operating canaries, including `X`, even when a canary was absent from the raw panel. The patched notebook now checks only operating canaries that are actually present in the raw panel.

Interpretation: V6 is directionally useful and slightly improves absolute-error MAE versus V5.1, but it is not yet a clean replacement for V5.1 because ranking weakened materially. V5.1 remains the stronger ranking/memo router; V6 should be treated as a more economic, interpretable challenger and as evidence that modeling the gap between predicted fundamentals and market-implied expectations is promising. The next V6 improvement should make the residual head multi-objective or rank-aware so it does not buy MAE by giving up IC.
