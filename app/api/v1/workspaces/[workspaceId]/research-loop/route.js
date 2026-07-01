import { requireApiWorkspaceSession } from "@/lib/server/auth/session";
import { getWorkspaceDashboard } from "@/lib/server/dashboard-service";
import { buildResearchLoopIteration } from "@/lib/server/research-loop";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  const dashboard = await getWorkspaceDashboard(params.workspaceId);
  const payload = buildResearchLoopIteration(dashboard);
  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
