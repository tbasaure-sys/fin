import { fetchBackendSnapshot } from "@/lib/server/backend";
import { requireApiAuthSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiAuthSession(request);
  if (auth instanceof Response) return auth;
  const snapshot = await fetchBackendSnapshot();
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
