import { getServerConfig } from "./config.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envNumber(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envNumberFloor(name, fallback, floor) {
  return Math.max(envNumber(name, fallback), floor);
}

function requestMethod(options = {}) {
  return String(options.method || "GET").toUpperCase();
}

function requestTimeoutMs(path, options = {}) {
  const method = requestMethod(options);
  if (method === "POST" && path === "/api/refresh") {
    return envNumberFloor("BLS_PRIME_BACKEND_REFRESH_TIMEOUT_MS", 90000, 45000);
  }
  if (method === "POST" && path === "/api/phantom-diversification") {
    return envNumberFloor("BLS_PRIME_BACKEND_PHANTOM_TIMEOUT_MS", 120000, 60000);
  }
  if (method === "POST" && path === "/api/equity-research/jobs") {
    return envNumberFloor("BLS_PRIME_BACKEND_RESEARCH_JOB_TIMEOUT_MS", 60000, 30000);
  }
  if (method === "GET" && path === "/health") {
    return envNumberFloor("BLS_PRIME_BACKEND_HEALTH_TIMEOUT_MS", 15000, 15000);
  }
  if (method === "GET" && path === "/api/snapshot") {
    return envNumberFloor("BLS_PRIME_BACKEND_SNAPSHOT_TIMEOUT_MS", 25000, 25000);
  }
  if (method === "GET" && path.startsWith("/api/equity-research")) {
    return envNumberFloor("BLS_PRIME_BACKEND_RESEARCH_TIMEOUT_MS", 180000, 60000);
  }
  return envNumberFloor("BLS_PRIME_BACKEND_TIMEOUT_MS", 25000, 20000);
}

function usableEnv(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  if (/^(dummy|replace_me|your_key_here|your_email@example\.com)$/i.test(cleaned)) return "";
  return cleaned;
}

function equityResearchSecUserAgent() {
  const configured =
    usableEnv(process.env.SEC_USER_AGENT) ||
    usableEnv(process.env.SEC_EDGAR_USER_AGENT) ||
    usableEnv(process.env.EDGAR_USER_AGENT) ||
    usableEnv(process.env.META_ALLOCATOR_SEC_USER_AGENT) ||
    usableEnv(process.env.BLS_PRIME_SEC_USER_AGENT);
  if (configured) return configured;

  const contact =
    usableEnv(process.env.SEC_CONTACT_EMAIL) ||
    usableEnv(process.env.EDGAR_CONTACT_EMAIL) ||
    usableEnv(process.env.BLS_PRIME_INVITE_CONTACT) ||
    usableEnv(process.env.META_ALLOCATOR_INVITE_CONTACT);
  if (contact && contact.includes("@") && !/\s/.test(contact)) {
    return `MetaAlphaAllocator ${contact}`;
  }
  return "";
}

function backendForwardedHeaders() {
  const secUserAgent = equityResearchSecUserAgent();
  return secUserAgent ? { "x-sec-user-agent": secUserAgent } : {};
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
          ...backendForwardedHeaders(),
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

export async function fetchBackendBalanceSheet() {
  return fetchBackendJson("/api/balance-sheet");
}

export async function fetchBackendStateV2() {
  return fetchBackendJson("/api/state-v2");
}

export async function fetchBackendEquityResearch(ticker, mode = "quick") {
  const symbol = String(ticker || "").trim().toUpperCase();
  const reportMode = mode === "full" ? "full" : "quick";
  const params = new URLSearchParams({ ticker: symbol, mode: reportMode });
  return fetchBackendJson(`/api/equity-research?${params.toString()}`);
}

export async function startBackendEquityResearchJob(ticker, mode = "quick", clientRunId = null) {
  const symbol = String(ticker || "").trim().toUpperCase();
  const reportMode = mode === "full" ? "full" : "quick";
  return fetchBackendJson("/api/equity-research/jobs", {
    method: "POST",
    body: JSON.stringify({ ticker: symbol, mode: reportMode, client_run_id: clientRunId }),
  });
}

export async function fetchBackendEquityResearchJob(runId) {
  const id = encodeURIComponent(String(runId || "").trim());
  return fetchBackendJson(`/api/equity-research/jobs/${id}`);
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

export async function fetchBackendPhantomDiversification(holdings, workspaceId) {
  const { backendBaseUrl } = getServerConfig();
  const timeoutMs = envNumberFloor("BLS_PRIME_BACKEND_PHANTOM_TIMEOUT_MS", 120000, 60000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${backendBaseUrl}/api/phantom-diversification`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ holdings, workspace_id: workspaceId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const payload = await response.json();
    if (payload?.error) {
      throw new Error(String(payload.error));
    }
    return payload;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      throw new Error("Phantom diversification analysis timed out.");
    }
    throw error;
  }
}
