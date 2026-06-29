import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraFeasibilityManifold } from "../lib/aurora-feasibility-manifold.js";
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

test("feasibility manifold annotates the expectations surface", () => {
  const pipeline = pipelineOutput(baseInput);
  const result = buildAuroraFeasibilityManifold(pipeline, {
    builtAt: "2026-03-01T00:00:00.000Z",
  });

  assert.equal(result.version, "aurora_feasibility_manifold_v1");
  assert.equal(result.ticker, "ASML");
  assert.equal(result.archetype, "capacity_cycle");
  assert.equal(result.annotatedSurface.cells.length, pipeline.expectations.surface.cells.length);
  assert.ok(Number.isFinite(result.summary.viableShare));
  assert.ok(["plausible", "stretched", "implausible", "impossible", "unknown"].includes(result.summary.contourClass));
  assert.ok(["manifold_usable", "market_contour_stretched", "market_contour_implausible"].includes(result.decision));
});

test("feasibility manifold flags physically incoherent growth cells", () => {
  const pipeline = pipelineOutput({
    ...baseInput,
    market: { ...baseInput.market, price: 3400 },
    financials: {
      ...baseInput.financials,
      cashFlows: [{ date: "2024-12-31", operatingCashFlow: 36, capitalExpenditure: -2 }],
    },
    equilibrium: {
      productMarket: { utilization: 0.62, pricingPressure: 0.02 },
      aggregate: { score: 0 },
      drivers: { demandSupply: 0.45, bottleneckPower: 0.25 },
    },
  });
  const result = buildAuroraFeasibilityManifold(pipeline);
  const impossible = result.annotatedSurface.cells.filter((cell) => cell.feasibilityClass === "impossible" || cell.feasibilityClass === "implausible");
  const constraintKeys = new Set(impossible.flatMap((cell) => cell.constraints.map((constraint) => constraint.key)));

  assert.ok(impossible.length > 0);
  assert.ok(constraintKeys.has("physical_growth_without_capacity") || constraintKeys.has("growth_without_reinvestment"));
});

test("feasibility manifold uses sector kernels instead of one universal geometry", () => {
  const semicap = buildAuroraFeasibilityManifold(pipelineOutput(baseInput));
  const software = buildAuroraFeasibilityManifold(
    pipelineOutput({
      ...baseInput,
      company: { ticker: "SOFT", name: "Software Example", sector: "Technology", industry: "SaaS cloud software" },
      financials: {
        incomeStatements: [
          { date: "2022-12-31", revenue: 120, ebit: 8 },
          { date: "2023-12-31", revenue: 150, ebit: 16 },
          { date: "2024-12-31", revenue: 188, ebit: 31 },
        ],
        balanceSheets: [{ date: "2024-12-31", totalDebt: 8, totalStockholdersEquity: 95, cashAndCashEquivalents: 35 }],
        cashFlows: [{ date: "2024-12-31", operatingCashFlow: 40, capitalExpenditure: -3 }],
      },
    }),
  );

  assert.equal(semicap.archetype, "capacity_cycle");
  assert.equal(software.archetype, "asset_light_platform");
  assert.notEqual(semicap.kernel.prototypes[0].label, software.kernel.prototypes[0].label);
});

test("feasibility manifold reports the dominant constraint when assumptions fail", () => {
  const pipeline = pipelineOutput({
    ...baseInput,
    market: { ...baseInput.market, price: 4200 },
  });
  const result = buildAuroraFeasibilityManifold(pipeline);

  assert.ok(result.summary.topConstraint === null || typeof result.summary.topConstraint.key === "string");
  assert.ok(result.memo.headline.includes("Feasibility manifold"));
});

