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

test("the holdings workspace is a focused portfolio page without decision noise", () => {
  const holdingsSection = terminalSource.slice(
    terminalSource.indexOf('case "holdings":'),
    terminalSource.indexOf('case "today":'),
  );
  assert.ok(holdingsSection.indexOf("<PortfolioPanel") < holdingsSection.indexOf("<HoldingsPanel"));
  assert.match(holdingsSection, /<SimplePhantomDiversificationPanel/);
  assert.match(holdingsSection, /\{hasPortfolioHoldings \? \(/);
  assert.doesNotMatch(holdingsSection, /<StressEnginePanel/);
  assert.doesNotMatch(holdingsSection, /<TodayDecisionPanel/);
  assert.match(terminalSource, /"portfolio-only-workspace"/);
  assert.match(terminalSource, /isPortfolioWorkspace \? null : \(/);
  assert.match(terminalSource, /data-testid="portfolio-empty-hero"/);
});

test("the portfolio always has an honest return visualization", () => {
  assert.match(terminalSource, /function HoldingReturnContributionChart/);
  assert.match(terminalSource, /data-testid="portfolio-return-contribution-chart"/);
  assert.match(terminalSource, /analytics\.hasPerformanceHistory\s*\?\s*\(/);
  assert.match(terminalSource, /<HoldingReturnContributionChart/);
  assert.doesNotMatch(terminalSource, /Number\.isFinite\(Number\(analytics\.totalPnlInclRealizedDividendsUsd\)\)/);
  assert.doesNotMatch(terminalSource, /Number\.isFinite\(Number\(analytics\.totalReturnInclDividends\)\)/);
});

test("a cached legacy backcast without a personal headline cannot render P&L or return", () => {
  assert.match(
    terminalSource,
    /const suppressLegacyBackcastHeadline = !hasPersonalHeadlineContract && performanceIsBackcast;/,
  );
  assert.match(
    terminalSource,
    /: suppressLegacyBackcastHeadline\s*\? null\s*:\s*firstFiniteNumber\(analytics\.totalPnlInclRealizedDividendsUsd/,
  );
  assert.match(
    terminalSource,
    /: suppressLegacyBackcastHeadline\s*\? null\s*:\s*firstFiniteNumber\(\s*analytics\.totalReturnInclDividends/,
  );
});
