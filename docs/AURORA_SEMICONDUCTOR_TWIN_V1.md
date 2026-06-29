# AURORA Semiconductor Twin v1

This layer implements the first sector kernel requested by `valuation_idea.txt`.

It answers:

```text
Am I underwriting a durable semiconductor bottleneck, or merely extrapolating a capacity cycle?
```

## Function

`buildAuroraSemiconductorTwin(input, options)` consumes:

- `company`, `sector`, and `industry`
- `productMarket`, `industryEquilibrium`, `sectorTwin`, `industryData`, or `semiconductor`
- `equilibrium.productMarket`
- `evidence.textSignals`
- compiled pipeline context when available

If the company is not a semiconductor, semicap, foundry, wafer, memory, lithography, GPU, chip, or fab-related business, the function returns `sector_twin_not_applicable`.

## Signals

The twin normalizes:

- demand growth
- capacity growth
- utilization
- book-to-bill
- backlog growth
- inventory days and normal inventory days
- inventory growth
- ASP growth
- pricing power
- demand visibility
- capacity constraint evidence
- capex growth
- lead times
- order cancellations
- customer concentration
- export-control risk
- leading-node mix
- memory exposure

## Scores

It emits:

- `capacityPressure`: demand, utilization, backlog, book-to-bill, and lead-time pressure net of inventory overhang.
- `demandVisibility`: growth, backlog, book-to-bill, and text evidence net of cancellations.
- `inventoryOverhang`: inventory relative to normal, inventory growth, cancellations, and ASP weakness.
- `aspPower`: ASP growth, pricing evidence, and scarcity net of inventory pressure.
- `capexCyclePressure`: capacity growth, industry capex, and lead-time/capacity response.
- `bottleneckDurability`: whether scarcity looks durable enough to support pricing and ROIC.
- `cycleRisk`: whether the setup looks vulnerable to capacity additions, inventory normalization, ASP decline, or cancellations.

## States

- `durable_bottleneck`
- `demand_led_upcycle`
- `cyclical_upcycle_supply_response`
- `inventory_reset`
- `capacity_glut_risk`
- `mixed_cycle`
- `not_applicable`

## Decisions

- `semiconductor_bottleneck_supported`
- `semiconductor_cycle_watch`
- `semiconductor_inventory_reset`
- `semiconductor_glut_risk`
- `semiconductor_mixed`
- `sector_twin_not_applicable`

## Adjustments

The module does not mutate fair value directly. It emits advisory deltas:

- `bottleneckEvidenceDelta`
- `marginDurabilityDelta`
- `reinvestmentConfidenceDelta`
- `cycleRiskPenalty`
- `forecastUncertaintyMultiplier`

Downstream layers can use these deltas later, but v1 keeps the twin isolated and auditable.

## Falsifiers

The twin generates semiconductor-specific falsifiers such as:

- utilization falls below 85% while ASP stops rising
- book-to-bill drops below 1.0
- backlog growth turns negative
- inventory days remain above normal for two reporting periods
- new capacity arrives faster than demand absorbs it
- ASP growth turns negative despite claimed pricing power
- export controls reduce addressable demand or delay shipments

## Dashboard Contract

The dashboard receives:

- `primaryPanel.sectorTwin`
- visualization slot `sector_twin_semiconductor`
- warning when the decision is `semiconductor_glut_risk`
- investor question: durable bottleneck or capacity cycle?

This is the first concrete sector twin. It deliberately sits beside the generic `Equilibrium Engine`; it does not replace it.
