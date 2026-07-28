import {
  PublicStressInputError,
  applyPublicStressCandidate,
  buildPublicStressDashboard,
  parsePublicStressRequest,
  summarizePublicStressSimulation,
} from "../../../../lib/public-stress-demo.js";
import { buildDiffusionMarketSimulation } from "../../../../lib/server/diffusion-market-simulator.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLIC_SIMULATION_OPTIONS = Object.freeze({
  regime: "crisis",
  nScenarios: 5000,
  horizonDays: 30,
  tailIntensity: 1,
  stratifiedStress: true,
  useRealReturnData: false,
});

function rounded(value, digits = 6) {
  return Number(Number(value || 0).toFixed(digits));
}

function publicPortfolio(holdings) {
  return holdings.map((row) => ({
    ticker: row.ticker,
    weight: row.weight,
    weightPct: rounded(row.weight * 100, 2),
  }));
}

function simulationSeed(label, holdings) {
  return `public-stress:${label}:${holdings.map((row) => `${row.ticker}-${row.weight}`).join(":")}`;
}

function runPublicSimulation(label, holdings) {
  const dashboard = buildPublicStressDashboard(holdings, `public-stress-${label}`);
  const simulation = buildDiffusionMarketSimulation(dashboard, {
    ...PUBLIC_SIMULATION_OPTIONS,
    seed: simulationSeed(label, holdings),
  });
  return summarizePublicStressSimulation(simulation, holdings);
}

function comparisonFor(current, proposed) {
  return {
    cvar5Delta: rounded((proposed.risk.cvar5 ?? 0) - (current.risk.cvar5 ?? 0), 4),
    var5Delta: rounded((proposed.risk.var5 ?? 0) - (current.risk.var5 ?? 0), 4),
    probabilityLossDelta: rounded((proposed.risk.probabilityLoss ?? 0) - (current.risk.probabilityLoss ?? 0), 4),
    topTwoWeightDelta: rounded(proposed.concentration.topTwoWeight - current.concentration.topTwoWeight, 4),
    effectivePositionsDelta: rounded(proposed.concentration.effectivePositions - current.concentration.effectivePositions, 2),
  };
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const parsed = parsePublicStressRequest(body);
    const proposedHoldings = applyPublicStressCandidate(parsed.holdings, parsed.candidate);
    const current = runPublicSimulation("current", parsed.holdings);
    const proposed = runPublicSimulation("proposed", proposedHoldings);

    return json({
      ok: true,
      mode: "interactive_example",
      generatedAt: new Date().toISOString(),
      portfolio: {
        current: publicPortfolio(parsed.holdings),
        proposed: publicPortfolio(proposedHoldings),
      },
      candidate: {
        ticker: parsed.candidate.ticker,
        weight: parsed.candidate.weight,
        weightPct: rounded(parsed.candidate.weight * 100, 2),
      },
      current,
      proposed,
      comparison: comparisonFor(current, proposed),
      provenance: {
        portfolioKind: "editable_example",
        marketDataLive: false,
        modelArtifact: "PIT FHS factor scenario bank",
        modelAsOf: proposed.modelAsOf || current.modelAsOf,
        sourceRunId: proposed.model.sourceRunId || current.model.sourceRunId,
        scenarioCount: proposed.model.scenarioCount,
        horizonDays: proposed.model.horizonDays,
        note: "Escenarios reproducibles sobre una cartera de ejemplo; no son precios de mercado en tiempo real ni un pronóstico.",
      },
    });
  } catch (error) {
    if (error instanceof PublicStressInputError) {
      return json({ ok: false, error: { code: error.code, message: error.message } }, 400);
    }
    if (error instanceof SyntaxError) {
      return json({ ok: false, error: { code: "INVALID_JSON", message: "El cuerpo de la solicitud no contiene JSON válido." } }, 400);
    }
    console.error("[public-stress] simulation failed", error instanceof Error ? error.message : "unknown error");
    return json({
      ok: false,
      error: {
        code: "SIMULATION_UNAVAILABLE",
        message: "La simulación no está disponible en este momento. Inténtalo nuevamente.",
      },
    }, 503);
  }
}
