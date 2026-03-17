# Chile Desk

`Chile Desk` is the first local-market extension inside BLS Prime. It is designed to be useful without expensive market-data contracts, while keeping a clean path toward richer official data later.

## Current stack

The current implementation uses:

- `Yahoo Finance` for daily prices, FX fallback, and basic valuation fields
- local `XBRL` instance support for official filings you download from CMF
- `CMF IFRS TXT` for a first official accounting layer
- A tracked local universe in [artifacts/chile/universe.csv](C:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/02_Finance/meta_alpha_allocator/artifacts/chile/universe.csv)
- A cached/output artifact in `output/chile/latest/chile_market.json`
- A deployable artifact in `artifacts/chile/latest/chile_market.json`

This is enough for:

- local Chile equity opportunity ranking
- IPSA-relative structural reading
- USDCLP context
- local sector opportunity map
- leaders / laggards
- partial CMF-backed quality and cash-truth signals

## Current limitation

`CMF IFRS TXT` does not cover every relevant Chile listed name equally.

In practice, the current parser is picking up solid coverage for part of the non-financial universe, but several names still fall back to price-only ranking. The main gaps today are:

- some banks
- some utilities
- some issuers whose legal filing entity differs from the traded equity shell

That means the current Chile Desk is already useful, but its `CMF coverage` badge should be read as literal coverage, not assumed full-market coverage.

## Recommended source hierarchy

For a stronger production-grade Chile stack, the recommended hierarchy is:

1. `CMF`
For financial statements, filings, dividends, and corporate events.

2. `Bolsa de Santiago`
For official historical prices, liquidity, and market structure.

3. `Banco Central de Chile`
For macro and FX series when API credentials are available.

4. `Yahoo Finance`
For free fallback prices and lightweight valuation data.

## What the current score means

The current `opportunity_score` is a practical blended score built from:

- `quality_score`
- `value_score`
- `momentum_score`
- `independence_score`

`quality_score` now blends:

- Yahoo ROE
- CMF margin
- CMF cash buffer
- CMF leverage where available

This is intentionally practical, not final. It gives a usable first ranking while we keep the door open for deeper CMF/XBRL quality and cash-truth layers.

## Commands

Refresh Chile data only:

```powershell
$env:PYTHONPATH = (Resolve-Path .\src)
python -m meta_alpha_allocator.cli chile refresh --json
```

If you have downloaded CMF filing ZIP/XBRL files, place them in:

```text
artifacts/chile/xbrl/raw/
```

The loader will automatically scan `.zip`, `.xbrl`, `.xml`, and `.xhtml` files there and prioritize `XBRL` values over `CMF TXT`.

Read cached Chile data:

```powershell
$env:PYTHONPATH = (Resolve-Path .\src)
python -m meta_alpha_allocator.cli chile snapshot --json
```

Refresh the full terminal snapshot, including Chile Desk:

```powershell
$env:PYTHONPATH = (Resolve-Path .\src)
python -m meta_alpha_allocator.cli dashboard refresh
```

## Where it plugs into the terminal

Backend:

- [src/meta_alpha_allocator/chile/desk.py](C:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/02_Finance/meta_alpha_allocator/src/meta_alpha_allocator/chile/desk.py)
- [src/meta_alpha_allocator/dashboard/snapshot.py](C:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/02_Finance/meta_alpha_allocator/src/meta_alpha_allocator/dashboard/snapshot.py)
- [src/meta_alpha_allocator/dashboard/wsgi.py](C:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/02_Finance/meta_alpha_allocator/src/meta_alpha_allocator/dashboard/wsgi.py)

Frontend:

- [lib/server/normalizers.js](C:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/02_Finance/meta_alpha_allocator/lib/server/normalizers.js)
- [components/terminal-app.jsx](C:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/02_Finance/meta_alpha_allocator/components/terminal-app.jsx)

API route:

- `/api/chile`

## Next upgrades

The best next improvements are:

1. Replace free-fallback fundamentals with `CMF`-derived accounting fields.
2. Add Chile-specific concentration and crowding proxies.
3. Add local portfolio exposure logic for copper, CLP, rates, and retail/bank concentration.
4. Add a `Chile Opportunity Map` panel with more explicit thesis buckets.
