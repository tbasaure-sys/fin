# AURORA External Review Brief

Date: 2026-06-28  
Repo: `blsprime-fin`  
Primary runner: `scripts/run_aurora_router_local.py`  
Latest local artifact: `artifacts/aurora_router/20260628_112653`

## Why This Exists

We are building a valuation intelligence system, not a black-box fair value model.

The core product ambition is:

> Given a company, its economic regime, data quality, market-implied expectations, qualitative bottlenecks, capital cycle, and uncertainty, decide which valuation questions deserve trust right now.

The current system has improved from a failed neural router into a more disciplined AURORA pipeline:

- Audited point-in-time data.
- Explicit valuation lenses.
- Train-only label construction.
- Separate 1Y and 3Y horizons.
- Deterministic baselines.
- Shadow ML only.
- Strict production gates.

But we have not yet found the element that makes the system take off.

This document is a handoff for an external reviewer or another agent to challenge the approach and propose the next breakthrough.

## Current State

### Data

Current local panel:

```text
rows: 2,901
tickers: 297
feature years: 2014-2023
train: <= 2020
validation: >= 2021
forward horizons: 1Y and 3Y
```

Important fixes already made:

- Uses `acceptedDate`, `fillingDate`, or `filingDate` plus one day as `asof_date`.
- Falls back to fiscal date plus 75 days only when filing metadata is missing.
- Calculates forward returns from `asof_date`, not fiscal-year end.
- Separates 1Y and 3Y labels instead of mixing them.
- Macro rate sanity checks avoid the old `^TNX` scaling bug.
- Cached panel can be reused locally without downloading FMP again.
- FMP API key is not written to artifacts.

### Active Lenses

The current lens set is:

```text
dcf
roicFade
reverseDcf
residualIncome
assetValue
unitEconomics
bottleneck
realOptions
capitalCycle
```

The active set is horizon-specific:

```text
1Y active:
  all lenses, including capitalCycle

3Y active:
  all lenses except capitalCycle
```

Rationale:

- `capitalCycle` behaves like a tactical supply-response lens.
- It helped 1Y diagnostics but diluted the intrinsic 3Y router.

## Latest Results

Latest artifact:

```text
artifacts/aurora_router/20260628_112653
```

### 1Y

```text
best model: logistic
production candidate: false
uniform MAE: 0.2516
logistic MAE: 0.2525
uniform IC: 0.0698
logistic IC: 0.0996
best validation diagnostic lens: capitalCycle
capitalCycle MAE: 0.2466
```

Interpretation:

- There is ranking signal in the classifier.
- `capitalCycle` looks useful in validation.
- But MAE does not beat uniform.
- Method concentration fails.
- Pre-2021 selection rules do not reliably choose `capitalCycle`.

Current 1Y diagnosis:

> 1Y is not an intrinsic valuation problem. It is closer to a tactical market setup / supply-response / expectations-reset problem. Forcing the same valuation objective onto 1Y is probably conceptually wrong.

### 3Y

```text
best model: lens_portfolio
production candidate: false
uniform MAE: 0.1498
train-selected best single lens: reverseDcf
reverseDcf validation MAE: 0.1426
validation diagnostic best lens: assetValue
assetValue validation MAE: 0.1421
lens_portfolio: 80% assetValue / 20% residualIncome
lens_portfolio MAE: 0.1423
```

Interpretation:

- 3Y has a credible shadow candidate.
- The useful signal is not a neural router; it is a simple intrinsic-value lens portfolio.
- `assetValue` appears surprisingly strong.
- `residualIncome` adds a modest book-capital cross-check.
- But the model is still not production-worthy because:
  - it does not beat the best validation diagnostic lens;
  - it is highly concentrated;
  - IC is not clearly better than uniform;
  - gates intentionally remain strict.

Current 3Y diagnosis:

> The promising direction is not a bigger router. It is making `assetValue`, `reverseDcf`, and `residualIncome` into real economic lenses and then routing among them with regime awareness.

## What Failed

### Direct Neural Router

Previous neural versions failed because:

- They lost to uniform or train-mean baselines.
- Labels were too sharp relative to actual signal.
- High-confidence buckets did not have lift.
- Some routers collapsed into one or two methods.
- The MLP was not the bottleneck; the label/lens layer was.

Conclusion:

> Do not build another MLP router as the main answer.

### Label Factory

Earlier label factories produced artificial conviction:

- Too many rows labeled high conviction.
- The best method often won by chance because all lenses were proxy-like.
- Indeterminate cases were underweighted.

Fixes already applied:

- Strict high-conviction rule.
- Validation labels are diagnostic only.
- Audit scope is train-only.
- Separate horizons.

Still unresolved:

- We may need labels that are not based only on realized return error.
- We may need labels based on economic regime, falsifier realization, and investor usefulness.

### 1Y Objective

The 1Y task is unstable under MAE optimization.

Possible reason:

- 1Y price movement is strongly affected by macro shocks, multiple expansion/compression, positioning, earnings surprise, and narrative shifts.
- Intrinsic value lenses may still be directionally useful, but MAE to 1Y realized return is a noisy target.

Hypothesis:

> 1Y needs a different target: tactical setup quality, expectation reset risk, capital-cycle pressure, or rank/IC objective rather than absolute return MAE.

## What Seems Promising

### 1. Asset Value Is Stronger Than Expected

In 3Y validation, `assetValue` is the best diagnostic lens:

```text
assetValue MAE: 0.1421
reverseDcf MAE: 0.1426
uniform MAE: 0.1498
```

This may mean one of three things:

1. The market regime 2021-2023 rewarded balance-sheet downside anchors after the rate shock.
2. The proxy is accidentally capturing value/quality factors.
3. The lens is genuinely useful as a sanity anchor when DCF-like optimism is fragile.

External reviewer question:

> Is the `assetValue` edge real, regime-specific, or a proxy artifact?

### 2. Reverse DCF Remains Important

`reverseDcf` is train-selected as best 3Y single lens.

This fits the product thesis:

> The question "what expectations are already in the price?" may be more robust than pretending we know precise long-term cash flows.

External reviewer question:

> Should reverse DCF become the central spine of Valuation OS, with other lenses used to judge whether implied expectations are feasible?

### 3. Capital Cycle May Be the 1Y Unlock

`capitalCycle` is the best 1Y validation diagnostic lens by MAE, but current train-only selection does not choose it robustly.

External reviewer question:

> Should we stop treating 1Y as valuation and instead build a dedicated capital-cycle / expectation-reset lab?

### 4. The Router May Need to Route Questions, Not Forecasts

The most important conceptual shift may be:

```text
Bad framing:
  Which method predicts realized return best?

Better framing:
  Which question should the investor ask first for this company now?
```

Examples:

- Expensive compounder: are expectations feasible?
- Financial: is book capital creating value above cost of equity?
- Cyclical: where are we in the supply response?
- Pre-profit platform: are unit economics improving and is optionality real?
- Bottleneck business: is scarcity durable and monetizable?
- Asset-heavy distressed company: is asset value a floor or a trap?

This may require different labels:

- Method usefulness.
- Regime fit.
- Question priority.
- Falsifier sensitivity.
- Evidence sufficiency.
- Abstention.

## Candidate Breakthrough Directions

### Direction A: Reverse DCF as the Spine

Make the product centered on market-implied expectations:

1. Start with current price.
2. Infer implied revenue growth, margin, ROIC, reinvestment, and terminal assumptions.
3. Use other lenses to test feasibility.
4. Output: "the market is pricing X; here is what must be true."

Why this may work:

- Avoids false precision.
- Works across many industries.
- Naturally explains expensive stocks.
- Connects valuation to falsifiers.

Risk:

- Needs strong feasibility models by sector/regime.

### Direction B: Regime-First Router

Build a deterministic economic regime engine first:

```text
quality compounder
asset-heavy cyclical
financial
pre-profit platform
bottleneck oligopoly
regulated utility
turnaround
disrupted incumbent
bubble-expectations
capital-cycle reset
```

Then each regime has:

- preferred lenses;
- excluded lenses;
- key assumptions;
- falsifiers;
- confidence penalties.

Why this may work:

- More explainable.
- Less data hungry.
- More aligned with investor reasoning.

Risk:

- Requires careful regime taxonomy and sector exceptions.

### Direction C: Lens Forge Before Router

Stop improving the router until the lenses are economically real.

Priority lenses:

1. Reverse DCF feasibility engine.
2. Asset value / replacement cost / tangible capital lens.
3. Residual income for financials and book-capital businesses.
4. Capital cycle lens for cyclicals, semis, energy, materials, industrials.
5. Bottleneck power lens for capacity-constrained oligopolies.

Why this may work:

- A router cannot rescue weak experts.
- Current results show single lenses can beat model combinations.

Risk:

- Slower build; more domain engineering.

### Direction D: Investor Usefulness Objective

Stop optimizing only realized return MAE.

Add objectives such as:

- Does the output identify the right falsifier?
- Does it flag over-embedded expectations?
- Does it avoid false precision?
- Does high confidence actually improve outcomes?
- Does the system rank opportunities better within a year?
- Does it abstain when the company is outside known regimes?

Why this may work:

- Better aligned with the product.
- Reduces pressure to predict noisy returns.

Risk:

- Harder labels; may need human-reviewed training sets.

### Direction E: Hybrid Memo Engine

Use deterministic economics and retrieval first, ML second.

For each ticker:

1. Data trust check.
2. Regime classification.
3. Reverse DCF expectations.
4. Lens portfolio.
5. Qualitative evidence from filings/news.
6. Multi-agent debate.
7. Final memo with confidence, assumptions, falsifiers, and abstentions.

Why this may work:

- The product becomes useful before the neural model is perfect.
- It can explain itself to technical and non-technical users.

Risk:

- Requires careful UX and caching to avoid rate limits.

## Questions for External Review

Please answer these directly.

1. What is the single highest-leverage conceptual mistake we may still be making?
2. Is realized return MAE the wrong objective for this product?
3. Should reverse DCF become the spine of the whole system?
4. Is the `assetValue` 3Y edge likely real, regime-specific, or an artifact?
5. Should 1Y be separated entirely into a tactical/capital-cycle module?
6. What labels would you use instead of "which lens had the lowest realized-return error?"
7. What regime taxonomy is both useful and not overfit?
8. Which lens should be made economically real first?
9. What would a production-grade validation protocol look like for this system?
10. What is the one product output that would make this meaningfully different from every other valuation tool?

## Current Recommendation Before External Input

Do not promote any learned router yet.

The strongest near-term direction is:

```text
AURORA v1 =
  Reverse DCF expectations spine
  + Regime-first deterministic router
  + Real Asset Value / Residual Income / Capital Cycle lenses
  + Evidence/falsifier memo engine
  + Shadow ML only
```

The likely "takeoff" element is not a better classifier.

It is probably:

> A system that tells the investor which valuation question is the right question, what the market already believes, what would have to be true, and which observable evidence would falsify the thesis.

That is the thing worth stress-testing next.

## Implementation Update - 2026-06-28

Implemented the architecture split in:

```text
scripts/run_aurora_router_local.py
```

New CLI modes:

```text
python scripts/run_aurora_router_local.py --mode spine_v1
python scripts/run_aurora_router_local.py --mode tactical_1y
python scripts/run_aurora_router_local.py --mode ml_shadow --horizons 1,3
python scripts/run_aurora_router_local.py --mode all --horizons 1,3
```

Latest full run:

```text
python scripts/run_aurora_router_local.py --mode all --horizons 1,3
```

Generated artifacts:

```text
artifacts/aurora_spine_v1/20260628_120833
artifacts/aurora_tactical_1y/20260628_120833
artifacts/aurora_router/20260628_120833
```

### AURORA Spine V1

Artifact:

```text
artifacts/aurora_spine_v1/20260628_120833
```

Files:

```text
spine_summary.json
spine_memos.jsonl
spine_memos_flat.csv
```

Contract:

- Assigns a regime.
- Chooses a primary valuation question.
- Computes market-implied expectations.
- Scores feasibility.
- Checks supporting lenses.
- Generates falsifiers.
- Computes confidence.
- Allows abstention from precise fair value.

Latest validation:

```text
rows: 605
spine_composite_mae: 0.1462
spine_composite_ic: 0.2085
latest_memos: 296
production_scope: memo_output_candidate_not_return_forecast_router
```

Interpretation:

- This is now a memo/output candidate.
- It is not a claim that the spine composite is the best return forecaster.
- The spine composite has materially better IC than the prior simple lenses, but worse MAE than the strongest individual 3Y lenses.

### AURORA Tactical 1Y

Artifact:

```text
artifacts/aurora_tactical_1y/20260628_120833
```

Files:

```text
tactical_summary.json
tactical_scores.csv
```

Contract:

- Explicitly not intrinsic valuation.
- Evaluates tactical setup / capital-cycle pressure / expectation reset ranking.
- Uses IC and top-bottom decile spread instead of fair-value MAE.

Latest validation:

```text
spearman_ic_by_year: 0.0390
mean_decile_spread: 0.0521
positive_spread_share: 0.667
production_candidate: false
```

Reason it remains research-only:

- 2021 and 2022 spreads were positive.
- 2023 spread was negative.
- The new gate requires positive spread in every validation year.

### ML Shadow Router

Artifact:

```text
artifacts/aurora_router/20260628_120833
```

Files:

```text
summary.json
report_1y.json
report_3y.json
SHADOW_DO_NOT_PROMOTE.json
```

Latest status:

```text
1Y production_candidate: false
3Y production_candidate: false
```

The previous artifact was also frozen:

```text
artifacts/aurora_router/20260628_112653/SHADOW_DO_NOT_PROMOTE.json
```

### Updated System Shape

```text
AURORA 3Y Spine
  production scope: question memo and falsifier engine
  status: memo candidate

AURORA 1Y Tactical Lab
  production scope: tactical research only
  status: not candidate yet

AURORA ML Shadow Router
  production scope: none
  status: diagnostic only
```

The next product step is to wire `spine_memos.jsonl` into Valuation OS UI and the multi-agent debate layer.
