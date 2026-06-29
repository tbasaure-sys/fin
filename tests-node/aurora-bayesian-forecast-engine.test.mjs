import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraBayesianForecastEngine } from "../lib/aurora-bayesian-forecast-engine.js";
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

test("Bayesian forecast engine builds hierarchical posterior scenarios", () => {
  const result = buildAuroraBayesianForecastEngine(pipelineOutput(baseInput), {
    builtAt: "2026-03-01T00:00:00.000Z",
  });

  assert.equal(result.version, "aurora_bayesian_forecast_engine_v1");
  assert.equal(result.ticker, "ASML");
  assert.ok(Number.isFinite(result.posterior.growth.mean));
  assert.ok(Number.isFinite(result.posterior.margin.mean));
  assert.equal(result.scenarios.length, 3);
  assert.equal(result.scenarios.map((scenario) => scenario.name).join(","), "bear,base,bull");
  assert.ok(Math.abs(result.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0) - 1) < 1e-9);
  assert.ok(Number.isFinite(result.expectedFairValue));
  assert.equal(result.uncertainty.decomposition, "Var(V) = E[Var(V|theta)] + Var(E[V|theta])");
});

test("Bayesian forecast engine applies product-market pressure to posterior assumptions", () => {
  const neutral = buildAuroraBayesianForecastEngine({
    compiled: {
      version: "aurora_belief_compiler_v1",
      ticker: "CAP",
      name: "Capacity Co",
      drivers: {
        price: 100,
        revenue: 100,
        revenueCagr: 0.05,
        margin: 0.18,
        roic: 0.15,
        reinvestment: 0.25,
        wacc: 0.09,
        dataQuality: 0.8,
      },
    },
  });
  const constrained = buildAuroraBayesianForecastEngine({
    compiled: {
      version: "aurora_belief_compiler_v1",
      ticker: "CAP",
      name: "Capacity Co",
      drivers: {
        price: 100,
        revenue: 100,
        revenueCagr: 0.05,
        margin: 0.18,
        roic: 0.15,
        reinvestment: 0.25,
        wacc: 0.09,
        dataQuality: 0.8,
      },
    },
    equilibrium: {
      drivers: { demandSupply: 0.8, priceFormationPressure: 0.1 },
      productMarket: { pricingPressure: 0.75 },
      equityMarket: { expectedPriceImpact: 0.1 },
      aggregate: { score: 0.4 },
    },
  });

  assert.ok(constrained.posterior.growth.mean > neutral.posterior.growth.mean);
  assert.ok(constrained.posterior.margin.mean > neutral.posterior.margin.mean);
});

test("Bayesian forecast engine widens uncertainty when causal graph is unhealthy", () => {
  const healthy = buildAuroraBayesianForecastEngine(pipelineOutput(baseInput));
  const unhealthy = buildAuroraBayesianForecastEngine({
    ...pipelineOutput(baseInput),
    driverGraph: {
      graphHealth: { score: 0.2, level: "incoherent", hardViolationCount: 3 },
      constraintViolations: [{ severity: "hard" }],
    },
  });

  assert.ok(unhealthy.uncertainty.total > healthy.uncertainty.total);
  assert.ok(unhealthy.posteriorPredictiveChecks.some((check) => check.key === "driver_graph_violations"));
});

test("Bayesian forecast engine applies semiconductor twin adjustments to posterior assumptions", () => {
  const base = {
    company: { ticker: "SEMI", name: "Semicap Co", sector: "Technology", industry: "Semiconductor equipment" },
    compiled: {
      version: "aurora_belief_compiler_v1",
      ticker: "SEMI",
      name: "Semicap Co",
      drivers: {
        price: 100,
        revenue: 100,
        revenueCagr: 0.07,
        margin: 0.24,
        roic: 0.19,
        reinvestment: 0.3,
        wacc: 0.09,
        dataQuality: 0.82,
      },
    },
  };
  const neutral = buildAuroraBayesianForecastEngine(base);
  const bottleneck = buildAuroraBayesianForecastEngine({
    ...base,
    semiconductorTwin: {
      applicable: true,
      version: "aurora_semiconductor_twin_v1",
      decision: "semiconductor_bottleneck_supported",
      state: "durable_bottleneck",
      scores: { bottleneckDurability: 0.82, cycleRisk: 0.24, capacityPressure: 0.78, inventoryOverhang: 0.18, aspPower: 0.72 },
      adjustments: {
        bottleneckEvidenceDelta: 0.1,
        marginDurabilityDelta: 0.06,
        reinvestmentConfidenceDelta: 0.04,
        cycleRiskPenalty: 0,
        forecastUncertaintyMultiplier: 0.95,
      },
    },
  });
  const glut = buildAuroraBayesianForecastEngine({
    ...base,
    semiconductorTwin: {
      applicable: true,
      version: "aurora_semiconductor_twin_v1",
      decision: "semiconductor_glut_risk",
      state: "capacity_glut_risk",
      scores: { bottleneckDurability: 0.22, cycleRisk: 0.86, capacityPressure: 0.18, inventoryOverhang: 0.82, aspPower: 0.18 },
      adjustments: {
        bottleneckEvidenceDelta: -0.08,
        marginDurabilityDelta: -0.06,
        reinvestmentConfidenceDelta: -0.04,
        cycleRiskPenalty: 0.15,
        forecastUncertaintyMultiplier: 1.34,
      },
    },
  });

  assert.equal(bottleneck.sectorTwinAdjustment.applied, true);
  assert.equal(bottleneck.sectorTwinAdjustment.source, "aurora_semiconductor_twin_v1");
  assert.ok(bottleneck.posterior.margin.mean > neutral.posterior.margin.mean);
  assert.ok(bottleneck.posterior.roic.mean > neutral.posterior.roic.mean);
  assert.ok(glut.posterior.margin.mean < neutral.posterior.margin.mean);
  assert.ok(glut.posterior.wacc.mean > neutral.posterior.wacc.mean);
  assert.ok(glut.uncertainty.total > neutral.uncertainty.total);
});

test("Bayesian forecast scenarios stay economically ordered", () => {
  const result = buildAuroraBayesianForecastEngine(pipelineOutput(baseInput));
  const [bear, base, bull] = result.scenarios;

  assert.ok(bear.growth <= base.growth);
  assert.ok(base.growth <= bull.growth);
  assert.ok(bear.wacc >= base.wacc);
  assert.ok(base.wacc >= bull.wacc);
  assert.ok(bear.fairValue < bull.fairValue);
});
