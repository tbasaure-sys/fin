import assert from "node:assert/strict";
import test from "node:test";

import {
  FactorLabUnavailableError,
  createFactorLabLiveService,
  factorLabRowFromSnapshot,
  fetchFactorLabMarketSnapshot,
  parseFactorLabMarketChart,
} from "../lib/server/factorlab-service.js";

const liveSnapshot = {
  ok: true,
  asOf: "2026-07-28T14:00:00.000Z",
  company: {
    ticker: "LIVE",
    entityName: "Live Systems",
    industry: "Industrial systems",
    filedAt: "2026-07-20",
  },
  quote: { price: 24, source: "FMP stable quote" },
  drivers: { roic: 0.17, margin: 20 / 130 },
  facts: {
    revenueSeries: [
      { fy: 2023, end: "2023-12-31", value: 80_000_000 },
      { fy: 2024, end: "2024-12-31", value: 100_000_000 },
      { fy: 2025, end: "2025-12-31", value: 130_000_000 },
    ],
    grossProfitSeries: [
      { fy: 2024, value: 42_000_000 },
      { fy: 2025, value: 58_500_000 },
    ],
    operatingIncomeSeries: [
      { fy: 2024, value: 14_000_000 },
      { fy: 2025, value: 20_000_000 },
    ],
    cfoSeries: [
      { fy: 2024, value: 18_000_000 },
      { fy: 2025, value: 25_000_000 },
    ],
    capexSeries: [
      { fy: 2024, value: 4_000_000 },
      { fy: 2025, value: 5_000_000 },
    ],
    sharesSeries: [
      { fy: 2024, value: 9_500_000 },
      { fy: 2025, value: 10_000_000 },
    ],
    cash: { value: 18_000_000 },
    debt: { value: 8_000_000 },
  },
  catalystEvidence: { items: [{ title: "New contract" }, { title: "Results" }] },
  coverage: { secCompanyFacts: true, quoteSource: "FMP stable quote" },
};

const liveMarket = {
  ticker: "LIVE",
  price: 24,
  marketDate: "2026-07-28",
  averageDailyValue: 4_800_000,
  residualVol: 0.34,
  source: "Yahoo Finance chart",
};

test("live snapshot normalization produces dated scoring inputs from observed facts", () => {
  const row = factorLabRowFromSnapshot(liveSnapshot, liveMarket);

  assert.equal(row.ticker, "LIVE");
  assert.equal(row.priceDate, "2026-07-28");
  assert.equal(row.fundamentalsDate, "2026-07-20");
  assert.equal(row.marketCapUsd, 240_000_000);
  assert.equal(row.advUsd, 4_800_000);
  assert.equal(Number(row.revenueGrowthTtm.toFixed(4)), 0.3);
  assert.equal(Number(row.revenueAcceleration.toFixed(4)), 0.05);
  assert.equal(Number(row.fcfMargin.toFixed(4)), 0.1538);
  assert.equal(Number(row.dilutionTtm.toFixed(4)), 0.0526);
  assert.equal(row.sources.market, "Yahoo Finance chart");
  assert.match(row.narrative.es.whyNow, /30,0%/);
});

test("live snapshot normalization keeps unavailable cash yield unknown", () => {
  const row = factorLabRowFromSnapshot({
    ...liveSnapshot,
    facts: { ...liveSnapshot.facts, cfoSeries: [], capexSeries: [] },
  }, liveMarket);

  assert.equal(row.fcfYield, null);
  assert.equal(row.fcfMargin, null);
});

test("live snapshot normalization neutralizes unavailable catalyst coverage", () => {
  const row = factorLabRowFromSnapshot({
    ...liveSnapshot,
    catalystEvidence: { status: "missing_keys", items: [], providerDiagnostics: [] },
  }, liveMarket);

  assert.equal(row.newsCount90d, null);
  assert.equal(row.sources.catalysts, null);
});

test("market chart normalization derives traded value and realized volatility from observed sessions", () => {
  const market = parseFactorLabMarketChart({
    chart: {
      result: [{
        meta: { regularMarketPrice: 24, currency: "USD", exchangeName: "NASDAQ" },
        timestamp: [1785024000, 1785110400, 1785196800],
        indicators: { quote: [{ close: [20, 22, 24], volume: [100_000, 200_000, 300_000] }] },
      }],
    },
  }, "live");

  assert.equal(market.ticker, "LIVE");
  assert.equal(market.price, 24);
  assert.equal(market.averageDailyValue, 4_800_000);
  assert.ok(market.residualVol > 0);
  assert.equal(market.source, "Yahoo Finance chart");
});

test("market snapshot falls back to a dated FMP equity quote when Yahoo rate-limits", async () => {
  const previousKey = process.env.FMP_API_KEY;
  process.env.FMP_API_KEY = "fmp_test_key";
  const requested = [];
  try {
    const market = await fetchFactorLabMarketSnapshot("txn", {
      fetchImpl: async (url) => {
        requested.push(String(url));
        if (String(url).includes("finance.yahoo.com")) return new Response("limited", { status: 429 });
        if (String(url).includes("/stable/quote")) {
          return Response.json([{
            symbol: "TXN",
            name: "Texas Instruments Incorporated",
            price: 207.5,
            marketCap: 189_000_000_000,
            volume: 4_000_000,
            exchange: "NASDAQ",
            timestamp: 1785258000,
          }]);
        }
        if (String(url).includes("/stable/profile")) {
          return Response.json([{ symbol: "TXN", companyName: "Texas Instruments Incorporated", sector: "Technology", industry: "Semiconductors", isEtf: false, isFund: false, isAdr: false }]);
        }
        if (String(url).includes("/stable/income-statement")) {
          return Response.json([{ symbol: "TXN", calendarYear: "2025", revenue: 17_000_000_000, netIncome: 4_800_000_000, weightedAverageShsOutDil: 910_000_000 }]);
        }
        if (String(url).includes("/stable/balance-sheet-statement")) {
          return Response.json([{ symbol: "TXN", totalStockholdersEquity: 18_000_000_000, cashAndCashEquivalents: 4_000_000_000, totalDebt: 14_000_000_000 }]);
        }
        return Response.json([{ symbol: "TXN", freeCashFlow: 5_200_000_000 }]);
      },
    });

    assert.equal(requested.length, 6);
    assert.equal(market.ticker, "TXN");
    assert.equal(market.price, 207.5);
    assert.equal(market.instrumentType, "EQUITY");
    assert.equal(market.source, "Financial Modeling Prep quote");
    assert.equal(market.sector, "Technology");
    assert.equal(market.fundamentals.freeCashFlow, 5_200_000_000);
    assert.equal(market.fundamentals.dilutedShares, 910_000_000);
    assert.ok(market.marketDate);
  } finally {
    if (previousKey === undefined) delete process.env.FMP_API_KEY;
    else process.env.FMP_API_KEY = previousKey;
  }
});

test("a Yahoo quote is enriched with FMP company classification and fundamentals", async () => {
  const previousKey = process.env.FMP_API_KEY;
  process.env.FMP_API_KEY = "fmp_test_key";
  try {
    const market = await fetchFactorLabMarketSnapshot("jpm", {
      fetchImpl: async (url) => {
        const target = String(url);
        if (target.includes("finance.yahoo.com")) {
          return Response.json({ chart: { result: [{
            meta: { regularMarketPrice: 356, currency: "USD", exchangeName: "NYSE", instrumentType: "EQUITY" },
            timestamp: [1785258000],
            indicators: { quote: [{ close: [356], volume: [8_000_000] }] },
          }] } });
        }
        if (target.includes("/stable/quote")) return Response.json([{ symbol: "JPM", price: 355, marketCap: 980_000_000_000, exchange: "NYSE", timestamp: 1785258000 }]);
        if (target.includes("/stable/profile")) return Response.json([{ symbol: "JPM", companyName: "JPMorgan Chase & Co.", sector: "Financial Services", industry: "Banks - Diversified" }]);
        if (target.includes("/stable/income-statement")) return Response.json([{ calendarYear: "2025", revenue: 180_000_000_000, netIncome: 58_000_000_000, weightedAverageShsOutDil: 2_750_000_000 }]);
        if (target.includes("/stable/balance-sheet-statement")) return Response.json([{ totalStockholdersEquity: 360_000_000_000, cashAndCashEquivalents: 25_000_000_000, totalDebt: 410_000_000_000 }]);
        return Response.json([{ freeCashFlow: 40_000_000_000 }]);
      },
    });

    assert.equal(market.price, 356);
    assert.equal(market.marketCap, 980_000_000_000);
    assert.equal(market.source, "Yahoo Finance chart");
    assert.equal(market.name, "JPMorgan Chase & Co.");
    assert.equal(market.sector, "Financial Services");
    assert.equal(market.fundamentals.totalEquity, 360_000_000_000);
  } finally {
    if (previousKey === undefined) delete process.env.FMP_API_KEY;
    else process.env.FMP_API_KEY = previousKey;
  }
});

test("live service ranks only companies backed by successful current snapshots", async () => {
  const service = createFactorLabLiveService({
    universeLoader: async () => [{ ticker: "LIVE" }, { ticker: "FAIL" }],
    snapshotLoader: async (ticker) => {
      if (ticker === "FAIL") throw new Error("provider down");
      return liveSnapshot;
    },
    marketLoader: async () => liveMarket,
    now: () => "2026-07-28T14:05:00.000Z",
  });

  const result = await service.run({ topK: 6, minAdvUsd: 250_000 });

  assert.equal(result.mode, "live");
  assert.equal(result.generatedAt, "2026-07-28T14:05:00.000Z");
  assert.equal(result.datasetAsOf, "2026-07-28");
  assert.deepEqual(result.candidates.map((row) => row.ticker), ["LIVE"]);
  assert.deepEqual(result.providerStatus, { requested: 2, succeeded: 1, failed: 1 });
  assert.match(result.spec.sources.market.adapter, /Yahoo Finance chart/);
  assert.equal(result.spec.sources.fundamentals.adapter, "SEC company facts");
  assert.doesNotMatch(JSON.stringify(result.spec.sources), /fmp_company_screener|fmp_quarterly_ttm/);
  assert.match(result.pipeline.find((step) => step.id === "type").input, /filed financial features/i);
  assert.equal(result.frequency, "Actualización bajo demanda · caché máxima 15 min");
});

test("live service refuses total provider failure instead of substituting the demo universe", async () => {
  const service = createFactorLabLiveService({
    universeLoader: async () => [{ ticker: "FAIL" }],
    snapshotLoader: async () => { throw new Error("provider down"); },
    marketLoader: async () => { throw new Error("market down"); },
  });

  await assert.rejects(
    () => service.run({}),
    (error) => error instanceof FactorLabUnavailableError && error.code === "LIVE_DATA_UNAVAILABLE",
  );
});

test("live service holds back rows without observed liquidity and volatility", async () => {
  const service = createFactorLabLiveService({
    universeLoader: async () => [{ ticker: "LIVE" }],
    snapshotLoader: async () => liveSnapshot,
    marketLoader: async () => ({ ...liveMarket, averageDailyValue: null, residualVol: null }),
  });

  const result = await service.run({ includeDiagnostics: true });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].authorizationTier, "ABSTAIN");
  assert.match(result.candidates[0].gateReasons.join(" "), /liquidity|volatility/i);
});
