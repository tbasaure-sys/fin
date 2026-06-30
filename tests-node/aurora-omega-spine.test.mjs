import assert from "node:assert/strict";
import test from "node:test";

import { runAuroraBeliefPipeline } from "../lib/aurora-belief-pipeline.js";
import { buildAuroraOmegaSpine } from "../lib/aurora-omega-spine.js";

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

function pipelineOutput(input = baseInput) {
  return runAuroraBeliefPipeline(input, {
    asOfDate: "2026-01-01",
    ranAt: "2026-03-01T00:00:00.000Z",
    builtAt: "2026-03-01T00:00:00.000Z",
  });
}

test("omega spine compiles belief family, value-driver gradient, and counterfactual arena", () => {
  const result = buildAuroraOmegaSpine(pipelineOutput(baseInput), {
    builtAt: "2026-03-01T00:00:00.000Z",
  });

  assert.equal(result.version, "aurora_omega_spine_v1");
  assert.equal(result.ticker, "ASML");
  assert.ok(result.marketBeliefFamily.families.length >= 1);
  assert.ok(result.marketBeliefFamily.narrative.family);
  assert.ok(result.valueDriverGradient.dominant);
  assert.ok(result.counterfactualArena.minimumViableBullCase);
  assert.ok(result.counterfactualArena.minimumViableBearCase);
  assert.ok(result.memo.marketBelief);
});

test("omega spine keeps the driver gradient concentrated on a small set of variables", () => {
  const result = buildAuroraOmegaSpine(pipelineOutput(baseInput));

  assert.ok(Number.isFinite(result.valueDriverGradient.concentration));
  assert.ok(result.valueDriverGradient.concentration > 0.4);
  assert.ok(result.valueDriverGradient.drivers.length >= 3);
});

test("higher market price produces a more aggressive minimum viable bull case", () => {
  const normal = buildAuroraOmegaSpine(pipelineOutput(baseInput));
  const expensive = buildAuroraOmegaSpine(
    pipelineOutput({
      ...baseInput,
      market: { ...baseInput.market, price: 2600 },
    }),
  );

  assert.ok(expensive.counterfactualArena.minimumViableBullCase);
  assert.ok(normal.counterfactualArena.minimumViableBullCase);
  assert.ok(
    expensive.counterfactualArena.minimumViableBullCase.target.growth >=
      normal.counterfactualArena.minimumViableBullCase.target.growth ||
      expensive.counterfactualArena.minimumViableBullCase.target.margin >=
        normal.counterfactualArena.minimumViableBullCase.target.margin,
  );
});
