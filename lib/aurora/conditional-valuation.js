import { buildValuationPlan } from "./company-fingerprint.js";

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

const FACT_PROVENANCE = new Set(["observed", "calculated"]);
const ASSUMPTION_PROVENANCE = new Set(["observed", "calculated", "inferred", "policy"]);
const MIN_THROUGH_CYCLE_SPAN_DAYS = 730;

function canonicalProvenance(value, allowed) {
  const provenance = typeof value === "string" ? value.trim() : "";
  return allowed.has(provenance) ? provenance : null;
}

function canonicalDate(value) {
  const asOf = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  const timestamp = Date.parse(`${asOf}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === asOf ? asOf : null;
}

function boundedDate(value, cutoff = null) {
  const asOf = canonicalDate(value);
  if (!asOf || (cutoff && asOf > cutoff)) return null;
  return asOf;
}

function observed(value, cutoff = null) {
  if (!value || typeof value !== "object") return null;
  const number = finite(value.value);
  const provenance = canonicalProvenance(value.provenance, FACT_PROVENANCE);
  const source = typeof value.source === "string" ? value.source.trim() : "";
  const asOf = boundedDate(value.asOf, cutoff);
  return number === null || !provenance || !source || !asOf ? null : { value: number, provenance, source, asOf };
}

function marketObservation(value, market) {
  const number = finite(value);
  const sourceIds = list(market?.sourceIds)
    .map((source) => (typeof source === "string" ? source.trim() : ""))
    .filter(Boolean);
  const asOf = boundedDate(market?.asOf ?? market?.as_of, new Date().toISOString().slice(0, 10));
  return number === null || !asOf || !sourceIds.length ? null : { value: number, provenance: "observed", source: sourceIds.join(" + "), asOf };
}

function marketCapObservation(value, price, shares) {
  const reported = observed(value, price?.asOf || null);
  if (reported && reported.value > 0) return reported;
  if (!price || !shares || shares.value <= 0) return null;
  return { value: price.value * shares.value, provenance: "calculated", source: `${price.source} + ${shares.source}`, asOf: price.asOf };
}

function scenarioSet(sets, key, fields, cutoff = null) {
  const set = sets?.[key];
  const build = (row) => {
    if (!row || typeof row !== "object") return null;
    const provenance = canonicalProvenance(row.provenance, ASSUMPTION_PROVENANCE);
    const source = typeof row.source === "string" ? row.source.trim() : "";
    const asOf = boundedDate(row.asOf, cutoff);
    const values = Object.fromEntries(fields.map((field) => [field, finite(row[field])]));
    const dcfValid = !fields.includes("years") || (Number.isInteger(values.years) && values.years >= 1 && values.years <= 20 && values.growth >= -0.5 && values.growth <= 0.5 && values.discountRate > 0 && values.discountRate < 1 && values.terminalGrowth > -0.1 && values.terminalGrowth < 0.1 && values.discountRate > values.terminalGrowth);
    const rnpvValid = !fields.includes("probabilityMultiplier") || (values.probabilityMultiplier > 0 && values.valueMultiplier > 0);
    const reitValid = !fields.includes("affoWeight") || (values.affoMultiple > 0 && values.affoWeight >= 0 && values.navWeight >= 0 && Math.abs(values.affoWeight + values.navWeight - 1) < 1e-9);
    return provenance && source && asOf && Object.values(values).every((value) => value !== null) && dcfValid && rnpvValid && reitValid
      ? { ...values, provenance, source, asOf }
      : null;
  };
  const low = build(set?.low);
  const high = build(set?.high);
  return low && high ? { low, high } : null;
}

function assumptionRows(items) {
  return items.flatMap((item) => {
    if (!item) return [];
    if (item.low && item.high) return ["low", "high"].flatMap((side) => Object.entries(item[side])
      .filter(([key]) => !["provenance", "source", "asOf"].includes(key))
      .map(([key, value]) => ({ key: `${item.key}_${side}_${key}`, label: `${item.label} ${side} ${key}`, value, provenance: item[side].provenance, source: item[side].source, asOf: item[side].asOf })));
    return [{ key: item.key, label: item.label, value: item.value, provenance: item.provenance, source: item.source, asOf: item.asOf }];
  });
}

function requirements(plan, extra = []) {
  return [...extra, ...list(plan.researchQuestions).map((question, index) => ({
    key: `research_question_${index + 1}`,
    control: question,
    why: "Puede cambiar el método o invalidar un supuesto efectivo.",
    nextAction: question,
  }))];
}

function base({ status, currency, method, plan, fingerprint, summary, currentPrice = null, range = null, assumptions = [], marketImplied = null, closure = [] }) {
  return {
    version: "aurora_conditional_valuation_v3",
    status,
    decisionReady: false,
    currency,
    method,
    range,
    currentPrice,
    summary,
    assumptions,
    marketImplied,
    valueOfInformation: list(plan.researchQuestions).map((question, index) => ({ rank: index + 1, question, whyItMatters: "Puede cambiar el método o invalidar un supuesto efectivo." })),
    closureRequirements: requirements(plan, closure),
    evidence: fingerprint.evidence || [],
    confidence: finite(fingerprint.confidence),
  };
}

function expectations({ currentPrice, marketCap, capObservation = null, fcf, equity, netIncome, affo, nav, shares, market }) {
  const price = marketObservation(currentPrice, market);
  const cap = capObservation || marketCapObservation(marketCap, price, shares);
  if (!price) return [];
  const evidence = { provenance: "observed", source: price.source, asOf: price.asOf };
  const rows = [{ key: "current_price", label: "Cotización observada", value: price.value, unit: "currency", calculation: "Precio de cierre observado", ...evidence }];
  if (cap && cap.value > 0) rows.push({ key: "market_cap", label: "Capitalización observada", value: cap.value, unit: "currency", calculation: "Capitalización reportada por la misma observación de mercado", ...evidence });
  const ratio = (key, label, numerator, denominator, calculation) => {
    if (!cap || !numerator || numerator.value <= 0) return;
    rows.push({ key, label, value: numerator.value / cap.value, unit: "percent", calculation, provenance: numerator.provenance, source: `${cap.source} + ${numerator.source}`, asOf: numerator.asOf });
    if (denominator) rows.push({ key: denominator.key, label: denominator.label, value: cap.value / numerator.value, unit: "x", calculation: denominator.calculation, provenance: numerator.provenance, source: `${cap.source} + ${numerator.source}`, asOf: numerator.asOf });
  };
  ratio("fcf_yield", "Rendimiento FCF implícito", fcf, { key: "price_to_fcf", label: "P/FCF implícito", calculation: "Capitalización / FCF observado" }, "FCF observado / capitalización");
  if (netIncome && equity && equity.value > 0) rows.push({ key: "roe", label: "ROE observado", value: netIncome.value / equity.value, unit: "percent", calculation: "Beneficio observado / patrimonio observado", provenance: netIncome.provenance, source: `${netIncome.source} + ${equity.source}`, asOf: netIncome.asOf });
  ratio("book_yield", "Rendimiento sobre patrimonio", equity, { key: "price_to_book", label: "P/B implícito", calculation: "Capitalización / patrimonio observado" }, "Patrimonio observado / capitalización");
  ratio("earnings_yield", "Rendimiento de beneficios implícito", netIncome, { key: "price_to_earnings", label: "P/E implícito", calculation: "Capitalización / beneficio observado" }, "Beneficio observado / capitalización");
  ratio("affo_yield", "Rendimiento AFFO implícito", affo, { key: "price_to_affo", label: "P/AFFO implícito", calculation: "Capitalización / AFFO observado" }, "AFFO observado / capitalización");
  ratio("nav_discount", "Descuento o prima a NAV", nav && cap ? { ...nav, value: nav.value - cap.value } : null, null, "NAV observado menos capitalización, dividido por capitalización");
  if (cap && cap.value > 0) {
    const marketCapRow = rows.find((row) => row.key === "market_cap");
    if (marketCapRow) Object.assign(marketCapRow, {
      label: cap.provenance === "calculated" ? "Capitalizacion derivada" : marketCapRow.label,
      calculation: cap.provenance === "calculated" ? "Precio observado × acciones diluidas observadas" : marketCapRow.calculation,
      provenance: cap.provenance,
      source: cap.source,
      asOf: cap.asOf,
    });
  }
  const signedNav = nav && cap && cap.value > 0 ? (nav.value - cap.value) / cap.value : null;
  return rows.filter((row) => row.key !== "nav_discount").concat(signedNav === null ? [] : [{
    key: "nav_discount",
    label: signedNav >= 0 ? "Descuento a NAV" : "Prima a NAV",
    value: signedNav,
    unit: "percent",
    calculation: "(NAV observado - capitalizacion) / capitalizacion",
    provenance: nav.provenance,
    source: `${cap.source} + ${nav.source}`,
    asOf: nav.asOf,
  }]);
}

function hold({ currency, currentPrice, marketCap, market, plan, fingerprint, observations, closure, method = "market_implied_expectations" }) {
  const price = marketObservation(currentPrice, market);
  const cap = marketCapObservation(marketCap, price, observations?.shares);
  if (price && price.value > 0) return base({
    status: "market_implied", currency, method, plan, fingerprint, currentPrice: price.value,
    summary: "La cotización observada expresa condiciones que los fundamentos todavía deben justificar; no es un valor razonable.",
    marketImplied: { currentPrice: price.value, marketCap: cap, expectations: expectations({ currentPrice, marketCap, capObservation: cap, market, ...observations }), interpretation: "Las expectativas se calculan solo con observaciones trazables disponibles." },
    closure,
  });
  return base({ status: "blocked", currency, method, plan, fingerprint, summary: "No hay precio observable ni un intervalo fundamental con todos sus inputs y supuestos trazables.", closure });
}

function dcfValue(fcf, cash, debt, shares, scenario) {
  if (scenario.discountRate <= scenario.terminalGrowth) return null;
  let projected = fcf.value;
  let present = 0;
  for (let year = 1; year <= scenario.years; year += 1) {
    projected *= 1 + scenario.growth;
    present += projected / ((1 + scenario.discountRate) ** year);
  }
  const terminal = projected * (1 + scenario.terminalGrowth) / (scenario.discountRate - scenario.terminalGrowth);
  const value = (present + terminal / ((1 + scenario.discountRate) ** scenario.years) + cash.value - debt.value) / shares.value;
  return value > 0 ? value : null;
}

function research({ currency, method, plan, fingerprint, currentPrice, low, high, assumptions, summary, closure }) {
  if (!(Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > low)) return hold({ currency, currentPrice, plan, fingerprint, closure, method: "market_implied_expectations", ...plan.marketContext });
  return base({ status: "research_grade", currency, method, plan, fingerprint, currentPrice: finite(currentPrice), range: { low, high }, assumptions, summary, closure });
}

export function buildConditionalValuation({ fingerprint = {}, profile = {}, financials = {}, market = {} } = {}) {
  const plan = buildValuationPlan(fingerprint);
  const currency = String(profile.currency || "USD").toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  const marketAsOf = boundedDate(market.asOf ?? market.as_of, today);
  const evidenceCutoff = marketAsOf || today;
  const priceObservation = marketObservation(market.currentPrice ?? market.current_price, market);
  const currentPrice = priceObservation?.value ?? null;
  const marketCap = profile.marketCap ?? profile.market_cap;
  const fcf = observed(financials.freeCashFlow ?? financials.free_cash_flow ?? financials.latest_fcf, evidenceCutoff);
  const cash = observed(financials.cash, evidenceCutoff);
  const debt = observed(financials.debt ?? financials.totalDebt ?? financials.total_debt, evidenceCutoff);
  const shares = observed(financials.dilutedShares ?? financials.diluted_shares ?? financials.shares, evidenceCutoff);
  const equity = observed(financials.equity ?? financials.totalEquity ?? financials.total_equity ?? financials.bookValue, evidenceCutoff);
  const netIncome = observed(financials.netIncome ?? financials.net_income, evidenceCutoff);
  const affo = observed(financials.affo ?? financials.normalizedAffo ?? financials.normalized_affo, evidenceCutoff);
  const nav = observed(financials.nav ?? financials.netAssetValue ?? financials.net_asset_value, evidenceCutoff);
  const observations = { fcf, equity, netIncome, affo, nav, shares };
  plan.marketContext = { marketCap, market, observations };
  const archetype = plan.archetype;

  if (archetype === "financial") {
    const scenarios = scenarioSet(financials.assumptionSets, "residual_income", ["costOfEquity", "terminalGrowth"], evidenceCutoff);
    const close = [{ key: "book_and_roe", control: "Patrimonio, beneficio y supuestos de ingreso residual", why: "Una financiera requiere patrimonio, beneficio, acciones y coste de capital explícitos.", nextAction: "Conciliar patrimonio, beneficio normalizado, acciones, coste de capital y crecimiento terminal con fuente y fecha." }];
    if (equity && netIncome && shares && scenarios) {
      const value = (side) => {
        const row = scenarios[side];
        return row.costOfEquity > row.terminalGrowth ? (equity.value + (netIncome.value - row.costOfEquity * equity.value) / (row.costOfEquity - row.terminalGrowth)) / shares.value : null;
      };
      return research({ currency, method: "residual_income", plan, fingerprint, currentPrice, low: value("low"), high: value("high"), assumptions: assumptionRows([{ key: "equity", label: "Patrimonio", ...equity }, { key: "net_income", label: "Beneficio", ...netIncome }, { key: "shares", label: "Acciones diluidas", ...shares }, { key: "residual_income", label: "Supuesto residual", ...scenarios }]), summary: "Intervalo de ingreso residual con inputs y supuestos trazables; no es valor razonable publicable.", closure: close });
    }
    return hold({ currency, currentPrice, marketCap, market, plan, fingerprint, observations, closure: close });
  }

  if (archetype === "real_asset") {
    const scenarios = scenarioSet(financials.assumptionSets, "affo_nav", ["affoMultiple", "affoWeight", "navWeight"], evidenceCutoff);
    const close = [{ key: "affo_nav_inputs", control: "AFFO/NAV y supuestos explícitos", why: "Un REIT no se valora con múltiplos implícitos no documentados.", nextAction: "Conciliar AFFO, NAV, acciones y escenarios de múltiplo/peso NAV con fuente y fecha." }];
    if (affo && nav && shares && scenarios) {
      const value = (side) => ((affo.value * scenarios[side].affoMultiple * scenarios[side].affoWeight) + (nav.value * scenarios[side].navWeight)) / shares.value;
      return research({ currency, method: "affo_nav", plan, fingerprint, currentPrice, low: value("low"), high: value("high"), assumptions: assumptionRows([{ key: "affo", label: "AFFO", ...affo }, { key: "nav", label: "NAV", ...nav }, { key: "shares", label: "Acciones diluidas", ...shares }, { key: "affo_nav", label: "Supuesto AFFO/NAV", ...scenarios }]), summary: "Intervalo AFFO/NAV con supuestos explícitos y trazables; no es valor razonable publicable.", closure: close });
    }
    return hold({ currency, currentPrice, marketCap, market, plan, fingerprint, observations, closure: close });
  }

  if (archetype === "biotech_pre_revenue") {
    const scenarios = scenarioSet(financials.assumptionSets, "risk_adjusted_pipeline_npv", ["probabilityMultiplier", "valueMultiplier"], evidenceCutoff);
    const assets = list(financials.pipeline ?? financials.pipelineAssets ?? financials.pipeline_assets);
    const normalizedAssets = assets.map((asset) => {
      const phase = typeof asset?.phase === "string" ? asset.phase.trim() : "";
      const probability = finite(asset?.probability);
      const potentialValue = finite(asset?.potentialValue ?? asset?.potential_value);
      const provenance = canonicalProvenance(asset?.provenance, ASSUMPTION_PROVENANCE);
      const source = typeof asset?.source === "string" ? asset.source.trim() : "";
      const asOf = boundedDate(asset?.asOf ?? asset?.as_of, evidenceCutoff);
      if (!phase || probability === null || probability < 0 || probability > 1 || potentialValue === null || potentialValue <= 0 || !provenance || !source || !asOf) return null;
      return { phase, probability, potentialValue, provenance, source, asOf };
    }).filter(Boolean);
    const validAssets = assets.length > 0 && normalizedAssets.length === assets.length;
    const close = [{ key: "pipeline_evidence", control: "Pipeline, probabilidad y valor por activo", why: "El rNPV requiere fase, probabilidad, valor y procedencia para cada activo.", nextAction: "Documentar fase, probabilidad, valor, fuente y fecha de cada activo y los escenarios rNPV." }];
    if (validAssets && cash && debt && shares && scenarios) {
      const value = (side) => (normalizedAssets.reduce((total, asset) => total + asset.probability * asset.potentialValue * scenarios[side].probabilityMultiplier * scenarios[side].valueMultiplier, 0) + cash.value - debt.value) / shares.value;
      const assetRows = normalizedAssets.flatMap((asset, index) => ["probability", "potentialValue"].map((key) => ({ key: `pipeline_${index + 1}_${key}`, label: `Pipeline ${index + 1} ${key}`, value: asset[key], provenance: asset.provenance, source: asset.source, asOf: asset.asOf })));
      return research({ currency, method: "risk_adjusted_pipeline_npv", plan, fingerprint, currentPrice, low: value("low"), high: value("high"), assumptions: [...assumptionRows([{ key: "cash", label: "Caja", ...cash }, { key: "debt", label: "Deuda", ...debt }, { key: "shares", label: "Acciones diluidas", ...shares }, { key: "rnpv", label: "Supuesto rNPV", ...scenarios }]), ...assetRows], summary: "Intervalo rNPV con activos y escenarios trazables; no es valor razonable publicable.", closure: close });
    }
    return hold({ currency, currentPrice, marketCap, market, plan, fingerprint, observations, closure: close });
  }

  const cycle = archetype === "capacity_cycle";
  const history = list(financials.throughCycleFreeCashFlow ?? financials.through_cycle_free_cash_flow)
    .map((item) => observed(item, evidenceCutoff))
    .filter(Boolean);
  const historyDates = [...new Set(history.map((item) => item.asOf))].sort();
  const historySpanDays = historyDates.length >= 2
    ? (Date.parse(`${historyDates.at(-1)}T00:00:00.000Z`) - Date.parse(`${historyDates[0]}T00:00:00.000Z`)) / 86_400_000
    : 0;
  const validThroughCycleHistory = history.length >= 3
    && historyDates.length >= 3
    && historySpanDays >= MIN_THROUGH_CYCLE_SPAN_DAYS;
  const baseFcf = cycle
    ? validThroughCycleHistory
      ? {
        value: history.reduce((total, item) => total + item.value, 0) / history.length,
        provenance: "calculated",
        source: [...new Set(history.map((item) => item.source))].join(" + "),
        asOf: historyDates.at(-1),
      }
      : null
    : fcf;
  const scenarios = scenarioSet(financials.assumptionSets, cycle ? "through_cycle_cash_flow" : "dcf", ["growth", "discountRate", "terminalGrowth", "years"], evidenceCutoff);
  const close = [{ key: cycle ? "through_cycle_history" : "dcf_inputs", control: cycle ? "Historial through-cycle y escenarios" : "FCF, balance y escenarios DCF", why: cycle ? "Un solo FCF no identifica el ciclo." : "Un DCF exige caja, deuda, acciones y supuestos explícitos.", nextAction: cycle ? "Documentar al menos tres fechas distintas de FCF que cubran dos años o más, además de escenarios con fuente y fecha." : "Conciliar FCF, caja, deuda, acciones y escenarios low/high con fuente y fecha." }];
  if (baseFcf && cash && debt && shares && scenarios) {
    return research({ currency, method: cycle ? "through_cycle_cash_flow" : plan.primaryMethod, plan, fingerprint, currentPrice, low: dcfValue(baseFcf, cash, debt, shares, scenarios.low), high: dcfValue(baseFcf, cash, debt, shares, scenarios.high), assumptions: assumptionRows([{ key: "fcf", label: cycle ? "FCF through-cycle" : "FCF", ...baseFcf }, { key: "cash", label: "Caja", ...cash }, { key: "debt", label: "Deuda", ...debt }, { key: "shares", label: "Acciones diluidas", ...shares }, { key: "dcf", label: "Supuesto DCF", ...scenarios }]), summary: "Intervalo DCF condicionado a inputs y escenarios trazables; no es valor razonable publicable.", closure: close });
  }
  return hold({ currency, currentPrice, marketCap, market, plan, fingerprint, observations, closure: close });
}
