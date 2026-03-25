import { createBillingPortalLink } from "@/lib/server/billing";
import { requireApiAuthSession } from "@/lib/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = await requireApiAuthSession(request);
  if (auth instanceof Response) return auth;

  try {
    const url = await createBillingPortalLink({ userId: auth.user.id, request });
    return Response.json({ ok: true, url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: String(error?.message || error || "Billing portal is unavailable.") },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
