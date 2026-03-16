import { getSessionPayload } from "@/lib/server/dashboard-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const payload = await getSessionPayload();
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}

