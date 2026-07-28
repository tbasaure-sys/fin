import assert from "node:assert/strict";
import test from "node:test";

import {
  PublicStressInputError,
  applyPublicStressCandidate,
  buildPublicStressDashboard,
  parsePublicStressRequest,
  summarizePublicStressSimulation,
} from "../lib/public-stress-demo.js";

test("public stress input accepts only the bounded example universe and normalizes weights", () => {
  const parsed = parsePublicStressRequest({
    holdings: [
      { ticker: "MSFT", weightPct: 35 },
      { ticker: "GOOGL", weightPct: 25 },
      { ticker: "JPM", weightPct: 20 },
      { ticker: "XOM", weightPct: 10 },
      { ticker: "SGOV", weightPct: 10 },
    ],
    candidate: { ticker: "NVDA", weightPct: 10 },
  });

  assert.deepEqual(parsed.holdings.map((row) => [row.ticker, row.weight]), [
    ["MSFT", 0.35],
    ["GOOGL", 0.25],
    ["JPM", 0.2],
    ["XOM", 0.1],
    ["SGOV", 0.1],
  ]);
  assert.deepEqual(parsed.candidate, { ticker: "NVDA", weight: 0.1 });
  assert.throws(
    () => parsePublicStressRequest({
      holdings: [
        { ticker: "MSFT", weightPct: 40 },
        { ticker: "GOOGL", weightPct: 30 },
        { ticker: "JPM", weightPct: 20 },
        { ticker: "SCAM", weightPct: 10 },
      ],
    }),
    (error) => error instanceof PublicStressInputError && error.code === "UNSUPPORTED_TICKER",
  );
});

test("adding a candidate preserves a six-position portfolio totaling 100 percent", () => {
  const parsed = parsePublicStressRequest({
    holdings: [
      { ticker: "MSFT", weightPct: 30 },
      { ticker: "GOOGL", weightPct: 25 },
      { ticker: "JPM", weightPct: 20 },
      { ticker: "XOM", weightPct: 15 },
      { ticker: "SGOV", weightPct: 10 },
    ],
    candidate: { ticker: "NVDA", weightPct: 10 },
  });

  const proposed = applyPublicStressCandidate(parsed.holdings, parsed.candidate);

  assert.equal(proposed.length, 6);
  assert.equal(Number(proposed.reduce((sum, row) => sum + row.weight, 0).toFixed(8)), 1);
  assert.equal(proposed.find((row) => row.ticker === "NVDA").weight, 0.1);
  assert.equal(proposed.find((row) => row.ticker === "MSFT").weight, 0.27);
});

test("public stress dashboard carries explicit position metadata into the real engine contract", () => {
  const parsed = parsePublicStressRequest({});
  const dashboard = buildPublicStressDashboard(parsed.holdings, "public-test");

  assert.equal(dashboard.workspace_summary.id, "public-test");
  assert.equal(dashboard.modules.portfolio.holdings.length, 5);
  assert.deepEqual(dashboard.modules.portfolio.holdings[0], {
    ticker: "MSFT",
    name: "Microsoft",
    sector: "Technology",
    assetType: "equity",
    riskScore: 3,
    weightValue: 0.28,
  });
});

test("public stress summary exposes decision metrics without leaking internal paths or deployment details", () => {
  const holdings = parsePublicStressRequest({}).holdings;
  const summary = summarizePublicStressSimulation({
    generatedAt: "2026-07-28T12:00:00.000Z",
    runId: "stress_public",
    risk: {
      cvar5: -0.24,
      cvar5Label: "-24.0%",
      var5: -0.18,
      var5Label: "-18.0%",
      probabilityLoss: 0.61,
      probabilityLossLabel: "61.0%",
      worstReturn: -0.42,
      worstReturnLabel: "-42.0%",
    },
    model: { nScenarios: 5000, horizonDays: 30 },
    scenarioBankOverlay: {
      servedAsPrimary: true,
      sourceRunId: "fhs_v9_7_run_20260703_023947",
      matchedWeightCoverage: 0.88,
      matchedWeightCoverageLabel: "88.0%",
    },
    tailContributors: [
      { ticker: "MSFT", contribution: -0.08, contributionLabel: "-8.0%", weight: 0.28 },
    ],
    samplePaths: [{ id: "must-not-leak" }],
    deployment: { runtime: { manifestPath: "secret/internal/path" } },
  }, holdings);

  assert.equal(summary.modelAsOf, "2026-07-03");
  assert.equal(summary.concentration.topTwoWeight, 0.5);
  assert.equal(summary.exposures.find((row) => row.sector === "Technology").weight, 0.28);
  assert.equal(summary.risk.cvar5, -0.24);
  assert.deepEqual(summary.tailContributors[0], {
    ticker: "MSFT",
    contribution: -0.08,
    contributionLabel: "-8.0%",
    weight: 0.28,
  });
  assert.equal("samplePaths" in summary, false);
  assert.equal("deployment" in summary, false);
  assert.doesNotMatch(JSON.stringify(summary), /secret\/internal/);
});
