const finite = (value) => typeof value === "number" && Number.isFinite(value);

function round(value, digits = 6) {
  return finite(value) ? Number(value.toFixed(digits)) : null;
}

function quoteDate(quote, fallback) {
  const timestamp = Number(quote?.timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return new Date(timestamp * 1000).toISOString().slice(0, 10);
  }
  const value = String(quote?.date || fallback || "");
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

export function normalizeFmpQuote(payload, ticker, fallbackDate) {
  const quote = Array.isArray(payload) ? payload[0] : payload;
  const expected = String(ticker || "").toUpperCase();
  const observed = String(quote?.symbol || "").toUpperCase();
  const price = Number(quote?.price);
  if (!quote || observed !== expected || !Number.isFinite(price) || price <= 0) return null;
  return {
    ticker: expected,
    price,
    asOf: quoteDate(quote, fallbackDate),
    volume: finite(Number(quote?.volume)) ? Number(quote.volume) : null,
  };
}

export function buildG820DailyPriceOverlay(index, quotes, generatedAt = new Date().toISOString()) {
  const frontier = selectG820DailyUniverse(index);
  const byTicker = new Map((quotes || []).filter(Boolean).map((quote) => [quote.ticker, quote]));
  const companies = {};
  let latestMarketDate = null;

  for (const company of frontier) {
    const quote = byTicker.get(String(company.ticker).toUpperCase());
    if (!quote) continue;
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
    };
  }

  const requested = frontier.length;
  const succeeded = Object.keys(companies).length;
  return {
    schemaVersion: "g820-daily-price-overlay-v1",
    baseSnapshotId: index?.meta?.snapshotId || null,
    generatedAt,
    marketAsOf: latestMarketDate,
    coverage: {
      requested,
      succeeded,
      failed: Math.max(0, requested - succeeded),
      ratio: requested ? round(succeeded / requested, 4) : 0,
    },
    semantics: {
      scope: "decision_frontier_price_only",
      claim: "Recomputes price, actual margin of safety, and price-gate status only.",
      doesNotRecompute: ["chapter8", "chapter20", "category", "priority", "ownerClock"],
    },
    companies,
  };
}

export function mergeG820DailyPriceOverlay(index, overlay) {
  if (!overlay || overlay.baseSnapshotId !== index?.meta?.snapshotId) {
    return {
      ...index,
      meta: { ...index.meta, dailyPrice: { status: "unavailable" } },
    };
  }
  return {
    ...index,
    meta: {
      ...index.meta,
      dailyPrice: {
        status: "available",
        generatedAt: overlay.generatedAt,
        marketAsOf: overlay.marketAsOf,
        coverage: overlay.coverage,
        scope: overlay.semantics?.scope || "decision_frontier_price_only",
      },
    },
    companies: (index.companies || []).map((company) => ({
      ...company,
      dailyPrice: overlay.companies?.[company.id] || null,
    })),
  };
}
