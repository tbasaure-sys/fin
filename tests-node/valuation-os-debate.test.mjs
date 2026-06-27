import assert from "node:assert/strict";
import test from "node:test";
import { buildValuationCatalystPack } from "../lib/valuation-catalyst-pack.js";
import { fetchValuationCatalystEvidence } from "../lib/valuation-catalyst-news.js";

async function postDebate(body) {
  const { POST } = await import("../app/valuation-os-lab/api/debate/route.js");
  return POST(
    new Request("http://localhost/valuation-os-lab/api/debate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function resetRuntime() {
  const state = globalThis.__VALUATION_OS_DEBATE_RUNTIME__;
  if (state?.cache?.clear) state.cache.clear();
  if (state?.lastByTicker?.clear) state.lastByTicker.clear();
  if (state) state.finalOrchestratorRetryAt = 0;
}

const basePayload = {
  ticker: "ASML",
  mode: "base",
  drivers: {
    ticker: "ASML",
    name: "ASML Holding NV",
    sector: "Latest SEC snapshot FY2025",
    price: 800,
    baseFcf: 28,
    revenueCagr: 0.09,
    margin: 0.31,
    roic: 0.24,
    terminalRoic: 0.16,
    wacc: 0.09,
    terminalGrowth: 0.025,
    reinvestment: 0.42,
    dilution: -0.004,
    moatHalfLife: 10,
    thesisQuality: 0.88,
    demandSupply: 0.82,
    bottleneckPower: 0.9,
    dataQuality: 0.82,
    modelRisk: 0.24,
    beta: 1.1,
  },
  snapshot: {
    company: { ticker: "ASML", entityName: "ASML HOLDING NV", fiscalYear: "2025", form: "20-F" },
    coverage: { secCompanyfacts: true, quoteSource: "FMP stable quote", fmpConfigured: true, fredConfigured: true },
    facts: { revenue: 28_000_000_000, operatingCashFlow: 10_000_000_000, capex: 2_000_000_000 },
  },
  valuation: 980,
  upside: 0.225,
  expectedIrr: 0.041,
  impliedCagr: 0.07,
  feasibility: 0.68,
  quality: 0.79,
  probabilityAbovePrice: 0.7,
  missingDrivers: [],
  tripwires: [{ key: "terminalRoic", label: "Terminal ROIC", falsifier: "Competitor supply enters without pricing response" }],
};

test("valuation catalyst news normalizes providers into tagged evidence", async () => {
  const evidence = await fetchValuationCatalystEvidence({
    ticker: "ASML",
    companyName: "ASML Holding",
    fmpApiKey: "test-fmp",
    braveApiKey: "test-brave",
    disableCache: true,
    fetchImpl: async (url) => {
      if (String(url).includes("financialmodelingprep.com")) {
        return new Response(
          JSON.stringify([
            {
              publishedDate: "2026-06-20",
              publisher: "FMP Wire",
              title: "ASML demand and backlog remain strong after earnings beat",
              text: "Revenue growth, margin, and customer orders remain robust.",
              url: "https://example.com/asml-demand",
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: "Export control risk creates ASML regulation watch",
                description: "Policy restrictions could delay China shipments and pressure guidance.",
                url: "https://example.com/asml-regulation",
                profile: { name: "Search Source" },
              },
            ],
          },
        }),
        { status: 200 },
      );
    },
  });
  assert.equal(evidence.version, "valuation_catalyst_news_v1");
  assert.equal(evidence.status, "available");
  assert.equal(evidence.items.length, 2);
  assert.ok(evidence.items.some((item) => item.catalystTags.includes("demand") && item.polarity === "positive"));
  assert.ok(evidence.items.some((item) => item.catalystTags.includes("regulation") && item.polarity === "negative"));

  const pack = buildValuationCatalystPack({
    ticker: "ASML",
    drivers: basePayload.drivers,
    snapshot: basePayload.snapshot,
    evidencePack: evidence,
  });
  assert.equal(pack.source, "derived_from_sec_fmp_brave_catalyst_news");
  assert.equal(pack.evidencePack.itemCount, 2);
  assert.ok(pack.catalysts.some((item) => item.id === "demand" && item.status === "available" && /FMP Wire/.test(item.evidence[0])));
  assert.ok(pack.warnings.every((item) => !/not a live news search/i.test(item)));
});

test("valuation OS debate works without an LLM key", async () => {
  const previousEnabled = process.env.VALUATION_OS_LLM_ENABLED;
  const previousKey = process.env.VALUATION_OS_LLM_API_KEY;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  process.env.VALUATION_OS_LLM_ENABLED = "false";
  delete process.env.VALUATION_OS_LLM_API_KEY;
  delete process.env.OPENAI_API_KEY;
  resetRuntime();

  try {
    const response = await postDebate(basePayload);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.ticker, "ASML");
    assert.ok(payload.debate.agents.length >= 6);
    assert.ok(payload.debate.agents.some((item) => item.id === "model_router"));
    assert.equal(payload.debate.call_budget.specialist_llm_calls, 0);
    assert.equal(payload.debate.call_budget.final_orchestrator_actual_calls, 0);
    assert.equal(payload.debate.final_orchestrator.status, "unavailable");
    assert.match(payload.debate.final_orchestrator.analysis.executive_judgment, /ASML/i);
    assert.equal(payload.debate.version, "valuation_os_committee_v2");
    assert.equal(payload.debate.context_pack.version, "valuation_context_pack_v1");
    assert.ok(payload.debate.context_pack.dataQuality.overallScore >= 60);
    assert.ok(payload.debate.context_pack.providerDiagnostics.length >= 4);
    assert.equal(payload.debate.catalyst_pack.version, "valuation_catalyst_pack_v1");
    assert.ok(payload.debate.catalyst_pack.dominantCatalysts.length >= 2);
    assert.equal(payload.debate.change_log.status, "baseline");
    assert.match(payload.debate.memo.markdown, /# ASML Valuation OS memo/);
    assert.equal(payload.debate.researchability.grade, "A");
    assert.equal(payload.debate.final_orchestrator.analysis.researchability.grade, "A");
    assert.equal(payload.debate.final_orchestrator.schema.ok, true);
    assert.ok(payload.debate.final_orchestrator.analysis.composite_score >= 1);
    assert.ok(payload.debate.final_orchestrator.analysis.scorecard.length >= 4);
    assert.ok(payload.debate.final_orchestrator.analysis.quick_kill.checks.length >= 10);
    assert.ok(payload.debate.final_orchestrator.analysis.quick_kill.checks.some((item) => item.id === "model_router"));
    assert.match(payload.debate.final_orchestrator.analysis.one_line_conclusion, /ASML/i);
    assert.ok(payload.debate.final_orchestrator.analysis.scorecard.some((item) => /structural|support|thesis/i.test(item.summary)));
    assert.ok(payload.debate.agents.some((item) => item.id === "catalyst_map"));
  } finally {
    if (previousEnabled === undefined) delete process.env.VALUATION_OS_LLM_ENABLED;
    else process.env.VALUATION_OS_LLM_ENABLED = previousEnabled;
    if (previousKey === undefined) delete process.env.VALUATION_OS_LLM_API_KEY;
    else process.env.VALUATION_OS_LLM_API_KEY = previousKey;
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    resetRuntime();
  }
});

test("valuation OS debate falls back when final orchestrator is rate limited", async () => {
  const previousEnabled = process.env.VALUATION_OS_LLM_ENABLED;
  const previousKey = process.env.VALUATION_OS_LLM_API_KEY;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.VALUATION_OS_LLM_ENABLED = "true";
  process.env.VALUATION_OS_LLM_API_KEY = "test-key";
  delete process.env.OPENAI_API_KEY;
  resetRuntime();

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Too many API requests" }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "2" },
    });

  try {
    const response = await postDebate({ ...basePayload, mode: "bull" });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.debate.final_orchestrator.status, "rate_limited");
    assert.equal(payload.debate.context_pack.version, "valuation_context_pack_v1");
    assert.equal(payload.debate.catalyst_pack.version, "valuation_catalyst_pack_v1");
    assert.equal(payload.debate.final_orchestrator.schema.ok, true);
    assert.equal(payload.debate.call_budget.specialist_llm_calls, 0);
    assert.equal(payload.debate.call_budget.final_orchestrator_actual_calls, 0);
    assert.ok(payload.debate.final_orchestrator.retry_after_ms > 0);
    assert.match(payload.debate.final_orchestrator.analysis.executive_judgment, /ASML/i);
    assert.ok(payload.debate.final_orchestrator.analysis.scorecard.length >= 4);
    assert.ok(payload.debate.final_orchestrator.analysis.quick_kill.checks.length >= 10);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousEnabled === undefined) delete process.env.VALUATION_OS_LLM_ENABLED;
    else process.env.VALUATION_OS_LLM_ENABLED = previousEnabled;
    if (previousKey === undefined) delete process.env.VALUATION_OS_LLM_API_KEY;
    else process.env.VALUATION_OS_LLM_API_KEY = previousKey;
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    resetRuntime();
  }
});

test("valuation OS committee blocks incomplete live drivers", async () => {
  const previousEnabled = process.env.VALUATION_OS_LLM_ENABLED;
  process.env.VALUATION_OS_LLM_ENABLED = "false";
  resetRuntime();

  try {
    const response = await postDebate({
      ...basePayload,
      ticker: "THIN",
      drivers: {
        ...basePayload.drivers,
        ticker: "THIN",
        baseFcf: null,
        revenueCagr: null,
        roic: null,
        reinvestment: null,
        thesisQuality: null,
        demandSupply: null,
        bottleneckPower: null,
        dataQuality: 0.35,
      },
      missingDrivers: ["baseFcf", "revenueCagr", "roic", "reinvestment", "thesisQuality", "demandSupply", "bottleneckPower"],
      valuation: null,
      upside: null,
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    const analysis = payload.debate.final_orchestrator.analysis;
    assert.equal(analysis.decision, "Not decision-ready");
    assert.equal(payload.debate.context_pack.dataQuality.level, "limited");
    assert.equal(payload.debate.catalyst_pack.version, "valuation_catalyst_pack_v1");
    assert.equal(payload.debate.final_orchestrator.schema.ok, true);
    assert.equal(analysis.action, "repair_data");
    assert.equal(analysis.quick_kill.hard_fail, true);
    assert.ok(analysis.quick_kill.checks.some((item) => item.id === "source_file" && item.status === "fail"));
    assert.ok(analysis.quick_kill.checks.some((item) => item.id === "structural_support" && item.status === "fail"));
    assert.ok(analysis.quick_kill.checks.some((item) => item.id === "model_router"));
    assert.match(analysis.one_line_conclusion, /not decision-ready/i);
  } finally {
    if (previousEnabled === undefined) delete process.env.VALUATION_OS_LLM_ENABLED;
    else process.env.VALUATION_OS_LLM_ENABLED = previousEnabled;
    resetRuntime();
  }
});
