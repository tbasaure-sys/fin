export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(
    {
      error: "Billing portal is disabled while BLS Prime is in early access.",
      code: "billing_disabled",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
