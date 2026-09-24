import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { isSpanishOnlyRoute, resolveRequestLocale } from "../lib/i18n/locale.js";

test("link prefetches never persist the language cookie", async () => {
  const middleware = await readFile(new URL("../middleware.js", import.meta.url), "utf8");
  assert.match(middleware, /next-router-prefetch/);
  assert.match(middleware, /!isPrefetch && shouldPersistQueryLocale/);
});

test("the client falls back to the server-rendered locale before the browser language", async () => {
  const source = await readFile(new URL("../components/language-preference.js", import.meta.url), "utf8");
  const documentFallback = source.indexOf("document.documentElement.lang;");
  const browserFallback = source.indexOf("window.navigator.language");
  assert.ok(documentFallback > 0 && documentFallback < browserFallback);
  assert.match(source, /isSpanishOnlyRoute\(window\.location\.pathname\)\) return "es"/);
});

test("Spanish-only routes stay Spanish regardless of query or cookie", () => {
  assert.equal(isSpanishOnlyRoute("/aurora"), true);
  assert.equal(isSpanishOnlyRoute("/aurora/"), true);
  assert.equal(isSpanishOnlyRoute("/example"), false);
  assert.equal(resolveRequestLocale({ pathname: "/aurora", queryLanguage: "en", cookieLanguage: "en" }), "es");
  assert.equal(resolveRequestLocale({ pathname: "/example", cookieLanguage: "en" }), "en");
});
