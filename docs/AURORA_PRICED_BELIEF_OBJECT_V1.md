# AURORA Priced Belief Object v1

This is the first production-shaped kernel of the AURORA direction.

The goal is not to make another return-prediction router. The goal is to represent the market price as a compressed belief system, compare those market-implied beliefs against evidence-adjusted business physics, and return the questions, burdens, falsifiers, and valid valuation lenses that matter now.

## What It Does

`buildAuroraPricedBeliefObject(drivers, snapshot, options)` returns a structured memo object with:

- `marketImpliedBeliefs`: what the current price appears to demand about growth, margin, ROIC, reinvestment, duration, and bottleneck durability.
- `businessPhysicsBeliefs`: what the business evidence supports after adjusting for data quality and model risk.
- `beliefGap`: the signed distance between market belief and evidence-backed belief.
- `beliefDistortionIndex`: a 0-100 summary of how far price-beliefs are from evidence-beliefs.
- `assumptionBurdenOfProof`: which assumptions now carry the proof burden.
- `lensLegitimacy`: which valuation lenses are economically legitimate for this company state.
- `falsifiers`: concrete evidence that would break the priced thesis.
- `thesisHalfLife`: how quickly the thesis needs fresh evidence.
- `monitoringPlan`: variables, thresholds, horizons, and evidence sources to watch.
- `memo`: a concise investor-facing summary.

## What It Is Not

This is not yet the full AURORA Omega system. It does not train a neural foundation model, ingest filings, build a graph, or claim a final fair value.

It is the first durable object model that lets the rest of AURORA become coherent:

1. Price becomes a belief object.
2. Beliefs are compared against business physics.
3. The system identifies proof burden and falsifiers.
4. Lens weights become secondary to lens legitimacy.
5. ML can later learn over these objects instead of noisy raw returns.

## Usage

```bash
node scripts/run_aurora_belief_object.mjs --input drivers.json --output belief-object.json
```

Minimal input:

```json
{
  "drivers": {
    "ticker": "ASML",
    "name": "ASML Holding NV",
    "sector": "Semiconductors and related devices",
    "price": 800,
    "revenue": 300,
    "baseFcf": 28,
    "revenueCagr": 0.09,
    "margin": 0.31,
    "roic": 0.24,
    "wacc": 0.09,
    "terminalGrowth": 0.025,
    "reinvestment": 0.42,
    "thesisQuality": 0.88,
    "demandSupply": 0.82,
    "bottleneckPower": 0.9,
    "dataQuality": 0.82,
    "modelRisk": 0.24
  },
  "options": {
    "asOfDate": "2026-06-29"
  }
}
```

## Design Principles

- Reverse DCF is the spine because price is the question.
- ROIC, DCF, residual income, asset value, bottleneck, unit economics, and capital cycle are not interchangeable methods. They are questions that are legitimate only under certain economic states.
- High uncertainty is not a bug. It should trigger abstention, memo-only output, or a shorter thesis half-life.
- The right output is not "DCF says $X." The right output is "the market needs these beliefs to be true, here is the evidence burden, and these are the falsifiers."

## Integration Path

1. Use this object in Valuation OS as the top-level "priced belief memo."
2. Feed it with live drivers from SEC/FMP/yfinance rather than manual assumptions.
3. Add textual evidence extraction for management claims and risk-factor changes.
4. Build a historical panel of belief objects.
5. Train future AURORA models on belief-gap, falsifier-hit, and thesis-half-life targets instead of raw realized-return MAE alone.
