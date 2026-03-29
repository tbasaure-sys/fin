import test from "node:test";
import assert from "node:assert/strict";

import {
  RequestValidationError,
  parseDecisionPayload,
  parseEscrowPatchPayload,
  parseEscrowStagePayload,
  parseMandatePatchPayload,
  parsePhantomDiversificationPayload,
  parsePortfolioUpdatePayload,
} from "../lib/server/workspace-action-validation.js";

test("parsePortfolioUpdatePayload requires a trade instruction", () => {
  assert.deepEqual(parsePortfolioUpdatePayload({ instruction: "sold 2 shares of AAPL" }), {
    instruction: "sold 2 shares of AAPL",
  });

  assert.throws(
    () => parsePortfolioUpdatePayload({}),
    (error) => error instanceof RequestValidationError && /instruction is required/i.test(error.message),
  );
});

test("parseDecisionPayload normalizes action-based responses", () => {
  const payload = parseDecisionPayload({
    action: { id: "trim-aapl", title: "Trim AAPL", summary: "Reduce concentration" },
    userResponse: "Deferred",
  });

  assert.equal(payload.userResponse, "deferred");
  assert.equal(payload.action.id, "trim-aapl");
  assert.equal(payload.action.title, "Trim AAPL");
});

test("parseEscrowStagePayload requires a valid action object", () => {
  const payload = parseEscrowStagePayload({
    action: { id: "buy-nvda", title: "Buy NVDA", watchFor: "Breadth confirmation" },
    autoMature: true,
  });

  assert.equal(payload.action.id, "buy-nvda");
  assert.equal(payload.autoMature, true);
});

test("parseEscrowPatchPayload rejects empty patches", () => {
  assert.throws(
    () => parseEscrowPatchPayload({}),
    (error) => error instanceof RequestValidationError && /At least one escrow field/i.test(error.message),
  );

  const payload = parseEscrowPatchPayload({ action: "execute" });
  assert.equal(payload.action, "execute");
});

test("parseMandatePatchPayload accepts bounded thresholds", () => {
  const payload = parseMandatePatchPayload({
    summary: "Keep risk selective",
    thresholds: {
      minRecoverability: 0.45,
      maxPhantomRebound: 0.3,
    },
  });

  assert.equal(payload.summary, "Keep risk selective");
  assert.equal(payload.thresholds.minRecoverability, 0.45);
  assert.equal(payload.thresholds.maxPhantomRebound, 0.3);
});

test("parsePhantomDiversificationPayload normalizes tickers and enforces at least three holdings", () => {
  const payload = parsePhantomDiversificationPayload({
    holdings: [
      { ticker: "aapl", weight: 45 },
      { ticker: " msft ", weight: 35 },
      { ticker: "brk.b", weight: 20 },
    ],
  });

  assert.deepEqual(payload, {
    holdings: [
      { ticker: "AAPL", weight: 45 },
      { ticker: "MSFT", weight: 35 },
      { ticker: "BRK.B", weight: 20 },
    ],
  });

  assert.throws(
    () => parsePhantomDiversificationPayload({ holdings: [{ ticker: "AAPL", weight: 60 }, { ticker: "MSFT", weight: 40 }] }),
    (error) => error instanceof RequestValidationError && /At least 3 holdings/i.test(error.message),
  );
});
