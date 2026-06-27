import assert from "node:assert/strict";
import test from "node:test";

import { buildFactorLabSpec, runFactorLab } from "../lib/factorlab-engine.js";

test("FactorLab builds a point-in-time candidate ranking from screen controls", () => {
  const run = runFactorLab({
    asof: "2026-06-24",
    universe: "global",
    topK: 4,
    minLiquidity: 0.65,
    maxResidualVol: 0.5,
    neutralizeSector: true,
    weights: {
      momentum: 0.4,
      quality: 0.3,
      value: 0.2,
      lowVol: 0.1,
    },
  });

  assert.equal(run.ok, true);
  assert.equal(run.accepted, true);
  assert.equal(run.candidates.length, 4);
  assert.ok(run.summary.eligible >= run.candidates.length);
  assert.ok(run.candidates[0].score >= run.candidates[1].score);
  assert.match(run.audit.join(" "), /point-in-time filters/i);
  assert.equal(run.spec.neutralizeSector, true);
});

test("FactorLab refuses a live screen that uses a future-return signal", () => {
  const run = runFactorLab({
    asof: "2026-06-24",
    topK: 5,
    includeFutureReturn: true,
  });

  assert.equal(run.ok, false);
  assert.equal(run.accepted, false);
  assert.equal(run.refusal.errorType, "LookaheadError");
  assert.match(run.refusal.message, /Future return/i);
  assert.ok(run.pipeline.some((step) => step.status === "refused"));
  assert.equal(run.candidates.length, 0);
});

test("FactorLab normalizes weights into a runnable spec", () => {
  const spec = buildFactorLabSpec({
    weights: {
      momentum: 0.8,
      quality: 0.1,
      value: 0.1,
      lowVol: 0,
    },
  });
  const total = Object.values(spec.weights).reduce((sum, value) => sum + value, 0);

  assert.equal(Number(total.toFixed(6)), 1);
  assert.ok(spec.weights.momentum > spec.weights.quality);
});
