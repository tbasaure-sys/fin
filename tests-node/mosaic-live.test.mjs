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
    providers: [{ name: "FRED", used_series: 8, warming_series: 0, latest_date: "2026-06-20" }],
    open_gaps: [{ market: "grid transformers", missing_layer: "Lead times" }],
  },
  markets: [
    {
      market_id: "global_power_transformers",
      item: "grid transformers",
      score: 69,
      reading: "Shortage probable",
      why: "prices are moving faster; offset by demand is slowing.",
      data_quality: 89,
      source_series: ["ORDERS", "CAPACITY", "INVENTORY"],
      driver_contributions: {
        inventory_drawdown: 18,
        delivery_stress: 14,
        capacity_tightness: 25,
        demand_slowdown: -9,
      },
      source_coverage: { connected_series: 10, connected_layers: ["capacity", "demand"] },
    },
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
    liquidity: { status: "Parcial", impulse: -0.65 },
  }, { now: "2026-06-22T12:00:00.000Z" });

  assert.ok(contextualized.context.axes.supply > 0);
  assert.ok(contextualized.context.axes.demand < 0);
  assert.equal(contextualized.context.axes.liquidity, -65);
});
