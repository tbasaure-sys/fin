import { addWatchlistSymbol, getWorkspaceSavedState } from "@/lib/server/dashboard-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const payload = getWorkspaceSavedState(params.workspaceId);
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request, { params }) {
  const body = await request.json();
  const watchlist = addWatchlistSymbol(params.workspaceId, body);
  return Response.json({ watchlist }, { headers: { "Cache-Control": "no-store" } });
}

