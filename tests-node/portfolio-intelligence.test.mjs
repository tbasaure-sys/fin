import assert from "node:assert/strict";
import test from "node:test";

import {
  assessPortfolioFreshness,
  normalizePortfolioDraft,
} from "../lib/portfolio/intelligence.js";
import { discoverResearchCandidates } from "../lib/channels/discovery-v2.js";

test("portfolio freshness blocks personalized conclusions when positions are old", () => {
  const stale = assessPortfolioFreshness("2026-04-30T20:49:05.000Z", {
    now: new Date("2026-07-14T12:00:00.000Z"),
  });
  assert.equal(stale.status, "stale");
  assert.equal(stale.canAnalyze, false);
  assert.ok(stale.ageDays > 70);

  const fresh = assessPortfolioFreshness("2026-07-14T08:00:00.000Z", {
    now: new Date("2026-07-14T12:00:00.000Z"),
  });
  assert.equal(fresh.status, "current");
  assert.equal(fresh.canAnalyze, true);
});

test("portfolio draft aggregates duplicates, removes zero positions, and recomputes weights", () => {
  const rows = normalizePortfolioDraft([
    { ticker: " aapl ", quantity: 2, currentPriceUsd: 100 },
    { ticker: "AAPL", quantity: 1, currentPriceUsd: 100 },
    { ticker: "MSFT", quantity: 1, currentPriceUsd: 200 },
    { ticker: "SEZL", quantity: 0, currentPriceUsd: 90 },
  ]);

  assert.deepEqual(rows.map((row) => row.ticker), ["AAPL", "MSFT"]);
  assert.equal(rows[0].quantity, 3);
  assert.equal(rows[0].weight, 0.6);
  assert.equal(rows[1].weight, 0.4);
});

test("channel discovery returns concrete issuers and an executable public test", () => {
  const result = discoverResearchCandidates({
    arena: "clinical_workflow",
    change: "workflow_adoption",
    evidence: "product_footprints",
    cadence: "weekly",
    heldTickers: ["BFLY", "UNH"],
    clusterTickers: ["BFLY", "HIMS", "OSCR", "UNH"],
  });

  assert.ok(result.candidates.length >= 3);
  assert.ok(result.candidates.every((candidate) => candidate.ticker));
  assert.ok(result.candidates.every((candidate) => candidate.kpi));
  assert.ok(result.candidates.every((candidate) => candidate.publicTest.steps.length >= 2));
  assert.ok(result.candidates.every((candidate) => candidate.falsifier));
  assert.ok(result.candidates.every((candidate) => !["BFLY", "UNH"].includes(candidate.ticker)));
  assert.ok(result.candidates.some((candidate) => candidate.portfolioFit === "new_driver"));
});

test("channel discovery changes names when the observed arena changes", () => {
  const clinical = discoverResearchCandidates({
    arena: "clinical_workflow",
    change: "workflow_adoption",
    evidence: "product_footprints",
    cadence: "weekly",
  });
  const infrastructure = discoverResearchCandidates({
    arena: "power_infrastructure",
    change: "capacity_bottleneck",
    evidence: "public_backlogs",
    cadence: "monthly",
  });

  assert.notDeepEqual(
    clinical.candidates.map((candidate) => candidate.ticker),
    infrastructure.candidates.map((candidate) => candidate.ticker),
  );
  assert.notEqual(clinical.observationContract, infrastructure.observationContract);
});
