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
    sources: { records: [], data_points: [{ metric: "valuation.range.central", normalized_value: 174 }] },
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
    assert.equal(payload.sources.data_points[0].normalized_value, null);
    assert.equal(payload.agents.agents.length, 0);
    assert.equal(payload.downloads.some((artifact) => artifact.filename.endsWith(".xlsx")), false);
    assert.equal(payload.history.storage_status, "public_session_only");
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
      archetype: "capacity_cycle",
      primary_method: "through_cycle_fcff_dcf",
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
      coverage: { score: 100, status: "complete" },
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
