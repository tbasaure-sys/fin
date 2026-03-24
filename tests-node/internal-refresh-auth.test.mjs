import test from "node:test";
import assert from "node:assert/strict";

import {
  isValidInternalRefreshToken,
  requireInternalRefreshAccess,
} from "../lib/server/internal-refresh-auth.js";

test("internal refresh auth accepts bearer token from explicit env var", () => {
  process.env.BLS_PRIME_INTERNAL_REFRESH_TOKEN = "secret-token";
  process.env.CRON_SECRET = "";

  const request = new Request("https://example.com/api/internal/refresh", {
    headers: {
      authorization: "Bearer secret-token",
    },
  });

  assert.equal(isValidInternalRefreshToken(request), true);
  assert.equal(requireInternalRefreshAccess(request), null);
});

test("internal refresh auth rejects missing or invalid token", async () => {
  process.env.BLS_PRIME_INTERNAL_REFRESH_TOKEN = "secret-token";
  process.env.CRON_SECRET = "";

  const request = new Request("https://example.com/api/internal/refresh");
  assert.equal(isValidInternalRefreshToken(request), false);

  const response = requireInternalRefreshAccess(request);
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.match(payload.error, /Unauthorized/i);
});
