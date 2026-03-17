import { getServerConfig } from "./config.js";

async function fetchBackend(path, options = {}) {
  const { backendBaseUrl } = getServerConfig();
  const response = await fetch(`${backendBaseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Backend request failed (${response.status}): ${message}`);
  }

  return response;
}

async function fetchBackendJson(path, options = {}) {
  const response = await fetchBackend(path, options);
  return response.json();
}

export async function fetchBackendSnapshot() {
  return fetchBackendJson("/api/snapshot");
}

export async function triggerBackendRefresh() {
  return fetchBackendJson("/api/refresh", { method: "POST" });
}

export async function fetchBackendHealth() {
  return fetchBackendJson("/health");
}

export async function fetchBackendState() {
  return fetchBackendJson("/api/state");
}

export async function fetchBackendStateContract() {
  return fetchBackendJson("/api/state-contract");
}

export async function fetchBackendPolicy() {
  return fetchBackendJson("/api/policy");
}

export async function fetchBackendRepairs() {
  return fetchBackendJson("/api/repairs");
}

export async function fetchBackendAnalogs() {
  return fetchBackendJson("/api/analogs");
}
