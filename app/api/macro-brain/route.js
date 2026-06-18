import { requireApiAuthSession } from "@/lib/server/auth/session";
import { loadMacroBrainSnapshot } from "@/lib/server/macro-brain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiAuthSession(request);
  if (auth instanceof Response) return auth;

  const snapshot = await loadMacroBrainSnapshot();
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
