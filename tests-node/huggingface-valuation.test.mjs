import assert from "node:assert/strict";
import test from "node:test";

import { attachAuroraDecisionSystem } from "../lib/server/aurora-decision-system.js";

function researchPayload() {
  return {
    ok: true,
    ticker: "BIOX",
    company_profile: {
      name: "Bio X",
      ticker: "BIOX",
      exchange: "NASDAQ",
      currency: "USD",
      sector: "Healthcare",
      industry: "Biotechnology",
      market_cap: 50_000_000,
    },
    financials: { annual: [], ratios: {} },
    valuation: {
      available: false,
      status: "not_decision_ready",
      currency: "USD",
      current_price: 5,
      market_data_as_of: "2026-07-28",
      price_validation: {
        status: "provider_reconciled",
        research_usable: true,
        source: "Yahoo Finance chart",
      },
    },
    sources: { coverage: {}, records: [], data_points: [] },
    audit: { status: "indicative", findings: [] },
  };
}

test("Hugging Face adds a bounded open-source explanation but cannot replace the calculated range", async () => {
  const previous = {
    enabled: process.env.HUGGINGFACE_VALUATION_ENABLED,
    token: process.env.HF_TOKEN,
    model: process.env.HUGGINGFACE_VALUATION_MODEL,
    baseUrl: process.env.HUGGINGFACE_BASE_URL,
    fetch: globalThis.fetch,
  };
  process.env.HUGGINGFACE_VALUATION_ENABLED = "true";
  process.env.HF_TOKEN = "hf_test_token";
  process.env.HUGGINGFACE_VALUATION_MODEL = "Qwen/Qwen2.5-7B-Instruct:fastest";
  process.env.HUGGINGFACE_BASE_URL = "https://router.huggingface.co/v1";
  let requestBody = null;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://router.huggingface.co/v1/chat/completions");
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            archetype: "pre_revenue",
            summary: "El valor depende de hitos, financiación y dilución.",
            why: [
              { title: "Hitos", explanation: "Cambian la probabilidad de éxito del activo." },
              { title: "Caja", explanation: "Define el runway antes de una nueva financiación." },
            ],
            risks: ["Dilución", "Fallo clínico"],
            confidence_explanation: "La confianza es baja porque el rango usa un prior sectorial amplio.",
            range: { low: 999, central: 1000, high: 1001 },
          }),
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await attachAuroraDecisionSystem(researchPayload());

    assert.equal(requestBody.model, "Qwen/Qwen2.5-7B-Instruct:fastest");
    assert.match(requestBody.messages[0].content, /no calcules|do not calculate/i);
    assert.equal(result.aurora.explanation.provider, "huggingface");
    assert.equal(result.aurora.explanation.model, "Qwen/Qwen2.5-7B-Instruct:fastest");
    assert.equal(result.aurora.explanation.summary, "El valor depende de hitos, financiación y dilución.");
    assert.equal(result.aurora.explanation.why.length, 2);
    assert.equal(result.aurora.explanation.range, undefined);
    assert.deepEqual(result.aurora.indicativeValuation.range, { low: 1.5, central: 5, high: 12.5 });
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of [
      ["HUGGINGFACE_VALUATION_ENABLED", previous.enabled],
      ["HF_TOKEN", previous.token],
      ["HUGGINGFACE_VALUATION_MODEL", previous.model],
      ["HUGGINGFACE_BASE_URL", previous.baseUrl],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("valuation remains useful with a deterministic explanation when Hugging Face is unavailable", async () => {
  const previousEnabled = process.env.HUGGINGFACE_VALUATION_ENABLED;
  const previousToken = process.env.HF_TOKEN;
  process.env.HUGGINGFACE_VALUATION_ENABLED = "false";
  delete process.env.HF_TOKEN;
  try {
    const result = await attachAuroraDecisionSystem(researchPayload());

    assert.equal(result.aurora.explanation.provider, "deterministic");
    assert.match(result.aurora.explanation.summary, /rango|valor/i);
    assert.deepEqual(result.aurora.indicativeValuation.range, { low: 1.5, central: 5, high: 12.5 });
    assert.doesNotMatch(JSON.stringify(result.aurora.explanation), /faltan datos/i);
  } finally {
    if (previousEnabled === undefined) delete process.env.HUGGINGFACE_VALUATION_ENABLED;
    else process.env.HUGGINGFACE_VALUATION_ENABLED = previousEnabled;
    if (previousToken === undefined) delete process.env.HF_TOKEN;
    else process.env.HF_TOKEN = previousToken;
  }
});
