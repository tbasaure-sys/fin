// Local QA provider only. Never imported by production code.
import http from 'node:http';
const source = { id: 'synthetic-filing', label: 'Synthetic QA filing (not a real company)', url: 'https://example.org/synthetic-filing', publishedAt: '2026-08-01', type: 'primary', accession: 'synthetic' };
const fact = (value, unit = 'USD') => ({ value, unit, currency: unit === 'shares' ? null : 'USD', asOf: '2026-06-30', periodStart: '2025-07-01', availableOn: '2026-08-01', sources: [source], provenance: 'observed' });
const quote = provider => ({ ...fact(30), asOf: '2026-10-06', availableOn: '2026-10-06', adjustment: 'unadjusted', sources: [{ id: provider, provider, label: `Synthetic ${provider} quote`, url: `https://example.org/${provider}`, type: 'market', publishedAt: '2026-10-06' }] });
const payload = ticker => ({ ok: true, ticker, company_profile: { ticker, name: 'Synthetic QA Company', currency: 'USD', sector: ticker === 'SYNBANK' ? 'Financial' : 'Software', industry: ticker === 'SYNBANK' ? 'Bank' : 'Software' }, reading_evidence: { shareBasis: { splitCheckedThrough: '2026-10-06', splitFactorSinceBalance: 1, shareClass: 'common', sources: [source] }, identity: { ticker, currency: 'USD', exchange: 'QA', instrumentType: 'EQUITY' }, business: { summary: 'Synthetic subscription business for automated QA. No real issuer or investment claim.', asOf: '2026-06-30', sources: [source], segments: [] }, facts: { price: quote('provider-one'), priceCrosscheck: quote('provider-two'), revenue: fact(1000), operatingIncome: fact(200), cfo: fact(180), capex: fact(40), cash: fact(100), shortTermDebt: fact(20), currentLongTermDebt: fact(30), longTermDebt: fact(50), debt: fact(100), financeLeases: fact(10), sharesOutstanding: fact(100, 'shares'), dilutedShares: fact(102, 'shares') } } });
http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const ticker = url.searchParams.get('ticker');
  if (!['SYNTH', 'SYNBANK'].includes(ticker)) { response.writeHead(503); response.end('{}'); return; }
  response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(payload(ticker)));
}).listen(Number(process.env.BLS_READING_TEST_PROVIDER_PORT || 3120), '127.0.0.1', () => process.stdout.write('Synthetic QA provider ready\n'));
