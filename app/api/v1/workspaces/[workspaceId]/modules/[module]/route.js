import { getWorkspaceModule } from "@/lib/server/dashboard-service";
import { requireApiWorkspaceSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;
  const payload = await getWorkspaceModule(params.workspaceId, params.module);
  if (!payload.module) {
    return Response.json({ error: "Module not found" }, { status: 404 });
  }
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
