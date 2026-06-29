import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraCalibrationEngine } from "../lib/aurora-calibration-engine.js";
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

function centeredActuals(pred, overrides = {}) {
  return {
    growth: pred.forecast.posterior.growth.p50,
    margin: pred.forecast.posterior.margin.p50,
    roic: pred.forecast.posterior.roic.p50,
    reinvestment: pred.forecast.posterior.reinvestment.p50,
    value: pred.valuationEnsemble.summary.weightedFairValue,
    realizedReturn: pred.valuationEnsemble.summary.expectedReturn,
    ...overrides,
  };
}

test("calibration engine marks a single live prediction as pending outcome", () => {
  const result = buildAuroraCalibrationEngine(prediction());

  assert.equal(result.version, "aurora_calibration_engine_v1");
  assert.equal(result.decision, "calibration_pending");
  assert.equal(result.summary.scoredRecords, 0);
  assert.equal(result.records[0].status, "pending_outcome");
});

test("calibration engine scores continuous forecast coverage and probabilistic investment events", () => {
  const p1 = prediction(1000, "A1");
  const p2 = prediction(1300, "A2");
  const result = buildAuroraCalibrationEngine({
    records: [
      { id: "a1", prediction: p1, actuals: centeredActuals(p1) },
      {
        id: "a2",
        prediction: p2,
        actuals: centeredActuals(p2, {
          growth: p2.forecast.posterior.growth.p90,
          margin: p2.forecast.posterior.margin.p10,
          realizedReturn: -0.08,
          permanentLoss: false,
        }),
      },
    ],
    experimentLog: { experimentCount: 2 },
  });

  assert.equal(result.summary.scoredRecords, 2);
  assert.ok(Number.isFinite(result.summary.continuous.growth.meanAbsoluteError));
  assert.ok(Number.isFinite(result.summary.continuous.margin.coverage80));
  assert.ok(Number.isFinite(result.summary.investment.meanBrier));
  assert.ok(["calibration_usable", "calibration_watch", "calibration_failing"].includes(result.decision));
  assert.equal(result.summary.experimentRisk.level, "low_recorded_experiment_pressure");
});

test("calibration engine fails badly miscalibrated histories", () => {
  const p1 = prediction(900, "B1");
  const p2 = prediction(950, "B2");
  const farMiss = (pred) => ({
    growth: pred.forecast.posterior.growth.p90 + 0.45,
    margin: pred.forecast.posterior.margin.p90 + 0.35,
    roic: pred.forecast.posterior.roic.p90 + 0.4,
    reinvestment: pred.forecast.posterior.reinvestment.p90 + 0.4,
    value: pred.valuationEnsemble.summary.weightedFairValue * 0.2,
    realizedReturn: -0.55,
    permanentLoss: true,
  });
  const result = buildAuroraCalibrationEngine({
    records: [
      { id: "b1", prediction: p1, actuals: farMiss(p1) },
      { id: "b2", prediction: p2, actuals: farMiss(p2) },
    ],
    experimentLog: { experimentCount: 20 },
  });

  assert.equal(result.decision, "calibration_failing");
  assert.ok(result.summary.continuous.growth.coverage80 < 0.8);
  assert.equal(result.summary.experimentRisk.level, "high_backtest_overfitting_risk");
});

test("calibration engine builds return buckets for walk-forward diagnostics", () => {
  const records = [800, 1000, 1200, 1500, 1800].map((price, index) => {
    const pred = prediction(price, `D${index}`);
    return {
      id: `d${index}`,
      prediction: pred,
      actuals: centeredActuals(pred, {
        realizedReturn: -0.1 + index * 0.08,
        value: price * (0.9 + index * 0.08),
      }),
    };
  });
  const result = buildAuroraCalibrationEngine({ records });

  assert.ok(result.summary.investment.deciles.length >= 2);
  assert.ok(Number.isFinite(result.summary.investment.monotonicity));
});

