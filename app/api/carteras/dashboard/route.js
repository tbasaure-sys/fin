import { NextResponse } from "next/server";
import { requireApiAuthSession } from "@/lib/server/auth/session";
import { getCarterasDashboard } from "@/lib/server/carteras-api";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const authSession = await requireApiAuthSession(request);
  if (authSession instanceof Response) return authSession;

  const currency = new URL(request.url).searchParams.get("currency") || "USD";
  const payload = await getCarterasDashboard(currency);
  return NextResponse.json(payload, { headers: { "cache-control": "private, no-store" } });
}
