import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraManagementReliabilityEngine } from "../lib/aurora-management-reliability-engine.js";

const goodGuidance = [
  { id: "g1", date: "2021-02-01", kpi: "revenue", low: 95, high: 105, actual: 102, horizon: "FY2021", team: "current" },
  { id: "g2", date: "2022-02-01", kpi: "revenue", low: 108, high: 118, actual: 114, horizon: "FY2022", team: "current" },
  { id: "g3", date: "2023-02-01", kpi: "operating_margin", low: 0.24, high: 0.28, actual: 0.27, scale: 1, horizon: "FY2023", team: "current" },
  { id: "g4", date: "2024-02-01", kpi: "fcf", low: 30, high: 36, actual: 34, horizon: "FY2024", team: "current" },
];

test("management reliability remains pending when guidance has no outcomes", () => {
  const result = buildAuroraManagementReliabilityEngine({
    managementGuidance: [{ id: "p1", kpi: "revenue", low: 100, high: 110, horizon: "FY2026" }],
  });

  assert.equal(result.version, "aurora_management_reliability_engine_v1");
  assert.equal(result.decision, "management_reliability_pending");
  assert.equal(result.summary.overall.scored, 0);
  assert.equal(result.records[0].status, "pending_outcome");
});

test("management reliability rewards accurate guidance history", () => {
  const result = buildAuroraManagementReliabilityEngine({ managementGuidance: goodGuidance });

  assert.equal(result.decision, "management_reliability_usable");
  assert.ok(result.posterior.p50 > 0.58);
  assert.ok(result.summary.overall.hitRate >= 0.75);
  assert.ok(result.adjustments.forecastSdMultiplier <= 1.15);
});

test("management reliability penalizes overpromising and downward revisions", () => {
  const result = buildAuroraManagementReliabilityEngine({
    managementGuidance: [
      { id: "b1", kpi: "revenue", low: 120, high: 130, actual: 92, horizon: "FY2021", revisionDirection: "cut", regime: "downturn" },
      { id: "b2", kpi: "revenue", low: 132, high: 145, actual: 101, horizon: "FY2022", revisionDirection: "cut" },
      { id: "b3", kpi: "operating_margin", low: 0.3, high: 0.34, actual: 0.19, scale: 1, horizon: "FY2023", revisionDirection: "lower" },
      { id: "b4", kpi: "fcf", low: 50, high: 60, actual: 22, horizon: "FY2024", revisionDirection: "down" },
    ],
  });

  assert.equal(result.decision, "management_reliability_poor");
  assert.ok(result.posterior.p50 < 0.38);
  assert.ok(result.adjustments.forecastSdMultiplier > 1.1);
  assert.ok(result.adjustments.guidanceProbabilityHaircut > 0.1);
  assert.ok(result.summary.revisions.downwardRevisionShare > 0.75);
});

test("management reliability reports KPI and team-level calibration", () => {
  const result = buildAuroraManagementReliabilityEngine({
    managementGuidance: [
      ...goodGuidance,
      { id: "g5", date: "2024-03-01", kpi: "revenue", low: 115, high: 125, actual: 117, team: "new_cfo", horizon: "FY2024" },
    ],
  });

  assert.ok(result.summary.byKpi.revenue.scored >= 3);
  assert.ok(result.summary.byTeam.current.scored >= 4);
  assert.ok(result.summary.byTeam.new_cfo.scored >= 1);
});

