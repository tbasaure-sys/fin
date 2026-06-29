# AURORA Decision Engine v1

This layer implements engine 10 from `valuation_idea.txt`.

It answers:

```text
What should the investor be allowed to do, given IRR distribution, downside CVaR, permanent-loss risk, calibration, data quality, and hard review states?
```

It is not an autonomous trading engine. It is a governed decision packet.

## Function

`buildAuroraDecisionEngine(input, options)` accepts a full belief-pipeline output or the same component outputs:

- pipeline decision state
- probabilistic valuation
- calibration integration packet
- dashboard contract
- source governance
- assumption ledger
- management reliability
- thesis monitor

It returns:

- `decisionRights`
- `action`
- `edgeScore`
- risk snapshot
- quality snapshot
- prudential sizing cap
- allowed actions
- blocked actions
- hard blocks
- adverse scenarios
- reopen triggers
- memo

## Decision Rights

The engine emits one of:

- `blocked`: hard review state or risk control blocks underwriting.
- `memo_only`: useful for research, not decision-grade.
- `avoid`: distribution does not compensate for downside risk.
- `watch_only`: wait for better asymmetry or evidence.
- `stage_only`: small staged action can be considered with confirmation.
- `underwrite_allowed`: underwriting is allowed, but only with sizing limits and monitoring.

## Inputs That Matter

The engine explicitly uses:

- expected IRR
- median IRR
- downside CVaR
- probability of negative IRR
- probability of permanent loss
- probability that value is below price
- calibration abstention flag
- data quality
- model disagreement
- hard pipeline review states

## Sizing

`sizing.maxPositionPct` is a conservative cap, not an instruction to trade.

The cap is reduced by:

- permanent-loss probability
- downside CVaR
- calibration confidence haircut
- data quality
- model disagreement

The cap is zero unless decision rights are `stage_only` or `underwrite_allowed`.

## Pipeline Role

`runAuroraBeliefPipeline` now emits:

```js
decisionEngine
```

The pipeline memo surfaces:

```text
Decision engine: <decisionRights>.
```

The Decision Engine does not replace hard gates. If source governance, causal coherence, calibration, assumption ledger, or thesis monitor requires review, the decision rights become blocked or limited.

## Dashboard Role

The Dashboard Contract now exposes:

```js
dashboardContract.decisionPacket
```

The packet contains decision rights, action, max position cap, allowed actions, blocked actions, hard blocks, adverse scenarios, and reopen triggers.

## Why This Layer Matters

The guide's decision layer is not "buy/sell because fair value is above price." It is:

```text
IRR by path + CVaR + adverse scenarios + permanent-loss risk + prudent size
```

This engine turns AURORA from a valuation stack into a governed decision-support system.
