import assert from "node:assert/strict";
import test from "node:test";

import { buildCacheRecoveryScript } from "../lib/client/cache-recovery.js";

test("cache recovery bootstrap is valid browser JavaScript", () => {
  const source = buildCacheRecoveryScript("test-version");

  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /_next\/static/);
  assert.doesNotMatch(source, /if \(targetUrl && \/\/_next/);
});
