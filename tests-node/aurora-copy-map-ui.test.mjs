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
  assert.equal(SECTIONS[0].label, "Qué está asumiendo el precio");
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

  assert.match(homeSource, /engine:\s*"Stress"[\s\S]*requiresAccount:\s*true/);
  assert.match(homeSource, /<StressAccountGate/);
  assert.match(stressSource, /<StressAccountGate/);
  assert.match(stressSource, /<StressAccountGate className=\{styles\.actionButton\}/);
  assert.match(gateSource, /PORTFOLIO_WORKSPACE_HREF\s*=\s*"\/app#holdings"/);
  assert.match(gateSource, /\/login\?intent=\$\{intent\}&lang=\$\{language/);
  assert.match(loginSource, /DEFAULT_NEXT\s*=\s*"\/app#holdings"/);
  assert.match(loginSource, /href="\/aurora"/);
  assert.match(terminalSource, /stress:\s*"holdings"/);
  assert.match(terminalSource, /macro:\s*"mosaic"/);
  assert.match(terminalSource, /factorlab:\s*"aurora"/);
  assert.match(terminalSource, /positions:\s*"holdings"/);
});

test("workspace sidebar names the channels section as Channel Finder in English", () => {
  const terminalSource = readFileSync("components/terminal-app.jsx", "utf8");

  assert.match(terminalSource, /channels:\s*"Channel Finder"/);
  assert.doesNotMatch(terminalSource, /channels:\s*"Portfolio intelligence"/);
});

test("every AURORA decision state renders the explanation provider and model disclosure", () => {
  const source = readFileSync("components/equity-research-panel.jsx", "utf8");
  const summaryStart = source.indexOf("function AuroraDecisionSummary");
  const previewStart = source.indexOf("function AuroraConditionalRangePreview");
  const summarySource = source.slice(summaryStart, previewStart);

  assert.match(summarySource, /auroraExplanationProviderLabel\(aurora\.explanation\)/);
  assert.match(source, /Proveedor de explicación/);
  assert.match(source, /Hugging Face/);
  assert.match(source, /sin modelo generativo/);
  assert.match(source, /no disponible · sin modelo generativo/);
});

test("equity research renders market-implied and blocked AURORA states even when no range exists", () => {
  const source = readFileSync("components/equity-research-panel.jsx", "utf8");
  const stateStart = source.indexOf("const researchStateLabel");
  const stateEnd = source.indexOf("const openIssueLabel", stateStart);
  const metricLabel = source.indexOf('label={auroraValuation?.status === "market_implied"');
  const metricStart = source.lastIndexOf("<ResearchMetric", metricLabel);
  const metricEnd = source.indexOf("/>", metricLabel);
  const stateSource = source.slice(stateStart, stateEnd);
  const metricSource = source.slice(metricStart, metricEnd);

  assert.match(stateSource, /auroraValuation\?\.status === "market_implied"/);
  assert.match(stateSource, /auroraValuation\?\.status === "blocked"/);
  assert.doesNotMatch(stateSource, /auroraRangeLabel && !valuationPresentation\.showValuationFigures/);
  assert.match(metricSource, /auroraValuation\?\.status === "market_implied"/);
  assert.match(metricSource, /auroraValuation\?\.status === "blocked"/);
  assert.doesNotMatch(metricSource, /auroraRangeLabel && !valuationPresentation\.showValuationFigures/);
});

test("AURORA expectation formatting honors canonical percent, multiple, and currency units", () => {
  const source = readFileSync("components/equity-research-panel.jsx", "utf8");
  const formatterStart = source.indexOf("function auroraExpectationValue");
  const formatterEnd = source.indexOf("function auroraWhyRows", formatterStart);
  const formatterSource = source.slice(formatterStart, formatterEnd);

  assert.match(formatterSource, /unit === "percent"[\s\S]*number \* 100/);
  assert.match(formatterSource, /unit === "x"[\s\S]*`\$\{number\.toFixed\(2\)\}x`/);
  assert.match(formatterSource, /unit === "currency"[\s\S]*compactCurrency\(number, currency\)/);
});
