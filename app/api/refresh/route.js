import { triggerBackendRefresh } from "@/lib/server/backend";
import { requireApiAuthSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function refreshResponse(request) {
  const auth = await requireApiAuthSession(request);
  if (auth instanceof Response) return auth;

  const startedAt = new Date().toISOString();
  void triggerBackendRefresh().catch((error) => {
    console.error("Background refresh failed", error);
  });

  return Response.json(
    {
      ok: true,
      queued: true,
      startedAt,
      message: "Live refresh started in the background.",
    },
    {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET(request) {
  return refreshResponse(request);
}

export async function POST(request) {
  return refreshResponse(request);
}
