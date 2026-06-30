# AURORA Factor-Null Results

Date: 2026-06-30
Status: methodological gate, not production evidence

## Why This Test Exists

The second-opinion critique identified the missing null:

> AURORA had been compared against simpler versions of itself and a weak hand-written formula baseline, but not against a standard cross-sectional factor model.

That is a serious omission. If AURORA's ranking power is just value / quality / momentum / size / leverage / low-vol exposure under a new name, then the priced-belief architecture is not yet earning its complexity.

So we added a factor-null harness:

```text
scripts/run_aurora_factor_null.py
```

It compares:

1. linear factor composite;
2. factor-only HistGradientBoostingRegressor;
3. AURORA raw signal;
4. AURORA signal residualized against the factor matrix within each validation cross-section.

The payload is the residual:

```text
AURORA _|_ factors
```

If that residual IC collapses to zero, the belief channel is factor-spanned.

## Factor Coverage

Against the frozen V8 parquet:

```text
artifacts/aurora_omega_v8_dataset/20260629_190419/aurora_omega_v8_dataset.parquet
```

The harness matched 13 usable factors out of 15:

| Factor | Column | Coverage |
|---|---|---:|
| value_pb | `pb_year_z` | 100.0% |
| value_ev_sales | `ev_to_sales` | 100.0% |
| value_fcf | `fcf_yield` | 100.0% |
| quality_roic | `roic_proxy` | 99.6% |
| quality_roe | `roe` | 99.6% |
| quality_roa | `roa` | 99.7% |
| quality_gm | `gross_margin` | 100.0% |
| quality_opm | `operating_margin` | 100.0% |
| momentum_1y | `ret_1y_trailing` | 96.3% |
| momentum_3y | `ret_3y_trailing` | 93.8% |
| size | `market_cap` | 100.0% |
| leverage | `debt_assets` | 99.7% |
| lowvol | `vol_1y_trailing` | 97.3% |

Two factors were present as columns but empty:

- `pe`
- `ev_to_ebitda`

This is a reasonably hard null for the current dataset.

## Self-Test

The harness was validated on synthetic data before using the real artifact.

It correctly:

- flags an orthogonal belief channel when one exists;
- declares the channel empty when the target is factor-spanned;
- collapses all models near zero under year-wise return permutation.

Command:

```powershell
python scripts/run_aurora_factor_null.py --selftest
```

## Real Test 1: AURORA Target Proxy

Command:

```powershell
python scripts/run_aurora_factor_null.py
```

Signal:

```text
research_priority_target
```

Result:

| Model | Folds | Mean IC | IC SD | IC SE | Spread | Pos>0 | Sector-neutral IC |
|---|---:|---:|---:|---:|---:|---:|---:|
| Factor composite | 6 | 0.0604 | 0.0930 | 0.0379 | -0.0516 | 0.17 | 0.0740 |
| Factor HistGBR | 6 | 0.1724 | 0.1494 | 0.0610 | 0.1164 | 0.83 | 0.1252 |
| `research_priority_target` raw | 6 | 0.8109 | 0.0365 | 0.0149 | 0.4964 | 1.00 | 0.8374 |
| `research_priority_target` residualized | 6 | 0.8212 | 0.0842 | 0.0344 | 0.5254 | 1.00 | 0.8394 |

Interpretation:

This looks extremely strong, but it is not deployable evidence.

`research_priority_target` is a training label / teacher target. It explicitly includes forward information:

```text
0.35 * expectation_violation_score
+ 0.25 * zscore_by_year(ann_return_3y_fwd)
+ other terms
```

And `expectation_violation_score` is itself built from realized future fundamentals. Therefore this test answers:

> Is the target label merely a standard factor blend?

It does not answer:

> Does a live AURORA model have deployable orthogonal signal?

Still, the target does not appear factor-spanned.

## Real Test 2: Expectation-Violation Target

Command:

```powershell
python scripts/run_aurora_factor_null.py --signal-col expectation_violation_score
```

Result:

| Model | Folds | Mean IC | IC SD | IC SE | Spread | Pos>0 | Sector-neutral IC |
|---|---:|---:|---:|---:|---:|---:|---:|
| Factor composite | 6 | 0.0604 | 0.0930 | 0.0379 | -0.0516 | 0.17 | 0.0740 |
| Factor HistGBR | 6 | 0.1724 | 0.1494 | 0.0610 | 0.1164 | 0.83 | 0.1252 |
| `expectation_violation_score` raw | 3 | 0.3426 | 0.0626 | 0.0362 | 0.0979 | 1.00 | 0.2955 |
| `expectation_violation_score` residualized | 3 | 0.2737 | 0.0537 | 0.0310 | 0.1022 | 1.00 | 0.2704 |

Interpretation:

This is the most conceptually encouraging result, but it only has 3 effective folds because realized 3-year expectation violation matures later.

It suggests that realized belief-error is not merely a factor proxy. But it is still an ex-post label, not a live signal.

## Real Test 3: OOS Ranker Prediction, Blend V2

Command:

```powershell
python scripts/run_aurora_factor_null.py --use-latest-ranker --ranker-pred-col blend_v2
```

Signal:

```text
artifacts/aurora_omega_v8_ranker/20260630_013956/two_stage_val_predictions.csv
column: blend_v2
```

Result:

| Model | Folds | Mean IC | IC SD | IC SE | Spread | Pos>0 | Sector-neutral IC |
|---|---:|---:|---:|---:|---:|---:|---:|
| Factor composite | 6 | 0.0604 | 0.0930 | 0.0379 | -0.0516 | 0.17 | 0.0740 |
| Factor HistGBR | 6 | 0.1724 | 0.1494 | 0.0610 | 0.1164 | 0.83 | 0.1252 |
| Blend V2 raw | 5 | 0.2262 | 0.1201 | 0.0537 | 0.1426 | 0.83 | 0.1315 |
| Blend V2 residualized | 5 | 0.1191 | 0.0510 | 0.0228 | 0.0659 | 0.83 | 0.1012 |

Interpretation:

Blend V2 beats the factor-only HistGBR in mean IC:

```text
0.2262 vs 0.1724
delta = 0.0539
```

But this delta is smaller than the cross-fold IC noise floor:

```text
factor HistGBR IC SD = 0.1494
```

So the raw model does **not** clearly exceed factor beta at this sample size.

The residualized score is more interesting:

```text
residual IC = 0.1191
SE = 0.0228
```

It exceeds the harness's 2-SE bar, but the SE is optimistic because the folds overlap through 3-year forward returns. Treat this as candidate orthogonal signal, not proof.

## Real Test 4: OOS Ranker Prediction, Blend Selector V1

Command:

```powershell
python scripts/run_aurora_factor_null.py --use-latest-ranker --ranker-pred-col blend_selector_v1
```

Result:

| Model | Folds | Mean IC | IC SD | IC SE | Spread | Pos>0 | Sector-neutral IC |
|---|---:|---:|---:|---:|---:|---:|---:|
| Factor composite | 6 | 0.0604 | 0.0930 | 0.0379 | -0.0516 | 0.17 | 0.0740 |
| Factor HistGBR | 6 | 0.1724 | 0.1494 | 0.0610 | 0.1164 | 0.83 | 0.1252 |
| Blend selector V1 raw | 5 | 0.2268 | 0.1176 | 0.0526 | 0.1408 | 0.83 | 0.1334 |
| Blend selector V1 residualized | 5 | 0.1219 | 0.0493 | 0.0221 | 0.0602 | 0.67 | 0.1045 |

Interpretation:

Same conclusion as Blend V2:

- raw edge over factor HistGBR is not statistically clean;
- residualized IC remains positive and above the optimistic 2-SE bar;
- still not enough to declare a validated orthogonal belief channel.

## Permutation Null

Command:

```powershell
python scripts/run_aurora_factor_null.py --use-latest-ranker --ranker-pred-col blend_selector_v1 --permute
```

Result:

| Model | Folds | Mean IC | IC SD | IC SE | Spread | Pos>0 | Sector-neutral IC |
|---|---:|---:|---:|---:|---:|---:|---:|
| Factor composite | 6 | 0.0454 | 0.0687 | 0.0281 | 0.0219 | 0.67 | 0.0843 |
| Factor HistGBR | 6 | -0.0251 | 0.1098 | 0.0448 | -0.0168 | 0.17 | 0.0092 |
| Blend selector V1 raw | 5 | -0.0335 | 0.0373 | 0.0167 | -0.0229 | 0.33 | -0.0343 |
| Blend selector V1 residualized | 5 | 0.0038 | 0.0393 | 0.0176 | 0.0207 | 0.50 | -0.0168 |

Interpretation:

The AURORA raw and residualized signals collapse under permutation, which is what we needed to see. The factor composite retains a small positive mean IC in this single permutation seed, but it is within fold noise and the factor HistGBR collapses.

No obvious leakage flag from this null.

## Verdict

The factor-null does **not** kill AURORA, but it also does **not** crown it.

What we can say:

1. The current OOS AURORA scores beat the factor-only HistGBR in mean IC.
2. The raw edge is smaller than fold-to-fold noise, so it is not statistically clean.
3. The residualized AURORA score remains positive after removing the 13-factor matrix.
4. The residual signal passes the optimistic 2-SE harness bar.
5. The permutation null does not show obvious leakage.

What we cannot say:

1. We cannot claim production-grade orthogonal alpha.
2. We cannot claim the blends are meaningfully different from each other.
3. We cannot claim `research_priority_target` is deployable, because it contains future information by design.
4. We cannot claim expensive-compounder repairs are validated.

The disciplined conclusion:

```text
AURORA has a candidate factor-orthogonal channel,
but the evidence is not strong enough yet to scale compute or promote a model.
```

## What This Changes

The second-opinion critique was correct: the factor null had to gate everything else.

After running it, the next build should not be another blend tweak. It should be:

1. keep `scripts/run_aurora_factor_null.py` as a mandatory validation gate;
2. add target audits that separate ex-post labels from live deployable signals;
3. build a true belief-correctness validation axis:
   - implied fundamentals vs realized fundamentals;
   - memo truth;
   - falsifier hit rate;
   - abstention quality;
4. only then revisit selector search.

## Recommended Next Experiment

Build a factor-orthogonal target audit:

1. residualize `research_priority_target` against the factor matrix by year;
2. train the ranker to predict that residual target;
3. evaluate against forward returns and realized belief violations;
4. compare:
   - raw AURORA;
   - factor-only HistGBR;
   - factor-orthogonal AURORA;
   - AURORA residualized post-hoc.

If the factor-orthogonal trained model keeps IC and spread, the belief channel is more credible.

If it collapses, AURORA's current ranking power is mostly factor beta plus ex-post label design.

## Follow-Up Completed

This follow-up audit was implemented and run:

```text
scripts/run_aurora_factor_orthogonal_audit.py
docs/AURORA_FACTOR_ORTHOGONAL_AUDIT_2026_06_30.md
```

The short read:

- direct factor-orthogonal target training is learnable but weaker than factor HistGBR for return ranking;
- strict no-factor-feature training is weaker still;
- existing Blend residuals remain positive but should stay diagnostic;
- the next build should target belief-correctness validation, not another blend tweak.
