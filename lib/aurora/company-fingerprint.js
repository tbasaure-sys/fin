const ARCHETYPE_PLANS = Object.freeze({
  biotech_pre_revenue: {
    primaryMethod: "risk_adjusted_pipeline_npv",
    secondaryMethods: ["milestone_option_value", "cash_runway_and_dilution"],
    researchQuestions: [
      "¿Qué hitos clínicos o regulatorios cambian la probabilidad de éxito y en qué fase está cada activo?",
      "¿Cuánta caja consume cada programa y cuánta dilución exige llegar al siguiente hito?",
      "¿Qué población, precio y duración de exclusividad sostienen el valor de cada activo?",
    ],
  },
  early_stage_option: {
    primaryMethod: "milestone_option_value",
    secondaryMethods: ["probability_weighted_scenarios", "cash_runway_and_dilution"],
    researchQuestions: [
      "¿Qué hito técnico o comercial convierte la opción en un negocio financiable?",
      "¿Qué capital adicional se necesita antes de ese hito?",
      "¿Qué contratos, capacidad o licencias respaldan la escala posible?",
    ],
  },
  mature_compounder: {
    primaryMethod: "owner_earnings_dcf",
    secondaryMethods: ["reverse_dcf", "residual_income", "roic_fade"],
    researchQuestions: [
      "¿Cuánto crecimiento puede financiar la reinversión incremental sin erosionar ROIC?",
      "¿Qué evidencia sostiene la duración de la ventaja y el margen terminal?",
    ],
  },
  asset_light_growth: {
    primaryMethod: "unit_economics_transition",
    secondaryMethods: ["reverse_dcf", "revenue_to_margin_scenarios"],
    researchQuestions: [
      "¿Qué retención, monetización y costo de adquisición sostienen el margen maduro?",
      "¿Qué parte del crecimiento es orgánica y qué reinversión requiere?",
    ],
  },
  financial: {
    primaryMethod: "residual_income",
    secondaryMethods: ["tangible_book_value", "normalized_roe"],
    researchQuestions: [
      "¿Qué pérdidas crediticias y costo de fondos normalizan el ROE?",
      "¿Qué capital regulatorio es realmente distribuible?",
    ],
  },
  real_asset: {
    primaryMethod: "net_asset_value",
    secondaryMethods: ["normalized_affo", "replacement_cost"],
    researchQuestions: [
      "¿Qué cap rates y ocupación corresponden a cada activo?",
      "¿Qué deuda, vencimientos y gasto de mantenimiento reducen el NAV?",
    ],
  },
  capacity_cycle: {
    primaryMethod: "through_cycle_cash_flow",
    secondaryMethods: ["cost_curve", "replacement_value", "capital_cycle"],
    researchQuestions: [
      "¿Dónde está la empresa en el ciclo de inventario y capacidad?",
      "¿Qué precio y utilización representan condiciones de mitad de ciclo?",
    ],
  },
  asset_heavy: {
    primaryMethod: "normalized_fcff_dcf",
    secondaryMethods: ["replacement_value", "roic_fade"],
    researchQuestions: [
      "¿Qué capex es mantenimiento y cuál crea nueva capacidad?",
      "¿Qué utilización y retorno incremental justifican el crecimiento?",
    ],
  },
  general: {
    primaryMethod: "multi_stage_dcf",
    secondaryMethods: ["reverse_dcf", "normalized_earnings"],
    researchQuestions: [
      "¿Qué crecimiento, margen y reinversión exige el precio actual?",
      "¿Qué evidencia puede confirmar o romper esos tres supuestos?",
    ],
  },
});

function numberOrNull(value) {
  if (value && typeof value === "object") value = value.value;
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, low = 0, high = 1) {
  return Math.min(Math.max(Number(value) || 0, low), high);
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

export function buildCompanyFingerprint(input = {}) {
  const profile = input.profile && typeof input.profile === "object" ? { ...input.profile } : {};
  const financials = input.financials && typeof input.financials === "object" ? input.financials : {};
  const history = input.history && typeof input.history === "object" ? input.history : {};
  const sector = String(profile.sector || "").toLowerCase();
  const industry = String(profile.industry || "").toLowerCase();
  const description = String(profile.description || "").toLowerCase();
  const text = `${sector} ${industry} ${description}`;
  const revenue = numberOrNull(financials.revenue);
  const freeCashFlow = numberOrNull(financials.freeCashFlow ?? financials.free_cash_flow);
  const cash = numberOrNull(financials.cash);
  const debt = numberOrNull(financials.debt ?? financials.totalDebt);
  const profitableYears = numberOrNull(history.profitableYears) || 0;
  const revenueYears = numberOrNull(history.revenueYears) || 0;
  const revenueObserved = revenue !== null;
  const noRevenueObserved = revenueObserved && revenue <= 0;
  const cashGenerating = freeCashFlow !== null && freeCashFlow > 0;
  const clinical = includesAny(text, ["biotech", "biotechnology", "clinical-stage", "clinical stage", "preclinical", "therapeutic"]);
  const financial = includesAny(text, ["bank", "insurance", "reinsurance", "consumer finance", "mortgage finance", "credit services"]);
  const realAsset = includesAny(text, ["reit", "real estate investment trust", "property trust"]);
  const cyclical = includesAny(text, ["semiconductor", "mining", "metals", "oil", "gas", "shipping", "airline", "steel", "chemical"]);
  const assetLight = includesAny(text, ["software", "saas", "cloud", "marketplace", "payment network", "data services"]);
  const assetHeavy = includesAny(text, ["utility", "industrial", "aerospace", "construction", "telecom", "infrastructure"]);

  let stage = revenueObserved ? "scaling" : "unknown";
  if (noRevenueObserved && !cashGenerating) stage = "pre_revenue";
  else if (cashGenerating && profitableYears >= 3 && revenueYears >= 3) stage = "mature";
  else if (cashGenerating) stage = "profitable_growth";

  let primaryArchetype = "general";
  if (clinical && stage === "pre_revenue") primaryArchetype = "biotech_pre_revenue";
  else if (stage === "pre_revenue") primaryArchetype = "early_stage_option";
  else if (financial) primaryArchetype = "financial";
  else if (realAsset) primaryArchetype = "real_asset";
  else if (cyclical) primaryArchetype = "capacity_cycle";
  else if (assetLight && stage === "mature") primaryArchetype = "mature_compounder";
  else if (assetLight) primaryArchetype = "asset_light_growth";
  else if (assetHeavy) primaryArchetype = "asset_heavy";
  else if (stage === "mature") primaryArchetype = "mature_compounder";

  const runwayYears = cash !== null && cash > 0 && freeCashFlow !== null && freeCashFlow < 0
    ? cash / Math.abs(freeCashFlow)
    : null;
  const financingDependence = stage === "pre_revenue"
    ? clamp(runwayYears === null ? 0.72 : runwayYears < 1 ? 1 : runwayYears < 2 ? 0.88 : runwayYears < 3 ? 0.68 : 0.48)
    : clamp(debt !== null && cash !== null && debt > cash ? 0.55 : 0.2);
  const evidence = [
    sector ? { field: "sector", value: profile.sector, provenance: "observed" } : null,
    industry ? { field: "industry", value: profile.industry, provenance: "observed" } : null,
    revenueObserved ? { field: "revenue", value: revenue, provenance: "observed" } : null,
    freeCashFlow !== null ? { field: "freeCashFlow", value: freeCashFlow, provenance: "observed" } : null,
    runwayYears !== null ? { field: "runwayYears", value: runwayYears, provenance: "calculated" } : null,
  ].filter(Boolean);

  return {
    version: "aurora_company_fingerprint_v1",
    ticker: String(profile.ticker || "").toUpperCase() || null,
    profile,
    stage,
    primaryArchetype,
    financingDependence,
    capitalIntensity: assetHeavy || cyclical ? "high" : assetLight ? "low" : "medium",
    cyclicality: cyclical ? "high" : financial || realAsset ? "medium" : "low",
    regulatoryExposure: clinical || financial || realAsset ? "high" : "medium",
    evidence,
    confidence: clamp(0.38 + evidence.length * 0.1, 0.38, 0.88),
  };
}

export function buildValuationPlan(fingerprint = {}) {
  const archetype = ARCHETYPE_PLANS[fingerprint.primaryArchetype] ? fingerprint.primaryArchetype : "general";
  const plan = ARCHETYPE_PLANS[archetype];
  return {
    version: "aurora_valuation_plan_v1",
    status: fingerprint.confidence >= 0.68 ? "routed" : "routed_with_wide_uncertainty",
    archetype,
    stage: fingerprint.stage || "unknown",
    primaryMethod: plan.primaryMethod,
    secondaryMethods: [...plan.secondaryMethods],
    researchQuestions: [...plan.researchQuestions],
    uncertaintyPolicy: fingerprint.confidence >= 0.68
      ? "parameterize_observed_and_inferred_inputs"
      : "widen_range_until_primary_evidence_improves",
  };
}

