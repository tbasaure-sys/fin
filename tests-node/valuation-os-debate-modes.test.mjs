import assert from "node:assert/strict";
import test from "node:test";

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

function withoutLlmEnv(fn) {
  const saved = {
    enabled: process.env.VALUATION_OS_LLM_ENABLED,
    key: process.env.VALUATION_OS_LLM_API_KEY,
    equity: process.env.EQUITY_RESEARCH_LLM_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };
  process.env.VALUATION_OS_LLM_ENABLED = "auto";
  delete process.env.VALUATION_OS_LLM_API_KEY;
  delete process.env.EQUITY_RESEARCH_LLM_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const restore = () => {
    if (saved.enabled === undefined) delete process.env.VALUATION_OS_LLM_ENABLED; else process.env.VALUATION_OS_LLM_ENABLED = saved.enabled;
    if (saved.key === undefined) delete process.env.VALUATION_OS_LLM_API_KEY; else process.env.VALUATION_OS_LLM_API_KEY = saved.key;
    if (saved.equity === undefined) delete process.env.EQUITY_RESEARCH_LLM_API_KEY; else process.env.EQUITY_RESEARCH_LLM_API_KEY = saved.equity;
    if (saved.openai === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved.openai;
  };
  return fn().finally(restore);
}

const maturePayload = {
  ticker: "MAT",
  mode: "base",
  drivers: {
    ticker: "MAT", name: "Mature Corp", sector: "Industrial", price: 120,
    baseFcf: 8, revenueCagr: 0.06, margin: 0.24, roic: 0.18, terminalRoic: 0.13,
    wacc: 0.09, terminalGrowth: 0.02, reinvestment: 0.4, dilution: 0,
    moatHalfLife: 8, thesisQuality: 0.7, demandSupply: 0.65, bottleneckPower: 0.6,
    dataQuality: 0.75, modelRisk: 0.25, beta: 1,
  },
  snapshot: {
    company: { ticker: "MAT", entityName: "Mature Corp", fiscalYear: "2025", form: "10-K" },
    coverage: { secCompanyfacts: true, quoteSource: "FMP", fmpConfigured: true, fredConfigured: true },
    facts: { revenue: { value: 12_000_000_000 }, fcf: 2_000_000_000, shares: { value: 250_000_000 } },
  },
  valuation: 150, upside: 0.25, expectedIrr: 0.06, impliedCagr: 0.05,
  feasibility: 0.66, quality: 0.7, probabilityAbovePrice: 0.62,
  missingDrivers: [], tripwires: [],
};

const preRevenuePayload = {
  ...maturePayload,
  ticker: "EARLY",
  drivers: { ...maturePayload.drivers, ticker: "EARLY", name: "Early Bio", price: 6, baseFcf: null },
  snapshot: {
    ...maturePayload.snapshot,
    company: { ticker: "EARLY", entityName: "Early Bio", fiscalYear: "2025", form: "10-K" },
    facts: { revenue: { value: 0 }, fcf: -50_000_000, cfo: { value: -48_000_000 }, shares: { value: 80_000_000 } },
  },
  valuation: null, upside: null,
  preRevenueExtras: {
    cashUsd: 90_000_000,
    somUsd: 600_000_000,
    targetMargin: 0.22,
    yearsToScale: 6,
    milestones: [{ label: "Fase 3", probability: 0.55 }],
  },
};

test("debate exposes explicit no-API runtime mode and stays useful for a mature company", async () => {
  await withoutLlmEnv(async () => {
    resetRuntime();
    const response = await postDebate(maturePayload);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.debate.runtime_mode.id, "no_api");
    assert.match(payload.debate.runtime_mode.detail, /determinístico/i);
    assert.equal(payload.debate.final_orchestrator.enabled, false);
    assert.equal(payload.debate.call_budget.final_orchestrator_actual_calls, 0);
    // Mature company must NOT be routed to the pre-revenue lens.
    assert.equal(payload.debate.pre_revenue.applicable, false);
    assert.ok(payload.debate.deterministic_verdict.decision);
  });
});

test("debate attaches honest pre-revenue lens with probability-weighted scenarios", async () => {
  await withoutLlmEnv(async () => {
    resetRuntime();
    const response = await postDebate(preRevenuePayload);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    const lens = payload.debate.pre_revenue;
    assert.equal(lens.applicable, true);
    assert.equal(lens.status, "ok");
    assert.equal(lens.methodology, "probability_weighted_scenarios");
    assert.equal(lens.scenarios.length, 3);
    assert.ok(lens.probabilityWeightedValuePerShare > 0);
    assert.ok(lens.runway.runwayYears > 1);
    assert.ok(lens.falsifiers.length >= 2);
  });
});

test("debate abstains from pre-revenue fair value when data is insufficient", async () => {
  await withoutLlmEnv(async () => {
    resetRuntime();
    const response = await postDebate({ ...preRevenuePayload, ticker: "EARLY2", preRevenueExtras: {} });
    const payload = await response.json();
    assert.equal(payload.ok, true);
    const lens = payload.debate.pre_revenue;
    assert.equal(lens.applicable, true);
    assert.ok(["expectations_only", "abstain"].includes(lens.status));
    assert.equal(lens.probabilityWeightedValuePerShare, null);
    assert.ok(lens.missingInputs.length >= 1);
  });
});
