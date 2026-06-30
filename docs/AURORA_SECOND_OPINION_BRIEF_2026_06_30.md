# AURORA Second-Opinion Brief

Date: 2026-06-30
Repo: `C:\Users\T14 Ultra 7\OneDrive\Escritorio\CT\blsprime-fin`
Status: research/shadow only, not production

## Executive Summary

We started by trying to build a valuation router: a system that would assign weights across valuation lenses like DCF, ROIC fade, reverse DCF, residual income, asset value, unit economics, bottleneck power, real options, and capital cycle.

That direct route failed in the important sense: the neural router did not reliably beat simple baselines, was vulnerable to weak labels, and risked becoming a prettier version of a noisy return predictor.

The project then pivoted to the stronger thesis:

> AURORA should treat every market price as a compressed belief system, reverse-engineer what future the price requires, compare that future against business physics and evidence, and turn the result into a falsifiable investment memo and research-priority ranking.

The current best empirical direction is not a standalone neural router. It is:

```text
price -> implied belief -> expectation violation -> research priority -> regime-aware blend
```

The current strongest ranking policy is **Blend V2** by broad decile spread, while **Blend selector V1** is best by mean return IC and **Blend V3** is the best targeted repair for expensive compounders.

No current model should be called final production. The right next question is not "which model wins by 30 bps of IC?" The right question is whether the priced-belief targets and regime policy are conceptually correct enough to scale.

## Original North Star

The strongest proposed architecture was not "a better valuation model." It was a market-belief intelligence system:

```text
price -> implied belief -> evidence-weighted feasibility -> valid lens
      -> falsifier -> monitored thesis -> learning loop
```

The key primitives proposed were:

- **Priced Belief Object**: the atomic unit should not be ticker/date/score, but a structured object describing what the market price implies.
- **Belief Compiler**: reverse-solve the assumptions required by current price.
- **Business Genome**: classify the economic species, value driver, capital metabolism, competitive structure, failure mode, natural horizon, and best valuation grammar.
- **Lens Legitimacy**: valuation lenses should be allowed to speak only when economically valid.
- **Falsifier Engine**: every thesis should contain kill criteria and monitoring events.
- **Memo Truth Backtest**: validate not only returns, but whether memo claims, value drivers, falsifiers, and abstentions were right.

This remains the north star.

## What We Built

### 1. AURORA Belief Object / Pipeline Layer

Implemented production-shaped primitives in `lib/`:

- `lib/aurora-belief-object.js`
- `lib/aurora-belief-compiler.js`
- `lib/aurora-belief-pipeline.js`
- `lib/aurora-calibration-engine.js`
- `lib/aurora-priced-belief-backtest.js`
- `lib/aurora-omega-spine.js`
- supporting lens/data-trust/audit modules

Related docs:

- `docs/AURORA_PRICED_BELIEF_OBJECT_V1.md`
- `docs/AURORA_BELIEF_COMPILER_V1.md`
- `docs/AURORA_PRICED_BELIEF_BACKTEST_V1.md`
- `docs/AURORA_CALIBRATION_ENGINE_V1.md`
- `docs/AURORA_OMEGA_FOUNDATION_MODEL.md`

This layer reframes the product away from "fair value number" and toward:

- what the market believes;
- which assumptions carry burden of proof;
- which valuation lenses are legitimate;
- what would falsify the thesis;
- whether the system should abstain from ranking.

### 2. AURORA Omega Neural Track

We built a compact neural research path:

- temporal financial encoder;
- latent business state;
- sparse lens mixture;
- regime and primary-question heads;
- lens distillation;
- uncertainty / MRI style output.

The result proved that the architecture can run end-to-end, but not that it should be promoted.

Latest documented neural result:

```text
Omega MoE 3Y MAE:        0.1468
spine_v1 composite MAE:  0.1462
best diagnostic lens:    assetValue at 0.1421
production_candidate:    false
```

Interpretation:

- Engineering feasibility is solved.
- Data scale and objective design are not solved.
- A direct neural model on a small panel is not enough.

### 3. AURORA Omega V8 Priced-Belief Dataset

Implemented:

- `scripts/build_aurora_omega_v8_dataset.py`
- `notebooks/AURORA_OMEGA_V8_PRICED_BELIEF_DATASET_AND_RANKER.ipynb`

Current local dataset artifact:

```text
artifacts/aurora_omega_v8_dataset/20260629_190419/aurora_omega_v8_dataset.parquet
```

Dataset summary:

```text
rows: 2,901
tickers: 297
years: 2014-2023
observed expectation rows: 2,008
mature 3Y return rows: 2,546
```

Key V8 targets:

- `expectation_violation_score`: observed mismatch between market-implied assumptions and realized business outcomes.
- `research_priority_target`: composite product target intended to rank names that deserve research attention.
- `ann_return_3y_fwd`: raw forward return, used as a reality check but not the only product target.

The main strategic move was to stop training only on realized returns and start testing whether expectation mismatch and research priority produce better ranking behavior.

### 4. Purged Rolling-Origin Ranker

Implemented:

- `scripts/run_aurora_omega_two_stage_ranker.py`

Validation setup:

- rolling validation years: 2018-2023;
- 3-year purge gap;
- stage 1 inner gap: 1 year;
- metrics: return IC, research-priority IC, decile spread, sector-neutral diagnostics, regime diagnostics, top-decile overlap.

Latest artifact:

```text
artifacts/aurora_omega_v8_ranker/20260630_013956
```

## Empirical Results So Far

## Addendum: Factor-Null Gate

After this brief was written, we added the missing factor-null harness requested by the second-opinion critique:

```text
scripts/run_aurora_factor_null.py
docs/AURORA_FACTOR_NULL_RESULTS_2026_06_30.md
```

The factor null compares AURORA against a 13-factor cross-sectional matrix covering value, quality, momentum, size, leverage, and low-vol. It also residualizes AURORA's signal against those factors within each validation cross-section.

Latest OOS ranker read:

| Signal | Raw IC | Residual IC vs factors | Interpretation |
|---|---:|---:|---|
| Blend V2 | 0.2262 | 0.1191 | raw edge over factors is not clean, residual is positive |
| Blend selector V1 | 0.2268 | 0.1219 | same conclusion |
| Factor HistGBR | 0.1724 | n/a | hard factor-only null |

Important caveat:

The raw edge over factor HistGBR is only about 0.054 IC, smaller than the fold-to-fold IC noise floor. The residualized signal passes an optimistic 2-SE bar, but folds overlap through 3-year forward returns, so this is candidate orthogonal signal, not proof.

Updated conclusion:

```text
The factor null does not kill AURORA, but it prevents us from crowning it.
The next step should be a factor-orthogonal target audit, not another blend tweak.
```

That follow-up audit has now been run:

```text
scripts/run_aurora_factor_orthogonal_audit.py
docs/AURORA_FACTOR_ORTHOGONAL_AUDIT_2026_06_30.md
```

Its result is stricter:

- factor-orthogonal target training is learnable;
- but it underperforms factor HistGBR on return ranking;
- the no-factor-feature version weakens materially;
- current Blend residuals remain positive but diagnostic only.

So the updated recommendation is:

```text
Stop tuning blends.
Build belief-correctness and memo-truth validation.
```

Latest follow-up:

```text
scripts/run_aurora_live_violation_audit.py
docs/AURORA_LIVE_VIOLATION_AUDIT_2026_06_30.md
```

That experiment built a no-look-ahead live version of the ex-post belief violation using historical base-rate transition tables. It did not recover the factor-orthogonal signal:

```text
ex-post violation residual IC: 0.2737
live base-rate violation IC:   0.0789
live residual IC:             -0.0070
```

Updated diagnosis:

```text
The ex-post priced-belief phenomenon is real,
but the current live feasible-future engine is too weak.
The next build should improve live fundamental-transition forecasting,
not tune ranking blends.
```

### First Rolling-Origin Read

The first V8 run showed:

1. `research_priority_target` was the best product-facing target.
2. `expectation_violation_score` was a strong pure belief-error probe, but had fewer mature folds.
3. formula baselines were clearly inferior to learned nonlinear models.

Important result:

```text
research_priority_target / hist_gbr:
mean return IC:       0.216
mean decile spread:   0.136
positive spread:      0.833
```

Expectation violation probe:

```text
expectation_violation_score / rf:
mean return IC:       0.244
mean decile spread:   0.094
folds:                3
```

Interpretation:

- The priced-belief framing is not dead.
- The belief-error target may contain useful signal.
- But `research_priority_target` currently matches the product better than raw return or pure expectation violation alone.

### Two-Stage Attempt

Tested:

```text
Stage 1: rf predicts expectation_violation_score
Stage 2: hist_gbr predicts research_priority_target using Stage 1 output
```

Result:

- strict two-stage did not become champion;
- it lost IC versus the single-stage champion;
- it likely overfit or discarded useful base-ranker information.

Key lesson:

> The belief probe helps as a corrective layer, not as a full second learned stack.

### Belief-Adjusted Blend

Next tried:

```text
0.75 * single_stage_hist_gbr_z
+ 0.25 * stage1_belief_probe_z
```

Result:

```text
mean return IC:       0.2206
mean decile spread:   0.1255
positive spread:      0.80
sector-neutral IC:    0.0987
```

This beat the single-stage champion on return IC and supported the architecture:

```text
base research-priority model + small belief-error correction
```

### Blend V2

Blend V2 added:

- regime-aware belief weights;
- expensive-compounder expectation/duration penalty;
- bottleneck overlay.

Result:

```text
mean return IC:       0.2262
mean decile spread:   0.1444
positive spread:      1.00
sector-neutral IC:    0.1081
sector-neutral spread:0.0713
```

Blend V2 became the broad shadow champion.

Interpretation:

- regime policy matters;
- small belief correction beats full two-stage stacking;
- formula-only baseline is not competitive;
- the system behaves more like a research-priority ranker than a raw return model.

### Blend V3

Blend V2 remained weak in `expensive_compounder`.

Blend V3 starts from V2 and only changes expensive compounders by adding:

- ROIC / operating margin quality offset;
- small FCF-yield support;
- leverage penalty.

Result:

```text
mean return IC:       0.2265
mean decile spread:   0.1426
positive spread:      1.00
sector-neutral IC:    0.1092
sector-neutral spread:0.0695
```

Expensive-compounder repair:

```text
Blend V2 expensive-compounder return IC:     0.0116
Blend V3 expensive-compounder return IC:     0.0596

Blend V2 expensive-compounder decile spread: -0.0435
Blend V3 expensive-compounder decile spread:  0.0089
```

Interpretation:

- V3 is the best targeted expensive-compounder repair.
- It improves IC, but gives up a little broad spread versus V2.
- It is not a clean replacement.

### Blend Selector V1

Added as a diagnostic challenger:

- base: Blend V2;
- guarded repair: use Blend V3 for expensive-compounder rows below an extreme-quality threshold;
- status: diagnostic only.

Result:

```text
mean return IC:       0.2268
mean decile spread:   0.1426
positive spread:      1.00
sector-neutral IC:    0.1097
sector-neutral spread:0.0695
```

Expensive-compounder diagnostics:

```text
Blend selector V1 expensive-compounder return IC:     0.0546
Blend selector V1 expensive-compounder decile spread: -0.0024
```

Interpretation:

- Selector V1 is the best aggregate IC policy so far.
- It does not beat V3 inside expensive compounders.
- It does not beat V2 on broad or sector-neutral spread.
- It should not be promoted without a pre-registered selector search.

## Current Leaderboard

Latest run: `artifacts/aurora_omega_v8_ranker/20260630_013956`

| Model | Folds | Mean return IC | Mean decile spread | Positive spread share |
|---|---:|---:|---:|---:|
| Blend selector V1 | 5 | 0.2268 | 0.1426 | 1.00 |
| Blend V3 | 5 | 0.2265 | 0.1426 | 1.00 |
| Blend V2 | 5 | 0.2262 | 0.1444 | 1.00 |
| Belief-adjusted blend | 5 | 0.2206 | 0.1255 | 0.80 |
| Single-stage HistGBR | 5 | 0.2127 | 0.1178 | 0.80 |
| Single-stage RF | 5 | 0.1963 | 0.1058 | 0.80 |
| Two-stage strict | 5 | 0.1842 | 0.1279 | 1.00 |
| Formula baseline | 5 | 0.0586 | -0.0221 | 0.20 |

Sector-neutral:

| Model | Sector-neutral IC | Sector-neutral spread |
|---|---:|---:|
| Blend selector V1 | 0.1097 | 0.0695 |
| Blend V3 | 0.1092 | 0.0695 |
| Blend V2 | 0.1081 | 0.0713 |
| Belief-adjusted blend | 0.0987 | 0.0468 |
| Single-stage HistGBR | 0.0957 | 0.0461 |

## What We Think We Learned

### 1. The direct neural router was the wrong center of gravity

The direct model tried to learn lens weights from weak proxy labels and noisy returns. That made it fragile. The better path is to learn or compute structured priced-belief objects and then rank research priority.

### 2. Belief error contains signal, but should be a correction, not the whole model

`expectation_violation_score` is useful. But the strict two-stage architecture underperformed. The best results came when belief error was used as a small overlay on a stronger base ranking model.

### 3. Regime-aware policy adds real value

Blend V2 improved broad ranking metrics by changing belief-correction strength by regime and adding specific overlays. This supports the idea that AURORA needs business-genome / regime logic rather than one universal score.

### 4. Expensive compounders remain the hardest important regime

This is conceptually important. AURORA must not blindly punish high valuation multiples. It must distinguish:

- expensive but feasible compounders;
- expensive expectation traps;
- genuine duration/terminal-multiple fragility.

V3 improved this, but not decisively enough.

### 5. The formula baseline is not enough

The hand-built formula is useful as a sanity anchor, but empirically weak. The product needs learned nonlinear ranking plus economic constraints and explainability.

## Known Weaknesses / Caveats

### Dataset size

The current local V8 dataset is still small:

```text
2,901 rows
297 tickers
2014-2023
```

It is enough for disciplined prototyping, not enough for a true foundation model.

### Validation horizon

The latest ranking tests are based on five effective folds in the final leaderboard. This is useful but not final proof.

### Selector risk

Selector V1 was created after observing V2/V3 behavior. It is explicitly diagnostic and should not be treated as clean out-of-sample evidence.

### Target construction risk

`research_priority_target` is a composite target. It appears useful, but we need an external review of whether it encodes the right product objective or accidentally mixes proxies in a way that could overstate usefulness.

### Expensive-compounder metrics are sample-limited

The expensive-compounder regime has only 98 rows in the latest diagnostics. Improvements there are promising, but fragile.

### Still light on real text evidence

The current V8 empirical path is mostly financial/market data. It does not yet include a robust SEC/transcript evidence graph that can validate management claims, capacity constraints, pricing power, backlog, customer concentration, etc.

### Memo truth is implemented conceptually, not yet historically mature

The backtest object exists, but we do not yet have a rich panel of historical memo claims and realized falsifier outcomes.

## Files To Review

Core implementation:

```text
scripts/build_aurora_omega_v8_dataset.py
scripts/run_aurora_omega_two_stage_ranker.py
notebooks/AURORA_OMEGA_V8_PRICED_BELIEF_DATASET_AND_RANKER.ipynb
```

Core AURORA belief modules:

```text
lib/aurora-belief-object.js
lib/aurora-belief-compiler.js
lib/aurora-belief-pipeline.js
lib/aurora-calibration-engine.js
lib/aurora-priced-belief-backtest.js
lib/aurora-omega-spine.js
```

Result docs:

```text
docs/AURORA_OMEGA_V8_FIRST_ROLLING_RESULTS_2026_06_29.md
docs/AURORA_OMEGA_V8_TWO_STAGE_AND_BLEND_RESULTS_2026_06_29.md
docs/AURORA_OMEGA_V8_BLEND_V2_RESULTS_2026_06_29.md
docs/AURORA_OMEGA_V8_BLEND_V3_RESULTS_2026_06_30.md
```

Latest artifacts:

```text
artifacts/aurora_omega_v8_dataset/20260629_190419
artifacts/aurora_omega_v8_ranker/20260630_013956
```

## Questions For Second Opinion

### 1. Is `research_priority_target` the right product objective?

It currently works better than raw return prediction in the product sense, but it is a constructed target. Please inspect whether it is economically coherent or whether it risks encoding circular proxies.

### 2. Is `expectation_violation_score` correctly defined?

The strongest thesis is that market-implied expectations versus realized business outcomes should be central. Does the current implementation capture that, or are we missing a better belief-distortion formulation?

### 3. Should Blend V2 remain champion, or should IC matter more than spread?

Current read:

- Blend V2: best broad spread.
- Selector V1: best IC.
- V3: best expensive-compounder repair.

Which metric should dominate for this product?

### 4. How should expensive compounders be handled?

This is the most important unresolved regime. Should the model use:

- explicit reverse DCF burden;
- base-rate feasibility;
- quality/ROIC offset;
- duration-risk penalty;
- terminal multiple fragility;
- separate model entirely?

### 5. What should be pre-registered before the next selector search?

We should avoid overfitting the selector. What candidate selector policies should be defined before rerunning validation?

### 6. What is the next highest-leverage data layer?

Candidates:

- larger FMP/yfinance panel;
- SEC filing text evidence;
- analyst consensus / estimate revisions;
- peer/industry capacity and capital-cycle data;
- segment-level financials;
- synthetic business-world pretraining.

Which one most likely improves the priced-belief system rather than just adding noise?

### 7. Should the next model be better, not bigger?

We do not want a larger black-box model. We want a better inductive bias:

- rank-aware loss;
- business-physics constraints;
- monotonic constraints;
- regime-specific heads;
- calibrated abstention;
- memo-truth labels.

Which of these should come first?

## Proposed Next Step

Do not immediately scale compute.

First run a pre-registered selector and target audit:

1. Freeze the current V8 dataset and latest ranker artifact.
2. Write 5-10 selector policies before looking at validation results.
3. Evaluate all policies with the same purged rolling-origin setup.
4. Require any champion to beat:
   - V2 on broad decile spread;
   - selector V1 on return IC;
   - V3 inside expensive compounders.
5. Add a target audit:
   - remove each component of `research_priority_target`;
   - test whether performance survives;
   - check by-regime and sector-neutral behavior.

After that, scale the data panel and add text evidence.

## Bottom Line

The project has moved from a weak neural lens router to a more promising market-belief ranking system.

The strongest current empirical architecture is:

```text
single-stage research-priority model
+ expectation-violation belief probe
+ regime-aware policy overlay
```

The strongest conceptual architecture remains:

```text
priced belief object
+ belief compiler
+ business genome
+ lens legitimacy
+ falsifier engine
+ memo truth backtest
+ learning loop
```

We have a real signal, but not yet a final system. The next reviewer should focus less on picking a model and more on whether the belief targets, regime policies, and validation gates are the right ones.
