const SEC24 = {
  id: 'msft-sec-2024', label: 'Microsoft · 10-K FY2024',
  url: 'https://www.sec.gov/Archives/edgar/data/789019/000095017024087843/msft-20240630.htm',
  mirrorUrl: 'https://www.microsoft.com/investor/reports/ar24/index.html',
  publishedAt: '2024-07-30', periodEnd: '2024-06-30', type: 'primary',
};
const IR24 = { id: 'msft-ir-2024', label: 'Microsoft · resultados FY2024', url: 'https://www.microsoft.com/en-us/Investor/earnings/FY-2024-Q4/press-release-webcast', publishedAt: '2024-07-30', periodEnd: '2024-06-30', type: 'primary' };
const QUOTE = { id: 'msft-close-20240731', label: 'Yahoo Finance · cierre sin ajustar', url: 'https://query1.finance.yahoo.com/v8/finance/chart/MSFT?period1=1722384000&period2=1722470400&interval=1d', publishedAt: '2024-07-31', periodEnd: '2024-07-31', type: 'market' };
const PRICE_CHECK = { id: 'msft-close-check', label: 'DJIA · registro de cierres', url: 'https://www.dow-jones-djia.com/2024/07/', publishedAt: '2024-07-31', periodEnd: '2024-07-31', type: 'market-crosscheck' };
const POLICY = { id: 'reading-policy-v1', label: 'BLS · hipótesis de investigación v1 (reconstrucción)', url: null, publishedAt: '2026-10-07', type: 'assumption' };
function point(value, label, unit = 'USD', sources = [SEC24], extra = {}) {
  return { value, label, unit, currency: unit === 'USD' ? 'USD' : null, asOf: sources[0].periodEnd, availableOn: sources[0].publishedAt, sources, provenance: 'observed', ...extra };
}
function missing(label, reason) { return { value: null, label, unit: null, asOf: null, availableOn: null, sources: [], provenance: 'missing', reason }; }
function freezeDeep(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freezeDeep); Object.freeze(value); } return value; }

export const READING_ASSUMPTIONS = freezeDeep({
  growth: { label: 'Crecimiento inicial de ingresos', value: .16, min: -.1, max: .35, step: .005, unit: 'percent' },
  margin: { label: 'Margen operativo', value: .445, min: .1, max: .65, step: .005, unit: 'percent' },
  reinvestment: { label: 'Reinversión neta / NOPAT', value: .22, min: 0, max: .8, step: .01, unit: 'percent' },
  discountRate: { label: 'Tasa de descuento (WACC)', value: .08, min: .04, max: .2, step: .0025, unit: 'percent' },
  terminalGrowth: { label: 'Crecimiento terminal', value: .03, min: 0, max: .05, step: .0025, unit: 'percent' },
  taxRate: { label: 'Impuesto normalizado', value: .21, min: 0, max: .45, step: .01, unit: 'percent' },
  terminalRoic: { label: 'ROIC terminal', value: .18, min: .06, max: .5, step: .01, unit: 'percent' },
  dilution: { label: 'Dilución anual', value: .005, min: 0, max: .05, step: .001, unit: 'percent' },
});

const MSFT = freezeDeep({
  schema: 'company_reading_snapshot_v1', id: 'MSFT-FY2024-close-20240731-v1', ticker: 'MSFT', name: 'Microsoft Corporation', currency: 'USD', cutoff: '2024-07-31', authoredAt: '2026-10-07',
  mode: 'historical_reconstruction',
  disclosure: 'Corte histórico al 31/07/2024, reconstruido el 07/10/2026. No es una cotización actual ni una predicción registrada en 2024.',
  business: { summary: 'Licencias y suscripciones de software, servicios de nube y productos para empresas y consumidores. La expansión de centros de datos requiere contrastar el crecimiento con la conversión a caja.', asOf: '2024-06-30', sources: [IR24, SEC24],
    segments: [point(77728e6, 'Productivity & Business Processes', 'USD', [IR24]), point(105362e6, 'Intelligent Cloud', 'USD', [IR24]), point(62032e6, 'More Personal Computing', 'USD', [IR24])] },
  facts: {
    price: point(418.35, 'Cierre observado', 'USD', [QUOTE, PRICE_CHECK], { adjustment: 'unadjusted', exchange: 'NASDAQ', rawValue: 418.3500061035156, verifiedAt: '2026-10-07' }),
    priceCrosscheck: point(418.35, 'Segundo registro de cierre', 'USD', [PRICE_CHECK], { adjustment: 'unadjusted' }),
    revenue: point(245122e6, 'Ingresos anuales'), priorRevenue: point(211915e6, 'Ingresos del año anterior', 'USD', [SEC24], { asOf: '2023-06-30' }),
    operatingIncome: point(109433e6, 'Resultado operativo'), cfo: point(118548e6, 'Flujo de caja operativo'), capex: point(44477e6, 'Compras de propiedad y equipo (caja)'),
    cash: point(75543e6, 'Caja + inversiones de corto plazo'),
    shortTermDebt: point(6693e6, 'Deuda de corto plazo (commercial paper)'), currentLongTermDebt: point(2249e6, 'Porción corriente de deuda de largo plazo'), longTermDebt: point(42688e6, 'Deuda de largo plazo no corriente'),
    debt: point(51630e6, 'Deuda financiera corriente + largo plazo', 'USD', [SEC24], { provenance: 'calculated', formula: '6.693 + 2.249 + 42.688 millones USD. Incluye commercial paper; la tabla de largo plazo de la nota 11 no es toda la deuda.' }),
    financeLeases: point(27145e6, 'Pasivos por leasing financiero'), operatingLeases: point(19077e6, 'Pasivos por leasing operativo'),
    sharesOutstanding: point(7434e6, 'Acciones en circulación al cierre fiscal', 'shares'), dilutedShares: point(7469e6, 'Promedio anual de acciones diluidas', 'shares'),
  },
  unitEconomics: { cac: missing('Costo de adquisición por cliente', 'No publicado de forma comparable en este corte.'), ltv: missing('Valor por cliente (LTV)', 'No disponible con una definición y cohorte verificables.'), retention: missing('Retención neta de ingresos', 'No publicada para el negocio consolidado.'), azureMargin: missing('Margen de Azure', 'El margen del segmento Intelligent Cloud no identifica el margen de Azure.') },
  assumptionSource: POLICY,
  scenarios: { adverse: { growth: .08, margin: .38, reinvestment: .4, discountRate: .095, terminalGrowth: .025, terminalRoic: .14, dilution: .01, taxRate: .21, years: 10 }, favorable: { growth: .22, margin: .49, reinvestment: .15, discountRate: .075, terminalGrowth: .035, terminalRoic: .22, dilution: .002, taxRate: .21, years: 10 } },
  researchQuestions: ['¿La caja escala al mismo ritmo que los ingresos cuando aumenta la inversión en infraestructura?', '¿Qué parte de la rentabilidad pertenece a Azure y qué parte a licencias y otros servicios?', '¿El ROIC terminal compensa la reinversión y el costo de capital?'],
});
const IR25 = { id: 'msft-ir-2025', label: 'Microsoft · resultados FY2025', url: 'https://www.microsoft.com/en-us/Investor/earnings/FY-2025-Q4/press-release-webcast', publishedAt: '2025-07-30', periodEnd: '2025-06-30', type: 'primary' };
export const MSFT_FY25_EVIDENCE = freezeDeep({ id: 'MSFT-FY2025-evidence-v1', ticker: 'MSFT', asOf: '2025-06-30', availableOn: '2025-07-30', sources: [IR25], facts: { revenue: point(281724e6, 'Ingresos FY2025', 'USD', [IR25]), operatingIncome: point(128528e6, 'Resultado operativo FY2025', 'USD', [IR25]), cfo: point(136162e6, 'Flujo de caja operativo FY2025', 'USD', [IR25]), capex: point(64551e6, 'Compras de propiedad y equipo FY2025', 'USD', [IR25]) } });
export function getCompanyReadingSnapshot(ticker, { missingDebt = false } = {}) {
  if (String(ticker).toUpperCase() !== 'MSFT') return { schema: MSFT.schema, id: `uncovered-${String(ticker).slice(0, 16)}`, ticker: String(ticker).toUpperCase().slice(0, 16), name: String(ticker).toUpperCase().slice(0, 16), currency: null, cutoff: null, facts: {}, business: { summary: 'No hay un snapshot trazable con cobertura suficiente para esta empresa.', segments: [], sources: [] }, unitEconomics: {}, assumptionSource: POLICY };
  if (!missingDebt) return MSFT;
  return { ...structuredClone(MSFT), id: `${MSFT.id}-missing-debt`, disclosure: `${MSFT.disclosure} Caso de prueba: se retiró la deuda; no representa una nueva publicación de Microsoft.`, facts: { ...MSFT.facts, debt: missing('Deuda financiera', 'Input retirado para probar la abstención; no se reemplaza por cero.') } };
}
