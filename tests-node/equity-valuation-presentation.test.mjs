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
    sources: {
      coverage: {
        status: "complete",
        score: 100,
        expected_metrics: 19,
        covered_expected_metrics: 19,
        missing_expected_metrics: [],
        sourced_points_missing_ok_source: [],
        calculated_points_missing_formula: [],
      },
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
  primary_method: "through_cycle_fcff_dcf",
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
  assert.equal(result.primaryMethod, "DCF normalizado por ciclo");
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

test("research-grade valuations stay visible when evidence is complete except for the intentionally withheld center", () => {
  const research = researchWithValuation({
    ...decisionReadyValuation,
    status: "research_grade",
    range: { low: 88, central: null, high: 139 },
    reliability: {
      ...decisionReadyValuation.reliability,
      status: "medium",
      score: 0.66,
    },
  }, {
    sources: {
      coverage: {
        status: "partial",
        score: 95,
        expected_metrics: 19,
        covered_expected_metrics: 18,
        missing_expected_metrics: ["valuation_range_central"],
        sourced_points_missing_ok_source: [],
        calculated_points_missing_formula: [],
      },
    },
  });

  const result = buildEquityValuationPresentation(research);

  assert.equal(result.state, "research_grade");
  assert.equal(result.showValuationFigures, true);
  assert.deepEqual(result.range, { low: 88, central: null, high: 139 });
});

test("research-grade valuations remain blocked when any real evidence gap accompanies the withheld center", () => {
  const research = researchWithValuation({
    ...decisionReadyValuation,
    status: "research_grade",
    range: { low: 88, central: null, high: 139 },
    reliability: {
      ...decisionReadyValuation.reliability,
      status: "medium",
      score: 0.66,
    },
  }, {
    sources: {
      coverage: {
        status: "pass",
        score: 90,
        expected_metrics: 19,
        covered_expected_metrics: 17,
        missing_expected_metrics: ["valuation_range_central", "wacc"],
        sourced_points_missing_ok_source: [],
        calculated_points_missing_formula: [],
      },
    },
  });

  const result = buildEquityValuationPresentation(research);

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.showValuationFigures, false);
});

test("a fresh provider-reconciled price can add research context without becoming decision-ready", () => {
  for (const contextFlag of ["research_usable", "usable_for_context"]) {
    const research = researchWithValuation({
      ...decisionReadyValuation,
      status: "research_grade",
      reliability: {
        ...decisionReadyValuation.reliability,
        status: "medium",
        score: 0.66,
      },
      price_validation: {
        status: "provider_reconciled",
        usable: false,
        [contextFlag]: true,
        sources: ["FMP quote", "FMP latest close", "FMP company profile"],
      },
    });

    const result = buildEquityValuationPresentation(research);

    assert.equal(result.state, "research_grade", contextFlag);
    assert.equal(result.backed, false, contextFlag);
    assert.deepEqual(result.range, { low: 88, central: null, high: 139 }, contextFlag);
    assert.equal(result.centralValue, null, contextFlag);
    assert.equal(result.currentPrice, 104.5, contextFlag);
    assert.equal(result.priceIsContextual, true, contextFlag);
    assert.equal(result.priceValidationStatus, "provider_reconciled", contextFlag);
    assert.match(result.priceSource, /FMP quote/i, contextFlag);
  }
});

test("a contextual provider price never satisfies the validated-price decision gate", () => {
  const result = buildEquityValuationPresentation(researchWithValuation({
    ...decisionReadyValuation,
    price_validation: {
      status: "provider_reconciled",
      usable: false,
      research_usable: true,
      sources: ["FMP quote", "FMP latest close"],
    },
  }));

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.backed, false);
  assert.equal(result.showValuationFigures, false);
  assert.equal(result.currentPrice, null);
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

test("a passing audit label cannot publish figures when evidence coverage is absent", () => {
  const result = buildEquityValuationPresentation(
    researchWithValuation(decisionReadyValuation, {
      audit: { status: "pass", findings: [] },
      sources: {},
    }),
  );

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.backed, false);
  assert.equal(result.showValuationFigures, false);
  assert.match(result.reason, /cobertura|evidencia|fuente/i);
});

test("empty coverage objects are treated as missing evidence rather than a pass", () => {
  const result = buildEquityValuationPresentation(
    researchWithValuation(decisionReadyValuation, {
      audit: { status: "pass", findings: [], coverage: {} },
      sources: { coverage: {} },
    }),
  );

  assert.equal(result.state, "not_decision_ready");
  assert.equal(result.backed, false);
  assert.equal(result.showValuationFigures, false);
});

test("coverage labels alone never publish a valuation without a complete evidence contract", () => {
  const incompleteCoverageCases = [
    { status: "pass" },
    {
      status: "pass",
      score: 100,
      missing_expected_metrics: [],
      sourced_points_missing_ok_source: [],
      calculated_points_missing_formula: [],
    },
    {
      status: "pass",
      score: 100,
      expected_metrics: 19,
      covered_expected_metrics: 19,
    },
    {
      status: "pass",
      score: 100,
      expected_metrics: 19,
      covered_expected_metrics: 18,
      missing_expected_metrics: [],
      sourced_points_missing_ok_source: [],
      calculated_points_missing_formula: [],
    },
  ];

  for (const coverage of incompleteCoverageCases) {
    const result = buildEquityValuationPresentation(researchWithValuation(decisionReadyValuation, {
      sources: { coverage },
    }));
    assert.equal(result.state, "not_decision_ready", JSON.stringify(coverage));
    assert.equal(result.backed, false, JSON.stringify(coverage));
    assert.equal(result.showValuationFigures, false, JSON.stringify(coverage));
  }
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
  assert.match(source, /Lectura de valor/);
  assert.doesNotMatch(source, /label="Rango estimado"/);
  assert.match(source, /Estimaci[oó]n central/);
  assert.match(source, /!publicMode\s*\?\s*\(\s*<div className=\{styles\.segmentedControl\}/);
  assert.match(source, /Vista p[uú]blica[^<]*an[aá]lisis r[aá]pido/i);
  assert.match(source, /const RESEARCH_TABS = \["Memo", "Valor", "Revisi[oó]n"/);
  assert.doesNotMatch(source, /const RESEARCH_TABS = \[[^\]]*"Debate"/);
  assert.match(source, /wacc:\s*"tasa de descuento"/);
  assert.match(source, /terminal_growth:\s*"crecimiento de largo plazo"/);
  assert.match(source, /current_price:\s*"precio actual"/);
  assert.match(source, /valuation_range_central:\s*"estimaci[oó]n central"/);
  assert.match(source, /reverse_dcf_status:\s*"contraste con el precio actual"/);
  assert.match(source, /ev_to_sales:\s*"valor empresa sobre ventas"/);
  assert.match(source, /price_to_fcf:\s*"precio sobre flujo libre de caja"/);
  assert.match(source, /Qu[eé] sabemos/);
  assert.match(source, /Qu[eé] falta/);
  assert.match(source, /Qu[eé] cambia la lectura/);
  assert.match(source, /normalizaci[oó]n del ciclo/);
  assert.doesNotMatch(source, /compactCurrency\(baseScenario\?\.intrinsic_value_per_share\)/);
  assert.doesNotMatch(source, /executiveJudgment\s*\|\|/);
});

test("the AURORA result UI communicates uncertainty, real pending fields, and async updates", () => {
  const source = readFileSync("components/equity-research-panel.jsx", "utf8");
  const languageSource = readFileSync("components/language-layer.jsx", "utf8");

  assert.match(source, /el margen actual est[aá] dentro del rango de soporte del ciclo/i);
  assert.match(source, /los ingresos actuales est[aá]n fuera del historial observado/i);
  assert.doesNotMatch(source, /el nivel actual est[aá] dentro del historial observado/i);
  assert.match(source, /priceIsContextual\s*\?\s*"warn"/);
  assert.match(source, /mismo proveedor; falta confirmaci[oó]n independiente/i);
  assert.match(source, /Precio observado/);
  assert.match(source, /El precio supera el rango/);
  assert.match(source, /El mercado exige resultados superiores al escenario alto/);
  assert.match(source, /Tratamiento del ciclo/);
  assert.match(source, /Reversi[oó]n en/);
  assert.match(source, /unresolvedBridgeFields\(research\?\.valuation\)/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /role="alert"/);
  assert.match(languageSource, /LANGUAGE_DOCK_OMITTED_PATHS[^\n]*\["\/", "\/channels", "\/aurora"\]/);
  assert.match(source, /Comparaci[oó]n preliminar con el precio del proveedor/);
  assert.match(source, /Conf[ií]rmalo con una fuente independiente/);
  assert.match(source, /function humanizeSourceAuthority/);
  assert.match(source, /function humanizeClaimTag/);
  assert.match(source, /function humanizeSourceStatus/);
  assert.match(source, /function humanizeIndustry/);
  assert.match(source, /humanizeIndustry\(research\?\.company_profile\?\.industry\)/);
  assert.match(source, /function humanizeQualityFlag/);
  assert.match(source, /humanizeQualityFlag\(flag\)/);
  assert.match(source, /cost_of_revenue:\s*"costo de ventas"/);
  assert.match(source, /interest_expense:\s*"gasto por intereses"/);
  assert.match(source, /diluted_shares:\s*"acciones diluidas"/);
  assert.match(source, /goodwill_and_intangibles:\s*"plusval[ií]a e intangibles"/);
  assert.doesNotMatch(source, /<strong>\{source\.source_id\}<\/strong>/);
  assert.doesNotMatch(source, /<span>\{point\.claim_tag\}<\/span>/);
  assert.doesNotMatch(source, /<span>\{point\.source_id\s*\|\|/);
  assert.match(source, /Solidez de la evidencia/);
  assert.doesNotMatch(source, /label="Confianza de (?:la )?valoraci[oó]n"/);
  assert.match(source, /no es una probabilidad/i);
  assert.match(source, /Estados financieros al/);
  assert.match(source, /timeZone:\s*\/\^\\d\{4\}/);
  assert.match(source, /Qu[eé] tendr[ií]a que cumplirse/);
  assert.match(source, /Qu[eé] rompe el rango/);
  assert.match(source, /driver_summary/);
  assert.match(source, /market_requirements/);
  assert.match(source, /Qu[eé] tendr[ií]a que sostener el/);
  assert.match(source, /precio del proveedor al/);
  assert.match(source, /precio validado al/);
  assert.match(source, /No es una estimaci[oó]n de valor razonable/);
  assert.match(source, /Requisito del precio/);
  assert.ok((source.match(/renderBlockedValuationHelp\(/g) || []).length >= 4);
  assert.match(source, /structural_scale_bridge:\s*"Explicar el cambio de escala"/);
  assert.match(source, /Qu[eé] falta para una valoraci[oó]n completa/);
  assert.match(source, /Lectura disponible ahora/);
  assert.match(source, /Caja, consumo y riesgo de financiaci[oó]n/);
  assert.match(source, /No es un valor razonable/);
  assert.match(source, /No impiden mostrar los datos que s[ií] est[aá]n respaldados/);
  assert.match(source, /Revisar datos y supuestos de valoraci[oó]n/);
  assert.doesNotMatch(source, /Perfil cargado desde FMP v[ií]a backend Railway/);
  assert.doesNotMatch(source, /[uú]ltimo filing SEC/);
});
