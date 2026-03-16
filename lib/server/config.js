const DEFAULT_BACKEND_URL = "https://web-production-dbde3.up.railway.app";

export function getServerConfig() {
  const backendBaseUrl =
    process.env.BLS_PRIME_BACKEND_URL ||
    process.env.META_ALLOCATOR_BACKEND_URL ||
    DEFAULT_BACKEND_URL;

  return {
    appName: process.env.NEXT_PUBLIC_BLS_APP_NAME || "BLS Prime",
    workspaceId: process.env.NEXT_PUBLIC_BLS_WORKSPACE_ID || "alpha-retail",
    backendBaseUrl: backendBaseUrl.replace(/\/$/, ""),
    streamIntervalMs: Number(process.env.BLS_PRIME_STREAM_INTERVAL_MS || 3500),
    alphaMode: process.env.BLS_PRIME_ALPHA_MODE || "invite-only",
    inviteContact: process.env.BLS_PRIME_INVITE_CONTACT || "founders@blsprime.com",
    sessionUserName: process.env.BLS_PRIME_DEMO_USER_NAME || "Alpha Operator",
    sessionUserEmail: process.env.BLS_PRIME_DEMO_USER_EMAIL || "alpha@blsprime.com",
    sharedAccessToken: process.env.BLS_PRIME_SHARED_ACCESS_TOKEN || "",
    sharedAccessQueryKey: process.env.BLS_PRIME_SHARED_ACCESS_QUERY_KEY || "alpha",
    sharedAccessCookieName: process.env.BLS_PRIME_SHARED_ACCESS_COOKIE_NAME || "bls_prime_access",
  };
}
