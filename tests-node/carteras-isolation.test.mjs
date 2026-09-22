import test from "node:test";
import assert from "node:assert/strict";
import { getCarterasDashboard, summarizeOwnedHoldings } from "../lib/server/carteras-api.js";

test("Carteras reads only the signed-in owner's workspace from Neon", async () => {
  const calls = [];
  const reader = async (owner, workspace) => {
    calls.push([owner, workspace]);
    return { status: "available", holdings: [{ ticker: "TEST", quantity: 2, current_price_usd: 10, market_value_usd: 20, updated_at: "2026-09-22T10:00:00Z" }] };
  };
  const session = { user: { id: "user-one" }, workspace: { id: "workspace-one" } };
  const result = await getCarterasDashboard(session, { readPortfolio: reader, neonAvailable: () => true });
  assert.deepEqual(calls, [["user-one", "workspace-one"]]);
  assert.equal(result.holdings[0].ticker, "TEST");
  assert.equal(result.totalKnownUsd, 20);
  const noSession = await getCarterasDashboard(null, { readPortfolio: reader, neonAvailable: () => true });
  assert.equal(noSession.status, "unavailable");
  assert.equal(calls.length, 1);
});

test("unknown prices do not become fake zero-value holdings", () => {
  const result = summarizeOwnedHoldings([{ ticker: "AA", quantity: 3, current_price_usd: null, market_value_usd: null }, { ticker: "BB", quantity: 1, current_price_usd: 10, market_value_usd: 10 }]);
  assert.equal(result.holdings.find((item) => item.ticker === "AA").recordedValueUsd, null);
  assert.equal(result.pricedCount, 1);
  assert.equal(result.totalKnownUsd, 10);
});
