import assert from "node:assert/strict";
import test from "node:test";

import { buildIndicativeValuation } from "../lib/aurora/indicative-valuation.js";
import { buildCompanyDecisionView } from "../lib/company-decision-view.js";

const NOW = Date.parse("2026-07-28T12:00:00.000Z");

function blockedResearch(overrides = {}) {
  return {
    ticker: "EDGE",
    company_profile: {
      name: "Edge Systems",
      exchange: "NASDAQ",
      currency: "USD",
      sector: "Technology",
      industry: "Software",
      market_cap: 200_000_000,
    },
    financials: {
      annual: [],
      ratios: {},
    },
    valuation: {
      available: false,
      status: "not_decision_ready",
      currency: "USD",
      current_price: 20,
      market_data_as_of: "2026-07-28",
      price_validation: {
        status: "provider_reconciled",
        research_usable: true,
        usable_for_context: true,
        source: "Yahoo Finance chart",
      },
      reliability: {
        usable: false,
        status: "blocked",
        score: 0.2,
        reasons: ["The institutional model is incomplete."],
      },
    },
    sources: {
      coverage: {
        status: "partial",
        score: 40,
        expected_metrics: 5,
        covered_expected_metrics: 2,
        missing_expected_metrics: ["free_cash_flow", "net_debt", "valuation_range_central"],
        sourced_points_missing_ok_source: [],
        calculated_points_missing_formula: [],
      },
      records: [{ provider: "Yahoo Finance", status: "ok", label: "Market chart" }],
      data_points: [],
    },
    audit: { status: "review", findings: [] },
    ...overrides,
  };
}

test("a conditional AURORA range becomes the approximate range instead of disappearing behind the institutional gate", () => {
  const research = blockedResearch({
    aurora: {
      version: "aurora_decision_system_v1",
      valuation: {
        version: "aurora_conditional_valuation_v1",
        status: "conditional_range",
        currency: "USD",
        method: "owner_earnings_dcf",
        range: { low: 11, central: 17, high: 26 },
        assumptions: [
          { key: "free_cash_flow", label: "Flujo de caja base", value: 18_000_000, provenance: "observed" },
          { key: "growth", label: "Crecimiento central", value: 0.05, provenance: "inferred" },
        ],
        summary: "Rango condicional con supuestos visibles.",
      },
    },
  });

  const view = buildCompanyDecisionView(research, { now: NOW });

  assert.deepEqual(view.valuation.range, { low: 11, central: 17, high: 26 });
  assert.equal(view.valuation.publishable, true);
  assert.equal(view.valuation.kind, "approximate");
  assert.equal(view.analysis.label, "Rango aproximado");
  assert.equal(view.valuation.confidence.label, "Media");
  assert.equal(view.scenarios.length, 3);
});

test("the explanation layer preserves a canonical decision-ready range instead of recomputing it", () => {
  const research = blockedResearch({
    valuation: {
      available: true,
      status: "decision_ready",
      currency: "USD",
      current_price: 20,
      market_data_as_of: "2026-07-28",
      primary_method: "institutional_fcff_dcf",
      range: { low: 28, central: 34, high: 41 },
      reliability: { usable: true, status: "high", score: 0.86, reasons: [] },
      price_validation: { status: "validated", usable: true, source: "Reconciled close" },
    },
  });

  const valuation = buildIndicativeValuation(research);

  assert.deepEqual(valuation.range, { low: 28, central: 34, high: 41 });
  assert.equal(valuation.basis, "institutional_model");
  assert.equal(valuation.method, "institutional_fcff_dcf");
});

test("a revenue-stage company with negative cash flow still receives a financially anchored range", () => {
  const research = blockedResearch({
    financials: {
      annual: [{ fiscal_year: 2025, revenue: 100_000_000, net_income: -12_000_000 }],
      ratios: {
        latest_revenue: 100_000_000,
        latest_fcf: -15_000_000,
        latest_cash: 10_000_000,
        latest_debt: 20_000_000,
      },
    },
  });

  const view = buildCompanyDecisionView(research, { now: NOW });

  assert.equal(view.valuation.publishable, true);
  assert.equal(view.valuation.kind, "approximate");
  assert.match(view.valuation.method, /ingresos|ventas/i);
  assert.ok(view.valuation.range.low > 0);
  assert.ok(view.valuation.range.low < view.valuation.range.central);
  assert.ok(view.valuation.range.central < view.valuation.range.high);
  assert.ok(view.valuation.drivers.some((driver) => /ingresos/i.test(driver.label)));
  assert.equal(view.scenarios.length, 3);
  assert.doesNotMatch(JSON.stringify(view), /faltan datos/i);
});

test("a bank uses book value and earnings rather than a generic software multiple", () => {
  const research = blockedResearch({
    ticker: "BANK",
    company_profile: {
      name: "Regional Bank",
      exchange: "NYSE",
      currency: "USD",
      sector: "Financial Services",
      industry: "Banks - Regional",
      market_cap: 2_500_000_000,
    },
    financials: {
      annual: [{ fiscal_year: 2025, net_income: 300_000_000, total_equity: 3_000_000_000 }],
      ratios: {
        latest_net_income: 300_000_000,
        latest_total_equity: 3_000_000_000,
      },
    },
    valuation: {
      ...blockedResearch().valuation,
      current_price: 25,
    },
  });

  const view = buildCompanyDecisionView(research, { now: NOW });

  assert.equal(view.valuation.publishable, true);
  assert.match(view.valuation.method, /valor contable|ingresos residuales/i);
  assert.ok(view.valuation.drivers.some((driver) => /patrimonio|valor contable/i.test(driver.label)));
  assert.ok(view.valuation.range.high > view.valuation.range.low);
});

test("a price-only pre-revenue equity receives a wide low-confidence range with explicit market anchoring", () => {
  const research = blockedResearch({
    ticker: "BIOX",
    company_profile: {
      name: "Bio X",
      exchange: "NASDAQ",
      currency: "USD",
      sector: "Healthcare",
      industry: "Biotechnology",
      market_cap: 50_000_000,
    },
    valuation: {
      ...blockedResearch().valuation,
      current_price: 5,
    },
    financials: {
      annual: [{ fiscal_year: 2025, revenue: 1_000_000, free_cash_flow: -40_000_000 }],
      ratios: { latest_revenue: 1_000_000, latest_fcf: -40_000_000, latest_diluted_shares: 10_000_000 },
    },
  });

  const view = buildCompanyDecisionView(research, { now: NOW });

  assert.equal(view.valuation.publishable, true);
  assert.equal(view.valuation.confidence.label, "Baja");
  assert.equal(view.valuation.basis, "market_sector_prior");
  assert.ok(view.valuation.range.low < 5);
  assert.ok(view.valuation.range.high > 5);
  assert.equal(view.valuation.range.high, 12.5);
  assert.match(view.valuation.reason, /precio|sectorial/i);
  assert.doesNotMatch(JSON.stringify(view), /faltan datos|no se publica un rango/i);
});
