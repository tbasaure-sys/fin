import { buildCompanyFingerprint } from "./company-fingerprint.js";
import { buildConditionalValuation } from "./conditional-valuation.js";
import { buildEquityValuationPresentation } from "../equity-valuation-presentation.js";

const FACT_PROVENANCE = new Set(["observed", "calculated"]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function canonicalDate(value) {
  const asOf = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  const timestamp = Date.parse(`${asOf}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === asOf ? asOf : null;
}

function canonicalEvidenceDate(value) {
  const asOf = canonicalDate(value);
  return asOf && asOf <= new Date().toISOString().slice(0, 10) ? asOf : null;
}

function canonicalFactProvenance(value) {
  const provenance = text(value);
  return FACT_PROVENANCE.has(provenance) ? provenance : null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finite(value);
    if (number !== null) return number;
  }
  return null;
}

function tracedPoint(research, patterns) {
  return list(research?.sources?.data_points).find((candidate) => {
    const metric = text(candidate?.metric).toLowerCase();
    const value = firstFinite(candidate?.normalized_value, candidate?.normalizedValue, candidate?.value);
    return patterns.some((pattern) => pattern.test(metric))
      && value !== null
      && text(candidate?.source_id || candidate?.source)
      && canonicalEvidenceDate(candidate?.as_of || candidate?.asOf || candidate?.date);
  });
}

function pointValue(research, patterns) {
  const point = tracedPoint(research, patterns);
  return firstFinite(point?.normalized_value, point?.normalizedValue, point?.value);
}

function auroraPriceFact(valuation) {
  const marketImplied = valuation?.marketImplied;
  const expectation = list(marketImplied?.expectations).find((item) => text(item?.key).toLowerCase() === "current_price");
  return expectation || (marketImplied?.currentPrice && typeof marketImplied.currentPrice === "object"
    ? marketImplied.currentPrice
    : null);
}

function auroraPriceObservation(valuation) {
  const marketImplied = valuation?.marketImplied;
  const fact = auroraPriceFact(valuation);
  const value = firstFinite(fact?.value);
  const declaredPrice = firstFinite(valuation?.currentPrice, typeof marketImplied?.currentPrice === "object" ? null : marketImplied?.currentPrice);
  const provenance = canonicalFactProvenance(fact?.provenance);
  const source = text(fact?.source);
  const asOf = canonicalEvidenceDate(fact?.asOf ?? fact?.as_of);
  if (value === null || value <= 0 || (declaredPrice !== null && declaredPrice !== value) || !provenance || !source || !asOf) return null;
  return { value, provenance, source, asOf };
}

function inputs(research) {
  const profile = research?.company_profile || {};
  const valuation = research?.valuation || {};
  const valuationPrice = firstFinite(valuation.current_price);
  const valuationSource = text(valuation?.price_validation?.source);
  const valuationAsOf = canonicalEvidenceDate(valuation.market_data_as_of);
  const valuationObservation = valuationPrice !== null && valuationSource && valuationAsOf
    ? { value: valuationPrice, source: valuationSource, asOf: valuationAsOf }
    : null;
  const pointPrice = tracedPoint(research, [/current_price$/, /market_price$/, /price_per_share$/]);
  const priceObservation = valuationObservation || (pointPrice ? {
    value: firstFinite(pointPrice.normalized_value, pointPrice.normalizedValue, pointPrice.value),
    source: text(pointPrice.source_id || pointPrice.source),
    asOf: canonicalDate(pointPrice.as_of || pointPrice.asOf || pointPrice.date),
  } : null);
  const capPoint = tracedPoint(research, [/market_cap(italization)?$/]);
  return {
    profile,
    price: priceObservation?.value ?? valuationPrice ?? pointValue(research, [/current_price$/, /market_price$/, /price_per_share$/]),
    marketCap: capPoint ? { value: firstFinite(capPoint.normalized_value, capPoint.normalizedValue, capPoint.value), provenance: "observed", source: text(capPoint.source_id || capPoint.source), asOf: canonicalDate(capPoint.as_of || capPoint.asOf || capPoint.date) } : null,
    currency: text(valuation.currency || profile.currency).toUpperCase() || "USD",
    marketDate: priceObservation?.asOf || null,
    priceSource: priceObservation?.source || null,
  };
}

function normalizedRange(range, { allowCentral }) {
  const low = finite(range?.low);
  const high = finite(range?.high);
  const central = finite(range?.central);
  if (low === null || high === null || low <= 0 || high < low) return null;
  if (allowCentral && (central === null || central < low || central > high)) return null;
  return allowCentral ? { low, central, high } : { low, central: null, high };
}

function requirementsFor(profile) {
  const archetype = `${text(profile?.sector)} ${text(profile?.industry)}`.toLowerCase();
  if (/bank|financial|insurance|credit/.test(archetype)) return [{ key: "book_and_roe", control: "Valor contable y ROE observados", why: "La entidad requiere una base de ingreso residual.", nextAction: "Conciliar patrimonio tangible, beneficio normalizado, ROE y acciones diluidas." }];
  if (/reit|real estate investment trust|property trust/.test(archetype)) return [{ key: "affo_or_nav", control: "AFFO o NAV observados", why: "El valor depende de flujos distribuibles o activos netos.", nextAction: "Conciliar AFFO normalizado, NAV por activo, deuda y acciones diluidas." }];
  if (/biotech|biotechnology|clinical/.test(archetype)) return [{ key: "pipeline_evidence", control: "Evidencia de pipeline", why: "El rNPV exige activos, fase y probabilidad observables.", nextAction: "Documentar cada activo, fase clínica, probabilidad de éxito y economía comercial." }];
  if (/semiconductor|mining|metals|oil|gas|shipping|airline|steel|chemical/.test(archetype)) return [{ key: "through_cycle_history", control: "Historial through-cycle", why: "Un FCF aislado no identifica el punto del ciclo.", nextAction: "Reunir al menos tres observaciones de utilización, precio/coste y flujo de caja a través del ciclo." }];
  return [{ key: "fundamental_inputs", control: "Flujo, balance y acciones diluidas", why: "Un método fundamental trazable requiere inputs observados.", nextAction: "Conciliar flujo de caja, balance, acciones diluidas y supuestos de reinversión." }];
}

function result({ status, currency, method, range = null, price = null, marketDate = null, priceSource = null, reason, drivers = [], closureRequirements = [], marketImplied = null, confidenceScore = null }) {
  const researchGrade = status === "research_grade";
  const decisionReady = status === "decision_ready";
  return {
    version: "aurora_valuation_contract_v2",
    status,
    kind: decisionReady ? "defendable" : researchGrade ? "research" : status === "market_implied" ? "market_implied" : "blocked",
    basis: decisionReady ? "institutional_model" : researchGrade ? "conditional_fundamental_model" : status === "market_implied" ? "market_observation" : "unresolved",
    range,
    method,
    currency,
    currentPrice: price,
    marketDataAsOf: marketDate,
    priceSource,
    priceIsContextual: status !== "decision_ready",
    confidence: { label: decisionReady ? "Alta" : researchGrade ? "Media" : "Baja", score: finite(confidenceScore) ?? (decisionReady ? 0.8 : researchGrade ? 0.58 : 0.22), reason },
    drivers,
    scenarios: range
      ? [{ key: "low", label: "Adverso", value: range.low, explanation: "Supuestos conservadores observables." }, { key: "high", label: "Favorable", value: range.high, explanation: "Supuestos favorables observables." }]
      : [],
    reason,
    limitations: decisionReady ? [] : ["No se publica un valor razonable hasta cerrar los requisitos observables."],
    closureRequirements,
    marketImplied,
  };
}

function canonical(research, values) {
  const valuation = research?.valuation || {};
  const status = text(valuation.status).toLowerCase();
  const method = text(valuation.primary_method);
  const presentation = buildEquityValuationPresentation(research);
  if (status === "decision_ready" && presentation.state === "decision_ready") {
    const range = normalizedRange(valuation.range, { allowCentral: true });
    if (range) return result({ status, currency: text(valuation.currency).toUpperCase() || values.currency, method, range, price: values.price, marketDate: values.marketDate, priceSource: values.priceSource, reason: text(valuation.summary) || "Rango fundamental trazable con controles institucionales superados.", drivers: list(valuation?.driver_summary?.requirements), confidenceScore: valuation?.reliability?.score });
  }
  if (status === "research_grade" && presentation.state === "research_grade") {
    const range = normalizedRange(valuation.range, { allowCentral: false });
    if (range) return result({ status, currency: text(valuation.currency).toUpperCase() || values.currency, method, range, price: values.price, marketDate: values.marketDate, priceSource: values.priceSource, reason: text(valuation.summary) || "Intervalo condicional bajo investigación.", closureRequirements: requirementsFor(values.profile), confidenceScore: valuation?.reliability?.score });
  }
  return null;
}

function auroraConditional(research, values) {
  const valuation = research?.aurora?.macroBridge?.status === "context_applied"
    ? research.aurora.macroBridge.contextual
    : research?.aurora?.valuation;
  const status = text(valuation?.status).toLowerCase();
  if (!valuation || !["research_grade", "market_implied", "blocked", "conditional_range", "market_implied_hurdle", "research_route"].includes(status)) return null;
  const candidateRange = normalizedRange(valuation.range, { allowCentral: false });
  const embeddedPriceFact = auroraPriceFact(valuation);
  const embeddedPrice = auroraPriceObservation(valuation);
  const rawPriceIsTraced = values.price !== null
    && values.price > 0
    && Boolean(values.priceSource)
    && Boolean(values.marketDate)
    && !/cotizaci/i.test(values.priceSource);
  const embeddedPriceConflictsWithRaw = embeddedPrice && rawPriceIsTraced
    && (embeddedPrice.value !== values.price || embeddedPrice.asOf !== values.marketDate);
  if ((embeddedPriceFact && !embeddedPrice && rawPriceIsTraced) || embeddedPriceConflictsWithRaw) {
    return null;
  }
  const observedPrice = firstFinite(valuation.currentPrice, typeof valuation?.marketImplied?.currentPrice === "object" ? null : valuation?.marketImplied?.currentPrice, embeddedPrice?.value, values.price);
  const traceableAssumptions = list(valuation.assumptions);
  const hasSufficientAssumptions = traceableAssumptions.length >= 2
    && traceableAssumptions.every((item) => text(item?.provenance) && text(item?.source) && text(item?.asOf))
    && traceableAssumptions.some((item) => /_low_/.test(text(item?.key)))
    && traceableAssumptions.some((item) => /_high_/.test(text(item?.key)));
  const priceObservation = observedPrice !== null && rawPriceIsTraced
    ? { value: observedPrice, source: values.priceSource, asOf: values.marketDate }
    : embeddedPrice;
  const traceablePrice = Boolean(priceObservation);
  const normalizedStatus = (status === "market_implied_hurdle" || status === "market_implied") && !traceablePrice ? "blocked"
    : status === "market_implied_hurdle" ? "market_implied"
    : status === "research_route" ? (traceablePrice ? "market_implied" : "blocked")
      : (status === "conditional_range" || status === "research_grade") && (!candidateRange || !hasSufficientAssumptions) ? (traceablePrice ? "market_implied" : "blocked")
        : status === "conditional_range" ? "research_grade" : status;
  if (normalizedStatus === "blocked" && traceablePrice && !candidateRange && !valuation.marketImplied) return null;
  const range = normalizedStatus === "research_grade" ? candidateRange : null;
  return result({
    status: normalizedStatus,
    currency: text(valuation.currency).toUpperCase() || values.currency,
    method: text(valuation.method) || (normalizedStatus === "market_implied" ? "market_implied_expectations" : "fundamental_research"),
    range,
    price: traceablePrice ? priceObservation.value : null,
    marketDate: traceablePrice ? priceObservation.asOf : null,
    priceSource: traceablePrice ? priceObservation.source : null,
    reason: text(valuation.summary) || "AURORA mantiene visibles las condiciones que deben cerrarse.",
    drivers: list(valuation.assumptions),
    closureRequirements: [...requirementsFor(values.profile), ...list(valuation.closureRequirements)]
      .filter((item, index, rows) => rows.findIndex((candidate) => candidate?.key === item?.key) === index),
    marketImplied: valuation.marketImplied,
    confidenceScore: valuation?.confidence?.score ?? valuation?.reliability?.score,
  });
}

function conditionalFromRawResearch(research, values) {
  const point = (patterns) => {
    const row = tracedPoint(research, patterns);
    const value = firstFinite(row?.normalized_value, row?.normalizedValue, row?.value);
    const source = text(row?.source_id || row?.source);
    const asOf = text(row?.as_of || row?.asOf || row?.date);
    return value === null || !source || !asOf ? null : { value, provenance: "observed", source, asOf };
  };
  const financials = {
    revenue: point([/latest_revenue$/, /total_revenue$/, /revenue$/]),
    freeCashFlow: point([/latest_(free_)?cash_flow$/, /free_cash_flow$/]),
    cash: point([/cash(_and_equivalents)?$/, /cash_and_short_term/]),
    debt: point([/total_debt$/, /debt$/]),
    dilutedShares: point([/diluted_shares$/, /weighted_average.*diluted/]),
    equity: point([/total_(stockholders_)?equity$/, /book_value$/]),
    netIncome: point([/latest_net_income$/, /net_income$/]),
    affo: point([/latest_affo$/, /affo$/]),
    nav: point([/latest_nav$/, /net_asset_value$/, /nav$/]),
    pipeline: research?.pipeline || research?.company_profile?.pipeline,
    assumptionSets: research?.financials?.assumptionSets,
  };
  const fingerprintFinancials = Object.fromEntries(Object.entries(financials)
    .map(([key, value]) => [key, value && typeof value === "object" && "value" in value ? value.value : value]));
  const fingerprint = buildCompanyFingerprint({
    profile: values.profile,
    financials: fingerprintFinancials,
    history: {
      profitableYears: financials.freeCashFlow?.value > 0 ? list(research?.financials?.annual).length : 0,
      revenueYears: financials.revenue?.value > 0 ? list(research?.financials?.annual).length : 0,
    },
  });
  const valuation = buildConditionalValuation({
    fingerprint,
    profile: { ...values.profile, marketCap: values.marketCap, currency: values.currency },
    financials,
    market: { currentPrice: values.price, asOf: values.marketDate, sourceIds: values.priceSource ? [values.priceSource] : [] },
  });
  return auroraConditional({ aurora: { valuation } }, values);
}

export function buildIndicativeValuation(research) {
  const values = inputs(research);
  if (/cotizaci/i.test(values.priceSource || "")) values.priceSource = null;
  const institutional = canonical(research, values);
  if (institutional) return institutional;

  const aurora = auroraConditional(research, values);
  if (aurora?.status === "research_grade") return aurora;

  const raw = conditionalFromRawResearch(research, values);
  if (raw?.status === "research_grade") return raw;

  return aurora
    || raw
    || (values.price !== null && values.price > 0 && values.priceSource && values.marketDate
      ? result({ status: "market_implied", currency: values.currency, method: "market_implied_expectations", price: values.price, marketDate: values.marketDate, priceSource: values.priceSource, reason: "La cotización observada es el único ancla disponible; AURORA no la transforma en un valor razonable.", closureRequirements: requirementsFor(values.profile) })
      : result({ status: "blocked", currency: values.currency, method: "unresolved", reason: "No hay cotización observable ni un método fundamental trazable para publicar una lectura.", closureRequirements: requirementsFor(values.profile) }));
}
