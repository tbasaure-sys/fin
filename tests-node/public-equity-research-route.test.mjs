import assert from "node:assert/strict";
import test from "node:test";

process.env.BLS_PRIME_STORAGE_BACKEND = "memory";

const { POST } = await import("../app/api/public/equity-research/route.js");

const RECENT_MARKET_DATE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const RECENT_RETRIEVED_AT = new Date().toISOString();
const RECENT_FINANCIAL_DATE = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const RECENT_QUARTER_DATES = [
  RECENT_FINANCIAL_DATE,
  ...[135, 225, 315]
    .map((days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
];
const RECENT_SEC_ACCESSION = "0000723125-26-000036";

function completeCoverage() {
  return {
    score: 100,
    status: "complete",
    expected_metrics: 19,
    covered_expected_metrics: 19,
    missing_expected_metrics: [],
    sourced_points_missing_ok_source: [],
    calculated_points_missing_formula: [],
  };
}

function completeDecisionReadyEvidencePoints() {
  const calculated = (metric, normalizedValue) => ({
    metric,
    normalized_value: normalizedValue,
    claim_tag: "calculated_metric",
    formula: `reconciled calculation for ${metric}`,
  });
  return [
    { metric: "company_profile", normalized_value: "Micron Technology, Inc.", claim_tag: "sourced_fact", source_id: "fmp:profile" },
    calculated("latest_revenue", 100),
    calculated("latest_diluted_shares", 10),
    calculated("latest_free_cash_flow", 15),
    calculated("revenue_cagr_5y", 0.08),
    calculated("gross_margin", 0.32),
    calculated("operating_margin", 0.18),
    calculated("fcf_margin", 0.15),
    calculated("roic", 0.14),
    calculated("net_debt", 10),
    { metric: "base_fcf_margin", normalized_value: 0.16, claim_tag: "assumption", formula: "normalized through-cycle margin" },
    { metric: "wacc", normalized_value: 0.09, claim_tag: "assumption", formula: "price-independent operating risk rate" },
    { metric: "terminal_growth", normalized_value: 0.02, claim_tag: "assumption", formula: "bounded below the discount rate" },
    { metric: "current_price", normalized_value: 104.5, claim_tag: "sourced_fact", source_id: "fmp:quote" },
    calculated("valuation_range_low", 88),
    calculated("valuation_range_central", 112),
    calculated("valuation_range_high", 139),
    calculated("reverse_dcf_status", "solved"),
    calculated("ev_to_sales", 4.2),
    calculated("price_to_fcf", 18.5),
    { metric: "latest_sec_filing", normalized_value: RECENT_SEC_ACCESSION, claim_tag: "sourced_fact", source_id: "sec:submissions" },
    {
      metric: "financials.ttm.revenue",
      normalized_value: 100,
      claim_tag: "calculated_metric",
      formula: "sum of four quarters reconciled to SEC",
      source_ids: ["fmp:income:quarterly", "sec:companyfacts:income"],
      quarter_dates: RECENT_QUARTER_DATES,
    },
    {
      metric: "financials.ttm.diluted_shares",
      normalized_value: 10,
      claim_tag: "calculated_metric",
      formula: "average diluted shares reconciled to SEC",
      source_ids: ["fmp:income:quarterly", "sec:companyfacts:income"],
      quarter_dates: RECENT_QUARTER_DATES,
    },
  ];
}

function attachMarketRequirementEvidence(payload, {
  price = 104.5,
  marketDate = RECENT_MARKET_DATE,
  status = "solved",
  impliedGrowth = 0.35,
  normalizedMargin = 0.18,
  discountRate = 0.10,
  terminalGrowth = 0.02,
  assetsAdded = 20,
  obligationsDeducted = 30,
} = {}) {
  const operatingCashReserve = 5;
  const cash = assetsAdded + operatingCashReserve;
  payload.valuation.market_requirements = {
    ...payload.valuation.market_requirements,
    reference_price: price,
    market_data_as_of: marketDate,
    currency: "USD",
    price_context: "provider_reconciled",
    assets_added: assetsAdded,
    obligations_deducted: obligationsDeducted,
  };
  payload.valuation.price_validation = {
    ...(payload.valuation.price_validation || {}),
    denominator_reconciled: true,
    reported_diluted_shares: 10,
    valuation_shares: 10,
    adr_conversion: null,
  };
  payload.valuation.equity_bridge = {
    exact: true,
    complete: true,
    calculation_complete: true,
    cash_and_equivalents: cash,
    operating_cash_reserve: operatingCashReserve,
    excess_cash: assetsAdded,
    non_operating_investments: 0,
    total_debt: obligationsDeducted,
    preferred_stock: 0,
    minority_interest: 0,
    lease_liabilities_not_in_debt: 0,
    unfunded_pension_liability: 0,
    assets_added: assetsAdded,
    obligations_deducted: obligationsDeducted,
    scenario_obligations: { bear: obligationsDeducted, base: obligationsDeducted, bull: obligationsDeducted },
    pension_scenario_obligations: { bear: 0, base: 0, bull: 0 },
    pension_claim_reconciliation: { passed: true },
    missing_optional_fields: [],
    unresolved_claims: [],
    uncertainty_upper_bound: 0,
    cash_separation: {
      complete: true,
      operating_cash_reserve: operatingCashReserve,
      excess_cash: assetsAdded,
      total_liquid_assets: cash,
      excess_liquid_assets: assetsAdded,
      non_operating_investments: 0,
      assets_added_to_equity: assetsAdded,
    },
  };
  payload.valuation.structural_scale_bridge = {
    ...(payload.valuation.structural_scale_bridge || {}),
    equity_bridge_inputs_reconciled: true,
    equity_bridge_reconciliation: {
      passed: true,
      materiality_threshold: 0.5,
      materiality_revenue_threshold: 0.5,
      materiality_market_cap_threshold: price * 10 * 0.01,
      materiality_market_cap: price * 10,
      materiality_valuation_shares: 10,
      materiality_share_basis: "reconciled_listing_shares",
      required_metrics: ["cash", "total_debt"],
      metrics: [
        {
          metric: "cash",
          passed: true,
          current_value: cash,
          calculated_value: cash,
          provider_value: cash,
          difference: 0,
          maximum_difference: 0.03,
          basis: "provider_ttm_balance",
        },
        {
          metric: "total_debt",
          passed: true,
          current_value: obligationsDeducted,
          calculated_value: obligationsDeducted,
          provider_value: obligationsDeducted,
          difference: 0,
          maximum_difference: 0.03,
          basis: "provider_ttm_balance",
        },
      ],
      provider_balance_date: RECENT_FINANCIAL_DATE,
      provider_balance_date_current: true,
      financial_currency: "USD",
      market_currency: "USD",
      provider_balance_currency: "USD",
      currency_reconciled: true,
    },
  };
  payload.valuation.financial_data_as_of = RECENT_FINANCIAL_DATE;
  payload.financials = {
    ...(payload.financials || {}),
    ttm: {
      date: RECENT_FINANCIAL_DATE,
      revenue: 100,
      diluted_shares: 10,
      cash,
      total_debt: obligationsDeducted,
      non_operating_investments: 0,
      preferred_stock: 0,
      minority_interest: 0,
      lease_liabilities_not_in_debt: 0,
      unfunded_pension_liability: 0,
      reported_currency: "USD",
      ttm_validation: {
        discrete_periods_confirmed: true,
        provider_ttm_balance_date: RECENT_FINANCIAL_DATE,
        provider_ttm_balance_date_current: true,
        provider_ttm_balance_date_gap_days: 0,
        provider_ttm_dates: { balance: RECENT_FINANCIAL_DATE },
        provider_ttm_date_gaps_days: { balance: 0 },
        provider_ttm_currency: "USD",
        provider_ttm_balance_currency: "USD",
        provider_ttm_balance_currency_reconciled: true,
        calculated_currency: "USD",
        currency_reconciled: true,
        provider_ttm_checks: [
          {
            metric: "cash",
            passed: true,
            calculated_value: cash,
            provider_value: cash,
            difference: 0,
            maximum_difference: 0.03,
          },
          {
            metric: "total_debt",
            passed: true,
            calculated_value: obligationsDeducted,
            provider_value: obligationsDeducted,
            difference: 0,
            maximum_difference: 0.03,
          },
        ],
      },
    },
  };
  payload.sources.records = [
    ...(payload.sources.records || []).filter((record) => ![
      "fmp:quote",
      "fmp:prices",
      "fmp:income:quarterly",
      "fmp:balance:quarterly",
      "fmp:balance:ttm",
      "sec:companyfacts:income",
    ].includes(record?.source_id)),
    { source_id: "fmp:quote", provider: "fmp", endpoint_or_filing: "quote/MU", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 1 },
    { source_id: "fmp:prices", provider: "fmp", endpoint_or_filing: "historical-price-eod/full?symbol=MU", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 10 },
    { source_id: "fmp:income:quarterly", provider: "fmp", endpoint_or_filing: "income-statement/MU?period=quarter&limit=8", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 8 },
    { source_id: "fmp:balance:quarterly", provider: "fmp", endpoint_or_filing: "balance-sheet-statement/MU?period=quarter&limit=8", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 8 },
    { source_id: "fmp:balance:ttm", provider: "fmp", endpoint_or_filing: "balance-sheet-statement-ttm/MU", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 1 },
    {
      source_id: "sec:companyfacts:income",
      provider: "sec-edgar",
      endpoint_or_filing: "api/xbrl/companyfacts/CIK{resolved_from_MU}.json",
      status: "ok",
      retrieved_at: RECENT_RETRIEVED_AT,
      row_count: 5,
      targets_covered: ["revenue", "weightedAverageShsOutDil"],
    },
  ];
  payload.sources.data_points = [
    { metric: "latest_revenue", normalized_value: 100, claim_tag: "calculated_metric", formula: "sum of four reconciled quarters" },
    { metric: "latest_diluted_shares", normalized_value: 10, claim_tag: "calculated_metric", formula: "average diluted shares across four reconciled quarters" },
    { metric: "financials.ttm.revenue", normalized_value: 100, claim_tag: "calculated_metric", formula: "sum of four quarters reconciled to SEC", source_ids: ["fmp:income:quarterly", "sec:companyfacts:income"], quarter_dates: RECENT_QUARTER_DATES },
    { metric: "financials.ttm.diluted_shares", normalized_value: 10, claim_tag: "calculated_metric", formula: "average diluted shares reconciled to SEC", source_ids: ["fmp:income:quarterly", "sec:companyfacts:income"], quarter_dates: RECENT_QUARTER_DATES },
    { metric: "financials.ttm.cash", normalized_value: cash, claim_tag: "calculated_metric", formula: "latest balance observation reconciled to provider TTM", source_ids: ["fmp:balance:quarterly", "fmp:balance:ttm"], quarter_dates: RECENT_QUARTER_DATES },
    { metric: "financials.ttm.total_debt", normalized_value: obligationsDeducted, claim_tag: "calculated_metric", formula: "latest balance observation reconciled to provider TTM", source_ids: ["fmp:balance:quarterly", "fmp:balance:ttm"], quarter_dates: RECENT_QUARTER_DATES },
    { metric: "financials.ttm.non_operating_investments", normalized_value: 0, claim_tag: "calculated_metric", formula: "latest explicit balance observation", source_ids: ["fmp:balance:quarterly", "fmp:balance:ttm"], quarter_dates: RECENT_QUARTER_DATES },
    { metric: "financials.ttm.preferred_stock", normalized_value: 0, claim_tag: "calculated_metric", formula: "latest explicit balance observation", source_ids: ["fmp:balance:quarterly", "fmp:balance:ttm"], quarter_dates: RECENT_QUARTER_DATES },
    { metric: "financials.ttm.minority_interest", normalized_value: 0, claim_tag: "calculated_metric", formula: "latest explicit balance observation", source_ids: ["fmp:balance:quarterly", "fmp:balance:ttm"], quarter_dates: RECENT_QUARTER_DATES },
    { metric: "financials.ttm.lease_liabilities_not_in_debt", normalized_value: 0, claim_tag: "calculated_metric", formula: "latest explicit balance observation", source_ids: ["fmp:balance:quarterly", "fmp:balance:ttm"], quarter_dates: RECENT_QUARTER_DATES },
    { metric: "financials.ttm.unfunded_pension_liability", normalized_value: 0, claim_tag: "calculated_metric", formula: "latest explicit balance observation", source_ids: ["fmp:balance:quarterly", "fmp:balance:ttm"], quarter_dates: RECENT_QUARTER_DATES },
    { metric: "current_price", normalized_value: price, claim_tag: "sourced_fact", source_id: "fmp:quote" },
    { metric: "wacc", normalized_value: discountRate, claim_tag: "assumption", formula: "price-independent operating risk rate" },
    { metric: "terminal_growth", normalized_value: terminalGrowth, claim_tag: "assumption", formula: "bounded below the discount rate" },
    { metric: "reverse_dcf_status", normalized_value: status, claim_tag: "calculated_metric", formula: "bounded reverse-valuation solve status" },
    { metric: "market_requirement_implied_revenue_cagr", normalized_value: impliedGrowth, claim_tag: "calculated_metric", formula: "binary search where price equals reconciled equity value" },
    { metric: "market_requirement_normalized_margin", normalized_value: normalizedMargin, claim_tag: "calculated_metric", formula: "through-cycle operating FCFF after SBC divided by revenue" },
    { metric: "market_requirement_assets_added", normalized_value: assetsAdded, claim_tag: "calculated_metric", formula: "excess cash plus non-operating investments", source_ids: ["fmp:balance:quarterly", "fmp:balance:ttm"] },
    { metric: "market_requirement_obligations_deducted", normalized_value: obligationsDeducted, claim_tag: "calculated_metric", formula: "debt plus senior claims", source_ids: ["fmp:balance:quarterly", "fmp:balance:ttm"] },
  ];
  const coverage = {
    score: 84,
    status: "partial",
    expected_metrics: 19,
    covered_expected_metrics: 16,
    missing_expected_metrics: ["valuation_range_central", "ev_to_sales", "price_to_fcf"],
    sourced_points_missing_ok_source: [],
    calculated_points_missing_formula: [],
  };
  payload.sources.coverage = coverage;
  payload.audit = {
    ...(payload.audit || {}),
    status: "needs_attention",
    findings: [
      { severity: "high", code: "valuation_not_decision_ready", message: "expected structural block" },
      { severity: "medium", code: "valuation_unavailable", message: "expected unpublished value" },
    ],
    coverage: { ...coverage },
  };
  return payload;
}

function request(body, { trustedIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`, forwardedFor = `spoof-${Math.random()}` } = {}) {
  return new Request("http://localhost/api/public/equity-research", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-forwarded-for": trustedIp,
      "x-forwarded-for": forwardedFor,
    },
    body: JSON.stringify(body),
  });
}

function publicValuationFixture(status, dataPoints = []) {
  const decisionReady = status === "decision_ready";
  const coverage = decisionReady
    ? completeCoverage()
    : {
      score: 95,
      status: "pass",
      expected_metrics: 19,
      covered_expected_metrics: 18,
      missing_expected_metrics: ["valuation_range_central"],
      sourced_points_missing_ok_source: [],
      calculated_points_missing_formula: [],
    };
  const fixtureDataPoints = decisionReady && dataPoints.length === 0
    ? completeDecisionReadyEvidencePoints()
    : dataPoints;
  const scenarioInputs = {
    bear: {
      discountRate: 0.11,
      terminalGrowth: 0.015,
      forecast: [
        { year: 1, revenue: 90, revenue_growth: -0.10, cash_flow: 4.5 },
        { year: 2, revenue: 82, revenue_growth: -0.0889, cash_flow: 4.1 },
        { year: 3, revenue: 75, revenue_growth: -0.0854, cash_flow: 3.75 },
      ],
    },
    base: {
      discountRate: 0.09,
      terminalGrowth: 0.02,
      forecast: [
        { year: 1, revenue: 105, revenue_growth: 0.05, cash_flow: 15.75 },
        { year: 2, revenue: 110, revenue_growth: 0.0476, cash_flow: 16.5 },
        { year: 3, revenue: 115, revenue_growth: 0.0455, cash_flow: 17.25 },
      ],
    },
    bull: {
      discountRate: 0.08,
      terminalGrowth: 0.025,
      forecast: [
        { year: 1, revenue: 120, revenue_growth: 0.20, cash_flow: 30 },
        { year: 2, revenue: 140, revenue_growth: 0.1667, cash_flow: 35 },
        { year: 3, revenue: 160, revenue_growth: 0.1429, cash_flow: 40 },
      ],
    },
  };
  const scenarios = Object.entries(scenarioInputs).map(([name, scenario]) => ({
    name,
    assumptions: {
      discount_rate: scenario.discountRate,
      terminal_growth: scenario.terminalGrowth,
      internal_secret: "Authorization: Bearer SECRET",
    },
    forecast: scenario.forecast,
    intrinsic_value_per_share: 987_654_321,
    terminal_value: 876_543_210,
    internal_prompt: "apikey=SECRET",
  }));

  return {
    ok: true,
    ticker: "MU",
    mode: "quick",
    generated_at: "2026-07-15T12:00:00.000Z",
    company_profile: { name: "Micron Technology, Inc.", currency: "USD" },
    financials: {
      annual: [],
      ttm: { date: RECENT_FINANCIAL_DATE, revenue: 100, diluted_shares: 10 },
      ratios: { latest_revenue: 100, latest_fcf: 15, fcf_margin: 0.15 },
      quality_flags: [],
    },
    valuation: {
      model_version: "institutional_valuation_v3",
      available: true,
      status,
      archetype: "capacity_cycle",
      primary_method: "through_cycle_fcff_dcf",
      current_price: 104.5,
      currency: "USD",
      market_data_as_of: RECENT_MARKET_DATE,
      financial_data_as_of: RECENT_FINANCIAL_DATE,
      range: { low: 88, central: 112, high: 139 },
      selected_value: 112,
      scenarios,
      methods: [{ key: "through_cycle_fcff_dcf", value_per_share: 112, internal_secret: "SECRET" }],
      reverse_dcf: { available: true, implied_revenue_cagr: 0.5, internal_secret: "SECRET" },
      price_validation: decisionReady
        ? {
          status: "validated",
          usable: true,
          provider_corroborated: true,
          independent_price_observation: true,
          sources: ["FMP stable quote", "Official market close"],
          independent_observation: {
            source_id: "market:independent-close",
            source_family: "official_exchange_feed",
            price: 104.5,
            as_of: RECENT_MARKET_DATE,
            currency: "USD",
          },
        }
        : {
          status: "provider_reconciled",
          usable: false,
          research_usable: true,
          provider_corroborated: true,
          independent_price_observation: false,
          sources: ["FMP stable quote", "FMP latest close"],
        },
      cycle_normalization: {
        available: true,
        years: 10,
        coverage_complete: true,
        current_regime_supported: true,
      },
      cycle_revenue_normalization: {
        structural_break: true,
        structural_break_mean_reversion: { horizon_years: 3 },
      },
      reliability: {
        usable: true,
        status: decisionReady ? "high" : "medium",
        score: decisionReady ? 0.90 : 0.88,
        reasons: [],
        limitations: decisionReady ? [] : ["No se publica un valor central."],
      },
    },
    sources: {
      coverage,
      records: [
        { source_id: "fmp:profile", provider: "fmp", endpoint_or_filing: "profile/MU", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 1 },
        { source_id: "fmp:income:quarterly", provider: "fmp", endpoint_or_filing: "income-statement/MU?period=quarter&limit=8", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 8 },
        {
          source_id: "sec:companyfacts:income",
          provider: "sec-edgar",
          endpoint_or_filing: "api/xbrl/companyfacts/CIK{resolved_from_MU}.json",
          status: "ok",
          retrieved_at: RECENT_RETRIEVED_AT,
          row_count: 5,
          targets_covered: ["revenue", "weightedAverageShsOutDil"],
        },
        {
          source_id: "sec:submissions",
          provider: "sec-edgar",
          endpoint_or_filing: "submissions/CIK{resolved_from_MU}.json",
          status: "ok",
          retrieved_at: RECENT_RETRIEVED_AT,
          row_count: 5,
        },
        { source_id: "fmp:quote", provider: "fmp", endpoint_or_filing: "quote/MU", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 1 },
        { source_id: "fmp:prices", provider: "fmp", endpoint_or_filing: "historical-price-eod/full?symbol=MU", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 10 },
        {
          source_id: "market:independent-close",
          provider: "Official exchange feed",
          source_family: "official_exchange_feed",
          status: "ok",
          retrieved_at: RECENT_RETRIEVED_AT,
          observed_price: 104.5,
          as_of: RECENT_MARKET_DATE,
          currency: "USD",
        },
      ],
      data_points: fixtureDataPoints,
    },
    audit: { status: "pass", findings: [], coverage: { ...coverage } },
    agents: { agents: [], claims: [] },
    downloads: [],
  };
}

test("public AURORA uses the canonical backend and redacts unsupported precision", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";

  const backendPayload = {
    ok: true,
    ticker: "MU",
    mode: "quick",
    company_profile: { name: "Micron Technology, Inc.", currency: "USD" },
    financials: { annual: [], ratios: {}, quality_flags: [] },
    valuation: {
      model_version: "institutional_valuation_v3",
      available: true,
      status: "research_grade",
      primary_method: "through_cycle_fcff_dcf",
      current_price: 983.12,
      currency: "USD",
      market_data_as_of: RECENT_MARKET_DATE,
      range: { low: 81, central: 174, high: 274 },
      selected_value: 174,
      scenarios: [{ name: "base", method: "through_cycle_fcff_dcf", intrinsic_value_per_share: 174 }],
      methods: [{ key: "through_cycle_fcff_dcf", value_per_share: 174, weight: 1 }],
      reverse_dcf: { available: true, implied_revenue_cagr: 0.5, weight: 0 },
      price_validation: { status: "validated", usable: true },
      reliability: { usable: true, status: "medium", score: 0.69, reasons: [], limitations: [] },
    },
    report_markdown: "# MU\n\nCentral estimate: $174\n",
    sources: {
      coverage: {
        score: 95,
        status: "pass",
        expected_metrics: 1,
        covered_expected_metrics: 0,
        missing_expected_metrics: ["valuation_range_central"],
        sourced_points_missing_ok_source: [],
        calculated_points_missing_formula: [],
      },
      records: [],
      data_points: [{ metric: "valuation.range.central", normalized_value: 174 }],
    },
    audit: { status: "pass", findings: [] },
    agents: { agents: [{ id: "valuation_agent", summary: "Fair value is $174." }], claims: [] },
    artifacts: { report_md: true, model_xlsx: true, sources_json: true },
    downloads: [{
      filename: "MU_model.xlsx",
      media_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      encoding: "base64",
      content_base64: Buffer.from("174").toString("base64"),
    }],
  };

  globalThis.fetch = async (url) => {
    assert.match(String(url), /canonical-research\.example\/api\/equity-research\?ticker=MU&mode=quick/);
    return new Response(JSON.stringify(backendPayload), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const response = await POST(request({ ticker: "mu", mode: "full" }));
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.valuation.model_version, "institutional_valuation_v3");
    assert.deepEqual(payload.valuation.range, { low: 81, central: null, high: 274 });
    assert.equal(payload.valuation.selected_value, null);
    assert.deepEqual(payload.valuation.scenarios, []);
    assert.deepEqual(payload.sources.data_points, []);
    assert.equal(payload.agents.agents.length, 0);
    assert.equal(payload.downloads.some((artifact) => artifact.filename.endsWith(".xlsx")), false);
    assert.equal(payload.history.storage_status, "public_session_only");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA preserves a safe research range, contextual price, and bounded uncertainty summary", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";

  const backendPayload = {
    ok: true,
    ticker: "MU",
    mode: "quick",
    generated_at: "2026-07-15T12:00:00.000Z",
    company_profile: { name: "Micron Technology, Inc.", currency: "USD" },
    financials: { annual: [], ratios: { latest_revenue: 37_380_000_000 }, quality_flags: [] },
    valuation: {
      model_version: "institutional_valuation_v3",
      available: true,
      status: "research_grade",
      archetype: "capacity_cycle",
      primary_method: "through_cycle_fcff_dcf",
      current_price: 104.5,
      currency: "USD",
      market_data_as_of: RECENT_MARKET_DATE,
      financial_data_as_of: "2026-05-29",
      range: { low: 88, central: 112, high: 139 },
      selected_value: 112,
      scenarios: [{ name: "base", intrinsic_value_per_share: 112, internal_prompt: "SECRET" }],
      price_validation: {
        status: "provider_reconciled",
        usable: false,
        research_usable: true,
        provider_corroborated: true,
        independent_price_observation: false,
        sources: ["FMP quote", "FMP latest close", "Authorization: Bearer SECRET"],
      },
      equity_bridge: {
        complete: false,
        exact: false,
        calculation_complete: true,
        missing_optional_fields: ["unfunded_pension_liability"],
        unresolved_claims: [{ field: "unfunded_pension_liability", upper_bound: 999_000_000, internal_basis: "SECRET" }],
        obligations_deducted: 6_376_000_000,
      },
      cycle_normalization: {
        available: true,
        years: 10,
        coverage_complete: true,
        current_regime_supported: true,
        observations: [{ date: "2025-08-28", value: 0.42, internal_source: "SECRET" }],
      },
      cycle_revenue_normalization: {
        structural_break: true,
        structural_break_mean_reversion: { horizon_years: 3, internal_policy: "SECRET" },
        observations: [{ date: "2025-08-28", value: 90_274_000_000, internal_source: "SECRET" }],
      },
      reliability: {
        usable: true,
        status: "medium",
        score: 0.66,
        reasons: ["El rango incorpora una obligación no informada como incertidumbre acotada."],
        limitations: ["No se publica un valor central."],
      },
    },
    sources: {
      coverage: {
        status: "pass",
        score: 95,
        expected_metrics: 19,
        covered_expected_metrics: 18,
        missing_expected_metrics: ["valuation_range_central"],
        sourced_points_missing_ok_source: [],
        calculated_points_missing_formula: [],
      },
      records: [
        { source_id: "fmp:quote", provider: "fmp", endpoint_or_filing: "quote/MU", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 1 },
        { source_id: "fmp:prices", provider: "fmp", endpoint_or_filing: "historical-price-eod/full?symbol=MU", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 10 },
      ],
      data_points: [],
    },
    audit: { status: "pass", findings: [] },
    agents: { agents: [], claims: [] },
    downloads: [],
  };

  globalThis.fetch = async () => new Response(JSON.stringify(backendPayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const response = await POST(request({ ticker: "MU", mode: "quick" }));
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    assert.equal(response.status, 200);
    assert.equal(payload.valuation.status, "research_grade");
    assert.deepEqual(payload.valuation.range, { low: 88, central: null, high: 139 });
    assert.equal(payload.valuation.selected_value, null);
    assert.equal(payload.valuation.current_price, 104.5);
    assert.equal(payload.valuation.price_validation.status, "provider_reconciled");
    assert.equal(payload.valuation.price_validation.usable, false);
    assert.equal(payload.valuation.price_validation.research_usable, true);
    assert.deepEqual(payload.valuation.price_validation.sources, ["FMP"]);
    assert.deepEqual(payload.valuation.equity_bridge, {
      complete: false,
      exact: false,
      calculation_complete: true,
      unresolved_fields: ["unfunded_pension_liability"],
    });
    assert.deepEqual(payload.valuation.cycle_normalization, {
      available: true,
      years: 10,
      coverage_complete: true,
      current_regime_supported: true,
      structural_break: true,
      mean_reversion_years: 3,
    });
    assert.deepEqual(payload.valuation.scenarios, []);
    assert.equal(payload.valuation.reverse_dcf.available, false);
    assert.equal(serialized.includes("999000000"), false);
    assert.equal(serialized.includes("6376000000"), false);
    assert.equal(serialized.includes("SECRET"), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA redacts a current-price data point when the presentation gate withholds that price", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";

  const backendPayload = {
    ok: true,
    ticker: "MU",
    mode: "quick",
    generated_at: "2026-07-15T12:00:00.000Z",
    company_profile: { name: "Micron Technology, Inc.", currency: "USD" },
    financials: { annual: [], ratios: {}, quality_flags: [] },
    valuation: {
      model_version: "institutional_valuation_v3",
      available: true,
      status: "not_decision_ready",
      primary_method: "through_cycle_fcff_dcf",
      current_price: 123.45,
      currency: "USD",
      market_data_as_of: "2026-06-01",
      range: { low: 88, central: 112, high: 139 },
      price_validation: { status: "stale", usable: false, sources: ["FMP"] },
      reliability: {
        usable: false,
        status: "blocked",
        score: 0.4,
        reasons: ["El precio no está vigente."],
        limitations: [],
      },
    },
    sources: {
      coverage: { status: "needs_attention", score: 70 },
      records: [],
      data_points: [{
        metric: "current_price",
        raw_value: "123.45",
        normalized_value: 123.45,
        unit: "USD/share",
        source_id: "fmp:quote",
        claim_tag: "source_backed",
      }],
    },
    audit: { status: "needs_attention", findings: [] },
    agents: { agents: [], claims: [] },
    downloads: [],
  };

  globalThis.fetch = async () => new Response(JSON.stringify(backendPayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const response = await POST(request({ ticker: "MU", mode: "quick" }));
    const payload = await response.json();
    const currentPricePoint = payload.sources.data_points.find((point) => point.metric === "current_price");
    const sourcesDownload = payload.downloads.find((download) => download.filename.endsWith("_sources.json"));
    const decodedDownload = Buffer.from(sourcesDownload.content_base64, "base64").toString("utf8");

    assert.equal(response.status, 200);
    assert.equal(payload.valuation.current_price, null);
    assert.equal("raw_value" in currentPricePoint, false);
    assert.equal("formula" in currentPricePoint, false);
    assert.equal(currentPricePoint.normalized_value, null);
    assert.equal(decodedDownload.includes("123.45"), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA exposes only an explicit decision-ready DTO", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";

  const payload = publicValuationFixture("decision_ready");
  payload.generated_at = "2026-07-14T12:00:00.000Z";
  payload.company_profile.internal_note = "SECRET";
  payload.valuation.archetype = "Authorization: Bearer SECRET";
  payload.valuation.cash_flow_basis = "Authorization: Bearer SECRET";
  payload.valuation.scenarios[0].internal_prompt = "SECRET";
  payload.valuation.methods[0].internal_weighting = "SECRET";
  payload.valuation.price_validation.sources.push("Authorization: Bearer SECRET");
  payload.valuation.reliability.score = 0.82;
  payload.valuation.internal_secret = "SECRET";
  payload.sources.records[0].raw_endpoint = "https://user:SECRET@financialmodelingprep.com/token/SECRET?apikey=SECRET#fragment";
  payload.sources.records[0].raw_response = "SECRET";
  payload.audit.internal_trace = "SECRET";
  payload.agents = { agents: [{ id: "valuation_agent", summary: "SECRET" }], final_orchestrator: { prompt: "SECRET" } };
  payload.internal_secret = "SECRET";
  payload.downloads = [{
    filename: "MU_model.xlsx",
    media_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    encoding: "base64",
    content_base64: Buffer.from("SECRET").toString("base64"),
  }];

  globalThis.fetch = async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const response = await POST(request({ ticker: "MU", mode: "full" }));
    const publicPayload = await response.json();
    const serialized = JSON.stringify(publicPayload);

    assert.equal(response.status, 200);
    assert.deepEqual(publicPayload.valuation.range, { low: 88, central: 112, high: 139 });
    assert.equal(publicPayload.valuation.selected_value, 112);
    assert.equal(publicPayload.valuation.archetype, null);
    assert.equal(publicPayload.valuation.primary_method, "through_cycle_fcff_dcf");
    assert.equal(publicPayload.valuation.cash_flow_basis, null);
    assert.equal(publicPayload.sources.records[0].endpoint_or_filing, null);
    assert.deepEqual(publicPayload.valuation.price_validation.sources, ["FMP", "Cierre oficial de mercado"]);
    assert.equal(publicPayload.downloads.some((artifact) => artifact.filename.endsWith(".xlsx")), false);
    assert.equal(publicPayload.agents.agents.length, 0);
    assert.equal(serialized.includes("SECRET"), false);
    assert.equal("internal_secret" in publicPayload, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA withholds a decision-ready valuation when price or evidence provenance is incomplete", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";
  let activePayload = null;
  globalThis.fetch = async () => new Response(JSON.stringify(activePayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const fixtures = [
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.valuation.price_validation.independent_price_observation = false;
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.valuation.price_validation.sources = ["FMP stable quote", "Unknown close"];
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.sources.records = payload.sources.records.filter((record) => record.source_id !== "fmp:prices");
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        const quoteRecord = payload.sources.records.find((record) => record.source_id === "fmp:quote");
        quoteRecord.retrieved_at = "2025-01-01T00:00:00.000Z";
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.valuation.currency = null;
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        delete payload.valuation.price_validation.independent_observation;
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.valuation.price_validation.independent_observation.price = 200;
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.sources.records = payload.sources.records.filter((record) => record.source_id !== "market:independent-close");
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        const independentRecord = payload.sources.records.find((record) => record.source_id === "market:independent-close");
        independentRecord.observed_price = 90;
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        const independentRecord = payload.sources.records.find((record) => record.source_id === "market:independent-close");
        independentRecord.retrieved_at = "2025-01-01T00:00:00.000Z";
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.valuation.price_validation.independent_observation.source_family = "not_independent";
        payload.sources.records.find((record) => record.source_id === "market:independent-close").source_family = "not_independent";
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.sources.records.find((record) => record.source_id === "market:independent-close").source_family = "independent_exchange_feed";
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        const quote = payload.sources.records.find((record) => record.source_id === "fmp:quote");
        payload.sources.records.push({ ...quote, status: "error" });
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        const quote = payload.sources.records.find((record) => record.source_id === "fmp:quote");
        payload.sources.records.unshift({ ...quote, status: "error" });
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        const quote = payload.sources.records.find((record) => record.source_id === "fmp:quote");
        quote.provider = "invented";
        quote.endpoint_or_filing = "quote/AAPL";
        quote.row_count = 0;
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.valuation.financial_data_as_of = "2020-12-31";
        payload.financials.ttm.date = "2020-12-31";
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        const record = payload.sources.records.find((item) => item.source_id === "fmp:income:quarterly");
        record.retrieved_at = "2025-01-01T00:00:00.000Z";
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.sources.coverage = {
          ...completeCoverage(),
          expected_metrics: 1,
          covered_expected_metrics: 1,
        };
        payload.audit.coverage = { ...payload.sources.coverage };
        payload.sources.data_points = [];
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.audit.findings = [{ severity: "medium", code: "valuation_unavailable" }];
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.sources.data_points.find((point) => point.metric === "gross_margin").normalized_value = "0.32";
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.sources.data_points.find((point) => point.metric === "gross_margin").normalized_value = 2.5;
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.sources.data_points.find((point) => point.metric === "ev_to_sales").normalized_value = 1_001;
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.sources.data_points.find((point) => point.metric === "latest_sec_filing").normalized_value = RECENT_FINANCIAL_DATE;
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.valuation.range.low = 87;
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.valuation.range.high = 140;
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        payload.sources.data_points.find((point) => point.metric === "valuation_range_low").normalized_value = "88";
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        const staleQuarterDates = ["2020-03-31", "2021-03-31", "2022-03-31", RECENT_FINANCIAL_DATE];
        for (const metric of ["financials.ttm.revenue", "financials.ttm.diluted_shares"]) {
          payload.sources.data_points.find((point) => point.metric === metric).quarter_dates = staleQuarterDates;
        }
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        const futureQuarterDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const futureQuarterDates = [...RECENT_QUARTER_DATES.slice(0, 3), futureQuarterDate];
        for (const metric of ["financials.ttm.revenue", "financials.ttm.diluted_shares"]) {
          payload.sources.data_points.find((point) => point.metric === metric).quarter_dates = futureQuarterDates;
        }
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        const record = payload.sources.records.find((item) => item.source_id === "sec:companyfacts:income");
        record.provider = "fmp";
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        const record = payload.sources.records.find((item) => item.source_id === "sec:companyfacts:income");
        record.endpoint_or_filing = "api/xbrl/companyfacts/CIK{resolved_from_AAPL}.json";
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("decision_ready");
        const record = payload.sources.records.find((item) => item.source_id === "sec:companyfacts:income");
        record.targets_covered = ["revenue"];
        return payload;
      })(),
    ];

    for (const [index, fixture] of fixtures.entries()) {
      activePayload = fixture;
      const response = await POST(request(
        { ticker: "MU", mode: "quick" },
        { trustedIp: `203.0.113.${160 + index}` },
      ));
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(payload.valuation.range, { low: null, central: null, high: null });
      assert.equal(payload.valuation.selected_value, null);
      const priceContextRemainsValid = index >= 15;
      assert.equal(payload.valuation.current_price, priceContextRemainsValid ? 104.5 : null);
      assert.equal(payload.valuation.price_validation.usable, priceContextRemainsValid);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA canonicalizes company, quality, and audit text without reflecting upstream diagnostics", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";
  const backendPayload = publicValuationFixture("decision_ready");
  backendPayload.company_profile = {
    name: "Micron Authorization: Bearer SECRET https://evil.example",
    sector: "Technology apikey=SECRET",
    industry: "Semiconductors SECRET",
    country: "United States",
    currency: "USD",
    exchange: "NASDAQ",
  };
  backendPayload.financials.quality_flags = [
    {
      severity: "Authorization: Bearer SECRET",
      title: "Traceback https://evil.example apikey=SECRET",
      metric: 0.20,
    },
    {
      severity: "high",
      title: "Receivables growing faster than revenue",
      metric: 0.30,
    },
  ];
  backendPayload.audit.findings = [{
    severity: "Authorization: Bearer SECRET",
    code: "apikey_SECRET",
    message: "Traceback at https://evil.example Authorization: Bearer SECRET",
  }];
  backendPayload.report_markdown = "Authorization: Bearer SECRET https://evil.example";
  globalThis.fetch = async () => new Response(JSON.stringify(backendPayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const response = await POST(request(
      { ticker: "MU", mode: "quick" },
      { trustedIp: "203.0.113.104" },
    ));
    const payload = await response.json();
    const decodedDownloads = payload.downloads.map((download) => (
      Buffer.from(download.content_base64, "base64").toString("utf8")
    )).join("\n");
    const serialized = JSON.stringify(payload);

    assert.equal(response.status, 200);
    assert.equal(payload.company_profile.name, null);
    assert.equal(payload.company_profile.sector, "Otro sector");
    assert.equal(payload.company_profile.industry, "Otra industria");
    assert.equal(payload.company_profile.country, "United States");
    assert.deepEqual(payload.financials.quality_flags, [
      {
        severity: "info",
        title: "Control de calidad pendiente",
        metric: 0.20,
      },
      {
        severity: "high",
        title: "Cuentas por cobrar crecen más rápido que los ingresos",
        metric: 0.30,
      },
    ]);
    assert.deepEqual(payload.audit.findings, [{
      severity: "medium",
      code: "review_required",
      message: "Un control de datos requiere revisión.",
    }]);
    assert.doesNotMatch(serialized, /SECRET|Authorization|Bearer|apikey|https?:\/\/|www\.|traceback|stack trace/i);
    assert.doesNotMatch(decodedDownloads, /SECRET|Authorization|Bearer|apikey|https?:\/\/|www\.|traceback|stack trace/i);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA preserves safe company names and explains evidence strength and data dates", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";
  const backendPayload = publicValuationFixture("decision_ready");
  backendPayload.company_profile = {
    name: "Micron Technology, Inc.",
    sector: "Technology",
    industry: "Semiconductors",
    country: "United States",
    currency: "USD",
    exchange: "NASDAQ",
  };
  backendPayload.financials.quality_flags = [{
    severity: "high",
    title: "Negative FCF despite positive earnings",
    metric: -0.05,
  }];
  globalThis.fetch = async () => new Response(JSON.stringify(backendPayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const response = await POST(request(
      { ticker: "MU", mode: "quick" },
      { trustedIp: "203.0.113.105" },
    ));
    const payload = await response.json();
    const reportDownload = payload.downloads.find((download) => download.filename.endsWith("_report.md"));
    const decodedReport = Buffer.from(reportDownload.content_base64, "base64").toString("utf8");

    assert.equal(response.status, 200);
    assert.equal(payload.company_profile.name, "Micron Technology, Inc.");
    assert.equal(payload.company_profile.sector, "Tecnología");
    assert.equal(payload.company_profile.industry, "Semiconductores");
    assert.deepEqual(payload.financials.quality_flags, [{
      severity: "high",
      title: "Flujo de caja libre negativo pese a utilidades positivas",
      metric: -0.05,
    }]);
    assert.match(payload.report_markdown, new RegExp(`Estados financieros al: ${RECENT_FINANCIAL_DATE}\\.`));
    assert.match(payload.report_markdown, new RegExp(`Precio de mercado al: ${RECENT_MARKET_DATE}\\.`));
    assert.match(payload.report_markdown, /Método principal: Flujo de caja normalizado a través del ciclo\./);
    assert.doesNotMatch(payload.report_markdown, /through_cycle_fcff_dcf/);
    assert.match(
      payload.report_markdown,
      /Solidez de la evidencia: Alta · 90\/100\. Índice de controles; no probabilidad de acierto\./,
    );
    assert.doesNotMatch(payload.report_markdown, /Confianza de la lectura/);
    assert.equal(decodedReport, payload.report_markdown);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA structurally allowlists evidence points for research-grade and decision-ready responses", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";
  const repeatedAnnualPoints = Array.from({ length: 200 }, (_, index) => ({
    metric: `financials.annual.${1800 + index}-12-31.revenue`,
    raw_value: "Authorization: Bearer SECRET",
    normalized_value: 1_000 + index,
    unit: "apikey=SECRET",
    source_id: "fmp:income:annual",
    claim_tag: "sourced_fact",
    formula: "SECRET",
  }));
  const adversarialPoints = [
    {
      metric: "latest_revenue",
      raw_value: "Authorization: Bearer SECRET",
      normalized_value: 37_380_000_000,
      unit: "apikey=SECRET",
      source_id: "fmp:income:ttm",
      claim_tag: "sourced_fact",
      formula: "SECRET",
    },
    {
      metric: "fcf_margin",
      raw_value: "SECRET",
      normalized_value: 0.21,
      unit: "Authorization: Bearer SECRET",
      source_id: "apikey=SECRET",
      claim_tag: "calculated_metric",
      formula: "SECRET",
    },
    {
      metric: "Authorization: Bearer SECRET",
      raw_value: "SECRET",
      normalized_value: 1,
      unit: "SECRET",
      source_id: "fmp:profile",
      claim_tag: "sourced_fact",
      formula: "SECRET",
    },
    {
      metric: "operating_margin",
      raw_value: "SECRET",
      normalized_value: 0.18,
      unit: "ratio",
      source_id: "fmp:income:ttm",
      claim_tag: "Authorization: Bearer SECRET",
      formula: "SECRET",
    },
    {
      metric: "valuation.scenario.bear.assumption.discount_rate",
      raw_value: "SECRET",
      normalized_value: 0.11,
      unit: "ratio",
      source_id: "fmp:profile",
      claim_tag: "assumption",
      formula: "SECRET",
    },
    {
      metric: "valuation.methods.normalized_cash_earnings",
      raw_value: "SECRET",
      normalized_value: 987_654_321,
      unit: "USD/share",
      source_id: "fmp:profile",
      claim_tag: "calculated_metric",
      formula: "SECRET",
    },
    {
      metric: "valuation.reverse_dcf.implied_revenue_cagr",
      raw_value: "SECRET",
      normalized_value: 0.90,
      unit: "ratio",
      source_id: "fmp:quote",
      claim_tag: "calculated_metric",
      formula: "SECRET",
    },
    ...repeatedAnnualPoints,
  ];
  let activePayload = null;
  globalThis.fetch = async () => new Response(JSON.stringify(activePayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    for (const [index, status] of ["research_grade", "decision_ready"].entries()) {
      activePayload = publicValuationFixture(status, adversarialPoints);
      activePayload.sources.coverage.statement_source_provider = "Authorization: Bearer SECRET";
      activePayload.sources.coverage.statement_authority = "apikey=SECRET";
      activePayload.sources.records.push({
        source_id: "Authorization: Bearer SECRET",
        provider: "apikey=SECRET",
        status: "ok",
      });
      const response = await POST(request(
        { ticker: "MU", mode: "quick" },
        { trustedIp: `203.0.113.${80 + index}` },
      ));
      const payload = await response.json();
      const sourcesDownload = payload.downloads.find((download) => download.filename.endsWith("_sources.json"));
      const decodedDownload = Buffer.from(sourcesDownload.content_base64, "base64").toString("utf8");
      const serialized = JSON.stringify(payload.sources);
      const latestRevenue = payload.sources.data_points.find((point) => point.metric === "latest_revenue");
      const fcfMargin = payload.sources.data_points.find((point) => point.metric === "fcf_margin");

      assert.equal(response.status, 200);
      assert.ok(payload.sources.data_points.length <= 128);
      assert.deepEqual(Object.keys(latestRevenue).sort(), [
        "claim_tag",
        "metric",
        "normalized_value",
        "source_id",
        "unit",
      ]);
      assert.deepEqual(latestRevenue, {
        metric: "latest_revenue",
        normalized_value: 37_380_000_000,
        unit: "USD",
        source_id: "fmp:income:ttm",
        claim_tag: "sourced_fact",
      });
      assert.equal(fcfMargin.source_id, null);
      assert.equal(fcfMargin.unit, "ratio");
      assert.equal(payload.sources.data_points.some((point) => point.metric.startsWith("valuation.")), false);
      assert.equal(payload.sources.data_points.some((point) => point.metric.includes("Authorization")), false);
      assert.doesNotMatch(serialized, /SECRET|Authorization|Bearer|apikey/i);
      assert.doesNotMatch(serialized, /"(?:raw_value|formula)"\s*:/i);
      assert.doesNotMatch(decodedDownload, /SECRET|Authorization|Bearer|apikey/i);
      assert.doesNotMatch(decodedDownload, /"(?:raw_value|formula)"\s*:/i);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA publishes only bounded bear, bull, and eligible base valuation drivers", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";
  let activePayload = null;
  globalThis.fetch = async () => new Response(JSON.stringify(activePayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    for (const [index, status] of ["research_grade", "decision_ready"].entries()) {
      activePayload = publicValuationFixture(status);
      const response = await POST(request(
        { ticker: "MU", mode: "quick" },
        { trustedIp: `203.0.113.${90 + index}` },
      ));
      const payload = await response.json();
      const summary = payload.valuation.driver_summary;
      const requirementKeys = summary.requirements.map((item) => item.key);
      const breakerKeys = summary.breakers.map((item) => item.key);
      const serialized = JSON.stringify(summary);

      assert.equal(response.status, 200);
      assert.equal(summary.mean_reversion_years, 3);
      assert.deepEqual(breakerKeys, [
        "bear_revenue_growth",
        "bear_revenue",
        "bear_fcf_margin",
        "bear_discount_rate",
        "bear_terminal_growth",
      ]);
      assert.deepEqual(requirementKeys.slice(0, 5), [
        "bull_revenue_growth",
        "bull_revenue",
        "bull_fcf_margin",
        "bull_discount_rate",
        "bull_terminal_growth",
      ]);
      assert.equal(requirementKeys.some((key) => key.startsWith("base_")), status === "decision_ready");
      assert.deepEqual(summary.breakers.find((item) => item.key === "bear_revenue"), {
        key: "bear_revenue",
        label: "Ingresos normalizados · escenario adverso",
        value: 75,
        unit: "USD",
      });
      assert.deepEqual(summary.requirements.find((item) => item.key === "bull_fcf_margin"), {
        key: "bull_fcf_margin",
        label: "Margen FCF normalizado · escenario favorable",
        value: 0.25,
        unit: "ratio",
      });
      assert.equal(serialized.includes("987654321"), false);
      assert.equal(serialized.includes("876543210"), false);
      assert.doesNotMatch(serialized, /SECRET|Authorization|Bearer|apikey/i);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA exposes bounded market requirements when a structural scale bridge blocks valuation", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";
  const backendPayload = publicValuationFixture("research_grade");
  backendPayload.valuation.status = "not_decision_ready";
  backendPayload.valuation.available = false;
  backendPayload.valuation.range = { low: null, central: null, high: null };
  backendPayload.valuation.selected_value = null;
  backendPayload.valuation.scenarios = [];
  backendPayload.valuation.reason = "Structural scale bridge incomplete.";
  backendPayload.valuation.structural_scale_bridge = {
    passed: false,
    scale_inputs_reconciled: true,
    missing: [
      "capacity_and_asset_turnover_support",
      "organic_or_acquisition_revenue_bridge",
      "segment_reconciliation",
      "Authorization: Bearer SECRET",
    ],
  };
  backendPayload.valuation.reliability = {
    usable: false,
    status: "blocked",
    score: 0.71,
    decision_ready_blockers: ["structural_scale_bridge", "apikey=SECRET"],
    reasons: [],
    limitations: [],
  };
  backendPayload.valuation.market_requirements = {
    available: true,
    status: "solved",
    implied_revenue_cagr: 0.35,
    implied_revenue_cagr_bound: "Authorization: Bearer SECRET",
    normalized_margin: 0.18,
    discount_rate: 0.10,
    terminal_growth: 0.02,
    horizon_years: 5,
    internal_formula: "SECRET",
    reference_price: 104.5,
    market_data_as_of: RECENT_MARKET_DATE,
    currency: "USD",
    price_context: "provider_reconciled",
    value_at_floor: 123.45,
  };
  backendPayload.sources.coverage = {
    score: 84,
    status: "partial",
    expected_metrics: 19,
    covered_expected_metrics: 16,
    missing_expected_metrics: ["valuation_range_central", "ev_to_sales", "price_to_fcf"],
    sourced_points_missing_ok_source: [],
    calculated_points_missing_formula: [],
  };
  backendPayload.audit.coverage = { ...backendPayload.sources.coverage };
  backendPayload.audit.status = "needs_attention";
  backendPayload.audit.findings = [
    { severity: "high", code: "valuation_not_decision_ready", message: "expected structural block" },
    { severity: "medium", code: "valuation_unavailable", message: "expected unpublished value" },
  ];
  attachMarketRequirementEvidence(backendPayload, {
    price: 104.5,
    impliedGrowth: 0.35,
    normalizedMargin: 0.18,
    discountRate: 0.10,
    terminalGrowth: 0.02,
  });
  globalThis.fetch = async () => new Response(JSON.stringify(backendPayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const response = await POST(request(
      { ticker: "MU", mode: "quick" },
      { trustedIp: "203.0.113.102" },
    ));
    const payload = await response.json();
    const serialized = JSON.stringify(payload.valuation);

    assert.equal(response.status, 200);
    assert.equal(payload.valuation.status, "not_decision_ready");
    assert.equal(payload.valuation.current_price, 104.5);
    assert.deepEqual(payload.valuation.market_requirements, {
      available: true,
      status: "solved",
      implied_revenue_cagr: 0.35,
      bound: null,
      normalized_cash_flow_margin: 0.18,
      discount_rate: 0.10,
      terminal_growth: 0.02,
      horizon_years: 5,
      assets_added: 20,
      obligations_deducted: 30,
      currency: "USD",
      price_context: "contextual",
      reference_price: 104.5,
      market_data_as_of: RECENT_MARKET_DATE,
    });
    assert.equal(payload.valuation.blocking_gap, "structural_scale_bridge");
    assert.deepEqual(payload.valuation.pending_checks, [
      "capacity_and_asset_turnover_support",
      "organic_or_acquisition_revenue_bridge",
      "segment_reconciliation",
    ]);
    assert.equal(payload.valuation.reverse_dcf.implied_revenue_cagr, null);
    assert.deepEqual(payload.sources.coverage.missing_expected_metrics, [
      "valuation_range_central",
      "ev_to_sales",
      "price_to_fcf",
    ]);
    assert.equal(serialized.includes("983.12"), false);
    assert.equal(serialized.includes("123.45"), false);
    assert.equal(serialized.includes("Structural scale bridge incomplete."), false);
    assert.doesNotMatch(serialized, /SECRET|Authorization|Bearer|apikey|internal_formula/i);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA withholds drivers and market requirements when audit or evidence gates fail", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";
  let activePayload = null;
  globalThis.fetch = async () => new Response(JSON.stringify(activePayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  const structuralPayload = () => {
    const payload = publicValuationFixture("research_grade");
    payload.valuation.status = "not_decision_ready";
    payload.valuation.available = false;
    payload.valuation.range = { low: null, central: null, high: null };
    payload.valuation.scenarios = [];
    payload.valuation.structural_scale_bridge = {
      passed: false,
      scale_inputs_reconciled: true,
      missing: ["capacity_and_asset_turnover_support"],
    };
    payload.valuation.reliability = {
      usable: false,
      status: "blocked",
      score: 0.60,
      decision_ready_blockers: ["structural_scale_bridge"],
      reasons: [],
      limitations: [],
    };
    payload.valuation.market_requirements = {
      available: true,
      status: "solved",
      implied_revenue_cagr: 0.30,
      normalized_margin: 0.18,
      discount_rate: 0.10,
      terminal_growth: 0.02,
      horizon_years: 5,
    };
    payload.sources.coverage = {
      score: 100,
      status: "complete",
      expected_metrics: 19,
      covered_expected_metrics: 19,
      missing_expected_metrics: [],
      sourced_points_missing_ok_source: [],
      calculated_points_missing_formula: [],
    };
    payload.audit.coverage = { ...payload.sources.coverage };
    return attachMarketRequirementEvidence(payload, {
      price: 104.5,
      impliedGrowth: 0.30,
      normalizedMargin: 0.18,
      discountRate: 0.10,
      terminalGrowth: 0.02,
    });
  };

  const attachMaterialPensionEvidence = (payload) => {
    const pension = 1;
    const debt = payload.financials.ttm.total_debt;
    const obligations = debt + pension;
    const pensionBasis = "benefit_obligation_less_plan_assets";
    payload.financials.ttm.unfunded_pension_liability = pension;
    payload.financials.ttm.unfunded_pension_liability_basis = pensionBasis;
    payload.financials.ttm.unfunded_pension_liability_as_of = RECENT_FINANCIAL_DATE;
    payload.financials.ttm.unfunded_pension_liability_source_id = "sec:companyfacts:balance";
    payload.valuation.equity_bridge.unfunded_pension_liability = pension;
    payload.valuation.equity_bridge.unfunded_pension_liability_basis = pensionBasis;
    payload.valuation.equity_bridge.unfunded_pension_liability_as_of = RECENT_FINANCIAL_DATE;
    payload.valuation.equity_bridge.unfunded_pension_liability_source_id = "sec:companyfacts:balance";
    payload.valuation.equity_bridge.pension_claim_reconciliation = { passed: true, source_backed: true };
    payload.valuation.equity_bridge.obligations_deducted = obligations;
    payload.valuation.equity_bridge.scenario_obligations = { bear: obligations, base: obligations, bull: obligations };
    payload.valuation.equity_bridge.pension_scenario_obligations = { bear: pension, base: pension, bull: pension };
    payload.valuation.market_requirements.obligations_deducted = obligations;
    const structural = payload.valuation.structural_scale_bridge.equity_bridge_reconciliation;
    structural.required_metrics.push("unfunded_pension_liability");
    structural.metrics.push({
      metric: "unfunded_pension_liability",
      passed: true,
      current_value: pension,
      calculated_value: pension,
      provider_value: pension,
      difference: 0,
      maximum_difference: 0,
      basis: "source_backed_pension_claim",
      source_id: "sec:companyfacts:balance",
      as_of: RECENT_FINANCIAL_DATE,
    });
    const pensionPoint = payload.sources.data_points.find((point) => point.metric === "financials.ttm.unfunded_pension_liability");
    pensionPoint.normalized_value = pension;
    pensionPoint.source_ids = ["sec:companyfacts:balance"];
    const obligationsPoint = payload.sources.data_points.find((point) => point.metric === "market_requirement_obligations_deducted");
    obligationsPoint.normalized_value = obligations;
    payload.sources.records.push({
      source_id: "sec:companyfacts:balance",
      provider: "sec-edgar",
      endpoint_or_filing: "api/xbrl/companyfacts/CIK{resolved_from_MU}.json",
      status: "ok",
      retrieved_at: RECENT_RETRIEVED_AT,
      row_count: 5,
      targets_covered: ["unfundedPensionLiability"],
      field_enrichments: [{
        frame: "balance_ttm",
        date: RECENT_FINANCIAL_DATE,
        field: "unfunded_pension_liability",
        value: pension,
        source_as_of: RECENT_FINANCIAL_DATE,
        basis: pensionBasis,
      }],
    });
    return payload;
  };

  try {
    activePayload = attachMaterialPensionEvidence(structuralPayload());
    const materialPensionResponse = await POST(request(
      { ticker: "MU", mode: "quick" },
      { trustedIp: "203.0.113.105" },
    ));
    const materialPensionPayload = await materialPensionResponse.json();
    assert.equal(materialPensionResponse.status, 200);
    assert.equal(materialPensionPayload.valuation.market_requirements?.available, true);
    assert.equal(materialPensionPayload.valuation.market_requirements?.obligations_deducted, 31);

    activePayload = structuralPayload();
    activePayload.valuation.price_validation.valuation_shares = 5;
    activePayload.valuation.price_validation.adr_conversion = {
      adr_ratio: 2,
      convention: "ordinary_shares_divided_by_adr_ratio",
      reported_diluted_shares: 10,
      listing_shares: 5,
      share_basis_explicit: false,
    };
    const adrReconciliation = activePayload.valuation.structural_scale_bridge.equity_bridge_reconciliation;
    adrReconciliation.materiality_market_cap = 104.5 * 5;
    adrReconciliation.materiality_market_cap_threshold = 104.5 * 5 * 0.01;
    adrReconciliation.materiality_valuation_shares = 5;
    const adrResponse = await POST(request(
      { ticker: "MU", mode: "quick" },
      { trustedIp: "203.0.113.104" },
    ));
    const adrPayload = await adrResponse.json();
    assert.equal(adrResponse.status, 200);
    assert.equal(adrPayload.valuation.market_requirements?.available, true);

    const invalidDriverFixtures = [
      (() => {
        const payload = publicValuationFixture("research_grade");
        payload.audit = {
          status: "needs_attention",
          findings: [{ severity: "high", code: "missing_financials", message: "internal" }],
        };
        return payload;
      })(),
      (() => {
        const payload = publicValuationFixture("research_grade");
        payload.sources.coverage = {
          score: 80,
          status: "partial",
          expected_metrics: 19,
          covered_expected_metrics: 12,
          missing_expected_metrics: ["latest_revenue"],
          sourced_points_missing_ok_source: [],
          calculated_points_missing_formula: [],
        };
        return payload;
      })(),
    ];
    for (const [index, fixture] of invalidDriverFixtures.entries()) {
      activePayload = fixture;
      const response = await POST(request(
        { ticker: "MU", mode: "quick" },
        { trustedIp: `203.0.113.${106 + index}` },
      ));
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.valuation.driver_summary, null);
    }

    const invalidMarketFixtures = [
      (() => {
        const payload = structuralPayload();
        payload.audit = {
          status: "needs_attention",
          findings: [{ severity: "high", code: "missing_financials", message: "internal" }],
        };
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.sources.coverage.covered_expected_metrics = 18;
        payload.sources.coverage.missing_expected_metrics = ["current_price"];
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.audit.coverage = {
          score: 70,
          status: "partial",
          expected_metrics: 19,
          covered_expected_metrics: 12,
          missing_expected_metrics: ["latest_revenue"],
          sourced_points_missing_ok_source: [],
          calculated_points_missing_formula: [],
        };
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        delete payload.sources.coverage;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        delete payload.audit.coverage;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const complete = completeCoverage();
        payload.sources.coverage = complete;
        payload.audit.coverage = { ...complete };
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.sources.coverage = {
          score: 100,
          status: "partial",
          expected_metrics: 19,
          covered_expected_metrics: 16,
          missing_expected_metrics: ["valuation_range_central", "ev_to_sales", "price_to_fcf"],
          sourced_points_missing_ok_source: [],
          calculated_points_missing_formula: [],
        };
        payload.audit.coverage = { ...payload.sources.coverage };
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.currency = null;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.currency = "USD<script>";
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.market_requirements.reference_price = 983.12;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.market_requirements.market_data_as_of = "2026-06-01";
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.market_requirements.currency = "EUR";
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.sources.data_points = [];
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.sources.coverage = {
          ...payload.sources.coverage,
          score: 81,
          expected_metrics: 16,
          covered_expected_metrics: 13,
        };
        payload.audit.coverage = { ...payload.sources.coverage };
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.audit.status = "blocked";
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.audit.status = "pass";
        payload.audit.findings = [{ severity: "medium", code: "valuation_unavailable", message: "unexpected finding" }];
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.audit.status = "pass";
        payload.audit.findings = [];
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.sources.coverage = {
          ...payload.sources.coverage,
          status: "complete",
          score: 84,
          covered_expected_metrics: 16,
          missing_expected_metrics: ["valuation_range_central", "ev_to_sales", "price_to_fcf"],
        };
        payload.audit.coverage = { ...payload.sources.coverage };
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.structural_scale_bridge.scale_inputs_reconciled = false;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.structural_scale_bridge.equity_bridge_inputs_reconciled = false;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        delete payload.valuation.structural_scale_bridge.equity_bridge_reconciliation;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.structural_scale_bridge.equity_bridge_reconciliation.provider_balance_currency = "EUR";
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.structural_scale_bridge.missing.push("ttm_scale_inputs_reconciliation");
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.structural_scale_bridge.missing.push("ttm_equity_bridge_reconciliation");
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        delete payload.valuation.equity_bridge;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.equity_bridge.exact = false;
        payload.valuation.equity_bridge.complete = false;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.equity_bridge.cash_separation.complete = false;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const pricePoint = payload.sources.data_points.find((point) => point.metric === "current_price");
        pricePoint.source_id = "unknown:quote";
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const waccPoint = payload.sources.data_points.find((point) => point.metric === "wacc");
        waccPoint.normalized_value = 0.22;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const statusPoint = payload.sources.data_points.find((point) => point.metric === "reverse_dcf_status");
        statusPoint.formula = "";
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.sources.records = payload.sources.records.filter((record) => record.source_id !== "fmp:prices");
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.sources.records = payload.sources.records.filter((record) => record.source_id !== "fmp:income:quarterly");
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.sources.records = payload.sources.records.filter((record) => record.source_id !== "fmp:balance:ttm");
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const record = payload.sources.records.find((item) => item.source_id === "fmp:balance:ttm");
        record.provider = "invented";
        record.endpoint_or_filing = "invented";
        record.row_count = 0;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        delete payload.valuation.structural_scale_bridge.equity_bridge_reconciliation.materiality_revenue_threshold;
        delete payload.valuation.structural_scale_bridge.equity_bridge_reconciliation.materiality_market_cap_threshold;
        delete payload.valuation.structural_scale_bridge.equity_bridge_reconciliation.materiality_market_cap;
        delete payload.valuation.structural_scale_bridge.equity_bridge_reconciliation.materiality_valuation_shares;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.financial_data_as_of = "2020-12-31";
        payload.financials.ttm.date = "2020-12-31";
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const staleQuarterDates = ["2020-03-31", "2021-03-31", "2022-03-31", RECENT_FINANCIAL_DATE];
        for (const metric of ["financials.ttm.revenue", "financials.ttm.diluted_shares"]) {
          payload.sources.data_points.find((point) => point.metric === metric).quarter_dates = staleQuarterDates;
        }
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const futureQuarterDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        for (const metric of ["financials.ttm.revenue", "financials.ttm.diluted_shares"]) {
          payload.sources.data_points.find((point) => point.metric === metric).quarter_dates = [
            ...RECENT_QUARTER_DATES.slice(0, 3),
            futureQuarterDate,
          ];
        }
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.financials.ttm.ttm_validation.provider_ttm_balance_date_current = false;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.financials.ttm.ttm_validation.provider_ttm_balance_currency = "EUR";
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.financials.ttm.ttm_validation.provider_ttm_checks = payload.financials.ttm.ttm_validation.provider_ttm_checks
          .filter((check) => check.metric !== "cash");
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.sources.data_points = payload.sources.data_points
          .filter((point) => point.metric !== "financials.ttm.preferred_stock");
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const record = payload.sources.records.find((item) => item.source_id === "sec:companyfacts:income");
        record.retrieved_at = "2025-01-01T00:00:00.000Z";
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const quote = payload.sources.records.find((record) => record.source_id === "fmp:quote");
        payload.sources.records.push({ ...quote, status: "error" });
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const quote = payload.sources.records.find((record) => record.source_id === "fmp:quote");
        payload.sources.records.unshift({ ...quote, status: "error" });
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const pricePoint = payload.sources.data_points.find((point) => point.metric === "current_price");
        payload.sources.data_points.push({ ...pricePoint });
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const bridgePoint = payload.sources.data_points.find((point) => point.metric === "market_requirement_obligations_deducted");
        bridgePoint.normalized_value = 0;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.market_requirements.assets_added = 21;
        payload.valuation.equity_bridge.assets_added = 21;
        const bridgePoint = payload.sources.data_points.find((point) => point.metric === "market_requirement_assets_added");
        bridgePoint.normalized_value = 21;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.financials.ttm.cash = 26;
        payload.valuation.market_requirements.assets_added = 21;
        payload.valuation.equity_bridge.cash_and_equivalents = 26;
        payload.valuation.equity_bridge.excess_cash = 21;
        payload.valuation.equity_bridge.assets_added = 21;
        payload.valuation.equity_bridge.cash_separation.total_liquid_assets = 26;
        payload.valuation.equity_bridge.cash_separation.excess_cash = 21;
        payload.valuation.equity_bridge.cash_separation.excess_liquid_assets = 21;
        payload.valuation.equity_bridge.cash_separation.assets_added_to_equity = 21;
        payload.sources.data_points.find((point) => point.metric === "financials.ttm.cash").normalized_value = 26;
        payload.sources.data_points.find((point) => point.metric === "market_requirement_assets_added").normalized_value = 21;
        return payload;
      })(),
      (() => {
        const payload = attachMaterialPensionEvidence(structuralPayload());
        const pensionSource = payload.sources.records.find((record) => record.source_id === "sec:companyfacts:balance");
        pensionSource.field_enrichments[0].value = 2;
        return payload;
      })(),
      (() => {
        const payload = attachMaterialPensionEvidence(structuralPayload());
        const pensionSource = payload.sources.records.find((record) => record.source_id === "sec:companyfacts:balance");
        pensionSource.provider = "fmp";
        return payload;
      })(),
      (() => {
        const payload = attachMaterialPensionEvidence(structuralPayload());
        const pensionSource = payload.sources.records.find((record) => record.source_id === "sec:companyfacts:balance");
        pensionSource.endpoint_or_filing = "invented";
        return payload;
      })(),
      (() => {
        const payload = attachMaterialPensionEvidence(structuralPayload());
        const pensionSource = payload.sources.records.find((record) => record.source_id === "sec:companyfacts:balance");
        pensionSource.endpoint_or_filing = "api/xbrl/companyfacts/CIK{resolved_from_AAPL}.json";
        return payload;
      })(),
      (() => {
        const payload = attachMaterialPensionEvidence(structuralPayload());
        payload.financials.ttm.unfunded_pension_liability_basis = "gross_benefit_obligation";
        payload.valuation.equity_bridge.unfunded_pension_liability_basis = "gross_benefit_obligation";
        const pensionSource = payload.sources.records.find((record) => record.source_id === "sec:companyfacts:balance");
        pensionSource.field_enrichments[0].basis = "gross_benefit_obligation";
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.market_requirements.implied_revenue_cagr = true;
        const point = payload.sources.data_points.find((item) => item.metric === "market_requirement_implied_revenue_cagr");
        point.normalized_value = true;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.market_requirements.terminal_growth = false;
        const point = payload.sources.data_points.find((item) => item.metric === "terminal_growth");
        point.normalized_value = false;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.market_requirements.horizon_years = true;
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.valuation.current_price = "104.5";
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const point = payload.sources.data_points.find((item) => item.metric === "latest_revenue");
        point.normalized_value = String(point.normalized_value);
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        payload.financials.ttm.revenue = String(payload.financials.ttm.revenue);
        return payload;
      })(),
      (() => {
        const payload = structuralPayload();
        const point = payload.sources.data_points.find((item) => item.metric === "latest_diluted_shares");
        point.normalized_value = String(point.normalized_value);
        return payload;
      })(),
    ];
    for (const [index, fixture] of invalidMarketFixtures.entries()) {
      activePayload = fixture;
      const response = await POST(request(
        { ticker: "MU", mode: "quick" },
        { trustedIp: `203.0.113.${108 + index}` },
      ));
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.valuation.market_requirements, null);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA withholds market requirements without a fresh validated or reconciled price", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";
  let activePayload = null;
  globalThis.fetch = async () => new Response(JSON.stringify(activePayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  function marketRequirementFixture() {
    const payload = publicValuationFixture("research_grade");
    payload.valuation.status = "not_decision_ready";
    payload.valuation.available = false;
    payload.valuation.range = { low: null, central: null, high: null };
    payload.valuation.scenarios = [];
    payload.valuation.structural_scale_bridge = {
      passed: false,
      scale_inputs_reconciled: true,
      missing: ["capacity_and_asset_turnover_support"],
    };
    payload.valuation.reliability = {
      usable: false,
      status: "blocked",
      score: 0.60,
      decision_ready_blockers: ["structural_scale_bridge"],
      reasons: [],
      limitations: [],
    };
    payload.valuation.market_requirements = {
      available: true,
      status: "solved",
      implied_revenue_cagr: 0.30,
      normalized_margin: 0.18,
      discount_rate: 0.10,
      terminal_growth: 0.02,
      horizon_years: 5,
    };
    payload.sources.coverage = {
      score: 100,
      status: "complete",
      expected_metrics: 19,
      covered_expected_metrics: 19,
      missing_expected_metrics: [],
      sourced_points_missing_ok_source: [],
      calculated_points_missing_formula: [],
    };
    payload.audit.coverage = { ...payload.sources.coverage };
    return attachMarketRequirementEvidence(payload, {
      price: 104.5,
      impliedGrowth: 0.30,
      normalizedMargin: 0.18,
      discountRate: 0.10,
      terminalGrowth: 0.02,
    });
  }

  try {
    const fixtures = [
      (() => {
        const payload = marketRequirementFixture();
        payload.valuation.market_data_as_of = "2026-06-01";
        payload.valuation.market_requirements.market_data_as_of = "2026-06-01";
        payload.valuation.price_validation = {
          status: "validated",
          usable: true,
          provider_corroborated: true,
          independent_price_observation: true,
          sources: ["FMP stable quote", "Official exchange latest close"],
        };
        return payload;
      })(),
      (() => {
        const payload = marketRequirementFixture();
        payload.valuation.price_validation = { status: "mismatch", usable: false };
        return payload;
      })(),
      (() => {
        const payload = marketRequirementFixture();
        payload.valuation.market_data_as_of = "2099-01-01";
        payload.valuation.market_requirements.market_data_as_of = "2099-01-01";
        payload.valuation.price_validation = {
          status: "validated",
          usable: true,
          provider_corroborated: true,
          independent_price_observation: true,
          sources: ["FMP stable quote", "Official exchange latest close"],
        };
        return payload;
      })(),
      (() => {
        const payload = marketRequirementFixture();
        payload.valuation.price_validation = {
          status: "provider_reconciled",
          research_usable: true,
          provider_corroborated: true,
          sources: [],
        };
        return payload;
      })(),
      (() => {
        const payload = marketRequirementFixture();
        payload.valuation.price_validation = {
          status: "provider_reconciled",
          research_usable: true,
          provider_corroborated: true,
          sources: ["Unknown quote", "Unknown close"],
        };
        return payload;
      })(),
      (() => {
        const payload = marketRequirementFixture();
        payload.valuation.price_validation = {
          status: "validated",
          usable: true,
          provider_corroborated: true,
          independent_price_observation: false,
          sources: ["FMP stable quote", "FMP latest close"],
        };
        return payload;
      })(),
      (() => {
        const payload = marketRequirementFixture();
        payload.valuation.currency = null;
        return payload;
      })(),
    ];
    for (const [index, fixture] of fixtures.entries()) {
      activePayload = fixture;
      const response = await POST(request(
        { ticker: "MU", mode: "quick" },
        { trustedIp: `203.0.113.${110 + index}` },
      ));
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.valuation.market_requirements, null);
      assert.equal(payload.valuation.current_price, null);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA turns non-structural valuation blockers into safe actionable checks", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";
  const backendPayload = publicValuationFixture("research_grade");
  backendPayload.valuation.available = false;
  backendPayload.valuation.status = "not_decision_ready";
  backendPayload.valuation.range = { low: null, central: null, high: null };
  backendPayload.valuation.scenarios = [];
  backendPayload.valuation.methods = [];
  backendPayload.valuation.structural_scale_bridge = null;
  backendPayload.valuation.reliability = {
    usable: false,
    status: "blocked",
    score: 0.60,
    decision_ready_blockers: [
      "future_estimate_support",
      "stock_compensation_treatment",
      "apikey=SECRET",
    ],
    reasons: [],
    limitations: [],
  };
  globalThis.fetch = async () => new Response(JSON.stringify(backendPayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const response = await POST(request(
      { ticker: "MU", mode: "quick" },
      { trustedIp: "203.0.113.121" },
    ));
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.valuation.blocking_gap, "future_estimate_support");
    assert.deepEqual(payload.valuation.pending_checks, [
      "future_estimate_support",
      "stock_compensation_treatment",
    ]);
    assert.doesNotMatch(JSON.stringify(payload.valuation), /SECRET|apikey/i);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA never reflects backend errors or provider credentials", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: false,
    error: "Provider failed at https://user:SECRET@example.com/data?apikey=SECRET with internal stack",
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const response = await POST(request({ ticker: "MU" }));
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    assert.equal(response.status, 503);
    assert.equal(payload.code, "DATA_UNAVAILABLE");
    assert.equal(serialized.includes("SECRET"), false);
    assert.equal(serialized.includes("apikey"), false);
    assert.equal(serialized.includes("internal stack"), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA never reflects thrown backend diagnostics", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";
  globalThis.fetch = async () => {
    throw new Error("Network failure Authorization: Bearer SECRET at ?apikey=SECRET");
  };

  try {
    const response = await POST(request({ ticker: "MU" }));
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    assert.equal(response.status, 503);
    assert.equal(payload.code, "DATA_UNAVAILABLE");
    assert.equal(serialized.includes("SECRET"), false);
    assert.equal(serialized.includes("apikey"), false);
    assert.equal("detail" in payload, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("spoofing x-forwarded-for cannot evade the public limit", async () => {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BLS_PRIME_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://canonical-research.example";
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    ticker: "MU",
    company_profile: { name: "Micron", currency: "USD" },
    valuation: { available: false, status: "not_decision_ready", reason: "Datos insuficientes." },
    audit: { status: "pending", findings: [] },
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const trustedIp = "203.0.113.240";
    const responses = [];
    let backendCalls = 0;
    const backendFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      backendCalls += 1;
      return backendFetch(...args);
    };
    for (let index = 0; index < 5; index += 1) {
      responses.push(await POST(request(
        { ticker: "MU" },
        { trustedIp, forwardedFor: `198.51.100.${index + 1}` },
      )));
    }

    assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200, 429]);
    assert.equal(backendCalls, 4);
    assert.ok(Number(responses[4].headers.get("retry-after")) >= 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackend;
  }
});

test("public AURORA rejects an empty ticker before calling the backend", async () => {
  const response = await POST(request({ ticker: "***" }));
  const payload = await response.json();

  assert.equal(response.status, 422);
  assert.equal(payload.code, "INVALID_TICKER");
});

test("public AURORA fails before the backend when a trusted shared limit is unavailable", async () => {
  const previousFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousVercel = process.env.VERCEL;
  const previousStorage = process.env.BLS_PRIME_STORAGE_BACKEND;
  let backendCalls = 0;
  globalThis.fetch = async () => {
    backendCalls += 1;
    return new Response("{}");
  };
  process.env.NODE_ENV = "production";
  delete process.env.VERCEL;
  process.env.BLS_PRIME_STORAGE_BACKEND = "memory";

  try {
    const response = await POST(request({ ticker: "MU" }));
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.code, "RATE_LIMIT_UNAVAILABLE");
    assert.equal(backendCalls, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (previousStorage === undefined) delete process.env.BLS_PRIME_STORAGE_BACKEND;
    else process.env.BLS_PRIME_STORAGE_BACKEND = previousStorage;
  }
});
