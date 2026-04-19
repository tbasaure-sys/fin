import { requireApiWorkspaceSession } from "@/lib/server/auth/session";
import {
  getWorkspaceEquityResearch,
  getWorkspaceEquityResearchJob,
  startWorkspaceEquityResearch,
} from "@/lib/server/equity-research";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "full" ? "full" : "quick";
  const runId = url.searchParams.get("runId");
  if (runId) {
    const payload = await getWorkspaceEquityResearchJob(params.workspaceId, params.ticker, runId);
    return Response.json(payload, {
      status: payload?.ok === false ? 500 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const payload = await getWorkspaceEquityResearch(params.workspaceId, params.ticker, { mode });
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const mode = body.mode === "full" ? "full" : "quick";
  const payload = await startWorkspaceEquityResearch(params.workspaceId, params.ticker, { mode });
  return Response.json(payload, {
    status: payload?.ok === false ? 502 : 202,
    headers: { "Cache-Control": "no-store" },
  });
}
