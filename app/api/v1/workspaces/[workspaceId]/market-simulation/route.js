import { requireApiWorkspaceSession } from "@/lib/server/auth/session";
import { getWorkspaceDashboard } from "@/lib/server/dashboard-service";
import { buildDiffusionMarketSimulationAsync } from "@/lib/server/diffusion-market-simulator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SIMULATION_CACHE = new Map();
const MAX_CACHE_ENTRIES = 40;

async function digestText(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 18);
}

function trimCache() {
  while (SIMULATION_CACHE.size > MAX_CACHE_ENTRIES) {
    const firstKey = SIMULATION_CACHE.keys().next().value;
    if (!firstKey) return;
    SIMULATION_CACHE.delete(firstKey);
  }
}

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const dashboard = await getWorkspaceDashboard(params.workspaceId);
  const simulationOptions = {
    regime: url.searchParams.get("regime") || "crisis",
    nScenarios: Number(url.searchParams.get("nScenarios") || 5000),
    horizonDays: Number(url.searchParams.get("horizonDays") || 20),
    tailIntensity: Number(url.searchParams.get("tailIntensity") || url.searchParams.get("guidanceScale") || 1.0),
    stratifiedStress: url.searchParams.get("stratifiedStress") !== "false",
  };
  const portfolioHash = await digestText(JSON.stringify(dashboard?.modules?.portfolio || {}));
  const fmpConfigured = Boolean(process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY);
  const dailyHistoryCacheBucket = new Date().toISOString().slice(0, 10);
  const cacheKey = `${params.workspaceId}:${portfolioHash}:${JSON.stringify(simulationOptions)}:${fmpConfigured}:${dailyHistoryCacheBucket}`;
  let payload = SIMULATION_CACHE.get(cacheKey);
  let cacheStatus = "hit";
  if (!payload) {
    payload = await buildDiffusionMarketSimulationAsync(dashboard, simulationOptions);
    SIMULATION_CACHE.set(cacheKey, payload);
    cacheStatus = "miss";
    trimCache();
  }

  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
      "X-BLS-Simulation-Cache": cacheStatus,
    },
  });
}
