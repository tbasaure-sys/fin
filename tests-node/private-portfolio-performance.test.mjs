import test from "node:test";
import assert from "node:assert/strict";

import {
  applyLocalPortfolioOverlay,
  buildHistoryPerformanceMetrics,
  buildHistorySeries,
  previewHoldingsInstruction,
  signedCashLedgerExternalFlowUsd,
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
