import test from "node:test";
import assert from "node:assert/strict";
import { buildPreRevenueValuation, isPreRevenueCandidate } from "../lib/valuation-pre-revenue.js";

const MATURE = {
  drivers: { baseFcf: 6.2, price: 180, wacc: 0.085, revenueCagr: 0.07 },
  snapshot: { facts: { revenue: { value: 90_000_000_000 }, fcf: 20_000_000_000, shares: { value: 1_000_000_000 } } },
};

const PRE_REVENUE = {
  drivers: { baseFcf: null, price: 8, wacc: 0.09 },
  snapshot: {
    facts: {
      revenue: { value: 0 },
      fcf: -40_000_000,
      cfo: { value: -38_000_000 },
      shares: { value: 50_000_000 },
    },
  },
};

test("mature company is not routed to the pre-revenue lens", () => {
  assert.equal(isPreRevenueCandidate(MATURE), false);
  const result = buildPreRevenueValuation(MATURE);
  assert.equal(result.applicable, false);
  assert.equal(result.status, "not_applicable");
  assert.match(result.summary, /DCF/);
});

test("pre-revenue with market sizing produces probability-weighted scenarios, not a fake DCF", () => {
  const result = buildPreRevenueValuation({
    ...PRE_REVENUE,
    extras: {
      cashUsd: 120_000_000,
      somUsd: 800_000_000,
      samUsd: 3_000_000_000,
      tamUsd: 12_000_000_000,
      targetMargin: 0.2,
      yearsToScale: 6,
      milestones: [
        { label: "Aprobación regulatoria", probability: 0.6 },
        { label: "Primer contrato comercial", probability: 0.7 },
      ],
    },
  });
  assert.equal(result.applicable, true);
  assert.equal(result.status, "ok");
  assert.equal(result.methodology, "probability_weighted_scenarios");
  assert.equal(result.scenarios.length, 3);
  const totalProbability = result.scenarios.reduce((sum, s) => sum + s.probability, 0);
  assert.ok(Math.abs(totalProbability - 1) < 0.02);
  assert.ok(result.probabilityWeightedValuePerShare > 0);
  assert.ok(result.runway.runwayYears > 2 && result.runway.runwayYears < 4);
  assert.ok(result.failureProbability > 0.2 && result.failureProbability < 0.95);
  assert.ok(result.expectedDilution > 0);
  assert.ok(result.falsifiers.length >= 2);
  assert.ok(result.assumptions.length >= 3);
});

test("pre-revenue without market sizing abstains from fair value and shows implied expectations", () => {
  const result = buildPreRevenueValuation({ ...PRE_REVENUE, extras: {} });
  assert.equal(result.applicable, true);
  assert.equal(result.status, "expectations_only");
  assert.equal(result.probabilityWeightedValuePerShare, null);
  assert.ok(result.impliedExpectations);
  assert.ok(result.impliedExpectations.impliedRevenue > 0);
  assert.ok(result.missingInputs.includes("SOM (mercado alcanzable en USD)"));
});

test("pre-revenue with no shares or price abstains completely with concrete missing inputs", () => {
  const result = buildPreRevenueValuation({
    drivers: { baseFcf: null, price: null },
    snapshot: { facts: { revenue: { value: 0 } } },
    extras: {},
  });
  assert.equal(result.applicable, true);
  assert.equal(result.status, "abstain");
  assert.equal(result.probabilityWeightedValuePerShare, null);
  assert.equal(result.impliedExpectations, null);
  assert.ok(result.missingInputs.length >= 3);
  assert.match(result.summary, /abstenernos|insuficientes/i);
});

test("shorter runway raises failure probability and dilution assumptions", () => {
  const base = buildPreRevenueValuation({
    ...PRE_REVENUE,
    extras: { cashUsd: 150_000_000, somUsd: 500_000_000 },
  });
  const tight = buildPreRevenueValuation({
    ...PRE_REVENUE,
    extras: { cashUsd: 20_000_000, somUsd: 500_000_000 },
  });
  assert.ok(tight.runway.runwayYears < 1);
  assert.ok(tight.failureProbability > base.failureProbability);
  assert.ok(tight.expectedDilution >= base.expectedDilution);
  assert.ok(tight.probabilityWeightedValuePerShare < base.probabilityWeightedValuePerShare);
});
