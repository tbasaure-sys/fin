import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraDecisionEngine } from "../lib/aurora-decision-engine.js";
import { runAuroraBeliefPipeline } from "../lib/aurora-belief-pipeline.js";

const baseInput = {
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
      text:
        "Management described multi-year demand visibility supported by backlog. The company remains capacity constrained and pricing power is strong. Internal controls were effective.",
    },
  ],
  observations: {
    asOfDate: "2026-03-01",
    metrics: {
      revenue_growth: 0.23,
      operating_margin: 0.39,
      roic: 0.33,
      reinvestment_rate: 0.16,
    },
  },
};

function pipeline(extra = {}, options = {}) {
  return runAuroraBeliefPipeline(
    {
      ...baseInput,
      ...extra,
    },
    {
      asOfDate: "2026-01-01",
      ranAt: "2026-03-01T00:00:00.000Z",
      builtAt: "2026-03-01T00:00:00.000Z",
      probabilisticSampleCount: 192,
      retainSamplePaths: 24,
      ...options,
    },
  );
}

test("decision engine emits a governed decision packet with sizing limits", () => {
  const result = pipeline();
  const decision = buildAuroraDecisionEngine(result, { builtAt: "2026-03-01T00:00:00.000Z" });

  assert.equal(decision.version, "aurora_decision_engine_v1");
  assert.ok(["blocked", "memo_only", "avoid", "watch_only", "stage_only", "underwrite_allowed"].includes(decision.decisionRights));
  assert.ok(decision.action.label);
  assert.ok(decision.sizing.maxPositionPct >= 0);
  assert.ok(decision.sizing.maxPositionPct <= 0.08);
  assert.ok(decision.allowedActions.length >= 1);
  assert.ok(decision.blockedActions.length >= 1);
  assert.ok(decision.reopenTriggers.length >= 1);
  assert.ok(decision.memo.headline.includes(decision.decisionRights.replaceAll("_", " ")));
});

test("decision engine blocks underwriting when the pipeline has a hard repair state", () => {
  const sparse = runAuroraBeliefPipeline(
    { company: { ticker: "VOID", name: "Void Co" }, market: { price: 10 } },
    { builtAt: "2026-03-01T00:00:00.000Z", probabilisticSampleCount: 96 },
  );

  assert.equal(sparse.decisionEngine.decisionRights, "blocked");
  assert.equal(sparse.decisionEngine.sizing.maxPositionPct, 0);
  assert.ok(sparse.decisionEngine.hardBlocks.some((block) => block.key === "repair_inputs"));
  assert.ok(sparse.dashboardContract.decisionPacket.available);
  assert.equal(sparse.dashboardContract.decisionPacket.decisionRights, "blocked");
});

test("dashboard contract exposes the final decision packet from the pipeline", () => {
  const result = pipeline();

  assert.equal(result.dashboardContract.decisionPacket.available, true);
  assert.equal(result.dashboardContract.decisionPacket.decisionRights, result.decisionEngine.decisionRights);
  assert.equal(result.dashboardContract.decisionPacket.maxPositionPct, result.decisionEngine.sizing.maxPositionPct);
  assert.deepEqual(result.dashboardContract.decisionPacket.allowedActions, result.decisionEngine.allowedActions);
});

