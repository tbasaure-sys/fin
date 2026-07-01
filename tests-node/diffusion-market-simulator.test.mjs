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
  assert.equal(result.model.nScenarios, 5000);
  assert.equal(result.model.stratifiedStressBook, true);
  assert.equal(result.model.stressMultiplierCounts["1.0"], 3150);
  assert.equal(result.model.stressMultiplierCounts["6.0"], 250);
  assert.equal(result.universe.length, 3);
  assert.ok(result.risk.var5 < 0);
  assert.ok(result.risk.cvar5 <= result.risk.var5);
  assert.ok(result.diagnostics.correlationFidelity > 0.75);
  assert.ok(result.tailContributors.length > 0);
  assert.equal(result.deployment.status, "research_champion_offline_only");
  assert.equal(result.deployment.researchChampion, true);
  assert.equal(result.deployment.readyForEndpoint, false);
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

test("non-stress requests are aggregated to the v7 minimum without stress book", () => {
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
  assert.equal(result.deployment.scorecard.ready_for_endpoint, false);
  assert.equal(result.deployment.scorecard.research_champion, true);
});
