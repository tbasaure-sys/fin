import { getPublicBreakpointRun } from "@/lib/server/data/public-breakpoint-runs";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const run = await getPublicBreakpointRun(params?.runId);
  if (!run) return Response.json({ ok: false, code: "NOT_FOUND", message: "This Breakpoint run is unavailable." }, { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } });
  return Response.json({ ok: true, run }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
