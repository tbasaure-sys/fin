import assert from "node:assert/strict";
import test from "node:test";

import { deriveFactorLabResearchDecision, deriveImpliedFcfGrowthFromYield } from "../lib/factorlab-four-lens.js";

const completeRow = {
  ticker: "REAL",
  priceDate: "2026-08-28",
  fundamentalsDate: "2026-08-10",
  fundamentalsDateType: "filed",
  dataCompleteness: 0.94,
  fcfYield: 0.08,
  normalizedFcfYield: 0.075,
  normalizedFcfYears: 3,
  marketPerception: {
    status: "verified",
    asOf: "2026-08-28",
    source: "Archived consensus snapshot",
  },
  gateReasons: [],
  sources: { fundamentals: "SEC company facts", filing: "SEC submissions" },
  primaryEvidence: {
    fundamentalsUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json",
    filingUrl: "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/index.html",
    filingAccession: "0000000001-26-000001",
  },
  recognitionPath: { event: "Quarterly filing", date: "2026-11-06", source: "SEC submissions" },
  scenarioInputs: {
    bear: { condition: "Cash conversion reverses", returnPct: -0.35, horizonMonths: 24, probability: 0.25 },
    base: { condition: "Margins remain stable", returnPct: 0.18, horizonMonths: 24, probability: 0.5 },
    bull: { condition: "Margins expand further", returnPct: 0.62, horizonMonths: 24, probability: 0.25 },
  },
};

test("reverse FCF growth exposes the expectation embedded in cash yield", () => {
  assert.equal(Number(deriveImpliedFcfGrowthFromYield({ fcfYield: 0.08, requiredReturn: 0.1 }).toFixed(6)), 0.018519);
  assert.equal(deriveImpliedFcfGrowthFromYield({ fcfYield: null }), null);
});

test("four-lens decision only deepens a fully sourced and underwritten file", () => {
  const decision = deriveFactorLabResearchDecision(completeRow);
  assert.equal(decision.action, "deepen");
  assert.deepEqual(decision.unresolved, []);
  assert.equal(decision.lenses.recognition.status, "supported");
  assert.equal(decision.lenses.payoff.status, "supported");
});

test("a cheap-looking file without dated recognition or scenarios waits instead of masquerading as a thesis", () => {
  const decision = deriveFactorLabResearchDecision({ ...completeRow, recognitionPath: null, scenarioInputs: null, whyNow: "Maybe next quarter." });
  assert.equal(decision.action, "wait_trigger");
  assert.equal(decision.lenses.recognition.status, "partial");
  assert.equal(decision.lenses.payoff.status, "unresolved");
});

test("a positive trailing cash yield alone does not establish mispricing", () => {
  const decision = deriveFactorLabResearchDecision({
    ...completeRow,
    normalizedFcfYield: null,
    normalizedFcfYears: null,
    marketPerception: null,
  });
  assert.equal(decision.lenses.mispricing.status, "partial");
  assert.notEqual(decision.action, "deepen");
});

test("past news is not a future recognition path", () => {
  const decision = deriveFactorLabResearchDecision({
    ...completeRow,
    recognitionPath: { event: "Results already released", date: "2026-08-20", source: "SEC filing" },
  });
  assert.equal(decision.lenses.recognition.status, "partial");
  assert.notEqual(decision.action, "deepen");
});

test("payoff scenarios must be ordered, share a horizon, and include probabilities", () => {
  const decision = deriveFactorLabResearchDecision({
    ...completeRow,
    scenarioInputs: {
      bear: { condition: "Demand weakens materially", returnPct: 0.2, horizonMonths: 24, probability: 0.2 },
      base: { condition: "Margins remain stable", returnPct: 0.1, horizonMonths: 24, probability: 0.5 },
      bull: { condition: "Margins expand further", returnPct: 0.6, horizonMonths: 12, probability: 0.3 },
    },
  });
  assert.equal(decision.lenses.payoff.status, "unresolved");
  assert.notEqual(decision.action, "deepen");
});

test("structural failures reject while missing observations abstain", () => {
  assert.equal(deriveFactorLabResearchDecision({ ...completeRow, gateReasons: ["Red flags dominate"] }).action, "reject");
  assert.equal(deriveFactorLabResearchDecision({ ...completeRow, gateReasons: ["Liquidity observation unavailable"], fcfYield: null }).action, "abstain");
});

test("any hard gate forces abstention even when the four lenses look supported", () => {
  const decision = deriveFactorLabResearchDecision({ ...completeRow, gateReasons: ["Liquidity below floor"] });
  assert.equal(decision.action, "abstain");
});
