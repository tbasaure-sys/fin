"use client";

import { useMemo, useState } from "react";

import { formatDateTime, formatPct, safeList, statusTone } from "@/components/workspace/formatters";
import { parseResponse } from "@/components/workspace/live-data";
import styles from "@/components/workspace/shell.module.css";
import { buildEquityValuationPresentation } from "@/lib/equity-valuation-presentation";

const RESEARCH_TABS = ["Memo", "Valor", "Revisión", "Cambios", "Fuentes", "Auditoría"];
const TRUSTED_VALUATION_DELTA_KEYS = new Set(["valuation_low", "valuation_central", "valuation_high", "implied_growth"]);
const AGENT_STAGES = [
  { key: "intake", label: "Obtener", detail: "Fuentes", threshold: 0 },
  { key: "normalize", label: "Limpiar", detail: "Estados", threshold: 18 },
  { key: "valuation", label: "Valorar", detail: "DCF / inverso", threshold: 40 },
  { key: "red_team", label: "Cuestionar", detail: "Riesgos", threshold: 62 },
  { key: "audit", label: "Verificar", detail: "Registro", threshold: 82 },
];

function isRateLimitMessage(value) {
  return /429|rate[\s_-]*limit|too many requests|too many api request|límite|limitado/i.test(String(value || ""));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return await parseResponse(response);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function cleanTicker(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 16);
}

function compactCurrency(value, currency = "USD") {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  const currencyCode = /^[A-Z]{3}$/.test(String(currency || "").toUpperCase()) ? String(currency).toUpperCase() : "USD";
  const format = (nextValue) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: Math.abs(nextValue) >= 1000 ? 0 : 2,
  }).format(nextValue);
  if (Math.abs(number) >= 1_000_000_000) return `${format(number / 1_000_000_000)}B`;
  if (Math.abs(number) >= 1_000_000) return `${format(number / 1_000_000)}M`;
  return format(number);
}

function formatValuationRange(presentation) {
  if (!presentation?.showValuationFigures || !presentation.range) return "En revisión";
  return `${compactCurrency(presentation.range.low, presentation.currency)} – ${compactCurrency(presentation.range.high, presentation.currency)}`;
}

const MISSING_DATE_LABEL = "Sin fecha en la fuente";

function isKnownMarketDate(value) {
  if (!value) return false;
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00Z`) : new Date(text);
  return !Number.isNaN(date.getTime());
}

function formatMarketDate(value) {
  if (!value) return MISSING_DATE_LABEL;
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00Z`) : new Date(text);
  if (Number.isNaN(date.getTime())) return MISSING_DATE_LABEL;
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(text) ? "UTC" : undefined,
  });
}

function valuationStateLabel(presentation) {
  if (presentation?.state === "decision_ready") return "Lista para decisión";
  if (presentation?.state === "research_grade") return "Útil para investigar, con cautela";
  return "Valoración en revisión";
}

const AURORA_METHOD_LABELS = {
  risk_adjusted_pipeline_npv: "rNPV por activo e hito",
  milestone_option_value: "valor opcional por hitos",
  owner_earnings_dcf: "DCF de owner earnings",
  unit_economics_transition: "transición de unit economics",
  residual_income: "ingresos residuales",
  net_asset_value: "valor neto de activos",
  through_cycle_cash_flow: "flujo normalizado por ciclo",
  normalized_fcff_dcf: "DCF de FCFF normalizado",
  multi_stage_dcf: "DCF multietapa",
};

function auroraMethodLabel(value) {
  return AURORA_METHOD_LABELS[value] || String(value || "Método por definir").replace(/_/g, " ");
}

function auroraSignedLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Sin lectura";
  return `${number > 0 ? "+" : ""}${Math.round(number)}`;
}

function AuroraDecisionSummary({ research }) {
  const aurora = research?.aurora;
  if (!aurora || aurora.version !== "aurora_decision_system_v1") return null;
  const valuation = aurora.valuation || {};
  const contextual = aurora.macroBridge?.status === "context_applied"
    ? aurora.macroBridge.contextual
    : valuation;
  const range = contextual?.range;
  const implied = valuation.marketImplied || {};
  const questions = safeList(valuation.valueOfInformation).slice(0, 3);
  const adjustments = safeList(aurora.macroBridge?.adjustments);
  const macro = aurora.macroContext;

  return (
    <section className={styles.researchStack} aria-label="Sistema de decisión AURORA">
      <div className={styles.researchAttentionCallout}>
        <span>AURORA · {aurora.fingerprint?.stage === "pre_revenue" ? "pre-revenue" : "empresa operativa"}</span>
        <strong>{auroraMethodLabel(valuation.method || aurora.valuationPlan?.primaryMethod)}</strong>
        <p>{valuation.summary}</p>
      </div>

      {valuation.status === "conditional_range" && range ? (
        <>
          <div className={styles.researchScenarioGrid} data-count="3">
            {[
              ["low", "Escenario adverso", "bad"],
              ["central", "Caso central condicional", "warn"],
              ["high", "Escenario favorable", "good"],
            ].map(([key, label, tone]) => (
              <article className={styles.researchScenario} data-tone={tone} key={key}>
                <span>{label}</span>
                <strong>{compactCurrency(range[key], valuation.currency)}</strong>
                <small>{valuation.currency} por acción · no decision-ready</small>
              </article>
            ))}
          </div>
          {adjustments.length ? (
            <div className={styles.researchAttentionCallout}>
              <span>Puente MOSAIC → AURORA</span>
              <strong>El contexto modifica el rango sólo mediante exposiciones demostrables</strong>
              <p>{adjustments.map((item) => item.chain).join(" · ")}</p>
            </div>
          ) : null}
        </>
      ) : null}

      {valuation.status === "market_implied_hurdle" ? (
        <div className={styles.researchCoverageSummary}>
          <div>
            <span>Valor de mercado</span>
            <strong>{compactCurrency(implied.marketCap, valuation.currency)}</strong>
            <small>Capitalización observada</small>
          </div>
          <div>
            <span>Valor opcional implícito</span>
            <strong>{compactCurrency(implied.enterpriseOptionValue, valuation.currency)}</strong>
            <small>Capitalización − caja + deuda</small>
          </div>
          <div>
            <span>Runway</span>
            <strong>{implied.runwayYears !== null && implied.runwayYears !== undefined && Number.isFinite(Number(implied.runwayYears))
              ? `${Number(implied.runwayYears).toFixed(1)} años`
              : "Por validar"}</strong>
            <small>Tiempo hasta requerir capital adicional</small>
          </div>
        </div>
      ) : null}

      {macro ? (
        <div className={styles.researchCoverageSummary}>
          <div>
            <span>Oferta</span>
            <strong>{auroraSignedLabel(macro.axes?.supply)}</strong>
            <small>Restricción o holgura física</small>
          </div>
          <div>
            <span>Demanda</span>
            <strong>{auroraSignedLabel(macro.axes?.demand)}</strong>
            <small>Impulso agregado de consumo y pedidos</small>
          </div>
          <div>
            <span>Liquidez</span>
            <strong>{auroraSignedLabel(macro.axes?.liquidity)}</strong>
            <small>{macro.status === "current" ? "Contexto vigente" : "Contexto con rezago; no ajusta el valor"}</small>
          </div>
        </div>
      ) : null}

      {questions.length ? (
        <div className={styles.researchDetailGrid}>
          {questions.map((item) => (
            <ResearchMetric
              detail={item.whyItMatters}
              key={`${item.rank}-${item.question}`}
              label={`Prueba ${item.rank}`}
              tone="warn"
              value={item.question}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AuroraConditionalRangePreview({ valuation, range }) {
  if (valuation?.status !== "conditional_range" || !range) return null;
  const drivers = safeList(valuation.assumptions).slice(0, 5);
  const driverValue = (item) => {
    const value = Number(item?.value);
    if (!Number.isFinite(value)) return "—";
    if (["growth", "discount_rate", "terminal_growth"].includes(item.key)) return formatPct(value);
    if (item.key === "diluted_shares") return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(value);
    return compactCurrency(value, valuation.currency);
  };
  return (
    <section className={styles.researchStack} aria-label="Rango condicional AURORA">
      <div className={styles.researchScenarioGrid} data-count="3">
        {[
          ["low", "Adverso", "bad"],
          ["central", "Central condicional", "warn"],
          ["high", "Favorable", "good"],
        ].map(([key, label, tone]) => (
          <article className={styles.researchScenario} data-tone={tone} key={key}>
            <span>{label}</span>
            <strong>{compactCurrency(range[key], valuation.currency)}</strong>
            <small>{valuation.currency} por acción · no decision-ready</small>
          </article>
        ))}
      </div>
      <div className={styles.researchAttentionCallout}>
        <span>Por qué da este rango</span>
        <strong>{auroraMethodLabel(valuation.method)}</strong>
        <p>{drivers.map((item) => `${item.label}: ${driverValue(item)}`).join(" · ")}</p>
      </div>
    </section>
  );
}

function AuroraDebate({ research }) {
  const claims = safeList(research?.aurora?.debate);
  if (!claims.length) return null;
  return (
    <div className={styles.researchStack}>
      <div className={styles.researchAttentionCallout}>
        <span>Comité AURORA</span>
        <strong>Los roles discuten supuestos; no pueden cambiar hechos ni declarar una cifra decision-ready</strong>
        <p>Cada postura conserva mecanismo, procedencia y confianza.</p>
      </div>
      <div className={styles.researchDetailGrid}>
        {claims.map((item) => (
          <ResearchMetric
            detail={`${item.mechanism} · Procedencia: ${item.provenance}`}
            key={item.id}
            label={item.role}
            tone={item.stance === "challenge" ? "warn" : item.stance === "context_adjustment" ? "good" : "neutral"}
            value={item.claim}
          />
        ))}
      </div>
    </div>
  );
}

function formatCoverageScore(score) {
  const number = Number(score);
  if (!Number.isFinite(number)) return "-";
  return `${Math.round(number)}%`;
}

function buildClientUnavailableResearch(ticker, mode, reason) {
  const generatedAt = new Date().toISOString();
  const message = String(reason?.name === "AbortError"
    ? "El análisis directo tardó demasiado. Intenta de nuevo en un momento."
    : reason?.message || reason || "El análisis no respondió a tiempo.");
  return {
    ok: true,
    ticker,
    mode,
    generated_at: generatedAt,
    company_profile: { name: ticker, industry: "Sin fuente todavía" },
    financials: {
      annual: [],
      ratios: {},
      quality_flags: [],
    },
    valuation: {
      available: false,
      reason: message,
      scenarios: [],
      reverse_dcf: { available: false, reason: message },
      multiples: {},
    },
    report_markdown: [
      `# ${ticker}`,
      "",
      "## Estado",
      "El análisis no pudo completar la lectura con fuentes en esta sesión.",
      "",
      "## Qué falta",
      message,
      "",
      "No se generaron estados financieros, valoración ni tesis nuevas.",
    ].join("\n"),
    sources: {
      coverage: { score: 0, status: "needs_attention" },
      records: [{ source_id: "workspace:research-timeout", provider: "workspace", status: "error", error: message, retrieved_at: generatedAt }],
      data_points: [],
    },
    audit: {
      generated_at: generatedAt,
      status: "needs_attention",
      findings: [{ severity: "high", code: "research_timeout", message }],
    },
    downloads: [],
    artifacts: {
      report_md: true,
      model_xlsx: false,
      sources_json: false,
      audit_json: true,
    },
  };
}

function coverageTone(coverage) {
  const status = String(coverage?.status || "").toLowerCase();
  const score = Number(coverage?.score);
  const hasSourceGaps = safeList(coverage?.sourced_points_missing_ok_source).length > 0;
  const hasFormulaGaps = safeList(coverage?.calculated_points_missing_formula).length > 0;
  const hasExpectedGaps = safeList(coverage?.missing_expected_metrics).length > 0;
  if (status === "needs_attention" || hasSourceGaps || hasFormulaGaps || score < 60) return "bad";
  if (status === "partial" || hasExpectedGaps || score < 85) return "warn";
  if (status === "pass" || status === "complete" || score >= 85) return "good";
  return "neutral";
}

function humanizeToken(value) {
  const text = String(value || "")
    .replace(/[_\-]+/g, " ")
    .trim();
  if (!text) return "-";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function humanizeMetric(value) {
  const labels = {
    revenue: "ingresos",
    diluted_shares: "acciones diluidas",
    free_cash_flow: "flujo libre de caja",
    cash_from_operations: "flujo de caja operativo",
    cost_of_revenue: "costo de ventas",
    capital_expenditure: "inversión de capital",
    capital_expenditures: "inversión de capital",
    net_income: "utilidad neta",
    operating_income: "resultado operativo",
    gross_profit: "utilidad bruta",
    ebitda: "resultado operativo antes de depreciación y amortización",
    interest_expense: "gasto por intereses",
    fcff: "flujo de caja libre para la empresa",
    fcff_after_sbc: "flujo de caja para la empresa después de compensación en acciones",
    depreciation_amortization: "depreciación y amortización",
    common_stock_repurchased: "recompra de acciones",
    cash: "caja",
    total_assets: "activos totales",
    total_debt: "deuda total",
    short_term_debt: "deuda de corto plazo",
    long_term_debt: "deuda de largo plazo",
    total_equity: "patrimonio",
    net_receivables: "cuentas por cobrar",
    inventory: "inventarios",
    goodwill_and_intangibles: "plusvalía e intangibles",
    invested_capital: "capital invertido",
    cash_and_equivalents: "caja y equivalentes",
    stock_based_compensation: "compensación en acciones",
    latest_revenue: "ingresos",
    latest_diluted_shares: "acciones diluidas",
    latest_free_cash_flow: "flujo libre de caja",
    revenue_cagr_5y: "crecimiento anual de ingresos a 5 años",
    gross_margin: "margen bruto",
    operating_margin: "margen operativo",
    fcf_margin: "margen FCF",
    net_margin: "margen neto",
    cash_conversion: "conversión de utilidad en caja",
    sbc_as_pct_revenue: "compensación en acciones sobre ingresos",
    sbc_as_pct_fcf: "compensación en acciones sobre flujo libre de caja",
    current_basic_outstanding_shares: "acciones básicas en circulación",
    current_share_count_relative_difference: "diferencia en el número de acciones",
    base_intrinsic_value_per_share: "valor base/acción",
    reverse_dcf_implied_revenue_cagr: "crecimiento DCF inverso",
    latest_sec_filing: "último informe presentado ante la SEC",
    wacc: "tasa de descuento",
    terminal_growth: "crecimiento de largo plazo",
    current_price: "precio actual",
    valuation_range_central: "estimación central",
    reverse_dcf_status: "contraste con el precio actual",
    ev_to_sales: "valor empresa sobre ventas",
    price_to_fcf: "precio sobre flujo libre de caja",
    preferred_stock: "acciones preferentes",
    minority_interest: "participaciones de terceros",
    unfunded_pension_liability: "obligación de pensiones no informada",
    lease_liabilities_not_in_debt: "arrendamientos fuera de deuda",
    non_operating_investments: "inversiones no operativas",
    valuation_research_grade: "confirmación de la estimación central",
    valuation_not_decision_ready: "datos necesarios para publicar la valoración",
    structural_scale_bridge: "Explicar el cambio de escala",
    ttm_scale_inputs_reconciliation: "Conciliar ingresos y acciones de los últimos doce meses",
    ttm_equity_bridge_reconciliation: "Conciliar caja y deuda de los últimos doce meses",
    capacity_and_asset_turnover_support: "Capacidad productiva y rotación de activos",
    organic_or_acquisition_revenue_bridge: "Crecimiento orgánico, adquisiciones y desinversiones",
    segment_reconciliation: "Ingresos y rentabilidad por segmento",
    share_dilution_support: "Acciones diluidas y posible dilución",
    stock_compensation_treatment: "Compensación en acciones",
    equity_bridge_completeness: "Puente entre valor empresa y patrimonio",
    operating_cash_separation: "Caja operativa y caja excedente",
    future_estimate_support: "Estimaciones financieras futuras",
    growth_reinvestment_support: "Reinversión necesaria para crecer",
    currency_consistency: "Moneda de estados y cotización",
    sec_statement_reconciliation: "Conciliación con estados presentados",
    cycle_coverage: "Ciclo financiero completo",
    discount_rate_support: "Datos usados en la tasa de descuento",
    valuation_cross_check: "Contraste con otro método de valoración",
    range_reliability: "Rango suficientemente informativo",
    tangible_book_support: "Historial de patrimonio tangible",
    independent_price_confirmation: "Validar el precio para la valoración",
    valuation_inputs: "Insumos fundamentales de valoración",
  };
  return labels[value] || String(value || "").replace(/[_\-]+/g, " ");
}

const SAFE_VALUATION_GAPS = new Set([
  "structural_scale_bridge",
  "ttm_scale_inputs_reconciliation",
  "ttm_equity_bridge_reconciliation",
  "capacity_and_asset_turnover_support",
  "organic_or_acquisition_revenue_bridge",
  "segment_reconciliation",
  "share_dilution_support",
  "stock_compensation_treatment",
  "equity_bridge_completeness",
  "operating_cash_separation",
  "future_estimate_support",
  "growth_reinvestment_support",
  "current_price",
  "currency_consistency",
  "sec_statement_reconciliation",
  "cycle_coverage",
  "discount_rate_support",
  "valuation_cross_check",
  "range_reliability",
  "tangible_book_support",
  "independent_price_confirmation",
  "valuation_inputs",
]);

function valuationPendingChecks(valuation) {
  const bridgeMissing = safeList(valuation?.structural_scale_bridge?.missing);
  return [...new Set([
    valuation?.blocking_gap,
    ...safeList(valuation?.pending_checks),
    ...bridgeMissing,
  ].map((item) => String(item || "").toLowerCase()).filter((item) => SAFE_VALUATION_GAPS.has(item)))];
}

function humanizeMetricPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Métrica";
  const segments = raw.split(".").filter(Boolean);
  const candidates = [
    raw,
    segments.at(-1),
    segments.length > 1 ? segments.slice(-2).join("_") : "",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const label = humanizeMetric(candidate);
    if (label !== candidate.replace(/[_\-]+/g, " ")) return label;
  }
  return humanizeMetric(segments.at(-1) || raw);
}

function humanizeSourceAuthority(value) {
  const text = String(value || "").trim();
  if (!text) return "Sin evaluación de autoridad de fuente.";
  if (/fmp.*(?:sec|xbrl).*(?:cross.?check|contrast)|(?:sec|xbrl).*fmp/i.test(text)) {
    return "Estados normalizados por Financial Modeling Prep y contrastados con datos XBRL de la SEC.";
  }
  if (/sec.*(?:primary|company facts|xbrl)/i.test(text)) {
    return "Estados contrastados con información presentada ante la SEC.";
  }
  if (/fmp.*normalized statements/i.test(text)) {
    return "Estados normalizados por Financial Modeling Prep.";
  }
  return "La autoridad de esta fuente necesita una clasificación adicional.";
}

function humanizeProvider(value) {
  const provider = String(value || "").trim();
  if (!provider) return "Fuente pendiente";
  if (/fmp\s*\+\s*sec|mixed/i.test(provider)) return "FMP + SEC";
  if (/^fmp$/i.test(provider) || /financial modeling prep/i.test(provider)) return "Financial Modeling Prep";
  if (/^sec(?:[\s-]+edgar)?$/i.test(provider) || /sec company facts/i.test(provider)) return "SEC EDGAR";
  if (/workspace/i.test(provider)) return "Espacio de trabajo";
  return "Proveedor financiero";
}

function humanizeIndustry(value) {
  const industry = String(value || "").trim();
  if (!industry) return "Industria no informada";
  const rules = [
    [/semiconductor|memory/i, "Semiconductores"],
    [/software|saas|cloud|internet content|information technology/i, "Software y servicios digitales"],
    [/bank|thrift/i, "Banca"],
    [/credit services|consumer finance|mortgage finance/i, "Servicios de crédito"],
    [/insurance|reinsurance/i, "Seguros"],
    [/biotech|biotechnology|clinical stage|pharmaceutical|drug manufacturer/i, "Biotecnología y medicamentos"],
    [/medical device|medical instrument|diagnostic/i, "Dispositivos y diagnóstico médico"],
    [/oil|gas|energy/i, "Energía"],
    [/mining|metal|steel|materials/i, "Minería y materiales"],
    [/chemical/i, "Químicos"],
    [/airline|airport/i, "Transporte aéreo"],
    [/automobile|auto manufacturer|auto part/i, "Industria automotriz"],
    [/utility|utilities/i, "Servicios básicos"],
    [/reit|real estate/i, "Bienes raíces"],
    [/telecom|communication services/i, "Telecomunicaciones"],
    [/retail|e-?commerce|internet retail/i, "Comercio minorista"],
    [/restaurant|food|beverage/i, "Alimentos y restaurantes"],
    [/aerospace|defense/i, "Aeroespacial y defensa"],
    [/industrial|machinery|construction/i, "Industria y maquinaria"],
    [/payment|transaction processing/i, "Pagos y procesamiento de transacciones"],
  ];
  return rules.find(([pattern]) => pattern.test(industry))?.[1] || "Industria informada por el proveedor";
}

function humanizeQualityFlag(flag) {
  const text = `${flag?.code || ""} ${flag?.title || ""}`.toLowerCase();
  const rules = [
    [/receivable/, "Las cuentas por cobrar requieren revisión"],
    [/inventory/, "Los inventarios requieren revisión"],
    [/stock.?based|\bsbc\b/, "La compensación en acciones requiere revisión"],
    [/cash.?conversion/, "La conversión de utilidad en caja requiere revisión"],
    [/free.?cash|\bfcf\b/, "El flujo libre de caja requiere revisión"],
    [/margin/, "Los márgenes requieren revisión"],
    [/debt|leverage/, "La deuda requiere revisión"],
    [/share|dilution/, "El número de acciones y la dilución requieren revisión"],
    [/revenue|growth/, "El crecimiento de ingresos requiere revisión"],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] || "Control de calidad contable";
}

function humanizeSourceType(source) {
  const text = `${source?.source_id || ""} ${source?.endpoint_or_filing || ""}`.toLowerCase();
  if (/submission|filing|company.?facts|xbrl|sec/.test(text)) return "Informes presentados ante la SEC";
  if (/income/.test(text)) return "Estado de resultados";
  if (/balance/.test(text)) return "Balance general";
  if (/cash.?flow/.test(text)) return "Estado de flujo de caja";
  if (/estimate|analyst/.test(text)) return "Estimaciones de mercado";
  if (/quote|historical|close|price/.test(text)) return "Precio de mercado";
  if (/profile/.test(text)) return "Perfil de la empresa";
  return "Datos financieros";
}

function humanizeClaimTag(value) {
  const tags = {
    sourced_fact: "Dato de fuente",
    source_backed: "Dato de fuente",
    calculated_metric: "Cálculo reproducible",
    assumption: "Supuesto",
    uncertainty: "Dato pendiente",
  };
  return tags[String(value || "").toLowerCase()] || "Dato registrado";
}

function humanizeEvidenceUnit(value) {
  const raw = String(value || "").trim();
  const perShareCurrency = raw.match(/^([A-Z]{3})\/share$/i);
  if (perShareCurrency) return `${perShareCurrency[1].toUpperCase()} por acción`;
  const units = {
    ratio: "proporción",
    shares: "acciones",
    years: "años",
    year: "año",
    percent: "porcentaje",
    "usd/share": "USD por acción",
  };
  return units[raw.toLowerCase()] || raw;
}

function formatEvidenceValue(point) {
  if (point?.normalized_value === null || point?.normalized_value === undefined) return "-";
  const rawValue = point.normalized_value;
  const rawUnit = String(point?.unit || "").trim();
  const normalizedUnit = rawUnit.toLowerCase();
  const number = Number(rawValue);
  if (Number.isFinite(number)) {
    if (["ratio", "percent", "percentage", "%"].includes(normalizedUnit)) {
      const ratio = normalizedUnit === "ratio" || Math.abs(number) <= 1 ? number : number / 100;
      return new Intl.NumberFormat("es-CL", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(ratio);
    }
    if (normalizedUnit === "shares") {
      return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(number)} acciones`;
    }
    if (/^[A-Z]{3}$/.test(rawUnit.toUpperCase())) {
      return compactCurrency(number, rawUnit.toUpperCase());
    }
    const perShareCurrency = rawUnit.match(/^([A-Z]{3})\/share$/i);
    if (perShareCurrency) {
      return `${compactCurrency(number, perShareCurrency[1].toUpperCase())} por acción`;
    }
    if (["year", "years"].includes(normalizedUnit)) {
      return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(number)} ${number === 1 ? "año" : "años"}`;
    }
    const value = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(number);
    const unit = humanizeEvidenceUnit(rawUnit);
    return unit ? `${value} · ${unit}` : value;
  }
  const value = String(rawValue).slice(0, 32);
  const unit = humanizeEvidenceUnit(rawUnit);
  return unit ? `${value} · ${unit}` : value;
}

function humanizeSourceStatus(value) {
  const statuses = {
    ok: "Disponible",
    ready: "Lista",
    completed: "Completa",
    done: "Completa",
    running: "En curso",
    pass: "Verificada",
    complete: "Completa",
    partial: "Parcial",
    pending: "Pendiente",
    blocked: "Bloqueada",
    stale: "Vencida",
    unavailable: "No disponible",
    missing: "No disponible",
    skipped: "No ejecutada",
    needs_attention: "Requiere revisión",
    error: "No disponible",
    failed: "No disponible",
  };
  return statuses[String(value || "").toLowerCase()] || "Estado pendiente";
}

function evidenceStrength(score, status) {
  const raw = Number(score);
  const points = Number.isFinite(raw) ? Math.round((raw <= 1 ? raw * 100 : raw)) : null;
  const normalizedStatus = String(status || "").toLowerCase();
  const level = normalizedStatus === "high"
    ? "Alta"
    : normalizedStatus === "medium"
      ? "Media"
      : normalizedStatus === "low"
        ? "Baja"
        : points === null
          ? "Pendiente"
          : points >= 78
            ? "Alta"
            : points >= 50
              ? "Media"
              : "Baja";
  return points === null ? level : `${level} · ${Math.max(0, Math.min(100, points))}/100`;
}

function parseJsonish(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  const text = String(value || "").trim();
  if (!text) return {};
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return { memo_patch: text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim() };
  }
}

function finalAnalysisFrom(orchestrator) {
  const analysis = parseJsonish(orchestrator?.analysis);
  if (analysis.memo_patch && !analysis.executive_judgment) {
    const nested = parseJsonish(analysis.memo_patch);
    if (nested.executive_judgment || nested.strongest_points || nested.red_team || nested.open_questions) {
      return nested;
    }
  }
  return analysis;
}

const AGENT_DISPLAY_NAMES = {
  orchestrator: "Coordinador",
  orchestrator_agent: "Coordinador",
  company_profile_agent: "Perfil de negocio",
  financial_quality_agent: "Calidad financiera",
  valuation_agent: "Valoración",
  risk_agent: "Riesgos",
  catalyst_agent: "Archivos y catalizadores",
  red_team_agent: "Cuestionamiento",
  editor_auditor_agent: "Edición y auditoría",
};

function agentDisplayName(agent) {
  const fallback = firstUsefulText(agent?.name, "Revisión analítica").replace(/\s+Agent$/i, " revisión");
  return AGENT_DISPLAY_NAMES[agent?.id] || fallback;
}

function agentFriendlyNameFromText(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+Agent$/i, "_agent")
    .toLowerCase()
    .replace(/\s+/g, "_");
  return AGENT_DISPLAY_NAMES[normalized] || String(value || "").replace(/\s+Agent$/i, " revisión").trim();
}

function analysisItems(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const text = String(value || "").trim();
  return text ? [text] : [];
}

function finalEditorMarkdownFromAnalysis(value) {
  const analysis = finalAnalysisFrom({ analysis: value });
  const judgment = firstUsefulText(analysis.executive_judgment, analysis.memo_patch);
  const sections = [
    ["Qué lo sustenta:", analysisItems(analysis.strongest_points)],
    ["Qué podría fallar:", analysisItems(analysis.red_team)],
    ["Pendientes:", analysisItems(analysis.open_questions)],
  ];
  const lines = [
    "## Síntesis final",
    "Una llamada final de edición lee solo el paquete de auditoría terminado. Los roles de revisión cuestionan el caso, pero Python sigue siendo la capa de cálculo.",
  ];
  if (judgment) {
    lines.push("", `Conclusión: ${judgment}`);
  }
  sections.forEach(([label, items]) => {
    if (!items.length) return;
    lines.push("", label, ...items.slice(0, 4).map((item) => `- ${item}`));
  });
  return lines.join("\n");
}

function cleanReportMarkdown(markdown) {
  let text = String(markdown || "No se generó texto de reporte.");
  text = text.replace(/^#\s+(.+?)\s+research OS memo\s*$/gim, "# $1");
  text = text.replace(
    /(?:^|\n)-?\s*Final LLM orchestrator:\s*```(?:json)?\s*([\s\S]*?)```/gi,
    (_match, body) => `\n${finalEditorMarkdownFromAnalysis(body)}`,
  );
  text = text.replace(
    /(?:^|\n)-?\s*Final LLM orchestrator:\s*(\{[\s\S]*?\})(?=\n\n##|\n##|$)/gi,
    (_match, body) => `\n${finalEditorMarkdownFromAnalysis(body)}`,
  );
  text = text.replace(/## Agent research desk/gi, "## Escritorio de análisis");
  text = text.replace(
    /^Agent layer:.*$/gim,
    "Cómo leerlo: Python extrae los datos y calcula las métricas. El escritorio de análisis es un conjunto de roles reproducibles que leen los resultados auditados, cuestionan el caso y señalan los pendientes.",
  );
  text = text.replace(
    /^-\s*([^:\n]+(?:Agent|Orchestrator))\s*\[([^\]]+)\]:\s*/gim,
    (_match, name, status) => `- ${agentFriendlyNameFromText(name)} (${humanizeToken(status)}): `,
  );
  text = text
    .split(/\r?\n/)
    .filter((line) => !/one-call final editor|returned error|too many requests|client error|api\.openai|sources\.json|provider endpoints|row counts|coverage gaps/i.test(line))
    .join("\n");
  text = text
    .replace(/^Company:\s*/gim, "Compañía: ")
    .replace(/\bFinancial quality review\b/gi, "Revisión financiera")
    .replace(/\bLatest FCF margin\b/gi, "Margen FCF reciente")
    .replace(/\baccounting flags were triggered\b/gi, "alertas contables activas");
  return text;
}

function firstUsefulText(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

function summarizeGaps(metrics, limit = Number.POSITIVE_INFINITY) {
  const list = [...new Set(safeList(metrics).map(humanizeMetric).filter(Boolean))];
  if (!list.length) return "Sin brechas de evidencia requeridas.";
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.floor(Number(limit))
    : list.length;
  const visible = list.slice(0, safeLimit);
  const remaining = list.length - visible.length;
  return `${visible.join(", ")}${remaining > 0 ? `, +${remaining} más` : ""}`;
}

function unresolvedBridgeFields(valuation) {
  const bridge = valuation?.equity_bridge || {};
  const claims = safeList(bridge.unresolved_claims).map((claim) => claim?.field || claim?.key || claim?.name);
  return [...new Set([
    ...safeList(bridge.unresolved_fields),
    ...safeList(bridge.missing_optional_fields),
    ...claims,
  ].filter(Boolean))];
}

function researchGradeReview(research, valuationPresentation) {
  const coverage = research?.sources?.coverage || research?.audit?.coverage || {};
  const missingMetrics = safeList(coverage.missing_expected_metrics);
  const bridgeFields = unresolvedBridgeFields(research?.valuation);
  const pendingFields = [...new Set([...missingMetrics, ...bridgeFields])];
  const price = Number(valuationPresentation?.currentPrice);
  const low = Number(valuationPresentation?.range?.low);
  const high = Number(valuationPresentation?.range?.high);
  const hasPrice = Number.isFinite(price) && price > 0;
  const hasRange = Number.isFinite(low) && Number.isFinite(high) && low > 0 && high >= low;
  const cycle = research?.valuation?.cycle_normalization || {};
  const cycleYears = Number(cycle.years);
  const cycleContext = [
    cycle.available === true && Number.isFinite(cycleYears) && cycleYears > 0
      ? `La normalización del ciclo usa ${Math.round(cycleYears)} ejercicios${cycle.current_regime_supported === true ? " y el margen actual está dentro del rango de soporte del ciclo" : ""}.`
      : "",
    cycle.structural_break === true
      ? "Los ingresos actuales están fuera del historial observado; el rango supone una reversión gradual hacia un nivel sostenible."
      : "",
  ].filter(Boolean).join(" ");
  const priceLabel = hasPrice
    ? `${compactCurrency(price, valuationPresentation.currency)} observado al ${formatMarketDate(valuationPresentation.marketDataAsOf)}`
    : "Precio pendiente de contraste";
  const knownDetail = hasPrice
    ? `${valuationPresentation.priceIsContextual ? "Reconciliado dentro del proveedor; aún falta una fuente independiente." : "Precio contrastado con fuente independiente."} Método: ${valuationPresentation.primaryMethod}. ${cycleContext}`
    : `Método: ${valuationPresentation.primaryMethod}. El rango no se compara todavía con un precio vigente. ${cycleContext}`;
  const pendingLabel = pendingFields.length
    ? summarizeGaps(pendingFields, 3)
    : valuationPresentation.priceIsContextual
      ? "validación independiente del precio"
      : "revisión final de los supuestos";
  const pendingDetail = firstUsefulText(
    safeList(research?.valuation?.reliability?.limitations)[0],
    valuationPresentation.reason,
    "El rango es útil para investigar, pero no respalda una cifra central.",
  );

  let readingLabel = "El rango aún no puede compararse con un precio vigente";
  if (hasPrice && hasRange && valuationPresentation.priceIsContextual) {
    const position = price < low ? "por debajo" : price > high ? "por encima" : "dentro";
    readingLabel = `Comparación preliminar: precio ${position} del rango`;
  } else if (hasPrice && hasRange && price < low) readingLabel = "El precio validado está por debajo del rango";
  else if (hasPrice && hasRange && price >= low && price <= high) readingLabel = "El precio validado está dentro del rango";
  else if (hasPrice && hasRange && price > high) readingLabel = "El precio validado está por encima del rango";
  const readingDetail = valuationPresentation.priceIsContextual
    ? "Confírmalo con una fuente independiente antes de interpretar la diferencia frente al rango."
    : bridgeFields.length
    ? `Resolver ${summarizeGaps(bridgeFields, 2)} puede desplazar el rango; por eso la estimación central permanece retenida.`
    : "La lectura cambia si el crecimiento, la rentabilidad normalizada o la tasa de descuento dejan de sostenerse.";

  return {
    known: {
      label: hasRange ? formatValuationRange(valuationPresentation) : "Rango pendiente",
      detail: `${priceLabel}. ${knownDetail}`,
    },
    pending: { label: pendingLabel, detail: pendingDetail },
    reading: { label: readingLabel, detail: readingDetail },
  };
}

function renderResearchGradeReview(research, valuationPresentation, heading) {
  const review = researchGradeReview(research, valuationPresentation);
  return (
    <div className={styles.researchStack}>
      <div className={styles.researchAttentionCallout}>
        <span>{heading}</span>
        <strong>Hay una lectura útil, pero no una cifra central lista para decidir</strong>
        <p>El rango muestra qué resultados son razonables con la evidencia disponible y deja visibles los puntos que todavía pueden moverlo.</p>
      </div>
      <div className={styles.researchCoverageSummary}>
        <div>
          <span>Qué sabemos</span>
          <strong>{review.known.label}</strong>
          <small>{review.known.detail}</small>
        </div>
        <div>
          <span>Qué falta</span>
          <strong>{review.pending.label}</strong>
          <small>{review.pending.detail}</small>
        </div>
        <div>
          <span>Qué cambia la lectura</span>
          <strong>{review.reading.label}</strong>
          <small>{review.reading.detail}</small>
        </div>
      </div>
    </div>
  );
}

function ResearchMetric({ label, value, detail, tone = "neutral" }) {
  return (
    <div className={styles.researchMetric} data-tone={tone}>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function ResearchStage({ stage, state }) {
  return (
    <div className={styles.researchStage} data-state={state}>
      <span aria-hidden="true" />
      <strong>{stage.label}</strong>
      <small>{stage.detail}</small>
    </div>
  );
}

function findSuggestedTickers(dashboard) {
  const tickers = [
    dashboard?.primary_action?.ticker,
    ...safeList(dashboard?.secondary_actions).map((item) => item?.ticker),
    ...safeList(dashboard?.modules?.portfolio?.holdings).map((item) => item?.ticker || item?.symbol),
    ...safeList(dashboard?.modules?.scanner?.rows).map((item) => item?.ticker),
  ]
    .map(cleanTicker)
    .filter(Boolean);
  return [...new Set(tickers)].slice(0, 6);
}

function downloadArtifact(artifact) {
  if (!artifact?.content_base64 || !artifact?.filename) return;
  const binary = window.atob(artifact.content_base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: artifact.media_type || "application/octet-stream" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = artifact.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function artifactLabel(filename) {
  if (!filename) return "Descargar";
  if (filename.endsWith(".xlsx")) return "Modelo";
  if (filename.endsWith("_report.md")) return "Memo";
  if (filename.endsWith("_sources.json")) return "Fuentes";
  if (filename.endsWith("_audit.json")) return "Auditoría";
  if (filename.endsWith("_assumptions.yml")) return "Supuestos";
  return filename;
}

function renderMarkdownMemo(markdown) {
  const lines = cleanReportMarkdown(markdown).split(/\r?\n/);
  return lines.map((line, index) => {
    const key = `${index}-${line.slice(0, 12)}`;
    const trimmed = line.trim();
    if (!trimmed) return <div className={styles.researchMemoBreak} key={key} />;
    if (/^```/.test(trimmed) || /^[{}\[\],]+$/.test(trimmed)) return null;
    if (/^"?(executive_judgment|strongest_points|red_team|open_questions|memo_patch)"?\s*:/.test(trimmed)) return null;
    if (line.startsWith("# ")) return <h3 key={key}>{line.replace(/^#\s+/, "")}</h3>;
    if (line.startsWith("## ")) return <h4 key={key}>{line.replace(/^##\s+/, "")}</h4>;
    if (line.startsWith("- ")) return <p className={styles.researchMemoBullet} key={key}>{line.replace(/^-\s+/, "")}</p>;
    return <p key={key}>{line}</p>;
  });
}

function renderMemo(research, valuationPresentation) {
  if (!research) {
    return <p className={styles.emptyCopy}>Ingresa un ticker y haz clic en Analizar para generar el memo, valoración y auditoría.</p>;
  }
  if (!valuationPresentation?.backed && valuationPresentation?.showValuationFigures) {
    return renderResearchGradeReview(research, valuationPresentation, "Memo para continuar la investigación");
  }
  if (!valuationPresentation?.backed) {
    return renderBlockedValuationHelp(research, valuationPresentation, "Memo en revisión");
  }
  const coverage = research?.sources?.coverage || research?.audit?.coverage || {};
  const findings = safeList(research?.audit?.findings);
  const degraded = coverageTone(coverage) === "bad" || research?.audit?.status === "needs_attention";
  return (
    <div className={styles.researchMemoReader} data-state={degraded ? "degraded" : "ready"}>
      {degraded ? (
        <div className={styles.researchAttentionCallout}>
          <span>Faltan estados con fuente</span>
          <strong>{summarizeGaps(coverage.missing_expected_metrics, 3)}</strong>
          <p>{findings[0]?.message || humanizeSourceAuthority(coverage.statement_authority) || "El análisis se completó, pero el registro de evidencia no es suficiente para un memo de valoración."}</p>
        </div>
      ) : null}
      {renderMarkdownMemo(research.report_markdown)}
    </div>
  );
}

function marketRangeReading(valuationPresentation) {
  const price = Number(valuationPresentation?.currentPrice);
  const low = Number(valuationPresentation?.range?.low);
  const high = Number(valuationPresentation?.range?.high);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(low) || !Number.isFinite(high)) {
    return {
      label: "Sin comparación vigente",
      detail: "Hace falta un precio actual contrastado para comparar mercado y valoración.",
      tone: "neutral",
    };
  }
  if (valuationPresentation?.priceIsContextual) {
    const position = price > high ? "por encima" : price < low ? "por debajo" : "dentro";
    return {
      label: "Comparación preliminar con el precio del proveedor",
      detail: `El precio informado está ${position} del rango. Confírmalo con una fuente independiente antes de interpretar esta diferencia.`,
      tone: "warn",
    };
  }
  if (price > high) {
    const priceToHigh = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(price / high);
    return {
      label: "El precio supera el rango",
      detail: `El precio equivale a ${priceToHigh} veces el extremo alto. El mercado exige resultados superiores al escenario alto; revisa crecimiento, margen y capital requerido.`,
      tone: "warn",
    };
  }
  if (price < low) {
    return {
      label: "El precio está por debajo del rango",
      detail: "Revisa si el escenario bajo omite un deterioro operativo, financiero o competitivo.",
      tone: "warn",
    };
  }
  return {
    label: "El precio está dentro del rango",
    detail: "La cotización es compatible con los escenarios mostrados; la decisión depende de qué supuestos consideres sostenibles.",
    tone: "neutral",
  };
}

function normalizeDriverRows(value) {
  return safeList(value).map((item, index) => {
    if (typeof item === "string") {
      return { key: `driver-${index}`, label: item, value: "Vigente", unit: "" };
    }
    if (!item || typeof item !== "object") return null;
    const key = String(item.key || item.metric || item.name || `driver-${index}`);
    return {
      key,
      label: firstUsefulText(item.label, item.title, humanizeMetric(key)),
      value: item.value ?? item.display_value ?? item.threshold ?? null,
      unit: firstUsefulText(item.unit, item.value_unit),
    };
  }).filter(Boolean);
}

function driverIsPercentage(row) {
  const unit = String(row?.unit || "").toLowerCase();
  if (["percent", "percentage", "%", "percentage_points"].includes(unit)) return true;
  return unit === "ratio" && /growth|margin|rate|cagr|roic|terminal|crecimiento|margen|tasa/i.test(`${row?.key || ""} ${row?.label || ""}`);
}

function formatDriverValue(value, unit, row = {}) {
  if (value === null || value === undefined || value === "") return "Pendiente";
  if (typeof value === "string") return value;
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const normalizedUnit = String(unit || "").toUpperCase();
  if (driverIsPercentage({ ...row, unit })) {
    const percentage = Math.abs(number) <= 1 ? number * 100 : number;
    return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(percentage);
  }
  if (/^[A-Z]{3}$/.test(normalizedUnit)) return compactCurrency(number, normalizedUnit);
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(number);
}

function humanizeDriverUnit(value, row = {}) {
  const units = {
    percent: "%",
    percentage: "%",
    percentage_points: "puntos porcentuales",
    years: "años",
    year: "años",
    ratio: "veces",
    multiple: "veces",
    usd_per_share: "USD por acción",
  };
  const raw = String(value || "").trim();
  if (driverIsPercentage({ ...row, unit: raw })) return "%";
  return units[raw.toLowerCase()] || raw || "-";
}

function DriverTable({ title, rows, reading }) {
  if (!rows.length) return null;
  return (
    <div aria-label={title} className={styles.researchTable} role="table">
      <div className={styles.researchTableHeader} role="row">
        <span role="columnheader">{title}</span>
        <span role="columnheader">Valor</span>
        <span role="columnheader">Unidad</span>
        <span role="columnheader">Lectura</span>
      </div>
      {rows.map((row) => (
        <div className={styles.researchTableRow} key={`${title}-${row.key}`} role="row">
          <strong role="rowheader">{row.label}</strong>
          <span role="cell">{formatDriverValue(row.value, row.unit, row)}</span>
          <span role="cell">{humanizeDriverUnit(row.unit, row)}</span>
          <span role="cell">{row.reading || reading || "-"}</span>
        </div>
      ))}
    </div>
  );
}

function DriverSummary({ value }) {
  const summary = value && typeof value === "object" ? value : {};
  const requirements = normalizeDriverRows(summary.requirements || summary.holds || summary.what_must_hold);
  const breakers = normalizeDriverRows(summary.breakers || summary.risks || summary.what_breaks_range);
  const meanReversionYears = Number(summary.mean_reversion_years);
  if (Number.isInteger(meanReversionYears) && meanReversionYears > 0 && !requirements.some((row) => /reversion|reversión|horizon/i.test(row.key))) {
    requirements.push({
      key: "mean_reversion_years",
      label: "Horizonte de reversión",
      value: meanReversionYears,
      unit: "years",
    });
  }
  if (!requirements.length && !breakers.length) return null;
  return (
    <div className={styles.researchStack}>
      <div className={styles.researchAttentionCallout}>
        <span>Supuestos decisivos</span>
        <strong>Qué sostiene el rango y cuándo deja de ser útil</strong>
        <p>Estos son los supuestos concretos que debes revisar antes de usar la valoración.</p>
      </div>
      <DriverTable title="Qué tendría que cumplirse" rows={requirements} reading="Debe sostenerse" />
      <DriverTable title="Qué rompe el rango" rows={breakers} reading="Obliga a recalcular" />
    </div>
  );
}

function firstDefined(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "");
}

function boundedPercentage(value) {
  if (!value || typeof value !== "object") return null;
  const low = firstDefined(value.low, value.minimum, value.floor);
  const high = firstDefined(value.high, value.maximum, value.ceiling);
  if (low === undefined || high === undefined) return null;
  return `${formatDriverValue(low, "percent")}–${formatDriverValue(high, "percent")}`;
}

function MarketRequirements({ value, currency }) {
  if (!value || typeof value !== "object" || value.available === false) return null;
  const requirementCurrency = value.currency || currency;
  const rowsFromPayload = normalizeDriverRows(value.requirements || value.rows);
  const operatingRowsFromPayload = rowsFromPayload.filter((row) => !["assets_added", "obligations_deducted"].includes(row.key));
  const rawGrowthBound = firstDefined(value.implied_revenue_cagr_bound, value.growth_bound, value.bound);
  const impliedGrowthBound = boundedPercentage(rawGrowthBound) || (typeof rawGrowthBound === "string" ? rawGrowthBound : null);
  const operatingRows = (operatingRowsFromPayload.length ? operatingRowsFromPayload : [
    {
      key: "implied_revenue_cagr",
      label: "Crecimiento anual de ingresos",
      value: firstDefined(value.implied_revenue_cagr, impliedGrowthBound),
      unit: "percent",
    },
    {
      key: "normalized_margin",
      label: "Margen de caja normalizado",
      value: firstDefined(value.normalized_margin, value.normalized_cash_flow_margin, value.normalized_fcf_margin, value.cash_flow_margin),
      unit: "percent",
    },
    {
      key: "discount_rate",
      label: "Tasa de descuento",
      value: firstDefined(value.discount_rate, value.wacc),
      unit: "percent",
    },
    {
      key: "horizon_years",
      label: "Horizonte de proyección",
      value: firstDefined(value.horizon_years, value.forecast_horizon_years),
      unit: "years",
    },
    {
      key: "terminal_growth",
      label: "Crecimiento de largo plazo",
      value: value.terminal_growth,
      unit: "percent",
    },
  ]).filter((row) => row.value !== null && row.value !== undefined && row.value !== "");
  const bridgeRows = [
    {
      key: "assets_added",
      label: "Caja e inversiones sumadas",
      value: value.assets_added,
      unit: requirementCurrency,
      reading: "Sumado",
    },
    {
      key: "obligations_deducted",
      label: "Deuda y otros compromisos restados",
      value: value.obligations_deducted,
      unit: requirementCurrency,
      reading: "Restado",
    },
  ].filter((row) => row.value !== null && row.value !== undefined && row.value !== "");
  if (!operatingRows.length && !bridgeRows.length) return null;
  const price = Number(value.reference_price ?? value.current_price ?? value.price);
  const marketDate = formatMarketDate(value.market_data_as_of);
  const priceLabel = Number.isFinite(price) && price > 0
    ? ["contextual", "provider_reconciled"].includes(value.price_context)
      ? `precio del proveedor de ${compactCurrency(price, requirementCurrency)} al ${marketDate}`
      : value.price_context === "validated"
        ? `precio validado de ${compactCurrency(price, requirementCurrency)} al ${marketDate}`
        : `precio de ${compactCurrency(price, requirementCurrency)}`
    : ["contextual", "provider_reconciled"].includes(value.price_context)
      ? `precio del proveedor al ${marketDate}`
      : value.price_context === "validated"
        ? `precio validado al ${marketDate}`
        : "precio actual";
  return (
    <div className={styles.researchStack}>
      <div className={styles.researchAttentionCallout}>
        <span>Lectura inversa</span>
        <strong>{`Qué tendría que sostener el ${priceLabel}`}</strong>
        <p>{bridgeRows.length
          ? "No es una estimación de valor razonable. La primera tabla muestra los resultados operativos que justificarían el precio; la segunda explica cómo caja y compromisos convierten valor empresa en valor para el accionista."
          : "No es una estimación de valor razonable. La tabla muestra los resultados operativos que justificarían el precio bajo estos supuestos."}</p>
      </div>
      <DriverTable title="Requisito del precio" rows={operatingRows} reading="Debe sostenerse" />
      <DriverTable title="Paso a valor del accionista" rows={bridgeRows} />
    </div>
  );
}

const NON_ACTIONABLE_BLOCKED_OUTPUTS = new Set([
  "valuation_range_central",
  "reverse_dcf_status",
  "ev_to_sales",
  "price_to_fcf",
]);

function capitalizeLabel(value) {
  const label = humanizeMetric(value);
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Control pendiente";
}

function blockedGapDetail(gap) {
  const details = {
    structural_scale_bridge: "Reconciliar el salto entre el historial y los últimos doce meses antes de asumir que la nueva escala es sostenible.",
    ttm_scale_inputs_reconciliation: "Confirmar ingresos y acciones de cada trimestre con estados presentados y una secuencia fiscal coherente.",
    ttm_equity_bridge_reconciliation: "Conciliar la caja y la deuda de los últimos doce meses con el balance más reciente antes de calcular el valor para el accionista.",
    capacity_and_asset_turnover_support: "Comprobar que capacidad instalada, utilización y rotación de activos pueden sostener los ingresos actuales.",
    organic_or_acquisition_revenue_bridge: "Separar crecimiento orgánico, adquisiciones, ventas de activos y cambios contables que expliquen el salto de ingresos.",
    segment_reconciliation: "Reconciliar ingresos y rentabilidad por segmento para identificar qué negocio explica el cambio.",
    wacc: "Calcular una tasa de descuento coherente con riesgo operativo, estructura de capital y costo de la deuda.",
    terminal_growth: "Definir un crecimiento de largo plazo inferior a la tasa de descuento y compatible con el sector.",
    current_price: "Obtener un precio reciente, comprobar fecha, moneda, mercado y número de acciones antes de compararlo con la empresa.",
    latest_revenue: "Completar los ingresos recientes y contrastarlos con los estados presentados.",
    latest_diluted_shares: "Conciliar acciones diluidas con acciones en circulación y posibles instrumentos convertibles.",
    net_debt: "Conciliar caja, inversiones, deuda y arrendamientos para pasar de valor empresa a valor del patrimonio.",
    latest_sec_filing: "Incorporar el último informe presentado para comprobar que los estados usados siguen vigentes.",
    currency_consistency: "Confirmar que estados, cotización y estimaciones usan la misma moneda o documentar la conversión aplicada.",
    sec_statement_reconciliation: "Conciliar ingresos, caja y acciones con los estados presentados antes de usar esos datos en la valoración.",
    cycle_coverage: "Incorporar suficientes años buenos, débiles y de transición para que el margen normalizado represente un ciclo completo.",
    discount_rate_support: "Actualizar tasa libre de riesgo, prima de mercado, beta y costo de deuda con fecha y fuente visibles.",
    valuation_cross_check: "Contrastar el resultado con un método independiente y explicar cualquier diferencia material.",
    range_reliability: "Reducir la dependencia del valor terminal o ampliar evidencia hasta que el rango pueda orientar una decisión.",
    tangible_book_support: "Completar el historial de patrimonio tangible y rentabilidad sobre ese capital antes de valorar una entidad financiera.",
    independent_price_confirmation: "El precio actual ya se muestra como contexto. Para publicar un valor por acción falta contrastarlo con otra fuente y conciliar el número de acciones.",
    valuation_inputs: "Completar ingresos, acciones, caja, deuda y flujo de caja con fuente y fecha antes de elegir un método.",
    share_dilution_support: "Completar el historial de acciones diluidas y revisar emisiones, recompras y convertibles que puedan cambiar el valor por acción.",
    stock_compensation_treatment: "Separar la compensación en acciones y comprobar cómo afecta caja y dilución antes de calcular el valor por acción.",
    equity_bridge_completeness: "Confirmar caja, deuda, participaciones de terceros y otros derechos para pasar de valor de la empresa a valor para el accionista sin asumir saldos en cero.",
    operating_cash_separation: "Separar la caja necesaria para operar de la caja excedente y retirar del flujo la renta de activos no operativos.",
    future_estimate_support: "Incorporar estimaciones con fecha, moneda y número de analistas, o usar un historial suficiente que justifique la trayectoria futura.",
    growth_reinvestment_support: "Estimar cuánto capital adicional requiere el crecimiento y comprobarlo con rotación de activos histórica.",
  };
  return details[gap] || "Añadir evidencia suficiente y volver a calcular antes de publicar una cifra.";
}

function blockedValuationGapItems(research) {
  const items = new Map();
  const addItem = (item) => {
    if (item?.key && !items.has(item.key)) items.set(item.key, item);
  };
  const addGap = (gap) => addItem({
    key: gap,
    label: capitalizeLabel(gap),
    detail: blockedGapDetail(gap),
  });

  const valuationChecks = valuationPendingChecks(research?.valuation);
  valuationChecks.forEach(addGap);

  const priceStatus = String(research?.valuation?.price_validation?.status || "").toLowerCase();
  const hasPriceGap = ["stale", "mismatch", "missing", "unavailable", "unknown"].includes(priceStatus);
  if (hasPriceGap) {
    addGap("current_price");
  }

  const coverage = research?.sources?.coverage || research?.audit?.coverage || {};
  const coverageGaps = [...new Set(safeList(coverage.missing_expected_metrics)
    .map((gap) => String(gap || "").toLowerCase())
    .filter((gap) => gap && !NON_ACTIONABLE_BLOCKED_OUTPUTS.has(gap)))];
  coverageGaps.forEach(addGap);

  if (items.size) {
    const representativeKeys = [
      valuationChecks[0],
      hasPriceGap ? "current_price" : null,
      coverageGaps[0],
    ].filter(Boolean);
    const prioritized = [];
    const included = new Set();
    [...representativeKeys, ...items.keys()].forEach((key) => {
      if (!included.has(key) && items.has(key)) {
        included.add(key);
        prioritized.push(items.get(key));
      }
    });
    return prioritized.slice(0, 4);
  }

  return [{
    key: "valuation_inputs",
    label: "Completar los insumos de valoración",
    detail: "Revisar precio, acciones, caja, deuda, método y supuestos; el sistema no recibió una brecha más específica.",
  }];
}

function BlockingGapSummary({ research }) {
  const pendingItems = blockedValuationGapItems(research);
  return (
    <details className={styles.researchGapDetails}>
      <summary>
        <span>Qué falta para una valoración completa</span>
        <small>{pendingItems.length} {pendingItems.length === 1 ? "control pendiente" : "controles pendientes"}</small>
      </summary>
      <p>Estos puntos impiden publicar un valor razonable. No impiden mostrar los datos que sí están respaldados.</p>
      <div className={styles.researchFindingList}>
        {pendingItems.map((item) => (
          <article className={styles.researchFinding} data-tone="warn" key={item.key}>
            <strong>{item.label}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </details>
  );
}

function screeningNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function screeningPercent(value) {
  return screeningNumber(value) === null ? "-" : formatPct(value);
}

function ScreeningAnalysis({ research }) {
  const screening = research?.valuation?.screening_analysis;
  if (!screening?.available) return null;
  const observed = screening.observed || {};
  const runway = screening.runway || {};
  const ratios = screening.ratios || {};
  const marketRead = screening.market_read || {};
  const currency = screening.currency || research?.valuation?.currency || research?.company_profile?.currency || "USD";
  const earlyStage = screening.kind === "early_stage";
  const sources = safeList(research?.valuation?.price_validation?.sources);
  const priceSource = sources.length ? sources.join(" + ") : "fuente de mercado verificada";
  const runwayYears = screeningNumber(runway.years);
  const runwayMonths = screeningNumber(runway.months);
  const observedRevenue = screeningNumber(observed.revenue);
  const evToRevenue = screeningNumber(ratios.ev_to_revenue);
  const runwayLabel = runwayMonths !== null
    ? runwayMonths < 24 || runwayYears === null
      ? `${Math.round(runwayMonths)} meses`
      : `${runwayYears.toFixed(1)} años`
    : "No calculable";
  const fundingNeed = screeningNumber(runway.funding_need_for_24_months);
  const metrics = earlyStage
    ? [
      { key: "price", label: "Precio observado", value: compactCurrency(observed.current_price, currency), detail: `${formatMarketDate(screening.market_data_as_of)} · ${priceSource}` },
      { key: "market-cap", label: "Capitalización", value: compactCurrency(observed.market_cap, currency), detail: "Informada por la fuente de mercado; no depende del promedio anual de acciones." },
      { key: "revenue", label: "Ingresos observados", value: observedRevenue === 0 ? "Sin ingresos informados" : compactCurrency(observed.revenue, currency), detail: `Estados al ${formatMarketDate(screening.financial_data_as_of)}.` },
      { key: "ev-sales", label: "Valor del negocio / ingresos", value: evToRevenue !== null ? `${evToRevenue.toFixed(1)}x` : observedRevenue === 0 ? "No aplica sin ingresos" : "No calculable", detail: "Mide cuánto paga el mercado por la escala actual; no estima el valor futuro." },
      { key: "net-cash", label: "Caja neta", value: compactCurrency(observed.net_cash, currency), detail: "Caja menos deuda informada." },
      { key: "operations", label: "Valor atribuido al negocio", value: compactCurrency(marketRead.operations_value, currency), detail: "Capitalización menos caja neta; no es valor razonable." },
      { key: "burn", label: "Consumo anual de caja", value: compactCurrency(runway.annual_burn, currency), detail: "Basado en el flujo libre de caja observado." },
      { key: "runway", label: "Autonomía estimada", value: runwayLabel, detail: "Caja disponible dividida por el consumo anual observado." },
      { key: "funding", label: "Financiación para cubrir 24 meses", value: fundingNeed === 0 ? "No necesaria con la caja actual" : compactCurrency(runway.funding_need_for_24_months, currency), detail: "Manteniendo el consumo observado." },
      { key: "dilution", label: "Dilución ilustrativa", value: screeningPercent(runway.illustrative_dilution_at_20pct_discount), detail: "Sólo si faltara financiación; emisión al 20% de descuento." },
    ]
    : [
      { key: "price", label: "Precio observado", value: compactCurrency(observed.current_price, currency), detail: `${formatMarketDate(screening.market_data_as_of)} · ${priceSource}` },
      { key: "market-cap", label: "Capitalización", value: compactCurrency(observed.market_cap, currency), detail: "Valor de mercado del patrimonio." },
      { key: "enterprise-value", label: "Valor empresa simple", value: compactCurrency(observed.enterprise_value, currency), detail: "Capitalización más deuda menos caja." },
      { key: "revenue", label: "Ingresos observados", value: compactCurrency(observed.revenue, currency), detail: `Estados al ${formatMarketDate(screening.financial_data_as_of)}.` },
      { key: "ev-sales", label: "Valor empresa / ingresos", value: screeningNumber(ratios.ev_to_revenue) !== null ? `${screeningNumber(ratios.ev_to_revenue).toFixed(1)}x` : "No calculable", detail: "Referencia de precio, no estimación de valor." },
      { key: "fcf-yield", label: "Flujo libre / capitalización", value: screeningPercent(ratios.fcf_yield), detail: "Flujo libre observado frente al valor de mercado." },
      { key: "net-cash", label: "Caja neta / capitalización", value: screeningPercent(ratios.net_cash_to_market_cap), detail: "Peso de la caja neta en el precio actual." },
    ];
  const visibleMetrics = metrics.filter((metric) => metric.value !== "-" && metric.value !== null && metric.value !== undefined);
  const pressureCopy = runway.pressure === "urgent"
    ? "La caja no cubre un año al ritmo de consumo observado. El riesgo de financiación es inmediato."
    : runway.pressure === "high"
      ? "La caja cubre menos de dos años al ritmo actual. Una nueva financiación puede afectar de forma material al accionista."
      : runwayMonths !== null
        ? `La caja cubriría aproximadamente ${Math.round(runwayMonths)} meses si el consumo se mantuviera sin cambios.`
        : "Aún no hay datos suficientes para calcular la autonomía financiera, pero sí para ubicar precio y tamaño de mercado.";

  return (
    <section className={styles.researchScreening} aria-labelledby="screening-analysis-title">
      <div className={styles.researchScreeningHeader}>
        <div>
          <span>Lectura disponible ahora</span>
          <h3 id="screening-analysis-title">{earlyStage ? "Caja, consumo y riesgo de financiación" : "Precio, balance y exigencia financiera"}</h3>
        </div>
        <small>No es un valor razonable</small>
      </div>
      <p className={styles.researchScreeningLead}>{earlyStage
        ? "Sin ingresos previsibles ni hitos con probabilidad respaldada, estimar un valor por acción sería engañoso. Sí podemos medir cuánto paga hoy el mercado, cuánto efectivo queda y cuánto tiempo puede operar la empresa antes de necesitar capital."
        : "Aunque todavía no corresponde publicar un valor razonable, estos datos permiten entender qué está pagando hoy el mercado y qué parte está respaldada por balance y caja."}</p>
      <div className={styles.researchScreeningGrid}>
        {visibleMetrics.map((metric) => (
          <article className={styles.researchScreeningMetric} key={metric.key}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>
      <div className={styles.researchScreeningDecision}>
        <span>Qué ayuda a decidir</span>
        <strong>{earlyStage ? pressureCopy : "Puedes decidir si el precio merece más trabajo antes de construir escenarios detallados."}</strong>
        {earlyStage && screeningNumber(marketRead.operations_value) !== null ? (
          <p>Después de descontar la caja neta, el mercado atribuye {compactCurrency(marketRead.operations_value, currency)} al negocio, sus activos, su desarrollo y sus probabilidades futuras.</p>
        ) : null}
      </div>
      <p className={styles.researchScreeningFootnote}>Los cálculos usan datos observados y fórmulas simples. No sustituyen hitos clínicos o comerciales, probabilidades de éxito ni un análisis completo de derechos preferentes.</p>
    </section>
  );
}

function renderBlockedValuationHelp(research, valuationPresentation, heading) {
  const hasScreening = research?.valuation?.screening_analysis?.available === true;
  return (
    <div className={styles.researchStack}>
      <ScreeningAnalysis research={research} />
      {!hasScreening ? (
        <div className={styles.researchAttentionCallout}>
          <span>{heading}</span>
          <strong>Mostramos sólo lo que los datos permiten sostener</strong>
          <p>{valuationPresentation?.reason || "La valoración todavía no supera los controles necesarios."}</p>
        </div>
      ) : null}
      <BlockingGapSummary research={research} />
      <MarketRequirements
        currency={research?.valuation?.currency || research?.company_profile?.currency}
        value={research?.valuation?.market_requirements}
      />
    </div>
  );
}

function renderValuation(research, valuationPresentation) {
  if (!research) {
    return <p className={styles.emptyCopy}>La valoración aparece después de analizar un ticker.</p>;
  }

  if (!valuationPresentation?.showValuationFigures) {
    if (research?.aurora?.version === "aurora_decision_system_v1") {
      return (
        <div className={styles.researchStack}>
          <AuroraDecisionSummary research={research} />
          <BlockingGapSummary research={research} />
          <MarketRequirements
            currency={research?.valuation?.currency || research?.company_profile?.currency}
            value={research?.valuation?.market_requirements}
          />
        </div>
      );
    }
    return renderBlockedValuationHelp(research, valuationPresentation, "Valoración en revisión");
  }

  const rangeRows = [
    { key: "low", label: "Rango bajo", value: valuationPresentation.range.low, tone: "bad" },
    ...(valuationPresentation.centralValue !== null
      ? [{ key: "central", label: "Estimación central", value: valuationPresentation.centralValue, tone: "warn" }]
      : []),
    { key: "high", label: "Rango alto", value: valuationPresentation.range.high, tone: "good" },
  ];
  const marketReading = marketRangeReading(valuationPresentation);
  const cycleSummary = research?.valuation?.cycle_normalization || {};
  const meanReversionYears = Number(cycleSummary.mean_reversion_years);

  return (
    <div className={styles.researchStack}>
      {valuationPresentation.state === "research_grade" ? (
        <div className={styles.researchAttentionCallout}>
          <span>Rango para investigación</span>
          <strong>Úsalo con cautela; todavía no es una cifra respaldada para decidir</strong>
          <p>{valuationPresentation.reason}</p>
        </div>
      ) : null}
      <div className={styles.researchScenarioGrid} data-count={rangeRows.length}>
        {rangeRows.map((row) => (
          <article className={styles.researchScenario} data-tone={row.tone} key={row.key}>
            <span>{row.label}</span>
            <strong>{compactCurrency(row.value, valuationPresentation.currency)}</strong>
            <small>{valuationPresentation.currency} por acción</small>
          </article>
        ))}
      </div>

      <div className={styles.researchDetailGrid}>
        <ResearchMetric
          detail={valuationPresentation.backed ? "Método principal después de contrastar referencias." : "Método principal sujeto a revisión adicional."}
          label="Método principal"
          tone={valuationPresentation.backed ? "good" : "warn"}
          value={valuationPresentation.primaryMethod}
        />
        <ResearchMetric
          detail="Índice de controles superados; no es una probabilidad de acierto."
          label="Solidez de la evidencia"
          tone={valuationPresentation.backed ? "good" : "warn"}
          value={evidenceStrength(valuationPresentation.confidence, research?.valuation?.reliability?.status)}
        />
        <ResearchMetric
          detail="Fecha de corte de los estados usados en la valoración."
          label="Estados financieros al"
          tone={research?.valuation?.financial_data_as_of ? "good" : "warn"}
          value={formatMarketDate(research?.valuation?.financial_data_as_of)}
        />
        <ResearchMetric
          detail={valuationPresentation.priceIsContextual
            ? `${formatMarketDate(valuationPresentation.marketDataAsOf)} · ${valuationPresentation.priceSource || "Precio del proveedor"}. Mismo proveedor; falta confirmación independiente.`
            : `${formatMarketDate(valuationPresentation.marketDataAsOf)} · ${valuationPresentation.priceSource || `Precio ${valuationPresentation.priceValidationStatus}.`}`}
          label="Precio observado"
          tone={valuationPresentation.currentPrice === null || valuationPresentation.priceIsContextual ? "warn" : "good"}
          value={valuationPresentation.currentPrice === null
            ? "Sin precio validado"
            : compactCurrency(valuationPresentation.currentPrice, valuationPresentation.currency)}
        />
        <ResearchMetric
          detail={marketReading.detail}
          label="Lectura frente al mercado"
          tone={marketReading.tone}
          value={marketReading.label}
        />
        {cycleSummary.structural_break === true && Number.isInteger(meanReversionYears) ? (
          <ResearchMetric
            detail="Ingresos y margen convergen gradualmente hacia referencias de ciclo; el TTM actual no se perpetúa sin cambios."
            label="Tratamiento del ciclo"
            tone="warn"
            value={`Reversión en ${meanReversionYears} años`}
          />
        ) : null}
      </div>
      <DriverSummary value={research?.valuation?.driver_summary} />
    </div>
  );
}

function renderEvidence(research) {
  const records = safeList(research?.sources?.records);
  const points = safeList(research?.sources?.data_points);
  const coverage = research?.sources?.coverage || research?.audit?.coverage || {};
  const missingMetrics = safeList(coverage.missing_expected_metrics);

  if (!research) {
    return <p className={styles.emptyCopy}>Cada número aparece aquí con su fuente, tipo de dato y estado de verificación.</p>;
  }

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchCoverageSummary}>
        <div>
          <span>Cobertura</span>
          <strong>{formatCoverageScore(coverage.score)}</strong>
          <small>
            {coverage.covered_expected_metrics ?? 0}/{coverage.expected_metrics ?? 0} métricas requeridas cubiertas
          </small>
        </div>
        <div>
          <span>Autoridad de estados</span>
          <strong>{humanizeProvider(coverage.statement_source_provider)}</strong>
          <small>{humanizeSourceAuthority(coverage.statement_authority)}</small>
        </div>
        <div>
          <span>Brechas</span>
          <strong>{missingMetrics.length}</strong>
          <small>{summarizeGaps(missingMetrics, 3)}</small>
        </div>
      </div>

      <small className={styles.researchScrollHint}>Desliza para ver todas las columnas →</small>
      <div aria-label="Fuentes consultadas" className={`${styles.researchTable} ${styles.researchSourceTable}`} role="table">
        <div className={styles.researchTableHeader} role="row">
          <span role="columnheader">Fuente</span>
          <span role="columnheader">Proveedor</span>
          <span role="columnheader">Estado y consulta</span>
          <span role="columnheader">Filas</span>
        </div>
        {records.map((source) => (
          <div className={styles.researchTableRow} key={source.source_id} role="row">
            <strong role="rowheader">{humanizeSourceType(source)}</strong>
            <span role="cell">{humanizeProvider(source.provider)}</span>
            <span className={styles.researchSourceStatus} role="cell">
              {humanizeSourceStatus(source.status)}
              <small>{source.retrieved_at ? `Consulta: ${formatDateTime(source.retrieved_at)}` : "Consulta pendiente"}</small>
            </span>
            <span role="cell">{source.row_count ?? "-"}</span>
          </div>
        ))}
      </div>

      <div aria-label="Valores y procedencia" className={`${styles.researchTable} ${styles.researchEvidenceValueTable}`} role="table">
        <div className={styles.researchTableHeader} role="row">
          <span role="columnheader">Métrica</span>
          <span role="columnheader">Valor</span>
          <span role="columnheader">Etiqueta</span>
          <span role="columnheader">Fuente</span>
        </div>
        {points.map((point) => (
          <div className={styles.researchTableRow} key={`${point.metric}-${point.claim_tag}`} role="row">
            <strong role="rowheader">{humanizeMetricPath(point.metric)}</strong>
            <span role="cell">{formatEvidenceValue(point)}</span>
            <span role="cell">{humanizeClaimTag(point.claim_tag)}</span>
            <span role="cell">{point.source_id
              ? humanizeSourceType({ source_id: point.source_id })
              : safeList(point.source_ids).length
                ? safeList(point.source_ids).map((sourceId) => humanizeSourceType({ source_id: sourceId })).join(" + ")
                : "Cálculo"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderAgents(research, valuationPresentation) {
  const agentPayload = research?.agents || research?.sources?.agent_outputs || {};
  const agents = safeList(agentPayload.agents);
  const finalOrchestrator = agentPayload.final_orchestrator || {};
  const finalAnalysis = finalAnalysisFrom(finalOrchestrator);
  const strongestPoints = analysisItems(finalAnalysis.strongest_points);
  const redTeam = analysisItems(finalAnalysis.red_team);
  const openQuestions = analysisItems(finalAnalysis.open_questions);
  const sourceRecords = safeList(research?.sources?.records);
  const sourceErrors = sourceRecords.filter((source) => source.status === "error");
  const coverage = research?.sources?.coverage || research?.audit?.coverage || {};
  const statementProvider = coverage.statement_source_provider || null;
  const auditStatus = research?.audit?.status || "pending";
  const valuationReady = Boolean(research?.valuation?.available);
  const finalCallText = finalOrchestrator.enabled
    ? `${finalOrchestrator.call_budget?.actual_calls || 0}/${finalOrchestrator.call_budget?.max_calls || 1} llamada al editor final`
    : "Editor final omitido";
  const processTone = auditStatus === "pass" ? "good" : auditStatus === "needs_attention" ? "warn" : "neutral";
  const finalTone =
    finalOrchestrator.status === "ok"
      ? "good"
      : finalOrchestrator.enabled
        ? "warn"
        : "neutral";

  if (!research) {
    return <p className={styles.emptyCopy}>La revisión aparece después del análisis, con cada verificación preservada para reproducibilidad.</p>;
  }

  if (!valuationPresentation?.backed && research?.aurora?.version === "aurora_decision_system_v1") {
    return <AuroraDebate research={research} />;
  }

  if (!valuationPresentation?.backed && valuationPresentation?.showValuationFigures) {
    return renderResearchGradeReview(research, valuationPresentation, "Revisión del rango");
  }

  if (!valuationPresentation?.backed) {
    return renderBlockedValuationHelp(research, valuationPresentation, "Revisión de los controles");
  }

  if (!agents.length) {
    return <p className={styles.emptyCopy}>No se emitió traza de revisión para este paquete.</p>;
  }

  const processSteps = [
    {
      key: "sources",
      label: "Fuentes recopiladas",
      detail: sourceErrors.length ? `${sourceErrors.length} problema${sourceErrors.length === 1 ? "" : "s"} de fuente` : `${sourceRecords.filter((source) => source.status === "ok").length} fuentes activas`,
      state: sourceErrors.length && !statementProvider ? "bad" : sourceErrors.length ? "warn" : "done",
    },
    {
      key: "statements",
      label: "Estados normalizados",
      detail: statementProvider ? `${statementProvider.toUpperCase()} como base` : "Esperando estados con respaldo de fuente",
      state: statementProvider ? "done" : "bad",
    },
    {
      key: "valuation",
      label: "Valoración calculada",
      detail: valuationReady ? "DCF, DCF inverso, múltiplos" : "Bloqueado por datos faltantes",
      state: valuationReady ? "done" : "bad",
    },
    {
      key: "challenge",
      label: "Tesis cuestionada",
      detail: `${agents.length} roles de revisión especializados`,
      state: "done",
    },
    {
      key: "audit",
      label: "Auditoría empaquetada",
      detail: `${formatCoverageScore(coverage.score)} cobertura`,
      state: auditStatus === "pass" ? "done" : "warn",
    },
    {
      key: "editor",
      label: "Editor final",
      detail: finalCallText,
      state: finalOrchestrator.status === "ok" ? "done" : finalOrchestrator.enabled ? "warn" : "idle",
    },
  ];

  const judgment = firstUsefulText(
    finalAnalysis.executive_judgment,
    finalAnalysis.memo_patch,
    auditStatus === "pass"
      ? "El reporte está listo. El motor determinístico generó estados con respaldo, valoración, auditoría y archivos descargables."
      : "El reporte es reproducible, pero la auditoría tiene pendientes que deben resolverse antes de confiar en el memo.",
  );

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchProcessHero} data-tone={processTone}>
        <div>
          <span>Revisión del análisis</span>
          <strong>{auditStatus === "pass" ? "El caso fue cuestionado contra el registro" : "La revisión encontró brechas de evidencia abiertas"}</strong>
          <p>Estos roles no inventan números. Leen el paquete auditado terminado, cuestionan el caso y señalan lo que aún necesita evidencia.</p>
        </div>
        <div>
          <span>{formatCoverageScore(coverage.score)}</span>
          <small>{agents.length} roles de revisión</small>
        </div>
      </div>

      <div className={styles.researchProcessRail}>
        {processSteps.map((step, index) => (
          <div className={styles.researchProcessStep} data-state={step.state} key={step.key}>
            <span>{index + 1}</span>
            <strong>{step.label}</strong>
            <small>{step.detail}</small>
          </div>
        ))}
      </div>

      <article className={styles.researchOrchestratorCard} data-tone={finalTone}>
        <div className={styles.researchAgentCardTop}>
          <div>
            <span>Síntesis final</span>
            <strong>{finalOrchestrator.status === "ok" ? "Llamada de síntesis completada" : "Solo escritorio determinístico"}</strong>
          </div>
          <small>{humanizeToken(finalOrchestrator.status || "determinístico")}</small>
        </div>
        {finalOrchestrator.status === "ok" ? (
          <>
            <p>{judgment}</p>
            <div className={styles.researchOrchestratorColumns}>
              <div>
                <span>Qué lo sustenta</span>
                {strongestPoints.slice(0, 3).map((item, index) => (
                  <p key={`strong-${index}`}>{item}</p>
                ))}
              </div>
              <div>
                <span>Qué podría fallar</span>
                {redTeam.slice(0, 3).map((item, index) => (
                  <p key={`red-team-${index}`}>{item}</p>
                ))}
              </div>
              <div>
                <span>Pendientes</span>
                {openQuestions.slice(0, 3).map((item, index) => (
                  <p key={`open-${index}`}>{item}</p>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p>
            {finalOrchestrator.enabled
              ? finalOrchestrator.error || "El orquestador final fue activado pero no devolvió una síntesis."
              : "No se añadió síntesis de editor final. El escritorio determinístico ejecutó a partir de los resultados auditados."}
          </p>
        )}
      </article>

      <details className={styles.researchTechnicalTrace}>
        <summary>Ver detalles de reproducibilidad</summary>
        <div className={styles.researchTraceGrid}>
          <div>
            <span>Capa de agentes</span>
            <strong>{agentPayload.version || "v1"}</strong>
            <small>{humanizeToken(agentPayload.mode)}</small>
          </div>
          <div>
            <span>Regla de cálculo</span>
            <strong>Solo Python</strong>
            <small>{agentPayload.execution?.specialist_llm_calls ?? 0} llamadas LLM especializadas</small>
          </div>
          <div>
            <span>Editor final</span>
            <strong>{finalOrchestrator.model || "Desactivado"}</strong>
            <small>{finalCallText}</small>
          </div>
        </div>
        <div className={styles.researchAgentList}>
          {agents.map((agent) => {
            const questions = safeList(agent.open_questions);
            return (
              <div className={styles.researchAgentRow} data-tone={statusTone(agent.status)} key={agent.id}>
                <span>{humanizeSourceStatus(agent.status)}</span>
                <div>
                  <strong>{agentDisplayName(agent)}</strong>
                  <p>{agent.summary}</p>
                  {questions.length ? <small>{questions.slice(0, 2).join(" / ")}</small> : null}
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}

function formatDeltaValue(value, unit) {
  if (value === null || value === undefined || value === "") return "-";
  if (!Number.isFinite(Number(value))) return "-";
  if (unit === "percent") return formatPct(value);
  if (unit === "currency") return compactCurrency(value);
  return Number(value).toFixed(2);
}

function isValuationDelta(change) {
  const key = String(change?.key || "").toLowerCase();
  const label = String(change?.label || "").toLowerCase();
  return TRUSTED_VALUATION_DELTA_KEYS.has(key)
    || /valuation|intrinsic|fair.?value|price.?target|base.?value|implied.?growth|upside|downside/.test(`${key} ${label}`);
}

function renderDelta(research, valuationPresentation) {
  const delta = research?.history?.delta || {};
  const comparableValuation = Boolean(
    valuationPresentation?.backed
    && delta.valuation?.comparable === true
    && delta.valuation?.current?.backed === true
    && delta.valuation?.previous?.backed === true,
  );
  const changes = safeList(delta.changes).filter((change) => {
    if (!isValuationDelta(change)) return true;
    return comparableValuation && TRUSTED_VALUATION_DELTA_KEYS.has(String(change?.key || "").toLowerCase());
  });

  if (!research) {
    return <p className={styles.emptyCopy}>Tras el segundo análisis de un ticker, esta pestaña mostrará los cambios respecto al reporte anterior.</p>;
  }

  if (!delta.available) {
    return <p className={styles.emptyCopy}>{delta.reason || "Aún no hay análisis previo almacenado."}</p>;
  }

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchDetailGrid}>
        <ResearchMetric
          detail={delta.previous_run_at ? `Análisis anterior ${formatDateTime(delta.previous_run_at)}` : "Marca de tiempo del análisis anterior no disponible."}
          label="Análisis guardados"
          tone="good"
          value={String(research.history?.run_count || 1)}
        />
        <ResearchMetric
          detail={delta.period_changed ? `${delta.previous_period} → ${delta.current_period}` : "El período fiscal más reciente no ha cambiado."}
          label="Período"
          tone={delta.period_changed ? "warn" : "neutral"}
          value={delta.current_period || "-"}
        />
        <ResearchMetric
          detail={delta.audit_changed ? `Era ${delta.previous_audit_status}` : "El estado de auditoría no ha cambiado."}
          label="Cambio en auditoría"
          tone={delta.audit_changed ? "warn" : "good"}
          value={delta.current_audit_status || "-"}
        />
      </div>

      <div className={styles.researchTable}>
        <div className={styles.researchTableHeader}>
          <span>Métrica</span>
          <span>Actual</span>
          <span>Anterior</span>
          <span>Cambio</span>
        </div>
        {changes.map((change) => (
          <div className={styles.researchTableRow} key={change.key}>
            <strong>{change.label}</strong>
            <span>{formatDeltaValue(change.current, change.unit)}</span>
            <span>{formatDeltaValue(change.previous, change.unit)}</span>
            <span>{formatDeltaValue(change.absolute_change, change.unit)}</span>
          </div>
        ))}
      </div>

      {changes.length ? null : <p className={styles.emptyCopy}>{delta.summary}</p>}
    </div>
  );
}

function renderAudit(research) {
  const findings = safeList(research?.audit?.findings);
  const flags = safeList(research?.financials?.quality_flags);
  const coverage = research?.audit?.coverage || research?.sources?.coverage || {};
  const sourceGaps = safeList(coverage.sourced_points_missing_ok_source);
  const formulaGaps = safeList(coverage.calculated_points_missing_formula);

  if (!research) {
    return <p className={styles.emptyCopy}>La auditoría señalará fuentes faltantes, errores de proveedor, datos de valoración débiles y problemas de calidad contable.</p>;
  }

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchAuditBar}>
        <div>
          <span>Puntaje de cobertura</span>
          <strong>{formatCoverageScore(coverage.score)}</strong>
        </div>
        <div>
          <span>Con respaldo de fuente</span>
          <strong>{coverage.source_backed_points ?? 0}</strong>
        </div>
        <div>
          <span>Brechas de fórmula</span>
          <strong>{formulaGaps.length}</strong>
        </div>
        <div>
          <span>Brechas de fuente</span>
          <strong>{sourceGaps.length}</strong>
        </div>
      </div>

      <div className={styles.researchFindingList}>
        {(findings.length ? findings : [{ severity: "info", message: "Sin hallazgos de auditoría." }]).map((finding, index) => (
          <article className={styles.researchFinding} data-tone={statusTone(finding.severity)} key={`${finding.code || "finding"}-${index}`}>
            <strong>{humanizeMetric(finding.code || finding.severity || "auditoría")}</strong>
            <p>{finding.message}</p>
          </article>
        ))}
      </div>

      <div className={styles.researchFindingList}>
        {(flags.length ? flags : [{ severity: "info", title: "No se activaron alertas de calidad contable." }]).map((flag, index) => (
          <article className={styles.researchFinding} data-tone={statusTone(flag.severity)} key={`${flag.title}-${index}`}>
            <strong>{humanizeQualityFlag(flag)}</strong>
            <p>{Number.isFinite(Number(flag.metric)) ? formatPct(flag.metric) : "Sin valor de métrica."}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function EquityResearchPanel({ dashboard, id = "aurora-research-desk", initialTicker = "", publicMode = false, workspaceId }) {
  const suggestions = useMemo(() => findSuggestedTickers(dashboard), [dashboard]);
  const [ticker, setTicker] = useState(cleanTicker(initialTicker) || suggestions[0] || "");
  const [mode, setMode] = useState("quick");
  const [activeTab, setActiveTab] = useState("Memo");
  const [research, setResearch] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [runProgress, setRunProgress] = useState(0);
  const [runSummary, setRunSummary] = useState("");

  async function runResearch(nextTicker = ticker) {
    const symbol = cleanTicker(nextTicker);
    if (!symbol || (!publicMode && !workspaceId)) return;
    if (publicMode) {
      setTicker(symbol);
      setPending(true);
      setError("");
      setRunSummary("");
      setRunProgress(10);
      setStatusMessage("Obteniendo datos y revisando la valoración...");
      const startedAt = performance.now();
      try {
        const payload = await fetchJsonWithTimeout(
          "/api/public/equity-research",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ ticker: symbol, mode }),
          },
          45_000,
        );
        if (!payload || payload.ok === false) {
          throw new Error(payload?.message || payload?.error || "No se pudo completar la valoración.");
        }
        setResearch(payload);
        setActiveTab("Valor");
        setRunProgress(100);
        setRunSummary(`Completado en ${Math.max(1, Math.round((performance.now() - startedAt) / 1000))}s. Esta sesión pública no se guarda.`);
      } catch (requestError) {
        setResearch(null);
        setError(String(requestError?.message || requestError || "No se pudo completar la valoración."));
        setRunProgress(100);
        setRunSummary("La lectura se detuvo antes de obtener datos suficientes.");
      } finally {
        setPending(false);
        setStatusMessage("");
      }
      return;
    }
    async function loadDirectResearch(summary = "Servicio async no disponible; se mostró el resultado directo.") {
      setStatusMessage("Usando modo directo...");
      let fallbackPayload;
      try {
        fallbackPayload = await fetchJsonWithTimeout(
          `/api/v1/workspaces/${workspaceId}/research/${encodeURIComponent(symbol)}?mode=${encodeURIComponent(mode)}`,
          { cache: "no-store" },
          15000,
        );
        if (fallbackPayload?.ok === false) {
          throw new Error(fallbackPayload.error || "No se pudo cargar el análisis.");
        }
      } catch (directError) {
        fallbackPayload = buildClientUnavailableResearch(symbol, mode, directError);
        summary = "La lectura directa no respondió; se mostró una ficha de estado.";
      }
      setResearch(fallbackPayload);
      setActiveTab("Memo");
      setRunProgress(100);
      setRunSummary(summary);
      setStatusMessage("");
    }
    setTicker(symbol);
    setPending(true);
    setError("");
    setRunSummary("");
    setRunProgress(6);
    setStatusMessage("Iniciando análisis...");
    const startedAt = performance.now();
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/research/${encodeURIComponent(symbol)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ mode }),
      });
      const startPayload = await parseResponse(response);
      if (startPayload.run_id && startPayload.error && (startPayload.status === "queued" || !startPayload.backend_run_id)) {
        const waitSeconds = Math.ceil(Number(startPayload.retry_after_ms || 0) / 1000);
        setRunSummary(
          isRateLimitMessage(startPayload.error)
            ? `El servicio está limitado. Reintento automático${waitSeconds ? ` en ${waitSeconds}s` : " en cola"}.`
            : "El servicio está en cola. Intentando enganchar el job async.",
        );
      }
      if (!startPayload.run_id) {
        if (startPayload.status === "failed" || startPayload.ok === false) {
          throw new Error(startPayload.error || "No se pudo iniciar el análisis.");
        }
        setResearch(startPayload);
        setActiveTab("Memo");
        setRunProgress(100);
        setRunSummary("Completado desde respuesta sincrónica del backend.");
        setStatusMessage("");
        return;
      }

      setRunProgress(18);
      let pollDelayMs = 3000;
      for (let attempt = 0; attempt < 36; attempt += 1) {
        setRunProgress(Math.min(92, 18 + (attempt + 1) * 3));
        setStatusMessage("Analizando...");
        await sleep(pollDelayMs);
        const pollResponse = await fetch(
          `/api/v1/workspaces/${workspaceId}/research/${encodeURIComponent(symbol)}?runId=${encodeURIComponent(startPayload.run_id)}`,
          { cache: "no-store" },
        );
        const pollPayload = await parseResponse(pollResponse);
        if (pollPayload.status === "running" || pollPayload.status === "queued") {
          const pollError = pollPayload.error || pollPayload.last_error;
          const retryAfterMs = Number(pollPayload.retry_after_ms || 0);
          if (retryAfterMs > 0 || isRateLimitMessage(pollError)) {
            const waitSeconds = Math.ceil(Math.max(retryAfterMs, pollDelayMs) / 1000);
            setRunSummary(`Servicio ocupado; próximo intento en ${waitSeconds}s.`);
            pollDelayMs = Math.min(15000, Math.max(5000, retryAfterMs || pollDelayMs + 1500));
            continue;
          }
          if (pollError && attempt >= 5) {
            await loadDirectResearch("El servicio async no respondió; se mostró el resultado directo.");
            return;
          }
          pollDelayMs = Math.min(8000, pollDelayMs + 500);
          continue;
        }
        if (pollPayload.status === "failed" || pollPayload.ok === false) {
          throw new Error(pollPayload.error || "No se pudo completar el análisis.");
        }
        setResearch(pollPayload);
        setActiveTab("Memo");
        setRunProgress(100);
        setRunSummary(`Completado en ${Math.max(1, Math.round((performance.now() - startedAt) / 1000))}s.`);
        setStatusMessage("");
        return;
      }
      throw new Error("El análisis sigue en proceso. Intenta de nuevo en un momento.");
    } catch (requestError) {
      setResearch(null);
      setError(String(requestError?.message || requestError || "El análisis no pudo completarse."));
      setRunProgress(100);
      setRunSummary("Análisis detenido antes de obtener un paquete verificado.");
    } finally {
      setPending(false);
      setStatusMessage("");
    }
  }

  const ratios = research?.financials?.ratios || {};
  const evidenceCount = safeList(research?.sources?.data_points).length;
  const auditFindings = safeList(research?.audit?.findings);
  const agentCount = safeList(research?.agents?.agents || research?.sources?.agent_outputs?.agents).length;
  const downloads = safeList(research?.downloads);
  const sourceRecords = safeList(research?.sources?.records);
  const annualRows = safeList(research?.financials?.annual);
  const deltaChanges = safeList(research?.history?.delta?.changes);
  const storedRunCount = Number(research?.history?.run_count || 0);
  const progressWidth = `${Math.max(0, Math.min(100, runProgress))}%`;
  const activeSource = sourceRecords.find((source) => source.status === "ok") || sourceRecords[0];
  const coverage = research?.sources?.coverage || research?.audit?.coverage || {};
  const hasStatementRows = annualRows.length > 0 && Number.isFinite(Number(ratios.latest_revenue));
  const statementProvider = hasStatementRows ? coverage.statement_source_provider || null : null;
  const sourceSpineLabel = hasStatementRows
    ? statementProvider
      ? humanizeProvider(statementProvider)
      : "Fuente de estados no confirmada"
    : activeSource?.provider
      ? humanizeProvider(activeSource.provider)
      : "Sin fuente todavía";
  const coverageWidth = `${Math.max(0, Math.min(100, Number(coverage.score) || 0))}%`;
  const missingRequiredMetrics = safeList(coverage.missing_expected_metrics);
  const actionableMissingMetrics = missingRequiredMetrics.filter((metric) => !NON_ACTIONABLE_BLOCKED_OUTPUTS.has(String(metric || "").toLowerCase()));
  const unresolvedValuationFields = unresolvedBridgeFields(research?.valuation);
  const blockingValuationChecks = valuationPendingChecks(research?.valuation);
  const primaryPendingFields = [...new Set([
    ...blockingValuationChecks,
    ...unresolvedValuationFields,
    ...actionableMissingMetrics,
  ])];
  const coverageDetail =
    coverage.expected_metrics
      ? `${coverage.covered_expected_metrics}/${coverage.expected_metrics} métricas requeridas`
      : `${evidenceCount} puntos de registro`;
  const finalOrchestrator = research?.agents?.final_orchestrator || research?.sources?.agent_outputs?.final_orchestrator || {};
  const finalAnalysis = finalAnalysisFrom(finalOrchestrator);
  const executiveJudgmentCandidate = firstUsefulText(finalAnalysis.executive_judgment, finalAnalysis.memo_patch);
  const valuationPresentation = useMemo(
    () => buildEquityValuationPresentation(research, { executiveJudgment: executiveJudgmentCandidate }),
    [executiveJudgmentCandidate, research],
  );
  const auroraValuation = research?.aurora?.valuation || null;
  const auroraContextualValuation = research?.aurora?.macroBridge?.status === "context_applied"
    ? research.aurora.macroBridge.contextual
    : auroraValuation;
  const auroraRange = auroraValuation?.status === "conditional_range"
    ? auroraContextualValuation?.range
    : null;
  const auroraRangeLabel = auroraRange
    ? `${compactCurrency(auroraRange.low, auroraValuation?.currency)} – ${compactCurrency(auroraRange.high, auroraValuation?.currency)}`
    : auroraValuation?.status === "market_implied_hurdle"
      ? "Hurdle implícito"
      : null;
  const displayMarketDataAsOf = valuationPresentation.marketDataAsOf
    || research?.valuation?.market_data_as_of
    || research?.valuation?.market_requirements?.market_data_as_of;
  const safeDownloads = valuationPresentation.backed ? downloads : downloads.filter((artifact) => (
    /_(sources|audit)\.json$|_assumptions\.yml$/i.test(String(artifact?.filename || ""))
  ));
  const hasXlsx = safeDownloads.some((artifact) => String(artifact.filename || "").endsWith(".xlsx"));
  const researchStateLabel = research
    ? auroraRangeLabel && !valuationPresentation.showValuationFigures
      ? auroraValuation?.status === "market_implied_hurdle"
        ? "Hurdle de mercado listo para investigar"
        : "Rango condicional con supuestos visibles"
      : valuationStateLabel(valuationPresentation)
    : "En espera";
  const openIssueLabel = primaryPendingFields.length
    ? summarizeGaps(primaryPendingFields, 3)
    : auditFindings[0]?.code
      ? humanizeMetric(auditFindings[0].code)
      : research && !valuationPresentation.showValuationFigures
        ? "Revisar datos y supuestos de valoración"
        : "Sin brechas requeridas";
  const onlyCentralWithheld = primaryPendingFields.length === 1
    && primaryPendingFields[0] === "valuation_range_central";
  const openIssueDetail = onlyCentralWithheld
    ? "La cifra central permanece retenida; usa el rango hasta completar la confirmación independiente."
    : primaryPendingFields.length
      ? "Estos datos aún necesitan respaldo antes de confirmar la estimación central."
    : auditFindings[0]?.message
      || (research && !valuationPresentation.showValuationFigures
        ? "La cobertura contable puede estar completa y aun así faltar evidencia para sostener los supuestos de valoración."
        : humanizeSourceAuthority(coverage.statement_authority) || "Las métricas requeridas están cubiertas.");

  function stageState(stage, index) {
    const next = AGENT_STAGES[index + 1];
    if (error) return runProgress >= stage.threshold ? "bad" : "idle";
    if (research && !pending) return "done";
    if (!pending) return index === 0 ? "ready" : "idle";
    if (runProgress >= stage.threshold && (!next || runProgress < next.threshold)) return "running";
    if (runProgress > stage.threshold) return "done";
    return "idle";
  }

  return (
    <section className={`${styles.panel} ${styles.researchPanel}`} id={id}>
      <div className={styles.researchCommandSurface}>
        <div className={styles.researchIdentity}>
          <p className={styles.kicker}>Investigación</p>
          <h2>{research?.ticker || ticker || "Ticker"}</h2>
          <p className={styles.supportText}>
            Analiza una compañía: estados financieros, valoración, revisión y auditoría.
          </p>
          <div className={styles.researchStatusLine}>
            <span data-tone={pending ? "warn" : research ? "good" : "neutral"}>{pending ? "Procesando" : research ? "Listo" : "Listo para analizar"}</span>
            <span>{mode === "full" ? "Análisis completo" : "Vista rápida"}</span>
            <span>{publicMode ? "Sesión pública · no se guarda" : storedRunCount ? `${storedRunCount} análisis guardado${storedRunCount === 1 ? "" : "s"}` : "Sin análisis previo"}</span>
          </div>
        </div>

        <div className={styles.researchRunBox}>
          <div className={styles.researchTickerRow}>
            <input
              aria-label="Ticker"
              className={styles.textInput}
              onChange={(event) => setTicker(cleanTicker(event.target.value))}
              placeholder="ASML"
              value={ticker}
            />
            <button className={styles.primaryButton} disabled={pending || !ticker} onClick={() => runResearch()} type="button">
              {pending ? "Procesando..." : "Analizar"}
            </button>
          </div>
          {!publicMode ? (
            <div className={styles.segmentedControl}>
              <button
                className={styles.segmentButton}
                data-active={mode === "quick"}
                key="quick"
                onClick={() => setMode("quick")}
                type="button"
                title="Vista rápida: memo y valoración"
              >
                Rápido
              </button>
              <button
                className={styles.segmentButton}
                data-active={mode === "full"}
                key="full"
                onClick={() => setMode("full")}
                type="button"
                title="Análisis completo con auditoría"
              >
                Completo
              </button>
            </div>
          ) : (
            <p className={styles.publicModeBadge}>Vista pública · análisis rápido</p>
          )}
        </div>
      </div>

      <div className={styles.researchStageRail} aria-label="Proceso de análisis">
        {AGENT_STAGES.map((stage, index) => (
          <ResearchStage key={stage.key} stage={stage} state={stageState(stage, index)} />
        ))}
      </div>

      {(pending || research || error || runSummary) ? (
        <div className={styles.researchProgressShell} role="status" aria-live="polite" aria-atomic="true">
          <div className={styles.researchProgressTrack} aria-hidden="true">
            <span style={{ width: progressWidth }} />
          </div>
          <p>{statusMessage || runSummary || (research ? `Generado ${formatDateTime(research.generated_at)}` : "Esperando análisis.")}</p>
        </div>
      ) : null}

      {suggestions.length ? (
        <div className={styles.researchSuggestions}>
          {suggestions.map((symbol) => (
            <button className={styles.rangeButton} disabled={pending} key={symbol} onClick={() => runResearch(symbol)} type="button">
              {symbol}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className={styles.errorText} role="alert">{error}</p> : null}

      <div className={styles.researchMetricGrid}>
        <ResearchMetric
          detail={research ? humanizeIndustry(research?.company_profile?.industry) : "Escribe un ticker para cargar el perfil de la empresa."}
          label="Empresa"
          tone={research ? "good" : "neutral"}
          value={research?.company_profile?.name || "Sin análisis"}
        />
        <ResearchMetric
          detail="Última fila del estado financiero anual."
          label="Ingresos recientes"
          value={compactCurrency(ratios.latest_revenue, research?.company_profile?.currency)}
        />
        <ResearchMetric
          detail={auroraRangeLabel && !valuationPresentation.showValuationFigures
            ? `${auroraMethodLabel(auroraValuation?.method)} · supuestos visibles · no decision-ready`
            : valuationPresentation.backed
              ? `Estimación central ${compactCurrency(valuationPresentation.centralValue, valuationPresentation.currency)} · ${valuationPresentation.primaryMethod}`
              : valuationPresentation.showValuationFigures
                ? `Método ${valuationPresentation.primaryMethod} · estimación central retenida hasta cerrar los controles`
                : valuationPresentation.reason}
          label="Rango estimado"
          tone={valuationPresentation.backed ? "good" : auroraRangeLabel || valuationPresentation.showValuationFigures ? "warn" : "neutral"}
          value={auroraRangeLabel || formatValuationRange(valuationPresentation)}
        />
        <ResearchMetric
          detail={research
            ? `${valuationStateLabel(valuationPresentation)} · índice de controles, no probabilidad de acierto.`
            : "La solidez aparece después del análisis."}
          label="Solidez de la evidencia"
          tone={valuationPresentation.backed ? "good" : valuationPresentation.showValuationFigures ? "warn" : "neutral"}
          value={valuationPresentation.showValuationFigures
            ? evidenceStrength(valuationPresentation.confidence, research?.valuation?.reliability?.status)
            : "En revisión"}
        />
      </div>

      {research ? <AuroraConditionalRangePreview range={auroraRange} valuation={auroraValuation} /> : null}

      {research ? (
        <div className={styles.researchCoverageRail} data-tone={coverageTone(coverage)}>
          <div>
            <span>Cobertura de evidencia</span>
            <strong>{formatCoverageScore(coverage.score)}</strong>
          </div>
          <div className={styles.researchCoverageTrack} aria-hidden="true">
            <span style={{ width: coverageWidth }} />
          </div>
          <p>{actionableMissingMetrics.length
            ? `Brechas abiertas: ${summarizeGaps(actionableMissingMetrics, 4)}`
            : missingRequiredMetrics.length
              ? "Los datos base están cubiertos; las cifras derivadas permanecen retenidas por los controles de valoración."
              : humanizeSourceAuthority(coverage.statement_authority) || "La cobertura del registro es completa para las métricas requeridas."}</p>
        </div>
      ) : null}

      {research ? (
        <div className={styles.researchCoverageSummary} role="status" aria-live="polite" aria-atomic="true">
          <div>
            <span>Estado actual</span>
            <strong>{researchStateLabel}</strong>
            <small>{valuationPresentation.showExecutiveJudgment
              ? valuationPresentation.executiveJudgment
              : valuationPresentation.reason}</small>
          </div>
          <div>
            <span>{valuationPresentation.backed
              ? "Rango respaldado"
              : auroraRange
                ? "Rango condicional"
              : valuationPresentation.showValuationFigures
                ? "Rango orientativo"
                : "Valoración no publicada"}</span>
            <strong>{auroraRangeLabel || (valuationPresentation.showValuationFigures ? formatValuationRange(valuationPresentation) : "—")}</strong>
            <small>{valuationPresentation.backed
              ? `Estimación central ${compactCurrency(valuationPresentation.centralValue, valuationPresentation.currency)} · ${valuationPresentation.primaryMethod}`
              : auroraRange
                ? `${auroraMethodLabel(auroraValuation?.method)} · supuestos visibles · el centro sigue condicionado`
              : valuationPresentation.showValuationFigures
                ? `Método ${valuationPresentation.primaryMethod} · estimación central retenida`
                : "No se muestra una cifra hasta superar los controles."}</small>
          </div>
          <div>
            <span>Pendientes</span>
            <strong>{openIssueLabel}</strong>
            <small>{openIssueDetail}</small>
          </div>
        </div>
      ) : null}

      <div className={styles.researchSignalGrid}>
        <div>
          <span>Cobertura</span>
          <strong>{research ? formatCoverageScore(coverage.score) : "Esperando"}</strong>
        </div>
        <div>
          <span>Fuente de estados</span>
          <strong>{sourceSpineLabel}</strong>
        </div>
        <div data-missing={research ? !isKnownMarketDate(research?.valuation?.financial_data_as_of) : undefined}>
          <span>Estados financieros al</span>
          <strong>{research ? formatMarketDate(research?.valuation?.financial_data_as_of) : "Esperando"}</strong>
        </div>
        <div data-missing={research ? !isKnownMarketDate(displayMarketDataAsOf) : undefined}>
          <span>Precio de mercado al</span>
          <strong>{research ? formatMarketDate(displayMarketDataAsOf) : "Esperando"}</strong>
        </div>
      </div>

      {safeDownloads.length ? (
        <div className={styles.researchDownloadBar} aria-label="Descargas del análisis">
          {safeDownloads.map((artifact) => (
            <button
              className={styles.secondaryButton}
              key={artifact.filename}
              onClick={() => downloadArtifact(artifact)}
              type="button"
            >
              {artifactLabel(artifact.filename)}
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.researchTabs} role="tablist" aria-label="Pestañas de resultados">
        {RESEARCH_TABS.map((tab) => (
          <button
            className={styles.rangeButton}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`equity-research-tabpanel-${tab.toLowerCase()}`}
            id={`equity-research-tab-${tab.toLowerCase()}`}
            data-active={activeTab === tab}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            <span>{tab}</span>
            {tab === "Revisión" && agentCount ? <small>{agentCount}</small> : null}
            {tab === "Fuentes" && evidenceCount ? <small>{evidenceCount}</small> : null}
            {tab === "Auditoría" && auditFindings.length ? <small>{auditFindings.length}</small> : null}
            {tab === "Cambios" && deltaChanges.length ? <small>{deltaChanges.length}</small> : null}
          </button>
        ))}
      </div>

      <div className={styles.researchOutputShell}>
        <aside className={styles.researchEvidenceSpine}>
          <span>Resumen del análisis</span>
          <strong>{research?.ticker || cleanTicker(ticker) || "Sin ticker"}</strong>
          <p>{research ? `${coverageDetail}; ${evidenceCount} entradas de registro para reproducibilidad.` : "Analiza un ticker para ensamblar un paquete de investigación reproducible."}</p>
          <dl>
            <div>
              <dt>Estados</dt>
              <dd>{statementProvider ? statementProvider.toUpperCase() : "-"}</dd>
            </div>
            <div>
              <dt>Archivos SEC</dt>
              <dd>{coverage.sec_metadata_available ? "Metadatos SEC" : "-"}</dd>
            </div>
            <div>
              <dt>Archivos</dt>
              <dd>{hasXlsx ? "modelo + registros" : safeDownloads.length ? "registros" : "-"}</dd>
            </div>
          </dl>
        </aside>
        <div
          className={styles.researchOutput}
          role="tabpanel"
          aria-labelledby={`equity-research-tab-${activeTab.toLowerCase()}`}
          id={`equity-research-tabpanel-${activeTab.toLowerCase()}`}
        >
          {activeTab === "Memo" ? renderMemo(research, valuationPresentation) : null}
          {activeTab === "Valor" ? renderValuation(research, valuationPresentation) : null}
          {activeTab === "Revisión" ? renderAgents(research, valuationPresentation) : null}
          {activeTab === "Cambios" ? renderDelta(research, valuationPresentation) : null}
          {activeTab === "Fuentes" ? renderEvidence(research) : null}
          {activeTab === "Auditoría" ? renderAudit(research) : null}
        </div>
      </div>
    </section>
  );
}
