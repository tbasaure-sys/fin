import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDiffusionMarketSimulation,
  buildDiffusionMarketSimulationAsync,
} from "../lib/server/diffusion-market-simulator.js";

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

const bankCoveredDashboard = {
  workspace_summary: { id: "bank-covered-workspace" },
  modules: {
    portfolio: {
      holdings: [
        { ticker: "AMD", sector: "Information Technology", weightValue: 0.4, riskScore: 4 },
        { ticker: "MSFT", sector: "Information Technology", weightValue: 0.35, riskScore: 3 },
        { ticker: "GOOGL", sector: "Communication Services", weightValue: 0.25, riskScore: 3 },
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
  assert.equal(result.inputSources.realReturnData, false);
  assert.equal(result.inputSources.covarianceSource, "limited_history_structural_fallback");
  assert.equal(result.universe.length, 3);
  assert.ok(result.risk.var5 < 0);
  assert.ok(result.risk.cvar5 <= result.risk.var5);
  assert.equal(result.validation.historicalReplay.coverageLabel, "3/3");
  assert.equal(result.validation.historicalReplay.methodologyValidated, true);
  assert.equal(result.validation.historicalReplay.methodologyStatus, "stress_refit_validated");
  assert.equal(result.validation.baselineComparison.championModel, "fhs_v9_stress");
  assert.equal(result.validation.baselineComparison.sameStackChampion, false);
  assert.equal(result.validation.baselineComparison.stressEngineChampion, true);
  assert.equal(result.validation.baselineComparison.ddpmResearchChampion, false);
  assert.ok(result.validation.baselineComparison.stressVsSameStackMmdRatio < 1);
  assert.equal(result.validation.baselineComparison.readyForEndpoint, true);
  assert.equal(result.validation.baselineComparison.readyForStressEndpoint, true);
  assert.ok(result.diagnostics.correlationFidelity > 0.75);
  assert.ok(result.tailContributors.length > 0);
  assert.equal(result.scenarioBankOverlay.servedAsPrimary, false);
  assert.equal(result.scenarioBankOverlay.role, "fhs_v9_stress_served_primary_when_covered");
  assert.equal(result.deployment.status, "v9_7_fhs_factor_stress_engine_with_conditional_var");
  assert.equal(result.deployment.researchChampion, false);
  assert.equal(result.deployment.ddpmResearchChampion, false);
  assert.equal(result.deployment.sameStackChampion, false);
  assert.equal(result.deployment.stressEngineChampion, true);
  assert.equal(result.deployment.readyForEndpoint, true);
  assert.equal(result.deployment.readyForStressEndpoint, true);
  assert.equal(result.deployment.runtime.servedEngine, "fhs_v9_stress_factor_bank_projection");
  assert.equal(result.deployment.runtime.trainedCheckpointServed, false);
  assert.equal(result.deployment.requestPolicy.policyApplied, "aggregated_to_minimum");
});

test("scenario bank serves matched v9 bank tickers as the primary stress engine", () => {
  const result = buildDiffusionMarketSimulation(bankCoveredDashboard, {
    regime: "crisis",
    nScenarios: 300,
    horizonDays: 20,
    seed: "bank-overlay",
  });

  assert.equal(result.scenarioBankOverlay.available, true);
  assert.equal(result.scenarioBankOverlay.status, "available");
  assert.equal(result.scenarioBankOverlay.servedAsPrimary, true);
  assert.equal(result.scenarioBankOverlay.returnSet, "stress");
  assert.equal(result.scenarioBankOverlay.sourceRunId, "fhs_v9_7_run_20260703_023947");
  assert.equal(result.scenarioBankOverlay.scenarioCount, 5000);
  assert.equal(result.scenarioBankOverlay.matchedWeightCoverage, 1);
  assert.deepEqual(result.scenarioBankOverlay.missingAssets, []);
  assert.ok(result.scenarioBankOverlay.risk.var5 < 0);
  assert.ok(result.scenarioBankOverlay.risk.cvar5 <= result.scenarioBankOverlay.risk.var5);
  assert.ok(result.scenarioBankOverlay.tailContributors.length > 0);
  assert.equal(result.inputSources.scenarioBankOverlay.available, true);
  assert.equal(result.inputSources.scenarioBankOverlay.servedAsPrimary, true);
  assert.equal(result.diagnostics.sampler, "v9 PIT FHS factor scenario bank projection");
});

function buildSyntheticPriceHistory() {
  const rows = { ASML: [], MSFT: [], SGOV: [] };
  let asml = 100;
  let msft = 90;
  let sgov = 100;
  for (let i = 0; i < 140; i += 1) {
    const date = new Date(Date.UTC(2024, 0, 2 + i)).toISOString().slice(0, 10);
    const market = Math.sin(i / 7) * 0.006 + Math.cos(i / 11) * 0.003;
    const semis = market + Math.sin(i / 5) * 0.004;
    const software = market * 0.82 + Math.cos(i / 6) * 0.003;
    const cash = 0.00012 + Math.sin(i / 17) * 0.00018;
    asml *= 1 + semis;
    msft *= 1 + software;
    sgov *= 1 + cash;
    rows.ASML.push({ date, close: asml });
    rows.MSFT.push({ date, close: msft });
    rows.SGOV.push({ date, close: sgov });
  }
  return rows;
}

test("market simulator can ground covariance and volatility in historical price returns", () => {
  const result = buildDiffusionMarketSimulation(dashboard, {
    regime: "crisis",
    nScenarios: 300,
    horizonDays: 20,
    seed: "historical-covariance",
    priceHistory: buildSyntheticPriceHistory(),
  });

  assert.equal(result.inputSources.correlationSource, "provided_historical_prices");
  assert.equal(result.inputSources.realReturnData, true);
  assert.equal(result.inputSources.covarianceSource, "estimated_from_daily_return_history");
  assert.equal(result.inputSources.realPairCount, 3);
  assert.equal(result.inputSources.fallbackPairCount, 0);
  assert.deepEqual(result.inputSources.limitedHistoryTickers, []);
  assert.ok(result.inputSources.historyCoverage > 0.99);
  assert.equal(result.universe.every((row) => row.volSource === "provided_historical_prices"), true);
  assert.equal(result.universe.every((row) => row.historyRows >= 100), true);
  assert.equal(result.warnings.some((warning) => warning.includes("Real-return covariance was unavailable")), false);
});

test("market simulator bounds non-PSD covariance fallback outputs", () => {
  const historicalReturnModel = {
    source: "test_bad_covariance",
    matrix: [
      [1, 0.95, -0.95],
      [0.95, 1, 0.95],
      [-0.95, 0.95, 1],
    ],
    assetStats: new Map([
      ["ASML", { sufficient: true, rows: 120, dailyVol: 0.09, dailyMean: 0 }],
      ["MSFT", { sufficient: true, rows: 120, dailyVol: 0.09, dailyMean: 0 }],
      ["SGOV", { sufficient: true, rows: 120, dailyVol: 0.09, dailyMean: 0 }],
    ]),
    sufficientAssets: 3,
    includedAssets: 3,
    realPairCount: 3,
    fallbackPairCount: 0,
    limitedHistoryTickers: [],
    coverageRatio: 1,
  };

  const result = buildDiffusionMarketSimulation(dashboard, {
    regime: "crisis",
    nScenarios: 300,
    horizonDays: 20,
    seed: "bad-covariance",
    historicalReturnModel,
  });

  assert.equal(Number.isFinite(result.risk.cvar5), true);
  assert.equal(Number.isFinite(result.risk.worstReturn), true);
  assert.ok(result.risk.cvar5 >= -0.95);
  assert.ok(result.risk.worstReturn >= -0.95);
  assert.ok(result.risk.worstReturn <= 2.5);
  assert.equal(result.tailContributors.every((row) => Number.isFinite(row.contribution)), true);
  assert.equal(result.samplePaths.every((path) => Number.isFinite(path.portfolioReturn)), true);
  assert.equal(result.samplePaths.every((path) => path.cumulativePath.every((value) => Number.isFinite(value) && value >= -0.95 && value <= 2.5)), true);
});

test("async builder uses provided history without requiring network", async () => {
  const result = await buildDiffusionMarketSimulationAsync(dashboard, {
    regime: "baseline",
    nScenarios: 250,
    horizonDays: 20,
    seed: "async-provided-history",
    priceHistory: buildSyntheticPriceHistory(),
  });

  assert.equal(result.inputSources.correlationSource, "provided_historical_prices");
  assert.equal(result.inputSources.realReturnData, true);
  assert.equal(result.model.nScenarios, 2000);
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

test("non-stress requests are aggregated to the v9 minimum without stress book", () => {
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
  assert.equal(result.deployment.scorecard.ready_for_stress_endpoint, true);
  assert.equal(result.deployment.scorecard.research_champion, false);
  assert.equal(result.deployment.scorecard.ddpm_research_champion, false);
  assert.equal(result.deployment.scorecard.same_stack_champion, false);
  assert.equal(result.deployment.scorecard.stress_engine_champion, true);
});
