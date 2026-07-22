import assert from "node:assert/strict";
import test from "node:test";

const rateLimit = await import("../lib/server/data/public-rate-limit.js");

function request(ip = "203.0.113.10") {
  return new Request("http://localhost", { headers: { "x-vercel-forwarded-for": ip } });
}

test("production accepts Vercel identity only when the runtime itself is Vercel", () => {
  assert.throws(
    () => rateLimit.trustedClientAddress(request("203.0.113.20"), { environment: "production", vercel: "" }),
    /Vercel|proxy|trusted/i,
  );
  assert.equal(
    rateLimit.trustedClientAddress(request("203.0.113.20"), { environment: "production", vercel: "1" }),
    "203.0.113.20",
  );
  const forwardedOnly = new Request("http://localhost", { headers: { "x-forwarded-for": "203.0.113.20" } });
  assert.throws(
    () => rateLimit.trustedClientAddress(forwardedOnly, { environment: "production", vercel: "1" }),
    /trusted client address/i,
  );
});

test("memory windows reset deterministically and keep clients independent", async () => {
  const options = {
    scope: `memory-${Math.random()}`,
    limit: 2,
    windowMs: 60_000,
    storageBackend: "memory",
    environment: "test",
  };

  assert.equal((await rateLimit.consumePublicRateLimit({ ...options, request: request("203.0.113.10"), now: 1_000 })).allowed, true);
  assert.equal((await rateLimit.consumePublicRateLimit({ ...options, request: request("203.0.113.10"), now: 2_000 })).allowed, true);
  assert.equal((await rateLimit.consumePublicRateLimit({ ...options, request: request("203.0.113.10"), now: 3_000 })).allowed, false);
  assert.equal((await rateLimit.consumePublicRateLimit({ ...options, request: request("203.0.113.11"), now: 3_000 })).allowed, true);
  const reset = await rateLimit.consumePublicRateLimit({ ...options, request: request("203.0.113.10"), now: 60_000 });
  assert.equal(reset.allowed, true);
  assert.equal(reset.requestCount, 1);
});

test("shared storage is created with the unique client window key", async () => {
  assert.equal(typeof rateLimit.ensurePublicRateLimitStorage, "function");
  const statements = [];
  const sql = { query: async (statement) => { statements.push(statement); return []; } };

  await rateLimit.ensurePublicRateLimitStorage(sql);

  assert.ok(statements.some((statement) => /CREATE TABLE IF NOT EXISTS bls_public_rate_limits/i.test(statement)));
  assert.ok(statements.some((statement) => /PRIMARY KEY\s*\(scope, client_hash\)/i.test(statement)));
  assert.ok(statements.some((statement) => /CREATE INDEX IF NOT EXISTS bls_public_rate_limits_updated_at_idx/i.test(statement)));
});

test("Neon consumption is one atomic parameterized upsert and never sends the raw address", async () => {
  const previousSecret = process.env.BLS_PRIME_RATE_LIMIT_SECRET;
  process.env.BLS_PRIME_RATE_LIMIT_SECRET = "test-rate-limit-secret";
  const statements = [];
  const parameters = [];
  const sql = {
    query: async (statement, params = []) => {
      statements.push(statement);
      parameters.push(params);
      if (/INSERT INTO bls_public_rate_limits/i.test(statement)) {
        return [{
          allowed: false,
          request_count: 5,
          remaining: 0,
          reset_at: "2026-07-14T12:01:00.000Z",
          retry_after_seconds: 42,
        }];
      }
      return [];
    },
  };

  try {
    const result = await rateLimit.consumePublicRateLimit({
      request: request("203.0.113.44"),
      scope: "public-equity-research-v1",
      limit: 4,
      windowMs: 60_000,
      storageBackend: "neon",
      sql,
    });

    const mutationIndex = statements.findIndex((statement) => /INSERT INTO bls_public_rate_limits/i.test(statement));
    assert.notEqual(mutationIndex, -1);
    assert.match(statements[mutationIndex], /ON CONFLICT\s*\(scope, client_hash\)\s*DO UPDATE/i);
    assert.match(statements[mutationIndex], /RETURNING/i);
    assert.equal(statements.filter((statement) => /INSERT INTO bls_public_rate_limits/i.test(statement)).length, 1);
    assert.match(parameters[mutationIndex][1], /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(parameters).includes("203.0.113.44"), false);
    assert.equal(result.allowed, false);
    assert.equal(result.requestCount, 5);
    assert.equal(result.retryAfterSeconds, 42);
  } finally {
    if (previousSecret === undefined) delete process.env.BLS_PRIME_RATE_LIMIT_SECRET;
    else process.env.BLS_PRIME_RATE_LIMIT_SECRET = previousSecret;
  }
});

test("production fails closed without shared storage", async () => {
  await assert.rejects(
    () => rateLimit.consumePublicRateLimit({
      request: request(),
      scope: "public-equity-research-v1",
      limit: 4,
      windowMs: 60_000,
      storageBackend: "memory",
      environment: "production",
    }),
    /shared|Neon|storage/i,
  );
});

test("a Neon failure propagates instead of falling back to an instance-local counter", async () => {
  await assert.rejects(
    () => rateLimit.consumePublicRateLimit({
      request: request(),
      scope: "public-equity-research-v1",
      limit: 4,
      windowMs: 60_000,
      storageBackend: "neon",
      sql: { query: async () => { throw new Error("database unavailable"); } },
    }),
    /database unavailable/i,
  );
});
