import test from "node:test";
import assert from "node:assert/strict";

import {
  createEquityResearchJob,
  getEquityResearchJob,
  getEquityResearchJobByBackendRunId,
  updateEquityResearchJob,
} from "../lib/server/data/equity-research-jobs.js";
import {
  buildDownstreamValuationContext,
  buildEquityResearchDelta,
  getWorkspaceEquityResearch,
  getWorkspaceEquityResearchJob,
  sanitizeResearchPayload,
  startWorkspaceEquityResearch,
} from "../lib/server/equity-research.js";

test("unbacked payload sanitizer is allowlisted, idempotent, and cannot leak precise valuation aliases", () => {
  const sentinel = 9876543;
  const unsafeText = `Our midpoint is $${sentinel} fair value`;
  const payload = {
    ok: true,
    ticker: "MU",
    mode: "quick",
    generated_at: "2026-07-14T12:00:00.000Z",
    company_profile: { name: "Micron Technology", currency: "USD", industry: "Semiconductors" },
    financials: { annual: [], ratios: {}, quality_flags: [] },
    valuation: institutionalValuation({
      status: "research_grade",
      current_price: sentinel,
      fair_value_central: sentinel,
      scenario_summary: { base_value: sentinel },
      range: { low: 88, central: 112, high: 139 },
      selected_value: sentinel,
      price_validation: { status: "provider_reconciled", usable: false, sources: ["FMP"] },
      reliability: { usable: true, status: "medium", score: 0.65, reasons: [unsafeText], limitations: [unsafeText] },
      scenarios: [{ name: "base", assumptions: { midpoint: sentinel }, intrinsic_value_per_share: sentinel }],
      methods: [{ key: "forward_fcff_dcf", role: "primary", value_per_share: sentinel }],
    }),
    report_markdown: `# MU\n\n${unsafeText}\n\n| Base | $${sentinel} |`,
    memo: { executive_judgment: unsafeText },
    executive_summary: unsafeText,
    final_analysis: unsafeText,
    sources: {
      coverage: { score: 100 },
      records: [{ source_id: "fmp", provider: "FMP", raw: { fair_value: sentinel } }],
      data_points: [{ metric: "Fair_Value_Central", raw_value: sentinel, normalized_value: sentinel }],
    },
    audit: { status: "needs_attention", findings: [{ severity: "low", code: "valuation_not_decision_ready", message: unsafeText }] },
    assumptions: { fair_value: sentinel },
    assumptions_yml: `fair_value: ${sentinel}\n`,
    agents: { agents: [{ summary: unsafeText }], final_orchestrator: { analysis: { executive_judgment: unsafeText } } },
    downloads: [
      { filename: "MU_audit.json", media_type: "application/json", encoding: "base64", content_base64: Buffer.from(unsafeText).toString("base64") },
      { filename: "MU_assumptions.yml", media_type: "application/yaml", encoding: "base64", content_base64: Buffer.from(unsafeText).toString("base64") },
      { filename: "MU_sources.json", media_type: "application/json", encoding: "base64", content_base64: Buffer.from(unsafeText).toString("base64") },
    ],
  };

  const sanitized = sanitizeResearchPayload(payload);

  assert.deepEqual(sanitized.valuation.range, { low: 88, central: null, high: 139 });
  assert.equal(sanitized.valuation.current_price, null);
  assert.equal(JSON.stringify(sanitized).includes(String(sentinel)), false);
  for (const artifact of sanitized.downloads) {
    const decoded = Buffer.from(artifact.content_base64, "base64").toString("utf8");
    assert.equal(decoded.includes(String(sentinel)), false, artifact.filename);
  }
  assert.deepEqual(sanitizeResearchPayload(sanitized), sanitized);
  assert.equal("memo" in sanitized, false);
  assert.equal("executive_summary" in sanitized, false);
  assert.equal("final_analysis" in sanitized, false);
});

test("fatal audit findings suppress even a research-grade range", () => {
  const payload = {
    ticker: "MU",
    company_profile: { name: "Micron", currency: "USD" },
    valuation: institutionalValuation({
      status: "research_grade",
      range: { low: 88, central: 112, high: 139 },
      price_validation: { status: "provider_reconciled", usable: false },
      reliability: { usable: true, status: "medium", score: 0.65, reasons: [], limitations: [] },
    }),
    audit: { status: "needs_attention", findings: [{ severity: "high", code: "unit_mismatch", message: "bad units" }] },
  };

  const sanitized = sanitizeResearchPayload(payload);

  assert.deepEqual(sanitized.valuation.range, { low: null, central: null, high: null });
});

test("blocked valuation keeps a concrete safe reason without leaking an unvalidated price", () => {
  const safeReason = "El nivel de ingresos de los últimos doce meses queda fuera del ciclo histórico verificable.";
  const payload = {
    ticker: "MU",
    company_profile: { name: "Micron", currency: "USD" },
    valuation: institutionalValuation({
      available: false,
      status: "not_decision_ready",
      reason: safeReason,
      range: { low: null, central: null, high: null },
      price_validation: { status: "provider_reconciled", usable: false },
      reliability: { usable: false, status: "blocked", score: 0, reasons: [], limitations: [] },
    }),
  };

  const sanitized = sanitizeResearchPayload(payload);
  assert.equal(sanitized.valuation.reason, safeReason);

  const unsafe = sanitizeResearchPayload({
    ...payload,
    valuation: { ...payload.valuation, reason: "El fair value central es $31.83." },
  });
  assert.doesNotMatch(unsafe.valuation.reason, /31\.83|fair value/i);
});

function institutionalValuation(overrides = {}) {
  return {
    available: true,
    model_version: "institutional_valuation_v3",
    status: "decision_ready",
    archetype: "capacity_cycle",
    primary_method: "forward_fcff_dcf",
    current_price: 104.5,
    currency: "USD",
    market_data_as_of: "2026-07-14",
    price_validation: {
      status: "validated",
      usable: true,
      sources: ["FMP stable quote", "FMP latest close"],
    },
    range: { low: 88, central: 112, high: 139 },
    selected_value: 112,
    scenarios: [{ name: "base", intrinsic_value_per_share: 112 }],
    reverse_dcf: { available: true, implied_revenue_cagr: 0.05, weight: 0 },
    multiples: { ev_to_sales: 7, price_to_fcf: 24 },
    reliability: {
      usable: true,
      status: "high",
      score: 0.82,
      reasons: ["Price and share count reconcile."],
      limitations: ["Cyclical margins remain uncertain."],
    },
    ...overrides,
  };
}

function researchPayloadWithValuation(valuation, overrides = {}) {
  return {
    ticker: "MU",
    company_profile: { name: "Micron Technology, Inc.", currency: "USD" },
    financials: {
      annual: [{ date: "2025-08-28", revenue: 37_000, free_cash_flow: 1_700 }],
      ratios: { latest_revenue: 37_000, latest_fcf: 1_700, fcf_margin: 0.046 },
    },
    audit: { status: "pass", findings: [] },
    valuation,
    ...overrides,
  };
}

test("downstream valuation context exposes precise figures only for fully validated decision-ready v2 payloads", () => {
  const ready = buildDownstreamValuationContext(researchPayloadWithValuation(institutionalValuation()));

  assert.equal(ready.backed, true);
  assert.equal(ready.model_version, "institutional_valuation_v3");
  assert.equal(ready.status, "decision_ready");
  assert.deepEqual(ready.range, { low: 88, central: 112, high: 139 });
  assert.equal(ready.current_price, 104.5);
  assert.equal(ready.primary_method, "forward_fcff_dcf");
  assert.equal(ready.reliability.status, "high");
  assert.equal(ready.market_data_as_of, "2026-07-14");
  assert.equal(ready.currency, "USD");
  assert.equal(ready.price_validation.status, "validated");

  const researchGrade = buildDownstreamValuationContext(researchPayloadWithValuation(institutionalValuation({
    status: "research_grade",
    reliability: {
      usable: true,
      status: "medium",
      score: 0.62,
      reasons: ["Method dispersion is elevated."],
      limitations: ["Use only as a research range."],
    },
  })));

  assert.equal(researchGrade.backed, false);
  assert.equal(researchGrade.status, "research_grade");
  assert.equal(researchGrade.range, null);
  assert.equal(researchGrade.current_price, null);
  assert.equal(researchGrade.primary_method, "forward_fcff_dcf");
  assert.equal(researchGrade.reliability.status, "medium");
  assert.equal(researchGrade.market_data_as_of, "2026-07-14");
  assert.equal(researchGrade.currency, "USD");
  assert.equal(researchGrade.figures_withheld, true);

  const legacy = buildDownstreamValuationContext(researchPayloadWithValuation({
    available: true,
    current_price: 983.12,
    scenarios: [{ name: "base", intrinsic_value_per_share: 31.83 }],
  }));

  assert.equal(legacy.backed, false);
  assert.equal(legacy.model_version, null);
  assert.equal(legacy.status, "not_decision_ready");
  assert.equal(legacy.range, null);
  assert.equal(legacy.current_price, null);
  assert.equal(legacy.primary_method, null);
  assert.equal(legacy.figures_withheld, true);

  const missingPrice = buildDownstreamValuationContext(researchPayloadWithValuation(institutionalValuation({
    current_price: null,
  })));
  assert.equal(missingPrice.backed, false);
  assert.equal(missingPrice.range, null);

  const nonCanonicalPriceStatus = buildDownstreamValuationContext(researchPayloadWithValuation(institutionalValuation({
    price_validation: {
      status: "verified",
      usable: true,
      sources: ["unrecognized canonical status"],
    },
  })));
  assert.equal(nonCanonicalPriceStatus.backed, false);
  assert.equal(nonCanonicalPriceStatus.range, null);
});

test("equity research deltas compare the v2 range only when both runs are backed in the same currency", () => {
  const previousPayload = researchPayloadWithValuation(institutionalValuation({
    range: { low: 80, central: 100, high: 125 },
    selected_value: 100,
    reverse_dcf: { available: true, implied_revenue_cagr: 0.04, weight: 0 },
  }));
  const currentPayload = researchPayloadWithValuation(institutionalValuation({
    range: { low: 88, central: 112, high: 139 },
    selected_value: 112,
    reverse_dcf: { available: true, implied_revenue_cagr: 0.05, weight: 0 },
  }));
  currentPayload.financials.ratios.latest_fcf = null;
  const previousRun = {
    id: "previous-ready-run",
    generatedAt: "2026-07-13T12:00:00.000Z",
    payload: previousPayload,
  };

  const readyDelta = buildEquityResearchDelta(currentPayload, previousRun);
  const readyKeys = readyDelta.changes.map((change) => change.key);

  assert.equal(readyDelta.valuation.comparable, true);
  assert.deepEqual(readyDelta.valuation.current.range, { low: 88, central: 112, high: 139 });
  assert.deepEqual(readyDelta.valuation.previous.range, { low: 80, central: 100, high: 125 });
  assert.ok(readyKeys.includes("valuation_low"));
  assert.ok(readyKeys.includes("valuation_central"));
  assert.ok(readyKeys.includes("valuation_high"));
  assert.ok(readyKeys.includes("implied_growth"));
  assert.ok(!readyKeys.includes("base_value"));
  assert.ok(!readyKeys.includes("latest_fcf"));

  const researchGradePayload = researchPayloadWithValuation(institutionalValuation({
    status: "research_grade",
    reliability: {
      usable: true,
      status: "medium",
      score: 0.62,
      reasons: ["Method dispersion is elevated."],
      limitations: [],
    },
  }));
  const guardedDelta = buildEquityResearchDelta(researchGradePayload, previousRun);
  const guardedKeys = guardedDelta.changes.map((change) => change.key);

  assert.equal(guardedDelta.valuation.comparable, false);
  assert.equal(guardedDelta.valuation.current.range, null);
  assert.ok(!guardedKeys.some((key) => key.startsWith("valuation_")));
  assert.ok(!guardedKeys.includes("implied_growth"));

  const crossCurrencyPayload = researchPayloadWithValuation(institutionalValuation({ currency: "EUR" }));
  const crossCurrencyDelta = buildEquityResearchDelta(crossCurrencyPayload, previousRun);
  const crossCurrencyKeys = crossCurrencyDelta.changes.map((change) => change.key);
  assert.equal(crossCurrencyDelta.valuation.comparable, false);
  assert.ok(!crossCurrencyKeys.some((key) => key.startsWith("valuation_")));
  assert.ok(!crossCurrencyKeys.includes("implied_growth"));
});

test("equity research jobs persist a durable local id and backend run mapping", async () => {
  const previousBackend = process.env.BLS_PRIME_STORAGE_BACKEND;
  process.env.BLS_PRIME_STORAGE_BACKEND = "memory";

  try {
    const created = await createEquityResearchJob("job-test-ws", " aapl ", "full", { status: "queued" });

    assert.equal(created.ticker, "AAPL");
    assert.equal(created.mode, "full");
    assert.equal(created.status, "queued");
    assert.ok(created.id);

    const running = await updateEquityResearchJob("job-test-ws", created.id, {
      status: "running",
      backendRunId: "railway-run-123",
      startedAt: "2026-04-19T12:00:00.000Z",
      payload: { backend: { status: "running" } },
    });

    assert.equal(running.id, created.id);
    assert.equal(running.backendRunId, "railway-run-123");

    const byLocalId = await getEquityResearchJob("job-test-ws", created.id);
    const byBackendId = await getEquityResearchJobByBackendRunId("job-test-ws", "railway-run-123");
    const wrongWorkspace = await getEquityResearchJob("other-ws", created.id);

    assert.equal(byLocalId.backendRunId, "railway-run-123");
    assert.equal(byBackendId.id, created.id);
    assert.equal(wrongWorkspace, null);
  } finally {
    if (previousBackend === undefined) {
      delete process.env.BLS_PRIME_STORAGE_BACKEND;
    } else {
      process.env.BLS_PRIME_STORAGE_BACKEND = previousBackend;
    }
  }
});

test("equity research jobs can persist completed artifact payloads", async () => {
  const previousBackend = process.env.BLS_PRIME_STORAGE_BACKEND;
  process.env.BLS_PRIME_STORAGE_BACKEND = "memory";

  try {
    const created = await createEquityResearchJob("artifact-test-ws", "msft", "quick");
    const completed = await updateEquityResearchJob("artifact-test-ws", created.id, {
      status: "succeeded",
      completedAt: "2026-04-19T12:05:00.000Z",
      payload: {
        ok: true,
        ticker: "MSFT",
        report_markdown: "# MSFT",
        downloads: [{ filename: "MSFT_report.md", content_base64: "IyBNU0ZU" }],
      },
      resultRunId: "6a85d266-6dbf-45b2-9243-fcf95fe14d57",
    });

    assert.equal(completed.status, "succeeded");
    assert.equal(completed.payload.report_markdown, "# MSFT");
    assert.equal(completed.payload.downloads[0].filename, "MSFT_report.md");
    assert.equal(completed.resultRunId, "6a85d266-6dbf-45b2-9243-fcf95fe14d57");
  } finally {
    if (previousBackend === undefined) {
      delete process.env.BLS_PRIME_STORAGE_BACKEND;
    } else {
      process.env.BLS_PRIME_STORAGE_BACKEND = previousBackend;
    }
  }
});

test("equity research job start timeout remains queued and retries with same client run id", async () => {
  const previousBackend = process.env.BLS_PRIME_STORAGE_BACKEND;
  const previousBackendUrl = process.env.BLS_PRIME_BACKEND_URL;
  const previousInviteContact = process.env.BLS_PRIME_INVITE_CONTACT;
  const previousFetch = globalThis.fetch;
  process.env.BLS_PRIME_STORAGE_BACKEND = "memory";
  process.env.BLS_PRIME_BACKEND_URL = "https://research-backend.example";
  process.env.BLS_PRIME_INVITE_CONTACT = "research@example.com";

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(String(options.body || "{}"));
    calls.push({ url: String(url), body, headers: options.headers || {} });
    if (calls.length === 1) {
      throw new Error("simulated Railway cold-start timeout");
    }
    return new Response(
      JSON.stringify({
        ok: true,
        run_id: `research-${body.client_run_id}`,
        ticker: body.ticker,
        mode: body.mode,
        status: "running",
        started_at: "2026-04-19T12:00:00.000Z",
      }),
      { status: 202, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const started = await startWorkspaceEquityResearch("timeout-retry-ws", "unh", { mode: "full" });
    assert.equal(started.ok, true);
    assert.equal(started.status, "queued");
    assert.ok(started.run_id);
    assert.equal(calls[0].body.client_run_id, started.run_id);

    const polled = await getWorkspaceEquityResearchJob("timeout-retry-ws", "UNH", started.run_id);
    assert.equal(polled.ok, true);
    assert.equal(polled.status, "running");
    assert.equal(polled.run_id, started.run_id);
    assert.equal(polled.backend_run_id, `research-${started.run_id}`);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.client_run_id, started.run_id);
    assert.equal(calls[0].headers["x-sec-user-agent"], "MetaAlphaAllocator research@example.com");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) {
      delete process.env.BLS_PRIME_STORAGE_BACKEND;
    } else {
      process.env.BLS_PRIME_STORAGE_BACKEND = previousBackend;
    }
    if (previousBackendUrl === undefined) {
      delete process.env.BLS_PRIME_BACKEND_URL;
    } else {
      process.env.BLS_PRIME_BACKEND_URL = previousBackendUrl;
    }
    if (previousInviteContact === undefined) {
      delete process.env.BLS_PRIME_INVITE_CONTACT;
    } else {
      process.env.BLS_PRIME_INVITE_CONTACT = previousInviteContact;
    }
  }
});

test("equity research direct path returns a visible degraded memo when backend is unavailable", async () => {
  const previousBackend = process.env.BLS_PRIME_STORAGE_BACKEND;
  const previousBackendUrl = process.env.BLS_PRIME_BACKEND_URL;
  const previousFetch = globalThis.fetch;
  process.env.BLS_PRIME_STORAGE_BACKEND = "memory";
  process.env.BLS_PRIME_BACKEND_URL = "https://research-backend.example";

  globalThis.fetch = async () => {
    throw new Error("simulated backend outage");
  };

  try {
    const bundle = await getWorkspaceEquityResearch("direct-fallback-ws", "unh", { mode: "quick" });
    assert.equal(bundle.ok, true);
    assert.equal(bundle.ticker, "UNH");
    assert.equal(bundle.audit.status, "needs_attention");
    assert.match(bundle.report_markdown, /No se publican cifras de valoración/i);
    assert.match(bundle.sources.records[0].error, /simulated backend outage/i);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) {
      delete process.env.BLS_PRIME_STORAGE_BACKEND;
    } else {
      process.env.BLS_PRIME_STORAGE_BACKEND = previousBackend;
    }
    if (previousBackendUrl === undefined) {
      delete process.env.BLS_PRIME_BACKEND_URL;
    } else {
      process.env.BLS_PRIME_BACKEND_URL = previousBackendUrl;
    }
  }
});

test("equity research rate limit waits before retrying backend start", async () => {
  const previousBackend = process.env.BLS_PRIME_STORAGE_BACKEND;
  const previousBackendUrl = process.env.BLS_PRIME_BACKEND_URL;
  const previousCooldown = process.env.EQUITY_RESEARCH_RATE_LIMIT_COOLDOWN_MS;
  const previousFetch = globalThis.fetch;
  process.env.BLS_PRIME_STORAGE_BACKEND = "memory";
  process.env.BLS_PRIME_BACKEND_URL = "https://research-backend.example";
  process.env.EQUITY_RESEARCH_RATE_LIMIT_COOLDOWN_MS = "60000";

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: JSON.parse(String(options.body || "{}")) });
    return new Response(JSON.stringify({ error: "Too many API requests" }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const started = await startWorkspaceEquityResearch("rate-limit-ws", "unh", { mode: "full" });
    assert.equal(started.ok, true);
    assert.equal(started.status, "queued");
    assert.ok(started.retry_after_ms > 0);
    assert.equal(calls.length, 1);

    const polled = await getWorkspaceEquityResearchJob("rate-limit-ws", "UNH", started.run_id);
    assert.equal(polled.ok, true);
    assert.equal(polled.status, "queued");
    assert.ok(polled.retry_after_ms > 0);
    assert.match(polled.last_error, /429|Too many API requests/i);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_STORAGE_BACKEND;
    else process.env.BLS_PRIME_STORAGE_BACKEND = previousBackend;
    if (previousBackendUrl === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackendUrl;
    if (previousCooldown === undefined) delete process.env.EQUITY_RESEARCH_RATE_LIMIT_COOLDOWN_MS;
    else process.env.EQUITY_RESEARCH_RATE_LIMIT_COOLDOWN_MS = previousCooldown;
  }
});

test("equity research adds one Vercel final orchestrator call when backend skips it", async () => {
  const previousBackend = process.env.BLS_PRIME_STORAGE_BACKEND;
  const previousBackendUrl = process.env.BLS_PRIME_BACKEND_URL;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousLlmKey = process.env.EQUITY_RESEARCH_LLM_API_KEY;
  const previousLlmEnabled = process.env.EQUITY_RESEARCH_LLM_ENABLED;
  const previousLlmModel = process.env.EQUITY_RESEARCH_LLM_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.BLS_PRIME_STORAGE_BACKEND = "memory";
  process.env.BLS_PRIME_BACKEND_URL = "https://research-backend.example";
  process.env.OPENAI_API_KEY = "test-openai-key";
  delete process.env.EQUITY_RESEARCH_LLM_API_KEY;
  process.env.EQUITY_RESEARCH_LLM_ENABLED = "auto";
  process.env.EQUITY_RESEARCH_LLM_MODEL = "gpt-4o-mini";

  const calls = [];
  const backendBundle = {
    ok: true,
    ticker: "AAPL",
    mode: "quick",
    generated_at: "2026-04-19T12:00:00.000Z",
    company_profile: { name: "Apple Inc.", sector: "Technology", currency: "USD" },
    financials: {
      annual: [{ date: "2025-09-30", revenue: 100, free_cash_flow: 30, total_debt: 20, cash: 40 }],
      ratios: {
        latest_revenue: 100,
        latest_fcf: 30,
        revenue_cagr_5y: 0.08,
        fcf_margin: 0.3,
        roic: 0.28,
        cash_conversion: 1.1,
        net_debt: -20,
      },
      quality_flags: [],
    },
    valuation: institutionalValuation({
      current_price: 120,
      range: { low: 125, central: 140, high: 158 },
      selected_value: 140,
      scenarios: [{ name: "base", intrinsic_value_per_share: 140 }],
      reverse_dcf: { available: true, implied_revenue_cagr: 0.05 },
      multiples: { ev_to_sales: 7, price_to_fcf: 24 },
    }),
    filings: { recent: [{ form: "10-K", filing_date: "2026-01-30" }] },
    report_markdown: "# AAPL research OS memo\n\n## Agent research desk\n",
    sources: {
      coverage: { score: 100, status: "pass" },
      records: [],
      data_points: [],
    },
    audit: { status: "pass", coverage: { score: 100 }, findings: [] },
    agents: {
      version: "equity_research_agent_layer_v1",
      mode: "local_first_multi_agent_desk",
      execution: { specialist_llm_calls: 0, final_orchestrator_max_calls: 1 },
      agents: [{ id: "red_team_agent", status: "ready", summary: "Challenge the thesis.", open_questions: [] }],
      claims: [],
      final_orchestrator: {
        enabled: false,
        status: "disabled",
        model: "gpt-4o-mini",
        call_budget: { max_calls: 1, actual_calls: 0 },
        analysis: null,
      },
    },
    downloads: [{ filename: "AAPL_report.md", media_type: "text/markdown", encoding: "base64", content_base64: "IyBBQVBM" }],
  };

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body ? JSON.parse(String(options.body)) : null });
    if (String(url).startsWith("https://research-backend.example/api/equity-research")) {
      return new Response(JSON.stringify(backendBundle), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url) === "https://api.openai.com/v1/chat/completions") {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  executive_judgment: "Evidence-backed final synthesis completed.",
                  strongest_points: ["Coverage is complete."],
                  red_team: ["Stress the growth assumption."],
                  open_questions: ["Check next filing delta."],
                  memo_patch: "Keep the memo skeptical.",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const bundle = await getWorkspaceEquityResearch("vercel-orchestrator-ws", "aapl", { mode: "quick" });
    assert.equal(bundle.agents.final_orchestrator.status, "ok");
    assert.equal(bundle.agents.final_orchestrator.runtime, "vercel");
    assert.equal(bundle.agents.final_orchestrator.call_budget.actual_calls, 1);
    assert.equal(bundle.agents.final_orchestrator.analysis.executive_judgment, "Evidence-backed final synthesis completed.");
    assert.match(bundle.report_markdown, /## Analyst desk/);
    assert.match(bundle.report_markdown, /## Final editor synthesis/);
    assert.match(bundle.report_markdown, /What could break the case/);
    assert.doesNotMatch(bundle.report_markdown, /Final LLM orchestrator|```json/);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.model, "gpt-4o-mini");
    const orchestratorPrompt = calls[1].body.messages[1].content;
    assert.match(orchestratorPrompt, /institutional_valuation_v3/);
    assert.match(orchestratorPrompt, /"backed":true/);
    assert.match(orchestratorPrompt, /"range":\{"low":125,"central":140,"high":158\}/);
    assert.match(orchestratorPrompt, /"primary_method":"forward_fcff_dcf"/);
    assert.match(orchestratorPrompt, /"market_data_as_of":"2026-07-14"/);
    assert.match(orchestratorPrompt, /"currency":"USD"/);
    assert.doesNotMatch(orchestratorPrompt, /base_intrinsic_value_per_share/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_STORAGE_BACKEND;
    else process.env.BLS_PRIME_STORAGE_BACKEND = previousBackend;
    if (previousBackendUrl === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackendUrl;
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    if (previousLlmKey === undefined) delete process.env.EQUITY_RESEARCH_LLM_API_KEY;
    else process.env.EQUITY_RESEARCH_LLM_API_KEY = previousLlmKey;
    if (previousLlmEnabled === undefined) delete process.env.EQUITY_RESEARCH_LLM_ENABLED;
    else process.env.EQUITY_RESEARCH_LLM_ENABLED = previousLlmEnabled;
    if (previousLlmModel === undefined) delete process.env.EQUITY_RESEARCH_LLM_MODEL;
    else process.env.EQUITY_RESEARCH_LLM_MODEL = previousLlmModel;
  }
});

test("research-grade valuation withholds the final orchestrator and strips any prior precise synthesis", async () => {
  const previousBackend = process.env.BLS_PRIME_STORAGE_BACKEND;
  const previousBackendUrl = process.env.BLS_PRIME_BACKEND_URL;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousLlmEnabled = process.env.EQUITY_RESEARCH_LLM_ENABLED;
  const previousFetch = globalThis.fetch;
  process.env.BLS_PRIME_STORAGE_BACKEND = "memory";
  process.env.BLS_PRIME_BACKEND_URL = "https://research-backend.example";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.EQUITY_RESEARCH_LLM_ENABLED = "true";

  const reportWithUnsafeSynthesis = [
    "# MU",
    "",
    "## Final editor synthesis",
    "Executive judgment: Fair value is precisely $112 per share.",
    "",
  ].join("\n");
  const researchGradeBundle = {
    ok: true,
    ticker: "MU",
    mode: "quick",
    generated_at: "2026-07-14T12:00:00.000Z",
    company_profile: { name: "Micron Technology, Inc.", currency: "USD" },
    financials: { annual: [], ratios: {}, quality_flags: [] },
    valuation: institutionalValuation({
      status: "research_grade",
      reliability: {
        usable: true,
        status: "medium",
        score: 0.62,
        reasons: ["Method dispersion is elevated."],
        limitations: ["Use only as a research range."],
      },
    }),
    report_markdown: reportWithUnsafeSynthesis,
    sources: {
      coverage: { score: 100 },
      records: [],
      data_points: [{ metric: "valuation.range.central", raw_value: 112, normalized_value: 112 }],
    },
    audit: { status: "pass", findings: [] },
    agents: {
      agents: [{ id: "valuation_agent", status: "ready", summary: "Base DCF value is precisely $112." }],
      final_orchestrator: {
        enabled: false,
        status: "disabled",
        call_budget: { max_calls: 1, actual_calls: 0 },
        analysis: null,
      },
    },
    downloads: [{
      filename: "MU_report.md",
      media_type: "text/markdown",
      encoding: "base64",
      content_base64: Buffer.from(reportWithUnsafeSynthesis, "utf8").toString("base64"),
    }, {
      filename: "MU_model.xlsx",
      media_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      encoding: "base64",
      content_base64: Buffer.from("precise value 112", "utf8").toString("base64"),
    }, {
      filename: "MU_sources.json",
      media_type: "application/json",
      encoding: "base64",
      content_base64: Buffer.from(JSON.stringify({ data_points: [{ metric: "valuation.range.central", normalized_value: 112 }] }), "utf8").toString("base64"),
    }],
  };

  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).startsWith("https://research-backend.example/api/equity-research")) {
      return new Response(JSON.stringify(researchGradeBundle), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`the external orchestrator must not be called for research-grade valuation: ${url}`);
  };

  try {
    const bundle = await getWorkspaceEquityResearch("research-grade-orchestrator-ws", "mu", { mode: "quick" });

    assert.equal(calls.length, 1);
    assert.equal(bundle.agents.final_orchestrator.status, "withheld");
    assert.equal(bundle.agents.final_orchestrator.reason, "valuation_not_decision_ready");
    assert.equal(bundle.agents.final_orchestrator.call_budget.actual_calls, 0);
    assert.equal(bundle.agents.final_orchestrator.analysis.executive_judgment, "");
    assert.equal(bundle.valuation.range.central, null);
    assert.equal(bundle.valuation.selected_value, null);
    assert.deepEqual(bundle.valuation.scenarios, []);
    assert.equal(bundle.sources.data_points[0].normalized_value, null);
    assert.equal(bundle.agents.agents.length, 0);
    assert.equal(bundle.downloads.some((artifact) => artifact.filename.endsWith(".xlsx")), false);
    assert.doesNotMatch(bundle.report_markdown, /Final editor synthesis|\$112|Fair value/i);
    const reportDownload = bundle.downloads.find((artifact) => artifact.filename === "MU_report.md");
    const downloadedReport = Buffer.from(reportDownload.content_base64, "base64").toString("utf8");
    assert.doesNotMatch(downloadedReport, /Final editor synthesis|\$112|Fair value/i);
    const sourcesDownload = bundle.downloads.find((artifact) => artifact.filename === "MU_sources.json");
    const downloadedSources = Buffer.from(sourcesDownload.content_base64, "base64").toString("utf8");
    assert.doesNotMatch(downloadedSources, /112/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BLS_PRIME_STORAGE_BACKEND;
    else process.env.BLS_PRIME_STORAGE_BACKEND = previousBackend;
    if (previousBackendUrl === undefined) delete process.env.BLS_PRIME_BACKEND_URL;
    else process.env.BLS_PRIME_BACKEND_URL = previousBackendUrl;
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    if (previousLlmEnabled === undefined) delete process.env.EQUITY_RESEARCH_LLM_ENABLED;
    else process.env.EQUITY_RESEARCH_LLM_ENABLED = previousLlmEnabled;
  }
});
