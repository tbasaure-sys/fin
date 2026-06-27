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
  assert.ok("thesis" in run.spec.weights);
  assert.ok("demandSupply" in run.spec.weights);
  assert.ok("bottleneck" in run.spec.weights);
  assert.ok(Number.isFinite(run.candidates[0].thesisZ));
  assert.ok(Number.isFinite(run.candidates[0].demandSupplyZ));
  assert.ok(Number.isFinite(run.candidates[0].bottleneckZ));
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

test("FactorLab can prioritize qualitative and bottleneck signals over accounting quality", () => {
  const run = runFactorLab({
    asof: "2026-06-24",
    universe: "global",
    topK: 3,
    minLiquidity: 0.65,
    maxResidualVol: 0.5,
    neutralizeSector: false,
    weights: {
      momentum: 0,
      quality: 0,
      value: 0,
      lowVol: 0,
      thesis: 0.45,
      demandSupply: 0.25,
      bottleneck: 0.3,
    },
  });

  assert.equal(run.ok, true);
  assert.equal(run.candidates[0].ticker, "ASML");
  assert.match(run.candidates[0].qualitativeNote, /EUV|lithography/i);
  assert.ok(run.candidates[0].bottleneckZ > 0);
});
