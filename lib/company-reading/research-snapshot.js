import { buildCompanyFingerprint, buildValuationPlan } from '../aurora/company-fingerprint.js';
import { READING_ASSUMPTIONS } from './snapshots.js';
import { evaluateOperatingDcf } from '../aurora/operating-dcf.js';

export const READING_FACT_LABELS = Object.freeze({ price: 'Cierre observado', priceCrosscheck: 'Segundo registro de cierre', revenue: 'Ingresos anuales', priorRevenue: 'Ingresos del año anterior', operatingIncome: 'Resultado operativo', cfo: 'Flujo de caja operativo', capex: 'Compras de propiedad y equipo (caja)', cash: 'Caja no operativa conciliada', shortTermDebt: 'Deuda de corto plazo', currentLongTermDebt: 'Porción corriente de deuda de largo plazo', longTermDebt: 'Deuda no corriente', debt: 'Deuda financiera', financeLeases: 'Leasing financiero no incluido en deuda', operatingLeases: 'Leasing operativo', sharesOutstanding: 'Acciones en circulación al cierre fiscal', dilutedShares: 'Promedio anual de acciones diluidas' });
export const missingResearchPoint = (label, reason = 'No hay evidencia con fuente, unidad y fechas verificables.') => ({ value: null, label, unit: null, currency: null, asOf: null, availableOn: null, sources: [], provenance: 'missing', reason });
const clone = v => JSON.parse(JSON.stringify(v));
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
function publicSource(source) {
  let url = null;
  try {
    const parsed = new URL(source.url);
    if (parsed.protocol === 'https:') { parsed.username = ''; parsed.password = ''; for (const key of [...parsed.searchParams.keys()]) if (/^(api[_-]?key|token|access_token|secret|password|signature)$/i.test(key)) parsed.searchParams.delete(key); url = parsed.toString(); }
  } catch { /* An invalid URL remains missing and cannot pass the evidence gate. */ }
  return Object.fromEntries(Object.entries({ id: source.id, label: source.label, url, publishedAt: source.publishedAt, type: source.type, provider: source.provider, accession: source.accession }).filter(([, v]) => v !== undefined));
}
function publicEvidence(value) {
  if (Array.isArray(value)) return value.map(publicEvidence);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(api[_-]?key|authorization|access_token|secret|password)$/i.test(key)).map(([key, v]) => [key, key === 'sources' && Array.isArray(v) ? v.map(publicSource) : publicEvidence(v)]));
}
const fields = { revenue: 'revenue', priorRevenue: 'prior_revenue', operatingIncome: 'operating_income', cfo: 'cash_from_operations', capex: 'capital_expenditures', cash: 'cash', shortTermDebt: 'short_term_debt', currentLongTermDebt: 'current_long_term_debt', longTermDebt: 'long_term_debt', debt: 'total_debt', financeLeases: 'lease_liabilities_not_in_debt', operatingLeases: 'operating_lease_liabilities', sharesOutstanding: 'shares_outstanding', dilutedShares: 'diluted_shares', price: 'current_price', priceCrosscheck: 'independent_close' };

// Legacy backend points are admitted only with their own units and publication context.
// Coverage scores, valuation priors and retrieval dates cannot substitute for that context.
function legacyFacts(payload) {
  const points = payload.sources?.data_points || [], records = payload.sources?.records || [];
  const annual = [...(payload.financials?.annual || [])].filter(r => date(r.date)).sort((a, b) => b.date.localeCompare(a.date))[0];
  const result = {};
  for (const [key, field] of Object.entries(fields)) {
    const candidates = points.filter(p => p.metric === field || (annual && p.metric === `financials.annual.${annual.fiscal_year || annual.date}.${field}`));
    if (candidates.length !== 1) continue;
    const p = candidates[0];
    if (p.claim_tag !== 'sourced_fact' || typeof p.normalized_value !== 'number' || !p.unit || !date(p.as_of) || !date(p.available_on)) continue;
    const refs = (p.source_ids || [p.source_id]).map(id => records.find(r => r.source_id === id));
    if (!refs.length || refs.some(r => !r || r.status !== 'ok' || !date(r.published_at))) continue;
    const sources = refs.map(r => publicSource({ id: r.source_id, provider: r.provider, label: r.label || r.provider, url: r.document_url || r.url, publishedAt: r.published_at, type: r.type, accession: r.accession_number }));
    result[key] = { value: p.normalized_value, unit: p.unit, currency: p.currency ?? null, asOf: p.as_of, availableOn: p.available_on, sources, provenance: 'observed', adjustment: p.adjustment };
  }
  return result;
}
export function snapshotFromResearch(ticker, payload = {}, { cutoff = new Date().toISOString().slice(0, 10), capturedAt = new Date().toISOString() } = {}) {
  const evidence = publicEvidence(payload.reading_evidence || {}), profile = payload.company_profile || {};
  const facts = Object.fromEntries(Object.entries(READING_FACT_LABELS).map(([key, label]) => [key, evidence.facts?.[key] ? { ...clone(evidence.facts[key]), label } : missingResearchPoint(label)]));
  if (!payload.reading_evidence) Object.assign(facts, legacyFacts(payload));
  const identity = evidence.identity || { ticker: payload.ticker, currency: profile.currency, exchange: profile.exchange, instrumentType: profile.instrument_type };
  const identityIssues = [];
  if (payload.ticker !== ticker || identity.ticker !== ticker || (profile.ticker && profile.ticker !== ticker)) identityIssues.push({ key: 'identity', message: 'La identidad del emisor no corresponde al ticker solicitado.' });
  if (!identity.exchange || !['EQUITY', 'ADR'].includes(identity.instrumentType)) identityIssues.push({ key: 'security', message: 'Falta resolver bolsa y tipo de acción; no se valora un instrumento ambiguo.' });
  if (identity.instrumentType === 'ADR') identityIssues.push({ key: 'adr_ratio', message: 'Un ADR requiere conciliar el ratio de conversión con las acciones del emisor. Este motor se abstiene.' });
  const history = evidence.history || {};
  const fingerprint = buildCompanyFingerprint({ profile: { ...profile, ticker, industry: profile.industry || evidence.activity || null }, financials: { revenue: facts.revenue.value, freeCashFlow: typeof facts.cfo.value === 'number' && typeof facts.capex.value === 'number' ? facts.cfo.value - facts.capex.value : null, cash: facts.cash.value, debt: facts.debt.value }, history });
  const plan = buildValuationPlan(fingerprint);
  const supported = ['mature_compounder', 'asset_light_growth', 'asset_heavy', 'general'].includes(plan.archetype);
  if (!profile.sector && !profile.industry && !evidence.activity) identityIssues.push({ key: 'classification', message: 'Falta evidencia para clasificar el negocio y elegir un método de valoración.' });
  const assumptionDefinitions = Object.fromEntries(Object.entries(READING_ASSUMPTIONS).map(([key, d]) => [key, { ...d, value: null, ...(key === 'growth' ? { min: -.5, max: 1 } : key === 'margin' ? { min: 0, max: .8 } : {}) }]));
  const units = evidence.unitEconomics || {};
  const unitEconomics = Object.keys(units).length ? clone(units) : { retention: missingResearchPoint('Retención y monetización por cliente'), acquisition: missingResearchPoint('Costo de adquisición y valor por cliente'), incrementalReturns: missingResearchPoint('Retorno de la reinversión incremental') };
  const business = evidence.business?.sources?.length ? clone(evidence.business) : { summary: 'La descripción del negocio aún necesita una fuente primaria fechada. Las preguntas siguientes orientan la investigación; no sustituyen evidencia.', sources: [], asOf: null, segments: [] };
  const fiscalEnd = facts.revenue.asOf;
  const fiscalDue = date(fiscalEnd) ? (() => { const year = Number(fiscalEnd.slice(0, 4)) + 1, month = Number(fiscalEnd.slice(5, 7)); const day = Math.min(Number(fiscalEnd.slice(8)), new Date(Date.UTC(year, month, 0)).getUTCDate()); return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; })() : null;
  return { schema: 'company_reading_snapshot_v2', id: null, ticker, name: profile.name || identity.name || ticker, currency: identity.currency || null, cutoff, authoredAt: capturedAt.slice(0, 10), capturedAt, mode: 'prospective', disclosure: 'Lectura capturada con las fuentes disponibles a esta fecha. Las hipótesis se declaran explícitamente; guardar registra la fecha real de la tesis.', facts, business, unitEconomics, identity, shareBasis: clone(evidence.shareBasis || null), evidenceIssues: [...identityIssues, ...(evidence.issues || []), ...(!supported ? [{ key: 'method', message: `El negocio requiere ${plan.primaryMethod}. Ese método no está validado en esta lectura; se conserva la investigación y se omite el rango.` }] : [])], fingerprint, valuationPlan: { ...plan, supported, implementedMethod: supported ? 'normalized_fcff_dcf' : null }, history: clone(history), assumptionDefinitions, assumptionSource: { id: 'unconfigured-hypotheses', label: 'Hipótesis aún no declaradas', url: null, type: 'assumption', publishedAt: capturedAt.slice(0, 10) }, scenarios: null, nextFiscalEnd: fiscalDue, filingAccession: facts.revenue.sources?.[0]?.accession || null, researchQuestions: plan.researchQuestions, quality: { provider: payload.reading_evidence ? 'source_evidence' : 'canonical_backend', capturedAt } };
}
export function configureResearchHypotheses(snapshot, policy) {
  if (!policy || !['central', 'adverse', 'favorable'].every(name => policy[name] && typeof policy[name] === 'object')) throw new Error('Declara los tres escenarios completos.');
  const definitions = snapshot.assumptionDefinitions || READING_ASSUMPTIONS;
  const scenarios = {};
  for (const name of ['central', 'adverse', 'favorable']) {
    scenarios[name] = { years: 10 };
    for (const [key, d] of Object.entries(definitions)) {
      const value = policy[name][key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < d.min || value > d.max) throw new Error(`${name}: hipótesis fuera de dominio o faltante (${d.label}).`);
      scenarios[name][key] = value;
    }
    if (scenarios[name].discountRate - scenarios[name].terminalGrowth < .005 || scenarios[name].terminalRoic <= scenarios[name].terminalGrowth) throw new Error(`${name}: descuento y ROIC deben superar el crecimiento terminal.`);
  }
  const reason = String(policy.rationale || '').trim().slice(0, 1200);
  if (reason.length < 20) throw new Error('Falta el fundamento de las hipótesis y la evidencia que permitiría refutarlas.');
  const inputs = { revenue: snapshot.facts.revenue.value, cash: snapshot.facts.cash.value, debt: snapshot.facts.debt.value, financeLeases: snapshot.facts.financeLeases.value, shares: snapshot.facts.dilutedShares.value };
  if (Object.values(inputs).every(v => typeof v === 'number' && Number.isFinite(v)) && inputs.revenue > 0 && inputs.shares > 0) {
    const central = evaluateOperatingDcf(inputs, scenarios.central).valuePerShare;
    if (!(evaluateOperatingDcf(inputs, scenarios.adverse).valuePerShare < central && evaluateOperatingDcf(inputs, scenarios.favorable).valuePerShare > central)) throw new Error('El escenario adverso debe valer menos que el central y el favorable más. No se ajustan resultados para forzar ese orden.');
  }
  const next = { ...clone(snapshot), evidenceIssues: (snapshot.evidenceIssues || []).filter(i => i.key !== 'engine_policy'), assumptionDefinitions: Object.fromEntries(Object.entries(definitions).map(([key, d]) => [key, { ...d, value: scenarios.central[key], basis: 'user-declared' }])), assumptionSource: { id: 'user-declared-hypotheses-v1', label: 'Hipótesis declaradas por el investigador', url: null, type: 'assumption', publishedAt: snapshot.authoredAt, rationale: reason }, scenarios: { adverse: scenarios.adverse, favorable: scenarios.favorable }, criteria: { growth: scenarios.central.growth, margin: scenarios.central.margin, reinvestment: scenarios.central.reinvestment } };
  return next;
}
export function applyEngineResearchPolicy(snapshot, policy) {
  if (policy?.numericalOrigin !== 'deterministic' || !policy.modelVersion) throw new Error('La política debe proceder de un motor determinista identificado.');
  const configured = configureResearchHypotheses(snapshot, policy);
  for (const key of Object.keys(configured.assumptionDefinitions)) {
    const p = policy.points?.[key];
    if (!p?.formula || !date(p.asOf) || p.asOf > snapshot.cutoff || !p.sources?.length || !p.inputRefs?.length || p.inputRefs.some(ref => !snapshot.facts[ref] || snapshot.facts[ref].value === null) || p.sources.some(s => !s.id || !/^https:\/\//.test(s.url || '') || !date(s.publishedAt) || s.publishedAt > snapshot.cutoff)) throw new Error(`Falta evidencia fechada y fundamento para la hipótesis ${key}.`);
    configured.assumptionDefinitions[key] = { ...configured.assumptionDefinitions[key], formula: p.formula, asOf: p.asOf, sources: p.sources.map(publicSource), inputRefs: clone(p.inputRefs), basis: 'engine-assumption' };
  }
  configured.assumptionSource = { id: `engine-policy:${policy.modelVersion}`, label: `Hipótesis del motor ${policy.modelVersion}`, publishedAt: snapshot.authoredAt, type: 'assumption', url: null, rationale: policy.rationale };
  return configured;
}
