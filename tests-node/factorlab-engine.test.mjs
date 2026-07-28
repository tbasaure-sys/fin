import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildFactorLabSpec, factorLabDomLabel, runFactorLab } from "../lib/factorlab-engine.js";

test("FactorLab authorizes research files with type-first scorecards", () => {
  const run = runFactorLab({
    asof: "2026-06-24",
    universe: "tradable",
    topK: 6,
    minAdvUsd: 250_000,
    maxMarketCapUsd: 2_000_000_000,
    maxResidualVol: 0.7,
  });

  assert.equal(run.ok, true);
  assert.equal(run.accepted, true);
  assert.equal(run.spec.name, "factorlab_neglected_opportunity_authorization");
  assert.equal(run.summary.factorNullRequired, true);
  assert.ok(run.summary.eligible >= run.candidates.length);
  assert.ok(run.summary.abstain >= 1);
  assert.ok(run.candidates.length > 0);

  const first = run.candidates[0];
  assert.ok(first.authorizationTier);
  assert.ok(first.authorizationLabel.en);
  assert.ok(first.opportunityType);
  assert.ok(first.opportunityTypeLabel.es);
  assert.ok(Number.isFinite(first.opportunityScore));
  assert.ok(first.opportunityScore >= 0 && first.opportunityScore <= 100);
  assert.ok(first.dataCompleteness > 0 && first.dataCompleteness <= 1);
  assert.ok(first.blockScores.neglect.score > 0);
  assert.ok(first.memoQuestions.length >= 3);
  assert.match(run.audit.join(" "), /fixed breakpoints/i);
  assert.match(run.audit.join(" "), /factor-null/i);
});

test("FactorLab separates global priority from rank inside each opportunity type", () => {
  const run = runFactorLab({
    asof: "2026-06-24",
    universe: "tradable",
    topK: 6,
    minAdvUsd: 250_000,
    maxMarketCapUsd: 2_000_000_000,
    maxResidualVol: 0.7,
  });

  assert.equal(run.candidates[0].ticker, "HROW");
  assert.equal(run.candidates[0].globalRank, 1);
  assert.equal(run.candidates[0].rankWithinType, 1);

  const kits = run.candidates.find((row) => row.ticker === "KITS");
  assert.equal(kits.globalRank, 5);
  assert.equal(kits.rankWithinType, 1);
});

test("FactorLab refuses a live discovery screen that uses future returns", () => {
  const run = runFactorLab({
    asof: "2026-06-24",
    topK: 5,
    includeFutureReturn: true,
  });

  assert.equal(run.ok, false);
  assert.equal(run.accepted, false);
  assert.equal(run.refusal.errorType, "LookaheadError");
  assert.match(run.refusal.message, /Future return/i);
  assert.ok(run.pipeline.some((step) => step.status === "refused"));
  assert.equal(run.candidates.length, 0);
});

test("FactorLab uses fixed type weights and marks factor-null validation as required", () => {
  const spec = buildFactorLabSpec({
    universe: "micro",
    includeQuarantine: true,
  });

  assert.equal(spec.factorNull.required, true);
  assert.deepEqual(spec.factorNull.nulls, ["size", "value", "momentum"]);
  assert.equal(spec.includeDiagnostics, true);
  assert.ok(spec.typeWeights.COMPOUNDER.quality > spec.typeWeights.COMPOUNDER.inflection);
  assert.ok(spec.typeWeights.INFLECTION.inflection > spec.typeWeights.INFLECTION.quality);
  assert.ok(spec.sources.neglect.missingPolicy.includes("neutral_score"));
});

test("FactorLab neutralizes missing neglect inputs instead of treating them as bad fundamentals", () => {
  const run = runFactorLab({
    asof: "2026-06-24",
    universe: "micro",
    topK: 8,
    minAdvUsd: 100_000,
    maxResidualVol: 0.7,
  });
  const pfie = run.candidates.find((row) => row.ticker === "PFIE");

  assert.ok(pfie, "PFIE should be visible in the microcap research queue");
  assert.ok(pfie.blockScores.neglect.completeness < 1);
  assert.ok(pfie.blockScores.neglect.score >= 50);
  assert.ok(pfie.dataCompleteness < 1);
});

test("FactorLab caps option-like files below the highest authorization tier", () => {
  const run = runFactorLab({
    asof: "2026-06-24",
    universe: "tradable",
    topK: 12,
    includeDiagnostics: true,
    maxResidualVol: 1,
  });
  const optionalityFile = run.candidates.find((row) => row.ticker === "AEHR");

  assert.ok(optionalityFile, "Option-like file should be visible when volatility is allowed");
  assert.equal(optionalityFile.opportunityType, "OPTIONALITY");
  assert.notEqual(optionalityFile.authorizationTier, "RANKABLE");
});

test("FactorLab can surface held-back files only when diagnostics are requested", () => {
  const hidden = runFactorLab({
    asof: "2026-06-24",
    universe: "diagnostics",
    topK: 5,
    includeDiagnostics: false,
  });

  assert.equal(hidden.ok, false);
  assert.equal(hidden.refusal.errorType, "CoverageError");

  const visible = runFactorLab({
    asof: "2026-06-24",
    universe: "diagnostics",
    topK: 5,
    includeDiagnostics: true,
  });

  assert.equal(visible.ok, true);
  assert.equal(visible.candidates[0].authorizationTier, "ABSTAIN");
  assert.ok(visible.candidates[0].gateReasons.length > 0);
});

test("FactorLab copy map refuses unmapped engine vocabulary and the UI does not hardcode internal tiers", () => {
  assert.equal(factorLabDomLabel("RANKABLE", "es"), "Prioridad de investigación alta");
  assert.throws(() => factorLabDomLabel("PRIME_CANDIDATE", "en"), /Unmapped/);

  const source = readFileSync("components/factorlab-workstation.jsx", "utf8");
  for (const blocked of ["RANKABLE", "RESEARCHABLE", "ABSTAIN", "COMPOUNDER", "INFLECTION", "DEEP_VALUE", "OPTIONALITY"]) {
    assert.equal(source.includes(blocked), false, `FactorLab UI hardcodes internal engine term: ${blocked}`);
  }
});
