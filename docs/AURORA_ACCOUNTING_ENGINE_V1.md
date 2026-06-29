# AURORA Accounting Engine v1

The original ValuationOS guide is explicit: before forecasting, the system should reconstruct economic accounting.

This layer implements the first deterministic version of that idea. It adjusts reported accounting into economic drivers before the Belief Compiler, Driver Graph, and Priced Belief Object use them.

## What It Adjusts

v1 handles:

- R&D capitalization with sector-sensitive useful life.
- R&D amortization and adjusted EBIT.
- SBC as an economic cost, not a blind add-back.
- Lease debt in invested capital.
- Goodwill share of capital.
- Economic invested capital.
- Adjusted NOPAT.
- Adjusted ROIC.
- Adjusted FCF.
- Economic reinvestment.
- Organic vs acquired growth split when acquisition revenue is provided.

## Contract

```js
import { buildAuroraAccountingEngine } from "./lib/aurora-accounting-engine.js";

const accounting = buildAuroraAccountingEngine({ company, financials });
```

Output includes:

- `reported`: reported accounting metrics.
- `adjustments`: R&D asset, amortization, SBC cost, leases, goodwill and growth split.
- `economic`: adjusted EBIT, NOPAT, FCF, invested capital, ROIC and reinvestment.
- `drivers`: accounting-adjusted drivers consumed by the Belief Compiler.
- `quality`: completeness and warnings.
- `sourceLineage`: where each accounting concept came from.

## Pipeline Integration

The Belief Pipeline now runs the Accounting Engine before the Belief Compiler.

Manual `drivers` still win. But if no manual override exists, the compiler now prefers:

```text
manual driver override
  -> accounting engine adjusted driver
  -> raw reported statement ratio
```

This matters because ROIC, margin, FCF and reinvestment are often not economically meaningful until R&D, SBC, leases and capital structure distortions are handled.

## Important Policy

SBC is **not** simply added back.

The engine subtracts SBC as an economic cost when computing adjusted NOPAT/FCF. This follows the guide's principle: stock-based compensation must be modeled as value transfer and dilution risk, not ignored.
