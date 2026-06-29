import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraCompetitiveMoatEngine } from "../lib/aurora-competitive-moat-engine.js";

const baseInput = {
  company: { ticker: "ASML", name: "ASML Holding NV", sector: "Technology", industry: "Semiconductor equipment" },
  compiled: {
    drivers: {
      roic: 0.31,
      wacc: 0.09,
      margin: 0.34,
      revenueCagr: 0.12,
      bottleneckPower: 0.86,
    },
  },
  evidence: {
    textSignals: {
      pricingPower: 0.82,
      demandVisibility: 0.78,
    },
  },
  driverGraph: {
    derived: {
      moatHalfLifeYears: 9.5,
    },
  },
};

test("competitive moat engine supports moat when peer threats are modest", () => {
  const result = buildAuroraCompetitiveMoatEngine({
    ...baseInput,
    competitors: [
      { ticker: "AMAT", name: "Applied Materials", marketShare: 0.18, shareGain: 0.01, productOverlap: 0.35, pricePressure: 0.08, rdIntensity: 0.09 },
      { ticker: "LRCX", name: "Lam Research", marketShare: 0.14, shareGain: -0.01, productOverlap: 0.28, capacityGrowth: 0.05 },
    ],
  });

  assert.equal(result.version, "aurora_competitive_moat_engine_v1");
  assert.equal(result.decision, "competitive_position_supported");
  assert.equal(result.graph.nodes[0].id, "company");
  assert.equal(result.graph.edges.length, 2);
  assert.ok(result.moatAdjustment.adjustedHalfLifeYears >= result.moatAdjustment.baseHalfLifeYears - 0.5);
  assert.ok(result.dashboard.topCompetitor);
});

test("competitive moat engine flags moat fade risk when rivals gain share and cut price", () => {
  const result = buildAuroraCompetitiveMoatEngine({
    ...baseInput,
    competitors: [
      {
        ticker: "RISK",
        name: "Aggressive Rival",
        marketShare: 0.32,
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

  assert.equal(result.decision, "moat_fade_risk");
  assert.ok(result.aggregate.maxThreat > 0.68);
  assert.ok(result.moatAdjustment.deltaYears < -2);
  assert.ok(result.moatAdjustment.forecastUncertaintyMultiplier > 1);
  assert.ok(result.falsifiers.some((item) => /Aggressive Rival/.test(item)));
});

test("competitive moat engine stays pending without competitor inputs", () => {
  const result = buildAuroraCompetitiveMoatEngine(baseInput);

  assert.equal(result.decision, "competitive_graph_pending");
  assert.equal(result.dashboard.status, "pending");
  assert.equal(result.aggregate.competitorCount, 0);
});
