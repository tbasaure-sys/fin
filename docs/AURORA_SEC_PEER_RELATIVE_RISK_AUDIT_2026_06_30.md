# AURORA SEC Peer-Relative Risk Factors Audit

Date: 2026-06-30
Script: `scripts/run_aurora_sec_peer_relative_audit.py`
All-period artifact: `artifacts/aurora_sec_peer_relative_audit/20260630_190805`
Post-2020 artifact: `artifacts/aurora_sec_peer_relative_audit/20260630_190116`

## Decision

I chose idea #1: differentiate Risk Factors stability against the peer group instead of the whole universe.

Locked hypothesis:

```text
Company-specific Risk Factors stability versus sector-year peers is positive.
```

The idea is economically clean. If every bank rewrites risk factors because rates changed, that is sector beta. AURORA should care about the idiosyncratic part: whether a company is stable or unstable relative to peers facing the same disclosure regime.

## Result

The peer-relative construction improves the headline IC, especially post-2020, but it still does **not** pass the permutation null.

Post-2020 decisive run:

| Signal | Rows | Folds | IC | Bootstrap 95% CI | Sector-neutral IC | Permutation p |
|---|---:|---:|---:|---:|---:|---:|
| `risk_text_stability_peer_z_resid_within_year` | 943 | 4 | 0.0819 | [0.0653, 0.0953] | 0.0089 | 0.2797 |
| `risk_text_stability_peer_z_resid_pooled_year_fe` | 943 | 4 | 0.0650 | [0.0112, 0.1113] | 0.0167 | 0.4026 |
| `risk_text_stability_peer_z` | 943 | 4 | 0.0464 | [-0.0254, 0.1105] | 0.0143 | 0.5514 |

All-period run:

| Signal | Rows | Folds | IC | Bootstrap 95% CI | Sector-neutral IC | Permutation p |
|---|---:|---:|---:|---:|---:|---:|
| `risk_text_stability_peer_z_resid_within_year` | 2,237 | 6 | 0.0811 | [0.0680, 0.0931] | 0.0390 | 0.1049 |
| `risk_text_stability_peer_z` | 2,237 | 6 | 0.0730 | [0.0082, 0.1324] | 0.0533 | 0.1429 |
| `risk_text_stability_peer_z_resid_pooled_year_fe` | 2,237 | 6 | 0.0588 | [-0.0269, 0.1222] | 0.0557 | 0.2298 |

## Interpretation

Peer-normalization helped, but not enough.

Important read:

1. The signal direction remains coherent.
2. The IC magnitude is realistic.
3. Sector-year normalization increases post-2020 within-year residual IC from about 0.050 to about 0.082.
4. But the permutation null still says no: post-2020 p = 0.2797.
5. The sector-neutral IC is near zero post-2020, which weakens the case further.

So option #1 does not rescue the Risk Factors distance-change alpha.

## What This Means

This is not a pipeline failure.

It says:

```text
Simple distance-change on Risk Factors, even peer-relative, is not validated alpha post-2020.
```

Use it as:

- attention metadata;
- evidence instability signal;
- abstention input;
- memo/falsifier context.

Do not use it as:

- standalone alpha;
- production ranking signal;
- justification to keep scaling the same distance-change construction.

## Next Fork

The three options from the review now reduce to:

1. Peer-relative distance-change: tested, not validated.
2. Change target to analyst estimate/rating revisions: still open, requires consensus revision data.
3. Combine marginal channels in the Falsifier Engine: still open, but must be pre-registered and tested against permutation nulls.

My current recommendation after this run:

```text
Do not keep mining filing-distance variants.
Move either to target #2 if revisions data is accessible, or to #3 as a product-level Falsifier Engine.
For alpha, #2 is cleaner.
For product differentiation, #3 is more aligned with AURORA.
```
