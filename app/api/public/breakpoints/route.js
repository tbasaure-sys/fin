import { cleanBreakpointTicker } from "@/lib/breakpoint/contract";
import { isSupportedBreakpointHurdle } from "@/lib/breakpoint/compose";
import { getLiveBreakpointService } from "@/lib/server/breakpoint-service";
import { appendPublicBreakpointRun, createEphemeralBreakpointRun } from "@/lib/server/data/public-breakpoint-runs";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const MAX_RUNS_PER_WINDOW = 8;
const RUN_TIMEOUT_MS = Number(process.env.BLS_BREAKPOINT_TIMEOUT_MS || 40_000);

class BreakpointTimeoutError extends Error {
  constructor() {
    super("breakpoint_run_timeout");
    this.name = "BreakpointTimeoutError";
  }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new BreakpointTimeoutError()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
const requests = globalThis.__BLS_BREAKPOINT_RATE_LIMIT__ || new Map();
globalThis.__BLS_BREAKPOINT_RATE_LIMIT__ = requests;

function noStoreJson(body, options = {}) {
  return Response.json(body, {
    ...options,
    headers: { "Cache-Control": "no-store, max-age=0", ...(options.headers || {}) },
  });
}

function clientKey(request) {
  return String(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "anonymous").split(",")[0].trim();
}

function isRateLimited(request) {
  const key = clientKey(request);
  const now = Date.now();
  const current = (requests.get(key) || []).filter((value) => now - value < WINDOW_MS);
  if (current.length >= MAX_RUNS_PER_WINDOW) {
    requests.set(key, current);
    return true;
  }
  current.push(now);
  requests.set(key, current);
  return false;
}

export async function POST(request) {
  let locale = "es";
  if (isRateLimited(request)) {
    return noStoreJson({ ok: false, code: "RATE_LIMITED", message: "Please wait a minute before running another breakpoint." }, { status: 429 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return noStoreJson({ ok: false, code: "INVALID_REQUEST", message: "Send a JSON body with a ticker." }, { status: 400 });
  }

  locale = payload?.locale === "en" ? "en" : "es";

  const ticker = cleanBreakpointTicker(payload?.ticker);
  const hurdleRate = payload?.hurdleRate === undefined ? 0.1 : Number(payload.hurdleRate);
  if (!ticker || !isSupportedBreakpointHurdle(hurdleRate)) {
    return noStoreJson({ ok: false, code: "INVALID_INPUT", message: "Use a valid ticker and an 8%, 10%, or 12% hurdle." }, { status: 422 });
  }

  let result;
  try {
    result = await withTimeout(
      getLiveBreakpointService().run({ ticker, hurdleRate, locale }),
      RUN_TIMEOUT_MS,
    );
  } catch (error) {
    const timedOut = error instanceof BreakpointTimeoutError;
    return noStoreJson({
      ok: false,
      code: timedOut ? "TIMEOUT" : "DATA_UNAVAILABLE",
      message: timedOut
        ? (locale === "en"
          ? "The data providers did not answer in time. Please retry."
          : "Los proveedores de datos no respondieron a tiempo. Vuelve a intentarlo.")
        : (locale === "en"
          ? "We could not build this reading from current public data. Try another SEC-covered ticker."
          : "No pudimos construir esta lectura con datos públicos actuales. Prueba otra empresa con cobertura SEC."),
      detail: process.env.NODE_ENV === "production" ? undefined : error instanceof Error ? error.message : String(error),
    }, { status: timedOut ? 504 : 503 });
  }

  try {
    const run = await appendPublicBreakpointRun({
      ticker,
      status: result.status,
      payload: result,
      sourceSnapshot: result.provenance,
      assumptions: { hurdle: result.hurdle, model: result.model || {} },
    });
    return noStoreJson({ ok: true, runId: run.id, ticker: run.ticker, status: run.status, durable: run.durable, url: `/breakpoint/${run.ticker}/${encodeURIComponent(run.id)}` });
  } catch (error) {
    const run = createEphemeralBreakpointRun({
      ticker,
      status: result.status,
      payload: result,
      sourceSnapshot: result.provenance,
      assumptions: { hurdle: result.hurdle, model: result.model || {} },
    });
    return noStoreJson({
      ok: true,
      runId: run.id,
      ticker: run.ticker,
      status: run.status,
      durable: false,
      run: result,
      storageWarning: locale === "en"
        ? "This reading is ready, but it could not be saved for a shareable link."
        : "La lectura está lista, pero no se pudo guardar para crear un enlace compartible.",
      detail: process.env.NODE_ENV === "production" ? undefined : error instanceof Error ? error.message : String(error),
    });
  }
}
