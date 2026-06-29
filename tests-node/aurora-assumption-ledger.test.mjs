import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraAssumptionLedgerEngine } from "../lib/aurora-assumption-ledger-engine.js";
import { runAuroraBeliefPipeline } from "../lib/aurora-belief-pipeline.js";

const completeMarginAssumption = {
  driver: "gross_margin",
  asOf: "2026-03-31",
  distribution: "logistic_normal",
  priorMean: 0.62,
  priorSd: 0.04,
  source: "filing_2026_q1_segment_note",
  economicMechanism: "mix_and_utilization",
  dependencies: ["utilization", "pricing", "input_costs"],
  falsifier: [
    {
      text: "Two quarters below 55% gross margin without mix explanation.",
      variable: "gross_margin",
      threshold: 0.55,
      direction: "min",
    },
  ],
  owner: "Tomas",
};

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
      type: "earnings call",
      source: "company transcript",
      text: "Demand visibility is supported by backlog. The company remains capacity constrained and pricing power is strong.",
    },
  ],
};

test("assumption ledger accepts explicit complete assumptions", () => {
  const result = buildAuroraAssumptionLedgerEngine({
    assumptionLedger: [completeMarginAssumption],
  });

  assert.equal(result.version, "aurora_assumption_ledger_engine_v1");
  assert.equal(result.decision, "assumption_ledger_usable");
  assert.equal(result.summary.assumptionCount, 1);
  assert.equal(result.ledger[0].status, "current");
  assert.equal(result.ledger[0].completeness.missing.length, 0);
  assert.ok(result.reviewQuestions.includes("Did a falsifier occur?"));
});

test("assumption ledger marks incomplete assumptions before underwriting", () => {
  const result = buildAuroraAssumptionLedgerEngine({
    assumptionLedger: [{ driver: "revenue_growth", priorMean: 0.12 }],
  });

  assert.equal(result.decision, "assumption_ledger_incomplete");
  assert.ok(result.ledger[0].completeness.missing.includes("source"));
  assert.ok(result.ledger[0].completeness.missing.includes("falsifier"));
});

test("assumption ledger trips numeric falsifiers and recommends re-underwriting", () => {
  const result = buildAuroraAssumptionLedgerEngine({
    assumptionLedger: [completeMarginAssumption],
    observations: {
      metrics: {
        gross_margin: 0.51,
      },
    },
  });

  assert.equal(result.decision, "assumption_falsifier_tripped");
  assert.equal(result.ledger[0].status, "falsifier_tripped");
  assert.equal(result.ledger[0].updateRecommendation, "falsifier_tripped_reunderwrite");
  assert.equal(result.summary.trippedFalsifierCount, 1);
});

test("assumption ledger detects observation shocks inside a complete assumption", () => {
  const result = buildAuroraAssumptionLedgerEngine({
    assumptionLedger: [completeMarginAssumption],
    observations: {
      metrics: {
        gross_margin: 0.7,
      },
    },
  });

  assert.equal(result.decision, "assumption_update_required");
  assert.ok(result.ledger[0].zScore > 1.8);
  assert.equal(result.ledger[0].updateRecommendation, "update_mean_and_uncertainty");
});

test("belief pipeline derives a usable assumption ledger from forecast and falsifiers", () => {
  const result = runAuroraBeliefPipeline(pipelineInput, { asOfDate: "2026-01-01" });

  assert.equal(result.assumptionLedger.version, "aurora_assumption_ledger_engine_v1");
  assert.ok(result.assumptionLedger.summary.assumptionCount >= 6);
  assert.ok(result.assumptionLedger.summary.completeness > 0.75);
  assert.ok(["assumption_ledger_usable", "assumption_update_required"].includes(result.assumptionLedger.decision));
  assert.ok(result.memo.bullets.some((line) => /Assumption ledger:/.test(line)));
});

test("belief pipeline escalates a tripped explicit assumption falsifier", () => {
  const result = runAuroraBeliefPipeline({
    ...pipelineInput,
    assumptionLedger: [completeMarginAssumption],
    observations: {
      asOfDate: "2026-06-30",
      metrics: {
        gross_margin: 0.5,
        revenue_growth: 0.28,
        operating_margin: 0.45,
        roic: 0.42,
        reinvestment_rate: 0.12,
      },
    },
  });

  assert.equal(result.assumptionLedger.decision, "assumption_falsifier_tripped");
  assert.equal(result.decision.state, "assumption_ledger_review");
});
