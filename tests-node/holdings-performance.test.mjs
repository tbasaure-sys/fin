import test from "node:test";
import assert from "node:assert/strict";
import {
  assessPerformanceInputs,
  buildCostBasisPerformance,
  reconstructPortfolioSeries,
  assessSeriesQuality,
  buildPerformanceReport,
} from "../lib/server/holdings-performance.js";

function dailySeries(startDate, closes) {
  const series = {};
  const start = Date.parse(`${startDate}T00:00:00Z`);
  closes.forEach((close, index) => {
    series[new Date(start + index * 86400000).toISOString().slice(0, 10)] = close;
  });
  return series;
}

test("assessPerformanceInputs reports honest empty state without cost or dates", () => {
  const result = assessPerformanceInputs([
    { ticker: "AAPL", quantity: 10 },
    { ticker: "MSFT", quantity: 5 },
  ]);
  assert.equal(result.status, "missing_cost_and_dates");
  assert.equal(result.readyForReconstruction, false);
  assert.ok(result.actions.length >= 1);
  assert.ok(result.actions.some((a) => a.includes("costo base")));
  assert.ok(result.actions.some((a) => a.includes("fecha de compra")));
});

test("assessPerformanceInputs is ready when cost and dates exist", () => {
  const result = assessPerformanceInputs([
    { ticker: "AAPL", quantity: 10, avg_cost_usd: 100, purchase_date: "2024-01-05" },
  ]);
  assert.equal(result.status, "ok");
  assert.equal(result.readyForReconstruction, true);
  assert.equal(result.actions.length, 0);
});

test("buildCostBasisPerformance computes return, contributions and winners/losers without snapshots", () => {
  const report = buildCostBasisPerformance([
    { ticker: "WIN", quantity: 10, avg_cost_usd: 100, market_value_usd: 1500, purchase_date: "2023-01-02" },
    { ticker: "LOSE", quantity: 10, avg_cost_usd: 100, market_value_usd: 800 },
  ]);
  assert.equal(report.trackedPositions, 2);
  assert.equal(report.totalCostUsd, 2000);
  assert.equal(report.totalPnlUsd, 300);
  assert.ok(Math.abs(report.totalReturn - 0.15) < 1e-9);
  assert.equal(report.winners[0].ticker, "WIN");
  assert.equal(report.losers[0].ticker, "LOSE");
  assert.ok(report.concentration.hhi > 0.5); // two positions, one dominant
  assert.ok(report.concentration.topWeight > 0.6);
});

test("reconstructPortfolioSeries rebuilds trajectory from purchase dates and real closes with benchmark", () => {
  const priceHistory = {
    AAA: dailySeries("2024-01-01", [100, 102, 104, 106, 108, 110, 112, 114, 116, 118]),
    SPY: dailySeries("2024-01-01", [400, 402, 404, 406, 408, 410, 412, 414, 416, 418]),
  };
  const result = reconstructPortfolioSeries({
    holdings: [{ ticker: "AAA", quantity: 10, avg_cost_usd: 100, purchase_date: "2024-01-01" }],
    priceHistory,
    benchmarkHistory: priceHistory.SPY,
  });
  assert.equal(result.status, "ok");
  assert.ok(result.series.length >= 5);
  const last = result.series[result.series.length - 1];
  assert.ok(Math.abs(last.portfolio_growth - 1.18) < 1e-9);
  assert.ok(last.spy_growth > 1.0 && last.spy_growth < 1.1);
  assert.deepEqual(result.includedTickers, ["AAA"]);
});

test("reconstructPortfolioSeries handles staggered purchases without fake performance jumps", () => {
  const priceHistory = {
    AAA: dailySeries("2024-01-01", Array.from({ length: 20 }, (_, i) => 100 + i)),
    BBB: dailySeries("2024-01-01", Array.from({ length: 20 }, (_, i) => 50)),
    SPY: dailySeries("2024-01-01", Array.from({ length: 20 }, (_, i) => 400)),
  };
  const result = reconstructPortfolioSeries({
    holdings: [
      { ticker: "AAA", quantity: 1, avg_cost_usd: 100, purchase_date: "2024-01-01" },
      { ticker: "BBB", quantity: 10, avg_cost_usd: 50, purchase_date: "2024-01-10" },
    ],
    priceHistory,
    benchmarkHistory: priceHistory.SPY,
  });
  assert.equal(result.status, "ok");
  // On the day BBB enters, invested cost rises with the purchase, so the
  // growth index must not jump upward from the deposit itself.
  const before = result.series.find((row) => row.date === "2024-01-09");
  const after = result.series.find((row) => row.date === "2024-01-10");
  assert.ok(before && after);
  assert.ok(after.portfolio_growth <= before.portfolio_growth + 0.005);
});

test("reconstructPortfolioSeries returns explicit insufficient state on missing data", () => {
  const result = reconstructPortfolioSeries({
    holdings: [{ ticker: "ZZZ", quantity: 10, avg_cost_usd: 10, purchase_date: "2024-01-01" }],
    priceHistory: {},
    benchmarkHistory: null,
  });
  assert.equal(result.status, "insufficient_inputs");
  assert.equal(result.series.length, 0);
});

test("assessSeriesQuality flags suspicious sawtooth and zero series", () => {
  const sawtooth = Array.from({ length: 30 }, (_, i) => ({
    date: `2024-01-${String((i % 27) + 1).padStart(2, "0")}`,
    portfolio_value_usd: i % 2 === 0 ? 100 : 60,
  }));
  const flagged = assessSeriesQuality(sawtooth);
  assert.equal(flagged.usable, false);
  assert.ok(flagged.issues.includes("suspicious_alternating_series"));

  const zeros = [
    { date: "2024-01-01", portfolio_value_usd: 100 },
    { date: "2024-01-02", portfolio_value_usd: 0 },
    { date: "2024-01-03", portfolio_value_usd: 100 },
  ];
  const zeroCheck = assessSeriesQuality(zeros);
  assert.equal(zeroCheck.usable, false);
  assert.ok(zeroCheck.issues.includes("zero_or_negative_values"));

  const clean = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.parse("2024-01-01T00:00:00Z") + i * 86400000).toISOString().slice(0, 10),
    portfolio_value_usd: 100 * (1 + 0.002 * i),
  }));
  assert.equal(assessSeriesQuality(clean).usable, true);
});

test("buildPerformanceReport separates current, reconstructed and twr readings", () => {
  const priceHistory = {
    AAA: dailySeries("2024-01-01", Array.from({ length: 120 }, (_, i) => 100 * (1 + 0.001 * i))),
    SPY: dailySeries("2024-01-01", Array.from({ length: 120 }, (_, i) => 400 * (1 + 0.0005 * i))),
  };
  const holdings = [{ ticker: "AAA", quantity: 10, avg_cost_usd: 100, market_value_usd: 1119, purchase_date: "2024-01-01" }];
  const reconstruction = reconstructPortfolioSeries({
    holdings,
    priceHistory,
    benchmarkHistory: priceHistory.SPY,
  });
  const report = buildPerformanceReport({ holdings, reconstruction, snapshotHistoryRows: [], twrMetrics: null });
  assert.equal(report.version, "holdings_performance_v1");
  assert.ok(report.current.totalReturn > 0.1);
  assert.ok(report.reconstructed);
  assert.equal(report.reconstructed.method, "reconstructed_holdings_history");
  assert.ok(report.reconstructed.totalReturn > 0.1);
  assert.ok(report.reconstructed.benchmarkSpread > 0);
  assert.equal(report.twrAvailable, false);
  assert.ok(report.explanation.length >= 2);
});

test("buildPerformanceReport gives empty-state actions when reconstruction is impossible", () => {
  const holdings = [{ ticker: "AAA", quantity: 10, market_value_usd: 1000 }];
  const report = buildPerformanceReport({ holdings, reconstruction: null, snapshotHistoryRows: [], twrMetrics: null });
  assert.equal(report.reconstructed, null);
  assert.equal(report.inputs.status, "missing_cost_and_dates");
  assert.ok(report.inputs.actions.length >= 1);
  assert.ok(report.explanation.some((line) => line.includes("costo base")));
});
