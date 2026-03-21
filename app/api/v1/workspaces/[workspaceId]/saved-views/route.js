import { requireApiWorkspaceSession } from "@/lib/server/auth/session";
import { getWorkspaceDashboard, upsertWorkspaceSavedView } from "@/lib/server/dashboard-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;
  const payload = await getWorkspaceDashboard(params.workspaceId);
  return Response.json(
    {
      workspace_summary: payload.workspace_summary,
      saved_views: payload.saved_views || [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;
  const body = await request.json().catch(() => ({}));
  const payload = await upsertWorkspaceSavedView(params.workspaceId, body || {});
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
