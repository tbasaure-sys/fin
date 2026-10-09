import { READING_FACT_LABELS, missingResearchPoint } from './research-snapshot.js';

const durationDays = row => (Date.parse(row.end) - Date.parse(row.start)) / 86400000;
// Aliases describe the same quantity. Conflicting values block selection.
const tags = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'],
  operatingIncome: ['OperatingIncomeLoss'], cfo: ['NetCashProvidedByUsedInOperatingActivities'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment'],
  cash: ['CashCashEquivalentsAndShortTermInvestments'], shortTermDebt: ['CommercialPaper', 'ShortTermBorrowings'],
  currentLongTermDebt: ['LongTermDebtCurrent'], longTermDebt: ['LongTermDebtNoncurrent'],
  dilutedShares: ['WeightedAverageNumberOfDilutedSharesOutstanding'], sharesOutstanding: ['CommonStockSharesOutstanding'],
  operatingLeases: ['OperatingLeaseLiability'],
};
export function evidenceFromSec({ ticker, companyFacts, submissions, cutoff, quotes = {}, businessExcerpt = null }) {
  const recent = submissions.filings?.recent || {};
  const filings = (recent.form || []).map((form, i) => ({ form, accession: recent.accessionNumber[i], end: recent.reportDate[i], filed: recent.filingDate[i], document: recent.primaryDocument[i] })).filter(f => f.form === '10-K' && f.filed <= cutoff && f.end <= cutoff).sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed));
  const filing = filings[0];
  const facts = Object.fromEntries(Object.entries(READING_FACT_LABELS).map(([key, label]) => [key, missingResearchPoint(label)]));
  Object.assign(facts, quotes);
  const issues = [];
  if (!filing) return { facts, issues: [{ key: 'filing', message: 'No hay un 10-K publicado antes del corte; las taxonomías extranjeras requieren otro adaptador.' }], identity: { ticker, currency: null, exchange: null, instrumentType: null } };
  const cik = String(Number(submissions.cik));
  const source = { id: `sec:${filing.accession}`, label: `${submissions.name} · 10-K ${filing.end}`, url: `https://www.sec.gov/Archives/edgar/data/${cik}/${filing.accession.replaceAll('-', '')}/${filing.document}`, publishedAt: filing.filed, type: 'primary', provider: 'sec-edgar', accession: filing.accession };
  const concepts = companyFacts.facts?.['us-gaap'] || {};
  const currencies = [...new Set(tags.revenue.flatMap(tag => Object.entries(concepts[tag]?.units || {}).filter(([unit, rows]) => /^[A-Z]{3}$/.test(unit) && rows.some(r => r.accn === filing.accession && r.end === filing.end && durationDays(r) >= 330 && durationDays(r) <= 400)).map(([unit]) => unit)))];
  const currency = currencies.length === 1 ? currencies[0] : null;
  function pick(aliases, end = filing.end, annual = false, label = '') {
    const unit = aliases.some(tag => /SharesOutstanding/.test(tag)) ? 'shares' : currency;
    const candidates = aliases.flatMap(tag => (concepts[tag]?.units?.[unit] || []).filter(r => r.accn === filing.accession && r.end === end && r.filed === filing.filed && (!annual || durationDays(r) >= 330 && durationDays(r) <= 400) && typeof r.val === 'number' && Number.isFinite(r.val)).map(r => ({ ...r, tag })));
    if (!candidates.length || new Set(candidates.map(r => r.val)).size !== 1) return missingResearchPoint(label, candidates.length ? 'Los conceptos XBRL candidatos no concilian; requiere revisión del filing.' : 'No publicado con un concepto estándar comparable en este filing.');
    const row = candidates[0];
    return { value: row.val, label, unit, currency: unit === 'shares' ? null : currency, asOf: row.end, availableOn: row.filed, sources: [source], provenance: 'observed', concept: row.tag, periodStart: row.start || null, accession: row.accn };
  }
  for (const [key, aliases] of Object.entries(tags)) facts[key] = pick(aliases, filing.end, ['revenue', 'operatingIncome', 'cfo', 'capex', 'dilutedShares'].includes(key), READING_FACT_LABELS[key]);
  const previousEnd = `${Number(filing.end.slice(0, 4)) - 1}${filing.end.slice(4)}`;
  facts.priorRevenue = pick(tags.revenue, previousEnd, true, READING_FACT_LABELS.priorRevenue);
  function sum(points, label, formula) {
    if (points.some(p => p.value === null)) return missingResearchPoint(label, 'Falta algún componente; no se trata como cero.');
    return { ...points[0], label, value: points.reduce((total, p) => total + p.value, 0), provenance: 'calculated', formula, inputRefs: points.map(p => ({ key: p.concept, asOf: p.asOf, availableOn: p.availableOn, sources: p.sources })) };
  }
  if (facts.cash.value === null) facts.cash = sum([pick(['CashAndCashEquivalentsAtCarryingValue']), pick(['ShortTermInvestments', 'MarketableSecuritiesCurrent'])], READING_FACT_LABELS.cash, 'Caja y equivalentes + inversiones de corto plazo explícitas, del mismo filing.');
  facts.debt = sum(['shortTermDebt', 'currentLongTermDebt', 'longTermDebt'].map(key => facts[key]), READING_FACT_LABELS.debt, 'Deuda de corto plazo + porción corriente + deuda no corriente.');
  facts.financeLeases = sum([pick(['FinanceLeaseLiabilityCurrent']), pick(['FinanceLeaseLiabilityNoncurrent'])], READING_FACT_LABELS.financeLeases, 'Leasing financiero corriente + no corriente. Se mantiene separado de la deuda financiera.');
  Object.assign(facts, quotes);
  const index = submissions.tickers?.indexOf(ticker) ?? -1;
  if (index < 0 || Number(companyFacts.cik) !== Number(submissions.cik)) issues.push({ key: 'issuer', message: 'El ticker, CIK y filing no resuelven la misma identidad.' });
  if (!currency) issues.push({ key: 'currency', message: 'La moneda XBRL es ambigua o no está disponible.' });
  const summary = businessExcerpt ? `El filing describe el negocio así (extracto original): ${businessExcerpt}` : 'Falta extraer la descripción del negocio del filing. No se sustituye por una descripción generada.';
  return { facts, issues, activity: submissions.sicDescription || null, identity: { ticker, cik, name: submissions.name, currency, exchange: index >= 0 ? submissions.exchanges?.[index] || null : null, instrumentType: 'EQUITY' }, business: { summary, asOf: filing.end, sources: businessExcerpt ? [source] : [], segments: [], filingUrl: source.url }, history: {} };
}
