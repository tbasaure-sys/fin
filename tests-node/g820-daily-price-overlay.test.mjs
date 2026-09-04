import test from "node:test";
import assert from "node:assert/strict";

import {
  buildG820DailyPriceOverlay,
  mergeG820DailyPriceOverlay,
  normalizeFmpQuote,
  selectG820DailyUniverse,
} from "../lib/g820/daily-price-overlay.js";

const index = {
  meta: { snapshotId: "snapshot-a", marketAsOf: "2026-08-27" },
  companies: [
    { id: "aaa", ticker: "AAA", category: "WATCH_FOR_PRICE", ivFloor: 20, requiredMos: 0.25, chapter8: true, chapter20: false },
    { id: "bbb", ticker: "BBB", category: "DATA_EXCEPTION", ivFloor: null, requiredMos: 0.3, chapter8: false, chapter20: false },
    { id: "ccc", ticker: "CCC", category: "FALLING_KNIFE", ivFloor: 10, requiredMos: 0.4, chapter8: false, chapter20: false },
  ],
};

test("the daily universe is limited to the calculable decision frontier", () => {
  assert.deepEqual(selectG820DailyUniverse(index).map((row) => row.ticker), ["AAA", "CCC"]);
});

test("FMP quotes are identity checked before they can enter the overlay", () => {
  assert.equal(normalizeFmpQuote([{ symbol: "WRONG", price: 4 }], "AAA", "2026-09-01"), null);
  assert.deepEqual(normalizeFmpQuote([{ symbol: "AAA", price: 14, volume: 12, date: '2026-09-01' }], "AAA", "2026-09-01"), {
    ticker: "AAA", price: 14, asOf: "2026-09-01", volume: 12,
  });
});

test("the overlay recomputes price gates without silently rewriting engine keys", () => {
  const overlay = buildG820DailyPriceOverlay(index, [
    { ticker: "AAA", price: 14, asOf: "2026-09-01" },
    { ticker: "CCC", price: 8, asOf: "2026-09-01" },
  ], "2026-09-02T00:00:00.000Z");

  assert.equal(overlay.companies.aaa.actualMos, 0.3);
  assert.equal(overlay.companies.aaa.safetySurplus, 0.05);
  assert.equal(overlay.companies.aaa.priceGate, "open");
  assert.equal(overlay.companies.aaa.baseChapter8, true);
  assert.equal(overlay.companies.aaa.baseChapter20, false);
  assert.deepEqual(overlay.semantics.doesNotRecompute, ["chapter8", "chapter20", "category", "priority", "ownerClock"]);

  const merged = mergeG820DailyPriceOverlay(index, overlay);
  assert.equal(merged.companies[0].chapter20, false);
  assert.equal(merged.companies[0].dailyPrice.price, 14);
  assert.equal(merged.meta.dailyPrice.status, "available");
});

test("an overlay for another snapshot is rejected rather than mixed", () => {
  const merged = mergeG820DailyPriceOverlay(index, { baseSnapshotId: "snapshot-b", companies: {} });
  assert.equal(merged.meta.dailyPrice.status, "unavailable");
  assert.equal(merged.companies[0].dailyPrice, undefined);
});

test('undated, stale and future quotes cannot claim daily refresh coverage', () => {
  assert.equal(normalizeFmpQuote([{ symbol: 'AAA', price: 14 }], 'AAA', '2026-09-01'), null);
  const result = buildG820DailyPriceOverlay(index, [
    { ticker: 'AAA', price: 14, asOf: '2026-07-01' },
    { ticker: 'CCC', price: 14, asOf: '2027-01-01' },
  ], '2026-09-02T00:00:00Z');
  assert.equal(result.coverage.succeeded, 0);
});

test('runtime recheck recomputes price-sensitive decisions and public counters with the same engine', () => {
  const known = (value) => ({ status: 'known_value', value });
  const pass = { status: 'known_pass', value: true };
  const config = { engineVersion: 'test', mrMarketWeights: { priceDamage: .45, priceBusinessGap: .35, priceValueGap: .2 },
    requiredMos: { base: .2, cap: .6, weights: {} }, archetypeAdjustments: { unresolved: { requiredMosShift: 0 } },
    valuation: { horizonYears: 5, distributionRate: 0, conservativeExitMultiple: 10 },
    thresholds: { minimumIndependentValuationFamilies: 2, maximumExtremeOvervaluationRatio: .5,
      maximumTerminalValueShare: .75, robustnessPassRate: .8, dataQuality: 85, minimumDecisionCoverage: .6, mrMarketScore: 65, noReratingIrr: .1 } };
  const input = { identity: { ticker: 'AAA' }, asOf: { market: '2026-08-27' }, archetype: 'unresolved',
    marketClock: { priceDamage: known(90), priceBusinessGap: known(80), priceValueGap: known(80), priceDamageCoverage: 1 },
    ownerClock: { businessDamage: known(10), businessDamageCoverage: 1 },
    valuation: { price: 20, ivFloor: 20, ivBase: 30, fragility: .2, terminalValueShare: .5,
      methods: [{ family: 'cash', floor: 20, base: 30 }, { family: 'earnings', floor: 20, base: 30 }] },
    survival: { minimumCash24m: pass, bearInterestCoverage: pass, maturityWall: pass, mandatoryEquityRaise: pass },
    reflexivity: pass, risks: {}, noReratingIrr: known(.1), structuralRisks: [], evidence: { quality: 95, blockers: [] } };
  const runtime = { snapshotId: 'snapshot-a', config, contexts: { aaa: { input, owner: { shares: 10, conservativeOwnerEarnings: 30, revenueGrowth: 0 } } } };
  const overlay = buildG820DailyPriceOverlay(index, [{ ticker: 'AAA', price: 14, asOf: '2026-09-01' }], '2026-09-02T00:00:00Z', runtime);
  assert.equal(overlay.companies.aaa.assessment.dualKey.chapter20, true);
  const merged = mergeG820DailyPriceOverlay(index, overlay);
  assert.equal(merged.companies[0].chapter20, true);
  assert.equal(merged.meta.coverage.chapter20Pass, 1);
  const expensive = buildG820DailyPriceOverlay(index, [{ ticker: 'AAA', price: 100, asOf: '2026-09-01' }], '2026-09-02T00:00:00Z', runtime);
  assert.equal(expensive.companies.aaa.assessment.dualKey.chapter20, false);
  assert.equal(expensive.companies.aaa.assessment.valuation.ivFloor, 20);
});
