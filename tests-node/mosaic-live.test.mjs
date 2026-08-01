import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { contextualizeMosaicSnapshot, loadMosaicSnapshot, normalizeMosaicPayload } from "../lib/server/mosaic-observatory.js";

const rawMosaic = {
  schema_version: "mosaic.embed.v1",
  generated_at: "2026-06-21T10:00:00.000Z",
  source_mode: "live_fred",
  global_disequilibrium_index: 42,
  conflict_index: 71,
  source_summary: {
    series: "12 series used, 0 manual, 1 warming, 0 watch errors.",
    freshness: "Newest 2026-06-20; oldest used source age 12 days.",
    providers: [{ name: "FRED", kind: "official database", url: "https://fred.stlouisfed.org/", used_series: 8, warming_series: 0, latest_date: "2026-06-20" }],
    open_gaps: [{ market: "grid transformers", score: 69, missing_layer: "Lead times", next_connector: "Utility procurement notices" }],
  },
  source_health: {
    used_series: 12,
    ok_series: 11,
    error_series: 1,
    watched_series: 14,
    watched_ok_series: 12,
    watched_warming_series: 1,
    watched_error_series: 1,
    unused_error_series: ["BROKEN_SERIES"],
    manual_series: 0,
    newest_date: "2026-06-20",
    oldest_age_days: 12,
  },
  history_delta: { previous_gdi: 39, current_gdi: 42, delta: 3, direction: "up" },
  market_movers: [
    { market_id: "global_power_transformers", item: "grid transformers", score: 69, delta: 4, direction: "up", reading: "Shortage probable" },
  ],
  markets: [
    {
      market_id: "global_power_transformers",
      region: "Global",
      sector: "power",
      link: "equipment",
      item: "grid transformers",
      score: 69,
      reading: "Shortage probable",
      state: "shortage",
      conflict: "aligned",
      why: "prices are moving faster; offset by demand is slowing.",
      data_quality: 89,
      data_note: "One source is lagged.",
      use_with_caution: true,
      research_angle: "Electrical equipment and utilities capex.",
      top_positive_driver: "capacity_tightness",
      top_negative_driver: "demand_slowdown",
      source_series: ["ORDERS", "CAPACITY", "INVENTORY"],
      driver_contributions: {
        inventory_drawdown: 18,
        delivery_stress: 14,
        capacity_tightness: 25,
        demand_slowdown: -9,
      },
      source_coverage: {
        connected_series: 10,
        connected_layers: ["capacity", "demand"],
        missing_layer: "Lead times",
        next_connector: "Utility procurement notices",
      },
    },
  ],
  next_actions: [
    { kind: "research", market_id: "global_power_transformers", title: "Inspect transformers", reason: "Pressure is rising.", priority: "high" },
  ],
};

test("normalizeMosaicPayload turns embed payload into workspace snapshot", () => {
  const snapshot = normalizeMosaicPayload(
    rawMosaic,
    { path: "mosaic_embed.json" },
    { now: "2026-06-22T12:00:00.000Z" },
  );
  assert.equal(snapshot.live, true);
  assert.equal(snapshot.index, 42);
  assert.equal(snapshot.conflict, 71);
  assert.equal(snapshot.markets[0].name, "Equipos clave de red eléctrica");
  assert.equal(snapshot.markets[0].reading, "Escasez probable");
  assert.equal(snapshot.providers[0].name, "FRED");
  assert.equal(snapshot.context.version, "mosaic_context_v2");
  assert.ok(snapshot.context.markets[0].axes.supply > 0);
  assert.ok(snapshot.context.markets[0].axes.demand < 0);
  assert.deepEqual(snapshot.markets[0].axes, snapshot.context.markets[0].axes);
  assert.equal(snapshot.gaps[0].market, "Equipos clave de red eléctrica");
});

test("normalizeMosaicPayload preserves the evidence needed by the full workspace", () => {
  const snapshot = normalizeMosaicPayload(
    rawMosaic,
    { path: "mosaic_embed.json" },
    { now: "2026-06-22T12:00:00.000Z" },
  );

  assert.deepEqual(snapshot.historyDelta, {
    previous: 39,
    current: 42,
    delta: 3,
    direction: "up",
  });
  assert.equal(snapshot.movers[0].name, "Equipos clave de red eléctrica");
  assert.equal(snapshot.movers[0].delta, 4);
  assert.equal(snapshot.sourceHealth.watchedError, 1);
  assert.deepEqual(snapshot.sourceHealth.unusedErrors, ["BROKEN_SERIES"]);
  assert.equal(snapshot.providers[0].kind, "official database");
  assert.equal(snapshot.providers[0].url, "https://fred.stlouisfed.org/");
  assert.equal(snapshot.gaps[0].nextConnector, "Utility procurement notices");
  assert.equal(snapshot.actions[0].marketId, "global_power_transformers");

  const market = snapshot.markets[0];
  assert.equal(market.region, "Global");
  assert.equal(market.sector, "power");
  assert.equal(market.link, "equipment");
  assert.equal(market.state, "shortage");
  assert.equal(market.conflict, "aligned");
  assert.equal(market.dataNote, "One source is lagged.");
  assert.equal(market.useWithCaution, true);
  assert.equal(market.researchAngle, "Electrical equipment and utilities capex.");
  assert.equal(market.topPositiveDriver, "capacity_tightness");
  assert.equal(market.topNegativeDriver, "demand_slowdown");
  assert.equal(market.coverage.nextConnector, "Utility procurement notices");
  assert.deepEqual(market.drivers[0], { id: "capacity_tightness", value: 25 });
});

test("loadMosaicSnapshot reads a configured live embed file", async () => {
  const dir = await mkdir(path.join(os.tmpdir(), `mosaic-live-${Date.now()}`), { recursive: true });
  const filePath = path.join(dir, "mosaic_embed.json");

  try {
    await writeFile(filePath, JSON.stringify(rawMosaic), "utf8");
    const snapshot = await loadMosaicSnapshot({ sourcePath: filePath, throwOnError: true });
    assert.equal(snapshot.live, false);
    assert.equal(snapshot.dataState, "stale");
    assert.equal(snapshot.sourcePath, filePath);
    assert.equal(snapshot.dataStatus, "Leído ahora desde el último embed local.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadMosaicSnapshot uses the deployable public snapshot before external workstation paths", async () => {
  const snapshot = await loadMosaicSnapshot({ throwOnError: true });
  assert.match(snapshot.sourcePath.replace(/\\/g, "/"), /public\/data\/mosaic_embed\.json$/);
  assert.notEqual(snapshot.dataState, "fallback");
});

test("contextualizeMosaicSnapshot adds liquidity without collapsing it into supply or demand", () => {
  const snapshot = normalizeMosaicPayload(
    rawMosaic,
    { path: "mosaic_embed.json" },
    { now: "2026-06-22T12:00:00.000Z" },
  );
  const contextualized = contextualizeMosaicSnapshot(snapshot, {
    runDate: "2026-06-22",
    liquidity: {
      status: "Parcial",
      impulse: -0.65,
      asOf: "2026-06-22",
      sourceIds: ["WALCL", "WTREGEN", "RRPONTSYD"],
      freshness: { status: "current", ageDays: 0, usable: true },
      usable: true,
      confidence: 0.8,
    },
  }, { now: "2026-06-22T12:00:00.000Z" });

  assert.ok(contextualized.context.axes.supply > 0);
  assert.ok(contextualized.context.axes.demand < 0);
  assert.equal(contextualized.context.axes.liquidity, -65);
});

test("fresh packaging cannot make stale underlying market evidence look live", () => {
  const snapshot = normalizeMosaicPayload(
    {
      ...rawMosaic,
      generated_at: "2026-07-23T12:00:00.000Z",
      source_summary: {
        ...rawMosaic.source_summary,
        providers: rawMosaic.source_summary.providers.map((provider) => ({
          ...provider,
          latest_date: "2026-06-01",
        })),
      },
    },
    { path: "mosaic_embed.json" },
    { now: "2026-07-23T12:00:00.000Z" },
  );

  assert.equal(snapshot.context.status, "stale");
  assert.equal(snapshot.dataState, "stale");
  assert.equal(snapshot.live, false);
  assert.equal(snapshot.context.markets.length, 1);
  assert.equal(snapshot.context.markets[0].freshness.status, "stale");
  assert.equal(snapshot.context.markets[0].freshness.usable, false);
  assert.equal(snapshot.context.axes.supply, 0);
});

test("MOSAIC preserves per-market freshness when provider evidence is mixed", () => {
  const snapshot = normalizeMosaicPayload({
    ...rawMosaic,
    generated_at: "2026-07-31T23:59:00.000Z",
    source_summary: {
      ...rawMosaic.source_summary,
      providers: [
        {
          name: "Fresh provider",
          latest_date: "2026-07-31",
          source_ids: ["FRESH_ORDERS", "FRESH_CAPACITY"],
        },
        {
          name: "Stale provider",
          latest_date: "2026-05-01",
          source_ids: ["STALE_INVENTORY"],
        },
      ],
    },
    markets: [
      {
        ...rawMosaic.markets[0],
        market_id: "fresh_market",
        item: "fresh market",
        source_series: ["FRESH_ORDERS", "FRESH_CAPACITY"],
      },
      {
        ...rawMosaic.markets[0],
        market_id: "stale_market",
        item: "stale market",
        source_series: ["STALE_INVENTORY"],
      },
    ],
  }, {}, { now: "2026-08-01T12:00:00.000Z" });

  assert.equal(snapshot.context.status, "mixed");
  assert.equal(snapshot.live, true);
  assert.equal(snapshot.context.markets.length, 2);
  const fresh = snapshot.context.markets.find((market) => market.id === "fresh_market");
  const stale = snapshot.context.markets.find((market) => market.id === "stale_market");
  assert.equal(fresh.freshness.status, "current");
  assert.equal(fresh.freshness.usable, true);
  assert.equal(fresh.asOf, "2026-07-31");
  assert.deepEqual(fresh.sourceIds, ["FRESH_ORDERS", "FRESH_CAPACITY"]);
  assert.equal(fresh.evidence[0].provider, "Fresh provider");
  assert.equal(stale.freshness.status, "stale");
  assert.equal(stale.freshness.usable, false);
  assert.equal(stale.asOf, "2026-05-01");
  assert.ok(snapshot.context.axes.supply > 0);
});

test("future-dated provider evidence cannot make a MOSAIC market usable", () => {
  const snapshot = normalizeMosaicPayload({
    ...rawMosaic,
    generated_at: "2026-08-01T11:59:00.000Z",
    source_summary: {
      ...rawMosaic.source_summary,
      providers: [{
        ...rawMosaic.source_summary.providers[0],
        latest_date: "2026-08-03",
      }],
    },
  }, {}, { now: "2026-08-01T12:00:00.000Z" });

  assert.equal(snapshot.live, false);
  assert.equal(snapshot.context.status, "future");
  assert.equal(snapshot.context.markets[0].freshness.status, "future");
  assert.equal(snapshot.context.markets[0].freshness.usable, false);
  assert.equal(snapshot.context.axes.supply, 0);
});
