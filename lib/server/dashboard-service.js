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
import {
  addWorkspaceWatchlistItem,
  appendWorkspaceAlerts,
  getWorkspaceAlerts,
  getWorkspaceCommandHistory,
  getWorkspaceSavedViews,
  getWorkspaceWatchlist,
  pushCommandHistory,
} from "./workspace-store.js";
import { getStorageBackend } from "./data/neon.js";

function buildUnavailableSnapshot(error) {
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
      warnings: [
        `Live backend unavailable: ${String(error?.message || error || "unknown error")}`,
      ],
      panels: [],
      contract_status: "fallback_legacy",
    },
  };
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
    return {
      user: {
        id: authSession.user.id,
        name: authSession.user.name,
        email: authSession.user.email,
        role: authSession.user.plan || "member",
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
      },
      backend: health,
      storage: {
        backend: getStorageBackend(),
      },
    };
  }

  return {
    user: {
      id: "public-visitor",
      name: config.sessionUserName,
      email: config.sessionUserEmail,
      role: "visitor",
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
    },
    backend: health,
    storage: {
      backend: getStorageBackend(),
    },
  };
}

export async function getWorkspaceDashboard(workspaceId) {
  const [watchlist, alerts, savedViews, commandHistory, backendSnapshotResult] = await Promise.all([
    getWorkspaceWatchlist(workspaceId),
    getWorkspaceAlerts(workspaceId),
    getWorkspaceSavedViews(workspaceId),
    getWorkspaceCommandHistory(workspaceId),
    fetchBackendSnapshot().catch((error) => buildUnavailableSnapshot(error)),
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
    sharedAlpha: SHARED_ALPHA_PROFILE,
  });
  await appendWorkspaceAlerts(workspaceId, dashboard.alerts);
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

export async function addWatchlistSymbol(workspaceId, item) {
  return addWorkspaceWatchlistItem(workspaceId, item);
}

export async function recordCommand(workspaceId, command) {
  return pushCommandHistory(workspaceId, command);
}
