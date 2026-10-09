import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotFromResearch, configureResearchHypotheses, applyEngineResearchPolicy } from '../lib/company-reading/research-snapshot.js';
import { buildCompanyReading, compareLaterEvidence } from '../lib/company-reading/engine.js';
import { getCompanyReadingSnapshot, READING_ASSUMPTIONS } from '../lib/company-reading/snapshots.js';

// Synthetic issuer used only in tests. Values are not published as company evidence.
export function researchFixture() {
  const base = structuredClone(getCompanyReadingSnapshot('MSFT'));
  const source = { id: 'test-filing', label: 'Synthetic annual filing', url: 'https://example.org/filing', publishedAt: '2026-08-01', type: 'primary', accession: 'test' };
  const facts = Object.fromEntries(Object.entries(base.facts).map(([key, p]) => [key, { ...p, asOf: key.startsWith('price') ? '2026-10-06' : key === 'priorRevenue' ? '2025-06-30' : '2026-06-30', availableOn: key.startsWith('price') ? '2026-10-06' : '2026-08-01', sources: key.startsWith('price') ? [{ ...source, id: key, provider: key, type: 'market', publishedAt: '2026-10-06' }] : [source] }]));
  for (const key of ['revenue', 'operatingIncome', 'cfo', 'capex', 'dilutedShares']) facts[key].periodStart = '2025-07-01';
  return { ticker: 'TEST', company_profile: { ticker: 'TEST', name: 'Synthetic Software', currency: 'USD', sector: 'Software' }, reading_evidence: { facts, shareBasis: { splitCheckedThrough: '2026-10-06', splitFactorSinceBalance: 1, shareClass: 'common', sources: [source] }, business: { summary: 'Synthetic subscription business.', asOf: '2026-06-30', sources: [source], segments: [] }, identity: { ticker: 'TEST', currency: 'USD', exchange: 'TEST', instrumentType: 'EQUITY' } } };
}
const options = { cutoff: '2026-10-07', capturedAt: '2026-10-07T10:00:00.000Z' };
const policies = () => ({ rationale: 'Synthetic policy for numerical verification; not company evidence.', central: Object.fromEntries(Object.entries(READING_ASSUMPTIONS).map(([k, d]) => [k, d.value])), adverse: getCompanyReadingSnapshot('MSFT').scenarios.adverse, favorable: getCompanyReadingSnapshot('MSFT').scenarios.favorable });
test('any covered issuer starts without copied Microsoft hypotheses; missing assumptions suppress valuation', () => {
  const s = snapshotFromResearch('TEST', researchFixture(), options);
  assert.equal(s.ticker, 'TEST');
  assert.equal(s.assumptionDefinitions.discountRate.value, null);
  const r = buildCompanyReading(s);
  assert.equal(r.status, 'partial');
  assert.equal(r.valuation, null);
  assert.equal(r.facts.revenue.value, 245122e6);
  assert.ok(r.blockers.some(b => b.key === 'hypotheses'));
});
test('a deterministic backend policy requires dated evidence for every hypothesis; language-generated policy is rejected', () => {
  const snapshot = snapshotFromResearch('TEST', researchFixture(), options);
  const values = policies();
  const points = Object.fromEntries(Object.keys(values.central).map(key => [key, { basis: 'model_assumption', formula: 'Explicit synthetic QA policy', asOf: '2026-10-07', sources: snapshot.facts.revenue.sources, inputRefs: ['revenue', 'operatingIncome'] }]));
  const policy = { ...values, numericalOrigin: 'deterministic', modelVersion: 'test-policy-v1', points };
  policy.points.growth.value = 999; policy.points.growth.min = 100;
  assert.equal(applyEngineResearchPolicy(snapshot, policy).assumptionDefinitions.growth.value, policy.central.growth);
  assert.equal(applyEngineResearchPolicy(snapshot, policy).assumptionDefinitions.growth.min, -.5);
  assert.equal(buildCompanyReading(applyEngineResearchPolicy(snapshot, policy)).status, 'research');
  assert.throws(() => applyEngineResearchPolicy(snapshot, { ...policy, numericalOrigin: 'llm' }), /determinista/i);
  delete policy.points.discountRate;
  assert.throws(() => applyEngineResearchPolicy(snapshot, policy), /hipótesis|evidencia/i);
});
test('provider credentials never travel with source links in public snapshots', () => {
  const p = researchFixture();
  p.reading_evidence.facts.price.sources[0].url = 'https://user:password@example.org/quote?symbol=TEST&apikey=private-key&token=private-token';
  const s = snapshotFromResearch('TEST', p, options);
  assert.equal(s.facts.price.sources[0].url, 'https://example.org/quote?symbol=TEST');
  assert.equal(JSON.stringify(s).includes('private-key'), false);
});
test('declared hypotheses enable deterministic reading with issuer-specific criteria, fiscal dates and narration', () => {
  const s = configureResearchHypotheses(snapshotFromResearch('TEST', researchFixture(), options), policies());
  const r = buildCompanyReading(s);
  assert.equal(r.status, 'research');
  assert.equal(r.expectations[0].due, '2027-06-30');
  assert.equal(r.conclusions.find(c => c.id === 'margin').threshold, r.assumptions.margin);
  assert.ok(!JSON.stringify(r.narration).includes('Azure'));
  assert.equal(r.narration.runId, r.runId);
  assert.equal(buildCompanyReading(s, { margin: .2 }).conclusions.find(c => c.id === 'margin').holds, false);
  const invalid = policies(); invalid.adverse = { ...invalid.central };
  assert.throws(() => configureResearchHypotheses(snapshotFromResearch('TEST', researchFixture(), options), invalid), /adverso/i);
});
test('identity mismatch, undocumented price crosscheck and unsupported sector cannot publish a range', () => {
  for (const change of [p => { p.ticker = 'OTHER'; }, p => { p.reading_evidence.facts.priceCrosscheck.sources = p.reading_evidence.facts.price.sources; }, p => { p.company_profile.sector = 'Banks'; p.company_profile.industry = 'Bank'; }]) {
    const p = researchFixture(); change(p);
    const r = buildCompanyReading(configureResearchHypotheses(snapshotFromResearch('TEST', p, options), policies()));
    assert.notEqual(r.status, 'research');
    assert.equal(r.valuation, null);
    assert.ok(r.blockers.length);
  }
});
test('market-only priors and numeric strings never become observed financial facts', () => {
  const p = researchFixture(); p.reading_evidence.facts.debt.value = '51630000000';
  assert.equal(buildCompanyReading(configureResearchHypotheses(snapshotFromResearch('TEST', p, options), policies())).valuation, null);
  const s = snapshotFromResearch('TEST', { ...p, reading_evidence: undefined, sources: { coverage: { status: 'market_only' }, data_points: [] } }, options);
  assert.equal(s.facts.revenue.value, null);
});
test('stale quotes, unverified share basis and split mismatches suppress an otherwise calculable valuation', () => {
  for (const change of [p => { delete p.reading_evidence.shareBasis; }, p => { p.reading_evidence.shareBasis.splitFactorSinceBalance = 4; }, p => { p.reading_evidence.facts.price.asOf = '2026-09-01'; p.reading_evidence.facts.priceCrosscheck.asOf = '2026-09-01'; }]) {
    const p = researchFixture(); change(p);
    const r = buildCompanyReading(configureResearchHypotheses(snapshotFromResearch('TEST', p, options), policies()));
    assert.equal(r.valuation, null);
    assert.ok(r.blockers.some(b => ['share_basis', 'price_stale'].includes(b.key)));
  }
});
test('a reconciled non-USD issuer retains its currency throughout outputs without implicit FX', () => {
  const p = researchFixture(); p.company_profile.currency = 'EUR'; p.reading_evidence.identity.currency = 'EUR';
  Object.values(p.reading_evidence.facts).forEach(f => { if (f.currency) { f.currency = 'EUR'; f.unit = 'EUR'; } });
  const r = buildCompanyReading(configureResearchHypotheses(snapshotFromResearch('TEST', p, options), policies()));
  assert.equal(r.status, 'research');
  assert.equal(r.valuation.central.unit, 'EUR/share');
  assert.equal(r.valuation.central.currency, 'EUR');
});
test('later partial evidence stays missing; forecast eligibility uses original commitment time', () => {
  const r = buildCompanyReading(configureResearchHypotheses(snapshotFromResearch('TEST', researchFixture(), options), policies()));
  const source = { id: 'later', label: 'Later filing', url: 'https://example.org/later', publishedAt: '2027-08-01' };
  const evidence = { id: 'later', ticker: 'TEST', asOf: '2027-06-30', availableOn: '2027-08-01', sources: [source], facts: { revenue: { value: r.facts.revenue.value * 1.2, currency: 'USD', unit: 'USD', periodStart: '2026-07-01', asOf: '2027-06-30', availableOn: '2027-08-01', sources: [source] } } };
  const result = compareLaterEvidence(r, evidence, '2027-08-02T12:00:00Z', '2026-10-07T12:00:00Z');
  assert.equal(result.eligibleForecast, true);
  assert.equal(result.checks.find(c => c.key === 'operating_margin').status, 'missing');
  assert.ok(Math.abs(result.checks[0].observed.value - .2) < 1e-12);
  const exactPolicy = policies(); exactPolicy.central.growth = .2;
  const exact = buildCompanyReading(configureResearchHypotheses(snapshotFromResearch('TEST', researchFixture(), options), exactPolicy));
  assert.equal(compareLaterEvidence(exact, evidence, '2027-08-02T12:00:00Z', '2026-10-07T12:00:00Z').checks[0].status, 'supported');
  assert.throws(() => compareLaterEvidence(r, { ...evidence, facts: { revenue: { ...evidence.facts.revenue, unit: 'shares' } } }, '2027-08-02T12:00:00Z'), /unidad|evidencia/i);
  assert.equal(compareLaterEvidence(r, { ...evidence, facts: { revenue: { ...evidence.facts.revenue, periodStart: '2027-04-01' } } }, '2027-08-02T12:00:00Z', '2026-10-07T12:00:00Z').checks[0].status, 'not_comparable');
});
