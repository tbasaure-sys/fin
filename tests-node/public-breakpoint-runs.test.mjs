import assert from "node:assert/strict";
import test from "node:test";

process.env.BLS_PRIME_STORAGE_BACKEND = "memory";
process.env.BLS_PRIME_BREAKPOINT_FORK_SECRET = "test-breakpoint-secret";

const { appendPublicBreakpointRun, getPublicBreakpointRun, signBreakpointFork, verifyBreakpointFork } = await import("../lib/server/data/public-breakpoint-runs.js");

test("public breakpoint runs append immutably and are retrievable", async () => {
  const created = await appendPublicBreakpointRun({ ticker: "asml", status: "ready", payload: { ticker: "ASML", generatedAt: "2026-03-01T00:00:00.000Z" } });
  assert.match(created.id, /^memory-/);
  assert.equal(created.durable, false);
  const read = await getPublicBreakpointRun(created.id);
  assert.equal(read.ticker, "ASML");
  assert.deepEqual(read.payload, created.payload);
});

test("fork signatures bind a public run to bounded changes", () => {
  const token = signBreakpointFork({ runId: "run-1", ticker: "ASML", changes: { hurdleRate: 0.12 } });
  assert.ok(token);
  const verified = verifyBreakpointFork(token);
  assert.equal(verified.runId, "run-1");
  assert.equal(verified.changes.hurdleRate, 0.12);
  assert.throws(() => verifyBreakpointFork(`${token}tampered`), /invalid/i);
});
