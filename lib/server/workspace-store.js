import { getNeonSql, usingNeonStorage } from "./data/neon.js";
import { ensureWorkspaceRecord } from "./data/workspaces.js";
import { getServerConfig, getWorkspacePolicyConfig } from "./config.js";

const store = globalThis.__BLS_PRIME_STORE__ || {
  watchlists: new Map(),
  alerts: new Map(),
  savedViews: new Map(),
  commandHistory: new Map(),
  escrowDecisions: new Map(),
  decisionEvents: new Map(),
  positionStories: new Map(),
  memoryProfiles: new Map(),
  counterfactualOutcomes: new Map(),
  capitalTwinRuns: new Map(),
  mandates: new Map(),
};

globalThis.__BLS_PRIME_STORE__ = store;

function ensureWorkspaceEntry(map, workspaceId, fallback) {
  if (!map.has(workspaceId)) {
    map.set(workspaceId, structuredClone(fallback));
  }
  return map.get(workspaceId);
}

async function ensureNeonWorkspace(workspaceId) {
  const { defaultWorkspaceName } = getServerConfig();
  return ensureWorkspaceRecord({
    workspaceId,
    name: defaultWorkspaceName,
    visibility: "private",
  });
}

function workspaceLimits() {
  return getWorkspacePolicyConfig().limits;
}

function limitItems(items, limit) {
  return items.slice(0, limit);
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

function normalizePositionStoryEntry(item, index = 0) {
  const ticker = String(item?.ticker || item?.id || `story-${index}`).trim().toUpperCase();
  return {
    id: ticker,
    ticker,
    roleLabel: String(item?.roleLabel || "").trim(),
    whyItExists: String(item?.whyItExists || "").trim(),
    whatWouldBreakIt: String(item?.whatWouldBreakIt || "").trim(),
    whatCouldReplaceIt: String(item?.whatCouldReplaceIt || "").trim(),
    confidenceUpgrade: String(item?.confidenceUpgrade || "").trim(),
    marketValueLabel: String(item?.marketValueLabel || "").trim(),
    weightLabel: String(item?.weightLabel || "").trim(),
    sector: String(item?.sector || "").trim(),
  };
}

function normalizeMemoryProfileEntry(item) {
  return {
    title: String(item?.title || "Memory-Driven Guidance").trim(),
    tone: String(item?.tone || "Learning").trim(),
    overlay: String(item?.overlay || "").trim(),
    habits: Array.isArray(item?.habits) ? item.habits.map((value) => String(value || "").trim()).filter(Boolean) : [],
    mandateFit: String(item?.mandateFit || "").trim(),
    recentLearnings: Array.isArray(item?.recentLearnings) ? item.recentLearnings.map((value) => String(value || "").trim()).filter(Boolean) : [],
  };
}

function normalizeCounterfactualOutcomeEntry(item, index = 0) {
  const id = String(item?.id || item?.outcomeKey || `outcome-${index}`).trim();
  return {
    id,
    title: String(item?.title || "Decision event").trim(),
    response: String(item?.response || "Tracking").trim(),
    note: String(item?.note || "").trim(),
    occurredAt: item?.occurredAt || null,
    portfolioMove: Number.isFinite(Number(item?.portfolioMove)) ? Number(item.portfolioMove) : null,
    portfolioMoveLabel: String(item?.portfolioMoveLabel || "").trim(),
    benchmarkMove: Number.isFinite(Number(item?.benchmarkMove)) ? Number(item.benchmarkMove) : null,
    benchmarkMoveLabel: String(item?.benchmarkMoveLabel || "").trim(),
    spread: Number.isFinite(Number(item?.spread)) ? Number(item.spread) : null,
    spreadLabel: String(item?.spreadLabel || "").trim(),
    verdict: String(item?.verdict || "Tracking").trim(),
  };
}

function normalizeCapitalTwinEntry(item) {
  return {
    title: String(item?.title || "Capital Twin").trim(),
    currentValueLabel: String(item?.currentValueLabel || "").trim(),
    mandateSummary: String(item?.mandateSummary || "").trim(),
    note: String(item?.note || "").trim(),
    scenarios: Array.isArray(item?.scenarios) ? item.scenarios.map((scenario, index) => ({
      id: String(scenario?.id || `scenario-${index}`).trim(),
      label: String(scenario?.label || `Scenario ${index + 1}`).trim(),
      impact: String(scenario?.impact || "").trim(),
      returnRange: String(scenario?.returnRange || "").trim(),
      note: String(scenario?.note || "").trim(),
    })) : [],
    dominantDrivers: Array.isArray(item?.dominantDrivers) ? item.dominantDrivers.map((driver, index) => ({
      id: String(driver?.id || driver?.ticker || `driver-${index}`).trim(),
      ticker: String(driver?.ticker || "").trim(),
      roleLabel: String(driver?.roleLabel || "").trim(),
      weightLabel: String(driver?.weightLabel || "").trim(),
    })) : [],
  };
}

function normalizeMandateEntry(item) {
  return {
    id: String(item?.id || item?.slug || "compound-without-fake-rebounds").trim(),
    slug: String(item?.slug || item?.id || "compound-without-fake-rebounds").trim(),
    title: String(item?.title || "Compound without fake rebounds").trim(),
    summary: String(item?.summary || "").trim(),
    description: String(item?.description || "").trim(),
    active: item?.active !== false,
    persona: String(item?.persona || "single_user").trim(),
    thresholds: {
      minRecoverability: Number.isFinite(Number(item?.thresholds?.minRecoverability)) ? Number(item.thresholds.minRecoverability) : 0.48,
      maxPhantomRebound: Number.isFinite(Number(item?.thresholds?.maxPhantomRebound)) ? Number(item.thresholds.maxPhantomRebound) : 0.38,
      maxSingleName: Number.isFinite(Number(item?.thresholds?.maxSingleName)) ? Number(item.thresholds.maxSingleName) : 0.12,
      minBallast: Number.isFinite(Number(item?.thresholds?.minBallast)) ? Number(item.thresholds.minBallast) : 0.1,
    },
    guardrails: Array.isArray(item?.guardrails) ? item.guardrails.map((value) => String(value || "").trim()).filter(Boolean) : [],
    effectSummary: String(item?.effectSummary || "").trim(),
    updatedAt: item?.updatedAt || null,
    source: String(item?.source || "workspace").trim(),
  };
}

async function getNeonWatchlist(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const { watchlistItems } = workspaceLimits();
  const rows = await sql.query(
    `SELECT symbol, name, conviction, last_signal, change_pct
     FROM bls_watchlist_items
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, watchlistItems],
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
  const { commandHistory } = workspaceLimits();
  const rows = await sql.query(
    `SELECT id::text AS id, command, created_at
     FROM bls_command_history
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, commandHistory],
  );

  return rows.map((row) => ({
    id: row.id,
    command: row.command,
    createdAt: row.created_at,
  }));
}

async function getNeonAlerts(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const { alerts } = workspaceLimits();
  const rows = await sql.query(
    `SELECT alert_id, severity, title, body, action, source, updated_at
     FROM bls_workspace_alerts
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [workspaceId, alerts],
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
  const { savedViews } = workspaceLimits();
  const rows = await sql.query(
    `SELECT view_key, payload, updated_at
     FROM bls_saved_views
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [workspaceId, savedViews],
  );

  return rows.map((row, index) => normalizeSavedViewEntry({
    id: row.view_key,
    ...(row.payload || {}),
  }, index));
}

async function getNeonEscrowDecisions(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const { escrowDecisions } = workspaceLimits();
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
     LIMIT $2`,
    [workspaceId, escrowDecisions],
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
  const { decisionEvents } = workspaceLimits();
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
     LIMIT $2`,
    [workspaceId, decisionEvents],
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

async function getNeonPositionStories(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const rows = await sql.query(
    `SELECT ticker, payload
     FROM bls_position_stories
     WHERE workspace_id = $1
     ORDER BY updated_at DESC`,
    [workspaceId],
  );

  return limitItems(rows.map((row, index) => normalizePositionStoryEntry({
    ticker: row.ticker,
    ...(row.payload || {}),
  }, index)), workspaceLimits().positionStories);
}

async function getNeonMemoryProfile(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const rows = await sql.query(
    `SELECT payload
     FROM bls_workspace_memory_profiles
     WHERE workspace_id = $1
     LIMIT 1`,
    [workspaceId],
  );

  return rows[0] ? normalizeMemoryProfileEntry(rows[0].payload || {}) : null;
}

async function getNeonCounterfactualOutcomes(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const { counterfactualOutcomes } = workspaceLimits();
  const rows = await sql.query(
    `SELECT outcome_key, payload
     FROM bls_counterfactual_outcomes
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [workspaceId, counterfactualOutcomes],
  );

  return rows.map((row, index) => normalizeCounterfactualOutcomeEntry({
    id: row.outcome_key,
    ...(row.payload || {}),
  }, index));
}

async function getNeonCapitalTwin(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const rows = await sql.query(
    `SELECT payload
     FROM bls_capital_twin_runs
     WHERE workspace_id = $1 AND twin_key = 'current'
     LIMIT 1`,
    [workspaceId],
  );

  return rows[0] ? normalizeCapitalTwinEntry(rows[0].payload || {}) : null;
}

async function getNeonMandate(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  const rows = await sql.query(
    `SELECT payload
     FROM bls_workspace_mandates
     WHERE workspace_id = $1 AND is_active = TRUE
     ORDER BY version DESC, updated_at DESC
     LIMIT 1`,
    [workspaceId],
  );

  return rows[0] ? normalizeMandateEntry(rows[0].payload || {}) : null;
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
    store.watchlists.set(workspaceId, limitItems(next, workspaceLimits().watchlistItems));
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
    store.watchlists.set(workspaceId, limitItems(next, workspaceLimits().watchlistItems));
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
    .slice(0, workspaceLimits().alerts);

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
    store.savedViews.set(workspaceId, limitItems(next, workspaceLimits().savedViews));
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
    store.savedViews.set(workspaceId, limitItems(next, workspaceLimits().savedViews));
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
    store.commandHistory.set(workspaceId, limitItems(history, workspaceLimits().commandHistory));
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
    store.commandHistory.set(workspaceId, limitItems(history, workspaceLimits().commandHistory));
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
    store.escrowDecisions.set(workspaceId, limitItems(next, workspaceLimits().escrowDecisions));
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
    store.escrowDecisions.set(workspaceId, limitItems(next, workspaceLimits().escrowDecisions));
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
    store.decisionEvents.set(workspaceId, limitItems(next, workspaceLimits().decisionEvents));
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
    store.decisionEvents.set(workspaceId, limitItems(next, workspaceLimits().decisionEvents));
    return store.decisionEvents.get(workspaceId);
  }
}

export async function getWorkspacePositionStories(workspaceId) {
  if (!usingNeonStorage()) {
    return {
      title: "Position Stories",
      items: ensureWorkspaceEntry(store.positionStories, workspaceId, []),
      byTicker: Object.fromEntries(ensureWorkspaceEntry(store.positionStories, workspaceId, []).map((story) => [story.ticker, story])),
    };
  }

  try {
    const items = await getNeonPositionStories(workspaceId);
    return {
      title: "Position Stories",
      items,
      byTicker: Object.fromEntries(items.map((story) => [story.ticker, story])),
    };
  } catch {
    const items = ensureWorkspaceEntry(store.positionStories, workspaceId, []);
    return {
      title: "Position Stories",
      items,
      byTicker: Object.fromEntries(items.map((story) => [story.ticker, story])),
    };
  }
}

export async function upsertWorkspacePositionStory(workspaceId, story) {
  const entry = normalizePositionStoryEntry(story);
  if (!entry.ticker) return getWorkspacePositionStories(workspaceId);

  if (!usingNeonStorage()) {
    const current = ensureWorkspaceEntry(store.positionStories, workspaceId, []);
    const next = current.filter((item) => item.ticker !== entry.ticker);
    next.unshift(entry);
    store.positionStories.set(workspaceId, limitItems(next, workspaceLimits().positionStories));
    return getWorkspacePositionStories(workspaceId);
  }

  try {
    const sql = await ensureNeonWorkspace(workspaceId);
    await sql.query(
      `INSERT INTO bls_position_stories (workspace_id, ticker, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (workspace_id, ticker)
       DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [workspaceId, entry.ticker, JSON.stringify(entry)],
    );
    return getWorkspacePositionStories(workspaceId);
  } catch {
    const current = ensureWorkspaceEntry(store.positionStories, workspaceId, []);
    const next = current.filter((item) => item.ticker !== entry.ticker);
    next.unshift(entry);
    store.positionStories.set(workspaceId, limitItems(next, workspaceLimits().positionStories));
    return getWorkspacePositionStories(workspaceId);
  }
}

export async function getWorkspaceMemoryProfile(workspaceId) {
  if (!usingNeonStorage()) {
    return ensureWorkspaceEntry(store.memoryProfiles, workspaceId, null);
  }

  try {
    return await getNeonMemoryProfile(workspaceId);
  } catch {
    return ensureWorkspaceEntry(store.memoryProfiles, workspaceId, null);
  }
}

export async function upsertWorkspaceMemoryProfile(workspaceId, profile) {
  const entry = normalizeMemoryProfileEntry(profile);

  if (!usingNeonStorage()) {
    store.memoryProfiles.set(workspaceId, entry);
    return store.memoryProfiles.get(workspaceId);
  }

  try {
    const sql = await ensureNeonWorkspace(workspaceId);
    await sql.query(
      `INSERT INTO bls_workspace_memory_profiles (workspace_id, payload)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (workspace_id)
       DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [workspaceId, JSON.stringify(entry)],
    );
    return await getNeonMemoryProfile(workspaceId);
  } catch {
    store.memoryProfiles.set(workspaceId, entry);
    return store.memoryProfiles.get(workspaceId);
  }
}

export async function getWorkspaceCounterfactualOutcomes(workspaceId) {
  if (!usingNeonStorage()) {
    return {
      title: "Counterfactual Ledger",
      items: ensureWorkspaceEntry(store.counterfactualOutcomes, workspaceId, []),
    };
  }

  try {
    return {
      title: "Counterfactual Ledger",
      items: await getNeonCounterfactualOutcomes(workspaceId),
    };
  } catch {
    return {
      title: "Counterfactual Ledger",
      items: ensureWorkspaceEntry(store.counterfactualOutcomes, workspaceId, []),
    };
  }
}

export async function upsertWorkspaceCounterfactualOutcome(workspaceId, outcome) {
  const entry = normalizeCounterfactualOutcomeEntry(outcome);
  if (!entry.id) return getWorkspaceCounterfactualOutcomes(workspaceId);

  if (!usingNeonStorage()) {
    const current = ensureWorkspaceEntry(store.counterfactualOutcomes, workspaceId, []);
    const next = current.filter((item) => item.id !== entry.id);
    next.unshift(entry);
    store.counterfactualOutcomes.set(workspaceId, limitItems(next, workspaceLimits().counterfactualOutcomes));
    return getWorkspaceCounterfactualOutcomes(workspaceId);
  }

  try {
    const sql = await ensureNeonWorkspace(workspaceId);
    await sql.query(
      `INSERT INTO bls_counterfactual_outcomes (workspace_id, outcome_key, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (workspace_id, outcome_key)
       DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [workspaceId, entry.id, JSON.stringify(entry)],
    );
    return getWorkspaceCounterfactualOutcomes(workspaceId);
  } catch {
    const current = ensureWorkspaceEntry(store.counterfactualOutcomes, workspaceId, []);
    const next = current.filter((item) => item.id !== entry.id);
    next.unshift(entry);
    store.counterfactualOutcomes.set(workspaceId, limitItems(next, workspaceLimits().counterfactualOutcomes));
    return getWorkspaceCounterfactualOutcomes(workspaceId);
  }
}

export async function getWorkspaceCapitalTwin(workspaceId) {
  if (!usingNeonStorage()) {
    return ensureWorkspaceEntry(store.capitalTwinRuns, workspaceId, null);
  }

  try {
    return await getNeonCapitalTwin(workspaceId);
  } catch {
    return ensureWorkspaceEntry(store.capitalTwinRuns, workspaceId, null);
  }
}

export async function upsertWorkspaceCapitalTwin(workspaceId, twin) {
  const entry = normalizeCapitalTwinEntry(twin);

  if (!usingNeonStorage()) {
    store.capitalTwinRuns.set(workspaceId, entry);
    return store.capitalTwinRuns.get(workspaceId);
  }

  try {
    const sql = await ensureNeonWorkspace(workspaceId);
    await sql.query(
      `INSERT INTO bls_capital_twin_runs (workspace_id, twin_key, payload)
       VALUES ($1, 'current', $2::jsonb)
       ON CONFLICT (workspace_id, twin_key)
       DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [workspaceId, JSON.stringify(entry)],
    );
    return await getNeonCapitalTwin(workspaceId);
  } catch {
    store.capitalTwinRuns.set(workspaceId, entry);
    return store.capitalTwinRuns.get(workspaceId);
  }
}

export async function getWorkspaceMandate(workspaceId) {
  if (!usingNeonStorage()) {
    return ensureWorkspaceEntry(store.mandates, workspaceId, null);
  }

  try {
    return await getNeonMandate(workspaceId);
  } catch {
    return ensureWorkspaceEntry(store.mandates, workspaceId, null);
  }
}

export async function upsertWorkspaceMandate(workspaceId, mandate) {
  const entry = normalizeMandateEntry(mandate);

  if (!usingNeonStorage()) {
    store.mandates.set(workspaceId, entry);
    return store.mandates.get(workspaceId);
  }

  try {
    const sql = await ensureNeonWorkspace(workspaceId);
    const versionRows = await sql.query(
      `SELECT COALESCE(MAX(version), 0) AS max_version
       FROM bls_workspace_mandates
       WHERE workspace_id = $1 AND mandate_key = $2`,
      [workspaceId, entry.slug],
    );
    const nextVersion = Number(versionRows[0]?.max_version || 0) + 1;

    await sql.transaction([
      sql.query(
        `UPDATE bls_workspace_mandates
         SET is_active = FALSE, updated_at = NOW()
         WHERE workspace_id = $1 AND is_active = TRUE`,
        [workspaceId],
      ),
      sql.query(
        `INSERT INTO bls_workspace_mandates (workspace_id, mandate_key, version, is_active, payload)
         VALUES ($1, $2, $3, TRUE, $4::jsonb)`,
        [workspaceId, entry.slug, nextVersion, JSON.stringify(entry)],
      ),
    ]);

    return await getNeonMandate(workspaceId);
  } catch {
    store.mandates.set(workspaceId, entry);
    return store.mandates.get(workspaceId);
  }
}
