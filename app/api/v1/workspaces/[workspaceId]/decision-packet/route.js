import { requireApiWorkspaceSession } from "@/lib/server/auth/session";
import { getWorkspaceDashboard } from "@/lib/server/dashboard-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  const dashboard = await getWorkspaceDashboard(params.workspaceId);
  return Response.json(
    {
      workspace_summary: dashboard.workspace_summary,
      decision_packet: dashboard.decision_packet,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
