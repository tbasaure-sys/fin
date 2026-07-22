import test from "node:test";
import assert from "node:assert/strict";

import {
  RequestValidationError,
  errorResponse,
  parseDecisionPayload,
  parseEscrowPatchPayload,
  parseEscrowStagePayload,
  parseFinancePlanPayload,
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

test("parsePortfolioUpdatePayload preserves the date and preview request for a plain-language trade", () => {
  assert.deepEqual(parsePortfolioUpdatePayload({
    instruction: "compré USD 200 de NVDA",
    tradeDate: "2026-06-15",
    preview: true,
  }), {
    instruction: "compré USD 200 de NVDA",
    tradeDate: "2026-06-15",
    preview: true,
  });

  assert.throws(
    () => parsePortfolioUpdatePayload({ instruction: "compré USD 200 de NVDA", tradeDate: "15/06/2026" }),
    (error) => error instanceof RequestValidationError && /YYYY-MM-DD/.test(error.message),
  );
});

test("parsePortfolioUpdatePayload accepts explicit portfolio cash events", () => {
  assert.deepEqual(parsePortfolioUpdatePayload({
    cashEvent: {
      eventType: "Deposit",
      amountUsd: "2500",
      note: "monthly funding",
    },
  }), {
    cashEvent: {
      eventType: "deposit",
      amountUsd: 2500,
      note: "monthly funding",
    },
  });
});

test("parsePortfolioUpdatePayload accepts an atomic confirmed portfolio replacement", () => {
  const payload = parsePortfolioUpdatePayload({
    replacePortfolio: true,
    holdings: [
      { ticker: " aapl ", quantity: "2", avgCostUsd: "150" },
      { ticker: "MSFT", quantity: 1.5, currentPriceUsd: 410 },
    ],
  });

  assert.deepEqual(payload, {
    replacePortfolio: true,
    holdings: [
      { ticker: "AAPL", quantity: 2, avgCostUsd: 150 },
      { ticker: "MSFT", quantity: 1.5, currentPriceUsd: 410 },
    ],
  });

  assert.throws(
    () => parsePortfolioUpdatePayload({ replacePortfolio: true, holdings: [] }),
    (error) => error instanceof RequestValidationError && /at least one holding/i.test(error.message),
  );
});

test("parseFinancePlanPayload normalizes monthly cashflow fields", () => {
  const payload = parseFinancePlanPayload({
    monthlyIncome: "10000",
    fixedExpenses: 4200,
    variableExpenses: "1800.50",
    safetyBuffer: 750,
    targetMonthlyInvestment: 2500,
    baseCurrency: "usd",
  });

  assert.deepEqual(payload, {
    monthlyIncome: 10000,
    fixedExpenses: 4200,
    variableExpenses: 1800.5,
    safetyBuffer: 750,
    targetMonthlyInvestment: 2500,
    baseCurrency: "USD",
  });
});

test("parseFinancePlanPayload rejects negative cashflow values", () => {
  assert.throws(
    () => parseFinancePlanPayload({ monthlyIncome: -1 }),
    (error) => error instanceof RequestValidationError && /monthlyIncome must be at least 0/i.test(error.message),
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

test("parsePhantomDiversificationPayload rejects oversized holding lists with a user-facing message", () => {
  const holdings = Array.from({ length: 61 }, (_, index) => ({
    ticker: `T${index + 1}`,
    weight: 4,
  }));

  assert.throws(
    () => parsePhantomDiversificationPayload({ holdings }),
    (error) => error instanceof RequestValidationError && /up to 60 positive holdings per run/i.test(error.message),
  );
});

test("errorResponse exposes phantom analysis failures without collapsing them into a generic 500", async () => {
  const response = errorResponse(new Error("Unexpected phantom diversification failure: Unsupported tickers for live history: FAKE."));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /Unsupported tickers/i);
});
