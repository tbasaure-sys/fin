import assert from "node:assert/strict";
import test from "node:test";

import { compileAuroraBeliefDrivers, compileAuroraBeliefObject, compileAuroraBeliefPanel } from "../lib/aurora-belief-compiler.js";

const asmlSnapshot = {
  company: {
    ticker: "ASML",
    name: "ASML Holding NV",
    sector: "Technology",
    industry: "Semiconductor equipment",
  },
  market: {
    price: 800,
    beta: 1.12,
  },
  macro: {
    riskFreeRate: 0.044,
    equityRiskPremium: 0.052,
    inflation: 0.024,
  },
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
  evidence: {
    textSignals: {
      pricingPower: 0.82,
      demandVisibility: 0.78,
      capacityConstraint: 0.86,
      accountingTrust: 0.76,
    },
    claims: [{ type: "capacity constraint", score: 0.9 }],
  },
};

test("belief compiler normalizes raw snapshot into audited drivers", () => {
  const compiled = compileAuroraBeliefDrivers(asmlSnapshot, { asOfDate: "2026-06-29" });

  assert.equal(compiled.version, "aurora_belief_driver_compiler_v1");
  assert.equal(compiled.ticker, "ASML");
  assert.equal(compiled.drivers.name, "ASML Holding NV");
  assert.ok(compiled.drivers.revenueCagr > 0.15);
  assert.ok(compiled.drivers.margin > 0.25);
  assert.ok(compiled.drivers.roic > 0.2);
  assert.ok(compiled.drivers.baseFcf === 28);
  assert.ok(compiled.drivers.wacc > 0.08);
  assert.ok(compiled.evidenceSignals.bottleneckPower > 0.75);
  assert.ok(compiled.quality.score > 0.75);
  assert.equal(compiled.quality.level, "decision_grade");
});

test("belief compiler produces priced belief object and compiler memo", () => {
  const compiled = compileAuroraBeliefObject(asmlSnapshot, { asOfDate: "2026-06-29", compiledAt: "2026-06-29T00:00:00.000Z" });

  assert.equal(compiled.version, "aurora_belief_compiler_v1");
  assert.equal(compiled.beliefObject.version, "aurora_priced_belief_object_v1");
  assert.equal(compiled.compilerMemo.dataReadiness, "decision_grade");
  assert.ok(compiled.compilerMemo.topFalsifier);
  assert.ok(compiled.beliefObject.lensLegitimacy.some((lens) => lens.key === "bottleneck" && lens.legitimacy > 0.5));
});

test("manual drivers override noisy raw values without hiding lineage", () => {
  const compiled = compileAuroraBeliefDrivers({
    ...asmlSnapshot,
    drivers: {
      revenueCagr: 0.08,
      roic: 0.18,
    },
  });

  assert.equal(compiled.drivers.revenueCagr, 0.08);
  assert.equal(compiled.drivers.roic, 0.18);
  assert.equal(compiled.sourceLineage.revenueCagr.override, true);
  assert.equal(compiled.sourceLineage.revenueCagr.rawSource, "income statement history CAGR");
});

test("sparse snapshots compile but are marked memo-only or insufficient", () => {
  const compiled = compileAuroraBeliefObject({
    company: { ticker: "THIN", sector: "Unknown" },
    market: { price: 42 },
  });

  assert.ok(["memo_only", "insufficient"].includes(compiled.driverQuality.level));
  assert.ok(compiled.compilerMemo.missingCriticalDrivers.includes("revenue"));
  assert.equal(compiled.beliefObject.abstain, true);
});

test("belief panel summarizes abstention and readiness across companies", () => {
  const panel = compileAuroraBeliefPanel([
    asmlSnapshot,
    {
      company: { ticker: "THIN", sector: "Unknown" },
      market: { price: 42 },
    },
  ]);

  assert.equal(panel.version, "aurora_belief_panel_v1");
  assert.equal(panel.count, 2);
  assert.ok(panel.abstentionShare > 0);
  assert.ok(panel.readinessCounts.decision_grade >= 1);
  assert.equal(panel.objects[0].ticker, "ASML");
});
