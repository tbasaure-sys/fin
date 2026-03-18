import {
  fetchBackendAnalogs,
  fetchBackendFailureModes,
  fetchBackendHealth,
  fetchBackendLegitimacy,
  fetchBackendPolicy,
  fetchBackendRepairs,
  fetchBackendSnapshot,
  fetchBackendState,
  fetchBackendStateV2,
  fetchBackendTransitions,
  triggerBackendRefresh,
} from "./backend.js";
import { getServerConfig } from "./config.js";
import { normalizeWorkspaceDashboard } from "./normalizers.js";
import { SHARED_ALPHA_PROFILE } from "./shared-alpha-data.js";
import {
  addWorkspaceWatchlistItem,
  appendWorkspaceAlerts,
  getWorkspaceAlerts,
  getWorkspaceCommandHistory,
  getWorkspaceSavedViews,
  getWorkspaceWatchlist,
  pushCommandHistory,
} from "./workspace-store.js";

export async function getSessionPayload() {
  const config = getServerConfig();
  let health = null;

  try {
    health = await fetchBackendHealth();
  } catch (error) {
    health = { ok: false, error: String(error) };
  }

  return {
    user: {
      id: config.sharedAccessToken ? "shared-alpha-reader" : "alpha-user",
      name: config.sharedAccessToken ? "Private Link Access" : config.sessionUserName,
      email: config.sharedAccessToken ? "Shared alpha workspace" : config.sessionUserEmail,
      role: config.sharedAccessToken ? "alpha_viewer" : "founding_member",
    },
    workspace: {
      id: config.workspaceId,
      name: "BLS Prime Alpha",
      mode: config.alphaMode,
    },
    access: {
      inviteOnly: true,
      provider: config.sharedAccessToken ? "shared-link" : "alpha-scaffold",
      sharedLinkEnabled: Boolean(config.sharedAccessToken),
      queryKey: config.sharedAccessQueryKey,
      inviteContact: config.inviteContact,
    },
    backend: health,
  };
}

export async function getWorkspaceDashboard(workspaceId) {
  const watchlist = getWorkspaceWatchlist(workspaceId);
  const alerts = getWorkspaceAlerts(workspaceId);
  const savedViews = getWorkspaceSavedViews(workspaceId);
  const commandHistory = getWorkspaceCommandHistory(workspaceId);
  const snapshot = await fetchBackendSnapshot();
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId,
    snapshot,
    watchlist,
    alerts,
    savedViews,
    commandHistory,
    sharedAlpha: SHARED_ALPHA_PROFILE,
  });
  appendWorkspaceAlerts(workspaceId, dashboard.alerts);
  return dashboard;
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

export async function getWorkspacePortfolio(workspaceId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    portfolio_state: dashboard.portfolio_state,
    watchlist: dashboard.watchlist,
    module: dashboard.modules.portfolio,
  };
}

export async function getWorkspaceState(_workspaceId) {
  return fetchBackendState();
}

export async function getWorkspacePolicy(_workspaceId) {
  return fetchBackendPolicy();
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

export function getWorkspaceSavedState(workspaceId) {
  return {
    watchlist: getWorkspaceWatchlist(workspaceId),
    savedViews: getWorkspaceSavedViews(workspaceId),
    commandHistory: getWorkspaceCommandHistory(workspaceId),
  };
}

export function addWatchlistSymbol(workspaceId, item) {
  return addWorkspaceWatchlistItem(workspaceId, item);
}

export function recordCommand(workspaceId, command) {
  return pushCommandHistory(workspaceId, command);
}
