import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraDataTrust } from "../lib/aurora-data-trust.js";
import { buildAuroraLensForge } from "../lib/aurora-lens-forge.js";
import { buildValuationRouter } from "../lib/valuation-router.js";

const asmlDrivers = {
  name: "ASML Holding NV",
  sector: "Semiconductors and related devices",
  price: 800,
  baseFcf: 28,
  revenueCagr: 0.09,
  margin: 0.31,
  roic: 0.24,
  terminalRoic: 0.16,
  wacc: 0.09,
  terminalGrowth: 0.025,
  reinvestment: 0.42,
  thesisQuality: 0.88,
  demandSupply: 0.82,
  bottleneckPower: 0.9,
  dataQuality: 0.82,
  modelRisk: 0.24,
};

test("AURORA data trust rejects impossible macro rates for training", () => {
  const trust = buildAuroraDataTrust({
    drivers: { ...asmlDrivers, riskFreeRate: 0.42 },
    snapshot: { coverage: { secCompanyFacts: true, quoteSource: "FMP stable quote" } },
  });

  assert.equal(trust.trainEligible, false);
  assert.equal(trust.doNotTrainReason, "macro_rate_out_of_bounds");
  assert.equal(trust.scores.macroValidity, 0);
  assert.ok(trust.warnings.some((item) => /outside the allowed/i.test(item)));
});

test("AURORA lens forge emits distributions and falsifiers", () => {
  const forge = buildAuroraLensForge(asmlDrivers, { regimes: { bottleneck: 0.42, compounder: 0.3 } });

  assert.equal(forge.version, "aurora_lens_forge_v1");
  assert.ok(forge.outputs.length >= 10);
  assert.ok(forge.outputs.every((lens) => lens.fairValueP10 <= lens.fairValueBase));
  assert.ok(forge.outputs.every((lens) => lens.fairValueP90 >= lens.fairValueBase));
  assert.ok(forge.outputs.some((lens) => lens.key === "bottleneck" && lens.falsifiers.length));
  assert.ok(Number.isFinite(forge.dispersion));
});

test("AURORA router keeps deterministic prior and shadow residual policy", () => {
  const router = buildValuationRouter(asmlDrivers, {
    company: { industry: "Semiconductors", sicDescription: "Semiconductors and related devices" },
    coverage: { secCompanyFacts: true, quoteSource: "FMP stable quote", fredConfigured: true },
    riskFree: { value: 0.044, source: "U.S. Treasury daily yield curve 10Y" },
  });

  assert.equal(router.version, "aurora_router_v1");
  assert.equal(router.residualPolicy.learnedResidualEnabled, false);
  assert.equal(router.residualPolicy.rho, 0);
  assert.ok(router.dataTrust.overallScore >= 70);
  assert.equal(router.abstain, false);
  assert.ok(router.topRegimes.some((item) => item.key === "bottleneck" || item.key === "compounder"));
  assert.ok(router.topModels.some((item) => item.key === "bottleneck" || item.key === "roicFade"));
  assert.ok(router.lensForge.outputs.some((item) => item.key === "ownerEarnings"));
  assert.ok(router.investorMemo.falsifiers.length >= 1);
});

test("AURORA router abstains when core evidence is too thin", () => {
  const router = buildValuationRouter(
    {
      name: "Thin Co",
      sector: "Unknown",
      price: null,
      baseFcf: null,
      revenueCagr: null,
      margin: null,
      roic: null,
      wacc: 0.1,
      reinvestment: null,
      dataQuality: 0.22,
      modelRisk: 0.62,
    },
    { coverage: {}, missingDrivers: ["price", "baseFcf", "revenueCagr", "margin", "roic", "reinvestment"] },
  );

  assert.equal(router.abstain, true);
  assert.equal(router.dataTrust.trainEligible, false);
  assert.equal(router.dataTrust.level, "research_only");
  assert.ok(router.rationale.some((line) => /Data trust/i.test(line)));
});
