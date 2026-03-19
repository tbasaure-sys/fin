import { getNeonSql, usingNeonStorage } from "./data/neon.js";
import { ensureWorkspaceRecord } from "./data/workspaces.js";

const store = globalThis.__BLS_PRIME_STORE__ || {
  watchlists: new Map(),
  savedViews: new Map(),
  alerts: new Map(),
  commandHistory: new Map(),
};

globalThis.__BLS_PRIME_STORE__ = store;

function ensureWorkspaceEntry(map, workspaceId, fallback) {
  if (!map.has(workspaceId)) {
    map.set(workspaceId, structuredClone(fallback));
  }
  return map.get(workspaceId);
}

async function ensureNeonWorkspace(workspaceId) {
  return ensureWorkspaceRecord({
    workspaceId,
    name: "BLS Prime Workspace",
    visibility: "private",
  });
}

function mapWatchlistEntry(item) {
  return {
    symbol: String(item.symbol || "").toUpperCase(),
    name: item.name || item.symbol || "Unknown",
    conviction: item.conviction || "User-defined",
    lastSignal: item.lastSignal || "Watching",
    changePct: Number(item.changePct || 0),
  };
}

async function getNeonWatchlist(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const rows = await sql.query(
    `SELECT symbol, name, conviction, last_signal, change_pct
     FROM bls_watchlist_items
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 24`,
    [workspaceId],
  );

  return rows.map((row) => ({
    symbol: row.symbol,
    name: row.name || row.symbol || "Unknown",
    conviction: row.conviction || "User-defined",
    lastSignal: row.last_signal || "Watching",
    changePct: Number(row.change_pct || 0),
  }));
}

async function getNeonCommandHistory(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const rows = await sql.query(
    `SELECT id::text AS id, command, created_at
     FROM bls_command_history
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 12`,
    [workspaceId],
  );

  return rows.map((row) => ({
    id: row.id,
    command: row.command,
    createdAt: row.created_at,
  }));
}

export async function getWorkspaceWatchlist(workspaceId) {
  if (!usingNeonStorage()) {
    return ensureWorkspaceEntry(store.watchlists, workspaceId, []);
  }

  const watchlist = await getNeonWatchlist(workspaceId);
  return watchlist;
}

export async function addWorkspaceWatchlistItem(workspaceId, item) {
  const current = getWorkspaceWatchlist(workspaceId);
  const entry = mapWatchlistEntry(item);

  if (!entry.symbol) {
    return current;
  }

  if (!usingNeonStorage()) {
    const resolvedCurrent = await current;
    const next = resolvedCurrent.filter((row) => row.symbol !== entry.symbol);
    next.unshift(entry);
    store.watchlists.set(workspaceId, next.slice(0, 24));
    return store.watchlists.get(workspaceId);
  }

  const sql = await ensureNeonWorkspace(workspaceId);
  await sql.query(
    `INSERT INTO bls_watchlist_items (
      workspace_id,
      symbol,
      name,
      conviction,
      last_signal,
      change_pct
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (workspace_id, symbol)
    DO UPDATE SET
      name = EXCLUDED.name,
      conviction = EXCLUDED.conviction,
      last_signal = EXCLUDED.last_signal,
      change_pct = EXCLUDED.change_pct,
      updated_at = NOW()`,
    [
      workspaceId,
      entry.symbol,
      entry.name,
      entry.conviction,
      entry.lastSignal,
      entry.changePct,
    ],
  );

  return getNeonWatchlist(workspaceId);
}

export async function getWorkspaceAlerts(workspaceId) {
  return ensureWorkspaceEntry(store.alerts, workspaceId, []);
}

export async function appendWorkspaceAlerts(workspaceId, alerts) {
  const current = await getWorkspaceAlerts(workspaceId);
  const merged = [...alerts, ...current].reduce((acc, alert) => {
    if (!acc.some((item) => item.id === alert.id)) acc.push(alert);
    return acc;
  }, []);
  store.alerts.set(workspaceId, merged.slice(0, 20));
  return store.alerts.get(workspaceId);
}

export async function getWorkspaceSavedViews(workspaceId) {
  return ensureWorkspaceEntry(store.savedViews, workspaceId, []);
}

export async function pushCommandHistory(workspaceId, command) {
  const value = String(command || "").trim();

  if (!value) {
    return getWorkspaceCommandHistory(workspaceId);
  }

  if (!usingNeonStorage()) {
    const history = ensureWorkspaceEntry(store.commandHistory, workspaceId, []);
    history.unshift({
      id: `cmd-${Date.now()}`,
      command: value,
      createdAt: new Date().toISOString(),
    });
    store.commandHistory.set(workspaceId, history.slice(0, 12));
    return store.commandHistory.get(workspaceId);
  }

  const sql = await ensureNeonWorkspace(workspaceId);
  await sql.query(
    `INSERT INTO bls_command_history (workspace_id, command)
     VALUES ($1, $2)`,
    [workspaceId, value],
  );

  return getNeonCommandHistory(workspaceId);
}

export async function getWorkspaceCommandHistory(workspaceId) {
  if (!usingNeonStorage()) {
    return ensureWorkspaceEntry(store.commandHistory, workspaceId, []);
  }

  return getNeonCommandHistory(workspaceId);
}
