import { createCheckoutLink, normalizePlanSlug } from "@/lib/server/billing";
import { requireApiAuthSession } from "@/lib/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = await requireApiAuthSession(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const plan = normalizePlanSlug(body?.plan || "pro");
    const url = await createCheckoutLink({
      user: auth.user,
      plan,
      request,
    });
    return Response.json({ ok: true, url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: String(error?.message || error || "Checkout could not be started.") },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
