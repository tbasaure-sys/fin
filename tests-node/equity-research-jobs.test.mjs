import test from "node:test";
import assert from "node:assert/strict";

import {
  createEquityResearchJob,
  getEquityResearchJob,
  getEquityResearchJobByBackendRunId,
  updateEquityResearchJob,
} from "../lib/server/data/equity-research-jobs.js";
import {
  getWorkspaceEquityResearch,
  getWorkspaceEquityResearchJob,
  startWorkspaceEquityResearch,
} from "../lib/server/equity-research.js";

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
  const previousFetch = globalThis.fetch;
  process.env.BLS_PRIME_STORAGE_BACKEND = "memory";
  process.env.BLS_PRIME_BACKEND_URL = "https://research-backend.example";

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(String(options.body || "{}"));
    calls.push({ url: String(url), body });
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
    company_profile: { name: "Apple Inc.", sector: "Technology" },
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
    valuation: {
      available: true,
      current_price: 120,
      scenarios: [{ name: "base", intrinsic_value_per_share: 140 }],
      reverse_dcf: { available: true, implied_revenue_cagr: 0.05 },
      multiples: { ev_to_sales: 7, price_to_fcf: 24 },
    },
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
    assert.match(bundle.report_markdown, /Final orchestrator/);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.model, "gpt-4o-mini");
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
