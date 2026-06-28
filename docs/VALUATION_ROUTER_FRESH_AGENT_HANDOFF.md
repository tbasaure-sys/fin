# Valuation OS Neural Router: Fresh-Agent Handoff

Date: 2026-06-27

Update: the follow-up architecture decision is now captured in
`docs/AURORA_VALUATION_INTELLIGENCE_SYSTEM.md`. The agreed direction is not
"another MLP router V5"; it is AURORA, a deterministic-prior plus learned-residual
valuation intelligence system with audited data, real valuation lenses, regime
classification, reliability learning, uncertainty, and abstention.

## Current Situation

We are trying to train a neural router for Valuation OS. The goal is not to train a black-box fair-value model. The intended product idea is a method selector / weight allocator: given a company-year snapshot, choose how much weight to place on valuation families such as DCF, ROIC fade, reverse DCF, residual income, asset value, unit economics, bottleneck power, and real options.

The latest ambitious V4 Colab run was worse than earlier attempts and should not be treated as production-worthy. It did ingest a broader FMP-backed panel successfully, but the learning setup appears flawed.

The latest executed notebook inspected was:

`C:/Users/T14 Ultra 7/Downloads/VALUATION_OS_NEURAL_ROUTER_AMBITIOUS_V4_KEYED_COLAB (1).ipynb`

Important: do not copy API keys from that notebook into any committed artifact. This handoff intentionally omits secrets.

## What Actually Ran

Data coverage looked superficially strong:

- FMP configured: true.
- Universe: embedded core full.
- Ticker count: 297.
- Panel rows: 2,901.
- Label rows with realized returns: 2,828.
- Train split: 1,941 rows, 2014-2020.
- Validation split: 887 rows, 2021-2023.
- Validation tickers: 296.

The model trained an MLP router over engineered accounting, market, macro, and qualitative proxy features. It used soft labels derived from realized forecast error across the eight hand-built valuation-family proxy models.

The V4 notebook also attempted a second-pass ExtraTrees teacher plus distilled MLP, but this did not improve validation MAE. The notebook then failed during export because `joblib.dump(preprocess, ...)` tried to pickle a `FunctionTransformer(lambda ...)`.

## Latest V4 Results

The V4 run did not beat simple baselines:

- `label_mae_model`: 0.0476659
- `label_mae_uniform`: 0.0470785
- `label_mae_train_mean`: 0.0473201
- `forecast_mae_model`: 0.1855006
- `forecast_mae_uniform`: 0.1852113
- `forecast_mae_train_mean`: 0.1852096
- `forecast_mae_best_single`: 0.1859647
- `best_single_model`: `assetValue`
- `top1_method_accuracy`: 0.1601
- `max_predicted_method_share`: 0.6065
- `mean_prediction_entropy`: 2.0736
- `directional_accuracy`: 0.6776
- `forecast_ic_model`: 0.0635
- `forecast_ic_uniform`: 0.0756
- `forecast_ic_best_single`: 0.0743
- `high_confidence_mae_model`: 0.2144
- `high_confidence_mae_uniform`: 0.2136
- `production_candidate`: false

The production gates failed on the important checks:

- Did not beat uniform label baseline.
- Did not beat train-mean label baseline.
- Did not beat uniform forecast baseline.
- Did not beat train-mean forecast baseline.
- Did not achieve positive IC above the required margin.
- High-confidence bucket did not have lift.

This is materially worse than the earlier V2-ish result the user reported:

- Earlier `mae_model`: 0.0547269 vs `mae_uniform`: 0.0549058.
- Earlier `production_candidate`: true.
- Earlier `top1_method_accuracy`: 0.2256.
- Earlier `max_predicted_method_share`: 0.2607.

V4 got a lower absolute label MAE because the label distribution changed, not because it learned a better economic router. Against its own V4 uniform baseline, it lost.

## Red Flags

### 1. The Labels Are Almost Uniform

The V4 soft labels have very low conviction. Examples from the first rows:

- `effective_methods` often around 7.8 out of 8.
- `label_conviction` often near 0.004 to 0.035.
- Target weights often sit close to 0.10-0.17 for nearly every method.

This means the model is being trained to predict nearly uniform distributions. If the teacher target is almost uniform, "learning" mostly becomes noise fitting. It also explains the strange combination of high entropy and top-method concentration: tiny differences decide the argmax, but the actual weights remain nearly flat.

### 2. Training Immediately Overfit Or Degraded

Best epoch was epoch 0:

- Epoch 0 validation MAE: 0.0476659.
- Later epochs degraded to roughly 0.054-0.056.

That is a strong sign that the architecture/training objective is not extracting stable signal. It may be memorizing pre-2021 regimes that do not transfer into 2021-2023, or the labels are too noisy/flat to train against.

### 3. Top-Method Behavior Collapsed In Practice

Predicted top-method share:

- `reverseDcf`: 60.65%
- `unitEconomics`: 21.98%
- `realOptions`: 8.79%
- Others are small.

This fails the spirit of a thoughtful valuation router. Even if weights are high entropy, the top choice is mostly an artifact. It is not behaving like a regime-aware committee.

### 4. Macro Ri[REDACTED_OPENAI_KEY] Rate Has A Visible Bug

The macro table shows `risk_free_10y = 0.12000` in 2020, with a one-year delta of about +10 percentage points. That is economically wrong for the U.S. 10Y in 2020.

Likely cause: Yahoo `^TNX` sometimes reports yields in percent units such as `0.917` meaning 0.917%, but the code treats values below 1 as already decimal yield. So `0.917` becomes 91.7%, then gets clipped to 12%. This contaminates macro cost anchors, valuation proxy forecasts, and regime features.

This must be fixed before any serious training.

### 5. The "Valuation Methods" Are Hand-Built Proxy Scores, Not Real Valuation Models

The current method predictions are formulas such as:

- `pred_dcf = anchor + z_fcf_yield + z_growth - z_debt`
- `pred_roicFade = anchor + z_roic + z_quality - z_ev_to_sales`
- `pred_bottleneck = anchor + z_bottleneck_proxy + sector_z + demand_supply_proxy`

These are useful heuristics, but the target is "which heuristic had lower realized return error", not "which valuation framework was economically correct." If the proxy methods are weak or too similar, the router can only learn weak distinctions.

### 6. The Evaluation Target May Be Conceptually Mismatched

The model is evaluated partly on whether weighted proxy forecasts predict realized future annualized returns. But the product needs a valuation-confidence router that should also reason about:

- uncertainty,
- industry regime,
- supply-demand bottlenecks,
- qualitative thesis strength,
- capital cycle,
- duration / rate sensitivity,
- cyclicality,
- accounting comparability,
- catalyst timing,
- data sufficiency.

Pure realized-return MAE may punish valid valuation reasoning when price moves are driven by multiple expansion, macro shocks, or short-window noise.

### 7. Export Failed

Even after a failed model, the artifact did not export:

`PicklingError: Can't pickle <function <lambda> ...>: it's not found as __main__.<lambda>`

Cause: `FunctionTransformer(lambda X: ...)` inside the scikit pipeline. Replace the lambda with a named top-level function or avoid joblib-pickling the full pipeline and rely on the JSON `preprocess_state` export.

## Working Interpretation

The V4 direction was ambitious in the wrong place. It expanded data and added complexity before establishing that the label construction contains stable economic signal.

The most likely failure mode is not "the neural net is too weak." It is:

1. macro feature corruption,
2. weak/similar proxy valuation methods,
3. low-conviction soft labels,
4. noisy realized-return target,
5. temporal non-stationarity across 2021-2023,
6. insufficient separation between "valuation method selection" and "return forecasting."

In other words: the router was asked to learn subtle weights from a teacher that is almost indifferent among methods, while the validation period is a regime shift.

## What Another Agent Should Reconsider

### A. Rebuild The Objective Before Changing The Model

Do not start by making the neural net larger. First decide what the router should optimize.

Candidate objectives:

1. Method-family allocation objective:
   Learn which valuation lens produces the most reliable forward estimate, but only after each lens is made economically real and sufficiently distinct.

2. Regime classification objective:
   Predict company/regime states first, then map regimes deterministically or semi-parametrically to method weights.

3. Forecast-combination objective:
   Train weights to minimize out-of-sample forecast loss with strong regularization, monotonic constraints, and time-series cross-validation.

4. Confidence-aware objective:
   Output both weights and abstention/uncertainty. Penalize confident wrong calls more than uncertain ones.

5. Ranking objective:
   Optimize cross-sectional information coefficient or pairwise ranking by year, not just return MAE.

### B. Separate Three Problems

The current notebook blends three hard problems:

- building valuation method forecasts,
- deciding method weights,
- predicting realized equity returns.

A better architecture may need three layers:

1. Valuation lens layer:
   Produce lens-specific expected return / fair-value gap estimates with explicit assumptions and uncertainty.

2. Economic regime layer:
   Classify firm-year into interpretable regimes: quality compounder, asset-heavy cyclical, pre-profit growth, bottleneck power, financial, commodity, regulated utility, disrupted incumbent, etc.

3. Router layer:
   Convert lens outputs + regime + uncertainty into weights. This can start deterministic and later become learned.

### C. Make The Labels Less Mushy

Possible label alternatives:

- Use hard labels only when the best method beats the second-best by a meaningful margin; otherwise label as "indeterminate."
- Train a classifier on high-conviction rows only, then use calibrated probabilities.
- Use pairwise preferences between methods instead of 8-way softmax.
- Use regret labels: how much return-forecast error would have been avoided by choosing each method.
- Use quantile/rank loss by year rather than raw MAE.
- Use multi-horizon labels separately: 1Y, 3Y, maybe 5Y if data supports it.
- Avoid forcing a method decision when all methods are similarly bad.

### D. Make The Methods Economically Distinct

Before training a router, each method should have a genuine economic signature:

- DCF: FCF yield, margin durability, reinvestment, growth fade, WACC sensitivity.
- ROIC fade: excess ROIC, reinvestment runway, competitive erosion, capital intensity.
- Reverse DCF: market-implied growth/margin/ROIC feasibility.
- Residual income: book capital, ROE/COE spread, financials-friendly accounting.
- Asset value: tangible book, replacement cost, commodity/resource/real-estate asset base.
- Unit economics: contribution margin, cohort growth, scale economics, CAC/LTV when available.
- Bottleneck: supply concentration, capacity constraints, pricing power, order backlog, scarce inputs.
- Real options: platform optionality, R&D intensity, volatility, new-market expansion, convexity.

Current proxy formulas are directionally useful but too ad hoc. The next pass should either improve these lens forecasts or lower claims and treat them as toy teachers.

### E. Use Walk-Forward Validation More Seriously

The split 2014-2020 train / 2021-2023 validation is good as a stress test, but one split is not enough.

Recommended validation:

- rolling-origin folds, e.g. train through 2016 validate 2017, train through 2017 validate 2018, etc.;
- by-year IC and MAE, not pooled only;
- by-sector and by-regime diagnostics;
- embargo around fiscal dates if price/filing leakage is possible;
- no ticker leakage if using ticker identity indirectly through categories;
- compare to deterministic router, uniform weights, train-mean weights, and best-single lens selected only from training.

### F. Fix The Macro Layer First

Specific fix:

- Use FRED DGS10 if possible, or robustly parse `^TNX`.
- Treat `^TNX` values as percentage points, so `0.917` means `0.00917`, not `0.917`.
- Add sanity gates: ri[REDACTED_OPENAI_KEY] rate should generally be 0-8%, maybe allow up to 12% only for non-U.S. / inflation crisis cases with explicit source.
- Store source and date for every macro assumption.

### G. Consider A Deterministic Router As The Production Baseline

The production product should not wait for a neural model. A strong deterministic or semi-deterministic router may be better today:

- Identify regime with explicit rules.
- Assign prior weights by regime.
- Adjust weights by data quality, leverage, cyclicality, duration, bottleneck evidence, and qualitative catalyst evidence.
- Output uncertainty and "why these weights."
- Use the neural router only as a shadow comparison until it beats deterministic gates consistently.

## Proposed Next Methodology

The next agent should consider this path:

1. Patch data quality:
   Fix ri[REDACTED_OPENAI_KEY] rate parsing, remove export lambda, add data sanity checks, and rerun V4 without changing model architecture.

2. Audit method forecasts:
   For each valuation lens, report validation MAE, IC, directional accuracy, and performance by regime/year. If lenses are not meaningfully differentiated, do not train a router yet.

3. Rebuild labels:
   Create high-conviction labels only where one method clearly beats alternatives. Add an `indeterminate` class or train only on high-signal rows.

4. Establish deterministic baseline:
   Implement a transparent regime-based router and evaluate it against uniform/train-mean/best-single.

5. Train simple models before neural:
   Try multinomial logistic / calibrated gradient boosting / monotonic GAM-style model on high-conviction labels. Use the neural model only after simple models show signal.

6. Optimize for product reliability:
   Promotion should require forecast lift, IC lift, high-confidence lift, not-collapsed weights, and stable by-year results. A single aggregate MAE edge is not enough.

7. Add qualitative and supply-demand evidence:
   The router should consume structured catalyst/context signals already being built in Valuation OS: bottlenecks, demand inflection, pricing power, qualitative thesis strength, and falsifiers.

## Concrete Questions For Fresh Review

- Are we training the right target, or should this be a regime-first model?
- Are realized equity returns the right supervisory signal, or should we supervise on valuation forecast reliability plus rank outcomes?
- Should "method weights" be learned directly, or should the model predict interpretable regime variables that then map to weights?
- How much of the apparent failure is caused by the macro bug versus label softness?
- Can we create a high-conviction subset where method choice actually matters?
- Are the eight current methods distinct enough to serve as teachers?
- Would a deterministic router plus learned residual adjustment outperform direct neural weights?
- What validation gates would make this credible to a professional investor?

## Immediate Do-Not-Promote Decision

Do not promote the V4 router artifact.

Reasons:

- It loses to uniform and train-mean baselines.
- It has lower IC than uniform.
- Its high-confidence bucket is worse than uniform.
- It is effectively low-confidence everywhere.
- It has top-method concentration in `reverseDcf`.
- It contains a visible macro bug.
- It failed export due to a pickling issue.

The work is still useful because it exposed the real problem: we need a better economic training methodology, not just a bigger model.
