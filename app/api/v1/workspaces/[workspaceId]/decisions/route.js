import { recordWorkspaceDecision } from "@/lib/server/dashboard-service";
import { requireApiWorkspaceSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const payload = await recordWorkspaceDecision(params.workspaceId, body);
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
