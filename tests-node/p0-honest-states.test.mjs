import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

test("Breakpoint can never stay loading forever", () => {
  const hero = source("components/breakpoint/breakpoint-hero.jsx");
  const route = source("app/api/public/breakpoints/route.js");

  // Client aborts the request instead of waiting on the provider indefinitely.
  assert.match(hero, /AbortController/);
  assert.match(hero, /signal:\s*controller\.signal/);
  assert.match(hero, /REQUEST_TIMEOUT_MS/);
  assert.match(hero, /setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]*controller\.abort\(\)/);

  // Every failure path lands on a terminal state with a retry affordance.
  assert.match(hero, /status:\s*"error"/);
  assert.match(hero, /copy\.retry/);
  assert.match(hero, /fail\("TIMEOUT"\)/);
  assert.match(hero, /fail\("NETWORK"\)/);

  // Server side stops the run too, so the request cannot hang a worker.
  assert.match(route, /RUN_TIMEOUT_MS/);
  assert.match(route, /withTimeout\(/);
  assert.match(route, /code:\s*timedOut\s*\?\s*"TIMEOUT"/);
});

test("Breakpoint validates the ticker before spending a request", () => {
  const hero = source("components/breakpoint/breakpoint-hero.jsx");
  assert.match(hero, /TICKER_PATTERN/);
  assert.match(hero, /function validateTicker/);
  assert.match(hero, /EMPTY:/);
  assert.match(hero, /FORMAT:/);
});

test("no financial figure is shown without a date or an explicit missing-data state", () => {
  const hero = source("components/breakpoint/breakpoint-hero.jsx");
  const panel = source("components/equity-research-panel.jsx");
  const shell = source("components/workspace/shell.module.css");

  assert.match(hero, /function resolveAsOf/);
  assert.match(hero, /asOfUnknown/);
  assert.match(panel, /const MISSING_DATE_LABEL = "Sin fecha en la fuente"/);
  assert.match(panel, /function isKnownMarketDate/);
  assert.match(panel, /data-missing=\{research \?/);
  assert.match(shell, /\.researchSignalGrid div\[data-missing="true"\]/);
});

test("illustrative homepage figures never animate like live market data", () => {
  const home = source("components/public-home-experience.jsx");
  assert.match(home, /SAMPLE_METRICS/);
  assert.match(home, /Object\.freeze/);
  // The old drift loop mutated example metrics on an interval.
  assert.doesNotMatch(home, /setMetrics/);
  // The sample disclosure must be readable in the demo header.
  assert.match(home, /\{copy\.demo\.disclosure\}/);
  assert.doesNotMatch(home, /aria-hidden[^>]*>\{copy\.demo\.disclosure/);
});

test("no CTA promises a trial and delivers only a signup wall", () => {
  const home = source("components/public-home-experience.jsx");
  const stress = source("components/stress-engine-public-page.jsx");

  assert.doesNotMatch(home, /cta: "Probar mi cartera"/);
  assert.doesNotMatch(home, /cta: "Test my portfolio"/);
  assert.match(home, /requiere cuenta/i);
  assert.match(home, /account required/i);
  assert.match(home, /requiresAccount:\s*true/);
  assert.match(home, /<StressAccountGate/);
  assert.match(stress, /requiere cuenta/);
  assert.match(stress, /account required/);
});

test("the homepage declares exactly one h1", () => {
  const home = source("components/public-home-experience.jsx");
  const hero = source("components/breakpoint/breakpoint-hero.jsx");
  assert.equal((home.match(/<h1[\s>]/g) || []).length, 0);
  assert.equal((hero.match(/<h1[\s>]/g) || []).length, 1);
});

test("every public route resolves to the same default language", async () => {
  const { routeDefaultLocale, resolveRequestLocale } = await import("../lib/i18n/locale.js");
  for (const route of ["/", "/aurora", "/factorlab", "/stress", "/valuation-os-lab", "/terms", "/privacy"]) {
    assert.equal(routeDefaultLocale(route), "es", `${route} must default to es`);
  }
  // An explicit preference still wins outside Spanish-only routes.
  assert.equal(resolveRequestLocale({ pathname: "/factorlab", cookieLanguage: "en" }), "en");
  assert.equal(resolveRequestLocale({ pathname: "/stress", queryLanguage: "en" }), "en");
});

test("SEO metadata is generated per locale, not hardcoded in English", () => {
  const home = source("app/page.js");
  const layout = source("app/layout.js");
  const terms = source("app/terms/page.js");
  const factorlab = source("app/factorlab/page.js");
  const stress = source("app/stress/page.js");
  const login = source("app/login/page.js");

  for (const [file, contents] of [
    ["app/page.js", home],
    ["app/layout.js", layout],
    ["app/terms/page.js", terms],
    ["app/factorlab/page.js", factorlab],
    ["app/stress/page.js", stress],
    ["app/login/page.js", login],
  ]) {
    assert.match(contents, /export function generateMetadata/, `${file} must build metadata per request`);
    assert.match(contents, /LANGUAGE_REQUEST_HEADER/, `${file} must read the request locale`);
  }
  // The product does not yet meet the bar this claim implies.
  assert.doesNotMatch(home, /Institutional Equity Research Terminal/);
  assert.doesNotMatch(layout, /Institutional Equity Research Terminal/);
});

test("a privacy policy exists and is reachable from the surfaces that collect data", () => {
  assert.ok(exists("app/privacy/page.js"), "app/privacy/page.js must exist");

  const privacy = source("app/privacy/page.js");
  const home = source("components/public-home-experience.jsx");
  const login = source("app/login/page.js");
  const sitemap = source("app/sitemap.js");

  assert.match(privacy, /Pol[ií]tica de Privacidad/);
  assert.match(privacy, /Privacy Policy/);
  assert.match(home, /\/privacy\?lang=/);
  assert.match(login, /\/privacy\?lang=/);
  assert.match(login, /\/terms\?lang=/);
  assert.match(sitemap, /path: "\/privacy"/);
});

test("signup sells the workspace, not a single engine", () => {
  const login = source("app/login/page.js");
  assert.match(login, /Guarda investigaciones, conserva su evidencia visible y mide su impacto en tu cartera/);
  assert.match(login, /Save research, keep its evidence visible, and measure its impact on your portfolio/);
  assert.doesNotMatch(login, /Monitoreo y falsificadores/);
  assert.match(login, /legalStored/);
});
