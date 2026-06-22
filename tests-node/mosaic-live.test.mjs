import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadMosaicSnapshot, normalizeMosaicPayload } from "../lib/server/mosaic-observatory.js";

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
      source_coverage: { connected_series: 10 },
    },
  ],
};

test("normalizeMosaicPayload turns embed payload into workspace snapshot", () => {
  const snapshot = normalizeMosaicPayload(rawMosaic, { path: "mosaic_embed.json" });
  assert.equal(snapshot.live, true);
  assert.equal(snapshot.index, 42);
  assert.equal(snapshot.conflict, 71);
  assert.equal(snapshot.markets[0].name, "Equipos clave de red eléctrica");
  assert.equal(snapshot.markets[0].reading, "Escasez probable");
  assert.equal(snapshot.providers[0].name, "FRED");
  assert.equal(snapshot.gaps[0].market, "Equipos clave de red eléctrica");
});

test("loadMosaicSnapshot reads a configured live embed file", async () => {
  const dir = await mkdir(path.join(os.tmpdir(), `mosaic-live-${Date.now()}`), { recursive: true });
  const filePath = path.join(dir, "mosaic_embed.json");

  try {
    await writeFile(filePath, JSON.stringify(rawMosaic), "utf8");
    const snapshot = await loadMosaicSnapshot({ sourcePath: filePath, throwOnError: true });
    assert.equal(snapshot.live, true);
    assert.equal(snapshot.sourcePath, filePath);
    assert.equal(snapshot.dataStatus, "Leído ahora desde el último embed local.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
