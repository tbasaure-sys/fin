import assert from "node:assert/strict";
import test from "node:test";

import { composeBreakpointRun, isSupportedBreakpointHurdle } from "../lib/breakpoint/compose.js";
import { runAuroraBeliefPipeline } from "../lib/aurora-belief-pipeline.js";

const input = {
  company: { ticker: "ASML", name: "ASML Holding NV", sector: "Technology", industry: "Semiconductor equipment" },
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
  documents: [{ type: "earnings call", source: "company transcript", text: "Backlog supports demand visibility. Capacity remains constrained and pricing power is strong." }],
  observations: { asOfDate: "2026-03-01", metrics: { revenue_growth: 0.23, operating_margin: 0.39, roic: 0.33, reinvestment_rate: 0.16 } },
};

function pipeline() {
  return runAuroraBeliefPipeline(input, {
    asOfDate: "2026-01-01",
    ranAt: "2026-03-01T00:00:00.000Z",
    builtAt: "2026-03-01T00:00:00.000Z",
  });
}

test("Breakpoint composes an auditable public result from AURORA", () => {
  const result = composeBreakpointRun({
    pipeline: pipeline(),
    snapshot: { asOf: "2026-03-01T00:00:00.000Z", company: { ticker: "ASML", entityName: "ASML Holding NV" }, coverage: { secCompanyFacts: true }, sources: [{ label: "SEC company facts", date: "2026-02-01" }] },
    hurdleRate: 0.1,
    locale: "en",
    now: "2026-03-01T12:00:00.000Z",
  });

  assert.equal(result.version, "bls_breakpoint_run_v1");
  assert.equal(result.status, "ready");
  assert.equal(result.ticker, "ASML");
  assert.equal(result.hurdle.rate, 0.1);
  assert.ok(result.market.anchor);
  assert.ok(result.market.family);
  assert.ok(result.breakpoint.bull);
  assert.ok(result.breakpoint.bear);
  assert.ok(result.monitor.primaryDriver);
  assert.ok(result.provenance.sources.length);
  assert.ok(result.limitations.some((item) => /not investment advice/i.test(item)));
  assert.equal("confidenceScore" in result, false);
});

test("Breakpoint only accepts bounded institutional hurdles", () => {
  assert.equal(isSupportedBreakpointHurdle(0.08), true);
  assert.equal(isSupportedBreakpointHurdle(0.1), true);
  assert.equal(isSupportedBreakpointHurdle(0.12), true);
  assert.equal(isSupportedBreakpointHurdle(0.09), false);
  assert.throws(() => composeBreakpointRun({ pipeline: pipeline(), hurdleRate: 0.09 }), /8%, 10%, or 12%/i);
});

test("Breakpoint returns an honest attention state for missing engine coverage", () => {
  const result = composeBreakpointRun({ pipeline: {}, hurdleRate: 0.1 });
  assert.equal(result.status, "needs_attention");
  assert.ok(result.limitations.some((item) => /insufficient/i.test(item)));
});

test("Spanish Breakpoint presentation never leaks AURORA's English engine prose", () => {
  const result = composeBreakpointRun({ pipeline: pipeline(), hurdleRate: 0.1, locale: "es" });
  assert.match(result.market.family.narrative, /mercado/i);
  assert.doesNotMatch(result.market.family.narrative, /The market/i);
  assert.match(result.breakpoint.bull.statement, /margen EBIT|CAGR de ingresos/i);
  assert.match(result.limitations[0], /superficie/i);
});
