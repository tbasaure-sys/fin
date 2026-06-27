const DEFAULT_CACHE_MS = 6 * 60 * 60 * 1000;

const runtimeState =
  globalThis.__VALUATION_CATALYST_NEWS_RUNTIME__ ||
  {
    cache: new Map(),
  };

globalThis.__VALUATION_CATALYST_NEWS_RUNTIME__ = runtimeState;

const TAG_TERMS = {
  demand: ["demand", "orders", "backlog", "bookings", "sales", "customers", "unit growth", "usage", "utilization"],
  supply: ["supply", "capacity", "inventory", "lead time", "shortage", "expansion", "dual-source", "substitute"],
  bottleneck: ["bottleneck", "scarce", "scarcity", "constraint", "lithography", "euv", "switching cost", "lead times"],
  regulation: ["regulation", "regulatory", "policy", "export control", "sanction", "tariff", "antitrust", "china", "reimbursement"],
  earnings: ["earnings", "revenue", "margin", "profit", "eps", "guidance", "cash flow", "free cash flow", "forecast"],
  capex_cycle: ["capex", "capital expenditure", "investment", "fab", "plant", "equipment", "cycle", "capacity expansion"],
};

const POSITIVE_TERMS = ["beat", "beats", "raise", "raises", "raised", "growth", "strong", "record", "upgrade", "wins", "surge", "robust"];
const NEGATIVE_TERMS = ["miss", "misses", "cut", "cuts", "weak", "decline", "slowdown", "delay", "risk", "probe", "restriction", "sanction", "lawsuit", "downgrade"];

function cleanEnv(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  if (/^(dummy|replace_me|your_key_here|your_email@example\.com)$/i.test(cleaned)) return "";
  return cleaned;
}

function cacheTtlMs() {
  const configured = Number(process.env.VALUATION_CATALYST_NEWS_CACHE_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_CACHE_MS;
}

function cacheKey(input) {
  return [
    String(input.ticker || "").toUpperCase(),
    String(input.companyName || "").toLowerCase().slice(0, 80),
    Boolean(input.fmpApiKey || cleanEnv(process.env.FMP_API_KEY) || cleanEnv(process.env.FINANCIAL_MODELING_PREP_API_KEY)),
    Boolean(input.braveApiKey || cleanEnv(process.env.BRAVE_SEARCH_API_KEY) || cleanEnv(process.env.BRAVE_API_KEY)),
  ].join(":");
}

function getCache(key) {
  const cached = runtimeState.cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > cacheTtlMs()) {
    runtimeState.cache.delete(key);
    return null;
  }
  return cached.payload;
}

function setCache(key, payload) {
  runtimeState.cache.set(key, { createdAt: Date.now(), payload });
}

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 9000);
  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`${options.provider || "provider"} failed with ${response.status}: ${text.slice(0, 160)}`);
      error.status = response.status;
      throw error;
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeoutId);
  }
}

function textOf(...parts) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function includesAny(text, terms) {
  const haystack = String(text || "").toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function catalystTagsFor(text) {
  const tags = Object.entries(TAG_TERMS)
    .filter(([, terms]) => includesAny(text, terms))
    .map(([tag]) => tag);
  return tags.length ? tags : ["earnings"];
}

function polarityFor(text) {
  const positive = POSITIVE_TERMS.filter((term) => includesAny(text, [term])).length;
  const negative = NEGATIVE_TERMS.filter((term) => includesAny(text, [term])).length;
  if (positive > negative + 1) return "positive";
  if (negative > positive) return "negative";
  if (positive && negative) return "mixed";
  return "neutral";
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return "";
  }
}

function evidenceItem(raw, provider, ticker) {
  const title = String(raw.title || raw.name || "").trim();
  const summary = String(raw.text || raw.description || raw.snippet || "").replace(/\s+/g, " ").trim();
  const url = normalizeUrl(raw.url);
  if (!title || !url) return null;
  const combined = textOf(title, summary);
  return {
    id: `${provider}:${Buffer.from(url).toString("base64url").slice(0, 18)}`,
    ticker,
    provider,
    source: raw.publisher || raw.site || raw.profile?.name || provider,
    title,
    url,
    publishedAt: raw.publishedDate || raw.page_age || raw.age || null,
    summary: summary.slice(0, 420),
    catalystTags: catalystTagsFor(combined),
    polarity: polarityFor(combined),
    confidence: provider === "fmp" ? 0.72 : 0.62,
    relevanceReason: catalystTagsFor(combined).join(", "),
  };
}

function dedupeItems(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    if (!item) continue;
    const key = item.url || item.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

async function fetchFmpNews(input) {
  const apiKey = cleanEnv(input.fmpApiKey) || cleanEnv(process.env.FMP_API_KEY) || cleanEnv(process.env.FINANCIAL_MODELING_PREP_API_KEY);
  if (!apiKey) return { provider: "fmp", configured: false, status: "missing_key", items: [], error: null };
  try {
    const url = `https://financialmodelingprep.com/stable/news/stock?symbols=${encodeURIComponent(input.ticker)}&limit=${input.limit || 20}&apikey=${encodeURIComponent(apiKey)}`;
    const data = await fetchJson(url, { provider: "fmp", timeoutMs: input.timeoutMs, fetchImpl: input.fetchImpl });
    const items = (Array.isArray(data) ? data : []).map((row) => evidenceItem(row, "fmp", input.ticker)).filter(Boolean);
    return { provider: "fmp", configured: true, status: "ok", items, error: null };
  } catch (error) {
    return { provider: "fmp", configured: true, status: "error", items: [], error: String(error?.message || error).slice(0, 220) };
  }
}

async function fetchBraveNews(input) {
  const apiKey = cleanEnv(input.braveApiKey) || cleanEnv(process.env.BRAVE_SEARCH_API_KEY) || cleanEnv(process.env.BRAVE_API_KEY);
  if (!apiKey) return { provider: "brave", configured: false, status: "missing_key", items: [], error: null };
  const query = [
    input.ticker,
    input.companyName,
    "earnings demand supply bottleneck capex regulation guidance",
  ]
    .filter(Boolean)
    .join(" ");
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${input.braveCount || 10}&freshness=pm`;
    const data = await fetchJson(url, {
      provider: "brave",
      timeoutMs: input.timeoutMs,
      fetchImpl: input.fetchImpl,
      headers: {
        "X-Subscription-Token": apiKey,
      },
    });
    const items = (data?.web?.results || []).map((row) => evidenceItem(row, "brave", input.ticker)).filter(Boolean);
    return { provider: "brave", configured: true, status: "ok", items, error: null };
  } catch (error) {
    return { provider: "brave", configured: true, status: "error", items: [], error: String(error?.message || error).slice(0, 220) };
  }
}

function providerDiagnostic(result) {
  return {
    provider: result.provider,
    configured: result.configured,
    status: result.status,
    itemCount: result.items.length,
    error: result.error || null,
  };
}

export async function fetchValuationCatalystEvidence(input = {}) {
  const ticker = String(input.ticker || "").trim().toUpperCase();
  if (!ticker) {
    return {
      version: "valuation_catalyst_news_v1",
      status: "unavailable",
      ticker: null,
      asOf: new Date().toISOString(),
      items: [],
      providerDiagnostics: [],
      warnings: ["Ticker missing; catalyst news was not fetched."],
    };
  }

  const key = cacheKey({ ...input, ticker });
  const cached = !input.disableCache ? getCache(key) : null;
  if (cached) return { ...cached, cached: true };

  const [fmp, brave] = await Promise.all([
    fetchFmpNews({ ...input, ticker }),
    fetchBraveNews({ ...input, ticker }),
  ]);
  const items = dedupeItems([...fmp.items, ...brave.items]).slice(0, input.maxItems || 28);
  const configuredProviders = [fmp, brave].filter((item) => item.configured);
  const okProviders = [fmp, brave].filter((item) => item.status === "ok");
  const status = items.length ? (okProviders.length === configuredProviders.length ? "available" : "partial") : configuredProviders.length ? "unavailable" : "missing_keys";
  const payload = {
    version: "valuation_catalyst_news_v1",
    status,
    ticker,
    companyName: input.companyName || null,
    asOf: new Date().toISOString(),
    cached: false,
    items,
    providerDiagnostics: [providerDiagnostic(fmp), providerDiagnostic(brave)],
    warnings: [
      status === "missing_keys" ? "No catalyst news provider key is configured." : null,
      ...[fmp, brave].filter((item) => item.error).map((item) => `${item.provider}: ${item.error}`),
    ].filter(Boolean),
  };
  setCache(key, payload);
  return payload;
}
