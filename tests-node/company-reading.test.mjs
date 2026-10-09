import assert from 'node:assert/strict';
import test from 'node:test';
import { getCompanyReadingSnapshot, MSFT_FY25_EVIDENCE } from '../lib/company-reading/snapshots.js';
import { buildCompanyReading, compareLaterEvidence } from '../lib/company-reading/engine.js';
import { evaluateOperatingDcf } from '../lib/aurora/operating-dcf.js';

const snapshot = () => structuredClone(getCompanyReadingSnapshot('MSFT'));
test('FCFF bridge has an independently calculable one-year value and retains negative equity', () => {
  const input = { revenue: 100, cash: 10, debt: 20, financeLeases: 5, shares: 10 };
  const assumptions = { growth: .1, margin: .4, taxRate: .25, reinvestment: .2, discountRate: .1, terminalGrowth: .02, terminalRoic: .2, dilution: 0, years: 1 };
  const result = evaluateOperatingDcf(input, assumptions);
  const fcff = 110 * .4 * .75 * .8;
  const terminal = 110 * .4 * .75 * 1.02 * .9 / .08;
  assert.ok(Math.abs(result.valuePerShare - ((fcff + terminal) / 1.1 - 15) / 10) < 1e-10);
  assert.ok(evaluateOperatingDcf({ ...input, debt: 1000 }, assumptions).valuePerShare < 0);
});
test('traced reading solves the same DCF backwards and distinguishes current from diluted shares', () => {
  const reading = buildCompanyReading(snapshot());
  assert.equal(reading.status, 'research');
  assert.equal(reading.facts.price.value, 418.35);
  assert.equal(reading.facts.sharesOutstanding.value, 7434e6);
  assert.equal(reading.facts.dilutedShares.value, 7469e6);
  assert.equal(reading.facts.debt.value, (6693 + 2249 + 42688) * 1e6);
  assert.equal(reading.facts.netDebt.value, (51630 + 27145 - 75543) * 1e6);
  assert.equal(reading.unitEconomics.cac.value, null);
  const inverse = evaluateOperatingDcf(reading.modelInputs, { ...reading.assumptions, growth: reading.impliedGrowth.value });
  assert.ok(Math.abs(inverse.valuePerShare - reading.facts.price.value) < .00001);
  for (const value of [reading.valuation.central, reading.valuation.low, reading.valuation.high, reading.impliedGrowth, reading.adverse.value, reading.portfolio.contribution]) {
    assert.ok(value.asOf && value.sources.length && value.formula && value.inputRefs.length);
  }
});
test('null, missing currency, future publication, adjusted quotes and unmatched balances force abstention', () => {
  for (const change of [s => { s.facts.debt.value = null; }, s => { s.facts.debt.value = 44937e6; }, s => { s.facts.price.currency = 'EUR'; }, s => { s.facts.revenue.availableOn = '2025-01-01'; }, s => { s.facts.price.adjustment = 'dividend-adjusted'; }, s => { s.facts.cash.asOf = '2023-06-30'; }]) {
    const s = snapshot(); change(s);
    const r = buildCompanyReading(s);
    assert.equal(r.status, 'abstain');
    assert.equal(r.valuation, null);
    assert.equal(r.impliedGrowth.value, null);
    assert.equal(r.portfolio.contribution.value, null);
    assert.ok(r.blockers.length);
  }
});
test('hypothesis changes invalidate identified conclusions, change sensitivity and bind narration to the run', () => {
  const before = buildCompanyReading(snapshot());
  const after = buildCompanyReading(snapshot(), { growth: .02, margin: .3, reinvestment: .5 });
  assert.notEqual(after.runId, before.runId);
  assert.ok(after.valuation.central.value < before.valuation.central.value);
  assert.ok(after.conclusions.some(c => c.baselineHolds && !c.holds));
  assert.equal(after.narration.runId, after.runId);
  assert.equal(after.narration.snapshotId, after.snapshotId);
  assert.ok(after.sensitivity.every(s => s.low.value < s.high.value));
  assert.throws(() => buildCompanyReading(snapshot(), { discountRate: .02, terminalGrowth: .04 }), /descuento/i);
  assert.throws(() => buildCompanyReading(snapshot(), { growth: null }), /hipótesis/i);
});
test('later evidence assesses frozen expectations without leaking into original valuation', () => {
  const reading = buildCompanyReading(snapshot());
  const frozen = JSON.stringify(reading);
  const assessment = compareLaterEvidence(reading, MSFT_FY25_EVIDENCE, '2026-10-07T12:00:00Z');
  assert.ok(assessment.checks.some(c => c.status === 'refuted'));
  assert.equal(assessment.eligibleForecast, false);
  assert.equal(JSON.stringify(reading), frozen);
  assert.throws(() => compareLaterEvidence(reading, { ...MSFT_FY25_EVIDENCE, ticker: 'AAPL' }), /empresa/i);
});
test('unknown companies remain missing and portfolio weights have bounded, proportional effects', () => {
  assert.equal(buildCompanyReading(getCompanyReadingSnapshot('UNKNOWN')).status, 'abstain');
  const a = buildCompanyReading(snapshot(), {}, { weight: .1 });
  const b = buildCompanyReading(snapshot(), {}, { weight: .2 });
  assert.equal(b.portfolio.contribution.value, a.portfolio.contribution.value * 2);
  assert.throws(() => buildCompanyReading(snapshot(), {}, { weight: 1.1 }), /peso/i);
});
