import { requireApiAuthSession } from "@/lib/server/auth/session";
import { livingCaseService } from "@/lib/server/living-case-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const headers = { "Cache-Control": "private, no-store" };
const codes = {
  AUTH_REQUIRED: 401, ACCESS_DENIED: 403, INVALID_DOSSIER: 400, INVALID_TICKER: 400,
  GENERATE_THESIS_FIRST: 409, CASE_LIMIT: 429, CASE_NOT_FOUND: 404, ISSUER_MISMATCH: 502,
  STORAGE_UNAVAILABLE: 503, CASE_TOO_LARGE: 413,
};
const failure = (error) => Response.json({ error: codes[error?.code] ? error.code : "CASE_UNAVAILABLE" }, { status: codes[error?.code] || 503, headers });

export async function GET(request) {
  const session = await requireApiAuthSession(request);
  if (session instanceof Response) return session;
  try { return Response.json(await livingCaseService.list(session), { headers }); }
  catch (error) { return failure(error); }
}

export async function POST(request) {
  const session = await requireApiAuthSession(request);
  if (session instanceof Response) return session;
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "ORIGIN_REJECTED" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 90000) return Response.json({ error: "INVALID_REQUEST" }, { status: 413, headers });
    const text = await request.text();
    if (text.length > 90000) return Response.json({ error: "INVALID_REQUEST" }, { status: 413, headers });
    const body = JSON.parse(text);
    if (body?.action === "follow") return Response.json(await livingCaseService.follow(session, body), { headers });
    if (body?.action === "refresh") return Response.json(await livingCaseService.refresh(session, body.ticker), { headers });
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  } catch (error) { return failure(error); }
}
