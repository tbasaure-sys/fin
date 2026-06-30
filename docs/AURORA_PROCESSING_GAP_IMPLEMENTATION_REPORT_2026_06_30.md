# AURORA Processing Gap implementation report - 2026-06-30

## Executive summary

This pass translated the latest strategic conclusion into code, tests, and documentation.

The key conclusion is:

> AURORA should not claim that public filings contain secret information. They do not. AURORA should detect public evidence that is economically relevant and appears underprocessed by the market.

The product primitive changed from:

```text
filing change -> expected return
```

to:

```text
public evidence
-> economic importance
-> market digestion
-> processing gap
-> evidence card
-> falsifier / monitoring plan
```

This is a material architectural shift. It preserves the North Star of AURORA as a priced-belief and evidence-processing system, while removing the weaker claim that raw filing similarity or financial-statement data should generate direct alpha by itself.

## Why this was necessary

Several previous tests produced disciplined negative or mixed results:

1. Financial-statement base-rate violation did not survive as a clean orthogonal signal.
2. Simple SEC filing / Risk Factors similarity did not validate as robust return alpha.
3. Peer-relative Risk Factors stability improved some raw ICs but failed permutation/null validation.
4. Risk Factors stability did not robustly predict FMP analyst rating revisions across 90d, 180d, and 365d windows.

The correct inference is not:

> AURORA is dead.

The correct inference is:

> Raw public information as a commodity is not enough. The only defensible edge is structured processing: identifying which public evidence should change a belief, and whether the market appears to have digested that evidence.

## Workstream 1 - Analyst/rating revision target audit

### Goal

Test option 2 from the proposed fork:

> Change the target, not the channel. If filing text is an attention-gap signal, it should show up first in analyst/rating revisions, not necessarily in 3Y returns.

### New runner

`scripts/run_aurora_analyst_revision_target_audit.py`

### Input

`artifacts/aurora_sec_filing_change_audit/20260630_173833/merged_signals.csv`

### External target source

FMP `stable/grades-historical`.

The endpoint returned a monthly-ish history of analyst rating mix:

- `analystRatingsStrongBuy`
- `analystRatingsBuy`
- `analystRatingsHold`
- `analystRatingsSell`
- `analystRatingsStrongSell`

### Cache

`artifacts/aurora_revision_cache/fmp_grades_historical/`

### Target definition

```text
analyst_rating_revision_{window}d
= rating_score_post - rating_score_pre
```

Where:

- `rating_score_pre` is the latest rating score available on or before the filing date.
- `rating_score_post` is the first rating score around filing date plus the window.
- Rating score uses:
  - strong buy: `+2`
  - buy: `+1`
  - hold: `0`
  - sell: `-1`
  - strong sell: `-2`
  - divided by total analyst count.

### Windows tested

- 90 days
- 180 days
- 365 days

### Signals tested

- `risk_text_stability`
- `risk_text_stability_resid_within_year`
- `risk_text_stability_resid_pooled_year_fe`
- `risk_text_stability_peer_z`
- `risk_text_stability_peer_z_resid_within_year`

### Coverage

| Window | Rows | Tickers | Endpoint errors |
|---:|---:|---:|---:|
| 90d | 1,224 | 266 | 0 |
| 180d | 1,129 | 264 | 0 |
| 365d | 1,232 | 266 | 0 |

### Key artifacts

- `artifacts/aurora_analyst_revision_target_audit/20260630_90d_confirmed`
- `artifacts/aurora_analyst_revision_target_audit/20260630_200107`
- `artifacts/aurora_analyst_revision_target_audit/20260630_365d_confirmed`

### Main results

#### 90-day target

Best signal:

`risk_text_stability_peer_z`

- IC: `0.0370`
- Bootstrap CI: `[-0.0184, 0.0847]`
- Permutation p-abs: `0.2218`
- Sector-neutral IC: `0.0417`

Interpretation:

Directionally positive, but not statistically clean.

#### 180-day target

Strongest result:

`risk_text_stability_resid_pooled_year_fe`

- IC: `-0.0710`
- Bootstrap CI: `[-0.1160, -0.0213]`
- Permutation p-abs: `0.0200`
- Sector-neutral IC: `-0.0456`

Interpretation:

Statistically notable but opposite sign versus the pre-registered "stability is good" hypothesis. Not stable enough to promote because it does not survive at 90d or 365d.

#### 365-day target

Best signal:

`risk_text_stability_resid_within_year`

- IC: `0.0166`
- Bootstrap CI: `[-0.0358, 0.0625]`
- Permutation p-abs: `0.5874`
- Sector-neutral IC: `0.0151`

Interpretation:

Dead.

### Mechanism check

The rating revision target itself did not robustly predict 3Y returns:

| Window | Revision-to-return IC | Permutation p-abs |
|---:|---:|---:|
| 90d | `0.0065` | `0.9161` |
| 180d | `-0.0121` | `0.8701` |
| 365d | `-0.0400` | `0.4795` |

### Decision

The FMP rating-history target is operationally useful, but simple Risk Factors stability/change does not robustly predict analyst rating revisions.

This does not validate option 2 as an alpha mechanism in the current form.

It does, however, provide a reusable market-digestion data layer.

## Workstream 2 - Documentation of analyst revision audit

### New report

`docs/AURORA_ANALYST_REVISION_TARGET_AUDIT_2026_06_30.md`

### Purpose

Documented:

- why the analyst revision audit exists;
- how rating revision targets were defined;
- coverage;
- 90d / 180d / 365d results;
- mechanism check against returns;
- decision not to promote the simple Risk Factors channel;
- recommendation to move toward a Falsifier / Processing Gap engine.

## Workstream 3 - Attention-Processing Gap architecture

### Strategic conclusion implemented

The latest proposal reframed AURORA as:

> A machine that detects economically relevant public evidence that the market may not have fully processed.

This led to a new product concept:

```text
Attention-Processing Gap
= Evidence Importance - Market Digestion
```

More precisely:

```text
Processing Gap Score =
  Evidence Importance
  * (1 - Market Digestion)
  * Confidence
  * Freshness
  * Investability
```

### Why this is better

It avoids weak claims:

- "filings predict returns";
- "we have more information";
- "the market did not see this";
- "low price reaction means alpha".

And replaces them with a stronger claim:

> The market may have seen the public evidence, but AURORA asks whether the evidence was converted into the right belief update.

## Workstream 4 - Processing Gap engine

### New module

`lib/aurora-processing-gap-engine.js`

### Exports

```js
buildAuroraProcessingGapEngine(input, options)
summarizeAuroraProcessingGap(input, options)
```

### Inputs supported

The engine can consume:

- explicit `evidenceItems`;
- extracted evidence from `aurora-evidence-extractor`;
- market attention / digestion metrics;
- company context;
- event date;
- market cap / liquidity / investability context.

### Evidence Importance

The engine scores economic importance using:

- evidence type;
- thesis variable affected;
- financial materiality;
- semantic novelty;
- thesis relevance;
- contradiction strength;
- base-rate risk;
- management credibility change;
- source type.

Important thesis variables include:

- revenue durability;
- pricing power;
- gross / operating margin;
- FCF conversion;
- ROIC;
- reinvestment efficiency;
- liquidity;
- balance sheet risk;
- customer concentration;
- accounting quality;
- management credibility.

### Market Digestion

The engine scores market digestion using:

- price reaction;
- volume reaction;
- news coverage;
- analyst revisions;
- transcript attention;
- consensus narrative absorption.

### Radar quadrants

The engine classifies each evidence card into one of four quadrants:

| Evidence importance | Market digestion | Quadrant | Meaning |
|---|---|---|---|
| High | Low | `aurora_zone` | Investigate now. This is the product zone. |
| High | High | `important_but_likely_processed` | Important, but probably already digested. |
| Low | Low | `low_attention_noise` | Low attention is not enough. |
| Low | High | `low_priority_digestible` | Low priority. |

This explicitly protects against a common mistake:

> Low market attention is not automatically alpha. If the evidence is not important, low attention is just noise.

### Evidence Cards

The engine outputs `aurora_evidence_card_v1` objects.

Each card includes:

- ticker;
- event type and date;
- signal type;
- direction;
- thesis variable;
- Processing Gap Score;
- Evidence Importance;
- Market Digestion;
- confidence;
- quadrant;
- what changed;
- why it matters;
- market digestion evidence;
- AURORA interpretation;
- recommended research action;
- falsifier;
- source excerpt when available.

### Example interpretation

For high-importance public evidence with low digestion:

> Public evidence appears economically important and not yet visibly digested by the market.

For low-importance evidence with low digestion:

> Attention is low, but the evidence does not yet appear economically important enough.

This is the central discipline of the new architecture.

## Workstream 5 - Processing Gap tests

### New tests

`tests-node/aurora-processing-gap-engine.test.mjs`

### Test cases added

1. High evidence importance + low market digestion is prioritized.
2. Low market digestion alone is not enough when evidence importance is low.
3. Important evidence with strong market digestion is not treated as overlooked.
4. Extracted evidence can be transformed into evidence cards.
5. Product-facing summary exposes processing gap headline.

These tests lock the conceptual claim into behavior.

## Workstream 6 - Pipeline integration

### Modified module

`lib/aurora-belief-pipeline.js`

### Integration behavior

The Processing Gap engine now runs optionally when the pipeline input includes any of:

- `attention`
- `marketAttention`
- `marketDigestion`
- `evidenceItems`
- explicit `processingGap`

If these are absent, existing callers are unaffected.

### New pipeline output

The pipeline now exposes:

```js
result.processingGap
```

when relevant.

### New decision states

The pipeline can now elevate to:

```text
processing_gap_review
```

when AURORA finds a strong `aurora_zone` evidence card.

It can also elevate to:

```text
processing_gap_watchlist
```

when the gap is real enough to monitor but not strong enough for immediate research escalation.

### Decision discipline

Harder gates still take priority:

- insufficient inputs;
- source governance restrictions;
- causal model violation;
- equilibrium pressure;
- forecast review;
- valuation ensemble review;
- heroic market expectations;
- feasibility manifold failure;
- calibration failure;
- management reliability problems;
- destructive capital allocation;
- tripped thesis falsifiers;
- assumption ledger problems;
- stale thesis.

Only after these higher-priority states does Processing Gap elevate the pipeline.

This keeps the system from treating attention gaps as stronger than broken data or broken thesis logic.

## Workstream 7 - Pipeline tests

### Modified test

`tests-node/aurora-belief-pipeline.test.mjs`

### New coverage

Added a pipeline-level test:

> belief pipeline exposes processing gap review without pretending it is direct alpha

This test confirms:

- the pipeline exposes `result.processingGap`;
- the top evidence card lands in `aurora_zone`;
- the decision becomes `processing_gap_review`;
- the action is `investigate_underprocessed_public_evidence`;
- the memo mentions Processing Gap.

## Workstream 8 - Conceptual documentation

### New doc

`docs/AURORA_ATTENTION_PROCESSING_GAP_ENGINE_V1.md`

### Contents

The doc explains:

- why the previous simple alpha hypotheses failed;
- why that does not kill AURORA;
- the refined thesis;
- the Processing Gap formula;
- radar quadrants;
- input and output shape;
- product copy;
- next implementation steps.

### Product copy added

Short:

> AURORA finds the gap between public evidence and market understanding.

Investor-grade:

> AURORA is not built on the idea that public filings contain secret information. They do not. AURORA is built on a more durable inefficiency: public information is abundant, but structured attention is scarce. The system identifies economically relevant public evidence, measures whether the market appears to have digested it, and prioritizes the gaps where belief updates may still be incomplete.

Spanish:

> AURORA no compite por informacion publica. Compite por comprension estructurada. Su objetivo es detectar senales publicas economicamente relevantes que todavia no parecen haber sido incorporadas por completo en precio, consenso o narrativa.

## Verification

### Focused tests

Ran:

```bash
node --test tests-node/aurora-processing-gap-engine.test.mjs tests-node/aurora-belief-pipeline.test.mjs
```

Result:

```text
14 tests passed
0 failed
```

### Full Node test suite

Ran:

```bash
npm run test:web
```

Result:

```text
185 tests passed
0 failed
```

This confirms the new Processing Gap layer does not break the broader AURORA / valuation stack.

## Files created

```text
lib/aurora-processing-gap-engine.js
tests-node/aurora-processing-gap-engine.test.mjs
docs/AURORA_ATTENTION_PROCESSING_GAP_ENGINE_V1.md
docs/AURORA_ANALYST_REVISION_TARGET_AUDIT_2026_06_30.md
docs/AURORA_PROCESSING_GAP_IMPLEMENTATION_REPORT_2026_06_30.md
scripts/run_aurora_analyst_revision_target_audit.py
```

## Files modified

```text
lib/aurora-belief-pipeline.js
tests-node/aurora-belief-pipeline.test.mjs
```

Note: `lib/aurora-belief-pipeline.js` already contained broader ongoing AURORA changes around Omega Spine and memo enrichment in the working tree. I did not revert or overwrite unrelated work. The Processing Gap integration was added so it coexists with those changes.

## Current status

The Processing Gap layer is now production-shaped as a deterministic, auditable AURORA component.

It is not yet a full backtested alpha system.

It is ready for the next product layer:

1. Convert SEC section diffs into explicit `evidenceItems`.
2. Attach event-window price/volume digestion metrics.
3. Attach FMP rating revision digestion metrics from the cache.
4. Render the first Processing Gap Radar table in the frontend.
5. Backtest:

```text
processing_gap_score -> delayed belief update
```

not:

```text
raw filing similarity -> return
```

## Strategic decision

The correct next build is not another filing similarity model.

The correct next build is:

> Processing Gap Radar + Evidence Cards + Falsifier Tracker.

That is the architecture that captures the strongest conclusion from the entire investigation:

> There may be no durable alpha in the public information merely existing. The possible edge is in processing public evidence into belief updates faster, deeper, and more structurally than the market.

## Addendum - Issue-Level Digestion implemented

After a second review, the most important missing layer was identified:

> Market digestion must be measured at the issue level, not only at the event level.

This matters because a company can receive enormous attention after an event while the market focuses on the wrong topic.

Example:

```text
Event attention:
high, because everyone discusses the revenue beat.

Issue attention:
low, because almost nobody discusses receivables deterioration or customer concentration language.
```

This is now represented explicitly in the Processing Gap Engine.

### New concept

```text
Event Attention = total attention to the filing, earnings release, or company event.
Issue Attention = attention to the specific thesis variable surfaced by AURORA.
```

### New score

```text
Misdirected Attention Score =
Event Attention - Issue Attention
```

High Misdirected Attention means:

> The market looked at the company, but probably looked at the wrong thing.

### Code updated

`lib/aurora-processing-gap-engine.js`

New behavior:

- accepts `attention.event`;
- accepts `attention.issueAttentionEvents`;
- accepts explicit `issueDigestionScore` or `issueDigestionScores`;
- matches attention events to evidence cards by `thesisVariable`, `evidenceType`, or issue keywords;
- uses issue-level digestion for the Processing Gap formula when issue data is available;
- keeps event-level digestion as fallback when issue data is absent;
- computes `misdirectedAttentionScore`;
- exposes event/issue attention details on each Evidence Card.

### Evidence Card fields added

```text
digestionMode
eventAttention
issueAttention
misdirectedAttention
misdirectedAttentionLevel
eventAttentionEvidence
issueAttentionEvidence
```

### New tests added

`tests-node/aurora-processing-gap-engine.test.mjs`

Added cases:

1. High event attention + low issue attention + high evidence importance becomes `aurora_zone`.
2. High issue attention suppresses the gap when the exact thesis issue was already processed.

These tests protect the new killer claim:

> AURORA is not just looking for low-attention evidence. It is looking for economically relevant issues that the market did not process, even when the broader event received attention.

### Verification

Focused Processing Gap tests:

```text
7 tests passed
0 failed
```
