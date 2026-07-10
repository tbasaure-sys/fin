function percent(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "—";
}

const DRIVER_ES = { margin: "margen EBIT", growth: "CAGR de ingresos", roic: "ROIC", wacc: "WACC", reinvestment: "tasa de reinversión", terminalGrowth: "crecimiento terminal" };

export function normalizeBreakpointLocale(value) {
  return value === "en" ? "en" : "es";
}

export function localizeBreakpointDriver(driver, locale) {
  if (normalizeBreakpointLocale(locale) === "en") {
    return { margin: "EBIT margin", growth: "revenue CAGR", roic: "ROIC", wacc: "WACC", reinvestment: "reinvestment rate", terminalGrowth: "terminal growth" }[driver] || driver || "—";
  }
  return DRIVER_ES[driver] || driver || "—";
}

export function localizeBreakpointStatus(status, locale) {
  if (normalizeBreakpointLocale(locale) === "en") return status || "—";
  return { plausible: "plausible", stretched: "exigente", implausible: "poco plausible", impossible: "inviable", unclassified: "sin clasificar" }[status] || status || "—";
}

export function localizeBreakpointSourceCategory(category, locale) {
  if (normalizeBreakpointLocale(locale) === "en") return category || "source";
  return { reported: "reportado", market: "mercado", assumption: "supuesto" }[category] || "fuente";
}

export function localizeMarketFamily({ family, primaryDriver, locale }) {
  if (normalizeBreakpointLocale(locale) === "en") return family;
  const label = String(family?.family || "");
  const narrative = label === "heroic_compounder"
    ? "El mercado está descontando una trayectoria excepcional: crecimiento alto y márgenes elevados a la vez."
    : label === "durable_compounder"
      ? "El mercado está descontando una capacidad de generar beneficios que se sostiene en el tiempo."
      : "El mercado está descontando una trayectoria operativa específica para sostener el precio actual.";
  const driver = localizeBreakpointDriver(primaryDriver, locale) || "la ejecución operativa";
  return { ...family, narrative, fragility: `La tesis depende principalmente de ${driver}.`, tension: family?.tension || null };
}

export function localizeDecisionStatement(flip, kind, locale) {
  if (normalizeBreakpointLocale(locale) === "en") return flip?.oneLine || "No minimum decision flip is available.";
  const growth = percent(flip?.target?.growth);
  const margin = percent(flip?.target?.margin);
  return kind === "bull"
    ? `El margen EBIT se sostiene cerca de ${margin} y el CAGR de ingresos alcanza ${growth}.`
    : `El margen EBIT cae hacia ${margin} y el CAGR de ingresos baja a ${growth}.`;
}

export function localizeLimitations(locale) {
  if (normalizeBreakpointLocale(locale) === "en") {
    return [
      "The market path is an inferred valuation surface, not a forecast or a statement of investor intent.",
      "Feasibility is a deterministic business-physics screen and does not prove an outcome.",
      "This output is research software, not investment advice.",
    ];
  }
  return [
    "La trayectoria de mercado es una superficie de valoración inferida, no un pronóstico ni una declaración de intención de los inversores.",
    "La factibilidad es una prueba determinista de economía del negocio; no prueba un resultado.",
    "Este resultado es software de research, no asesoría financiera.",
  ];
}

export function localizeFalsifier({ driver, fallback, locale }) {
  if (normalizeBreakpointLocale(locale) === "en") return fallback || null;
  const label = localizeBreakpointDriver(driver, locale) || "el driver principal";
  return `La próxima revisión debe contrastar ${label} con la trayectoria implícita en el precio.`;
}
