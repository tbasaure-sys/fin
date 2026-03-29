import test from "node:test";
import assert from "node:assert/strict";

import { getPublicAppUrl, getServerConfig } from "../lib/server/config.js";

test("getServerConfig normalizes a bare backend host into an absolute https url", () => {
  const previous = process.env.BLS_PRIME_BACKEND_URL;

  process.env.BLS_PRIME_BACKEND_URL = "web-production-dbde3.up.railway.app";
  try {
    assert.equal(getServerConfig().backendBaseUrl, "https://web-production-dbde3.up.railway.app");
  } finally {
    if (previous === undefined) {
      delete process.env.BLS_PRIME_BACKEND_URL;
    } else {
      process.env.BLS_PRIME_BACKEND_URL = previous;
    }
  }
});

test("getServerConfig preserves explicit local backend schemes", () => {
  const previous = process.env.BLS_PRIME_BACKEND_URL;

  process.env.BLS_PRIME_BACKEND_URL = "http://127.0.0.1:8765/";
  try {
    assert.equal(getServerConfig().backendBaseUrl, "http://127.0.0.1:8765");
  } finally {
    if (previous === undefined) {
      delete process.env.BLS_PRIME_BACKEND_URL;
    } else {
      process.env.BLS_PRIME_BACKEND_URL = previous;
    }
  }
});

test("getPublicAppUrl normalizes a bare host into an absolute https url", () => {
  const previous = process.env.BLS_PRIME_APP_URL;

  process.env.BLS_PRIME_APP_URL = "allocator.example.com";
  try {
    assert.equal(getPublicAppUrl(), "https://allocator.example.com");
  } finally {
    if (previous === undefined) {
      delete process.env.BLS_PRIME_APP_URL;
    } else {
      process.env.BLS_PRIME_APP_URL = previous;
    }
  }
});
