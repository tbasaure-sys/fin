import { handlePolarWebhookEvent, verifyPolarWebhookSignature } from "@/lib/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const payloadText = await request.text();
  const verification = verifyPolarWebhookSignature({
    payload: payloadText,
    headers: request.headers,
  });

  if (!verification.ok) {
    return Response.json(
      { error: verification.reason || "Invalid webhook signature." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return Response.json(
      { error: "Webhook payload must be valid JSON." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await handlePolarWebhookEvent(payload);
    return Response.json(
      { ok: true, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: String(error?.message || error || "Webhook sync failed.") },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
