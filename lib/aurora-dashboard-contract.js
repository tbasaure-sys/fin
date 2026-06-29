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

function safeDivide(numerator, denominator, fallback = null) {
  return isFiniteNumber(numerator) && isFiniteNumber(denominator) && Math.abs(denominator) > 1e-9
    ? numerator / denominator
    : fallback;
}

function quantile(values, q) {
  const clean = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (!clean.length) return null;
  const position = (clean.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return clean[low];
  return clean[low] + (clean[high] - clean[low]) * (position - low);
}

function firstFinite(...values) {
  for (const value of values) {
    const parsed = numeric(value, null);
    if (isFiniteNumber(parsed)) return parsed;
  }
  return null;
}

function getCompiled(input = {}) {
  return input.compiled || input.pipeline?.compiled || null;
}

function getDrivers(input = {}) {
  return getCompiled(input)?.drivers || input.drivers || {};
}

function valueRange(input = {}) {
  const probabilistic = input.probabilisticValuation?.valueDistribution || null;
  const calibrated = input.calibrationIntegration?.calibratedValuationEnsemble?.summary?.valueRange || null;
  const ensemble = calibrated || input.valuationEnsemble?.summary?.valueRange || null;
  const forecastValues = arrayOrEmpty(input.forecast?.scenarios).map((scenario) => numeric(scenario.fairValue, null));
  return {
    source: probabilistic ? "probabilistic_valuation" : calibrated ? "calibrated_valuation_ensemble" : ensemble ? "valuation_ensemble" : "forecast_scenarios",
    p10: firstFinite(probabilistic?.p10, ensemble?.p10, quantile(forecastValues, 0.1)),
    p50: firstFinite(
      probabilistic?.p50,
      ensemble?.p50,
      input.calibrationIntegration?.calibratedValuationEnsemble?.summary?.weightedFairValue,
      input.valuationEnsemble?.summary?.weightedFairValue,
      input.forecast?.expectedFairValue,
      quantile(forecastValues, 0.5),
    ),
    p90: firstFinite(probabilistic?.p90, ensemble?.p90, quantile(forecastValues, 0.9)),
  };
}

function marketPrice(input = {}) {
  const drivers = getDrivers(input);
  return firstFinite(drivers.price, input.compiled?.beliefObject?.price, input.beliefObject?.price, input.market?.price);
}

function probabilityValueBelowPrice(input = {}, range = valueRange(input)) {
  const probabilistic = input.probabilisticValuation?.risk?.probabilityValueBelowPrice;
  if (isFiniteNumber(probabilistic)) return clamp(probabilistic, 0, 1);
  const calibrated = input.calibrationIntegration?.riskControls?.negativeReturnProbability;
  if (isFiniteNumber(calibrated)) return clamp(calibrated, 0, 1);
  const price = marketPrice(input);
  const scenarios = arrayOrEmpty(input.forecast?.scenarios);
  if (isFiniteNumber(price) && scenarios.length) {
    const weighted = scenarios.reduce(
      (acc, scenario) => {
        const probability = clamp(numeric(scenario.probability, 0), 0, 1);
        const fairValue = numeric(scenario.fairValue, null);
        if (!isFiniteNumber(fairValue)) return acc;
        return {
          below: acc.below + probability * (fairValue < price ? 1 : 0),
          total: acc.total + probability,
        };
      },
      { below: 0, total: 0 },
    );
    if (weighted.total > 0) return clamp(weighted.below / weighted.total, 0, 1);
  }
  if (!isFiniteNumber(price) || !isFiniteNumber(range.p50)) return null;
  return clamp(price > range.p50 ? 0.68 : 0.32, 0.05, 0.95);
}

function irrFromValue(price, value, years = 5) {
  if (!isFiniteNumber(price) || price <= 0 || !isFiniteNumber(value) || value < 0) return null;
  return Math.pow(value / price, 1 / years) - 1;
}

function irrDistribution(input = {}, range = valueRange(input)) {
  const probabilistic = input.probabilisticValuation?.irrDistribution;
  if (probabilistic) {
    return {
      horizonYears: probabilistic.horizonYears || 5,
      p10: numeric(probabilistic.p10, null),
      p50: numeric(probabilistic.p50, null),
      p90: numeric(probabilistic.p90, null),
      p5: numeric(probabilistic.p5, null),
      p95: numeric(probabilistic.p95, null),
      mean: numeric(probabilistic.mean, null),
    };
  }
  const price = marketPrice(input);
  return {
    horizonYears: 5,
    p10: irrFromValue(price, range.p10),
    p50: irrFromValue(price, range.p50),
    p90: irrFromValue(price, range.p90),
  };
}

function rangeLabel(p10, p90, suffix = "") {
  if (!isFiniteNumber(p10) && !isFiniteNumber(p90)) return null;
  if (isFiniteNumber(p10) && isFiniteNumber(p90)) return `${p10.toFixed(1)}-${p90.toFixed(1)}${suffix}`;
  return `${(p10 ?? p90).toFixed(1)}${suffix}`;
}

function impliedExpectations(input = {}) {
  const cell = input.expectations?.summary?.marketClearingCell || null;
  return {
    revenueCagr: firstFinite(cell?.growth, input.expectations?.summary?.marketImpliedRevenueCagr, input.forecast?.posterior?.growth?.p50),
    terminalMargin: firstFinite(cell?.margin, input.expectations?.summary?.marketImpliedTerminalMargin, input.forecast?.posterior?.margin?.p50),
    feasibility: firstFinite(input.expectations?.summary?.marketClearingFeasibility, input.feasibilityManifold?.summary?.contourScore),
  };
}

function posteriorRoiic(input = {}) {
  const posterior = input.forecast?.posterior?.roic || {};
  const graph = input.driverGraph?.derived || {};
  return {
    p10: firstFinite(posterior.p10, graph.impliedROIIC),
    p50: firstFinite(posterior.p50, graph.impliedROIIC),
    p90: firstFinite(posterior.p90, graph.impliedROIIC),
    label: rangeLabel(firstFinite(posterior.p10, graph.impliedROIIC), firstFinite(posterior.p90, graph.impliedROIIC), ""),
  };
}

function moatHalfLife(input = {}) {
  const years = firstFinite(input.driverGraph?.derived?.moatHalfLifeYears);
  if (!isFiniteNumber(years)) return { years: null, label: null };
  return {
    years,
    label: `${Math.max(0, years - 1.5).toFixed(1)}-${(years + 1.5).toFixed(1)} years`,
  };
}

function dataQuality(input = {}) {
  const score = firstFinite(
    input.sourceGovernance?.summary?.averageTrustScore,
    input.compiled?.driverQuality?.score,
    input.compiled?.drivers?.dataQuality,
  );
  return {
    score,
    level:
      score == null
        ? input.compiled?.driverQuality?.level || "unknown"
        : score >= 0.78
          ? "high"
          : score >= 0.58
            ? "medium"
            : score >= 0.38
              ? "low"
              : "insufficient",
  };
}

function disagreement(input = {}) {
  const raw = firstFinite(
    input.calibrationIntegration?.calibratedValuationEnsemble?.summary?.disagreement,
    input.valuationEnsemble?.summary?.disagreement,
    input.forecast?.uncertainty?.total,
  );
  return {
    score: raw,
    level: raw == null ? "unknown" : raw >= 0.7 ? "high" : raw >= 0.42 ? "medium" : "low",
  };
}

function calibrationAuthority(input = {}) {
  const authority = input.calibrationIntegration?.calibrationAuthority || input.calibration?.calibrationAuthority || null;
  if (!authority) {
    return {
      available: false,
      authorityScore: null,
      evidenceTier: "missing",
      decisionRights: "not_available",
      mode: "missing",
      hardBlocks: [],
      requiredEvidence: ["calibration authority packet"],
    };
  }
  return {
    available: true,
    authorityScore: numeric(authority.authorityScore, null),
    evidenceTier: authority.evidenceTier || "unknown",
    decisionRights: authority.decisionRights || "unknown",
    mode: authority.mode || "unknown",
    scoredRecords: numeric(authority.scoredRecords, null),
    minRecords: numeric(authority.minRecords, null),
    reliability: numeric(authority.reliability, null),
    hardBlocks: authority.hardBlocks || [],
    requiredEvidence: authority.requiredEvidence || [],
  };
}

function dominantDrivers(input = {}) {
  const changed = arrayOrEmpty(input.assumptionLedger?.summary?.changedAssumptions).map((key) => ({
    key,
    source: "assumption_ledger",
    weight: 0.8,
  }));
  const graph = arrayOrEmpty(input.driverGraph?.constraintViolations).map((item) => ({
    key: item.key,
    source: "driver_graph",
    weight: numeric(item.severity, 0.5),
  }));
  const sensitivity = arrayOrEmpty(input.beliefObject?.assumptionBurdenOfProof?.components).map((item) => ({
    key: item.key || item.driver || item.name,
    source: "burden_of_proof",
    weight: Math.abs(numeric(item.contribution, numeric(item.weight, 0))),
  }));
  const all = [...changed, ...graph, ...sensitivity].filter((item) => item.key);
  const byKey = all.reduce((acc, item) => {
    acc[item.key] ||= { key: item.key, weight: 0, sources: [] };
    acc[item.key].weight += Math.abs(numeric(item.weight, 0));
    acc[item.key].sources.push(item.source);
    return acc;
  }, {});
  return Object.values(byKey)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);
}

function visualization(key, title, status, reason, dataRef = null) {
  return { key, title, status, reason, dataRef };
}

function visualizationContract(input = {}) {
  const hasForecast = Boolean(input.forecast?.posterior);
  const hasProbabilistic = Boolean(input.probabilisticValuation?.irrDistribution);
  const hasValueDistribution = Boolean(valueRange(input).p50);
  const hasSurface = Boolean(input.expectations?.surface?.cells?.length);
  const hasManifold = Boolean(input.feasibilityManifold?.annotatedSurface?.cells?.length);
  const hasBridge = Boolean(input.assumptionLedger?.summary?.valuationBridge?.dominantSource);
  const hasGraph = Boolean(input.driverGraph?.nodes?.length && input.driverGraph?.edges?.length);
  const hasAllocation = Boolean(input.capitalAllocation?.summary);
  const hasCalibrationHistory = Boolean(input.calibration?.summary?.scoredRecords);
  const hasCalibrationAuthority = Boolean(input.calibrationIntegration?.calibrationAuthority || input.calibration?.calibrationAuthority);

  return [
    visualization(
      "fan_chart",
      "Revenue / margin / FCF fan chart",
      hasForecast ? "ready" : "missing",
      hasForecast ? "Posterior forecast distributions are available." : "Bayesian posterior forecast is missing.",
      "forecast.posterior",
    ),
    visualization(
      "intrinsic_value_distribution",
      "Intrinsic value distribution",
      hasValueDistribution ? "ready" : "missing",
      hasValueDistribution ? "P10/P50/P90 value range is available." : "No value distribution is available.",
      "dashboard.primaryPanel.valueRange",
    ),
    visualization(
      "reverse_dcf_surface",
      "Reverse DCF surface",
      hasSurface ? "ready" : "missing",
      hasSurface ? "Market-implied growth/margin surface is available." : "Expectations surface is missing.",
      "expectations.surface",
    ),
    visualization(
      "sobol_sensitivity",
      "Sobol sensitivity chart",
      input.probabilisticValuation?.sensitivity?.irr?.firstOrder?.length ? "ready" : dominantDrivers(input).length ? "proxy" : "missing",
      input.probabilisticValuation?.sensitivity?.irr?.firstOrder?.length
        ? "Probabilistic valuation has first-order variance sensitivity over IRR."
        : dominantDrivers(input).length
        ? "Using assumption-burden and driver-graph sensitivity proxy until Sobol sampling exists."
        : "No sensitivity proxy is available yet.",
      input.probabilisticValuation?.sensitivity?.irr?.firstOrder?.length ? "probabilisticValuation.sensitivity.irr" : "dashboard.sensitivityProxy",
    ),
    visualization(
      "valuation_bridge",
      "Value bridge from prior valuation",
      hasBridge ? "ready" : "partial",
      hasBridge ? "Assumption ledger has bridge attribution." : "Bridge can be shown only as changed assumptions until prior valuation is supplied.",
      "assumptionLedger.summary.valuationBridge",
    ),
    visualization(
      "market_expectations_history",
      "Market expectations history",
      input.expectationsHistory?.length ? "ready" : "missing",
      input.expectationsHistory?.length ? "Historical expectation snapshots are available." : "No market expectation history supplied yet.",
      "expectationsHistory",
    ),
    visualization(
      "causal_driver_graph",
      "Causal thesis graph",
      hasGraph ? "ready" : "missing",
      hasGraph ? "Driver graph nodes and edges are available." : "Driver graph is missing.",
      "driverGraph",
    ),
    visualization(
      "historical_analog_paths",
      "Historical analog trajectories",
      input.historicalAnalogs?.length ? "ready" : "missing",
      input.historicalAnalogs?.length ? "Historical analog paths are available." : "No analog retrieval layer is connected yet.",
      "historicalAnalogs",
    ),
    visualization(
      "capital_allocation_scorecard",
      "Capital allocation scorecard",
      hasAllocation ? "ready" : "missing",
      hasAllocation ? "Capital allocation summary is available." : "No capital allocation history supplied.",
      "capitalAllocation.summary",
    ),
    visualization(
      "calibration_history",
      "Model calibration history",
      hasCalibrationHistory ? "ready" : "partial",
      hasCalibrationHistory ? "Scored calibration records are available." : "Only pending calibration policy is available.",
      "calibration.summary",
    ),
    visualization(
      "calibration_authority",
      "Calibration authority",
      hasCalibrationAuthority ? "ready" : "missing",
      hasCalibrationAuthority ? "Calibration authority rights and hard blocks are available." : "Calibration authority packet is missing.",
      "calibrationIntegration.calibrationAuthority",
    ),
    visualization(
      "irr_distribution",
      "Five-year IRR distribution",
      hasProbabilistic ? "ready" : "partial",
      hasProbabilistic ? "Probabilistic valuation emits full IRR distribution." : "Dashboard falls back to P10/P50/P90 value-implied IRR.",
      hasProbabilistic ? "probabilisticValuation.irrDistribution" : "dashboard.primaryPanel.irrDistribution",
    ),
    visualization(
      "feasibility_manifold",
      "Economic feasibility manifold",
      hasManifold ? "ready" : "missing",
      hasManifold ? "Annotated feasible/stretched/impossible cells are available." : "Feasibility manifold is missing.",
      "feasibilityManifold.annotatedSurface",
    ),
  ];
}

function primaryPanel(input = {}) {
  const range = valueRange(input);
  const irr = irrDistribution(input, range);
  const expectations = impliedExpectations(input);
  const posterior = posteriorRoiic(input);
  const moat = moatHalfLife(input);
  const quality = dataQuality(input);
  const modelDisagreement = disagreement(input);
  const price = marketPrice(input);
  const probabilityBelowPrice = probabilityValueBelowPrice(input, range);
  const probabilityNegativeIrr = firstFinite(input.probabilisticValuation?.risk?.probabilityNegativeIrr, probabilityBelowPrice);
  const authority = calibrationAuthority(input);

  return {
    valueRange: range,
    marketPrice: price,
    probabilityValueBelowPrice: probabilityBelowPrice,
    expectedIrr5y: irr.p50,
    irrDistribution: irr,
    probabilityNegativeIrr,
    moatHalfLife: moat,
    posteriorRoiic: posterior,
    marketImpliedRevenueCagr: expectations.revenueCagr,
    marketImpliedTerminalMargin: expectations.terminalMargin,
    marketClearingFeasibility: expectations.feasibility,
    expectedDilution: firstFinite(getDrivers(input).dilution, input.capitalAllocation?.adjustments?.dilutionRiskAdjustment),
    dominantDrivers: dominantDrivers(input),
    dataQuality: quality,
    modelDisagreement,
    calibrationAuthority: authority,
  };
}

function readiness(visualizations = []) {
  const counts = visualizations.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const readyLike = (counts.ready || 0) + (counts.proxy || 0) * 0.7 + (counts.partial || 0) * 0.45;
  const score = visualizations.length ? clamp(readyLike / visualizations.length, 0, 1) : 0;
  return {
    score,
    level: score >= 0.78 ? "dashboard_ready" : score >= 0.55 ? "usable_with_gaps" : score >= 0.32 ? "research_view_only" : "insufficient",
    counts,
  };
}

function warnings(input = {}, panel = {}) {
  return [
    input.decision?.state && input.decision.state !== "priced_belief_ready" && input.decision.state !== "active_thesis_intact"
      ? `Pipeline state is ${input.decision.state}; dashboard should preserve the review action.`
      : null,
    input.calibrationIntegration?.riskControls?.shouldAbstain ? "Calibration risk controls recommend abstention." : null,
    panel.calibrationAuthority?.hardBlocks?.length
      ? `Calibration authority blocks production use: ${panel.calibrationAuthority.hardBlocks.join(", ")}.`
      : null,
    panel.modelDisagreement?.level === "high" ? "Model disagreement is high; avoid precise fair value language." : null,
    panel.dataQuality?.level === "low" || panel.dataQuality?.level === "insufficient" ? "Data quality is weak; show source limitations prominently." : null,
  ].filter(Boolean);
}

function investorQuestions(input = {}, panel = {}) {
  const drivers = panel.dominantDrivers.map((item) => item.key).slice(0, 3);
  return [
    "What expectations are already embedded in price?",
    "Which assumption would most change the valuation if it moved?",
    drivers.length ? `Which evidence will confirm or break ${drivers.join(", ")}?` : "Which driver should be monitored first?",
    "Is the downside probability acceptable after calibration haircuts?",
    panel.calibrationAuthority?.decisionRights === "use_calibrated_branch_with_monitoring"
      ? "What monitoring cadence keeps calibrated predictions honest?"
      : "What realized outcomes are needed before calibration earns decision rights?",
    input.capitalAllocation?.decision === "capital_allocation_pending"
      ? "Do capital allocation decisions support or dilute the thesis?"
      : "Is management converting business economics into owner economics?",
  ];
}

function decisionPacket(input = {}) {
  const decision = input.decisionEngine || null;
  if (!decision) {
    return {
      available: false,
      decisionRights: "not_available",
      action: null,
      maxPositionPct: 0,
      allowedActions: [],
      blockedActions: [],
      reopenTriggers: [],
    };
  }
  return {
    available: true,
    decisionRights: decision.decisionRights,
    action: decision.action,
    edgeScore: decision.edgeScore,
    maxPositionPct: decision.sizing?.maxPositionPct ?? 0,
    sizingPolicy: decision.sizing?.sizingPolicy || null,
    allowedActions: decision.allowedActions || [],
    blockedActions: decision.blockedActions || [],
    hardBlocks: decision.hardBlocks || [],
    reopenTriggers: decision.reopenTriggers || [],
    adverseScenarios: decision.adverseScenarios || [],
  };
}

export function buildAuroraDashboardContract(input = {}, options = {}) {
  const compiled = getCompiled(input);
  const panel = primaryPanel(input);
  const visualizations = visualizationContract(input);
  const ready = readiness(visualizations);
  const warn = warnings(input, panel);

  return {
    version: "aurora_dashboard_contract_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    ticker: input.ticker || compiled?.ticker || input.beliefObject?.ticker || null,
    name: input.name || compiled?.name || input.beliefObject?.name || null,
    headline:
      ready.level === "dashboard_ready"
        ? "AURORA dashboard contract is ready for investor review."
        : ready.level === "usable_with_gaps"
          ? "AURORA dashboard contract is usable, with visible gaps."
          : "AURORA dashboard contract is research-only until missing views are connected.",
    primaryPanel: panel,
    visualizations,
    readiness: ready,
    decisionPacket: decisionPacket(input),
    sensitivityProxy: input.probabilisticValuation?.sensitivity?.irr?.firstOrder || panel.dominantDrivers,
    warnings: warn,
    investorQuestions: investorQuestions(input, panel),
    memo: {
      headline: `${ready.level.replaceAll("_", " ")} with ${visualizations.filter((item) => item.status === "ready").length}/${visualizations.length} views ready.`,
      requiredMissingViews: visualizations.filter((item) => item.status === "missing").map((item) => item.key),
      warningCount: warn.length,
      nextBestIntegration:
        visualizations.find((item) => item.status === "missing")?.key ||
        visualizations.find((item) => item.status === "partial")?.key ||
        "render_contract_in_ui",
    },
  };
}
