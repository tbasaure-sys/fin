import { repriceG820Candidate } from './generated/g820-engine.mjs';

const finite = (value) => typeof value === "number" && Number.isFinite(value);

function round(value, digits = 6) {
  return finite(value) ? Number(value.toFixed(digits)) : null;
}

function quoteDate(quote) {
  const timestamp = Number(quote?.timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return new Date(timestamp * 1000).toISOString().slice(0, 10);
  }
  const value = String(quote?.date || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function selectG820DailyUniverse(index) {
  const seen = new Set();
  return (index?.companies || []).filter((company) => {
    const ticker = String(company?.ticker || "").trim().toUpperCase();
    const isDecisionFrontier = finite(company?.ivFloor)
      || company?.chapter8 === true
      || company?.chapter20 === true
      || company?.category === "WATCH_FOR_PRICE"
      || company?.category === "RESEARCH_NOW";
    if (!isDecisionFrontier || !/^[A-Z0-9.-]{1,12}$/.test(ticker) || seen.has(ticker)) return false;
    seen.add(ticker);
    return true;
  });
}

export function normalizeFmpQuote(payload, ticker) {
  const quote = Array.isArray(payload) ? payload[0] : payload;
  const expected = String(ticker || "").toUpperCase();
  const observed = String(quote?.symbol || "").toUpperCase();
  const price = Number(quote?.price);
  if (!quote || observed !== expected || !Number.isFinite(price) || price <= 0 || !quoteDate(quote)) return null;
  return {
    ticker: expected,
    price,
    asOf: quoteDate(quote),
    volume: finite(Number(quote?.volume)) ? Number(quote.volume) : null,
  };
}

export function buildG820DailyPriceOverlay(index, quotes, generatedAt = new Date().toISOString(), runtime = null) {
  if (runtime && runtime.snapshotId !== index?.meta?.snapshotId) throw new Error('G820 runtime snapshot mismatch');
  const frontier = selectG820DailyUniverse(index);
  const byTicker = new Map((quotes || []).filter(Boolean).map((quote) => [quote.ticker, quote]));
  const companies = {};
  let latestMarketDate = null;

  for (const company of frontier) {
    const quote = byTicker.get(String(company.ticker).toUpperCase());
    if (!quote) continue;
    const quoteAge = (Date.parse(generatedAt.slice(0, 10)) - Date.parse(quote.asOf)) / 86400000;
    if (!finite(quoteAge) || quoteAge < 0 || quoteAge > 4 || !finite(quote.price) || quote.price <= 0) continue;
    const assessment = runtime?.contexts?.[company.id]
      ? repriceG820Candidate(runtime.contexts[company.id], quote, runtime.config) : null;
    const actualMos = finite(company.ivFloor) && company.ivFloor > 0
      ? 1 - quote.price / company.ivFloor
      : null;
    const safetySurplus = finite(actualMos) && finite(company.requiredMos)
      ? actualMos - company.requiredMos
      : null;
    if (quote.asOf && (!latestMarketDate || quote.asOf > latestMarketDate)) latestMarketDate = quote.asOf;
    companies[company.id] = {
      ticker: company.ticker,
      price: round(quote.price, 4),
      asOf: quote.asOf,
      actualMos: round(actualMos),
      safetySurplus: round(safetySurplus),
      priceGate: finite(safetySurplus)
        ? safetySurplus > 0 ? "open" : "closed"
        : "unresolved",
      baseChapter8: company.chapter8,
      baseChapter20: company.chapter20,
      ...(assessment ? { assessment } : {}),
    };
  }

  const requested = frontier.length;
  const succeeded = Object.keys(companies).length;
  return {
    schemaVersion: runtime ? "g820-daily-price-overlay-v2" : "g820-daily-price-overlay-v1",
    baseSnapshotId: index?.meta?.snapshotId || null,
    generatedAt,
    marketAsOf: latestMarketDate,
    coverage: {
      requested,
      succeeded,
      failed: Math.max(0, requested - succeeded),
      ratio: requested ? round(succeeded / requested, 4) : 0,
    },
    semantics: runtime ? {
      scope: 'price_sensitive_decision_recheck',
      claim: 'Same frozen owner inputs; C20, MOS, model support and no-rerating IRR recomputed. Stale C8 history blocks research.',
      doesNotRecompute: ['ownerClock', 'cross_sectional_market_history'],
    } : {
      scope: "decision_frontier_price_only",
      claim: "Recomputes price, actual margin of safety, and price-gate status only.",
      doesNotRecompute: ["chapter8", "chapter20", "category", "priority", "ownerClock"],
    },
    companies,
  };
}

function overlayIsCurrent(index, overlay, now) {
  if (!overlay || overlay.baseSnapshotId !== index?.meta?.snapshotId) return false;
  const current = Date.parse(now);
  const created = Date.parse(overlay.generatedAt);
  if (!finite(current) || !finite(created) || created > current) return false;
  const rows = Object.values(overlay.companies || {});
  if (!rows.length) return false;
  return rows.every((row) => {
    const age = (Date.parse(now.slice(0, 10)) - Date.parse(row.asOf)) / 86400000;
    return finite(age) && age >= 0 && age <= 4 && finite(row.price) && row.price > 0;
  });
}

export function selectG820DailyPriceOverlay(index, overlays, now = new Date().toISOString()) {
  return overlays.filter((overlay) => overlayIsCurrent(index, overlay, now))
    .sort((left, right) => Date.parse(right.generatedAt) - Date.parse(left.generatedAt))[0] || null;
}

export function mergeG820DailyPriceOverlay(index, overlay, now = new Date().toISOString()) {
  if (!overlayIsCurrent(index, overlay, now)) {
    return {
      ...index,
      meta: { ...index.meta, dailyPrice: { status: overlay?.baseSnapshotId === index?.meta?.snapshotId ? 'stale' : 'unavailable' } },
    };
  }
  const companies = (index.companies || []).map((company) => {
    const dailyPrice = overlay.companies?.[company.id] || null;
    const assessment = dailyPrice?.assessment;
    return { ...company, ...(assessment ? {
      baseAssessment: { category: company.category, chapter8: company.chapter8, chapter20: company.chapter20 },
      category: assessment.category, chapter8: assessment.dualKey.chapter8, chapter20: assessment.dualKey.chapter20,
      priority: assessment.priority, researchAction: assessment.researchAction, firstRejection: assessment.firstRejection,
      researchPlan: assessment.researchPlan, noReratingIrr: assessment.noReratingIrr?.value,
      robustnessPassRate: assessment.valuation.robustnessPassRate,
    } : {}), dailyPrice };
  });
  return {
    ...index,
    meta: {
      ...index.meta,
      categoryCounts: companies.reduce((counts, company) => ({ ...counts, [company.category]: (counts[company.category] || 0) + 1 }), {}),
      coverage: { ...index.meta.coverage,
        chapter8Pass: companies.filter((company) => company.chapter8).length,
        chapter20Pass: companies.filter((company) => company.chapter20).length,
        dualKeyPass: companies.filter((company) => company.chapter8 && company.chapter20).length,
        dataExceptions: companies.filter((company) => company.category === 'DATA_EXCEPTION').length,
      },
      dailyPrice: {
        status: "available",
        generatedAt: overlay.generatedAt,
        marketAsOf: overlay.marketAsOf,
        coverage: overlay.coverage,
        scope: overlay.semantics?.scope || "decision_frontier_price_only",
        storageSource: overlay.storageSource || 'runtime',
      },
    },
    companies,
  };
}
