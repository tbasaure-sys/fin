import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePhantomBreadth,
  symmetricEigenvalues,
  ledoitWolfShrinkage,
  PhantomBreadthError,
} from "../lib/server/phantom-breadth-engine.js";

// Deterministic PRNG (mulberry32) so tests are stable.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Build daily close panels from a factor model:
 * r_i = beta_i * factor + idio_i
 */
function buildPanel({ tickers, betas, idioVols, factorVol, days = 320, seed = 7 }) {
  const rand = rng(seed);
  const panel = Object.fromEntries(tickers.map((t) => [t, {}]));
  const prices = Object.fromEntries(tickers.map((t) => [t, 100]));
  const start = Date.parse("2024-01-01T00:00:00Z");
  for (let d = 0; d < days; d += 1) {
    const date = new Date(start + d * 86400000).toISOString().slice(0, 10);
    const factor = gauss(rand) * factorVol;
    tickers.forEach((ticker, index) => {
      const ret = betas[index] * factor + gauss(rand) * idioVols[index];
      prices[ticker] *= Math.exp(ret);
      panel[ticker][date] = prices[ticker];
    });
  }
  return panel;
}

function equalWeights(tickers) {
  return tickers.map((ticker) => ({ ticker, weight: 1 / tickers.length }));
}

test("eigenvalues and shrinkage behave on a known matrix", () => {
  const eig = symmetricEigenvalues([[2, 0], [0, 3]]).sort((a, b) => a - b);
  assert.ok(Math.abs(eig[0] - 2) < 1e-9 && Math.abs(eig[1] - 3) < 1e-9);
  const returns = Array.from({ length: 80 }, (_, i) => [Math.sin(i) * 0.01, Math.cos(i) * 0.01]);
  const cov = ledoitWolfShrinkage(returns);
  assert.equal(cov.length, 2);
  assert.ok(cov[0][0] > 0 && cov[1][1] > 0);
  assert.ok(Math.abs(cov[0][1] - cov[1][0]) < 1e-12);
});

test("many tickers but one latent bet: raw breadth collapses far below ticker count", () => {
  const tickers = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"];
  const panel = buildPanel({
    tickers,
    betas: tickers.map(() => 1),
    idioVols: tickers.map(() => 0.002),
    factorVol: 0.02,
    seed: 11,
  });
  const result = analyzePhantomBreadth(equalWeights(tickers), panel);
  // 10 tickers look like 10 bets naively, but the latent common factor
  // means the spectrum is dominated by one component.
  assert.ok(result.current.holdings_hhi_breadth > 9.5);
  assert.ok(result.current.raw_breadth < 4, `raw breadth ${result.current.raw_breadth} should be << 10`);
  assert.ok(["phantom-dominant", "mixed", "real-dominant"].includes(result.current.classification));
  assert.equal(result.engine, "phantom_breadth_js_v1");
});

test("few genuinely independent holdings show high raw breadth relative to count", () => {
  const tickers = ["I1", "I2", "I3", "I4"];
  const panel = buildPanel({
    tickers,
    betas: tickers.map(() => 0),
    idioVols: tickers.map(() => 0.015),
    factorVol: 0,
    seed: 23,
  });
  const result = analyzePhantomBreadth(equalWeights(tickers), panel);
  assert.ok(result.current.raw_breadth > 3, `independent book should approach ${tickers.length} bets, got ${result.current.raw_breadth}`);
});

test("distinct sector labels with a common factor do NOT count as diversified", () => {
  const tickers = ["TECH", "BANK", "OIL", "RETAIL", "PHARMA"];
  const panel = buildPanel({
    tickers,
    betas: [1, 0.95, 1.05, 1, 0.9],
    idioVols: tickers.map(() => 0.003),
    factorVol: 0.018,
    seed: 31,
  });
  const holdings = equalWeights(tickers).map((row, index) => ({
    ...row,
    sector: ["Technology", "Financials", "Energy", "Consumer", "Healthcare"][index],
  }));
  const result = analyzePhantomBreadth(holdings, panel);
  // Five different sectors, but one latent bet: effective bets must be far below 5.
  assert.ok(result.current.raw_breadth < 2.5, `common-factor book reported ${result.current.raw_breadth} bets`);
});

test("calm markets inflate phantom share versus stressed markets (paper Proposition 1)", () => {
  const tickers = ["C1", "C2", "C3", "C4"];
  const calm = buildPanel({ tickers, betas: [0.3, 0.3, 0.3, 0.3], idioVols: tickers.map(() => 0.002), factorVol: 0.002, seed: 41 });
  const stressed = buildPanel({ tickers, betas: [0.3, 0.3, 0.3, 0.3], idioVols: tickers.map(() => 0.02), factorVol: 0.02, seed: 41 });
  const calmResult = analyzePhantomBreadth(equalWeights(tickers), calm);
  const stressedResult = analyzePhantomBreadth(equalWeights(tickers), stressed);
  assert.ok(
    calmResult.current.phantom_share > stressedResult.current.phantom_share,
    `phantom share should be higher in calm regime (calm ${calmResult.current.phantom_share} vs stressed ${stressedResult.current.phantom_share})`,
  );
  assert.ok(calmResult.current.phantom_share > 0.5, "very calm regime should be phantom-dominated");
});

test("cash-like defensive asset is handled and raises phantom share via lower stress intensity", () => {
  const tickers = ["EQ1", "EQ2", "EQ3", "CASH"];
  const panel = buildPanel({
    tickers,
    betas: [1, 1, 1, 0],
    idioVols: [0.004, 0.004, 0.004, 0.0001],
    factorVol: 0.012,
    seed: 53,
  });
  const result = analyzePhantomBreadth(
    [
      { ticker: "EQ1", weight: 0.25 },
      { ticker: "EQ2", weight: 0.25 },
      { ticker: "EQ3", weight: 0.25 },
      { ticker: "CASH", weight: 0.25, sector: "Cash" },
    ],
    panel,
  );
  assert.ok(Number.isFinite(result.current.raw_breadth));
  assert.ok(Number.isFinite(result.current.phantom_share));
  assert.ok(result.contributors.length === 4);
  const cashRow = result.contributors.find((row) => row.ticker === "CASH");
  assert.ok(cashRow, "cash position must appear in leave-one-out contributors");
});

test("insufficient data raises an explicit PhantomBreadthError instead of a fake read", () => {
  const tickers = ["S1", "S2", "S3"];
  const shortPanel = buildPanel({ tickers, betas: [1, 1, 1], idioVols: [0.01, 0.01, 0.01], factorVol: 0.01, days: 20, seed: 61 });
  assert.throws(
    () => analyzePhantomBreadth(equalWeights(tickers), shortPanel),
    PhantomBreadthError,
  );
  assert.throws(
    () => analyzePhantomBreadth([{ ticker: "ONLY", weight: 1 }], {}),
    PhantomBreadthError,
  );
  assert.throws(
    () => analyzePhantomBreadth(equalWeights(tickers), {}),
    PhantomBreadthError,
  );
});

test("leave-one-out identifies an independent asset as more diversifying than a clone", () => {
  const tickers = ["CORE1", "CORE2", "CLONE", "INDEP"];
  const panel = buildPanel({
    tickers,
    betas: [1, 1, 1, 0],
    idioVols: [0.002, 0.002, 0.002, 0.015],
    factorVol: 0.015,
    seed: 71,
  });
  const result = analyzePhantomBreadth(equalWeights(tickers), panel);
  const indep = result.contributors.find((row) => row.ticker === "INDEP");
  const clone = result.contributors.find((row) => row.ticker === "CLONE");
  assert.ok(indep && clone);
  assert.ok(
    indep.delta_real_breadth > clone.delta_real_breadth,
    `independent asset should add more stress-tested breadth (${indep.delta_real_breadth} vs ${clone.delta_real_breadth})`,
  );
});

test("output contract matches the UI expectations (same shape as python module)", () => {
  const tickers = ["U1", "U2", "U3", "U4"];
  const panel = buildPanel({ tickers, betas: [0.5, 0.5, 0.2, 0.1], idioVols: [0.01, 0.008, 0.012, 0.009], factorVol: 0.01, seed: 83 });
  const result = analyzePhantomBreadth(equalWeights(tickers), panel, { workspaceId: "ws-test" });
  assert.equal(result.workspace_id, "ws-test");
  for (const key of ["as_of", "input", "current", "series", "contributors", "diagnostics", "copy"]) {
    assert.ok(key in result, `missing key ${key}`);
  }
  for (const key of ["raw_breadth", "real_breadth", "phantom_breadth", "phantom_share", "tested_ratio", "classification", "classification_label", "conditional_fragility_flag"]) {
    assert.ok(key in result.current, `missing current.${key}`);
  }
  assert.ok(result.series.length >= 30);
  assert.ok(result.series.every((row) => row.raw_breadth >= row.real_breadth));
  assert.ok(result.copy.phantom_share.includes("92%"));
});

test("portfolio intelligence exposes a correlation matrix and deterministic clusters", () => {
  const tickers = ["CLONE1", "CLONE2", "INDEP1", "INDEP2"];
  const panel = buildPanel({
    tickers,
    betas: [1, 1, 0, 0],
    idioVols: [0.001, 0.001, 0.015, 0.015],
    factorVol: 0.02,
    seed: 101,
  });
  const result = analyzePhantomBreadth(equalWeights(tickers), panel);

  assert.deepEqual(result.correlation_matrix.tickers, tickers);
  assert.equal(result.correlation_matrix.values.length, tickers.length);
  assert.ok(result.correlation_matrix.values[0][1] > 0.9);
  assert.ok(result.clusters.length >= 1);
  const cloneCluster = result.clusters.find((cluster) =>
    cluster.tickers.includes("CLONE1") && cluster.tickers.includes("CLONE2"));
  assert.ok(cloneCluster, "highly correlated holdings should be grouped together");
  assert.ok(cloneCluster.weight > 0.49);
});

test("portfolio intelligence analyzes a full 33-name book without truncating positions", () => {
  const tickers = Array.from({ length: 33 }, (_, index) => `N${String(index + 1).padStart(2, "0")}`);
  const panel = buildPanel({
    tickers,
    betas: tickers.map((_, index) => index < 11 ? 1 : index < 22 ? 0.45 : 0),
    idioVols: tickers.map(() => 0.012),
    factorVol: 0.012,
    days: 150,
    seed: 111,
  });
  const result = analyzePhantomBreadth(equalWeights(tickers), panel);

  assert.equal(result.current.holdings_count, 33);
  assert.equal(result.correlation_matrix.tickers.length, 33);
  assert.equal(result.contributors.length, 33);
  assert.ok(result.clusters.flatMap((cluster) => cluster.tickers).length === 33);
});
