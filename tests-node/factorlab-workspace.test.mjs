import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFactorLabQueueItem,
  buildFactorLabSharePath,
  factorLabScoreReading,
  parseFactorLabFilters,
} from "../lib/factorlab-workspace.js";

test("shared FactorLab links preserve every user-visible filter with bounded values", () => {
  const filters = parseFactorLabFilters({
    asof: "2026-06-20",
    universe: "micro",
    topK: "8",
    minAdvUsd: "500000",
    maxMarketCapUsd: "1500000000",
    maxResidualVol: "0.55",
    diagnostics: "1",
  });

  assert.deepEqual(filters, {
    asof: "2026-06-20",
    universe: "micro",
    topK: 8,
    minAdvUsd: 500_000,
    maxMarketCapUsd: 1_500_000_000,
    maxResidualVol: 0.55,
    includeDiagnostics: true,
  });
  assert.equal(
    buildFactorLabSharePath(filters, "es"),
    "/factorlab?lang=es&universe=micro&topK=8&minAdvUsd=500000&maxMarketCapUsd=1500000000&maxResidualVol=0.55&diagnostics=1",
  );
});

test("invalid shared filters fall back to the frozen demo contract instead of leaking malformed values", () => {
  assert.deepEqual(parseFactorLabFilters({
    asof: "not-a-date",
    universe: "anything",
    topK: "99",
    minAdvUsd: "-4",
    maxMarketCapUsd: "nope",
    maxResidualVol: "3",
    diagnostics: "false",
  }), {
    asof: "2026-06-24",
    universe: "tradable",
    topK: 12,
    minAdvUsd: 50_000,
    maxMarketCapUsd: 2_000_000_000,
    maxResidualVol: 1,
    includeDiagnostics: false,
  });
});

test("review scores explain priority without presenting a buy recommendation", () => {
  assert.deepEqual(factorLabScoreReading(72.4, "es"), {
    key: "high",
    label: "Prioridad de revisión alta",
    explanation: "La señal merece revisión temprana, pero todavía necesita tesis, valoración y evidencia primaria.",
  });
  assert.deepEqual(factorLabScoreReading(54, "es"), {
    key: "low",
    label: "Prioridad de revisión baja",
    explanation: "La señal no justifica desplazar trabajo mejor respaldado.",
  });
});

test("adding a FactorLab candidate creates the real watchlist contract", () => {
  assert.deepEqual(buildFactorLabQueueItem({
    ticker: "HROW",
    name: "Harrow",
    opportunityScore: 70.353,
    whyNow: "Revenue acceleration is reaching margins.",
    killCriteria: "Cash flow fails to scale.",
  }), {
    symbol: "HROW",
    name: "Harrow",
    conviction: "FactorLab 70 · investigación pendiente",
    lastSignal: "Revenue acceleration is reaching margins. Falsificador: Cash flow fails to scale.",
  });
});
