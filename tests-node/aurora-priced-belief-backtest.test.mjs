import assert from "node:assert/strict";
import test from "node:test";

import { runAuroraBeliefPipeline } from "../lib/aurora-belief-pipeline.js";
import { buildAuroraPricedBeliefBacktest } from "../lib/aurora-priced-belief-backtest.js";

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

function prediction(price = 1200, ticker = "ASML") {
  return runAuroraBeliefPipeline(
    {
      ...baseInput,
      company: { ...baseInput.company, ticker },
      market: { ...baseInput.market, price },
    },
    {
      asOfDate: "2026-01-01",
      ranAt: "2026-03-01T00:00:00.000Z",
      builtAt: "2026-03-01T00:00:00.000Z",
    },
  );
}

function actualsAroundImplied(pred, overrides = {}) {
  const implied = pred.beliefObject.marketImpliedBeliefs;
  return {
    growth: implied.revenueCagr5y.mean,
    margin: implied.terminalMargin.mean,
    roic: implied.roicPath.mean,
    reinvestment: implied.reinvestmentRate.mean,
    fcfMargin: implied.fcfMargin.mean,
    dilution: implied.dilution.mean,
    value: pred.valuationEnsemble.summary.weightedFairValue,
    realizedReturn: pred.valuationEnsemble.summary.expectedReturn,
    ...overrides,
  };
}

test("priced-belief backtest decomposes implied beliefs versus realized outcomes", () => {
  const p1 = prediction(980, "PB1");
  const p2 = prediction(1180, "PB2");
  const backtest = buildAuroraPricedBeliefBacktest({
    records: [
      {
        id: "pb1",
        prediction: p1,
        actuals: actualsAroundImplied(p1, {
          growth: p1.beliefObject.marketImpliedBeliefs.revenueCagr5y.mean + 0.05,
          margin: p1.beliefObject.marketImpliedBeliefs.terminalMargin.mean + 0.03,
          roic: p1.beliefObject.marketImpliedBeliefs.roicPath.mean + 0.04,
          fcfMargin: p1.beliefObject.marketImpliedBeliefs.fcfMargin.mean + 0.02,
          dilution: p1.beliefObject.marketImpliedBeliefs.dilution.mean - 0.005,
          realizedReturn: 0.12,
        }),
      },
      {
        id: "pb2",
        prediction: p2,
        actuals: actualsAroundImplied(p2, {
          growth: p2.beliefObject.marketImpliedBeliefs.revenueCagr5y.mean - 0.03,
          margin: p2.beliefObject.marketImpliedBeliefs.terminalMargin.mean - 0.02,
          roic: p2.beliefObject.marketImpliedBeliefs.roicPath.mean - 0.025,
          fcfMargin: p2.beliefObject.marketImpliedBeliefs.fcfMargin.mean - 0.015,
          dilution: p2.beliefObject.marketImpliedBeliefs.dilution.mean + 0.005,
          realizedReturn: -0.09,
        }),
      },
    ],
  });

  assert.equal(backtest.version, "aurora_priced_belief_backtest_v1");
  assert.equal(backtest.count, 2);
  assert.ok(Number.isFinite(backtest.summary.expectationViolation.composite.directionAccuracy));
  assert.ok(Number.isFinite(backtest.summary.expectationViolation.componentSummary.growth.meanViolation));
  assert.ok(backtest.rows[0].expectationViolation.components.length >= 5);
});

test("priced-belief backtest grades memo truth and value-driver hits", () => {
  const pred = prediction(1000, "PB3");
  const topDriver = pred.beliefObject.assumptionBurdenOfProof.components[0]?.key || "growth";
  const implied = pred.beliefObject.marketImpliedBeliefs;
  const actuals = actualsAroundImplied(pred, {
    growth: implied.revenueCagr5y.mean + (topDriver === "growth" ? 0.09 : 0.02),
    margin: implied.terminalMargin.mean + (topDriver === "margin" ? 0.09 : 0.02),
    roic: implied.roicPath.mean + (topDriver === "roic" ? 0.09 : 0.02),
    fcfMargin: implied.fcfMargin.mean + (topDriver === "fcfMargin" ? 0.09 : 0.02),
    dilution: implied.dilution.mean - (topDriver === "dilution" ? 0.03 : 0.005),
  });
  const backtest = buildAuroraPricedBeliefBacktest({ records: [{ id: "pb3", prediction: pred, actuals }] });

  assert.equal(backtest.rows[0].memoTruth.primaryValueDriverPredicted, topDriver);
  assert.equal(backtest.rows[0].memoTruth.primaryValueDriverHit, true);
  assert.ok(Number.isFinite(backtest.summary.memoTruth.primaryValueDriverHitRate));
});

test("priced-belief backtest classifies multiple/timing errors when business beats price but return disappoints", () => {
  const pred = prediction(1020, "PB4");
  const implied = pred.beliefObject.marketImpliedBeliefs;
  const backtest = buildAuroraPricedBeliefBacktest({
    records: [
      {
        id: "pb4",
        prediction: pred,
        actuals: actualsAroundImplied(pred, {
          growth: implied.revenueCagr5y.mean + 0.06,
          margin: implied.terminalMargin.mean + 0.05,
          roic: implied.roicPath.mean + 0.05,
          fcfMargin: implied.fcfMargin.mean + 0.04,
          dilution: implied.dilution.mean - 0.01,
          realizedReturn: -0.12,
        }),
      },
    ],
  });

  assert.equal(backtest.rows[0].errorGenome.primary, "multiple_or_timing_error");
  assert.ok(backtest.summary.errorGenome.primaryCounts.multiple_or_timing_error >= 1);
});
