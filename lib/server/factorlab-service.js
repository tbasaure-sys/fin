import "server-only";

import { buildValuationSnapshot } from "../../app/valuation-os-lab/api/snapshot/route.js";
import { runFactorLab } from "../factorlab-engine.js";
import { fetchBackendSnapshot } from "./backend.js";

const DEFAULT_LIVE_TICKERS = ["HROW", "TSSI", "GCT", "REPX", "CECO", "AEHR", "EAF", "PFIE"];
const CACHE_TTL_MS = 15 * 60 * 1000;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function ratio(numerator, denominator) {
  const top = finite(numerator);
  const bottom = finite(denominator);
  return top !== null && bottom !== null && Math.abs(bottom) > 1e-9 ? top / bottom : null;
}

function latestRows(rows = [], count = 3) {
  return [...(Array.isArray(rows) ? rows : [])]
    .filter((row) => finite(row?.value) !== null)
    .sort((left, right) => String(left?.end || left?.fy || "").localeCompare(String(right?.end || right?.fy || "")))
    .slice(-count);
}

function annualGrowth(series, offset = 0) {
  const rows = latestRows(series, 3);
  const current = rows.at(-(1 + offset));
  const prior = rows.at(-(2 + offset));
  return current && prior ? ratio(current.value - prior.value, prior.value) : null;
}

function margin(series, revenueSeries, offset = 0) {
  const values = latestRows(series, 2);
  const revenues = latestRows(revenueSeries, 2);
  return ratio(values.at(-(1 + offset))?.value, revenues.at(-(1 + offset))?.value);
}

function freeCashFlow(facts, offset = 0) {
  const cfo = latestRows(facts?.cfoSeries, 2).at(-(1 + offset));
  const capex = latestRows(facts?.capexSeries, 2).at(-(1 + offset));
  if (!cfo || !capex) return null;
  return finite(cfo.value) - Math.abs(finite(capex.value) || 0);
}

function pct(value, locale) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
    : null;
}

function buildNarrative(row) {
  const growthEs = pct(row.revenueGrowthTtm, "es-CL");
  const growthEn = pct(row.revenueGrowthTtm, "en-US");
  const marginEs = pct(row.ebitMargin, "es-CL");
  const marginEn = pct(row.ebitMargin, "en-US");
  const positiveCash = Number(row.fcfMargin) > 0;
  return {
    es: {
      thesis: `${row.name} combina ${growthEs ? `crecimiento anual de ingresos de ${growthEs}` : "un nuevo filing disponible"}${marginEs ? ` con margen operativo de ${marginEs}` : ""}.`,
      whyNow: `${growthEs ? `Los ingresos crecieron ${growthEs}` : "Hay nueva información financiera presentada"}${marginEs ? ` y el margen operativo llegó a ${marginEs}` : ""} en el último periodo observado.`,
      killCriteria: `${positiveCash ? "La conversión de caja pasa a terreno negativo" : "El consumo de caja se acelera"}, el crecimiento se revierte o el próximo filing contradice la mejora observada.`,
    },
    en: {
      thesis: `${row.name} combines ${growthEn ? `${growthEn} annual revenue growth` : "a newly available filing"}${marginEn ? ` with a ${marginEn} operating margin` : ""}.`,
      whyNow: `${growthEn ? `Revenue grew ${growthEn}` : "New filed financial information is available"}${marginEn ? ` and operating margin reached ${marginEn}` : ""} in the latest observed period.`,
      killCriteria: `${positiveCash ? "Cash conversion turns negative" : "Cash burn accelerates"}, growth reverses, or the next filing contradicts the observed improvement.`,
    },
  };
}

export function factorLabRowFromSnapshot(snapshot = {}, market = {}) {
  const facts = snapshot.facts || {};
  const revenueSeries = latestRows(facts.revenueSeries, 3);
  const latestRevenue = finite(revenueSeries.at(-1)?.value);
  const currentFcf = freeCashFlow(facts, 0);
  const priorFcf = freeCashFlow(facts, 1);
  const currentFcfMargin = ratio(currentFcf, latestRevenue);
  const priorRevenue = finite(revenueSeries.at(-2)?.value);
  const priorFcfMargin = ratio(priorFcf, priorRevenue);
  const revenueGrowth = annualGrowth(revenueSeries, 0);
  const priorGrowth = annualGrowth(revenueSeries, 1);
  const currentGrossMargin = margin(facts.grossProfitSeries, revenueSeries, 0);
  const priorGrossMargin = margin(facts.grossProfitSeries, revenueSeries, 1);
  const currentEbitMargin = margin(facts.operatingIncomeSeries, revenueSeries, 0) ?? finite(snapshot.drivers?.margin);
  const priorEbitMargin = margin(facts.operatingIncomeSeries, revenueSeries, 1);
  const shares = latestRows(facts.sharesSeries, 2);
  const currentShares = finite(shares.at(-1)?.value);
  const priorShares = finite(shares.at(-2)?.value);
  const price = finite(market.price) ?? finite(snapshot.quote?.price);
  const marketCap = finite(market.marketCap)
    ?? finite(snapshot.quote?.marketCap)
    ?? (price !== null && currentShares !== null ? price * currentShares : null);
  const cash = finite(facts.cash?.value);
  const debt = finite(facts.debt?.value);
  const enterpriseValue = marketCap !== null ? marketCap + (debt || 0) - (cash || 0) : null;
  const grossProfit = finite(latestRows(facts.grossProfitSeries, 1).at(-1)?.value);
  const ticker = String(snapshot.company?.ticker || market.ticker || "").trim().toUpperCase();
  const name = String(snapshot.company?.entityName || snapshot.company?.name || ticker).trim();
  const catalystItems = Array.isArray(snapshot.catalystEvidence?.items) ? snapshot.catalystEvidence.items : [];
  const catalystProviders = (snapshot.catalystEvidence?.providerDiagnostics || [])
    .filter((item) => item?.status === "ok")
    .map((item) => String(item.provider || "").toUpperCase())
    .filter(Boolean);
  const catalystAvailable = catalystItems.length > 0 || ["available", "partial"].includes(snapshot.catalystEvidence?.status);

  const row = {
    ticker,
    name,
    sector: snapshot.company?.industry || snapshot.company?.sicDescription || "Sin clasificar",
    industry: snapshot.company?.industry || snapshot.company?.sicDescription || "Sin clasificar",
    region: "US",
    platform: price !== null ? "Tradable now" : "Watch only",
    priceDate: market.marketDate || String(snapshot.asOf || "").slice(0, 10),
    fundamentalsDate: snapshot.company?.filedAt || revenueSeries.at(-1)?.filed || revenueSeries.at(-1)?.end || null,
    marketCapUsd: marketCap,
    advUsd: finite(market.averageDailyValue) ?? finite(snapshot.quote?.averageDailyValue),
    price,
    residualVol: finite(market.residualVol) ?? finite(snapshot.quote?.residualVol),
    grossMargin: currentGrossMargin,
    fcfMargin: currentFcfMargin,
    ebitMargin: currentEbitMargin,
    roic: finite(snapshot.drivers?.roic),
    revenueGrowthTtm: revenueGrowth,
    revenueAcceleration: revenueGrowth !== null && priorGrowth !== null ? revenueGrowth - priorGrowth : null,
    grossMarginExpansion: currentGrossMargin !== null && priorGrossMargin !== null ? currentGrossMargin - priorGrossMargin : null,
    ebitMarginExpansion: currentEbitMargin !== null && priorEbitMargin !== null ? currentEbitMargin - priorEbitMargin : null,
    fcfImprovementToSales: currentFcfMargin !== null && priorFcfMargin !== null ? currentFcfMargin - priorFcfMargin : null,
    netCashToMarketCap: marketCap ? ((cash || 0) - (debt || 0)) / marketCap : null,
    cashRunwayMonths: null,
    isBurning: currentFcf !== null ? currentFcf < 0 : false,
    dilutionTtm: currentShares !== null && priorShares ? currentShares / priorShares - 1 : null,
    fcfYield: marketCap && currentFcf !== null ? currentFcf / marketCap : null,
    evGrossProfit: grossProfit ? enterpriseValue / grossProfit : null,
    evSales: latestRevenue ? enterpriseValue / latestRevenue : null,
    analystCount: null,
    institutionalOwnership: null,
    newsCount90d: catalystAvailable ? catalystItems.length : null,
    sources: {
      market: market.source || snapshot.quote?.source || null,
      fundamentals: "SEC company facts",
      filing: snapshot.coverage?.secSubmissions ? "SEC submissions" : null,
      catalysts: catalystAvailable ? (catalystProviders.join(" + ") || "Catalyst evidence") : null,
    },
  };
  row.narrative = buildNarrative(row);
  row.thesis = row.narrative.en.thesis;
  row.whyNow = row.narrative.en.whyNow;
  row.killCriteria = row.narrative.en.killCriteria;
  row.sourceNotes = Object.values(row.sources).filter(Boolean).join(" · ");
  return row;
}

function standardDeviation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function parseFactorLabMarketChart(payload, ticker) {
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta || {};
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quote = result?.indicators?.quote?.[0] || {};
  const closes = Array.isArray(quote.close) ? quote.close : [];
  const volumes = Array.isArray(quote.volume) ? quote.volume : [];
  const price = finite(meta.regularMarketPrice) ?? [...closes].reverse().map(finite).find((value) => value !== null) ?? null;
  if (price === null) throw new Error("Market price unavailable.");
  const returns = [];
  for (let index = 1; index < closes.length; index += 1) {
    const prior = finite(closes[index - 1]);
    const current = finite(closes[index]);
    if (prior > 0 && current > 0) returns.push(Math.log(current / prior));
  }
  const recentVolumes = volumes.map(finite).filter((value) => value !== null && value > 0).slice(-20);
  const averageVolume = recentVolumes.length ? recentVolumes.reduce((sum, value) => sum + value, 0) / recentVolumes.length : null;
  const lastTimestamp = [...timestamps].reverse().map(finite).find((value) => value !== null);
  const dailyVolatility = standardDeviation(returns.slice(-60));
  return {
    ticker: String(ticker || "").toUpperCase(),
    price,
    marketCap: finite(meta.marketCap),
    marketDate: lastTimestamp ? new Date(lastTimestamp * 1000).toISOString().slice(0, 10) : null,
    averageDailyValue: averageVolume !== null ? averageVolume * price : null,
    residualVol: dailyVolatility !== null ? dailyVolatility * Math.sqrt(252) : null,
    currency: meta.currency || "USD",
    exchange: meta.exchangeName || null,
    source: "Yahoo Finance chart",
  };
}

export async function fetchFactorLabMarketSnapshot(ticker, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=3mo&interval=1d`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json", "user-agent": "BLS Prime FactorLab" },
  });
  if (!response.ok) throw new Error(`Market provider returned ${response.status}.`);
  return parseFactorLabMarketChart(await response.json(), ticker);
}

function configuredTickers() {
  const configured = String(process.env.FACTORLAB_LIVE_TICKERS || "")
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter((ticker) => /^[A-Z0-9.-]{1,12}$/.test(ticker));
  return configured.length ? configured : DEFAULT_LIVE_TICKERS;
}

export async function loadFactorLabUniverse() {
  const backendConfigured = Boolean(String(process.env.BLS_PRIME_BACKEND_URL || process.env.META_ALLOCATOR_BACKEND_URL || "").trim());
  if (backendConfigured) {
    try {
      const snapshot = await fetchBackendSnapshot();
      const rows = Array.isArray(snapshot?.screener?.rows) ? snapshot.screener.rows : [];
      const candidates = rows
        .map((row) => ({ ticker: String(row?.ticker || "").trim().toUpperCase() }))
        .filter((row) => /^[A-Z0-9.-]{1,12}$/.test(row.ticker));
      if (candidates.length) return candidates.slice(0, 12);
    } catch {
      // Continue with the configured discovery basket; every row is still rebuilt from live providers.
    }
  }
  return configuredTickers().map((ticker) => ({ ticker }));
}

export class FactorLabUnavailableError extends Error {
  constructor(message = "Live FactorLab data is unavailable.") {
    super(message);
    this.name = "FactorLabUnavailableError";
    this.code = "LIVE_DATA_UNAVAILABLE";
  }
}

export function createFactorLabLiveService({
  universeLoader = loadFactorLabUniverse,
  snapshotLoader = buildValuationSnapshot,
  marketLoader = fetchFactorLabMarketSnapshot,
  now = () => new Date().toISOString(),
  cacheTtlMs = CACHE_TTL_MS,
} = {}) {
  let cache = null;

  async function loadRows() {
    const currentTime = Date.now();
    if (cache && currentTime - cache.cachedAt < cacheTtlMs) return cache;
    const universe = await universeLoader();
    const requested = universe.length;
    const outcomes = await Promise.all(universe.map(async ({ ticker }) => {
      try {
        const [snapshot, marketResult] = await Promise.all([
          snapshotLoader(ticker),
          marketLoader(ticker).catch(() => null),
        ]);
        if (!snapshot || snapshot.ok === false || !snapshot.coverage?.secCompanyFacts) throw new Error("SEC coverage unavailable.");
        const row = factorLabRowFromSnapshot(snapshot, marketResult || {});
        if (!row.ticker || !row.priceDate || !Number.isFinite(row.price)) throw new Error("Current market observation unavailable.");
        return row;
      } catch {
        return null;
      }
    }));
    const rows = outcomes.filter(Boolean);
    if (!rows.length) throw new FactorLabUnavailableError();
    cache = { rows, requested, failed: requested - rows.length, cachedAt: currentTime, generatedAt: now() };
    return cache;
  }

  return {
    async run(input = {}) {
      const loaded = await loadRows();
      const datasetAsOf = loaded.rows.map((row) => row.priceDate).filter(Boolean).sort().at(-1) || loaded.generatedAt.slice(0, 10);
      const run = runFactorLab({ ...input, rows: loaded.rows, asof: datasetAsOf, includeFutureReturn: false });
      const marketAdapters = [...new Set(loaded.rows.map((row) => row.sources?.market).filter(Boolean))].join(" + ");
      const catalystAdapters = [...new Set(loaded.rows.map((row) => row.sources?.catalysts).filter(Boolean))].join(" + ");
      const sources = {
        market: { adapter: marketAdapters || "Current market snapshot", pointInTime: true },
        fundamentals: { adapter: "SEC company facts", lagPolicy: "filed_date_lte_asof" },
        neglect: {
          adapter: catalystAdapters || "No live catalyst provider coverage",
          missingPolicy: "neutral_score_plus_completeness_penalty",
        },
        filings: { adapter: "SEC submissions", lagPolicy: "accepted_date_lte_asof" },
        catalysts: { adapter: catalystAdapters || "Unavailable", pointInTime: true },
      };
      const pipeline = run.pipeline.map((step) => step.id === "type"
        ? { ...step, input: "filed financial features" }
        : step.id === "score"
          ? { ...step, input: "type-specific blocks from filed and market observations" }
          : step);
      const audit = run.audit.map((line) => line.replace("quarterly TTM features", "filed financial features"));
      return {
        ...run,
        spec: { ...run.spec, sources },
        pipeline,
        audit,
        mode: "live",
        generatedAt: loaded.generatedAt,
        datasetAsOf,
        frequency: "Actualización bajo demanda · caché máxima 15 min",
        providerStatus: { requested: loaded.requested, succeeded: loaded.rows.length, failed: loaded.failed },
      };
    },
  };
}

export function getLiveFactorLabService() {
  const state = globalThis.__blsFactorLabLiveService || (globalThis.__blsFactorLabLiveService = createFactorLabLiveService());
  return state;
}
