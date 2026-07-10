import { isSupportedBreakpointHurdle } from "@/lib/breakpoint/compose";
import { getLiveBreakpointService } from "@/lib/server/breakpoint-service";
import { appendPublicBreakpointRun, signBreakpointFork, verifyBreakpointFork } from "@/lib/server/data/public-breakpoint-runs";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    const fork = verifyBreakpointFork(body?.token);
    if (fork.runId !== params?.runId) throw new Error("Fork does not match this Breakpoint run.");
    const hurdleRate = Number(fork?.changes?.hurdleRate);
    if (!isSupportedBreakpointHurdle(hurdleRate)) throw new Error("Fork hurdle is out of range.");

    const result = await getLiveBreakpointService().run({ ticker: fork.ticker, hurdleRate, locale: body?.locale === "en" ? "en" : "es" });
    const run = await appendPublicBreakpointRun({ ticker: fork.ticker, status: result.status, payload: result, sourceSnapshot: result.provenance, assumptions: { hurdle: result.hurdle, forkedFrom: fork.runId } });
    return Response.json({ ok: true, runId: run.id, token: signBreakpointFork({ runId: run.id, ticker: run.ticker, changes: { hurdleRate } }) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return Response.json({ ok: false, code: "INVALID_FORK", message: error instanceof Error ? error.message : "Invalid breakpoint fork." }, { status: 422, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
