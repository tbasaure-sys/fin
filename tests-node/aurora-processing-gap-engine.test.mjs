import assert from "node:assert/strict";
import test from "node:test";

import { extractAuroraEvidenceSignals } from "../lib/aurora-evidence-extractor.js";
import { buildAuroraProcessingGapEngine, summarizeAuroraProcessingGap } from "../lib/aurora-processing-gap-engine.js";

const baseContext = {
  ticker: "XYZ",
  company: { ticker: "XYZ", name: "XYZ Industrial" },
  eventDate: "2026-06-20",
  marketCap: 12_000_000_000,
  liquidityScore: 0.82,
};

test("processing gap engine prioritizes important evidence with low market digestion", () => {
  const result = buildAuroraProcessingGapEngine(
    {
      context: baseContext,
      evidenceItems: [
        {
          id: "wc-stress",
          eventType: "10-Q",
          evidenceType: "liquidity",
          direction: "bearish",
          thesisVariable: "free_cash_flow_conversion",
          whatChanged: "Liquidity language now says working capital needs increased due to slower customer payments and inventory build.",
          whyItMatters: "This directly affects cash conversion and balance-sheet flexibility.",
          semanticNovelty: 0.88,
          contradictionStrength: 0.74,
          confidence: 0.86,
        },
      ],
      attention: {
        abnormalReturn: 0.004,
        abnormalVolume: 0.1,
        newsCount: 0,
        analystRevision: 0,
        transcriptMentions: 0,
      },
    },
    { asOfDate: "2026-06-22", createdAt: "2026-06-22T00:00:00.000Z" },
  );

  assert.equal(result.version, "aurora_processing_gap_engine_v1");
  assert.equal(result.summary.decision, "processing_gap_investigate_now");
  assert.equal(result.evidenceCards[0].quadrant, "aurora_zone");
  assert.equal(result.evidenceCards[0].status, "investigate_now");
  assert.ok(result.evidenceCards[0].processingGapScore >= 50);
  assert.match(result.evidenceCards[0].auroraInterpretation, /not yet visibly digested/i);
});

test("low digestion alone is not enough when evidence importance is low", () => {
  const result = buildAuroraProcessingGapEngine(
    {
      context: baseContext,
      evidenceItems: [
        {
          evidenceType: "boilerplate",
          thesisVariable: "unspecified",
          whatChanged: "Legal wording changed in a generic forward-looking statement.",
          whyItMatters: "This does not clearly affect a live thesis variable.",
          semanticNovelty: 0.12,
          financialMateriality: 0.08,
          thesisRelevance: 0.1,
          confidence: 0.82,
        },
      ],
      attention: { abnormalReturn: 0, newsCount: 0, analystRevision: 0 },
    },
    { asOfDate: "2026-06-22" },
  );

  assert.equal(result.evidenceCards[0].quadrant, "low_attention_noise");
  assert.equal(result.evidenceCards[0].status, "dismiss_or_archive");
  assert.ok(result.evidenceCards[0].processingGapScore < 25);
});

test("important evidence with strong market digestion is not treated as overlooked", () => {
  const result = buildAuroraProcessingGapEngine(
    {
      context: baseContext,
      evidenceItems: [
        {
          evidenceType: "customer_concentration",
          thesisVariable: "revenue_durability",
          whatChanged: "The company disclosed realized pressure from its largest customer.",
          whyItMatters: "Revenue durability and bargaining power are directly affected.",
          semanticNovelty: 0.91,
          confidence: 0.88,
        },
      ],
      attention: {
        priceReactionScore: 0.9,
        volumeReactionScore: 0.85,
        newsCoverageScore: 0.82,
        analystRevisionScore: 0.76,
        transcriptAttentionScore: 0.7,
        consensusNarrativeScore: 0.66,
      },
    },
    { asOfDate: "2026-06-22" },
  );

  assert.equal(result.evidenceCards[0].quadrant, "important_but_likely_processed");
  assert.equal(result.evidenceCards[0].status, "monitor_digesting_consensus");
  assert.ok(result.evidenceCards[0].marketDigestion >= 70);
});

test("issue-level digestion catches misdirected attention when the event was widely covered", () => {
  const result = buildAuroraProcessingGapEngine(
    {
      context: baseContext,
      evidenceItems: [
        {
          id: "receivables-risk",
          eventType: "10-Q",
          evidenceType: "liquidity",
          direction: "bearish",
          thesisVariable: "free_cash_flow_conversion",
          whatChanged: "Receivables and inventory language deteriorated while reported revenue beat expectations.",
          whyItMatters: "The headline beat may hide weaker cash conversion and demand quality.",
          semanticNovelty: 0.86,
          contradictionStrength: 0.82,
          confidence: 0.88,
        },
      ],
      attention: {
        event: {
          priceReactionScore: 0.92,
          volumeReactionScore: 0.88,
          newsCoverageScore: 0.9,
          analystRevisionScore: 0.76,
          transcriptAttentionScore: 0.82,
          consensusNarrativeScore: 0.78,
        },
        issueAttentionEvents: [
          {
            thesisVariable: "revenue_growth",
            attentionIntensity: 0.9,
            headline: "Analysts focus on revenue beat and AI demand.",
          },
          {
            thesisVariable: "margin_durability",
            attentionIntensity: 0.72,
            headline: "Coverage highlights operating leverage.",
          },
        ],
      },
    },
    { asOfDate: "2026-06-22" },
  );

  const card = result.evidenceCards[0];
  assert.equal(card.digestionMode, "issue_level");
  assert.equal(card.quadrant, "aurora_zone");
  assert.equal(card.status, "investigate_now");
  assert.ok(card.eventAttention >= 80);
  assert.ok(card.issueAttention <= 5);
  assert.ok(card.misdirectedAttention >= 75);
  assert.match(card.auroraInterpretation, /paid attention to the event, but not to this specific thesis issue/i);
});

test("issue-level digestion suppresses gap when the exact thesis issue was covered", () => {
  const result = buildAuroraProcessingGapEngine(
    {
      context: baseContext,
      evidenceItems: [
        {
          evidenceType: "liquidity",
          direction: "bearish",
          thesisVariable: "free_cash_flow_conversion",
          whatChanged: "The company added working-capital stress language.",
          whyItMatters: "Cash conversion may be deteriorating.",
          semanticNovelty: 0.86,
          confidence: 0.86,
        },
      ],
      attention: {
        event: { priceReactionScore: 0.75, volumeReactionScore: 0.72, newsCoverageScore: 0.7 },
        issueAttentionEvents: [
          {
            thesisVariable: "free_cash_flow_conversion",
            attentionIntensity: 0.84,
            headline: "Analysts flag receivables, inventory, and working capital deterioration.",
          },
        ],
      },
    },
    { asOfDate: "2026-06-22" },
  );

  const card = result.evidenceCards[0];
  assert.equal(card.digestionMode, "issue_level");
  assert.equal(card.quadrant, "important_but_likely_processed");
  assert.equal(card.status, "monitor_digesting_consensus");
  assert.ok(card.issueAttention >= 80);
  assert.ok(card.misdirectedAttention < 10);
});

test("engine can transform extracted evidence into evidence cards", () => {
  const extracted = extractAuroraEvidenceSignals({
    documents: [
      {
        id: "filing-1a",
        type: "10-Q filing",
        source: "SEC",
        text:
          "The company disclosed material weakness in internal controls and warned that gross margin declined due to cost inflation. The largest customer reduced orders and demand weakness continued.",
      },
    ],
  });
  const result = buildAuroraProcessingGapEngine(
    {
      context: { ...baseContext, eventType: "10-Q", eventDate: "2026-06-20" },
      extractedEvidence: extracted,
      attention: { abnormalReturn: 0.002, newsCount: 0, analystRevision: 0 },
    },
    { asOfDate: "2026-06-22" },
  );

  assert.ok(result.evidenceCards.length > 0);
  assert.ok(result.evidenceCards.some((card) => ["accounting_quality", "margin_pressure"].includes(card.signalType)));
  assert.ok(result.summary.processingGapScore > 0);
});

test("summary exposes product-facing processing gap headline", () => {
  const summary = summarizeAuroraProcessingGap(
    {
      context: baseContext,
      evidenceItems: [
        {
          evidenceType: "pricing_power",
          thesisVariable: "margin_durability",
          whatChanged: "Pricing language shifted from successful price increases to pricing pressure.",
          whyItMatters: "Margin durability may be weaker than the market narrative assumes.",
          semanticNovelty: 0.8,
          confidence: 0.78,
        },
      ],
      attention: { abnormalReturn: 0.003, newsCount: 0, analystRevision: 0 },
    },
    { asOfDate: "2026-06-22" },
  );

  assert.equal(summary.version, "aurora_processing_gap_summary_v1");
  assert.ok(summary.processingGapScore > 0);
  assert.match(summary.headline, /market digestion/i);
});
