function readBearerToken(request) {
  const header = String(request.headers.get("authorization") || "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export function isValidInternalRefreshToken(request) {
  const expected =
    String(process.env.BLS_PRIME_INTERNAL_REFRESH_TOKEN || "").trim() ||
    String(process.env.CRON_SECRET || "").trim();

  if (!expected) return false;
  return readBearerToken(request) === expected;
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
