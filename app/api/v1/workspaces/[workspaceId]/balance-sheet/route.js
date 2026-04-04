import { getWorkspaceBalanceSheet } from "@/lib/server/dashboard-service";
import { requireApiWorkspaceSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  const payload = await getWorkspaceBalanceSheet(params.workspaceId);
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
