const VARIABLE_ALIASES = {
  revenue_growth: ["revenue_growth", "revenueGrowth", "revenueCagr", "salesGrowth", "growth"],
  operating_margin: ["operating_margin", "operatingMargin", "ebitMargin", "margin"],
  roic: ["roic", "roic_proxy", "returnOnInvestedCapital"],
  reinvestment_rate: ["reinvestment_rate", "reinvestmentRate", "reinvestment", "capexToNopat"],
};

const VARIABLE_DIRECTIONS = {
  revenue_growth: "min",
  operating_margin: "min",
  roic: "min",
  reinvestment_rate: "max",
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numeric(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

function arrayOrEmpty(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function getBeliefObject(input) {
  if (input?.beliefObject?.version === "aurora_priced_belief_object_v1") return input.beliefObject;
  if (input?.version === "aurora_priced_belief_object_v1") return input;
  if (input?.compiled?.beliefObject?.version === "aurora_priced_belief_object_v1") return input.compiled.beliefObject;
  return null;
}

function getMetric(observations = {}, variable) {
  const metrics = observations.metrics || observations.observed || observations;
  const aliases = VARIABLE_ALIASES[variable] || [variable];
  for (const alias of aliases) {
    const value = numeric(metrics?.[alias], null);
    if (isFiniteNumber(value)) {
      return {
        value,
        sourceKey: alias,
      };
    }
  }
  return null;
}

function evaluateNumericFalsifier(falsifier, observations = {}) {
  const threshold = numeric(falsifier.threshold, null);
  const observed = getMetric(observations, falsifier.variable);
  if (!isFiniteNumber(threshold) || !observed) {
    return {
      key: falsifier.key,
      variable: falsifier.variable,
      status: "missing",
      severity: 0,
      threshold,
      observed: observed?.value ?? null,
      message: `No observed ${falsifier.variable} metric available.`,
      sourceNeeded: falsifier.sourceNeeded,
      falsifier,
    };
  }

  const direction = VARIABLE_DIRECTIONS[falsifier.variable] || "min";
  const healthMargin = direction === "max" ? threshold - observed.value : observed.value - threshold;
  const tolerance = Math.max(0.01, Math.abs(threshold) * 0.15);
  const severityBase = Math.abs(healthMargin) / Math.max(0.012, Math.abs(threshold) * 0.35 + 0.015);
  const failed = healthMargin < 0;
  const watched = !failed && healthMargin <= tolerance;

  return {
    key: falsifier.key,
    variable: falsifier.variable,
    direction,
    status: failed ? "tripped" : watched ? "watch" : "intact",
    severity: failed ? clamp(severityBase, 0.05, 1) : watched ? clamp(0.25 + (1 - healthMargin / tolerance) * 0.45, 0.25, 0.7) : 0,
    threshold,
    observed: observed.value,
    observedSourceKey: observed.sourceKey,
    healthMargin,
    horizon: falsifier.horizon,
    sourceNeeded: falsifier.sourceNeeded,
    message: failed
      ? `${falsifier.variable} breached the falsifier threshold.`
      : watched
        ? `${falsifier.variable} is near the falsifier threshold.`
        : `${falsifier.variable} is still above the falsifier threshold.`,
    falsifier,
  };
}

function evidenceRiskChecks(evidence = {}) {
  const textSignals = evidence.textSignals || evidence.signals || {};
  const riskFlags = arrayOrEmpty(evidence.riskFlags || evidence.risks);
  const checks = [];

  const marginPressure = numeric(textSignals.marginPressure, null);
  if (isFiniteNumber(marginPressure) && marginPressure >= 0.62) {
    checks.push({
      key: "evidence_margin_pressure",
      variable: "operating_margin",
      status: marginPressure >= 0.76 ? "tripped" : "watch",
      severity: clamp((marginPressure - 0.55) / 0.4, 0.2, 1),
      message: "New evidence points to margin pressure.",
      evidenceValue: marginPressure,
    });
  }

  const demandVisibility = numeric(textSignals.demandVisibility, null);
  if (isFiniteNumber(demandVisibility) && demandVisibility <= 0.35) {
    checks.push({
      key: "evidence_demand_visibility",
      variable: "revenue_growth",
      status: demandVisibility <= 0.24 ? "tripped" : "watch",
      severity: clamp((0.42 - demandVisibility) / 0.35, 0.2, 1),
      message: "New evidence weakens demand visibility.",
      evidenceValue: demandVisibility,
    });
  }

  const pricingPower = numeric(textSignals.pricingPower, null);
  if (isFiniteNumber(pricingPower) && pricingPower <= 0.35) {
    checks.push({
      key: "evidence_pricing_power",
      variable: "operating_margin",
      status: pricingPower <= 0.24 ? "tripped" : "watch",
      severity: clamp((0.42 - pricingPower) / 0.35, 0.2, 1),
      message: "New evidence weakens pricing power.",
      evidenceValue: pricingPower,
    });
  }

  const accountingTrust = numeric(textSignals.accountingTrust, null);
  if (isFiniteNumber(accountingTrust) && accountingTrust <= 0.42) {
    checks.push({
      key: "evidence_accounting_trust",
      variable: "accounting_quality",
      status: accountingTrust <= 0.28 ? "tripped" : "watch",
      severity: clamp((0.5 - accountingTrust) / 0.45, 0.2, 1),
      message: "New evidence weakens accounting trust.",
      evidenceValue: accountingTrust,
    });
  }

  riskFlags.forEach((risk, index) => {
    const severity = clamp(numeric(risk.severity, 0.5), 0, 1);
    if (severity >= 0.6) {
      checks.push({
        key: `risk_flag_${risk.key || index}`,
        variable: risk.key || "risk_flag",
        status: severity >= 0.78 ? "tripped" : "watch",
        severity,
        message: risk.text || "New evidence risk flag requires review.",
        evidenceValue: severity,
      });
    }
  });

  return checks.sort((a, b) => b.severity - a.severity);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthsBetween(start, end) {
  if (!start || !end) return null;
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
}

function evaluateStaleness(beliefObject, observations = {}, options = {}) {
  const asOf = parseDate(options.asOfDate || observations.asOfDate || new Date().toISOString());
  const beliefDate = parseDate(beliefObject.date);
  const halfLifeMonths = numeric(beliefObject.monitoringPlan?.thesisHalfLifeMonths, numeric(beliefObject.thesisHalfLife?.months, null));
  const ageMonths = monthsBetween(beliefDate, asOf);
  if (!isFiniteNumber(ageMonths) || !isFiniteNumber(halfLifeMonths)) {
    return {
      stale: false,
      ageMonths: null,
      halfLifeMonths,
      status: "unknown",
      message: "Could not evaluate thesis age.",
    };
  }
  return {
    stale: ageMonths > halfLifeMonths,
    ageMonths,
    halfLifeMonths,
    status: ageMonths > halfLifeMonths ? "stale" : ageMonths > halfLifeMonths * 0.75 ? "refresh_soon" : "fresh",
    message:
      ageMonths > halfLifeMonths
        ? "Thesis half-life expired; refresh the belief object."
        : ageMonths > halfLifeMonths * 0.75
          ? "Thesis is nearing its evidence refresh window."
          : "Thesis is inside its evidence refresh window.",
  };
}

function aggregateStatus(numericChecks, evidenceChecks, staleness) {
  const allChecks = [...numericChecks, ...evidenceChecks];
  const tripped = allChecks.filter((check) => check.status === "tripped");
  const watch = allChecks.filter((check) => check.status === "watch");
  const missing = numericChecks.filter((check) => check.status === "missing");
  const maxSeverity = allChecks.reduce((max, check) => Math.max(max, check.severity || 0), 0);

  if (tripped.length) return { status: "tripped", confidence: clamp(0.62 + maxSeverity * 0.32, 0, 0.96), tripped, watch, missing };
  if (watch.length) return { status: "deteriorating", confidence: clamp(0.48 + maxSeverity * 0.28, 0, 0.86), tripped, watch, missing };
  if (staleness.stale) return { status: "stale", confidence: 0.62, tripped, watch, missing };
  if (missing.length === numericChecks.length && !evidenceChecks.length) return { status: "insufficient_observations", confidence: 0.35, tripped, watch, missing };
  return { status: "intact", confidence: 0.72, tripped, watch, missing };
}

export function monitorAuroraThesis(input = {}, observations = {}, options = {}) {
  const beliefObject = getBeliefObject(input);
  if (!beliefObject) {
    throw new Error("monitorAuroraThesis requires an aurora_priced_belief_object_v1 or compiler output with beliefObject.");
  }
  const falsifiers = arrayOrEmpty(beliefObject.falsifiers);
  const numericChecks = falsifiers.map((falsifier) => evaluateNumericFalsifier(falsifier, observations));
  const evidenceChecks = evidenceRiskChecks(observations.evidence || observations);
  const staleness = evaluateStaleness(beliefObject, observations, options);
  const aggregate = aggregateStatus(numericChecks, evidenceChecks, staleness);
  const action =
    aggregate.status === "tripped"
      ? "re-underwrite_or_reject_thesis"
      : aggregate.status === "deteriorating"
        ? "collect_evidence_and_update_belief_object"
        : aggregate.status === "stale"
          ? "refresh_belief_object"
          : aggregate.status === "insufficient_observations"
            ? "collect_required_observations"
            : "continue_monitoring";

  return {
    version: "aurora_thesis_monitor_v1",
    ticker: beliefObject.ticker,
    name: beliefObject.name,
    monitoredAt: options.monitoredAt || new Date().toISOString(),
    status: aggregate.status,
    confidence: aggregate.confidence,
    action,
    trippedCount: aggregate.tripped.length,
    watchCount: aggregate.watch.length,
    missingCount: aggregate.missing.length,
    checks: numericChecks,
    evidenceChecks,
    staleness,
    topIssues: [...aggregate.tripped, ...aggregate.watch, ...(staleness.stale ? [staleness] : [])].slice(0, 5),
    memo: {
      headline:
        aggregate.status === "tripped"
          ? "At least one thesis falsifier has tripped."
          : aggregate.status === "deteriorating"
            ? "The thesis is not broken, but evidence is deteriorating."
            : aggregate.status === "stale"
              ? "The thesis needs a refresh before interpretation."
              : aggregate.status === "insufficient_observations"
                ? "The monitor lacks enough observations to judge the thesis."
                : "The thesis remains intact under current observations.",
      nextAction: action,
      mainIssue: [...aggregate.tripped, ...aggregate.watch][0]?.message || staleness.message,
    },
  };
}

export function monitorAuroraThesisPanel(items = [], options = {}) {
  const rows = arrayOrEmpty(items).map((item) => {
    const input = item.compiled || item.beliefObject || item.input || item;
    const observations = item.observations || item.metrics || {};
    return monitorAuroraThesis(input, observations, options);
  });
  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  return {
    version: "aurora_thesis_monitor_panel_v1",
    count: rows.length,
    counts,
    trippedShare: rows.length ? (counts.tripped || 0) / rows.length : 0,
    rows,
  };
}
