import assert from "node:assert/strict";
import test from "node:test";

import { buildBreakpointInputFromSnapshot, createBreakpointService } from "../lib/server/breakpoint-service.js";

const snapshot = {
  ok: true,
  asOf: "2026-03-01T00:00:00.000Z",
  company: { ticker: "ASML", entityName: "ASML Holding NV", industry: "Semiconductor equipment", filedAt: "2026-02-01" },
  quote: { price: 1200, source: "Yahoo chart price fallback" },
  riskFree: { value: 0.044, source: "U.S. Treasury daily yield curve 10Y", date: "2026-02-28" },
  coverage: { secCompanyFacts: true },
  assumptions: { wacc: { beta: 1.12 } },
  facts: {
    revenueSeries: [
      { end: "2021-12-31", value: 180 }, { end: "2022-12-31", value: 210 }, { end: "2023-12-31", value: 250 }, { end: "2024-12-31", value: 300 },
    ],
    operatingIncome: { value: 93 }, equity: { value: 285 }, liabilities: { value: 18 }, cfo: { value: 36 }, capex: { value: 8 },
  },
  drivers: { revenueCagr: 0.18, margin: 0.31, roic: 0.24, reinvestment: 0.22 },
  catalystEvidence: { items: [{ title: "Capacity remains constrained", source: "company transcript" }] },
};

test("snapshot adapter distinguishes observed records from derived assumptions", () => {
  const input = buildBreakpointInputFromSnapshot(snapshot);
  assert.equal(input.company.ticker, "ASML");
  assert.equal(input.market.price, 1200);
  assert.equal(input.macro.riskFreeRate, 0.044);
  assert.equal(input.financials.incomeStatements.length, 4);
  assert.equal(input.financials.incomeStatements.at(-1).ebit, 93);
  assert.ok(input.documents.length);
});

test("Breakpoint service returns an immutable-ready run for adequate snapshots", async () => {
  const service = createBreakpointService({ snapshotLoader: async () => snapshot, now: () => "2026-03-01T12:00:00.000Z" });
  const result = await service.run({ ticker: "asml", hurdleRate: 0.1 });
  assert.equal(result.status, "ready");
  assert.equal(result.ticker, "ASML");
  assert.equal(result.provenance.asOf, snapshot.asOf);
  assert.ok(result.provenance.sources.some((source) => source.label === "SEC company facts"));
});

test("Breakpoint service returns an attention state rather than inventing sparse coverage", async () => {
  const service = createBreakpointService({ snapshotLoader: async () => ({ ok: true, company: { ticker: "VOID" }, coverage: {} }) });
  const result = await service.run({ ticker: "VOID", hurdleRate: 0.1 });
  assert.equal(result.status, "needs_attention");
  assert.ok(result.limitations.some((item) => /insufficient/i.test(item)));
});
