import { buildValuationPlan } from "./company-fingerprint.js";

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, low, high) {
  return Math.min(Math.max(Number(value) || 0, low), high);
}

function assumption(key, label, value, provenance, detail) {
  return { key, label, value, provenance, detail };
}

function discountedOwnerEarnings({ cashFlow, growth, discountRate, terminalGrowth, years = 5 }) {
  let presentValue = 0;
  let projected = cashFlow;
  for (let year = 1; year <= years; year += 1) {
    projected *= 1 + growth;
    presentValue += projected / ((1 + discountRate) ** year);
  }
  const terminal = projected * (1 + terminalGrowth) / Math.max(0.01, discountRate - terminalGrowth);
  return presentValue + terminal / ((1 + discountRate) ** years);
}

function matureRange({ freeCashFlow, revenueGrowth, cash, debt, shares }) {
  const normalizedGrowth = clamp(revenueGrowth ?? 0.05, -0.03, 0.14);
  const scenarios = [
    { key: "low", growth: Math.min(normalizedGrowth, 0.02), discountRate: 0.13, terminalGrowth: 0.012 },
    { key: "central", growth: normalizedGrowth, discountRate: 0.105, terminalGrowth: 0.022 },
    { key: "high", growth: clamp(normalizedGrowth + 0.04, 0.04, 0.18), discountRate: 0.09, terminalGrowth: 0.03 },
  ];
  const netCash = (cash || 0) - (debt || 0);
  return Object.fromEntries(scenarios.map((scenario) => {
    const enterpriseValue = discountedOwnerEarnings({ cashFlow: freeCashFlow, ...scenario });
    return [scenario.key, Math.max(0, (enterpriseValue + netCash) / shares)];
  }));
}

function marketSourceIds(market) {
  return [...new Set((Array.isArray(market?.sourceIds) ? market.sourceIds : []).filter(Boolean))];
}

function researchRoute({ fingerprint, plan, currency }) {
  return {
    version: "aurora_conditional_valuation_v1",
    status: "research_route",
    decisionReady: false,
    currency,
    method: plan.primaryMethod,
    range: null,
    summary: `AURORA clasificó la empresa como ${plan.archetype} y convirtió la valuación en preguntas verificables antes de publicar un rango.`,
    assumptions: [],
    marketImplied: null,
    valueOfInformation: plan.researchQuestions.map((question, index) => ({
      rank: index + 1,
      question,
      whyItMatters: "Puede cambiar el método, la probabilidad o el costo de capital aplicable.",
    })),
    evidence: fingerprint.evidence || [],
  };
}

export function buildConditionalValuation({ fingerprint = {}, profile = {}, financials = {}, market = {} } = {}) {
  const plan = buildValuationPlan(fingerprint);
  const currency = String(profile.currency || "USD").toUpperCase();
  const marketCap = finite(profile.marketCap ?? profile.market_cap);
  const currentPrice = finite(market.currentPrice ?? market.current_price);
  const revenue = finite(financials.revenue ?? financials.latest_revenue);
  const freeCashFlow = finite(financials.freeCashFlow ?? financials.free_cash_flow ?? financials.latest_fcf);
  const cash = finite(financials.cash) || 0;
  const debt = finite(financials.debt ?? financials.totalDebt) || 0;
  const revenueGrowth = finite(financials.revenueGrowth ?? financials.revenue_cagr_5y);
  const shares = marketCap !== null && currentPrice !== null && currentPrice > 0 ? marketCap / currentPrice : null;
  const sourceIds = marketSourceIds(market);

  if (fingerprint.stage === "pre_revenue") {
    if (marketCap === null) return researchRoute({ fingerprint, plan, currency });
    const enterpriseOptionValue = marketCap - cash + debt;
    const runwayYears = freeCashFlow !== null && freeCashFlow < 0 && cash > 0 ? cash / Math.abs(freeCashFlow) : null;
    return {
      version: "aurora_conditional_valuation_v1",
      status: "market_implied_hurdle",
      decisionReady: false,
      currency,
      method: plan.primaryMethod,
      range: null,
      summary: `El mercado atribuye ${Math.round(enterpriseOptionValue)} ${currency} al éxito futuro por encima de caja y deuda; AURORA exige descomponer ese valor por hito y probabilidad.`,
      assumptions: [
        assumption("market_cap", "Capitalización observada", marketCap, "observed", market.asOf || null),
        assumption("cash", "Caja", cash, "observed", null),
        assumption("debt", "Deuda", debt, "observed", null),
        ...(runwayYears === null ? [] : [assumption("runway_years", "Años de caja al ritmo actual", runwayYears, "calculated", "Caja / consumo anual de caja")]),
      ],
      marketImplied: {
        marketCap,
        enterpriseOptionValue,
        runwayYears,
        interpretation: "Valor que los activos, hitos y probabilidades futuras deben justificar en conjunto.",
      },
      valueOfInformation: plan.researchQuestions.map((question, index) => ({
        rank: index + 1,
        question,
        whyItMatters: index === 0
          ? "Es la variable que más cambia la probabilidad ponderada de éxito."
          : "Reduce la amplitud del valor opcional y el riesgo de dilución.",
      })),
      evidence: [
        ...(fingerprint.evidence || []),
        ...(sourceIds.length ? [{ field: "marketCap", value: marketCap, provenance: "observed", sourceIds }] : []),
      ],
    };
  }

  if (freeCashFlow === null || freeCashFlow <= 0 || shares === null || shares <= 0) {
    return researchRoute({ fingerprint, plan, currency });
  }

  const range = matureRange({ freeCashFlow, revenueGrowth, cash, debt, shares });
  const normalizedGrowth = clamp(revenueGrowth ?? 0.05, -0.03, 0.14);
  return {
    version: "aurora_conditional_valuation_v1",
    status: "conditional_range",
    decisionReady: false,
    currency,
    method: plan.primaryMethod,
    range,
    summary: "Rango condicional calculado con caja observada y supuestos explícitos; sirve para investigar sensibilidad, no para ocultar incertidumbre.",
    assumptions: [
      assumption("free_cash_flow", "Flujo de caja base", freeCashFlow, "observed", null),
      assumption("diluted_shares", "Acciones inferidas", shares, "calculated", "Capitalización / precio observado"),
      assumption("growth", "Crecimiento central", normalizedGrowth, revenueGrowth === null ? "inferred" : "observed", revenueGrowth === null ? "Prior conservador de 5%" : null),
      assumption("discount_rate", "Tasa de descuento central", 0.105, "inferred", "Rango de estrés: 9%–13%"),
      assumption("terminal_growth", "Crecimiento terminal central", 0.022, "inferred", "Rango de estrés: 1,2%–3%"),
    ],
    marketImplied: currentPrice === null ? null : {
      currentPrice,
      centralGapPct: range.central > 0 ? currentPrice / range.central - 1 : null,
      asOf: market.asOf || null,
    },
    valueOfInformation: plan.researchQuestions.map((question, index) => ({
      rank: index + 1,
      question,
      whyItMatters: index === 0
        ? "Mueve simultáneamente crecimiento, reinversión y duración del exceso de retorno."
        : "Determina cuánto del margen y del retorno puede sobrevivir al período explícito.",
    })),
    evidence: [
      ...(fingerprint.evidence || []),
      ...(sourceIds.length ? [{ field: "currentPrice", value: currentPrice, provenance: "observed", sourceIds }] : []),
    ],
  };
}
