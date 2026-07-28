import { buildEquityValuationPresentation } from "./equity-valuation-presentation.js";

const CLOSURE_CONTROLS = {
  net_debt: {
    control: "Deuda neta",
    why: "Define el puente desde valor empresa hasta valor para el accionista.",
    estimatedImpact: "Puede desplazar o invalidar el rango completo.",
    sourceNeeded: "Balance más reciente y notas de deuda y caja.",
    nextAction: "Conciliar caja, deuda y equivalentes con el último balance presentado.",
  },
  valuation_range_central: {
    control: "Estimación central",
    why: "Evita presentar una falsa precisión cuando los métodos aún no convergen.",
    estimatedImpact: "Mantiene visible solo el intervalo defendible.",
    sourceNeeded: "Confirmación independiente de supuestos y método secundario.",
    nextAction: "Contrastar el rango con un segundo método y documentar la dispersión.",
  },
  market_price: {
    control: "Precio de mercado",
    why: "El juicio relativo depende de comparar valor y precio en una fecha común.",
    estimatedImpact: "Puede cambiar por completo la clasificación de valoración.",
    sourceNeeded: "Cierre de mercado fechado y una fuente independiente.",
    nextAction: "Conciliar precio, fecha, moneda y acciones en circulación.",
  },
  ttm_equity_bridge_reconciliation: {
    control: "Puente a valor del accionista",
    why: "Caja, deuda y otros compromisos convierten valor empresa en valor por acción.",
    estimatedImpact: "Puede desplazar o invalidar el rango completo.",
    sourceNeeded: "Balance más reciente y notas de compromisos financieros.",
    nextAction: "Conciliar todos los ajustes del puente con documentos presentados.",
  },
};

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function firstText(...values) {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return "";
}

function humanize(value) {
  const raw = text(value);
  if (!raw) return "Control pendiente";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\bttm\b/gi, "últimos doce meses")
    .replace(/\bequity\b/gi, "accionista")
    .replace(/\bfcf\b/gi, "flujo de caja libre")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function normalizeTextRows(value) {
  return list(value)
    .map((item) => {
      if (typeof item === "string") return item.trim();
      return firstText(item?.label, item?.title, item?.summary, item?.detail, item?.message, item?.name);
    })
    .filter(Boolean);
}

function buildVerdict(presentation) {
  if (presentation.state === "not_decision_ready") {
    return {
      kind: "not_publishable",
      label: "No publicable todavía",
      headline: "Falta cerrar controles antes de emitir una lectura de valor.",
      explanation: presentation.reason,
    };
  }

  if (presentation.state === "research_grade") {
    return {
      kind: "uncertain",
      label: "Lectura incierta",
      headline: "El rango sirve para investigación, no para una conclusión cerrada.",
      explanation: `${presentation.reason} Esta lectura es de investigación y no una recomendación.`,
    };
  }

  const price = finite(presentation.currentPrice);
  const low = finite(presentation.range?.low);
  const high = finite(presentation.range?.high);
  if (price !== null && low !== null && price < low) {
    return {
      kind: "attractive",
      label: "Valoración atractiva",
      headline: "El precio está por debajo del rango defendible.",
      explanation: "La diferencia justifica estudiar los supuestos y riesgos; no es una recomendación de compra.",
    };
  }
  if (price !== null && high !== null && price > high) {
    return {
      kind: "demanding",
      label: "Valoración exigente",
      headline: "El precio está por encima del rango defendible.",
      explanation: "El mercado exige resultados superiores a los supuestos centrales; no es una recomendación de venta.",
    };
  }
  return {
    kind: "uncertain",
    label: "Lectura incierta",
    headline: "El precio está dentro del rango defendible.",
    explanation: "La decisión depende de qué escenario resulte más probable; no es una recomendación.",
  };
}

function buildExpectations(research, presentation) {
  if (!presentation.showValuationFigures) return [];
  const requirements = research?.valuation?.market_requirements || {};
  const rows = list(requirements.expectations_by_horizon || requirements.horizons);
  return rows
    .map((row) => ({
      years: finite(row?.years ?? row?.horizon_years ?? row?.horizon),
      label: firstText(row?.label, row?.metric, row?.name) || "Expectativa implícita",
      value: finite(row?.value ?? row?.mean ?? row?.requirement),
      unit: text(row?.unit) || "number",
      detail: firstText(row?.detail, row?.explanation, row?.reading),
    }))
    .filter((row) => [3, 5, 10].includes(row.years) && row.value !== null)
    .sort((a, b) => a.years - b.years);
}

function buildEvidence(research) {
  const coverage = research?.sources?.coverage || research?.audit?.coverage || {};
  const records = list(research?.sources?.records).filter((row) => text(row?.status).toLowerCase() === "ok");
  const dataPoints = list(research?.sources?.data_points);
  const availableSource = records.length ? records : dataPoints;
  const available = availableSource.map((row, index) => ({
    key: firstText(row?.metric, row?.label, row?.provider, row?.id) || `evidence-${index + 1}`,
    label: firstText(row?.label, row?.metric, row?.provider) || "Evidencia disponible",
    source: firstText(row?.provider, row?.source, row?.authority),
  }));
  const missing = list(coverage.missing_expected_metrics).map((metric) => ({
    key: text(metric),
    label: humanize(metric),
  }));
  return {
    status: text(coverage.status) || "unknown",
    score: finite(coverage.score),
    covered: finite(coverage.covered_expected_metrics),
    expected: finite(coverage.expected_metrics),
    available,
    missing,
  };
}

function buildClosurePlan(research, presentation, missingEvidence) {
  if (presentation.state !== "not_decision_ready") return [];
  const missingKeys = missingEvidence.length
    ? missingEvidence.map((item) => item.key)
    : list(research?.audit?.findings).map((finding) => firstText(finding?.code, finding?.control)).filter(Boolean);
  if (!missingKeys.length) missingKeys.push("reliability_review");
  return [...new Set(missingKeys)].slice(0, 4).map((key) => {
    const known = CLOSURE_CONTROLS[key];
    return {
      key,
      control: known?.control || humanize(key),
      why: known?.why || "Este control puede cambiar la conclusión o impedir que el rango sea defendible.",
      estimatedImpact: known?.estimatedImpact || "Impacto por cuantificar; puede modificar el estado de publicabilidad.",
      sourceNeeded: known?.sourceNeeded || "Fuente primaria fechada y evidencia de conciliación.",
      nextAction: known?.nextAction || `Resolver y auditar: ${humanize(key).toLowerCase()}.`,
      resolvable: true,
    };
  });
}

function normalizeScenarios(research, presentation) {
  if (!presentation.showValuationFigures) return [];
  return list(research?.valuation?.scenarios || research?.scenarios)
    .map((row, index) => ({
      key: firstText(row?.key, row?.name) || `scenario-${index + 1}`,
      label: firstText(row?.label, row?.name) || `Escenario ${index + 1}`,
      value: finite(row?.value_per_share ?? row?.intrinsic_value_per_share ?? row?.value),
      explanation: firstText(row?.explanation, row?.summary, row?.description),
    }))
    .filter((row) => row.value !== null || row.explanation);
}

function buildChanges(research) {
  return list(research?.history?.delta?.changes).map((row, index) => ({
    key: firstText(row?.key, row?.metric, row?.label) || `change-${index + 1}`,
    label: firstText(row?.label, row?.metric, row?.title) || "Cambio detectado",
    detail: firstText(row?.detail, row?.description, row?.summary, row?.message),
  }));
}

export function buildCompanyDecisionView(research, { now = Date.now() } = {}) {
  const presentation = buildEquityValuationPresentation(research, { now });
  const evidence = buildEvidence(research);
  const company = research?.company_profile || research?.company || {};
  const thesis = research?.thesis || research?.aurora?.thesis || {};
  const drivers = normalizeTextRows(thesis.drivers || research?.valuation?.driver_summary?.requirements || research?.valuation?.driver_summary?.holds);
  const risks = normalizeTextRows(thesis.risks || research?.valuation?.driver_summary?.breakers || research?.valuation?.driver_summary?.risks);
  const auditFindings = list(research?.audit?.findings).map((finding, index) => ({
    key: firstText(finding?.code, finding?.id) || `finding-${index + 1}`,
    severity: text(finding?.severity) || "unknown",
    message: firstText(finding?.message, finding?.detail, finding?.title) || "Hallazgo sin detalle.",
  }));

  return {
    company: {
      ticker: firstText(research?.ticker, company?.ticker) || "—",
      name: firstText(company?.name, research?.name) || "Empresa sin identificar",
      exchange: firstText(company?.exchange, company?.exchange_short_name),
    },
    analysis: {
      state: presentation.state,
      label: presentation.state === "decision_ready"
        ? "Lista para decisión"
        : presentation.state === "research_grade"
          ? "Grado de investigación"
          : "En revisión",
      reason: presentation.reason,
      confidence: presentation.confidence,
    },
    market: {
      price: presentation.currentPrice,
      currency: presentation.currency,
      asOf: presentation.marketDataAsOf,
      source: presentation.priceSource,
      contextual: presentation.priceIsContextual,
      state: firstText(
        research?.market_state,
        research?.market?.state,
        research?.valuation?.market_state,
        research?.valuation?.price_validation?.market_state,
      ) || (presentation.currentPrice === null ? "Sin precio publicable" : "Cierre fechado"),
    },
    verdict: buildVerdict(presentation),
    valuation: {
      publishable: presentation.showValuationFigures,
      range: presentation.range,
      method: presentation.primaryMethod,
      reason: presentation.reason,
      limitations: presentation.limitations,
    },
    expectations: buildExpectations(research, presentation),
    thesis: {
      summary: firstText(thesis?.summary, thesis?.headline, research?.memo?.summary, presentation.reason),
      drivers,
      risks,
      mainDriver: drivers[0] || "Impulsor principal aún no documentado.",
      mainRisk: risks[0] || presentation.limitations[0] || "Riesgo principal aún no documentado.",
    },
    scenarios: normalizeScenarios(research, presentation),
    evidence,
    changes: buildChanges(research),
    audit: {
      status: text(research?.audit?.status) || "unknown",
      findings: auditFindings,
      modelVersion: text(research?.valuation?.model_version),
      method: presentation.primaryMethod,
      runCount: finite(research?.history?.run_count) || 0,
    },
    closurePlan: buildClosurePlan(research, presentation, evidence.missing),
  };
}
