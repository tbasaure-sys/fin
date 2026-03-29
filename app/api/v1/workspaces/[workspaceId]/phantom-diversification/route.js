import { requireApiWorkspaceSession } from "@/lib/server/auth/session";
import { analyzeWorkspacePhantomDiversification } from "@/lib/server/phantom-diversification";
import { errorResponse, parsePhantomDiversificationPayload } from "@/lib/server/workspace-action-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const input = parsePhantomDiversificationPayload(body);
    const payload = await analyzeWorkspacePhantomDiversification(params.workspaceId, input.holdings);
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
