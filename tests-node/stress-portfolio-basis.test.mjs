import test from "node:test";
import assert from "node:assert/strict";
import { buildDiffusionMarketSimulation } from "../lib/server/diffusion-market-simulator.js";

test("stress engine flags demo fallback when no holdings are connected", () => {
  const result = buildDiffusionMarketSimulation({}, { nScenarios: 200, horizonDays: 5, useRealReturnData: false });
  assert.equal(result.inputSources.portfolioBasis, "demo_fallback");
  assert.ok(result.warnings.some((warning) => /demo portfolio/i.test(warning)));
  assert.ok(Number.isFinite(result.risk.cvar5));
});

test("stress engine marks user holdings basis and produces CVaR/VaR/drawdown outputs", () => {
  const dashboard = {
    modules: {
      portfolio: {
        holdings: [
          { ticker: "AAPL", weightValue: 0.4, sector: "Technology", riskScore: 3 },
          { ticker: "XOM", weightValue: 0.3, sector: "Energy", riskScore: 3 },
          { ticker: "TLT", weightValue: 0.3, sector: "Fixed Income", assetType: "bond", riskScore: 2 },
        ],
      },
    },
  };
  const result = buildDiffusionMarketSimulation(dashboard, { nScenarios: 300, horizonDays: 10, useRealReturnData: false });
  assert.equal(result.inputSources.portfolioBasis, "user_holdings");
  assert.equal(result.universe.length, 3);
  assert.ok(Number.isFinite(result.risk.var5));
  assert.ok(Number.isFinite(result.risk.var1));
  assert.ok(Number.isFinite(result.risk.cvar5));
  assert.ok(result.risk.cvar5 <= result.risk.var5, "CVaR must be at least as severe as VaR");
  // Drawdown probability is finite in the heuristic engine; the v9 scenario
  // bank intentionally serves it as null (labelled "-") when it is primary.
  assert.ok(
    Number.isFinite(result.risk.probabilityDrawdown10) ||
    result.inputSources.scenarioBankOverlay.servedAsPrimary === true,
  );
  assert.ok(result.tailContributors.length >= 1);
  assert.ok(!result.warnings.some((warning) => /demo portfolio/i.test(warning)));
});
