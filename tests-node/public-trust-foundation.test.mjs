import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const ROOT = process.cwd();

function source(path) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

test("locale contract respects explicit query, cookie, and route defaults", async () => {
  const modulePath = ROOT + "/lib/i18n/locale.js";
  assert.equal(existsSync(modulePath), true, "lib/i18n/locale.js must exist");

  const {
    LANGUAGE_COOKIE_KEY,
    normalizeLocale,
    resolveRequestLocale,
    routeDefaultLocale,
  } = await import("../lib/i18n/locale.js");

  assert.equal(LANGUAGE_COOKIE_KEY, "blsprime_language_preference");
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("es"), "es");
  assert.equal(normalizeLocale("fr", "es"), "es");
  // Every public route defaults to Spanish. No route may default to a language
  // different from the document lang, or the first paint arrives mixed.
  assert.equal(routeDefaultLocale("/aurora"), "es");
  assert.equal(routeDefaultLocale("/valuation-os-lab"), "es");
  assert.equal(routeDefaultLocale("/factorlab"), "es");
  assert.equal(routeDefaultLocale("/stress"), "es");
  assert.equal(routeDefaultLocale("/"), "es");
  assert.equal(resolveRequestLocale({ pathname: "/", queryLanguage: "en", cookieLanguage: "es" }), "en");
  assert.equal(resolveRequestLocale({ pathname: "/", cookieLanguage: "en" }), "en");
  assert.equal(resolveRequestLocale({ pathname: "/aurora", cookieLanguage: "en" }), "es");
  assert.equal(resolveRequestLocale({ pathname: "/stress", cookieLanguage: "es" }), "es");
});

test("legal copy is selected on the server from the request locale", () => {
  const terms = source("app/terms/page.js");
  assert.match(terms, /headers\(\)\.get\(LANGUAGE_REQUEST_HEADER\)/);
  assert.match(terms, /Términos de Servicio/);
  assert.match(terms, /const copy = COPY\[locale\]/);
});

test("automatic cache recovery never clears browser storage", () => {
  const layout = source("app/layout.js");
  const recovery = source("lib/client/cache-recovery.js");
  assert.match(layout, /buildCacheRecoveryScript/);
  assert.doesNotMatch(recovery, /window\.localStorage\.clear\(\)/);
  assert.doesNotMatch(recovery, /window\.sessionStorage\.clear\(\)/);
  assert.match(recovery, /window\.caches\.delete/);
});

test("manual recovery requires confirmation and preserves language", async () => {
  const { GET } = await import("../app/recover/route.js");

  const preview = await GET(new Request("http://localhost/recover"));
  const previewHtml = await preview.text();
  assert.equal(preview.headers.get("Clear-Site-Data"), null);
  assert.match(previewHtml, /confirm=1/);
  assert.match(previewHtml, /without clearing|sin borrar/i);
  assert.doesNotMatch(previewHtml, /localStorage\.clear\(\)/);

  const confirmed = await GET(new Request("http://localhost/recover?confirm=1"));
  const confirmedHtml = await confirmed.text();
  assert.equal(confirmed.headers.get("Clear-Site-Data"), '"cache"');
  assert.equal(confirmed.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.match(confirmedHtml, /blsprime_language_preference/);
  assert.match(confirmedHtml, /localStorage\.clear\(\)/);
  assert.match(confirmedHtml, /location\.replace\("\/aurora\?recovered=1"\)/);
});

test("public entry points distinguish sign in, workspace creation, and sample data", () => {
  const home = source("components/public-home-experience.jsx");
  const shellNavigation = source("lib/public-shell-navigation.js");
  assert.match(shellNavigation, /intent=signin/);
  assert.match(shellNavigation, /\/signup\?lang=/);
  assert.match(home, /Frozen example/);
  assert.match(home, /Ejemplo congelado/);
  assert.match(home, /href: "\/g820"/);
  assert.match(shellNavigation, /id: "g820"/);
  assert.doesNotMatch(home, /const displayBrand = "BL'S"/);
});

test("Stress gate accessibility contract traps and restores focus", () => {
  const gate = source("components/stress-account-gate.jsx");
  assert.match(gate, /createPortal/);
  assert.match(gate, /\.inert\s*=/);
  assert.match(gate, /event\.key === "Tab"/);
  assert.match(gate, /triggerRef\.current\?\.focus/);
});

test("canonical SEO surfaces exist and private routes are noindex", () => {
  assert.equal(existsSync(ROOT + "/app/robots.js"), true, "app/robots.js must exist");
  assert.equal(existsSync(ROOT + "/app/sitemap.js"), true, "app/sitemap.js must exist");

  const robots = source("app/robots.js");
  const sitemap = source("app/sitemap.js");
  const auroraMetadata = source("app/aurora/page.js");
  const privatePage = source("app/app/page.js");
  const loginPage = source("app/login/page.js");

  assert.match(robots, /"\/app"/);
  assert.match(robots, /"\/login"/);
  assert.match(robots, /"\/recover"/);
  assert.match(sitemap, /"\/aurora"/);
  assert.match(sitemap, /"\/factorlab"/);
  assert.match(sitemap, /"\/g820"/);
  assert.match(sitemap, /"\/stress"/);
  assert.match(auroraMetadata, /canonical:\s*"\/aurora"/);
  assert.match(privatePage, /index:\s*false/);
  assert.match(loginPage, /index:\s*false/);
});
