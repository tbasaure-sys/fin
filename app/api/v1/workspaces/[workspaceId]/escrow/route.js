import { getWorkspaceDashboard, stageWorkspaceEscrowDecision } from "@/lib/server/dashboard-service";
import { requireApiWorkspaceSession } from "@/lib/server/auth/session";
import { errorResponse, parseEscrowStagePayload } from "@/lib/server/workspace-action-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  const payload = await getWorkspaceDashboard(params.workspaceId);
  return Response.json(
    {
      workspace_summary: payload.workspace_summary,
      escrow: payload.escrow,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const input = parseEscrowStagePayload(body);
    const payload = await stageWorkspaceEscrowDecision(params.workspaceId, input);
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
