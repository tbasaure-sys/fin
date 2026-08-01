import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyLocalPortfolioOverlay,
  buildHistoryPerformanceMetrics,
  buildHistorySeries,
  previewHoldingsInstruction,
  signedCashLedgerExternalFlowUsd,
  updateHoldingsFromInstruction,
} from "../lib/server/private-portfolio.js";

test("an empty workspace never inherits holdings or analytics from the shared snapshot", async () => {
  const previousFallback = process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK;
  process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK = "false";

  try {
    const snapshot = {
      overview: { market_regime: "Neutral" },
      portfolio: {
        holdings: [{ ticker: "SEZL", weight: 0.42, market_value_usd: 4200 }],
        top_holdings: [{ ticker: "SEZL", weight: 0.42 }],
        transactions: [{ ticker: "SEZL", action: "Buy" }],
        analytics: { "Holdings Count": 17, "Portfolio Beta": 1.4 },
        sector_weights: [{ sector: "Technology", weight: 0.42 }],
        current_mix_vs_spy: [{ date: "2026-01-01", portfolio_growth: 1 }],
      },
      screener: {
        rows: [{ ticker: "SEZL", is_current_holding: true }],
      },
    };

    const result = await applyLocalPortfolioOverlay(snapshot, `empty-workspace-${Date.now()}`);

    assert.deepEqual(result.portfolio.holdings, []);
    assert.deepEqual(result.portfolio.top_holdings, []);
    assert.deepEqual(result.portfolio.transactions, []);
    assert.deepEqual(result.portfolio.analytics, {});
    assert.equal(result.portfolio.holdings_source, "workspace_portfolio_empty");
    assert.equal(result.portfolio.holdings_source_available, false);
    assert.equal(result.screener.rows[0].is_current_holding, false);
    assert.equal(result.overview.market_regime, "Neutral");
  } finally {
    if (previousFallback === undefined) {
      delete process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK;
    } else {
      process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK = previousFallback;
    }
  }
});

test("plain-language trades ask for a date before any portfolio change", async () => {
  const preview = await previewHoldingsInstruction({}, { instruction: "compré USD 200 de NVDA" });

  assert.equal(preview.status, "needs_date");
  assert.equal(preview.ticker, "NVDA");
  assert.match(preview.message, /Cuándo hiciste esta operación/);
});

test("plain-language trades reject multiple tickers instead of guessing", async () => {
  await assert.rejects(
    previewHoldingsInstruction({}, { instruction: "vendí 2 acciones de ZVRA y ADUL" }),
    /una compra o venta por vez/i,
  );
});

test("portfolio history computes TWR after external flows instead of raw value growth", () => {
  const rows = [
    { date: "2026-01-01", total_value_usd: 100, benchmark_price_usd: 100, external_flow_usd: 0 },
    { date: "2026-02-01", total_value_usd: 150, benchmark_price_usd: 101, external_flow_usd: 50 },
    { date: "2026-04-01", total_value_usd: 165, benchmark_price_usd: 102, external_flow_usd: 0 },
  ];

  const series = buildHistorySeries(rows);

  assert.equal(series.length, 3);
  assert.equal(series[0].portfolio_growth, 1);
  assert.equal(series[1].portfolio_growth, 1);
  assert.equal(series[1].value_growth, 1.5);
  assert.equal(series[2].portfolio_growth, 1.1);
  assert.equal(series[2].value_growth, 1.65);
  assert.equal(series[1].period_return, 0);
  assert.equal(Number(series[2].period_return.toFixed(4)), 0.1);
  assert.equal(series[1].performance_method, "twr_external_flow_adjusted");

  const metrics = buildHistoryPerformanceMetrics(rows);
  assert.equal(Number(metrics.totalTwr.toFixed(4)), 0.1);
  assert.equal(Number.isFinite(metrics.moneyWeightedReturn), true);
  assert.equal(metrics.performanceMethod, "time_weighted_external_flow_adjusted");
  assert.equal(metrics.externalFlowCount, 1);
});

test("portfolio history skips missing or zero-value snapshots instead of plotting fake TWR", () => {
  const rows = [
    { date: "2026-01-01", total_value_usd: 0, benchmark_price_usd: 100, external_flow_usd: 0 },
    { date: "2026-01-02", total_value_usd: null, benchmark_price_usd: 101, external_flow_usd: 0 },
    { date: "2026-01-03", total_value_usd: 100, benchmark_price_usd: 102, external_flow_usd: 0 },
    { date: "2026-01-04", total_value_usd: 110, benchmark_price_usd: 103, external_flow_usd: 0 },
  ];

  const series = buildHistorySeries(rows);
  const portfolioPoints = series.filter((row) => row.portfolio_growth !== null);

  assert.equal(series.length, 4);
  assert.equal(portfolioPoints.length, 2);
  assert.equal(portfolioPoints[0].date, "2026-01-03");
  assert.equal(portfolioPoints[0].portfolio_growth, 1);
  assert.equal(Number(portfolioPoints[1].period_return.toFixed(4)), 0.1);
  assert.equal(Number(portfolioPoints[1].portfolio_growth.toFixed(4)), 1.1);
});

test("cash ledger treats trades as internal and deposits or withdrawals as external flows", () => {
  assert.equal(signedCashLedgerExternalFlowUsd({ event_type: "buy", amount_usd: -1000 }), 0);
  assert.equal(signedCashLedgerExternalFlowUsd({ event_type: "sell", amount_usd: 500 }), 0);
  assert.equal(signedCashLedgerExternalFlowUsd({ event_type: "deposit", amount_usd: 250 }), 250);
  assert.equal(signedCashLedgerExternalFlowUsd({ event_type: "withdrawal", amount_usd: -75 }), -75);
});

test("portfolio overlay preserves tracked growth history when a divergent current-weight backcast is available", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "blsprime-portfolio-truth-"));
  const workspaceId = `portfolio-truth-${Date.now()}`;
  const workspaceRoot = join(tempRoot, workspaceId);
  const holdingsPath = join(tempRoot, "holdings.csv");
  const previous = {
    fallback: process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK,
    holdings: process.env.BLS_PRIME_LOCAL_HOLDINGS_CSV,
    stateDir: process.env.BLS_PRIME_HOLDINGS_STATE_DIR,
    fmp: process.env.FMP_API_KEY,
    remoteGet: process.env.BLS_PRIME_HOLDINGS_STATE_GET_URL,
    remoteState: process.env.BLS_PRIME_HOLDINGS_STATE_URL,
    actualRemoteState: process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_URL,
    remoteSnapshot: process.env.BLS_PRIME_REMOTE_SNAPSHOT_URL,
  };
  const previousFetch = globalThis.fetch;
  const realizedHistory = [
    { date: "2026-01-01", portfolio_growth: 1, spy_growth: 1, performance_method: "twr_external_flow_adjusted" },
    { date: "2026-01-02", portfolio_growth: 1.1, spy_growth: 1.02, performance_method: "twr_external_flow_adjusted" },
  ];

  await writeFile(
    holdingsPath,
    "ticker;asset_type;quantity;currency;avg_cost_usd;purchase_date;current_price_usd;market_value_usd;weight;sector\nPFTX;equity;10;USD;100;2026-01-01;120;1200;1;Technology\n",
    "utf8",
  );
  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    join(workspaceRoot, "holdings_state.json"),
    JSON.stringify({
      available: true,
      source: "ui_editable_overlay",
      source_label: "Edited in UI",
      updated_at: new Date().toISOString(),
      holdings: [
        {
          ticker: "PFTX",
          asset_type: "equity",
          quantity: 10,
          currency: "USD",
          avg_cost_usd: 100,
          purchase_date: "2026-01-01",
          current_price_usd: 120,
          market_value_usd: 1200,
          weight: 1,
          sector: "Technology",
        },
      ],
    }),
    "utf8",
  );

  process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK = "true";
  process.env.BLS_PRIME_LOCAL_HOLDINGS_CSV = holdingsPath;
  process.env.BLS_PRIME_HOLDINGS_STATE_DIR = tempRoot;
  process.env.FMP_API_KEY = "portfolio-truth-test";
  delete process.env.BLS_PRIME_HOLDINGS_STATE_GET_URL;
  delete process.env.BLS_PRIME_HOLDINGS_STATE_URL;
  process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_URL = "";
  process.env.BLS_PRIME_REMOTE_SNAPSHOT_URL = "";
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const symbol = url.searchParams.get("symbol");
    const closes = symbol === "PFTX" ? [10, 20, 30] : [100, 101, 102];
    return {
      ok: true,
      status: 200,
      async json() {
        return closes.map((close, index) => ({ date: `2026-01-0${index + 1}`, close }));
      },
    };
  };

  try {
    const result = await applyLocalPortfolioOverlay({
      portfolio: {
        analytics: {
          "Performance Method": "broker_personal_history",
          "Realized P&L": 230,
          Dividends: 70,
          "Total P&L incl. realized/dividends": 500,
          "Total return incl. dividends": 0.5,
        },
        current_mix_vs_spy: realizedHistory,
      },
    }, workspaceId);

    assert.deepEqual(result.portfolio.current_mix_vs_spy, realizedHistory);
    assert.equal(result.portfolio.analytics["Performance Method"], "broker_personal_history");
    assert.equal(result.portfolio.analytics["Unrealized P&L"], 200);
    assert.equal(result.portfolio.analytics["Total P&L incl. realized/dividends"], 500);
    assert.equal(result.portfolio.analytics["Total return incl. dividends"], 0.5);
    assert.deepEqual(result.portfolio.performance_report.personalHeadline, {
      available: true,
      method: "actual_portfolio",
      pnlUsd: 500,
      returnValue: 0.5,
      costBasisUsd: 1000,
    });
    assert.equal(result.portfolio.performance_report.reconstructed.method, "reconstructed_holdings_history");
    assert.equal(result.portfolio.performance_report.backcast.method, "current_weight_backcast");
  } finally {
    globalThis.fetch = previousFetch;
    if (previous.fallback === undefined) delete process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK;
    else process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK = previous.fallback;
    if (previous.holdings === undefined) delete process.env.BLS_PRIME_LOCAL_HOLDINGS_CSV;
    else process.env.BLS_PRIME_LOCAL_HOLDINGS_CSV = previous.holdings;
    if (previous.stateDir === undefined) delete process.env.BLS_PRIME_HOLDINGS_STATE_DIR;
    else process.env.BLS_PRIME_HOLDINGS_STATE_DIR = previous.stateDir;
    if (previous.fmp === undefined) delete process.env.FMP_API_KEY;
    else process.env.FMP_API_KEY = previous.fmp;
    if (previous.remoteGet === undefined) delete process.env.BLS_PRIME_HOLDINGS_STATE_GET_URL;
    else process.env.BLS_PRIME_HOLDINGS_STATE_GET_URL = previous.remoteGet;
    if (previous.remoteState === undefined) delete process.env.BLS_PRIME_HOLDINGS_STATE_URL;
    else process.env.BLS_PRIME_HOLDINGS_STATE_URL = previous.remoteState;
    if (previous.actualRemoteState === undefined) delete process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_URL;
    else process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_URL = previous.actualRemoteState;
    if (previous.remoteSnapshot === undefined) delete process.env.BLS_PRIME_REMOTE_SNAPSHOT_URL;
    else process.env.BLS_PRIME_REMOTE_SNAPSHOT_URL = previous.remoteSnapshot;
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("stale holdings skip historical analysis and expose no derived personal performance", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "blsprime-stale-portfolio-"));
  const workspaceId = `stale-portfolio-${Date.now()}`;
  const workspaceRoot = join(tempRoot, workspaceId);
  const previous = {
    fallback: process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK,
    stateDir: process.env.BLS_PRIME_HOLDINGS_STATE_DIR,
    fmp: process.env.FMP_API_KEY,
    remoteState: process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_URL,
    remoteSnapshot: process.env.BLS_PRIME_REMOTE_SNAPSHOT_URL,
    allocatorRemoteState: process.env.META_ALLOCATOR_REMOTE_HOLDINGS_STATE_URL,
    allocatorRemoteSnapshot: process.env.META_ALLOCATOR_REMOTE_SNAPSHOT_URL,
  };
  const previousFetch = globalThis.fetch;
  const recordedHistory = [
    { date: "2025-01-01", portfolio_growth: 1, spy_growth: 1, performance_method: "twr_external_flow_adjusted" },
    { date: "2025-06-01", portfolio_growth: 1.08, spy_growth: 1.04, performance_method: "twr_external_flow_adjusted" },
  ];
  let fetchCalls = 0;

  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    join(workspaceRoot, "holdings_state.json"),
    JSON.stringify({
      available: true,
      source: "ui_editable_overlay",
      source_label: "Edited in UI",
      updated_at: "2025-01-01T00:00:00.000Z",
      holdings: [
        {
          ticker: "STALE",
          asset_type: "equity",
          quantity: 10,
          currency: "USD",
          avg_cost_usd: 100,
          purchase_date: "2024-01-02",
          current_price_usd: 120,
          market_value_usd: 1200,
          weight: 1,
          sector: "Technology",
        },
      ],
    }),
    "utf8",
  );

  process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK = "true";
  process.env.BLS_PRIME_HOLDINGS_STATE_DIR = tempRoot;
  process.env.FMP_API_KEY = "stale-portfolio-test";
  process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_URL = "";
  process.env.BLS_PRIME_REMOTE_SNAPSHOT_URL = "";
  process.env.META_ALLOCATOR_REMOTE_HOLDINGS_STATE_URL = "";
  process.env.META_ALLOCATOR_REMOTE_SNAPSHOT_URL = "";
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("stale holdings must not request market history");
  };

  try {
    const result = await applyLocalPortfolioOverlay({
      portfolio: {
        analytics: {
          "Performance Method": "broker_personal_history",
          "Realized P&L": 230,
          Dividends: 70,
          "Total P&L incl. realized/dividends": 500,
          "Total return incl. dividends": 0.5,
        },
        current_mix_vs_spy: recordedHistory,
      },
    }, workspaceId);

    assert.equal(fetchCalls, 0);
    assert.equal(result.portfolio.holdings_sync_status, "stale_confirmation_required");
    assert.deepEqual(result.portfolio.current_mix_vs_spy, recordedHistory);
    assert.equal(result.portfolio.performance_report.status, "stale_confirmation_required");
    assert.equal(result.portfolio.performance_report.personalHeadline.available, false);
    assert.equal(result.portfolio.performance_report.personalHeadline.pnlUsd, null);
    assert.equal(result.portfolio.performance_report.personalHeadline.returnValue, null);
    assert.equal(result.portfolio.performance_report.reconstructed, null);
    assert.equal(result.portfolio.performance_report.backcast, null);
    assert.equal("Unrealized P&L" in result.portfolio.analytics, false);
    assert.equal("Unrealized Return" in result.portfolio.analytics, false);
    assert.equal("Total P&L incl. realized/dividends" in result.portfolio.analytics, false);
    assert.equal("Total return incl. dividends" in result.portfolio.analytics, false);

    const cachedBackcast = [
      { date: "2025-01-01", portfolio_growth: 1, spy_growth: 1, performance_method: "current_weight_backcast" },
      { date: "2025-06-01", portfolio_growth: 1.4, spy_growth: 1.04, performance_method: "current_weight_backcast" },
    ];
    const backcastResult = await applyLocalPortfolioOverlay({
      portfolio: {
        analytics: { "Performance Method": "current_weight_backcast" },
        current_mix_vs_spy: cachedBackcast,
      },
    }, workspaceId);

    assert.equal(fetchCalls, 0);
    assert.deepEqual(backcastResult.portfolio.current_mix_vs_spy, []);
    assert.equal(backcastResult.portfolio.performance_report.backcast, null);
  } finally {
    globalThis.fetch = previousFetch;
    if (previous.fallback === undefined) delete process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK;
    else process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK = previous.fallback;
    if (previous.stateDir === undefined) delete process.env.BLS_PRIME_HOLDINGS_STATE_DIR;
    else process.env.BLS_PRIME_HOLDINGS_STATE_DIR = previous.stateDir;
    if (previous.fmp === undefined) delete process.env.FMP_API_KEY;
    else process.env.FMP_API_KEY = previous.fmp;
    if (previous.remoteState === undefined) delete process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_URL;
    else process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_URL = previous.remoteState;
    if (previous.remoteSnapshot === undefined) delete process.env.BLS_PRIME_REMOTE_SNAPSHOT_URL;
    else process.env.BLS_PRIME_REMOTE_SNAPSHOT_URL = previous.remoteSnapshot;
    if (previous.allocatorRemoteState === undefined) delete process.env.META_ALLOCATOR_REMOTE_HOLDINGS_STATE_URL;
    else process.env.META_ALLOCATOR_REMOTE_HOLDINGS_STATE_URL = previous.allocatorRemoteState;
    if (previous.allocatorRemoteSnapshot === undefined) delete process.env.META_ALLOCATOR_REMOTE_SNAPSHOT_URL;
    else process.env.META_ALLOCATOR_REMOTE_SNAPSHOT_URL = previous.allocatorRemoteSnapshot;
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("a full portfolio replacement cannot inherit performance from the previous backend book", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "blsprime-portfolio-replacement-"));
  const workspaceId = `replacement-${Date.now()}`;
  const previous = {
    fallback: process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK,
    stateDir: process.env.BLS_PRIME_HOLDINGS_STATE_DIR,
    fmp: process.env.FMP_API_KEY,
    remoteState: process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_URL,
    remoteSnapshot: process.env.BLS_PRIME_REMOTE_SNAPSHOT_URL,
  };
  const previousFetch = globalThis.fetch;
  const previousBookHistory = [
    { date: "2025-01-01", portfolio_growth: 1, spy_growth: 1, performance_method: "twr_external_flow_adjusted" },
    { date: "2025-12-31", portfolio_growth: 1.9, spy_growth: 1.1, performance_method: "twr_external_flow_adjusted" },
  ];
  const backendSnapshot = {
    generated_at: new Date().toISOString(),
    screener: {
      rows: [
        { ticker: "OLD", is_current_holding: true },
        { ticker: "NEW", is_current_holding: false },
      ],
    },
    portfolio: {
      analytics: {
        "Performance Method": "broker_personal_history",
        "Realized P&L": 7_000,
        Dividends: 2_000,
        "Total P&L incl. realized/dividends": 9_000,
        "Total return incl. dividends": 0.9,
      },
      current_mix_vs_spy: previousBookHistory,
      transactions: [{ ticker: "OLD", action: "Buy" }],
      transaction_log: [{ ticker: "OLD", action: "Buy" }],
      activity: [{ ticker: "OLD", action: "Buy" }],
      return_horizons: [{ horizon: "1Y", value: 0.9 }],
      simulation_rank: [{ ticker: "OLD", rank: 1 }],
    },
  };

  process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK = "true";
  process.env.BLS_PRIME_HOLDINGS_STATE_DIR = tempRoot;
  process.env.FMP_API_KEY = "replacement-test";
  process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_URL = "";
  process.env.BLS_PRIME_REMOTE_SNAPSHOT_URL = "";
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/stable/quote")) {
      return { ok: true, status: 200, async json() { return [{ price: 150 }]; } };
    }
    const symbol = url.searchParams.get("symbol");
    const closes = symbol === "NEW" ? [100, 125, 150] : [100, 105, 110];
    return {
      ok: true,
      status: 200,
      async json() {
        return closes.map((close, index) => ({ date: `2026-01-0${index + 1}`, close }));
      },
    };
  };

  try {
    await updateHoldingsFromInstruction(backendSnapshot, workspaceId, {
      replacePortfolio: true,
      holdings: [{
        ticker: "NEW",
        quantity: 10,
        avgCostUsd: 100,
        currentPriceUsd: 150,
        purchaseDate: "2026-01-01",
      }],
    });
    const savedState = JSON.parse(await readFile(
      join(tempRoot, workspaceId, "holdings_state.json"),
      "utf8",
    ));
    const result = await applyLocalPortfolioOverlay(backendSnapshot, workspaceId);

    assert.ok(Number.isFinite(Date.parse(savedState.portfolio_generation_started_at)));
    assert.deepEqual(result.portfolio.current_mix_vs_spy, []);
    assert.deepEqual(result.portfolio.transactions, []);
    assert.deepEqual(result.portfolio.transaction_log, []);
    assert.deepEqual(result.portfolio.activity, []);
    assert.deepEqual(result.portfolio.return_horizons, []);
    assert.deepEqual(result.portfolio.simulation_rank, []);
    assert.equal(result.screener.rows.find((row) => row.ticker === "OLD").is_current_holding, false);
    assert.equal(result.screener.rows.find((row) => row.ticker === "NEW").is_current_holding, true);
    assert.equal(result.portfolio.analytics["Realized P&L"], undefined);
    assert.equal(result.portfolio.analytics.Dividends, undefined);
    assert.equal(result.portfolio.analytics["Total P&L incl. realized/dividends"], undefined);
    assert.notEqual(result.portfolio.performance_report.personalHeadline.method, "actual_portfolio");
    assert.notEqual(result.portfolio.performance_report.personalHeadline.pnlUsd, 9_000);
    assert.equal(result.portfolio.performance_report.personalHeadline.pnlUsd, 500);

    await updateHoldingsFromInstruction(backendSnapshot, workspaceId, {
      ticker: "NEW",
      quantity: 12,
      currentPrice: 150,
      avgCostUsd: 100,
      purchaseDate: "2026-01-01",
    });
    const editedState = JSON.parse(await readFile(
      join(tempRoot, workspaceId, "holdings_state.json"),
      "utf8",
    ));
    assert.equal(
      editedState.portfolio_generation_started_at,
      savedState.portfolio_generation_started_at,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previous.fallback === undefined) delete process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK;
    else process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK = previous.fallback;
    if (previous.stateDir === undefined) delete process.env.BLS_PRIME_HOLDINGS_STATE_DIR;
    else process.env.BLS_PRIME_HOLDINGS_STATE_DIR = previous.stateDir;
    if (previous.fmp === undefined) delete process.env.FMP_API_KEY;
    else process.env.FMP_API_KEY = previous.fmp;
    if (previous.remoteState === undefined) delete process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_URL;
    else process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_URL = previous.remoteState;
    if (previous.remoteSnapshot === undefined) delete process.env.BLS_PRIME_REMOTE_SNAPSHOT_URL;
    else process.env.BLS_PRIME_REMOTE_SNAPSHOT_URL = previous.remoteSnapshot;
    await rm(tempRoot, { recursive: true, force: true });
  }
});
