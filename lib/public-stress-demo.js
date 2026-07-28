const PUBLIC_STRESS_UNIVERSE = Object.freeze({
  MSFT: { name: "Microsoft", sector: "Technology", assetType: "equity", riskScore: 3 },
  GOOGL: { name: "Alphabet", sector: "Communication Services", assetType: "equity", riskScore: 3 },
  JPM: { name: "JPMorgan Chase", sector: "Financials", assetType: "equity", riskScore: 3 },
  XOM: { name: "Exxon Mobil", sector: "Energy", assetType: "equity", riskScore: 4 },
  SGOV: { name: "iShares 0-3 Month Treasury Bond ETF", sector: "Cash & Treasuries", assetType: "fixed_income", riskScore: 1 },
  NVDA: { name: "NVIDIA", sector: "Technology", assetType: "equity", riskScore: 5 },
  AMD: { name: "Advanced Micro Devices", sector: "Technology", assetType: "equity", riskScore: 5 },
  LLY: { name: "Eli Lilly", sector: "Health Care", assetType: "equity", riskScore: 4 },
});

export const PUBLIC_STRESS_DEFAULT_HOLDINGS = Object.freeze([
  { ticker: "MSFT", weightPct: 28 },
  { ticker: "GOOGL", weightPct: 22 },
  { ticker: "JPM", weightPct: 20 },
  { ticker: "XOM", weightPct: 18 },
  { ticker: "SGOV", weightPct: 12 },
]);

export const PUBLIC_STRESS_CANDIDATES = Object.freeze(["NVDA", "AMD", "LLY"]);

export class PublicStressInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PublicStressInputError";
    this.code = code;
  }
}

function rounded(value, digits = 6) {
  return Number(Number(value).toFixed(digits));
}

function normalizedTicker(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeHoldings(rawHoldings) {
  const holdings = Array.isArray(rawHoldings) && rawHoldings.length
    ? rawHoldings
    : PUBLIC_STRESS_DEFAULT_HOLDINGS;

  if (holdings.length < 4 || holdings.length > 5) {
    throw new PublicStressInputError("INVALID_HOLDING_COUNT", "La cartera de ejemplo debe tener entre 4 y 5 posiciones.");
  }

  const seen = new Set();
  const parsed = holdings.map((row) => {
    const ticker = normalizedTicker(row?.ticker);
    if (!PUBLIC_STRESS_UNIVERSE[ticker]) {
      throw new PublicStressInputError("UNSUPPORTED_TICKER", `El activo ${ticker || "desconocido"} no pertenece al universo público.`);
    }
    if (PUBLIC_STRESS_CANDIDATES.includes(ticker)) {
      throw new PublicStressInputError("UNSUPPORTED_BASE_TICKER", `${ticker} solo puede agregarse como candidato.`);
    }
    if (seen.has(ticker)) {
      throw new PublicStressInputError("DUPLICATE_TICKER", `La posición ${ticker} está repetida.`);
    }
    seen.add(ticker);
    const weightPct = Number(row?.weightPct);
    if (!Number.isFinite(weightPct) || weightPct <= 0 || weightPct > 100) {
      throw new PublicStressInputError("INVALID_WEIGHT", `El peso de ${ticker} debe ser mayor que 0 y menor o igual a 100.`);
    }
    return { ticker, rawWeight: weightPct };
  });

  const total = parsed.reduce((sum, row) => sum + row.rawWeight, 0);
  if (!Number.isFinite(total) || total <= 0) {
    throw new PublicStressInputError("INVALID_TOTAL_WEIGHT", "La suma de pesos debe ser mayor que cero.");
  }

  return parsed.map((row) => ({
    ticker: row.ticker,
    weight: rounded(row.rawWeight / total),
  }));
}

function normalizeCandidate(rawCandidate) {
  const source = rawCandidate && typeof rawCandidate === "object"
    ? rawCandidate
    : { ticker: "NVDA", weightPct: 10 };
  const ticker = normalizedTicker(source.ticker);
  if (!PUBLIC_STRESS_CANDIDATES.includes(ticker)) {
    throw new PublicStressInputError("UNSUPPORTED_CANDIDATE", "El candidato debe ser NVDA, AMD o LLY.");
  }
  const weightPct = Number(source.weightPct);
  if (!Number.isFinite(weightPct) || weightPct < 5 || weightPct > 20) {
    throw new PublicStressInputError("INVALID_CANDIDATE_WEIGHT", "El candidato debe representar entre 5% y 20% de la cartera propuesta.");
  }
  return { ticker, weight: rounded(weightPct / 100) };
}

export function parsePublicStressRequest(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PublicStressInputError("INVALID_BODY", "La solicitud debe ser un objeto JSON.");
  }
  return {
    holdings: normalizeHoldings(body.holdings),
    candidate: normalizeCandidate(body.candidate),
  };
}

export function applyPublicStressCandidate(holdings, candidate) {
  const scale = 1 - candidate.weight;
  return [
    ...holdings.map((row) => ({ ...row, weight: rounded(row.weight * scale) })),
    { ticker: candidate.ticker, weight: candidate.weight },
  ];
}

export function buildPublicStressDashboard(holdings, workspaceId = "public-stress-demo") {
  return {
    workspace_summary: { id: workspaceId },
    modules: {
      portfolio: {
        holdings: holdings.map((row) => {
          const metadata = PUBLIC_STRESS_UNIVERSE[row.ticker];
          return {
            ticker: row.ticker,
            name: metadata.name,
            sector: metadata.sector,
            assetType: metadata.assetType,
            riskScore: metadata.riskScore,
            weightValue: row.weight,
          };
        }),
      },
    },
  };
}

function scenarioBankFrom(simulation) {
  return simulation?.scenarioBankOverlay || simulation?.inputSources?.scenarioBankOverlay || {};
}

function modelDateFromRunId(runId) {
  const match = String(runId || "").match(/(?:^|_)(20\d{2})(\d{2})(\d{2})(?:_|$)/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function concentrationFor(holdings) {
  const weights = holdings.map((row) => row.weight).sort((left, right) => right - left);
  const hhi = weights.reduce((sum, weight) => sum + weight ** 2, 0);
  return {
    topPositionWeight: rounded(weights[0] || 0),
    topTwoWeight: rounded((weights[0] || 0) + (weights[1] || 0)),
    hhi: rounded(hhi, 4),
    effectivePositions: hhi > 0 ? rounded(1 / hhi, 2) : 0,
  };
}

function exposuresFor(holdings) {
  const exposureMap = new Map();
  for (const holding of holdings) {
    const sector = PUBLIC_STRESS_UNIVERSE[holding.ticker]?.sector || "Other";
    exposureMap.set(sector, (exposureMap.get(sector) || 0) + holding.weight);
  }
  return Array.from(exposureMap, ([sector, weight]) => ({ sector, weight: rounded(weight) }))
    .sort((left, right) => right.weight - left.weight);
}

export function summarizePublicStressSimulation(simulation, holdings) {
  const bank = scenarioBankFrom(simulation);
  const risk = simulation?.risk || {};
  return {
    generatedAt: simulation?.generatedAt || null,
    modelAsOf: modelDateFromRunId(bank.sourceRunId),
    model: {
      family: simulation?.model?.family || "PIT FHS Factor Stress Engine",
      horizonDays: Number(simulation?.model?.horizonDays || 30),
      scenarioCount: Number(bank.scenarioCount || simulation?.model?.nScenarios || 0),
      sourceRunId: bank.sourceRunId || null,
      servedFromScenarioBank: Boolean(bank.servedAsPrimary),
      matchedWeightCoverage: bank.matchedWeightCoverage ?? null,
      matchedWeightCoverageLabel: bank.matchedWeightCoverageLabel || null,
    },
    risk: {
      cvar5: risk.cvar5 ?? null,
      cvar5Label: risk.cvar5Label || null,
      var5: risk.var5 ?? null,
      var5Label: risk.var5Label || null,
      probabilityLoss: risk.probabilityLoss ?? null,
      probabilityLossLabel: risk.probabilityLossLabel || null,
      worstReturn: risk.worstReturn ?? null,
      worstReturnLabel: risk.worstReturnLabel || null,
    },
    concentration: concentrationFor(holdings),
    exposures: exposuresFor(holdings),
    tailContributors: Array.isArray(simulation?.tailContributors)
      ? simulation.tailContributors.slice(0, 5).map((row) => ({
        ticker: row.ticker,
        contribution: row.contribution,
        contributionLabel: row.contributionLabel,
        weight: row.weight,
      }))
      : [],
  };
}

export function publicStressMetadata(ticker) {
  return PUBLIC_STRESS_UNIVERSE[normalizedTicker(ticker)] || null;
}
