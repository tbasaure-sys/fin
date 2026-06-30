# AURORA Factor-Orthogonal Target Audit

Date: 2026-06-30
Status: methodological gate, not production evidence
Valid artifact: `artifacts/aurora_factor_orthogonal_audit/20260630_024627`

## Why We Ran This

The factor-null showed:

- AURORA Blend V2 / selector V1 beat factor-only HistGBR in mean IC.
- But the raw edge over factors was smaller than fold-to-fold noise.
- The post-hoc AURORA residual against factors stayed positive around `0.12` IC.

That left a sharper question:

> Can AURORA learn the factor-orthogonal part of the research-priority target directly, or is the apparent residual just an artifact of post-hoc residualization?

So we built:

```text
scripts/run_aurora_factor_orthogonal_audit.py
```

It:

1. builds the same 13-factor matrix used in the null;
2. residualizes `research_priority_target` against factors within each year;
3. trains a model to predict the raw target;
4. trains a model to predict the factor-orthogonal target;
5. trains a stricter no-factor-feature version of the orthogonal target model;
6. evaluates all models against:
   - forward 3Y returns;
   - realized `expectation_violation_score`;
   - the factor-orthogonal target itself.

## Important Bug Caught

The first implementation accidentally allowed `research_priority_target_factor_resid` to enter the feature set. That produced absurd ICs around `0.8`.

That artifact is invalid:

```text
artifacts/aurora_factor_orthogonal_audit/20260630_024123
```

The script was patched to exclude any residual target columns from features. The valid artifact is:

```text
artifacts/aurora_factor_orthogonal_audit/20260630_024627
```

This bug is worth documenting because it proves the audit is doing what we need: catching false optimism before it becomes a story.

## Factor Setup

The audit used 13 usable factors:

- value: `pb_year_z`, `ev_to_sales`, `fcf_yield`
- quality: `roic_proxy`, `roe`, `roa`, `gross_margin`, `operating_margin`
- momentum: `ret_1y_trailing`, `ret_3y_trailing`
- size: `market_cap`
- leverage: `debt_assets`
- low-vol: `vol_1y_trailing`

Two factors are still empty in the frozen dataset:

- `pe`
- `ev_to_ebitda`

Model feature counts:

```text
full feature count:       106
non-factor feature count: 79
```

## Leaderboard

| Model | Return IC | Return spread | Sector-neutral IC | Belief IC | Orth-target IC |
|---|---:|---:|---:|---:|---:|
| Blend selector V1 | 0.2268 | 0.1408 | 0.1334 | 0.3285 | 0.1868 |
| Blend V2 | 0.2262 | 0.1426 | 0.1315 | 0.3289 | 0.1850 |
| Raw-target HistGBR | 0.2144 | 0.1365 | 0.1411 | 0.2778 | 0.2065 |
| Factor HistGBR | 0.1724 | 0.1164 | 0.1252 | 0.1877 | 0.0754 |
| Orth-target HistGBR | 0.1332 | 0.0794 | 0.0970 | 0.1235 | 0.2220 |
| Blend selector V1 residualized | 0.1219 | 0.0602 | 0.1045 | 0.1798 | 0.2952 |
| Orth-target HistGBR residualized | 0.1207 | 0.0389 | 0.1143 | 0.0575 | 0.2164 |
| Blend V2 residualized | 0.1191 | 0.0659 | 0.1012 | 0.1799 | 0.2941 |
| Raw-target HistGBR residualized | 0.1120 | 0.0544 | 0.0991 | 0.1270 | 0.2644 |
| Orth-target no-factor HistGBR | 0.0878 | 0.0646 | 0.0341 | 0.1342 | 0.1415 |
| Factor composite | 0.0604 | -0.0516 | 0.0740 | 0.1196 | 0.0544 |
| Orth-target no-factor HistGBR residualized | 0.0567 | 0.0323 | 0.0472 | 0.0151 | 0.1277 |

## Interpretation

### 1. The current Blend models remain the strongest return rankers

Blend V2 and Blend selector V1 still dominate the practical return leaderboard:

```text
Blend selector V1 IC: 0.2268
Blend V2 IC:          0.2262
```

They are still not cleanly distinguishable from each other, and their raw edge over factor HistGBR remains inside fold noise. But they remain the best working rankers.

### 2. The factor-orthogonal target is learnable, but weaker for returns

The model trained on the factor-orthogonal target gets:

```text
orth-target IC: 0.2220
return IC:      0.1332
```

That means the residual target is not pure noise. The model can learn something about it.

But as a return-ranking engine, it underperforms factor HistGBR:

```text
orth-target model return IC: 0.1332
factor HistGBR return IC:    0.1724
```

So the factor-orthogonal belief channel exists as a candidate, but it is not strong enough to replace factor exposure for return ranking.

### 3. The strict no-factor-feature version is weak

When the orthogonal-target model is denied factor columns and their z-score variants, performance falls:

```text
orth-target no-factor return IC:      0.0878
orth-target no-factor residual IC:    0.0567
orth-target no-factor orth-target IC: 0.1415
```

This is the hardest result.

It suggests that a meaningful part of the current factor-orthogonal target learning still depends on factor-adjacent financial structure, even after target residualization.

In plain language:

> The current AURORA feature stack has some non-factor signal, but not yet a robust independent belief engine.

### 4. Post-hoc residual signal remains more interesting than direct orth-target training

Existing Blend residuals still look better than the strict no-factor model:

```text
Blend V2 residualized return IC:          0.1191
Blend selector V1 residualized return IC: 0.1219
```

This supports the prior reading:

> Use belief/factor residuals as diagnostic overlays for now. Do not promote a standalone orthogonal belief ranker.

## Verdict

This audit does not kill AURORA, but it forces discipline.

What survives:

- The target has a factor-orthogonal component.
- A model can learn some of that component.
- Existing Blend residuals have positive return IC after factor residualization.
- The current blend architecture is still stronger than factor-only on mean return IC.

What does not survive:

- The claim that AURORA has a strong standalone non-factor belief engine.
- The idea that the next step should be another blend tweak.
- The idea that the current `research_priority_target` is production-clean.

The honest conclusion:

```text
AURORA currently has a weak-to-moderate candidate orthogonal channel.
It is not yet strong enough to be the product center.
The real unlock is better belief-correctness labels and evidence validation,
not a bigger model.
```

## Recommended Next Step

Do not train a bigger model yet.

Build the missing validation axis:

1. Define live-computable belief predictions at time `t`:
   - implied growth burden;
   - implied margin burden;
   - implied ROIC burden;
   - implied FCF burden;
   - duration / terminal fragility.
2. Validate those against realized fundamentals, not returns:
   - realized revenue CAGR;
   - realized margin;
   - realized ROIC;
   - realized FCF margin;
   - realized multiple compression / expansion.
3. Score memo truth:
   - was the key value driver right?
   - did the falsifier trigger?
   - was abstention useful?
4. Only after that, train:
   - factor baseline;
   - belief-correctness model;
   - factor + belief residual composite.

The next model should not ask:

```text
Can I predict returns better?
```

It should ask:

```text
Can I predict which priced belief will be wrong,
and can that error be transformed into a rankable investment opportunity?
```

## Follow-Up Completed

This was tested with a no-look-ahead live base-rate violation engine:

```text
scripts/run_aurora_live_violation_audit.py
docs/AURORA_LIVE_VIOLATION_AUDIT_2026_06_30.md
```

The first live implementation did not recover the ex-post channel:

- ex-post expectation violation residual IC: `0.2737`;
- live base-rate violation raw IC: `0.0789`;
- live base-rate violation residual IC: `-0.0070`.

Conclusion:

```text
The ex-post belief-error phenomenon is real,
but simple grouped base-rate transition tables are not enough
to make it deployable.
```
