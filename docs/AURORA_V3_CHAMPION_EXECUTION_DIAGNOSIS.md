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
