import { getWorkspaceDashboard } from "@/lib/server/dashboard-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const payload = await getWorkspaceDashboard(params.workspaceId);
  return Response.json(
    {
      workspace_summary: payload.workspace_summary,
      alerts: payload.alerts,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

