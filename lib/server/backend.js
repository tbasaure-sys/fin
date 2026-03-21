import { getServerConfig } from "./config.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envNumber(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requestMethod(options = {}) {
  return String(options.method || "GET").toUpperCase();
}

function requestTimeoutMs(path, options = {}) {
  const method = requestMethod(options);
  if (method === "POST" && path === "/api/refresh") {
    return envNumber("BLS_PRIME_BACKEND_REFRESH_TIMEOUT_MS", 90000);
  }
  if (method === "GET" && path === "/health") {
    return envNumber("BLS_PRIME_BACKEND_HEALTH_TIMEOUT_MS", 15000);
  }
  if (method === "GET" && path === "/api/snapshot") {
    return envNumber("BLS_PRIME_BACKEND_SNAPSHOT_TIMEOUT_MS", 25000);
  }
  return envNumber("BLS_PRIME_BACKEND_TIMEOUT_MS", 25000);
}

function shouldRetryRequest(method, status) {
  return ["GET", "HEAD"].includes(method) && [502, 503, 504].includes(Number(status));
}

async function fetchBackend(path, options = {}) {
  const { backendBaseUrl } = getServerConfig();
  const method = requestMethod(options);
  const retries = Math.max(0, Number(process.env.BLS_PRIME_BACKEND_RETRY_COUNT || 1));
  const retryDelayMs = Math.max(0, Number(process.env.BLS_PRIME_BACKEND_RETRY_DELAY_MS || 450));
  const url = `${backendBaseUrl}${path}`;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timeoutMs = requestTimeoutMs(path, options);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "content-type": "application/json",
          ...(options.headers || {}),
        },
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const message = await response.text();
        if (attempt < retries && shouldRetryRequest(method, response.status)) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        throw new Error(`Backend ${method} ${path} failed (${response.status}) at ${backendBaseUrl}: ${message}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      const timeoutError =
        error?.name === "AbortError"
          ? new Error(`Backend ${method} ${path} timed out after ${timeoutMs}ms at ${backendBaseUrl}`)
          : new Error(`Backend ${method} ${path} request failed at ${backendBaseUrl}: ${String(error?.message || error)}`);

      if (attempt < retries && ["GET", "HEAD"].includes(method)) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      throw timeoutError;
    }
  }

  throw new Error(`Backend ${method} ${path} request failed at ${backendBaseUrl}`);
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
