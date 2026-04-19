import "server-only";

import { getNeonSql, usingNeonStorage } from "./neon.js";
import { ensureWorkspaceRecord } from "./workspaces.js";

const memoryRuns = globalThis.__BLS_EQUITY_RESEARCH_RUNS__ || new Map();
globalThis.__BLS_EQUITY_RESEARCH_RUNS__ = memoryRuns;

function cleanTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 16);
}

function runKey(workspaceId, ticker) {
  return `${String(workspaceId || "default")}::${cleanTicker(ticker)}`;
}

function cloneJson(value) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

function stripDownloads(bundle) {
  if (!bundle || typeof bundle !== "object") return {};
  const { downloads: _downloads, ...rest } = bundle;
  return cloneJson(rest) || {};
}

function normalizeRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id || row.workspaceId || null,
    ticker: row.ticker,
    mode: row.mode,
    status: row.status,
    generatedAt: row.generated_at || row.generatedAt || null,
    providerStatus: row.provider_status || row.providerStatus || null,
    reportMarkdown: row.report_markdown || row.reportMarkdown || "",
    sources: row.sources || {},
    audit: row.audit || {},
    assumptions: row.assumptions || {},
    payload: row.payload || {},
    createdAt: row.created_at || row.createdAt || null,
  };
}

function getMemoryRuns(workspaceId, ticker) {
  return memoryRuns.get(runKey(workspaceId, ticker)) || [];
}

export async function getLatestEquityResearchRun(workspaceId, ticker) {
  const symbol = cleanTicker(ticker);
  if (!symbol) return null;

  if (!usingNeonStorage()) {
    return getMemoryRuns(workspaceId, symbol)[0] || null;
  }

  const sql = getNeonSql();
  const rows = await sql.query(
    `SELECT
      id::text AS id,
      workspace_id,
      ticker,
      mode,
      status,
      generated_at,
      provider_status,
      report_markdown,
      sources,
      audit,
      assumptions,
      payload,
      created_at
     FROM bls_equity_research_runs
     WHERE workspace_id = $1 AND ticker = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId, symbol],
  );

  return normalizeRun(rows[0]);
}

export async function countEquityResearchRuns(workspaceId, ticker) {
  const symbol = cleanTicker(ticker);
  if (!symbol) return 0;

  if (!usingNeonStorage()) {
    return getMemoryRuns(workspaceId, symbol).length;
  }

  const sql = getNeonSql();
  const rows = await sql.query(
    `SELECT COUNT(*)::int AS count
     FROM bls_equity_research_runs
     WHERE workspace_id = $1 AND ticker = $2`,
    [workspaceId, symbol],
  );

  return Number(rows[0]?.count || 0);
}

export async function listEquityResearchRuns(workspaceId, ticker, limit = 5) {
  const symbol = cleanTicker(ticker);
  if (!symbol) return [];
  const boundedLimit = Math.max(1, Math.min(20, Number(limit) || 5));

  if (!usingNeonStorage()) {
    return getMemoryRuns(workspaceId, symbol).slice(0, boundedLimit);
  }

  const sql = getNeonSql();
  const rows = await sql.query(
    `SELECT
      id::text AS id,
      workspace_id,
      ticker,
      mode,
      status,
      generated_at,
      provider_status,
      report_markdown,
      sources,
      audit,
      assumptions,
      payload,
      created_at
     FROM bls_equity_research_runs
     WHERE workspace_id = $1 AND ticker = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [workspaceId, symbol, boundedLimit],
  );

  return rows.map(normalizeRun);
}

export async function appendEquityResearchRun(workspaceId, ticker, mode, bundle) {
  const symbol = cleanTicker(ticker);
  if (!symbol) return null;

  const payload = stripDownloads(bundle);
  const audit = payload.audit || {};
  const status = String(audit.status || (payload.valuation?.available ? "ready" : "needs_attention"));
  const sourceRecords = Array.isArray(payload.sources?.records) ? payload.sources.records : [];
  const providerStatus = sourceRecords.some((source) => source?.status === "error") ? "degraded" : "ready";
  const generatedAt = payload.generated_at || new Date().toISOString();

  if (!usingNeonStorage()) {
    const key = runKey(workspaceId, symbol);
    const current = memoryRuns.get(key) || [];
    const row = normalizeRun({
      id: `memory-${Date.now()}`,
      workspaceId,
      ticker: symbol,
      mode,
      status,
      generatedAt,
      providerStatus,
      reportMarkdown: payload.report_markdown || "",
      sources: payload.sources || {},
      audit,
      assumptions: payload.assumptions || {},
      payload,
      createdAt: new Date().toISOString(),
    });
    memoryRuns.set(key, [row, ...current].slice(0, 20));
    return row;
  }

  await ensureWorkspaceRecord({ workspaceId, visibility: "private" });
  const sql = getNeonSql();
  const rows = await sql.query(
    `INSERT INTO bls_equity_research_runs (
      workspace_id,
      ticker,
      mode,
      status,
      generated_at,
      provider_status,
      report_markdown,
      sources,
      audit,
      assumptions,
      payload
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb)
    RETURNING
      id::text AS id,
      workspace_id,
      ticker,
      mode,
      status,
      generated_at,
      provider_status,
      report_markdown,
      sources,
      audit,
      assumptions,
      payload,
      created_at`,
    [
      workspaceId,
      symbol,
      mode,
      status,
      generatedAt,
      providerStatus,
      payload.report_markdown || "",
      JSON.stringify(payload.sources || {}),
      JSON.stringify(audit),
      JSON.stringify(payload.assumptions || {}),
      JSON.stringify(payload),
    ],
  );

  return normalizeRun(rows[0]);
}
