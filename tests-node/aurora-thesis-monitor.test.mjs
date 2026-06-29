import assert from "node:assert/strict";
import test from "node:test";

import { compileAuroraBeliefObject } from "../lib/aurora-belief-compiler.js";
import { evidenceForBeliefCompiler } from "../lib/aurora-evidence-extractor.js";
import { monitorAuroraThesis, monitorAuroraThesisPanel } from "../lib/aurora-thesis-monitor.js";

const baseSnapshot = {
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
  evidence: evidenceForBeliefCompiler({
    documents: [
      {
        type: "earnings call",
        source: "company transcript",
        text: "Demand visibility is supported by backlog. The company remains capacity constrained and pricing power is strong.",
      },
    ],
  }),
};

function compiledBelief() {
  return compileAuroraBeliefObject(baseSnapshot, { asOfDate: "2026-01-01", compiledAt: "2026-01-01T00:00:00.000Z" });
}

function healthyMetrics() {
  return {
    revenue_growth: 0.23,
    operating_margin: 0.39,
    roic: 0.33,
    reinvestment_rate: 0.16,
  };
}

test("thesis monitor keeps an intact thesis when observations clear thresholds", () => {
  const compiled = compiledBelief();
  const result = monitorAuroraThesis(
    compiled,
    {
      asOfDate: "2026-03-01",
      metrics: healthyMetrics(),
    },
    { monitoredAt: "2026-03-01T00:00:00.000Z" },
  );

  assert.equal(result.version, "aurora_thesis_monitor_v1");
  assert.equal(result.status, "intact");
  assert.equal(result.action, "continue_monitoring");
  assert.equal(result.trippedCount, 0);
});

test("thesis monitor trips when a hard numeric falsifier is breached", () => {
  const compiled = compiledBelief();
  const growthThreshold = compiled.beliefObject.falsifiers.find((item) => item.variable === "revenue_growth").threshold;
  const result = monitorAuroraThesis(compiled, {
    asOfDate: "2026-03-01",
    metrics: {
      ...healthyMetrics(),
      revenue_growth: growthThreshold - 0.03,
    },
  });

  assert.equal(result.status, "tripped");
  assert.ok(result.trippedCount >= 1);
  assert.ok(result.checks.some((check) => check.variable === "revenue_growth" && check.status === "tripped"));
});

test("thesis monitor trips reinvestment burden above max threshold", () => {
  const compiled = compiledBelief();
  const threshold = compiled.beliefObject.falsifiers.find((item) => item.variable === "reinvestment_rate").threshold;
  const result = monitorAuroraThesis(compiled, {
    asOfDate: "2026-03-01",
    metrics: {
      ...healthyMetrics(),
      reinvestment_rate: threshold + 0.08,
    },
  });

  assert.equal(result.status, "tripped");
  assert.ok(result.checks.some((check) => check.variable === "reinvestment_rate" && check.direction === "max" && check.status === "tripped"));
});

test("new adverse evidence moves an otherwise passing thesis to deteriorating", () => {
  const compiled = compiledBelief();
  const result = monitorAuroraThesis(compiled, {
    asOfDate: "2026-03-01",
    metrics: healthyMetrics(),
    evidence: {
      textSignals: {
        marginPressure: 0.68,
        pricingPower: 0.31,
      },
    },
  });

  assert.equal(result.status, "deteriorating");
  assert.ok(result.evidenceChecks.some((check) => check.key === "evidence_margin_pressure"));
});

test("stale thesis requires refresh even without hard trips", () => {
  const compiled = compiledBelief();
  const result = monitorAuroraThesis(compiled, {
    asOfDate: "2027-03-01",
    metrics: healthyMetrics(),
  });

  assert.equal(result.status, "stale");
  assert.equal(result.action, "refresh_belief_object");
});

test("monitor panel summarizes tripped share", () => {
  const compiled = compiledBelief();
  const threshold = compiled.beliefObject.falsifiers.find((item) => item.variable === "revenue_growth").threshold;
  const panel = monitorAuroraThesisPanel([
    {
      compiled,
      observations: {
        metrics: healthyMetrics(),
      },
    },
    {
      compiled,
      observations: {
        metrics: { ...healthyMetrics(), revenue_growth: threshold - 0.03 },
      },
    },
  ]);

  assert.equal(panel.version, "aurora_thesis_monitor_panel_v1");
  assert.equal(panel.count, 2);
  assert.equal(panel.counts.tripped, 1);
  assert.equal(panel.trippedShare, 0.5);
});
