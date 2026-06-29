import assert from "node:assert/strict";
import test from "node:test";

import { runAuroraBeliefPipeline } from "../lib/aurora-belief-pipeline.js";
import { buildAuroraSourceGovernanceEngine } from "../lib/aurora-source-governance-engine.js";

const pipelineInput = {
  company: {
    ticker: "ASML",
    name: "ASML Holding NV",
    sector: "Technology",
    industry: "Semiconductor equipment",
  },
  market: { price: 1200, beta: 1.12 },
  macro: { riskFreeRate: 0.044, equityRiskPremium: 0.052, inflation: 0.024 },
  financials: {
    incomeStatements: [
      { date: "2021-12-31", revenue: 180, ebit: 52 },
      { date: "2022-12-31", revenue: 210, ebit: 63 },
      { date: "2023-12-31", revenue: 250, ebit: 76 },
      { date: "2024-12-31", revenue: 300, ebit: 93 },
    ],
    balanceSheets: [{ date: "2024-12-31", totalDebt: 18, totalStockholdersEquity: 285, cashAndCashEquivalents: 42 }],
    cashFlows: [{ date: "2024-12-31", operatingCashFlow: 36, capitalExpenditure: -8 }],
  },
  documents: [
    {
      id: "asml-10k",
      type: "10-K filing",
      source: "SEC EDGAR",
      filingDate: "2025-02-14",
      acceptedDate: "2025-02-14T20:10:00Z",
      text: "Internal controls were effective. Backlog supports demand visibility and capacity remains constrained.",
    },
  ],
};

test("source governance accepts primary disclosures, normalized vendors, and point-in-time macro", () => {
  const result = buildAuroraSourceGovernanceEngine({
    sources: [
      {
        id: "sec-10k",
        provider: "SEC EDGAR",
        type: "10-K XBRL",
        filingDate: "2025-02-14",
        acceptedDate: "2025-02-14T20:10:00Z",
        usedFor: ["financials"],
      },
      {
        id: "fmp-profile",
        provider: "Financial Modeling Prep",
        type: "normalized company profile",
        availableAt: "2025-02-15",
        methodologyVersion: "stable-v1",
        usedFor: ["screening"],
      },
      {
        id: "alfred-dgs10",
        provider: "ALFRED",
        type: "macro vintage",
        observationDate: "2024-12-31",
        vintageDate: "2025-01-02",
        availableAt: "2025-01-02",
        usedFor: ["macro"],
      },
    ],
  });

  assert.equal(result.version, "aurora_source_governance_engine_v1");
  assert.equal(result.decision, "source_governance_usable");
  assert.equal(result.summary.restrictedValuationSources, 0);
  assert.ok(result.summary.byClass.primary_disclosure.count === 1);
  assert.ok(result.summary.averageTrustScore > 70);
});

test("source governance warns on macro sources without vintage metadata", () => {
  const result = buildAuroraSourceGovernanceEngine({
    sources: [
      {
        id: "fred-dgs10",
        provider: "FRED",
        type: "macro rate",
        observationDate: "2024-12-31",
        availableAt: "2025-01-02",
        usedFor: ["macro"],
      },
    ],
  });

  assert.equal(result.decision, "source_governance_watch");
  assert.equal(result.sources[0].valuationUse, "allowed_with_vintage_warning");
  assert.ok(result.sources[0].warnings.some((warning) => /vintage/i.test(warning)));
});

test("source governance restricts alternative data without required controls", () => {
  const result = buildAuroraSourceGovernanceEngine({
    sources: [
      {
        id: "web-traffic",
        provider: "Common Crawl derived traffic",
        type: "alternative web traffic",
        usedFor: ["valuation"],
        availableAt: "2025-01-05",
      },
    ],
  });

  assert.equal(result.decision, "source_governance_restricted");
  assert.equal(result.summary.restrictedValuationSources, 1);
  assert.ok(result.sources[0].controls.missing.includes("economic_definition"));
  assert.ok(result.sources[0].controls.missing.includes("history"));
  assert.ok(result.sources[0].controls.missing.includes("methodology_change_control"));
  assert.ok(result.sources[0].controls.missing.includes("outcome_validation"));
});

test("source governance allows alternative data only after definition, history, availability, methodology, and validation", () => {
  const result = buildAuroraSourceGovernanceEngine({
    sources: [
      {
        id: "app-rank",
        provider: "App rankings panel",
        type: "alternative app ranking",
        economicDefinition: "Weekly category rank percentile as a demand proxy for the consumer app segment.",
        historyStart: "2021-01-01",
        historyEnd: "2025-01-01",
        availableAt: "2025-01-02",
        methodologyVersion: "rank-normalization-v3",
        methodologyChangeLog: "Major store taxonomy changes backfilled before 2023.",
        validation: { target: "next-quarter segment revenue growth", rankIc: 0.12 },
        usedFor: ["valuation"],
      },
    ],
  });

  assert.equal(result.decision, "source_governance_usable");
  assert.equal(result.sources[0].valuationUse, "allowed");
  assert.equal(result.summary.alternativeReadyShare, 1);
});

test("belief pipeline escalates restricted alternative valuation sources", () => {
  const result = runAuroraBeliefPipeline({
    ...pipelineInput,
    sources: [
      {
        id: "patents",
        provider: "patent citation scrape",
        type: "alternative patent citations",
        availableAt: "2025-01-01",
        usedFor: ["valuation"],
      },
    ],
  });

  assert.equal(result.sourceGovernance.decision, "source_governance_restricted");
  assert.equal(result.decision.state, "source_governance_review");
  assert.ok(result.memo.bullets.some((line) => /Source governance:/.test(line)));
});
