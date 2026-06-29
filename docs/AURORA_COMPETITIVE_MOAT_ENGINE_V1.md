# AURORA Competitive Moat Engine v1

This layer implements the `competitor graph` and `moat half-life` part of Núcleo 4 in `valuation_idea.txt`.

It answers:

```text
Which competitor can shorten the economic fade path?
```

## Function

`buildAuroraCompetitiveMoatEngine(input, options)` accepts:

- compiled AURORA drivers
- `driverGraph.derived.moatHalfLifeYears`
- evidence signals such as pricing power and demand visibility
- `semiconductorTwin` when available
- competitors from `competitors`, `peerSet`, `peers`, `competitiveLandscape.competitors`, or `competitorGraph.competitors`

## Competitor Inputs

Each competitor can include:

- ticker / name
- market share
- share gain
- revenue growth
- gross margin
- ROIC
- capacity growth
- price pressure or discounting
- substitution risk
- product overlap
- customer overlap
- R&D intensity
- scale score
- quality score

The engine works with partial inputs. Missing fields reduce precision; they do not create invented peers.

## Threat Dimensions

For each competitor the engine scores:

- `shareThreat`
- `priceThreat`
- `capacityThreat`
- `innovationThreat`
- `economicsThreat`
- aggregate threat
- primary threat type

## Graph

The output contains:

- company node
- competitor nodes
- threat edges from competitors to the company
- edge relation and explanation

Relations include:

- `share_gain`
- `price_pressure`
- `capacity_response`
- `innovation_substitution`
- `superior_unit_economics`

## Moat Half-Life Adjustment

The driver graph already computes a base `moatHalfLifeYears` from competitive persistence phi.

This engine adds a competitive reality check:

- pricing power, bottleneck power, and ROIC spread support longer persistence
- competitor share gains, price pressure, capacity additions, and substitution pressure shorten persistence

It emits:

- `baseHalfLifeYears`
- `adjustedHalfLifeYears`
- `deltaYears`
- `roicFadeMultiplier`
- `forecastUncertaintyMultiplier`

v1 does not mutate the forecast yet. It exposes a governed adjustment packet for the next integration step.

## Decisions

- `competitive_graph_pending`: no peer set supplied.
- `competitive_position_supported`: peer pressure does not materially shorten the moat.
- `competitive_pressure_watch`: competitor pressure exists and should be monitored.
- `moat_fade_risk`: the current moat half-life may be too long.

## Dashboard Contract

The dashboard receives:

- `primaryPanel.competitiveMoat`
- visualization slot `competitor_graph`
- warning when decision is `moat_fade_risk`
- investor question: which competitor can shorten moat half-life?

This layer keeps AURORA from treating moat half-life as a purely internal formula. Competitive evidence can now challenge it.
