import { triggerBackendRefresh } from "@/lib/server/backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const payload = await triggerBackendRefresh();
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}

