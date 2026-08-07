import { getSignalIntelligenceOverview } from "../../../../../../lib/server/signal-intelligence.js";
import { requireApiWorkspaceSession } from "../../../../../../lib/server/auth/session.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function createSignalIntelligenceOverviewHandler({
  requireSession = requireApiWorkspaceSession,
  service = getSignalIntelligenceOverview,
} = {}) {
  return async function GET(request, { params }) {
    const auth = await requireSession(request, params.workspaceId);
    if (auth instanceof Response) return auth;
    try {
      const payload = await service(params.workspaceId);
      return Response.json(payload, { headers: { "Cache-Control": "private, no-store" } });
    } catch {
      return Response.json(
        { enabled: true, status: "blocked", reason: "signal_intelligence_unavailable" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  };
}

export const GET = createSignalIntelligenceOverviewHandler();
