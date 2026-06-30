# AURORA SEC Filing-Change V0

Date: 2026-06-30
Repo: `C:\Users\T14 Ultra 7\OneDrive\Escritorio\CT\blsprime-fin`
Primary script: `scripts/run_aurora_sec_filing_change_audit.py`
Final artifact: `artifacts/aurora_sec_filing_change_audit/20260630_034645`

## Executive Read

This is the first real AURORA text-channel experiment after the financial/base-rate channel failed.

The important result is not the whole-document filing-change signal. That was basically dead in the thin slice. The important result is that **Risk Factors stability** showed a strong positive rank signal:

| Signal | Rows | Folds | Mean return IC | SD IC | Mean spread | Positive spread share | Sector-neutral IC |
|---|---:|---:|---:|---:|---:|---:|---:|
| `risk_text_stability` | 105 | 5 | 0.3369 | 0.2395 | 0.0578 | 0.6667 | 0.4792 |
| `risk_text_stability_resid` | 105 | 5 | 0.3369 | 0.2395 | 0.0578 | 0.6667 | 0.4792 |
| `filing_stability_combo` | 146 | 5 | 0.1320 | 0.1976 | 0.0635 | 0.6667 | 0.2396 |
| `filing_text_change` | 123 | 5 | 0.0004 | 0.1712 | 0.0322 | 0.5000 | -0.1027 |

Interpretation: in this slice, broad 10-K document change does not rank returns, but stability in the Risk Factors section does. Equivalently, high Risk Factors change is bad:

`risk_text_change` IC = -0.3369.

That is economically coherent: new or heavily changed risk disclosure may proxy for emerging uncertainty, business deterioration, accounting/legal stress, or management updating the market to risks that were not previously central.

This is **not proof of alpha**. It is a successful vertical slice and a promising channel diagnostic. The sample is too small: 24 tickers, 146 merged rows, 105 usable Risk Factors rows.

## What We Built

The script implements a no-LLM, point-in-time filing-change audit:

1. Pulls ticker-to-CIK mapping from SEC.
2. Pulls company submissions from `data.sec.gov`.
3. Selects annual `10-K` filings.
4. Downloads/caches the primary filing document from SEC Archives.
5. Normalizes HTML into text.
6. Extracts Risk Factors section.
7. Computes consecutive-year change:
   - full-document TF-IDF cosine distance;
   - Risk Factors token Jaccard distance;
   - full-document text growth;
   - Risk Factors text growth.
8. Aligns filing year to the V8 AURORA dataset.
9. Enforces point-in-time availability:
   - `filing_date <= asof_date`.
10. Runs factor-null-style ranking diagnostics:
   - raw signal IC;
   - factor-residualized signal IC;
   - sector-neutral IC;
   - spread direction.

## Critical Bug Caught And Fixed

The first pass had a real extractor bug. `risk_text_change` was mostly zero because the regex was grabbing the table-of-contents `Item 1A. Risk Factors` entry, often only 23-24 characters.

After inspecting cached filings, the extractor was fixed to:

1. find all `Item 1A. Risk Factors` appearances;
2. build candidate sections until `Item 1B` / `Item 2`;
3. reject tiny candidates;
4. keep the longest substantive section;
5. recompute `.risk.txt` from cached full filing text instead of trusting stale risk caches.

Post-fix Risk Factors median extracted length:

- Median: 64,835 characters
- Min: 0
- Max: 250,000

This changed the result materially. Before the fix, Risk Factors was unusable. After the fix, Risk Factors stability became the top signal.

## Final Slice

Command:

```powershell
$env:SEC_USER_AGENT='TomasBasaure/tbasaurel1997@gmail.com'
python scripts/run_aurora_sec_filing_change_audit.py --max-tickers 30 --start-year 2014 --end-year 2023 --min-text-chars 50000
```

Requested tickers:

`AAPL, MSFT, AMZN, GOOGL, META, NVDA, ADBE, AMD, AMAT, AVGO, JPM, BAC, AXP, BA, CAT, DE, COST, HD, WMT, KO, PEP, LLY, JNJ, ABBV, UNH, XOM, CVX, NEE, LIN, BLK`

Coverage:

- Tickers with usable filings: 24
- Filing rows: 147
- Merged rows after point-in-time filter: 146 / 147
- Years: 2014-2023
- Missing / too few 10-K in this implementation: `GOOGL`, `META`, `JPM`, `BAC`, `WMT`, `BLK`

The missing list is likely an acquisition/parsing issue, not a final coverage limit. The next build should harden SEC accession discovery for these names before scaling.

## What This Means

The financial channel result was harsh but clean:

- ex-post realized expectation violation looked strong;
- live base-rate violation residualized to approximately zero;
- therefore financial-statement-only belief violation did not carry orthogonal information in our setup.

This SEC filing-change v0 is the first test of a different channel: public but under-attended text changes.

The current read:

1. Whole-document change is too noisy.
2. Risk Factors section change is much more promising.
3. The useful sign may be **stability**, not change:
   - stable Risk Factors ranked better;
   - large Risk Factors change ranked worse.
4. This fits AURORA's thesis: not all public evidence is equally attended, and filing-section changes may encode evidence not fully spanned by price/financial factors.

## What This Does Not Prove

This does not yet prove deployable alpha.

Main limitations:

1. Sample is tiny: 105 usable risk rows.
2. Folds are few and overlapping with 3Y returns.
3. Residualization is weakly informative in the tiny slice because factor matrices have limited cross-sectional power.
4. No permutation null has been run yet for this SEC signal.
5. No block-bootstrap CI yet.
6. Risk Factors extraction is improved but not audited manually across all issuers.
7. 10-K only gives limited cross-sectional/time power.

Correct status: **channel alive, not proven**.

## Decision

Do not jump to LLM extraction yet.

The right next step is to scale the clean text-change channel first:

1. Expand from 30 requested tickers to the full current V8 universe.
2. Fix SEC discovery for missing large names.
3. Add permutation null by year.
4. Add block-bootstrap confidence intervals.
5. Add 10-Q support only after 10-K full-universe path is stable, unless power is clearly insufficient.
6. Only then add LLM / structured evidence extraction.

Reason: the lesson from the base-rate failure was that orthogonality must come from the input. The SEC text channel has a plausible live signal, but we need to validate the channel before enriching it.

## Production Implication For AURORA

This result supports the AURORA architecture shift:

```text
price -> implied belief -> evidence-change channel -> falsifier/stability signal -> memo/ranking/abstention
```

It does not support going back to a financial-only router.

The next version of the Priced Belief Object should include:

```json
{
  "evidence_graph": {
    "sec_10k_change": {
      "filing_text_change": "...",
      "risk_text_change": "...",
      "risk_text_stability": "...",
      "filing_date": "...",
      "point_in_time_valid": true
    }
  },
  "falsifiers": [
    "new or materially changed risk-factor language",
    "risk disclosure instability",
    "section-level evidence deterioration"
  ],
  "abstention_reason": "evidence channel underpowered until full-universe validation"
}
```

## Next Command

After hardening missing CIK/submission cases:

```powershell
$env:SEC_USER_AGENT='TomasBasaure/tbasaurel1997@gmail.com'
python scripts/run_aurora_sec_filing_change_audit.py --max-tickers 297 --start-year 2014 --end-year 2023 --min-text-chars 50000
```

Then run the same factor-null harness with permutation and block-bootstrap extensions.
