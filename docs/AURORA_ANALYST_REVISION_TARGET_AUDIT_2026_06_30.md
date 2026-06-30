# AURORA analyst revision target audit - 2026-06-30

## Why this audit exists

After the SEC Risk Factors return audit failed as an alpha channel, we tested the cleaner mechanism:

> If filing text is an attention-gap signal, it should show up first in analyst/rating revisions, not necessarily in 3Y returns.

This audit therefore changes the target, not the filing signal. It asks whether Risk Factors stability/change around the filing date predicts subsequent analyst rating revisions.

## Implementation

New runner:

`scripts/run_aurora_analyst_revision_target_audit.py`

Input filing panel:

`artifacts/aurora_sec_filing_change_audit/20260630_173833/merged_signals.csv`

External target source:

FMP `stable/grades-historical`, cached locally under:

`artifacts/aurora_revision_cache/fmp_grades_historical/`

Target definition:

`analyst_rating_revision_{window}d = rating_score_post - rating_score_pre`

Where:

- `rating_score_pre` is the latest FMP analyst rating mix score available on or before the filing date.
- `rating_score_post` is the first rating mix score available around filing date plus the target window.
- Rating score uses: strong buy `+2`, buy `+1`, hold `0`, sell `-1`, strong sell `-2`, divided by total analyst count.

Windows tested:

- 90 days
- 180 days
- 365 days

Signals tested:

- `risk_text_stability`
- `risk_text_stability_resid_within_year`
- `risk_text_stability_resid_pooled_year_fe`
- `risk_text_stability_peer_z`
- `risk_text_stability_peer_z_resid_within_year`

Residualization uses the same factor matrix as the factor-null harness: value, quality, momentum, size, leverage, and low-vol proxies where available.

## Artifacts

90d confirmed:

`artifacts/aurora_analyst_revision_target_audit/20260630_90d_confirmed`

180d first full run:

`artifacts/aurora_analyst_revision_target_audit/20260630_200107`

365d confirmed:

`artifacts/aurora_analyst_revision_target_audit/20260630_365d_confirmed`

Note: an earlier parallel 90d/365d run collided on timestamp. The script was patched to include microseconds and `window_days` in default output directories, and the confirmed 90d/365d runs above are clean.

## Coverage

For the main post-2019 universe:

| Window | Rows | Tickers | Endpoint errors |
|---:|---:|---:|---:|
| 90d | 1,224 | 266 | 0 |
| 180d | 1,129 | 264 | 0 |
| 365d | 1,232 | 266 | 0 |

FMP grade history coverage was operationally good: 268 histories fetched with zero endpoint errors in the full run.

## Results

### 90-day revision target

Best signal:

`risk_text_stability_peer_z`

- IC: `0.0370`
- Bootstrap CI: `[-0.0184, 0.0847]`
- Permutation p-abs: `0.2218`
- Sector-neutral IC: `0.0417`

Verdict: directionally positive, not statistically clean.

### 180-day revision target

Strongest result:

`risk_text_stability_resid_pooled_year_fe`

- IC: `-0.0710`
- Bootstrap CI: `[-0.1160, -0.0213]`
- Permutation p-abs: `0.0200`
- Sector-neutral IC: `-0.0456`

Verdict: statistically notable but opposite sign versus the pre-registered "stability is good" hypothesis. This is not stable enough to promote because it does not survive at 90d or 365d.

### 365-day revision target

Best signal:

`risk_text_stability_resid_within_year`

- IC: `0.0166`
- Bootstrap CI: `[-0.0358, 0.0625]`
- Permutation p-abs: `0.5874`
- Sector-neutral IC: `0.0151`

Verdict: dead.

## Mechanism check: do rating revisions predict 3Y returns?

The revision target itself did not robustly explain 3Y forward returns:

| Window | Revision-to-return IC | Permutation p-abs |
|---:|---:|---:|
| 90d | `0.0065` | `0.9161` |
| 180d | `-0.0121` | `0.8701` |
| 365d | `-0.0400` | `0.4795` |

This matters because even if filing text anticipated some analyst behavior, that behavior would still need to map into investable outcomes. In this FMP rating-mix target, it does not.

## Decision

This test does not validate the analyst/rating-revision mechanism for the simple Risk Factors stability signal.

The honest read:

1. The 90d result is too weak.
2. The 180d result is intriguing but opposite sign and not stable across windows.
3. The 365d result is dead.
4. Analyst rating revision targets from FMP are operationally viable, but the current Risk Factors similarity signal is not enough.

Therefore:

- Do not promote Risk Factors stability/change as an alpha or analyst-revision signal.
- Keep the cached FMP grade-history layer because it is useful infrastructure.
- If continuing option 2, the next target should be true consensus estimate revisions if available, not rating-mix revisions. Rating mix is slow and coarse.
- If no true estimate-revision history is available, move to option 3: combine marginal channels into a Falsifier Engine, but treat it as research prioritization and abstention first, not standalone alpha.

## What changed in code

Added:

`scripts/run_aurora_analyst_revision_target_audit.py`

The runner:

- loads FMP key from environment or `.env.local`;
- fetches and caches `stable/grades-historical`;
- builds point-in-time rating revision targets;
- tests raw, peer-relative, and factor-residualized filing signals;
- runs permutation nulls within year;
- writes panel, leaderboard, mechanism table, and summary JSON.

Important patch:

The local permutation null was vectorized because the generic SEC evaluator was too slow for repeated target permutations.

## Next recommendation

Choose option 3 now.

Not because option 3 is guaranteed to work, but because options 1 and 2 gave clean enough negatives for the simple SEC Risk Factors similarity channel:

- return alpha: not validated;
- peer-relative return alpha: not validated;
- analyst rating revision mechanism: not validated.

The next useful build is the Falsifier Engine: a conservative combinator that uses weak channels only when they agree on a concrete thesis risk, and measures whether abstention / research-priority improves versus forcing a rank.
