import { requireApiWorkspaceSession } from "@/lib/server/auth/session";
import { getWorkspaceDashboard } from "@/lib/server/dashboard-service";
import { buildDiffusionMarketSimulation } from "@/lib/server/diffusion-market-simulator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const dashboard = await getWorkspaceDashboard(params.workspaceId);
  const payload = buildDiffusionMarketSimulation(dashboard, {
    regime: url.searchParams.get("regime") || "crisis",
    nScenarios: Number(url.searchParams.get("nScenarios") || 5000),
    horizonDays: Number(url.searchParams.get("horizonDays") || 20),
    guidanceScale: Number(url.searchParams.get("guidanceScale") || 1.0),
    stratifiedStress: url.searchParams.get("stratifiedStress") !== "false",
  });

  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
