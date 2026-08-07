import "server-only";

import { getNeonSql, usingNeonStorage } from "./data/neon.js";

const CONTEXT_ASSETS = [
  "SPY", "QQQ", "IWM", "EFA", "EEM", "TLT", "HYG", "GLD", "USO", "UUP",
  "SPX", "NDX", "RUT", "VIX", "BTC/USD", "ETH/USD", "EUR/USD", "USD/JPY",
  "GBP/USD", "USD/CLP", "GOLD", "WTI",
];

const VALID_STATES = new Set(["trend_up", "trend_down", "range", "transition", "uncertain", null]);
const VALID_STATUSES = new Set(["ready", "insufficient_data", "stale", "blocked"]);

function truthyEnv(name) {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] || "").trim());
}

function allowlistedWorkspace(workspaceId) {
  const allowed = String(process.env.BLS_SIGNAL_BETA_WORKSPACE_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(String(workspaceId || ""));
}

export function isSignalIntelligenceEnabled(workspaceId) {
  return truthyEnv("BLS_SIGNAL_INTELLIGENCE_ENABLED") && allowlistedWorkspace(workspaceId);
}

function normalizeFamily(family) {
  const source = family && typeof family === "object" ? family : {};
  return {
    key: String(source.key || "unknown"),
    state: source.state == null ? "unavailable" : String(source.state),
    direction: Number.isFinite(Number(source.direction)) ? Number(source.direction) : 0,
    available: source.available === true,
    evidenceLevel: String(source.evidenceLevel || "low"),
    votes: Array.isArray(source.votes) ? source.votes.map((vote) => ({
      primitive: String(vote?.primitive || "unknown"),
      direction: Number.isFinite(Number(vote?.direction)) ? Number(vote.direction) : 0,
    })) : [],
    evidence: sanitizeEvidence(source.evidence),
  };
}

function sanitizeEvidence(value, depth = 0) {
  if (depth > 3 || value == null) return value == null ? null : undefined;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.slice(0, 16).map((item) => sanitizeEvidence(item, depth + 1)).filter((item) => item !== undefined);
  if (typeof value !== "object") return undefined;
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 32)) {
    if (/pine|script|formula|sourcecode|filename|filepath|localpath|rawsource/i.test(key)) continue;
    const safe = sanitizeEvidence(item, depth + 1);
    if (safe !== undefined) result[key] = safe;
  }
  return result;
}

function normalizeSubject(subject) {
  const source = subject && typeof subject === "object" ? subject : {};
  return {
    type: String(source.type || "asset"),
    key: String(source.key || ""),
    assetClass: String(source.assetClass || ""),
  };
}

function normalizeDataQuality(value) {
  const source = value && typeof value === "object" ? value : {};
  const allowed = ["coveragePct", "barCount", "stale", "rightsApproved", "provider", "lastBarDate", "volumeAvailable", "qualificationReady", "reason", "errorType", "warnings"];
  return Object.fromEntries(allowed.filter((key) => source[key] !== undefined).map((key) => [key, key === "warnings" ? (Array.isArray(source[key]) ? source[key].map((item) => String(item)).slice(0, 12) : []) : source[key]]));
}

function normalizeReceipt(receipt) {
  const source = receipt && typeof receipt === "object" ? receipt : {};
  const allowed = ["engineVersion", "configVersion", "configFingerprint", "inputFingerprint", "provider", "providerEndpoint", "fetchedAt", "source", "inputBarCount"];
  return Object.fromEntries(allowed.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

export function normalizeMarketStateRun(row) {
  const source = row && typeof row === "object" ? row : {};
  const payload = source.payload && typeof source.payload === "object" ? source.payload : source;
  const status = VALID_STATUSES.has(payload.status) ? payload.status : "blocked";
  const state = VALID_STATES.has(payload.state) ? payload.state : null;
  return {
    runId: String(source.id || payload.runId || ""),
    schemaVersion: String(payload.schemaVersion || "market-state.v1"),
    runType: String(source.run_type || source.runType || payload.runType || "market_state_eod"),
    subject: normalizeSubject(payload.subject),
    asOfDate: String(source.as_of_date || source.asOfDate || payload.asOfDate || ""),
    availableAt: source.available_at || source.availableAt || payload.availableAt || null,
    status,
    state,
    technicalReady: payload.technicalReady === true,
    evidencePromoted: payload.evidencePromoted === true,
    families: Array.isArray(payload.families) ? payload.families.map(normalizeFamily) : [],
    disagreements: Array.isArray(payload.disagreements) ? payload.disagreements.map((item) => ({
      left: String(item?.left || ""),
      right: String(item?.right || ""),
      kind: String(item?.kind || "direction_conflict"),
    })) : [],
    dataQuality: normalizeDataQuality(payload.dataQuality),
    receipt: normalizeReceipt(payload.receipt),
  };
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalTicker(value) {
  return String(value || "").trim().toUpperCase();
}

export function buildWorkspaceSignalOverview({ runs = [], holdings = [], watchlist = [], openDecisions = [] } = {}) {
  const normalizedRuns = runs.map(normalizeMarketStateRun).filter((run) => run.subject?.key);
  const latestByAsset = new Map();
  for (const run of normalizedRuns.sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))) {
    const key = canonicalTicker(run.subject.key);
    if (!latestByAsset.has(key)) latestByAsset.set(key, run);
  }
  const requested = new Set([
    ...holdings.map((holding) => canonicalTicker(holding.ticker)),
    ...watchlist.map((item) => canonicalTicker(item.symbol)),
    ...openDecisions.map((decision) => canonicalTicker(decision.ticker)),
    ...CONTEXT_ASSETS.map((asset) => canonicalTicker(asset)),
  ].filter(Boolean));
  const assets = [...latestByAsset.values()].filter((run) => requested.size === 0 || requested.has(canonicalTicker(run.subject.key)));
  const breadth = {};
  const disagreements = [];
  for (const run of assets) {
    if (run.state) breadth[run.state] = (breadth[run.state] || 0) + 1;
    disagreements.push(...run.disagreements.map((item) => ({ ...item, assetKey: run.subject.key, asOfDate: run.asOfDate })));
  }
  const coveredAssets = assets.filter((run) => run.status === "ready" && run.state);
  const exposure = {};
  const valueByState = {};
  let totalValue = 0;
  for (const holding of holdings) {
    const ticker = canonicalTicker(holding.ticker);
    const value = finiteNumber(holding.marketValue ?? holding.market_value ?? holding.value);
    const state = latestByAsset.get(ticker)?.state;
    if (value == null || value < 0 || !state) continue;
    totalValue += value;
    valueByState[state] = (valueByState[state] || 0) + value;
  }
  if (totalValue > 0) {
    for (const [state, value] of Object.entries(valueByState)) exposure[state] = Number((value / totalValue).toFixed(6));
  }
  const latestAsOf = assets.map((run) => run.asOfDate).sort().at(-1) || null;
  const status = coveredAssets.length
    ? "ready"
    : assets.some((run) => run.status === "stale")
      ? "stale"
      : assets.some((run) => run.status === "insufficient_data")
        ? "insufficient_data"
        : "blocked";
  return {
    schemaVersion: "signal-intelligence.overview.v1",
    status,
    latestAsOf,
    coverage: { totalAssets: assets.length, coveredAssets: coveredAssets.length },
    breadth,
    exposure,
    disagreements,
    assets,
  };
}

export function confirmedSignalStateChange(runs = []) {
  const ordered = runs.map(normalizeMarketStateRun).sort((left, right) => right.asOfDate.localeCompare(left.asOfDate));
  const [current, previous, older] = ordered;
  const confirmed = Boolean(
    current && previous && older &&
    current.status === "ready" && previous.status === "ready" &&
    current.state && current.state === previous.state &&
    current.state !== "uncertain" &&
    older.state !== current.state,
  );
  return {
    confirmed,
    assetKey: current?.subject?.key || null,
    state: confirmed ? current.state : null,
    asOfDate: confirmed ? current.asOfDate : null,
  };
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(normalizeMarketStateRun);
}

async function loadWorkspaceInputs(sql, workspaceId) {
  const rows = await sql.query(
    `SELECT ticker,
            COALESCE(market_value_usd, quantity * COALESCE(current_price_usd, avg_cost_usd)) AS "marketValue"
       FROM bls_portfolio_positions
      WHERE workspace_id = $1`,
    [workspaceId],
  );
  const watchlistRows = await sql.query(
    `SELECT symbol FROM bls_watchlist_items WHERE workspace_id = $1`,
    [workspaceId],
  );
  const decisionRows = await sql.query(
    `SELECT ticker FROM bls_escrow_decisions
      WHERE workspace_id = $1 AND status NOT IN ('executed', 'expired')`,
    [workspaceId],
  );
  const researchRows = await sql.query(
    `SELECT DISTINCT ticker FROM bls_equity_research_runs WHERE workspace_id = $1 ORDER BY ticker`,
    [workspaceId],
  );
  const holdings = rows.filter((row) => row.marketValue != null);
  const watchlist = watchlistRows.map((row) => ({ symbol: row.symbol }));
  const openDecisions = decisionRows.map((row) => ({ ticker: row.ticker }));
  const symbols = [...new Set([
    ...rows.map((row) => canonicalTicker(row.ticker)),
    ...watchlistRows.map((row) => canonicalTicker(row.symbol)),
    ...decisionRows.map((row) => canonicalTicker(row.ticker)),
    ...researchRows.map((row) => canonicalTicker(row.ticker)),
    ...CONTEXT_ASSETS,
  ].filter(Boolean))];
  return { holdings, watchlist, openDecisions, symbols };
}

export async function getSignalIntelligenceOverview(workspaceId) {
  if (!isSignalIntelligenceEnabled(workspaceId)) {
    return { enabled: false, status: "disabled", assets: [], coverage: { totalAssets: 0, coveredAssets: 0 } };
  }
  if (!usingNeonStorage()) {
    return { enabled: true, status: "blocked", reason: "neon_required", assets: [], coverage: { totalAssets: 0, coveredAssets: 0 } };
  }
  const sql = getNeonSql();
  const inputs = await loadWorkspaceInputs(sql, workspaceId);
  const rows = await sql.query(
    `SELECT DISTINCT ON (r.subject_key)
       r.id::text AS id, r.run_type, r.subject_type, r.subject_key,
       r.as_of_date, r.available_at, r.status, r.payload, r.receipt
     FROM bls_analysis_runs r
     WHERE r.workspace_id IS NULL
       AND r.run_type = 'market_state_eod'
       AND r.subject_type = 'asset'
       AND r.subject_key = ANY($1::text[])
     ORDER BY r.subject_key, r.as_of_date DESC, r.created_at DESC`,
    [inputs.symbols],
  );
  return {
    enabled: true,
    ...buildWorkspaceSignalOverview({
      runs: normalizeRows(rows),
      holdings: inputs.holdings,
      watchlist: inputs.watchlist,
      openDecisions: inputs.openDecisions,
    }),
  };
}

export async function getSignalAssetDetail(workspaceId, assetKey, history = 252) {
  if (!isSignalIntelligenceEnabled(workspaceId)) return { enabled: false, status: "disabled", asset: null, history: [] };
  if (!usingNeonStorage()) return { enabled: true, status: "blocked", reason: "neon_required", asset: null, history: [] };
  const sql = getNeonSql();
  const inputs = await loadWorkspaceInputs(sql, workspaceId);
  const canonical = canonicalTicker(assetKey);
  if (!inputs.symbols.includes(canonical)) return { enabled: true, status: "not_found", asset: null, history: [] };
  const rows = await sql.query(
    `SELECT id::text AS id, run_type, subject_type, subject_key, as_of_date, available_at, status, payload, receipt
     FROM bls_analysis_runs
     WHERE workspace_id IS NULL AND run_type = 'market_state_eod'
       AND subject_type = 'asset' AND subject_key = $1
     ORDER BY as_of_date DESC, created_at DESC LIMIT $2`,
    [canonical, Math.min(Math.max(Number(history) || 252, 1), 504)],
  );
  const normalized = normalizeRows(rows);
  return { enabled: true, status: normalized.length ? "ready" : "insufficient_data", asset: normalized[0] || null, history: normalized };
}

export async function getSignalAnalysisRun(workspaceId, runId) {
  if (!isSignalIntelligenceEnabled(workspaceId)) return { enabled: false, status: "disabled", run: null };
  if (!usingNeonStorage()) return { enabled: true, status: "blocked", reason: "neon_required", run: null };
  const sql = getNeonSql();
  const rows = await sql.query(
    `SELECT id::text AS id, workspace_id, run_type, subject_type, subject_key,
            as_of_date, available_at, status, payload, receipt
     FROM bls_analysis_runs
     WHERE id = $1 AND (workspace_id = $2 OR workspace_id IS NULL)
     LIMIT 1`,
    [runId, workspaceId],
  );
  const row = rows[0];
  if (!row) return { enabled: true, status: "not_found", run: null };
  if (row.workspace_id == null) {
    const inputs = await loadWorkspaceInputs(sql, workspaceId);
    if (!inputs.symbols.includes(canonicalTicker(row.subject_key))) return { enabled: true, status: "not_found", run: null };
  }
  const links = await sql.query(
    `SELECT l.decision_event_id::text AS "decisionEventId", l.role, l.created_at AS "createdAt"
       FROM bls_decision_evidence_links l
       JOIN bls_decision_events d ON d.id = l.decision_event_id
      WHERE l.analysis_run_id = $1 AND d.workspace_id = $2
      ORDER BY l.created_at DESC`,
    [runId, workspaceId],
  );
  return {
    enabled: true,
    status: "ready",
    run: normalizeMarketStateRun(row),
    evidenceLinks: links.map((link) => ({
      decisionEventId: String(link.decisionEventId),
      role: String(link.role || "market_state"),
      createdAt: link.createdAt || null,
    })),
  };
}

export async function linkSignalRunToDecision({ workspaceId, decisionEventId, analysisRunId, role = "market_state" }) {
  if (!usingNeonStorage()) return { linked: false, reason: "neon_required" };
  if (!workspaceId || !/^[0-9a-f-]{36}$/i.test(String(analysisRunId || ""))) {
    return { linked: false, reason: "invalid_run_id" };
  }
  const sql = getNeonSql();
  try {
    const rows = await sql.query(
      `WITH allowed_assets(asset_key) AS (
             SELECT ticker FROM bls_portfolio_positions WHERE workspace_id = $1
             UNION SELECT symbol FROM bls_watchlist_items WHERE workspace_id = $1
             UNION SELECT ticker FROM bls_escrow_decisions WHERE workspace_id = $1 AND status NOT IN ('executed', 'expired')
             UNION SELECT ticker FROM bls_equity_research_runs WHERE workspace_id = $1
             UNION SELECT UNNEST($5::text[])
       )
       INSERT INTO bls_decision_evidence_links (decision_event_id, analysis_run_id, role)
       SELECT d.id, r.id, $3
         FROM bls_decision_events d
         JOIN bls_analysis_runs r ON r.id = $2::uuid
        WHERE d.workspace_id = $1
          AND d.event_key = $4
          AND (r.workspace_id = $1 OR (r.workspace_id IS NULL AND r.subject_key IN (SELECT asset_key FROM allowed_assets)))
       ON CONFLICT (decision_event_id, analysis_run_id, role) DO NOTHING
       RETURNING decision_event_id::text AS "decisionEventId"`,
      [workspaceId, analysisRunId, role, decisionEventId, CONTEXT_ASSETS],
    );
    return { linked: rows.length > 0, decisionEventId, analysisRunId, role };
  } catch {
    return { linked: false, reason: "evidence_link_unavailable" };
  }
}
