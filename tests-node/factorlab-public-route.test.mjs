import assert from "node:assert/strict";
import test from "node:test";

import { createFactorLabGetHandler } from "../app/api/public/factorlab/route.js";
import { FactorLabUnavailableError } from "../lib/server/factorlab-service.js";

test("public FactorLab route returns a live run with bounded public filters", async () => {
  const GET = createFactorLabGetHandler({
    service: {
      async run(filters) {
        return {
          mode: "live",
          datasetAsOf: "2026-07-28",
          summary: { returned: filters.topK },
          candidates: [],
        };
      },
    },
  });

  const response = await GET(new Request("http://localhost/api/public/factorlab?topK=99&minAdvUsd=-1"));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(payload.ok, true);
  assert.equal(payload.run.mode, "live");
  assert.equal(payload.run.summary.returned, 12);
});

test("public FactorLab route fails safely without leaking provider details", async () => {
  const GET = createFactorLabGetHandler({
    service: {
      async run() {
        throw new FactorLabUnavailableError("secret upstream URL and credential");
      },
    },
  });

  const response = await GET(new Request("http://localhost/api/public/factorlab?lang=es"));
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(payload, {
    ok: false,
    code: "LIVE_DATA_UNAVAILABLE",
    message: "No pudimos actualizar FactorLab con datos públicos actuales. Vuelve a intentarlo en unos minutos.",
  });
  assert.doesNotMatch(JSON.stringify(payload), /secret|credential/i);
});

test("public FactorLab route localizes safe provider failures", async () => {
  const GET = createFactorLabGetHandler({
    service: { async run() { throw new Error("upstream exploded"); } },
  });

  const response = await GET(new Request("http://localhost/api/public/factorlab?lang=en"));
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.code, "LIVE_DATA_UNAVAILABLE");
  assert.equal(payload.message, "We could not refresh FactorLab from current public data. Please try again in a few minutes.");
});
