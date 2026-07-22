import { fetchBackendEquityResearch } from "../../../../lib/server/backend.js";
import { consumePublicRateLimit } from "../../../../lib/server/data/public-rate-limit.js";
import { sanitizePublicResearchPayload } from "../../../../lib/server/equity-research.js";
import { attachAuroraDecisionSystem } from "../../../../lib/server/aurora-decision-system.js";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const MAX_RUNS_PER_WINDOW = 4;
function noStoreJson(body, options = {}) {
  return Response.json(body, {
    ...options,
    headers: { "Cache-Control": "no-store, max-age=0", ...(options.headers || {}) },
  });
}

function cleanTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 16);
}

export async function POST(request) {
  let rateLimit;
  try {
    rateLimit = await consumePublicRateLimit({
      request,
      scope: "public-equity-research-v1",
      limit: MAX_RUNS_PER_WINDOW,
      windowMs: WINDOW_MS,
    });
  } catch {
    return noStoreJson(
      { ok: false, code: "RATE_LIMIT_UNAVAILABLE", message: "No pudimos iniciar el análisis de forma segura. Vuelve a intentarlo." },
      { status: 503 },
    );
  }

  if (!rateLimit.allowed) {
    return noStoreJson(
      { ok: false, code: "RATE_LIMITED", message: "Espera un minuto antes de analizar otra empresa." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds || 1) } },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ ok: false, code: "INVALID_REQUEST", message: "Envía un ticker válido." }, { status: 400 });
  }

  const ticker = cleanTicker(body?.ticker);
  const mode = "quick";
  if (!ticker) {
    return noStoreJson({ ok: false, code: "INVALID_TICKER", message: "Escribe un ticker válido." }, { status: 422 });
  }

  try {
    const payload = await fetchBackendEquityResearch(ticker, mode);
    if (!payload || payload.ok === false) {
      return noStoreJson(
        { ok: false, code: "DATA_UNAVAILABLE", message: "No pudimos obtener datos suficientes para esta empresa." },
        { status: 503 },
      );
    }
    const sanitized = await attachAuroraDecisionSystem(
      sanitizePublicResearchPayload(payload, { expectedTicker: ticker }),
    );
    return noStoreJson({
      ...sanitized,
      history: {
        persisted: false,
        run_count: 0,
        storage_status: "public_session_only",
        delta: { available: false, changes: [] },
      },
    });
  } catch {
    return noStoreJson(
      {
        ok: false,
        code: "DATA_UNAVAILABLE",
        message: "No pudimos completar la valoración con datos actuales. Prueba otra empresa o vuelve a intentarlo.",
      },
      { status: 503 },
    );
  }
}
