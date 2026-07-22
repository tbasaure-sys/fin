import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { cleanBreakpointTicker, cloneJson } from "../../breakpoint/contract.js";
import { getNeonSql, usingNeonStorage } from "./neon.js";

const memoryRuns = globalThis.__BLS_PUBLIC_BREAKPOINT_RUNS__ || new Map();
globalThis.__BLS_PUBLIC_BREAKPOINT_RUNS__ = memoryRuns;
const storageSetup = globalThis.__BLS_PUBLIC_BREAKPOINT_STORAGE_SETUP__ || new WeakMap();
globalThis.__BLS_PUBLIC_BREAKPOINT_STORAGE_SETUP__ = storageSetup;

function forkSecret() {
  return String(process.env.BLS_PRIME_BREAKPOINT_FORK_SECRET || "").trim();
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(value) {
  return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
}

function signature(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function normalizeRun(row, durable = true) {
  if (!row) return null;
  return {
    id: String(row.id),
    ticker: cleanBreakpointTicker(row.ticker),
    status: row.status,
    modelVersion: row.model_version || row.modelVersion || null,
    generatedAt: row.generated_at || row.generatedAt || null,
    sourceSnapshot: cloneJson(row.source_snapshot || row.sourceSnapshot, {}),
    assumptions: cloneJson(row.assumptions, {}),
    payload: cloneJson(row.payload, {}),
    createdAt: row.created_at || row.createdAt || null,
    durable,
  };
}

export function createEphemeralBreakpointRun({ ticker, status, payload, sourceSnapshot = {}, assumptions = {} } = {}) {
  const symbol = cleanBreakpointTicker(ticker || payload?.ticker);
  if (!symbol) throw new Error("Breakpoint run requires a valid ticker.");
  const row = normalizeRun({
    id: `memory-${randomUUID()}`,
    ticker: symbol,
    status: status || payload?.status || "needs_attention",
    modelVersion: payload?.version || null,
    generatedAt: payload?.generatedAt || new Date().toISOString(),
    sourceSnapshot,
    assumptions,
    payload: cloneJson(payload, {}),
    createdAt: new Date().toISOString(),
  }, false);
  memoryRuns.set(row.id, row);
  return row;
}

export async function ensurePublicBreakpointRunsStorage(sql) {
  if (!sql || typeof sql.query !== "function") throw new Error("Breakpoint storage requires a SQL client.");
  const existing = storageSetup.get(sql);
  if (existing) return existing;

  const setup = (async () => {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS bls_public_breakpoint_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticker TEXT NOT NULL,
        status TEXT NOT NULL,
        model_version TEXT,
        generated_at TIMESTAMPTZ NOT NULL,
        source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sql.query(`
      CREATE INDEX IF NOT EXISTS bls_public_breakpoint_runs_ticker_created_idx
      ON bls_public_breakpoint_runs (ticker, created_at DESC)
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

export function signBreakpointFork(payload) {
  const secret = forkSecret();
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("Breakpoint forks are unavailable until BLS_PRIME_BREAKPOINT_FORK_SECRET is configured.");
    return null;
  }
  const body = encode({ ...payload, issuedAt: new Date().toISOString() });
  return `${body}.${signature(body, secret)}`;
}

export function verifyBreakpointFork(token) {
  const [body, received] = String(token || "").split(".");
  const secret = forkSecret();
  if (!body || !received || !secret) throw new Error("Invalid breakpoint fork signature.");
  const expected = signature(body, secret);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new Error("Invalid breakpoint fork signature.");
  }
  const payload = decode(body);
  if (!payload?.runId || !cleanBreakpointTicker(payload?.ticker)) throw new Error("Invalid breakpoint fork payload.");
  return payload;
}

export async function appendPublicBreakpointRun({ ticker, status, payload, sourceSnapshot = {}, assumptions = {} } = {}) {
  const symbol = cleanBreakpointTicker(ticker || payload?.ticker);
  if (!symbol) throw new Error("Breakpoint run requires a valid ticker.");
  const generatedAt = payload?.generatedAt || new Date().toISOString();
  const modelVersion = payload?.version || null;
  const normalizedPayload = cloneJson(payload, {});

  if (!usingNeonStorage()) {
    return createEphemeralBreakpointRun({
      ticker: symbol,
      status: status || normalizedPayload.status || "needs_attention",
      payload: normalizedPayload,
      sourceSnapshot,
      assumptions,
    });
  }

  const sql = getNeonSql();
  await ensurePublicBreakpointRunsStorage(sql);
  const rows = await sql.query(
    `INSERT INTO bls_public_breakpoint_runs (
      ticker, status, model_version, generated_at, source_snapshot, assumptions, payload
    ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
    RETURNING id::text AS id, ticker, status, model_version, generated_at, source_snapshot, assumptions, payload, created_at`,
    [symbol, status || normalizedPayload.status || "needs_attention", modelVersion, generatedAt, JSON.stringify(sourceSnapshot), JSON.stringify(assumptions), JSON.stringify(normalizedPayload)],
  );
  return normalizeRun(rows[0], true);
}

export async function getPublicBreakpointRun(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  if (!usingNeonStorage()) return memoryRuns.get(key) || null;

  const sql = getNeonSql();
  const rows = await sql.query(
    `SELECT id::text AS id, ticker, status, model_version, generated_at, source_snapshot, assumptions, payload, created_at
     FROM bls_public_breakpoint_runs WHERE id = $1 LIMIT 1`,
    [key],
  );
  return normalizeRun(rows[0], true);
}
