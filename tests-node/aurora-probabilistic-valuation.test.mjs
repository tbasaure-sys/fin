import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraProbabilisticValuation } from "../lib/aurora-probabilistic-valuation.js";
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
};

function pipeline(price = 1200) {
  return runAuroraBeliefPipeline(
    {
      ...baseInput,
      market: { ...baseInput.market, price },
    },
    {
      asOfDate: "2026-01-01",
      ranAt: "2026-03-01T00:00:00.000Z",
      builtAt: "2026-03-01T00:00:00.000Z",
      probabilisticSampleCount: 192,
      retainSamplePaths: 24,
    },
  );
}

test("probabilistic valuation emits IRR, downside, CVaR, and sensitivity distributions", () => {
  const pred = pipeline();
  const result = buildAuroraProbabilisticValuation(pred, {
    builtAt: "2026-03-01T00:00:00.000Z",
    probabilisticSampleCount: 256,
    retainSamplePaths: 20,
  });

  assert.equal(result.version, "aurora_probabilistic_valuation_v1");
  assert.equal(result.method.sampler, "quasi_monte_carlo_halton_v1");
  assert.equal(result.method.sampleCount, 256);
  assert.equal(result.retainedPaths.length, 20);
  assert.ok(Number.isFinite(result.valueDistribution.p10));
  assert.ok(Number.isFinite(result.valueDistribution.p50));
  assert.ok(Number.isFinite(result.valueDistribution.p90));
  assert.ok(Number.isFinite(result.irrDistribution.p50));
  assert.ok(Number.isFinite(result.risk.probabilityNegativeIrr));
  assert.ok(Number.isFinite(result.risk.downsideCvarIrr));
  assert.ok(result.sensitivity.irr.firstOrder.length >= 3);
  assert.ok(result.sensitivity.irr.firstOrder[0].firstOrderIndex >= result.sensitivity.irr.firstOrder.at(-1).firstOrderIndex);
});

test("higher price raises probabilistic downside risk", () => {
  const cheaper = pipeline(850).probabilisticValuation;
  const expensive = pipeline(1800).probabilisticValuation;

  assert.ok(expensive.risk.probabilityNegativeIrr >= cheaper.risk.probabilityNegativeIrr);
  assert.ok(expensive.risk.probabilityValueBelowPrice >= cheaper.risk.probabilityValueBelowPrice);
});

test("pipeline exposes probabilistic valuation and dashboard consumes it", () => {
  const result = pipeline();
  const byKey = Object.fromEntries(result.dashboardContract.visualizations.map((item) => [item.key, item]));

  assert.equal(result.probabilisticValuation.version, "aurora_probabilistic_valuation_v1");
  assert.equal(result.dashboardContract.primaryPanel.valueRange.source, "probabilistic_valuation");
  assert.equal(byKey.sobol_sensitivity.status, "ready");
  assert.equal(byKey.irr_distribution.status, "ready");
  assert.ok(result.memo.bullets.some((bullet) => bullet.includes("Probabilistic valuation:")));
});
