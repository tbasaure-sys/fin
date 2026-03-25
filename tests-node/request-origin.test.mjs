import test from "node:test";
import assert from "node:assert/strict";

import { getRequestOrigin, resolveAppUrl } from "../lib/request-origin.js";

test("getRequestOrigin prefers forwarded host on deployment requests", () => {
  const request = new Request("https://ignored.example/api/billing/checkout", {
    headers: {
      host: "ignored.example",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "allocator-live.vercel.app",
    },
  });

  assert.equal(getRequestOrigin(request), "https://allocator-live.vercel.app");
});

test("resolveAppUrl falls back to the configured app URL when request context is absent", () => {
  assert.equal(resolveAppUrl(null, "https://stable.example.com"), "https://stable.example.com");
});
