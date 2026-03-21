import { getNeonSql, usingNeonStorage } from "./data/neon.js";
import { ensureWorkspaceRecord } from "./data/workspaces.js";

const store = globalThis.__BLS_PRIME_STORE__ || {
  watchlists: new Map(),
  alerts: new Map(),
  savedViews: new Map(),
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

function normalizeAlertEntry(item, index = 0) {
  const id = String(item?.id || `alert-${index}`).trim();
  return {
    id,
    severity: String(item?.severity || "medium").trim() || "medium",
    title: String(item?.title || "Workspace alert").trim() || "Workspace alert",
    body: String(item?.body || "").trim(),
    action: String(item?.action || "").trim(),
    source: String(item?.source || "workspace").trim() || "workspace",
  };
}

const DEFAULT_SAVED_VIEWS = [
  {
    id: "today-plan",
    label: "Today plan",
    description: "Open the recommendation and why it matters.",
    moduleId: "actions",
    focused: false,
    alerts: true,
    densityMode: "compact",
  },
  {
    id: "portfolio-check",
    label: "Portfolio check",
    description: "Open holdings and keep alerts visible.",
    moduleId: "portfolio",
    focused: true,
    alerts: true,
    densityMode: "compact",
  },
  {
    id: "idea-review",
    label: "Idea review",
    description: "Jump to stock ideas without extra clutter.",
    moduleId: "scanner",
    focused: true,
    alerts: false,
    densityMode: "compact",
  },
];

function normalizeSavedViewEntry(item, index = 0) {
  const id = String(item?.id || item?.viewKey || `view-${index}`).trim();
  return {
    id,
    label: String(item?.label || item?.name || `View ${index + 1}`).trim() || `View ${index + 1}`,
    description: String(item?.description || "").trim(),
    moduleId: String(item?.moduleId || item?.module_id || "actions").trim() || "actions",
    focused: Boolean(item?.focused),
    alerts: Boolean(item?.alerts),
    densityMode: String(item?.densityMode || item?.density_mode || "compact").trim() || "compact",
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

async function getNeonAlerts(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const rows = await sql.query(
    `SELECT alert_id, severity, title, body, action, source, updated_at
     FROM bls_workspace_alerts
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT 20`,
    [workspaceId],
  );

  return rows.map((row) => normalizeAlertEntry({
    id: row.alert_id,
    severity: row.severity,
    title: row.title,
    body: row.body,
    action: row.action,
    source: row.source,
  }));
}

async function getNeonSavedViews(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const rows = await sql.query(
    `SELECT view_key, payload, updated_at
     FROM bls_saved_views
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT 12`,
    [workspaceId],
  );

  return rows.map((row, index) => normalizeSavedViewEntry({
    id: row.view_key,
    ...(row.payload || {}),
  }, index));
}

async function ensureDefaultSavedViews(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const existing = await sql.query(
    `SELECT view_key FROM bls_saved_views WHERE workspace_id = $1`,
    [workspaceId],
  );
  const existingKeys = new Set(existing.map((row) => row.view_key));
  const missing = DEFAULT_SAVED_VIEWS.filter((view) => !existingKeys.has(view.id));

  if (!missing.length) return;

  await sql.transaction(
    missing.map((view) => sql.query(
      `INSERT INTO bls_saved_views (workspace_id, view_key, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (workspace_id, view_key)
       DO NOTHING`,
      [workspaceId, view.id, JSON.stringify(view)],
    )),
  );
}

export async function getWorkspaceWatchlist(workspaceId) {
  if (!usingNeonStorage()) {
    return ensureWorkspaceEntry(store.watchlists, workspaceId, []);
  }

  try {
    return await getNeonWatchlist(workspaceId);
  } catch {
    return ensureWorkspaceEntry(store.watchlists, workspaceId, []);
  }
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

  try {
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

    return await getNeonWatchlist(workspaceId);
  } catch {
    const resolvedCurrent = await current;
    const next = resolvedCurrent.filter((row) => row.symbol !== entry.symbol);
    next.unshift(entry);
    store.watchlists.set(workspaceId, next.slice(0, 24));
    return store.watchlists.get(workspaceId);
  }
}

export async function getWorkspaceAlerts(workspaceId) {
  if (usingNeonStorage()) {
    try {
      return await getNeonAlerts(workspaceId);
    } catch {
      return ensureWorkspaceEntry(store.alerts, workspaceId, []);
    }
  }
  return ensureWorkspaceEntry(store.alerts, workspaceId, []);
}

export async function appendWorkspaceAlerts(workspaceId, alerts) {
  const normalized = (Array.isArray(alerts) ? alerts : [])
    .map((alert, index) => normalizeAlertEntry(alert, index))
    .filter((alert) => alert.id)
    .reduce((acc, alert) => {
      if (!acc.some((item) => item.id === alert.id)) acc.push(alert);
      return acc;
    }, [])
    .slice(0, 20);

  if (!usingNeonStorage()) {
    store.alerts.set(workspaceId, normalized);
    return store.alerts.get(workspaceId);
  }

  try {
    const sql = await ensureNeonWorkspace(workspaceId);
    const statements = [sql.query(`DELETE FROM bls_workspace_alerts WHERE workspace_id = $1`, [workspaceId])];
    for (const alert of normalized) {
      statements.push(sql.query(
        `INSERT INTO bls_workspace_alerts (
          workspace_id,
          alert_id,
          severity,
          title,
          body,
          action,
          source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          workspaceId,
          alert.id,
          alert.severity,
          alert.title,
          alert.body,
          alert.action,
          alert.source,
        ],
      ));
    }

    await sql.transaction(statements);
    return await getNeonAlerts(workspaceId);
  } catch {
    store.alerts.set(workspaceId, normalized);
    return store.alerts.get(workspaceId);
  }
}

export async function getWorkspaceSavedViews(workspaceId) {
  if (!usingNeonStorage()) {
    return ensureWorkspaceEntry(store.savedViews, workspaceId, structuredClone(DEFAULT_SAVED_VIEWS));
  }

  try {
    await ensureDefaultSavedViews(workspaceId);
    const views = await getNeonSavedViews(workspaceId);
    if (!views.length) {
      return structuredClone(DEFAULT_SAVED_VIEWS);
    }
    return views;
  } catch {
    return ensureWorkspaceEntry(store.savedViews, workspaceId, structuredClone(DEFAULT_SAVED_VIEWS));
  }
}

export async function saveWorkspaceSavedView(workspaceId, view) {
  const entry = normalizeSavedViewEntry(view);
  if (!entry.id) {
    return getWorkspaceSavedViews(workspaceId);
  }

  if (!usingNeonStorage()) {
    const current = ensureWorkspaceEntry(store.savedViews, workspaceId, structuredClone(DEFAULT_SAVED_VIEWS));
    const next = current.filter((item) => item.id !== entry.id);
    next.unshift(entry);
    store.savedViews.set(workspaceId, next.slice(0, 12));
    return store.savedViews.get(workspaceId);
  }

  try {
    const sql = await ensureNeonWorkspace(workspaceId);
    await sql.query(
      `INSERT INTO bls_saved_views (workspace_id, view_key, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (workspace_id, view_key)
       DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [workspaceId, entry.id, JSON.stringify(entry)],
    );
    return await getNeonSavedViews(workspaceId);
  } catch {
    const current = ensureWorkspaceEntry(store.savedViews, workspaceId, structuredClone(DEFAULT_SAVED_VIEWS));
    const next = current.filter((item) => item.id !== entry.id);
    next.unshift(entry);
    store.savedViews.set(workspaceId, next.slice(0, 12));
    return store.savedViews.get(workspaceId);
  }
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

  try {
    const sql = await ensureNeonWorkspace(workspaceId);
    await sql.query(
      `INSERT INTO bls_command_history (workspace_id, command)
       VALUES ($1, $2)`,
      [workspaceId, value],
    );

    return await getNeonCommandHistory(workspaceId);
  } catch {
    const history = ensureWorkspaceEntry(store.commandHistory, workspaceId, []);
    history.unshift({
      id: `cmd-${Date.now()}`,
      command: value,
      createdAt: new Date().toISOString(),
    });
    store.commandHistory.set(workspaceId, history.slice(0, 12));
    return store.commandHistory.get(workspaceId);
  }
}

export async function getWorkspaceCommandHistory(workspaceId) {
  if (!usingNeonStorage()) {
    return ensureWorkspaceEntry(store.commandHistory, workspaceId, []);
  }

  try {
    return await getNeonCommandHistory(workspaceId);
  } catch {
    return ensureWorkspaceEntry(store.commandHistory, workspaceId, []);
  }
}
