import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceFromSec } from '../lib/company-reading/sec-evidence.js';

function fixture() {
  const entry = (val, start) => ({ val, start, end: '2026-06-30', filed: '2026-08-01', accn: '0000000001-26-000001', form: '10-K' });
  const concepts = { RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [entry(100, '2025-07-01'), entry(30, '2026-04-01')] } }, OperatingIncomeLoss: { units: { USD: [entry(20, '2025-07-01')] } }, CommercialPaper: { units: { USD: [entry(2)] } }, LongTermDebtCurrent: { units: { USD: [entry(3)] } }, LongTermDebtNoncurrent: { units: { USD: [entry(5)] } }, FinanceLeaseLiabilityCurrent: { units: { USD: [entry(1)] } }, FinanceLeaseLiabilityNoncurrent: { units: { USD: [entry(4)] } } };
  return { ticker: 'TEST', cutoff: '2026-10-07', companyFacts: { cik: 1, facts: { 'us-gaap': concepts } }, submissions: { cik: 1, name: 'Synthetic issuer', tickers: ['TEST'], exchanges: ['TEST'], filings: { recent: { form: ['10-K'], accessionNumber: ['0000000001-26-000001'], reportDate: ['2026-06-30'], filingDate: ['2026-08-01'], primaryDocument: ['report.htm'] } } } };
}
test('SEC selection preserves filing context, duration, absolute units and debt bridge', () => {
  const e = evidenceFromSec(fixture());
  assert.equal(e.facts.revenue.value, 100);
  assert.equal(e.facts.revenue.unit, 'USD');
  assert.equal(e.facts.revenue.availableOn, '2026-08-01');
  assert.equal(e.facts.debt.value, 10);
  assert.equal(e.facts.financeLeases.value, 5);
  assert.equal(e.facts.cfo.value, null);
  assert.equal(e.facts.revenue.sources[0].url, 'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/report.htm');
});
test('SEC never selects a subsequent restatement, ambiguous alias or missing debt as zero', () => {
  const f = fixture();
  f.companyFacts.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD.push({ val: 999, start: '2025-07-01', end: '2026-06-30', filed: '2027-08-01', accn: 'later', form: '10-K' });
  delete f.companyFacts.facts['us-gaap'].CommercialPaper;
  let e = evidenceFromSec(f);
  assert.equal(e.facts.revenue.value, 100);
  assert.equal(e.facts.debt.value, null);
  f.companyFacts.facts['us-gaap'].Revenues = { units: { USD: [{ val: 80, start: '2025-07-01', end: '2026-06-30', filed: '2026-08-01', accn: '0000000001-26-000001', form: '10-K' }] } };
  assert.equal(evidenceFromSec(f).facts.revenue.value, null);
});
