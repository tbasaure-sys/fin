import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraPricedBeliefObject } from "../lib/aurora-belief-object.js";

const asmlLikeDrivers = {
  ticker: "ASML",
  name: "ASML Holding NV",
  sector: "Semiconductors and related devices",
  price: 800,
  revenue: 300,
  baseFcf: 28,
  revenueCagr: 0.09,
  margin: 0.31,
  roic: 0.24,
  wacc: 0.09,
  terminalGrowth: 0.025,
  reinvestment: 0.42,
  thesisQuality: 0.88,
  demandSupply: 0.82,
  bottleneckPower: 0.9,
  dataQuality: 0.82,
  modelRisk: 0.24,
};

test("priced belief object compiles market beliefs, physics beliefs, gaps, and memo", () => {
  const object = buildAuroraPricedBeliefObject(asmlLikeDrivers, {}, { asOfDate: "2026-06-29" });

  assert.equal(object.version, "aurora_priced_belief_object_v1");
  assert.equal(object.ticker, "ASML");
  assert.equal(object.date, "2026-06-29");
  assert.ok(Number.isFinite(object.beliefDistortionIndex));
  assert.ok(Number.isFinite(object.signedOpportunityScore));
  assert.ok(Number.isFinite(object.marketImpliedBeliefs.revenueCagr5y.mean));
  assert.ok(Number.isFinite(object.businessPhysicsBeliefs.evidenceAdjusted.roicPath.mean));
  assert.ok(Number.isFinite(object.beliefGap.growth.gap));
  assert.ok(object.falsifiers.length >= 3);
  assert.ok(object.monitoringPlan.watchlist.length >= 3);
  assert.ok(object.memo.marketBelieves.some((line) => /Revenue CAGR/.test(line)));
});

test("higher market price raises implied expectations and burden of proof", () => {
  const cheaper = buildAuroraPricedBeliefObject({ ...asmlLikeDrivers, price: 450 });
  const richer = buildAuroraPricedBeliefObject({ ...asmlLikeDrivers, price: 1400 });

  assert.ok(richer.marketImpliedBeliefs.pricePressure > cheaper.marketImpliedBeliefs.pricePressure);
  assert.ok(richer.assumptionBurdenOfProof.score > cheaper.assumptionBurdenOfProof.score);
  assert.ok(richer.signedOpportunityScore < cheaper.signedOpportunityScore);
});

test("thin evidence forces memo-only abstention", () => {
  const object = buildAuroraPricedBeliefObject({
    ticker: "THIN",
    price: 100,
    dataQuality: 0.18,
    modelRisk: 0.84,
  });

  assert.equal(object.abstain, true);
  assert.ok(object.memo.auroraJudgment.some((line) => /memo-only/i.test(line)));
});

test("lens legitimacy promotes reverse DCF spine and bottleneck lens for constrained semis", () => {
  const object = buildAuroraPricedBeliefObject(asmlLikeDrivers);
  const topThree = object.lensLegitimacy.slice(0, 3).map((lens) => lens.key);
  const bottleneck = object.lensLegitimacy.find((lens) => lens.key === "bottleneck");

  assert.ok(topThree.includes("reverseDcf"));
  assert.ok(bottleneck);
  assert.ok(bottleneck.legitimacy > 0.5);
});
