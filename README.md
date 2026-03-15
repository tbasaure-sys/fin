# Meta Allocator

`meta_alpha_allocator` is a local-first market operating system built around
one practical question: how much beta to run, and what hedge to use when the
environment turns fragile.

The stack now combines:

- `state engine`: systemic fragility, tail risk, macro, and cross-asset structure
- `policy overlay`: learned beta sizing plus dynamic hedge switching
- `scenario synthesis`: Bayesian blending over likely macro/risk worlds
- `opportunity maps`: sector and international terrain, used as context
- `statement intelligence`: accounting quality, cash confirmation, and valuation context
- `discovery intelligence`: non-holding ideas from `portfolio_manager`, including owner elasticity

Primary local dependencies:

- `Fin_model` for systemic state and fragility
- `portfolio_manager` for holdings, discovery, valuation, and metadata
- `caria_publication/data` for historical prices and membership history

## Quick start

```powershell
cd C:\Users\T14 Ultra 7\OneDrive\Escritorio\CT\02_Finance\meta_alpha_allocator
python -m pip install -r requirements.txt
$env:PYTHONPATH='src'
$env:FMP_API_KEY='your_key_here'
$env:FRED_API_KEY='your_key_here'
python -m meta_alpha_allocator.cli tail-risk
python -m meta_alpha_allocator.cli train
python -m meta_alpha_allocator.cli production
python -m meta_alpha_allocator.cli report
python -m meta_alpha_allocator.cli forecast-baseline
python -m meta_alpha_allocator.cli statement-intel
python -m meta_alpha_allocator.cli dashboard refresh
python -m meta_alpha_allocator.cli dashboard serve --open-browser
python -m pytest
```

If you prefer a file-based setup, copy `.env.example` to `.env` and set values there for your shell or deployment platform.

## Repo hygiene

Generated artifacts are intentionally ignored from git:

- `output/`
- `cache/`
- `tmp/`
- `.pytest_cache/`

That keeps snapshots, reports, caches, and local backtest artifacts out of the repo while still letting you regenerate them locally at any time.

## Outputs

Research writes to `output/research/latest/`:

- `research_summary.json`
- `allocator_decisions.csv`
- `daily_returns.csv`
- `latest_feature_weights.csv`

Production writes to `output/production/latest/`:

- `current_allocator_decision.json`
- `current_meta_allocator_view.json`
- `current_selected_basket.csv`
- `current_sector_map.csv`
- `current_international_map.csv`
- `current_hedge_ranking.csv`

Tail-risk writes to `output/tail_risk/latest/`:

- `tail_risk_predictions.csv`
- `tail_risk_summary.json`

Forecast baselines write to `output/forecast/latest/`:

- `forecast_backtest.csv`
- `latest_forecasts.csv`
- `forecast_summary.json`

Statement intelligence writes to `output/statement_intel/latest/`:

- `statement_intelligence.csv`
- `statement_intelligence_summary.json`

Dashboard writes to `output/dashboard/latest/`:

- `dashboard_snapshot.json`
- `overview.json`
- `performance.json`
- `risk.json`
- `hedges.json`
- `sectors.json`
- `international.json`
- `portfolio.json`
- `screener.json`
- `status.json`

Document generation writes to `output/doc/`:

- `meta_allocator_methodology_report.docx`

## Workstation

The local workstation is a dense Bloomberg-style web app served from Python and
fed by the same production outputs used by the CLI. It is read-only and focused
on:

- `state + beta target + hedge choice`
- `mlforecast-style baseline forecasts for SPY and hedge assets`
- `backtest and rolling risk`
- `sector and international opportunity maps`
- `current portfolio cockpit`
- `financial statement intelligence over holdings and the screener`
- `equity screener with filters`
- `consensus fragility` and `belief-capacity mismatch`
- `owner elasticity` over discovery names

Useful commands:

```powershell
python -m meta_alpha_allocator.cli dashboard refresh --start-date 2010-01-01
python -m meta_alpha_allocator.cli dashboard snapshot --json
python -m meta_alpha_allocator.cli dashboard serve --open-browser
python -m meta_alpha_allocator.cli forecast-baseline --start-date 2025-01-01
python -m meta_alpha_allocator.cli statement-intel
```

## Discovery flow

`portfolio_manager` now emits three distinct artifacts:

- `screener.csv`: full context, including current holdings
- `holdings_context.csv`: current holdings scored as context, not discovery
- `discovery_screener.csv`: non-holding ideas, including enriched daily-screen discoveries

The workstation consumes `discovery_screener.csv` by default, so current holdings no longer dominate the discovery panel.

## Deployment layout

Recommended split:

- `Railway`: Python backend and API
- `Vercel`: static frontend from `src/meta_alpha_allocator/dashboard/static`

Backend notes:

- `Procfile` and `railway.toml` are included
- `DashboardSettings.port` reads `PORT` automatically
- `PathConfig` supports env overrides for all major local data roots
- CORS is enabled via `META_ALLOCATOR_CORS_ORIGIN`

Frontend notes:

- `config.js` exposes `window.META_ALLOCATOR_CONFIG.API_BASE`
- local default is same-origin
- for Vercel, point `API_BASE` to the Railway backend URL
- `vercel.json` is included inside `src/meta_alpha_allocator/dashboard/static`

Important env vars:

- `FMP_API_KEY`
- `FRED_API_KEY`
- `PORT`
- `META_ALLOCATOR_CORS_ORIGIN`
- optional path overrides from `.env.example`

## Design notes

- Cross-sectional weights are learned only on train windows using historical
  feature information coefficients.
- The state engine is routing-oriented: it decides when beta should be reduced
  and when defense or diversification should dominate.
- The policy layer now includes `consensus_fragility_score` and `belief_capacity_misalignment`.
- Discovery names now include `owner_elasticity_score` and `owner_elasticity_bucket`.
- The production report combines three additive components:
  `state overlay`, `sector/international opportunity maps`, and `hedge ranking`.
- When sector or liquidity metadata is missing, the system uses explicit
  fallbacks instead of failing silently.

## Optional data upgrades

The current version works with your local datasets plus `yfinance` fallback for
missing ETF history. If you later want better data quality, the highest-signal
upgrades would be:

- `Polygon` or `Tiingo` for cleaner adjusted daily equity and ETF history
- `FRED` for rates, term spread, balance sheet and liquidity proxies
- `Financial Modeling Prep` or `Alpha Vantage premium` for broader fundamentals

The direct selection engine already benefits from local history, so no extra
API is required to keep building.

`FMP_API_KEY` is read from the environment and is not stored in project files.
