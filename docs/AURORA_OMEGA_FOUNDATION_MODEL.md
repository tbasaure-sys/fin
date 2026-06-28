# AURORA Omega Foundation Model

Date: 2026-06-28  
Status: shadow research, not production  
Latest artifact: `artifacts/aurora_omega/20260628_124707`

## Thesis

AURORA Omega is the ambitious neural track for Valuation OS.

It does not replace the current `spine_v1` product memo candidate. Instead, it is the research path toward a valuation foundation model that learns:

- latent business state;
- regime and primary valuation question;
- market-implied expectation pressure;
- feasibility and downside anchor quality;
- differentiable valuation lens outputs;
- sparse mixture-of-experts lens routing;
- Valuation MRI style output.

The north star is:

```text
Do not train a neural model merely to choose historical winner lenses.
Train a model to understand the business state, the market's embedded belief,
the relevant valuation question, and the evidence that would falsify the thesis.
```

## Implemented Files

```text
aurora_omega/__init__.py
aurora_omega/data.py
aurora_omega/model.py
aurora_omega/train.py
aurora_omega/outputs.py
scripts/run_aurora_omega.py
```

Artifacts are ignored in Git:

```text
artifacts/aurora_omega/
```

## Runner

Local:

```powershell
python scripts\run_aurora_omega.py --epochs 20 --batch-size 256 --d-model 128
```

Colab/GPU-ready:

```bash
python scripts/run_aurora_omega.py --epochs 100 --batch-size 512 --d-model 192 --device cuda
```

The runner reuses the existing point-in-time panel and the current AURORA spine heuristics:

- `scripts/run_aurora_router_local.py` builds the audited panel and lenses.
- Omega adds neural training on top.
- No API key is written to artifacts.

## Current Architecture

Implemented compact v0:

```text
current financial encoder
temporal sequence transformer
latent business state
differentiable lens experts
regime head
primary-question head
expectations / feasibility / anchor scalar head
bounded return head
sparse top-k MoE lens router
uncertainty head
Valuation MRI exporter
```

This is intentionally smaller than the final ambition, but it preserves the correct shape.

## Training Tasks In V0

The current multitask loss trains:

- lens expert distillation from the explicit valuation lenses;
- 1Y and 3Y return heads;
- 3Y MoE lens composite;
- regime classification;
- primary question classification;
- expectation pressure / feasibility / downside anchor scalars;
- entropy regularization to avoid hard collapse;
- light uncertainty regularization.

## Latest Results

Latest run:

```text
artifacts/aurora_omega/20260628_124707
```

Validation:

```text
mae_1y: 0.2892
mae_3y_return_head: 0.1633
mae_omega_moe_3y: 0.1468
max_mean_lens_weight: 0.2517
mri_count: 297
production_candidate: false
```

Mean lens weights:

```text
dcf: 0.003
roicFade: 0.039
reverseDcf: 0.241
residualIncome: 0.069
assetValue: 0.177
unitEconomics: 0.252
bottleneck: 0.042
realOptions: 0.070
capitalCycle: 0.107
```

Comparison:

```text
spine_v1 composite 3Y MAE: 0.1462
Omega MoE 3Y MAE:        0.1468
best diagnostic lens:    assetValue at 0.1421
```

Interpretation:

- The direct neural return head is not useful yet.
- The sparse MoE lens composite is the meaningful neural output.
- Omega v0 is close to the deterministic spine but does not beat it.
- It does not collapse into one method.
- It is not production-worthy.

## What This Proves

Omega v0 proves the architecture can run locally end-to-end:

- point-in-time panel to neural dataset;
- temporal transformer training;
- multitask heads;
- sparse lens routing;
- MRI output;
- artifact persistence.

It also proves that simply adding a neural model on 2,901 rows is not enough.

That is an important result. The blocker is no longer engineering feasibility; the blocker is data scale and objective design.

## Next Breakthrough Requirements

### 1. Bigger Data

The current panel is too small for a foundation model:

```text
2,901 company-year rows
297 tickers
2014-2023
```

Next target:

```text
8,000-30,000 company-year rows
1,000-3,000 tickers
2005-2025 if available
US + ADR + liquid international
```

### 2. Pretraining Before Return Prediction

Do not start with returns.

Add pretraining tasks:

- masked financial reconstruction;
- next financial state forecasting;
- peer contrastive learning;
- reverse DCF reconstruction;
- accounting anomaly / data quality prediction;
- counterfactual stress response.

### 3. Rank And Decile Objectives

For investment usefulness, add:

- yearly Spearman IC loss;
- pairwise rank loss;
- top-bottom decile spread objective;
- high-confidence lift objective;
- abstention penalty only when evidence is sufficient.

### 4. Textual Evidence Encoder

Add filings/calls extraction for:

- pricing power claims;
- capacity constraint claims;
- demand visibility;
- margin pressure;
- regulatory risk;
- customer concentration;
- capital allocation discipline.

Then train claim reliability against realized numbers.

### 5. Economic Graph

Add graph structure:

- peers;
- sectors;
- suppliers/customers where available;
- macro exposures;
- commodity/rate/FX sensitivity.

This is the likely path to real regime understanding.

## Current Product Boundary

Use now:

```text
spine_v1
```

Keep shadow:

```text
aurora_omega_v0
ml_shadow router
tactical_1y
```

Omega is the ambitious research path, not the current product surface.

## Next Command

If we stay local:

```powershell
python scripts\run_aurora_omega.py --epochs 40 --batch-size 256 --d-model 128
```

If we move to Colab:

```bash
python scripts/run_aurora_omega.py --epochs 120 --batch-size 512 --d-model 192 --device cuda
```

But more compute alone is not the main unlock. The main unlock is larger point-in-time data plus pretraining tasks.

## Colab Max Notebook

Notebook:

```text
notebooks/AURORA_OMEGA_COLAB_MAX.ipynb
```

Purpose:

- Request A100/L4 + High RAM.
- Mount Google Drive.
- Clone the repo.
- Patch AURORA cache/artifact paths into Drive.
- Pull a larger FMP universe through `stock-screener`.
- Build a larger point-in-time FMP panel.
- Train AURORA Omega on GPU.
- Export `valuation_mri.jsonl`, validation predictions, model weights, and a manifest to Drive.

Important:

The notebook imports:

```text
aurora_omega/
scripts/run_aurora_router_local.py
```

So the current AURORA Omega files must be pushed or otherwise available to Colab before running it. If Colab raises `Missing repo files`, push this branch or set `REPO_REF` to a branch/commit that contains these files.

Default Colab settings:

```text
TARGET_TICKERS = 1500
START_YEAR = 2005
LAST_FEATURE_YEAR = 2024
EPOCHS = 120 on GPU
BATCH_SIZE = 512 on GPU
D_MODEL = 192 on GPU
```

The notebook remains shadow-only by design. It should not promote Omega unless it beats the deterministic spine and the strongest single-lens baselines out-of-sample.
