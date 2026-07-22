import {
  fetchBackendEquityResearch,
  fetchBackendEquityResearchJob,
  startBackendEquityResearchJob,
} from "./backend.js";
import {
  appendEquityResearchRun,
  countEquityResearchRuns,
  getLatestEquityResearchRun,
} from "./data/equity-research-runs.js";
import {
  createEquityResearchJob,
  getEquityResearchJob,
  getEquityResearchJobByBackendRunId,
  updateEquityResearchJob,
} from "./data/equity-research-jobs.js";
import {
  buildEquityValuationPresentation,
  INSTITUTIONAL_MODEL_VERSION,
} from "../equity-valuation-presentation.js";
import { attachAuroraDecisionSystem } from "./aurora-decision-system.js";

const researchRuntimeState = globalThis.__BLS_EQUITY_RESEARCH_RUNTIME__ || { finalOrchestratorRetryAt: 0 };
globalThis.__BLS_EQUITY_RESEARCH_RUNTIME__ = researchRuntimeState;

function cleanTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 16);
}

function buildUnavailableBundle(ticker, mode, error) {
  const generatedAt = new Date().toISOString();
  const message = String(error?.message || error || "The equity research backend is unavailable.");
  const report = [
    `# ${ticker} research OS memo`,
    "",
    "## Status",
    "The deterministic research backend did not return source-backed data for this ticker.",
    "",
    "## What is missing",
    message,
    "",
    "No financial statement values, valuation outputs, or thesis claims were generated.",
    "",
  ].join("\n");
  const sources = {
    records: [
      {
        source_id: "railway:equity-research",
        provider: "railway-backend",
        endpoint_or_filing: "/api/equity-research",
        retrieved_at: generatedAt,
        status: "error",
        error: message,
      },
    ],
    data_points: [],
  };
  const audit = {
    generated_at: generatedAt,
    status: "needs_attention",
    findings: [
      {
        severity: "high",
        code: "backend_unavailable",
        message,
      },
    ],
  };
  const assumptionsYml = "assumptions: {}\n";
  const bundle = {
    ok: true,
    ticker,
    mode,
    generated_at: generatedAt,
    company_profile: {
      name: ticker,
      sector: null,
      industry: null,
      country: null,
      currency: null,
      exchange: null,
      beta: null,
      market_cap: null,
      description: null,
    },
    financials: {
      annual: [],
      ratios: {},
      quality_flags: [],
    },
    valuation: {
      available: false,
      reason: message,
      scenarios: [],
      reverse_dcf: {
        available: false,
        reason: message,
      },
      multiples: {},
    },
    checklist_score: {
      quality: 0,
      accounting_risk: 0,
      valuation: 0,
      evidence: 0,
    },
    report_markdown: report,
    sources,
    audit,
    assumptions: {},
    assumptions_yml: assumptionsYml,
    artifacts: {
      report_md: true,
      model_xlsx: false,
      sources_json: true,
      audit_json: true,
      assumptions_yml: true,
      note: "No XLSX export is emitted until the deterministic backend has source-backed statement data.",
    },
    downloads: [],
  };
  bundle.downloads = [
    textDownload(`${ticker || "ticker"}_report.md`, "text/markdown", report),
    textDownload(`${ticker || "ticker"}_sources.json`, "application/json", JSON.stringify(sources, null, 2)),
    textDownload(`${ticker || "ticker"}_audit.json`, "application/json", JSON.stringify(audit, null, 2)),
    textDownload(`${ticker || "ticker"}_assumptions.yml`, "application/yaml", assumptionsYml),
  ];
  return bundle;
}

function textDownload(filename, mediaType, text) {
  return {
    filename,
    media_type: mediaType,
    encoding: "base64",
    content_base64: Buffer.from(String(text || ""), "utf8").toString("base64"),
  };
}

function sanitizeReportMarkdown(markdown, ticker) {
  return String(markdown || "")
    .replace(/^#\s+(.+?)\s+research OS memo\s*$/gim, "# $1")
    .split(/\r?\n/)
    .filter((line) => !/one-call final editor|returned error|too many requests|client error|api\.openai|sources\.json|provider endpoints|row counts|coverage gaps/i.test(line))
    .join("\n")
    .replace(/^(?:-\s*)?Company:\s*/gim, "Compañía: ")
    .replace(/\bFinancial quality review\s*\(ready\):/gi, "Revisión financiera:")
    .replace(/\bLatest FCF margin\b/gi, "Margen FCF reciente")
    .replace(/\bROIC is\b/gi, "ROIC")
    .replace(/\bis\s+([0-9.,]+%)/gi, "es $1")
    .replace(/,\s*and\s+(\d+)\s+/gi, " y $1 ")
    .replace(/\baccounting flags were triggered\b/gi, "alertas contables activas")
    .replace(/^#\s*$/m, `# ${ticker || "Research"}`)
    .trimEnd();
}

function readPath(object, path) {
  return path.split(".").reduce((current, key) => current?.[key], object);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

const PUBLIC_UNSAFE_TEXT_PATTERN = /(?:https?:\/\/|www\.|\/api\/|authorization\s*:|\bbearer\b|api[_\s-]?key|\bsecret\b|access[_\s-]?token|password|credential|traceback|stack\s+trace|internal[_\s-]?prompt)/i;

function safePublicText(value, { maxLength = 120 } = {}) {
  const text = cleanText(value);
  if (!text || text.length > maxLength) return null;
  if (PUBLIC_UNSAFE_TEXT_PATTERN.test(text) || /[\u0000-\u001F\u007F{}<>]/.test(text)) return null;
  return text;
}

function safeInternalValuationReason(value, fallback) {
  const reason = cleanText(value);
  if (!reason || reason.length > 280) return fallback;
  if (/\d|[$€£¥]/.test(reason) || PUBLIC_UNSAFE_TEXT_PATTERN.test(reason)) return fallback;
  if (/\b(?:fair\s*value|midpoint|target\s*price|price\s*objective|valor\s+(?:central|base|objetivo))\b/i.test(reason)) {
    return fallback;
  }
  return reason;
}

function cleanTextList(value, limit = 8) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean).slice(0, limit) : [];
}

function validCurrency(value) {
  const currency = cleanText(value).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function validDate(value) {
  const date = cleanText(value);
  return date && Number.isFinite(Date.parse(date)) ? date : null;
}

const CANONICAL_VALUATION_STATUSES = new Set([
  "decision_ready",
  "research_grade",
  "not_decision_ready",
]);
const CANONICAL_ARCHETYPES = new Set([
  "financial",
  "specialized_financial",
  "specialized_security",
  "specialized_real_assets",
  "capacity_cycle",
  "early_stage",
  "asset_light_growth",
  "asset_heavy",
  "general",
  "unknown",
]);
const CANONICAL_PRIMARY_METHODS = new Set([
  "forward_fcff_dcf",
  "forward_fcfe_dcf",
  "through_cycle_fcff_dcf",
  "residual_income",
]);
const PUBLIC_PRIMARY_METHOD_LABELS = new Map([
  ["forward_fcff_dcf", "Flujo de caja libre de la empresa"],
  ["forward_fcfe_dcf", "Flujo de caja para el accionista"],
  ["through_cycle_fcff_dcf", "Flujo de caja normalizado a través del ciclo"],
  ["residual_income", "Ingresos residuales"],
]);
const CANONICAL_CASH_FLOW_BASES = new Map([
  ["operating_fcff_after_sbc", "operating_FCFF_after_SBC"],
  ["through_cycle_operating_fcff_after_sbc", "through_cycle_operating_FCFF_after_SBC"],
  ["fcfe", "FCFE"],
  ["residual_income", "residual_income"],
]);

function canonicalValuationStatus(value, fallback = "not_decision_ready") {
  const status = cleanText(value).toLowerCase();
  return CANONICAL_VALUATION_STATUSES.has(status) ? status : fallback;
}

function canonicalArchetype(value) {
  const archetype = cleanText(value).toLowerCase();
  return CANONICAL_ARCHETYPES.has(archetype) ? archetype : null;
}

function canonicalPrimaryMethod(value) {
  const method = cleanText(value).toLowerCase();
  return CANONICAL_PRIMARY_METHODS.has(method) ? method : null;
}

function publicPrimaryMethodLabel(value) {
  return PUBLIC_PRIMARY_METHOD_LABELS.get(canonicalPrimaryMethod(value)) || "no disponible";
}

function canonicalCashFlowBasis(value) {
  return CANONICAL_CASH_FLOW_BASES.get(cleanText(value).toLowerCase()) || null;
}

function sanitizedReliability(value) {
  if (!value || typeof value !== "object") {
    return {
      usable: false,
      status: "blocked",
      score: null,
      reasons: [],
      limitations: [],
    };
  }
  const rawScore = numberOrNull(value.score);
  return {
    usable: value.usable === true,
    status: cleanText(value.status).toLowerCase() || "blocked",
    score: rawScore !== null && rawScore >= 0 && rawScore <= 1 ? rawScore : null,
    reasons: cleanTextList(value.reasons),
    limitations: cleanTextList(value.limitations),
  };
}

function sanitizedPriceValidation(value) {
  const validation = value && typeof value === "object" ? value : {};
  const status = cleanText(validation.status).toLowerCase() || "unknown";
  const researchUsable = status === "provider_reconciled"
    && validation.research_usable === true;
  const contextUsable = researchUsable || (
    status === "inconsistent"
    && validation.usable_for_context === true
  );
  return {
    status,
    usable: validation.usable === true,
    research_usable: researchUsable,
    usable_for_context: contextUsable,
    sources: cleanTextList(validation.sources || (validation.source ? [validation.source] : [])),
  };
}

export function buildDownstreamValuationContext(bundle, { expectedTicker = null } = {}) {
  const valuation = bundle?.valuation && typeof bundle.valuation === "object" ? bundle.valuation : {};
  const canonical = valuation.model_version === INSTITUTIONAL_MODEL_VERSION;
  const presentation = buildEquityValuationPresentation(bundle);
  const rawStatus = cleanText(valuation.status).toLowerCase();
  const status = canonical && ["decision_ready", "research_grade", "not_decision_ready"].includes(rawStatus)
    ? rawStatus
    : "not_decision_ready";
  const reliability = canonical ? sanitizedReliability(valuation.reliability) : sanitizedReliability(null);
  const priceValidation = canonical ? sanitizedPriceValidation(valuation.price_validation) : sanitizedPriceValidation(null);
  const validatedPrice = numberOrNull(presentation.currentPrice);
  const identityTicker = cleanTicker(expectedTicker) || cleanTicker(bundle?.ticker);
  const validatedPriceContext = canonical
    ? publicMarketPriceContext(valuation, {
      sourceRecords: bundle?.sources?.records,
      expectedTicker: identityTicker,
    })
    : null;
  const decisionReadyEvidenceBacked = canonical
    ? publicDecisionReadyEvidenceIsBacked(bundle, {
      priceContext: validatedPriceContext,
      presentation,
      expectedTicker: identityTicker,
    })
    : false;
  const backed = canonical
    && presentation.backed === true
    && rawStatus === "decision_ready"
    && reliability.usable === true
    && reliability.status === "high"
    && priceValidation.status === "validated"
    && priceValidation.usable === true
    && validatedPrice !== null
    && validatedPrice > 0
    && validatedPriceContext?.price_context === "validated"
    && decisionReadyEvidenceBacked
    && Math.abs(validatedPriceContext.reference_price - validatedPrice) <= Math.max(1e-9, validatedPrice * 1e-8);
  const primaryMethod = canonical ? canonicalPrimaryMethod(valuation.primary_method) : null;
  const marketDataAsOf = canonical ? validDate(valuation.market_data_as_of) : null;
  const currency = canonical ? validCurrency(valuation.currency || bundle?.company_profile?.currency) : null;

  return {
    model_version: canonical ? INSTITUTIONAL_MODEL_VERSION : null,
    status,
    backed,
    figures_withheld: !backed,
    range: backed ? presentation.range : null,
    current_price: backed ? validatedPrice : null,
    primary_method: primaryMethod,
    reliability,
    market_data_as_of: marketDataAsOf,
    currency,
    price_validation: priceValidation,
    reverse_dcf: backed && valuation.reverse_dcf && typeof valuation.reverse_dcf === "object"
      ? valuation.reverse_dcf
      : null,
    multiples: backed && valuation.multiples && typeof valuation.multiples === "object"
      ? valuation.multiples
      : null,
    reason: presentation.reason,
  };
}

const SENSITIVE_VALUATION_METRIC = /(valuation|fairvalue|intrinsic|targetprice|priceobjective|basevalue|central|equityvalue|enterprisevalue|terminalvalue|impliedrevenue|reversedcf|midpoint)/;

function normalizedMetric(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function hasFatalAuditFinding(audit) {
  const expectedCodes = new Set(["valuation_not_decision_ready", "valuation_research_grade"]);
  return (Array.isArray(audit?.findings) ? audit.findings : []).some((finding) => {
    const severity = cleanText(finding?.severity).toLowerCase();
    const code = cleanText(finding?.code).toLowerCase();
    return ["high", "critical", "fatal"].includes(severity) && !expectedCodes.has(code);
  });
}

function safeResearchRange(value, visible) {
  const low = numberOrNull(value?.low);
  const high = numberOrNull(value?.high);
  if (!visible || low === null || high === null || low <= 0 || high < low || high / low > 5) {
    return { low: null, central: null, high: null };
  }
  return { low, central: null, high };
}

const SAFE_BRIDGE_FIELD_NAMES = new Set([
  "preferred_stock",
  "minority_interest",
  "unfunded_pension_liability",
  "lease_liabilities_not_in_debt",
  "non_operating_investments",
]);

function sanitizeEquityBridgeSummary(value) {
  if (!value || typeof value !== "object") return null;
  const candidates = [
    ...(Array.isArray(value.unresolved_fields) ? value.unresolved_fields : []),
    ...(Array.isArray(value.missing_optional_fields) ? value.missing_optional_fields : []),
    ...(Array.isArray(value.unresolved_claims)
      ? value.unresolved_claims.map((claim) => claim?.field || claim?.key || claim?.name)
      : []),
  ];
  const unresolvedFields = [...new Set(candidates
    .map((field) => cleanText(field).toLowerCase())
    .filter((field) => SAFE_BRIDGE_FIELD_NAMES.has(field)))];
  return {
    complete: value.complete === true,
    exact: value.exact === true,
    calculation_complete: value.calculation_complete === true,
    unresolved_fields: unresolvedFields,
  };
}

function sanitizeCycleNormalizationSummary(value, revenueValue) {
  if (!value || typeof value !== "object") return null;
  const revenue = revenueValue && typeof revenueValue === "object" ? revenueValue : {};
  const years = numberOrNull(value.years);
  const meanReversionYears = numberOrNull(revenue?.structural_break_mean_reversion?.horizon_years);
  return {
    available: value.available === true,
    years: years !== null && years >= 0 && years <= 100 ? years : null,
    coverage_complete: value.coverage_complete === true,
    current_regime_supported: value.current_regime_supported === true,
    structural_break: revenue.structural_break === true || value?.structural_break_blend?.applied === true,
    mean_reversion_years: Number.isInteger(meanReversionYears) && meanReversionYears >= 1 && meanReversionYears <= 10
      ? meanReversionYears
      : null,
  };
}

function boundedFiniteNumber(value, minimum, maximum) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function safeMeanReversionYears(valuation) {
  const candidates = [
    valuation?.cycle_revenue_normalization?.structural_break_mean_reversion?.horizon_years,
    valuation?.cycle_normalization?.structural_break_mean_reversion?.horizon_years,
  ];
  for (const candidate of candidates) {
    const years = numberOrNull(candidate);
    if (Number.isInteger(years) && years >= 1 && years <= 10) return years;
  }
  return null;
}

const PUBLIC_DRIVER_SCENARIOS = Object.freeze({
  bear: "escenario adverso",
  base: "escenario base",
  bull: "escenario favorable",
});

function publicDriverItems(scenario, scenarioKey, currency, meanReversionYears) {
  if (!scenario || typeof scenario !== "object") return [];
  const assumptions = scenario.assumptions && typeof scenario.assumptions === "object"
    ? scenario.assumptions
    : {};
  const forecast = (Array.isArray(scenario.forecast) ? scenario.forecast : [])
    .slice(0, 20)
    .map((row) => ({
      year: numberOrNull(row?.year),
      revenue: numberOrNull(row?.revenue),
      revenueGrowth: numberOrNull(row?.revenue_growth),
      cashFlow: numberOrNull(row?.cash_flow),
    }))
    .filter((row) => Number.isInteger(row.year) && row.year >= 1 && row.year <= 20)
    .sort((left, right) => left.year - right.year);
  const firstForecast = forecast[0] || null;
  const normalizedForecast = (
    meanReversionYears === null
      ? null
      : forecast.find((row) => row.year === meanReversionYears)
  ) || forecast.at(-1) || null;
  const revenueGrowth = boundedFiniteNumber(firstForecast?.revenueGrowth, -1, 5);
  const normalizedRevenue = boundedFiniteNumber(normalizedForecast?.revenue, 0, 1e18);
  const normalizedCashFlow = boundedFiniteNumber(normalizedForecast?.cashFlow, -1e18, 1e18);
  const normalizedFcfMargin = normalizedRevenue !== null && normalizedRevenue > 0 && normalizedCashFlow !== null
    ? boundedFiniteNumber(normalizedCashFlow / normalizedRevenue, -2, 2)
    : null;
  const discountRate = boundedFiniteNumber(
    assumptions.discount_rate ?? assumptions.wacc ?? assumptions.cost_of_equity,
    0.02,
    0.50,
  );
  const terminalGrowth = boundedFiniteNumber(assumptions.terminal_growth, -0.10, 0.20);
  const safeTerminalGrowth = terminalGrowth !== null && discountRate !== null && terminalGrowth < discountRate
    ? terminalGrowth
    : null;
  const scenarioLabel = PUBLIC_DRIVER_SCENARIOS[scenarioKey];
  const entries = [
    {
      key: `${scenarioKey}_revenue_growth`,
      label: `Crecimiento de ingresos · ${scenarioLabel}`,
      value: revenueGrowth,
      unit: "ratio",
    },
    {
      key: `${scenarioKey}_revenue`,
      label: `Ingresos normalizados · ${scenarioLabel}`,
      value: normalizedRevenue,
      unit: currency,
    },
    {
      key: `${scenarioKey}_fcf_margin`,
      label: `Margen FCF normalizado · ${scenarioLabel}`,
      value: normalizedFcfMargin,
      unit: "ratio",
    },
    {
      key: `${scenarioKey}_discount_rate`,
      label: `Tasa de descuento · ${scenarioLabel}`,
      value: discountRate,
      unit: "ratio",
    },
    {
      key: `${scenarioKey}_terminal_growth`,
      label: `Crecimiento terminal · ${scenarioLabel}`,
      value: safeTerminalGrowth,
      unit: "ratio",
    },
  ];
  return entries.filter((entry) => entry.value !== null && entry.unit !== null);
}

function sanitizePublicDriverSummary(valuation, { includeBase = false } = {}) {
  if (!valuation || typeof valuation !== "object") return null;
  const status = cleanText(valuation.status).toLowerCase();
  if (!new Set(["research_grade", "decision_ready"]).has(status)) return null;
  const currency = validCurrency(valuation.currency);
  const meanReversionYears = safeMeanReversionYears(valuation);
  const scenarios = new Map();
  for (const scenario of (Array.isArray(valuation.scenarios) ? valuation.scenarios : []).slice(0, 12)) {
    const name = cleanText(scenario?.name).toLowerCase();
    if (Object.hasOwn(PUBLIC_DRIVER_SCENARIOS, name) && !scenarios.has(name)) scenarios.set(name, scenario);
  }
  const requirements = [
    ...publicDriverItems(scenarios.get("bull"), "bull", currency, meanReversionYears),
    ...(includeBase ? publicDriverItems(scenarios.get("base"), "base", currency, meanReversionYears) : []),
  ].slice(0, 10);
  const breakers = publicDriverItems(
    scenarios.get("bear"),
    "bear",
    currency,
    meanReversionYears,
  ).slice(0, 5);
  if (!requirements.length && !breakers.length && meanReversionYears === null) return null;
  return { requirements, breakers, mean_reversion_years: meanReversionYears };
}

const PUBLIC_MARKET_REQUIREMENT_BOUNDS = Object.freeze({
  above_range: ">100%",
  below_range: "<-25%",
});

const PUBLIC_STRUCTURAL_PENDING_CHECKS = new Set([
  "ttm_scale_inputs_reconciliation",
  "ttm_equity_bridge_reconciliation",
  "currency_consistency",
  "capacity_and_asset_turnover_support",
  "organic_or_acquisition_revenue_bridge",
  "segment_reconciliation",
  "equity_bridge_completeness",
]);
const PUBLIC_MARKET_REQUIREMENT_DERIVED_GAPS = new Set([
  "valuation_range_central",
  "ev_to_sales",
  "price_to_fcf",
]);
const PUBLIC_EVIDENCE_CONTRACT_METRIC_COUNT = 19;
const PUBLIC_DECISION_READY_REQUIRED_METRICS = new Set([
  "company_profile",
  "latest_revenue",
  "latest_diluted_shares",
  "latest_free_cash_flow",
  "revenue_cagr_5y",
  "gross_margin",
  "operating_margin",
  "fcf_margin",
  "roic",
  "net_debt",
  "base_fcf_margin",
  "wacc",
  "terminal_growth",
  "current_price",
  "valuation_range_central",
  "reverse_dcf_status",
  "ev_to_sales",
  "price_to_fcf",
  "latest_sec_filing",
]);
const PUBLIC_MARKET_REQUIREMENT_ALLOWED_AUDIT_CODES = new Set([
  "valuation_not_decision_ready",
  "valuation_unavailable",
  "evidence_coverage_gap",
  "reverse_dcf_outside_range",
]);
const PUBLIC_INDEPENDENT_PRICE_SOURCE_FAMILIES = new Set([
  "official_exchange_feed",
  "independent_exchange_feed",
]);
const PUBLIC_EQUITY_BRIDGE_PROVIDER_METRICS = Object.freeze([
  "cash",
  "total_debt",
  "non_operating_investments",
  "preferred_stock",
  "minority_interest",
  "lease_liabilities_not_in_debt",
]);
const PUBLIC_EQUITY_BRIDGE_ALL_METRICS = Object.freeze([
  ...PUBLIC_EQUITY_BRIDGE_PROVIDER_METRICS,
  "unfunded_pension_liability",
]);
const PUBLIC_BLOCKER_TO_PENDING_GAP = new Map([
  ["validated_price", "independent_price_confirmation"],
  ["fresh_market_data", "current_price"],
  ["price_validation_blocked", "current_price"],
  ["currency_consistency", "currency_consistency"],
  ["historical_currency_consistency", "currency_consistency"],
  ["estimate_currency", "currency_consistency"],
  ["fresh_financial_data", "ttm_scale_inputs_reconciliation"],
  ["ttm_equity_bridge_reconciliation", "ttm_equity_bridge_reconciliation"],
  ["ttm_structure", "ttm_scale_inputs_reconciliation"],
  ["sec_statement_reconciliation", "sec_statement_reconciliation"],
  ["future_estimate_support", "future_estimate_support"],
  ["estimate_provenance", "future_estimate_support"],
  ["historical_cash_flow_support", "cycle_coverage"],
  ["cycle_coverage", "cycle_coverage"],
  ["cycle_regime_continuity", "cycle_coverage"],
  ["operating_cash_separation", "operating_cash_separation"],
  ["growth_reinvestment_support", "growth_reinvestment_support"],
  ["capital_structure_support", "equity_bridge_completeness"],
  ["equity_bridge_completeness", "equity_bridge_completeness"],
  ["pension_claim_reconciliation", "equity_bridge_completeness"],
  ["share_dilution_support", "share_dilution_support"],
  ["current_share_count_reconciliation", "share_dilution_support"],
  ["share_denominator_mismatch", "share_dilution_support"],
  ["stock_compensation_treatment", "stock_compensation_treatment"],
  ["dated_capital_market_inputs", "discount_rate_support"],
  ["method_agreement", "valuation_cross_check"],
  ["independent_cross_check", "valuation_cross_check"],
  ["range_informativeness", "range_reliability"],
  ["terminal_value_dependence", "range_reliability"],
  ["historical_tangible_book_support", "tangible_book_support"],
  ["valuation_inputs", "valuation_inputs"],
  ["fundamental_scale_reconciliation", "structural_scale_bridge"],
]);
const PUBLIC_VALUATION_REASONS = Object.freeze({
  structural_scale_bridge: "La valoración está en revisión porque falta comprobar si la escala operativa necesaria es alcanzable.",
  price_validation_blocked: "La valoración está en revisión porque el precio de mercado aún no tiene una validación suficiente.",
  share_denominator_mismatch: "La valoración está en revisión porque el número de acciones requiere conciliación.",
  equity_bridge_incomplete: "La valoración está en revisión porque faltan partidas para conciliar valor empresa y patrimonio.",
  valuation_research_grade: "Se publica un rango de investigación; el valor central permanece retenido hasta completar todos los controles.",
  valuation_not_decision_ready: "La valoración no supera todavía los controles necesarios para publicar cifras.",
});
const MARKET_DATA_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;
const FINANCIAL_DATA_MAX_AGE_MS = 190 * 24 * 60 * 60 * 1000;
const EVIDENCE_RETRIEVAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MARKET_DATA_FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

function sanitizePublicBlockingState(valuation) {
  if (!valuation || typeof valuation !== "object") return null;
  const bridge = valuation.structural_scale_bridge;
  const blockers = Array.isArray(valuation?.reliability?.decision_ready_blockers)
    ? valuation.reliability.decision_ready_blockers.map((value) => cleanText(value).toLowerCase())
    : [];
  if (
    cleanText(valuation.status).toLowerCase() === "not_decision_ready"
    && bridge
    && typeof bridge === "object"
    && bridge.passed === false
    && blockers.includes("structural_scale_bridge")
  ) {
    const pendingChecks = [...new Set((Array.isArray(bridge.missing) ? bridge.missing : [])
      .map((value) => cleanText(value).toLowerCase())
      .filter((value) => PUBLIC_STRUCTURAL_PENDING_CHECKS.has(value)))].slice(0, 5);
    return {
      reason: PUBLIC_VALUATION_REASONS.structural_scale_bridge,
      blocking_gap: "structural_scale_bridge",
      pending_checks: pendingChecks,
    };
  }
  if (cleanText(valuation.status).toLowerCase() !== "not_decision_ready") return null;
  const pendingChecks = [...new Set(blockers
    .map((blocker) => PUBLIC_BLOCKER_TO_PENDING_GAP.get(blocker))
    .filter(Boolean))].slice(0, 6);
  if (!pendingChecks.length) return null;
  const blockingGap = pendingChecks[0];
  const reason = blockingGap === "current_price"
    ? PUBLIC_VALUATION_REASONS.price_validation_blocked
    : blockingGap === "share_dilution_support"
      ? PUBLIC_VALUATION_REASONS.share_denominator_mismatch
      : blockingGap === "equity_bridge_completeness"
        ? PUBLIC_VALUATION_REASONS.equity_bridge_incomplete
        : PUBLIC_VALUATION_REASONS.valuation_not_decision_ready;
  return { reason, blocking_gap: blockingGap, pending_checks: pendingChecks };
}

function canonicalPublicValuationReason(valuation, { researchRangeVisible = false } = {}) {
  if (researchRangeVisible) return PUBLIC_VALUATION_REASONS.valuation_research_grade;
  const blockingState = sanitizePublicBlockingState(valuation);
  if (blockingState) return blockingState.reason;
  const reasonCode = cleanText(valuation?.reason_code).toLowerCase();
  return PUBLIC_VALUATION_REASONS[reasonCode] || PUBLIC_VALUATION_REASONS.valuation_not_decision_ready;
}

function uniqueRawSourceRecordMap(sourceRecords) {
  const records = new Map();
  for (const record of (Array.isArray(sourceRecords) ? sourceRecords : [])) {
    const sourceId = cleanText(record?.source_id).toLowerCase();
    if (!sourceId) continue;
    if (records.has(sourceId)) return null;
    records.set(sourceId, record);
  }
  return records;
}

function sourceRecordIsFreshAndOk(sourceRecordMap, sourceId, {
  now = Date.now(),
  maximumAgeMs = EVIDENCE_RETRIEVAL_MAX_AGE_MS,
} = {}) {
  if (!(sourceRecordMap instanceof Map)) return false;
  const record = sourceRecordMap.get(cleanText(sourceId).toLowerCase());
  if (cleanText(record?.status).toLowerCase() !== "ok") return false;
  const retrievedAt = validDate(record?.retrieved_at);
  const retrievedTimestamp = retrievedAt ? Date.parse(retrievedAt) : Number.NaN;
  return Number.isFinite(retrievedTimestamp)
    && retrievedTimestamp <= now + MARKET_DATA_FUTURE_TOLERANCE_MS
    && now - retrievedTimestamp <= maximumAgeMs;
}

function authenticSecCompanyFactsRecord(record, expectedTicker, { requiredTargets = [] } = {}) {
  const ticker = cleanTicker(expectedTicker);
  const provider = cleanText(record?.provider).toLowerCase();
  const endpoint = cleanText(record?.endpoint_or_filing);
  const targets = new Set(Array.isArray(record?.targets_covered) ? record.targets_covered.map(cleanText) : []);
  return Boolean(
    ticker
    && provider === "sec-edgar"
    && endpoint.toLowerCase() === `api/xbrl/companyfacts/cik{resolved_from_${ticker}}.json`.toLowerCase()
    && requiredTargets.every((target) => targets.has(target))
  );
}

function authenticSecSubmissionsRecord(record, expectedTicker) {
  const ticker = cleanTicker(expectedTicker);
  const provider = cleanText(record?.provider).toLowerCase();
  const endpoint = cleanText(record?.endpoint_or_filing);
  return Boolean(
    ticker
    && provider === "sec-edgar"
    && endpoint.toLowerCase() === `submissions/cik{resolved_from_${ticker}}.json`.toLowerCase()
    && Number.isInteger(record?.row_count)
    && record.row_count > 0
  );
}

function authenticFmpRecord(record, sourceId, expectedTicker) {
  const ticker = cleanTicker(expectedTicker);
  const canonicalEndpoints = new Map([
    ["fmp:profile", `profile/${ticker}`],
    ["fmp:quote", `quote/${ticker}`],
    ["fmp:prices", `historical-price-eod/full?symbol=${ticker}`],
    ["fmp:income:annual", `income-statement/${ticker}?period=annual&limit=10`],
    ["fmp:cash-flow:annual", `cash-flow-statement/${ticker}?period=annual&limit=10`],
    ["fmp:balance:annual", `balance-sheet-statement/${ticker}?period=annual&limit=10`],
    ["fmp:income:quarterly", `income-statement/${ticker}?period=quarter&limit=8`],
    ["fmp:cash-flow:quarterly", `cash-flow-statement/${ticker}?period=quarter&limit=8`],
    ["fmp:balance:quarterly", `balance-sheet-statement/${ticker}?period=quarter&limit=8`],
    ["fmp:income:ttm", `income-statement-ttm/${ticker}`],
    ["fmp:cash-flow:ttm", `cash-flow-statement-ttm/${ticker}`],
    ["fmp:balance:ttm", `balance-sheet-statement-ttm/${ticker}`],
  ]);
  const endpoint = canonicalEndpoints.get(cleanText(sourceId).toLowerCase());
  return Boolean(
    ticker
    && endpoint
    && cleanText(record?.provider).toLowerCase() === "fmp"
    && cleanText(record?.endpoint_or_filing).toLowerCase() === endpoint.toLowerCase()
    && Number.isInteger(record?.row_count)
    && record.row_count > 0
  );
}

function authenticYfinanceRecord(record, sourceId, expectedTicker) {
  const ticker = cleanTicker(expectedTicker);
  const canonicalEndpoints = new Map([
    ["yfinance:profile", `Ticker/${ticker}/info`],
    ["yfinance:quote", `Ticker/${ticker}/fast_info`],
    ["yfinance:prices", `Ticker/${ticker}/history?period=1mo&interval=1d`],
    ["yfinance:shares-float", `Ticker/${ticker}/info#shares`],
    ["yfinance:income:annual", `Ticker/${ticker}/income_stmt?period=annual`],
    ["yfinance:cash-flow:annual", `Ticker/${ticker}/cash_flow?period=annual`],
    ["yfinance:balance:annual", `Ticker/${ticker}/balance_sheet?period=annual`],
    ["yfinance:income:quarterly", `Ticker/${ticker}/quarterly_income_stmt?period=quarterly`],
    ["yfinance:cash-flow:quarterly", `Ticker/${ticker}/quarterly_cash_flow?period=quarterly`],
    ["yfinance:balance:quarterly", `Ticker/${ticker}/quarterly_balance_sheet?period=quarterly`],
  ]);
  const endpoint = canonicalEndpoints.get(cleanText(sourceId).toLowerCase());
  return Boolean(
    ticker
    && endpoint
    && cleanText(record?.provider).toLowerCase() === "yfinance"
    && cleanText(record?.endpoint_or_filing) === endpoint
    && Number.isInteger(record?.row_count)
    && record.row_count > 0
  );
}

function uniqueRawDataPointMap(dataPoints) {
  const points = new Map();
  for (const point of (Array.isArray(dataPoints) ? dataPoints : [])) {
    const metric = cleanText(point?.metric).toLowerCase();
    if (!metric) continue;
    if (points.has(metric)) return null;
    points.set(metric, point);
  }
  return points;
}

function relativeDifference(left, right) {
  const a = numberOrNull(left);
  const b = numberOrNull(right);
  if (a === null || b === null) return null;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9);
}

function strictRelativeDifference(left, right) {
  return rawNumberInRange(left, -1e18, 1e18) && rawNumberInRange(right, -1e18, 1e18)
    ? Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1e-9)
    : Number.POSITIVE_INFINITY;
}

function rawNumberInRange(value, minimum, maximum) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function canonicalDecisionMetricValue(metric, value) {
  const numericBounds = new Map([
    ["latest_revenue", [0.000001, 1e18]],
    ["latest_diluted_shares", [0.000001, 1e15]],
    ["latest_free_cash_flow", [-1e18, 1e18]],
    ["revenue_cagr_5y", [-1, 5]],
    ["gross_margin", [-2, 2]],
    ["operating_margin", [-5, 2]],
    ["fcf_margin", [-5, 5]],
    ["roic", [-5, 5]],
    ["net_debt", [-1e18, 1e18]],
    ["base_fcf_margin", [-5, 5]],
    ["wacc", [0.02, 0.50]],
    ["terminal_growth", [-0.10, 0.20]],
    ["current_price", [0.000001, 1e9]],
    ["valuation_range_low", [0.000001, 1e12]],
    ["valuation_range_central", [0.000001, 1e12]],
    ["valuation_range_high", [0.000001, 1e12]],
    ["ev_to_sales", [-100, 1_000]],
    ["price_to_fcf", [-1_000, 1_000]],
  ]);
  if (numericBounds.has(metric)) {
    const [minimum, maximum] = numericBounds.get(metric);
    return rawNumberInRange(value, minimum, maximum);
  }
  if (metric === "company_profile") {
    return typeof value === "string" && cleanText(value).length > 0 && cleanText(value).length <= 200;
  }
  if (metric === "reverse_dcf_status") {
    return typeof value === "string" && ["solved", "above_range", "below_range"].includes(cleanText(value).toLowerCase());
  }
  if (metric === "latest_sec_filing") {
    return typeof value === "string" && /^\d{10}-\d{2}-\d{6}$/.test(cleanText(value));
  }
  return false;
}

function publicMarketPriceContext(valuation, {
  now = Date.now(),
  sourceRecords = [],
  expectedTicker = null,
} = {}) {
  const validation = valuation?.price_validation;
  if (!validation || typeof validation !== "object") return null;
  const currency = validCurrency(valuation.currency);
  if (!currency) return null;
  const marketDataAsOf = validDate(valuation.market_data_as_of);
  const timestamp = marketDataAsOf ? Date.parse(marketDataAsOf) : Number.NaN;
  const referencePrice = boundedFiniteNumber(valuation.current_price, 0.000001, 1e9);
  if (
    !Number.isFinite(timestamp)
    || timestamp > now + MARKET_DATA_FUTURE_TOLERANCE_MS
    || now - timestamp > MARKET_DATA_MAX_AGE_MS
    || referencePrice === null
  ) {
    return null;
  }
  const status = cleanText(validation.status).toLowerCase();
  const evidenceSources = (Array.isArray(validation.sources) ? validation.sources : [])
    .map((source) => cleanText(source).toLowerCase())
    .filter(Boolean);
  const hasFmpQuote = evidenceSources.some((source) => /\bfmp\b.*\bquote\b|\bquote\b.*\bfmp\b/.test(source));
  const hasFmpClose = evidenceSources.some((source) => /\bfmp\b.*\bclose\b|\bclose\b.*\bfmp\b/.test(source));
  const hasYfinanceQuote = evidenceSources.some((source) => /\b(?:yfinance|yahoo\s*finance|yahoo)\b.*\bquote\b|\bquote\b.*\b(?:yfinance|yahoo\s*finance|yahoo)\b/.test(source));
  const hasYfinanceClose = evidenceSources.some((source) => /\b(?:yfinance|yahoo\s*finance|yahoo)\b.*\bclose\b|\bclose\b.*\b(?:yfinance|yahoo\s*finance|yahoo)\b/.test(source));
  const hasIndependentClose = evidenceSources.some((source) => (
    /\b(?:official|exchange|independent[_\s-]*exchange(?:[_\s-]*feed)?|nasdaq|nyse|cboe|iex)\b.*\bclose\b/.test(source)
    && !/\bfmp\b|financial\s*modeling\s*prep/.test(source)
  ));
  const sourceRecordMap = uniqueRawSourceRecordMap(sourceRecords);
  if (!sourceRecordMap) return null;
  const fmpPairRecordsPresent = sourceRecordIsFreshAndOk(sourceRecordMap, "fmp:quote", {
    now,
    maximumAgeMs: MARKET_DATA_MAX_AGE_MS,
  }) && sourceRecordIsFreshAndOk(sourceRecordMap, "fmp:prices", {
    now,
    maximumAgeMs: MARKET_DATA_MAX_AGE_MS,
  })
    && authenticFmpRecord(sourceRecordMap.get("fmp:quote"), "fmp:quote", expectedTicker)
    && authenticFmpRecord(sourceRecordMap.get("fmp:prices"), "fmp:prices", expectedTicker);
  const yfinancePairRecordsPresent = sourceRecordIsFreshAndOk(sourceRecordMap, "yfinance:quote", {
    now,
    maximumAgeMs: MARKET_DATA_MAX_AGE_MS,
  }) && sourceRecordIsFreshAndOk(sourceRecordMap, "yfinance:prices", {
    now,
    maximumAgeMs: MARKET_DATA_MAX_AGE_MS,
  })
    && authenticYfinanceRecord(sourceRecordMap.get("yfinance:quote"), "yfinance:quote", expectedTicker)
    && authenticYfinanceRecord(sourceRecordMap.get("yfinance:prices"), "yfinance:prices", expectedTicker);
  const fmpQuoteRecordPresent = sourceRecordIsFreshAndOk(sourceRecordMap, "fmp:quote", {
    now,
    maximumAgeMs: MARKET_DATA_MAX_AGE_MS,
  }) && authenticFmpRecord(sourceRecordMap.get("fmp:quote"), "fmp:quote", expectedTicker);
  const yfinancePriceRecordPresent = sourceRecordIsFreshAndOk(sourceRecordMap, "yfinance:prices", {
    now,
    maximumAgeMs: MARKET_DATA_MAX_AGE_MS,
  }) && authenticYfinanceRecord(sourceRecordMap.get("yfinance:prices"), "yfinance:prices", expectedTicker);
  const providerCloseCheck = (Array.isArray(validation.checks) ? validation.checks : []).find((check) => (
    cleanText(check?.key).toLowerCase() === "quote_vs_latest_close"
  ));
  const providerCloseContextBacked = Boolean(
    providerCloseCheck
    && providerCloseCheck.passed === true
    && providerCloseCheck.comparable === true
    && cleanText(providerCloseCheck.source_family).toLowerCase()
      === cleanText(providerCloseCheck.compared_with_source_family).toLowerCase()
    && rawNumberInRange(providerCloseCheck.difference, 0, 1)
    && rawNumberInRange(providerCloseCheck.maximum_difference, 0, 1)
    && providerCloseCheck.difference <= providerCloseCheck.maximum_difference
  );
  const independentObservation = validation.independent_observation;
  const independentSourceId = cleanText(independentObservation?.source_id).toLowerCase();
  const independentSourceFamily = cleanText(independentObservation?.source_family).toLowerCase();
  const independentPrice = boundedFiniteNumber(independentObservation?.price, 0.000001, 1e9);
  const independentDate = validDate(independentObservation?.as_of);
  const independentCurrency = validCurrency(independentObservation?.currency);
  const independentTimestamp = independentDate ? Date.parse(independentDate) : Number.NaN;
  const independentRecord = sourceRecordMap.get(independentSourceId);
  const independentRecordPrice = boundedFiniteNumber(independentRecord?.observed_price, 0.000001, 1e9);
  const independentRecordDate = validDate(independentRecord?.as_of);
  const independentRecordCurrency = validCurrency(independentRecord?.currency);
  const independentRecordSourceFamily = cleanText(independentRecord?.source_family).toLowerCase();
  const independentSourceAuthentic = Boolean(
    (
      independentSourceId === "market:independent-close"
      && PUBLIC_INDEPENDENT_PRICE_SOURCE_FAMILIES.has(independentSourceFamily)
    )
    || (
      independentSourceId === "yfinance:prices"
      && ["yfinance", "yahoo finance", "yahoo"].includes(independentSourceFamily)
      && authenticYfinanceRecord(independentRecord, independentSourceId, expectedTicker)
    )
  );
  const independentObservationBacked = Boolean(
    independentSourceAuthentic
    && independentRecordSourceFamily === independentSourceFamily
    && independentPrice !== null
    && independentDate
    && independentCurrency === currency
    && Number.isFinite(independentTimestamp)
    && Math.abs(timestamp - independentTimestamp) <= 2 * 24 * 60 * 60 * 1000
    && relativeDifference(referencePrice, independentPrice) <= 0.18
    && sourceRecordIsFreshAndOk(sourceRecordMap, independentSourceId, {
      now,
      maximumAgeMs: MARKET_DATA_MAX_AGE_MS,
    })
    && independentRecordPrice !== null
    && relativeDifference(independentRecordPrice, independentPrice) <= 1e-8
    && independentRecordDate === independentDate
    && independentRecordCurrency === currency
  );
  if (
    status === "validated"
    && validation.usable === true
    && validation.provider_corroborated === true
    && validation.independent_price_observation === true
    && (
      (hasFmpQuote && hasIndependentClose && fmpPairRecordsPresent && independentSourceId === "market:independent-close")
      || (hasFmpQuote && hasYfinanceClose && fmpQuoteRecordPresent && yfinancePriceRecordPresent && independentSourceId === "yfinance:prices")
    )
    && independentObservationBacked
  ) {
    return {
      price_context: "validated",
      reference_price: referencePrice,
      market_data_as_of: marketDataAsOf,
      currency,
    };
  }
  if (
    status === "provider_reconciled"
    && (validation.research_usable === true || validation.usable_for_context === true)
    && validation.provider_corroborated === true
    && (
      (hasFmpQuote && hasFmpClose && fmpPairRecordsPresent)
      || (hasYfinanceQuote && hasYfinanceClose && yfinancePairRecordsPresent)
    )
  ) {
    return {
      price_context: "contextual",
      reference_price: referencePrice,
      market_data_as_of: marketDataAsOf,
      currency,
    };
  }
  if (
    status === "inconsistent"
    && validation.usable_for_context === true
    && providerCloseContextBacked
    && (
      (hasFmpQuote && hasFmpClose && fmpPairRecordsPresent)
      || (hasYfinanceQuote && hasYfinanceClose && yfinancePairRecordsPresent)
    )
  ) {
    return {
      price_context: "contextual",
      reference_price: referencePrice,
      market_data_as_of: marketDataAsOf,
      currency,
    };
  }
  return null;
}

function hasSufficientMarketRequirementCoverage(value) {
  if (Array.isArray(value)) {
    if (value.length !== 2 || !value.every((coverage) => hasSufficientMarketRequirementCoverage(coverage))) return false;
    const signature = (coverage) => JSON.stringify({
      status: cleanText(coverage?.status).toLowerCase(),
      score: numberOrNull(coverage?.score),
      expected: numberOrNull(coverage?.expected_metrics),
      covered: numberOrNull(coverage?.covered_expected_metrics),
      missing: [...new Set((Array.isArray(coverage?.missing_expected_metrics) ? coverage.missing_expected_metrics : [])
        .map((item) => cleanText(item).toLowerCase()).filter(Boolean))].sort(),
      sourceGaps: [...new Set((Array.isArray(coverage?.sourced_points_missing_ok_source) ? coverage.sourced_points_missing_ok_source : [])
        .map((item) => cleanText(item).toLowerCase()).filter(Boolean))].sort(),
      formulaGaps: [...new Set((Array.isArray(coverage?.calculated_points_missing_formula) ? coverage.calculated_points_missing_formula : [])
        .map((item) => cleanText(item).toLowerCase()).filter(Boolean))].sort(),
    });
    return signature(value[0]) === signature(value[1]);
  }
  const coverage = value && typeof value === "object" ? value : {};
  const status = cleanText(coverage.status).toLowerCase();
  const score = numberOrNull(coverage.score);
  const expected = numberOrNull(coverage.expected_metrics);
  const covered = numberOrNull(coverage.covered_expected_metrics);
  const missing = Array.isArray(coverage.missing_expected_metrics)
    ? [...new Set(coverage.missing_expected_metrics.map((item) => cleanText(item).toLowerCase()).filter(Boolean))]
    : null;
  const sourceGaps = coverage.sourced_points_missing_ok_source;
  const formulaGaps = coverage.calculated_points_missing_formula;
  const expectedMissing = [...PUBLIC_MARKET_REQUIREMENT_DERIVED_GAPS].sort();
  return Boolean(
    status === "partial"
    && score === 84
    && Number.isInteger(expected)
    && expected === PUBLIC_EVIDENCE_CONTRACT_METRIC_COUNT
    && Number.isInteger(covered)
    && covered === PUBLIC_EVIDENCE_CONTRACT_METRIC_COUNT - expectedMissing.length
    && missing
    && JSON.stringify([...missing].sort()) === JSON.stringify(expectedMissing)
    && Array.isArray(sourceGaps)
    && sourceGaps.length === 0
    && Array.isArray(formulaGaps)
    && formulaGaps.length === 0
  );
}

function hasCompleteDecisionReadyCoverage(value) {
  if (Array.isArray(value)) {
    return value.length === 2 && value.every((coverage) => hasCompleteDecisionReadyCoverage(coverage));
  }
  const coverage = value && typeof value === "object" ? value : {};
  const status = cleanText(coverage.status).toLowerCase();
  const score = numberOrNull(coverage.score);
  const expected = numberOrNull(coverage.expected_metrics);
  const covered = numberOrNull(coverage.covered_expected_metrics);
  return Boolean(
    ["pass", "complete"].includes(status)
    && score === 100
    && expected === PUBLIC_EVIDENCE_CONTRACT_METRIC_COUNT
    && covered === PUBLIC_EVIDENCE_CONTRACT_METRIC_COUNT
    && Array.isArray(coverage.missing_expected_metrics)
    && coverage.missing_expected_metrics.length === 0
    && Array.isArray(coverage.sourced_points_missing_ok_source)
    && coverage.sourced_points_missing_ok_source.length === 0
    && Array.isArray(coverage.calculated_points_missing_formula)
    && coverage.calculated_points_missing_formula.length === 0
  );
}

function marketRequirementAuditIsSafe(audit) {
  const status = cleanText(audit?.status).toLowerCase();
  const findings = Array.isArray(audit?.findings) ? audit.findings : [];
  if (status !== "needs_attention" || !findings.length) return false;
  const safe = findings.every((finding) => {
    const code = cleanText(finding?.code).toLowerCase();
    const severity = cleanText(finding?.severity).toLowerCase();
    return PUBLIC_MARKET_REQUIREMENT_ALLOWED_AUDIT_CODES.has(code)
      && ["info", "low", "medium", "high"].includes(severity);
  });
  return safe && findings.some((finding) => (
    cleanText(finding?.code).toLowerCase() === "valuation_not_decision_ready"
  ));
}

function publicFinancialEvidenceContext({
  valuation,
  financials,
  dataPoints,
  sourceRecords,
  expectedTicker,
  now = Date.now(),
}) {
  const financialDate = validDate(valuation?.financial_data_as_of);
  const ttmDate = validDate(financials?.ttm?.date);
  const financialTimestamp = financialDate ? Date.parse(financialDate) : Number.NaN;
  if (
    !financialDate
    || financialDate !== ttmDate
    || !Number.isFinite(financialTimestamp)
    || financialTimestamp > now + MARKET_DATA_FUTURE_TOLERANCE_MS
    || now - financialTimestamp > FINANCIAL_DATA_MAX_AGE_MS
  ) {
    return null;
  }
  const sourceRecordMap = uniqueRawSourceRecordMap(sourceRecords);
  const pointMap = uniqueRawDataPointMap(dataPoints);
  if (!sourceRecordMap || !pointMap) return null;
  for (const sourceId of ["fmp:income:quarterly", "sec:companyfacts:income"]) {
    if (!sourceRecordIsFreshAndOk(sourceRecordMap, sourceId, {
      now,
      maximumAgeMs: EVIDENCE_RETRIEVAL_MAX_AGE_MS,
    })) return null;
  }
  if (!authenticFmpRecord(
    sourceRecordMap.get("fmp:income:quarterly"),
    "fmp:income:quarterly",
    expectedTicker,
  )) return null;
  const secIncomeRecord = sourceRecordMap.get("sec:companyfacts:income");
  if (
    !authenticSecCompanyFactsRecord(secIncomeRecord, expectedTicker, {
      requiredTargets: ["revenue", "weightedAverageShsOutDil"],
    })
    || !Number.isInteger(secIncomeRecord?.row_count)
    || secIncomeRecord.row_count <= 0
  ) return null;
  const latestRevenuePoint = pointMap.get("latest_revenue");
  const latestSharesPoint = pointMap.get("latest_diluted_shares");
  const ttmRevenuePoint = pointMap.get("financials.ttm.revenue");
  const ttmSharesPoint = pointMap.get("financials.ttm.diluted_shares");
  const latestRevenue = boundedFiniteNumber(latestRevenuePoint?.normalized_value, 0.000001, 1e18);
  const latestShares = boundedFiniteNumber(latestSharesPoint?.normalized_value, 0.000001, 1e15);
  const ttmRevenue = boundedFiniteNumber(ttmRevenuePoint?.normalized_value, 0.000001, 1e18);
  const ttmShares = boundedFiniteNumber(ttmSharesPoint?.normalized_value, 0.000001, 1e15);
  const rawTtmRevenue = boundedFiniteNumber(financials?.ttm?.revenue, 0.000001, 1e18);
  const rawTtmShares = boundedFiniteNumber(financials?.ttm?.diluted_shares, 0.000001, 1e15);
  const sourceSet = (point) => new Set((Array.isArray(point?.source_ids) ? point.source_ids : [])
    .map((sourceId) => cleanText(sourceId).toLowerCase()));
  const ttmRevenueSources = sourceSet(ttmRevenuePoint);
  const ttmSharesSources = sourceSet(ttmSharesPoint);
  const quarterDatesAreCoherent = (point) => {
    const dates = Array.isArray(point?.quarter_dates) ? point.quarter_dates.map(validDate).filter(Boolean) : [];
    if (dates.length !== 4 || new Set(dates).size !== 4) return false;
    const sorted = [...dates].sort();
    const oldest = Date.parse(sorted[0]);
    const latest = Date.parse(sorted[3]);
    const spanDays = (latest - oldest) / (24 * 60 * 60 * 1000);
    return sorted[3] === financialDate
      && latest <= now + MARKET_DATA_FUTURE_TOLERANCE_MS
      && spanDays >= 200
      && spanDays <= 370;
  };
  const calculatedWithFormula = (point) => (
    cleanText(point?.claim_tag).toLowerCase() === "calculated_metric"
    && Boolean(cleanText(point?.formula))
  );
  if (
    latestRevenue === null
    || latestRevenue <= 0
    || latestShares === null
    || latestShares <= 0
    || ttmRevenue === null
    || ttmShares === null
    || rawTtmRevenue === null
    || rawTtmShares === null
    || relativeDifference(latestRevenue, ttmRevenue) > 1e-8
    || relativeDifference(latestShares, ttmShares) > 1e-8
    || relativeDifference(rawTtmRevenue, ttmRevenue) > 1e-8
    || relativeDifference(rawTtmShares, ttmShares) > 1e-8
    || !calculatedWithFormula(latestRevenuePoint)
    || !calculatedWithFormula(latestSharesPoint)
    || !calculatedWithFormula(ttmRevenuePoint)
    || !calculatedWithFormula(ttmSharesPoint)
    || !ttmRevenueSources.has("fmp:income:quarterly")
    || !ttmRevenueSources.has("sec:companyfacts:income")
    || !ttmSharesSources.has("fmp:income:quarterly")
    || !ttmSharesSources.has("sec:companyfacts:income")
    || !quarterDatesAreCoherent(ttmRevenuePoint)
    || !quarterDatesAreCoherent(ttmSharesPoint)
    || JSON.stringify(ttmRevenuePoint.quarter_dates) !== JSON.stringify(ttmSharesPoint.quarter_dates)
  ) {
    return null;
  }
  return { sourceRecordMap, pointMap, latestRevenue, latestShares };
}

function publicEquityBridgeReconciliationIsBacked({
  valuation,
  financials,
  dataPoints,
  sourceRecords,
  financialEvidence,
  expectedTicker,
  now = Date.now(),
}) {
  const bridge = valuation?.structural_scale_bridge;
  const reconciliation = bridge?.equity_bridge_reconciliation;
  const equityBridge = valuation?.equity_bridge;
  const ttm = financials?.ttm;
  const validation = ttm?.ttm_validation;
  if (
    !bridge || typeof bridge !== "object"
    || !reconciliation || typeof reconciliation !== "object"
    || !equityBridge || typeof equityBridge !== "object"
    || !ttm || typeof ttm !== "object"
    || !validation || typeof validation !== "object"
  ) return false;

  const sourceRecordMap = financialEvidence?.sourceRecordMap || uniqueRawSourceRecordMap(sourceRecords);
  const pointMap = financialEvidence?.pointMap || uniqueRawDataPointMap(dataPoints);
  if (!sourceRecordMap || !pointMap) return false;
  const currency = validCurrency(valuation?.currency);
  const financialCurrency = validCurrency(ttm.reported_currency);
  const calculatedCurrency = validCurrency(validation.calculated_currency);
  const providerCurrency = validCurrency(validation.provider_ttm_currency);
  const providerBalanceCurrency = validCurrency(validation.provider_ttm_balance_currency);
  const marketCurrency = validCurrency(reconciliation.market_currency);
  const structuralFinancialCurrency = validCurrency(reconciliation.financial_currency);
  const structuralProviderCurrency = validCurrency(reconciliation.provider_balance_currency);
  if (
    !currency
    || financialCurrency !== currency
    || calculatedCurrency !== currency
    || providerCurrency !== currency
    || providerBalanceCurrency !== currency
    || marketCurrency !== currency
    || structuralFinancialCurrency !== currency
    || structuralProviderCurrency !== currency
    || validation.currency_reconciled !== true
    || validation.provider_ttm_balance_currency_reconciled !== true
    || reconciliation.currency_reconciled !== true
  ) return false;

  const financialDate = validDate(ttm.date);
  const providerBalanceDate = validDate(validation.provider_ttm_balance_date);
  const structuralBalanceDate = validDate(reconciliation.provider_balance_date);
  const financialTimestamp = financialDate ? Date.parse(financialDate) : Number.NaN;
  const providerBalanceTimestamp = providerBalanceDate ? Date.parse(providerBalanceDate) : Number.NaN;
  const balanceDateGapDays = Number.isFinite(financialTimestamp) && Number.isFinite(providerBalanceTimestamp)
    ? Math.round((financialTimestamp - providerBalanceTimestamp) / (24 * 60 * 60 * 1000))
    : null;
  if (
    !financialDate
    || providerBalanceDate !== structuralBalanceDate
    || validDate(validation?.provider_ttm_dates?.balance) !== providerBalanceDate
    || !Number.isInteger(balanceDateGapDays)
    || balanceDateGapDays < 0
    || balanceDateGapDays > 45
    || providerBalanceTimestamp > now + MARKET_DATA_FUTURE_TOLERANCE_MS
    || validation.provider_ttm_balance_date_current !== true
    || reconciliation.provider_balance_date_current !== true
    || !rawNumberInRange(validation.provider_ttm_balance_date_gap_days, 0, 45)
    || validation.provider_ttm_balance_date_gap_days !== balanceDateGapDays
    || !rawNumberInRange(validation?.provider_ttm_date_gaps_days?.balance, 0, 45)
    || validation.provider_ttm_date_gaps_days.balance !== balanceDateGapDays
    || validation.discrete_periods_confirmed !== true
  ) return false;

  for (const sourceId of ["fmp:balance:quarterly", "fmp:balance:ttm"]) {
    if (!sourceRecordIsFreshAndOk(sourceRecordMap, sourceId, {
      now,
      maximumAgeMs: EVIDENCE_RETRIEVAL_MAX_AGE_MS,
    })) return false;
    if (!authenticFmpRecord(sourceRecordMap.get(sourceId), sourceId, expectedTicker)) return false;
  }

  const rawValues = new Map();
  for (const metric of PUBLIC_EQUITY_BRIDGE_ALL_METRICS) {
    if (!rawNumberInRange(ttm[metric], 0, 1e18)) return false;
    rawValues.set(metric, ttm[metric]);
  }
  const revenue = financialEvidence?.latestRevenue;
  if (!rawNumberInRange(revenue, 0.000001, 1e18)) return false;
  const priceForMateriality = boundedFiniteNumber(valuation?.current_price, 0.000001, 1e9);
  const reportedShares = boundedFiniteNumber(financialEvidence?.latestShares, 0.000001, 1e15);
  const valuationShares = boundedFiniteNumber(valuation?.price_validation?.valuation_shares, 0.000001, 1e15);
  const adrConversion = valuation?.price_validation?.adr_conversion;
  let shareBasisReconciled = false;
  if (reportedShares !== null && valuationShares !== null && valuation?.price_validation?.denominator_reconciled === true) {
    if (adrConversion && typeof adrConversion === "object") {
      const adrRatio = boundedFiniteNumber(adrConversion.adr_ratio, 0.000001, 1e6);
      const convention = cleanText(adrConversion.convention).toLowerCase();
      const reportedInConversion = boundedFiniteNumber(adrConversion.reported_diluted_shares, 0.000001, 1e15);
      const listingInConversion = boundedFiniteNumber(adrConversion.listing_shares, 0.000001, 1e15);
      const expectedListingShares = adrRatio === null
        ? null
        : convention === "ordinary_shares_divided_by_adr_ratio"
          ? reportedShares / adrRatio
          : convention === "ordinary_shares_multiplied_by_adr_ratio"
            ? reportedShares * adrRatio
            : convention === "reported_shares_already_listing_units"
              ? reportedShares
              : null;
      shareBasisReconciled = Boolean(
        expectedListingShares !== null
        && reportedInConversion !== null
        && listingInConversion !== null
        && relativeDifference(reportedInConversion, reportedShares) <= 1e-8
        && relativeDifference(listingInConversion, valuationShares) <= 1e-8
        && relativeDifference(expectedListingShares, valuationShares) <= 1e-8
        && (
          convention !== "reported_shares_already_listing_units"
          || adrRatio === 1
          || adrConversion.share_basis_explicit === true
        )
      );
    } else {
      shareBasisReconciled = relativeDifference(reportedShares, valuationShares) <= 1e-8;
    }
  }
  if (!shareBasisReconciled) return false;
  const marketCapForMateriality = priceForMateriality !== null && valuationShares !== null
    ? priceForMateriality * valuationShares
    : null;
  const revenueMaterialityThreshold = Math.abs(revenue) * 0.005;
  const marketCapMaterialityThreshold = marketCapForMateriality !== null
    ? marketCapForMateriality * 0.01
    : null;
  const materialityThreshold = Math.max(
    1e-9,
    Math.min(
      revenueMaterialityThreshold,
      marketCapMaterialityThreshold !== null ? marketCapMaterialityThreshold : Number.POSITIVE_INFINITY,
    ),
  );
  const pensionValue = rawValues.get("unfunded_pension_liability");
  const pensionMaterial = pensionValue > materialityThreshold;
  const requiredProviderMetrics = [
    "cash",
    "total_debt",
    ...PUBLIC_EQUITY_BRIDGE_PROVIDER_METRICS.slice(2).filter((metric) => (
      Math.abs(rawValues.get(metric)) > materialityThreshold
    )),
  ];
  const requiredMetrics = [
    ...requiredProviderMetrics,
    ...(pensionMaterial ? ["unfunded_pension_liability"] : []),
  ];
  const structuralRequiredMetrics = Array.isArray(reconciliation.required_metrics)
    ? reconciliation.required_metrics.map((metric) => cleanText(metric).toLowerCase())
    : [];
  if (
    reconciliation.passed !== true
    || !rawNumberInRange(reconciliation.materiality_threshold, 0, 1e18)
    || !rawNumberInRange(reconciliation.materiality_revenue_threshold, 0, 1e18)
    || !rawNumberInRange(reconciliation.materiality_market_cap_threshold, 0, 1e18)
    || !rawNumberInRange(reconciliation.materiality_market_cap, 0.000001, 1e18)
    || !rawNumberInRange(reconciliation.materiality_valuation_shares, 0.000001, 1e15)
    || strictRelativeDifference(reconciliation.materiality_threshold, materialityThreshold) > 1e-8
    || strictRelativeDifference(reconciliation.materiality_revenue_threshold, revenueMaterialityThreshold) > 1e-8
    || strictRelativeDifference(reconciliation.materiality_market_cap_threshold, marketCapMaterialityThreshold) > 1e-8
    || strictRelativeDifference(reconciliation.materiality_market_cap, marketCapForMateriality) > 1e-8
    || strictRelativeDifference(reconciliation.materiality_valuation_shares, valuationShares) > 1e-8
    || cleanText(reconciliation.materiality_share_basis).toLowerCase() !== "reconciled_listing_shares"
    || JSON.stringify(structuralRequiredMetrics) !== JSON.stringify(requiredMetrics)
    || new Set(structuralRequiredMetrics).size !== structuralRequiredMetrics.length
  ) return false;

  const providerChecks = Array.isArray(validation.provider_ttm_checks) ? validation.provider_ttm_checks : [];
  const providerChecksByMetric = new Map();
  for (const check of providerChecks) {
    const metric = cleanText(check?.metric).toLowerCase();
    if (!metric) continue;
    if (providerChecksByMetric.has(metric)) return false;
    providerChecksByMetric.set(metric, check);
  }
  const structuralRows = Array.isArray(reconciliation.metrics) ? reconciliation.metrics : [];
  const structuralRowsByMetric = new Map();
  for (const row of structuralRows) {
    const metric = cleanText(row?.metric).toLowerCase();
    if (!metric || structuralRowsByMetric.has(metric)) return false;
    structuralRowsByMetric.set(metric, row);
  }
  if (structuralRows.length !== requiredMetrics.length) return false;

  const closeEnough = (left, right) => (
    rawNumberInRange(left, -1e18, 1e18)
    && rawNumberInRange(right, -1e18, 1e18)
    && Math.abs(left - right) <= Math.max(1e-9, Math.abs(right) * 1e-8)
  );
  const rawPointIsBacked = (metric, {
    providerRequired = false,
    pensionMetric = false,
    pensionRequired = false,
  } = {}) => {
    const point = pointMap.get(`financials.ttm.${metric}`);
    const sourceIds = new Set((Array.isArray(point?.source_ids) ? point.source_ids : [])
      .map((sourceId) => cleanText(sourceId).toLowerCase()));
    const revenuePoint = pointMap.get("financials.ttm.revenue");
    return Boolean(
      point
      && cleanText(point.claim_tag).toLowerCase() === "calculated_metric"
      && Boolean(cleanText(point.formula))
      && closeEnough(point.normalized_value, rawValues.get(metric))
      && JSON.stringify(point.quarter_dates) === JSON.stringify(revenuePoint?.quarter_dates)
      && (pensionMetric
        ? (sourceIds.has("sec:companyfacts:balance") || sourceIds.has("fmp:balance:quarterly"))
        : sourceIds.has("fmp:balance:quarterly"))
      && (!pensionRequired || sourceIds.has("sec:companyfacts:balance"))
      && (!providerRequired || sourceIds.has("fmp:balance:ttm"))
    );
  };

  for (const metric of PUBLIC_EQUITY_BRIDGE_PROVIDER_METRICS) {
    if (!rawPointIsBacked(metric, { providerRequired: requiredProviderMetrics.includes(metric) })) return false;
  }
  if (!rawPointIsBacked("unfunded_pension_liability", {
    pensionMetric: true,
    pensionRequired: pensionMaterial,
  })) return false;
  const pensionPointSourceIds = pointMap.get("financials.ttm.unfunded_pension_liability")?.source_ids;
  const pensionPointSources = new Set((Array.isArray(pensionPointSourceIds) ? pensionPointSourceIds : [])
    .map((sourceId) => cleanText(sourceId).toLowerCase()));
  if (
    pensionPointSources.has("sec:companyfacts:balance")
    && !sourceRecordIsFreshAndOk(sourceRecordMap, "sec:companyfacts:balance", { now })
  ) return false;

  for (const metric of requiredProviderMetrics) {
    const rawValue = rawValues.get(metric);
    const check = providerChecksByMetric.get(metric);
    const row = structuralRowsByMetric.get(metric);
    const calculatedValue = check?.calculated_value;
    const providerValue = check?.provider_value;
    const maximumDifference = check?.maximum_difference;
    const observedDifference = check?.difference;
    const calculatedDifference = rawNumberInRange(calculatedValue, 0, 1e18)
      && rawNumberInRange(providerValue, 0, 1e18)
      ? Math.abs(calculatedValue - providerValue) / Math.max(Math.abs(calculatedValue), Math.abs(providerValue), 1)
      : null;
    if (
      !check
      || !row
      || check.passed !== true
      || !closeEnough(calculatedValue, rawValue)
      || !rawNumberInRange(providerValue, 0, 1e18)
      || !rawNumberInRange(maximumDifference, 0, 0.05)
      || !rawNumberInRange(observedDifference, 0, 1)
      || calculatedDifference === null
      || calculatedDifference > maximumDifference
      || !closeEnough(observedDifference, calculatedDifference)
      || row.passed !== true
      || cleanText(row.basis).toLowerCase() !== "provider_ttm_balance"
      || !closeEnough(row.current_value, rawValue)
      || !closeEnough(row.calculated_value, calculatedValue)
      || !closeEnough(row.provider_value, providerValue)
      || !closeEnough(row.difference, calculatedDifference)
      || !closeEnough(row.maximum_difference, maximumDifference)
    ) return false;
  }

  const pensionSourceId = cleanText(ttm.unfunded_pension_liability_source_id).toLowerCase();
  const pensionAsOf = validDate(ttm.unfunded_pension_liability_as_of);
  if (pensionMaterial) {
    const pensionRow = structuralRowsByMetric.get("unfunded_pension_liability");
    const pensionSourceRecord = sourceRecordMap.get(pensionSourceId);
    const pensionBasis = cleanText(ttm.unfunded_pension_liability_basis);
    const pensionEnrichments = (Array.isArray(pensionSourceRecord?.field_enrichments)
      ? pensionSourceRecord.field_enrichments
      : []).filter((item) => (
      cleanText(item?.frame).toLowerCase() === "balance_ttm"
      && validDate(item?.date) === financialDate
      && cleanText(item?.field).toLowerCase() === "unfunded_pension_liability"
      && validDate(item?.source_as_of) === pensionAsOf
      && cleanText(item?.basis) === pensionBasis
      && closeEnough(item?.value, pensionValue)
    ));
    const pensionAgeDays = pensionAsOf
      ? Math.round((financialTimestamp - Date.parse(pensionAsOf)) / (24 * 60 * 60 * 1000))
      : null;
    if (
      pensionSourceId !== "sec:companyfacts:balance"
      || !authenticSecCompanyFactsRecord(pensionSourceRecord, expectedTicker, {
        requiredTargets: ["unfundedPensionLiability"],
      })
      || !Number.isInteger(pensionSourceRecord?.row_count)
      || pensionSourceRecord.row_count <= 0
      || pensionBasis !== "benefit_obligation_less_plan_assets"
      || !pensionAsOf
      || !Number.isInteger(pensionAgeDays)
      || pensionAgeDays < 0
      || pensionAgeDays > 550
      || !sourceRecordIsFreshAndOk(sourceRecordMap, pensionSourceId, { now })
      || !(Array.isArray(pensionSourceRecord?.targets_covered)
        && pensionSourceRecord.targets_covered.includes("unfundedPensionLiability"))
      || pensionEnrichments.length !== 1
      || equityBridge?.pension_claim_reconciliation?.passed !== true
      || equityBridge.pension_claim_reconciliation.source_backed !== true
      || cleanText(equityBridge.unfunded_pension_liability_basis) !== pensionBasis
      || cleanText(equityBridge.unfunded_pension_liability_source_id).toLowerCase() !== pensionSourceId
      || validDate(equityBridge.unfunded_pension_liability_as_of) !== pensionAsOf
      || !pensionRow
      || pensionRow.passed !== true
      || cleanText(pensionRow.basis).toLowerCase() !== "source_backed_pension_claim"
      || cleanText(pensionRow.source_id).toLowerCase() !== pensionSourceId
      || validDate(pensionRow.as_of) !== pensionAsOf
      || !closeEnough(pensionRow.current_value, pensionValue)
      || !closeEnough(pensionRow.calculated_value, pensionValue)
      || !closeEnough(pensionRow.provider_value, pensionValue)
      || !closeEnough(pensionRow.difference, 0)
      || !closeEnough(pensionRow.maximum_difference, 0)
    ) return false;
  }

  const equityMetricNames = new Map([
    ["cash", "cash_and_equivalents"],
    ["total_debt", "total_debt"],
    ["non_operating_investments", "non_operating_investments"],
    ["preferred_stock", "preferred_stock"],
    ["minority_interest", "minority_interest"],
    ["lease_liabilities_not_in_debt", "lease_liabilities_not_in_debt"],
    ["unfunded_pension_liability", "unfunded_pension_liability"],
  ]);
  for (const [rawMetric, bridgeMetric] of equityMetricNames) {
    if (!closeEnough(equityBridge[bridgeMetric], rawValues.get(rawMetric))) return false;
  }

  const cashSeparation = equityBridge.cash_separation;
  const cash = rawValues.get("cash");
  const investments = rawValues.get("non_operating_investments");
  const liquidAssets = cash + investments;
  const operatingReserve = cashSeparation?.operating_cash_reserve;
  if (!rawNumberInRange(operatingReserve, 0, liquidAssets)) return false;
  const expectedAssetsAdded = liquidAssets - operatingReserve;
  const expectedExcessCash = Math.max(0, cash - Math.min(cash, operatingReserve));
  const expectedObligations = rawValues.get("total_debt")
    + rawValues.get("preferred_stock")
    + rawValues.get("minority_interest")
    + rawValues.get("lease_liabilities_not_in_debt")
    + pensionValue;
  const allScenarioValuesMatch = (value, expected) => (
    value && typeof value === "object"
    && ["bear", "base", "bull"].every((scenario) => closeEnough(value[scenario], expected))
  );
  if (
    cashSeparation?.complete !== true
    || !closeEnough(cashSeparation.non_operating_investments, investments)
    || !closeEnough(cashSeparation.total_liquid_assets, liquidAssets)
    || !closeEnough(cashSeparation.excess_cash, expectedExcessCash)
    || !closeEnough(cashSeparation.excess_liquid_assets, expectedAssetsAdded)
    || !closeEnough(cashSeparation.assets_added_to_equity, expectedAssetsAdded)
    || !closeEnough(equityBridge.operating_cash_reserve, operatingReserve)
    || !closeEnough(equityBridge.excess_cash, expectedExcessCash)
    || !closeEnough(equityBridge.assets_added, expectedAssetsAdded)
    || !closeEnough(equityBridge.obligations_deducted, expectedObligations)
    || !allScenarioValuesMatch(equityBridge.scenario_obligations, expectedObligations)
    || !allScenarioValuesMatch(equityBridge.pension_scenario_obligations, pensionValue)
    || equityBridge?.pension_claim_reconciliation?.passed !== true
    || !Array.isArray(equityBridge.missing_optional_fields)
    || equityBridge.missing_optional_fields.length !== 0
    || !Array.isArray(equityBridge.unresolved_claims)
    || equityBridge.unresolved_claims.length !== 0
    || !closeEnough(equityBridge.uncertainty_upper_bound, 0)
  ) return false;

  return true;
}

function publicDecisionReadyEvidenceIsBacked(bundle, {
  priceContext,
  presentation,
  expectedTicker,
  now = Date.now(),
} = {}) {
  const coverageRecords = [bundle?.sources?.coverage, bundle?.audit?.coverage].filter((coverage) => (
    coverage && typeof coverage === "object" && Object.keys(coverage).length > 0
  ));
  if (
    priceContext?.price_context !== "validated"
    || cleanText(bundle?.audit?.status).toLowerCase() !== "pass"
    || (Array.isArray(bundle?.audit?.findings) ? bundle.audit.findings.length : 0) !== 0
    || !hasCompleteDecisionReadyCoverage(coverageRecords)
  ) {
    return false;
  }
  const financialEvidence = publicFinancialEvidenceContext({
    valuation: bundle?.valuation,
    financials: bundle?.financials,
    dataPoints: bundle?.sources?.data_points,
    sourceRecords: bundle?.sources?.records,
    expectedTicker,
    now,
  });
  if (!financialEvidence) return false;
  const { pointMap, sourceRecordMap } = financialEvidence;
  if ([...PUBLIC_DECISION_READY_REQUIRED_METRICS].some((metric) => !pointMap.has(metric))) return false;
  const derived = (metric) => {
    const point = pointMap.get(metric);
    const tag = cleanText(point?.claim_tag).toLowerCase();
    return point && ["calculated_metric", "assumption"].includes(tag) && Boolean(cleanText(point.formula));
  };
  for (const metric of PUBLIC_DECISION_READY_REQUIRED_METRICS) {
    if (!canonicalDecisionMetricValue(metric, pointMap.get(metric)?.normalized_value)) return false;
  }
  const sourcedRequirements = new Map([
    ["company_profile", "fmp:profile"],
    ["current_price", "fmp:quote"],
    ["latest_sec_filing", "sec:submissions"],
  ]);
  for (const [metric, sourceId] of sourcedRequirements) {
    const point = pointMap.get(metric);
    if (
      cleanText(point?.claim_tag).toLowerCase() !== "sourced_fact"
      || cleanText(point?.source_id).toLowerCase() !== sourceId
      || !sourceRecordIsFreshAndOk(sourceRecordMap, sourceId, {
        now,
        maximumAgeMs: sourceId === "fmp:quote" ? MARKET_DATA_MAX_AGE_MS : EVIDENCE_RETRIEVAL_MAX_AGE_MS,
      })
    ) return false;
    if (sourceId === "sec:submissions" && !authenticSecSubmissionsRecord(sourceRecordMap.get(sourceId), expectedTicker)) {
      return false;
    }
    if (sourceId === "fmp:profile" && !authenticFmpRecord(sourceRecordMap.get(sourceId), sourceId, expectedTicker)) {
      return false;
    }
  }
  const derivedMetrics = [...PUBLIC_DECISION_READY_REQUIRED_METRICS]
    .filter((metric) => !sourcedRequirements.has(metric));
  if (derivedMetrics.some((metric) => !derived(metric))) return false;
  const central = numberOrNull(pointMap.get("valuation_range_central")?.normalized_value);
  const lowPoint = pointMap.get("valuation_range_low");
  const highPoint = pointMap.get("valuation_range_high");
  const low = lowPoint?.normalized_value;
  const high = highPoint?.normalized_value;
  const currentPrice = numberOrNull(pointMap.get("current_price")?.normalized_value);
  const wacc = boundedFiniteNumber(pointMap.get("wacc")?.normalized_value, 0.02, 0.50);
  const terminalGrowth = boundedFiniteNumber(pointMap.get("terminal_growth")?.normalized_value, -0.10, 0.20);
  const reverseStatus = cleanText(pointMap.get("reverse_dcf_status")?.normalized_value).toLowerCase();
  return Boolean(
    central !== null
    && canonicalDecisionMetricValue("valuation_range_low", low)
    && canonicalDecisionMetricValue("valuation_range_high", high)
    && derived("valuation_range_low")
    && derived("valuation_range_high")
    && low <= central
    && central <= high
    && strictRelativeDifference(low, presentation?.range?.low) <= 1e-8
    && rawNumberInRange(presentation?.range?.central, 0.000001, 1e12)
    && strictRelativeDifference(central, presentation.range.central) <= 1e-8
    && strictRelativeDifference(high, presentation?.range?.high) <= 1e-8
    && currentPrice !== null
    && relativeDifference(currentPrice, priceContext.reference_price) <= 1e-8
    && wacc !== null
    && terminalGrowth !== null
    && terminalGrowth < wacc
    && ["solved", "above_range", "below_range"].includes(reverseStatus)
  );
}

function publicMarketRequirementEvidenceIsBacked({
  raw,
  dataPoints,
  sourceRecords,
  priceContext,
  status,
  impliedRevenueCagr,
  normalizedCashFlowMargin,
  discountRate,
  terminalGrowth,
  assetsAdded,
  obligationsDeducted,
  now = Date.now(),
}) {
  const pointCandidates = new Map();
  for (const point of (Array.isArray(dataPoints) ? dataPoints : [])) {
    const metric = cleanText(point?.metric).toLowerCase();
    if (!metric) continue;
    const candidates = pointCandidates.get(metric) || [];
    candidates.push(point);
    pointCandidates.set(metric, candidates);
  }
  const pointFor = (metric) => {
    const candidates = pointCandidates.get(metric) || [];
    return candidates.length === 1 ? candidates[0] : null;
  };
  const sourceRecordMap = uniqueRawSourceRecordMap(sourceRecords);
  if (!sourceRecordMap) return false;
  const derivedPoint = (metric, allowedTags = ["calculated_metric", "assumption"]) => {
    const point = pointFor(metric);
    const tag = cleanText(point?.claim_tag).toLowerCase();
    return point && allowedTags.includes(tag) && Boolean(cleanText(point.formula));
  };
  const pointNumberMatches = (metric, expected) => {
    const observed = boundedFiniteNumber(pointFor(metric)?.normalized_value, -1e18, 1e18);
    return observed !== null
      && Math.abs(observed - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-8);
  };
  const latestRevenue = boundedFiniteNumber(pointFor("latest_revenue")?.normalized_value, 0.000001, 1e18);
  const latestShares = boundedFiniteNumber(pointFor("latest_diluted_shares")?.normalized_value, 0.000001, 1e15);
  const ttmRevenuePoint = pointFor("financials.ttm.revenue");
  const ttmSharesPoint = pointFor("financials.ttm.diluted_shares");
  const ttmRevenue = boundedFiniteNumber(ttmRevenuePoint?.normalized_value, 0.000001, 1e18);
  const ttmShares = boundedFiniteNumber(ttmSharesPoint?.normalized_value, 0.000001, 1e15);
  const ttmRevenueSources = new Set((Array.isArray(ttmRevenuePoint?.source_ids) ? ttmRevenuePoint.source_ids : [])
    .map((sourceId) => cleanText(sourceId).toLowerCase()));
  const ttmSharesSources = new Set((Array.isArray(ttmSharesPoint?.source_ids) ? ttmSharesPoint.source_ids : [])
    .map((sourceId) => cleanText(sourceId).toLowerCase()));
  const bridgeAssetsSources = new Set((Array.isArray(pointFor("market_requirement_assets_added")?.source_ids)
    ? pointFor("market_requirement_assets_added").source_ids
    : []).map((sourceId) => cleanText(sourceId).toLowerCase()));
  const bridgeObligationsSources = new Set((Array.isArray(pointFor("market_requirement_obligations_deducted")?.source_ids)
    ? pointFor("market_requirement_obligations_deducted").source_ids
    : []).map((sourceId) => cleanText(sourceId).toLowerCase()));
  const currentPricePoint = pointFor("current_price");
  const currentPriceSource = cleanText(currentPricePoint?.source_id).toLowerCase();
  const statusPoint = pointFor("reverse_dcf_status");
  return Boolean(
    latestRevenue !== null
    && latestRevenue > 0
    && derivedPoint("latest_revenue", ["calculated_metric"])
    && latestShares !== null
    && latestShares > 0
    && derivedPoint("latest_diluted_shares", ["calculated_metric"])
    && ttmRevenue !== null
    && ttmRevenue === latestRevenue
    && cleanText(ttmRevenuePoint?.claim_tag).toLowerCase() === "calculated_metric"
    && Boolean(cleanText(ttmRevenuePoint?.formula))
    && ttmRevenueSources.has("fmp:income:quarterly")
    && ttmRevenueSources.has("sec:companyfacts:income")
    && ttmShares !== null
    && ttmShares === latestShares
    && cleanText(ttmSharesPoint?.claim_tag).toLowerCase() === "calculated_metric"
    && Boolean(cleanText(ttmSharesPoint?.formula))
    && ttmSharesSources.has("fmp:income:quarterly")
    && ttmSharesSources.has("sec:companyfacts:income")
    && sourceRecordIsFreshAndOk(sourceRecordMap, "fmp:income:quarterly", { now })
    && sourceRecordIsFreshAndOk(sourceRecordMap, "sec:companyfacts:income", { now })
    && cleanText(currentPricePoint?.claim_tag).toLowerCase() === "sourced_fact"
    && currentPriceSource === "fmp:quote"
    && sourceRecordIsFreshAndOk(sourceRecordMap, currentPriceSource, {
      now,
      maximumAgeMs: MARKET_DATA_MAX_AGE_MS,
    })
    && pointNumberMatches("current_price", priceContext.reference_price)
    && derivedPoint("wacc")
    && pointNumberMatches("wacc", discountRate)
    && derivedPoint("terminal_growth")
    && pointNumberMatches("terminal_growth", terminalGrowth)
    && derivedPoint("market_requirement_normalized_margin")
    && pointNumberMatches("market_requirement_normalized_margin", normalizedCashFlowMargin)
    && derivedPoint("market_requirement_assets_added", ["calculated_metric"])
    && pointNumberMatches("market_requirement_assets_added", assetsAdded)
    && bridgeAssetsSources.has("fmp:balance:quarterly")
    && bridgeAssetsSources.has("fmp:balance:ttm")
    && sourceRecordIsFreshAndOk(sourceRecordMap, "fmp:balance:quarterly", { now })
    && sourceRecordIsFreshAndOk(sourceRecordMap, "fmp:balance:ttm", { now })
    && derivedPoint("market_requirement_obligations_deducted", ["calculated_metric"])
    && pointNumberMatches("market_requirement_obligations_deducted", obligationsDeducted)
    && bridgeObligationsSources.has("fmp:balance:quarterly")
    && bridgeObligationsSources.has("fmp:balance:ttm")
    && cleanText(statusPoint?.claim_tag).toLowerCase() === "calculated_metric"
    && Boolean(cleanText(statusPoint?.formula))
    && cleanText(statusPoint?.normalized_value).toLowerCase() === status
    && (
      status !== "solved"
      || (
        derivedPoint("market_requirement_implied_revenue_cagr")
        && pointNumberMatches("market_requirement_implied_revenue_cagr", impliedRevenueCagr)
      )
    )
    && cleanText(raw?.price_context).toLowerCase() === (
      priceContext.price_context === "validated" ? "validated" : "provider_reconciled"
    )
  );
}

function sanitizePublicMarketRequirements(valuation, {
  audit = null,
  coverage = null,
  dataPoints = [],
  sourceRecords = [],
  financials = null,
  expectedTicker = null,
  now = Date.now(),
} = {}) {
  if (!valuation || typeof valuation !== "object") return null;
  const bridge = valuation.structural_scale_bridge;
  const equityBridge = valuation.equity_bridge;
  const blockers = Array.isArray(valuation?.reliability?.decision_ready_blockers)
    ? valuation.reliability.decision_ready_blockers
    : [];
  if (
    cleanText(valuation.status).toLowerCase() !== "not_decision_ready"
    || !bridge
    || typeof bridge !== "object"
    || bridge.passed !== false
    || bridge.scale_inputs_reconciled !== true
    || bridge.equity_bridge_inputs_reconciled !== true
    || !equityBridge
    || typeof equityBridge !== "object"
    || equityBridge.exact !== true
    || equityBridge.complete !== true
    || equityBridge.calculation_complete !== true
    || equityBridge?.cash_separation?.complete !== true
    || (Array.isArray(bridge.missing) && bridge.missing
      .map((item) => cleanText(item).toLowerCase())
      .some((item) => [
        "ttm_scale_inputs_reconciliation",
        "ttm_equity_bridge_reconciliation",
        "currency_consistency",
        "equity_bridge_completeness",
      ].includes(item)))
    || !marketRequirementAuditIsSafe(audit)
    || !blockers.includes("structural_scale_bridge")
    || hasFatalAuditFinding(audit)
    || !hasSufficientMarketRequirementCoverage(coverage)
  ) {
    return null;
  }
  const priceContext = publicMarketPriceContext(valuation, { now, sourceRecords, expectedTicker });
  if (!priceContext) return null;
  const financialEvidence = publicFinancialEvidenceContext({
    valuation,
    financials,
    dataPoints,
    sourceRecords,
    expectedTicker,
    now,
  });
  if (!financialEvidence) return null;
  if (!publicEquityBridgeReconciliationIsBacked({
    valuation,
    financials,
    dataPoints,
    sourceRecords,
    financialEvidence,
    expectedTicker,
    now,
  })) return null;
  const currency = validCurrency(valuation.currency);
  if (!currency) return null;
  const raw = valuation.market_requirements;
  if (!raw || typeof raw !== "object" || raw.available !== true) return null;
  const status = cleanText(raw.status).toLowerCase();
  if (!["solved", "above_range", "below_range"].includes(status)) return null;
  const rawReferencePrice = boundedFiniteNumber(raw.reference_price, 0.000001, 1e9);
  const rawMarketDate = validDate(raw.market_data_as_of);
  const rawCurrency = validCurrency(raw.currency);
  if (
    rawReferencePrice === null
    || Math.abs(rawReferencePrice - priceContext.reference_price) > Math.max(1e-9, priceContext.reference_price * 1e-8)
    || rawMarketDate !== priceContext.market_data_as_of
    || rawCurrency !== currency
  ) {
    return null;
  }
  const impliedRevenueCagr = boundedFiniteNumber(raw.implied_revenue_cagr, -0.25, 1);
  const expectedBound = PUBLIC_MARKET_REQUIREMENT_BOUNDS[status] || null;
  const bound = cleanText(raw.implied_revenue_cagr_bound) === expectedBound ? expectedBound : null;
  if ((status === "solved" && impliedRevenueCagr === null) || (status !== "solved" && bound === null)) return null;
  const normalizedCashFlowMargin = boundedFiniteNumber(raw.normalized_margin, -1, 1);
  const discountRate = boundedFiniteNumber(raw.discount_rate, 0.02, 0.50);
  const terminalGrowth = boundedFiniteNumber(raw.terminal_growth, -0.10, 0.20);
  const assetsAdded = boundedFiniteNumber(raw.assets_added, 0, 1e18);
  const obligationsDeducted = boundedFiniteNumber(raw.obligations_deducted, 0, 1e18);
  const bridgeAssetsAdded = boundedFiniteNumber(equityBridge.assets_added, 0, 1e18);
  const bridgeObligationsDeducted = boundedFiniteNumber(equityBridge.obligations_deducted, 0, 1e18);
  const horizonYears = boundedFiniteNumber(raw.horizon_years, 1, 10);
  if (
    normalizedCashFlowMargin === null
    || discountRate === null
    || terminalGrowth === null
    || assetsAdded === null
    || obligationsDeducted === null
    || bridgeAssetsAdded === null
    || bridgeObligationsDeducted === null
    || Math.abs(assetsAdded - bridgeAssetsAdded) > Math.max(1e-9, Math.abs(bridgeAssetsAdded) * 1e-8)
    || Math.abs(obligationsDeducted - bridgeObligationsDeducted) > Math.max(1e-9, Math.abs(bridgeObligationsDeducted) * 1e-8)
    || terminalGrowth >= discountRate
    || !Number.isInteger(horizonYears)
    || horizonYears < 1
    || horizonYears > 10
  ) {
    return null;
  }
  if (!publicMarketRequirementEvidenceIsBacked({
    raw,
    dataPoints,
    sourceRecords,
    priceContext,
    status,
    impliedRevenueCagr,
    normalizedCashFlowMargin,
    discountRate,
    terminalGrowth,
    assetsAdded,
    obligationsDeducted,
    now,
  })) return null;
  return {
    available: true,
    status,
    implied_revenue_cagr: status === "solved" ? impliedRevenueCagr : null,
    bound: status === "solved" ? null : bound,
    normalized_cash_flow_margin: normalizedCashFlowMargin,
    discount_rate: discountRate,
    terminal_growth: terminalGrowth,
    horizon_years: horizonYears,
    assets_added: assetsAdded,
    obligations_deducted: obligationsDeducted,
    currency,
    ...priceContext,
  };
}

function sanitizeUnbackedValuation(value, { researchRangeVisible = false, contextualPrice = null } = {}) {
  const valuation = value && typeof value === "object" ? value : {};
  const rawReliability = sanitizedReliability(valuation.reliability);
  const safeContextualPrice = numberOrNull(contextualPrice);
  const blockingState = sanitizePublicBlockingState(valuation);
  const blockedFallback = PUBLIC_VALUATION_REASONS.valuation_not_decision_ready;
  return {
    model_version: valuation.model_version === INSTITUTIONAL_MODEL_VERSION ? INSTITUTIONAL_MODEL_VERSION : null,
    available: valuation.available === true,
    status: canonicalValuationStatus(valuation.status),
    archetype: canonicalArchetype(valuation.archetype),
    primary_method: canonicalPrimaryMethod(valuation.primary_method),
    cash_flow_basis: canonicalCashFlowBasis(valuation.cash_flow_basis),
    currency: validCurrency(valuation.currency),
    market_data_as_of: validDate(valuation.market_data_as_of),
    financial_data_as_of: validDate(valuation.financial_data_as_of),
    current_price: safeContextualPrice !== null && safeContextualPrice > 0 ? safeContextualPrice : null,
    reason: researchRangeVisible
      ? PUBLIC_VALUATION_REASONS.valuation_research_grade
      : safeInternalValuationReason(valuation.reason, blockedFallback),
    blocking_gap: blockingState?.blocking_gap || null,
    pending_checks: blockingState?.pending_checks || [],
    precision_withheld: true,
    range: safeResearchRange(valuation.range, researchRangeVisible),
    selected_value: null,
    scenarios: [],
    methods: [],
    reverse_dcf: {
      available: false,
      status: "withheld",
      reason: "El cálculo inverso permanece retenido hasta validar precio y método.",
      bound: null,
      weight: 0,
      implied_revenue_cagr: null,
      current_price: null,
      value_at_floor: null,
      value_at_ceiling: null,
    },
    multiples: null,
    price_validation: sanitizedPriceValidation(valuation.price_validation),
    equity_bridge: sanitizeEquityBridgeSummary(valuation.equity_bridge),
    cycle_normalization: sanitizeCycleNormalizationSummary(
      valuation.cycle_normalization,
      valuation.cycle_revenue_normalization,
    ),
    driver_summary: null,
    market_requirements: null,
    reliability: {
      usable: researchRangeVisible,
      status: researchRangeVisible ? "medium" : "blocked",
      score: rawReliability.score,
      reasons: researchRangeVisible ? ["Rango orientativo disponible para investigación."] : [],
      limitations: ["No se publica un valor central hasta completar precio independiente, método y auditoría."],
    },
  };
}

function sanitizeUnbackedDataPoints(value, { visibleCurrentPrice = null } = {}) {
  if (!Array.isArray(value)) return [];
  const allowedCurrentPrice = numberOrNull(visibleCurrentPrice);
  return value.map((point) => {
    const metric = cleanText(point?.metric);
    const normalized = normalizedMetric(metric);
    const currentPriceMetric = normalized === "currentprice";
    const currentPriceVisible = currentPriceMetric && allowedCurrentPrice !== null && allowedCurrentPrice > 0;
    const sensitive = SENSITIVE_VALUATION_METRIC.test(normalized) || (currentPriceMetric && !currentPriceVisible);
    return {
      metric,
      raw_value: sensitive
        ? null
        : currentPriceVisible
          ? allowedCurrentPrice
          : (typeof point?.raw_value === "number" || typeof point?.raw_value === "string" ? point.raw_value : null),
      normalized_value: sensitive
        ? null
        : currentPriceVisible
          ? allowedCurrentPrice
          : numberOrNull(point?.normalized_value),
      unit: cleanText(point?.unit) || null,
      source_id: cleanText(point?.source_id) || null,
      claim_tag: sensitive ? "uncertainty" : cleanText(point?.claim_tag) || null,
      formula: sensitive ? "exact value withheld until all valuation reliability gates pass" : cleanText(point?.formula) || null,
    };
  });
}

function sanitizeUnbackedReport(_markdown, ticker, researchRangeVisible) {
  return [
    `# ${ticker || "Análisis"}`,
    "",
    "## Estado de la valoración",
    researchRangeVisible
      ? "Se pudo construir un rango orientativo para investigación. El valor central no se publica porque aún faltan controles independientes."
      : "No se publican cifras de valoración porque los datos o el método todavía requieren revisión.",
    "",
    "No decide por ti. Ordena la información disponible y deja visibles sus límites.",
    "",
  ].join("\n");
}

function sanitizeCoverage(value) {
  const coverage = value && typeof value === "object" ? value : {};
  return {
    score: numberOrNull(coverage.score),
    status: cleanText(coverage.status) || null,
    expected_metrics: numberOrNull(coverage.expected_metrics),
    covered_expected_metrics: numberOrNull(coverage.covered_expected_metrics),
    source_backed_points: numberOrNull(coverage.source_backed_points),
    missing_expected_metrics: cleanTextList(coverage.missing_expected_metrics, 24),
    sourced_points_missing_ok_source: cleanTextList(coverage.sourced_points_missing_ok_source, 24),
    calculated_points_missing_formula: cleanTextList(coverage.calculated_points_missing_formula, 24),
    statement_source_provider: cleanText(coverage.statement_source_provider) || null,
    statement_authority: cleanText(coverage.statement_authority) || null,
    sec_metadata_available: coverage.sec_metadata_available === true,
  };
}

function sanitizeSourceRecords(value) {
  return (Array.isArray(value) ? value : []).map((record) => ({
    source_id: cleanText(record?.source_id) || null,
    provider: cleanText(record?.provider) || null,
    endpoint_or_filing: cleanText(record?.endpoint_or_filing) || null,
    retrieved_at: validDate(record?.retrieved_at),
    status: cleanText(record?.status) || null,
    error: cleanText(record?.error) || null,
    row_count: numberOrNull(record?.row_count),
  }));
}

function sanitizeAudit(value, coverage) {
  const audit = value && typeof value === "object" ? value : {};
  const findings = (Array.isArray(audit.findings) ? audit.findings : []).map((finding) => {
    const code = cleanText(finding?.code).toLowerCase() || "review_required";
    return {
      severity: cleanText(finding?.severity).toLowerCase() || "medium",
      code,
      message: code === "valuation_not_decision_ready"
        ? "La valoración todavía no supera todos los controles para publicar un valor central."
        : code === "valuation_research_grade"
          ? "El rango sirve para investigar, pero aún falta confirmar la estimación central y cerrar los datos pendientes."
          : `El control ${code.replaceAll("_", " ")} requiere revisión.`,
    };
  });
  return {
    generated_at: validDate(audit.generated_at),
    status: cleanText(audit.status).toLowerCase() || (findings.length ? "needs_attention" : "pending"),
    coverage,
    findings,
  };
}

const PUBLIC_AUDIT_STATUSES = new Set(["pass", "needs_attention", "pending", "blocked", "error"]);
const PUBLIC_AUDIT_SEVERITIES = new Set(["info", "low", "medium", "high", "critical", "fatal"]);
const PUBLIC_AUDIT_CODES = new Set([
  "missing_financials",
  "provider_error",
  "provider_unavailable",
  "sec_edgar_unavailable",
  "filing_reconciliation_mismatch",
  "filing_reconciliation_missing",
  "valuation_unavailable",
  "valuation_research_grade",
  "valuation_not_decision_ready",
  "price_validation_blocked",
  "share_denominator_mismatch",
  "terminal_value_dominates",
  "reverse_dcf_outside_range",
  "missing_source",
  "evidence_coverage_gap",
  "sourced_point_without_ok_source",
  "formula_missing",
  "backend_unavailable",
  "missing_ticker",
]);
const PUBLIC_AUDIT_MESSAGES = Object.freeze({
  valuation_not_decision_ready: "La valoración todavía no supera todos los controles para publicar un valor central.",
  valuation_research_grade: "El rango sirve para investigar, pero aún falta confirmar la estimación central y cerrar los datos pendientes.",
  price_validation_blocked: "El precio de mercado requiere validación antes de usarlo en la valoración.",
  share_denominator_mismatch: "El número de acciones requiere conciliación antes de publicar una cifra por acción.",
  evidence_coverage_gap: "Faltan datos o fuentes necesarios para completar la revisión.",
  missing_financials: "Faltan estados financieros necesarios para completar la revisión.",
});

function sanitizePublicAudit(value, coverage) {
  const audit = value && typeof value === "object" ? value : {};
  const findings = (Array.isArray(audit.findings) ? audit.findings : []).slice(0, 64).map((finding) => {
    const rawCode = cleanText(finding?.code).toLowerCase();
    const code = PUBLIC_AUDIT_CODES.has(rawCode) ? rawCode : "review_required";
    const rawSeverity = cleanText(finding?.severity).toLowerCase();
    const severity = PUBLIC_AUDIT_SEVERITIES.has(rawSeverity) ? rawSeverity : "medium";
    return {
      severity,
      code,
      message: PUBLIC_AUDIT_MESSAGES[code] || "Un control de datos requiere revisión.",
    };
  });
  const requestedStatus = cleanText(audit.status).toLowerCase();
  let status = PUBLIC_AUDIT_STATUSES.has(requestedStatus)
    ? requestedStatus
    : findings.length
      ? "needs_attention"
      : "pending";
  if (status === "pass" && findings.length) status = "needs_attention";
  return {
    generated_at: validDate(audit.generated_at),
    status,
    coverage,
    findings,
  };
}

const PUBLIC_SECTOR_LABELS = new Map([
  ["technology", "Tecnología"],
  ["financial services", "Servicios financieros"],
  ["healthcare", "Salud"],
  ["consumer cyclical", "Consumo cíclico"],
  ["consumer defensive", "Consumo defensivo"],
  ["industrials", "Industriales"],
  ["energy", "Energía"],
  ["basic materials", "Materiales básicos"],
  ["communication services", "Servicios de comunicación"],
  ["utilities", "Servicios públicos"],
  ["real estate", "Bienes raíces"],
]);
const PUBLIC_INDUSTRY_LABELS = new Map([
  ["semiconductors", "Semiconductores"],
  ["semiconductor equipment & materials", "Equipos y materiales para semiconductores"],
  ["software - application", "Software de aplicaciones"],
  ["software - infrastructure", "Software de infraestructura"],
  ["banks - diversified", "Banca diversificada"],
  ["banks - regional", "Banca regional"],
  ["biotechnology", "Biotecnología"],
  ["medical devices", "Dispositivos médicos"],
  ["internet retail", "Comercio electrónico"],
  ["auto manufacturers", "Fabricantes de automóviles"],
  ["oil & gas integrated", "Petróleo y gas integrados"],
  ["aerospace & defense", "Aeroespacio y defensa"],
  ["consumer electronics", "Electrónica de consumo"],
  ["credit services", "Servicios de crédito"],
  ["asset management", "Gestión de activos"],
]);

function canonicalPublicTaxonomyLabel(value, labels, fallback) {
  const text = cleanText(value);
  if (!text) return null;
  return labels.get(text.toLowerCase()) || fallback;
}

function sanitizePublicCompanyProfile(value) {
  const profile = value && typeof value === "object" ? value : {};
  return {
    name: safePublicText(profile.name || profile.companyName, { maxLength: 120 }),
    sector: canonicalPublicTaxonomyLabel(profile.sector, PUBLIC_SECTOR_LABELS, "Otro sector"),
    industry: canonicalPublicTaxonomyLabel(profile.industry, PUBLIC_INDUSTRY_LABELS, "Otra industria"),
    country: safePublicText(profile.country, { maxLength: 80 }),
    currency: validCurrency(profile.currency),
    exchange: safePublicText(profile.exchange || profile.exchangeShortName, { maxLength: 48 }),
    beta: boundedFiniteNumber(profile.beta, -20, 20),
    market_cap: boundedFiniteNumber(profile.market_cap ?? profile.marketCap, 0, 1e18),
    description: null,
  };
}

function sanitizeCompanyProfile(value) {
  const profile = value && typeof value === "object" ? value : {};
  return {
    name: cleanText(profile.name || profile.companyName) || null,
    sector: cleanText(profile.sector) || null,
    industry: cleanText(profile.industry) || null,
    country: cleanText(profile.country) || null,
    currency: validCurrency(profile.currency),
    exchange: cleanText(profile.exchange || profile.exchangeShortName) || null,
    beta: numberOrNull(profile.beta),
    market_cap: numberOrNull(profile.market_cap ?? profile.marketCap),
    description: null,
  };
}

function sanitizeUnbackedHistory(history) {
  if (!history || typeof history !== "object") return null;
  return {
    run_count: Math.max(0, Number(history.run_count || 0)),
    latest_run_at: validDate(history.latest_run_at),
    delta: {
      comparable: false,
      reason: "Los cambios de valoración se retienen hasta que ambas corridas superen todos los controles.",
      changes: [],
      valuation: {
        comparable: false,
        reason: "Los cambios de valoración se retienen hasta que ambas corridas superen todos los controles.",
        current: null,
        previous: null,
      },
    },
  };
}

export function sanitizeResearchPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const valuationContext = buildDownstreamValuationContext(payload);
  const backed = valuationContext.backed === true;
  if (backed) {
    const reportMarkdown = sanitizeReportMarkdown(payload.report_markdown, payload.ticker);
    return {
      ...payload,
      report_markdown: reportMarkdown,
      downloads: updateReportDownload(Array.isArray(payload.downloads) ? payload.downloads : [], payload.ticker, reportMarkdown),
    };
  }

  const presentation = buildEquityValuationPresentation(payload);
  const researchRangeVisible = presentation.state === "research_grade"
    && presentation.showValuationFigures === true
    && !hasFatalAuditFinding(payload.audit);
  const valuation = sanitizeUnbackedValuation(payload.valuation, {
    researchRangeVisible,
    contextualPrice: presentation.currentPrice,
  });
  const rawSources = payload.sources && typeof payload.sources === "object" ? payload.sources : {};
  const coverage = sanitizePublicCoverage(rawSources.coverage || payload?.audit?.coverage);
  const safeContext = {
    ...valuationContext,
    backed: false,
    figures_withheld: true,
    range: null,
    current_price: null,
    reverse_dcf: null,
    multiples: null,
    reason: valuation.reason,
    reliability: valuation.reliability,
    price_validation: valuation.price_validation,
  };
  const withheldFinal = {
    enabled: false,
    status: "withheld",
    reason: "valuation_not_decision_ready",
    model: null,
    runtime: null,
    call_budget: { max_calls: 1, actual_calls: 0 },
    valuation: safeContext,
    analysis: {
      executive_judgment: "",
      strongest_points: [],
      red_team: [],
      open_questions: ["Validar datos, método y precio antes de emitir una conclusión de valoración."],
    },
  };
  const sources = {
    coverage,
    records: sanitizePublicSourceRecords(rawSources.records),
    data_points: sanitizePublicDataPoints(rawSources.data_points, {
      currency: valuation.currency,
      visibleCurrentPrice: presentation.currentPrice,
    }),
    claims: [],
    agent_outputs: { final_orchestrator: withheldFinal },
  };
  const agents = {
    agents: [],
    claims: [],
    final_orchestrator: withheldFinal,
  };
  const reportMarkdown = sanitizeReportMarkdown(
    sanitizeUnbackedReport(payload.report_markdown, payload.ticker, researchRangeVisible),
    payload.ticker,
  );
  const audit = sanitizeAudit(payload.audit, coverage);
  const assumptionsYml = "assumptions: {}\n";
  const ticker = cleanTicker(payload.ticker) || "ticker";
  const downloads = [
    textDownload(`${ticker}_report.md`, "text/markdown", reportMarkdown),
    textDownload(`${ticker}_sources.json`, "application/json", JSON.stringify(sources, null, 2)),
    textDownload(`${ticker}_audit.json`, "application/json", JSON.stringify(audit, null, 2)),
    textDownload(`${ticker}_assumptions.yml`, "application/yaml", assumptionsYml),
  ];
  return {
    ok: payload.ok !== false,
    ticker,
    mode: cleanText(payload.mode) || null,
    generated_at: validDate(payload.generated_at),
    company_profile: sanitizeCompanyProfile(payload.company_profile),
    financials: payload.financials && typeof payload.financials === "object"
      ? {
        annual: Array.isArray(payload.financials.annual) ? payload.financials.annual : [],
        ratios: payload.financials.ratios && typeof payload.financials.ratios === "object" ? payload.financials.ratios : {},
        quality_flags: [],
      }
      : { annual: [], ratios: {}, quality_flags: [] },
    valuation,
    report_markdown: reportMarkdown,
    sources,
    agents,
    audit,
    checklist_score: payload.checklist_score && typeof payload.checklist_score === "object" ? payload.checklist_score : {},
    assumptions: {},
    assumptions_yml: assumptionsYml,
    artifacts: {
      report_md: true,
      model_xlsx: false,
      sources_json: true,
      audit_json: true,
      assumptions_yml: true,
      note: "El modelo descargable permanece retenido hasta completar todos los controles de valoración.",
    },
    downloads,
    history: sanitizeUnbackedHistory(payload.history),
  };
}

const PUBLIC_FINANCIAL_PERIODS = new Set(["FY", "Q1", "Q2", "Q3", "Q4", "TTM"]);
const PUBLIC_QUALITY_SEVERITIES = new Set(["info", "low", "medium", "high", "critical"]);
const PUBLIC_QUALITY_FLAG_TITLES = new Map([
  ["receivables growing faster than revenue", "Cuentas por cobrar crecen más rápido que los ingresos"],
  ["receivables_growing_faster_than_revenue", "Cuentas por cobrar crecen más rápido que los ingresos"],
  ["inventory growing faster than cogs", "Inventarios crecen más rápido que el costo de ventas"],
  ["inventory_growing_faster_than_cogs", "Inventarios crecen más rápido que el costo de ventas"],
  ["cash conversion below earnings quality threshold", "Conversión de caja por debajo del umbral de calidad"],
  ["cash_conversion_below_earnings_quality_threshold", "Conversión de caja por debajo del umbral de calidad"],
  ["high goodwill and intangible asset intensity", "Alta proporción de goodwill e intangibles"],
  ["high_goodwill_and_intangible_asset_intensity", "Alta proporción de goodwill e intangibles"],
  ["share count creep", "Aumento gradual del número de acciones"],
  ["share_count_creep", "Aumento gradual del número de acciones"],
  ["negative fcf despite positive earnings", "Flujo de caja libre negativo pese a utilidades positivas"],
  ["negative_fcf_despite_positive_earnings", "Flujo de caja libre negativo pese a utilidades positivas"],
]);

function canonicalPublicQualityTitle(flag) {
  const candidates = [flag?.code, flag?.key, flag?.title, flag?.metric_name]
    .map((value) => cleanText(value).toLowerCase())
    .filter(Boolean);
  for (const candidate of candidates) {
    const label = PUBLIC_QUALITY_FLAG_TITLES.get(candidate);
    if (label) return label;
  }
  return "Control de calidad pendiente";
}

function sanitizePublicFinancials(value) {
  const financials = value && typeof value === "object" ? value : {};
  const ratios = financials.ratios && typeof financials.ratios === "object" ? financials.ratios : {};
  const ratioKeys = [
    "latest_revenue",
    "latest_fcf",
    "revenue_cagr_5y",
    "fcf_margin",
    "roic",
  ];
  return {
    annual: (Array.isArray(financials.annual) ? financials.annual : []).slice(0, 12).map((row) => {
      const period = cleanText(row?.period).toUpperCase();
      const fiscalYear = numberOrNull(row?.fiscal_year);
      return {
        date: validDate(row?.date),
        period: PUBLIC_FINANCIAL_PERIODS.has(period) ? period : null,
        fiscal_year: Number.isInteger(fiscalYear) && fiscalYear >= 1900 && fiscalYear <= 2200 ? fiscalYear : null,
      };
    }),
    ratios: Object.fromEntries(ratioKeys.map((key) => [key, numberOrNull(ratios[key])])),
    quality_flags: (Array.isArray(financials.quality_flags) ? financials.quality_flags : []).slice(0, 24).map((flag) => ({
      severity: PUBLIC_QUALITY_SEVERITIES.has(cleanText(flag?.severity).toLowerCase())
        ? cleanText(flag?.severity).toLowerCase()
        : "info",
      title: canonicalPublicQualityTitle(flag),
      metric: numberOrNull(flag?.metric),
    })),
  };
}

const PUBLIC_SOURCE_ID_ALIASES = new Map([
  ["fmp-profile", "fmp:profile"],
  ["fmp-quote", "fmp:quote"],
  ["fmp-prices", "fmp:prices"],
]);
const PUBLIC_SOURCE_ID_PATTERN = /^(?:fmp:(?:profile|quote|prices|analyst-estimates|key-metrics-ttm|ratios-ttm|shares-float|income:(?:annual|quarterly|ttm)|balance:(?:annual|quarterly|ttm)|cash-flow:(?:annual|quarterly|ttm))|yfinance:(?:profile|quote|prices|shares-float|income:(?:annual|quarterly)|balance:(?:annual|quarterly)|cash-flow:(?:annual|quarterly))|sec:(?:submissions|companyfacts:(?:income|balance|cash-flow|reconciliation))|market:independent-close)$/;
const PUBLIC_SOURCE_STATUSES = new Set(["ok", "partial", "unavailable", "stale", "error"]);
const PUBLIC_COVERAGE_STATUSES = new Set(["pass", "complete", "partial", "needs_attention", "blocked"]);
const PUBLIC_COVERAGE_METRICS = new Set([
  "company_profile",
  "latest_revenue",
  "latest_diluted_shares",
  "latest_free_cash_flow",
  "revenue_cagr_5y",
  "gross_margin",
  "operating_margin",
  "fcf_margin",
  "roic",
  "net_debt",
  "base_fcf_margin",
  "wacc",
  "terminal_growth",
  "current_price",
  "valuation_range_central",
  "reverse_dcf_status",
  "ev_to_sales",
  "price_to_fcf",
  "latest_sec_filing",
]);

function canonicalPublicSourceId(value) {
  const raw = cleanText(value).toLowerCase();
  const sourceId = PUBLIC_SOURCE_ID_ALIASES.get(raw) || raw;
  return PUBLIC_SOURCE_ID_PATTERN.test(sourceId) ? sourceId : null;
}

function publicProviderForSourceId(sourceId) {
  if (sourceId?.startsWith("fmp:")) return "FMP";
  if (sourceId?.startsWith("yfinance:")) return "Yahoo Finance";
  if (sourceId?.startsWith("sec:")) return "SEC EDGAR";
  if (sourceId === "market:independent-close") return "Cierre oficial de mercado";
  return null;
}

function canonicalPublicCoverageMetric(value) {
  const metric = cleanText(value).toLowerCase();
  if (PUBLIC_COVERAGE_METRICS.has(metric)) return metric;
  return publicMetricPolicy(metric)?.metric || null;
}

function boundedCoverageCount(value) {
  const count = numberOrNull(value);
  return Number.isInteger(count) && count >= 0 && count <= 10_000 ? count : null;
}

function sanitizePublicCoverage(value) {
  const coverage = value && typeof value === "object" ? value : {};
  const providerText = cleanText(coverage.statement_source_provider).toLowerCase();
  const statementSourceProvider = providerText === "yfinance"
    ? "Yahoo Finance"
    : /\bfmp\b|financial\s*modeling\s*prep/.test(providerText)
      ? /\bsec\b|edgar/.test(providerText) || providerText === "mixed"
        ? "FMP + SEC"
        : "FMP"
      : /\bsec\b|edgar/.test(providerText)
        ? "SEC EDGAR"
        : providerText === "mixed"
          ? "Fuentes financieras combinadas"
          : null;
  const secMetadataAvailable = coverage.sec_metadata_available === true;
  const safeMetricList = (items) => [...new Set((Array.isArray(items) ? items : [])
    .slice(0, 64)
    .map(canonicalPublicCoverageMetric)
    .filter(Boolean))].slice(0, 24);
  const score = boundedFiniteNumber(coverage.score, 0, 100);
  const status = cleanText(coverage.status).toLowerCase();
  return {
    score,
    status: PUBLIC_COVERAGE_STATUSES.has(status) ? status : null,
    expected_metrics: boundedCoverageCount(coverage.expected_metrics),
    covered_expected_metrics: boundedCoverageCount(coverage.covered_expected_metrics),
    source_backed_points: boundedCoverageCount(coverage.source_backed_points),
    missing_expected_metrics: safeMetricList(coverage.missing_expected_metrics),
    sourced_points_missing_ok_source: safeMetricList(coverage.sourced_points_missing_ok_source),
    calculated_points_missing_formula: safeMetricList(coverage.calculated_points_missing_formula),
    statement_source_provider: statementSourceProvider,
    statement_authority: statementSourceProvider === "FMP" && secMetadataAvailable
      ? "FMP con contraste de estados SEC"
      : statementSourceProvider === "FMP + SEC"
        ? "Estados normalizados con datos FMP y SEC"
        : statementSourceProvider === "Yahoo Finance"
          ? "Estados normalizados con datos de Yahoo Finance"
        : statementSourceProvider,
    sec_metadata_available: secMetadataAvailable,
  };
}

function sanitizePublicSourceRecords(value) {
  const records = [];
  const seen = new Set();
  for (const record of (Array.isArray(value) ? value : []).slice(0, 256)) {
    const sourceId = canonicalPublicSourceId(record?.source_id);
    if (!sourceId || seen.has(sourceId)) continue;
    const status = cleanText(record?.status).toLowerCase();
    const rowCount = numberOrNull(record?.row_count);
    seen.add(sourceId);
    records.push({
      source_id: sourceId,
      provider: publicProviderForSourceId(sourceId),
      endpoint_or_filing: null,
      retrieved_at: validDate(record?.retrieved_at),
      status: PUBLIC_SOURCE_STATUSES.has(status) ? status : null,
      row_count: Number.isInteger(rowCount) && rowCount >= 0 && rowCount <= 10_000_000 ? rowCount : null,
    });
    if (records.length >= 64) break;
  }
  return records;
}

const PUBLIC_TOP_LEVEL_EVIDENCE_METRICS = new Map([
  ["latest_revenue", "currency"],
  ["latest_diluted_shares", "shares"],
  ["latest_free_cash_flow", "currency"],
  ["revenue_cagr_5y", "ratio"],
  ["gross_margin", "ratio"],
  ["operating_margin", "ratio"],
  ["fcf_margin", "ratio"],
  ["roic", "ratio"],
  ["net_debt", "currency"],
  ["base_fcf_margin", "ratio"],
  ["wacc", "ratio"],
  ["terminal_growth", "ratio"],
  ["current_basic_outstanding_shares", "shares"],
  ["current_share_count_relative_difference", "ratio"],
  ["current_price", "price"],
  ["screening.current_price", "price"],
  ["screening.market_cap", "currency"],
  ["screening.revenue", "currency"],
  ["screening.free_cash_flow", "currency"],
  ["screening.cash", "currency"],
  ["screening.total_debt", "currency"],
  ["screening.diluted_shares", "shares"],
]);
const PUBLIC_FINANCIAL_CURRENCY_FIELDS = new Set([
  "revenue",
  "gross_profit",
  "cost_of_revenue",
  "operating_income",
  "net_income",
  "ebitda",
  "interest_expense",
  "cash_from_operations",
  "capital_expenditures",
  "free_cash_flow",
  "fcff",
  "fcff_after_sbc",
  "depreciation_amortization",
  "stock_based_compensation",
  "common_stock_repurchased",
  "cash",
  "total_debt",
  "short_term_debt",
  "long_term_debt",
  "total_equity",
  "total_assets",
  "net_receivables",
  "inventory",
  "goodwill_and_intangibles",
  "preferred_stock",
  "minority_interest",
  "unfunded_pension_liability",
  "lease_liabilities_not_in_debt",
  "non_operating_investments",
  "invested_capital",
]);
const PUBLIC_FINANCIAL_RATIO_FIELDS = new Set([
  "gross_margin",
  "operating_margin",
  "net_margin",
  "fcf_margin",
  "cash_conversion",
  "sbc_as_pct_revenue",
  "sbc_as_pct_fcf",
  "roic",
]);
const PUBLIC_CLAIM_TAGS = new Set([
  "sourced_fact",
  "calculated_metric",
  "assumption",
  "interpretation",
  "uncertainty",
]);

function publicMetricPolicy(value) {
  const metric = cleanText(value).toLowerCase();
  const topLevelKind = PUBLIC_TOP_LEVEL_EVIDENCE_METRICS.get(metric);
  if (topLevelKind) return { metric, kind: topLevelKind, priority: 0 };
  const financialMatch = metric.match(/^financials\.(annual\.((?:\d{4})|(?:\d{4}-\d{2}-\d{2}))|ttm)\.([a-z0-9_]+)$/);
  if (!financialMatch) return null;
  const field = financialMatch[3];
  let kind = null;
  if (field === "diluted_shares") kind = "shares";
  else if (PUBLIC_FINANCIAL_CURRENCY_FIELDS.has(field)) kind = "currency";
  else if (PUBLIC_FINANCIAL_RATIO_FIELDS.has(field)) kind = "ratio";
  if (!kind) return null;
  return {
    metric,
    kind,
    priority: metric.startsWith("financials.ttm.") ? 1 : 2,
  };
}

function canonicalPublicClaimTag(value) {
  const tag = cleanText(value).toLowerCase();
  if (tag === "source_backed") return "sourced_fact";
  return PUBLIC_CLAIM_TAGS.has(tag) ? tag : null;
}

function publicMetricUnit(kind, currency) {
  if (kind === "ratio") return "ratio";
  if (kind === "shares") return "shares";
  if (kind === "currency") return currency;
  if (kind === "price") return currency ? `${currency}/share` : null;
  return null;
}

function boundedPublicMetricValue(value, kind) {
  if (kind === "ratio") return boundedFiniteNumber(value, -10, 10);
  if (kind === "shares") return boundedFiniteNumber(value, 0, 1e16);
  if (kind === "price") return boundedFiniteNumber(value, 0, 1e9);
  if (kind === "currency") return boundedFiniteNumber(value, -1e18, 1e18);
  return null;
}

function sanitizePublicDataPoints(value, { currency = null, visibleCurrentPrice = null } = {}) {
  const safeCurrency = validCurrency(currency);
  const safeCurrentPrice = boundedPublicMetricValue(visibleCurrentPrice, "price");
  const candidates = [];
  for (const [index, point] of (Array.isArray(value) ? value : []).slice(0, 2_000).entries()) {
    const policy = publicMetricPolicy(point?.metric);
    const claimTag = canonicalPublicClaimTag(point?.claim_tag);
    if (!policy || !claimTag) continue;
    const sourceId = canonicalPublicSourceId(point?.source_id);
    const sourceIds = [...new Set((Array.isArray(point?.source_ids) ? point.source_ids : [])
      .map(canonicalPublicSourceId)
      .filter(Boolean))].slice(0, 6);
    if (claimTag === "sourced_fact" && sourceId === null) continue;
    const currentPriceMetric = policy.metric === "current_price";
    const normalizedValue = currentPriceMetric
      ? safeCurrentPrice
      : boundedPublicMetricValue(point?.normalized_value, policy.kind);
    if (normalizedValue === null && !currentPriceMetric) continue;
    const unit = publicMetricUnit(policy.kind, safeCurrency);
    if ((policy.kind === "currency" || policy.kind === "price") && unit === null) continue;
    candidates.push({
      priority: policy.priority,
      index,
      point: {
        metric: policy.metric,
        normalized_value: normalizedValue,
        unit,
        source_id: sourceId,
        ...(sourceIds.length ? { source_ids: sourceIds } : {}),
        claim_tag: claimTag,
      },
    });
  }
  candidates.sort((left, right) => left.priority - right.priority || left.index - right.index);
  const output = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.point.metric)) continue;
    seen.add(candidate.point.metric);
    output.push(candidate.point);
    if (output.length >= 128) break;
  }
  return output;
}

function screeningSourceIdsForMetric(metric) {
  const families = {
    "screening.current_price": ["fmp:quote", "fmp:prices", "fmp:profile", "yfinance:quote", "yfinance:prices", "yfinance:profile"],
    "screening.market_cap": ["fmp:quote", "fmp:profile", "yfinance:quote", "yfinance:profile"],
    "screening.revenue": ["fmp:income:annual", "fmp:income:quarterly", "yfinance:income:annual", "yfinance:income:quarterly", "sec:companyfacts:income"],
    "screening.free_cash_flow": ["fmp:cash-flow:annual", "fmp:cash-flow:quarterly", "yfinance:cash-flow:annual", "yfinance:cash-flow:quarterly", "sec:companyfacts:cash-flow"],
    "screening.cash": ["fmp:balance:annual", "fmp:balance:quarterly", "yfinance:balance:annual", "yfinance:balance:quarterly", "sec:companyfacts:balance"],
    "screening.total_debt": ["fmp:balance:annual", "fmp:balance:quarterly", "yfinance:balance:annual", "yfinance:balance:quarterly", "sec:companyfacts:balance"],
    "screening.diluted_shares": ["fmp:income:annual", "fmp:income:quarterly", "yfinance:income:annual", "yfinance:income:quarterly", "sec:companyfacts:income"],
  };
  return new Set(families[metric] || []);
}

function screeningSecTargets(metric) {
  const targets = {
    "screening.revenue": ["revenue"],
    "screening.free_cash_flow": ["netCashProvidedByOperatingActivities", "capitalExpenditure"],
    "screening.cash": ["cashAndCashEquivalents"],
    "screening.total_debt": ["totalDebt"],
    "screening.diluted_shares": ["weightedAverageShsOutDil"],
  };
  return targets[metric] || [];
}

function authenticScreeningSource(record, sourceId, metric, expectedTicker) {
  if (sourceId.startsWith("fmp:")) return authenticFmpRecord(record, sourceId, expectedTicker);
  if (sourceId.startsWith("yfinance:")) return authenticYfinanceRecord(record, sourceId, expectedTicker);
  if (sourceId.startsWith("sec:companyfacts:")) {
    return authenticSecCompanyFactsRecord(record, expectedTicker, {
      requiredTargets: screeningSecTargets(metric),
    }) && Number.isInteger(record?.row_count) && record.row_count > 0;
  }
  return false;
}

function optionalRawScreeningNumber(value, minimum, maximum) {
  if (value === null || value === undefined) return null;
  return rawNumberInRange(value, minimum, maximum) ? value : Number.NaN;
}

function screeningNumbersMatch(left, right) {
  if (left === null && right === null) return true;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return strictRelativeDifference(left, right) <= 1e-8;
}

function sanitizePublicScreeningAnalysis(raw, {
  valuation = null,
  priceContext = null,
  dataPoints = [],
  sourceRecords = [],
  expectedTicker = null,
  now = Date.now(),
} = {}) {
  if (
    !raw
    || typeof raw !== "object"
    || raw.version !== "screening_analysis_v1"
    || raw.available !== true
    || raw.posture !== "screen_grade"
    || raw.fair_value_published !== false
    || !["early_stage", "fundamental_snapshot"].includes(raw.kind)
    || cleanText(valuation?.status).toLowerCase() === "decision_ready"
    || !priceContext
  ) return null;

  const sourceRecordMap = uniqueRawSourceRecordMap(sourceRecords);
  const pointMap = uniqueRawDataPointMap(dataPoints);
  if (!sourceRecordMap || !pointMap) return null;
  const observed = raw.observed && typeof raw.observed === "object" ? raw.observed : {};
  const currentPrice = optionalRawScreeningNumber(observed.current_price, 0.000001, 1e9);
  const marketCap = optionalRawScreeningNumber(observed.market_cap, 0.000001, 1e18);
  const revenue = optionalRawScreeningNumber(observed.revenue, 0, 1e18);
  const freeCashFlow = optionalRawScreeningNumber(observed.free_cash_flow, -1e18, 1e18);
  const cash = optionalRawScreeningNumber(observed.cash, 0, 1e18);
  const totalDebt = optionalRawScreeningNumber(observed.total_debt, 0, 1e18);
  const dilutedShares = optionalRawScreeningNumber(observed.diluted_shares, 0.000001, 1e16);
  if (
    !Number.isFinite(currentPrice)
    || !Number.isFinite(marketCap)
    || !screeningNumbersMatch(currentPrice, priceContext.reference_price)
  ) return null;

  const evidenceValues = new Map([
    ["screening.current_price", currentPrice],
    ["screening.market_cap", marketCap],
    ["screening.revenue", revenue],
    ["screening.free_cash_flow", freeCashFlow],
    ["screening.cash", cash],
    ["screening.total_debt", totalDebt],
    ["screening.diluted_shares", dilutedShares],
  ]);
  for (const [metric, value] of evidenceValues) {
    if (value === null) continue;
    if (!Number.isFinite(value)) return null;
    const point = pointMap.get(metric);
    const sourceId = canonicalPublicSourceId(point?.source_id);
    const allowedSourceIds = screeningSourceIdsForMetric(metric);
    if (
      !point
      || cleanText(point.claim_tag).toLowerCase() !== "sourced_fact"
      || !sourceId
      || !allowedSourceIds.has(sourceId)
      || !rawNumberInRange(point.normalized_value, -1e18, 1e18)
      || !screeningNumbersMatch(point.normalized_value, value)
      || !sourceRecordIsFreshAndOk(sourceRecordMap, sourceId, {
        now,
        maximumAgeMs: sourceId.endsWith(":quote") ? MARKET_DATA_MAX_AGE_MS : EVIDENCE_RETRIEVAL_MAX_AGE_MS,
      })
      || !authenticScreeningSource(sourceRecordMap.get(sourceId), sourceId, metric, expectedTicker)
    ) return null;
  }

  const expectedNetCash = Number.isFinite(cash) && Number.isFinite(totalDebt) ? cash - totalDebt : null;
  const expectedEnterpriseValue = Number.isFinite(cash) && Number.isFinite(totalDebt)
    ? marketCap + totalDebt - cash
    : null;
  const netCash = optionalRawScreeningNumber(observed.net_cash, -1e18, 1e18);
  const enterpriseValue = optionalRawScreeningNumber(observed.enterprise_value, -1e18, 1e18);
  if (!screeningNumbersMatch(netCash, expectedNetCash) || !screeningNumbersMatch(enterpriseValue, expectedEnterpriseValue)) return null;

  const ratios = raw.ratios && typeof raw.ratios === "object" ? raw.ratios : {};
  const expectedEvToRevenue = Number.isFinite(enterpriseValue) && Number.isFinite(revenue) && revenue > 0
    ? enterpriseValue / revenue
    : null;
  const expectedFcfYield = Number.isFinite(freeCashFlow) ? freeCashFlow / marketCap : null;
  const expectedNetCashRatio = Number.isFinite(netCash) ? netCash / marketCap : null;
  const evToRevenue = optionalRawScreeningNumber(ratios.ev_to_revenue, -1_000, 1_000);
  const fcfYield = optionalRawScreeningNumber(ratios.fcf_yield, -100, 100);
  const netCashToMarketCap = optionalRawScreeningNumber(ratios.net_cash_to_market_cap, -100, 100);
  if (
    !screeningNumbersMatch(evToRevenue, expectedEvToRevenue)
    || !screeningNumbersMatch(fcfYield, expectedFcfYield)
    || !screeningNumbersMatch(netCashToMarketCap, expectedNetCashRatio)
  ) return null;

  const runway = raw.runway && typeof raw.runway === "object" ? raw.runway : {};
  const expectedAnnualBurn = Number.isFinite(freeCashFlow) && freeCashFlow < 0 ? Math.abs(freeCashFlow) : null;
  const expectedRunwayYears = Number.isFinite(cash) && cash > 0 && Number.isFinite(expectedAnnualBurn)
    ? cash / expectedAnnualBurn
    : null;
  const expectedRunwayMonths = Number.isFinite(expectedRunwayYears) ? expectedRunwayYears * 12 : null;
  const expectedFundingNeed = Number.isFinite(cash) && Number.isFinite(expectedAnnualBurn)
    ? Math.max(expectedAnnualBurn * 2 - cash, 0)
    : null;
  let expectedDilution = null;
  if (Number.isFinite(expectedFundingNeed) && Number.isFinite(dilutedShares)) {
    const newShares = expectedFundingNeed / (currentPrice * 0.8);
    expectedDilution = newShares > 0 ? newShares / (dilutedShares + newShares) : 0;
  }
  const annualBurn = optionalRawScreeningNumber(runway.annual_burn, 0, 1e18);
  const runwayYears = optionalRawScreeningNumber(runway.years, 0, 1_000);
  const runwayMonths = optionalRawScreeningNumber(runway.months, 0, 12_000);
  const fundingNeed = optionalRawScreeningNumber(runway.funding_need_for_24_months, 0, 1e18);
  const illustrativeDilution = optionalRawScreeningNumber(runway.illustrative_dilution_at_20pct_discount, 0, 1);
  const expectedPressure = Number.isFinite(expectedRunwayYears)
    ? expectedRunwayYears < 1 ? "urgent" : expectedRunwayYears < 2 ? "high" : expectedRunwayYears < 3 ? "moderate" : "manageable"
    : "unknown";
  if (
    !screeningNumbersMatch(annualBurn, expectedAnnualBurn)
    || !screeningNumbersMatch(runwayYears, expectedRunwayYears)
    || !screeningNumbersMatch(runwayMonths, expectedRunwayMonths)
    || !screeningNumbersMatch(fundingNeed, expectedFundingNeed)
    || !screeningNumbersMatch(illustrativeDilution, expectedDilution)
    || cleanText(runway.pressure).toLowerCase() !== expectedPressure
  ) return null;

  const marketRead = raw.market_read && typeof raw.market_read === "object" ? raw.market_read : {};
  const expectedCashPerShare = Number.isFinite(cash) && Number.isFinite(dilutedShares) ? cash / dilutedShares : null;
  const expectedNetCashPerShare = Number.isFinite(netCash) && Number.isFinite(dilutedShares) ? netCash / dilutedShares : null;
  const expectedPremium = Number.isFinite(expectedNetCashPerShare) && expectedNetCashPerShare > 0
    ? currentPrice / expectedNetCashPerShare - 1
    : null;
  const operationsValue = optionalRawScreeningNumber(marketRead.operations_value, -1e18, 1e18);
  const cashPerShare = optionalRawScreeningNumber(marketRead.cash_per_share, 0, 1e12);
  const netCashPerShare = optionalRawScreeningNumber(marketRead.net_cash_per_share, -1e12, 1e12);
  const premiumToNetCash = optionalRawScreeningNumber(marketRead.premium_to_net_cash, -100, 100_000);
  if (
    !screeningNumbersMatch(operationsValue, expectedEnterpriseValue)
    || !screeningNumbersMatch(cashPerShare, expectedCashPerShare)
    || !screeningNumbersMatch(netCashPerShare, expectedNetCashPerShare)
    || !screeningNumbersMatch(premiumToNetCash, expectedPremium)
  ) return null;

  return {
    version: "screening_analysis_v1",
    available: true,
    posture: "screen_grade",
    kind: raw.kind,
    fair_value_published: false,
    currency: priceContext.currency,
    market_data_as_of: priceContext.market_data_as_of,
    financial_data_as_of: validDate(raw.financial_data_as_of || valuation?.financial_data_as_of),
    observed: {
      current_price: currentPrice,
      market_cap: marketCap,
      revenue,
      free_cash_flow: freeCashFlow,
      cash,
      total_debt: totalDebt,
      diluted_shares: dilutedShares,
      net_cash: netCash,
      enterprise_value: enterpriseValue,
    },
    ratios: { ev_to_revenue: evToRevenue, fcf_yield: fcfYield, net_cash_to_market_cap: netCashToMarketCap },
    runway: {
      annual_burn: annualBurn,
      years: runwayYears,
      months: runwayMonths,
      funding_need_for_24_months: fundingNeed,
      illustrative_dilution_at_20pct_discount: illustrativeDilution,
      pressure: expectedPressure,
    },
    market_read: {
      operations_value: operationsValue,
      cash_per_share: cashPerShare,
      net_cash_per_share: netCashPerShare,
      premium_to_net_cash: premiumToNetCash,
    },
    limitations: [
      "No es un valor razonable ni una recomendación.",
      "La autonomía usa el consumo de caja observado; puede cambiar con el ritmo de inversión.",
      "La dilución es ilustrativa y supone una ampliación al 20% de descuento.",
    ],
  };
}

function sanitizePublicPriceValidation(value) {
  const validation = sanitizedPriceValidation(value);
  const status = new Set([
    "validated",
    "provider_reconciled",
    "inconsistent",
    "stale",
    "mismatch",
    "missing",
    "unavailable",
    "unknown",
  ]).has(validation.status) ? validation.status : "unknown";
  const publicSources = [];
  for (const source of validation.sources) {
    if (/\bfmp\b|financial\s*modeling\s*prep/i.test(source)) publicSources.push("FMP");
    if (/\byfinance\b|yahoo\s*finance|\byahoo\b/i.test(source)) publicSources.push("Yahoo Finance");
    if (/official\s+(?:market\s+)?close|exchange\s+close/i.test(source)) publicSources.push("Cierre oficial de mercado");
  }
  return {
    status,
    usable: status === "validated" && validation.usable === true,
    research_usable: status === "provider_reconciled" && validation.research_usable === true,
    usable_for_context: status === "provider_reconciled" && validation.usable_for_context === true,
    sources: [...new Set(publicSources)],
  };
}

function sanitizePublicReliability(value, { backed = false } = {}) {
  const reliability = sanitizedReliability(value);
  const status = new Set(["high", "medium", "low", "blocked"]).has(reliability.status)
    ? reliability.status
    : backed
      ? "high"
      : "blocked";
  return {
    usable: backed && reliability.usable === true,
    status,
    score: reliability.score,
    reasons: [],
    limitations: [],
  };
}

function sanitizePublicBackedValuation(payload, valuationContext) {
  const valuation = payload?.valuation && typeof payload.valuation === "object" ? payload.valuation : {};
  return {
    model_version: INSTITUTIONAL_MODEL_VERSION,
    available: true,
    status: "decision_ready",
    archetype: canonicalArchetype(valuation.archetype),
    primary_method: valuationContext.primary_method,
    cash_flow_basis: canonicalCashFlowBasis(valuation.cash_flow_basis),
    currency: valuationContext.currency,
    market_data_as_of: valuationContext.market_data_as_of,
    financial_data_as_of: validDate(valuation.financial_data_as_of),
    current_price: valuationContext.current_price,
    reason: "La valoración supera los controles de precio, método, datos y auditoría requeridos para publicarse.",
    blocking_gap: null,
    pending_checks: [],
    precision_withheld: false,
    range: valuationContext.range,
    selected_value: valuationContext.range?.central ?? null,
    scenarios: [],
    methods: [],
    reverse_dcf: null,
    multiples: null,
    screening_analysis: null,
    price_validation: sanitizePublicPriceValidation(valuation.price_validation),
    reliability: sanitizePublicReliability(valuation.reliability, { backed: true }),
  };
}

function publicEvidenceStrength(reliability) {
  const rawScore = numberOrNull(reliability?.score);
  if (rawScore === null) return null;
  const points = Math.round(rawScore <= 1 ? rawScore * 100 : rawScore);
  if (points < 0 || points > 100) return null;
  const status = cleanText(reliability?.status).toLowerCase();
  const label = status === "high"
    ? "Alta"
    : status === "medium"
      ? "Media"
      : status === "low"
        ? "Baja"
        : points >= 78
          ? "Alta"
          : points >= 50
            ? "Media"
            : "Baja";
  return { label, points };
}

function buildPublicResearchReport(ticker, companyProfile, valuation) {
  if (valuation?.status !== "decision_ready") {
    const rangeVisible = numberOrNull(valuation?.range?.low) !== null && numberOrNull(valuation?.range?.high) !== null;
    return sanitizeUnbackedReport("", ticker, rangeVisible);
  }
  const evidenceStrength = publicEvidenceStrength(valuation?.reliability);
  const range = valuation.range || {};
  return [
    `# ${ticker}`,
    "",
    `## ${companyProfile?.name || "Valoración de empresa"}`,
    "",
    `Rango estimado: ${valuation.currency} ${range.low}–${range.high} por acción.`,
    `Estimación central: ${valuation.currency} ${range.central} por acción.`,
    `Método principal: ${publicPrimaryMethodLabel(valuation.primary_method)}.`,
    `Estados financieros al: ${valuation.financial_data_as_of || "fecha no disponible"}.`,
    `Precio de mercado al: ${valuation.market_data_as_of || "fecha no disponible"}.`,
    evidenceStrength === null
      ? ""
      : `Solidez de la evidencia: ${evidenceStrength.label} · ${evidenceStrength.points}/100. Índice de controles; no probabilidad de acierto.`,
    "",
    "Esta lectura ordena datos y supuestos; no constituye una recomendación de inversión.",
    "",
  ].filter(Boolean).join("\n");
}

export function sanitizePublicResearchPayload(payload, { expectedTicker = null } = {}) {
  if (!payload || typeof payload !== "object") return payload;
  const requestedTicker = cleanTicker(expectedTicker);
  const payloadTicker = cleanTicker(payload.ticker);
  if (requestedTicker && payloadTicker !== requestedTicker) {
    throw new Error("The backend response does not match the requested security.");
  }
  const identityTicker = requestedTicker || payloadTicker;
  const valuationContext = buildDownstreamValuationContext(payload, { expectedTicker: identityTicker });
  const presentation = buildEquityValuationPresentation(payload);
  const internalSafePayload = valuationContext.backed ? null : sanitizeResearchPayload(payload);
  const rawSources = (internalSafePayload?.sources || payload.sources) && typeof (internalSafePayload?.sources || payload.sources) === "object"
    ? (internalSafePayload?.sources || payload.sources)
    : {};
  const evidenceSources = payload.sources && typeof payload.sources === "object" ? payload.sources : {};
  const originalCoverage = [payload?.sources?.coverage, payload?.audit?.coverage].filter((item) => (
    item && typeof item === "object" && Object.keys(item).length > 0
  ));
  const coverage = sanitizePublicCoverage(rawSources.coverage || payload?.audit?.coverage);
  const sanitizedValuation = valuationContext.backed
    ? sanitizePublicBackedValuation(payload, valuationContext)
    : {
      ...internalSafePayload.valuation,
      price_validation: sanitizePublicPriceValidation(internalSafePayload.valuation?.price_validation),
    };
  const verifiedMarketPrice = publicMarketPriceContext(payload.valuation, {
    sourceRecords: evidenceSources.records,
    expectedTicker: identityTicker,
  });
  const contextualMarketPrice = valuationContext.backed ? null : verifiedMarketPrice;
  const blockingState = sanitizePublicBlockingState(payload.valuation);
  const driverSummaryAllowed = valuationContext.backed === true || (
    presentation.showValuationFigures === true
    && !hasFatalAuditFinding(payload.audit)
  );
  const valuation = {
    ...sanitizedValuation,
    current_price: valuationContext.backed
      ? sanitizedValuation.current_price
      : contextualMarketPrice?.reference_price ?? null,
    market_data_as_of: valuationContext.backed
      ? sanitizedValuation.market_data_as_of
      : contextualMarketPrice?.market_data_as_of ?? null,
    price_validation: {
      ...(sanitizedValuation.price_validation || {}),
      usable: verifiedMarketPrice?.price_context === "validated",
      research_usable: verifiedMarketPrice?.price_context === "contextual",
      usable_for_context: verifiedMarketPrice?.price_context === "contextual",
    },
    reason: valuationContext.backed
      ? sanitizedValuation.reason
      : canonicalPublicValuationReason(payload.valuation, {
        researchRangeVisible: presentation.state === "research_grade" && presentation.showValuationFigures === true,
      }),
    blocking_gap: blockingState?.blocking_gap || null,
    pending_checks: blockingState?.pending_checks || [],
    driver_summary: driverSummaryAllowed
      ? sanitizePublicDriverSummary(payload.valuation, {
        includeBase: valuationContext.backed === true,
      })
      : null,
    screening_analysis: valuationContext.backed
      ? null
      : sanitizePublicScreeningAnalysis(payload.valuation?.screening_analysis, {
        valuation: payload.valuation,
        priceContext: contextualMarketPrice,
        dataPoints: evidenceSources.data_points,
        sourceRecords: evidenceSources.records,
        expectedTicker: identityTicker,
      }),
    market_requirements: sanitizePublicMarketRequirements(payload.valuation, {
      audit: payload.audit,
      coverage: originalCoverage,
      dataPoints: evidenceSources.data_points,
      sourceRecords: evidenceSources.records,
      financials: payload.financials,
      expectedTicker: identityTicker,
    }),
  };
  const companyProfile = sanitizePublicCompanyProfile(payload.company_profile);
  const sources = {
    coverage,
    records: sanitizePublicSourceRecords(rawSources.records),
    data_points: sanitizePublicDataPoints(rawSources.data_points, {
      currency: valuation.currency,
      visibleCurrentPrice: valuation.current_price,
    }),
    claims: [],
  };
  const audit = sanitizePublicAudit(payload.audit, coverage);
  const ticker = cleanTicker(payload.ticker) || "ticker";
  const reportMarkdown = buildPublicResearchReport(ticker, companyProfile, valuation);
  const downloads = [
    textDownload(`${ticker}_report.md`, "text/markdown", reportMarkdown),
    textDownload(`${ticker}_sources.json`, "application/json", JSON.stringify(sources, null, 2)),
    textDownload(`${ticker}_audit.json`, "application/json", JSON.stringify(audit, null, 2)),
  ];

  return {
    ok: payload.ok !== false,
    ticker,
    mode: "quick",
    generated_at: validDate(payload.generated_at),
    company_profile: companyProfile,
    financials: sanitizePublicFinancials(payload.financials),
    valuation,
    report_markdown: reportMarkdown,
    sources,
    agents: { agents: [], claims: [] },
    audit,
    artifacts: {
      report_md: true,
      model_xlsx: false,
      sources_json: true,
      audit_json: true,
    },
    downloads,
  };
}

function envFlag(name, fallback = "auto") {
  return String(process.env[name] ?? fallback).trim().toLowerCase();
}

function equityResearchLlmConfig() {
  const apiKey = String(process.env.EQUITY_RESEARCH_LLM_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const enabledFlag = envFlag("EQUITY_RESEARCH_LLM_ENABLED");
  const timeoutMsRaw = Number(process.env.EQUITY_RESEARCH_LLM_TIMEOUT_MS);
  const timeoutSecondsRaw = Number(process.env.EQUITY_RESEARCH_LLM_TIMEOUT_SECONDS || 25);
  const enabled =
    ["0", "false", "no", "off", "disabled"].includes(enabledFlag)
      ? false
      : ["1", "true", "yes", "on", "enabled"].includes(enabledFlag)
        ? true
        : Boolean(apiKey);
  return {
    enabled,
    apiKey,
    model: String(process.env.EQUITY_RESEARCH_LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini").trim(),
    baseUrl: String(process.env.EQUITY_RESEARCH_LLM_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, ""),
    timeoutMs: Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.max(5000, timeoutMsRaw)
      : Math.max(5000, (Number.isFinite(timeoutSecondsRaw) && timeoutSecondsRaw > 0 ? timeoutSecondsRaw : 25) * 1000),
    maxTokens: Math.max(200, Math.min(2000, Number(process.env.EQUITY_RESEARCH_LLM_MAX_TOKENS || 900))),
  };
}

function compactJson(payload, limit = 12000) {
  const text = JSON.stringify(payload);
  return text.length <= limit ? text : `${text.slice(0, limit)}...[truncated]`;
}

function parseJsonishAnalysis(value) {
  if (!value) return {};
  if (typeof value === "object") {
    if (value.memo_patch && !value.executive_judgment) {
      const nested = parseJsonishAnalysis(value.memo_patch);
      if (nested.executive_judgment || nested.strongest_points || nested.red_team || nested.open_questions) {
        return nested;
      }
    }
    return value;
  }
  const text = String(value || "").trim();
  if (!text) return {};
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" ? parseJsonishAnalysis(parsed) : { memo_patch: text };
  } catch {
    return { memo_patch: text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim() };
  }
}

function finalOrchestratorInput(bundle) {
  const latest = latestAnnualRow(bundle) || {};
  return {
    ticker: bundle?.ticker,
    company: bundle?.company_profile || {},
    latest_period: latest.fiscal_year || latest.date || null,
    audit: {
      status: bundle?.audit?.status,
      coverage: bundle?.sources?.coverage || bundle?.audit?.coverage,
      findings: Array.isArray(bundle?.audit?.findings) ? bundle.audit.findings.slice(0, 8) : [],
    },
    financials: {
      latest_revenue: bundle?.financials?.ratios?.latest_revenue,
      latest_fcf: bundle?.financials?.ratios?.latest_fcf,
      revenue_cagr_5y: bundle?.financials?.ratios?.revenue_cagr_5y,
      fcf_margin: bundle?.financials?.ratios?.fcf_margin,
      roic: bundle?.financials?.ratios?.roic,
      cash_conversion: bundle?.financials?.ratios?.cash_conversion,
      net_debt: bundle?.financials?.ratios?.net_debt,
      latest_debt: latest.total_debt,
      latest_cash: latest.cash,
    },
    valuation: buildDownstreamValuationContext(bundle),
    quality_flags: Array.isArray(bundle?.financials?.quality_flags) ? bundle.financials.quality_flags.slice(0, 8) : [],
    filings: Array.isArray(bundle?.filings?.recent) ? bundle.filings.recent.slice(0, 5) : [],
    agent_summaries: (Array.isArray(bundle?.agents?.agents) ? bundle.agents.agents : []).map((agent) => ({
      id: agent?.id,
      status: agent?.status,
      summary: agent?.summary,
      open_questions: Array.isArray(agent?.open_questions) ? agent.open_questions.slice(0, 4) : [],
    })),
  };
}

async function callFinalOrchestrator(bundle, config) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      cache: "no-store",
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              "You are the final orchestrator/editor for an equity research operating system. You receive only audited deterministic outputs. Do not invent data, do not recalculate numbers, and tag uncertainty explicitly. Valuation figures are decision-usable only when valuation.backed is true. If it is false or valuation.range is null, do not state a fair value, price target, upside/downside, or buy/sell conclusion. Return only valid JSON, without markdown fences, with keys: executive_judgment, strongest_points, red_team, open_questions, memo_patch.",
          },
          {
            role: "user",
            content: `Synthesize the finished bundle into a skeptical final analyst layer. Use only this JSON payload:\n${compactJson(finalOrchestratorInput(bundle))}`,
          },
        ],
        temperature: 0.2,
        max_tokens: config.maxTokens,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Final orchestrator failed (${response.status}): ${text.slice(0, 200)}`);
    }
    const data = await response.json();
    const rawText = String(data?.choices?.[0]?.message?.content || "").trim();
    return parseJsonishAnalysis(rawText);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      throw new Error(`Final orchestrator timed out after ${config.timeoutMs}ms.`);
    }
    throw error;
  }
}

function stripFinalOrchestratorReport(markdown) {
  return String(markdown || "")
    .trimEnd()
    .replace(/(?:^|\n)## Final orchestrator[\s\S]*?(?=\n## |$)/gi, "")
    .replace(/(?:^|\n)## Final editor synthesis[\s\S]*?(?=\n## |$)/gi, "")
    .replace(/(?:^|\n)- Final LLM orchestrator:\s*```(?:json)?[\s\S]*?```/gi, "")
    .trimEnd();
}

function withholdFinalOrchestrator(bundle, valuationContext) {
  const current = bundle?.agents?.final_orchestrator || bundle?.sources?.agent_outputs?.final_orchestrator || {};
  const actualCalls = Math.max(0, Number(current?.call_budget?.actual_calls || 0));
  const withheld = {
    enabled: false,
    status: "withheld",
    reason: "valuation_not_decision_ready",
    model: current.model || null,
    runtime: current.runtime || null,
    call_budget: {
      max_calls: Math.max(1, Number(current?.call_budget?.max_calls || 1)),
      actual_calls: actualCalls,
    },
    valuation: valuationContext,
    analysis: {
      executive_judgment: "",
      strongest_points: [],
      red_team: [],
      open_questions: ["Validar datos, método y precio antes de emitir una conclusión de valoración."],
    },
  };
  const reportMarkdown = stripFinalOrchestratorReport(bundle?.report_markdown);
  const downloads = updateReportDownload(bundle?.downloads, bundle?.ticker, reportMarkdown);

  return {
    ...bundle,
    report_markdown: reportMarkdown,
    downloads,
    agents: {
      ...(bundle?.agents || {}),
      final_orchestrator: withheld,
    },
    sources: {
      ...(bundle?.sources || {}),
      agent_outputs: {
        ...(bundle?.sources?.agent_outputs || bundle?.agents || {}),
        final_orchestrator: withheld,
      },
    },
  };
}

async function attachFinalOrchestrator(bundle) {
  const valuationContext = buildDownstreamValuationContext(bundle);
  if (!valuationContext.backed) return withholdFinalOrchestrator(bundle, valuationContext);
  if (!bundle?.agents?.agents?.length) return bundle;
  const current = bundle.agents.final_orchestrator || {};
  const actualCalls = Number(current?.call_budget?.actual_calls || 0);
  if (current.status === "ok" || actualCalls >= 1) return bundle;

  const config = equityResearchLlmConfig();
  if (!config.enabled) return bundle;

  const finalWaitMs = finalOrchestratorWaitMs();
  if (finalWaitMs > 0) {
    return {
      ...bundle,
      agents: {
        ...bundle.agents,
        final_orchestrator: {
          enabled: true,
          status: "rate_limited",
          model: config.model,
          base_url: config.baseUrl,
          runtime: "vercel",
          call_budget: { max_calls: 1, actual_calls: 0 },
          retry_after_ms: finalWaitMs,
          analysis: {
            executive_judgment: "La síntesis final externa está pausada por límite de requests. El análisis determinístico y los roles locales siguen disponibles.",
            strongest_points: [],
            red_team: [],
            open_questions: ["Reintentar la síntesis final cuando pase el cooldown."],
          },
        },
      },
    };
  }

  const finalOrchestrator = {
    enabled: true,
    status: "unavailable",
    model: config.model,
    base_url: config.baseUrl,
    runtime: "vercel",
    call_budget: { max_calls: 1, actual_calls: 0 },
    analysis: null,
  };

  if (!config.apiKey) {
    return {
      ...bundle,
      agents: {
        ...bundle.agents,
        final_orchestrator: {
          ...finalOrchestrator,
          error: "No EQUITY_RESEARCH_LLM_API_KEY or OPENAI_API_KEY configured in Vercel.",
        },
      },
    };
  }

  try {
    finalOrchestrator.call_budget.actual_calls = 1;
    finalOrchestrator.analysis = await callFinalOrchestrator(bundle, config);
    finalOrchestrator.status = "ok";
  } catch (error) {
    finalOrchestrator.call_budget.actual_calls = 1;
    finalOrchestrator.status = "error";
    finalOrchestrator.error = String(error?.message || error);
    if (isRateLimitError(finalOrchestrator.error)) {
      markFinalOrchestratorRateLimited();
      finalOrchestrator.status = "rate_limited";
      finalOrchestrator.retry_after_ms = finalOrchestratorWaitMs();
      finalOrchestrator.analysis = {
        executive_judgment: "La síntesis final externa se pausó por límite de requests. El paquete determinístico queda disponible.",
        strongest_points: [],
        red_team: [],
        open_questions: ["Reintentar cuando el proveedor libere requests."],
      };
    }
  }

  const reportMarkdown = appendFinalOrchestratorReport(bundle.report_markdown, finalOrchestrator);
  const downloads = updateReportDownload(bundle.downloads, bundle.ticker, reportMarkdown);

  return {
    ...bundle,
    report_markdown: reportMarkdown,
    downloads,
    agents: {
      ...bundle.agents,
      final_orchestrator: finalOrchestrator,
    },
    sources: {
      ...(bundle.sources || {}),
      agent_outputs: {
        ...(bundle.sources?.agent_outputs || bundle.agents || {}),
        final_orchestrator: finalOrchestrator,
      },
    },
  };
}

function asBulletLines(value) {
  const values = Array.isArray(value) ? value : [value].filter(Boolean);
  return values.slice(0, 4).map((item) => `- ${String(item)}`);
}

function appendFinalOrchestratorReport(markdown, finalOrchestrator) {
  if (finalOrchestrator.status !== "ok") return markdown;
  const sourceMarkdown = stripFinalOrchestratorReport(markdown)
    .replace(/## Agent research desk/gi, "## Analyst desk")
    .replace(
      /^Agent layer:.*$/gim,
      "How to read this: Python pulls the data and calculates the metrics. The analyst desk is a set of reproducible review roles that read audited outputs, challenge the case, and point to open checks.",
    );
  const analysis = parseJsonishAnalysis(finalOrchestrator.analysis || {});
  const section = [
    "",
    "## Final editor synthesis",
    "One final editor pass ran after the deterministic engine, source ledger, specialist reviews, and audit. Specialist review roles did not calculate numbers.",
    "",
    analysis.executive_judgment || analysis.memo_patch ? `Executive judgment: ${analysis.executive_judgment || analysis.memo_patch}` : "",
    "",
    "What supports the case:",
    ...asBulletLines(analysis.strongest_points),
    "",
    "What could break the case:",
    ...asBulletLines(analysis.red_team),
    "",
    "Open checks:",
    ...asBulletLines(analysis.open_questions),
  ].filter((line, index, lines) => line || lines[index - 1] !== "");
  return `${sourceMarkdown}\n${section.join("\n")}\n`;
}

function updateReportDownload(downloads, ticker, reportMarkdown) {
  const artifacts = Array.isArray(downloads) ? downloads : [];
  const filename = `${ticker || "ticker"}_report.md`;
  const updated = textDownload(filename, "text/markdown", reportMarkdown);
  let replaced = false;
  const next = artifacts.map((artifact) => {
    if (String(artifact?.filename || "") === filename || String(artifact?.filename || "").endsWith("_report.md")) {
      replaced = true;
      return updated;
    }
    return artifact;
  });
  return replaced ? next : [updated, ...next];
}

function metricValue(bundle, metric, valuationContext) {
  if (metric.valuationField) {
    if (!valuationContext?.backed) return null;
    return numberOrNull(readPath(valuationContext, metric.valuationField));
  }
  return numberOrNull(readPath(bundle, metric.path));
}

const DELTA_METRICS = [
  { key: "latest_revenue", label: "Latest revenue", path: "financials.ratios.latest_revenue", unit: "currency" },
  { key: "latest_fcf", label: "Latest FCF", path: "financials.ratios.latest_fcf", unit: "currency" },
  { key: "revenue_cagr_5y", label: "Revenue CAGR, 5y", path: "financials.ratios.revenue_cagr_5y", unit: "percent" },
  { key: "fcf_margin", label: "FCF margin", path: "financials.ratios.fcf_margin", unit: "percent" },
  { key: "roic", label: "ROIC", path: "financials.ratios.roic", unit: "percent" },
  { key: "valuation_low", label: "Decision-ready valuation range, low", valuationField: "range.low", unit: "currency" },
  { key: "valuation_central", label: "Decision-ready valuation range, central", valuationField: "range.central", unit: "currency" },
  { key: "valuation_high", label: "Decision-ready valuation range, high", valuationField: "range.high", unit: "currency" },
  { key: "implied_growth", label: "Reverse DCF implied growth", valuationField: "reverse_dcf.implied_revenue_cagr", unit: "percent" },
];

function latestAnnualRow(payload) {
  const rows = Array.isArray(payload?.financials?.annual) ? payload.financials.annual : [];
  return rows.length ? rows[rows.length - 1] : null;
}

export function buildEquityResearchDelta(currentPayload, previousRun) {
  const previousPayload = previousRun?.payload || null;
  const currentValuation = buildDownstreamValuationContext(currentPayload);
  if (!previousPayload) {
    return {
      available: false,
      reason: "No prior research run exists for this workspace and ticker.",
      changes: [],
      valuation: {
        comparable: false,
        reason: "A prior decision-ready valuation is required for comparison.",
        current: currentValuation,
        previous: null,
      },
    };
  }

  const previousValuation = buildDownstreamValuationContext(previousPayload);
  const comparableValuation = currentValuation.backed
    && previousValuation.backed
    && currentValuation.currency === previousValuation.currency;

  const changes = DELTA_METRICS.map((metric) => {
    if (metric.valuationField && !comparableValuation) return null;
    const current = metricValue(currentPayload, metric, currentValuation);
    const previous = metricValue(previousPayload, metric, previousValuation);
    if (current === null || previous === null) return null;
    const absolute_change = current - previous;
    const pct_change = previous === 0 ? null : absolute_change / Math.abs(previous);
    return {
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      current,
      previous,
      absolute_change,
      pct_change,
      material: Math.abs(pct_change ?? 0) >= 0.05 || Math.abs(absolute_change) > 0,
    };
  }).filter(Boolean);

  const currentAudit = currentPayload?.audit?.status || null;
  const previousAudit = previousPayload?.audit?.status || null;
  const auditChanged = currentAudit && previousAudit && currentAudit !== previousAudit;
  const currentLatest = latestAnnualRow(currentPayload);
  const previousLatest = latestAnnualRow(previousPayload);
  const currentPeriod = currentLatest?.fiscal_year || currentLatest?.date || null;
  const previousPeriod = previousLatest?.fiscal_year || previousLatest?.date || null;

  return {
    available: true,
    previous_run_id: previousRun.id || null,
    previous_run_at: previousRun.generatedAt || previousRun.createdAt || null,
    previous_mode: previousRun.mode || null,
    period_changed: Boolean(currentPeriod && previousPeriod && currentPeriod !== previousPeriod),
    current_period: currentPeriod,
    previous_period: previousPeriod,
    audit_changed: auditChanged,
    previous_audit_status: previousAudit,
    current_audit_status: currentAudit,
    valuation: {
      comparable: comparableValuation,
      reason: comparableValuation
        ? "Both runs use decision-ready institutional valuations in the same currency."
        : "Valuation figures are withheld unless both runs are decision-ready, highly reliable, price-validated, and use the same currency.",
      current: currentValuation,
      previous: previousValuation,
    },
    changes,
    summary: changes.length
      ? "Compared against the latest stored run for this workspace and ticker."
      : "Prior run exists, but comparable numeric fields were not available.",
  };
}

function attachHistory(payload, history) {
  return {
    ...payload,
    history: {
      persisted: Boolean(history?.currentRun?.id),
      current_run_id: history?.currentRun?.id || null,
      current_run_at: history?.currentRun?.generatedAt || history?.currentRun?.createdAt || payload?.generated_at || null,
      run_count: Number(history?.runCount || 0),
      delta: buildEquityResearchDelta(payload, history?.previousRun || null),
      storage_status: history?.storageStatus || "not_persisted",
    },
  };
}

async function persistResearchRun(workspaceId, symbol, reportMode, payload, previousRun) {
  const cleanPayload = sanitizeResearchPayload(payload);
  try {
    const currentRun = await appendEquityResearchRun(workspaceId, symbol, reportMode, cleanPayload);
    const runCount = await countEquityResearchRuns(workspaceId, symbol);
    return attachHistory(cleanPayload, {
      previousRun,
      currentRun,
      runCount,
      storageStatus: currentRun ? "persisted" : "not_persisted",
    });
  } catch (error) {
    return attachHistory(cleanPayload, {
      previousRun,
      currentRun: null,
      runCount: previousRun ? 1 : 0,
      storageStatus: `not_persisted: ${String(error?.message || error)}`,
    });
  }
}

export async function getWorkspaceEquityResearch(workspaceId, ticker, { mode = "quick" } = {}) {
  const symbol = cleanTicker(ticker);
  const reportMode = mode === "full" ? "full" : "quick";
  if (!symbol) {
    return buildUnavailableBundle("", reportMode, "Ticker is required.");
  }

  const previousRun = await getLatestEquityResearchRun(workspaceId, symbol).catch(() => null);

  try {
    const payload = await fetchBackendEquityResearch(symbol, reportMode);
    if (!payload || payload.ok === false) {
      const unavailable = buildUnavailableBundle(symbol, reportMode, payload?.error || "Backend returned an invalid research payload.");
      return persistResearchRun(workspaceId, symbol, reportMode, unavailable, previousRun);
    }
    const enrichedPayload = sanitizeResearchPayload(await attachFinalOrchestrator(payload));
    const result = await persistResearchRun(workspaceId, symbol, reportMode, enrichedPayload, previousRun);
    return attachAuroraDecisionSystem(result);
  } catch (error) {
    const unavailable = buildUnavailableBundle(symbol, reportMode, error);
    return persistResearchRun(workspaceId, symbol, reportMode, unavailable, previousRun);
  }
}

function serializedError(error) {
  return String(error?.message || error || "Unknown error");
}

function isRateLimitError(message) {
  return /429|rate[\s_-]*limit|too many requests|too many api request/i.test(String(message || ""));
}

function rateLimitRetryAt() {
  const cooldownMs = Math.max(30000, Number(process.env.EQUITY_RESEARCH_RATE_LIMIT_COOLDOWN_MS || 120000));
  return new Date(Date.now() + cooldownMs).toISOString();
}

function markFinalOrchestratorRateLimited() {
  const cooldownMs = Math.max(30000, Number(process.env.EQUITY_RESEARCH_LLM_RATE_LIMIT_COOLDOWN_MS || 180000));
  researchRuntimeState.finalOrchestratorRetryAt = Date.now() + cooldownMs;
}

function finalOrchestratorWaitMs() {
  return Math.max(0, Number(researchRuntimeState.finalOrchestratorRetryAt || 0) - Date.now());
}

function retryWaitMs(localJob) {
  const retryAt = Date.parse(localJob?.payload?.next_start_retry_at || "");
  if (!Number.isFinite(retryAt)) return 0;
  return Math.max(0, retryAt - Date.now());
}

function jobPollPayload(localJob, fields = {}) {
  const retryAfterMs = fields.retryAfterMs ?? retryWaitMs(localJob);
  return {
    ok: true,
    ticker: localJob?.ticker || fields.ticker || null,
    mode: localJob?.mode || fields.mode || "quick",
    status: fields.status || localJob?.status || "running",
    run_id: localJob?.id || fields.runId || null,
    backend_run_id: localJob?.backendRunId || fields.backendRunId || null,
    started_at: localJob?.startedAt || fields.startedAt || null,
    updated_at: localJob?.updatedAt || null,
    ...(retryAfterMs > 0 ? { retry_after_ms: retryAfterMs, retry_at: localJob?.payload?.next_start_retry_at || fields.retryAt || null } : {}),
    ...(fields.error ? { last_error: fields.error } : {}),
  };
}

async function attachBackendResearchJob(workspaceId, localJob, symbol, reportMode) {
  const job = await startBackendEquityResearchJob(symbol, reportMode, localJob.id);
  if (!job?.run_id) {
    throw new Error("Research backend did not return a job run_id.");
  }
  const startedAt = job.started_at || new Date().toISOString();
  const updatedJob = await updateEquityResearchJob(workspaceId, localJob.id, {
    status: job.status || "running",
    backendRunId: job.run_id || null,
    startedAt,
    error: null,
    payload: {
      ...(localJob.payload || {}),
      backend: job,
      requested_at: localJob.createdAt,
      ticker: symbol,
      mode: reportMode,
      last_start_attempt_at: new Date().toISOString(),
    },
  });
  return { localJob: updatedJob || localJob, backendJob: job };
}

export async function startWorkspaceEquityResearch(workspaceId, ticker, { mode = "quick" } = {}) {
  const symbol = cleanTicker(ticker);
  const reportMode = mode === "full" ? "full" : "quick";
  if (!symbol) {
    return {
      ok: false,
      status: "failed",
      error: "Ticker is required.",
    };
  }

  const localJob = await createEquityResearchJob(workspaceId, symbol, reportMode, {
    status: "queued",
    payload: {
      requested_at: new Date().toISOString(),
      ticker: symbol,
      mode: reportMode,
    },
  });

  try {
    const { localJob: updatedJob, backendJob: job } = await attachBackendResearchJob(workspaceId, localJob, symbol, reportMode);
    return {
      ok: true,
      ticker: symbol,
      mode: reportMode,
      status: updatedJob?.status || job.status || "running",
      run_id: updatedJob?.id || localJob.id,
      backend_run_id: updatedJob?.backendRunId || job.run_id || null,
      started_at: updatedJob?.startedAt || job.started_at || null,
    };
  } catch (error) {
    const message = serializedError(error);
    const rateLimited = isRateLimitError(message);
    const nextRetryAt = rateLimited ? rateLimitRetryAt() : null;
    await updateEquityResearchJob(workspaceId, localJob.id, {
      status: "queued",
      error: message,
      payload: {
        requested_at: localJob.createdAt,
        ticker: symbol,
        mode: reportMode,
        last_start_error: message,
        last_start_attempt_at: new Date().toISOString(),
        ...(nextRetryAt ? { next_start_retry_at: nextRetryAt, rate_limited: true } : {}),
      },
    }).catch(() => null);
    return {
      ok: true,
      ticker: symbol,
      mode: reportMode,
      status: "queued",
      run_id: localJob.id,
      error: message,
      ...(nextRetryAt ? { retry_after_ms: Math.max(0, Date.parse(nextRetryAt) - Date.now()), retry_at: nextRetryAt } : {}),
    };
  }
}

export async function getWorkspaceEquityResearchJob(workspaceId, ticker, runId) {
  const symbol = cleanTicker(ticker);
  const localJob =
    (await getEquityResearchJob(workspaceId, runId).catch(() => null)) ||
    (await getEquityResearchJobByBackendRunId(workspaceId, runId).catch(() => null));
  let backendRunId = localJob?.backendRunId || (localJob ? "" : String(runId || "").trim());

  if (localJob?.status === "succeeded" && localJob.payload && Object.keys(localJob.payload).length) {
    return attachAuroraDecisionSystem(sanitizeResearchPayload(localJob.payload));
  }

  if (localJob?.status === "failed" && !backendRunId) {
    return {
      ok: false,
      ticker: symbol || localJob.ticker,
      mode: localJob.mode || "quick",
      status: "failed",
      run_id: localJob.id,
      error: localJob.error || "Research job failed before backend execution.",
    };
  }

  if (!backendRunId) {
    if (localJob) {
      const waitMs = retryWaitMs(localJob);
      if (waitMs > 0) {
        return jobPollPayload(localJob, {
          ticker: symbol || localJob.ticker,
          mode: localJob.mode || "quick",
          status: "queued",
          error: localJob.error || "Research backend is rate-limited; waiting before retry.",
          retryAfterMs: waitMs,
        });
      }
      try {
        const { localJob: updatedJob, backendJob } = await attachBackendResearchJob(
          workspaceId,
          localJob,
          symbol || localJob.ticker,
          localJob.mode || "quick",
        );
        backendRunId = updatedJob?.backendRunId || backendJob.run_id || "";
        return jobPollPayload(updatedJob, {
          ticker: symbol || localJob.ticker,
          mode: updatedJob?.mode || localJob.mode || "quick",
          status: updatedJob?.status || backendJob.status || "running",
          backendRunId,
          startedAt: updatedJob?.startedAt || backendJob.started_at || null,
        });
      } catch (error) {
        const message = serializedError(error);
        const rateLimited = isRateLimitError(message);
        const nextRetryAt = rateLimited ? rateLimitRetryAt() : null;
        const updatedJob = await updateEquityResearchJob(workspaceId, localJob.id, {
          status: "queued",
          error: message,
          payload: {
            ...(localJob.payload || {}),
            last_start_error: message,
            last_start_attempt_at: new Date().toISOString(),
            ...(nextRetryAt ? { next_start_retry_at: nextRetryAt, rate_limited: true } : {}),
          },
        }).catch(() => localJob);
        return jobPollPayload(updatedJob, {
          ticker: symbol || localJob.ticker,
          mode: localJob.mode || "quick",
          status: "queued",
          error: message,
          retryAfterMs: nextRetryAt ? Math.max(0, Date.parse(nextRetryAt) - Date.now()) : 0,
        });
      }
    }
    return jobPollPayload(localJob, {
      ticker: symbol,
      mode: localJob?.mode || "quick",
      status: "queued",
    });
  }

  let job;
  try {
    job = await fetchBackendEquityResearchJob(backendRunId);
  } catch (error) {
    const message = serializedError(error);
    if (localJob) {
      const updatedJob = await updateEquityResearchJob(workspaceId, localJob.id, {
        status: localJob.status === "queued" ? "queued" : "running",
        error: message,
        payload: {
          ...(localJob.payload || {}),
          last_poll_error: message,
          last_poll_at: new Date().toISOString(),
        },
      }).catch(() => localJob);
      return jobPollPayload(updatedJob, {
        ticker: symbol,
        mode: localJob.mode,
        status: updatedJob?.status || "running",
        error: message,
      });
    }
    return {
      ok: false,
      ticker: symbol,
      status: "failed",
      error: message,
    };
  }

  if (job.status === "succeeded" && job.payload) {
    const previousRun = await getLatestEquityResearchRun(workspaceId, symbol).catch(() => null);
    const enrichedPayload = sanitizeResearchPayload(await attachFinalOrchestrator(job.payload));
    const persisted = await persistResearchRun(workspaceId, symbol, enrichedPayload.mode || job.payload.mode || localJob?.mode || "quick", enrichedPayload, previousRun);
    const result = await attachAuroraDecisionSystem(persisted);
    if (localJob) {
      await updateEquityResearchJob(workspaceId, localJob.id, {
        status: "succeeded",
        completedAt: new Date().toISOString(),
        error: null,
        payload: result,
        resultRunId: result?.history?.current_run_id || null,
      }).catch(() => null);
    }
    return result;
  }
  if (job.status === "failed" || job.status === "not_found") {
    if (localJob) {
      await updateEquityResearchJob(workspaceId, localJob.id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        error: job.error || "Research job failed.",
        payload: {
          ...(localJob.payload || {}),
          backend: job,
          error: job.error || "Research job failed.",
        },
      }).catch(() => null);
    }
    return {
      ok: false,
      ticker: symbol,
      status: job.status,
      run_id: localJob?.id || runId,
      backend_run_id: backendRunId,
      error: job.error || "Research job failed.",
    };
  }
  const updatedJob = localJob
    ? await updateEquityResearchJob(workspaceId, localJob.id, {
        status: job.status || "running",
        backendRunId: job.run_id || backendRunId,
        startedAt: job.started_at || localJob.startedAt || null,
        payload: {
          ...(localJob.payload || {}),
          backend: job,
          last_poll_at: new Date().toISOString(),
        },
      }).catch(() => localJob)
    : null;
  return {
    ok: true,
    ticker: symbol,
    mode: updatedJob?.mode || job.mode || "quick",
    status: updatedJob?.status || job.status || "running",
    run_id: updatedJob?.id || runId,
    backend_run_id: updatedJob?.backendRunId || job.run_id || backendRunId,
    started_at: updatedJob?.startedAt || job.started_at || null,
  };
}
