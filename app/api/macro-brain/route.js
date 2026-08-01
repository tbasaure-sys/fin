import { requireApiAuthSession } from "@/lib/server/auth/session";
import { loadMacroBrainSnapshot } from "@/lib/server/macro-brain";
import { sanitizePublicSnapshotPayload } from "@/lib/server/public-snapshot-sanitizer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function createMacroBrainGetHandler({
  requireAuth = requireApiAuthSession,
  loadSnapshot = loadMacroBrainSnapshot,
} = {}) {
  return async function GET(request) {
    const auth = await requireAuth(request);
    if (auth instanceof Response) return auth;

    const snapshot = await loadSnapshot();
    return Response.json(sanitizePublicSnapshotPayload(snapshot), {
      headers: { "Cache-Control": "no-store" },
    });
  };
}

export const GET = createMacroBrainGetHandler();
