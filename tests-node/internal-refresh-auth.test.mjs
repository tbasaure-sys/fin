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

test("internal refresh auth accepts Vercel cron secret when both tokens exist", () => {
  process.env.BLS_PRIME_INTERNAL_REFRESH_TOKEN = "internal-secret";
  process.env.CRON_SECRET = "cron-secret";

  const cronRequest = new Request("https://example.com/api/cron/g820", {
    headers: {
      authorization: "Bearer cron-secret",
    },
  });
  const internalRequest = new Request("https://example.com/api/internal/refresh", {
    headers: {
      authorization: "Bearer internal-secret",
    },
  });

  assert.equal(isValidInternalRefreshToken(cronRequest), true);
  assert.equal(isValidInternalRefreshToken(internalRequest), true);
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
