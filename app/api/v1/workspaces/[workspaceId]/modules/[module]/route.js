import { getWorkspaceModule } from "@/lib/server/dashboard-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const payload = await getWorkspaceModule(params.workspaceId, params.module);
  if (!payload.module) {
    return Response.json({ error: "Module not found" }, { status: 404 });
  }
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}

