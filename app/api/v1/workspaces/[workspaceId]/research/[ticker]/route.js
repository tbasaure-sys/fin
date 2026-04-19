import { requireApiWorkspaceSession } from "@/lib/server/auth/session";
import { getWorkspaceEquityResearch } from "@/lib/server/equity-research";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "full" ? "full" : "quick";
  const payload = await getWorkspaceEquityResearch(params.workspaceId, params.ticker, { mode });
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
