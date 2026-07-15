import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { getNeonSql, getStorageBackend } from "./neon.js";

const memoryWindows = globalThis.__BLS_PUBLIC_RATE_LIMIT_WINDOWS__ || new Map();
globalThis.__BLS_PUBLIC_RATE_LIMIT_WINDOWS__ = memoryWindows;
const storageSetup = globalThis.__BLS_PUBLIC_RATE_LIMIT_STORAGE_SETUP__ || new WeakMap();
globalThis.__BLS_PUBLIC_RATE_LIMIT_STORAGE_SETUP__ = storageSetup;

function rateLimitSecret() {
  const secret = String(
    process.env.BLS_PRIME_RATE_LIMIT_SECRET
    || process.env.BLS_PRIME_AUTH_SECRET
    || process.env.AUTH_SECRET
    || process.env.NEXTAUTH_SECRET
    || "",
  ).trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("A rate-limit HMAC secret is required in production.");
  }
  return "bls-prime-local-rate-limit";
}

export function trustedClientAddress(request, { environment = process.env.NODE_ENV, vercel = process.env.VERCEL } = {}) {
  if (environment === "production" && vercel !== "1") {
    throw new Error("A trusted Vercel proxy context is required for the public endpoint.");
  }
  const raw = String(request?.headers?.get?.("x-vercel-forwarded-for") || "")
    .split(",")[0]
    .trim();
  if (isIP(raw)) return raw;
  if (environment === "production") {
    throw new Error("A trusted client address is required for the public endpoint.");
  }
  return "127.0.0.1";
}

function clientHash(scope, address) {
  return createHmac("sha256", rateLimitSecret())
    .update(`${scope}\0${address}`)
    .digest("hex");
}

export async function ensurePublicRateLimitStorage(sql) {
  if (!sql || typeof sql.query !== "function") throw new Error("Public rate limiting requires a SQL client.");
  const existing = storageSetup.get(sql);
  if (existing) return existing;

  const setup = (async () => {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS bls_public_rate_limits (
        scope TEXT NOT NULL,
        client_hash TEXT NOT NULL CHECK (length(client_hash) = 64),
        window_start TIMESTAMPTZ NOT NULL,
        request_count INTEGER NOT NULL CHECK (request_count > 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (scope, client_hash)
      )
    `);
    await sql.query(`
      CREATE INDEX IF NOT EXISTS bls_public_rate_limits_updated_at_idx
      ON bls_public_rate_limits (updated_at)
    `);
  })();
  storageSetup.set(sql, setup);
  try {
    await setup;
  } catch (error) {
    storageSetup.delete(sql);
    throw error;
  }
}

function normalizedResult(row) {
  if (!row) throw new Error("Public rate limiter did not return a result.");
  return {
    allowed: row.allowed === true,
    requestCount: Number(row.request_count || 0),
    remaining: Math.max(0, Number(row.remaining || 0)),
    resetAt: row.reset_at instanceof Date ? row.reset_at.toISOString() : String(row.reset_at || ""),
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds || 0)),
  };
}

async function consumeNeonWindow({ sql, scope, hash, limit, windowMs }) {
  await ensurePublicRateLimitStorage(sql);
  const rows = await sql.query(
    `WITH incoming AS (
       SELECT
         $1::text AS scope,
         $2::text AS client_hash,
         date_bin(
           ($4::bigint * INTERVAL '1 millisecond'),
           clock_timestamp(),
           TIMESTAMPTZ '1970-01-01 00:00:00+00'
         ) AS window_start
     )
     INSERT INTO bls_public_rate_limits (
       scope, client_hash, window_start, request_count, updated_at
     )
     SELECT scope, client_hash, window_start, 1, clock_timestamp()
     FROM incoming
     ON CONFLICT (scope, client_hash)
     DO UPDATE SET
       window_start = GREATEST(bls_public_rate_limits.window_start, EXCLUDED.window_start),
       request_count = CASE
         WHEN bls_public_rate_limits.window_start < EXCLUDED.window_start THEN 1
         ELSE LEAST(bls_public_rate_limits.request_count + 1, $3::integer + 1)
       END,
       updated_at = clock_timestamp()
     RETURNING
       request_count <= $3::integer AS allowed,
       request_count,
       GREATEST(0, $3::integer - request_count) AS remaining,
       window_start + ($4::bigint * INTERVAL '1 millisecond') AS reset_at,
       GREATEST(
         0,
         CEIL(EXTRACT(EPOCH FROM (
           window_start + ($4::bigint * INTERVAL '1 millisecond') - clock_timestamp()
         )))
       )::integer AS retry_after_seconds`,
    [scope, hash, limit, windowMs],
  );
  return normalizedResult(rows[0]);
}

export async function consumePublicRateLimit({
  request,
  scope,
  limit,
  windowMs,
  now = Date.now(),
  storageBackend = getStorageBackend(),
  environment = process.env.NODE_ENV,
  vercel = process.env.VERCEL,
  sql = null,
}) {
  if (!cleanPositiveInteger(limit) || !cleanPositiveInteger(windowMs) || !String(scope || "").trim()) {
    throw new Error("Public rate limit requires a scope, positive limit, and positive window.");
  }
  if (storageBackend !== "neon" && environment === "production") {
    throw new Error("Shared Neon storage is required for public rate limiting in production.");
  }
  const address = trustedClientAddress(request, { environment, vercel });
  const hash = clientHash(scope, address);
  if (storageBackend === "neon") {
    return consumeNeonWindow({ sql: sql || getNeonSql(), scope, hash, limit, windowMs });
  }
  if (storageBackend !== "memory") {
    throw new Error(`Unsupported public rate-limit storage backend: ${storageBackend}`);
  }
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${scope}:${hash}`;
  const previous = memoryWindows.get(key);
  const requestCount = previous?.windowStart === windowStart ? previous.requestCount + 1 : 1;
  memoryWindows.set(key, { windowStart, requestCount });
  const resetAt = windowStart + windowMs;
  return {
    allowed: requestCount <= limit,
    requestCount,
    remaining: Math.max(0, limit - requestCount),
    resetAt: new Date(resetAt).toISOString(),
    retryAfterSeconds: Math.max(0, Math.ceil((resetAt - now) / 1000)),
  };
}

function cleanPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}
