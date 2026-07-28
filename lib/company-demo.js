import { buildCompanyDecisionView } from "./company-decision-view.js";

const TXN_DEMO_RESEARCH = {
  ticker: "TXN",
  company_profile: {
    name: "Texas Instruments Incorporated",
    exchange: "NASDAQ",
    currency: "USD",
  },
  thesis: {
    summary: "El caso depende de una normalización gradual del ciclo industrial, disciplina de capacidad y recuperación de márgenes sin asumir un retorno inmediato al pico.",
    drivers: [
      "Recuperación del negocio analógico y mayor utilización de capacidad.",
      "Conversión de caja y reinversión disciplinada durante la normalización.",
    ],
    risks: [
      "Inventarios altos prolongan la debilidad del ciclo industrial.",
      "La nueva capacidad tarda más de lo previsto en absorber costos fijos.",
    ],
  },
  valuation: {
    available: true,
    model_version: "institutional_valuation_v3",
    status: "decision_ready",
    reliability: {
      usable: true,
      status: "high",
      score: 0.84,
      reasons: ["El ejemplo concilia precio, estados y supuestos bajo un contrato completo."],
      limitations: ["La recuperación del ciclo industrial sigue siendo la variable más incierta."],
    },
    range: { low: 168, central: 191, high: 214 },
    primary_method: "through_cycle_fcff_dcf",
    currency: "USD",
    market_data_as_of: "2026-06-30",
    current_price: 187.2,
    price_validation: {
      status: "validated",
      usable: true,
      source: "Cierre ilustrativo congelado",
    },
    market_requirements: {
      expectations_by_horizon: [
        { years: 3, label: "Crecimiento anual de ingresos", value: 0.055, unit: "percent", detail: "Normalización gradual del ciclo." },
        { years: 5, label: "Margen de caja normalizado", value: 0.285, unit: "percent", detail: "Recuperación sin volver al pico histórico." },
        { years: 10, label: "Crecimiento de largo plazo", value: 0.025, unit: "percent", detail: "Madurez con disciplina de capital." },
      ],
    },
    driver_summary: {
      requirements: ["Normalización gradual del negocio analógico", "Disciplina de capacidad y reinversión"],
      breakers: ["Inventarios persistentemente altos", "Deterioro estructural del margen"],
    },
    scenarios: [
      { name: "Adverso", value_per_share: 151, explanation: "La recuperación industrial se retrasa y la utilización de capacidad sigue baja." },
      { name: "Central", value_per_share: 191, explanation: "El ciclo se normaliza de forma gradual y los márgenes recuperan terreno." },
      { name: "Favorable", value_per_share: 226, explanation: "La demanda mejora antes y la capacidad nueva escala con eficiencia." },
    ],
  },
  sources: {
    coverage: {
      status: "complete",
      score: 100,
      expected_metrics: 8,
      covered_expected_metrics: 8,
      missing_expected_metrics: [],
      sourced_points_missing_ok_source: [],
      calculated_points_missing_formula: [],
    },
    records: [
      { provider: "SEC", label: "Estados financieros", status: "ok" },
      { provider: "Relación con inversionistas", label: "Presentación de resultados", status: "ok" },
      { provider: "Proveedor de mercado", label: "Precio fechado", status: "ok" },
    ],
  },
  audit: { status: "pass", findings: [] },
  history: {
    run_count: 3,
    delta: {
      available: true,
      changes: [
        { label: "Rango defendible", detail: "El extremo inferior subió por una mejor conversión de caja ilustrativa." },
        { label: "Riesgo principal", detail: "La absorción de capacidad reemplazó al crecimiento como control dominante." },
      ],
    },
  },
};

export const TXN_COMPANY_DEMO_VIEW = Object.freeze({
  ...buildCompanyDecisionView(TXN_DEMO_RESEARCH, {
    now: Date.parse("2026-07-01T12:00:00.000Z"),
  }),
  demo: {
    frozen: true,
    label: "Ejemplo congelado",
    disclosure: "Datos ilustrativos al 30 de junio de 2026. No son datos en vivo.",
  },
});
