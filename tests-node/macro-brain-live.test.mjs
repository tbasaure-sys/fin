import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadMacroBrainSnapshot, normalizeMacroBrainPayload } from "../lib/server/macro-brain.js";

const rawMacroBrain = {
  generated_on: "2026-06-18T11:00:00.000Z",
  run_date: "2026-06-18",
  model_version: "MACRO_BRAIN_TEST",
  observations: 12,
  series_count: 3,
  impulse_changes: [
    { series_id: "GC=F", impulse_sign: -1, impulse_z: -1.9, label: "Gold futures" },
    { series_id: "LQD", impulse_sign: 1, impulse_z: 0.8, label: "Investment grade ETF" },
  ],
  liquidity: {
    status: "available",
    summary: "Liquidity test summary.",
    components: {
      us_net_liquidity_ex_rrp: { impulse: -10, impulse_direction: "negative" },
      WALCL: { label: "Fed balance sheet", impulse: -2 },
    },
  },
  theses: [
    {
      thesis_id: "T1",
      title: "USD fuerte vs LatAm FX",
      license_state: "CONDITIONAL",
      confidence: 0.62,
      amb_display: 0.5,
      confirmations: 1,
      neutrals: 1,
      contradictions: 2,
      invalidation: ["DXY keeps falling."],
      market_expression: "Long DXY",
    },
    {
      thesis_id: "T2",
      title: "Cobre piso estructural",
      license_state: "LICENSED",
      confidence: 0.55,
      amb_display: 0.25,
      confirmations: 2,
      neutrals: 0,
      contradictions: 0,
      invalidation: ["Copper impulse turns down."],
      market_expression: "Long copper",
    },
  ],
  defeater_calendar: [
    { release: "US CPI", timing: "next release", license_value: 3.5 },
  ],
  psm: {
    status: "NO_PSM_ALERT",
    metrics: {
      rho_q50: 0.35,
      rho_q05: 0.31,
      rho_q95: 0.39,
      amb_upper: 0.07,
    },
    dominant_mode: {
      dxy_log_return: -0.2,
      copper_log_return: 0.4,
    },
  },
  question_of_day: "What would change your mind?",
};

test("normalizeMacroBrainPayload turns raw engine output into workspace copy", () => {
  const snapshot = normalizeMacroBrainPayload(rawMacroBrain, {
    path: "macro_brain_latest.json",
    status: "Leído ahora desde prueba.",
  });

  assert.equal(snapshot.live, true);
  assert.equal(snapshot.runDate, "2026-06-18");
  assert.equal(snapshot.observations, 12);
  assert.equal(snapshot.seriesCount, 3);
  assert.equal(snapshot.impulseChanges[0].label, "Oro");
  assert.equal(snapshot.impulseChanges[0].plain, "más débil");
  assert.equal(snapshot.theses[0].state, "watch");
  assert.equal(snapshot.theses[1].state, "open");
  assert.equal(snapshot.nextChecks[0].event, "IPC EE.UU.");
  assert.equal(snapshot.stability.status, "Tranquilo");
  assert.match(snapshot.shortRead, /tesis abiertas/);
});

test("loadMacroBrainSnapshot reads the latest JSON file when configured", async () => {
  const dir = await mkdir(path.join(os.tmpdir(), `macro-brain-${Date.now()}`), { recursive: true });
  const filePath = path.join(dir, "macro_brain_latest.json");

  try {
    await writeFile(filePath, JSON.stringify(rawMacroBrain), "utf8");
    const snapshot = await loadMacroBrainSnapshot({ sourcePath: filePath, throwOnError: true });
    assert.equal(snapshot.live, true);
    assert.equal(snapshot.sourcePath, filePath);
    assert.equal(snapshot.dataStatus, "Leído ahora desde la última corrida local.");
    assert.equal(snapshot.ledger.question, "What would change your mind?");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadMacroBrainSnapshot uses the deployable public snapshot before external workstation paths", async () => {
  const snapshot = await loadMacroBrainSnapshot({ throwOnError: true });
  assert.match(snapshot.sourcePath.replace(/\\/g, "/"), /public\/data\/macro_brain_latest\.json$/);
  assert.equal(snapshot.live, true);
});
