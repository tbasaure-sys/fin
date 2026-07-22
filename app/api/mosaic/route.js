import { requireApiAuthSession } from "@/lib/server/auth/session";
import { loadMacroBrainSnapshot } from "@/lib/server/macro-brain";
import { contextualizeMosaicSnapshot, loadMosaicSnapshot } from "@/lib/server/mosaic-observatory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiAuthSession(request);
  if (auth instanceof Response) return auth;

  const [baseSnapshot, macro] = await Promise.all([
    loadMosaicSnapshot(),
    loadMacroBrainSnapshot(),
  ]);
  const snapshot = contextualizeMosaicSnapshot(baseSnapshot, macro);
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
