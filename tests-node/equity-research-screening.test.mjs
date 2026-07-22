import assert from "node:assert/strict";
import test from "node:test";

import { sanitizePublicResearchPayload } from "../lib/server/equity-research.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const dateDaysAgo = (days) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
const RECENT_MARKET_DATE = dateDaysAgo(1);
const RECENT_FINANCIAL_DATE = dateDaysAgo(180);
const RECENT_RETRIEVED_AT = new Date().toISOString();

function yfinanceScreeningPayload() {
  const evidencePoint = (metric, value, sourceId) => ({
    metric,
    normalized_value: value,
    claim_tag: "sourced_fact",
    source_id: sourceId,
  });
  return {
    ok: true,
    ticker: "EARLY",
    generated_at: RECENT_RETRIEVED_AT,
    company_profile: {
      name: "Example Early Stage Biotech",
      sector: "Healthcare",
      industry: "Biotechnology",
      currency: "USD",
    },
    financials: {
      annual: [{ date: RECENT_FINANCIAL_DATE, period: "FY", fiscal_year: Number(RECENT_FINANCIAL_DATE.slice(0, 4)) }],
      ratios: { latest_revenue: 0, latest_fcf: -40_000_000 },
      quality_flags: [],
    },
    valuation: {
      model_version: "institutional_valuation_v3",
      available: false,
      status: "not_decision_ready",
      archetype: "early_stage",
      current_price: 8,
      currency: "USD",
      market_data_as_of: RECENT_MARKET_DATE,
      financial_data_as_of: RECENT_FINANCIAL_DATE,
      range: { low: null, central: null, high: null },
      selected_value: null,
      price_validation: {
        status: "provider_reconciled",
        usable: false,
        research_usable: true,
        usable_for_context: true,
        provider_corroborated: true,
        independent_price_observation: false,
        sources: ["yfinance quote", "yfinance latest close"],
      },
      screening_analysis: {
        version: "screening_analysis_v1",
        available: true,
        posture: "screen_grade",
        kind: "early_stage",
        fair_value_published: false,
        observed: {
          current_price: 8,
          market_cap: 400_000_000,
          revenue: 0,
          free_cash_flow: -40_000_000,
          cash: 120_000_000,
          total_debt: 10_000_000,
          diluted_shares: 50_000_000,
          net_cash: 110_000_000,
          enterprise_value: 290_000_000,
        },
        ratios: {
          ev_to_revenue: null,
          fcf_yield: -0.1,
          net_cash_to_market_cap: 0.275,
        },
        runway: {
          annual_burn: 40_000_000,
          years: 3,
          months: 36,
          funding_need_for_24_months: 0,
          illustrative_dilution_at_20pct_discount: 0,
          pressure: "manageable",
        },
        market_read: {
          operations_value: 290_000_000,
          cash_per_share: 2.4,
          net_cash_per_share: 2.2,
          premium_to_net_cash: 2.6363636364,
        },
      },
      reliability: { usable: false, status: "blocked", score: 0.4, reasons: [], limitations: [] },
    },
    sources: {
      coverage: { status: "partial", score: 58, expected_metrics: 19, covered_expected_metrics: 11 },
      records: [
        { source_id: "yfinance:profile", provider: "yfinance", endpoint_or_filing: "Ticker/EARLY/info", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 1 },
        { source_id: "yfinance:quote", provider: "yfinance", endpoint_or_filing: "Ticker/EARLY/fast_info", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 1 },
        { source_id: "yfinance:prices", provider: "yfinance", endpoint_or_filing: "Ticker/EARLY/history?period=1mo&interval=1d", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 2 },
        { source_id: "yfinance:income:annual", provider: "yfinance", endpoint_or_filing: "Ticker/EARLY/income_stmt?period=annual", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 1 },
        { source_id: "yfinance:cash-flow:annual", provider: "yfinance", endpoint_or_filing: "Ticker/EARLY/cash_flow?period=annual", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 1 },
        { source_id: "yfinance:balance:annual", provider: "yfinance", endpoint_or_filing: "Ticker/EARLY/balance_sheet?period=annual", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 1 },
      ],
      data_points: [
        evidencePoint("screening.current_price", 8, "yfinance:quote"),
        evidencePoint("screening.market_cap", 400_000_000, "yfinance:quote"),
        evidencePoint("screening.revenue", 0, "yfinance:income:annual"),
        evidencePoint("screening.free_cash_flow", -40_000_000, "yfinance:cash-flow:annual"),
        evidencePoint("screening.cash", 120_000_000, "yfinance:balance:annual"),
        evidencePoint("screening.total_debt", 10_000_000, "yfinance:balance:annual"),
        evidencePoint("screening.diluted_shares", 50_000_000, "yfinance:income:annual"),
      ],
    },
    audit: { status: "needs_attention", findings: [] },
  };
}

test("public AURORA accepts a strictly identified yfinance market pair for current-price context", () => {
  const payload = sanitizePublicResearchPayload(yfinanceScreeningPayload(), { expectedTicker: "EARLY" });

  assert.equal(payload.valuation.current_price, 8);
  assert.equal(payload.valuation.market_data_as_of, RECENT_MARKET_DATE);
  assert.deepEqual(payload.valuation.price_validation.sources, ["Yahoo Finance"]);
  assert.ok(payload.sources.records.some((record) => record.source_id === "yfinance:quote"));
  assert.ok(payload.sources.records.some((record) => record.source_id === "yfinance:prices"));
});

test("public AURORA preserves an arithmetic-checked early-stage screening analysis without publishing fair value", () => {
  const payload = sanitizePublicResearchPayload(yfinanceScreeningPayload(), { expectedTicker: "EARLY" });
  const screening = payload.valuation.screening_analysis;

  assert.equal(screening.available, true);
  assert.equal(screening.kind, "early_stage");
  assert.equal(screening.posture, "screen_grade");
  assert.equal(screening.fair_value_published, false);
  assert.equal(screening.observed.current_price, 8);
  assert.equal(screening.observed.enterprise_value, 290_000_000);
  assert.equal(screening.runway.years, 3);
  assert.equal(screening.market_read.net_cash_per_share, 2.2);
  assert.deepEqual(payload.valuation.range, { low: null, central: null, high: null });
  assert.equal(payload.valuation.selected_value, null);
});

test("public AURORA keeps a corroborated Yahoo price for context when only the share denominator is inconsistent", () => {
  const raw = yfinanceScreeningPayload();
  raw.valuation.price_validation = {
    ...raw.valuation.price_validation,
    status: "inconsistent",
    research_usable: false,
    usable_for_context: true,
    provider_corroborated: false,
    checks: [
      {
        key: "quote_vs_latest_close",
        passed: true,
        required: true,
        comparable: true,
        independent: false,
        source_family: "yfinance",
        compared_with_source_family: "yfinance",
        difference: 0,
        maximum_difference: 0.03,
      },
      {
        key: "price_times_shares_vs_market_cap",
        passed: false,
        required: true,
      },
    ],
  };

  const payload = sanitizePublicResearchPayload(raw, { expectedTicker: "EARLY" });

  assert.equal(payload.valuation.current_price, 8);
  assert.equal(payload.valuation.market_data_as_of, RECENT_MARKET_DATE);
  assert.equal(payload.valuation.price_validation.usable, false);
  assert.equal(payload.valuation.price_validation.usable_for_context, true);
  assert.equal(payload.valuation.screening_analysis?.kind, "early_stage");
  assert.deepEqual(payload.valuation.range, { low: null, central: null, high: null });
});

test("public AURORA rejects a forged yfinance endpoint and withholds both price and screening", () => {
  const raw = yfinanceScreeningPayload();
  raw.sources.records.find((record) => record.source_id === "yfinance:quote").endpoint_or_filing = "Ticker/OTHER/fast_info";

  const payload = sanitizePublicResearchPayload(raw, { expectedTicker: "EARLY" });

  assert.equal(payload.valuation.current_price, null);
  assert.equal(payload.valuation.screening_analysis, null);
});
