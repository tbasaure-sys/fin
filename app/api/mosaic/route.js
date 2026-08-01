import { requireApiAuthSession } from "@/lib/server/auth/session";
import { loadMacroBrainSnapshot } from "@/lib/server/macro-brain";
import { contextualizeMosaicSnapshot, loadMosaicSnapshot } from "@/lib/server/mosaic-observatory";
import { sanitizePublicSnapshotPayload } from "@/lib/server/public-snapshot-sanitizer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function createMosaicGetHandler({
  requireAuth = requireApiAuthSession,
  loadMacro = loadMacroBrainSnapshot,
  loadMosaic = loadMosaicSnapshot,
  contextualize = contextualizeMosaicSnapshot,
} = {}) {
  return async function GET(request) {
    const auth = await requireAuth(request);
    if (auth instanceof Response) return auth;

    const [baseSnapshot, macro] = await Promise.all([
      loadMosaic(),
      loadMacro(),
    ]);
    const snapshot = contextualize(baseSnapshot, macro);
    return Response.json(sanitizePublicSnapshotPayload(snapshot), {
      headers: { "Cache-Control": "no-store" },
    });
  };
}

export const GET = createMosaicGetHandler();
