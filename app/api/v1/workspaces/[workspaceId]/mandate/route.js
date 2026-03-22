import { getWorkspaceMandate, updateWorkspaceMandate } from "@/lib/server/dashboard-service";
import { requireApiWorkspaceSession } from "@/lib/server/auth/session";

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

  const body = await request.json();
  const payload = await updateWorkspaceMandate(params.workspaceId, body);
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
