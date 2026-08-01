import assert from "node:assert/strict";
import test from "node:test";

import { buildCompanyDecisionView } from "../lib/company-decision-view.js";

const NOW = Date.parse("2026-07-27T12:00:00.000Z");

function completeCoverage(overrides = {}) {
  return {
    status: "complete",
    score: 100,
    expected_metrics: 6,
    covered_expected_metrics: 6,
    missing_expected_metrics: [],
    sourced_points_missing_ok_source: [],
    calculated_points_missing_formula: [],
    ...overrides,
  };
}

function decisionReadyResearch(overrides = {}) {
  return {
    ticker: "TXN",
    company_profile: {
      name: "Texas Instruments Incorporated",
      exchange: "NASDAQ",
      currency: "USD",
    },
    thesis: {
      summary: "La recuperación industrial y la disciplina de capital sostienen el caso.",
      drivers: ["Recuperación del negocio analógico", "Disciplina de reinversión"],
      risks: ["Inventarios elevados", "Márgenes por debajo del ciclo"],
    },
    valuation: {
      available: true,
      model_version: "institutional_valuation_v3",
      status: "decision_ready",
      reliability: {
        usable: true,
        status: "high",
        score: 0.86,
        reasons: ["Precio y estados conciliados."],
        limitations: ["El ciclo industrial sigue abierto."],
      },
      range: { low: 168, central: 191, high: 214 },
      primary_method: "through_cycle_fcff_dcf",
      currency: "USD",
      market_data_as_of: "2026-07-24",
      current_price: 160,
      price_validation: {
        status: "validated",
        usable: true,
        source: "Cierre de mercado conciliado",
      },
      market_requirements: {
        expectations_by_horizon: [
          { years: 3, label: "Crecimiento de ingresos", value: 0.06, unit: "percent" },
          { years: 5, label: "Margen de caja", value: 0.29, unit: "percent" },
          { years: 10, label: "Crecimiento terminal", value: 0.025, unit: "percent" },
        ],
      },
      scenarios: [
        { name: "Adverso", value_per_share: 151, explanation: "La recuperación no llega." },
        { name: "Central", value_per_share: 191, explanation: "El ciclo se normaliza." },
      ],
    },
    sources: {
      coverage: completeCoverage(),
      records: [
        { provider: "SEC", status: "ok", label: "10-Q" },
        { provider: "FMP", status: "ok", label: "Precio" },
      ],
      data_points: [
        { metric: "revenue", source: "SEC" },
        { metric: "market_price", source: "FMP" },
      ],
    },
    audit: { status: "pass", findings: [] },
    history: {
      run_count: 2,
      delta: {
        available: true,
        changes: [{ label: "Margen normalizado", detail: "Subió 40 pb desde la lectura anterior." }],
      },
    },
    ...overrides,
  };
}

test("a decision-ready company below its defendable range is described as attractive without issuing advice", () => {
  const view = buildCompanyDecisionView(decisionReadyResearch(), { now: NOW });

  assert.equal(view.company.ticker, "TXN");
  assert.equal(view.company.name, "Texas Instruments Incorporated");
  assert.equal(view.analysis.state, "decision_ready");
  assert.equal(view.analysis.label, "Lista para decisión");
  assert.equal(view.verdict.kind, "attractive");
  assert.equal(view.verdict.label, "Valoración atractiva");
  assert.match(view.verdict.explanation, /no es una recomendación/i);
  assert.deepEqual(view.market, {
    price: 160,
    currency: "USD",
    asOf: "2026-07-24",
    source: "Cierre de mercado conciliado",
    contextual: false,
    state: "Cierre fechado",
  });
  assert.deepEqual(view.valuation.range, { low: 168, central: 191, high: 214 });
  assert.deepEqual(view.expectations.map((item) => [item.years, item.value, item.unit]), [
    [3, 0.06, "percent"],
    [5, 0.29, "percent"],
    [10, 0.025, "percent"],
  ]);
  assert.equal(view.evidence.available.length, 2);
  assert.equal(view.evidence.missing.length, 0);
  assert.equal(view.changes[0].label, "Margen normalizado");
});

test("research-grade evidence stays uncertain even when the price is outside the range", () => {
  const research = decisionReadyResearch();
  research.valuation.status = "research_grade";
  research.valuation.current_price = 225;
  research.valuation.reliability = {
    ...research.valuation.reliability,
    status: "medium",
    score: 0.64,
    reasons: ["La dispersión entre métodos sigue siendo alta."],
  };
  research.sources.coverage = completeCoverage({
    status: "partial",
    expected_metrics: 6,
    covered_expected_metrics: 5,
    missing_expected_metrics: ["valuation_range_central"],
  });

  const view = buildCompanyDecisionView(research, { now: NOW });

  assert.equal(view.analysis.state, "research_grade");
  assert.equal(view.verdict.kind, "uncertain");
  assert.equal(view.verdict.label, "Lectura incierta");
  assert.deepEqual(view.valuation.range, { low: 168, central: null, high: 214 });
  assert.equal(view.valuation.publishable, false);
  assert.match(view.verdict.explanation, /investigación/i);
});

test("a blocked institutional valuation preserves the closure plan instead of inventing an approximate range", () => {
  const research = decisionReadyResearch();
  research.valuation.status = "not_decision_ready";
  research.valuation.reliability = {
    usable: false,
    status: "blocked",
    score: 0.31,
    reasons: ["La caja y la deuda no están conciliadas."],
    limitations: ["Falta el último balance presentado."],
  };
  research.valuation.price_validation = {
    status: "mismatch",
    usable: false,
    source: "Proveedor sin conciliar",
  };
  research.sources.coverage = completeCoverage({
    status: "partial",
    score: 72,
    expected_metrics: 6,
    covered_expected_metrics: 5,
    missing_expected_metrics: ["net_debt"],
  });
  research.audit = {
    status: "review",
    findings: [{ severity: "high", code: "equity_bridge", message: "Reconciliar el puente a equity." }],
  };

  const view = buildCompanyDecisionView(research, { now: NOW });

  assert.equal(view.analysis.state, "market_implied");
  assert.equal(view.analysis.label, "Precio de mercado");
  assert.equal(view.verdict.kind, "market_implied");
  assert.equal(view.verdict.label, "Precio de mercado");
  assert.equal(view.market.price, 160);
  assert.equal(view.valuation.publishable, false);
  assert.equal(view.valuation.range, null);
  assert.equal(view.valuation.confidence.label, "Baja");
  assert.equal(view.expectations.length, 1);
  assert.equal(view.expectations[0].label, "Cotización observada");
  assert.equal(view.evidence.missing[0].key, "net_debt");
  assert.ok(view.closurePlan.some((item) => item.key === "net_debt"));
  assert.equal(view.closurePlan[0].key, "equity_bridge");
  assert.doesNotMatch(JSON.stringify(view), /faltan datos/i);
});

test("closure plan keeps audit and coverage controls before archetype questions", () => {
  const research = decisionReadyResearch();
  research.valuation.status = "not_decision_ready";
  research.valuation.reliability = { usable: false, status: "blocked", score: 0.2, reasons: ["Revisión requerida"] };
  research.audit = { status: "review", findings: [{ severity: "high", code: "equity_bridge", message: "Conciliar puente." }] };
  research.sources.coverage = completeCoverage({ status: "partial", expected_metrics: 6, covered_expected_metrics: 5, missing_expected_metrics: ["net_debt"] });

  const view = buildCompanyDecisionView(research, { now: NOW });

  assert.deepEqual(view.closurePlan.slice(0, 2).map((item) => item.key), ["equity_bridge", "net_debt"]);
});
