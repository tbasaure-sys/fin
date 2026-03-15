# Meta Allocator

`meta_alpha_allocator` is a self-contained workspace that routes capital
between three sleeves and now produces a decision map instead of forcing a
stock-picking workflow:

- `core_beta`: broad beta exposure via `SPY`
- `defense`: capital preservation via `IEF` and `BIL` with robust fallbacks
- `selection_context`: a cross-sectional opportunity map that can be used to
  prioritize sectors and then choose names manually

The system reuses local artifacts from:

- `Fin_model` for systemic state and fragility
- `portfolio_manager` for slow priors and metadata
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

Useful commands:

```powershell
python -m meta_alpha_allocator.cli dashboard refresh --start-date 2010-01-01
python -m meta_alpha_allocator.cli dashboard snapshot --json
python -m meta_alpha_allocator.cli dashboard serve --open-browser
python -m meta_alpha_allocator.cli forecast-baseline --start-date 2025-01-01
python -m meta_alpha_allocator.cli statement-intel
```

## Design notes

- Cross-sectional weights are learned only on train windows using historical
  feature information coefficients.
- The state engine is routing-oriented: it decides when beta should be reduced
  and when defense or diversification should dominate.
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
