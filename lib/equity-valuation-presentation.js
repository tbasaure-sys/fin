const INSTITUTIONAL_MODEL_VERSION = "institutional_valuation_v3";
const VERIFIED_PRICE_STATUSES = new Set(["validated"]);
const BLOCKING_AUDIT_SEVERITIES = new Set(["high", "critical", "fatal"]);
const MARKET_DATA_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;
const MARKET_DATA_FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;
const METHOD_LABELS = {
  forward_fcff_dcf: "DCF con flujos esperados",
  forward_fcfe_dcf: "DCF del flujo para accionistas",
  through_cycle_fcff_dcf: "DCF normalizado por ciclo",
  residual_income: "Ingresos residuales",
  normalized_cash_earnings: "Capacidad normalizada de generar caja",
  owner_earnings: "Flujo disponible para accionistas",
  asset_value: "Valor de activos",
  real_options: "Opciones reales",
};

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanList(value) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
}

function methodLabel(value) {
  const raw = typeof value === "string"
    ? value.trim()
    : value && typeof value === "object"
      ? cleanText(value.label || value.name || value.key || value.method)
      : "";
  if (!raw) return "";
  return METHOD_LABELS[raw] || raw.replaceAll("_", " ");
}

function validatedRange(value, { requireCentral = true } = {}) {
  if (!value || typeof value !== "object") return null;
  const low = finiteNumber(value.low);
  const central = finiteNumber(value.central);
  const high = finiteNumber(value.high);
  if (low === null || high === null || (requireCentral && central === null)) return null;
  if (low < 0 || low > high) return null;
  if (central !== null && (low > central || central > high)) return null;
  return { low, central, high };
}

function validatedCurrency(value) {
  const currency = cleanText(value).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "";
}

function hasUsableMarketDate(value, now) {
  const text = cleanText(value);
  const timestamp = Date.parse(text);
  if (!text || !Number.isFinite(timestamp)) return "";
  if (timestamp > now + MARKET_DATA_FUTURE_TOLERANCE_MS) return "";
  if (now - timestamp > MARKET_DATA_MAX_AGE_MS) return "";
  return text;
}

function hasBlockingAuditFinding(audit) {
  return (Array.isArray(audit?.findings) ? audit.findings : []).some((finding) => (
    BLOCKING_AUDIT_SEVERITIES.has(cleanText(finding?.severity).toLowerCase())
  ));
}

function coverageIsBlocking(coverage) {
  if (!coverage || typeof coverage !== "object" || !Object.keys(coverage).length) return false;
  const status = cleanText(coverage.status).toLowerCase();
  const score = finiteNumber(coverage.score);
  const expected = finiteNumber(coverage.expected_metrics);
  const covered = finiteNumber(coverage.covered_expected_metrics);
  const hasRequiredGaps = [
    coverage.missing_expected_metrics,
    coverage.sourced_points_missing_ok_source,
    coverage.calculated_points_missing_formula,
  ].some((value) => Array.isArray(value) && value.length > 0);
  return Boolean(
    (status && !["pass", "complete"].includes(status))
    || (score !== null && score < 85)
    || (expected !== null && covered !== null && covered < expected)
    || hasRequiredGaps,
  );
}

function hasBlockingEvidenceCoverage(research) {
  return [research?.audit?.coverage, research?.sources?.coverage].some(coverageIsBlocking);
}

function firstReason(reliability, fallback) {
  return cleanList(reliability?.reasons)[0] || cleanText(reliability?.reason) || fallback;
}

function blockedPresentation({ legacy = false, reason, reliability = {}, priceValidationStatus = "unknown" }) {
  return {
    state: "not_decision_ready",
    legacy,
    backed: false,
    showValuationFigures: false,
    primaryMetric: null,
    range: null,
    centralValue: null,
    currentPrice: null,
    primaryMethod: null,
    confidence: finiteNumber(reliability?.score),
    currency: null,
    marketDataAsOf: null,
    priceSource: null,
    priceValidationStatus,
    reasons: cleanList(reliability?.reasons),
    limitations: cleanList(reliability?.limitations),
    reason,
    showExecutiveJudgment: false,
    executiveJudgment: "",
  };
}

export function buildEquityValuationPresentation(research, { executiveJudgment = "", now = Date.now() } = {}) {
  const valuation = research?.valuation;
  if (!valuation || valuation.available !== true) {
    return blockedPresentation({
      reason: cleanText(valuation?.reason) || "La valoración aún no tiene datos suficientes.",
      reliability: valuation?.reliability,
      priceValidationStatus: cleanText(valuation?.price_validation?.status) || "unknown",
    });
  }

  const reliability = valuation.reliability;
  if (valuation.model_version !== INSTITUTIONAL_MODEL_VERSION || !reliability || typeof reliability !== "object") {
    return blockedPresentation({
      legacy: true,
      reason: "Esta lectura usa un modelo anterior y debe actualizarse antes de mostrar una valoración.",
      reliability,
      priceValidationStatus: cleanText(valuation?.price_validation?.status) || "unknown",
    });
  }

  const valuationStatus = cleanText(valuation.status).toLowerCase();
  const reliabilityStatus = cleanText(reliability.status).toLowerCase();
  const priceValidation = valuation.price_validation || {};
  const priceValidationStatus = cleanText(priceValidation.status).toLowerCase() || "unknown";
  const priceVerified = priceValidation.usable === true && VERIFIED_PRICE_STATUSES.has(priceValidationStatus);
  const blockingAuditFinding = hasBlockingAuditFinding(research?.audit);
  const blockingEvidenceCoverage = hasBlockingEvidenceCoverage(research);
  const auditPassed = cleanText(research?.audit?.status).toLowerCase() === "pass"
    && !blockingAuditFinding
    && !blockingEvidenceCoverage;
  const range = validatedRange(valuation.range, { requireCentral: valuationStatus === "decision_ready" });
  const primaryMethod = methodLabel(valuation.primary_method);
  const confidence = finiteNumber(reliability.score);
  const currency = validatedCurrency(valuation.currency || research?.company_profile?.currency);
  const marketDataAsOf = hasUsableMarketDate(valuation.market_data_as_of, now);
  const metadataMissing = [
    !range ? "rango" : null,
    !primaryMethod ? "método" : null,
    confidence === null || confidence < 0 || confidence > 1 ? "confianza" : null,
    !currency ? "moneda" : null,
    !marketDataAsOf ? "fecha de mercado vigente" : null,
  ].filter(Boolean);

  if (reliability.usable !== true || reliabilityStatus === "blocked" || valuationStatus === "not_decision_ready") {
    return blockedPresentation({
      reason: firstReason(reliability, "La valoración no supera todavía los controles de fiabilidad."),
      reliability,
      priceValidationStatus,
    });
  }

  if (blockingAuditFinding) {
    return blockedPresentation({
      reason: "La auditoría detectó un hallazgo grave que debe resolverse antes de mostrar esta valoración.",
      reliability,
      priceValidationStatus,
    });
  }

  if (blockingEvidenceCoverage) {
    return blockedPresentation({
      reason: "La cobertura de evidencia o fuentes es insuficiente para mostrar esta valoración.",
      reliability,
      priceValidationStatus,
    });
  }

  if (metadataMissing.length) {
    return blockedPresentation({
      reason: `Falta completar ${metadataMissing.join(", ")} antes de mostrar una valoración.`,
      reliability,
      priceValidationStatus,
    });
  }

  const decisionReady = valuationStatus === "decision_ready" && reliabilityStatus === "high" && priceVerified && auditPassed;
  const researchGrade = valuationStatus === "research_grade";
  if (!decisionReady && !researchGrade) {
    return blockedPresentation({
      reason: valuationStatus === "decision_ready" && !auditPassed
        ? "La auditoría detectó una brecha que debe resolverse antes de usar esta valoración."
        : firstReason(reliability, "La valoración necesita una revisión adicional."),
      reliability,
      priceValidationStatus,
    });
  }

  const state = decisionReady ? "decision_ready" : "research_grade";
  const safeExecutiveJudgment = decisionReady ? cleanText(executiveJudgment) : "";
  const presentedRange = {
    low: range.low,
    central: decisionReady ? range.central : null,
    high: range.high,
  };
  return {
    state,
    legacy: false,
    backed: decisionReady,
    showValuationFigures: true,
    primaryMetric: "range",
    range: presentedRange,
    centralValue: decisionReady ? range.central : null,
    currentPrice: priceVerified ? finiteNumber(valuation.current_price) : null,
    primaryMethod,
    confidence,
    currency,
    marketDataAsOf,
    priceSource: priceVerified
      ? cleanText(priceValidation.source) || cleanList(priceValidation.sources).join(" + ") || null
      : null,
    priceValidationStatus,
    reasons: cleanList(reliability.reasons),
    limitations: cleanList(reliability.limitations),
    reason: firstReason(
      reliability,
      decisionReady
        ? "La valoración supera los controles de datos y método."
        : "La valoración sirve para investigación, pero todavía requiere cautela.",
    ),
    showExecutiveJudgment: Boolean(safeExecutiveJudgment),
    executiveJudgment: safeExecutiveJudgment,
  };
}

export { INSTITUTIONAL_MODEL_VERSION };
