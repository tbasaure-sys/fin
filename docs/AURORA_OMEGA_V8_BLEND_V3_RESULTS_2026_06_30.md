# AURORA Omega V8 Blend V3 Results

Date: 2026-06-30

## Objective

Blend V2 was the strongest broad ranking policy, but its weakest regime was `expensive_compounder`: it had almost no return IC there and a negative top-minus-bottom decile spread. That failure matters because expensive compounders are exactly where AURORA must avoid naive multiple punishment and ask the priced-belief question more carefully:

> Is the high implied expectation actually unsupported, or is the business quality strong enough to justify part of the burden?

Blend V3 was built as a targeted repair, not as another generic model tournament.

## Policy Change

Blend V3 starts from Blend V2 and only changes names classified as `expensive_compounder`.

For those names, it adds a small quality-aware offset:

- reward high cross-sectional ROIC and operating margin quality;
- add a small FCF-yield support term;
- penalize leverage / debt-assets pressure;
- keep the original Blend V2 expectation-pressure and feasibility structure intact.

This is intentionally conservative. The goal is not to make expensive names win automatically. The goal is to distinguish expensive-but-real-quality from expensive-and-fragile.

Implementation: `scripts/run_aurora_omega_two_stage_ranker.py`

Latest artifact: `artifacts/aurora_omega_v8_ranker/20260630_013956`

## Overall Leaderboard

| Model | Folds | Mean return IC | Mean decile spread | Positive spread share |
|---|---:|---:|---:|---:|
| Blend selector V1 | 5 | 0.2268 | 0.1426 | 1.00 |
| Blend V3 | 5 | 0.2265 | 0.1426 | 1.00 |
| Blend V2 | 5 | 0.2262 | 0.1444 | 1.00 |
| Belief-adjusted blend | 5 | 0.2206 | 0.1255 | 0.80 |
| Single-stage HistGBR | 5 | 0.2127 | 0.1178 | 0.80 |
| Single-stage RF | 5 | 0.1963 | 0.1058 | 0.80 |
| Two-stage strict | 5 | 0.1842 | 0.1279 | 1.00 |
| Formula baseline | 5 | 0.0586 | -0.0221 | 0.20 |

## Sector-Neutral Diagnostics

| Model | Sector-neutral IC | Sector-neutral decile spread |
|---|---:|---:|
| Blend selector V1 | 0.1097 | 0.0695 |
| Blend V3 | 0.1092 | 0.0695 |
| Blend V2 | 0.1081 | 0.0713 |
| Belief-adjusted blend | 0.0987 | 0.0468 |
| Single-stage HistGBR | 0.0957 | 0.0461 |

Blend selector V1 is the new IC champion, including sector-neutral IC. Blend V2 still has a slightly better broad decile spread.

## Targeted Regime Repair

The core reason to keep Blend V3 alive is its expensive-compounder repair:

| Policy | Expensive-compounder return IC | Expensive-compounder decile spread |
|---|---:|---:|
| Blend V2 | 0.0116 | -0.0435 |
| Blend V3 | 0.0596 | 0.0089 |
| Blend selector V1 | 0.0546 | -0.0024 |

That is the main result. V3 does not merely improve an aggregate metric by chance; it is the best repair for the regime it was designed to fix.

Outside expensive compounders, V3 is identical to V2.

Blend selector V1 was added as a diagnostic challenger. It uses V2 as the base and applies the V3 repair only to expensive-compounder rows below an extreme-quality guardrail. It slightly improves aggregate IC, but it does not beat V3 inside the target regime and does not beat V2 on broad spread. That means it is useful evidence, not a final policy.

## Fold-Level Read

Blend V3 improves return IC in three of five validation folds and keeps positive decile spread in every fold. The small broad spread give-up versus V2 comes from top/bottom bucket reshuffling inside expensive-compounder names, not from a total degradation of the architecture.

| Validation year | Blend V2 IC | Blend V3 IC | Blend V2 spread | Blend V3 spread |
|---:|---:|---:|---:|---:|
| 2018 | 0.3789 | 0.3753 | 0.2254 | 0.2254 |
| 2019 | 0.3262 | 0.3263 | 0.1599 | 0.1528 |
| 2020 | 0.1533 | 0.1559 | 0.0524 | 0.0524 |
| 2021 | 0.1747 | 0.1736 | 0.1543 | 0.1543 |
| 2022 | 0.0980 | 0.1015 | 0.1301 | 0.1283 |

## Verdict

Blend V3 passes as a targeted challenger:

- It is the best expensive-compounder repair.
- It improves aggregate and sector-neutral IC versus V2.
- It repairs the previous expensive-compounder failure.
- It keeps positive decile spread in every fold.

Blend selector V1 passes as a diagnostic challenger:

- It is the best aggregate return-IC policy in this run.
- It is slightly better than V3 in aggregate IC.
- It does not beat V3 in expensive-compounder diagnostics.
- It does not beat V2 on broad or sector-neutral spread.

Neither Blend V3 nor selector V1 cleanly replaces Blend V2 yet:

- Blend V2 still has slightly better overall decile spread.
- Blend V2 still has slightly better sector-neutral decile spread.
- The expensive-compounder spread repair is positive but still modest.

Current production-style interpretation:

- Use Blend V2 as the broad spread champion.
- Use Blend V3 as the expensive-compounder-aware IC champion.
- Keep Blend selector V1 as a diagnostic IC challenger.
- Do not call either a final production model. They are shadow ranking policies inside the larger AURORA belief system.

## Next Step

Do not overfit the selector yet.

The clean next step is a pre-registered selector search:

1. Define selector candidates without looking at validation labels.
2. Evaluate them with the same purged rolling-origin setup.
3. Promote only if a selector beats V2 on spread and V3/selector V1 on IC.
4. Require the expensive-compounder repair to remain positive.

This is aligned with the AURORA north star:

> AURORA should not punish a company for looking optically expensive. It should ask whether the market-implied belief is justified by business physics, base rates, and evidence.
