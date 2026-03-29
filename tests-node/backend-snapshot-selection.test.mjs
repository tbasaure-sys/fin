import test from "node:test";
import assert from "node:assert/strict";

import { selectBackendSnapshot } from "../lib/server/backend-snapshot.js";

const operationalConfig = {
  snapshot: {
    maxAgeHours: 168,
    maxQuoteStaleDaysWithoutPortfolio: 3,
    maxAgeHoursWithoutQuotes: 36,
  },
};

test("selectBackendSnapshot ignores persisted snapshots by default when live data is unavailable", () => {
  const persistedSnapshot = {
    generated_at: "2026-03-28T12:00:00.000Z",
    overview: { recommended_action: "beta_040" },
    portfolio: { holdings: [{ ticker: "AAPL", weight: 0.5 }] },
    screener: { rows: [] },
    status: { warnings: [], panels: [] },
    risk: {},
  };

  const snapshot = selectBackendSnapshot({
    liveError: new Error("Backend GET /api/snapshot request failed at https://example.com: fetch failed"),
    persistedSnapshot,
    allowPersistedFallback: false,
    operationalConfig,
  });

  assert.equal(snapshot.generated_at, null);
  assert.match(snapshot.status.warnings[0], /Live backend unavailable/i);
});

test("selectBackendSnapshot can still opt into a persisted snapshot fallback", () => {
  const persistedSnapshot = {
    generated_at: "2026-03-28T12:00:00.000Z",
    overview: { recommended_action: "beta_040" },
    portfolio: {
      holdings: [{ ticker: "AAPL", weight: 0.5 }],
      quotes_as_of: "2026-03-28T12:00:00.000Z",
      quotes_stale_days: 0,
    },
    screener: { rows: [] },
    status: { warnings: [], panels: [] },
    risk: {},
  };

  const snapshot = selectBackendSnapshot({
    liveError: new Error("Backend GET /api/snapshot request failed at https://example.com: fetch failed"),
    persistedSnapshot,
    allowPersistedFallback: true,
    operationalConfig,
  });

  assert.equal(snapshot.generated_at, "2026-03-28T12:00:00.000Z");
  assert.equal(snapshot.overview.recommended_action, "beta_040");
});

test("selectBackendSnapshot ignores stale live snapshots instead of treating them as current", () => {
  const staleLiveSnapshot = {
    generated_at: "2026-03-18T23:50:14.910193+00:00",
    overview: { recommended_action: "beta_040" },
    portfolio: {},
    screener: { rows: [] },
    status: { warnings: [], panels: [] },
    risk: {},
  };

  const snapshot = selectBackendSnapshot({ liveSnapshot: staleLiveSnapshot, operationalConfig });

  assert.equal(snapshot.generated_at, null);
  assert.match(snapshot.status.warnings[0], /Live snapshot is stale: generated_at/i);
});
