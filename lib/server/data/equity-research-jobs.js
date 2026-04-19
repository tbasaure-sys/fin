import "server-only";

import { randomUUID } from "node:crypto";

import { getNeonSql, usingNeonStorage } from "./neon.js";
import { ensureWorkspaceRecord } from "./workspaces.js";

const memoryJobs = globalThis.__BLS_EQUITY_RESEARCH_JOBS__ || new Map();
globalThis.__BLS_EQUITY_RESEARCH_JOBS__ = memoryJobs;

function cleanTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 16);
}

function cloneJson(value) {
  if (value === undefined || value === null) return {};
  return JSON.parse(JSON.stringify(value));
}

function normalizeJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id || row.workspaceId || null,
    ticker: row.ticker,
    mode: row.mode || "quick",
    status: row.status || "queued",
    backendRunId: row.backend_run_id || row.backendRunId || null,
    startedAt: row.started_at || row.startedAt || null,
    completedAt: row.completed_at || row.completedAt || null,
    error: row.error || null,
    payload: row.payload || {},
    resultRunId: row.result_run_id || row.resultRunId || null,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

function timestampNow() {
  return new Date().toISOString();
}

function memoryJobMatches(job, workspaceId) {
  return job && String(job.workspaceId || "") === String(workspaceId || "");
}

export async function createEquityResearchJob(workspaceId, ticker, mode = "quick", fields = {}) {
  const symbol = cleanTicker(ticker);
  const reportMode = mode === "full" ? "full" : "quick";
  if (!symbol) return null;

  if (!usingNeonStorage()) {
    const now = timestampNow();
    const row = normalizeJob({
      id: randomUUID(),
      workspaceId,
      ticker: symbol,
      mode: reportMode,
      status: fields.status || "queued",
      backendRunId: fields.backendRunId || null,
      startedAt: fields.startedAt || null,
      completedAt: fields.completedAt || null,
      error: fields.error || null,
      payload: cloneJson(fields.payload),
      resultRunId: fields.resultRunId || null,
      createdAt: now,
      updatedAt: now,
    });
    memoryJobs.set(row.id, row);
    return row;
  }

  await ensureWorkspaceRecord({ workspaceId, visibility: "private" });
  const sql = getNeonSql();
  const rows = await sql.query(
    `INSERT INTO bls_equity_research_jobs (
      workspace_id,
      ticker,
      mode,
      status,
      backend_run_id,
      started_at,
      completed_at,
      error,
      payload,
      result_run_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
    RETURNING
      id::text AS id,
      workspace_id,
      ticker,
      mode,
      status,
      backend_run_id,
      started_at,
      completed_at,
      error,
      payload,
      result_run_id::text AS result_run_id,
      created_at,
      updated_at`,
    [
      workspaceId,
      symbol,
      reportMode,
      fields.status || "queued",
      fields.backendRunId || null,
      fields.startedAt || null,
      fields.completedAt || null,
      fields.error || null,
      JSON.stringify(cloneJson(fields.payload)),
      fields.resultRunId || null,
    ],
  );

  return normalizeJob(rows[0]);
}

export async function getEquityResearchJob(workspaceId, jobId) {
  const id = String(jobId || "").trim();
  if (!id) return null;

  if (!usingNeonStorage()) {
    const row = memoryJobs.get(id);
    return memoryJobMatches(row, workspaceId) ? row : null;
  }

  const sql = getNeonSql();
  const rows = await sql.query(
    `SELECT
      id::text AS id,
      workspace_id,
      ticker,
      mode,
      status,
      backend_run_id,
      started_at,
      completed_at,
      error,
      payload,
      result_run_id::text AS result_run_id,
      created_at,
      updated_at
    FROM bls_equity_research_jobs
    WHERE workspace_id = $1 AND id = $2
    LIMIT 1`,
    [workspaceId, id],
  );

  return normalizeJob(rows[0]);
}

export async function getEquityResearchJobByBackendRunId(workspaceId, backendRunId) {
  const id = String(backendRunId || "").trim();
  if (!id) return null;

  if (!usingNeonStorage()) {
    for (const row of memoryJobs.values()) {
      if (memoryJobMatches(row, workspaceId) && row.backendRunId === id) return row;
    }
    return null;
  }

  const sql = getNeonSql();
  const rows = await sql.query(
    `SELECT
      id::text AS id,
      workspace_id,
      ticker,
      mode,
      status,
      backend_run_id,
      started_at,
      completed_at,
      error,
      payload,
      result_run_id::text AS result_run_id,
      created_at,
      updated_at
    FROM bls_equity_research_jobs
    WHERE workspace_id = $1 AND backend_run_id = $2
    ORDER BY created_at DESC
    LIMIT 1`,
    [workspaceId, id],
  );

  return normalizeJob(rows[0]);
}

export async function updateEquityResearchJob(workspaceId, jobId, patch = {}) {
  const id = String(jobId || "").trim();
  if (!id) return null;

  if (!usingNeonStorage()) {
    const row = memoryJobs.get(id);
    if (!memoryJobMatches(row, workspaceId)) return null;
    const updated = normalizeJob({
      ...row,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.backendRunId !== undefined ? { backendRunId: patch.backendRunId } : {}),
      ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
      ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(patch.payload !== undefined ? { payload: cloneJson(patch.payload) } : {}),
      ...(patch.resultRunId !== undefined ? { resultRunId: patch.resultRunId } : {}),
      updatedAt: timestampNow(),
    });
    memoryJobs.set(id, updated);
    return updated;
  }

  const setters = [];
  const values = [];

  function setColumn(column, value, cast = "") {
    values.push(value);
    setters.push(`${column} = $${values.length}${cast}`);
  }

  if (patch.status !== undefined) setColumn("status", patch.status);
  if (patch.backendRunId !== undefined) setColumn("backend_run_id", patch.backendRunId || null);
  if (patch.startedAt !== undefined) setColumn("started_at", patch.startedAt || null);
  if (patch.completedAt !== undefined) setColumn("completed_at", patch.completedAt || null);
  if (patch.error !== undefined) setColumn("error", patch.error || null);
  if (patch.payload !== undefined) setColumn("payload", JSON.stringify(cloneJson(patch.payload)), "::jsonb");
  if (patch.resultRunId !== undefined) setColumn("result_run_id", patch.resultRunId || null);

  if (!setters.length) return getEquityResearchJob(workspaceId, id);

  values.push(workspaceId);
  const workspaceParam = values.length;
  values.push(id);
  const idParam = values.length;

  const sql = getNeonSql();
  const rows = await sql.query(
    `UPDATE bls_equity_research_jobs
     SET ${setters.join(", ")}, updated_at = NOW()
     WHERE workspace_id = $${workspaceParam} AND id = $${idParam}
     RETURNING
      id::text AS id,
      workspace_id,
      ticker,
      mode,
      status,
      backend_run_id,
      started_at,
      completed_at,
      error,
      payload,
      result_run_id::text AS result_run_id,
      created_at,
      updated_at`,
    values,
  );

  return normalizeJob(rows[0]);
}
