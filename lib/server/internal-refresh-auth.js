function readBearerToken(request) {
  const header = String(request.headers.get("authorization") || "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export function isValidInternalRefreshToken(request) {
  const expectedTokens = [
    process.env.BLS_PRIME_INTERNAL_REFRESH_TOKEN,
    process.env.CRON_SECRET,
  ]
    .map((token) => String(token || "").trim())
    .filter(Boolean);

  if (expectedTokens.length === 0) return false;
  return expectedTokens.includes(readBearerToken(request));
}

export function requireInternalRefreshAccess(request) {
  if (isValidInternalRefreshToken(request)) return null;

  return Response.json(
    { error: "Unauthorized internal refresh request." },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
