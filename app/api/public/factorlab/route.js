import { parseFactorLabFilters } from "../../../../lib/factorlab-workspace.js";
import {
  getLiveFactorLabService,
} from "../../../../lib/server/factorlab-service.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreJson(body, options = {}) {
  return Response.json(body, {
    ...options,
    headers: { "Cache-Control": "no-store, max-age=0", ...(options.headers || {}) },
  });
}

export function createFactorLabGetHandler({ service = getLiveFactorLabService() } = {}) {
  return async function GET(request) {
    const url = new URL(request.url);
    const language = url.searchParams.get("lang") === "en" ? "en" : "es";
    const filters = parseFactorLabFilters(Object.fromEntries(url.searchParams));

    try {
      const run = await service.run(filters);
      return noStoreJson({ ok: true, run });
    } catch {
      return noStoreJson({
        ok: false,
        code: "LIVE_DATA_UNAVAILABLE",
        message: language === "en"
          ? "We could not refresh FactorLab from current public data. Please try again in a few minutes."
          : "No pudimos actualizar FactorLab con datos p\u00fablicos actuales. Vuelve a intentarlo en unos minutos.",
      }, { status: 503 });
    }
  };
}

export const GET = createFactorLabGetHandler();
