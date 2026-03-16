import { triggerBackendRefresh } from "@/lib/server/backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function refreshResponse() {
  const payload = await triggerBackendRefresh();
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  return refreshResponse();
}

export async function POST() {
  return refreshResponse();
}
