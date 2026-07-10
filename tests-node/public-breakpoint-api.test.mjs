import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("public Breakpoint API is no-auth, no-store and delegates to the live service", () => {
  const post = source("app/api/public/breakpoints/route.js");
  assert.match(post, /export async function POST/);
  assert.match(post, /getLiveBreakpointService/);
  assert.match(post, /Cache-Control/);
  assert.match(post, /appendPublicBreakpointRun/);
  assert.doesNotMatch(post, /requireSession|ensureAuthenticated/);
});

test("public Breakpoint returns a usable temporary run when saving the result fails", () => {
  const post = source("app/api/public/breakpoints/route.js");
  assert.match(post, /createEphemeralBreakpointRun/);
  assert.match(post, /storageWarning/);
  assert.match(post, /run:\s*result/);
});

test("public Breakpoint retrieval and forks have bounded contracts", () => {
  const get = source("app/api/public/breakpoints/[runId]/route.js");
  const fork = source("app/api/public/breakpoints/[runId]/fork/route.js");
  assert.match(get, /getPublicBreakpointRun/);
  assert.match(fork, /verifyBreakpointFork/);
  assert.match(fork, /isSupportedBreakpointHurdle/);
  assert.match(fork, /signBreakpointFork/);
});
