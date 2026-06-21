import { fetchBackendSnapshot } from "@/lib/server/backend";
import { buildUnavailableSnapshot } from "@/lib/server/backend-snapshot";
import { requireApiAuthSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiAuthSession(request);
  if (auth instanceof Response) return auth;
  let snapshot;
  try {
    snapshot = await fetchBackendSnapshot();
  } catch (error) {
    snapshot = buildUnavailableSnapshot(error);
  }
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
