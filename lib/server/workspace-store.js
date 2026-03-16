import { FALLBACK_ALERTS, FALLBACK_SAVED_VIEWS, FALLBACK_WATCHLIST } from "./demo-data.js";

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

export function getWorkspaceWatchlist(workspaceId) {
  return ensureWorkspaceEntry(store.watchlists, workspaceId, FALLBACK_WATCHLIST);
}

export function addWorkspaceWatchlistItem(workspaceId, item) {
  const current = getWorkspaceWatchlist(workspaceId);
  const entry = {
    symbol: String(item.symbol || "").toUpperCase(),
    name: item.name || item.symbol || "Unknown",
    conviction: item.conviction || "User-defined",
    lastSignal: item.lastSignal || "Watching",
    changePct: Number(item.changePct || 0),
  };

  const next = current.filter((row) => row.symbol !== entry.symbol);
  next.unshift(entry);
  store.watchlists.set(workspaceId, next.slice(0, 24));
  return store.watchlists.get(workspaceId);
}

export function getWorkspaceAlerts(workspaceId) {
  return ensureWorkspaceEntry(store.alerts, workspaceId, FALLBACK_ALERTS);
}

export function appendWorkspaceAlerts(workspaceId, alerts) {
  const current = getWorkspaceAlerts(workspaceId);
  const merged = [...alerts, ...current].reduce((acc, alert) => {
    if (!acc.some((item) => item.id === alert.id)) acc.push(alert);
    return acc;
  }, []);
  store.alerts.set(workspaceId, merged.slice(0, 20));
  return store.alerts.get(workspaceId);
}

export function getWorkspaceSavedViews(workspaceId) {
  return ensureWorkspaceEntry(store.savedViews, workspaceId, FALLBACK_SAVED_VIEWS);
}

export function pushCommandHistory(workspaceId, command) {
  const history = ensureWorkspaceEntry(store.commandHistory, workspaceId, []);
  history.unshift({
    id: `cmd-${Date.now()}`,
    command,
    createdAt: new Date().toISOString(),
  });
  store.commandHistory.set(workspaceId, history.slice(0, 12));
  return store.commandHistory.get(workspaceId);
}

export function getWorkspaceCommandHistory(workspaceId) {
  return ensureWorkspaceEntry(store.commandHistory, workspaceId, []);
}
