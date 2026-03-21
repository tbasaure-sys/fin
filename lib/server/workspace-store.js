import { getNeonSql, usingNeonStorage } from "./data/neon.js";
import { ensureWorkspaceRecord } from "./data/workspaces.js";

const store = globalThis.__BLS_PRIME_STORE__ || {
  watchlists: new Map(),
  alerts: new Map(),
  savedViews: new Map(),
  commandHistory: new Map(),
  escrowDecisions: new Map(),
  decisionEvents: new Map(),
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

function clamp01(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeEscrowEntry(item, index = 0) {
  const id = String(item?.id || item?.escrow_key || item?.escrowKey || `escrow-${index}`).trim();
  return {
    id,
    actionId: String(item?.actionId || item?.action_id || "").trim() || null,
    title: String(item?.title || "Staged decision").trim() || "Staged decision",
    summary: String(item?.summary || "").trim(),
    slot: String(item?.slot || "Also valid").trim() || "Also valid",
    ticker: String(item?.ticker || "").trim() || null,
    tone: String(item?.tone || "neutral").trim() || "neutral",
    funding: String(item?.funding || "No change").trim() || "No change",
    sizeLabel: String(item?.sizeLabel || item?.size_label || "Staged").trim() || "Staged",
    sizeValue: Number.isFinite(Number(item?.sizeValue ?? item?.size_value)) ? Number(item?.sizeValue ?? item?.size_value) : null,
    status: String(item?.status || "staged").trim() || "staged",
    autoMature: Boolean(item?.autoMature ?? item?.auto_mature),
    readiness: clamp01(item?.readiness, 0),
    maturityConditions: Array.isArray(item?.maturityConditions ?? item?.maturity_conditions)
      ? (item?.maturityConditions ?? item?.maturity_conditions).map((value) => String(value || "").trim()).filter(Boolean)
      : [],
    invalidationConditions: Array.isArray(item?.invalidationConditions ?? item?.invalidation_conditions)
      ? (item?.invalidationConditions ?? item?.invalidation_conditions).map((value) => String(value || "").trim()).filter(Boolean)
      : [],
    expiresAt: item?.expiresAt || item?.expires_at || null,
    executedAt: item?.executedAt || item?.executed_at || null,
    sourcePayload: item?.sourcePayload || item?.source_payload || {},
    createdAt: item?.createdAt || item?.created_at || null,
    updatedAt: item?.updatedAt || item?.updated_at || null,
  };
}

function normalizeDecisionEventEntry(item, index = 0) {
  const id = String(item?.id || item?.event_key || item?.eventKey || `decision-${index}`).trim();
  return {
    id,
    actionId: String(item?.actionId || item?.action_id || "").trim() || null,
    escrowId: String(item?.escrowId || item?.escrow_id || item?.escrow_key || "").trim() || null,
    title: String(item?.title || "Decision event").trim() || "Decision event",
    userResponse: String(item?.userResponse || item?.user_response || "noted").trim() || "noted",
    sizeOverride: Number.isFinite(Number(item?.sizeOverride ?? item?.size_override)) ? Number(item?.sizeOverride ?? item?.size_override) : null,
    note: String(item?.note || "").trim(),
    stateSnapshot: item?.stateSnapshot || item?.state_snapshot || {},
    counterfactual: item?.counterfactual || {},
    occurredAt: item?.occurredAt || item?.occurred_at || new Date().toISOString(),
    updatedAt: item?.updatedAt || item?.updated_at || null,
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

async function getNeonEscrowDecisions(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const rows = await sql.query(
    `SELECT
      escrow_key,
      action_id,
      title,
      summary,
      slot,
      ticker,
      tone,
      funding,
      size_label,
      size_value,
      status,
      auto_mature,
      readiness,
      maturity_conditions,
      invalidation_conditions,
      source_payload,
      expires_at,
      executed_at,
      created_at,
      updated_at
     FROM bls_escrow_decisions
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT 24`,
    [workspaceId],
  );

  return rows.map((row, index) => normalizeEscrowEntry({
    id: row.escrow_key,
    action_id: row.action_id,
    title: row.title,
    summary: row.summary,
    slot: row.slot,
    ticker: row.ticker,
    tone: row.tone,
    funding: row.funding,
    size_label: row.size_label,
    size_value: row.size_value,
    status: row.status,
    auto_mature: row.auto_mature,
    readiness: row.readiness,
    maturity_conditions: row.maturity_conditions,
    invalidation_conditions: row.invalidation_conditions,
    source_payload: row.source_payload,
    expires_at: row.expires_at,
    executed_at: row.executed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }, index));
}

async function getNeonDecisionEvents(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const rows = await sql.query(
    `SELECT
      event_key,
      action_id,
      escrow_key,
      title,
      user_response,
      size_override,
      note,
      state_snapshot,
      counterfactual,
      occurred_at,
      updated_at
     FROM bls_decision_events
     WHERE workspace_id = $1
     ORDER BY occurred_at DESC
     LIMIT 24`,
    [workspaceId],
  );

  return rows.map((row, index) => normalizeDecisionEventEntry({
    id: row.event_key,
    action_id: row.action_id,
    escrow_key: row.escrow_key,
    title: row.title,
    user_response: row.user_response,
    size_override: row.size_override,
    note: row.note,
    state_snapshot: row.state_snapshot,
    counterfactual: row.counterfactual,
    occurred_at: row.occurred_at,
    updated_at: row.updated_at,
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

export async function getWorkspaceEscrowDecisions(workspaceId) {
  if (!usingNeonStorage()) {
    return ensureWorkspaceEntry(store.escrowDecisions, workspaceId, []);
  }

  try {
    return await getNeonEscrowDecisions(workspaceId);
  } catch {
    return ensureWorkspaceEntry(store.escrowDecisions, workspaceId, []);
  }
}

export async function upsertWorkspaceEscrowDecision(workspaceId, escrow) {
  const entry = normalizeEscrowEntry(escrow);
  if (!entry.id) {
    return getWorkspaceEscrowDecisions(workspaceId);
  }

  if (!usingNeonStorage()) {
    const current = ensureWorkspaceEntry(store.escrowDecisions, workspaceId, []);
    const next = current.filter((item) => item.id !== entry.id);
    next.unshift({
      ...entry,
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    store.escrowDecisions.set(workspaceId, next.slice(0, 24));
    return store.escrowDecisions.get(workspaceId);
  }

  try {
    const sql = await ensureNeonWorkspace(workspaceId);
    await sql.query(
      `INSERT INTO bls_escrow_decisions (
        workspace_id,
        escrow_key,
        action_id,
        title,
        summary,
        slot,
        ticker,
        tone,
        funding,
        size_label,
        size_value,
        status,
        auto_mature,
        readiness,
        maturity_conditions,
        invalidation_conditions,
        source_payload,
        expires_at,
        executed_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb, $18, $19
      )
      ON CONFLICT (workspace_id, escrow_key)
      DO UPDATE SET
        action_id = EXCLUDED.action_id,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        slot = EXCLUDED.slot,
        ticker = EXCLUDED.ticker,
        tone = EXCLUDED.tone,
        funding = EXCLUDED.funding,
        size_label = EXCLUDED.size_label,
        size_value = EXCLUDED.size_value,
        status = EXCLUDED.status,
        auto_mature = EXCLUDED.auto_mature,
        readiness = EXCLUDED.readiness,
        maturity_conditions = EXCLUDED.maturity_conditions,
        invalidation_conditions = EXCLUDED.invalidation_conditions,
        source_payload = EXCLUDED.source_payload,
        expires_at = EXCLUDED.expires_at,
        executed_at = EXCLUDED.executed_at,
        updated_at = NOW()`,
      [
        workspaceId,
        entry.id,
        entry.actionId,
        entry.title,
        entry.summary,
        entry.slot,
        entry.ticker,
        entry.tone,
        entry.funding,
        entry.sizeLabel,
        entry.sizeValue,
        entry.status,
        entry.autoMature,
        entry.readiness,
        JSON.stringify(entry.maturityConditions || []),
        JSON.stringify(entry.invalidationConditions || []),
        JSON.stringify(entry.sourcePayload || {}),
        entry.expiresAt,
        entry.executedAt,
      ],
    );

    return await getNeonEscrowDecisions(workspaceId);
  } catch {
    const current = ensureWorkspaceEntry(store.escrowDecisions, workspaceId, []);
    const next = current.filter((item) => item.id !== entry.id);
    next.unshift({
      ...entry,
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    store.escrowDecisions.set(workspaceId, next.slice(0, 24));
    return store.escrowDecisions.get(workspaceId);
  }
}

export async function getWorkspaceDecisionEvents(workspaceId) {
  if (!usingNeonStorage()) {
    return ensureWorkspaceEntry(store.decisionEvents, workspaceId, []);
  }

  try {
    return await getNeonDecisionEvents(workspaceId);
  } catch {
    return ensureWorkspaceEntry(store.decisionEvents, workspaceId, []);
  }
}

export async function appendWorkspaceDecisionEvent(workspaceId, event) {
  const entry = normalizeDecisionEventEntry(event);
  if (!entry.id) {
    return getWorkspaceDecisionEvents(workspaceId);
  }

  if (!usingNeonStorage()) {
    const current = ensureWorkspaceEntry(store.decisionEvents, workspaceId, []);
    const next = current.filter((item) => item.id !== entry.id);
    next.unshift({
      ...entry,
      occurredAt: entry.occurredAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    store.decisionEvents.set(workspaceId, next.slice(0, 24));
    return store.decisionEvents.get(workspaceId);
  }

  try {
    const sql = await ensureNeonWorkspace(workspaceId);
    await sql.query(
      `INSERT INTO bls_decision_events (
        workspace_id,
        event_key,
        action_id,
        escrow_key,
        title,
        user_response,
        size_override,
        note,
        state_snapshot,
        counterfactual,
        occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)
      ON CONFLICT (workspace_id, event_key)
      DO UPDATE SET
        action_id = EXCLUDED.action_id,
        escrow_key = EXCLUDED.escrow_key,
        title = EXCLUDED.title,
        user_response = EXCLUDED.user_response,
        size_override = EXCLUDED.size_override,
        note = EXCLUDED.note,
        state_snapshot = EXCLUDED.state_snapshot,
        counterfactual = EXCLUDED.counterfactual,
        occurred_at = EXCLUDED.occurred_at,
        updated_at = NOW()`,
      [
        workspaceId,
        entry.id,
        entry.actionId,
        entry.escrowId,
        entry.title,
        entry.userResponse,
        entry.sizeOverride,
        entry.note,
        JSON.stringify(entry.stateSnapshot || {}),
        JSON.stringify(entry.counterfactual || {}),
        entry.occurredAt,
      ],
    );

    return await getNeonDecisionEvents(workspaceId);
  } catch {
    const current = ensureWorkspaceEntry(store.decisionEvents, workspaceId, []);
    const next = current.filter((item) => item.id !== entry.id);
    next.unshift({
      ...entry,
      occurredAt: entry.occurredAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    store.decisionEvents.set(workspaceId, next.slice(0, 24));
    return store.decisionEvents.get(workspaceId);
  }
}
