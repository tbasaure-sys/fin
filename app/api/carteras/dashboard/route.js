import { requireApiAuthSession } from "@/lib/server/auth/session";
import { getCarterasDashboard } from "@/lib/server/carteras-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const session = await requireApiAuthSession(request);
  if (session instanceof Response) return session;
  return Response.json(await getCarterasDashboard(session), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
