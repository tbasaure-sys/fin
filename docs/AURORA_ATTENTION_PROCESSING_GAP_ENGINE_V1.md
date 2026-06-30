# AURORA Attention-Processing Gap Engine V1

## Core conclusion

AURORA should not claim that public filings contain secret information.

They do not.

The stronger and more defensible claim is:

> AURORA detects public evidence that is economically relevant and appears underprocessed by the market.

The edge is not information access. The edge is disciplined belief updating under market attention constraints.

## Why this reframes the recent failures correctly

The recent audits rejected several simple alpha hypotheses:

- financial-statement base-rate violation did not survive as an orthogonal signal;
- simple SEC Risk Factors similarity did not validate as a robust return alpha channel;
- peer-relative Risk Factors stability improved some raw ICs but failed permutation/null validation;
- Risk Factors stability did not robustly predict FMP analyst rating revisions across 90d, 180d, and 365d windows.

That does not kill AURORA.

It kills the weak claim:

> filing changed -> expected return.

The refined claim is:

> filing changed -> economically classified evidence -> thesis variable affected -> observable market digestion measured -> processing gap prioritized -> falsifier monitored.

## Product primitive

The new primitive is the Processing Gap Evidence Card.

Each card answers:

1. What changed?
2. Why does it matter economically?
3. Which thesis variable does it affect?
4. Has the market digested it?
5. What should we do next?
6. What would prove this wrong?

## Formula

The V1 score is:

```text
Processing Gap Score =
  Evidence Importance
  * (1 - Market Digestion)
  * Confidence
  * Freshness
  * Investability
```

Where:

- `Evidence Importance` measures whether the signal affects revenue, margin, ROIC, FCF conversion, liquidity, moat, accounting quality, customer concentration, or management credibility.
- `Market Digestion` measures observable uptake through price reaction, volume reaction, news coverage, analyst revisions, transcript attention, and consensus narrative absorption.
- `Issue-Level Digestion` measures whether the market digested the specific thesis issue, not merely whether the event received attention.
- `Confidence` measures extraction quality and whether the card has a concrete source/excerpt and thesis variable.
- `Freshness` penalizes stale evidence.
- `Investability` avoids over-ranking theoretically interesting but hard-to-act-on signals.

## Issue-Level Digestion

The V1 engine now separates two layers:

```text
Event Attention = how much attention the filing, earnings release, or company event received.
Issue Attention = how much attention the specific thesis variable received.
```

This distinction is load-bearing.

An earnings event can have high market attention because everyone discusses:

```text
EPS beat
revenue beat
headline guidance
AI commentary
```

while almost nobody discusses:

```text
receivables deterioration
inventory build
customer concentration language
pricing pressure moving from hypothetical to realized
legal risk becoming more specific
```

The strongest AURORA situation is therefore:

```text
High Event Attention
+ Low Issue Attention
+ High Evidence Importance
= Misdirected Attention
```

In product language:

> The market looked at the company, but probably looked at the wrong thing.

## Radar quadrants

| Evidence Importance | Issue-Level Digestion | Quadrant | Interpretation |
|---|---|---|---|
| High | Low | `aurora_zone` | Investigate now. This is the product zone. |
| High | High | `important_but_likely_processed` | Important, but probably already digested. |
| Low | Low | `low_attention_noise` | Low attention is not enough. Do not confuse silence with mispricing. |
| Low | High | `low_priority_digestible` | Low priority. |

This matters because low market reaction alone is not alpha. It can simply mean the evidence is irrelevant.

It also matters because high market reaction does not necessarily mean the issue was digested. The market can react strongly to the event while missing the issue AURORA surfaced.

## Misdirected Attention Score

The engine now computes:

```text
Misdirected Attention Score =
Event Attention - Issue Attention
```

Interpretation:

| Event Attention | Issue Attention | Reading |
|---:|---:|---|
| High | High | The market probably processed the issue. |
| Low | Low | Could be neglect, but also could be noise. |
| Low | High | Specialized attention exists despite low event attention. |
| High | Low | AURORA opportunity: attention was likely misdirected. |

Evidence Cards now expose:

- `digestionMode`
- `eventAttention`
- `issueAttention`
- `misdirectedAttention`
- `misdirectedAttentionLevel`
- `eventAttentionEvidence`
- `issueAttentionEvidence`

## Implementation

New module:

`lib/aurora-processing-gap-engine.js`

Exports:

- `buildAuroraProcessingGapEngine(input, options)`
- `summarizeAuroraProcessingGap(input, options)`

Tests:

`tests-node/aurora-processing-gap-engine.test.mjs`

The module can consume:

- explicit `evidenceItems`;
- extracted evidence from `aurora-evidence-extractor`;
- market attention / digestion metrics;
- issue-level attention events;
- company context and event date.

## Input shape

```js
buildAuroraProcessingGapEngine({
  context: {
    ticker: "XYZ",
    eventDate: "2026-06-20",
    marketCap: 12000000000,
    liquidityScore: 0.82
  },
  evidenceItems: [{
    eventType: "10-Q",
    evidenceType: "liquidity",
    direction: "bearish",
    thesisVariable: "free_cash_flow_conversion",
    whatChanged: "Working capital language worsened...",
    whyItMatters: "Cash conversion and balance-sheet flexibility are affected.",
    semanticNovelty: 0.88,
    contradictionStrength: 0.74,
    confidence: 0.86
  }],
  attention: {
    event: {
      priceReactionScore: 0.92,
      volumeReactionScore: 0.88,
      newsCoverageScore: 0.90
    },
    issueAttentionEvents: [{
      thesisVariable: "revenue_growth",
      attentionIntensity: 0.9,
      headline: "Analysts focus on revenue beat and AI demand."
    }]
  }
});
```

## Output shape

```js
{
  version: "aurora_processing_gap_engine_v1",
  summary: {
    evidenceCards: 1,
    auroraZoneCards: 1,
    processingGapScore: 74,
    decision: "processing_gap_investigate_now",
    topThesisVariable: "free_cash_flow_conversion"
  },
  evidenceCards: [{
    version: "aurora_evidence_card_v1",
    signalType: "liquidity",
    thesisVariable: "free_cash_flow_conversion",
    processingGapScore: 74,
    evidenceImportance: 88,
    marketDigestion: 4,
    digestionMode: "issue_level",
    eventAttention: 90,
    issueAttention: 0,
    misdirectedAttention: 90,
    confidence: "high",
    quadrant: "aurora_zone",
    whatChanged: "...",
    whyItMatters: "...",
    recommendedResearchAction: "...",
    falsifier: "..."
  }]
}
```

## Product copy

Short:

> AURORA finds the gap between public evidence and market understanding.

Investor-grade:

> AURORA is not built on the idea that public filings contain secret information. They do not. AURORA is built on a more durable inefficiency: public information is abundant, but structured attention is scarce. The system identifies economically relevant public evidence, measures whether the market appears to have digested it, and prioritizes the gaps where belief updates may still be incomplete.

Spanish:

> AURORA no compite por informacion publica. Compite por comprension estructurada. Su objetivo es detectar senales publicas economicamente relevantes que todavia no parecen haber sido incorporadas por completo en precio, consenso o narrativa.

## Next build

The natural next step is to connect this module to the SEC filing pipeline:

1. Convert section diffs into explicit `evidenceItems`.
2. Add event-window price/volume digestion metrics.
3. Classify news, transcript, and analyst attention by thesis variable.
4. Add FMP rating revision digestion metrics from the cache already built.
5. Render the first Processing Gap Radar table.
6. Backtest `processing_gap_score -> delayed belief update`, not raw filing similarity to returns.

This is the correct route because it captures the conclusion from the audits:

> no durable alpha in raw public information as commodity; possible alpha only in structured processing before consensus digestion.
