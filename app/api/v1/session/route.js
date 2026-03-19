import { buildAuthenticatedSessionPayload, requireApiAuthSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiAuthSession(request);
  if (auth instanceof Response) return auth;
  const payload = await buildAuthenticatedSessionPayload(auth);
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
