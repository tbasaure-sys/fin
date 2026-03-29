function envString(name, fallback = "") {
  const value = String(process.env[name] || "").trim();
  return value || fallback;
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function envPositiveNumber(name, fallback) {
  const value = envNumber(name, fallback);
  return value > 0 ? value : fallback;
}

function normalizeAbsoluteUrl(value, { defaultProtocol = "https:" } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw)) {
    return raw.replace(/\/$/, "");
  }

  if (raw.startsWith("//")) {
    return `${defaultProtocol}${raw}`.replace(/\/$/, "");
  }

  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw);
  const protocol = isLocalHost ? "http:" : defaultProtocol;
  return `${protocol}//${raw}`.replace(/\/$/, "");
}

function buildLocalBackendUrl() {
  const explicitPort = envPositiveNumber("BLS_PRIME_LOCAL_BACKEND_PORT", NaN);
  const fallbackPort = envPositiveNumber("META_ALLOCATOR_PORT", 8765);
  const port = Number.isFinite(explicitPort) ? explicitPort : fallbackPort;
  return `http://127.0.0.1:${port}`;
}

function getDefaultBackendUrl() {
  return envString("BLS_PRIME_DEFAULT_BACKEND_URL", buildLocalBackendUrl());
}

export function getBrandConfig() {
  const appName = envString("NEXT_PUBLIC_BLS_APP_NAME", "Allocator Workspace");
  const publicWorkspaceName = envString("BLS_PRIME_PUBLIC_WORKSPACE_NAME", appName);
  const defaultWorkspaceName = /\bworkspace\b/i.test(appName)
    ? appName
    : `${appName} Workspace`;
  return {
    appName,
    publicWorkspaceName,
    inviteContact: envString("BLS_PRIME_INVITE_CONTACT", "support@example.com"),
    sessionUserName: envString("BLS_PRIME_DEMO_USER_NAME", "Workspace Visitor"),
    sessionUserEmail: envString("BLS_PRIME_DEMO_USER_EMAIL", "visitor@example.com"),
    loginNamePlaceholder: envString("BLS_PRIME_LOGIN_NAME_PLACEHOLDER", "Your name"),
    defaultWorkspaceName: envString("BLS_PRIME_DEFAULT_WORKSPACE_NAME", defaultWorkspaceName),
  };
}

export function getFormattingConfig() {
  return {
    locale: envString("BLS_PRIME_FORMAT_LOCALE", "en-US"),
    currency: envString("BLS_PRIME_FORMAT_CURRENCY", "USD"),
  };
}

export function getWorkspacePolicyConfig() {
  return {
    limits: {
      watchlistItems: envPositiveNumber("BLS_PRIME_LIMIT_WATCHLIST_ITEMS", 24),
      alerts: envPositiveNumber("BLS_PRIME_LIMIT_ALERTS", 20),
      savedViews: envPositiveNumber("BLS_PRIME_LIMIT_SAVED_VIEWS", 12),
      commandHistory: envPositiveNumber("BLS_PRIME_LIMIT_COMMAND_HISTORY", 12),
      escrowDecisions: envPositiveNumber("BLS_PRIME_LIMIT_ESCROW_DECISIONS", 24),
      decisionEvents: envPositiveNumber("BLS_PRIME_LIMIT_DECISION_EVENTS", 24),
      positionStories: envPositiveNumber("BLS_PRIME_LIMIT_POSITION_STORIES", 16),
      counterfactualOutcomes: envPositiveNumber("BLS_PRIME_LIMIT_COUNTERFACTUAL_OUTCOMES", 24),
    },
    escrow: {
      expiryDays: envPositiveNumber("BLS_PRIME_ESCROW_EXPIRY_DAYS", 5),
      readinessDefault: envNumber("BLS_PRIME_ESCROW_DEFAULT_READINESS", 0.45),
    },
  };
}

export function getOperationalConfig() {
  return {
    snapshot: {
      maxAgeHours: envPositiveNumber("BLS_PRIME_SNAPSHOT_MAX_AGE_HOURS", 168),
      maxQuoteStaleDaysWithoutPortfolio: envPositiveNumber("BLS_PRIME_SNAPSHOT_MAX_QUOTE_STALE_DAYS", 3),
      maxAgeHoursWithoutQuotes: envPositiveNumber("BLS_PRIME_SNAPSHOT_MAX_AGE_WITHOUT_QUOTES_HOURS", 36),
    },
  };
}

export function getPublicAppUrl() {
  return normalizeAbsoluteUrl(envString("BLS_PRIME_APP_URL", envString("NEXT_PUBLIC_APP_URL", "http://localhost:3000")), {
    defaultProtocol: "https:",
  });
}

export function getServerConfig() {
  const brand = getBrandConfig();
  const backendBaseUrl =
    envString("BLS_PRIME_BACKEND_URL") ||
    envString("META_ALLOCATOR_BACKEND_URL") ||
    getDefaultBackendUrl();

  return {
    appName: brand.appName,
    publicWorkspaceName: brand.publicWorkspaceName,
    defaultWorkspaceName: brand.defaultWorkspaceName,
    workspaceId: envString("NEXT_PUBLIC_BLS_WORKSPACE_ID", "public-workspace"),
    backendBaseUrl: normalizeAbsoluteUrl(backendBaseUrl, { defaultProtocol: "https:" }),
    streamIntervalMs: envPositiveNumber("BLS_PRIME_STREAM_INTERVAL_MS", 3500),
    alphaMode: envString("BLS_PRIME_ALPHA_MODE", "private"),
    inviteContact: brand.inviteContact,
    sessionUserName: brand.sessionUserName,
    sessionUserEmail: brand.sessionUserEmail,
    loginNamePlaceholder: brand.loginNamePlaceholder,
    sharedAccessToken: envString("BLS_PRIME_SHARED_ACCESS_TOKEN"),
    sharedAccessQueryKey: envString("BLS_PRIME_SHARED_ACCESS_QUERY_KEY", "access"),
    sharedAccessCookieName: envString("BLS_PRIME_SHARED_ACCESS_COOKIE_NAME", "workspace_access"),
  };
}
