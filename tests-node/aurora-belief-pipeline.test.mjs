import assert from "node:assert/strict";
import test from "node:test";

import { runAuroraBeliefPipeline, runAuroraBeliefPipelinePanel } from "../lib/aurora-belief-pipeline.js";

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
  observations: {
    asOfDate: "2026-03-01",
    metrics: {
      revenue_growth: 0.23,
      operating_margin: 0.39,
      roic: 0.33,
      reinvestment_rate: 0.16,
    },
  },
};

test("belief pipeline composes evidence extraction, compiler, belief object, and monitor", () => {
  const result = runAuroraBeliefPipeline(baseInput, { asOfDate: "2026-01-01", ranAt: "2026-03-01T00:00:00.000Z" });

  assert.equal(result.version, "aurora_belief_pipeline_v1");
  assert.equal(result.ticker, "ASML");
  assert.equal(result.ranAt, "2026-03-01T00:00:00.000Z");
  assert.equal(result.sourceGovernance.version, "aurora_source_governance_engine_v1");
  assert.equal(result.extractedEvidence.version, "aurora_compiler_evidence_v1");
  assert.equal(result.accounting.version, "aurora_accounting_engine_v1");
  assert.equal(result.equilibrium.version, "aurora_equilibrium_engine_v1");
  assert.equal(result.compiled.version, "aurora_belief_compiler_v1");
  assert.equal(result.driverGraph.version, "aurora_driver_graph_v1");
  assert.equal(result.forecast.version, "aurora_bayesian_forecast_engine_v1");
  assert.equal(result.assumptionLedger.version, "aurora_assumption_ledger_engine_v1");
  assert.equal(result.valuationEnsemble.version, "aurora_valuation_ensemble_v1");
  assert.equal(result.expectations.version, "aurora_expectations_engine_v1");
  assert.equal(result.feasibilityManifold.version, "aurora_feasibility_manifold_v1");
  assert.equal(result.calibration.version, "aurora_calibration_engine_v1");
  assert.equal(result.calibration.decision, "calibration_pending");
  assert.equal(result.calibration.recalibrationPolicy.action, "collect_realized_outcomes");
  assert.equal(result.managementReliability.version, "aurora_management_reliability_engine_v1");
  assert.equal(result.managementReliability.decision, "management_reliability_pending");
  assert.equal(result.capitalAllocation.version, "aurora_capital_allocation_engine_v1");
  assert.equal(result.capitalAllocation.decision, "capital_allocation_pending");
  assert.equal(result.beliefObject.version, "aurora_priced_belief_object_v1");
  assert.equal(result.monitor.version, "aurora_thesis_monitor_v1");
  assert.equal(result.monitor.status, "intact");
  assert.equal(result.decision.state, "active_thesis_intact");
  assert.ok(result.evidence.textSignals.capacityConstraint > 0.55);
  assert.ok(result.memo.bullets.some((line) => /Source governance:/.test(line)));
  assert.ok(result.memo.bullets.some((line) => /Forecast:/.test(line)));
  assert.ok(result.memo.bullets.some((line) => /Assumption ledger:/.test(line)));
  assert.ok(result.memo.bullets.some((line) => /Valuation ensemble:/.test(line)));
  assert.ok(result.memo.bullets.some((line) => /Expectations surface:/.test(line)));
  assert.ok(result.memo.bullets.some((line) => /Feasibility manifold:/.test(line)));
  assert.ok(result.memo.bullets.some((line) => /Calibration:/.test(line)));
  assert.ok(result.memo.bullets.some((line) => /Recalibration:/.test(line)));
  assert.ok(result.memo.bullets.some((line) => /Management reliability:/.test(line)));
  assert.ok(result.memo.bullets.some((line) => /Capital allocation:/.test(line)));
});

test("belief pipeline can score calibration when actual outcomes are supplied", () => {
  const result = runAuroraBeliefPipeline({
    ...baseInput,
    actuals: {
      growth: 0.09,
      margin: 0.22,
      roic: 0.18,
      reinvestment: 0.24,
      realizedReturn: 0.12,
      value: 1344,
    },
  });

  assert.equal(result.calibration.summary.scoredRecords, 1);
  assert.equal(result.calibration.records[0].status, "scored");
});

test("belief pipeline escalates unreliable management guidance history", () => {
  const result = runAuroraBeliefPipeline({
    ...baseInput,
    managementGuidance: [
      { id: "m1", kpi: "revenue", low: 120, high: 130, actual: 92, revisionDirection: "cut", regime: "downturn" },
      { id: "m2", kpi: "operating_margin", low: 0.32, high: 0.36, actual: 0.2, scale: 1, revisionDirection: "lower" },
      { id: "m3", kpi: "fcf", low: 55, high: 65, actual: 25, revisionDirection: "down" },
    ],
  });

  assert.equal(result.managementReliability.decision, "management_reliability_poor");
  assert.equal(result.decision.state, "management_reliability_review");
});

test("belief pipeline blocks causally incoherent driver assumptions", () => {
  const result = runAuroraBeliefPipeline({
    ...baseInput,
    drivers: {
      revenueCagr: 0.18,
      reinvestment: 0.01,
      roic: 0.06,
      wacc: 0.1,
    },
  });

  assert.equal(result.decision.state, "causal_model_violation");
  assert.ok(result.driverGraph.constraintViolations.length >= 2);
});

test("belief pipeline escalates tripped monitor into broken thesis decision", () => {
  const result = runAuroraBeliefPipeline({
    ...baseInput,
    observations: {
      asOfDate: "2026-03-01",
      metrics: {
        revenue_growth: -0.02,
        operating_margin: 0.39,
        roic: 0.33,
        reinvestment_rate: 0.16,
      },
    },
  });

  assert.equal(result.monitor.status, "tripped");
  assert.equal(result.decision.state, "thesis_broken_or_needs_reunderwriting");
  assert.equal(result.decision.action, "re-underwrite_or_reject_thesis");
});

test("belief pipeline can compile without observations and leaves monitor null", () => {
  const { observations, ...inputWithoutObservations } = baseInput;
  const result = runAuroraBeliefPipeline(inputWithoutObservations);

  assert.equal(result.monitor, null);
  assert.ok(["priced_belief_ready", "memo_only"].includes(result.decision.state));
  assert.ok(result.memo.bullets.some((line) => /Monitor status: not run/.test(line)));
});

test("belief pipeline repairs sparse input before interpretation", () => {
  const result = runAuroraBeliefPipeline({
    company: { ticker: "THIN", sector: "Unknown" },
    market: { price: 42 },
  });

  assert.equal(result.decision.state, "repair_inputs");
  assert.equal(result.compiled.driverQuality.level, "insufficient");
});

test("belief pipeline panel summarizes decisions and monitor statuses", () => {
  const panel = runAuroraBeliefPipelinePanel([
    baseInput,
    {
      ...baseInput,
      company: { ...baseInput.company, ticker: "BROKEN" },
      observations: {
        asOfDate: "2026-03-01",
        metrics: {
          revenue_growth: -0.02,
          operating_margin: 0.39,
          roic: 0.33,
          reinvestment_rate: 0.16,
        },
      },
    },
  ]);

  assert.equal(panel.version, "aurora_belief_pipeline_panel_v1");
  assert.equal(panel.count, 2);
  assert.equal(panel.monitorCounts.intact, 1);
  assert.equal(panel.monitorCounts.tripped, 1);
  assert.equal(panel.counts.active_thesis_intact, 1);
  assert.equal(panel.counts.thesis_broken_or_needs_reunderwriting, 1);
});
