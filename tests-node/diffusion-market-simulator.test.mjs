import test from "node:test";
import assert from "node:assert/strict";

import { buildDiffusionMarketSimulation } from "../lib/server/diffusion-market-simulator.js";

const dashboard = {
  workspace_summary: { id: "test-workspace" },
  modules: {
    portfolio: {
      holdings: [
        { ticker: "ASML", sector: "Semiconductors", weightValue: 0.4, riskScore: 4 },
        { ticker: "MSFT", sector: "Software", weightValue: 0.35, riskScore: 3 },
        { ticker: "SGOV", sector: "Cash", weightValue: 0.25, riskScore: 1 },
      ],
    },
  },
};

test("diffusion market simulator builds crisis scenarios with risk metrics", () => {
  const result = buildDiffusionMarketSimulation(dashboard, {
    regime: "crisis",
    nScenarios: 300,
    horizonDays: 20,
    guidanceScale: 1.0,
    seed: "unit-test",
  });

  assert.equal(result.status, "available");
  assert.equal(result.regime, "crisis");
  assert.match(result.version, /stress_engine/);
  assert.match(result.runId, /^stress_/);
  assert.equal(result.seed, "unit-test");
  assert.equal(result.model.nScenarios, 5000);
  assert.equal(result.model.tailIntensity, 1);
  assert.equal(result.model.stratifiedStressBook, true);
  assert.equal(result.model.stressMultiplierCounts["1.0"], 3150);
  assert.equal(result.model.stressMultiplierCounts["6.0"], 250);
  assert.equal(result.inputSources.correlationSource, "sector_heuristic_fallback");
  assert.equal(result.universe.length, 3);
  assert.ok(result.risk.var5 < 0);
  assert.ok(result.risk.cvar5 <= result.risk.var5);
  assert.equal(result.validation.historicalReplay.coverageLabel, "Floor 3/3");
  assert.equal(result.validation.historicalReplay.methodologyValidated, false);
  assert.equal(result.validation.historicalReplay.methodologyStatus, "unconditional_stress_floor");
  assert.equal(result.validation.baselineComparison.championModel, "gaussian_factor_same_calibration_stack");
  assert.equal(result.validation.baselineComparison.sameStackChampion, true);
  assert.equal(result.validation.baselineComparison.ddpmResearchChampion, false);
  assert.ok(result.validation.baselineComparison.ddpmVsChampionMmdRatio > 8);
  assert.equal(result.validation.baselineComparison.readyForEndpoint, true);
  assert.ok(result.diagnostics.correlationFidelity > 0.75);
  assert.ok(result.tailContributors.length > 0);
  assert.equal(result.deployment.status, "v8_calibrated_factor_stress_engine");
  assert.equal(result.deployment.researchChampion, false);
  assert.equal(result.deployment.ddpmResearchChampion, false);
  assert.equal(result.deployment.sameStackChampion, true);
  assert.equal(result.deployment.readyForEndpoint, true);
  assert.equal(result.deployment.runtime.servedEngine, "same_stack_gaussian_factor_stress_engine");
  assert.equal(result.deployment.runtime.trainedCheckpointServed, false);
  assert.equal(result.deployment.requestPolicy.policyApplied, "aggregated_to_minimum");
});

test("crisis regime is harsher than baseline with the same portfolio", () => {
  const baseline = buildDiffusionMarketSimulation(dashboard, {
    regime: "baseline",
    nScenarios: 300,
    horizonDays: 20,
    seed: "same-seed",
  });
  const crisis = buildDiffusionMarketSimulation(dashboard, {
    regime: "crisis",
    nScenarios: 300,
    horizonDays: 20,
    seed: "same-seed",
  });

  assert.ok(crisis.risk.cvar5 < baseline.risk.cvar5);
  assert.ok(crisis.risk.probabilityLoss >= baseline.risk.probabilityLoss);
});

test("non-stress requests are aggregated to the v8 minimum without stress book", () => {
  const result = buildDiffusionMarketSimulation(dashboard, {
    regime: "baseline",
    nScenarios: 250,
    horizonDays: 20,
    seed: "baseline-minimum",
  });

  assert.equal(result.model.nScenarios, 2000);
  assert.equal(result.model.stratifiedStressBook, false);
  assert.equal(result.deployment.requestPolicy.minimumNScenarios, 2000);
  assert.equal(result.deployment.requestPolicy.policyApplied, "aggregated_to_minimum");
  assert.equal(result.deployment.scorecard.ready_for_endpoint, true);
  assert.equal(result.deployment.scorecard.research_champion, false);
  assert.equal(result.deployment.scorecard.ddpm_research_champion, false);
  assert.equal(result.deployment.scorecard.same_stack_champion, true);
});
