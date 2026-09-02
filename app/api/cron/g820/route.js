import { requireInternalRefreshAccess } from "@/lib/server/internal-refresh-auth";
import { refreshG820DailyPriceOverlay } from "@/lib/server/g820-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request) {
  const unauthorized = requireInternalRefreshAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const overlay = await refreshG820DailyPriceOverlay();
    return Response.json({
      ok: true,
      baseSnapshotId: overlay.baseSnapshotId,
      marketAsOf: overlay.marketAsOf,
      generatedAt: overlay.generatedAt,
      coverage: overlay.coverage,
      scope: overlay.semantics.scope,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      ok: false,
      code: "G820_REFRESH_FAILED",
      message: error instanceof Error ? error.message : "G820 refresh failed.",
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
