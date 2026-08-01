import assert from "node:assert/strict";
import test from "node:test";

import { explainValuationWithHuggingFace } from "../lib/server/huggingface-valuation.js";

const HF_ENV_KEYS = [
  "HUGGINGFACE_VALUATION_ENABLED",
  "HUGGINGFACE_API_KEY",
  "HF_TOKEN",
  "HUGGINGFACE_VALUATION_MODEL",
  "HUGGINGFACE_BASE_URL",
];

function researchPayload() {
  return {
    ticker: "TRACE",
    company_profile: {
      name: "Traceable Company",
      sector: "Industrials",
      industry: "Machinery",
    },
  };
}

function researchGradeValuation(overrides = {}) {
  return {
    status: "research_grade",
    basis: "conditional_fundamental_model",
    method: "multi_stage_dcf",
    currency: "USD",
    range: { low: -5_000_000, central: null, high: 1_234.56 },
    currentPrice: 42.25,
    priceSource: "Primary market feed",
    marketDataAsOf: "2026-08-01",
    reason: "Intervalo fundamental condicionado a hechos trazables.",
    confidence: {
      label: "Media",
      score: 0.58,
      reason: "La confianza permanece condicionada por la cobertura observada.",
    },
    limitations: ["La evidencia aun no permite publicar un caso central."],
    marketImplied: {
      expectations: [
        { key: "exit_multiple", label: "Multiplo de salida", interpretation: "Multiplo observado en el caso.", value: 5, unit: "x" },
        { key: "enterprise_value", label: "Valor empresa", interpretation: "Valor empresa trazable.", value: 5_000_000, unit: "currency" },
        { key: "market_cap", label: "Capitalizacion", interpretation: "Capitalizacion trazable.", value: 1_200_000_000, unit: "currency" },
      ],
    },
    drivers: [
      { key: "growth", label: "Crecimiento", why: "Crecimiento normalizado observado.", value: -0.05, unit: "percent" },
    ],
    closureRequirements: [
      { key: "equity_bridge", control: "Puente de capital", why: "Cierra el puente entre valor empresa y capital." },
    ],
    ...overrides,
  };
}

function marketImpliedValuation() {
  return {
    status: "market_implied",
    basis: "market_observation",
    method: "market_implied_expectations",
    currency: "USD",
    range: null,
    currentPrice: 42.25,
    priceSource: "Primary market feed",
    marketDataAsOf: "2026-08-01",
    reason: "El precio observado exige expectativas que deben hacerse explicitas.",
    confidence: { label: "Baja", score: 0.22, reason: "No se publica un fair value sin evidencia fundamental." },
    marketImplied: {
      expectations: [
        { key: "price_to_fcf", label: "Precio sobre FCF", interpretation: "El mercado paga este multiplo de flujo.", value: 5, unit: "x", source: "Primary market feed", asOf: "2026-08-01" },
      ],
    },
    closureRequirements: [],
    limitations: [],
  };
}

function blockedValuation() {
  return {
    status: "blocked",
    basis: "unresolved",
    method: "unresolved",
    currency: "USD",
    range: null,
    currentPrice: null,
    reason: "La lectura queda bloqueada hasta cerrar controles trazables.",
    confidence: { label: "Baja", score: 0.1, reason: "No existe ancla suficiente para publicar valor." },
    closureRequirements: [
      { key: "net_debt", control: "Deuda neta", why: "Se requiere deuda neta citada para cerrar el puente de capital." },
    ],
    limitations: [],
  };
}

async function withHfEnvironment(enabled, callback) {
  const previous = Object.fromEntries(HF_ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.HUGGINGFACE_VALUATION_ENABLED = enabled ? "true" : "false";
  if (enabled) {
    process.env.HF_TOKEN = "hf_test_token";
    process.env.HUGGINGFACE_VALUATION_MODEL = "Qwen/Qwen2.5-7B-Instruct:fastest";
    process.env.HUGGINGFACE_BASE_URL = "https://router.huggingface.co/v1";
  } else {
    delete process.env.HUGGINGFACE_API_KEY;
    delete process.env.HF_TOKEN;
  }
  try {
    return await callback();
  } finally {
    for (const key of HF_ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function promptFromRequest(options) {
  const request = JSON.parse(options.body);
  return {
    request,
    payload: JSON.parse(request.messages[1].content.split("\n").at(-1)),
  };
}

function jsonResponse(content, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function explainWith(contentFactory, valuation = researchGradeValuation()) {
  let captured = null;
  const result = await withHfEnvironment(true, () => explainValuationWithHuggingFace(researchPayload(), valuation, {
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://router.huggingface.co/v1/chat/completions");
      captured = promptFromRequest(options);
      return jsonResponse(contentFactory(captured.payload));
    },
  }));
  return { result, ...captured };
}

function factByTitle(payload, title) {
  const fact = payload.facts.find((item) => item.title === title);
  assert.ok(fact, `missing fact titled ${title}`);
  return fact;
}

test("Hugging Face rows require an exact catalog fact_id and never accept a title fallback", async () => {
  const { result } = await explainWith((payload) => {
    const price = factByTitle(payload, "Precio observado");
    return {
      summary: "Texto libre.",
      why: [{ title: price.fact_id, explanation: "Este texto intenta usar el titulo como identificador." }],
    };
  });

  assert.equal(result.provider, "deterministic");
  assert.ok(result.why.every((item) => item.fact_id));
});

test("fact ids are deterministic, namespaced and unique", async () => {
  const first = await explainWith((payload) => ({
    summary: "Explicacion controlada.",
    why: [{ fact_id: payload.facts[0].fact_id, explanation: "El piso representa el extremo bajo del rango publicado." }],
  }));
  const second = await explainWith((payload) => ({
    summary: "Explicacion controlada.",
    why: [{ fact_id: payload.facts[0].fact_id, explanation: "El piso representa el extremo bajo del rango publicado." }],
  }));
  const ids = first.payload.facts.map((fact) => fact.fact_id);

  assert.deepEqual(ids, second.payload.facts.map((fact) => fact.fact_id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^(valuation:range|market:price|market_implied:expectation|valuation:driver|closure:requirement):[a-z0-9_]+$/.test(id)), ids.join(", "));
  assert.equal(first.result.provider, "huggingface");
});

test("colliding catalog keys are rejected before any Hugging Face request", async () => {
  let fetchCalls = 0;
  const valuation = researchGradeValuation({
    drivers: [
      { key: "gross margin", label: "Margen A", why: "Primer hecho.", value: 0.2, unit: "percent" },
      { key: "gross-margin", label: "Margen B", why: "Segundo hecho.", value: 0.3, unit: "percent" },
    ],
  });

  const result = await withHfEnvironment(true, () => explainValuationWithHuggingFace(researchPayload(), valuation, {
    fetchImpl: async () => {
      fetchCalls += 1;
      return jsonResponse({});
    },
  }));

  assert.equal(fetchCalls, 0);
  assert.equal(result.provider, "deterministic");
  assert.equal(result.status, "fact_catalog_collision_fallback");
  assert.ok(result.why.every((item) => item.fact_id !== "valuation:driver:gross_margin"));
});

test("matched facts accept signed and localized numeric claims with exact units and magnitude", async () => {
  const { result } = await explainWith((payload) => ({
    summary: "Explicacion controlada.",
    why: [
      { fact_id: factByTitle(payload, "Piso del rango").fact_id, explanation: "El piso trazable es -$5M." },
      { fact_id: factByTitle(payload, "Techo del rango").fact_id, explanation: "El techo trazable es $1.234,56." },
      { fact_id: factByTitle(payload, "Multiplo de salida").fact_id, explanation: "El multiplo trazable es 5x." },
      { fact_id: factByTitle(payload, "Valor empresa").fact_id, explanation: "El valor empresa trazable es $5M." },
      { fact_id: factByTitle(payload, "Capitalizacion").fact_id, explanation: "La capitalizacion trazable es USD 1,2B." },
      { fact_id: factByTitle(payload, "Crecimiento").fact_id, explanation: "El crecimiento trazable es -5,0%." },
    ],
  }));

  assert.equal(result.provider, "huggingface");
  assert.equal(result.why.length, 5, "the bounded response keeps the first five valid fact-bound rows");
  assert.deepEqual(result.why.map((item) => item.fact_id), [
    "valuation:range:low",
    "valuation:range:high",
    "market_implied:expectation:exit_multiple",
    "market_implied:expectation:enterprise_value",
    "market_implied:expectation:market_cap",
  ]);
});

test("a matching price fact_id cannot ground unsupported certainty, demand, dominance or moat claims", async () => {
  for (const explanation of [
    "El precio observado es $42.25 y la demanda esta garantizada.",
    "At $42.25 the company dominates its market and has an impenetrable moat.",
    "El precio observado es $42.25; la compania tiene liderazgo indiscutible.",
    "El precio observado es $42.25 y la cultura interna es excelente.",
    "El precio observado de $42.25 es un precio excelente.",
  ]) {
    const { result } = await explainWith((payload) => ({
      why: [{ fact_id: factByTitle(payload, "Precio observado").fact_id, explanation }],
    }));

    assert.equal(result.provider, "deterministic", explanation);
  }
});

test("every sentence must remain anchored to the matched fact", async () => {
  const { result } = await explainWith((payload) => ({
    why: [{
      fact_id: factByTitle(payload, "Precio observado").fact_id,
      explanation: "El precio observado por accion es USD 42.25. La gerencia ejecuta bien su estrategia.",
    }],
  }));

  assert.equal(result.provider, "deterministic");
});

test("legitimate lexical paraphrases of the matched price fact remain accepted", async () => {
  const { result } = await explainWith((payload) => ({
    why: [{
      fact_id: factByTitle(payload, "Precio observado").fact_id,
      explanation: "La accion cotiza a USD 42.25.",
    }],
  }));

  assert.equal(result.provider, "huggingface");
  assert.equal(result.why.length, 1);
});

for (const [label, title, explanation] of [
  ["unsupported currency", "Precio observado", "El precio correcto seria $999."],
  ["wrong percentage unit", "Precio observado", "El precio equivale a -5%."],
  ["wrong multiple unit", "Precio observado", "El precio equivale a 5x."],
  ["wrong magnitude", "Precio observado", "El precio equivale a $5M."],
  ["number borrowed from another fact", "Piso del rango", "El piso seria $1,234.56."],
]) {
  test(`a row is rejected for ${label}`, async () => {
    const { result } = await explainWith((payload) => ({
      summary: "Explicacion controlada.",
      why: [{ fact_id: factByTitle(payload, title).fact_id, explanation }],
    }));

    assert.equal(result.provider, "deterministic");
  });
}

test("an unbreakable overlong explanation is rejected instead of truncating a word", async () => {
  const { result } = await explainWith((payload) => ({
    summary: "Explicacion controlada.",
    why: [{ fact_id: payload.facts[0].fact_id, explanation: "X".repeat(500) }],
  }));

  assert.equal(result.provider, "deterministic");
  assert.ok(result.why.every((item) => item.explanation !== "X".repeat(320)));
});

test("Hugging Face can explain facts but cannot alter summary, risks, confidence, archetype or decision contract", async () => {
  const valuation = researchGradeValuation();
  const { result, request } = await explainWith((payload) => ({
    archetype: "guaranteed_winner",
    status: "decision_ready",
    range: { low: 999, central: 1000, high: 1001 },
    price: 999,
    confidence: { label: "Alta", score: 1 },
    summary: "Decision ready con precio objetivo $999.",
    why: [
      { fact_id: payload.facts[0].fact_id, explanation: "El piso representa el extremo bajo del rango publicado." },
      { fact_id: payload.facts[1].fact_id, explanation: "Este activo ya es decision-ready y se debe comprar." },
    ],
    risks: ["El riesgo cae a -5%."],
    confidence_explanation: "Confianza 100% garantizada.",
  }), valuation);

  assert.match(request.messages[0].content, /fact_id/i);
  assert.equal(result.provider, "huggingface");
  assert.equal(result.model, "Qwen/Qwen2.5-7B-Instruct:fastest");
  assert.equal(result.summary, valuation.reason);
  assert.deepEqual(result.risks, valuation.limitations);
  assert.equal(result.confidenceExplanation, valuation.confidence.reason);
  assert.equal(result.archetype, valuation.basis);
  assert.equal(result.why.length, 1);
  assert.equal(result.range, undefined);
  assert.equal(result.price, undefined);
  assert.equal(result.confidence, undefined);
  assert.equal(result.decisionStatus, undefined);
  assert.doesNotMatch(JSON.stringify(result), /999|100%|guaranteed_winner|comprar|decision-ready/i);
});

test("deterministic fallback remains useful for research_grade, market_implied and blocked states when facts exist", async () => {
  for (const valuation of [researchGradeValuation(), marketImpliedValuation(), blockedValuation()]) {
    const result = await withHfEnvironment(false, () => explainValuationWithHuggingFace(researchPayload(), valuation));
    assert.equal(result.provider, "deterministic", valuation.status);
    assert.ok(result.summary, valuation.status);
    assert.ok(result.why.length > 0, valuation.status);
    assert.ok(result.why.every((item) => item.fact_id && item.title && item.explanation), valuation.status);
  }
});
