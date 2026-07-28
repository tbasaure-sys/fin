import { fetchBackendEquityResearch } from "../../../../lib/server/backend.js";
import { consumePublicRateLimit } from "../../../../lib/server/data/public-rate-limit.js";
import {
  resolvePublicEquityResearchPayload,
  sanitizePublicResearchPayload,
} from "../../../../lib/server/equity-research.js";
import { attachAuroraDecisionSystem } from "../../../../lib/server/aurora-decision-system.js";
import { fetchFactorLabMarketSnapshot } from "../../../../lib/server/factorlab-service.js";

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
    const resolved = await resolvePublicEquityResearchPayload(ticker, {
      backendLoader: fetchBackendEquityResearch,
      marketLoader: fetchFactorLabMarketSnapshot,
    });
    const payload = resolved.source === "canonical_backend"
      ? sanitizePublicResearchPayload(resolved.payload, { expectedTicker: ticker })
      : resolved.payload;
    const sanitized = await attachAuroraDecisionSystem(
      payload,
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
        message: "No pudimos recuperar una cotización vigente para esta acción. Vuelve a intentarlo.",
      },
      { status: 503 },
    );
  }
}
