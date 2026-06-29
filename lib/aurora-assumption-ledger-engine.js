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

function mean(values) {
  const clean = values.filter(isFiniteNumber);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getMetric(observations = {}, driver) {
  const metrics = observations.metrics || observations;
  const aliases = {
    revenue_growth: ["revenue_growth", "revenueGrowth", "growth", "revenueCagr"],
    gross_margin: ["gross_margin", "grossMargin"],
    operating_margin: ["operating_margin", "operatingMargin", "margin", "terminalMargin"],
    margin: ["margin", "operating_margin", "operatingMargin"],
    roic: ["roic", "roiic", "returnOnInvestedCapital"],
    reinvestment_rate: ["reinvestment_rate", "reinvestmentRate", "reinvestment"],
    wacc: ["wacc", "discountRate", "costOfCapital"],
    terminal_growth: ["terminal_growth", "terminalGrowth"],
    price: ["price", "marketPrice"],
  }[driver] || [driver];
  for (const alias of aliases) {
    const value = numeric(metrics?.[alias], null);
    if (isFiniteNumber(value)) return value;
  }
  return null;
}

const VARIABLE_DIRECTIONS = {
  revenue_growth: "min",
  gross_margin: "min",
  operating_margin: "min",
  margin: "min",
  roic: "min",
  reinvestment_rate: "max",
  wacc: "max",
  terminal_growth: "max",
};

function normalizeFalsifier(raw, driver) {
  if (!raw) return [];
  const items = arrayOrEmpty(raw);
  return items.map((item, index) => {
    if (typeof item === "string") {
      return {
        id: `${driver}_falsifier_${index + 1}`,
        text: item,
        variable: driver,
        threshold: null,
        direction: "textual",
      };
    }
    return {
      id: item.id || item.key || `${driver}_falsifier_${index + 1}`,
      text: item.text || item.message || item.description || `${driver} falsifier`,
      variable: item.variable || driver,
      threshold: numeric(item.threshold, null),
      direction: item.direction || VARIABLE_DIRECTIONS[item.variable || driver] || "min",
      horizon: item.horizon || null,
      sourceNeeded: item.sourceNeeded || item.evidence || null,
    };
  });
}

function normalizeDistribution(record = {}) {
  const meanValue = numeric(record.priorMean, numeric(record.mean, numeric(record.p50, numeric(record.value, null))));
  const sd = numeric(record.priorSd, numeric(record.sd, numeric(record.spread, null)));
  const p10 = numeric(record.p10, isFiniteNumber(meanValue) && isFiniteNumber(sd) ? meanValue - 1.2816 * sd : null);
  const p90 = numeric(record.p90, isFiniteNumber(meanValue) && isFiniteNumber(sd) ? meanValue + 1.2816 * sd : null);
  return {
    distribution: record.distribution || record.distributionType || "triangular_or_normal_proxy",
    priorMean: meanValue,
    priorSd: sd,
    p10,
    p50: numeric(record.p50, meanValue),
    p90,
  };
}

function normalizeAssumption(record = {}, index = 0, defaults = {}) {
  const driver = firstText(record.driver, record.key, record.variable, record.name, `assumption_${index + 1}`);
  const distribution = normalizeDistribution(record);
  const falsifiers = normalizeFalsifier(record.falsifier || record.falsifiers || record.tripwires, driver);
  const dependencies = arrayOrEmpty(record.dependencies || record.dependsOn).map(String);
  return {
    id: record.id || `${driver}_${index + 1}`,
    driver,
    asOf: record.asOf || record.as_of || defaults.asOf || null,
    distribution: distribution.distribution,
    priorMean: distribution.priorMean,
    priorSd: distribution.priorSd,
    p10: distribution.p10,
    p50: distribution.p50,
    p90: distribution.p90,
    source: firstText(record.source, record.sourceId, record.sourceLineage, defaults.source, null),
    economicMechanism: firstText(record.economicMechanism, record.mechanism, defaults.economicMechanism, null),
    dependencies,
    falsifiers,
    owner: firstText(record.owner, defaults.owner, null),
    evidence: record.evidence || record.evidenceSummary || null,
    currentValue: numeric(record.currentValue, numeric(record.actual, null)),
    previousMean: numeric(record.previousMean, numeric(record.previousPriorMean, null)),
    previousSd: numeric(record.previousSd, null),
  };
}

function distributionFromPosterior(driver, forecast) {
  const keyMap = {
    revenue_growth: "growth",
    margin: "margin",
    operating_margin: "margin",
    roic: "roic",
    reinvestment_rate: "reinvestment",
    wacc: "wacc",
    terminal_growth: "terminalGrowth",
  };
  const dist = forecast?.posterior?.[keyMap[driver] || driver];
  if (!dist) return {};
  return {
    distribution: "posterior_proxy",
    priorMean: numeric(dist.mean, numeric(dist.p50, null)),
    priorSd: numeric(dist.sd, null),
    p10: numeric(dist.p10, null),
    p50: numeric(dist.p50, numeric(dist.mean, null)),
    p90: numeric(dist.p90, null),
  };
}

function sourceForDriver(compiled, driver) {
  const lineageKey = {
    revenue_growth: "revenueCagr",
    margin: "margin",
    operating_margin: "margin",
    roic: "roic",
    reinvestment_rate: "reinvestment",
    wacc: "wacc",
    terminal_growth: "wacc",
    price: "price",
  }[driver] || driver;
  return compiled?.sourceLineage?.[lineageKey]?.source || null;
}

function defaultFalsifierForDriver(driver) {
  return {
    revenue_growth: {
      text: "Two reporting periods below the underwriting growth path without a mix or cycle explanation.",
      variable: "revenue_growth",
      threshold: null,
      direction: "textual",
      sourceNeeded: "revenue bridge, backlog, orders, segment disclosures",
    },
    operating_margin: {
      text: "Two quarters of margin compression without temporary cost or mix explanation.",
      variable: "operating_margin",
      threshold: null,
      direction: "textual",
      sourceNeeded: "gross margin bridge, price/mix disclosures, input-cost commentary",
    },
    roic: {
      text: "Incremental ROIC falls below WACC for a sustained period.",
      variable: "roic",
      threshold: null,
      direction: "textual",
      sourceNeeded: "NOPAT, invested capital bridge, acquisition adjustments",
    },
    reinvestment_rate: {
      text: "Growth requires materially more reinvestment than the assumed runway allows.",
      variable: "reinvestment_rate",
      threshold: null,
      direction: "textual",
      sourceNeeded: "capex, working capital, R&D capitalization, acquisition spend",
    },
    wacc: {
      text: "Risk-free rate, spread, beta, or leverage regime changes enough to invalidate discount assumptions.",
      variable: "wacc",
      threshold: null,
      direction: "textual",
      sourceNeeded: "rates, beta, credit spreads, capital structure",
    },
    terminal_growth: {
      text: "Terminal growth exceeds plausible nominal maturity or reinvestment capacity.",
      variable: "terminal_growth",
      threshold: null,
      direction: "textual",
      sourceNeeded: "inflation, market maturity, reinvestment runway",
    },
  }[driver] || {
    text: `${driver} assumption no longer matches observable evidence.`,
    variable: driver,
    threshold: null,
    direction: "textual",
    sourceNeeded: "updated source evidence",
  };
}

function deriveAssumptions(input = {}, options = {}) {
  const forecast = input.forecast || {};
  const compiled = input.compiled || {};
  const driverGraph = input.driverGraph || {};
  const beliefObject = input.beliefObject || compiled.beliefObject || {};
  const falsifiers = arrayOrEmpty(beliefObject.falsifiers);
  const graphNodes = arrayOrEmpty(driverGraph.nodes);
  const nodeById = Object.fromEntries(graphNodes.map((node) => [node.id, node]));
  const drivers = ["revenue_growth", "operating_margin", "roic", "reinvestment_rate", "wacc", "terminal_growth"];
  return drivers.map((driver, index) => {
    const node = nodeById[driver] || nodeById[driver.replace("operating_", "")] || {};
    const dist = distributionFromPosterior(driver, forecast);
    const driverFalsifiers = falsifiers.filter((item) => item.variable === driver || (driver === "operating_margin" && item.variable === "operating_margin"));
    return normalizeAssumption(
      {
        id: `${driver}_derived`,
        driver,
        asOf: options.asOfDate || compiled.beliefObject?.date || beliefObject.date || null,
        ...dist,
        source: sourceForDriver(compiled, driver) || node.source || "derived from pipeline",
        economicMechanism:
          {
            revenue_growth: "demand_reinvestment_and_capacity",
            operating_margin: "pricing_mix_utilization_and_costs",
            roic: "nopat_and_invested_capital_productivity",
            reinvestment_rate: "growth_capex_working_capital_and_rd",
            wacc: "risk_free_beta_spread_and_capital_structure",
            terminal_growth: "nominal_maturity_anchor",
          }[driver] || "pipeline_driver",
        dependencies:
          {
            revenue_growth: ["demand_visibility", "reinvestment_rate", "capacity_constraint"],
            operating_margin: ["pricing_power", "input_costs", "utilization"],
            roic: ["operating_margin", "asset_turnover", "capital_intensity"],
            reinvestment_rate: ["growth", "roiic", "capital_allocation"],
            wacc: ["risk_free_rate", "beta", "equity_risk_premium"],
            terminal_growth: ["inflation", "maturity", "moat_half_life"],
          }[driver] || [],
        falsifiers: driverFalsifiers.length ? driverFalsifiers : [defaultFalsifierForDriver(driver)],
        owner: options.owner || "unassigned",
      },
      index,
      { owner: options.owner || "unassigned" },
    );
  });
}

function explicitAssumptions(input = {}) {
  return [
    ...arrayOrEmpty(input.assumptionLedger),
    ...arrayOrEmpty(input.assumptionRecords),
    ...arrayOrEmpty(input.assumptions?.ledger),
    ...arrayOrEmpty(input.assumptions?.records),
  ];
}

function completenessChecks(assumption) {
  const missing = [];
  if (!assumption.driver) missing.push("driver");
  if (!assumption.asOf) missing.push("as_of");
  if (!assumption.distribution) missing.push("distribution");
  if (!isFiniteNumber(assumption.priorMean)) missing.push("prior_mean");
  if (!isFiniteNumber(assumption.priorSd) && !isFiniteNumber(assumption.p10) && !isFiniteNumber(assumption.p90)) missing.push("uncertainty");
  if (!assumption.source) missing.push("source");
  if (!assumption.economicMechanism) missing.push("economic_mechanism");
  if (!assumption.dependencies.length) missing.push("dependencies");
  if (!assumption.falsifiers.length) missing.push("falsifier");
  if (!assumption.owner) missing.push("owner");
  return missing;
}

function evaluateFalsifiers(assumption, observations = {}) {
  return assumption.falsifiers.map((falsifier) => {
    const observed = getMetric(observations, falsifier.variable || assumption.driver);
    const threshold = numeric(falsifier.threshold, null);
    if (!isFiniteNumber(observed) || !isFiniteNumber(threshold)) {
      return {
        ...falsifier,
        observed,
        status: "pending_evidence",
      };
    }
    const direction = falsifier.direction || "min";
    const tripped = direction === "max" ? observed > threshold : observed < threshold;
    return {
      ...falsifier,
      observed,
      status: tripped ? "tripped" : "intact",
    };
  });
}

function evaluateAssumption(assumption, observations = {}) {
  const missing = completenessChecks(assumption);
  const observed = getMetric(observations, assumption.driver);
  const falsifierChecks = evaluateFalsifiers(assumption, observations);
  const tripped = falsifierChecks.some((item) => item.status === "tripped");
  const meanValue = numeric(assumption.priorMean, numeric(assumption.p50, null));
  const sd = numeric(assumption.priorSd, isFiniteNumber(assumption.p10) && isFiniteNumber(assumption.p90) ? Math.abs(assumption.p90 - assumption.p10) / 2.5632 : null);
  const zScore = isFiniteNumber(observed) && isFiniteNumber(meanValue) && isFiniteNumber(sd) && sd > 1e-9 ? (observed - meanValue) / sd : null;
  const previousDelta =
    isFiniteNumber(assumption.previousMean) && isFiniteNumber(meanValue) ? meanValue - assumption.previousMean : null;
  const updateRecommendation = tripped
    ? "falsifier_tripped_reunderwrite"
    : isFiniteNumber(zScore) && Math.abs(zScore) > 1.8
      ? "update_mean_and_uncertainty"
      : isFiniteNumber(zScore) && Math.abs(zScore) > 1.1
        ? "widen_uncertainty_or_wait_for_confirmation"
        : isFiniteNumber(previousDelta) && Math.abs(previousDelta) > Math.max(0.01, Math.abs(meanValue || 0) * 0.12)
          ? "explain_assumption_change"
          : "no_material_update";
  return {
    ...assumption,
    completeness: {
      missing,
      score: clamp(1 - missing.length / 9, 0, 1),
    },
    observed,
    zScore,
    previousDelta,
    falsifierChecks,
    updateRecommendation,
    status: tripped ? "falsifier_tripped" : missing.length ? "incomplete" : updateRecommendation === "no_material_update" ? "current" : "needs_review",
  };
}

function valueBridge(input = {}, ledger = []) {
  const bridge = input.valuationBridge || input.valueBridge || {};
  const explicit = {
    business: numeric(bridge.business, numeric(bridge.businessChange, null)),
    discount: numeric(bridge.discount, numeric(bridge.discountRateChange, null)),
    price: numeric(bridge.price, numeric(bridge.priceChange, null)),
  };
  if (Object.values(explicit).some(isFiniteNumber)) return explicit;

  const driverImpact = ledger.reduce(
    (acc, item) => {
      const change = numeric(item.previousDelta, null);
      if (!isFiniteNumber(change)) return acc;
      if (["wacc", "terminal_growth"].includes(item.driver)) acc.discount += Math.abs(change);
      else if (item.driver === "price") acc.price += Math.abs(change);
      else acc.business += Math.abs(change);
      return acc;
    },
    { business: 0, discount: 0, price: 0 },
  );
  return driverImpact;
}

function buildSummary(ledger, bridge) {
  const incomplete = ledger.filter((item) => item.status === "incomplete");
  const tripped = ledger.filter((item) => item.status === "falsifier_tripped");
  const needsReview = ledger.filter((item) => item.status === "needs_review");
  const completeness = mean(ledger.map((item) => item.completeness.score)) ?? 0;
  const bridgeTotal = Math.abs(numeric(bridge.business, 0)) + Math.abs(numeric(bridge.discount, 0)) + Math.abs(numeric(bridge.price, 0));
  return {
    assumptionCount: ledger.length,
    completeness,
    incompleteCount: incomplete.length,
    reviewCount: needsReview.length,
    trippedFalsifierCount: tripped.length,
    changedAssumptions: ledger.filter((item) => item.updateRecommendation !== "no_material_update").map((item) => item.driver),
    valuationBridge: {
      ...bridge,
      dominantSource:
        bridgeTotal > 0
          ? Object.entries(bridge).sort((a, b) => Math.abs(numeric(b[1], 0)) - Math.abs(numeric(a[1], 0)))[0]?.[0] || null
          : null,
    },
  };
}

function decisionFromSummary(summary) {
  if (!summary.assumptionCount) return "assumption_ledger_pending";
  if (summary.trippedFalsifierCount > 0) return "assumption_falsifier_tripped";
  if (summary.completeness < 0.72 || summary.incompleteCount > Math.max(1, summary.assumptionCount * 0.34)) return "assumption_ledger_incomplete";
  if (summary.reviewCount > 0) return "assumption_update_required";
  return "assumption_ledger_usable";
}

export function buildAuroraAssumptionLedgerEngine(input = {}, options = {}) {
  const explicit = explicitAssumptions(input);
  const rawLedger = explicit.length ? explicit.map((record, index) => normalizeAssumption(record, index, options)) : deriveAssumptions(input, options);
  const observations = input.observations || input.latestObservations || {};
  const ledger = rawLedger.map((assumption) => evaluateAssumption(assumption, observations));
  const bridge = valueBridge(input, ledger);
  const summary = buildSummary(ledger, bridge);
  const decision = decisionFromSummary(summary);

  return {
    version: "aurora_assumption_ledger_engine_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    decision,
    ledger,
    summary,
    reviewQuestions: [
      "Which assumptions changed?",
      "Which evidence modified them?",
      "Should the mean change, or only uncertainty?",
      "Did a falsifier occur?",
      "Did valuation change because of business, discount rate, or price?",
    ],
    memo: {
      headline: `Assumption ledger is ${decision.replaceAll("_", " ")}.`,
      assumptionCount: summary.assumptionCount,
      completeness: summary.completeness,
      changedAssumptions: summary.changedAssumptions,
      dominantValuationBridgeSource: summary.valuationBridge.dominantSource,
    },
  };
}
