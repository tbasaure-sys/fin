import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { NEVER_RENDER, SECTIONS, VERDICT } from "../lib/aurora-copy-map.js";

const USER_FACING_FILES = [
  "app/valuation-os-lab/page.jsx",
  "components/aurora-verdict-card.jsx",
  "components/public-home-experience.jsx",
  "components/factorlab-workstation.jsx",
  "components/terminal-app.jsx",
  "app/macro-brain/page.js",
  "app/terms/page.js",
  "app/error.js",
  "app/recover/route.js",
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("AURORA product copy map exposes the verdict ladder", () => {
  assert.deepEqual(Object.keys(VERDICT).sort(), ["ABSTAIN", "PASS", "RANK", "RESEARCH"]);
  assert.equal(SECTIONS.length, 5);
  assert.equal(SECTIONS[0].label, "Que esta asumiendo el precio");
});

test("user-facing AURORA surfaces do not render blocked engine vocabulary", () => {
  const blocked = NEVER_RENDER.map((term) => [term, new RegExp(escapeRegExp(term), "i")]);

  for (const file of USER_FACING_FILES) {
    const source = readFileSync(file, "utf8");
    for (const [term, pattern] of blocked) {
      assert.equal(pattern.test(source), false, `${file} leaks engine vocabulary: ${term}`);
    }
  }
});

test("public Stress Engine CTAs gate into the portfolio workspace instead of valuation", () => {
  const homeSource = readFileSync("components/public-home-experience.jsx", "utf8");
  const stressSource = readFileSync("components/stress-engine-public-page.jsx", "utf8");
  const gateSource = readFileSync("components/stress-account-gate.jsx", "utf8");
  const loginSource = readFileSync("app/login/page.js", "utf8");
  const terminalSource = readFileSync("components/terminal-app.jsx", "utf8");

  assert.match(homeSource, /title:\s*"Stress Engine"[\s\S]*requiresAccount:\s*true/);
  assert.match(homeSource, /<StressAccountGate/);
  assert.match(stressSource, /<StressAccountGate/);
  assert.match(stressSource, /<StressAccountGate className=\{styles\.actionButton\}/);
  assert.match(gateSource, /PORTFOLIO_WORKSPACE_HREF\s*=\s*"\/app#risk"/);
  assert.match(gateSource, /\/login\?intent=\$\{intent\}&lang=\$\{language/);
  assert.match(loginSource, /DEFAULT_NEXT\s*=\s*"\/app#risk"/);
  assert.match(loginSource, /href="\/aurora"/);
  assert.match(terminalSource, /stress:\s*"risk"/);
  assert.match(terminalSource, /positions:\s*"holdings"/);
});
