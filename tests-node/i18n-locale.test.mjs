import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const locale = await import("../lib/i18n/locale.js");
const root = path.resolve(import.meta.dirname, "..");

test("Spanish-only routes never persist an incompatible query language", () => {
  assert.equal(typeof locale.shouldPersistQueryLocale, "function");
  assert.equal(locale.shouldPersistQueryLocale({ pathname: "/aurora", queryLanguage: "en" }), false);
  assert.equal(locale.shouldPersistQueryLocale({ pathname: "/aurora/", queryLanguage: "en" }), false);
  assert.equal(locale.shouldPersistQueryLocale({ pathname: "/valuation-os-lab", queryLanguage: "en" }), false);
  assert.equal(locale.resolveRequestLocale({ pathname: "/aurora/", queryLanguage: "en" }), "es");
});

test("localized routes still persist an explicit supported language", () => {
  assert.equal(typeof locale.shouldPersistQueryLocale, "function");
  assert.equal(locale.shouldPersistQueryLocale({ pathname: "/", queryLanguage: "en" }), true);
  assert.equal(locale.shouldPersistQueryLocale({ pathname: "/factorlab", queryLanguage: "es" }), true);
  assert.equal(locale.shouldPersistQueryLocale({ pathname: "/", queryLanguage: "fr" }), false);
});

test("the client preference layer applies the same route persistence rule", () => {
  const source = fs.readFileSync(path.join(root, "components/language-layer.jsx"), "utf8");
  assert.match(source, /shouldPersistQueryLocale/);
  assert.match(source, /pathname:\s*window\.location\.pathname/);
});
