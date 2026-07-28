import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/public/stress/route.js";

function requestWith(body) {
  return new Request("http://localhost/api/public/stress", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("public stress route runs the real bounded simulation for current and proposed portfolios", async () => {
  const response = await POST(requestWith({}));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "interactive_example");
  assert.equal(payload.portfolio.current.length, 5);
  assert.equal(payload.portfolio.proposed.length, 6);
  assert.equal(payload.current.model.scenarioCount, 5000);
  assert.equal(payload.proposed.model.scenarioCount, 5000);
  assert.equal(typeof payload.comparison.cvar5Delta, "number");
  assert.equal(typeof payload.comparison.topTwoWeightDelta, "number");
  assert.equal(payload.provenance.marketDataLive, false);
  assert.equal(payload.provenance.portfolioKind, "editable_example");
  assert.doesNotMatch(JSON.stringify(payload), /samplePaths|deployment|manifestPath/);
});

test("public stress route rejects tickers outside the example universe without leaking an exception", async () => {
  const response = await POST(requestWith({
    holdings: [
      { ticker: "MSFT", weightPct: 40 },
      { ticker: "GOOGL", weightPct: 30 },
      { ticker: "JPM", weightPct: 20 },
      { ticker: "SCAM", weightPct: 10 },
    ],
  }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload, {
    ok: false,
    error: { code: "UNSUPPORTED_TICKER", message: "El activo SCAM no pertenece al universo público." },
  });
});
