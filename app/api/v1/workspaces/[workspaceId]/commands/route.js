import { getWorkspaceSavedState, recordCommand } from "@/lib/server/dashboard-service";
import { requireApiWorkspaceSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;
  const payload = await getWorkspaceSavedState(params.workspaceId);
  return Response.json(
    { commandHistory: payload.commandHistory || [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;
  const body = await request.json();
  const history = await recordCommand(params.workspaceId, body.command || "");
  return Response.json({ history }, { headers: { "Cache-Control": "no-store" } });
}
