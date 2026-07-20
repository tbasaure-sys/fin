import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const terminalSource = readFileSync("components/terminal-app.jsx", "utf8");

test("the authenticated workspace exposes the full portfolio structure diagnostic", () => {
  assert.match(terminalSource, /const PHANTOM_MAX_HOLDINGS = 60;/);
  assert.match(terminalSource, /data-testid="portfolio-effective-bets"/);
  assert.match(terminalSource, /data-testid="portfolio-cluster-list"/);
  assert.match(terminalSource, /data-testid="portfolio-correlation-matrix"/);
  assert.match(terminalSource, /void runAnalysis\(\);/);
});

test("portfolio confirmation is shown before analytics in the holdings workspace", () => {
  const holdingsSection = terminalSource.slice(
    terminalSource.indexOf('case "holdings":'),
    terminalSource.indexOf('case "holdings":') + 5000,
  );
  assert.ok(holdingsSection.indexOf("<HoldingsPanel") < holdingsSection.indexOf("<PortfolioPanel"));
  assert.match(holdingsSection, /<SimplePhantomDiversificationPanel/);
  assert.match(holdingsSection, /\{hasPortfolioHoldings \? \(/);
  assert.match(terminalSource, /data-testid="portfolio-empty-hero"/);
  assert.match(terminalSource, /hasPortfolioHoldings \? \(\s*<TruthInterfacePanel/);
});
