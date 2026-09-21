import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeQuarters,
  normalizeSegments,
  normalizeEstimates,
  normalizeNews,
  deduplicateNews,
  headlineTone,
  summarizeTone,
  portfolioUniverse,
  normalizePlatformSentiment,
} from "../lib/research/market-data.mjs";
import { createResearchMarketService } from "../lib/server/research-market-service.js";
import { createResearchMarketHttp } from "../lib/server/research-market-http.js";
const now = new Date("2026-09-21T06:00:00Z"),
  clock = () => now;
const row = (quarter, date, year = 2026) => ({
  symbol: "ONON",
  date,
  filingDate: date,
  period: `Q${quarter}`,
  fiscalYear: year,
  reportedCurrency: "CHF",
  revenue: 10,
  netIncome: 2,
});
const quarters = [
  row(2, "2026-06-30"),
  row(1, "2026-03-31"),
  row(4, "2025-12-31", 2025),
  row(3, "2025-09-30", 2025),
];
const article = (extra = {}) => ({
  symbol: "ONON",
  title: "On Holding beats expectations",
  url: "https://example.com/story",
  publisher: "Example",
  publishedDate: "2026-09-20 08:00:00",
  ...extra,
});
test("quarter normalization keeps CHF, derives TTM only from four fiscal quarters, never sums balances", () => {
  const q = normalizeQuarters(
    {
      income: quarters,
      balance: quarters.map((r) => ({ ...r, cashAndCashEquivalents: 5 })),
    },
    "ONON",
    now.getTime(),
  );
  assert.equal(q.ttm.values.revenue, 40);
  assert.equal(q.ttm.values.cash, 5);
  assert.equal(q.ttm.values.operatingCash, null);
  assert.equal(q.ttm.currency, "CHF");
  assert.equal(
    normalizeQuarters({ income: quarters.slice(0, 3) }, "ONON", now.getTime())
      .ttm,
    null,
  );
  assert.equal(
    normalizeQuarters(
      {
        income: quarters.map((r, i) =>
          i === 2 ? { ...r, reportedCurrency: "USD" } : r,
        ),
      },
      "ONON",
      now.getTime(),
    ).ttm,
    null,
  );
  assert.equal(
    normalizeQuarters(
      {
        income: quarters.map((r, i) => (i === 2 ? { ...r, period: "Q3" } : r)),
      },
      "ONON",
      now.getTime(),
    ).ttm,
    null,
  );
});
test("quarterly data rejects future filings, wrong identity, annual and conflicting duplicate facts", () => {
  const q = normalizeQuarters(
    {
      income: [
        quarters[0],
        { ...quarters[0], revenue: 20 },
        { ...quarters[1], symbol: "WRONG" },
        { ...quarters[2], period: "FY" },
        { ...quarters[3], filingDate: "2027-01-01" },
      ],
    },
    "ONON",
    now.getTime(),
  );
  assert.equal(q.rows.length, 1);
  assert.equal(q.rows[0].values.revenue, null);
});
test("segments preserve overlapping series without an invented total; estimates never assume currency", () => {
  const segments = normalizeSegments(
    [
      {
        symbol: "ONON",
        period: "FY",
        date: "2025-12-31",
        reportedCurrency: "CHF",
        data: { Americas: 100, "United States": 80 },
      },
    ],
    "ONON",
    now.getTime(),
  );
  assert.equal(segments[0].values.length, 2);
  assert.equal(segments[0].total, undefined);
  const e = normalizeEstimates(
    [
      {
        symbol: "ONON",
        date: "2027-12-31",
        revenueAvg: 100,
        epsAvg: 0,
        numAnalystsEps: 2,
      },
    ],
    "ONON",
    now.getTime(),
  )[0];
  assert.equal(e.currency, null);
  assert.equal(e.eps.average, 0);
  assert.equal(e.revenue.low, null);
});
test("news filters ticker contamination, old and future articles, and unsafe links", () => {
  const articles = normalizeNews(
    [
      article(),
      article({ symbol: "OTHER" }),
      article({ url: "javascript:alert(1)" }),
      article({ publishedDate: "2020-01-01" }),
      article({ publishedDate: "2030-01-01" }),
    ],
    "FMP",
    "ONON",
    now.getTime(),
  );
  assert.equal(articles.length, 1);
  assert.equal(articles[0].datePrecision, "day");
  const yahoo = [
    {
      title: "News",
      link: "https://example.com/news",
      providerPublishTime: now.getTime() / 1000 - 10,
      relatedTickers: ["WRONG"],
    },
  ];
  assert.equal(
    normalizeNews(yahoo, "Yahoo Finance", "ONON", now.getTime()).length,
    0,
  );
});
test("tone abstains on questions, negation and unmatched titles; dedupe preserves ticker associations", () => {
  assert.equal(headlineTone("On beats expectations"), "positive");
  assert.equal(headlineTone("On does not beat expectations"), "unclassified");
  assert.equal(headlineTone("Will On surge?"), "unclassified");
  assert.equal(headlineTone("On beats earnings but cuts guidance"), "mixed");
  assert.equal(headlineTone("On appoints a new director"), "unclassified");
  const a = normalizeNews([article()], "FMP", "ONON", now.getTime())[0];
  const d = deduplicateNews([
    a,
    { ...a, provider: "Yahoo Finance", symbols: ["NKE"] },
  ]);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].symbols, ["ONON", "NKE"]);
  assert.deepEqual(d[0].providers, ["FMP", "Yahoo Finance"]);
  assert.equal(summarizeTone(d).balance, null);
  assert.equal(summarizeTone([]).balance, null);
});
test("portfolio universe retains missing coverage denominator and explicitly omits unsupported holdings", () => {
  const u = portfolioUniverse(
    [
      { ticker: "A", asset_type: "equity", market_value_usd: "70" },
      { ticker: "B", asset_type: "etf", market_value_usd: 30 },
      { ticker: "C", asset_type: "equity", market_value_usd: null },
      { ticker: "CASH", asset_type: "cash", market_value_usd: 1000 },
    ],
    1,
  );
  assert.equal(u.total, 3);
  assert.equal(u.omitted, 2);
  assert.equal(u.unpriced, 1);
  assert.equal(u.excluded, 1);
  assert.equal(u.holdings[0].weight, 0.7);
});
test("HTTP denies anonymous users before provider or portfolio work and scopes ownership to session", async () => {
  let calls = 0,
    args;
  const service = {
    portfolio: async (holdings) => {
      calls++;
      return { holdings };
    },
    news: async () => {
      calls++;
      return {};
    },
  };
  const readPortfolio = async (...input) => {
    args = input;
    return { status: "available", holdings: [{ ticker: "OWN" }] };
  };
  const denied = createResearchMarketHttp({
    authenticate: async () => Response.json({}, { status: 401 }),
    service,
    readPortfolio,
  });
  assert.equal(
    (await denied(new Request("https://example.com/?scope=portfolio"))).status,
    401,
  );
  assert.equal(calls, 0);
  const allowed = createResearchMarketHttp({
    authenticate: async () => ({
      user: { id: "owner" },
      workspace: { id: "owned" },
    }),
    service,
    readPortfolio,
  });
  const r = await allowed(
    new Request(
      "https://example.com/?scope=portfolio&owner=attacker&workspace=other",
    ),
  );
  assert.deepEqual(args, ["owner", "owned"]);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.deepEqual((await r.json()).holdings, [{ ticker: "OWN" }]);
});
test("provider failures are independent, entitlement is explicit, and keys never leak", async () => {
  const service = createResearchMarketService({
    clock,
    env: { FMP_API_KEY: "SECRET" },
    fetcher: async (url) =>
      url.includes("revenue-product")
        ? Response.json([
            {
              symbol: "ONON",
              period: "FY",
              date: "2025-12-31",
              reportedCurrency: "CHF",
              data: { Shoes: 42 },
            },
          ])
        : new Response("secret provider body", { status: 402 }),
  });
  const s = await service.fundamentals("ONON", "segments");
  assert.equal(s.status, "available");
  assert.equal(s.geographic.status, "upgrade_required");
  assert.equal(JSON.stringify(s).includes("SECRET"), false);
  assert.equal(
    (await service.fundamentals("ONON", "transcripts")).status,
    "upgrade_required",
  );
  await assert.rejects(
    service.fundamentals("ONON", "transcript", { year: 9999, quarter: 1 }),
    /INVALID_PERIOD/,
  );
  await assert.rejects(service.news("../secret"), /INVALID_TICKER/);
});
test("Yahoo fallback works, requests dedupe, social absence never becomes zero sentiment", async () => {
  let calls = 0;
  const service = createResearchMarketService({
    clock,
    env: { FMP_API_KEY: "key" },
    fetcher: async (url) => {
      calls++;
      return url.includes("yahoo")
        ? Response.json({
            news: [
              {
                title: "On beats estimates",
                link: "https://example.com/news",
                relatedTickers: ["ONON"],
                providerPublishTime: now.getTime() / 1000 - 100,
              },
            ],
          })
        : new Response("", { status: 503 });
    },
  });
  const [a, b] = await Promise.all([
    service.news("ONON"),
    service.news("ONON"),
  ]);
  assert.equal(calls, 2);
  assert.deepEqual(a, b);
  assert.equal(a.status, "available");
  assert.equal(a.sources.fmp, "unavailable");
  assert.equal(a.stocktwits.status, "not_configured");
  assert.equal(a.stocktwits.data, null);
  await service.news("ONON");
  assert.equal(calls, 2);
});
test("licensed Stocktwits adapter selects latest valid point and keeps normalized score separate", async () => {
  const service = createResearchMarketService({
    clock,
    env: { STOCKTWITS_USERNAME: "user", STOCKTWITS_PASSWORD: "private" },
    fetcher: async (url, init) => {
      if (url.includes("stocktwits")) {
        assert.match(init.headers.Authorization, /^Basic /);
        return Response.json({
          data: {
            a: {
              dateTime: "2026-09-20T20:00:00Z",
              sentimentNormalized: 65,
              messageVolume: 120,
            },
            b: {
              dateTime: "2026-09-20T21:00:00Z",
              sentimentNormalized: 70,
              messageVolume: 125,
            },
            future: { dateTime: "2027-01-01", sentimentNormalized: 100 },
          },
        });
      }
      return Response.json({ news: [] });
    },
  });
  const n = await service.news("ONON");
  assert.equal(n.stocktwits.status, "available");
  assert.equal(n.stocktwits.data.sentiment, 70);
  assert.equal(n.stocktwits.data.messageVolume, 125);
  assert.ok(!JSON.stringify(n).includes("private"));
});
test("portfolio sends public tickers only and does not count failed tickers as covered", async () => {
  const requests = [];
  const service = createResearchMarketService({
    clock,
    env: { FMP_API_KEY: "key" },
    fetcher: async (url) => {
      requests.push(url);
      return url.includes("yahoo")
        ? Response.json({ news: [] })
        : Response.json(url.includes("symbols=ONON") ? [article()] : []);
    },
  });
  const result = await service.portfolio([
    {
      ticker: "ONON",
      asset_type: "stock",
      market_value_usd: 75,
      quantity: 1234567,
    },
    { ticker: "NONE", asset_type: "equity", market_value_usd: 25 },
  ]);
  assert.equal(result.coverage.withNews, 1);
  assert.equal(result.coverage.coveredKnownValueWeight, 0.75);
  assert.equal(result.universe.total, 2);
  assert.ok(requests.every((url) => !url.includes("1234567")));
});

test("quota denial stops vendor and owned-portfolio reads and advertises retry time", async () => {
  let calls = 0;
  const handler = createResearchMarketHttp({
    authenticate: async () => ({
      user: { id: "owner" },
      workspace: { id: "own" },
    }),
    consume: async () => ({ allowed: false, retryAfterSeconds: 42 }),
    service: { news: async () => calls++ },
    readPortfolio: async () => calls++,
  });
  const r = await handler(new Request("https://example.com/?scope=portfolio"));
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "42");
  assert.equal(calls, 0);
});
test("roundup headlines do not attribute another company downgrade to this ticker", () => {
  assert.equal(
    headlineTone(
      "On Holdings New Partner; Netflix Analyst Downgrade | Stock Movers",
    ),
    "unclassified",
  );
  assert.equal(
    headlineTone("On Holding stock jumps following partnership"),
    "positive",
  );
  assert.equal(headlineTone("On climbs while Nike slips"), "mixed");
});

test("missing portfolio valuations never produce a numeric weighted-coverage claim", async () => {
  const s = createResearchMarketService({
    clock,
    env: {},
    fetcher: async () => Response.json({ news: [] }),
  });
  const r = await s.portfolio([
    { ticker: "ONON", asset_type: "equity", market_value_usd: null },
  ]);
  assert.equal(r.coverage.coveredKnownValueWeight, null);
});

test("share-class aliases retain the requested ticker in portfolio news filters", () => {
  const rows = normalizeNews(
    [article({ symbol: "BRK-B" })],
    "FMP",
    "BRK.B",
    now.getTime(),
  );
  assert.deepEqual(rows[0].symbols, ["BRK.B"]);
});

test("cross-source sentiment keeps missing and zero activity distinct from bearish sentiment", () => {
  const rows = normalizePlatformSentiment(
    {
      stocks: [
        {
          ticker: "ONON",
          mentions: 0,
          bullish_pct: 0,
          bearish_pct: 0,
          buzz_score: 0,
          trend: "stable",
        },
        {
          ticker: "NKE",
          mentions: 8,
          bullish_pct: 75,
          bearish_pct: 50,
          buzz_score: 110,
          trend: "rising",
        },
      ],
    },
    ["ONON", "NKE", "MSFT"],
    "reddit",
  );
  assert.equal(rows[0].status, "empty");
  assert.equal(rows[0].bullish, null);
  assert.equal(rows[0].activity, null);
  assert.equal(rows[1].bullish, null);
  assert.equal(rows[1].bearish, null);
  assert.equal(rows[1].activity, null);
  assert.equal(rows[2].count, null);
  const pm = normalizePlatformSentiment(
    {
      stocks: [
        {
          ticker: "ONON",
          trade_count: 12,
          buzz_score: 45,
          bullish_pct: 0,
          bearish_pct: 100,
        },
      ],
    },
    ["ONON"],
    "polymarket",
  )[0];
  assert.equal(pm.bullish, 0);
  assert.equal(pm.unit, "trades");
  assert.equal(pm.count, 12);
});
test("Adanos uses explicit UTC windows, batches at ten tickers, and preserves partial-source failure", async () => {
  const calls = [];
  const service = createResearchMarketService({
    clock,
    env: { ADANOS_API_KEY: "private-key" },
    fetcher: async (url, options) => {
      calls.push(url);
      assert.equal(options.headers["X-API-Key"], "private-key");
      const u = new URL(url);
      assert.equal(u.searchParams.get("from"), "2026-09-15");
      assert.equal(u.searchParams.get("to"), "2026-09-21");
      const tickers = u.searchParams.get("tickers").split(",");
      assert.ok(tickers.length <= 10);
      return u.pathname.startsWith("/x/")
        ? new Response("", { status: 403 })
        : Response.json({
            stocks: tickers.map((ticker) => ({
              ticker,
              buzz_score: 42,
              mentions: 8,
              trade_count: 2,
              bullish_pct: 60,
              bearish_pct: 10,
              trend: "rising",
            })),
          });
    },
  });
  const tickers = Array.from({ length: 12 }, (_, i) => `T${i}`);
  const r = await service.sentiment(tickers);
  assert.equal(calls.length, 8);
  assert.equal(r.status, "available");
  assert.equal(r.sources.x, "access_denied");
  assert.equal(r.rows.length, 48);
  assert.equal(r.rows.find((x) => x.source === "x").bullish, null);
  assert.ok(!JSON.stringify(r).includes("private-key"));
  await service.sentiment(tickers);
  assert.equal(calls.length, 8);
});
test("unconfigured Adanos does not make network calls or return invented source scores", async () => {
  const service = createResearchMarketService({
    clock,
    env: {},
    fetcher: async () => {
      throw Error("must not fetch");
    },
  });
  const r = await service.sentiment(["ONON"]);
  assert.equal(r.status, "not_configured");
  assert.deepEqual(r.rows, []);
});
test("watchlist scan validates and deduplicates public tickers without creating portfolio weights", async () => {
  const service = createResearchMarketService({
    clock,
    env: {},
    fetcher: async () => Response.json({ news: [] }),
  });
  const r = await service.watchlist(["ONON", "onon", "NKE"]);
  assert.equal(r.scope, "watchlist");
  assert.equal(r.universe.total, 2);
  assert.equal(r.coverage.coveredKnownValueWeight, null);
  assert.ok(r.results.every((x) => x.weight === null));
  assert.throws(() => service.watchlist(["../invalid"]), /INVALID_TICKER/);
  assert.throws(
    () => service.watchlist(new Array(41).fill("ONON")),
    /INVALID_TICKERS/,
  );
});
test("portfolio sentiment reads owned holdings even if caller supplies other tickers", async () => {
  let received;
  const handler = createResearchMarketHttp({
    authenticate: async () => ({
      user: { id: "owner" },
      workspace: { id: "own" },
    }),
    service: {
      sentiment: async (tickers) => {
        received = tickers;
        return { status: "available" };
      },
    },
    readPortfolio: async () => ({
      status: "available",
      holdings: [{ ticker: "OWN", asset_type: "stock", market_value_usd: 10 }],
    }),
  });
  const r = await handler(
    new Request(
      "https://example.com/?kind=sentiment&scope=portfolio&tickers=OTHER",
    ),
  );
  assert.equal(r.status, 200);
  assert.deepEqual(received, ["OWN"]);
});

test("33-position portfolios scan completely with bounded concurrency and disclose larger-universe truncation", async () => {
  let active=0,peak=0;
  const service = createResearchMarketService({
    clock,
    env: {},
    fetcher: async () => {active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;return Response.json({news:[]});},
  });
  const holdings = Array.from({ length: 33 }, (_, i) => ({
    ticker: `T${i}`,
    asset_type: "equity",
    market_value_usd: 10,
  }));
  const r = await service.portfolio(holdings);
  assert.equal(r.coverage.scanned, 33);
  assert.ok(peak<=8);
  assert.equal(r.universe.omitted, 0);
  const large = portfolioUniverse([
    ...holdings,
    ...Array.from({ length: 12 }, (_, i) => ({
      ticker: `X${i}`,
      asset_type: "equity",
      market_value_usd: 10,
    })),
  ]);
  assert.equal(large.holdings.length, 40);
  assert.equal(large.omitted, 5);
});
