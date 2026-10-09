import { evaluateOperatingDcf, OPERATING_DCF_VERSION } from '../aurora/operating-dcf.js';
import { solveThesisBoundary } from '../breakpoint/solve-thesis-boundary.js';
import { companyScenarioContribution } from '../stress/company-contribution.js';
import { deriveFactorLabResearchDecision } from '../factorlab-four-lens.js';
import { READING_ASSUMPTIONS } from './snapshots.js';

const required = ['price', 'priceCrosscheck', 'revenue', 'operatingIncome', 'cfo', 'capex', 'cash', 'shortTermDebt', 'currentLongTermDebt', 'longTermDebt', 'debt', 'financeLeases', 'sharesOutstanding', 'dilutedShares'];
const balanceKeys = ['cash', 'shortTermDebt', 'currentLongTermDebt', 'longTermDebt', 'debt', 'financeLeases', 'sharesOutstanding'];
const validNumber = v => typeof v === 'number' && Number.isFinite(v);
const validDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const clone = v => JSON.parse(JSON.stringify(v));
export function stableSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableSerialize(value[k])}`).join(',')}}`;
}
function fingerprint(value) {
  const content = stableSerialize(value);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < content.length; i++) { a = Math.imul(a ^ content.charCodeAt(i), 16777619); b = Math.imul(b ^ content.charCodeAt(i), 33); }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
export function readingValue(point) {
  if (!point || !validNumber(point.value)) return 'No disponible';
  if (point.unit === 'percent') return new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 1 }).format(point.value);
  if (/^[A-Z]{3}\/share$/.test(point.unit)) return new Intl.NumberFormat('es-CL', { style: 'currency', currency: point.currency || point.unit.slice(0, 3), maximumFractionDigits: 2 }).format(point.value);
  if (/^[A-Z]{3}$/.test(point.unit)) {
    const size = Math.abs(point.value), scale = size >= 1e9 ? 1e9 : size >= 1e6 ? 1e6 : 1;
    if (scale === 1) return new Intl.NumberFormat('es-CL', { style: 'currency', currency: point.unit, maximumFractionDigits: 2 }).format(point.value);
    return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(point.value / scale)} ${scale === 1e9 ? 'mil millones' : 'millones'} ${point.unit}`;
  }
  if (point.unit === 'shares') return Math.abs(point.value) >= 1e6 ? `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(point.value / 1e6)} millones de acciones` : `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(point.value)} acciones`;
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(point.value)}${point.unit ? ` ${point.unit}` : ''}`;
}
export function validateReadingSnapshot(snapshot) {
  const blockers = [...(snapshot.evidenceIssues || [])];
  if (!validDate(snapshot.cutoff)) blockers.push({ key: 'cutoff', message: 'No hay fecha de corte verificable.' });
  if (!/^[A-Z]{3}$/.test(snapshot.currency || '')) blockers.push({ key: 'currency', message: 'Falta una moneda conciliada; no se aplica una conversión implícita.' });
  for (const key of required) {
    const p = snapshot.facts?.[key];
    if (!p || !validNumber(p.value)) { blockers.push({ key, message: `${p?.label || key}: dato faltante o no numérico.` }); continue; }
    if (!validDate(p.asOf) || !validDate(p.availableOn) || p.availableOn > snapshot.cutoff || p.asOf > snapshot.cutoff || p.availableOn < p.asOf) blockers.push({ key, message: `${p.label}: fecha incompatible con el corte.` });
    if (!p.sources?.length || p.sources.some(s => !s.id || !s.label || !/^https:\/\//.test(s.url || '') || !validDate(s.publishedAt) || s.publishedAt > snapshot.cutoff)) blockers.push({ key, message: `${p.label}: fuente fechada insuficiente.` });
    const shares = key === 'sharesOutstanding' || key === 'dilutedShares';
    if (shares ? p.unit !== 'shares' : p.currency !== snapshot.currency || p.unit !== snapshot.currency) blockers.push({ key, message: `${p.label}: moneda o unidad incompatible.` });
    if ((p.value < 0 && !['operatingIncome', 'cfo'].includes(key)) || (['price', 'priceCrosscheck', 'revenue', 'sharesOutstanding', 'dilutedShares'].includes(key) && p.value === 0)) blockers.push({ key, message: `${p.label}: valor fuera de dominio.` });
  }
  if (snapshot.facts?.price?.adjustment !== 'unadjusted' || snapshot.facts?.priceCrosscheck?.adjustment !== 'unadjusted') blockers.push({ key: 'price_basis', message: 'El precio debe ser un cierre sin ajustar por dividendos.' });
  const p = snapshot.facts?.price, q = snapshot.facts?.priceCrosscheck;
  if (validNumber(p?.value) && validNumber(q?.value) && (p.asOf !== q.asOf || Math.abs(p.value - q.value) > .01 || !q.sources?.some(s => !p.sources?.slice(0, 1).some(first => first.id === s.id)))) blockers.push({ key: 'price_reconciliation', message: 'Los registros independientes de precio no concilian en fecha o valor.' });
  const balanceDate = snapshot.facts?.cash?.asOf;
  if (balanceKeys.some(key => snapshot.facts?.[key]?.asOf !== balanceDate)) blockers.push({ key: 'balance_date', message: 'Caja, deuda, leasing y acciones al cierre deben pertenecer al mismo balance.' });
  const debts = ['shortTermDebt', 'currentLongTermDebt', 'longTermDebt'].map(key => snapshot.facts?.[key]?.value);
  if (debts.every(validNumber) && validNumber(snapshot.facts?.debt?.value) && Math.abs(debts.reduce((sum, v) => sum + v, 0) - snapshot.facts.debt.value) > 1) blockers.push({ key: 'debt_reconciliation', message: 'La deuda total no concilia con corto plazo, porción corriente y largo plazo.' });
  if (['operatingIncome', 'cfo', 'capex', 'dilutedShares'].some(key => snapshot.facts?.[key]?.asOf !== snapshot.facts?.revenue?.asOf)) blockers.push({ key: 'annual_date', message: 'Los inputs anuales deben compartir período.' });
  if (snapshot.business?.segments?.length && snapshot.business.segments.every(s => validNumber(s.value)) && validNumber(snapshot.facts?.revenue?.value) && Math.abs(snapshot.business.segments.reduce((sum, s) => sum + s.value, 0) - snapshot.facts.revenue.value) > 1) blockers.push({ key: 'segment_reconciliation', message: 'Los segmentos no concilian con ingresos consolidados.' });
  if (snapshot.schema === 'company_reading_snapshot_v2') {
    const business = snapshot.business;
    if (!business?.summary || !business?.sources?.length || !validDate(business.asOf) || business.asOf > snapshot.cutoff || business.sources.some(s => s.type !== 'primary' || !/^https:\/\//.test(s.url || '') || !validDate(s.publishedAt) || s.publishedAt > snapshot.cutoff)) blockers.push({ key: 'business', message: 'Falta una descripción del negocio con evidencia primaria fechada.' });
    for (const key of required.filter(k => !k.startsWith('price'))) {
      const point = snapshot.facts?.[key];
      if (validNumber(point?.value) && point.sources?.some(s => s.type !== 'primary')) blockers.push({ key: `${key}_primary`, message: `${point.label}: falta evidencia financiera primaria.` });
    }
    const annualStart = snapshot.facts?.revenue?.periodStart;
    for (const key of ['revenue', 'operatingIncome', 'cfo', 'capex', 'dilutedShares']) {
      const point = snapshot.facts?.[key];
      const days = (Date.parse(point?.asOf) - Date.parse(point?.periodStart)) / 86400000;
      if (validNumber(point?.value) && (!validDate(point.periodStart) || point.periodStart !== annualStart || days < 330 || days > 400)) blockers.push({ key: `${key}_period`, message: `${point.label}: falta conciliar la duración del período anual.` });
    }
    for (const point of [...(business?.segments || []), ...Object.values(snapshot.unitEconomics || {})]) {
      if (point.value === null) continue;
      if (!validNumber(point.value) || !point.unit || !validDate(point.asOf) || !validDate(point.availableOn) || point.availableOn > snapshot.cutoff || point.asOf > snapshot.cutoff || !point.sources?.length || point.sources.some(s => !s.id || !/^https:\/\//.test(s.url || '') || !validDate(s.publishedAt) || s.publishedAt > snapshot.cutoff)) blockers.push({ key: 'business_metric', message: `${point.label}: métrica sin contexto temporal o fuente verificable.` });
    }
    if (p?.sources?.[0]?.provider && q?.sources?.every(s => s.provider === p.sources[0].provider)) blockers.push({ key: 'price_independence', message: 'Las dos observaciones de precio proceden del mismo proveedor; falta contraste independiente.' });
    const shareBasis = snapshot.shareBasis;
    if (!shareBasis?.shareClass || !validDate(shareBasis.splitCheckedThrough) || shareBasis.splitCheckedThrough < p?.asOf || shareBasis.splitFactorSinceBalance !== 1 || !shareBasis.sources?.length || shareBasis.sources.some(s => !s.id || !/^https:\/\//.test(s.url || '') || !validDate(s.publishedAt) || s.publishedAt > snapshot.cutoff)) blockers.push({ key: 'share_basis', message: 'Falta conciliar clase de acción y splits entre el balance y el precio. No se ajusta el denominador implícitamente.' });
    if (snapshot.facts?.operatingIncome?.value <= 0 || snapshot.facts?.revenue?.value <= 0) blockers.push({ key: 'operating_stage', message: 'Un negocio sin rentabilidad operativa positiva requiere modelar la transición antes de aplicar este FCFF.' });
    if (snapshot.mode !== 'historical_reconstruction' && validDate(snapshot.cutoff)) {
      const age = p => (Date.parse(snapshot.cutoff) - Date.parse(p?.asOf)) / 86400000;
      if (age(p) > 7) blockers.push({ key: 'price_stale', message: 'El precio tiene más de siete días; requiere actualización.' });
      if (age(snapshot.facts?.revenue) > 550) blockers.push({ key: 'financials_stale', message: 'El período anual tiene más de 550 días; falta evidencia financiera reciente.' });
    }
  }
  return blockers;
}
function normalizeAssumptions(overrides, definitions = READING_ASSUMPTIONS) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('Hipótesis inválidas.');
  for (const key of Object.keys(overrides)) if (!definitions[key]) throw new Error(`Hipótesis no admitida: ${key}.`);
  const values = {};
  for (const [key, def] of Object.entries(definitions)) {
    const value = Object.hasOwn(overrides, key) ? overrides[key] : def.value;
    if (value === null && !Object.hasOwn(overrides, key)) { values[key] = null; continue; }
    if (!validNumber(value) || value < def.min || value > def.max) throw new Error(`Hipótesis fuera de dominio: ${def.label}.`);
    values[key] = value;
  }
  if (validNumber(values.discountRate) && validNumber(values.terminalGrowth) && values.discountRate - values.terminalGrowth < .005) throw new Error('La tasa de descuento debe superar el crecimiento terminal al menos en 0,5 puntos porcentuales.');
  if (validNumber(values.terminalRoic) && validNumber(values.terminalGrowth) && values.terminalRoic <= values.terminalGrowth) throw new Error('El ROIC terminal debe superar el crecimiento terminal.');
  return { ...values, years: 10 };
}
function calculated(snapshot, value, label, unit, formula, keys = required, assumption = false) {
  const refs = keys.map(key => ({ key, asOf: snapshot.facts[key]?.asOf ?? null, availableOn: snapshot.facts[key]?.availableOn ?? null, sources: snapshot.facts[key]?.sources || [] }));
  const sources = [...new Map(refs.flatMap(r => r.sources).map(s => [s.id, s])).values()];
  if (assumption) { sources.push(snapshot.assumptionSource); refs.push({ key: 'hypotheses', asOf: snapshot.authoredAt, availableOn: snapshot.authoredAt, sources: [snapshot.assumptionSource] }); }
  const actualUnit = unit.startsWith('USD') ? unit.replace('USD', snapshot.currency) : unit;
  return { value, label, unit: actualUnit, currency: /^[A-Z]{3}(\/share)?$/.test(actualUnit) ? snapshot.currency : null, asOf: snapshot.cutoff, sources: sources.filter(Boolean), provenance: 'calculated', formula, inputRefs: refs, modelVersion: OPERATING_DCF_VERSION };
}
const missingOutput = (label, reason) => ({ value: null, label, asOf: null, sources: [], inputRefs: [], provenance: 'missing', reason });
const DCF_FORMULA = 'FCFF = ingresos × margen × (1 − impuesto) × (1 − reinversión neta/NOPAT). EV = PV(FCFF) + PV(terminal). Equity = EV + caja − deuda financiera − leasing financiero. Valor/acción = Equity / [acciones diluidas × (1 + dilución)^años].';
function thesisConclusions(a, value, price, criteria = { growth: .12, margin: .43, reinvestment: .3 }) {
  return [
    { id: 'growth', text: 'El crecimiento inicial alcanza el criterio de expansión.', holds: a.growth >= criteria.growth, criterion: 'growth', threshold: criteria.growth, direction: 'min' },
    { id: 'margin', text: 'La rentabilidad operativa sostiene el margen exigido.', holds: a.margin >= criteria.margin, criterion: 'margin', threshold: criteria.margin, direction: 'min' },
    { id: 'cash', text: 'La reinversión neta permite conservar la conversión a caja planteada.', holds: a.reinvestment <= criteria.reinvestment, criterion: 'reinvestment', threshold: criteria.reinvestment, direction: 'max' },
    { id: 'price', text: 'El escenario central alcanza el precio observado.', holds: value >= price, criterion: 'value_per_share', threshold: price, direction: 'min' },
  ];
}
function makeNarration(reading) {
  const { snapshotId, runId } = reading;
  if (reading.status !== 'research') {
    const chapters = [];
    if (reading.status === 'partial') {
      chapters.push({ key: 'business', title: 'Negocio documentado', text: reading.business.summary, figures: reading.business.segments || [], sources: reading.business.sources || [], asOf: reading.business.asOf });
      const figures = ['price', 'revenue', 'operatingIncome', 'cfo', 'capex'].map(key => key === 'price' ? { ...reading.facts[key], unit: `${reading.currency}/share` } : reading.facts[key]).filter(p => validNumber(p?.value) && p.sources?.length);
      chapters.push({ key: 'evidence', title: 'Qué evidencia está disponible', text: figures.map(p => `${p.label}: ${readingValue(p)}, período ${p.asOf}.`).join(' ') || 'Los datos numéricos permanecen faltantes.', figures, sources: [...new Map(figures.flatMap(p => p.sources).map(s => [s.id, s])).values()], asOf: reading.cutoff });
    }
    chapters.push({ key: 'abstain', title: reading.status === 'partial' ? 'Por qué la lectura se abstiene de valorar' : 'Abstención', text: `Esta lectura se abstiene de valorar. ${reading.blockers.map(b => b.message).join(' ')} No hay rango de valoración ni impacto calculado.`, figures: [], sources: [], asOf: reading.cutoff });
    return { snapshotId, runId, chapters };
  }
  const r = reading;
  const chapters = [
    { key: 'business', title: 'Cómo funciona el negocio', text: r.business.summary, figures: r.business.segments, sources: r.business.sources, asOf: r.business.asOf },
    { key: 'unit', title: 'Qué economía podemos observar', text: `El margen operativo consolidado es ${readingValue(r.facts.operatingMargin)}. La caja operativa menos compras de activos es ${readingValue(r.facts.trailingFcf)}. ${Object.values(r.unitEconomics).filter(p => p.value === null).map(p => p.label).join(', ')} permanecen faltantes.`, figures: [r.facts.operatingMargin, r.facts.trailingFcf], sources: r.facts.operatingMargin.sources, asOf: r.cutoff },
    { key: 'expectations', title: 'Qué exige el precio', text: `El cierre sin ajustar es ${readingValue({ ...r.facts.price, unit: `${r.currency}/share` })}. Manteniendo los demás supuestos, el crecimiento inicial requerido para igualarlo es ${readingValue(r.impliedGrowth)}. Esta solución no identifica una única expectativa del mercado.`, figures: [r.facts.price, r.impliedGrowth], sources: r.impliedGrowth.sources, asOf: r.cutoff },
    { key: 'valuation', title: 'Un intervalo condicionado', text: `Los escenarios delimitan ${readingValue(r.valuation.low)} a ${readingValue(r.valuation.high)} por acción. El central es ${readingValue(r.valuation.central)}. Son valores de un modelo condicionado, sin probabilidades ni objetivo de precio.`, figures: [r.valuation.low, r.valuation.central, r.valuation.high], sources: r.valuation.central.sources, asOf: r.cutoff },
    { key: 'decisive', title: 'El supuesto que más mueve la lectura', text: `${r.decisive.label} domina la sensibilidad bajo los cambios ensayados. ${r.conclusions.filter(c => !c.holds).map(c => `No se sostiene: ${c.text}`).join(' ') || 'Los criterios planteados se sostienen bajo estos supuestos.'}`, figures: [r.decisive.low, r.decisive.high], sources: r.decisive.low.sources, asOf: r.cutoff },
    { key: 'adverse', title: 'Qué pasa si el caso falla', text: `El escenario adverso conserva hipótesis explícitas de menor crecimiento, menor margen y mayor reinversión. Su valor condicionado es ${readingValue(r.adverse.value)} por acción; la distancia al cierre es ${readingValue(r.adverse.change)}. No es una caída pronosticada.`, figures: [r.adverse.value, r.adverse.change], sources: r.adverse.value.sources, asOf: r.cutoff },
    { key: 'portfolio', title: 'Qué parte de la cartera queda expuesta', text: `Con un peso hipotético de ${readingValue(r.portfolio.weight)}, la contribución del escenario adverso es ${readingValue(r.portfolio.contribution)} del patrimonio. El resto de la cartera permanece sin calcular; no se infieren correlaciones ni un riesgo total.`, figures: [r.portfolio.weight, r.portfolio.contribution], sources: r.portfolio.contribution.sources, asOf: r.cutoff },
  ];
  return { snapshotId, runId, chapters, disclosure: r.disclosure };
}
export function buildCompanyReading(snapshot, overrides = {}, portfolio = { weight: .1 }) {
  const weight = portfolio.weight;
  if (!validNumber(weight) || weight < 0 || weight > 1) throw new Error('El peso debe estar entre cero y uno.');
  const definitions = snapshot.assumptionDefinitions || READING_ASSUMPTIONS;
  const assumptions = normalizeAssumptions(overrides, definitions);
  const blockers = validateReadingSnapshot(snapshot);
  if (Object.values(assumptions).some(v => v === null) || !snapshot.scenarios?.adverse || !snapshot.scenarios?.favorable) blockers.push({ key: 'hypotheses', message: 'Faltan hipótesis declaradas para el central, adverso y favorable. No se copian las de otra empresa.' });
  const runId = `reading-${fingerprint({ snapshot, assumptions, portfolio: { weight }, modelVersion: OPERATING_DCF_VERSION })}`;
  const base = { snapshotId: snapshot.id, runId, ticker: snapshot.ticker, companyName: snapshot.name, currency: snapshot.currency, cutoff: snapshot.cutoff, authoredAt: snapshot.authoredAt, mode: snapshot.mode, disclosure: snapshot.disclosure, business: clone(snapshot.business), facts: clone(snapshot.facts), unitEconomics: clone(snapshot.unitEconomics), blockers, assumptions, assumptionSource: clone(snapshot.assumptionSource), modelVersion: OPERATING_DCF_VERSION, researchQuestions: snapshot.researchQuestions || [] };
  if (blockers.length) {
    const status = snapshot.schema === 'company_reading_snapshot_v2' && Object.values(snapshot.facts).some(p => validNumber(p.value) && p.sources?.length) ? 'partial' : 'abstain';
    const result = { ...base, status, valuation: null, impliedGrowth: missingOutput('Crecimiento implícito', 'Inputs sin conciliar.'), modelInputs: null, conclusions: [], sensitivity: [], decisive: null, adverse: null, expectations: [], portfolio: { contribution: missingOutput('Contribución', 'No existe escenario calculable.') } };
    return { ...result, narration: makeNarration(result) };
  }
  const f = snapshot.facts;
  const modelInputs = { revenue: f.revenue.value, cash: f.cash.value, debt: f.debt.value, financeLeases: f.financeLeases.value, shares: f.dilutedShares.value };
  const calc = (v, label, unit, formula, keys, assumption = false) => {
    const point = calculated(snapshot, v, label, unit, formula, keys, assumption);
    if (assumption && snapshot.schema === 'company_reading_snapshot_v2') {
      point.hypothesisRefs = Object.entries(definitions).map(([key, d]) => ({ key, value: assumptions[key], asOf: snapshot.authoredAt, basis: Object.hasOwn(overrides, key) ? 'user-edited' : d.basis || 'user-declared', formula: d.formula || 'Hipótesis explícita; no dato observado.', sources: Object.hasOwn(overrides, key) ? [snapshot.assumptionSource] : d.sources || [snapshot.assumptionSource] }));
    }
    return point;
  };
  const central = evaluateOperatingDcf(modelInputs, assumptions);
  const baselineAssumptions = normalizeAssumptions({}, definitions);
  const baseline = evaluateOperatingDcf(modelInputs, baselineAssumptions);
  const adverse = evaluateOperatingDcf(modelInputs, snapshot.scenarios.adverse);
  const favorable = evaluateOperatingDcf(modelInputs, snapshot.scenarios.favorable);
  const implied = solveThesisBoundary({ target: f.price.value, min: definitions.growth.min, max: definitions.growth.max, evaluate: growth => evaluateOperatingDcf(modelInputs, { ...assumptions, growth }).valuePerShare });
  const sensitivitySteps = { growth: .03, margin: .03, reinvestment: .1, discountRate: .01, terminalGrowth: .005, taxRate: .03, terminalRoic: .03, dilution: .005 };
  const sensitivity = Object.entries(sensitivitySteps).map(([key, delta]) => {
    const def = definitions[key];
    const from = Math.max(def.min, assumptions[key] - delta), to = Math.min(def.max, assumptions[key] + delta);
    const valid = x => x.discountRate - x.terminalGrowth >= .005 && x.terminalRoic > x.terminalGrowth;
    const lowA = { ...assumptions, [key]: from }, highA = { ...assumptions, [key]: to };
    if (!valid(lowA) || !valid(highA)) return null;
    const values = [evaluateOperatingDcf(modelInputs, lowA).valuePerShare, evaluateOperatingDcf(modelInputs, highA).valuePerShare].sort((a, b) => a - b);
    return { key, label: def.label, from, to, delta, low: calc(values[0], 'Valor inferior en sensibilidad', 'USD/share', DCF_FORMULA, undefined, true), high: calc(values[1], 'Valor superior en sensibilidad', 'USD/share', DCF_FORMULA, undefined, true), span: values[1] - values[0] };
  }).filter(Boolean).sort((a, b) => b.span - a.span);
  const baselineConclusions = thesisConclusions(baselineAssumptions, baseline.valuePerShare, f.price.value, snapshot.criteria);
  const conclusions = thesisConclusions(assumptions, central.valuePerShare, f.price.value, snapshot.criteria).map((c, i) => ({ ...c, baselineHolds: baselineConclusions[i].holds, thresholdPoint: calc(c.threshold, 'Criterio de la tesis', c.id === 'price' ? 'USD/share' : 'percent', 'Criterio explícito de investigación; no regla de mercado.', c.id === 'price' ? ['price'] : [], c.id !== 'price') }));
  const contribution = companyScenarioContribution({ price: f.price.value, scenarioValue: adverse.valuePerShare, weight });
  const facts = {
    ...base.facts,
    marketCap: calc(f.price.value * f.sharesOutstanding.value, 'Capitalización al cierre', 'USD', 'Precio sin ajustar × acciones en circulación al cierre fiscal.', ['price', 'sharesOutstanding']),
    operatingMargin: calc(f.operatingIncome.value / f.revenue.value, 'Margen operativo consolidado', 'percent', 'Resultado operativo / ingresos consolidados.', ['operatingIncome', 'revenue']),
    trailingFcf: calc(f.cfo.value - f.capex.value, 'CFO menos compras de activos', 'USD', 'CFO − compras de propiedad y equipo en efectivo. No es FCFF; no se introduce en el DCF.', ['cfo', 'capex']),
    capexIntensity: calc(f.capex.value / f.revenue.value, 'Compras de activos / ingresos', 'percent', 'Compras de propiedad y equipo / ingresos.', ['capex', 'revenue']),
    netDebt: calc(f.debt.value + f.financeLeases.value - f.cash.value, 'Deuda neta incl. leasing financiero', 'USD', 'Deuda financiera + pasivos de leasing financiero − caja e inversiones de corto plazo.', ['debt', 'financeLeases', 'cash']),
  };
  const values = [adverse.valuePerShare, central.valuePerShare, favorable.valuePerShare];
  const valuation = { low: calc(Math.min(...values), 'Extremo inferior', 'USD/share', DCF_FORMULA, undefined, true), central: calc(central.valuePerShare, 'Valor central', 'USD/share', DCF_FORMULA, undefined, true), high: calc(Math.max(...values), 'Extremo superior', 'USD/share', DCF_FORMULA, undefined, true), enterpriseValue: calc(central.enterpriseValue, 'Valor empresa', 'USD', DCF_FORMULA, undefined, true), equityValue: calc(central.equityValue, 'Valor del accionista', 'USD', DCF_FORMULA, undefined, true), terminalShare: calc(central.terminalShare, 'Valor atribuido al terminal', 'percent', 'PV del terminal / EV.', undefined, true), effectiveShares: calc(central.effectiveShares, 'Denominador con dilución al horizonte', 'shares', 'Promedio anual diluido × (1 + dilución anual)^años.', ['dilutedShares'], true) };
  const due = snapshot.nextFiscalEnd || '2025-06-30';
  const expectations = [
    { key: 'revenue_growth', label: 'Crecimiento de ingresos al siguiente cierre fiscal', direction: 'min', threshold: assumptions.growth, unit: 'percent', due, source: base.assumptionSource },
    { key: 'operating_margin', label: 'Margen operativo al siguiente cierre fiscal', direction: 'min', threshold: assumptions.margin, unit: 'percent', due, source: base.assumptionSource },
    ...(facts.trailingFcf.value > 0 ? [{ key: 'fcf_growth', label: 'CFO menos compras de activos crece junto con ingresos', direction: 'min', threshold: assumptions.growth, unit: 'percent', due, source: base.assumptionSource }] : []),
  ].map(e => ({ ...e, periodToleranceDays: snapshot.schema === 'company_reading_snapshot_v2' ? 7 : 0, dueBasis: snapshot.schema === 'company_reading_snapshot_v2' ? 'Aniversario del cierre observado; ventana de siete días para calendarios de 52/53 semanas. Criterio fijado antes del contraste.' : 'Cierre fiscal del caso histórico.' }));
  const factorlab = deriveFactorLabResearchDecision({ ticker: snapshot.ticker, dataCompleteness: 1, fundamentalsDate: f.revenue.availableOn, fundamentalsDateType: 'filed', priceDate: f.price.asOf, primaryEvidence: { fundamentalsUrl: f.revenue.sources[0].url, filingUrl: f.revenue.sources[0].url, filingAccession: snapshot.filingAccession || (snapshot.schema === 'company_reading_snapshot_v1' ? '0000950170-24-087843' : null) }, fcfYield: facts.trailingFcf.value / facts.marketCap.value });
  const result = { ...base, status: 'research', facts, modelInputs, valuation, projections: central.projections, conclusions, sensitivity, decisive: sensitivity[0], impliedGrowth: calc(implied, 'Crecimiento inicial implícito', 'percent', 'Breakpoint: resolver el mismo FCFF para valor/acción = cierre, variando solo crecimiento inicial dentro del dominio explícito.', undefined, true), adverse: { assumptions: clone(snapshot.scenarios.adverse), value: calc(adverse.valuePerShare, 'Valor adverso', 'USD/share', DCF_FORMULA, undefined, true), change: calc(contribution.companyChange, 'Distancia adversa al precio', 'percent', 'max(−100%, valor adverso / precio − 1).', undefined, true) }, favorable: { assumptions: clone(snapshot.scenarios.favorable), value: calc(favorable.valuePerShare, 'Valor favorable', 'USD/share', DCF_FORMULA, undefined, true) }, expectations, factorlab, portfolio: { weight: { value: weight, label: 'Peso hipotético', unit: 'percent', asOf: snapshot.authoredAt, provenance: 'assumption', sources: [{ ...base.assumptionSource, label: 'Peso de ejemplo elegido por el usuario' }] }, contribution: calc(contribution.contribution, 'Contribución adversa al patrimonio', 'percent', 'Peso hipotético × distancia adversa al precio. Resto de posiciones desconocido; no es VaR ni pérdida pronosticada.', undefined, true), total: null, coverage: 'single-company', source: 'Stress Engine · atribución determinista de escenario' }, limitations: ['Intervalo condicionado a tres escenarios; no es un intervalo de confianza.', 'El crecimiento se desvanece linealmente hacia el terminal; margen y reinversión neta se mantienen constantes durante el horizonte.', 'La reinversión neta/NOPAT es una hipótesis: no equivale al capex en efectivo. No se agrega CFO−capex al FCFF.', 'La caja y las inversiones de corto plazo se consideran no operativas. El leasing financiero entra como deuda; el operativo queda en el margen y no se descuenta dos veces.', 'El promedio anual diluido es un proxy conservador, no un conteo diluido puntual. La dilución futura se aplica al denominador terminal.', 'SBC permanece en gastos operativos; no se añade de vuelta. El DCF no capitaliza por separado adquisiciones futuras ni leasing aún no iniciado.', 'Una sola observación de precio permite múltiples combinaciones de supuestos. No se infieren probabilidades ni alfa.'] };
  return { ...result, narration: makeNarration(result) };
}
export function compareLaterEvidence(reading, evidence, recordedAt = new Date().toISOString(), committedAt = null) {
  if (reading.status !== 'research') throw new Error('No se puede contrastar una tesis sin cobertura.');
  if (reading.ticker !== evidence.ticker) throw new Error('La evidencia pertenece a otra empresa.');
  if (!validDate(evidence.asOf) || !validDate(evidence.availableOn) || evidence.asOf <= reading.cutoff || evidence.availableOn <= reading.cutoff || evidence.availableOn > recordedAt.slice(0, 10)) throw new Error('La evidencia posterior tiene fechas incompatibles.');
  const sourceFacts = evidence.facts || {};
  for (const p of Object.values(sourceFacts)) if (!validNumber(p.value) || p.unit !== reading.currency || p.currency !== reading.currency || p.asOf !== evidence.asOf || p.availableOn !== evidence.availableOn || !p.sources?.length || p.sources.some(s => !/^https:\/\//.test(s.url || '') || !validDate(s.publishedAt) || s.publishedAt > evidence.availableOn)) throw new Error('Evidencia posterior sin fuente, moneda, unidad o fecha conciliada.');
  const f = reading.facts;
  const values = { revenue_growth: sourceFacts.revenue?.value / f.revenue.value - 1, operating_margin: sourceFacts.operatingIncome?.value / sourceFacts.revenue?.value, fcf_growth: (sourceFacts.cfo?.value - sourceFacts.capex?.value) / f.trailingFcf.value - 1 };
  const checks = reading.expectations.map(expectation => {
    const value = validNumber(values[expectation.key]) ? values[expectation.key] : null;
    const dependencyKeys = expectation.key === 'revenue_growth' ? ['revenue'] : expectation.key === 'operating_margin' ? ['revenue', 'operatingIncome'] : ['cfo', 'capex'];
    const comparableDuration = reading.mode === 'historical_reconstruction' || dependencyKeys.every(key => { const point = sourceFacts[key]; const days = (Date.parse(point?.asOf) - Date.parse(point?.periodStart)) / 86400000; return validDate(point?.periodStart) && point.periodStart === sourceFacts.revenue?.periodStart && days >= 330 && days <= 400; });
    const mature = comparableDuration && Math.abs(Date.parse(evidence.asOf) - Date.parse(expectation.due)) / 86400000 <= (expectation.periodToleranceDays || 0);
    const meetsCriterion = expectation.direction === 'min' ? value - expectation.threshold >= -1e-12 : value - expectation.threshold <= 1e-12;
    return { ...clone(expectation), comparisonTolerance: 1e-12, observed: { value, label: expectation.label, unit: expectation.unit, asOf: evidence.asOf, availableOn: evidence.availableOn, sources: clone(evidence.sources), provenance: 'calculated', formula: expectation.key === 'revenue_growth' ? 'Ingresos posteriores / ingresos del snapshot − 1.' : expectation.key === 'operating_margin' ? 'Resultado operativo posterior / ingresos posteriores.' : '(CFO posterior − capex posterior) / (CFO del snapshot − capex del snapshot) − 1.', inputRefs: [reading.snapshotId, evidence.id] }, status: value === null ? 'missing' : !mature ? 'not_comparable' : meetsCriterion ? 'supported' : 'refuted' };
  });
  const eligibleForecast = reading.mode !== 'historical_reconstruction' && typeof committedAt === 'string' && committedAt.slice(0, 10) < evidence.availableOn && committedAt.slice(0, 10) < evidence.asOf;
  return { evidenceId: evidence.id, originalRunId: reading.runId, recordedAt, committedAt, asOf: evidence.asOf, availableOn: evidence.availableOn, eligibleForecast, disclosure: eligibleForecast ? 'Expectativas fijadas antes del cierre y de la publicación. Se contrastan los criterios originales; una coincidencia no acredita capacidad predictiva.' : 'Contraste retrospectivo: las expectativas no se fijaron antes de este resultado. No mide capacidad predictiva.', checks };
}
