import { getServerConfig } from "./config.js";

async function fetchBackend(path, options = {}) {
  const { backendBaseUrl } = getServerConfig();
  const timeoutMs = Number(process.env.BLS_PRIME_BACKEND_TIMEOUT_MS || 12000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${backendBaseUrl}${path}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      throw new Error(`Backend request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }

  clearTimeout(timeoutId);

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

export async function fetchBackendStateV2() {
  return fetchBackendJson("/api/state-v2");
}

export async function fetchBackendLegitimacy() {
  return fetchBackendJson("/api/legitimacy");
}

export async function fetchBackendFailureModes() {
  return fetchBackendJson("/api/failure-modes");
}

export async function fetchBackendTransitions() {
  return fetchBackendJson("/api/transitions");
}
