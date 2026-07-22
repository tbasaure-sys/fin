import assert from "node:assert/strict";
import test from "node:test";

import { buildCompanyFingerprint, buildValuationPlan } from "../lib/aurora/company-fingerprint.js";
import { buildConditionalValuation } from "../lib/aurora/conditional-valuation.js";
import { buildAuroraDecisionSystem } from "../lib/aurora/decision-system.js";
import { buildMosaicContext } from "../lib/mosaic/context-contract.js";
import { buildCompanyExposureGraph, applyMosaicContextToValuation } from "../lib/aurora/macro-valuation-bridge.js";

test("AURORA routes pre-revenue biotech to milestone valuation instead of a generic missing-data state", () => {
  const fingerprint = buildCompanyFingerprint({
    profile: {
      ticker: "BIOX",
      sector: "Healthcare",
      industry: "Biotechnology",
      description: "Clinical-stage oncology company with two Phase 2 programs.",
    },
    financials: {
      revenue: 0,
      freeCashFlow: -40_000_000,
      cash: 120_000_000,
      debt: 10_000_000,
    },
  });
  const plan = buildValuationPlan(fingerprint);

  assert.equal(fingerprint.stage, "pre_revenue");
  assert.equal(fingerprint.primaryArchetype, "biotech_pre_revenue");
  assert.equal(plan.primaryMethod, "risk_adjusted_pipeline_npv");
  assert.ok(plan.secondaryMethods.includes("milestone_option_value"));
  assert.ok(plan.researchQuestions.some((item) => /hito|fase|probabilidad/i.test(item)));
  assert.notEqual(plan.status, "missing_information");
});

test("AURORA gives mature cash generators a cash-flow primary model and explicit cross-checks", () => {
  const fingerprint = buildCompanyFingerprint({
    profile: {
      ticker: "CORE",
      sector: "Technology",
      industry: "Software - Infrastructure",
    },
    financials: {
      revenue: 80_000_000_000,
      freeCashFlow: 25_000_000_000,
      operatingMargin: 0.36,
      revenueGrowth: 0.12,
      roic: 0.28,
    },
    history: { profitableYears: 5, revenueYears: 5 },
  });
  const plan = buildValuationPlan(fingerprint);

  assert.equal(fingerprint.stage, "mature");
  assert.equal(fingerprint.primaryArchetype, "mature_compounder");
  assert.equal(plan.primaryMethod, "owner_earnings_dcf");
  assert.deepEqual(plan.secondaryMethods.slice(0, 2), ["reverse_dcf", "residual_income"]);
});

test("MOSAIC exposes supply, demand and liquidity separately and excludes stale markets", () => {
  const context = buildMosaicContext({
    mosaic: {
      generated_at: "2026-07-20T12:00:00.000Z",
      markets: [
        {
          market_id: "global_power_transformers",
          item: "grid transformers",
          region: "Global",
          sector: "industrials",
          score: 64,
          data_quality: 88,
          source_series: ["ORDERS", "CAPACITY", "INVENTORY"],
          driver_contributions: {
            price_acceleration: 12,
            inventory_drawdown: 18,
            delivery_stress: 14,
            capacity_tightness: 25,
            trade_stress: 4,
            demand_slowdown: -9,
            inventory_buildup: -2,
            margin_compression: -3,
          },
          source_coverage: { connected_series: 3, connected_layers: ["prices", "capacity", "demand"] },
        },
      ],
      source_summary: { providers: [{ name: "FRED", used_series: 3, latest_date: "2026-07-20" }] },
    },
    macro: {
      run_date: "2026-07-20",
      liquidity: {
        status: "available",
        components: { us_net_liquidity: { impulse: -0.7, impulse_direction: "negative" } },
      },
    },
    now: "2026-07-21T12:00:00.000Z",
  });

  assert.equal(context.status, "current");
  assert.equal(context.markets.length, 1);
  assert.ok(context.markets[0].axes.supply > 0);
  assert.ok(context.markets[0].axes.demand < 0);
  assert.ok(context.axes.liquidity < 0);
  assert.equal(context.markets[0].freshness.status, "current");

  const stale = buildMosaicContext({
    mosaic: { ...context.raw, generated_at: "2025-01-01T00:00:00.000Z", markets: context.raw.markets },
    macro: { run_date: "2025-01-01" },
    now: "2026-07-21T12:00:00.000Z",
  });
  assert.equal(stale.status, "stale");
  assert.equal(stale.markets.length, 0);
});

test("MOSAIC changes AURORA only through capped, auditable company exposures", () => {
  const fingerprint = buildCompanyFingerprint({
    profile: {
      ticker: "START",
      sector: "Technology",
      industry: "Aerospace & Defense",
      description: "Pre-revenue launch systems company dependent on external financing.",
    },
    financials: { revenue: 0, freeCashFlow: -80_000_000, cash: 100_000_000, debt: 20_000_000 },
  });
  const exposures = buildCompanyExposureGraph({ fingerprint, profile: fingerprint.profile });
  const context = {
    version: "mosaic_context_v2",
    status: "current",
    confidence: 0.82,
    axes: { supply: 10, demand: -12, liquidity: -72 },
    markets: [],
    evidence: [{ id: "liq", label: "Liquidez global", sourceIds: ["FED", "ECB"] }],
  };
  const result = applyMosaicContextToValuation({
    baseValuation: { currency: "USD", range: { low: 8, central: 20, high: 42 } },
    fingerprint,
    exposures,
    context,
  });

  assert.equal(result.version, "aurora_mosaic_bridge_v1");
  assert.ok(result.contextual.range.central < 20);
  assert.ok(result.contextual.range.central >= 17);
  assert.ok(result.contextual.range.low < 8);
  assert.ok(result.adjustments.some((item) => item.driver === "financing_cost_and_dilution"));
  assert.ok(result.adjustments.every((item) => item.sourceIds.length > 0));
  assert.ok(result.adjustments.every((item) => Math.abs(item.centralImpactPct) <= item.capPct));

  const noExposure = applyMosaicContextToValuation({
    baseValuation: { currency: "USD", range: { low: 8, central: 20, high: 42 } },
    fingerprint: { ...fingerprint, financingDependence: 0 },
    exposures: { nodes: [], links: [] },
    context,
  });
  assert.deepEqual(noExposure.contextual.range, { low: 8, central: 20, high: 42 });
});

test("AURORA produces a wide, assumption-led range for a mature cash generator when institutional gates are incomplete", () => {
  const fingerprint = buildCompanyFingerprint({
    profile: { ticker: "CALM", sector: "Technology", industry: "Software" },
    financials: { revenue: 1_000, freeCashFlow: 160, cash: 120, debt: 40 },
    history: { profitableYears: 5, revenueYears: 5 },
  });
  const result = buildConditionalValuation({
    fingerprint,
    profile: { ticker: "CALM", currency: "USD", marketCap: 2_000 },
    financials: {
      revenue: 1_000,
      freeCashFlow: 160,
      cash: 120,
      debt: 40,
      revenueGrowth: 0.08,
      roic: 0.18,
    },
    market: { currentPrice: 20, asOf: "2026-07-20", sourceIds: ["market:independent-close"] },
  });

  assert.equal(result.status, "conditional_range");
  assert.equal(result.decisionReady, false);
  assert.equal(result.method, "owner_earnings_dcf");
  assert.ok(result.range.low > 0);
  assert.ok(result.range.low < result.range.central);
  assert.ok(result.range.central < result.range.high);
  assert.ok(result.assumptions.every((item) => ["observed", "calculated", "inferred"].includes(item.provenance)));
  assert.ok(result.valueOfInformation[0].question.length > 10);
});

test("AURORA turns an unsupported pre-revenue valuation into a specific market-implied hurdle, not a generic missing-data message", () => {
  const fingerprint = buildCompanyFingerprint({
    profile: { ticker: "BIOX", sector: "Healthcare", industry: "Biotechnology" },
    financials: { revenue: 0, freeCashFlow: -80, cash: 120, debt: 10 },
  });
  const result = buildConditionalValuation({
    fingerprint,
    profile: { ticker: "BIOX", currency: "USD", marketCap: 900 },
    financials: { revenue: 0, freeCashFlow: -80, cash: 120, debt: 10 },
    market: { currentPrice: 9, asOf: "2026-07-20", sourceIds: ["market:independent-close"] },
  });

  assert.equal(result.status, "market_implied_hurdle");
  assert.equal(result.decisionReady, false);
  assert.equal(result.range, null);
  assert.equal(result.marketImplied.enterpriseOptionValue, 790);
  assert.match(result.valueOfInformation[0].question, /hito|fase|probabilidad/i);
  assert.doesNotMatch(result.summary, /falta informaci[oó]n/i);
});

test("the AURORA orchestrator returns one auditable object with routing, valuation, debate and MOSAIC context", () => {
  const decision = buildAuroraDecisionSystem({
    research: {
      ticker: "GRID",
      company_profile: {
        name: "Grid Systems",
        sector: "Industrials",
        industry: "Electrical Equipment",
        currency: "USD",
        market_cap: 5_000,
      },
      financials: {
        annual: [{ fiscal_year: 2022 }, { fiscal_year: 2023 }, { fiscal_year: 2024 }, { fiscal_year: 2025 }],
        ratios: { latest_revenue: 1_500, latest_fcf: 220, revenue_cagr_5y: 0.09, roic: 0.2 },
      },
      valuation: {
        available: false,
        current_price: 25,
        market_data_as_of: "2026-07-20",
        price_validation: { source_ids: ["market:independent-close"] },
      },
      sources: { data_points: [], records: [] },
    },
    mosaicContext: {
      version: "mosaic_context_v2",
      status: "current",
      asOf: "2026-07-20",
      confidence: 0.8,
      axes: { supply: 68, demand: 14, liquidity: -20 },
      markets: [],
      evidence: [{ id: "mosaic", sourceIds: ["FRED:ORDERS"] }],
    },
  });

  assert.equal(decision.version, "aurora_decision_system_v1");
  assert.equal(decision.fingerprint.primaryArchetype, "asset_heavy");
  assert.equal(decision.valuation.status, "conditional_range");
  assert.ok(decision.debate.length >= 3);
  assert.ok(decision.debate.every((claim) => claim.role && claim.provenance));
  assert.equal(decision.macroContext.version, "mosaic_context_v2");
});
