import { triggerBackendRefresh } from "@/lib/server/backend";
import { requireApiAuthSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function refreshResponse(request) {
  const auth = await requireApiAuthSession(request);
  if (auth instanceof Response) return auth;
  const payload = await triggerBackendRefresh();
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request) {
  return refreshResponse(request);
}

export async function POST(request) {
  return refreshResponse(request);
}
