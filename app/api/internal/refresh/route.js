import { requireInternalRefreshAccess } from "@/lib/server/internal-refresh-auth";
import { queueWorkspaceRefresh } from "@/lib/server/refresh-dispatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function refreshResponse(request) {
  const unauthorized = requireInternalRefreshAccess(request);
  if (unauthorized) return unauthorized;

  const source = String(request.headers.get("x-refresh-source") || "scheduled").trim() || "scheduled";
  const payload = await queueWorkspaceRefresh(source);

  return Response.json(payload, {
    status: 202,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request) {
  return refreshResponse(request);
}

export async function POST(request) {
  return refreshResponse(request);
}
