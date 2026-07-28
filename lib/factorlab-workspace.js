export const FACTORLAB_DEMO_AS_OF = "2026-06-24";

export const FACTORLAB_DEFAULT_FILTERS = Object.freeze({
  asof: FACTORLAB_DEMO_AS_OF,
  universe: "tradable",
  topK: 6,
  minAdvUsd: 250_000,
  maxMarketCapUsd: 2_000_000_000,
  maxResidualVol: 0.7,
  includeDiagnostics: false,
});

const UNIVERSES = new Set(["tradable", "us", "micro", "inflection", "diagnostics"]);

function boundedNumber(value, fallback, low, high, { integer = false } = {}) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const bounded = Math.min(high, Math.max(low, parsed));
  return integer ? Math.round(bounded) : bounded;
}

function cleanDate(value) {
  const candidate = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : FACTORLAB_DEFAULT_FILTERS.asof;
}

function enabled(value) {
  return value === true || value === "1" || String(value || "").toLowerCase() === "true";
}

export function parseFactorLabFilters(input = {}) {
  const universe = String(input.universe || "");
  return {
    asof: cleanDate(input.asof),
    universe: UNIVERSES.has(universe) ? universe : FACTORLAB_DEFAULT_FILTERS.universe,
    topK: boundedNumber(input.topK, FACTORLAB_DEFAULT_FILTERS.topK, 1, 12, { integer: true }),
    minAdvUsd: boundedNumber(input.minAdvUsd, FACTORLAB_DEFAULT_FILTERS.minAdvUsd, 50_000, 10_000_000, { integer: true }),
    maxMarketCapUsd: boundedNumber(input.maxMarketCapUsd, FACTORLAB_DEFAULT_FILTERS.maxMarketCapUsd, 50_000_000, 5_000_000_000, { integer: true }),
    maxResidualVol: boundedNumber(input.maxResidualVol, FACTORLAB_DEFAULT_FILTERS.maxResidualVol, 0.1, 1),
    includeDiagnostics: enabled(input.diagnostics ?? input.includeDiagnostics),
  };
}

function decimal(value) {
  return String(Number(Number(value).toFixed(4)));
}

export function buildFactorLabSharePath(filters, language = "es", basePath = "/factorlab") {
  const values = parseFactorLabFilters(filters);
  const query = new URLSearchParams({
    lang: language === "en" ? "en" : "es",
    universe: values.universe,
    topK: String(values.topK),
    minAdvUsd: String(values.minAdvUsd),
    maxMarketCapUsd: String(values.maxMarketCapUsd),
    maxResidualVol: decimal(values.maxResidualVol),
    diagnostics: values.includeDiagnostics ? "1" : "0",
  });
  return `${basePath}?${query.toString()}`;
}

export function factorLabScoreReading(score, language = "es") {
  const value = Number(score);
  const key = Number.isFinite(value) && value >= 70 ? "high" : Number.isFinite(value) && value >= 58 ? "medium" : "low";
  const copy = {
    es: {
      high: {
        label: "Prioridad de revisión alta",
        explanation: "La señal merece revisión temprana, pero todavía necesita tesis, valoración y evidencia primaria.",
      },
      medium: {
        label: "Prioridad de revisión media",
        explanation: "La señal merece una revisión acotada antes de asignarle más tiempo.",
      },
      low: {
        label: "Prioridad de revisión baja",
        explanation: "La señal no justifica desplazar trabajo mejor respaldado.",
      },
    },
    en: {
      high: {
        label: "High review priority",
        explanation: "The signal deserves an early review, but it still needs a thesis, valuation, and primary evidence.",
      },
      medium: {
        label: "Medium review priority",
        explanation: "The signal warrants a bounded review before more time is committed.",
      },
      low: {
        label: "Low review priority",
        explanation: "The signal does not justify displacing better-supported work.",
      },
    },
  };
  return { key, ...(copy[language === "en" ? "en" : "es"][key]) };
}

export function buildFactorLabQueueItem(candidate = {}) {
  const ticker = String(candidate.ticker || "").trim().toUpperCase();
  const name = String(candidate.name || ticker || "Empresa sin identificar").trim();
  const score = Number.isFinite(Number(candidate.opportunityScore)) ? Math.round(Number(candidate.opportunityScore)) : null;
  const whyNow = String(candidate.whyNow || "Señal pendiente de revisión.").trim();
  const killCriteria = String(candidate.killCriteria || "Falsificador pendiente de definir.").trim();
  return {
    symbol: ticker,
    name,
    conviction: `FactorLab${score === null ? "" : ` ${score}`} · investigación pendiente`,
    lastSignal: `${whyNow} Falsificador: ${killCriteria}`,
  };
}
