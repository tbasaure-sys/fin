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
