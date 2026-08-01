import assert from "node:assert/strict";
import test from "node:test";

import { buildIndicativeValuation } from "../lib/aurora/indicative-valuation.js";
import { buildCompanyDecisionView } from "../lib/company-decision-view.js";
import { buildCompanyFingerprint } from "../lib/aurora/company-fingerprint.js";
import { buildConditionalValuation } from "../lib/aurora/conditional-valuation.js";

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

test("a legacy conditional range without full source and date evidence is degraded to market-implied", () => {
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

  assert.equal(view.valuation.range, null);
  assert.equal(view.valuation.publishable, false);
  assert.equal(view.valuation.kind, "market_implied");
  assert.equal(view.analysis.state, "market_implied");
  assert.equal(view.analysis.label, "Precio de mercado");
  assert.equal(view.valuation.confidence.label, "Baja");
  assert.equal(view.scenarios.length, 0);
  assert.ok(view.closurePlan.length > 0);
});

test("the explanation layer preserves a canonical decision-ready range instead of recomputing it", () => {
  const research = blockedResearch({
    valuation: {
      available: true,
      model_version: "institutional_valuation_v3",
      status: "decision_ready",
      currency: "USD",
      current_price: 20,
      market_data_as_of: "2026-07-28",
      primary_method: "forward_fcff_dcf",
      range: { low: 28, central: 34, high: 41 },
      reliability: { usable: true, status: "high", score: 0.86, reasons: [] },
      price_validation: { status: "validated", usable: true, source: "Reconciled close" },
    },
    sources: {
      coverage: { status: "complete", score: 100, expected_metrics: 1, covered_expected_metrics: 1, missing_expected_metrics: [], sourced_points_missing_ok_source: [], calculated_points_missing_formula: [] },
      records: [{ provider: "SEC", status: "ok", label: "10-K" }],
      data_points: [],
    },
    audit: { status: "pass", findings: [] },
  });

  const valuation = buildIndicativeValuation(research);

  assert.deepEqual(valuation.range, { low: 28, central: 34, high: 41 });
  assert.equal(valuation.basis, "institutional_model");
  assert.equal(valuation.method, "forward_fcff_dcf");
});

test("a bank without observed book and residual-income inputs is not given a generic cash-flow valuation", () => {
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
      annual: [],
      ratios: { latest_fcf: 300_000_000 },
    },
    valuation: {
      ...blockedResearch().valuation,
      current_price: 25,
    },
  });

  const view = buildCompanyDecisionView(research, { now: NOW });

  assert.equal(view.analysis.state, "market_implied");
  assert.equal(view.valuation.publishable, false);
  assert.equal(view.valuation.range, null);
  assert.equal(view.market.price, 25);
  assert.ok(view.closurePlan.some((item) => /patrimonio|roe|valor contable/i.test(`${item.control} ${item.nextAction}`)));
});

test("a price-only biotech is market-implied with an observable closure plan, never a fair-value range", () => {
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
    financials: { annual: [], ratios: {} },
  });

  const view = buildCompanyDecisionView(research, { now: NOW });

  assert.equal(view.analysis.state, "market_implied");
  assert.equal(view.valuation.publishable, false);
  assert.equal(view.valuation.range, null);
  assert.equal(view.market.price, 5);
  assert.match(view.analysis.reason, /mercado|cotizaci\u00f3n/i);
  assert.ok(view.closurePlan.some((item) => /hito|pipeline|probabilidad/i.test(`${item.control} ${item.nextAction}`)));
  assert.doesNotMatch(JSON.stringify(view), /faltan datos/i);
});

test("missing revenue is unknown rather than pre-revenue", () => {
  const fingerprint = buildCompanyFingerprint({
    profile: { sector: "Healthcare", industry: "Biotechnology" },
    financials: { freeCashFlow: -8 },
  });

  assert.equal(fingerprint.stage, "unknown");
  assert.notEqual(fingerprint.primaryArchetype, "biotech_pre_revenue");
});

function observed(value, asOf = "2026-01-31", provenance = "observed") {
  return { value, provenance, source: "10-K", asOf };
}

function scenario(low, high) {
  return {
    low: { ...low, provenance: "inferred", source: "documented scenario", asOf: "2026-01-31" },
    high: { ...high, provenance: "inferred", source: "documented scenario", asOf: "2026-01-31" },
  };
}

test("a raw decision-ready label without the institutional gate is degraded instead of republished", () => {
  const valuation = buildIndicativeValuation(blockedResearch({
    valuation: {
      available: true,
      status: "decision_ready",
      currency: "USD",
      current_price: 20,
      market_data_as_of: "2026-01-31",
      primary_method: "institutional_fcff_dcf",
      range: { low: 28, central: 34, high: 41 },
      reliability: { usable: true, status: "high", score: 0.9 },
      price_validation: { source: "reconciled close" },
    },
  }));

  assert.equal(valuation.status, "market_implied");
  assert.equal(valuation.range, null);
  assert.equal(valuation.currentPrice, 20);
});

test("bank research needs explicit residual-income assumptions and traced inputs", () => {
  const fingerprint = buildCompanyFingerprint({
    profile: { sector: "Financial Services", industry: "Banks - Regional" },
    financials: { revenue: 100, freeCashFlow: 20 },
    history: { profitableYears: 4, revenueYears: 4 },
  });
  const withoutAssumptions = buildConditionalValuation({
    fingerprint,
    profile: { currency: "USD", marketCap: 500 },
    financials: { equity: observed(400), netIncome: observed(40), dilutedShares: observed(10) },
    market: { currentPrice: 50, asOf: "2026-01-31", sourceIds: ["close"] },
  });
  const withAssumptions = buildConditionalValuation({
    fingerprint,
    profile: { currency: "USD", marketCap: 500 },
    financials: {
      equity: observed(400), netIncome: observed(40), dilutedShares: observed(10),
      assumptionSets: { residual_income: scenario({ costOfEquity: 0.12, terminalGrowth: 0.02 }, { costOfEquity: 0.09, terminalGrowth: 0.03 }) },
    },
    market: { currentPrice: 50, asOf: "2026-01-31", sourceIds: ["close"] },
  });

  assert.equal(withoutAssumptions.status, "market_implied");
  assert.equal(withAssumptions.status, "research_grade");
  assert.deepEqual(Object.keys(withAssumptions.range), ["low", "high"]);
  assert.ok(withAssumptions.assumptions.every((item) => item.provenance && item.source && item.asOf));
});

test("REIT and mature FCF routes abstain when their scenario or balance inputs are not traced", () => {
  const reit = buildConditionalValuation({
    fingerprint: { primaryArchetype: "real_asset", stage: "mature", confidence: 0.8 },
    profile: { currency: "USD", marketCap: 1000 },
    financials: { affo: observed(80), nav: observed(900), dilutedShares: observed(10) },
    market: { currentPrice: 100, asOf: "2026-01-31", sourceIds: ["close"] },
  });
  const mature = buildConditionalValuation({
    fingerprint: { primaryArchetype: "mature_compounder", stage: "mature", confidence: 0.8 },
    profile: { currency: "USD", marketCap: 1000 },
    financials: { freeCashFlow: observed(80), dilutedShares: observed(10) },
    market: { currentPrice: 100, asOf: "2026-01-31", sourceIds: ["close"] },
  });

  assert.equal(reit.status, "market_implied");
  assert.equal(mature.status, "market_implied");
  assert.equal(reit.range, null);
  assert.equal(mature.range, null);
});

test("pipeline provenance, cycle history, and market-implied expectations remain observable", () => {
  const biotech = buildConditionalValuation({
    fingerprint: { primaryArchetype: "biotech_pre_revenue", stage: "pre_revenue", confidence: 0.8 },
    profile: { currency: "USD", marketCap: 100 },
    financials: { dilutedShares: observed(10), cash: observed(20), debt: observed(0), pipeline: [{ phase: "Phase 2", probability: 0.4, potentialValue: 300 }] },
    market: { currentPrice: 10, asOf: "2026-01-31", sourceIds: ["close"] },
  });
  const cycle = buildConditionalValuation({
    fingerprint: { primaryArchetype: "capacity_cycle", stage: "mature", confidence: 0.8 },
    profile: { currency: "USD" },
    financials: {},
    market: {},
  });
  const market = buildConditionalValuation({
    fingerprint: { primaryArchetype: "mature_compounder", stage: "mature", confidence: 0.8 },
    profile: { currency: "USD", marketCap: 1000 },
    financials: { freeCashFlow: observed(50), dilutedShares: observed(10) },
    market: { currentPrice: 100, asOf: "2026-01-31", sourceIds: ["close"] },
  });

  assert.equal(biotech.status, "market_implied");
  assert.equal(cycle.status, "blocked");
  assert.ok(market.marketImplied.expectations.some((item) => item.key === "price_to_fcf" && item.value === 20));
});

test("DCF requires an explicit scenario horizon and uses it in the traced assumptions", () => {
  const fingerprint = { primaryArchetype: "mature_compounder", stage: "mature", confidence: 0.8 };
  const withoutYears = buildConditionalValuation({
    fingerprint, profile: { currency: "USD", marketCap: 1000 },
    financials: { freeCashFlow: observed(100), cash: observed(50), debt: observed(0), dilutedShares: observed(10), assumptionSets: { dcf: scenario({ growth: 0.02, discountRate: 0.12, terminalGrowth: 0.02 }, { growth: 0.04, discountRate: 0.1, terminalGrowth: 0.03 }) } },
    market: { currentPrice: 100, asOf: "2026-01-31", sourceIds: ["close"] },
  });
  const traced = buildConditionalValuation({
    fingerprint, profile: { currency: "USD", marketCap: 1000 },
    financials: { freeCashFlow: observed(100), cash: observed(50), debt: observed(0), dilutedShares: observed(10), assumptionSets: { dcf: scenario({ growth: 0.02, discountRate: 0.12, terminalGrowth: 0.02, years: 3 }, { growth: 0.04, discountRate: 0.1, terminalGrowth: 0.03, years: 7 }) } },
    market: { currentPrice: 100, asOf: "2026-01-31", sourceIds: ["close"] },
  });

  assert.equal(withoutYears.status, "market_implied");
  assert.equal(traced.status, "research_grade");
  assert.ok(traced.assumptions.some((item) => item.key === "dcf_low_years" && item.value === 3));
  assert.ok(traced.assumptions.some((item) => item.key === "dcf_high_years" && item.value === 7));
});

test("legacy conditional ranges and prices without source-date evidence are blocked from publication", () => {
  const legacy = buildIndicativeValuation(blockedResearch({
    aurora: { valuation: { status: "conditional_range", range: { low: 10, central: 15, high: 20 }, assumptions: [{ key: "growth", provenance: "inferred" }] } },
  }));
  const priceWithoutEvidence = buildIndicativeValuation({
    company_profile: { currency: "USD" },
    valuation: { available: false, current_price: 20, currency: "USD" },
  });
  const priceWithInvalidDate = buildIndicativeValuation({
    company_profile: { currency: "USD" },
    valuation: {
      available: false,
      current_price: 20,
      currency: "USD",
      market_data_as_of: "2026-02-30",
      price_validation: { source: "exchange:close" },
    },
  });

  assert.equal(legacy.status, "market_implied");
  assert.equal(legacy.range, null);
  assert.equal(priceWithoutEvidence.status, "blocked");
  assert.equal(priceWithInvalidDate.status, "blocked");
});

test("biotech validates probability bounds and REIT combines AFFO and NAV weights without double counting", () => {
  const biotechBase = {
    fingerprint: { primaryArchetype: "biotech_pre_revenue", stage: "pre_revenue", confidence: 0.8 },
    profile: { currency: "USD", marketCap: 100 },
    financials: {
      cash: observed(20), debt: observed(0), dilutedShares: observed(10),
      assumptionSets: { risk_adjusted_pipeline_npv: scenario({ probabilityMultiplier: 0.8, valueMultiplier: 0.8 }, { probabilityMultiplier: 1.1, valueMultiplier: 1.2 }) },
      pipeline: [{ phase: "Phase 2", probability: 0.5, potentialValue: 200, provenance: "observed", source: "trial registry", asOf: "2026-01-31" }],
    },
    market: { currentPrice: 10, asOf: "2026-01-31", sourceIds: ["close"] },
  };
  const biotech = buildConditionalValuation(biotechBase);
  const invalidBiotech = buildConditionalValuation({ ...biotechBase, financials: { ...biotechBase.financials, pipeline: [{ ...biotechBase.financials.pipeline[0], probability: 1.2 }] } });
  const reit = buildConditionalValuation({
    fingerprint: { primaryArchetype: "real_asset", stage: "mature", confidence: 0.8 },
    profile: { currency: "USD", marketCap: 1000 },
    financials: { affo: observed(80), nav: observed(900), dilutedShares: observed(10), assumptionSets: { affo_nav: scenario({ affoMultiple: 10, affoWeight: 0.4, navWeight: 0.6 }, { affoMultiple: 12, affoWeight: 0.5, navWeight: 0.5 }) } },
    market: { currentPrice: 100, asOf: "2026-01-31", sourceIds: ["close"] },
  });

  assert.equal(biotech.status, "research_grade");
  assert.equal(invalidBiotech.status, "market_implied");
  assert.equal(reit.status, "research_grade");
  assert.equal(reit.range.low, 86);
});

test("market-implied expectations preserve hand-calculated ROE, NAV premium, and raw data-point provenance", () => {
  const financial = buildConditionalValuation({
    fingerprint: { primaryArchetype: "financial", stage: "mature", confidence: 0.8 },
    profile: { currency: "USD", marketCap: observed(2000) },
    financials: { equity: observed(1000), netIncome: observed(100) },
    market: { currentPrice: 20, asOf: "2026-01-31", sourceIds: ["close"] },
  });
  const nav = buildConditionalValuation({
    fingerprint: { primaryArchetype: "real_asset", stage: "mature", confidence: 0.8 },
    profile: { currency: "USD", marketCap: observed(2000) },
    financials: { nav: observed(2500) },
    market: { currentPrice: 20, asOf: "2026-01-31", sourceIds: ["close"] },
  });
  const raw = buildIndicativeValuation({
    company_profile: { currency: "USD", market_cap: 1000 },
    valuation: { available: false, current_price: 100, market_data_as_of: "2026-01-31", price_validation: { source: "market close" } },
    sources: { data_points: [
      { metric: "latest_free_cash_flow", normalized_value: 50, source_id: "filing:cashflow", as_of: "2025-12-31" },
      { metric: "market_cap", normalized_value: 1000, source_id: "provider:market-cap", as_of: "2026-01-31" },
    ] },
  });

  const roe = financial.marketImplied.expectations.find((item) => item.key === "roe");
  const navDiscount = nav.marketImplied.expectations.find((item) => item.key === "nav_discount");
  const currentPrice = raw.marketImplied.expectations.find((item) => item.key === "current_price");
  const fcfYield = raw.marketImplied.expectations.find((item) => item.key === "fcf_yield");
  const priceToFcf = raw.marketImplied.expectations.find((item) => item.key === "price_to_fcf");

  assert.equal(roe.value, 0.1);
  assert.equal(roe.unit, "percent");
  assert.equal(navDiscount.value, 0.25);
  assert.equal(navDiscount.unit, "percent");
  assert.equal(currentPrice.unit, "currency");
  assert.equal(fcfYield.unit, "percent");
  assert.equal(priceToFcf.value, 20);
  assert.equal(priceToFcf.unit, "x");
});

test("NAV expectations preserve the signed discount or premium and label each direction", () => {
  const common = {
    fingerprint: { primaryArchetype: "real_asset", stage: "mature", confidence: 0.8 },
    financials: { nav: observed(2500) },
    market: { currentPrice: 20, asOf: "2026-01-31", sourceIds: ["close"] },
  };
  const discount = buildConditionalValuation({ ...common, profile: { currency: "USD", marketCap: observed(2000) } });
  const premium = buildConditionalValuation({ ...common, profile: { currency: "USD", marketCap: observed(3000) } });
  const discountRow = discount.marketImplied.expectations.find((item) => item.key === "nav_discount");
  const premiumRow = premium.marketImplied.expectations.find((item) => item.key === "nav_discount");

  assert.equal(discountRow.value, 0.25);
  assert.match(discountRow.label, /descuento/i);
  assert.equal(premiumRow.value, -1 / 6);
  assert.match(premiumRow.label, /prima/i);
});

test("raw adapter skips an uncited point, fingerprints scalar facts, and routes cited biotech evidence to rNPV", () => {
  const valuation = buildIndicativeValuation({
    company_profile: { currency: "USD", sector: "Healthcare", industry: "Biotechnology" },
    valuation: { available: false, current_price: 5, market_data_as_of: "2026-01-31", price_validation: { source: "provider:close" } },
    sources: { data_points: [
      { metric: "total_revenue", normalized_value: 0 },
      { metric: "total_revenue", normalized_value: 0, source_id: "filing:income", as_of: "2025-12-31" },
      { metric: "latest_free_cash_flow", normalized_value: -10, source_id: "filing:cashflow", as_of: "2025-12-31" },
      { metric: "cash_and_equivalents", normalized_value: 50, source_id: "filing:balance", as_of: "2025-12-31" },
      { metric: "total_debt", normalized_value: 5, source_id: "filing:balance", as_of: "2025-12-31" },
      { metric: "diluted_shares", normalized_value: 10, source_id: "filing:shares", as_of: "2025-12-31" },
    ] },
    pipeline: [{ phase: "Phase 2", probability: 0.5, potentialValue: 200, provenance: "observed", source: "trial:registry", asOf: "2026-01-31" }],
    financials: { assumptionSets: { risk_adjusted_pipeline_npv: scenario({ probabilityMultiplier: 0.8, valueMultiplier: 0.8 }, { probabilityMultiplier: 1.1, valueMultiplier: 1.2 }) } },
  });

  assert.equal(valuation.status, "research_grade");
  assert.equal(valuation.method, "risk_adjusted_pipeline_npv");
});

test("a flattened AURORA market read cannot override a richer traced raw valuation", () => {
  const valuation = buildIndicativeValuation({
    company_profile: { currency: "USD", sector: "Technology", industry: "Software" },
    financials: {
      annual: [{ fiscal_year: 2022 }, { fiscal_year: 2023 }, { fiscal_year: 2024 }, { fiscal_year: 2025 }],
      assumptionSets: {
        dcf: scenario(
          { growth: 0.01, discountRate: 0.12, terminalGrowth: 0.015, years: 5 },
          { growth: 0.05, discountRate: 0.1, terminalGrowth: 0.025, years: 5 },
        ),
      },
    },
    valuation: {
      available: false,
      current_price: 100,
      market_data_as_of: "2026-01-31",
      price_validation: { source: "exchange:official-close" },
    },
    sources: { data_points: [
      { metric: "total_revenue", normalized_value: 1_000, source_id: "filing:income", as_of: "2025-12-31" },
      { metric: "latest_free_cash_flow", normalized_value: 100, source_id: "filing:cashflow", as_of: "2025-12-31" },
      { metric: "cash_and_equivalents", normalized_value: 50, source_id: "filing:balance", as_of: "2025-12-31" },
      { metric: "total_debt", normalized_value: 10, source_id: "filing:balance", as_of: "2025-12-31" },
      { metric: "diluted_shares", normalized_value: 10, source_id: "filing:shares", as_of: "2025-12-31" },
    ] },
    aurora: {
      valuation: {
        status: "market_implied",
        method: "market_implied_expectations",
        currentPrice: 100,
        range: null,
        marketImplied: { currentPrice: 100, expectations: [] },
      },
    },
  });

  assert.equal(valuation.status, "research_grade");
  assert.ok(valuation.range.high > valuation.range.low);
});

test("an AURORA-only market price reuses its canonical current-price fact without publishing a fair-value range", () => {
  const valuation = buildIndicativeValuation({
    company_profile: { currency: "USD", sector: "Technology", industry: "Software" },
    aurora: {
      valuation: {
        status: "market_implied",
        method: "market_implied_expectations",
        currentPrice: 100,
        range: { low: 80, central: 100, high: 120 },
        marketImplied: {
          currentPrice: 100,
          expectations: [{
            key: "current_price",
            label: "Observed close",
            value: 100,
            unit: "currency",
            provenance: "observed",
            source: "exchange:official-close",
            asOf: "2026-07-31",
          }],
        },
      },
    },
  });

  assert.equal(valuation.status, "market_implied");
  assert.equal(valuation.currentPrice, 100);
  assert.equal(valuation.priceSource, "exchange:official-close");
  assert.equal(valuation.marketDataAsOf, "2026-07-31");
  assert.equal(valuation.range, null);
});

test("AURORA-only market prices fail closed when their current-price fact is uncited, invalid, or future-dated", () => {
  const canonicalFact = {
    key: "current_price",
    value: 100,
    provenance: "observed",
    source: "exchange:official-close",
    asOf: "2026-07-31",
  };
  const invalidFacts = [
    { ...canonicalFact, source: "" },
    { ...canonicalFact, provenance: "vendor_verified" },
    { ...canonicalFact, asOf: "2026-02-30" },
    { ...canonicalFact, asOf: "2999-01-01" },
  ];

  for (const fact of invalidFacts) {
    const valuation = buildIndicativeValuation({
      company_profile: { currency: "USD" },
      aurora: {
        valuation: {
          status: "market_implied",
          currentPrice: 100,
          range: { low: 80, central: 100, high: 120 },
          marketImplied: { currentPrice: 100, expectations: [fact] },
        },
      },
    });

    assert.equal(valuation.status, "blocked", JSON.stringify(fact));
    assert.equal(valuation.currentPrice, null, JSON.stringify(fact));
    assert.equal(valuation.range, null, JSON.stringify(fact));
  }
});

test("conflicting raw and embedded AURORA prices rebuild market-implied expectations from the raw quote", () => {
  const valuation = buildIndicativeValuation({
    company_profile: { currency: "USD", sector: "Technology", industry: "Software" },
    valuation: {
      available: false,
      current_price: 105,
      market_data_as_of: "2026-07-31",
      price_validation: { source: "exchange:new-close" },
    },
    aurora: {
      valuation: {
        status: "market_implied",
        currentPrice: 100,
        range: null,
        marketImplied: {
          currentPrice: 100,
          expectations: [
            { key: "current_price", value: 100, unit: "currency", provenance: "observed", source: "exchange:old-close", asOf: "2026-07-30" },
            { key: "price_to_fcf", value: 20, unit: "x", provenance: "calculated", source: "exchange:old-close + filing:old", asOf: "2026-07-30" },
          ],
        },
      },
    },
  });

  const currentPriceFact = valuation.marketImplied.expectations.find((item) => item.key === "current_price");
  assert.equal(valuation.status, "market_implied");
  assert.equal(valuation.currentPrice, 105);
  assert.equal(valuation.priceSource, "exchange:new-close");
  assert.equal(currentPriceFact.value, 105);
  assert.equal(currentPriceFact.source, "exchange:new-close");
  assert.equal(valuation.marketImplied.expectations.some((item) => item.key === "price_to_fcf"), false);
  assert.equal(valuation.range, null);
});

test("an invalid embedded AURORA current-price fact is discarded before a valid raw quote is used", () => {
  const valuation = buildIndicativeValuation({
    company_profile: { currency: "USD" },
    valuation: {
      available: false,
      current_price: 100,
      market_data_as_of: "2026-07-31",
      price_validation: { source: "exchange:official-close" },
    },
    aurora: {
      valuation: {
        status: "market_implied",
        currentPrice: 100,
        range: null,
        marketImplied: {
          currentPrice: 100,
          expectations: [{
            key: "current_price",
            value: 100,
            unit: "currency",
            provenance: "vendor_verified",
            source: "vendor:uncanonical-close",
            asOf: "2026-07-31",
          }],
        },
      },
    },
  });

  const currentPriceFact = valuation.marketImplied.expectations.find((item) => item.key === "current_price");
  assert.equal(valuation.status, "market_implied");
  assert.equal(valuation.currentPrice, 100);
  assert.equal(valuation.priceSource, "exchange:official-close");
  assert.equal(currentPriceFact.provenance, "observed");
  assert.equal(currentPriceFact.source, "exchange:official-close");
  assert.equal(valuation.range, null);
});

test("invalid fundamental ranges use the traced hold path and cap expectations require their own evidence", () => {
  const fingerprint = { primaryArchetype: "mature_compounder", stage: "mature", confidence: 0.8 };
  const financials = {
    freeCashFlow: observed(100), cash: observed(0), debt: observed(0), dilutedShares: observed(10),
    assumptionSets: { dcf: scenario({ growth: 0.08, discountRate: 0.09, terminalGrowth: 0.02, years: 5 }, { growth: 0.01, discountRate: 0.12, terminalGrowth: 0.02, years: 5 }) },
  };
  const inverted = buildConditionalValuation({ fingerprint, profile: { currency: "USD" }, financials, market: { currentPrice: 20 } });
  const untracedCap = buildConditionalValuation({ fingerprint, profile: { currency: "USD", marketCap: 1000 }, financials: { freeCashFlow: observed(50) }, market: { currentPrice: 100, asOf: "2026-01-31", sourceIds: ["close"] } });
  const derivedCap = buildConditionalValuation({ fingerprint, profile: { currency: "USD" }, financials: { freeCashFlow: observed(50), dilutedShares: observed(10) }, market: { currentPrice: 100, asOf: "2026-01-31", sourceIds: ["close"] } });

  assert.equal(inverted.status, "blocked");
  assert.equal(inverted.currentPrice, null);
  assert.equal(untracedCap.marketImplied.expectations.some((item) => item.key === "price_to_fcf"), false);
  assert.equal(derivedCap.marketImplied.expectations.find((item) => item.key === "price_to_fcf").value, 20);
});

test("canonical provenance vocabulary applies to observations, scenarios, and pipeline evidence", () => {
  const fingerprint = { primaryArchetype: "mature_compounder", stage: "mature", confidence: 0.8 };
  const dcf = scenario(
    { growth: 0.01, discountRate: 0.12, terminalGrowth: 0.015, years: 5 },
    { growth: 0.05, discountRate: 0.1, terminalGrowth: 0.025, years: 5 },
  );
  const fundamentals = {
    freeCashFlow: observed(100), cash: observed(50), debt: observed(10), dilutedShares: observed(10),
    assumptionSets: { dcf },
  };
  const market = { currentPrice: 100, asOf: "2026-01-31", sourceIds: ["close"] };
  const arbitraryObservation = buildConditionalValuation({
    fingerprint,
    profile: { currency: "USD" },
    financials: { ...fundamentals, freeCashFlow: observed(100, "2025-12-31", "vendor_verified") },
    market,
  });
  const arbitraryScenario = buildConditionalValuation({
    fingerprint,
    profile: { currency: "USD" },
    financials: {
      ...fundamentals,
      assumptionSets: { dcf: { ...dcf, high: { ...dcf.high, provenance: "analyst_guess" } } },
    },
    market,
  });
  const arbitraryPipeline = buildConditionalValuation({
    fingerprint: { primaryArchetype: "biotech_pre_revenue", stage: "pre_revenue", confidence: 0.8 },
    profile: { currency: "USD" },
    financials: {
      cash: observed(20), debt: observed(0), dilutedShares: observed(10),
      assumptionSets: { risk_adjusted_pipeline_npv: scenario({ probabilityMultiplier: 0.8, valueMultiplier: 0.8 }, { probabilityMultiplier: 1.1, valueMultiplier: 1.2 }) },
      pipeline: [{ phase: "Phase 2", probability: 0.5, potentialValue: 200, provenance: "trial_registry", source: "registry", asOf: "2026-01-31" }],
    },
    market,
  });

  for (const valuation of [arbitraryObservation, arbitraryScenario, arbitraryPipeline]) {
    assert.equal(valuation.status, "market_implied");
    assert.equal(valuation.range, null);
  }
});

test("invalid and future evidence dates cannot enter observations, scenarios, or pipeline valuation", () => {
  const fingerprint = { primaryArchetype: "mature_compounder", stage: "mature", confidence: 0.8 };
  const dcf = scenario(
    { growth: 0.01, discountRate: 0.12, terminalGrowth: 0.015, years: 5 },
    { growth: 0.05, discountRate: 0.1, terminalGrowth: 0.025, years: 5 },
  );
  const fundamentals = {
    freeCashFlow: observed(100), cash: observed(50), debt: observed(10), dilutedShares: observed(10),
    assumptionSets: { dcf },
  };
  const market = { currentPrice: 100, asOf: "2026-01-31", sourceIds: ["close"] };
  const invalidObservationDate = buildConditionalValuation({
    fingerprint,
    profile: { currency: "USD" },
    financials: { ...fundamentals, cash: observed(50, "2026-02-30") },
    market,
  });
  const futureObservation = buildConditionalValuation({
    fingerprint,
    profile: { currency: "USD" },
    financials: { ...fundamentals, freeCashFlow: observed(100, "2026-02-01") },
    market,
  });
  const futureScenario = buildConditionalValuation({
    fingerprint,
    profile: { currency: "USD" },
    financials: {
      ...fundamentals,
      assumptionSets: { dcf: { ...dcf, high: { ...dcf.high, asOf: "2026-02-01" } } },
    },
    market,
  });
  const futurePipeline = buildConditionalValuation({
    fingerprint: { primaryArchetype: "biotech_pre_revenue", stage: "pre_revenue", confidence: 0.8 },
    profile: { currency: "USD" },
    financials: {
      cash: observed(20), debt: observed(0), dilutedShares: observed(10),
      assumptionSets: { risk_adjusted_pipeline_npv: scenario({ probabilityMultiplier: 0.8, valueMultiplier: 0.8 }, { probabilityMultiplier: 1.1, valueMultiplier: 1.2 }) },
      pipeline: [{ phase: "Phase 2", probability: 0.5, potentialValue: 200, provenance: "observed", source: "registry", asOf: "2026-02-01" }],
    },
    market,
  });

  for (const valuation of [invalidObservationDate, futureObservation, futureScenario, futurePipeline]) {
    assert.equal(valuation.status, "market_implied");
    assert.equal(valuation.range, null);
  }
});

test("future-dated evidence is rejected even when no earlier market cutoff is supplied", () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const fingerprint = { primaryArchetype: "mature_compounder", stage: "mature", confidence: 0.8 };
  const assumptions = {
    dcf: scenario(
      { growth: 0.01, discountRate: 0.12, terminalGrowth: 0.015, years: 5 },
      { growth: 0.05, discountRate: 0.1, terminalGrowth: 0.025, years: 5 },
    ),
  };
  const tracedFundamentals = {
    freeCashFlow: observed(100), cash: observed(50), debt: observed(10), dilutedShares: observed(10),
    assumptionSets: assumptions,
  };
  const futureQuote = buildConditionalValuation({
    fingerprint,
    profile: { currency: "USD" },
    financials: tracedFundamentals,
    market: { currentPrice: 100, asOf: tomorrow, sourceIds: ["future:close"] },
  });
  const futureFundamentalsWithoutMarket = buildConditionalValuation({
    fingerprint,
    profile: { currency: "USD" },
    financials: {
      freeCashFlow: observed(100, tomorrow), cash: observed(50, tomorrow),
      debt: observed(10, tomorrow), dilutedShares: observed(10, tomorrow),
      assumptionSets: {
        dcf: {
          low: { ...assumptions.dcf.low, asOf: tomorrow },
          high: { ...assumptions.dcf.high, asOf: tomorrow },
        },
      },
    },
    market: {},
  });

  assert.equal(futureQuote.status, "research_grade");
  assert.equal(futureQuote.currentPrice, null);
  assert.ok(futureQuote.range.high > futureQuote.range.low);
  assert.equal(futureFundamentalsWithoutMarket.status, "blocked");
  assert.equal(futureFundamentalsWithoutMarket.range, null);
});

test("through-cycle valuation rejects duplicate dates and a compressed pseudo-history", () => {
  const fingerprint = { primaryArchetype: "capacity_cycle", stage: "mature", confidence: 0.8 };
  const market = { currentPrice: 50, asOf: "2026-01-31", sourceIds: ["close"] };
  const assumptions = {
    through_cycle_cash_flow: scenario(
      { growth: 0.01, discountRate: 0.12, terminalGrowth: 0.02, years: 5 },
      { growth: 0.03, discountRate: 0.1, terminalGrowth: 0.03, years: 5 },
    ),
  };
  const financials = (history) => ({
    throughCycleFreeCashFlow: history,
    cash: observed(30), debt: observed(10), dilutedShares: observed(10), assumptionSets: assumptions,
  });
  const duplicateDates = buildConditionalValuation({
    fingerprint,
    profile: { currency: "USD" },
    financials: financials([observed(90, "2025-01-31"), observed(100, "2025-01-31"), observed(110, "2025-01-31")]),
    market,
  });
  const compressedHistory = buildConditionalValuation({
    fingerprint,
    profile: { currency: "USD" },
    financials: financials([observed(90, "2025-01-31"), observed(100, "2025-04-30"), observed(110, "2025-10-31")]),
    market,
  });

  assert.equal(duplicateDates.status, "market_implied");
  assert.equal(compressedHistory.status, "market_implied");
  assert.equal(duplicateDates.range, null);
  assert.equal(compressedHistory.range, null);
  assert.match(
    duplicateDates.closureRequirements.find((item) => item.key === "through_cycle_history").nextAction,
    /tres fechas distintas[\s\S]*dos años/i,
  );
});

test("a fully cited cyclic company receives a positive through-cycle conditional range", () => {
  const valuation = buildConditionalValuation({
    fingerprint: { primaryArchetype: "capacity_cycle", stage: "mature", confidence: 0.8 },
    profile: { currency: "USD" },
    financials: {
      throughCycleFreeCashFlow: [
        observed(90, "2023-01-31"),
        observed(100, "2024-01-31"),
        observed(110, "2025-01-31"),
      ],
      cash: observed(30), debt: observed(10), dilutedShares: observed(10),
      assumptionSets: { through_cycle_cash_flow: scenario({ growth: 0.01, discountRate: 0.12, terminalGrowth: 0.02, years: 5 }, { growth: 0.03, discountRate: 0.1, terminalGrowth: 0.03, years: 5 }) },
    },
    market: { currentPrice: 50, asOf: "2026-01-31", sourceIds: ["close"] },
  });

  assert.equal(valuation.status, "research_grade");
  assert.equal(valuation.method, "through_cycle_cash_flow");
  assert.ok(valuation.range.high > valuation.range.low);
  assert.equal(valuation.assumptions.find((item) => item.key === "fcf").provenance, "calculated");
  assert.equal(valuation.assumptions.find((item) => item.key === "fcf").asOf, "2025-01-31");
});

test("market-implied summary reuses one gated reported or derived market-cap observation", () => {
  const fingerprint = { primaryArchetype: "mature_compounder", stage: "mature", confidence: 0.8 };
  const market = { currentPrice: 100, asOf: "2026-01-31", sourceIds: ["close"] };
  const numeric = buildConditionalValuation({ fingerprint, profile: { currency: "USD", marketCap: 1000 }, financials: {}, market });
  const reported = buildConditionalValuation({ fingerprint, profile: { currency: "USD", marketCap: observed(1200) }, financials: {}, market });
  const derived = buildConditionalValuation({ fingerprint, profile: { currency: "USD" }, financials: { dilutedShares: observed(10) }, market });

  assert.equal(numeric.marketImplied.marketCap, null);
  assert.equal(reported.marketImplied.marketCap.value, 1200);
  assert.equal(reported.marketImplied.marketCap.provenance, "observed");
  assert.equal(derived.marketImplied.marketCap.value, 1000);
  assert.equal(derived.marketImplied.marketCap.provenance, "calculated");
  assert.equal(derived.marketImplied.marketCap.source, "close + 10-K");
});
