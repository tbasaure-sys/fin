# AURORA Equilibrium Engine v1

The original guide says supply and demand must be split into two engines:

1. Product-market supply and demand.
2. Equity-market supply and demand / price formation.

This layer implements that split.

It does **not** replace intrinsic value. It explains pressure, timing, and reflexivity.

## Product Market Archetypes

v1 supports:

- `physical_capacity`: semiconductors, energy, commodities, shipping, airlines, autos, chemicals, construction, hardware.
- `saas`: retention, ARPU, CAC payback and sales productivity.
- `marketplace`: users, transactions, ticket size and take rate.
- `banking`: deposits, loan growth, funding cost, credit losses, RWA and CET1.
- `general`: fallback demand-growth vs supply-growth pressure.

## Equity Market / Price Formation

The equity-market side models:

```text
NetSignedFlow =
  buybacks
  - issuance
  + ETF flows
  + institutional net changes
  + insider net buying
  + index flows
  - short pressure
  - option hedging
```

Then:

```text
dlogP ~= lambda * NetSignedFlow + gamma * NewsShock + epsilon
```

## Reflexivity

The engine separately marks when price can affect fundamentals:

- high price can enable cheap issuance and survival/growth;
- low price can worsen refinancing, dilution and investment capacity.

This is especially important for small caps, distressed firms, biotech, levered companies and banks.

## Pipeline Integration

The Belief Pipeline now returns `equilibrium`.

If equilibrium/reflexivity pressure is materially adverse, the pipeline can return:

```text
decision.state = equilibrium_pressure_review
decision.action = review_supply_demand_and_price_formation
```

That means AURORA is not saying intrinsic value is broken. It is saying product-market or equity-flow pressure deserves a separate review before acting.
