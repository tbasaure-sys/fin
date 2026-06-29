import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraExpectationsEngine } from "../lib/aurora-expectations-engine.js";
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

function pipelineOutput(input = baseInput) {
  return runAuroraBeliefPipeline(input, {
    asOfDate: "2026-01-01",
    ranAt: "2026-03-01T00:00:00.000Z",
    builtAt: "2026-03-01T00:00:00.000Z",
  });
}

test("expectations engine builds reverse DCF surface and market contour", () => {
  const result = buildAuroraExpectationsEngine(pipelineOutput(baseInput), {
    builtAt: "2026-03-01T00:00:00.000Z",
  });

  assert.equal(result.version, "aurora_expectations_engine_v1");
  assert.equal(result.ticker, "ASML");
  assert.equal(result.surface.axes.growth.steps, 13);
  assert.equal(result.surface.axes.margin.steps, 13);
  assert.equal(result.surface.cells.length, 169);
  assert.ok(result.marketContour.length > 0);
  assert.ok(Number.isFinite(result.summary.marketClearingFeasibility));
  assert.ok(Number.isFinite(result.summary.feasibleShareAbovePrice));
  assert.ok(["market_expectations_balanced", "market_expectations_demanding", "market_expectations_heroic", "market_expectations_feasible_with_upside"].includes(result.decision));
});

test("expectations engine overlays posterior distributions on the surface", () => {
  const result = buildAuroraExpectationsEngine(pipelineOutput(baseInput));

  assert.ok(result.posteriorOverlay.growth.p10 <= result.posteriorOverlay.growth.p50);
  assert.ok(result.posteriorOverlay.growth.p50 <= result.posteriorOverlay.growth.p90);
  assert.ok(result.posteriorOverlay.margin.p10 <= result.posteriorOverlay.margin.p50);
  assert.ok(result.posteriorOverlay.margin.p50 <= result.posteriorOverlay.margin.p90);
});

test("expectations engine makes higher market price more demanding", () => {
  const normal = buildAuroraExpectationsEngine(pipelineOutput(baseInput));
  const expensive = buildAuroraExpectationsEngine(
    pipelineOutput({
      ...baseInput,
      market: { ...baseInput.market, price: 2800 },
    }),
  );

  assert.ok(expensive.summary.marketClearingCell.distanceToMarket <= normal.summary.marketClearingCell.distanceToMarket + 0.25);
  assert.ok(expensive.summary.feasibleShareAbovePrice <= normal.summary.feasibleShareAbovePrice);
});

test("expectations engine preserves management and consensus scenarios when provided", () => {
  const result = buildAuroraExpectationsEngine({
    ...pipelineOutput(baseInput),
    managementScenarios: [
      { label: "management base", source: "guidance", revenueCagr: 0.12, terminalMargin: 0.32, roic: 0.28 },
      { label: "consensus", source: "street", growth: 0.09, margin: 0.26 },
    ],
  });

  assert.equal(result.externalScenarios.length, 2);
  assert.equal(result.externalScenarios[0].label, "management base");
  assert.equal(result.externalScenarios[1].source, "street");
});

