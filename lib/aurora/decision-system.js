import { buildCompanyFingerprint, buildValuationPlan } from "./company-fingerprint.js";
import { buildConditionalValuation } from "./conditional-valuation.js";
import { applyMosaicContextToValuation, buildCompanyExposureGraph } from "./macro-valuation-bridge.js";

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizedRatio(value) {
  const number = finite(value);
  if (number === null) return null;
  return Math.abs(number) > 2 ? number / 100 : number;
}

function metricPoint(research, patterns) {
  return list(research?.sources?.data_points).find((point) => {
    const metric = String(point?.metric || "").toLowerCase();
    return patterns.some((pattern) => pattern.test(metric));
  });
}

function metricObservation(research, patterns) {
  const point = list(research?.sources?.data_points).find((candidate) => {
    const metric = String(candidate?.metric || "").toLowerCase();
    const value = finite(candidate?.normalized_value ?? candidate?.normalizedValue ?? candidate?.value);
    const source = String(candidate?.source_id || candidate?.source || "").trim();
    const asOf = String(candidate?.as_of || candidate?.asOf || candidate?.date || "").trim();
    return patterns.some((pattern) => pattern.test(metric)) && value !== null && source && asOf;
  });
  if (!point) return null;
  return {
    value: finite(point.normalized_value ?? point.normalizedValue ?? point.value),
    provenance: String(point.provenance || "observed").trim(),
    source: String(point.source_id || point.source).trim(),
    asOf: String(point.as_of || point.asOf || point.date).trim(),
  };
}

function inputValue(value) {
  return finite(value && typeof value === "object" ? value.value : value);
}

function metricValue(research, patterns) {
  const point = metricPoint(research, patterns);
  return finite(point?.normalized_value ?? point?.normalizedValue ?? point?.value);
}

function sourceIds(research, patterns) {
  const point = metricPoint(research, patterns);
  return [...new Set([
    point?.source_id,
    ...list(point?.source_ids),
  ].filter(Boolean))];
}

function publicInputs(research) {
  const profile = research?.company_profile || {};
  const ratios = research?.financials?.ratios || {};
  const valuation = research?.valuation || {};
  const annual = list(research?.financials?.annual);
  const revenue = metricObservation(research, [/latest_revenue$/, /total_revenue$/, /revenue$/])
    ?? finite(ratios.latest_revenue);
  const freeCashFlow = metricObservation(research, [/latest_(free_)?cash_flow$/, /free_cash_flow$/, /financials.*free_cash_flow$/])
    ?? finite(ratios.latest_fcf);
  const currentPrice = finite(valuation.current_price)
    ?? metricValue(research, [/current_price$/, /market_price$/, /price_per_share$/]);
  const marketCap = metricObservation(research, [/market_cap(italization)?$/])
    ?? finite(profile.market_cap ?? profile.marketCap);
  const cash = metricObservation(research, [/(^|\.)cash(_and_equivalents)?$/, /cash_and_short_term/]);
  const debt = metricObservation(research, [/total_debt$/, /(^|\.)debt$/]);
  const dilutedShares = metricObservation(research, [/latest_diluted_shares$/, /diluted_shares$/, /weighted_average.*diluted/])
    ?? finite(ratios.latest_diluted_shares);
  const marketSourceIds = [
    ...list(valuation?.price_validation?.source_ids),
    ...sourceIds(research, [/current_price$/, /market_price$/]),
  ];
  return {
    profile: {
      ticker: research?.ticker || profile.ticker,
      name: profile.name,
      sector: profile.sector,
      industry: profile.industry,
      description: profile.description,
      currency: profile.currency || valuation.currency,
      marketCap,
      mosaicExposureLinks: list(profile.mosaicExposureLinks || profile.mosaic_exposure_links),
    },
    financials: {
      revenue,
      freeCashFlow,
      cash,
      debt,
      dilutedShares,
      revenueGrowth: normalizedRatio(ratios.revenue_cagr_5y),
      roic: normalizedRatio(ratios.roic),
      assumptionSets: research?.financials?.assumptionSets,
      pipeline: research?.pipeline || research?.company_profile?.pipeline,
      throughCycleFreeCashFlow: research?.financials?.throughCycleFreeCashFlow
        || research?.financials?.through_cycle_free_cash_flow,
    },
    history: {
      profitableYears: inputValue(freeCashFlow) > 0 ? Math.min(5, annual.length) : 0,
      revenueYears: inputValue(revenue) > 0 ? Math.min(5, annual.length) : 0,
    },
    market: {
      currentPrice,
      asOf: valuation.market_data_as_of || null,
      sourceIds: [...new Set(marketSourceIds.filter(Boolean))],
    },
  };
}

function usableInstitutionalValuation(research) {
  const valuation = research?.valuation || {};
  const status = String(valuation.status || "").toLowerCase();
  const range = valuation.range || {};
  const low = finite(range.low);
  const central = finite(range.central);
  const high = finite(range.high);
  if (
    valuation.available !== true
    || !["decision_ready", "research_grade"].includes(status)
    || low === null
    || high === null
    || low <= 0
    || high <= low
    || (status === "decision_ready" && (central === null || central <= low || central >= high))
  ) return null;
  return {
    version: "aurora_institutional_valuation_reference_v1",
    status,
    decisionReady: status === "decision_ready",
    currency: valuation.currency || research?.company_profile?.currency || "USD",
    method: valuation.primary_method || "institutional_model",
    range: status === "decision_ready" ? { low, central, high } : { low, high },
    summary: "Rango institucional recibido del motor determinístico y conservado sin reemplazar sus controles.",
    assumptions: list(valuation.assumptions),
    valueOfInformation: [],
    evidence: [],
  };
}

function debateClaims({ plan, valuation, bridge, fingerprint }) {
  const inferred = list(valuation.assumptions).filter((item) => item?.provenance === "inferred");
  const firstQuestion = list(valuation.valueOfInformation)[0] || { question: plan.researchQuestions[0] };
  const macroAdjustment = list(bridge?.adjustments)[0];
  return [
    {
      id: "valuation-specialist",
      role: "Especialista en valuación",
      stance: "base_case",
      claim: `El método principal adecuado es ${plan.primaryMethod}; el rango se publica como ${valuation.status}.`,
      mechanism: `La clasificación ${fingerprint.primaryArchetype} determina qué variable económica carga el valor.`,
      impact: "valuation_method",
      provenance: "calculated",
      confidence: fingerprint.confidence,
    },
    {
      id: "model-skeptic",
      role: "Escéptico del modelo",
      stance: "challenge",
      claim: inferred.length
        ? `La principal fragilidad está en ${inferred.map((item) => item.label).slice(0, 2).join(" y ")}.`
        : "El rango debe sobrevivir escenarios adversos y una verificación independiente de sus datos base.",
      mechanism: "Los supuestos inferidos ensanchan el rango y nunca se convierten silenciosamente en hechos.",
      impact: "uncertainty",
      provenance: inferred.length ? "inferred" : "policy",
      confidence: Math.max(0.35, fingerprint.confidence - 0.15),
    },
    {
      id: "research-lead",
      role: "Líder de research",
      stance: "next_test",
      claim: firstQuestion?.question || "Definir la evidencia que más puede cambiar el rango.",
      mechanism: firstQuestion?.whyItMatters || "Prioriza información por su capacidad de cambiar la valuación.",
      impact: "value_of_information",
      provenance: "calculated",
      confidence: 0.75,
    },
    {
      id: "macro-red-team",
      role: "Red team macro",
      stance: macroAdjustment ? "context_adjustment" : "no_direct_link",
      claim: macroAdjustment
        ? `MOSAIC afecta el rango mediante ${macroAdjustment.driver}, con un impacto acotado y trazable.`
        : "MOSAIC no cambia el rango sin una exposición causal demostrable para esta empresa.",
      mechanism: macroAdjustment?.chain || "Sin vínculo empresa→factor→flujo, el contexto macro permanece informativo pero no altera el valor.",
      impact: "macro_context",
      provenance: macroAdjustment ? "source_linked" : "policy",
      confidence: macroAdjustment?.confidence || 0.7,
      sourceIds: macroAdjustment?.sourceIds || [],
    },
  ];
}

function publicEvidenceText(value) {
  const text = String(value || "").trim().slice(0, 180);
  if (!text || /^[A-Za-z]:[\\/]/.test(text) || /^\\\\/.test(text) || /^\/(?:Users|home|tmp)\//i.test(text)) {
    return null;
  }
  return text;
}

function exposedSourceIds(value) {
  return [...new Set(list(value).map(publicEvidenceText).filter(Boolean))].slice(0, 24);
}

function exposedEvidence(value) {
  return list(value).slice(0, 24).map((row) => ({
    sourceId: publicEvidenceText(row?.sourceId || row?.source_id),
    provider: publicEvidenceText(row?.provider || row?.provider_name),
    asOf: publicEvidenceText(row?.asOf || row?.as_of),
  })).filter((row) => row.sourceId);
}

function exposedMosaicContext(context) {
  if (context?.version !== "mosaic_context_v2") return null;
  return {
    version: context.version,
    asOf: context.asOf || null,
    status: context.status || "unknown",
    confidence: finite(context.confidence),
    axes: {
      supply: finite(context?.axes?.supply) || 0,
      demand: finite(context?.axes?.demand) || 0,
      liquidity: finite(context?.axes?.liquidity) || 0,
    },
    freshness: context.freshness || null,
    liquidity: context.liquidity ? {
      factorId: "global_liquidity",
      status: context.liquidity.freshness?.status || "unknown",
      usable: context.liquidity.usable === true,
      asOf: publicEvidenceText(context.liquidity.asOf),
      sourceIds: exposedSourceIds(context.liquidity.sourceIds),
      freshness: context.liquidity.freshness || null,
      confidence: finite(context.liquidity.confidence),
    } : null,
    markets: list(context.markets).slice(0, 12).map((market) => ({
      id: market.id,
      marketId: market.id,
      name: market.name,
      region: market.region,
      sector: market.sector,
      axes: market.axes,
      score: finite(market.score),
      confidence: finite(market.confidence),
      freshness: market.freshness,
      status: market.freshness?.status || "unknown",
      asOf: publicEvidenceText(market.asOf),
      sourceIds: exposedSourceIds(market.sourceIds),
      evidence: exposedEvidence(market.evidence),
    })),
    providers: list(context.providers).slice(0, 12).map((provider) => ({
      name: publicEvidenceText(provider?.name),
      latest: publicEvidenceText(provider?.latest_date || provider?.latest),
      used: finite(provider?.used_series ?? provider?.used),
    })),
  };
}

export function buildAuroraDecisionSystem({ research = {}, mosaicContext = null } = {}) {
  const inputs = publicInputs(research);
  const fingerprint = buildCompanyFingerprint({
    profile: inputs.profile,
    financials: inputs.financials,
    history: inputs.history,
  });
  const plan = buildValuationPlan(fingerprint);
  const valuation = usableInstitutionalValuation(research) || buildConditionalValuation({
    fingerprint,
    profile: inputs.profile,
    financials: inputs.financials,
    market: inputs.market,
  });
  const exposures = buildCompanyExposureGraph({ fingerprint, profile: inputs.profile });
  const bridge = applyMosaicContextToValuation({
    baseValuation: valuation,
    fingerprint,
    exposures,
    context: mosaicContext || {},
  });

  return {
    version: "aurora_decision_system_v1",
    generatedAt: new Date().toISOString(),
    ticker: inputs.profile.ticker || null,
    fingerprint,
    valuationPlan: plan,
    valuation,
    exposures,
    macroContext: exposedMosaicContext(mosaicContext),
    macroBridge: bridge,
    debate: debateClaims({ plan, valuation, bridge, fingerprint }),
    guardrails: {
      agentsCanChangeFacts: false,
      agentsCanPublishDecisionReady: false,
      macroAdjustmentRequiresExposureAndSources: true,
      conditionalRangeIsDecisionReady: false,
    },
  };
}
