import { getWorkspaceTransitions } from "@/lib/server/dashboard-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const payload = await getWorkspaceTransitions(params.workspaceId);
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
