import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("landing and Breakpoint use the four-question decision narrative", () => {
  const home = source("components/public-home-experience.jsx");
  const hero = source("components/breakpoint/breakpoint-hero.jsx");
  const result = source("components/breakpoint/breakpoint-result.jsx");
  assert.match(home, /Antes de invertir, responde cuatro preguntas/);
  assert.match(home, /\u00bfQu[eé] valor tiene\?/i);
  assert.match(home, /B[uú]squeda de oportunidades/);
  assert.match(hero, /Lo que el precio necesita/i);
  assert.match(result, /retorno exigido a 5 a[nñ]os/i);
  assert.doesNotMatch(hero, /MARKET-CLEARING SURFACE/);
  assert.doesNotMatch(result, /hurdle:\s*"/i);
});

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

test("public copy calls samples examples and does not promise unavailable work", () => {
  const home = source("components/public-home-experience.jsx");
  const factorlab = source("components/factorlab-workstation.jsx");
  assert.match(home, /Ejemplo con datos ilustrativos/);
  assert.match(home, /Illustrative example with sample data/);
  assert.match(factorlab, /Ver ejemplo|Pr[oó]ximamente|Solicitar acceso/);
});

test("Breakpoint keeps localized failure copy at both the API and UI boundaries", () => {
  const hero = source("components/breakpoint/breakpoint-hero.jsx");
  const result = source("components/breakpoint/breakpoint-result.jsx");
  const route = source("app/api/public/breakpoints/route.js");
  assert.doesNotMatch(hero, /error instanceof Error \? error\.message/);
  assert.doesNotMatch(result, /error instanceof Error \? error\.message/);
  assert.match(route, /No pudimos construir esta lectura con datos públicos actuales/);
});
