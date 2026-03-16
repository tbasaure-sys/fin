import { fetchBackendSnapshot } from "@/lib/server/backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const snapshot = await fetchBackendSnapshot();
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}

