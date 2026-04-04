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

If you expect holdings quotes or private portfolio overlays to refresh inside the Next.js app, also set one of:

- `FMP_API_KEY`
- `FINANCIAL_MODELING_PREP_API_KEY`

This is required in Vercel because the app has a server-side holdings quote path in `lib/server/private-portfolio.js` that calls FMP directly. Having the key only in Railway refreshes the Python backend, but it does not cover the Next.js overlay path.

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
- `BLS_PRIME_SESSION_COOKIE_NAME`
- `BLS_PRIME_SESSION_DAYS`

The current auth flow uses email plus password and stores sessions in Neon.
New users create their account from `/login`, while legacy users created under
the older shared-access flow can use `Create account` once to define their
password on the existing email.

### Password reset

The app now includes `/forgot-password` and `/reset-password`.

Recommended environment variables:

- `BLS_PRIME_PASSWORD_RESET_EXPIRY_MINUTES`
- `BLS_PRIME_EMAIL_FROM`
- `RESEND_API_KEY`

For local development, you can also enable:

- `BLS_PRIME_PASSWORD_RESET_DEV_FALLBACK=1`

That fallback exposes the reset link back to the browser only in development or
when you explicitly enable it, so you can test the full recovery flow before
email delivery is configured.

### FMP split by runtime

If FMP "does nothing", check both runtimes separately:

- `Railway` needs `FMP_API_KEY` or `FINANCIAL_MODELING_PREP_API_KEY` for backend snapshot and market-data refreshes.
- `Vercel` needs the same key if you use private holdings, local portfolio overlays, or any server-rendered quote enrichment in the app.
- `Vercel` also needs `BLS_PRIME_BACKEND_URL` pointing to the live Railway backend.

If the frontend can load but holdings still look stale, the common failure mode is: key exists in Railway, but not in Vercel.

## Status

This is an active research codebase. Some modules are experimental and are intentionally kept separate from production decision logic until they demonstrate value in backtests and out-of-sample evaluation.
