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

function cleanTextList(value, limit = 8) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean).slice(0, limit) : [];
}

function safePublicValuationReason(value, fallback) {
  const reason = cleanText(value);
  if (!reason || reason.length > 280) return fallback;
  if (/\d|[$€£¥]/.test(reason)) return fallback;
  if (/\b(?:fair\s*value|midpoint|target\s*price|price\s*objective|valor\s+(?:central|base|objetivo))\b/i.test(reason)) {
    return fallback;
  }
  return reason;
}

function validCurrency(value) {
  const currency = cleanText(value).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function validDate(value) {
  const date = cleanText(value);
  return date && Number.isFinite(Date.parse(date)) ? date : null;
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
  return {
    status: cleanText(validation.status).toLowerCase() || "unknown",
    usable: validation.usable === true,
    sources: cleanTextList(validation.sources || (validation.source ? [validation.source] : [])),
  };
}

export function buildDownstreamValuationContext(bundle) {
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
  const backed = canonical
    && presentation.backed === true
    && rawStatus === "decision_ready"
    && reliability.usable === true
    && reliability.status === "high"
    && priceValidation.status === "validated"
    && priceValidation.usable === true
    && validatedPrice !== null
    && validatedPrice > 0;
  const primaryMethod = canonical ? cleanText(valuation.primary_method) || null : null;
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
    return severity === "high" && !expectedCodes.has(code);
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

function sanitizeUnbackedValuation(value, { researchRangeVisible = false } = {}) {
  const valuation = value && typeof value === "object" ? value : {};
  const rawReliability = sanitizedReliability(valuation.reliability);
  const methods = Array.isArray(valuation.methods) ? valuation.methods : [];
  const blockedFallback = "La valoración no supera todavía los controles necesarios para publicar cifras.";
  return {
    model_version: valuation.model_version === INSTITUTIONAL_MODEL_VERSION ? INSTITUTIONAL_MODEL_VERSION : null,
    available: valuation.available === true,
    status: cleanText(valuation.status).toLowerCase() || "not_decision_ready",
    archetype: cleanText(valuation.archetype) || null,
    primary_method: cleanText(valuation.primary_method) || null,
    cash_flow_basis: cleanText(valuation.cash_flow_basis) || null,
    currency: validCurrency(valuation.currency),
    market_data_as_of: validDate(valuation.market_data_as_of),
    financial_data_as_of: validDate(valuation.financial_data_as_of),
    current_price: null,
    reason: researchRangeVisible
      ? "Se publica un rango de investigación; el valor central permanece retenido hasta completar todos los controles."
      : safePublicValuationReason(valuation.reason, blockedFallback),
    precision_withheld: true,
    range: safeResearchRange(valuation.range, researchRangeVisible),
    selected_value: null,
    scenarios: [],
    methods: methods.map((method) => ({
      key: cleanText(method?.key) || null,
      role: cleanText(method?.role) || null,
      weight: 0,
      currency: validCurrency(method?.currency),
      value_per_share: null,
    })),
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
    reliability: {
      usable: researchRangeVisible,
      status: researchRangeVisible ? "medium" : "blocked",
      score: rawReliability.score,
      reasons: researchRangeVisible ? ["Rango orientativo disponible para investigación."] : [],
      limitations: ["No se publica un valor central hasta completar precio independiente, método y auditoría."],
    },
  };
}

function sanitizeUnbackedDataPoints(value) {
  if (!Array.isArray(value)) return [];
  return value.map((point) => {
    const metric = cleanText(point?.metric);
    const sensitive = SENSITIVE_VALUATION_METRIC.test(normalizedMetric(metric));
    return {
      metric,
      raw_value: sensitive ? null : (typeof point?.raw_value === "number" || typeof point?.raw_value === "string" ? point.raw_value : null),
      normalized_value: sensitive ? null : numberOrNull(point?.normalized_value),
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
  const valuation = sanitizeUnbackedValuation(payload.valuation, { researchRangeVisible });
  const rawSources = payload.sources && typeof payload.sources === "object" ? payload.sources : {};
  const coverage = sanitizeCoverage(rawSources.coverage || payload?.audit?.coverage);
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
    records: sanitizeSourceRecords(rawSources.records),
    data_points: sanitizeUnbackedDataPoints(rawSources.data_points),
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
    annual: (Array.isArray(financials.annual) ? financials.annual : []).slice(0, 12).map((row) => ({
      date: validDate(row?.date),
      period: cleanText(row?.period) || null,
      fiscal_year: numberOrNull(row?.fiscal_year),
    })),
    ratios: Object.fromEntries(ratioKeys.map((key) => [key, numberOrNull(ratios[key])])),
    quality_flags: (Array.isArray(financials.quality_flags) ? financials.quality_flags : []).slice(0, 24).map((flag) => ({
      severity: cleanText(flag?.severity).toLowerCase() || "info",
      title: cleanText(flag?.title) || "Control de calidad pendiente",
      metric: numberOrNull(flag?.metric),
    })),
  };
}

function sanitizePublicSourceRecords(value) {
  return (Array.isArray(value) ? value : []).slice(0, 64).map((record) => ({
    source_id: cleanText(record?.source_id) || null,
    provider: cleanText(record?.provider) || null,
    endpoint_or_filing: null,
    retrieved_at: validDate(record?.retrieved_at),
    status: cleanText(record?.status) || null,
    row_count: numberOrNull(record?.row_count),
  }));
}

function sanitizePublicBackedDataPoints(value) {
  return (Array.isArray(value) ? value : []).slice(0, 160).map((point) => ({
    metric: cleanText(point?.metric) || null,
    normalized_value: numberOrNull(point?.normalized_value),
    unit: cleanText(point?.unit) || null,
    source_id: cleanText(point?.source_id) || null,
    claim_tag: cleanText(point?.claim_tag) || null,
  }));
}

function sanitizePublicPriceValidation(value) {
  const validation = sanitizedPriceValidation(value);
  const publicSources = [];
  for (const source of validation.sources) {
    if (/\bfmp\b|financial\s*modeling\s*prep/i.test(source)) publicSources.push("FMP");
    if (/official\s+(?:market\s+)?close|exchange\s+close/i.test(source)) publicSources.push("Cierre oficial de mercado");
  }
  return {
    ...validation,
    sources: [...new Set(publicSources)],
  };
}

function sanitizePublicBackedValuation(payload, valuationContext) {
  const valuation = payload?.valuation && typeof payload.valuation === "object" ? payload.valuation : {};
  return {
    model_version: INSTITUTIONAL_MODEL_VERSION,
    available: true,
    status: "decision_ready",
    archetype: cleanText(valuation.archetype) || null,
    primary_method: valuationContext.primary_method,
    cash_flow_basis: cleanText(valuation.cash_flow_basis) || null,
    currency: valuationContext.currency,
    market_data_as_of: valuationContext.market_data_as_of,
    financial_data_as_of: validDate(valuation.financial_data_as_of),
    current_price: valuationContext.current_price,
    reason: "La valoración supera los controles de precio, método, datos y auditoría requeridos para publicarse.",
    precision_withheld: false,
    range: valuationContext.range,
    selected_value: valuationContext.range?.central ?? null,
    scenarios: [],
    methods: [],
    reverse_dcf: null,
    multiples: null,
    price_validation: sanitizePublicPriceValidation(valuation.price_validation),
    reliability: valuationContext.reliability,
  };
}

function buildPublicResearchReport(ticker, companyProfile, valuation) {
  if (valuation?.status !== "decision_ready") {
    const rangeVisible = numberOrNull(valuation?.range?.low) !== null && numberOrNull(valuation?.range?.high) !== null;
    return sanitizeUnbackedReport("", ticker, rangeVisible);
  }
  const confidence = numberOrNull(valuation?.reliability?.score);
  const range = valuation.range || {};
  return [
    `# ${ticker}`,
    "",
    `## ${companyProfile?.name || "Valoración de empresa"}`,
    "",
    `Rango estimado: ${valuation.currency} ${range.low}–${range.high} por acción.`,
    `Estimación central: ${valuation.currency} ${range.central} por acción.`,
    `Método principal: ${valuation.primary_method || "no disponible"}.`,
    `Datos de mercado: ${valuation.market_data_as_of || "fecha no disponible"}.`,
    confidence === null ? "" : `Confianza de la lectura: ${Math.round(confidence * 100)}%.`,
    "",
    "Esta lectura ordena datos y supuestos; no constituye una recomendación de inversión.",
    "",
  ].filter(Boolean).join("\n");
}

export function sanitizePublicResearchPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const valuationContext = buildDownstreamValuationContext(payload);
  const internalSafePayload = valuationContext.backed ? null : sanitizeResearchPayload(payload);
  const rawSources = (internalSafePayload?.sources || payload.sources) && typeof (internalSafePayload?.sources || payload.sources) === "object"
    ? (internalSafePayload?.sources || payload.sources)
    : {};
  const coverage = sanitizeCoverage(rawSources.coverage || payload?.audit?.coverage);
  const valuation = valuationContext.backed
    ? sanitizePublicBackedValuation(payload, valuationContext)
    : internalSafePayload.valuation;
  const companyProfile = sanitizeCompanyProfile(payload.company_profile);
  const sources = {
    coverage,
    records: sanitizePublicSourceRecords(rawSources.records),
    data_points: valuationContext.backed
      ? sanitizePublicBackedDataPoints(rawSources.data_points)
      : sanitizeUnbackedDataPoints(rawSources.data_points),
    claims: [],
  };
  const audit = sanitizeAudit(internalSafePayload?.audit || payload.audit, coverage);
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
    return persistResearchRun(workspaceId, symbol, reportMode, enrichedPayload, previousRun);
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
    return sanitizeResearchPayload(localJob.payload);
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
    const result = await persistResearchRun(workspaceId, symbol, enrichedPayload.mode || job.payload.mode || localJob?.mode || "quick", enrichedPayload, previousRun);
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
