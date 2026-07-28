import assert from "node:assert/strict";
import test from "node:test";

import { buildCompanyDecisionView } from "../lib/company-decision-view.js";
import * as equityResearch from "../lib/server/equity-research.js";

test("the public research resolver falls back to a live equity quote when the canonical backend is unavailable", async () => {
  assert.equal(typeof equityResearch.resolvePublicEquityResearchPayload, "function");

  const resolved = await equityResearch.resolvePublicEquityResearchPayload("BIOX", {
    backendLoader: async () => {
      throw new Error("backend unavailable");
    },
    marketLoader: async () => ({
      ticker: "BIOX",
      price: 5,
      marketCap: 50_000_000,
      marketDate: "2026-07-28",
      currency: "USD",
      exchange: "NASDAQ",
      instrumentType: "EQUITY",
      source: "Yahoo Finance chart",
    }),
  });

  assert.equal(resolved.source, "market_fallback");
  assert.equal(resolved.payload.ok, true);
  assert.equal(resolved.payload.ticker, "BIOX");
  assert.equal(resolved.payload.valuation.current_price, 5);
  assert.equal(resolved.payload.company_profile.market_cap, 50_000_000);

  const view = buildCompanyDecisionView(resolved.payload, { now: Date.parse("2026-07-28T12:00:00Z") });
  assert.equal(view.valuation.publishable, true);
  assert.ok(view.valuation.range.low < 5);
  assert.ok(view.valuation.range.high > 5);
  assert.doesNotMatch(JSON.stringify(view), /faltan datos/i);
});

test("the public research resolver rejects ETFs instead of presenting them as stocks", async () => {
  assert.equal(typeof equityResearch.resolvePublicEquityResearchPayload, "function");

  await assert.rejects(
    () => equityResearch.resolvePublicEquityResearchPayload("SPY", {
      backendLoader: async () => ({ ok: false }),
      marketLoader: async () => ({
        ticker: "SPY",
        price: 650,
        marketDate: "2026-07-28",
        currency: "USD",
        instrumentType: "ETF",
      }),
    }),
    /acci[oó]n o ADR/i,
  );
});

test("the market fallback carries provider fundamentals into a bank-specific valuation", async () => {
  const resolved = await equityResearch.resolvePublicEquityResearchPayload("JPM", {
    backendLoader: async () => { throw new Error("backend unavailable"); },
    marketLoader: async () => ({
      ticker: "JPM",
      name: "JPMorgan Chase & Co.",
      price: 356,
      marketCap: 980_000_000_000,
      marketDate: "2026-07-28",
      currency: "USD",
      exchange: "NYSE",
      sector: "Financial Services",
      industry: "Banks - Diversified",
      instrumentType: "EQUITY",
      source: "Financial Modeling Prep quote",
      fundamentals: {
        revenue: 180_000_000_000,
        netIncome: 58_000_000_000,
        totalEquity: 360_000_000_000,
        freeCashFlow: null,
        cash: 25_000_000_000,
        debt: 410_000_000_000,
        dilutedShares: 2_750_000_000,
        fiscalYear: 2025,
      },
    }),
  });

  const view = buildCompanyDecisionView(resolved.payload, { now: Date.parse("2026-07-28T12:00:00Z") });

  assert.equal(resolved.payload.company_profile.sector, "Financial Services");
  assert.equal(resolved.payload.financials.ratios.latest_total_equity, 360_000_000_000);
  assert.match(view.valuation.method, /valor contable|ingresos residuales/i);
  assert.notEqual(view.valuation.range.central, 356);
});
