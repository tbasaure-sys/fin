# Recoverability Guide

This file explains the new `recoverability` work added on top of the Polymarket paper-trading lab.

## What Was Added

The project now has a first version of:

- `shadow-fill dataset`
- `fill oracle`
- `execution frontier`
- `phantom liquidity`
- `restorative return`
- `episode labels`
- `fiber atlas`

The important shift is conceptual:

- before: "does this quote fill?"
- now: "if this quote fills, did it create or destroy future freedom?"

## New Objects

### `ShadowFillSample`

Stored from replay and counterfactual quote distances.

It captures:

- quote distance in ticks
- whether that quote would have filled
- markout
- cancel urgency
- weather
- narrative confidence
- phantom liquidity

This is the raw execution-learning dataset.

### `RestorativeSample`

Built from `ShadowFillSample`.

It adds:

- `surface_return_bps`
- `restorative_return_bps`
- `toxicity_bps`
- `optionality_score`
- `label`
- `visible_signature`

This is the first operational approximation of:

- `generative`
- `palliative`
- `compressive`

episode quality.

## Current Label Meaning

### `generative`

Used for quotes that:

- would fill
- have acceptable local return
- do not look too toxic
- preserve future optionality

### `compressive`

Used for quotes that:

- would fill
- but do so in a structurally bad way
- usually because toxicity or post-fill damage is too high

### `palliative`

Used for states that do not clearly create future freedom.

Today most episodes are still falling here, which is expected in early calibration.

## New Reports

### `restorative-report`

Command:

```powershell
python -m polymarket_trader restorative-report <session_id>
```

Outputs:

- `output/<session>.restorative.json`
- `output/<session>.restorative.md`

Use it to answer:

- how many episodes were `generative`, `palliative`, `compressive`
- which quote distances are more compressive
- where optionality is being destroyed

### `fiber-report`

Command:

```powershell
python -m polymarket_trader fiber-report --session <session_id>
```

Outputs:

- `output/<session>.fiber.json`
- `output/<session>.fiber.md`

Use it to answer:

- are there surface-similar states with different episode labels
- where the visible state is insufficient

## What The Scheduler Runs Now

The high-frequency task now runs:

1. `collect-live`
2. `build-features`
3. `paper-run`
4. `tune-report`
5. `shadow-report`
6. `fit-oracle`
7. `frontier-report`
8. `restorative-report`
9. `fiber-report`
10. `phantom-report`
11. `lab-run`

Files:

- [run_high_freq_capture.ps1](c:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/polymarket_paper_trader/run_high_freq_capture.ps1)
- [register_high_freq_task.ps1](c:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/polymarket_paper_trader/register_high_freq_task.ps1)

## How Long To Leave It Running

It does matter a bit, but not because of "too much data" in a scary way.

The real issues are:

- duplicate low-information sessions
- slower review
- growing SQLite/output files

### Good rule of thumb

- `1-3 hours` at 3-minute cadence is a very good collection block
- that gives roughly `20-60` sessions
- enough to see repeated micro-regimes without drowning in noise

### When to stop

Pause it when:

- the last `10-20` sessions look statistically similar
- new sessions are not changing fill behavior
- new sessions are not creating new `compressive` or `generative` signatures

### Practical recommendation

For now, I would run:

- `2 hours` when testing a meaningful policy or calibration change
- then stop and review

That is better than leaving it on forever.

## What We Learned So Far

### True signal

Recent runs showed:

- most sessions still have `0` fills
- but some sessions now produce real fills
- some replay windows strongly favor `1 tick`
- some filled near-touch episodes are actually `compressive`, not good

That is important:

- "fills" alone are not enough
- the system must learn whether fills are worth having

### Honest current limitation

The restorative labeling is live and working, but still early.

Current behavior:

- `compressive` is now appearing in real filled sessions
- `generative` is still rare
- `fiber atlas` is still sparse

That is acceptable at this stage. It means the measurement layer is starting to differentiate reality, but the thresholds still need further calibration.

## Recommended Workflow From Here

### One-off manual loop

```powershell
python -m polymarket_trader paper-run --session test_01 --policy weather-narrative --live-session latest
python -m polymarket_trader tune-report test_01
python -m polymarket_trader shadow-report test_01
python -m polymarket_trader restorative-report test_01
python -m polymarket_trader fiber-report --session test_01
python -m polymarket_trader frontier-report test_01
```

### Review checklist

- Did the session fill?
- Was near-touch favored by `shadow`?
- Did the episode become `compressive`?
- Was phantom low enough to trust maker intervention?
- Did any visible signature become ambiguous?

## Best Next Technical Step

The next high-value block is:

1. recalibrate `generative` thresholds using sessions with real fills
2. add recoverability-adjusted utility into the frontier more aggressively
3. use `compressive` history to filter markets before quoting
4. only later, promote `generative` signatures into more assertive quoting

## Key Files

- [polymarket_trader/analytics/restorative.py](c:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/polymarket_paper_trader/polymarket_trader/analytics/restorative.py)
- [polymarket_trader/analytics/oracle.py](c:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/polymarket_paper_trader/polymarket_trader/analytics/oracle.py)
- [polymarket_trader/app.py](c:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/polymarket_paper_trader/polymarket_trader/app.py)
- [polymarket_trader/storage/repository.py](c:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/polymarket_paper_trader/polymarket_trader/storage/repository.py)
- [tests/test_weather_lab.py](c:/Users/T14%20Ultra%207/OneDrive/Escritorio/CT/polymarket_paper_trader/tests/test_weather_lab.py)
