import { NextResponse } from "next/server";
import { requireApiAuthSession } from "@/lib/server/auth/session";
import { loadFilingDossier } from "@/lib/server/filing-dossier-service";
import { cleanTicker } from "@/lib/research/dossier";
import microsoft from "@/lib/research/published/MSFT.json";
import { signDossier } from "@/lib/server/filing-analysis";

function evidenceResponse(dossier) {
  return NextResponse.json({dossier,ticket:signDossier(dossier),analysisAvailable:!!process.env.GROQ_API_KEY},
    {headers:{'Cache-Control':'private, no-store'}});
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request) {
  const session = await requireApiAuthSession(request);
  if (session instanceof Response) return session;
  const ticker = cleanTicker(new URL(request.url).searchParams.get("ticker"));
  if (!ticker)
    return NextResponse.json({ error: "INVALID_TICKER" }, { status: 400 });
  // A dated verified capture is not relabeled live when served again.
  if (ticker === "MSFT") return evidenceResponse(microsoft);
  try {
    return evidenceResponse(await loadFilingDossier(ticker));
  } catch (error) {
    const code = error.message;
    const status = code === "BUSY" ? 429 : code === "NO_ISSUER" ? 404 : 503;
    return NextResponse.json(
      {
        error:
          code === "BUSY"
            ? "BUSY"
            : code === "NO_ISSUER"
              ? "NO_ISSUER"
              : "SOURCE_UNAVAILABLE",
      },
      { status, headers: status === 429 ? { "Retry-After": "10" } : {} },
    );
  }
}
