// Provider data stays distinct from SEC filing facts and from investment conclusions.
export const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
export const sameSymbol = (a, b) =>
  typeof a === "string" &&
  a.toUpperCase().replaceAll(".", "-") === b.toUpperCase().replaceAll(".", "-");
export function safeLink(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function normalizeSegments(rows, ticker, now = Date.now()) {
  return (Array.isArray(rows) ? rows : [])
    .filter(
      (r) =>
        sameSymbol(r.symbol, ticker) &&
        r.period === "FY" &&
        Date.parse(r.date) <= now &&
        /^[A-Z]{3}$/.test(r.reportedCurrency),
    )
    .slice(0, 10)
    .map((r) => ({
      date: r.date,
      currency: r.reportedCurrency,
      values: Object.entries(r.data || {})
        .filter(([k, v]) => k.length <= 150 && finite(v) !== null)
        .slice(0, 60)
        .map(([name, value]) => ({ name, value })),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
export function normalizeEstimates(rows, ticker, now = Date.now()) {
  // FMP estimates do not identify a reporting currency. Keep it explicitly unresolved.
  return (Array.isArray(rows) ? rows : [])
    .filter(
      (r) =>
        sameSymbol(r.symbol, ticker) && Date.parse(r.date) >= now - 366 * 864e5,
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6)
    .map((r) => ({
      date: r.date,
      currency: null,
      revenue: {
        low: finite(r.revenueLow),
        average: finite(r.revenueAvg),
        high: finite(r.revenueHigh),
        analysts: finite(r.numAnalystsRevenue),
      },
      eps: {
        low: finite(r.epsLow),
        average: finite(r.epsAvg),
        high: finite(r.epsHigh),
        analysts: finite(r.numAnalystsEps),
      },
    }));
}
export const QUARTER_METRICS = [
  {
    id: "revenue",
    field: "revenue",
    source: "income",
    es: "Ingresos",
    en: "Revenue",
  },
  {
    id: "operatingIncome",
    field: "operatingIncome",
    source: "income",
    es: "Resultado operativo",
    en: "Operating income",
  },
  {
    id: "netIncome",
    field: "netIncome",
    source: "income",
    es: "Resultado neto",
    en: "Net income",
  },
  {
    id: "operatingCash",
    field: "operatingCashFlow",
    source: "cash",
    es: "Caja operativa",
    en: "Operating cash flow",
  },
  {
    id: "capex",
    field: "capitalExpenditure",
    source: "cash",
    es: "Inversión de capital (con signo)",
    en: "Capital expenditure (signed)",
  },
  {
    id: "freeCashFlow",
    field: "freeCashFlow",
    source: "cash",
    es: "Flujo de caja libre",
    en: "Free cash flow",
  },
  {
    id: "cash",
    field: "cashAndCashEquivalents",
    source: "balance",
    instant: true,
    es: "Efectivo y equivalentes",
    en: "Cash and equivalents",
  },
  {
    id: "debt",
    field: "totalDebt",
    source: "balance",
    instant: true,
    es: "Deuda total",
    en: "Total debt",
  },
  {
    id: "equity",
    field: "totalEquity",
    source: "balance",
    instant: true,
    es: "Patrimonio",
    en: "Equity",
  },
];
export function normalizeQuarters(sources, ticker, now = Date.now()) {
  const groups = new Map();
  for (const [source, rows] of Object.entries(sources))
    for (const r of Array.isArray(rows) ? rows : []) {
      if (
        !sameSymbol(r.symbol, ticker) ||
        !/^Q[1-4]$/.test(r.period) ||
        !/^\d{4}$/.test(String(r.fiscalYear)) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
        !(Date.parse(r.date) <= now) ||
        !(Date.parse(r.filingDate) <= now) ||
        Date.parse(r.filingDate) < Date.parse(r.date) ||
        !/^[A-Z]{3}$/.test(r.reportedCurrency)
      )
        continue;
      const key = [r.date, r.reportedCurrency, r.fiscalYear, r.period].join(
        ":",
      );
      if (!groups.has(key))
        groups.set(key, {
          date: r.date,
          currency: r.reportedCurrency,
          year: Number(r.fiscalYear),
          quarter: Number(r.period.slice(1)),
          values: {},
          filed: {},
        });
      const g = groups.get(key);
      for (const m of QUARTER_METRICS.filter((m) => m.source === source)) {
        if (g.filed[m.id] && g.filed[m.id] > r.filingDate) continue;
        const value = finite(r[m.field]);
        g.values[m.id] =
          g.filed[m.id] === r.filingDate && g.values[m.id] !== value
            ? null
            : value;
        g.filed[m.id] = r.filingDate;
      }
    }
  const rows = [...groups.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);
  const last = rows.slice(0, 4),
    index = (r) => r.year * 4 + r.quarter;
  const contiguous =
    last.length === 4 &&
    last.every(
      (r, i) =>
        r.currency === last[0].currency &&
        (!i ||
          (index(last[i - 1]) - index(r) === 1 &&
            (Date.parse(last[i - 1].date) - Date.parse(r.date)) / 864e5 >= 70 &&
            (Date.parse(last[i - 1].date) - Date.parse(r.date)) / 864e5 <=
              110)),
    );
  const ttm = contiguous
    ? {
        date: last[0].date,
        currency: last[0].currency,
        periods: last.map((r) => r.date),
        values: Object.fromEntries(
          QUARTER_METRICS.map((m) => [
            m.id,
            m.instant
              ? (last[0].values[m.id] ?? null)
              : last.every((r) => finite(r.values[m.id]) !== null)
                ? last.reduce((s, r) => s + r.values[m.id], 0)
                : null,
          ]),
        ),
      }
    : null;
  return { rows, ttm };
}

// Conservative English headline vocabulary. No match is unclassified, never neutral.
const positive =
  /\b(beats?|surges?|surging|soars?|jumps?|climbs?|rall(?:y|ies)|edges higher|upgrades?|record profits?|raises? (?:its )?(?:guidance|forecast)|profit rises?|sales grow|growth accelerates)\b/i;
const negative =
  /\b(misses?|plunges?|slumps?|falls?|slips?|tumbles?|trim targets|fair value cut|downgrades?|lawsuits?|recalls?|cuts? (?:its )?(?:guidance|forecast|jobs)|layoffs?|fraud|bankruptcy|profit falls?|sales fall|slashes?)\b/i;
export function headlineTone(title) {
  if (
    /\b(?:not|no|never|without|denies?|avoids?|could|may|might|would|if|won.t|doesn.t)\b|[?;|]|sector update|stock movers/i.test(
      title,
    )
  )
    return "unclassified";
  const up = positive.test(title),
    down = negative.test(title);
  return up && down
    ? "mixed"
    : up
      ? "positive"
      : down
        ? "negative"
        : "unclassified";
}
export function normalizeNews(rows, provider, ticker, now = Date.now()) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const symbols =
      provider === "Yahoo Finance"
        ? Array.isArray(r.relatedTickers)
          ? r.relatedTickers
          : []
        : [r.symbol];
    if (ticker && !symbols.some((s) => sameSymbol(s, ticker))) continue;
    const title = String(r.title || "")
        .replace(/<[^>]*>/g, "")
        .trim()
        .slice(0, 500),
      url = safeLink(r.link || r.url);
    // FMP timestamps omit a timezone: date precision only, never fabricate an instant.
    const date =
      provider === "Yahoo Finance" && Number.isFinite(r.providerPublishTime)
        ? new Date(r.providerPublishTime * 1000).toISOString()
        : String(r.publishedDate || "").slice(0, 10);
    const time = Date.parse(date),
      age = now - time;
    if (!title || !url || !Number.isFinite(time) || age < 0 || age > 7 * 864e5)
      continue;
    out.push({
      title,
      url,
      publisher: String(r.publisher || r.site || provider).slice(0, 120),
      provider,
      date,
      datePrecision: provider === "Yahoo Finance" ? "instant" : "day",
      symbols: symbols
        .filter(
          (s) => typeof s === "string" && /^[A-Z][A-Z0-9.-]{0,11}$/.test(s),
        )
        .slice(0, 20)
        .map((s) => (ticker && sameSymbol(s, ticker) ? ticker : s)),
      tone: headlineTone(title),
    });
  }
  return out;
}
export function deduplicateNews(rows) {
  const titles = new Map(),
    urls = new Map(),
    result = [];
  for (const r of [...rows].sort((a, b) => b.date.localeCompare(a.date))) {
    const title = r.title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    const prior = titles.get(title) || urls.get(r.url);
    if (prior) {
      prior.symbols = [...new Set([...prior.symbols, ...r.symbols])];
      prior.providers = [
        ...new Set([...prior.providers, ...(r.providers || [r.provider])]),
      ];
      titles.set(title, prior);
      urls.set(r.url, prior);
      continue;
    }
    const item = { ...r, providers: r.providers || [r.provider] };
    titles.set(title, item);
    urls.set(r.url, item);
    result.push(item);
  }
  return result.slice(0, 300);
}
export function summarizeTone(articles) {
  const counts = { positive: 0, negative: 0, mixed: 0, unclassified: 0 };
  for (const a of articles)
    counts[a.tone in counts ? a.tone : "unclassified"]++;
  const classified = counts.positive + counts.negative + counts.mixed;
  return {
    total: articles.length,
    classified,
    counts,
    balance:
      classified >= 3 ? (counts.positive - counts.negative) / classified : null,
    method: "english_headline_vocabulary_v1",
  };
}
export function portfolioUniverse(holdings, limit = 20) {
  const groups = new Map();
  let excluded = 0;
  for (const h of holdings || []) {
    const ticker = String(h.ticker || "")
      .trim()
      .toUpperCase();
    if (
      !/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker) ||
      !["stock", "equity", "etf"].includes(String(h.asset_type).toLowerCase())
    ) {
      excluded++;
      continue;
    }
    const value = Number(h.market_value_usd),
      valid =
        h.market_value_usd !== null &&
        h.market_value_usd !== "" &&
        Number.isFinite(value) &&
        value > 0;
    const g = groups.get(ticker) || { ticker, value: 0, priced: true };
    g.value += valid ? value : 0;
    g.priced &&= valid;
    groups.set(ticker, g);
  }
  const all = [...groups.values()].sort(
      (a, b) => b.value - a.value || a.ticker.localeCompare(b.ticker),
    ),
    total = all.reduce((s, h) => s + h.value, 0);
  return {
    total: all.length,
    excluded,
    unpriced: all.filter((h) => !h.priced).length,
    omitted: Math.max(0, all.length - limit),
    holdings: all.slice(0, limit).map((h) => ({
      ticker: h.ticker,
      weight: h.priced && total > 0 ? h.value / total : null,
    })),
    hasKnownValue: total > 0,
    weightBasis: "available_positive_usd_values",
  };
}

// Each platform measures a different population. Do not average these scores together.
export function normalizePlatformSentiment(payload, tickers, source) {
  const score = (v) => (finite(v) !== null && v >= 0 && v <= 100 ? v : null);
  return tickers.map((ticker) => {
    const r = (Array.isArray(payload?.stocks) ? payload.stocks : []).find((r) =>
      sameSymbol(r.ticker, ticker),
    );
    const rawCount = source === "polymarket" ? r?.trade_count : r?.mentions;
    const count =
      Number.isSafeInteger(rawCount) && rawCount >= 0 ? rawCount : null;
    const hasActivity = count !== null && count > 0;
    let bullish = hasActivity ? score(r?.bullish_pct) : null,
      bearish = hasActivity ? score(r?.bearish_pct) : null;
    if (bullish !== null && bearish !== null && bullish + bearish > 100.01) {
      bullish = null;
      bearish = null;
    }
    return {
      ticker,
      source,
      status: !r
        ? "empty"
        : count === null
          ? "unavailable"
          : hasActivity
            ? "available"
            : "empty",
      activity: hasActivity ? score(r.buzz_score) : null,
      bullish,
      bearish,
      count,
      unit: source === "polymarket" ? "trades" : "mentions",
      trend:
        hasActivity && ["rising", "falling", "stable"].includes(r.trend)
          ? r.trend
          : null,
    };
  });
}
