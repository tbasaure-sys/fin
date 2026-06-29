# AURORA Belief Compiler v1

The Priced Belief Object is the stable output. The Belief Compiler is the layer that turns messy real-world inputs into that object.

It exists because AURORA should not let notebooks, UI code, router code, and API payloads each invent their own version of `revenueCagr`, `ROIC`, `WACC`, data quality, or bottleneck evidence.

## Contract

`compileAuroraBeliefObject(snapshot, options)` accepts a flexible snapshot:

```json
{
  "company": { "ticker": "ASML", "name": "ASML Holding NV", "sector": "Technology", "industry": "Semiconductor equipment" },
  "market": { "price": 800, "beta": 1.12 },
  "macro": { "riskFreeRate": 0.044, "equityRiskPremium": 0.052, "inflation": 0.024 },
  "financials": {
    "incomeStatements": [{ "date": "2024-12-31", "revenue": 300, "ebit": 93 }],
    "balanceSheets": [{ "date": "2024-12-31", "totalDebt": 18, "totalStockholdersEquity": 285, "cashAndCashEquivalents": 42 }],
    "cashFlows": [{ "date": "2024-12-31", "operatingCashFlow": 36, "capitalExpenditure": -8 }]
  },
  "evidence": {
    "textSignals": {
      "pricingPower": 0.82,
      "demandVisibility": 0.78,
      "capacityConstraint": 0.86,
      "accountingTrust": 0.76
    }
  }
}
```

It returns:

- `drivers`: normalized AURORA drivers.
- `driverQuality`: score, readiness level, missing fields, warnings, and lineage.
- `evidenceSignals`: structured pricing power, demand visibility, capacity constraint, accounting trust, demand/supply, and bottleneck power.
- `beliefObject`: the compiled `aurora_priced_belief_object_v1`.
- `compilerMemo`: next action, missing critical drivers, top burden, and top falsifier.

`compilerMemo.nextAction` uses four states:

- `repair_inputs_before_interpretation`: critical evidence is missing.
- `no_strong_belief_gap_monitor_only`: data is usable, but price and evidence are not far enough apart to justify a strong thesis.
- `use_as_memo_only_and_collect_evidence`: the belief gap exists, but evidence debt or uncertainty is too high.
- `ready_for_priced_belief_review`: data and belief gap are both strong enough for an investor review.

## CLI

Single company:

```bash
node scripts/run_aurora_belief_compiler.mjs --input snapshot.json --output compiled.json
```

Panel:

```bash
node scripts/run_aurora_belief_compiler.mjs --input snapshots.json --panel --output panel.json
```

Panel input can be either an array or `{ "snapshots": [...] }`.

## Why This Matters

This layer is the bridge from the current Valuation OS data world into AURORA Omega.

It gives us:

1. One driver contract.
2. One data quality/readiness language.
3. One source lineage map.
4. One place to encode risk-free rate, WACC, ROIC, reinvestment, and evidence signal logic.
5. One route from live SEC/FMP/yfinance snapshots into priced-belief memos.

The next AURORA layers should build on this compiler rather than bypass it.
