import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

// Homepage behavior is exercised in tests-e2e/filing-research.spec.mjs.

test("Breakpoint shows a temporary reading instead of a failure when storage is unavailable", () => {
  const hero = source("components/breakpoint/breakpoint-hero.jsx");
  assert.match(hero, /result\?\.run/);
  assert.match(hero, /temporaryRun/);
  assert.match(hero, /La lectura está lista/);
});

test("Breakpoint result gives sources, limits and terminal bridge a first-class place", () => {
  const result = source("components/breakpoint/breakpoint-result.jsx");
  const page = source("app/breakpoint/[ticker]/[runId]/page.js");
  assert.match(result, /Data and provenance|Datos y procedencia/);
  assert.match(result, /What this reading cannot tell you|Lo que esta lectura no puede decir/);
  assert.match(result, /See full valuation|Ver valoración completa/);
  assert.match(result, /aria-live/);
  assert.match(result, /href=\{links\.company\}/);
  assert.match(result, /href=\{links\.queue\}/);
  assert.doesNotMatch(result, /href="\/aurora"/);
  assert.match(page, /BreakpointResult/);
});

test("mobile keeps the ticker action before the decorative valuation surface", () => {
  const styles = source("components/breakpoint/breakpoint.module.css");
  assert.doesNotMatch(styles, /\.surface\{order:-1\}/);
});
