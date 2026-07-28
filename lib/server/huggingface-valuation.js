import "server-only";

function cleanText(value, limit = 600) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, limit)
    : "";
}

function cleanRows(value, limit = 5) {
  return (Array.isArray(value) ? value : [])
    .map((item) => ({
      title: cleanText(item?.title || item?.label, 100),
      explanation: cleanText(item?.explanation || item?.detail, 320),
    }))
    .filter((item) => item.title && item.explanation)
    .slice(0, limit);
}

function parseJson(value) {
  const raw = cleanText(value, 10_000);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  try {
    const parsed = JSON.parse((fenced ? fenced[1] : raw).trim());
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function enabledFlag(value) {
  const flag = cleanText(value, 20).toLowerCase();
  if (["0", "false", "no", "off", "disabled"].includes(flag)) return false;
  if (["1", "true", "yes", "on", "enabled"].includes(flag)) return true;
  return null;
}

export function huggingFaceValuationConfig() {
  const apiKey = cleanText(process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN, 500);
  const explicit = enabledFlag(process.env.HUGGINGFACE_VALUATION_ENABLED || "auto");
  return {
    enabled: explicit === null ? Boolean(apiKey) : explicit,
    apiKey,
    baseUrl: cleanText(process.env.HUGGINGFACE_BASE_URL || "https://router.huggingface.co/v1", 500).replace(/\/$/, ""),
    model: cleanText(process.env.HUGGINGFACE_VALUATION_MODEL || "Qwen/Qwen2.5-7B-Instruct:fastest", 200),
    timeoutMs: Math.max(4_000, Math.min(25_000, Number(process.env.HUGGINGFACE_VALUATION_TIMEOUT_MS || 12_000))),
    maxTokens: Math.max(250, Math.min(1_200, Number(process.env.HUGGINGFACE_VALUATION_MAX_TOKENS || 700))),
  };
}

function deterministicExplanation(valuation, { status = "local" } = {}) {
  if (!valuation?.range) return null;
  const why = (Array.isArray(valuation.drivers) ? valuation.drivers : [])
    .map((driver) => ({
      title: cleanText(driver?.label, 100),
      explanation: cleanText(driver?.why, 320),
    }))
    .filter((item) => item.title && item.explanation)
    .slice(0, 5);
  return {
    provider: "deterministic",
    status,
    model: null,
    archetype: cleanText(valuation.basis, 100) || "company",
    summary: cleanText(valuation.reason, 600) || "El rango de valor se construye con supuestos visibles y una incertidumbre proporcional a su evidencia.",
    why,
    risks: (Array.isArray(valuation.limitations) ? valuation.limitations : []).map((item) => cleanText(item, 240)).filter(Boolean).slice(0, 4),
    confidenceExplanation: cleanText(valuation?.confidence?.reason, 400),
  };
}

function sanitizeExplanation(raw, config, fallback) {
  const parsed = parseJson(raw);
  const why = cleanRows(parsed.why);
  const summary = cleanText(parsed.summary, 600);
  if (!summary || !why.length) return fallback;
  return {
    provider: "huggingface",
    status: "ok",
    model: config.model,
    archetype: cleanText(parsed.archetype, 100) || fallback.archetype,
    summary,
    why,
    risks: (Array.isArray(parsed.risks) ? parsed.risks : []).map((item) => cleanText(item, 240)).filter(Boolean).slice(0, 4),
    confidenceExplanation: cleanText(parsed.confidence_explanation, 400) || fallback.confidenceExplanation,
  };
}

function promptPayload(research, valuation) {
  return {
    ticker: cleanText(research?.ticker, 20),
    company: {
      name: cleanText(research?.company_profile?.name, 160),
      sector: cleanText(research?.company_profile?.sector, 100),
      industry: cleanText(research?.company_profile?.industry, 120),
    },
    calculated_valuation: {
      basis: valuation?.basis,
      method: valuation?.method,
      range: valuation?.range,
      currency: valuation?.currency,
      current_price: valuation?.currentPrice,
      confidence: valuation?.confidence,
      drivers: valuation?.drivers,
      limitations: valuation?.limitations,
    },
  };
}

export async function explainValuationWithHuggingFace(research, valuation, { fetchImpl = fetch } = {}) {
  const fallback = deterministicExplanation(valuation);
  if (!fallback) return null;
  const config = huggingFaceValuationConfig();
  if (!config.enabled || !config.apiKey) return fallback;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        max_tokens: config.maxTokens,
        messages: [
          {
            role: "system",
            content: "Eres un analista que explica una valoración ya calculada. No calcules ni cambies cifras, rango, precio o confianza. No inventes hechos ni recomiendes comprar o vender. Devuelve sólo JSON con archetype, summary, why[{title,explanation}], risks[] y confidence_explanation.",
          },
          {
            role: "user",
            content: `Explica en español por qué el motor produjo este rango. Usa exclusivamente este objeto:\n${JSON.stringify(promptPayload(research, valuation))}`,
          },
        ],
      }),
    });
    if (!response.ok) return deterministicExplanation(valuation, { status: `hf_${response.status}_fallback` });
    const payload = await response.json();
    return sanitizeExplanation(payload?.choices?.[0]?.message?.content, config, fallback);
  } catch {
    return deterministicExplanation(valuation, { status: "hf_unavailable_fallback" });
  } finally {
    clearTimeout(timeoutId);
  }
}
