import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkspaceSignalOverview,
  confirmedSignalStateChange,
  isSignalIntelligenceEnabled,
  normalizeMarketStateRun,
} from "../lib/server/signal-intelligence.js";

function run(overrides = {}) {
  return normalizeMarketStateRun({
    id: overrides.id || "run-1",
    as_of_date: overrides.asOfDate || "2026-08-01",
    status: overrides.status || "ready",
    payload: {
      schemaVersion: "market-state.v1",
      subject: { type: "asset", key: overrides.assetKey || "SPY", assetClass: "etf" },
      asOfDate: overrides.asOfDate || "2026-08-01",
      availableAt: "2026-08-02T00:00:00Z",
      status: overrides.status || "ready",
      state: overrides.state || "trend_up",
      technicalReady: true,
      families: overrides.families || [
        { key: "trend", state: "bullish", direction: 1, available: true, evidenceLevel: "strong", votes: [], evidence: { emaSpreadAtr: 0.4, pineSource: "hidden" } },
        { key: "structure", state: "breakout_up", direction: 1, available: true, evidenceLevel: "moderate", votes: [] },
      ],
      disagreements: overrides.disagreements || [],
      dataQuality: { coveragePct: 1, barCount: 750, rightsApproved: true },
      receipt: { engineVersion: "signal-genome.v1", inputFingerprint: "abc", pineSource: "must-not-leak" },
    },
  });
}

test("normalizes a run and strips unapproved source fields and master scores", () => {
  const normalized = run();

  assert.equal(normalized.runId, "run-1");
  assert.equal(normalized.state, "trend_up");
  assert.equal(normalized.receipt.engineVersion, "signal-genome.v1");
  assert.equal(normalized.receipt.pineSource, undefined);
  assert.equal(normalized.families[0].evidence.pineSource, undefined);
  assert.equal(normalized.dataQuality.pineSource, undefined);
  assert.equal(normalized.score, undefined);
});

test("workspace overview exposes state breadth and exposure without collapsing to a score", () => {
  const overview = buildWorkspaceSignalOverview({
    runs: [run({ assetKey: "SPY", state: "trend_up" }), run({ assetKey: "QQQ", state: "range" })],
    holdings: [{ ticker: "SPY", marketValue: 800 }],
    watchlist: [{ symbol: "QQQ" }],
    openDecisions: [],
  });

  assert.equal(overview.status, "ready");
  assert.equal(overview.coverage.totalAssets, 2);
  assert.equal(overview.coverage.coveredAssets, 2);
  assert.equal(overview.breadth.trend_up, 1);
  assert.equal(overview.breadth.range, 1);
  assert.equal(overview.exposure.trend_up, 1);
  assert.equal(overview.score, undefined);
});

test("confirmed state change requires two consecutive closes and an older different state", () => {
  assert.equal(
    confirmedSignalStateChange([
      run({ id: "r3", asOfDate: "2026-08-03", state: "trend_up" }),
      run({ id: "r2", asOfDate: "2026-08-02", state: "trend_up" }),
      run({ id: "r1", asOfDate: "2026-08-01", state: "range" }),
    ]).confirmed,
    true,
  );
  assert.equal(
    confirmedSignalStateChange([
      run({ id: "r2", asOfDate: "2026-08-02", state: "trend_up" }),
      run({ id: "r1", asOfDate: "2026-08-01", state: "range" }),
    ]).confirmed,
    false,
  );
});

test("feature flag is fail-closed unless global flag and workspace allowlist both match", () => {
  const original = {
    enabled: process.env.BLS_SIGNAL_INTELLIGENCE_ENABLED,
    workspaces: process.env.BLS_SIGNAL_BETA_WORKSPACE_IDS,
  };
  process.env.BLS_SIGNAL_INTELLIGENCE_ENABLED = "true";
  process.env.BLS_SIGNAL_BETA_WORKSPACE_IDS = "alpha, beta";
  try {
    assert.equal(isSignalIntelligenceEnabled("alpha"), true);
    assert.equal(isSignalIntelligenceEnabled("gamma"), false);
  } finally {
    if (original.enabled === undefined) delete process.env.BLS_SIGNAL_INTELLIGENCE_ENABLED;
    else process.env.BLS_SIGNAL_INTELLIGENCE_ENABLED = original.enabled;
    if (original.workspaces === undefined) delete process.env.BLS_SIGNAL_BETA_WORKSPACE_IDS;
    else process.env.BLS_SIGNAL_BETA_WORKSPACE_IDS = original.workspaces;
  }
});
