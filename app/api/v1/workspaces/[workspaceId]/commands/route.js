import { getWorkspaceSavedState, recordCommand } from "@/lib/server/dashboard-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const payload = getWorkspaceSavedState(params.workspaceId);
  return Response.json(
    { commandHistory: payload.commandHistory || [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request, { params }) {
  const body = await request.json();
  const history = recordCommand(params.workspaceId, body.command || "");
  return Response.json({ history }, { headers: { "Cache-Control": "no-store" } });
}
