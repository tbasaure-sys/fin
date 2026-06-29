import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraDashboardContract } from "../lib/aurora-dashboard-contract.js";
import { runAuroraBeliefPipeline } from "../lib/aurora-belief-pipeline.js";

const baseInput = {
  company: {
    ticker: "ASML",
    name: "ASML Holding NV",
    sector: "Technology",
    industry: "Semiconductor equipment",
  },
  market: { price: 1200, beta: 1.12 },
  macro: { riskFreeRate: 0.044, equityRiskPremium: 0.052, inflation: 0.024 },
  financials: {
    incomeStatements: [
      { date: "2021-12-31", revenue: 180, ebit: 52 },
      { date: "2022-12-31", revenue: 210, ebit: 63 },
      { date: "2023-12-31", revenue: 250, ebit: 76 },
      { date: "2024-12-31", revenue: 300, ebit: 93 },
    ],
    balanceSheets: [{ date: "2024-12-31", totalDebt: 18, totalStockholdersEquity: 285, cashAndCashEquivalents: 42 }],
    cashFlows: [{ date: "2024-12-31", operatingCashFlow: 36, capitalExpenditure: -8 }],
  },
  documents: [
    {
      type: "earnings call",
      source: "company transcript",
      text:
        "Management described multi-year demand visibility supported by backlog. The company remains capacity constrained and pricing power is strong. Internal controls were effective.",
    },
  ],
  capitalAllocationEvents: [
    { type: "repurchase", amount: 10, price: 850, intrinsicValuePerShare: 1100 },
    { type: "organic_reinvestment", amount: 22, incrementalRoiic: 0.21 },
  ],
  valuationBridge: { business: 0.16, discount: -0.04, price: 0.07 },
};

function pipeline(extra = {}) {
  return runAuroraBeliefPipeline(
    {
      ...baseInput,
      ...extra,
    },
    {
      asOfDate: "2026-01-01",
      ranAt: "2026-03-01T00:00:00.000Z",
      builtAt: "2026-03-01T00:00:00.000Z",
    },
  );
}

test("dashboard contract exposes the guide's primary panel metrics", () => {
  const result = pipeline();
  const contract = buildAuroraDashboardContract(result, { builtAt: "2026-03-01T00:00:00.000Z" });

  assert.equal(contract.version, "aurora_dashboard_contract_v1");
  assert.equal(contract.ticker, "ASML");
  assert.ok(Number.isFinite(contract.primaryPanel.valueRange.p10));
  assert.ok(Number.isFinite(contract.primaryPanel.valueRange.p50));
  assert.ok(Number.isFinite(contract.primaryPanel.valueRange.p90));
  assert.ok(Number.isFinite(contract.primaryPanel.probabilityValueBelowPrice));
  assert.ok(Number.isFinite(contract.primaryPanel.expectedIrr5y));
  assert.ok(Number.isFinite(contract.primaryPanel.probabilityNegativeIrr));
  assert.ok(Number.isFinite(contract.primaryPanel.marketImpliedRevenueCagr));
  assert.ok(Number.isFinite(contract.primaryPanel.marketImpliedTerminalMargin));
  assert.ok(contract.primaryPanel.dominantDrivers.length >= 1);
  assert.ok(["high", "medium", "low", "insufficient", "unknown", "decision_grade", "research_grade", "memo_only"].includes(contract.primaryPanel.dataQuality.level));
  assert.ok(["low", "medium", "high", "unknown"].includes(contract.primaryPanel.modelDisagreement.level));
  assert.equal(contract.primaryPanel.calibrationAuthority.available, true);
  assert.ok(Number.isFinite(contract.primaryPanel.calibrationAuthority.authorityScore));
  assert.equal(contract.primaryPanel.calibrationAuthority.decisionRights, "observe_only");
  assert.equal(contract.primaryPanel.calibrationAdoptionGate.available, true);
  assert.equal(contract.primaryPanel.calibrationAdoptionGate.status, "observe");
  assert.equal(contract.primaryPanel.calibrationAdoptionGate.decisionUse, "raw_primary_collect_outcomes");
  assert.ok(contract.primaryPanel.calibrationAdoptionGate.checklist.some((item) => item.id === "realized_outcomes"));
  assert.equal(contract.primaryPanel.sectorTwin.available, true);
  assert.equal(contract.primaryPanel.sectorTwin.type, "semiconductor");
  assert.equal(contract.primaryPanel.competitiveMoat.decision, "competitive_graph_pending");
});

test("dashboard contract includes required visualization slots with readiness", () => {
  const result = pipeline({
    expectationsHistory: [{ date: "2025-01-01", revenueCagr: 0.12 }],
    historicalAnalogs: [{ ticker: "LRCX", year: 2018, similarity: 0.72 }],
  });

  assert.ok(result.dashboardContract.visualizations.length >= 11);
  const keys = new Set(result.dashboardContract.visualizations.map((item) => item.key));
  [
    "fan_chart",
    "intrinsic_value_distribution",
    "reverse_dcf_surface",
    "sobol_sensitivity",
    "valuation_bridge",
    "market_expectations_history",
    "causal_driver_graph",
    "competitor_graph",
    "historical_analog_paths",
    "capital_allocation_scorecard",
    "calibration_history",
    "calibration_authority",
    "calibration_adoption_gate",
    "sector_twin_semiconductor",
    "irr_distribution",
  ].forEach((key) => assert.ok(keys.has(key), `missing ${key}`));
  assert.ok(result.dashboardContract.readiness.score > 0.55);
  assert.ok(result.dashboardContract.memo.nextBestIntegration);
});

test("dashboard contract keeps missing analogs and calibration history explicit", () => {
  const result = pipeline();
  const byKey = Object.fromEntries(result.dashboardContract.visualizations.map((item) => [item.key, item]));

  assert.equal(byKey.historical_analog_paths.status, "missing");
  assert.equal(byKey.calibration_history.status, "partial");
  assert.ok(result.dashboardContract.memo.requiredMissingViews.includes("historical_analog_paths"));
  assert.ok(result.dashboardContract.investorQuestions.some((question) => /expectations/i.test(question)));
});

test("dashboard contract surfaces competitor graph moat pressure when peer inputs are supplied", () => {
  const result = pipeline({
    competitors: [
      {
        ticker: "RISK",
        name: "Aggressive Rival",
        marketShare: 0.34,
        shareGain: 0.12,
        productOverlap: 0.86,
        customerOverlap: 0.72,
        pricePressure: 0.82,
        capacityGrowth: 0.24,
        substitutionRisk: 0.68,
        rdIntensity: 0.18,
        roic: 0.34,
        grossMargin: 0.38,
      },
    ],
  });

  assert.equal(result.competitiveMoat.decision, "moat_fade_risk");
  assert.equal(result.dashboardContract.primaryPanel.competitiveMoat.decision, "moat_fade_risk");
  assert.ok(result.dashboardContract.warnings.some((warning) => /Competitive graph warns/i.test(warning)));
  assert.ok(result.dashboardContract.visualizations.some((item) => item.key === "competitor_graph" && item.status === "ready"));
});
