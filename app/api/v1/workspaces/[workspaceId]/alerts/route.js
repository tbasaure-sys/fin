import { getWorkspaceDashboard } from "@/lib/server/dashboard-service";
import { requireApiWorkspaceSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;
  const payload = await getWorkspaceDashboard(params.workspaceId);
  return Response.json(
    {
      workspace_summary: payload.workspace_summary,
      alerts: payload.alerts,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
