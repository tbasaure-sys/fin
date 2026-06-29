import assert from "node:assert/strict";
import test from "node:test";

import { compileAuroraBeliefObject } from "../lib/aurora-belief-compiler.js";
import { buildAuroraDriverGraph, buildAuroraDriverGraphPanel } from "../lib/aurora-driver-graph.js";
import { evidenceForBeliefCompiler } from "../lib/aurora-evidence-extractor.js";

const coherentSnapshot = {
  company: {
    ticker: "ASML",
    name: "ASML Holding NV",
    sector: "Technology",
    industry: "Semiconductor equipment",
  },
  market: { price: 900, beta: 1.12 },
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
  drivers: {
    revenueCagr: 0.14,
    reinvestment: 0.28,
  },
};

test("driver graph builds causal nodes, edges, derived metrics, and qualitative map", () => {
  const compiled = compileAuroraBeliefObject(coherentSnapshot);
  const graph = buildAuroraDriverGraph(compiled, { builtAt: "2026-06-29T00:00:00.000Z" });

  assert.equal(graph.version, "aurora_driver_graph_v1");
  assert.equal(graph.builtAt, "2026-06-29T00:00:00.000Z");
  assert.ok(graph.nodes.some((node) => node.id === "roiic"));
  assert.ok(graph.edges.some((edge) => edge.equation.includes("reinvestment_rate * ROIIC")));
  assert.ok(Number.isFinite(graph.derived.impliedROIIC));
  assert.ok(Number.isFinite(graph.derived.moatHalfLifeYears));
  assert.ok(graph.qualitativeDriverMap.some((item) => item.concept === "Moat"));
  assert.notEqual(graph.graphHealth.level, "incoherent");
});

test("driver graph flags high growth with near-zero reinvestment", () => {
  const compiled = compileAuroraBeliefObject({
    ...coherentSnapshot,
    drivers: {
      revenueCagr: 0.18,
      reinvestment: 0.01,
      roic: 0.25,
      wacc: 0.09,
    },
  });
  const graph = buildAuroraDriverGraph(compiled);

  assert.ok(graph.constraintViolations.some((item) => item.key === "growth_without_reinvestment"));
  assert.ok(graph.constraintViolations.some((item) => item.key === "heroic_roiic"));
});

test("driver graph flags growth below cost of capital", () => {
  const compiled = compileAuroraBeliefObject({
    ...coherentSnapshot,
    drivers: {
      revenueCagr: 0.12,
      reinvestment: 0.24,
      roic: 0.06,
      wacc: 0.1,
    },
  });
  const graph = buildAuroraDriverGraph(compiled);

  assert.ok(graph.constraintViolations.some((item) => item.key === "growth_below_cost_of_capital"));
});

test("driver graph flags bottleneck claims without supporting evidence", () => {
  const compiled = compileAuroraBeliefObject({
    ...coherentSnapshot,
    evidence: {
      textSignals: {
        pricingPower: 0.3,
        demandVisibility: 0.32,
        capacityConstraint: 0.34,
      },
    },
    drivers: {
      revenueCagr: 0.1,
      reinvestment: 0.25,
      bottleneckPower: 0.9,
    },
  });
  const graph = buildAuroraDriverGraph(compiled);

  assert.ok(graph.constraintViolations.some((item) => item.key === "bottleneck_without_evidence"));
});

test("driver graph panel summarizes graph health", () => {
  const coherent = compileAuroraBeliefObject(coherentSnapshot);
  const incoherent = compileAuroraBeliefObject({
    ...coherentSnapshot,
    drivers: {
      revenueCagr: 0.18,
      reinvestment: 0.01,
      roic: 0.06,
      wacc: 0.1,
    },
  });
  const panel = buildAuroraDriverGraphPanel([coherent, incoherent]);

  assert.equal(panel.version, "aurora_driver_graph_panel_v1");
  assert.equal(panel.count, 2);
  assert.ok(panel.averageHealth < 1);
});
