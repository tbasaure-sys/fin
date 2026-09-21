import "server-only";
import { cleanTicker } from "../research/dossier.js";
import {
  normalizeSegments,
  normalizeEstimates,
  normalizeQuarters,
  normalizeNews,
  deduplicateNews,
  summarizeTone,
  portfolioUniverse,
  finite,
  normalizePlatformSentiment,
} from "../research/market-data.mjs";

export function createResearchMarketService({
  fetcher = fetch,
  env = process.env,
  clock = () => new Date(),
} = {}) {
  const cache = new Map(),
    pending = new Map();
  let active = 0,
    scans = 0;
  async function request(url, headers = {}) {
    if (active >= 24) throw Error("busy");
    active++;
    try {
      const r = await fetcher(url, {
        headers,
        signal: AbortSignal.timeout(8000),
        redirect: "error",
        cache: "no-store",
      });
      if (!r.ok) {
        await r.body?.cancel();
        throw Error(
          r.status === 402
            ? "upgrade_required"
            : [401, 403].includes(r.status)
              ? "access_denied"
              : r.status === 429
                ? "rate_limited"
                : "unavailable",
        );
      }
      const parts = [];
      let size = 0;
      for await (const part of r.body) {
        size += part.length;
        if (size > 2500000) throw Error("response_too_large");
        parts.push(part);
      }
      return JSON.parse(Buffer.concat(parts).toString("utf8"));
    } finally {
      active--;
    }
  }
  async function memo(key, ttl, fn) {
    const hit = cache.get(key);
    if (hit && hit.until > clock().getTime()) return structuredClone(hit.value);
    if (pending.has(key)) return structuredClone(await pending.get(key));
    if (pending.size >= 100) return { status: "busy", data: [] };
    const work = (async () => {
      let value;
      try {
        value = await fn();
      } catch (error) {
        value = {
          status: [
            "upgrade_required",
            "access_denied",
            "rate_limited",
            "busy",
          ].includes(error.message)
            ? error.message
            : "unavailable",
          data: [],
        };
      }
      value.asOf = clock().toISOString();
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, {
        value,
        until: clock().getTime() + (value.status === "available" ? ttl : 60000),
      });
      return value;
    })();
    pending.set(key, work);
    try {
      return structuredClone(await work);
    } finally {
      pending.delete(key);
    }
  }
  function symbol(raw) {
    const t = cleanTicker(raw);
    if (!t) throw Error("INVALID_TICKER");
    return t;
  }
  async function fmp(endpoint, params = {}) {
    if (!env.FMP_API_KEY || env.FMP_API_KEY === "[SENSITIVE]")
      return { status: "not_configured", data: [] };
    const mapped = { ...params };
    for (const key of ["symbol", "symbols"])
      if (mapped[key])
        mapped[key] = mapped[key].split(",").map(providerSymbol).join(",");
    const query = new URLSearchParams({ ...mapped, apikey: env.FMP_API_KEY });
    const data = await request(
      `https://financialmodelingprep.com/stable/${endpoint}?${query}`,
    );
    if (!Array.isArray(data)) throw Error("unavailable");
    return { status: data.length ? "available" : "empty", data };
  }
  async function fundamentals(raw, section = "segments", options = {}) {
    const ticker = symbol(raw);
    if (
      ![
        "segments",
        "estimates",
        "quarters",
        "transcripts",
        "transcript",
      ].includes(section)
    )
      throw Error("INVALID_SECTION");
    if (
      section === "transcript" &&
      (!/^20\d{2}$/.test(String(options.year)) ||
        Number(options.year) > clock().getUTCFullYear() ||
        !/^[1-4]$/.test(String(options.quarter)))
    )
      throw Error("INVALID_PERIOD");
    const key = [
      ticker,
      section,
      options.year || "",
      options.quarter || "",
    ].join(":");
    return memo(key, 3600000, async () => {
      const now = clock().getTime();
      const part = async (endpoint, params, normalize) => {
        try {
          const r = await fmp(endpoint, { symbol: ticker, ...params });
          const data = normalize(r.data);
          return {
            ...r,
            status:
              r.status === "available" && Array.isArray(data) && !data.length
                ? "empty"
                : r.status,
            data,
          };
        } catch (e) {
          return {
            status: [
              "upgrade_required",
              "access_denied",
              "rate_limited",
              "busy",
            ].includes(e.message)
              ? e.message
              : "unavailable",
            data: [],
          };
        }
      };
      if (section === "segments") {
        const [product, geographic] = await Promise.all([
          part("revenue-product-segmentation", {}, (r) =>
            normalizeSegments(r, ticker, now),
          ),
          part("revenue-geographic-segmentation", {}, (r) =>
            normalizeSegments(r, ticker, now),
          ),
        ]);
        return {
          status: [product, geographic].some((r) => r.data.length)
            ? "available"
            : product.status === "available"
              ? "empty"
              : product.status,
          product,
          geographic,
        };
      }
      if (section === "estimates")
        return part(
          "analyst-estimates",
          { period: "annual", limit: "5" },
          (r) => normalizeEstimates(r, ticker, now),
        );
      if (section === "quarters") {
        const endpoints = {
          income: "income-statement",
          balance: "balance-sheet-statement",
          cash: "cash-flow-statement",
        };
        const entries = await Promise.all(
          Object.entries(endpoints).map(async ([name, path]) => [
            name,
            await part(path, { period: "quarter", limit: "12" }, (r) => r),
          ]),
        );
        const sources = Object.fromEntries(entries),
          data = normalizeQuarters(
            Object.fromEntries(entries.map(([k, v]) => [k, v.data])),
            ticker,
            now,
          );
        return {
          status: data.rows.length
            ? "available"
            : sources.income.status === "available"
              ? "empty"
              : sources.income.status,
          data,
          sources: Object.fromEntries(entries.map(([k, v]) => [k, v.status])),
        };
      }
      if (section === "transcripts")
        return part("earning-call-transcript-dates", {}, (rows) =>
          rows
            .filter(
              (r) =>
                /^20\d{2}$/.test(String(r.year ?? r.fiscalYear)) &&
                /^[1-4]$/.test(String(r.quarter)) &&
                Date.parse(r.date) <= now,
            )
            .slice(0, 20)
            .map((r) => ({
              year: Number(r.year ?? r.fiscalYear),
              quarter: Number(r.quarter),
              date: r.date,
            })),
        );
      return part(
        "earning-call-transcript",
        { year: String(options.year), quarter: String(options.quarter) },
        (rows) =>
          rows
            .filter((r) => sameTranscript(r, ticker, options, now))
            .map((r) => ({
              date: r.date,
              year: Number(r.year),
              quarter: Number(r.quarter),
              content: String(r.content || "").slice(0, 180000),
            }))
            .slice(0, 1),
      );
    });
  }
  async function social(raw) {
    const ticker = symbol(raw);
    return memo(`stocktwits:${ticker}`, 300000, async () => {
      if (!env.STOCKTWITS_USERNAME || !env.STOCKTWITS_PASSWORD)
        return { status: "not_configured", data: null };
      const body = await request(
        `https://api-gw-prd.stocktwits.com/api-middleware/external/sentiment/v2/${encodeURIComponent(ticker)}/chart?zoom=1D`,
        {
          Authorization: `Basic ${Buffer.from(`${env.STOCKTWITS_USERNAME}:${env.STOCKTWITS_PASSWORD}`).toString("base64")}`,
        },
      );
      const points = Object.values(body?.data || {})
        .filter(
          (r) =>
            Date.parse(r.dateTime) <= clock().getTime() &&
            clock().getTime() - Date.parse(r.dateTime) < 2 * 864e5 &&
            finite(r.sentimentNormalized) !== null &&
            r.sentimentNormalized >= 0 &&
            r.sentimentNormalized <= 100,
        )
        .sort((a, b) => b.dateTime.localeCompare(a.dateTime));
      const p = points[0];
      return {
        status: p ? "available" : "empty",
        data: p
          ? {
              date: p.dateTime,
              sentiment: p.sentimentNormalized,
              messageVolume: finite(p.messageVolume),
              participation: finite(p.participationRatio),
              label: String(p.sentimentNormalizedLabel || ""),
            }
          : null,
      };
    });
  }
  async function news(raw) {
    const ticker = raw ? symbol(raw) : null;
    return memo(`news:${ticker || "market"}`, 300000, async () => {
      const fmpNews = memo(`fmp-news:${ticker || "market"}`, 300000, () =>
        fmp(
          ticker ? "news/stock" : "news/stock-latest",
          ticker ? { symbols: ticker, limit: "50" } : { limit: "80" },
        ),
      );
      const yahoo = ticker
        ? memo(`yahoo:${ticker}`, 300000, async () => {
            const b = await request(
              `https://query1.finance.yahoo.com/v1/finance/search?${new URLSearchParams({ q: providerSymbol(ticker), quotesCount: "0", newsCount: "20" })}`,
              { "User-Agent": "BLS-Prime-Research/1.0" },
            );
            return {
              status:
                Array.isArray(b.news) && b.news.length ? "available" : "empty",
              data: b.news || [],
            };
          })
        : Promise.resolve({ status: "not_requested", data: [] });
      const [a, b, stocktwits] = await Promise.all([
        fmpNews,
        yahoo,
        ticker ? social(ticker) : Promise.resolve(null),
      ]);
      const articles = deduplicateNews([
        ...normalizeNews(a.data, "FMP", ticker, clock().getTime()),
        ...normalizeNews(b.data, "Yahoo Finance", ticker, clock().getTime()),
      ]);
      return {
        status: articles.length
          ? "available"
          : [a, b].some((r) => ["available", "empty"].includes(r.status))
            ? "empty"
            : "unavailable",
        ticker,
        articles,
        summary: summarizeTone(articles),
        sources: { fmp: a.status, yahoo: b.status },
        stocktwits,
      };
    });
  }
  async function scanNews(universe, scope) {
    if (scans >= 2) throw Error("BUSY");
    scans++;
    try {
      const results = new Array(universe.holdings.length);
      let index = 0;
      await Promise.all(
        Array.from({ length: Math.min(8, results.length) }, async () => {
          while (index < results.length) {
            const i = index++,
              holding = universe.holdings[i];
            results[i] = { ...holding, ...(await news(holding.ticker)) };
          }
        }),
      );
      const articles = deduplicateNews(
        results.flatMap((r) => r.articles || []),
      );
      return {
        status: results.length
          ? results.some((r) => r.status === "available")
            ? "available"
            : results.every((r) => r.status === "empty")
              ? "empty"
              : "unavailable"
          : "empty",
        scope,
        asOf: clock().toISOString(),
        universe: { ...universe, holdings: undefined },
        coverage: {
          scanned: results.length,
          withNews: results.filter((r) => r.articles?.length).length,
          coveredKnownValueWeight: universe.hasKnownValue
            ? results
                .filter((r) => r.articles?.length && r.weight !== null)
                .reduce((s, r) => s + r.weight, 0)
            : null,
        },
        results,
        articles,
        summary: summarizeTone(articles),
      };
    } finally {
      scans--;
    }
  }
  const portfolio = (holdings) =>
    scanNews(portfolioUniverse(holdings), "portfolio");
  function symbols(input) {
    if (!Array.isArray(input) || input.length > 40)
      throw Error("INVALID_TICKERS");
    return [...new Set(input.map(symbol))];
  }
  const watchlist = (input) => {
    const tickers = symbols(input);
    return scanNews(
      {
        total: tickers.length,
        omitted: Math.max(0, tickers.length - 40),
        excluded: 0,
        unpriced: 0,
        hasKnownValue: false,
        holdings: tickers
          .slice(0, 40)
          .map((ticker) => ({ ticker, weight: null })),
      },
      "watchlist",
    );
  };
  async function sentiment(input) {
    const all = symbols(input),
      tickers = all.slice(0, 40).sort();
    const to = clock().toISOString().slice(0, 10),
      from = new Date(clock().getTime() - 6 * 864e5).toISOString().slice(0, 10);
    return memo(
      `adanos:${all.length}:${tickers.join(",")}:${to}`,
      300000,
      async () => {
        const base = {
          provider: "Adanos",
          from,
          to,
          requested: all.length,
          omitted: all.length - tickers.length,
          rows: [],
        };
        if (!tickers.length) return { ...base, status: "empty", sources: {} };
        if (!env.ADANOS_API_KEY)
          return { ...base, status: "not_configured", sources: {} };
        const platforms = ["reddit", "x", "news", "polymarket"];
        const values = await Promise.all(
          platforms.map(async (source) => {
            const rows = [];
            let status = "empty";
            for (let i = 0; i < tickers.length; i += 10) {
              const batch = tickers.slice(i, i + 10);
              try {
                const body = await request(
                  `https://api.adanos.org/${source}/stocks/v1/compare?${new URLSearchParams({ tickers: batch.map(providerSymbol).join(","), from, to })}`,
                  { "X-API-Key": env.ADANOS_API_KEY },
                );
                if (!Array.isArray(body.stocks)) throw Error("unavailable");
                rows.push(...normalizePlatformSentiment(body, batch, source));
              } catch (error) {
                const failure = [
                  "access_denied",
                  "rate_limited",
                  "busy",
                ].includes(error.message)
                  ? error.message
                  : "unavailable";
                rows.push(
                  ...batch.map((ticker) => ({
                    ticker,
                    source,
                    status: failure,
                    activity: null,
                    bullish: null,
                    bearish: null,
                    count: null,
                    unit: source === "polymarket" ? "trades" : "mentions",
                    trend: null,
                  })),
                );
              }
            }
            status = rows.some((r) => r.status === "available")
              ? "available"
              : rows.every((r) => r.status === "empty")
                ? "empty"
                : rows.find((r) => r.status !== "empty")?.status ||
                  "unavailable";
            return { source, status, rows };
          }),
        );
        return {
          ...base,
          status: values.some((r) => r.status === "available")
            ? "available"
            : values.every((r) => r.status === "empty")
              ? "empty"
              : "unavailable",
          sources: Object.fromEntries(values.map((v) => [v.source, v.status])),
          rows: values.flatMap((v) => v.rows),
        };
      },
    );
  }
  return { fundamentals, news, portfolio, watchlist, sentiment };
}
function providerSymbol(ticker) {
  return ticker.replace(/^([A-Z]+)\.([AB])$/, "$1-$2");
}
function sameTranscript(r, ticker, options, now) {
  return (
    providerSymbol(String(r.symbol || "").toUpperCase()) ===
      providerSymbol(ticker) &&
    Number(r.year) === Number(options.year) &&
    Number(r.quarter) === Number(options.quarter) &&
    Date.parse(r.date) <= now &&
    typeof r.content === "string"
  );
}
export const researchMarketService = createResearchMarketService();
