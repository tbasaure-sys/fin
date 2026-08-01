import "server-only";

const FACT_NAMESPACES = {
  range: "valuation:range",
  price: "market:price",
  expectation: "market_implied:expectation",
  driver: "valuation:driver",
  closure: "closure:requirement",
};

const NUMERIC_CLAIM_PATTERN = /(?<![\p{L}\p{N}_])(?:\(\s*)?(?:(?:USD|EUR|GBP|CLP|CAD|AUD)\s*)?(?:[+-]\s*)?(?:[$€£]\s*)?(?:[+-]\s*)?(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:MM|BN|K|M|B|T)?\s*(?:%|[x×]|a(?:ñ|n)os?|years?)?(?:\s*\))?(?![\p{L}\p{N}_])/giu;
const UNSAFE_DECISION_LANGUAGE = /\b(?:decision[_ -]?ready|lista\s+para\s+(?:la\s+)?decisi[oó]n|apta\s+para\s+(?:la\s+)?decisi[oó]n|fair\s+value|valor\s+razonable|precio\s+objetivo|target\s+price|comprar|vender|recomendaci[oó]n\s+de\s+inversi[oó]n|confianza\s+(?:alta|media|baja))\b/i;

const FACT_SCOPED_CLAIM_PATTERNS = [
  /\b(?:garantiza(?:da|do|das|dos)?|garantia|guarantee(?:d|s)?|certainty|certain|inevitable|assured|indiscutible|undisputed|risk free|sin riesgo)\b/,
  /\b(?:demanda|demand|backlog|pedidos?|orders?)\b/,
  /\b(?:domina(?:nte|n|r|tes)?|dominio|dominates?|dominance|dominant|lider(?:es|azgo)?|leader(?:ship)?|market share|cuota de mercado)\b/,
  /\b(?:moat|foso|ventaja competitiva|competitive advantage|barreras? de entrada|barriers? to entry|monopol(?:io|y)|impenetrable)\b/,
  /\b(?:gerencia|management|ejecucion|execution|ejecuta|executes?|estrategia|strategy)\b/,
  /\b(?:ingresos?|revenue|ventas|sales|margen(?:es)?|margins?|rentabilidad|profitability|beneficios?|earnings|flujo de caja|cash flow|deuda|debt|riesgo|risk)\b/,
  /\b(?:excelente|exceptional|excepcional|atractiv[oa]|attractive|infravalorad[oa]|undervalued|sobrevalorad[oa]|overvalued|barat[oa]|cheap|car[oa]|expensive|ganador|winner|outperform|calidad|quality|fuerte|strong|solido|solid|robusto|robust|resiliente|resilient)\b/,
];
const GROUNDING_STOP_WORDS = new Set([
  "accion", "acciones", "actual", "al", "amounts", "an", "and", "are", "as", "asciende", "at", "be",
  "been", "being", "by", "como", "con", "company", "compania", "corresponde", "corresponds", "dato",
  "datos", "data", "de", "del", "desde", "donde", "el", "en", "empresa", "equals", "equivale", "es",
  "esta", "este", "estos", "exact", "exacta", "exacto", "explicacion", "explanation", "fact", "facts",
  "for", "from", "hasta", "hecho", "hechos", "in", "is", "it", "its", "la", "las", "lectura", "linked",
  "indica", "indicates", "ligada", "ligado", "los", "marca", "market", "mercado", "mas", "menos", "muestra",
  "muy", "observada", "observado", "observed", "represents", "representa", "shows", "situa", "stands", "ubica",
  "of", "on", "or", "para", "por", "publicada", "publicado", "published", "que", "reading", "se", "share",
  "shares", "sin", "son", "su", "sus", "that", "the", "this", "to", "traceable", "trazable", "un", "una",
  "unas", "unos", "usd", "eur", "gbp", "clp", "cad", "aud", "with", "without", "y",
]);
const GROUNDING_TOKEN_ALIASES = new Map([
  ["cotiza", "price"], ["cotizan", "price"], ["cotizacion", "price"], ["cotizaciones", "price"],
  ["precio", "price"], ["price", "price"], ["priced", "price"], ["pricing", "price"], ["trades", "price"],
  ["trading", "price"], ["piso", "range_low"], ["floor", "range_low"], ["bajo", "range_low"],
  ["inferior", "range_low"],
  ["low", "range_low"], ["techo", "range_high"], ["ceiling", "range_high"], ["alto", "range_high"],
  ["high", "range_high"], ["superior", "range_high"], ["rango", "range"], ["range", "range"], ["intervalo", "range"],
  ["interval", "range"], ["central", "central"], ["midpoint", "central"], ["multiplo", "multiple"],
  ["multiple", "multiple"], ["multiples", "multiple"], ["crecimiento", "growth"], ["growth", "growth"],
  ["capitalizacion", "market_cap"], ["capitalization", "market_cap"], ["deuda", "debt"], ["debt", "debt"],
  ["puente", "bridge"], ["bridge", "bridge"], ["flujo", "cash_flow"], ["cashflow", "cash_flow"],
  ["requisito", "requirement"], ["requirement", "requirement"], ["valor", "value"], ["value", "value"],
]);

function cleanText(value, limit = 600) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.split(" ").some((token) => token.length > limit)) return "";
  if (normalized.length <= limit) return normalized;
  const boundary = normalized.lastIndexOf(" ", limit);
  return boundary > 0 ? normalized.slice(0, boundary).trim() : "";
}

function slugKey(value) {
  return cleanText(value, 120)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizedGroundingText(value) {
  return cleanText(value, 1_000)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function groundingTokens(value) {
  return normalizedGroundingText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !/\d/.test(token) && !GROUNDING_STOP_WORDS.has(token))
    .map((token) => GROUNDING_TOKEN_ALIASES.get(token) || token);
}

function sentenceIsFactAnchored(sentence, factText, factTokens) {
  const normalizedSentence = normalizedGroundingText(sentence);
  if (!normalizedSentence) return false;
  if (FACT_SCOPED_CLAIM_PATTERNS.some((pattern) => pattern.test(normalizedSentence) && !pattern.test(factText))) {
    return false;
  }
  const sentenceTokens = groundingTokens(sentence);
  if (!sentenceTokens.length) return false;
  const anchoredTokenCount = sentenceTokens.filter((token) => factTokens.has(token)).length;
  return anchoredTokenCount > 0 && (anchoredTokenCount * 3) >= (sentenceTokens.length * 2);
}

function explanationIsFactAnchored(explanation, fact) {
  const factText = normalizedGroundingText(`${fact?.title || ""} ${fact?.detail || ""}`);
  const factTokens = new Set(groundingTokens(factText));
  if (!factText || !factTokens.size) return false;
  const sentences = explanation
    .split(/(?:[.!?;]+)(?=\s|$)/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.length > 0
    && sentences.every((sentence) => sentenceIsFactAnchored(sentence, factText, factTokens));
}

function catalogFactId(namespace, value) {
  const slug = slugKey(value);
  return slug ? `${namespace}:${slug}` : "";
}

function parseJson(value) {
  const raw = cleanText(value, 10_000);
  if (!raw) return {};
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  try {
    const parsed = JSON.parse((fenced ? fenced[1] : raw).trim());
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeFactUnit(value, fallback = "number") {
  const unit = cleanText(value, 30).toLowerCase();
  if (["currency", "percent", "x", "years", "number"].includes(unit)) return unit;
  return fallback;
}

function formatFactValue(value, unit = "number", currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (unit === "percent") return `${(number * 100).toFixed(1)}%`;
  if (unit === "years") return `${number.toFixed(1)} años`;
  if (unit === "x") return `${number.toFixed(2)}x`;
  if (unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: /^[A-Z]{3}$/.test(String(currency || "").toUpperCase()) ? String(currency).toUpperCase() : "USD",
      maximumFractionDigits: Math.abs(number) >= 1000 ? 0 : 2,
    }).format(number);
  }
  return String(Number(number.toFixed(6)));
}

function buildFactCatalog(valuation) {
  const currency = cleanText(valuation?.currency, 10).toUpperCase() || "USD";
  const candidates = [];
  const counts = new Map();
  const addFact = ({ namespace, key, title, detail, source = "", asOf = null, value = null, unit = "number" }) => {
    const factId = catalogFactId(namespace, key);
    const factTitle = cleanText(title, 120);
    const factDetail = cleanText(detail, 320);
    if (!factId || !factTitle || !factDetail) return;
    counts.set(factId, (counts.get(factId) || 0) + 1);
    const numericValue = Number(value);
    const normalizedUnit = normalizeFactUnit(unit);
    candidates.push({
      fact_id: factId,
      title: factTitle,
      detail: factDetail,
      source: cleanText(source, 120) || null,
      as_of: cleanText(asOf, 40) || null,
      value: Number.isFinite(numericValue) ? numericValue : null,
      unit: normalizedUnit,
      currency: normalizedUnit === "currency" ? currency : null,
      value_text: Number.isFinite(numericValue) ? formatFactValue(numericValue, normalizedUnit, currency) : "",
    });
  };

  if (valuation?.range?.low !== null && valuation?.range?.low !== undefined) {
    addFact({
      namespace: FACT_NAMESPACES.range,
      key: "low",
      title: "Piso del rango",
      detail: `El extremo bajo visible del rango es ${formatFactValue(valuation.range.low, "currency", currency)} por acción.`,
      value: valuation.range.low,
      unit: "currency",
    });
  }
  if (valuation?.range?.central !== null && valuation?.range?.central !== undefined) {
    addFact({
      namespace: FACT_NAMESPACES.range,
      key: "central",
      title: "Caso central",
      detail: `La estimación central publicada es ${formatFactValue(valuation.range.central, "currency", currency)} por acción.`,
      value: valuation.range.central,
      unit: "currency",
    });
  }
  if (valuation?.range?.high !== null && valuation?.range?.high !== undefined) {
    addFact({
      namespace: FACT_NAMESPACES.range,
      key: "high",
      title: "Techo del rango",
      detail: `El extremo alto visible del rango es ${formatFactValue(valuation.range.high, "currency", currency)} por acción.`,
      value: valuation.range.high,
      unit: "currency",
    });
  }

  const currentPrice = valuation?.currentPrice ?? valuation?.marketImplied?.currentPrice;
  if (Number.isFinite(Number(currentPrice))) {
    addFact({
      namespace: FACT_NAMESPACES.price,
      key: "current",
      title: "Precio observado",
      detail: `El precio de mercado observado es ${formatFactValue(currentPrice, "currency", currency)} por acción.`,
      value: currentPrice,
      unit: "currency",
      source: valuation?.priceSource ?? valuation?.marketImplied?.source,
      asOf: valuation?.marketDataAsOf ?? valuation?.marketImplied?.asOf,
    });
  }

  for (const expectation of Array.isArray(valuation?.marketImplied?.expectations) ? valuation.marketImplied.expectations : []) {
    addFact({
      namespace: FACT_NAMESPACES.expectation,
      key: expectation?.key || expectation?.label,
      title: expectation?.label || expectation?.key,
      detail: expectation?.interpretation || expectation?.calculation || expectation?.detail,
      value: expectation?.value,
      unit: normalizeFactUnit(expectation?.unit),
      source: expectation?.source,
      asOf: expectation?.asOf,
    });
  }

  for (const driver of Array.isArray(valuation?.drivers) ? valuation.drivers : []) {
    const inferredUnit = ["growth", "discount_rate", "terminal_growth"].includes(driver?.key)
      ? "percent"
      : driver?.key === "years" ? "years" : "number";
    addFact({
      namespace: FACT_NAMESPACES.driver,
      key: driver?.key || driver?.label,
      title: driver?.label || driver?.key,
      detail: driver?.why || driver?.detail,
      value: driver?.value,
      unit: normalizeFactUnit(driver?.unit, inferredUnit),
      source: driver?.source,
      asOf: driver?.asOf,
    });
  }

  for (const closure of Array.isArray(valuation?.closureRequirements) ? valuation.closureRequirements : []) {
    addFact({
      namespace: FACT_NAMESPACES.closure,
      key: closure?.key || closure?.control || closure?.question,
      title: closure?.control || closure?.question || closure?.key,
      detail: closure?.why || closure?.nextAction || closure?.estimatedImpact,
      source: closure?.source,
      asOf: closure?.asOf,
    });
  }

  const collisionIds = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();
  const collisions = new Set(collisionIds);
  return {
    facts: candidates.filter((fact) => !collisions.has(fact.fact_id)).slice(0, 12),
    collisionIds,
  };
}

function parseLocalizedNumber(value) {
  const raw = String(value || "").replace(/\s/g, "");
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  const comma = raw.lastIndexOf(",");
  let normalized = raw;
  let decimals = 0;

  if (dot >= 0 && comma >= 0) {
    const decimalSeparator = dot > comma ? "." : ",";
    const groupingSeparator = decimalSeparator === "." ? "," : ".";
    decimals = raw.length - raw.lastIndexOf(decimalSeparator) - 1;
    normalized = raw.split(groupingSeparator).join("").replace(decimalSeparator, ".");
  } else if (dot >= 0 || comma >= 0) {
    const separator = dot >= 0 ? "." : ",";
    const parts = raw.split(separator);
    const allGroups = parts.length > 2 && parts.slice(1).every((part) => part.length === 3);
    const oneGrouping = parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3;
    if (allGroups || oneGrouping) {
      normalized = parts.join("");
      decimals = 0;
    } else {
      decimals = parts.at(-1).length;
      normalized = `${parts.slice(0, -1).join("")}.${parts.at(-1)}`;
    }
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? { number, decimals } : null;
}

function parseNumericClaim(value) {
  const original = String(value || "").trim();
  if (!original) return null;
  const compact = original.replace(/\s/g, "");
  const parentheticalNegative = /^\(.*\)$/.test(compact);
  const signMatches = compact.match(/[+-]/g) || [];
  if (signMatches.length > 1 || (signMatches.length === 1 && signMatches[0] === "+" && parentheticalNegative)) return null;
  const negative = parentheticalNegative || signMatches[0] === "-";
  const currencyCode = compact.match(/^(USD|EUR|GBP|CLP|CAD|AUD)/i)?.[1]?.toUpperCase() || null;
  const currencySymbol = compact.match(/[$€£]/)?.[0] || null;
  const percent = /%\)?$/i.test(compact);
  const multiple = /[x×]\)?$/i.test(compact);
  const years = /(?:a(?:ñ|n)os?|years?)\)?$/i.test(compact);
  const suffix = compact.match(/(?:MM|BN|K|M|B|T)(?=(?:%|[x×]|a(?:ñ|n)os?|years?)?\)?$)/i)?.[0]?.toUpperCase() || null;
  const numberText = compact
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .replace(/^(?:USD|EUR|GBP|CLP|CAD|AUD)/i, "")
    .replace(/[$€£]/g, "")
    .replace(/[+-]/g, "")
    .replace(/(?:%|[x×]|a(?:ñ|n)os?|years?)$/i, "")
    .replace(/(?:MM|BN|K|M|B|T)$/i, "");
  const parsed = parseLocalizedNumber(numberText);
  if (!parsed) return null;
  const multiplier = ({ K: 1e3, M: 1e6, MM: 1e6, B: 1e9, BN: 1e9, T: 1e12 })[suffix] || 1;
  const signedValue = parsed.number * multiplier * (negative ? -1 : 1);
  const kind = percent ? "percent" : multiple ? "x" : years ? "years" : currencyCode || currencySymbol ? "currency" : "number";
  const valueInFactUnits = percent ? signedValue / 100 : signedValue;
  const tolerance = (0.5 * (10 ** -parsed.decimals) * multiplier) / (percent ? 100 : 1);
  return {
    kind,
    value: valueInFactUnits,
    tolerance,
    currencyCode,
    currencySymbol,
  };
}

function currencyMatches(claim, factCurrency) {
  const expected = cleanText(factCurrency, 10).toUpperCase() || "USD";
  if (claim.currencyCode) return claim.currencyCode === expected;
  if (claim.currencySymbol === "€") return expected === "EUR";
  if (claim.currencySymbol === "£") return expected === "GBP";
  if (claim.currencySymbol === "$") return ["USD", "CLP", "CAD", "AUD"].includes(expected);
  return false;
}

function numericClaimMatchesFact(claim, fact) {
  if (!claim || !Number.isFinite(fact?.value)) return false;
  if (claim.kind !== fact.unit) return false;
  if (claim.kind === "currency" && !currencyMatches(claim, fact.currency)) return false;
  if (Math.abs(fact.value) > claim.tolerance && Math.sign(claim.value) !== Math.sign(fact.value)) return false;
  return Math.abs(claim.value - fact.value) <= Math.max(claim.tolerance, Number.EPSILON * Math.abs(fact.value) * 8);
}

function numericClaims(value, allowedAsOf = null) {
  const withoutAllowedDate = allowedAsOf
    ? String(value || "").replaceAll(String(allowedAsOf), " ")
    : String(value || "");
  return Array.from(withoutAllowedDate.matchAll(NUMERIC_CLAIM_PATTERN))
    .map((match) => parseNumericClaim(match[0]));
}

function isFactBoundExplanation(value, fact) {
  const explanation = cleanText(value, 320);
  if (!explanation || UNSAFE_DECISION_LANGUAGE.test(explanation)) return false;
  const claims = numericClaims(explanation, fact.as_of);
  return claims.every((claim) => numericClaimMatchesFact(claim, fact))
    && explanationIsFactAnchored(explanation, fact);
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

function deterministicExplanation(valuation, { status = "local", catalog = buildFactCatalog(valuation) } = {}) {
  if (!catalog.facts.length) return null;
  const baseSummary = cleanText(valuation?.reason, 600)
    || "La lectura conserva sólo hechos trazables: intervalo fundamental cuando existe evidencia suficiente, o expectativas implícitas cuando el precio es la única ancla observable.";
  return {
    provider: "deterministic",
    status,
    model: null,
    archetype: cleanText(valuation?.basis, 100) || "company",
    summary: /valor|rango|expectativa|lectura|intervalo|precio/i.test(baseSummary) ? baseSummary : `Lectura de valor: ${baseSummary}`,
    why: catalog.facts.slice(0, 5).map((fact) => ({
      fact_id: fact.fact_id,
      title: fact.title,
      explanation: fact.detail,
    })),
    risks: (Array.isArray(valuation?.limitations) ? valuation.limitations : [])
      .map((item) => cleanText(item, 240))
      .filter(Boolean)
      .slice(0, 4),
    confidenceExplanation: cleanText(valuation?.confidence?.reason, 400),
  };
}

function sanitizeExplanation(raw, config, fallback, facts) {
  const parsed = parseJson(raw);
  const factMap = new Map(facts.map((fact) => [fact.fact_id, fact]));
  const seen = new Set();
  const why = (Array.isArray(parsed.why) ? parsed.why : [])
    .map((item) => {
      const exactId = typeof item?.fact_id === "string" ? item.fact_id : "";
      if (!exactId || exactId !== cleanText(exactId, 200) || seen.has(exactId)) return null;
      const matched = factMap.get(exactId);
      const explanation = cleanText(item?.explanation, 320);
      if (!matched || !explanation || !isFactBoundExplanation(explanation, matched)) return null;
      seen.add(exactId);
      return { fact_id: matched.fact_id, title: matched.title, explanation };
    })
    .filter(Boolean)
    .slice(0, 5);
  if (!why.length) return fallback;
  return {
    provider: "huggingface",
    status: "ok",
    model: config.model,
    archetype: fallback.archetype,
    summary: fallback.summary,
    why,
    risks: fallback.risks,
    confidenceExplanation: fallback.confidenceExplanation,
  };
}

function promptPayload(research, valuation, facts) {
  return {
    ticker: cleanText(research?.ticker, 20),
    company: {
      name: cleanText(research?.company_profile?.name, 160),
      sector: cleanText(research?.company_profile?.sector, 100),
      industry: cleanText(research?.company_profile?.industry, 120),
    },
    valuation_contract: {
      status: cleanText(valuation?.status, 40),
      basis: cleanText(valuation?.basis, 100),
      method: cleanText(valuation?.method, 100),
      currency: cleanText(valuation?.currency, 10),
    },
    facts,
  };
}

export async function explainValuationWithHuggingFace(research, valuation, { fetchImpl = fetch } = {}) {
  const catalog = buildFactCatalog(valuation);
  const fallback = deterministicExplanation(valuation, { catalog });
  if (!fallback) return null;
  if (catalog.collisionIds.length) {
    return { ...fallback, status: "fact_catalog_collision_fallback" };
  }
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
            content: "Eres un analista que explica hechos de una valoración ya calculada. No calcules ni cambies estado, cifras, rango, precio, riesgo o confianza. No inventes hechos, no declares fair value y no recomiendes comprar o vender. Cada fila debe usar el fact_id exacto de un solo fact; cada oración debe ser una paráfrasis directa de ese fact y cualquier cifra debe pertenecer al mismo fact con igual signo, unidad y magnitud. No agregues certeza, demanda, dominio, cuota de mercado, moat ni otra inferencia que el fact no declare. Devuelve sólo JSON con why[{fact_id,explanation}].",
          },
          {
            role: "user",
            content: `Explica en español por qué estos hechos sostienen la lectura. Usa exclusivamente este objeto:\n${JSON.stringify(promptPayload(research, valuation, catalog.facts))}`,
          },
        ],
      }),
    });
    if (!response.ok) return { ...fallback, status: `hf_${response.status}_fallback` };
    const payload = await response.json();
    return sanitizeExplanation(payload?.choices?.[0]?.message?.content, config, fallback, catalog.facts);
  } catch {
    return { ...fallback, status: "hf_unavailable_fallback" };
  } finally {
    clearTimeout(timeoutId);
  }
}
