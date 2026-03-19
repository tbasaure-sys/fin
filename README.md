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

This frontend now avoids seeded market ideas, alerts, and watchlists when live artifacts are missing.
If the backend snapshot is sparse, the UI should show honest empty or unavailable states instead of demo content.

### Vercel preview

The repository includes:

- `railway.toml`
- `Procfile`
- `vercel.json`

For a working preview deployment, set at least these environment variables in Vercel:

- `BLS_PRIME_BACKEND_URL`
- `NEXT_PUBLIC_BLS_APP_NAME`
- `NEXT_PUBLIC_BLS_WORKSPACE_ID`
- `BLS_PRIME_ALPHA_MODE`
- `BLS_PRIME_INVITE_CONTACT`

Optional if you are using invite-link access:

- `BLS_PRIME_SHARED_ACCESS_TOKEN`
- `BLS_PRIME_SHARED_ACCESS_QUERY_KEY`

On Vercel, this repository should be treated as a Next.js project, not as a Python runtime.
Environment variables are documented in `.env.example`.

### Neon initialization

The repository now includes a Neon-ready storage foundation for user state.

Set:

- `DATABASE_URL`
- `BLS_PRIME_STORAGE_BACKEND=auto` or `neon`

Then apply the initial schema:

```bash
npm run db:neon:apply
```

The first Neon-backed state path is watchlists plus command history, while holdings remain on the current overlay until the auth migration is complete.

### Private workspace auth

The app now supports a public homepage plus a private `/app` workspace.

Set these environment variables:

- `BLS_PRIME_AUTH_SECRET`
- `BLS_PRIME_SIGNIN_CODE`
- `BLS_PRIME_SESSION_COOKIE_NAME`
- `BLS_PRIME_SESSION_DAYS`

The current auth flow is access-code based and stores sessions in Neon. It is designed as the bridge between the old shared alpha model and a fuller production auth setup.

## Status

This is an active research codebase. Some modules are experimental and are intentionally kept separate from production decision logic until they demonstrate value in backtests and out-of-sample evaluation.
