const LENS_STATUS = Object.freeze({
  SUPPORTED: "supported",
  PARTIAL: "partial",
  UNRESOLVED: "unresolved",
  FAILED: "failed",
});

const ACTION_PRIORITY = Object.freeze({
  deepen: 0,
  wait_trigger: 1,
  abstain: 2,
  reject: 3,
});

function finite(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number) ? number : null;
}

function dated(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").slice(0, 10));
}

function explicitScenario(value) {
  return value
    && typeof value.condition === "string"
    && value.condition.trim().length >= 8
    && finite(value.returnPct) !== null
    && Number.isInteger(finite(value.horizonMonths))
    && finite(value.horizonMonths) >= 3
    && finite(value.horizonMonths) <= 60
    && finite(value.probability) !== null
    && finite(value.probability) >= 0
    && finite(value.probability) <= 1;
}

function isSecUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && ["sec.gov", "www.sec.gov", "data.sec.gov"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function futureDatedRecognition(recognition = {}, priceDate) {
  if (!String(recognition.event || "").trim() || !dated(recognition.date) || !String(recognition.source || "").trim() || !dated(priceDate)) return false;
  const eventDate = Date.parse(String(recognition.date).slice(0, 10));
  const observationDate = Date.parse(String(priceDate).slice(0, 10));
  const maximumDate = observationDate + (366 * 2 * 24 * 60 * 60 * 1000);
  return eventDate > observationDate && eventDate <= maximumDate;
}

function coherentPayoff(scenarios = {}) {
  if (!["bear", "base", "bull"].every((key) => explicitScenario(scenarios[key]))) return false;
  const bear = scenarios.bear;
  const base = scenarios.base;
  const bull = scenarios.bull;
  const sameHorizon = bear.horizonMonths === base.horizonMonths && base.horizonMonths === bull.horizonMonths;
  const ordered = finite(bear.returnPct) < finite(base.returnPct) && finite(base.returnPct) < finite(bull.returnPct);
  const signCoherent = finite(bear.returnPct) < 0 && finite(bull.returnPct) > 0;
  const probabilitySum = finite(bear.probability) + finite(base.probability) + finite(bull.probability);
  return sameHorizon && ordered && signCoherent && Math.abs(probabilitySum - 1) <= 0.001;
}

export function deriveImpliedFcfGrowthFromYield({ fcfYield, requiredReturn = 0.1 } = {}) {
  const yieldValue = finite(fcfYield);
  const hurdle = finite(requiredReturn);
  if (yieldValue === null || hurdle === null || yieldValue <= -1 || hurdle <= 0) return null;
  return (hurdle - yieldValue) / (1 + yieldValue);
}

export function deriveFactorLabResearchDecision(row = {}) {
  const gateReasons = Array.isArray(row.gateReasons) ? row.gateReasons.filter(Boolean) : [];
  const structuralFailure = gateReasons.some((reason) => /cash runway critical|extreme dilution|red flags dominate|out of scope/i.test(reason));
  const evidenceCoverage = finite(row.dataCompleteness) ?? 0;
  const hasDatedFundamentals = dated(row.fundamentalsDate) && dated(row.priceDate);
  const hasPrimaryFundamentals = Boolean(
    row.fundamentalsDateType === "filed"
    && isSecUrl(row.primaryEvidence?.fundamentalsUrl)
    && isSecUrl(row.primaryEvidence?.filingUrl)
    && /^\d{10}-\d{2}-\d{6}$/.test(String(row.primaryEvidence?.filingAccession || "")),
  );

  let evidenceStatus = LENS_STATUS.UNRESOLVED;
  if (structuralFailure) evidenceStatus = LENS_STATUS.FAILED;
  else if (!gateReasons.length && evidenceCoverage >= 0.85 && hasDatedFundamentals && hasPrimaryFundamentals) evidenceStatus = LENS_STATUS.SUPPORTED;
  else if (evidenceCoverage >= 0.55 && hasDatedFundamentals) evidenceStatus = LENS_STATUS.PARTIAL;

  const impliedFcfGrowth = deriveImpliedFcfGrowthFromYield({
    fcfYield: row.normalizedFcfYield,
    requiredReturn: row.requiredReturn ?? 0.1,
  });
  const perception = row.marketPerception || {};
  const normalizedYears = finite(row.normalizedFcfYears);
  const perceptionVerified = perception.status === "verified"
    && dated(perception.asOf)
    && dated(row.priceDate)
    && String(perception.asOf).slice(0, 10) <= String(row.priceDate).slice(0, 10)
    && String(perception.source || "").trim();
  const normalizedCash = impliedFcfGrowth !== null && finite(row.normalizedFcfYield) > 0 && normalizedYears >= 3;
  const trailingCashAvailable = finite(row.fcfYield) > 0;
  const mispricingStatus = normalizedCash && perceptionVerified
    ? LENS_STATUS.SUPPORTED
    : trailingCashAvailable || normalizedCash
      ? LENS_STATUS.PARTIAL
      : LENS_STATUS.UNRESOLVED;

  const recognition = row.recognitionPath || {};
  const hasDatedRecognition = futureDatedRecognition(recognition, row.priceDate);
  const recognitionStatus = hasDatedRecognition
    ? LENS_STATUS.SUPPORTED
    : (String(row.whyNow || "").trim() || String(recognition.event || "").trim())
      ? LENS_STATUS.PARTIAL
      : LENS_STATUS.UNRESOLVED;

  const scenarios = row.scenarioInputs || {};
  const hasExplicitPayoff = coherentPayoff(scenarios);
  const payoffStatus = hasExplicitPayoff ? LENS_STATUS.SUPPORTED : LENS_STATUS.UNRESOLVED;

  let action = "abstain";
  if (structuralFailure) action = "reject";
  else if (gateReasons.length) action = "abstain";
  else if ([evidenceStatus, mispricingStatus, recognitionStatus, payoffStatus].every((status) => status === LENS_STATUS.SUPPORTED)) action = "deepen";
  else if ([LENS_STATUS.SUPPORTED, LENS_STATUS.PARTIAL].includes(evidenceStatus) && [LENS_STATUS.SUPPORTED, LENS_STATUS.PARTIAL].includes(mispricingStatus)) action = "wait_trigger";

  const unresolved = [];
  if (evidenceStatus !== LENS_STATUS.SUPPORTED) unresolved.push("evidence");
  if (mispricingStatus !== LENS_STATUS.SUPPORTED) unresolved.push("mispricing");
  if (recognitionStatus !== LENS_STATUS.SUPPORTED) unresolved.push("recognition");
  if (payoffStatus !== LENS_STATUS.SUPPORTED) unresolved.push("payoff");

  return {
    version: "four-lens-v4",
    action,
    priority: ACTION_PRIORITY[action],
    lenses: {
      evidence: {
        status: evidenceStatus,
        coverage: evidenceCoverage,
        reason: structuralFailure
          ? "A structural hard gate failed."
          : hasDatedFundamentals
            ? "Fundamentals and price observations are dated."
            : "Dated primary evidence is incomplete.",
      },
      mispricing: {
        status: mispricingStatus,
        impliedFcfGrowth,
        requiredReturn: finite(row.requiredReturn) ?? 0.1,
        reason: impliedFcfGrowth === null
          ? "Normalized multi-year cash yield is unavailable; expectations cannot be tested."
          : mispricingStatus === LENS_STATUS.SUPPORTED
            ? "Normalized multi-year cash yield and dated market-perception evidence support a testable expectations gap."
            : "Trailing cash yield is only a valuation clue; normalization and dated market-perception evidence are still required.",
      },
      recognition: {
        status: recognitionStatus,
        event: recognition.event || null,
        date: recognition.date || null,
        source: recognition.source || null,
        reason: hasDatedRecognition
          ? "A future, dated, sourced recognition event is present."
          : "The narrative lacks a future, dated, sourced recognition path.",
      },
      payoff: {
        status: payoffStatus,
        scenarios: hasExplicitPayoff ? scenarios : null,
        reason: hasExplicitPayoff
          ? "Bear, base, and bull outcomes are ordered, share a horizon, and have probabilities summing to one."
          : "Payoff remains unresolved until scenarios are ordered, time-consistent, and probabilistically coherent.",
      },
    },
    unresolved,
  };
}

export const factorLabResearchActionPriority = ACTION_PRIORITY;
export const factorLabLensStatus = LENS_STATUS;
