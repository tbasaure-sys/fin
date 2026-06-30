# AURORA SEC Filing-Change Full-Universe Audit

Date: 2026-06-30
Script: `scripts/run_aurora_sec_filing_change_audit.py`
Final full-build artifact: `artifacts/aurora_sec_filing_change_audit/20260630_051235`
Stronger eval-only artifact: `artifacts/aurora_sec_filing_change_audit/20260630_155402`
Final locked-risk artifact after extractor fix: `artifacts/aurora_sec_locked_risk_audit/20260630_174423`
Decisive post-2020 locked artifact: `artifacts/aurora_sec_locked_risk_audit/20260630_180928`

## Bottom Line

The SEC text channel is **alive but not yet proven**.

Update after the decisive post-2020 permutation test: the simple Risk Factors distance-change construction is **not a validated deployable alpha channel**. It remains useful as evidence/attention metadata, but the alpha claim should be closed for this construction.

After scaling from the 30-name smoke test to the full current V8 universe and fixing factor residualization, the best signal is:

| Signal | Rows | Folds | IC | Bootstrap 95% CI | Spread | Positive spread share | Sector-neutral IC | Permutation p |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `risk_text_stability_resid_within_year` | 2,237 | 6 | 0.0675 | [0.0394, 0.0964] | 0.0258 | 0.5000 | 0.0677 | 0.1768 |
| `risk_text_stability` | 2,237 | 6 | 0.0731 | [-0.0215, 0.1696] | 0.0329 | 0.8333 | 0.0685 | 0.1578 |
| `risk_text_stability_resid_pooled_year_fe` | 2,237 | 6 | 0.0558 | [-0.0394, 0.1354] | 0.0233 | 0.6667 | 0.0645 | 0.2657 |

Interpretation:

- The sign is economically coherent: more stable Risk Factors rank better; more Risk Factors change ranks worse.
- After the extractor fix, the effect size is realistic rather than inflated: IC 0.0675 for the within-year factor-residualized locked signal.
- The bootstrap CI is positive, but the 1,000-permutation null is not yet strong enough (`p = 0.1768`).
- Therefore this is **not promotable as alpha**. After isolating post-2020, the permutation null is decisively negative.

## What Changed Since The Thin Slice

The first 30-name slice had two issues:

1. SEC `submissions.recent` missed older 10-Ks for many major companies.
2. The apparent factor residuals were not actually using the factor columns because the merge kept only `ticker/year/sector/return/asof`.
3. The Risk Factors extractor missed filings using `Item 1A:` with a colon, leaving systematic zero-length sections for names such as AMAT.

Both were fixed:

1. The script now loads historical SEC `filings.files` JSON blocks in addition to `recent`.
2. The merge now keeps the full V8 dataset, so value/quality/momentum/size/leverage/volatility columns are available for residualization.
3. The extractor now recognizes `Item 1A:` as well as `Item 1A.` and recomputes Risk Factors sections from cached full filings.

This materially changed the read:

- 30-name preliminary: `risk_text_stability` looked very strong but underpowered.
- Full corrected locked run: `risk_text_stability_resid_within_year` remains positive but smaller and still not permutation-confirmed.

That is exactly the pattern we wanted from a serious audit: the exaggerated slice result got disciplined, but the channel did not vanish.

## Coverage

Command:

```powershell
$env:SEC_USER_AGENT='TomasBasaure/tbasaurel1997@gmail.com'
python scripts/run_aurora_sec_filing_change_audit.py --max-tickers 297 --start-year 2014 --end-year 2023 --min-text-chars 50000 --permutations 50 --bootstrap 1000 --seed 23
```

Stronger eval-only command:

```powershell
python scripts/run_aurora_sec_filing_change_audit.py --merged-input artifacts/aurora_sec_filing_change_audit/20260630_051235/merged_signals.csv --permutations 250 --bootstrap 2000 --seed 31
```

Coverage:

- Requested tickers: 297
- Tickers with usable SEC filings: 268
- Filing rows: 2,533
- Merged point-in-time rows: 2,479
- Risk Factors usable rows: 2,128
- Years: 2014-2023
- Point-in-time filter: `filing_date <= asof_date`, retained 2,479 / 2,533 rows

Risk Factors extraction:

- Median extracted Risk Factors length after colon fix: 71,818 characters
- Zero-risk extracted rows after colon fix: 191

Missing names were mostly non-US/ADR/foreign issuers, newer listings, ticker-history issues, or missing CIK map cases. Examples: `ASML`, `BABA`, `BHP`, `NVO`, `PDD`, `RIO`, `SAP`, `SHOP`, `SONY`, `SPOT`, `TSM`, `VALE`, plus a few missing CIK cases such as `ANSS`, `DFS`, `FI`, `HOLX`, `MMC`, `SQ`.

## Method

This audit intentionally avoided LLMs.

Signals:

- `filing_text_change`: consecutive-year 10-K TF-IDF cosine distance.
- `filing_text_stability`: negative of full 10-K change.
- `risk_text_change`: consecutive-year Risk Factors token Jaccard distance.
- `risk_text_stability`: negative of Risk Factors change.
- `filing_log_text_growth`: full filing length growth.
- `risk_log_text_growth`: Risk Factors length growth.
- `filing_change_combo`: weighted combination of change z-scores.
- `filing_stability_combo`: negative of combo.

Validation:

- 3Y forward return target from the V8 dataset.
- Rolling validation years via existing factor-null harness.
- Factor residualization against V8 factor columns.
- Sector-neutral IC.
- Block bootstrap over fold/year ICs.
- Return permutation null within year.

## Important Result

The full-document signal is weak:

`filing_text_stability_resid` IC = 0.0030.

The section-specific signal is the only interesting one:

`risk_text_stability_resid` IC = 0.0878.

This is consistent with the thesis that not all public text is useful. Broad document change is too noisy; valuation-bearing disclosure change is section-specific.

## Decision

Do not promote this as alpha.

Do not keep adding power to this exact distance-change construction. The clean test has been run, and post-2020 does not survive the permutation null.

The proper next step is **not** another financial model and not more 10-K/10-Q distance-change power. This construction is likely an arbitraged version of a published anomaly.

The fork now is:

1. Use Risk Factors stability as an attention/abstention input for the product, not as alpha.
2. If pursuing alpha, move up the evidence ladder to structured semantic extraction: concrete claims, capacity, backlog, customer concentration, margin pressure, pricing power, capex/supply, liquidity stress, and falsifiers.
3. Treat LLM/semantic extraction as a new hypothesis with stricter leakage controls, not as an enrichment of a validated alpha signal.

## Product Implication

This keeps the ambitious AURORA direction alive:

```text
price -> implied belief -> evidence-change channel -> falsifier/stability signal -> memo/ranking/abstention
```

But the claim should be disciplined:

- Financial/base-rate violation: closed for now as orthogonal alpha channel.
- SEC text-change channel: live candidate, not yet proven.
- Risk Factors stability: first serious candidate signal.
- Whole-document 10-K change: not compelling.

The next AURORA Priced Belief Object should include section-specific evidence-change fields, but any alpha/ranking claim should stay behind validation gates until the stronger null passes.

## Locked Hypothesis Read

The final locked hypothesis is:

```text
Risk Factors stability is positive.
More Risk Factors change is worse.
```

Final locked results:

| Signal | All IC | Pre-2020 IC | Post-2020 IC | Interpretation |
|---|---:|---:|---:|---|
| Raw `risk_text_stability` | 0.0731 | 0.1852 | 0.0171 | Strong pre-2020, mostly gone post-2020 |
| Within-year factor residual | 0.0675 | 0.1022 | 0.0502 | Still positive, weaker post-2020 |
| Pooled year-FE residual | 0.0558 | 0.1545 | 0.0064 | Collapse post-2020 under stricter pooled residualization |

This is a very useful result. It says the channel is directionally real and literature-consistent, but the deployable post-2020 residual is not yet strong enough to claim alpha.

Decision language:

```text
SEC Risk Factors stability is a plausible evidence channel.
It is not a validated deployable alpha channel.
Its strength is concentrated pre-2020 and does not survive a post-2020 permutation test.
The distance-change version should be closed as alpha and reused only as attention/abstention metadata.
```

## Decisive Post-2020 Test

The decisive test was run on 2020-2023 only, using the locked hypothesis and the corrected extractor:

```powershell
python scripts/run_aurora_sec_locked_risk_audit.py --merged-input artifacts/aurora_sec_filing_change_audit/20260630_173833/merged_signals.csv --min-year 2020 --permutations 1000 --bootstrap 3000 --seed 211
```

Result:

| Signal | Rows | Folds | IC | Bootstrap 95% CI | Sector-neutral IC | Permutation p |
|---|---:|---:|---:|---:|---:|---:|
| `risk_text_stability_resid_within_year` | 943 | 4 | 0.0502 | [0.0230, 0.0734] | 0.0426 | 0.4965 |
| `risk_text_stability_resid_pooled_year_fe` | 943 | 4 | 0.0318 | [-0.0307, 0.0860] | 0.0251 | 0.6613 |
| `risk_text_stability` | 943 | 4 | 0.0171 | [-0.0744, 0.0915] | 0.0240 | 0.8212 |

When bootstrap and permutation disagree, the permutation null is the safer read because it directly breaks the return association while preserving the cross-sectional structure. Here the post-2020 locked residual is not significant.

Final conclusion:

```text
The simple Risk Factors stability anomaly is historically recoverable, especially pre-2020,
but it is not a post-publication deployable alpha signal in this panel.
This is a clean negative result, not a pipeline failure.
```
