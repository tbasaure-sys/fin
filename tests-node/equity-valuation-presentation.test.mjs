import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildEquityValuationPresentation as buildRawEquityValuationPresentation } from "../lib/equity-valuation-presentation.js";

const TEST_NOW = Date.parse("2026-07-14T12:00:00.000Z");

function buildEquityValuationPresentation(research, options = {}) {
  return buildRawEquityValuationPresentation(research, { now: TEST_NOW, ...options });
}

function researchWithValuation(valuation, overrides = {}) {
  return {
    ticker: "MU",
    company_profile: {
      name: "Micron Technology, Inc.",
      currency: "USD",
    },
    audit: {
      status: "pass",
      findings: [],
    },
    valuation,
    ...overrides,
  };
}

const decisionReadyValuation = {
  available: true,
  model_version: "institutional_valuation_v3",
  status: "decision_ready",
  reliability: {
    usable: true,
    status: "high",
    score: 0.82,
    reasons: ["Independent price checks agree."],
    limitations: ["Cyclical earnings remain uncertain."],
  },
  range: {
    low: 88,
    central: 112,
    high: 139,
  },
  primary_method: "Through-cycle ensemble",
  currency: "USD",
  market_data_as_of: "2026-07-13",
  current_price: 104.5,
  price_validation: {
    status: "validated",
    usable: true,
    source: "FMP historical close + market cap / shares",
  },
};

test("legacy valuation payloads never expose an old point estimate as supported", () => {
  const research = researchWithValuation({
    available: true,
    current_price: 983.12,
    scenarios: [{ name: "base", intrinsic_value_per_share: 31.83 }],
  });

  const result = buildEquityValuationPresentation(research, {
    executiveJudgment: "Current price is $983.12 versus a base DCF value of $31.83.",
  });

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.legacy, true);
  assert.equal(result.showValuationFigures, false);
  assert.equal(result.range, null);
  assert.equal(result.centralValue, null);
  assert.equal(result.currentPrice, null);
  assert.equal(result.showExecutiveJudgment, false);
  assert.equal(result.executiveJudgment, "");
  assert.match(result.reason, /modelo anterior|actualizar/i);
});

test("blocked institutional valuations hide all valuation figures even when evidence audit passes", () => {
  const research = researchWithValuation({
    ...decisionReadyValuation,
    status: "not_decision_ready",
    reliability: {
      usable: false,
      status: "blocked",
      score: 0.18,
      reasons: ["Current price conflicts with the latest close."],
      limitations: [],
    },
    price_validation: {
      status: "mismatch",
      usable: false,
      source: "FMP profile",
    },
  });

  const result = buildEquityValuationPresentation(research, {
    executiveJudgment: "The company is dramatically overvalued.",
  });

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.showValuationFigures, false);
  assert.equal(result.range, null);
  assert.equal(result.centralValue, null);
  assert.equal(result.currentPrice, null);
  assert.equal(result.showExecutiveJudgment, false);
  assert.match(result.reason, /Current price conflicts/i);
});

test("null figures never coerce to a backed zero-dollar valuation", () => {
  const result = buildEquityValuationPresentation(researchWithValuation({
    ...decisionReadyValuation,
    range: { low: null, central: null, high: null },
    current_price: null,
    reliability: { ...decisionReadyValuation.reliability, score: null },
    price_validation: { status: "validated", usable: true },
  }), { executiveJudgment: "This must never be visible." });

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.backed, false);
  assert.equal(result.showValuationFigures, false);
  assert.equal(result.centralValue, null);
  assert.equal(result.currentPrice, null);
  assert.equal(result.showExecutiveJudgment, false);
});

test("decision-ready valuations expose range first and retain center, method, confidence, currency, and date", () => {
  const result = buildEquityValuationPresentation(
    researchWithValuation(decisionReadyValuation),
    { executiveJudgment: "The range is supported by independent methods." },
  );

  assert.equal(result.state, "decision_ready");
  assert.equal(result.backed, true);
  assert.equal(result.primaryMetric, "range");
  assert.deepEqual(result.range, { low: 88, central: 112, high: 139 });
  assert.equal(result.centralValue, 112);
  assert.equal(result.primaryMethod, "Through-cycle ensemble");
  assert.equal(result.confidence, 0.82);
  assert.equal(result.currency, "USD");
  assert.equal(result.marketDataAsOf, "2026-07-13");
  assert.equal(result.currentPrice, 104.5);
  assert.equal(result.priceSource, "FMP historical close + market cap / shares");
  assert.equal(result.showExecutiveJudgment, true);
  assert.equal(result.executiveJudgment, "The range is supported by independent methods.");
});

test("research-grade valuations show a cautious range but never claim a backed value or external judgment", () => {
  const research = researchWithValuation({
    ...decisionReadyValuation,
    status: "research_grade",
    reliability: {
      ...decisionReadyValuation.reliability,
      status: "medium",
      score: 0.61,
      reasons: ["Method dispersion is elevated."],
    },
  });

  const result = buildEquityValuationPresentation(research, {
    executiveJudgment: "Buy now.",
  });

  assert.equal(result.state, "research_grade");
  assert.equal(result.showValuationFigures, true);
  assert.equal(result.backed, false);
  assert.equal(result.primaryMetric, "range");
  assert.deepEqual(result.range, { low: 88, central: null, high: 139 });
  assert.equal(result.centralValue, null);
  assert.equal(result.showExecutiveJudgment, false);
  assert.equal(result.executiveJudgment, "");
  assert.match(result.reason, /Method dispersion/i);
});

test("a decision-ready model is still held back when the bundle audit has a high-severity issue", () => {
  const result = buildEquityValuationPresentation(
    researchWithValuation(decisionReadyValuation, {
      audit: { status: "needs_attention", findings: [{ severity: "high", code: "unit_mismatch" }] },
    }),
  );

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.backed, false);
  assert.equal(result.showValuationFigures, false);
  assert.equal(result.centralValue, null);
});

test("a passing audit label cannot override a high-severity finding", () => {
  const result = buildEquityValuationPresentation(
    researchWithValuation(decisionReadyValuation, {
      audit: { status: "pass", findings: [{ severity: "high", code: "unit_mismatch" }] },
    }),
    { now: Date.parse("2026-07-14T12:00:00.000Z") },
  );

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.backed, false);
  assert.equal(result.showValuationFigures, false);
  assert.match(result.reason, /auditor/i);
});

test("a passing audit label cannot override explicitly insufficient evidence coverage", () => {
  const result = buildEquityValuationPresentation(
    researchWithValuation(decisionReadyValuation, {
      audit: {
        status: "pass",
        findings: [],
        coverage: {
          status: "needs_attention",
          score: 0,
          expected_metrics: 19,
          covered_expected_metrics: 0,
          missing_expected_metrics: ["latest_revenue"],
        },
      },
    }),
  );

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.backed, false);
  assert.equal(result.showValuationFigures, false);
  assert.match(result.reason, /cobertura|evidencia|fuente/i);
});

test("an empty audit coverage object cannot hide insufficient source coverage", () => {
  const result = buildEquityValuationPresentation(
    researchWithValuation(decisionReadyValuation, {
      audit: { status: "pass", findings: [], coverage: {} },
      sources: {
        coverage: {
          status: "partial",
          score: 70,
          missing_expected_metrics: ["latest_fcf"],
        },
      },
    }),
  );

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.backed, false);
  assert.equal(result.showValuationFigures, false);
});

test("stale market data cannot support a decision-ready valuation", () => {
  const result = buildEquityValuationPresentation(
    researchWithValuation({ ...decisionReadyValuation, market_data_as_of: "2001-01-01" }),
    { now: Date.parse("2026-07-14T12:00:00.000Z") },
  );

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.backed, false);
  assert.equal(result.showValuationFigures, false);
  assert.match(result.reason, /fecha|mercado|vigente|actual/i);
});

test("future-dated market data cannot support a decision-ready valuation", () => {
  const result = buildEquityValuationPresentation(
    researchWithValuation({ ...decisionReadyValuation, market_data_as_of: "2099-01-01" }),
    { now: Date.parse("2026-07-14T12:00:00.000Z") },
  );

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.backed, false);
  assert.equal(result.showValuationFigures, false);
  assert.match(result.reason, /fecha|mercado|futuro|actual/i);
});

test("an otherwise high-confidence valuation is held for review when required trust metadata is missing", () => {
  const valuation = {
    ...decisionReadyValuation,
    range: { central: 112 },
    primary_method: "",
    market_data_as_of: null,
  };

  const result = buildEquityValuationPresentation(researchWithValuation(valuation));

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.showValuationFigures, false);
  assert.equal(result.backed, false);
  assert.match(result.reason, /rango|m[eé]todo|fecha/i);
});

test("unverified prices are not exposed even when the intrinsic range is research-grade", () => {
  const research = researchWithValuation({
    ...decisionReadyValuation,
    status: "research_grade",
    reliability: {
      ...decisionReadyValuation.reliability,
      status: "medium",
      score: 0.64,
    },
    price_validation: {
      status: "stale",
      usable: false,
      source: "FMP profile cache",
    },
  });

  const result = buildEquityValuationPresentation(research);

  assert.equal(result.state, "research_grade");
  assert.equal(result.showValuationFigures, true);
  assert.equal(result.currentPrice, null);
  assert.equal(result.priceValidationStatus, "stale");
});

test("unknown institutional statuses fail closed instead of becoming research-grade", () => {
  const result = buildEquityValuationPresentation(researchWithValuation({
    ...decisionReadyValuation,
    status: "experimental_preview",
  }));

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.showValuationFigures, false);
  assert.equal(result.backed, false);
});

test("the canonical validated price status and method key render as a decision-ready human label", () => {
  const result = buildEquityValuationPresentation(researchWithValuation({
    ...decisionReadyValuation,
    primary_method: "forward_fcff_dcf",
    price_validation: {
      ...decisionReadyValuation.price_validation,
      status: "validated",
    },
  }));

  assert.equal(result.state, "decision_ready");
  assert.equal(result.backed, true);
  assert.equal(result.primaryMethod, "DCF con flujos esperados");
});

test("noncanonical price status synonyms fail closed", () => {
  for (const status of ["verified", "valid", "pass", "consistent"]) {
    const result = buildEquityValuationPresentation(researchWithValuation({
      ...decisionReadyValuation,
      price_validation: { ...decisionReadyValuation.price_validation, status },
    }));
    assert.equal(result.backed, false, status);
    assert.equal(result.showValuationFigures, false, status);
  }
});

test("the private AURORA panel routes every prominent valuation claim through the presentation gate", () => {
  const source = readFileSync("components/equity-research-panel.jsx", "utf8");

  assert.match(source, /buildEquityValuationPresentation/);
  assert.match(source, /valuationPresentation\.showValuationFigures/);
  assert.match(source, /valuationPresentation\.showExecutiveJudgment/);
  assert.match(source, /renderMemo\(research, valuationPresentation\)/);
  assert.match(source, /renderAgents\(research, valuationPresentation\)/);
  assert.match(source, /valuationPresentation\.backed\s*\?\s*downloads/);
  assert.match(source, /renderDelta\(research, valuationPresentation\)/);
  assert.match(source, /delta\.valuation\?\.comparable/);
  assert.match(source, /TRUSTED_VALUATION_DELTA_KEYS/);
  assert.match(source, /Rango estimado/);
  assert.match(source, /Estimaci[oó]n central/);
  assert.match(source, /!publicMode\s*\?\s*\(\s*<div className=\{styles\.segmentedControl\}/);
  assert.match(source, /Vista p[uú]blica[^<]*an[aá]lisis r[aá]pido/i);
  assert.doesNotMatch(source, /compactCurrency\(baseScenario\?\.intrinsic_value_per_share\)/);
  assert.doesNotMatch(source, /executiveJudgment\s*\|\|/);
});
