# Meta Allocator

Meta Allocator is a research and decision-support system for dynamic market exposure.

It combines:

- a market state engine for fragility, tail risk, and cross-asset structure
- a policy layer for beta sizing and hedge selection
- sector and international opportunity maps
- statement and cash-conversion intelligence for holdings and discovery
- a local workstation UI for monitoring current conditions and research outputs

## What it does

The project is designed to answer a practical portfolio question:

- how much market exposure is justified now
- which hedge is most appropriate now
- whether diversification is still functioning normally
- which sectors, regions, and holdings look strongest or most fragile

The current stack includes:

- state and tail-risk modeling
- spectral structure analysis and structure-conditioned Monte Carlo
- heuristic and learned overlays for exposure control
- financial-statement and earnings-to-cash diagnostics
- a local dashboard and CLI workflows

## Repository scope

This repository contains the application code, tests, deployment configuration, and documentation needed to run the system.

Generated artifacts, cached market data, local reports, and private environment files are intentionally excluded from version control.

## Local development

```powershell
python -m pip install -r requirements.txt
$env:PYTHONPATH='src'
python -m meta_alpha_allocator.cli dashboard serve
```

Available commands include:

- `research`
- `train`
- `production`
- `policy`
- `tail-risk`
- `forecast-baseline`
- `statement-intel`
- `earnings-cash-kernel`
- `spectral-backtest`
- `dashboard serve`

## Deployment

Recommended deployment split:

- `Railway` for the Python backend
- `Vercel` for the dashboard frontend

The repository includes:

- `railway.toml`
- `Procfile`
- `vercel.json`
- a Vercel API proxy for forwarding `/api/*` requests to the backend

On Vercel, this repository should be treated as a static/Node project, not as a Python runtime.

Environment variables are documented in `.env.example`.

## Status

This is an active research codebase. Some modules are experimental and are intentionally kept separate from production decision logic until they demonstrate value in backtests and out-of-sample evaluation.
