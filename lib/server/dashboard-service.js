import {
  fetchBackendAnalogs,
  fetchBackendFailureModes,
  fetchBackendHealth,
  fetchBackendLegitimacy,
  fetchBackendPolicy,
  fetchBackendRepairs,
  fetchBackendSnapshot,
  fetchBackendState,
  fetchBackendStateContract,
  fetchBackendStateV2,
  fetchBackendTransitions,
  triggerBackendRefresh,
} from "./backend.js";
import { getServerConfig } from "./config.js";
import { normalizeWorkspaceDashboard } from "./normalizers.js";
import { applyLocalPortfolioOverlay, updateHoldingsFromInstruction } from "./private-portfolio.js";
import { SHARED_ALPHA_PROFILE } from "./shared-alpha-data.js";
import { randomUUID } from "node:crypto";

import {
  addWorkspaceWatchlistItem,
  appendWorkspaceDecisionEvent,
  appendWorkspaceAlerts,
  getWorkspaceDecisionEvents,
  getWorkspaceEscrowDecisions,
  getWorkspaceAlerts,
  getWorkspaceCommandHistory,
  getWorkspaceSavedViews,
  getWorkspaceWatchlist,
  pushCommandHistory,
  saveWorkspaceSavedView,
  upsertWorkspaceEscrowDecision,
} from "./workspace-store.js";
import * as workspaceStore from "./workspace-store.js";
import { getStorageBackend } from "./data/neon.js";
import { getRuntimeDocumentPayload } from "./data/runtime-documents.js";
import { buildDecisionOsSections } from "./decision-os.js";
import { buildPlanContext, getWorkspacePlanSnapshot } from "./billing.js";

function buildUnavailableSnapshot(error) {
  const message = String(error?.message || error || "unknown error");
  const staleDetails = message
    .replace(/^Live backend snapshot is stale\s*/i, "")
    .replace(/^\(/, "")
    .replace(/\)\.?$/, "")
    .trim();
  const warningLabel = /snapshot is stale/i.test(message)
    ? `Live snapshot is stale: ${staleDetails || message}`
    : `Live backend unavailable: ${message}`;

  return {
    generated_at: null,
    as_of_date: null,
    overview: {},
    portfolio: {
      holdings: [],
      quotes: [],
      quotes_stale_days: null,
      quotes_as_of: null,
    },
    screener: {
      rows: [],
    },
    sectors: {
      preferred: [],
      records: [],
    },
    international: {
      preferred: [],
      records: [],
    },
    risk: {},
    status: {
      warnings: [warningLabel],
      panels: [],
      contract_status: "fallback_legacy",
    },
  };
}

function parseSnapshotTime(value) {
  const millis = Date.parse(String(value || "").trim());
  return Number.isFinite(millis) ? millis : null;
}

function getSnapshotAgeHours(snapshot) {
  const generatedAt = parseSnapshotTime(snapshot?.generated_at);
  if (generatedAt === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - generatedAt) / (1000 * 60 * 60));
}

function isSnapshotUsable(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const generatedAt = parseSnapshotTime(snapshot.generated_at);
  if (generatedAt === null) return false;

  const ageHours = getSnapshotAgeHours(snapshot);
  if (ageHours > 30) return false;

  const portfolio = snapshot.portfolio || {};
  const quotesAsOf = parseSnapshotTime(portfolio.quotes_as_of || snapshot.as_of_date);
  const staleDays = Number(portfolio.quotes_stale_days);
  const hasPortfolioContext =
    Array.isArray(portfolio.holdings) && portfolio.holdings.length > 0 ||
    Array.isArray(portfolio.top_holdings) && portfolio.top_holdings.length > 0 ||
    Array.isArray(portfolio.current_mix_vs_spy) && portfolio.current_mix_vs_spy.length > 0;

  if (Number.isFinite(staleDays) && staleDays > 3 && !hasPortfolioContext) return false;
  if (quotesAsOf === null && !hasPortfolioContext && ageHours > 12) return false;

  return true;
}

function buildStaleSnapshotError(snapshot) {
  const generatedAt = snapshot?.generated_at || "unknown";
  return new Error(`Live backend snapshot is stale (generated_at ${generatedAt}).`);
}

function buildFallbackWorkspaceDashboard(workspaceId, error, billingPlan = null) {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId,
    snapshot: buildUnavailableSnapshot(error),
    watchlist: [],
    alerts: [
      {
        id: "workspace-bootstrap-warning",
        severity: "high",
        title: "Workspace loaded with limited data",
        body: String(error?.message || error || "The live workspace could not be fully assembled."),
        source: "workspace",
      },
    ],
    savedViews: [],
    commandHistory: [],
    escrowDecisions: [],
    decisionEvents: [],
    sharedAlpha: SHARED_ALPHA_PROFILE,
    billingPlan,
  });
  return {
    ...dashboard,
    ...buildDecisionOsSections(dashboard),
  };
}

async function loadPersistedDashboardSnapshot() {
  try {
    return await getRuntimeDocumentPayload("dashboard_snapshot");
  } catch {
    return null;
  }
}

async function loadBestBackendSnapshot() {
  let liveError = null;
  let liveSnapshot = null;
  let persistedSnapshot = null;

  try {
    liveSnapshot = await fetchBackendSnapshot();
  } catch (error) {
    liveError = error;
  }

  try {
    persistedSnapshot = await loadPersistedDashboardSnapshot();
  } catch {
    persistedSnapshot = null;
  }

  if (isSnapshotUsable(liveSnapshot)) {
    return liveSnapshot;
  }

  if (isSnapshotUsable(persistedSnapshot)) {
    return persistedSnapshot;
  }

  if (liveSnapshot) {
    return buildUnavailableSnapshot(buildStaleSnapshotError(liveSnapshot));
  }

  return buildUnavailableSnapshot(liveError || new Error("No usable backend snapshot was available."));
}

async function loadDecisionOsState(workspaceId, dashboard) {
  const positionStories = typeof workspaceStore.getWorkspacePositionStories === "function"
    ? await workspaceStore.getWorkspacePositionStories(workspaceId).catch(() => null)
    : null;
  const memoryProfile = typeof workspaceStore.getWorkspaceMemoryProfile === "function"
    ? await workspaceStore.getWorkspaceMemoryProfile(workspaceId).catch(() => null)
    : null;
  const counterfactualLedger = typeof workspaceStore.getWorkspaceCounterfactualOutcomes === "function"
    ? await workspaceStore.getWorkspaceCounterfactualOutcomes(workspaceId).catch(() => null)
    : null;
  const capitalTwin = typeof workspaceStore.getWorkspaceCapitalTwin === "function"
    ? await workspaceStore.getWorkspaceCapitalTwin(workspaceId).catch(() => null)
    : null;
  const mandate = typeof workspaceStore.getWorkspaceMandate === "function"
    ? await workspaceStore.getWorkspaceMandate(workspaceId).catch(() => null)
    : null;

  const sections = buildDecisionOsSections(dashboard, {
    positionStories,
    memoryGuidance: memoryProfile,
    counterfactualLedger,
    capitalTwin,
    mandate,
  });

  const persistence = [];
  if (typeof workspaceStore.upsertWorkspacePositionStory === "function") {
    for (const story of sections.position_stories?.items || []) {
      persistence.push(workspaceStore.upsertWorkspacePositionStory(workspaceId, story).catch(() => null));
    }
  }
  if (typeof workspaceStore.upsertWorkspaceMemoryProfile === "function") {
    persistence.push(workspaceStore.upsertWorkspaceMemoryProfile(workspaceId, sections.memory_guidance).catch(() => null));
  }
  if (typeof workspaceStore.upsertWorkspaceCounterfactualOutcome === "function") {
    for (const item of sections.counterfactual_ledger?.items || []) {
      persistence.push(workspaceStore.upsertWorkspaceCounterfactualOutcome(workspaceId, item).catch(() => null));
    }
  }
  if (typeof workspaceStore.upsertWorkspaceCapitalTwin === "function") {
    persistence.push(workspaceStore.upsertWorkspaceCapitalTwin(workspaceId, sections.capital_twin).catch(() => null));
  }

  if (persistence.length) {
    void Promise.all(persistence);
  }

  return sections;
}

export async function getSessionPayload(authSession = null) {
  const config = getServerConfig();
  let health = null;

  try {
    health = await fetchBackendHealth();
  } catch (error) {
    health = { ok: false, error: String(error) };
  }

  if (authSession) {
    const plan = authSession.user.billing || await buildPlanContext(authSession.user.plan || "free", authSession.user.id);
    return {
      user: {
        id: authSession.user.id,
        name: authSession.user.name,
        email: authSession.user.email,
        role: authSession.user.plan || "member",
        plan: plan.id,
        billing: plan,
      },
      workspace: {
        id: authSession.workspace.id,
        name: authSession.workspace.name,
        mode: "private",
      },
      access: {
        inviteOnly: false,
        provider: "account",
        sharedLinkEnabled: false,
        queryKey: "",
        inviteContact: config.inviteContact,
        privateWorkspace: plan.access.privateWorkspace,
        upgradeRequired: plan.access.upgradeRequired,
      },
      backend: health,
      storage: {
        backend: getStorageBackend(),
      },
      plan,
    };
  }

  return {
    user: {
      id: "public-visitor",
      name: config.sessionUserName,
      email: config.sessionUserEmail,
      role: "visitor",
      plan: "free",
    },
    workspace: {
      id: config.workspaceId,
      name: "BLS Prime",
      mode: "public",
    },
    access: {
      inviteOnly: false,
      provider: "public",
      sharedLinkEnabled: false,
      queryKey: "",
      inviteContact: config.inviteContact,
      privateWorkspace: false,
      upgradeRequired: true,
    },
    backend: health,
    storage: {
      backend: getStorageBackend(),
    },
    plan: await buildPlanContext("free"),
  };
}

export async function getWorkspaceDashboard(workspaceId) {
  try {
    const [watchlist, alerts, savedViews, commandHistory, escrowDecisions, decisionEvents, backendSnapshotResult, billingPlan] = await Promise.all([
      getWorkspaceWatchlist(workspaceId),
      getWorkspaceAlerts(workspaceId),
      getWorkspaceSavedViews(workspaceId),
      getWorkspaceCommandHistory(workspaceId),
      getWorkspaceEscrowDecisions(workspaceId),
      getWorkspaceDecisionEvents(workspaceId),
      loadBestBackendSnapshot(),
      getWorkspacePlanSnapshot(workspaceId).catch(() => null),
    ]);
    const backendSnapshot = backendSnapshotResult || buildUnavailableSnapshot("No snapshot received");
    const snapshot = await applyLocalPortfolioOverlay(backendSnapshot, workspaceId);
    const dashboard = normalizeWorkspaceDashboard({
      workspaceId,
      snapshot,
      watchlist,
      alerts,
      savedViews,
      commandHistory,
      escrowDecisions,
      decisionEvents,
      sharedAlpha: SHARED_ALPHA_PROFILE,
      billingPlan,
    });
    const decisionOs = await loadDecisionOsState(workspaceId, dashboard);
    await appendWorkspaceAlerts(workspaceId, dashboard.alerts);
    return {
      ...dashboard,
      ...decisionOs,
    };
  } catch (error) {
    const billingPlan = await getWorkspacePlanSnapshot(workspaceId).catch(() => null);
    return buildFallbackWorkspaceDashboard(workspaceId, error, billingPlan);
  }
}

export async function getWorkspaceModule(workspaceId, moduleId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    module_status: dashboard.module_status.find((item) => item.id === moduleId) || null,
    module: dashboard.modules[moduleId] || null,
  };
}

export async function refreshWorkspace(workspaceId) {
  await triggerBackendRefresh();
  return getWorkspaceDashboard(workspaceId);
}

export async function updateWorkspaceHoldings(workspaceId, instruction) {
  const backendSnapshot = await fetchBackendSnapshot();
  await updateHoldingsFromInstruction(backendSnapshot, workspaceId, instruction);
  return getWorkspaceDashboard(workspaceId);
}

export async function getWorkspacePortfolio(workspaceId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    portfolio_state: dashboard.portfolio_state,
    watchlist: dashboard.watchlist,
    module: dashboard.modules.portfolio,
  };
}

export async function getWorkspaceFrontier(workspaceId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    mandate: dashboard.mandate,
    frontier: dashboard.frontier,
    confidence_panel: dashboard.confidence_panel,
  };
}

export async function getWorkspacePositionStory(workspaceId, ticker) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  const storyLookup = dashboard.position_stories?.byTicker || {};
  return {
    workspace_summary: dashboard.workspace_summary,
    story: storyLookup[String(ticker || "").toUpperCase()] || null,
    stories: dashboard.position_stories,
  };
}

export async function getWorkspaceCounterfactualLedger(workspaceId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    ledger: dashboard.counterfactual_ledger,
    memory_guidance: dashboard.memory_guidance,
  };
}

export async function getWorkspaceCapitalTwin(workspaceId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    twin: dashboard.capital_twin,
    mandate: dashboard.mandate,
    xray: dashboard.xray,
  };
}

export async function getWorkspaceMandate(workspaceId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    mandate: dashboard.mandate,
    frontier: dashboard.frontier,
  };
}

export async function updateWorkspaceMandate(workspaceId, patch) {
  const current = await getWorkspaceMandate(workspaceId);
  const nextMandate = {
    ...current.mandate,
    ...patch,
    thresholds: {
      ...(current.mandate?.thresholds || {}),
      ...(patch?.thresholds || {}),
    },
    guardrails: Array.isArray(patch?.guardrails) ? patch.guardrails : current.mandate?.guardrails || [],
    updatedAt: new Date().toISOString(),
    source: "workspace",
  };

  if (typeof workspaceStore.upsertWorkspaceMandate === "function") {
    await workspaceStore.upsertWorkspaceMandate(workspaceId, nextMandate);
  }

  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    mandate: dashboard.mandate,
    frontier: dashboard.frontier,
    capital_twin: dashboard.capital_twin,
  };
}

export async function getWorkspaceState(_workspaceId) {
  return fetchBackendState();
}

export async function getWorkspacePolicy(_workspaceId) {
  return fetchBackendPolicy();
}

export async function getWorkspaceStateContract(_workspaceId) {
  return fetchBackendStateContract();
}

export async function getWorkspaceRepairs(_workspaceId) {
  return fetchBackendRepairs();
}

export async function getWorkspaceAnalogs(_workspaceId) {
  return fetchBackendAnalogs();
}

export async function getWorkspaceStateV2(_workspaceId) {
  return fetchBackendStateV2();
}

export async function getWorkspaceLegitimacy(_workspaceId) {
  return fetchBackendLegitimacy();
}

export async function getWorkspaceFailureModes(_workspaceId) {
  return fetchBackendFailureModes();
}

export async function getWorkspaceTransitions(_workspaceId) {
  return fetchBackendTransitions();
}

export async function getWorkspaceSavedState(workspaceId) {
  return {
    watchlist: await getWorkspaceWatchlist(workspaceId),
    savedViews: await getWorkspaceSavedViews(workspaceId),
    commandHistory: await getWorkspaceCommandHistory(workspaceId),
  };
}

export async function upsertWorkspaceSavedView(workspaceId, view) {
  await saveWorkspaceSavedView(workspaceId, view);
  return getWorkspaceDashboard(workspaceId);
}

export async function addWatchlistSymbol(workspaceId, item) {
  return addWorkspaceWatchlistItem(workspaceId, item);
}

export async function recordCommand(workspaceId, command) {
  return pushCommandHistory(workspaceId, command);
}

function defaultExpiry(days = 5) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function trimText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

export async function stageWorkspaceEscrowDecision(workspaceId, payload) {
  const action = payload?.action || {};
  const escrowId = trimText(payload?.id, `escrow-${randomUUID()}`);
  const entry = {
    id: escrowId,
    actionId: trimText(action.id),
    title: trimText(action.title, "Staged decision"),
    summary: trimText(action.summary || action.whyNow),
    slot: trimText(action.slot, "Also valid"),
    ticker: trimText(action.ticker || "", null),
    tone: trimText(action.tone, "neutral"),
    funding: trimText(action.funding, "No change"),
    sizeLabel: trimText(action.sizeLabel || action.size, "Staged"),
    sizeValue: Number.isFinite(Number(action.sizeValue)) ? Number(action.sizeValue) : null,
    status: "staged",
    autoMature: Boolean(payload?.autoMature),
    readiness: 0.45,
    maturityConditions: [trimText(action.trigger, "Wait for confirmation.")].filter(Boolean),
    invalidationConditions: [trimText(action.watchFor, "State weakens again.")].filter(Boolean),
    sourcePayload: action,
    expiresAt: payload?.expiresAt || defaultExpiry(),
    executedAt: null,
  };

  await Promise.all([
    upsertWorkspaceEscrowDecision(workspaceId, entry),
    appendWorkspaceDecisionEvent(workspaceId, {
      id: `decision-${randomUUID()}`,
      actionId: entry.actionId,
      escrowId: entry.id,
      title: entry.title,
      userResponse: "staged",
      sizeOverride: entry.sizeValue,
      note: payload?.note || "",
      stateSnapshot: payload?.stateSummary || {},
      counterfactual: {},
      occurredAt: new Date().toISOString(),
    }),
  ]);

  return getWorkspaceDashboard(workspaceId);
}

export async function patchWorkspaceEscrowDecision(workspaceId, escrowId, payload) {
  const current = await getWorkspaceEscrowDecisions(workspaceId);
  const existing = current.find((item) => item.id === escrowId);
  if (!existing) {
    throw new Error("Escrow decision not found.");
  }

  const next = {
    ...existing,
    autoMature: payload?.autoMature ?? existing.autoMature,
    readiness: Number.isFinite(Number(payload?.readiness)) ? Number(payload.readiness) : existing.readiness,
  };

  const action = trimText(payload?.action);
  let response = "updated";

  if (action === "cancel") {
    next.status = "cancelled";
    response = "cancelled";
  } else if (action === "execute") {
    next.status = "executed";
    next.executedAt = new Date().toISOString();
    response = "executed";
  }

  await Promise.all([
    upsertWorkspaceEscrowDecision(workspaceId, next),
    appendWorkspaceDecisionEvent(workspaceId, {
      id: `decision-${randomUUID()}`,
      actionId: next.actionId,
      escrowId: next.id,
      title: next.title,
      userResponse: response,
      sizeOverride: next.sizeValue,
      note: trimText(payload?.note),
      stateSnapshot: payload?.stateSummary || {},
      counterfactual: {},
      occurredAt: new Date().toISOString(),
    }),
  ]);

  return getWorkspaceDashboard(workspaceId);
}

export async function recordWorkspaceDecision(workspaceId, payload) {
  await appendWorkspaceDecisionEvent(workspaceId, {
    id: `decision-${randomUUID()}`,
    actionId: trimText(payload?.action?.id),
    escrowId: trimText(payload?.escrowId),
    title: trimText(payload?.action?.title, "Decision event"),
    userResponse: trimText(payload?.userResponse, "noted"),
    sizeOverride: Number.isFinite(Number(payload?.sizeOverride)) ? Number(payload.sizeOverride) : null,
    note: trimText(payload?.note),
    stateSnapshot: payload?.stateSummary || {},
    counterfactual: payload?.counterfactual || {},
    occurredAt: new Date().toISOString(),
  });

  return getWorkspaceDashboard(workspaceId);
}
