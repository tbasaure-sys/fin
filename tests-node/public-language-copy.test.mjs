import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("landing and Breakpoint use one five-step decision narrative", () => {
  const home = source("components/public-home-experience.jsx");
  const hero = source("components/breakpoint/breakpoint-hero.jsx");
  const result = source("components/breakpoint/breakpoint-result.jsx");
  assert.match(home, /Cinco decisiones conectadas/);
  assert.match(home, /title: "Descubrir"/);
  assert.match(home, /title: "Entender el precio"/);
  assert.match(home, /title: "Construir la tesis"/);
  assert.match(home, /title: "Medir el riesgo"/);
  assert.match(home, /title: "Monitorear"/);
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

test("public copy distinguishes the frozen homepage example from live FactorLab", () => {
  const home = source("components/public-home-experience.jsx");
  const factorlab = source("components/factorlab-workstation.jsx");
  assert.match(home, /Ejemplo congelado/);
  assert.match(home, /Frozen example/);
  assert.match(home, /No son datos en vivo/);
  assert.match(factorlab, /Resultados construidos al solicitar la p[aá]gina con mercado actual/);
  assert.match(factorlab, /No mostramos datos de ejemplo en su lugar/);
  assert.match(factorlab, /\/api\/public\/factorlab/);
});

test("Breakpoint keeps localized failure copy at both the API and UI boundaries", () => {
  const hero = source("components/breakpoint/breakpoint-hero.jsx");
  const result = source("components/breakpoint/breakpoint-result.jsx");
  const route = source("app/api/public/breakpoints/route.js");
  assert.doesNotMatch(hero, /error instanceof Error \? error\.message/);
  assert.doesNotMatch(result, /error instanceof Error \? error\.message/);
  assert.match(route, /No pudimos construir esta lectura con datos p[uú]blicos actuales/);
});
