import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHistoryPerformanceMetrics,
  buildHistorySeries,
} from "../lib/server/private-portfolio.js";

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
