# AURORA Thesis Monitor v1

The Priced Belief Object creates falsifiers. The Thesis Monitor evaluates whether new observations have tripped them.

This turns AURORA from a static valuation memo into a living research loop:

1. Price becomes a belief object.
2. The belief object generates falsifiers.
3. New metrics and evidence are observed.
4. The monitor reports `intact`, `deteriorating`, `tripped`, `stale`, or `insufficient_observations`.

## Inputs

Single-company input:

```json
{
  "beliefObject": { "version": "aurora_priced_belief_object_v1" },
  "observations": {
    "asOfDate": "2026-03-01",
    "metrics": {
      "revenue_growth": 0.12,
      "operating_margin": 0.28,
      "roic": 0.21,
      "reinvestment_rate": 0.44
    },
    "evidence": {
      "textSignals": {
        "marginPressure": 0.68,
        "pricingPower": 0.31
      }
    }
  }
}
```

It also accepts a Belief Compiler output directly because that contains `beliefObject`.

## CLI

```bash
node scripts/run_aurora_thesis_monitor.mjs --input monitor.json --output monitor-result.json
```

Panel:

```bash
node scripts/run_aurora_thesis_monitor.mjs --input monitor-panel.json --panel
```

## Status Semantics

- `intact`: observed metrics clear thresholds and evidence does not deteriorate.
- `deteriorating`: no hard trip, but one or more metrics/evidence signals are near danger.
- `tripped`: at least one falsifier breached its threshold.
- `stale`: the thesis half-life expired and the belief object should be refreshed.
- `insufficient_observations`: not enough observed metrics or evidence to judge.

## Current Falsifier Directions

- `revenue_growth`: minimum threshold.
- `operating_margin`: minimum threshold.
- `roic`: minimum threshold.
- `reinvestment_rate`: maximum threshold.

## Integration Stack

Current isolated AURORA stack:

```text
raw evidence text
  -> Evidence Signal Extractor
  -> Belief Compiler
  -> Priced Belief Object
  -> Thesis Monitor
```

This is still deterministic, but it gives us a real production skeleton:

- claims are extracted,
- drivers are compiled,
- beliefs are priced,
- falsifiers are generated,
- evidence refreshes are monitored.
