import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraSemiconductorTwin } from "../lib/aurora-semiconductor-twin.js";

test("semiconductor twin supports durable bottleneck when capacity is tight and ASPs rise", () => {
  const result = buildAuroraSemiconductorTwin(
    {
      company: { ticker: "ASML", name: "ASML Holding NV", sector: "Technology", industry: "Semiconductor equipment lithography" },
      productMarket: {
        capacity: 100,
        demand: 118,
        utilization: 0.96,
        capacityGrowth: 0.04,
        demandGrowth: 0.16,
        bookToBill: 1.18,
        backlogGrowth: 0.2,
        inventoryDays: 68,
        normalInventoryDays: 92,
        aspGrowth: 0.08,
        capexGrowth: 0.07,
        leadTimeMonths: 21,
        leadingNodeMix: 0.78,
      },
      evidence: {
        textSignals: {
          demandVisibility: 0.84,
          capacityConstraint: 0.88,
          pricingPower: 0.82,
        },
      },
    },
    { builtAt: "2026-06-29T00:00:00.000Z" },
  );

  assert.equal(result.version, "aurora_semiconductor_twin_v1");
  assert.equal(result.builtAt, "2026-06-29T00:00:00.000Z");
  assert.equal(result.applicable, true);
  assert.equal(result.decision, "semiconductor_bottleneck_supported");
  assert.ok(result.scores.bottleneckDurability > 0.68);
  assert.ok(result.scores.cycleRisk < 0.55);
  assert.ok(result.adjustments.bottleneckEvidenceDelta > 0);
  assert.ok(result.falsifiers.some((item) => /utilization/i.test(item)));
});

test("semiconductor twin warns when capacity, inventory, cancellations, and ASPs point to glut risk", () => {
  const result = buildAuroraSemiconductorTwin({
    company: { ticker: "MEM", name: "Memory Cycle Co", sector: "Technology", industry: "Semiconductor memory" },
    semiconductor: {
      utilization: 0.78,
      demandGrowth: -0.03,
      capacityGrowth: 0.18,
      bookToBill: 0.86,
      backlogGrowth: -0.12,
      inventoryDays: 142,
      normalInventoryDays: 90,
      inventoryGrowth: 0.24,
      aspGrowth: -0.16,
      capexGrowth: 0.22,
      orderCancellations: 0.18,
      memoryExposure: 0.88,
    },
    evidence: { textSignals: { demandVisibility: 0.32, pricingPower: 0.28, capacityConstraint: 0.22 } },
  });

  assert.equal(result.applicable, true);
  assert.equal(result.decision, "semiconductor_glut_risk");
  assert.ok(result.scores.inventoryOverhang > 0.65);
  assert.ok(result.scores.cycleRisk > 0.68);
  assert.ok(result.adjustments.cycleRiskPenalty > 0);
  assert.ok(result.adjustments.forecastUncertaintyMultiplier > 1);
  assert.ok(result.falsifiers.some((item) => /cancellations|capacity/i.test(item)));
});

test("semiconductor twin stays out of non-semiconductor businesses", () => {
  const result = buildAuroraSemiconductorTwin({
    company: { ticker: "SAAS", name: "SaaS Co", sector: "Technology", industry: "Software SaaS" },
    productMarket: { netRevenueRetention: 1.2 },
  });

  assert.equal(result.applicable, false);
  assert.equal(result.decision, "sector_twin_not_applicable");
  assert.equal(result.dashboard.status, "not_applicable");
});
