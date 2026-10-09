import { getWorkspaceDashboard } from "@/lib/server/dashboard-service";
import { requireApiAuthSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiAuthSession(request);
  if (auth instanceof Response) return auth;
  // The legacy endpoint must use the account overlay, never the shared backend
  // portfolio. Its workspace is taken exclusively from the authenticated session.
  const snapshot = await getWorkspaceDashboard(auth.workspace.id);
  return Response.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
}
