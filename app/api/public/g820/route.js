import { loadPublicG820Index } from "@/lib/server/g820-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const index = await loadPublicG820Index();
    return Response.json({ ok: true, index }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return Response.json({
      ok: false,
      code: "G820_UNAVAILABLE",
      message: "G820 evidence package is unavailable.",
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}
