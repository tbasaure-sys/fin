import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraCapitalAllocationEngine } from "../lib/aurora-capital-allocation-engine.js";
import { runAuroraBeliefPipeline } from "../lib/aurora-belief-pipeline.js";

const context = {
  market: { price: 100, beta: 1 },
  macro: { riskFreeRate: 0.04, equityRiskPremium: 0.05 },
  valuationEnsemble: { summary: { weightedFairValue: 145 } },
  compiled: { drivers: { wacc: 0.09, roic: 0.22, price: 100 } },
};

const pipelineInput = {
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
      text: "Management described backlog, capacity constraint, pricing power and strong capital discipline.",
    },
  ],
};

test("capital allocation engine remains pending without allocation history", () => {
  const result = buildAuroraCapitalAllocationEngine(context);

  assert.equal(result.version, "aurora_capital_allocation_engine_v1");
  assert.equal(result.decision, "capital_allocation_pending");
  assert.equal(result.summary.totalCapitalAllocated, 0);
  assert.equal(result.memo.topIssue, "No capital allocation history supplied.");
});

test("capital allocation engine rewards repurchases below intrinsic value", () => {
  const result = buildAuroraCapitalAllocationEngine({
    ...context,
    capitalAllocationEvents: [
      {
        type: "repurchase",
        amount: 1000,
        averagePrice: 100,
        intrinsicValuePerShare: 145,
        sharesRepurchased: 10,
        sbcOffsetShares: 1,
      },
    ],
  });

  const event = result.events[0];
  assert.equal(event.verdict, "value_creating_repurchase");
  assert.ok(event.metrics.repurchaseReturn > 0.4);
  assert.ok(event.metrics.sbcOffsetShare < 0.2);
  assert.ok(result.summary.buybackDiscipline > 0.6);
  assert.ok(result.summary.capitalAllocationAlpha > 0.2);
});

test("capital allocation engine measures acquisition ROIC against total economic purchase price", () => {
  const result = buildAuroraCapitalAllocationEngine({
    ...context,
    capitalAllocationEvents: [
      {
        type: "acquisition",
        purchasePrice: 900,
        assumedDebt: 100,
        stockIssuedValue: 100,
        earnouts: 50,
        integrationCosts: 50,
        additionalInvestment: 100,
        incrementalNopat: 170,
      },
    ],
  });

  const event = result.events[0];
  assert.equal(event.metrics.totalEconomicPurchasePrice, 1300);
  assert.ok(event.metrics.acquisitionRoic > 0.12);
  assert.ok(event.metrics.spreadToWacc > 0.03);
  assert.equal(event.verdict, "acquisition_creates_value");
});

test("capital allocation engine penalizes above-value buybacks used mostly to offset SBC", () => {
  const result = buildAuroraCapitalAllocationEngine({
    ...context,
    capitalAllocationEvents: [
      {
        type: "repurchase",
        amount: 1000,
        averagePrice: 180,
        intrinsicValuePerShare: 110,
        sharesRepurchased: 5.56,
        sbcOffsetShares: 4,
        leverageBefore: 1.1,
        leverageAfter: 2.2,
      },
      {
        type: "unproductive_investment",
        amount: 600,
      },
    ],
  });

  assert.equal(result.decision, "capital_allocation_destructive");
  assert.ok(result.summary.capitalAllocationAlpha < -0.2);
  assert.ok(result.summary.flags.includes("bought_above_intrinsic_value"));
  assert.ok(result.summary.flags.includes("large_sbc_offset"));
});

test("belief pipeline includes capital allocation and escalates destructive histories", () => {
  const result = runAuroraBeliefPipeline({
    ...pipelineInput,
    capitalAllocationEvents: [
      {
        type: "repurchase",
        amount: 900,
        averagePrice: 1800,
        intrinsicValuePerShare: 900,
        sharesRepurchased: 0.5,
        sbcOffsetShares: 0.45,
      },
      { type: "unproductive_investment", amount: 500 },
    ],
  });

  assert.equal(result.capitalAllocation.version, "aurora_capital_allocation_engine_v1");
  assert.equal(result.capitalAllocation.decision, "capital_allocation_destructive");
  assert.equal(result.decision.state, "capital_allocation_review");
  assert.ok(result.memo.bullets.some((line) => /Capital allocation:/.test(line)));
});
