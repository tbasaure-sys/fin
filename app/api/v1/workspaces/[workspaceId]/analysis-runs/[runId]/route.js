import { getSignalAnalysisRun } from "../../../../../../../lib/server/signal-intelligence.js";
import { requireApiWorkspaceSession } from "../../../../../../../lib/server/auth/session.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function createSignalAnalysisRunHandler({
  requireSession = requireApiWorkspaceSession,
  service = getSignalAnalysisRun,
} = {}) {
  return async function GET(request, { params }) {
    const auth = await requireSession(request, params.workspaceId);
    if (auth instanceof Response) return auth;
    try {
      const payload = await service(params.workspaceId, params.runId);
      return Response.json(payload, { status: payload.status === "not_found" ? 404 : 200, headers: { "Cache-Control": "private, no-store" } });
    } catch {
      return Response.json(
        { enabled: true, status: "blocked", reason: "signal_intelligence_unavailable" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  };
}

export const GET = createSignalAnalysisRunHandler();
