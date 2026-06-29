# AURORA Second Opinion Request

Date: 2026-06-29  
Repo: `C:\Users\T14 Ultra 7\OneDrive\Escritorio\CT\blsprime-fin`

## Why We Need A Second Opinion

We are building AURORA, a valuation intelligence system for BLS Prime. The goal is not just to predict returns with a black-box model. The goal is to decide which valuation question is appropriate for a company at a point in time, explain what the market is pricing, identify falsifiers, and support a professional investor memo.

Current internal conclusion:

`V5.1 router/ranking champion + V6 formula/economic-gap explanation layer + learned residual in shadow only`

We want a fresh reviewer to challenge that conclusion. Specifically:

1. Are we correctly interpreting the evidence?
2. Is V5.1 genuinely the right champion for now?
3. Is V6/V6.1 a dead end as a learned residual, or just poorly formulated?
4. What is the next highest-leverage methodological change?

## Current Decision In One Paragraph

V5.1 is the current champion because it passed purged rolling-origin validation with strong MAE, IC, and decile results. V6 and V6.1 introduced a better economic representation, comparing predicted future fundamentals against market-implied reverse-DCF expectations, but the learned residual weakened ranking despite improving absolute-error MAE. Therefore, V6 should currently be used as an explanation/falsifier layer, not as the main ranking or routing model.

## What AURORA Is Trying To Be

AURORA should answer:

- What kind of business is this right now?
- What expectations are embedded in the current price?
- Which valuation lens deserves trust?
- Are those expectations feasible given fundamentals, regime, ROIC, reinvestment, supply/demand, bottlenecks, and qualitative evidence?
- What would falsify the thesis?
- Should the system abstain?

It should not become a naive return predictor or a DCF template.

## Data And Validation Setup

Panel:

- Cached Drive panel from FMP + yfinance price histories.
- Approximate raw panel used in latest notebooks: 13,410 rows, 775 tickers.
- Filtered common operating equity universe: 13,055 rows, 746 tickers.
- Mature 3Y target rows: around 11,262 rows, 733 tickers.
- Validation years: 2013-2022.
- Target: `ann_return_3y_fwd`.
- Immature 3Y labels are masked.
- Known product/fund tickers are excluded.
- Operating canaries are checked.

Validation protocol for current serious runs:

- Validate year `Y`.
- Train core models on years `<= Y-6`.
- Use only labels that would have matured before validation year `Y`.
- V5.1 tune years: `Y-5` and `Y-4`.
- V6.1 split: residual train on `Y-5`, selector on `Y-4`, validate on `Y`.

Main metrics:

- MAE versus spine, uniform, and best single lens.
- Spearman IC.
- Top-bottom decile spread.
- Fold win shares.
- Positive IC/decile shares.
- Canary/filter gates.
- Purged selection cleanliness.

## Valuation Lenses

The current system uses lens outputs such as:

- DCF
- ROIC fade
- Reverse DCF
- Residual income
- Asset value
- Unit economics
- Bottleneck
- Real options
- Capital cycle, excluded from 3Y intrinsic lens set in later runs

Important limitation: some lenses are still proxies rather than fully real economic engines. This may be the real ceiling.

## Experiment History

### V4 / V4.1

V4.1 was a hardened two-year validation champion candidate. It improved materially over earlier neural-router attempts, but it was not enough because the validation window was too narrow.

Key issue addressed later:

- Need rolling-origin validation, not only 2021-2022.

### V5

V5 looked very strong but was rejected on audit.

Problem:

- It tuned model selection on `Y-2/Y-1` while validating year `Y`.
- With a 3Y forward target, those tune labels would not be known at decision time.
- This was label-availability leakage.

Conclusion:

- Do not promote V5.
- Treat only as evidence that the model family may contain signal.

### V5.1 Purged Rolling-Origin

Notebook:

- `notebooks/AURORA_OMEGA_MAX_V5_1_PURGED_ROLLING_ORIGIN_VALIDATION.ipynb`

Artifact:

- `/content/drive/MyDrive/blsprime_aurora_omega/artifacts/omega_v5_1_purged_rolling_origin_validation_20260629_023944`

Protocol:

- Validate `Y`.
- Tune on `Y-5/Y-4`.
- Train core on `<= Y-6`.
- Latest tune label matures in `Y-1`.

Results:

| Metric | Value |
|---|---:|
| completed folds | 10 |
| validation years | 2013-2022 |
| total validation rows | 6,619 |
| pooled champion MAE | 0.13636 |
| pooled spine MAE | 0.14503 |
| pooled uniform MAE | 0.14851 |
| MAE lift vs spine | 0.00867 |
| MAE lift vs uniform | 0.01215 |
| pooled champion IC | 0.16220 |
| pooled champion decile spread | 0.13726 |
| beats spine MAE share | 80% |
| beats uniform MAE share | 90% |
| beats best single MAE share | 90% |
| positive IC share | 100% |
| positive decile share | 100% |
| production candidate | true |

Weak folds:

- 2013: loses on MAE versus spine/uniform/best single, but ranking remains positive.
- 2019: almost flat versus spine but still positive ranking.

Current interpretation:

- V5.1 is the best validated router/ranking/memo component.
- It is not a position-sizing or autonomous portfolio model.
- It still needs portfolio backtests, sector/regime diagnostics, turnover/capacity, and calibration.

### V6 Economic Gap Model

Notebook:

- `notebooks/AURORA_OMEGA_MAX_V6_ECONOMIC_GAP_MODEL.ipynb`

Artifact:

- `/content/drive/MyDrive/blsprime_aurora_omega/artifacts/omega_v6_economic_gap_model_20260629_043752`

Why V6 exists:

V5.1 may still look like a model tournament that picks the least weak residual. V6 tries to make the model structurally better:

`future business capacity - market-implied expectations = valuation gap`

V6 steps:

1. Reverse DCF estimates market-implied expectations.
2. Models predict 3Y future fundamentals:
   - revenue CAGR;
   - operating margin;
   - ROIC;
   - FCF margin.
3. Compute gaps versus implied expectations.
4. Use a robust residual head to adjust the deterministic spine.

Results:

| Metric | Value |
|---|---:|
| completed folds | 10 |
| validation years | 2013-2022 |
| total validation rows | 6,786 |
| pooled economic-gap MAE | 0.13588 |
| formula MAE | 0.14125 |
| spine MAE | 0.14348 |
| uniform MAE | 0.14666 |
| MAE lift vs spine | 0.00760 |
| MAE lift vs uniform | 0.01077 |
| economic-gap IC | 0.05462 |
| formula IC | 0.07215 |
| spine IC | 0.08008 |
| economic-gap decile spread | 0.07215 |
| beats spine share | 70% |
| beats uniform share | 80% |
| beats best single share | 60% |
| positive IC share | 60% |
| positive decile share | 70% |

Interpretation:

- V6 improves MAE and is economically more interpretable.
- But ranking weakens materially versus spine and V5.1.
- The transparent formula is better on IC than the learned residual.
- V6 should not replace V5.1.

### V6.1 Rank-Aware Economic Gap

Notebook:

- `notebooks/AURORA_OMEGA_MAX_V6_1_RANK_AWARE_ECONOMIC_GAP.ipynb`

Artifact:

- `/content/drive/MyDrive/blsprime_aurora_omega/artifacts/omega_v6_1_rank_aware_economic_gap_20260629_050146`

Why V6.1 exists:

V6 bought MAE improvement at the cost of ranking. V6.1 tries to prevent that by accepting economic-gap adjustments only if tune selection shows:

- MAE improvement versus spine;
- IC not materially below spine;
- decile spread not materially below spine.

Protocol:

- Core train: `<= Y-6`.
- Residual train: `Y-5`.
- Candidate selector: `Y-4`.
- Validate: `Y`.

Results:

| Metric | Value |
|---|---:|
| completed folds | 10 |
| total validation rows | 6,786 |
| rank-aware MAE | 0.13674 |
| unguarded MAE | 0.13815 |
| formula MAE | 0.14125 |
| spine MAE | 0.14348 |
| uniform MAE | 0.14666 |
| MAE lift vs spine | 0.00675 |
| MAE lift vs uniform | 0.00992 |
| rank-aware IC | 0.03450 |
| formula IC | 0.07215 |
| spine IC | 0.08008 |
| uniform IC | 0.06506 |
| rank-aware decile spread | 0.06207 |
| spine decile spread | 0.02522 |
| beats spine share | 80% |
| beats uniform share | 80% |
| beats best single share | 70% |
| positive IC share | 60% |
| positive decile share | 70% |
| rank guard accept share | 100% |
| production candidate | false |

Interpretation:

- V6.1 improves over unguarded learned residual on MAE.
- It preserves much of the V6 MAE lift.
- It still fails the central ranking concern.
- The rank guard accepted an adjustment in 100% of folds, so it was too permissive or overfit the single selector year.
- V6.1 should not be promoted.

## Current Best Product Architecture

Recommended near-term architecture:

`V5.1 router/ranking champion + V6 formula/economic-gap explanation layer + learned residual in shadow only`

Meaning:

- V5.1 controls routing/ranking/memo priority.
- V6 formula explains market-implied expectations and feasibility gaps.
- V6 learned residual is monitored but does not drive production decisions.

## What Seems True So Far

1. There is real signal in the broad AURORA feature/lens setup.
2. Purged rolling-origin validation is essential; non-purged results were misleading.
3. V5.1 has the strongest all-around empirical validation so far.
4. The economic-gap representation is conceptually better and improves MAE.
5. Learned residuals on top of economic-gap features currently damage ranking.
6. The transparent formula often preserves ranking better than the learned residual.
7. The next edge probably will not come from another small residual blend.

## Main Concern

We may be optimizing the wrong layer.

The learned residual is probably trying to repair weak lens/fundamental proxies after the fact. If the future fundamental model and lens construction are weak, no residual selector can reliably recover ranking.

The real unlock may be upstream:

- better future fundamental prediction;
- sector/regime-specific transition models;
- text evidence from filings/calls;
- bottleneck/capital-cycle signals;
- segment-level data;
- better real valuation lenses rather than proxy scores.

## Questions For The External Reviewer

Please answer directly:

1. Would you keep V5.1 as current champion? If not, why?
2. Is V6's economic-gap representation worth keeping? If yes, where should it live in the product?
3. Is the V6/V6.1 learned residual failing because of:
   - weak target;
   - weak fundamental forecasts;
   - insufficient features;
   - bad selector protocol;
   - unstable market regimes;
   - or conceptual mismatch?
4. Should we optimize IC/decile directly instead of MAE?
5. Should the system split into:
   - 3Y intrinsic valuation;
   - 1Y tactical/capital-cycle ranking;
   - memo/falsifier engine?
6. What is the best next experiment that is likely to produce a step-change rather than incremental polish?
7. Are there leakage risks still hidden in the current setup?
8. Are the validation gates too strict, too loose, or pointed at the wrong product claim?
9. Should economic gap be a model input, an explanation output, or a production adjustment?
10. What would you build next if you had one clean week?

## Things Not To Waste Time On Unless You Disagree Strongly

- Do not propose another flat MLP router unless you can explain why it fixes label quality and regime instability.
- Do not simply add more estimators to the tournament.
- Do not optimize only MAE if ranking/memo usefulness is the product claim.
- Do not promote any model that has not passed purged rolling-origin validation.
- Do not treat V6/V6.1 `production_candidate: false` as a mere gate annoyance; the ranking degradation is real.

## Files To Inspect

Core diagnosis:

- `docs/AURORA_V3_CHAMPION_EXECUTION_DIAGNOSIS.md`

Current champion:

- `notebooks/AURORA_OMEGA_MAX_V5_1_PURGED_ROLLING_ORIGIN_VALIDATION.ipynb`

Economic-gap experiments:

- `notebooks/AURORA_OMEGA_MAX_V6_ECONOMIC_GAP_MODEL.ipynb`
- `notebooks/AURORA_OMEGA_MAX_V6_1_RANK_AWARE_ECONOMIC_GAP.ipynb`

Earlier architecture context:

- `docs/AURORA_VALUATION_INTELLIGENCE_SYSTEM.md`
- `docs/AURORA_OMEGA_FOUNDATION_MODEL.md`
- `docs/VALUATION_ROUTER_FRESH_AGENT_HANDOFF.md`

Runtime helpers:

- `scripts/run_aurora_router_local.py`
- `aurora_omega/data.py`
- `aurora_omega/model.py`
- `aurora_omega/train.py`
- `aurora_omega/outputs.py`

Colab artifacts:

- `/content/drive/MyDrive/blsprime_aurora_omega/artifacts/omega_v5_1_purged_rolling_origin_validation_20260629_023944`
- `/content/drive/MyDrive/blsprime_aurora_omega/artifacts/omega_v6_economic_gap_model_20260629_043752`
- `/content/drive/MyDrive/blsprime_aurora_omega/artifacts/omega_v6_1_rank_aware_economic_gap_20260629_050146`

## My Current Bias

My current bias is:

V5.1 is empirically stronger. V6 is intellectually more satisfying. The product should combine them rather than force one to replace the other.

The best near-term AURORA is not:

`learned residual predicts returns`

It is:

`validated router chooses the valuation question, economic-gap layer explains what the market prices, and memo engine states falsifiers and abstention conditions`

The second opinion should try to falsify that bias.
