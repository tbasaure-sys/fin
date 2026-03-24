import { getWorkspaceMandate, updateWorkspaceMandate } from "@/lib/server/dashboard-service";
import { requireApiWorkspaceSession } from "@/lib/server/auth/session";
import { errorResponse, parseMandatePatchPayload } from "@/lib/server/workspace-action-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  const payload = await getWorkspaceMandate(params.workspaceId);
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const input = parseMandatePatchPayload(body);
    const payload = await updateWorkspaceMandate(params.workspaceId, input);
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
