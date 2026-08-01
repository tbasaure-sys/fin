import assert from "node:assert/strict";
import test from "node:test";

import { buildCompanyFingerprint, buildValuationPlan } from "../lib/aurora/company-fingerprint.js";
import { buildConditionalValuation } from "../lib/aurora/conditional-valuation.js";
import { buildAuroraDecisionSystem } from "../lib/aurora/decision-system.js";
import { buildMosaicContext } from "../lib/mosaic/context-contract.js";
import { buildCompanyExposureGraph, applyMosaicContextToValuation } from "../lib/aurora/macro-valuation-bridge.js";
import { attachAuroraDecisionSystem, loadCurrentMosaicContext } from "../lib/server/aurora-decision-system.js";

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

test("MOSAIC exposes supply, demand and liquidity separately and marks stale markets unusable", () => {
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
      source_summary: { providers: [{ name: "FRED", used_series: 3, latest_date: "2026-07-20", source_ids: ["ORDERS", "CAPACITY", "INVENTORY"] }] },
    },
    macro: {
      run_date: "2026-07-20",
      liquidity: {
        status: "available",
        asOf: "2026-07-20",
        sourceIds: ["WALCL", "WTREGEN", "RRPONTSYD"],
        freshness: { status: "current", usable: true, ageDays: 1 },
        usable: true,
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
    mosaic: {
      ...context.raw,
      generated_at: "2026-07-21T00:00:00.000Z",
      markets: context.raw.markets,
      source_summary: {
        providers: context.raw.source_summary.providers.map((provider) => ({
          ...provider,
          latest_date: "2025-01-01",
        })),
      },
    },
    macro: { run_date: "2025-01-01" },
    now: "2026-07-21T12:00:00.000Z",
  });
  assert.equal(stale.status, "stale");
  assert.equal(stale.markets.length, 1);
  assert.equal(stale.markets[0].freshness.usable, false);
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
  const exposures = buildCompanyExposureGraph({
    fingerprint,
    profile: fingerprint.profile,
    exposureLinks: [{
      factorId: "global_liquidity",
      driver: "financing_cost_and_dilution",
      sensitivity: 0.8,
      direction: 1,
      verified: true,
      provenance: "company_filing",
      sourceIds: ["filing:runway-and-capital-plan"],
      asOf: "2026-07-20",
    }],
  });
  const context = {
    version: "mosaic_context_v2",
    status: "current",
    confidence: 0.82,
    axes: { supply: 10, demand: -12, liquidity: -72 },
    liquidity: {
      axis: -72,
      asOf: "2026-07-20",
      sourceIds: ["WALCL", "WTREGEN", "RRPONTSYD"],
      freshness: { status: "current", usable: true, ageDays: 1 },
      usable: true,
      confidence: 0.82,
    },
    markets: [],
    evidence: [{ id: "liquidity:global", factorId: "global_liquidity", sourceIds: ["WALCL", "WTREGEN", "RRPONTSYD"], asOf: "2026-07-20" }],
  };
  const result = applyMosaicContextToValuation({
    baseValuation: { status: "decision_ready", currency: "USD", range: { low: 8, central: 20, high: 42 } },
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
    baseValuation: { status: "decision_ready", currency: "USD", range: { low: 8, central: 20, high: 42 } },
    fingerprint: { ...fingerprint, financingDependence: 0 },
    exposures: { nodes: [], links: [] },
    context,
  });
  assert.deepEqual(noExposure.contextual.range, { low: 8, central: 20, high: 42 });
});

test("MOSAIC uses only the exact documented market and never pools unrelated sources", () => {
  const context = {
    version: "mosaic_context_v2",
    status: "mixed",
    confidence: 0.99,
    axes: { supply: 95, demand: 95, liquidity: 0 },
    markets: [
      {
        id: "unrelated_market",
        axes: { supply: 95, demand: 80, price: 90 },
        confidence: 0.99,
        sourceIds: ["UNRELATED:A", "UNRELATED:B"],
        asOf: "2026-07-31",
        freshness: { status: "current", usable: true, ageDays: 1 },
      },
      {
        id: "global_power_transformers",
        axes: { supply: 20, demand: -10, price: 12 },
        confidence: 0.75,
        sourceIds: ["TARGET:ORDERS", "TARGET:CAPACITY"],
        asOf: "2026-07-30",
        freshness: { status: "current", usable: true, ageDays: 2 },
      },
    ],
  };
  const exposures = buildCompanyExposureGraph({
    profile: { ticker: "GRID", sector: "Industrials", industry: "Electrical Equipment" },
    exposureLinks: [{
      marketId: "global_power_transformers",
      axis: "supply",
      driver: "capacity_and_backlog",
      sensitivity: 0.6,
      direction: 1,
      verified: true,
      provenance: "company_backlog_disclosure",
      sourceIds: ["company:10q-backlog"],
      asOf: "2026-07-29",
    }],
  });
  const result = applyMosaicContextToValuation({
    baseValuation: { status: "decision_ready", currency: "USD", range: { low: 80, central: 100, high: 125 } },
    exposures,
    context,
  });

  assert.equal(result.status, "context_applied");
  assert.equal(result.adjustments.length, 1);
  assert.equal(result.adjustments[0].marketId, "global_power_transformers");
  assert.equal(result.adjustments[0].signal, 0.2);
  assert.deepEqual(result.adjustments[0].marketSourceIds, ["TARGET:ORDERS", "TARGET:CAPACITY"]);
  assert.ok(result.adjustments[0].sourceIds.includes("company:10q-backlog"));
  assert.ok(!result.adjustments[0].sourceIds.some((id) => id.startsWith("UNRELATED:")));
});

test("MOSAIC abstains for keyword-only, unverified, stale-company and stale-market links", () => {
  const keywordOnly = buildCompanyExposureGraph({
    fingerprint: { financingDependence: 1 },
    profile: {
      ticker: "KEY",
      sector: "Mining and semiconductors",
      industry: "Copper transport and grid transformers",
      description: "Dependent on external financing and global liquidity.",
    },
  });
  assert.equal(keywordOnly.links.length, 0);

  const currentMarket = {
    id: "china_industrials_copper",
    axes: { supply: 70, demand: 10, price: 55 },
    confidence: 0.8,
    sourceIds: ["TARGET:COPPER"],
    asOf: "2026-07-31",
    freshness: { status: "current", usable: true, ageDays: 1 },
  };
  const baseValuation = { status: "decision_ready", range: { low: 80, central: 100, high: 125 } };
  const context = { version: "mosaic_context_v2", status: "current", markets: [currentMarket] };
  const common = {
    marketId: "china_industrials_copper",
    axis: "price",
    driver: "realized_price_and_margin",
    sensitivity: 0.7,
    direction: 1,
    provenance: "company_filing",
    sourceIds: ["company:revenue-mix"],
  };
  const unverified = buildCompanyExposureGraph({ exposureLinks: [{ ...common, verified: false, asOf: "2026-07-31" }] });
  const staleLink = buildCompanyExposureGraph({ exposureLinks: [{ ...common, verified: true, asOf: "2026-05-01" }] });
  const futureLink = buildCompanyExposureGraph({ exposureLinks: [{ ...common, verified: true, asOf: "2027-07-31" }] });
  const freshLink = buildCompanyExposureGraph({ exposureLinks: [{ ...common, verified: true, asOf: "2026-07-31" }] });

  assert.equal(applyMosaicContextToValuation({ baseValuation, exposures: unverified, context }).adjustments.length, 0);
  assert.equal(applyMosaicContextToValuation({ baseValuation, exposures: staleLink, context }).adjustments.length, 0);
  assert.equal(applyMosaicContextToValuation({ baseValuation, exposures: futureLink, context }).adjustments.length, 0);
  assert.equal(applyMosaicContextToValuation({
    baseValuation,
    exposures: freshLink,
    context: {
      ...context,
      markets: [{ ...currentMarket, asOf: "2026-05-01", freshness: { status: "stale", usable: false, ageDays: 92 } }],
    },
  }).adjustments.length, 0);
});

test("MOSAIC rejects negative or degenerate base valuation ranges", () => {
  const exposures = buildCompanyExposureGraph({ exposureLinks: [{
    marketId: "global_power_transformers",
    axis: "supply",
    driver: "capacity_and_backlog",
    sensitivity: 0.6,
    direction: 1,
    verified: true,
    provenance: "company_filing",
    sourceIds: ["company:backlog"],
    asOf: "2026-07-31",
  }] });
  const context = {
    version: "mosaic_context_v2",
    status: "current",
    markets: [{
      id: "global_power_transformers",
      axes: { supply: 40, demand: 0, price: 10 },
      confidence: 0.8,
      sourceIds: ["market:orders"],
      asOf: "2026-07-31",
      freshness: { status: "current", usable: true, ageDays: 1 },
    }],
  };
  const invalid = [
    { status: "decision_ready", range: { low: -1, central: 10, high: 20 } },
    { status: "decision_ready", range: { low: 10, central: 10, high: 20 } },
    { status: "decision_ready", range: { low: 10, central: 20, high: 20 } },
    { status: "research_grade", range: { low: -1, high: 20 } },
    { status: "research_grade", range: { low: 10, high: 10 } },
  ];
  for (const baseValuation of invalid) {
    const result = applyMosaicContextToValuation({ baseValuation, exposures, context });
    assert.equal(result.status, "base_valuation_unavailable");
    assert.equal(result.adjustments.length, 0);
  }

  const zeroFloor = applyMosaicContextToValuation({
    baseValuation: { status: "research_grade", range: { low: 0, high: 20 } },
    exposures,
    context,
  });
  assert.equal(zeroFloor.status, "context_applied");
});

test("MOSAIC adjusts a research-grade low/high interval without inventing a central value", () => {
  const exposures = buildCompanyExposureGraph({ exposureLinks: [{
    marketId: "global_power_transformers",
    axis: "supply",
    driver: "capacity_and_backlog",
    sensitivity: 0.6,
    direction: 1,
    verified: true,
    provenance: "company_filing",
    sourceIds: ["company:backlog"],
    asOf: "2026-07-31",
  }] });
  const context = {
    version: "mosaic_context_v2",
    status: "current",
    markets: [{
      id: "global_power_transformers",
      axes: { supply: 40, demand: 0, price: 10 },
      confidence: 0.8,
      sourceIds: ["market:orders"],
      asOf: "2026-07-31",
      freshness: { status: "current", usable: true, ageDays: 1 },
    }],
  };
  const result = applyMosaicContextToValuation({
    baseValuation: { status: "research_grade", currency: "USD", range: { low: 80, high: 125 } },
    exposures,
    context,
  });

  assert.equal(result.status, "context_applied");
  assert.ok(result.contextual.range.low !== 80);
  assert.ok(result.contextual.range.high !== 125);
  assert.equal(Object.hasOwn(result.contextual.range, "central"), false);

  for (const status of ["blocked", "market_implied"]) {
    const rejected = applyMosaicContextToValuation({
      baseValuation: { status, range: { low: 80, high: 125 } },
      exposures,
      context,
    });
    assert.equal(rejected.status, "base_valuation_ineligible");
    assert.equal(rejected.adjustments.length, 0);
  }
});

test("the server context loader preserves current liquidity evidence and AURORA exposes bounded market provenance", async () => {
  const raw = {
    generated_at: "2026-08-01T11:59:00.000Z",
    source_summary: {
      providers: [{
        name: "Official orders",
        latest_date: "2026-07-31",
        source_ids: ["ORDERS:GRID"],
      }],
    },
    markets: [{
      market_id: "global_power_transformers",
      item: "grid transformers",
      score: 65,
      data_quality: 90,
      source_series: ["ORDERS:GRID"],
      driver_contributions: { capacity_tightness: 40 },
    }],
  };
  const macroSnapshot = {
    liquidity: {
      status: "Parcial",
      impulse: -0.65,
      asOf: "2026-07-31",
      sourceIds: ["WALCL", "WTREGEN", "RRPONTSYD"],
      freshness: { status: "current", ageDays: 1, usable: true },
      usable: true,
      confidence: 0.82,
    },
  };
  const context = await loadCurrentMosaicContext({
    mosaicSnapshot: { context: { raw } },
    macroSnapshot,
    now: "2026-08-01T12:00:00.000Z",
  });

  assert.equal(context.liquidity.usable, true);
  assert.equal(context.liquidity.asOf, "2026-07-31");
  assert.deepEqual(context.liquidity.sourceIds, ["WALCL", "WTREGEN", "RRPONTSYD"]);
  assert.equal(context.axes.liquidity, -65);

  const exposure = buildCompanyExposureGraph({ exposureLinks: [{
    factorId: "global_liquidity",
    driver: "financing_cost_and_dilution",
    sensitivity: 0.7,
    direction: 1,
    verified: true,
    provenance: "company_capital_plan",
    sourceIds: ["company:capital-plan"],
    asOf: "2026-07-30",
  }] });
  const bridged = applyMosaicContextToValuation({
    baseValuation: { status: "decision_ready", range: { low: 80, central: 100, high: 125 } },
    exposures: exposure,
    context,
  });
  assert.equal(bridged.status, "context_applied");
  assert.deepEqual(bridged.adjustments[0].liquiditySourceIds, ["WALCL", "WTREGEN", "RRPONTSYD"]);

  const decision = buildAuroraDecisionSystem({
    research: {
      ticker: "GRID",
      company_profile: { ticker: "GRID", sector: "Industrials", industry: "Electrical Equipment" },
      valuation: { available: false },
      sources: { data_points: [] },
    },
    mosaicContext: context,
  });
  assert.equal(decision.macroContext.markets[0].marketId, "global_power_transformers");
  assert.equal(decision.macroContext.markets[0].status, "current");
  assert.equal(decision.macroContext.markets[0].asOf, "2026-07-31");
  assert.deepEqual(decision.macroContext.markets[0].sourceIds, ["ORDERS:GRID"]);
  assert.deepEqual(decision.macroContext.markets[0].evidence, [{
    sourceId: "ORDERS:GRID",
    provider: "Official orders",
    asOf: "2026-07-31",
  }]);
  assert.deepEqual(decision.macroContext.liquidity.sourceIds, ["WALCL", "WTREGEN", "RRPONTSYD"]);
  assert.doesNotMatch(JSON.stringify(decision.macroContext), /[A-Z]:\\\\|sourcePath|cache_dir/i);
});

test("the server context loader keeps stale and undated liquidity inactive", async () => {
  const raw = {
    source_summary: {
      providers: [{ name: "Official orders", latest_date: "2026-07-31", source_ids: ["ORDERS:GRID"] }],
    },
    markets: [{
      market_id: "global_power_transformers",
      item: "grid transformers",
      score: 65,
      data_quality: 90,
      source_series: ["ORDERS:GRID"],
      driver_contributions: { capacity_tightness: 40 },
    }],
  };
  const exposure = buildCompanyExposureGraph({ exposureLinks: [{
    factorId: "global_liquidity",
    driver: "financing_cost_and_dilution",
    sensitivity: 0.7,
    direction: 1,
    verified: true,
    provenance: "company_capital_plan",
    sourceIds: ["company:capital-plan"],
    asOf: "2026-07-30",
  }] });
  for (const liquidity of [
    {
      status: "Parcial",
      impulse: -0.65,
      asOf: "2026-05-01",
      sourceIds: ["WALCL"],
      freshness: { status: "current", ageDays: 0, usable: true },
      usable: true,
    },
    {
      status: "Parcial",
      impulse: -0.65,
      sourceIds: ["WALCL"],
      freshness: { status: "current", ageDays: 0, usable: true },
      usable: true,
    },
  ]) {
    const context = await loadCurrentMosaicContext({
      mosaicSnapshot: { context: { raw } },
      macroSnapshot: { liquidity },
      now: "2026-08-01T12:00:00.000Z",
    });
    assert.equal(context.liquidity.usable, false);
    assert.equal(context.axes.liquidity, 0);
    const bridged = applyMosaicContextToValuation({
      baseValuation: { status: "decision_ready", range: { low: 80, central: 100, high: 125 } },
      exposures: exposure,
      context,
    });
    assert.equal(bridged.status, "no_material_context_link");
    assert.equal(bridged.adjustments.length, 0);
  }
});

test("AURORA keeps a mature cash generator market-implied until the DCF inputs and scenarios are traced", () => {
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

  assert.equal(result.status, "market_implied");
  assert.equal(result.decisionReady, false);
  assert.equal(result.method, "market_implied_expectations");
  assert.equal(result.range, null);
  assert.equal(result.assumptions.length, 0);
  assert.ok(result.valueOfInformation[0].question.length > 10);
});

test("AURORA keeps a financial company market-implied until book and residual-income inputs are observed", () => {
  const fingerprint = buildCompanyFingerprint({
    profile: { ticker: "CARE", sector: "Healthcare", industry: "Health Insurance" },
    financials: { revenue: 13_300, freeCashFlow: 950, cash: 4_100, debt: 1_500 },
    history: { profitableYears: 4, revenueYears: 5 },
  });
  const result = buildConditionalValuation({
    fingerprint,
    profile: { ticker: "CARE", currency: "USD", marketCap: null },
    financials: {
      revenue: 13_300,
      freeCashFlow: 950,
      cash: 4_100,
      debt: 1_500,
      dilutedShares: 260,
      revenueGrowth: 0.12,
    },
    market: { currentPrice: 13.23, asOf: "2026-07-24", sourceIds: ["market:close"] },
  });

  assert.equal(result.status, "market_implied");
  assert.equal(result.range, null);
  assert.equal(result.currentPrice, 13.23);
  assert.ok(result.closureRequirements.some((item) => item.key === "book_and_roe"));
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

  assert.equal(result.status, "market_implied");
  assert.equal(result.decisionReady, false);
  assert.equal(result.range, null);
  assert.equal(result.marketImplied.enterpriseOptionValue, undefined);
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
  assert.equal(decision.valuation.status, "market_implied");
  assert.ok(decision.debate.length >= 3);
  assert.ok(decision.debate.every((claim) => claim.role && claim.provenance));
  assert.equal(decision.macroContext.version, "mosaic_context_v2");
});

test("the AURORA orchestrator keeps a financial company market-implied when normalized FCF lacks book and ROE", () => {
  const decision = buildAuroraDecisionSystem({
    research: {
      ticker: "CARE",
      company_profile: { name: "Care Co", sector: "Healthcare", industry: "Health Insurance", currency: "USD" },
      financials: {
        annual: [{ fiscal_year: 2022 }, { fiscal_year: 2023 }, { fiscal_year: 2024 }, { fiscal_year: 2025 }],
        ratios: { latest_revenue: 13_300, revenue_cagr_5y: 0.12 },
      },
      valuation: { available: false, market_data_as_of: "2026-07-24" },
      sources: {
        data_points: [
          { metric: "latest_free_cash_flow", normalized_value: 950, source_id: "filing:cf" },
          { metric: "latest_diluted_shares", normalized_value: 260, source_id: "filing:is" },
          { metric: "cash_and_equivalents", normalized_value: 4_100, source_id: "filing:bs" },
          { metric: "total_debt", normalized_value: 1_500, source_id: "filing:bs" },
          { metric: "current_price", normalized_value: 13.23, source_id: "market:close" },
        ],
      },
    },
  });

  assert.equal(decision.valuation.status, "market_implied");
  assert.equal(decision.valuation.range, null);
  assert.ok(decision.valuation.closureRequirements.some((item) => item.key === "book_and_roe"));
});

test("the production attachment preserves a fully traced raw DCF as research-grade", async () => {
  const payload = {
    ticker: "TRACE",
    company_profile: {
      name: "Trace Software",
      sector: "Technology",
      industry: "Software - Infrastructure",
      currency: "USD",
    },
    financials: {
      annual: [
        { fiscal_year: 2022 },
        { fiscal_year: 2023 },
        { fiscal_year: 2024 },
        { fiscal_year: 2025 },
      ],
      assumptionSets: {
        dcf: {
          low: {
            growth: 0.01,
            discountRate: 0.12,
            terminalGrowth: 0.015,
            years: 5,
            provenance: "policy",
            source: "research:bear-case",
            asOf: "2026-01-31",
          },
          high: {
            growth: 0.05,
            discountRate: 0.1,
            terminalGrowth: 0.025,
            years: 5,
            provenance: "policy",
            source: "research:bull-case",
            asOf: "2026-01-31",
          },
        },
      },
    },
    valuation: {
      available: false,
      current_price: 100,
      currency: "USD",
      market_data_as_of: "2026-01-31",
      price_validation: { source: "exchange:official-close", source_ids: ["exchange:official-close"] },
    },
    sources: {
      data_points: [
        { metric: "total_revenue", normalized_value: 1_000, source_id: "filing:income", as_of: "2025-12-31" },
        { metric: "latest_free_cash_flow", normalized_value: 100, source_id: "filing:cashflow", as_of: "2025-12-31" },
        { metric: "cash_and_equivalents", normalized_value: 50, source_id: "filing:balance", as_of: "2025-12-31" },
        { metric: "total_debt", normalized_value: 10, source_id: "filing:balance", as_of: "2025-12-31" },
        { metric: "diluted_shares", normalized_value: 10, source_id: "filing:shares", as_of: "2025-12-31" },
      ],
    },
  };

  const attached = await attachAuroraDecisionSystem(payload, {
    mosaicContext: null,
    explainValuation: async () => null,
  });

  assert.equal(attached.aurora.valuation.status, "research_grade");
  assert.equal(attached.aurora.indicativeValuation.status, "research_grade");
  assert.ok(attached.aurora.indicativeValuation.range.low > 0);
  assert.ok(attached.aurora.indicativeValuation.range.high > attached.aurora.indicativeValuation.range.low);
  assert.equal(attached.aurora.indicativeValuation.range.central, null);
});

test("the AURORA orchestrator preserves documented MOSAIC exposure links from the public company profile", () => {
  const decision = buildAuroraDecisionSystem({
    research: {
      ticker: "GRID",
      company_profile: {
        sector: "Industrials",
        industry: "Electrical Equipment",
        mosaic_exposure_links: [{
          market_id: "global_power_transformers",
          driver: "transformer_input_cost",
          axis: "supply",
          sensitivity: 0.4,
          direction: -1,
          verified: true,
          provenance: "company-filing",
          source_ids: ["filing:10-k"],
          as_of: "2026-01-31",
          confidence: 0.85,
        }],
      },
      financials: { annual: [], ratios: {} },
      valuation: { available: false },
      sources: { data_points: [] },
    },
  });

  assert.equal(decision.exposures.links.length, 1);
  assert.equal(decision.exposures.links[0].marketId, "global_power_transformers");
  assert.equal(decision.exposures.links[0].sourceIds[0], "filing:10-k");
});

test("the AURORA orchestrator preserves an institutional research-grade range without inventing a midpoint", () => {
  const decision = buildAuroraDecisionSystem({
    research: {
      ticker: "RANGE",
      company_profile: { sector: "Technology", industry: "Software", currency: "USD" },
      financials: { annual: [], ratios: {} },
      valuation: {
        available: true,
        status: "research_grade",
        primary_method: "owner_earnings_dcf",
        currency: "USD",
        range: { low: 80, central: null, high: 120 },
      },
      sources: { data_points: [] },
    },
  });

  assert.equal(decision.valuation.status, "research_grade");
  assert.deepEqual(decision.valuation.range, { low: 80, high: 120 });
});
