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

export async function fetchBackendSnapshot() {
  const response = await fetchBackend("/api/snapshot");
  return response.json();
}

export async function triggerBackendRefresh() {
  const response = await fetchBackend("/api/refresh", { method: "POST" });
  return response.json();
}

export async function fetchBackendHealth() {
  const response = await fetchBackend("/health");
  return response.json();
}
