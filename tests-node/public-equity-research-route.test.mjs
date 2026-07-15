import assert from "node:assert/strict";
import test from "node:test";

process.env.BLS_PRIME_STORAGE_BACKEND = "memory";

const { POST } = await import("../app/api/public/equity-research/route.js");

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
      market_data_as_of: "2026-07-14",
      financial_data_as_of: "2026-05-29",
      range: { low: 88, central: 112, high: 139 },
      selected_value: 112,
      scenarios,
      methods: [{ key: "through_cycle_fcff_dcf", value_per_share: 112, internal_secret: "SECRET" }],
      reverse_dcf: { available: true, implied_revenue_cagr: 0.5, internal_secret: "SECRET" },
      price_validation: decisionReady
        ? { status: "validated", usable: true, sources: ["FMP stable quote"] }
        : {
          status: "provider_reconciled",
          usable: false,
          research_usable: true,
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
      coverage: decisionReady
        ? {
          score: 100,
          status: "complete",
          expected_metrics: 19,
          covered_expected_metrics: 19,
          missing_expected_metrics: [],
          sourced_points_missing_ok_source: [],
          calculated_points_missing_formula: [],
        }
        : {
          score: 95,
          status: "pass",
          expected_metrics: 19,
          covered_expected_metrics: 18,
          missing_expected_metrics: ["valuation_range_central"],
          sourced_points_missing_ok_source: [],
          calculated_points_missing_formula: [],
        },
      records: [{ source_id: "fmp:income:ttm", provider: "FMP", status: "ok" }],
      data_points: dataPoints,
    },
    audit: { status: "pass", findings: [] },
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
      market_data_as_of: "2026-07-14",
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
      market_data_as_of: "2026-07-14",
      financial_data_as_of: "2026-05-29",
      range: { low: 88, central: 112, high: 139 },
      selected_value: 112,
      scenarios: [{ name: "base", intrinsic_value_per_share: 112, internal_prompt: "SECRET" }],
      price_validation: {
        status: "provider_reconciled",
        usable: false,
        research_usable: true,
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
      records: [],
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

  const payload = {
    ok: true,
    ticker: "MU",
    mode: "quick",
    generated_at: "2026-07-14T12:00:00.000Z",
    company_profile: { name: "Micron Technology, Inc.", currency: "USD", internal_note: "SECRET" },
    financials: { annual: [], ratios: { latest_revenue: 37_380_000_000 }, quality_flags: [] },
    valuation: {
      model_version: "institutional_valuation_v3",
      available: true,
      status: "decision_ready",
      archetype: "Authorization: Bearer SECRET",
      primary_method: "through_cycle_fcff_dcf",
      cash_flow_basis: "Authorization: Bearer SECRET",
      current_price: 104.5,
      currency: "USD",
      market_data_as_of: "2026-07-14",
      range: { low: 88, central: 112, high: 139 },
      selected_value: 112,
      scenarios: [{ name: "base", intrinsic_value_per_share: 112, internal_prompt: "SECRET" }],
      methods: [{ key: "through_cycle_fcff_dcf", value_per_share: 112, internal_weighting: "SECRET" }],
      price_validation: {
        status: "validated",
        usable: true,
        sources: ["FMP stable quote", "Authorization: Bearer SECRET"],
      },
      reliability: { usable: true, status: "high", score: 0.82, reasons: [], limitations: [] },
      internal_secret: "SECRET",
    },
    sources: {
      coverage: {
        score: 100,
        status: "complete",
        expected_metrics: 19,
        covered_expected_metrics: 19,
        missing_expected_metrics: [],
        sourced_points_missing_ok_source: [],
        calculated_points_missing_formula: [],
      },
      records: [{
        source_id: "fmp-profile",
        provider: "FMP",
        endpoint_or_filing: "https://user:SECRET@financialmodelingprep.com/token/SECRET?apikey=SECRET#fragment",
        retrieved_at: "2026-07-14T11:50:00.000Z",
        status: "ok",
        raw_response: "SECRET",
      }],
      data_points: [{ metric: "valuation.range.central", normalized_value: 112, source_id: "fmp-profile" }],
    },
    audit: { status: "pass", findings: [], internal_trace: "SECRET" },
    agents: { agents: [{ id: "valuation_agent", summary: "SECRET" }], final_orchestrator: { prompt: "SECRET" } },
    internal_secret: "SECRET",
    downloads: [{
      filename: "MU_model.xlsx",
      media_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      encoding: "base64",
      content_base64: Buffer.from("SECRET").toString("base64"),
    }],
  };

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
    assert.deepEqual(publicPayload.valuation.price_validation.sources, ["FMP"]);
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
    assert.match(payload.report_markdown, /Estados financieros al: 2026-05-29\./);
    assert.match(payload.report_markdown, /Precio de mercado al: 2026-07-14\./);
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
    current_price: 983.12,
    value_at_floor: 123.45,
  };
  backendPayload.sources.coverage = {
    score: 100,
    status: "complete",
    expected_metrics: 19,
    covered_expected_metrics: 19,
    missing_expected_metrics: [],
    sourced_points_missing_ok_source: [],
    calculated_points_missing_formula: [],
  };
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
    assert.deepEqual(payload.valuation.market_requirements, {
      available: true,
      status: "solved",
      implied_revenue_cagr: 0.35,
      bound: null,
      normalized_cash_flow_margin: 0.18,
      discount_rate: 0.10,
      terminal_growth: 0.02,
      horizon_years: 5,
      price_context: "contextual",
      reference_price: 104.5,
      market_data_as_of: "2026-07-14",
    });
    assert.equal(payload.valuation.blocking_gap, "structural_scale_bridge");
    assert.deepEqual(payload.valuation.pending_checks, [
      "capacity_and_asset_turnover_support",
      "organic_or_acquisition_revenue_bridge",
      "segment_reconciliation",
    ]);
    assert.equal(payload.valuation.reverse_dcf.implied_revenue_cagr, null);
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
    return payload;
  };

  try {
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
    return payload;
  }

  try {
    const fixtures = [
      (() => {
        const payload = marketRequirementFixture();
        payload.valuation.market_data_as_of = "2026-06-01";
        payload.valuation.price_validation = { status: "validated", usable: true };
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
        payload.valuation.price_validation = { status: "validated", usable: true };
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
    }
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
