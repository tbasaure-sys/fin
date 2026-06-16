import test from "node:test";
import assert from "node:assert/strict";

import { shouldUseConfiguredBackendForPhantom } from "../lib/server/phantom-diversification.js";

test("phantom diversification does not depend on the implicit local backend", () => {
  const previousBackendUrl = process.env.BLS_PRIME_BACKEND_URL;
  const previousMetaBackendUrl = process.env.META_ALLOCATOR_BACKEND_URL;
  delete process.env.BLS_PRIME_BACKEND_URL;
  delete process.env.META_ALLOCATOR_BACKEND_URL;

  try {
    assert.equal(shouldUseConfiguredBackendForPhantom("http://127.0.0.1:8765"), false);
    assert.equal(shouldUseConfiguredBackendForPhantom(""), false);
  } finally {
    if (previousBackendUrl === undefined) {
      delete process.env.BLS_PRIME_BACKEND_URL;
    } else {
      process.env.BLS_PRIME_BACKEND_URL = previousBackendUrl;
    }
    if (previousMetaBackendUrl === undefined) {
      delete process.env.META_ALLOCATOR_BACKEND_URL;
    } else {
      process.env.META_ALLOCATOR_BACKEND_URL = previousMetaBackendUrl;
    }
  }
});

test("phantom diversification uses an explicitly configured backend", () => {
  const previousBackendUrl = process.env.BLS_PRIME_BACKEND_URL;
  const previousMetaBackendUrl = process.env.META_ALLOCATOR_BACKEND_URL;
  process.env.BLS_PRIME_BACKEND_URL = "https://backend.example";
  delete process.env.META_ALLOCATOR_BACKEND_URL;

  try {
    assert.equal(shouldUseConfiguredBackendForPhantom("https://backend.example"), true);
  } finally {
    if (previousBackendUrl === undefined) {
      delete process.env.BLS_PRIME_BACKEND_URL;
    } else {
      process.env.BLS_PRIME_BACKEND_URL = previousBackendUrl;
    }
    if (previousMetaBackendUrl === undefined) {
      delete process.env.META_ALLOCATOR_BACKEND_URL;
    } else {
      process.env.META_ALLOCATOR_BACKEND_URL = previousMetaBackendUrl;
    }
  }
});
