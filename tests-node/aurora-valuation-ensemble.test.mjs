import assert from "node:assert/strict";
import test from "node:test";

import { runAuroraBeliefPipeline } from "../lib/aurora-belief-pipeline.js";
import { buildAuroraValuationEnsemble } from "../lib/aurora-valuation-ensemble.js";

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

test("valuation ensemble values posterior futures with multiple intrinsic lenses", () => {
  const result = buildAuroraValuationEnsemble(pipelineOutput(baseInput), {
    builtAt: "2026-03-01T00:00:00.000Z",
  });

  assert.equal(result.version, "aurora_valuation_ensemble_v1");
  assert.equal(result.ticker, "ASML");
  assert.ok(result.summary.methodCount >= 5);
  assert.ok(Number.isFinite(result.summary.weightedFairValue));
  assert.ok(Number.isFinite(result.summary.expectedReturn));
  assert.ok(["ensemble_usable", "ensemble_wide_range_use_caution", "ensemble_requires_review"].includes(result.decision));
  assert.ok(result.lensOutputs.some((lens) => lens.key === "fcffDcf" && lens.weight > 0));
  assert.ok(result.lensOutputs.some((lens) => lens.key === "roicFade" && lens.weight > 0));
});

test("valuation ensemble keeps reverse DCF as benchmark, not intrinsic weight", () => {
  const result = buildAuroraValuationEnsemble(pipelineOutput(baseInput));
  const reverseDcf = result.lensOutputs.find((lens) => lens.key === "reverseDcf");
  const intrinsicWeight = result.lensOutputs
    .filter((lens) => lens.role === "intrinsic_lens")
    .reduce((sum, lens) => sum + lens.weight, 0);

  assert.equal(reverseDcf.role, "market_implied_benchmark");
  assert.equal(reverseDcf.weight, 0);
  assert.ok(Math.abs(intrinsicWeight - 1) < 1e-9);
});

test("valuation ensemble changes lens weights by sector archetype", () => {
  const semicap = buildAuroraValuationEnsemble(pipelineOutput(baseInput));
  const bank = buildAuroraValuationEnsemble(
    pipelineOutput({
      ...baseInput,
      company: { ticker: "BANK", name: "Bank Example", sector: "Financial Services", industry: "Bank" },
      market: { price: 80, beta: 0.95 },
      financials: {
        incomeStatements: [
          { date: "2022-12-31", revenue: 100, ebit: 22 },
          { date: "2023-12-31", revenue: 105, ebit: 23 },
          { date: "2024-12-31", revenue: 109, ebit: 24 },
        ],
        balanceSheets: [{ date: "2024-12-31", totalDebt: 900, totalStockholdersEquity: 120, cashAndCashEquivalents: 80 }],
        cashFlows: [{ date: "2024-12-31", operatingCashFlow: 28, capitalExpenditure: -2 }],
      },
    }),
  );
  const semicapBottleneckWeight = semicap.lensOutputs.find((lens) => lens.key === "bottleneck").weight;
  const bankResidualWeight = bank.lensOutputs.find((lens) => lens.key === "residualIncome").weight;
  const semicapResidualWeight = semicap.lensOutputs.find((lens) => lens.key === "residualIncome").weight;

  assert.ok(semicapBottleneckWeight > 0.08);
  assert.ok(bankResidualWeight > semicapResidualWeight);
});

test("valuation ensemble flags extreme method disagreement", () => {
  const pipeline = pipelineOutput(baseInput);
  const result = buildAuroraValuationEnsemble({
    ...pipeline,
    forecast: {
      ...pipeline.forecast,
      scenarios: [
        { name: "bear", probability: 0.3, growth: -0.1, margin: 0.05, roic: 0.03, reinvestment: 0.85, wacc: 0.16, terminalGrowth: 0.0, fairValue: 50 },
        { name: "base", probability: 0.4, growth: 0.08, margin: 0.2, roic: 0.18, reinvestment: 0.3, wacc: 0.09, terminalGrowth: 0.02, fairValue: 700 },
        { name: "bull", probability: 0.3, growth: 0.35, margin: 0.55, roic: 0.55, reinvestment: 0.05, wacc: 0.045, terminalGrowth: 0.04, fairValue: 9000 },
      ],
    },
  });

  assert.ok(["ensemble_requires_review", "ensemble_wide_range_use_caution"].includes(result.decision));
  assert.ok(result.summary.disagreement > 0.42);
});

