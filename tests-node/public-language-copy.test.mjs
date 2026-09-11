import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

// Homepage behavior is exercised in tests-e2e/filing-research.spec.mjs.

test("module surfaces explain the job in common words", () => {
  const aurora = source("app/valuation-os-lab/page.jsx");
  const verdict = source("components/aurora-verdict-card.jsx");
  const factorlab = source("components/factorlab-workstation.jsx");
  const stress = source("components/stress-engine-public-page.jsx");
  assert.match(aurora, /Valoraci[oó]n de empresas/);
  assert.match(aurora, /Diferencia entre precio y valor estimado/);
  assert.match(verdict, /Lectura de valoraci[oó]n/);
  assert.match(factorlab, /Encuentra empresas que vale la pena revisar/);
  assert.match(factorlab, /Prioridad de revisi[oó]n/);
  assert.match(stress, /Riesgo de cartera/);
  assert.match(stress, /qu[eé] puede pasar si el mercado cae/i);
});

// Homepage behavior is exercised in tests-e2e/filing-research.spec.mjs.

test("Breakpoint keeps localized failure copy at both the API and UI boundaries", () => {
  const hero = source("components/breakpoint/breakpoint-hero.jsx");
  const result = source("components/breakpoint/breakpoint-result.jsx");
  const route = source("app/api/public/breakpoints/route.js");
  assert.doesNotMatch(hero, /error instanceof Error \? error\.message/);
  assert.doesNotMatch(result, /error instanceof Error \? error\.message/);
  assert.match(route, /No pudimos construir esta lectura con datos p[uú]blicos actuales/);
});
