import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraCalibrationEngine, buildAuroraCalibrationIntegrationPacket } from "../lib/aurora-calibration-engine.js";
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

function prediction(price = 1200, ticker = "ASML") {
  return runAuroraBeliefPipeline(
    {
      ...baseInput,
      company: { ...baseInput.company, ticker },
      market: { ...baseInput.market, price },
    },
    {
      asOfDate: "2026-01-01",
      ranAt: "2026-03-01T00:00:00.000Z",
      builtAt: "2026-03-01T00:00:00.000Z",
    },
  );
}

function centeredActuals(pred, overrides = {}) {
  return {
    growth: pred.forecast.posterior.growth.p50,
    margin: pred.forecast.posterior.margin.p50,
    roic: pred.forecast.posterior.roic.p50,
    reinvestment: pred.forecast.posterior.reinvestment.p50,
    value: pred.valuationEnsemble.summary.weightedFairValue,
    realizedReturn: pred.valuationEnsemble.summary.expectedReturn,
    ...overrides,
  };
}

test("calibration engine marks a single live prediction as pending outcome", () => {
  const result = buildAuroraCalibrationEngine(prediction());

  assert.equal(result.version, "aurora_calibration_engine_v1");
  assert.equal(result.decision, "calibration_pending");
  assert.equal(result.summary.scoredRecords, 0);
  assert.equal(result.records[0].status, "pending_outcome");
  assert.equal(result.recalibrationPolicy.action, "collect_realized_outcomes");
  assert.equal(result.recalibrationPolicy.globalAdjustments.uncertaintyScale, 1);
  assert.equal(result.calibrationAuthority.decisionRights, "observe_only");
  assert.equal(result.calibrationAuthority.evidenceTier, "insufficient_history");
});

test("calibration engine scores continuous forecast coverage and probabilistic investment events", () => {
  const p1 = prediction(1000, "A1");
  const p2 = prediction(1300, "A2");
  const result = buildAuroraCalibrationEngine({
    records: [
      { id: "a1", prediction: p1, actuals: centeredActuals(p1) },
      {
        id: "a2",
        prediction: p2,
        actuals: centeredActuals(p2, {
          growth: p2.forecast.posterior.growth.p90,
          margin: p2.forecast.posterior.margin.p10,
          realizedReturn: -0.08,
          permanentLoss: false,
        }),
      },
    ],
    experimentLog: { experimentCount: 2 },
  });

  assert.equal(result.summary.scoredRecords, 2);
  assert.ok(Number.isFinite(result.summary.continuous.growth.meanAbsoluteError));
  assert.ok(Number.isFinite(result.summary.continuous.margin.coverage80));
  assert.ok(Number.isFinite(result.summary.investment.meanBrier));
  assert.ok(Number.isFinite(result.summary.investment.meanPredictedNegativeReturnProbability));
  assert.ok(Number.isFinite(result.summary.investment.observedNegativeReturnRate));
  assert.equal(result.recalibrationPolicy.version, "aurora_recalibration_policy_v1");
  assert.ok(Number.isFinite(result.recalibrationPolicy.globalAdjustments.negativeReturnProbabilityShift));
  assert.equal(result.calibrationAuthority.version, "aurora_calibration_authority_v1");
  assert.ok(Number.isFinite(result.calibrationAuthority.authorityScore));
  assert.ok(["insufficient_history", "decision_grade", "research_grade", "shadow_grade", "memo_only"].includes(result.calibrationAuthority.evidenceTier));
  assert.ok(["calibration_usable", "calibration_watch", "calibration_failing"].includes(result.decision));
  assert.equal(result.summary.experimentRisk.level, "low_recorded_experiment_pressure");
});

test("calibration engine scores expectation-violation diagnostics from priced beliefs", () => {
  const p1 = prediction(980, "EV1");
  const p2 = prediction(1180, "EV2");
  const result = buildAuroraCalibrationEngine({
    records: [
      {
        id: "ev1",
        prediction: p1,
        actuals: centeredActuals(p1, {
          growth: p1.forecast.posterior.growth.p50 + 0.04,
          margin: p1.forecast.posterior.margin.p50 + 0.02,
          roic: p1.forecast.posterior.roic.p50 + 0.03,
          reinvestment: p1.forecast.posterior.reinvestment.p50 - 0.02,
        }),
      },
      {
        id: "ev2",
        prediction: p2,
        actuals: centeredActuals(p2, {
          growth: p2.forecast.posterior.growth.p50 - 0.01,
          margin: p2.forecast.posterior.margin.p50 + 0.01,
          roic: p2.forecast.posterior.roic.p50,
          reinvestment: p2.forecast.posterior.reinvestment.p50 - 0.01,
        }),
      },
    ],
  });
  const packet = buildAuroraCalibrationIntegrationPacket(p1, result, {
    builtAt: "2026-03-01T00:00:00.000Z",
  });

  assert.equal(result.summary.expectationViolation.count, 2);
  assert.ok(Number.isFinite(result.summary.expectationViolation.composite.meanAbsoluteError));
  assert.ok(Number.isFinite(result.summary.expectationViolation.composite.directionAccuracy));
  assert.ok(Number.isFinite(result.summary.expectationViolation.components.growth.meanAbsoluteError));
  assert.ok(packet.calibrationContract.monitoring.metrics.some((metric) => metric.id === "expectation_violation_direction_accuracy"));
});

test("calibration engine derives thesis usefulness from belief object confidence and decision class", () => {
  const p = prediction(1100, "TU1");
  p.beliefObject = {
    ...p.beliefObject,
    decisionClass: "research_priority",
    decisionEvidence: {
      ...p.beliefObject.decisionEvidence,
      confidence: 0.77,
      falsifiabilityYield: 0.26,
    },
    decisionClassLedger: {
      ...p.beliefObject.decisionClassLedger,
      classSupport: 0.69,
    },
    evidenceDebt: 0.11,
    transitionSignal: {
      archetypeMigrationScore: 0.15,
      ...p.beliefObject.transitionSignal,
    },
    falsifiabilityYield: 0.26,
    lensLegitimacy: [
      { key: "reverseDcf", legitimacy: 0.86, reason: "Always useful as price-as-question spine." },
      { key: "roicFade", legitimacy: 0.58, reason: "Valid when excess ROIC is measurable." },
    ],
    assumptionBurdenOfProof: { score: 0.22 },
    beliefDistortionIndex: 34,
    abstain: false,
  };

  const result = buildAuroraCalibrationEngine({
    records: [
      {
        id: "tu1",
        prediction: p,
        actuals: centeredActuals(p, {
          decisionClass: "research_priority",
          value: p.valuationEnsemble.summary.weightedFairValue,
          realizedReturn: p.valuationEnsemble.summary.expectedReturn,
        }),
      },
    ],
    experimentLog: { experimentCount: 1 },
  });

  assert.equal(result.summary.scoredRecords, 1);
  const row = result.records.find((record) => record.status === "scored");
  assert.equal(row.belief.thesisUsefulObserved, true);
  assert.equal(row.belief.thesisUsefulPredicted, true);
  assert.ok(Number.isFinite(row.belief.thesisUsefulPredictedScore));
});

test("calibration engine marks abstention as not useful even with strong signal fields", () => {
  const p = prediction(1100, "TU2");
  p.beliefObject = {
    ...p.beliefObject,
    decisionClass: "research_priority",
    decisionEvidence: {
      ...p.beliefObject.decisionEvidence,
      confidence: 0.81,
    },
    decisionClassLedger: {
      ...p.beliefObject.decisionClassLedger,
      classSupport: 0.74,
    },
    evidenceDebt: 0.08,
    transitionSignal: {
      ...p.beliefObject.transitionSignal,
      archetypeMigrationScore: 0.05,
    },
    abstain: true,
  };

  const result = buildAuroraCalibrationEngine({
    records: [
      {
        id: "tu2",
        prediction: p,
        actuals: centeredActuals(p, {
          decisionClass: "research_not_rankable",
          value: p.valuationEnsemble.summary.weightedFairValue,
          realizedReturn: p.valuationEnsemble.summary.expectedReturn,
        }),
      },
    ],
  });

  const row = result.records.find((record) => record.status === "scored");
  assert.equal(row.belief.thesisUsefulPredicted, false);
  assert.equal(row.belief.thesisUsefulObserved, false);
});

test("calibration engine fails badly miscalibrated histories", () => {
  const p1 = prediction(900, "B1");
  const p2 = prediction(950, "B2");
  const farMiss = (pred) => ({
    growth: pred.forecast.posterior.growth.p90 + 0.45,
    margin: pred.forecast.posterior.margin.p90 + 0.35,
    roic: pred.forecast.posterior.roic.p90 + 0.4,
    reinvestment: pred.forecast.posterior.reinvestment.p90 + 0.4,
    value: pred.valuationEnsemble.summary.weightedFairValue * 0.2,
    realizedReturn: -0.55,
    permanentLoss: true,
  });
  const result = buildAuroraCalibrationEngine({
    records: [
      { id: "b1", prediction: p1, actuals: farMiss(p1) },
      { id: "b2", prediction: p2, actuals: farMiss(p2) },
    ],
    experimentLog: { experimentCount: 20 },
  });

  assert.equal(result.decision, "calibration_failing");
  assert.equal(result.recalibrationPolicy.action, "freeze_promotion_and_apply_conservative_overrides");
  assert.equal(result.calibrationAuthority.decisionRights, "freeze_promotion");
  assert.ok(result.calibrationAuthority.hardBlocks.includes("calibration_failing"));
  assert.ok(result.recalibrationPolicy.globalAdjustments.uncertaintyScale > 1);
  assert.ok(result.recalibrationPolicy.globalAdjustments.confidenceHaircut > 0);
  assert.ok(result.summary.continuous.growth.coverage80 < 0.8);
  assert.equal(result.summary.experimentRisk.level, "high_backtest_overfitting_risk");
});

test("calibration authority blocks inverted expectation-violation histories", () => {
  const records = [920, 960, 1000, 1040, 1080].map((price, index) => {
    const pred = prediction(price, `INV${index}`);
    const implied = pred.beliefObject.marketImpliedBeliefs;
    const expectsPositiveGap = (pred.beliefObject.signedOpportunityScore ?? 0) >= 0;
    return {
      id: `inv${index}`,
      prediction: pred,
      actuals: centeredActuals(pred, {
        growth: implied.revenueCagr5y.mean + (expectsPositiveGap ? -0.05 : 0.05),
        margin: implied.terminalMargin.mean + (expectsPositiveGap ? -0.04 : 0.04),
        roic: implied.roicPath.mean + (expectsPositiveGap ? -0.05 : 0.05),
        reinvestment: implied.reinvestmentRate.mean + (expectsPositiveGap ? 0.05 : -0.05),
        value: pred.valuationEnsemble.summary.weightedFairValue * 0.7,
        realizedReturn: -0.2,
      }),
    };
  });

  const result = buildAuroraCalibrationEngine(
    { records },
    { minCalibrationRecords: 5 },
  );

  assert.ok(result.calibrationAuthority.hardBlocks.includes("expectation_violation_inverted"));
  assert.ok(result.calibrationAuthority.requiredEvidence.some((item) => item.includes("expectation-violation")));
  assert.ok(["calibration_watch", "calibration_failing"].includes(result.decision));
});

test("calibration engine emits variable-level shift and interval scale policy", () => {
  const p1 = prediction(900, "C1");
  const p2 = prediction(920, "C2");
  const result = buildAuroraCalibrationEngine(
    {
      records: [
        {
          id: "c1",
          prediction: p1,
          actuals: centeredActuals(p1, {
            growth: p1.forecast.posterior.growth.p50 + 0.04,
            value: p1.valuationEnsemble.summary.weightedFairValue * 1.8,
          }),
        },
        {
          id: "c2",
          prediction: p2,
          actuals: centeredActuals(p2, {
            growth: p2.forecast.posterior.growth.p50 + 0.05,
            value: p2.valuationEnsemble.summary.weightedFairValue * 1.9,
          }),
        },
      ],
    },
    { minCalibrationRecords: 2 },
  );

  assert.ok(result.recalibrationPolicy.variables.growth.centerShift > 0);
  assert.ok(result.recalibrationPolicy.variables.value.centerShift > 0);
  assert.ok(result.recalibrationPolicy.reliability >= 0.9);
});

test("calibration engine builds return buckets for walk-forward diagnostics", () => {
  const records = [800, 1000, 1200, 1500, 1800].map((price, index) => {
    const pred = prediction(price, `D${index}`);
    return {
      id: `d${index}`,
      prediction: pred,
      actuals: centeredActuals(pred, {
        realizedReturn: -0.1 + index * 0.08,
        value: price * (0.9 + index * 0.08),
      }),
    };
  });
  const result = buildAuroraCalibrationEngine({ records });

  assert.ok(result.summary.investment.deciles.length >= 2);
  assert.ok(Number.isFinite(result.summary.investment.monotonicity));
});

test("calibration engine builds contextual segment policies for integration", () => {
  const p1 = prediction(980, "S1");
  const p2 = prediction(1020, "S2");
  const p3 = prediction(1500, "S3");
  const p4 = prediction(1600, "S4");
  const result = buildAuroraCalibrationEngine(
    {
      records: [
        {
          id: "s1",
          horizon: "3y",
          prediction: p1,
          actuals: centeredActuals(p1, { horizon: "3y", growth: p1.forecast.posterior.growth.p50 + 0.08, realizedReturn: -0.02 }),
        },
        {
          id: "s2",
          horizon: "3y",
          prediction: p2,
          actuals: centeredActuals(p2, { horizon: "3y", growth: p2.forecast.posterior.growth.p50 + 0.07, realizedReturn: -0.02 }),
        },
        {
          id: "s3",
          horizon: "1y",
          prediction: p3,
          actuals: centeredActuals(p3, { horizon: "1y", growth: p3.forecast.posterior.growth.p50 }),
        },
        {
          id: "s4",
          horizon: "1y",
          prediction: p4,
          actuals: centeredActuals(p4, { horizon: "1y", growth: p4.forecast.posterior.growth.p50 }),
        },
      ],
    },
    { minCalibrationRecords: 2, minSegmentRecords: 2 },
  );

  const horizon3y = result.contextualCalibration.segments.find((segment) => segment.key === "horizon:3y");
  assert.equal(result.contextualCalibration.version, "aurora_contextual_calibration_v1");
  assert.ok(horizon3y);
  assert.equal(horizon3y.eligible, true);
  assert.ok(horizon3y.policy.variables.growth.centerShift > 0.03);
});

test("calibration integration packet applies shift, scale, confidence and abstention policy", () => {
  const p1 = prediction(900, "E1");
  const calibration = buildAuroraCalibrationEngine(
    {
      records: [
        {
          id: "e1",
          prediction: p1,
          actuals: centeredActuals(p1, {
            growth: p1.forecast.posterior.growth.p50 + 0.06,
            value: p1.valuationEnsemble.summary.weightedFairValue * 1.5,
            realizedReturn: -0.35,
            permanentLoss: true,
          }),
        },
      ],
    },
    { minCalibrationRecords: 1 },
  );
  const packet = buildAuroraCalibrationIntegrationPacket(p1, calibration, {
    builtAt: "2026-03-01T00:00:00.000Z",
    baseAbstentionThreshold: 0.5,
  });

  assert.equal(packet.version, "aurora_calibration_integration_packet_v1");
  assert.ok(["shadow", "production_monitoring", "conservative_override"].includes(packet.mode));
  assert.ok(packet.calibratedForecast.posterior.growth.p50 > p1.forecast.posterior.growth.p50);
  assert.ok(packet.calibratedValuationEnsemble.summary.weightedFairValue > p1.valuationEnsemble.summary.weightedFairValue);
  assert.ok(packet.riskControls.confidence <= 1);
  assert.ok(Number.isFinite(packet.riskControls.negativeReturnProbability));
  assert.ok(Number.isFinite(packet.riskControls.abstentionThreshold));
  assert.equal(packet.calibrationAuthority.version, "aurora_calibration_authority_v1");
  assert.equal(packet.riskControls.decisionRights, packet.calibrationAuthority.decisionRights);
  assert.equal(p1.forecast.calibrated, undefined);
});

test("calibration integration packet selects matching contextual segment when available", () => {
  const p1 = prediction(980, "CTX1");
  const p2 = prediction(1020, "CTX2");
  const p3 = prediction(1500, "CTX3");
  const p4 = prediction(1600, "CTX4");
  const calibration = buildAuroraCalibrationEngine(
    {
      records: [
        {
          id: "ctx1",
          horizon: "3y",
          prediction: p1,
          actuals: centeredActuals(p1, { horizon: "3y", growth: p1.forecast.posterior.growth.p50 + 0.08, realizedReturn: -0.02 }),
        },
        {
          id: "ctx2",
          horizon: "3y",
          prediction: p2,
          actuals: centeredActuals(p2, { horizon: "3y", growth: p2.forecast.posterior.growth.p50 + 0.07, realizedReturn: -0.02 }),
        },
        {
          id: "ctx3",
          horizon: "1y",
          prediction: p3,
          actuals: centeredActuals(p3, { horizon: "1y", growth: p3.forecast.posterior.growth.p50 - 0.01 }),
        },
        {
          id: "ctx4",
          horizon: "1y",
          prediction: p4,
          actuals: centeredActuals(p4, { horizon: "1y", growth: p4.forecast.posterior.growth.p50 - 0.01 }),
        },
      ],
    },
    { minCalibrationRecords: 2, minSegmentRecords: 2 },
  );
  const packet = buildAuroraCalibrationIntegrationPacket(p1, calibration, {
    builtAt: "2026-03-01T00:00:00.000Z",
    horizon: "3y",
    minSegmentRecords: 2,
  });

  assert.equal(packet.contextualCalibration.applied, true);
  assert.match(packet.contextualCalibration.activeSegment.key, /horizon:3y/);
  assert.equal(packet.appliedAdjustments.contextualCalibration.applied, true);
  assert.ok(packet.appliedAdjustments.contextualCalibration.contextualWeight > 0);
  assert.ok(packet.calibratedForecast.posterior.growth.p50 > p1.forecast.posterior.growth.p50);
});

test("calibration integration packet emits a product-facing calibration contract", () => {
  const p1 = prediction(980, "CONTRACT1");
  const p2 = prediction(1020, "CONTRACT2");
  const calibration = buildAuroraCalibrationEngine(
    {
      records: [
        {
          id: "contract1",
          horizon: "3y",
          prediction: p1,
          actuals: centeredActuals(p1, { horizon: "3y", realizedReturn: p1.valuationEnsemble.summary.expectedReturn + 0.02 }),
        },
        {
          id: "contract2",
          horizon: "3y",
          prediction: p2,
          actuals: centeredActuals(p2, { horizon: "3y", realizedReturn: p2.valuationEnsemble.summary.expectedReturn + 0.01 }),
        },
      ],
      experimentLog: { experimentCount: 1 },
    },
    { minCalibrationRecords: 2, minSegmentRecords: 2 },
  );
  const packet = buildAuroraCalibrationIntegrationPacket(p1, calibration, {
    builtAt: "2026-03-01T00:00:00.000Z",
    horizon: "3y",
    minSegmentRecords: 2,
  });

  assert.equal(packet.calibrationContract.version, "aurora_calibration_contract_v1");
  assert.ok(["ready", "guardrailed", "shadow", "blocked"].includes(packet.calibrationContract.status));
  assert.ok(["calibrated", "raw"].includes(packet.calibrationContract.productRead.primaryBranch));
  assert.ok(Number.isFinite(packet.calibrationContract.adoption.calibratedWeight));
  assert.ok(Number.isFinite(packet.calibrationContract.adoption.maxPositionSizeMultiplier));
  assert.ok(packet.calibrationContract.monitoring.metrics.some((metric) => metric.id === "interval_coverage_80"));
  assert.equal(packet.calibrationAdoptionGate.version, "aurora_calibration_adoption_gate_v1");
  assert.equal(packet.calibrationAdoptionGate.status, packet.calibrationContract.status);
  assert.ok(["calibrated_primary", "calibrated_with_raw_check", "raw_primary_calibrated_shadow", "raw_primary_collect_outcomes", "blocked"].includes(packet.calibrationAdoptionGate.decisionUse));
  assert.ok(Number.isFinite(packet.calibrationAdoptionGate.adoption.rawWeight));
  assert.ok(packet.calibrationAdoptionGate.checklist.some((item) => item.id === "realized_outcomes"));
  assert.ok(packet.calibrationAdoptionGate.checklist.some((item) => item.id === "contract_permission"));
  assert.ok(packet.memo.contractStatus);
  assert.equal(packet.memo.adoptionGate, packet.calibrationAdoptionGate.status);
});

test("calibration contract blocks failed calibration from decision use", () => {
  const p1 = prediction(900, "BLOCK1");
  const p2 = prediction(950, "BLOCK2");
  const farMiss = (pred) => ({
    growth: pred.forecast.posterior.growth.p90 + 0.45,
    margin: pred.forecast.posterior.margin.p90 + 0.35,
    roic: pred.forecast.posterior.roic.p90 + 0.4,
    reinvestment: pred.forecast.posterior.reinvestment.p90 + 0.4,
    value: pred.valuationEnsemble.summary.weightedFairValue * 0.2,
    realizedReturn: -0.55,
    permanentLoss: true,
  });
  const calibration = buildAuroraCalibrationEngine(
    {
      records: [
        { id: "block1", prediction: p1, actuals: farMiss(p1) },
        { id: "block2", prediction: p2, actuals: farMiss(p2) },
      ],
      experimentLog: { experimentCount: 20 },
    },
    { minCalibrationRecords: 2 },
  );
  const packet = buildAuroraCalibrationIntegrationPacket(p1, calibration, {
    builtAt: "2026-03-01T00:00:00.000Z",
  });

  assert.equal(packet.calibrationContract.status, "blocked");
  assert.equal(packet.calibrationContract.canUseForDecision, false);
  assert.equal(packet.calibrationContract.adoption.calibratedWeight, 0);
  assert.equal(packet.calibrationContract.adoption.maxPositionSizeMultiplier, 0);
  assert.equal(packet.calibrationContract.productRead.shouldAbstain, true);
  assert.equal(packet.calibrationAdoptionGate.status, "blocked");
  assert.equal(packet.calibrationAdoptionGate.canPromote, false);
  assert.equal(packet.calibrationAdoptionGate.mustAbstain, true);
  assert.ok(packet.calibrationAdoptionGate.blockers.includes("hard_blocks_clear"));
});

test("pipeline exposes calibration integration without mutating the original forecast", () => {
  const pending = prediction(1200, "PIPE");

  assert.equal(pending.calibrationIntegration.version, "aurora_calibration_integration_packet_v1");
  assert.equal(pending.calibrationIntegration.mode, "observe_only");
  assert.equal(pending.calibrationIntegration.calibratedForecast.calibrated, true);
  assert.equal(pending.calibrationIntegration.calibrationAuthority.decisionRights, "observe_only");
  assert.equal(pending.calibrationIntegration.calibrationContract.status, "observe");
  assert.equal(pending.calibrationIntegration.calibrationContract.branch, "raw_primary_collect_outcomes");
  assert.equal(pending.forecast.calibrated, undefined);
  assert.ok(pending.memo.bullets.some((bullet) => bullet.includes("Calibration integration: observe_only.")));
  assert.ok(pending.memo.bullets.some((bullet) => bullet.includes("Calibration authority: observe_only.")));
});
