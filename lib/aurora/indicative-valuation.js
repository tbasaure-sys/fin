const SECTOR_REVENUE_MULTIPLES = {
  technology: [1.5, 3.5, 6],
  healthcare: [1, 2.5, 5],
  industrials: [0.7, 1.4, 2.5],
  energy: [0.5, 1, 1.8],
  consumer: [0.5, 1.2, 2.5],
  default: [0.6, 1.5, 3],
};

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
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

function pointValue(research, patterns) {
  const point = list(research?.sources?.data_points).find((candidate) => {
    const metric = text(candidate?.metric).toLowerCase();
    return patterns.some((pattern) => pattern.test(metric));
  });
  return firstFinite(point?.normalized_value, point?.normalizedValue, point?.value);
}

function latestAnnual(research) {
  return list(research?.financials?.annual).at(-1) || {};
}

function roundMoney(value) {
  return Math.round(Math.max(0.01, Number(value) || 0.01) * 100) / 100;
}

function orderedRange(low, central, high) {
  const values = [finite(low), finite(central), finite(high)];
  if (values.some((value) => value === null || value <= 0)) return null;
  values.sort((left, right) => left - right);
  if (values[0] === values[2]) {
    values[0] *= 0.8;
    values[2] *= 1.2;
  }
  return {
    low: roundMoney(values[0]),
    central: roundMoney(values[1]),
    high: roundMoney(values[2]),
  };
}

function validAuroraRange(research) {
  const valuation = research?.aurora?.macroBridge?.status === "context_applied"
    ? research.aurora.macroBridge.contextual
    : research?.aurora?.valuation;
  if (valuation?.status !== "conditional_range") return null;
  const range = orderedRange(valuation?.range?.low, valuation?.range?.central, valuation?.range?.high);
  return range ? { valuation, range } : null;
}

function validCanonicalRange(research) {
  const valuation = research?.valuation;
  if (!valuation?.available || valuation?.status !== "decision_ready") return null;
  const range = orderedRange(valuation?.range?.low, valuation?.range?.central, valuation?.range?.high);
  return range ? { valuation, range } : null;
}

function companyInputs(research) {
  const profile = research?.company_profile || {};
  const ratios = research?.financials?.ratios || {};
  const annual = latestAnnual(research);
  const valuation = research?.valuation || {};
  const price = firstFinite(
    valuation.current_price,
    pointValue(research, [/current_price$/, /market_price$/, /price_per_share$/]),
  );
  const marketCap = firstFinite(
    profile.market_cap,
    profile.marketCap,
    pointValue(research, [/market_cap(italization)?$/]),
  );
  const observedShares = firstFinite(
    ratios.latest_diluted_shares,
    ratios.diluted_shares,
    annual.diluted_shares,
    annual.weighted_average_shares_diluted,
    pointValue(research, [/diluted_shares$/, /weighted_average.*diluted/]),
  );
  const shares = observedShares !== null && observedShares > 0
    ? observedShares
    : marketCap !== null && marketCap > 0 && price !== null && price > 0
      ? marketCap / price
      : null;
  return {
    profile,
    price,
    marketCap,
    shares,
    revenue: firstFinite(ratios.latest_revenue, annual.revenue, annual.total_revenue, pointValue(research, [/latest_revenue$/, /total_revenue$/, /revenue$/])),
    freeCashFlow: firstFinite(ratios.latest_fcf, annual.free_cash_flow, pointValue(research, [/latest_(free_)?cash_flow$/, /free_cash_flow$/])),
    netIncome: firstFinite(ratios.latest_net_income, annual.net_income, pointValue(research, [/latest_net_income$/, /net_income$/])),
    equity: firstFinite(ratios.latest_total_equity, ratios.book_value, annual.total_equity, annual.stockholders_equity, pointValue(research, [/total_(stockholders_)?equity$/, /book_value$/])),
    cash: firstFinite(ratios.latest_cash, annual.cash, annual.cash_and_equivalents, pointValue(research, [/(^|\.)cash(_and_equivalents)?$/, /cash_and_short_term/])) || 0,
    debt: firstFinite(ratios.latest_debt, annual.total_debt, pointValue(research, [/total_debt$/, /(^|\.)debt$/])) || 0,
    currency: text(valuation.currency || profile.currency).toUpperCase() || "USD",
    marketDate: text(valuation.market_data_as_of) || null,
    priceSource: text(valuation?.price_validation?.source) || "Cotización de mercado",
  };
}

function isBank(profile) {
  return /bank|financial services|credit services|insurance/i.test(`${text(profile?.sector)} ${text(profile?.industry)}`);
}

function isPreRevenue(profile, revenue, research, marketCap) {
  const biotech = /biotech|biotechnology|clinical stage/i.test(`${text(profile?.sector)} ${text(profile?.industry)}`);
  if (!biotech) return false;
  if (research?.aurora?.fingerprint?.stage === "pre_revenue") return true;
  if (revenue === null || revenue <= 0) return true;
  return marketCap !== null && marketCap > 0 && revenue / marketCap <= 0.03;
}

function sectorKey(profile) {
  const value = `${text(profile?.sector)} ${text(profile?.industry)}`.toLowerCase();
  if (/technology|software|semiconductor/.test(value)) return "technology";
  if (/health|biotech|pharma/.test(value)) return "healthcare";
  if (/industrial|machinery|aerospace/.test(value)) return "industrials";
  if (/energy|oil|gas/.test(value)) return "energy";
  if (/consumer|retail|restaurant|auto/.test(value)) return "consumer";
  return "default";
}

function average(values) {
  const usable = values.map(finite).filter((value) => value !== null && value > 0);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function scenarioRows(range, method, basis) {
  return [
    { key: "low", label: "Adverso", value: range.low, explanation: `Menor crecimiento, menor normalización y mayor exigencia de retorno bajo ${method}.` },
    { key: "central", label: "Base", value: range.central, explanation: `Supuestos centrales y referencias normales para ${basis}.` },
    { key: "high", label: "Favorable", value: range.high, explanation: `Mejor ejecución y persistencia económica sin eliminar el riesgo del negocio.` },
  ];
}

function result({ basis, confidence, currency, drivers, marketDate, method, price, priceSource, range, reason }) {
  return {
    version: "aurora_indicative_valuation_v1",
    status: "indicative_range",
    kind: "approximate",
    basis,
    range,
    method,
    currency,
    currentPrice: price,
    marketDataAsOf: marketDate,
    priceSource,
    priceIsContextual: true,
    confidence,
    drivers,
    scenarios: scenarioRows(range, method, basis),
    reason,
    limitations: confidence.label === "Baja"
      ? ["El intervalo es deliberadamente amplio y debe leerse como punto de partida, no como precio objetivo."]
      : ["El rango sigue siendo aproximado hasta completar la conciliación institucional."],
  };
}

export function buildIndicativeValuation(research) {
  const inputs = companyInputs(research);
  const canonical = validCanonicalRange(research);
  if (canonical) {
    const driverRows = [
      ...list(canonical.valuation?.driver_summary?.requirements),
      ...list(canonical.valuation?.driver_summary?.holds),
    ];
    return result({
      basis: "institutional_model",
      confidence: {
        label: "Alta",
        score: finite(canonical.valuation?.reliability?.score) ?? 0.8,
        reason: text(canonical.valuation?.reliability?.reasons?.[0]) || "Rango institucional con controles de publicabilidad superados.",
      },
      currency: canonical.valuation.currency || inputs.currency,
      drivers: driverRows.slice(0, 5).map((item, index) => ({
        key: text(item?.key) || `institutional_driver_${index + 1}`,
        label: text(item?.label || item?.title) || (typeof item === "string" ? item : `Impulsor ${index + 1}`),
        value: finite(item?.value),
        provenance: text(item?.provenance) || "institutional_model",
        why: text(item?.detail || item?.explanation) || "Forma parte del rango institucional conciliado.",
      })),
      marketDate: inputs.marketDate,
      method: text(canonical.valuation.primary_method) || "Modelo institucional",
      price: inputs.price,
      priceSource: inputs.priceSource,
      range: canonical.range,
      reason: text(canonical.valuation.summary) || "Rango institucional calculado con supuestos y fuentes conciliadas.",
    });
  }
  const aurora = validAuroraRange(research);
  if (aurora) {
    const assumptions = list(aurora.valuation.assumptions);
    return result({
      basis: "conditional_financial_model",
      confidence: { label: "Media", score: 0.58, reason: "Datos financieros observados con supuestos inferidos visibles." },
      currency: aurora.valuation.currency || inputs.currency,
      drivers: assumptions.map((item) => ({
        key: text(item?.key) || "assumption",
        label: text(item?.label) || "Supuesto del modelo",
        value: finite(item?.value),
        provenance: text(item?.provenance) || "inferred",
        why: text(item?.detail) || "Mueve el flujo, el descuento o el puente al accionista.",
      })),
      marketDate: inputs.marketDate,
      method: text(aurora.valuation.method) || "Modelo financiero condicional",
      price: inputs.price,
      priceSource: inputs.priceSource,
      range: aurora.range,
      reason: text(aurora.valuation.summary) || "Rango aproximado calculado con supuestos financieros visibles.",
    });
  }

  const { cash, debt, equity, freeCashFlow, marketCap, netIncome, price, profile, revenue, shares } = inputs;
  const netCash = cash - debt;
  if (isBank(profile) && shares && shares > 0 && (equity > 0 || netIncome > 0)) {
    const bookPerShare = equity > 0 ? equity / shares : null;
    const earningsPerShare = netIncome > 0 ? netIncome / shares : null;
    const range = orderedRange(
      average([bookPerShare && bookPerShare * 0.75, earningsPerShare && earningsPerShare * 8]),
      average([bookPerShare && bookPerShare * 1.1, earningsPerShare && earningsPerShare * 12]),
      average([bookPerShare && bookPerShare * 1.6, earningsPerShare && earningsPerShare * 16]),
    );
    if (range) return result({
      basis: "bank_book_earnings",
      confidence: { label: "Media", score: 0.6, reason: "Patrimonio y beneficios normalizados con referencias bancarias amplias." },
      currency: inputs.currency,
      drivers: [
        { key: "equity", label: "Patrimonio / valor contable", value: equity, provenance: "observed", why: "Es la base económica principal para una entidad financiera." },
        { key: "net_income", label: "Beneficio normalizado", value: netIncome, provenance: "observed", why: "Determina la rentabilidad sostenible sobre el patrimonio." },
        { key: "shares", label: "Acciones diluidas", value: shares, provenance: "calculated", why: "Convierte el valor del accionista en valor por acción." },
      ],
      marketDate: inputs.marketDate,
      method: "Valor contable e ingresos residuales",
      price,
      priceSource: inputs.priceSource,
      range,
      reason: "Rango aproximado basado en patrimonio, beneficios y referencias prudentes para entidades financieras.",
    });
  }

  if (shares && shares > 0 && freeCashFlow > 0) {
    const netCashPerShare = netCash / shares;
    const range = orderedRange(
      (freeCashFlow * 10) / shares + netCashPerShare,
      (freeCashFlow * 16) / shares + netCashPerShare,
      (freeCashFlow * 24) / shares + netCashPerShare,
    );
    if (range) return result({
      basis: "owner_earnings",
      confidence: { label: "Media", score: 0.62, reason: "Flujo observado con múltiplos de caja sometidos a estrés." },
      currency: inputs.currency,
      drivers: [
        { key: "free_cash_flow", label: "Flujo de caja libre", value: freeCashFlow, provenance: "observed", why: "Es la capacidad de caja que sostiene el valor para el accionista." },
        { key: "net_cash", label: "Caja neta", value: netCash, provenance: "calculated", why: "Ajusta el valor operativo por caja y deuda." },
        { key: "shares", label: "Acciones diluidas", value: shares, provenance: "calculated", why: "Distribuye el valor entre las acciones existentes." },
      ],
      marketDate: inputs.marketDate,
      method: "Capacidad normalizada de generar caja",
      price,
      priceSource: inputs.priceSource,
      range,
      reason: "Rango aproximado basado en flujo de caja libre, balance y una banda amplia de normalización.",
    });
  }

  const preRevenue = isPreRevenue(profile, revenue, research, marketCap);
  if (!preRevenue && shares && shares > 0 && revenue > 0) {
    const multiples = SECTOR_REVENUE_MULTIPLES[sectorKey(profile)];
    const range = orderedRange(...multiples.map((multiple) => ((revenue * multiple) + netCash) / shares));
    if (range) return result({
      basis: "revenue_sector_prior",
      confidence: { label: "Baja", score: 0.42, reason: "Ingresos observados, pero la economía de margen y reinversión todavía domina la incertidumbre." },
      currency: inputs.currency,
      drivers: [
        { key: "revenue", label: "Ingresos recientes", value: revenue, provenance: "observed", why: "Ancla el tamaño económico actual cuando el flujo aún no es positivo." },
        { key: "sector_multiple", label: "Banda sectorial de ventas", value: multiples[1], provenance: "prior", why: "Traduce escala en valor sin fingir un margen estabilizado." },
        { key: "net_cash", label: "Caja neta", value: netCash, provenance: "calculated", why: "Reconoce la capacidad o carga financiera del balance." },
      ],
      marketDate: inputs.marketDate,
      method: "Valor empresa sobre ingresos",
      price,
      priceSource: inputs.priceSource,
      range,
      reason: "Rango aproximado basado en ingresos, caja neta y una banda sectorial amplia de valor empresa sobre ventas.",
    });
  }

  if (price !== null && price > 0) {
    const factors = preRevenue ? [0.3, 1, 2.5] : [0.55, 1, 1.65];
    const range = orderedRange(...factors.map((factor) => price * factor));
    return result({
      basis: "market_sector_prior",
      confidence: { label: "Baja", score: 0.22, reason: "La cotización y el arquetipo sectorial son los anclajes principales." },
      currency: inputs.currency,
      drivers: [
        { key: "current_price", label: "Precio observado", value: price, provenance: "observed", why: "Fija la referencia de mercado que los escenarios deben desafiar." },
        { key: "sector_prior", label: "Dispersión sectorial", value: factors[2] - factors[0], provenance: "prior", why: "Amplía el rango cuando la empresa depende de hitos, financiación o economía aún no estabilizada." },
        ...(marketCap > 0 ? [{ key: "market_cap", label: "Capitalización observada", value: marketCap, provenance: "observed", why: "Dimensiona el valor que el mercado ya atribuye al negocio." }] : []),
      ],
      marketDate: inputs.marketDate,
      method: preRevenue ? "Escenarios de opción real y prior sectorial" : "Rango sectorial anclado al mercado",
      price,
      priceSource: inputs.priceSource,
      range,
      reason: "Rango exploratorio anclado al precio observado y a un prior sectorial amplio; la confianza es baja y el intervalo refleja esa incertidumbre.",
    });
  }

  return null;
}
