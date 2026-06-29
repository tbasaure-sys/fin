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

function safeDivide(numerator, denominator, fallback = null) {
  return isFiniteNumber(numerator) && isFiniteNumber(denominator) && Math.abs(denominator) > 1e-9
    ? numerator / denominator
    : fallback;
}

function arrayOrEmpty(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function normalPdf(z) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

function normalCdf(z) {
  const x = clamp(z, -8, 8);
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function crpsNormal(mean, sd, actual) {
  if (!isFiniteNumber(mean) || !isFiniteNumber(sd) || sd <= 0 || !isFiniteNumber(actual)) return null;
  const z = (actual - mean) / sd;
  return sd * (z * (2 * normalCdf(z) - 1) + 2 * normalPdf(z) - 1 / Math.sqrt(Math.PI));
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

function mean(values) {
  const clean = values.filter(isFiniteNumber);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function getPrediction(record = {}) {
  return record.prediction || record.pipeline || record.snapshot || record;
}

function getActuals(record = {}) {
  return record.actuals || record.realized || record.outcome || getPrediction(record).actuals || null;
}

function getForecast(prediction = {}) {
  return prediction.forecast || prediction.bayesianForecast || null;
}

function getEnsemble(prediction = {}) {
  return prediction.valuationEnsemble || prediction.ensemble || null;
}

function getExpectations(prediction = {}) {
  return prediction.expectations || null;
}

function getPrice(prediction = {}) {
  return numeric(prediction.compiled?.drivers?.price, numeric(prediction.beliefObject?.price, numeric(prediction.market?.price, null)));
}

function normalizeKey(value, fallback = "unknown") {
  const text = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || fallback;
}

function firstText(...values) {
  for (const value of values) {
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function predictionContext(prediction = {}, record = {}, actuals = {}, options = {}) {
  const forecast = getForecast(prediction) || {};
  const drivers = prediction.compiled?.drivers || {};
  const company = prediction.company || prediction.profile || {};
  const accountingCompany = prediction.accounting?.company || prediction.compiled?.accounting?.company || {};
  const horizon = firstText(
    options.horizon,
    record.horizon,
    actuals.horizon,
    prediction.horizon,
    prediction.timeHorizon,
    forecast.horizon,
    prediction.probabilisticValuation?.horizon,
    "unknown",
  );
  const sector = firstText(options.sector, company.sector, drivers.sector, accountingCompany.sector, prediction.sector, "unknown");
  const archetype = firstText(
    options.archetype,
    prediction.feasibilityManifold?.archetype,
    forecast.archetype,
    prediction.equilibrium?.productMarket?.archetype,
    prediction.equilibrium?.archetype,
    "unknown",
  );
  const decisionState = firstText(options.decisionState, prediction.decision?.state, record.decisionState, "unknown");
  return {
    horizon: normalizeKey(horizon),
    sector: normalizeKey(sector),
    archetype: normalizeKey(archetype),
    decisionState: normalizeKey(decisionState),
  };
}

function distributionFromForecast(forecast, key) {
  const dist = forecast?.posterior?.[key];
  if (!dist) return null;
  const p10 = numeric(dist.p10, null);
  const p50 = numeric(dist.p50, numeric(dist.mean, null));
  const p90 = numeric(dist.p90, null);
  const sd = numeric(dist.sd, isFiniteNumber(p10) && isFiniteNumber(p90) ? Math.abs(p90 - p10) / 2.5632 : null);
  if (!isFiniteNumber(p50)) return null;
  return { p10, p50, p90, mean: numeric(dist.mean, p50), sd };
}

function valueDistribution(prediction = {}) {
  const ensemble = getEnsemble(prediction);
  const forecast = getForecast(prediction);
  const p10 = numeric(ensemble?.summary?.valueRange?.p10, null);
  const p50 = numeric(ensemble?.summary?.valueRange?.p50, numeric(ensemble?.summary?.weightedFairValue, numeric(forecast?.expectedFairValue, null)));
  const p90 = numeric(ensemble?.summary?.valueRange?.p90, null);
  const scenarioValues = arrayOrEmpty(forecast?.scenarios).map((scenario) => numeric(scenario.fairValue, null)).filter(isFiniteNumber);
  const fallbackP10 = quantile(scenarioValues, 0.1);
  const fallbackP90 = quantile(scenarioValues, 0.9);
  const finalP10 = numeric(p10, fallbackP10);
  const finalP90 = numeric(p90, fallbackP90);
  const sd = isFiniteNumber(finalP10) && isFiniteNumber(finalP90) ? Math.abs(finalP90 - finalP10) / 2.5632 : null;
  if (!isFiniteNumber(p50)) return null;
  return { p10: finalP10, p50, p90: finalP90, mean: numeric(ensemble?.summary?.weightedFairValue, p50), sd };
}

function predictedNegativeReturnProbability(prediction = {}) {
  const price = getPrice(prediction);
  const forecast = getForecast(prediction);
  const scenarios = arrayOrEmpty(forecast?.scenarios);
  if (!isFiniteNumber(price) || price <= 0 || !scenarios.length) {
    const expectedReturn = numeric(getEnsemble(prediction)?.summary?.expectedReturn, numeric(forecast?.expectedReturn, 0));
    return expectedReturn < 0 ? 0.62 : 0.38;
  }
  const weighted = scenarios.reduce(
    (acc, scenario) => {
      const probability = clamp(numeric(scenario.probability, 0), 0, 1);
      const fairValue = numeric(scenario.fairValue, null);
      if (!isFiniteNumber(fairValue)) return acc;
      return {
        p: acc.p + probability * (fairValue < price ? 1 : 0),
        total: acc.total + probability,
      };
    },
    { p: 0, total: 0 },
  );
  return weighted.total > 0 ? clamp(weighted.p / weighted.total, 0.01, 0.99) : 0.5;
}

function actualValue(actuals = {}) {
  return numeric(actuals.value, numeric(actuals.fairValue, numeric(actuals.price, numeric(actuals.futurePrice, null))));
}

function actualReturn(actuals = {}, prediction = {}) {
  const explicit = numeric(actuals.realizedReturn, numeric(actuals.return, numeric(actuals.irr, null)));
  if (isFiniteNumber(explicit)) return explicit;
  const price = getPrice(prediction);
  const value = actualValue(actuals);
  return isFiniteNumber(price) && price > 0 && isFiniteNumber(value) ? value / price - 1 : null;
}

function variableActual(actuals = {}, key) {
  const aliases = {
    growth: ["growth", "revenueGrowth", "revenueCagr", "revenueCagr5y"],
    margin: ["margin", "operatingMargin", "terminalMargin", "ebitMargin"],
    roic: ["roic", "roiic", "returnOnInvestedCapital"],
    reinvestment: ["reinvestment", "reinvestmentRate"],
  }[key] || [key];
  for (const alias of aliases) {
    const value = numeric(actuals[alias], null);
    if (isFiniteNumber(value)) return value;
  }
  return null;
}

function scoreContinuous(name, dist, actual) {
  if (!dist || !isFiniteNumber(actual)) return null;
  const error = actual - dist.p50;
  const absoluteError = Math.abs(error);
  const covered80 = isFiniteNumber(dist.p10) && isFiniteNumber(dist.p90) ? actual >= dist.p10 && actual <= dist.p90 : null;
  const intervalWidth = isFiniteNumber(dist.p10) && isFiniteNumber(dist.p90) ? Math.abs(dist.p90 - dist.p10) : null;
  return {
    name,
    actual,
    predicted: dist.p50,
    error,
    absoluteError,
    covered80,
    intervalWidth,
    crps: crpsNormal(dist.mean, dist.sd, actual),
  };
}

function scoreRecord(record = {}) {
  const prediction = getPrediction(record);
  const actuals = getActuals(record);
  const forecast = getForecast(prediction);
  const context = predictionContext(prediction, record, actuals || {});
  if (!actuals) {
    return {
      id: record.id || prediction.ticker || prediction.compiled?.ticker || null,
      ticker: prediction.ticker || prediction.compiled?.ticker || null,
      status: "pending_outcome",
      reason: "No realized outcome supplied.",
      context,
    };
  }

  const continuous = [
    scoreContinuous("growth", distributionFromForecast(forecast, "growth"), variableActual(actuals, "growth")),
    scoreContinuous("margin", distributionFromForecast(forecast, "margin"), variableActual(actuals, "margin")),
    scoreContinuous("roic", distributionFromForecast(forecast, "roic"), variableActual(actuals, "roic")),
    scoreContinuous("reinvestment", distributionFromForecast(forecast, "reinvestment"), variableActual(actuals, "reinvestment")),
    scoreContinuous("value", valueDistribution(prediction), actualValue(actuals)),
  ].filter(Boolean);

  const realizedReturn = actualReturn(actuals, prediction);
  const predictedReturn = numeric(getEnsemble(prediction)?.summary?.expectedReturn, numeric(forecast?.expectedReturn, null));
  const negativeReturnProbability = predictedNegativeReturnProbability(prediction);
  const negativeReturnObserved = isFiniteNumber(realizedReturn) ? realizedReturn < 0 : Boolean(actuals.permanentLoss);
  const eventObserved = negativeReturnObserved ? 1 : 0;
  const brier = (negativeReturnProbability - eventObserved) ** 2;
  const logScore = -Math.log(clamp(negativeReturnObserved ? negativeReturnProbability : 1 - negativeReturnProbability, 1e-6, 1));

  return {
    id: record.id || prediction.ticker || prediction.compiled?.ticker || null,
    ticker: prediction.ticker || prediction.compiled?.ticker || null,
    status: "scored",
    horizon: record.horizon || actuals.horizon || "unknown",
    decisionState: prediction.decision?.state || null,
    context,
    continuous,
    investment: {
      predictedReturn,
      realizedReturn,
      returnError: isFiniteNumber(predictedReturn) && isFiniteNumber(realizedReturn) ? realizedReturn - predictedReturn : null,
      negativeReturnProbability,
      negativeReturnObserved,
      brier,
      logScore,
      permanentLossObserved: Boolean(actuals.permanentLoss || (isFiniteNumber(realizedReturn) && realizedReturn <= -0.35)),
    },
  };
}

function aggregateContinuous(scored) {
  const byName = {};
  scored.forEach((record) => {
    arrayOrEmpty(record.continuous).forEach((item) => {
      byName[item.name] ||= [];
      byName[item.name].push(item);
    });
  });
  return Object.entries(byName).reduce((acc, [name, items]) => {
    const covered = items.map((item) => item.covered80).filter((value) => value != null);
    acc[name] = {
      count: items.length,
      meanAbsoluteError: mean(items.map((item) => item.absoluteError)),
      bias: mean(items.map((item) => item.error)),
      crps: mean(items.map((item) => item.crps)),
      coverage80: covered.length ? covered.filter(Boolean).length / covered.length : null,
      intervalWidth: mean(items.map((item) => item.intervalWidth)),
    };
    return acc;
  }, {});
}

function aggregateInvestment(scored) {
  const rows = scored.map((record) => record.investment).filter(Boolean);
  const sorted = rows
    .filter((row) => isFiniteNumber(row.predictedReturn) && isFiniteNumber(row.realizedReturn))
    .sort((a, b) => a.predictedReturn - b.predictedReturn);
  const buckets = [];
  if (sorted.length) {
    const bucketCount = Math.min(5, sorted.length);
    for (let index = 0; index < bucketCount; index += 1) {
      const start = Math.floor((sorted.length * index) / bucketCount);
      const end = Math.floor((sorted.length * (index + 1)) / bucketCount);
      const rowsInBucket = sorted.slice(start, Math.max(start + 1, end));
      buckets.push({
        bucket: index + 1,
        count: rowsInBucket.length,
        predictedReturn: mean(rowsInBucket.map((row) => row.predictedReturn)),
        realizedReturn: mean(rowsInBucket.map((row) => row.realizedReturn)),
        permanentLossRate: mean(rowsInBucket.map((row) => (row.permanentLossObserved ? 1 : 0))),
      });
    }
  }
  let monotonicPairs = 0;
  let pairCount = 0;
  for (let i = 0; i < buckets.length; i += 1) {
    for (let j = i + 1; j < buckets.length; j += 1) {
      pairCount += 1;
      if ((buckets[j].realizedReturn ?? 0) >= (buckets[i].realizedReturn ?? 0)) monotonicPairs += 1;
    }
  }
  return {
    count: rows.length,
    meanBrier: mean(rows.map((row) => row.brier)),
    meanLogScore: mean(rows.map((row) => row.logScore)),
    meanReturnError: mean(rows.map((row) => row.returnError)),
    meanPredictedNegativeReturnProbability: mean(rows.map((row) => row.negativeReturnProbability)),
    observedNegativeReturnRate: mean(rows.map((row) => (row.negativeReturnObserved ? 1 : 0))),
    permanentLossRate: mean(rows.map((row) => (row.permanentLossObserved ? 1 : 0))),
    deciles: buckets,
    monotonicity: pairCount ? monotonicPairs / pairCount : null,
  };
}

function calibrationDecision(summary) {
  if (!summary.scoredRecords) return "calibration_pending";
  const continuous = Object.values(summary.continuous || {});
  const coverageValues = continuous.map((item) => item.coverage80).filter(isFiniteNumber);
  const avgCoverage = mean(coverageValues);
  const brier = summary.investment?.meanBrier;
  const monotonicity = summary.investment?.monotonicity;
  if ((isFiniteNumber(avgCoverage) && Math.abs(avgCoverage - 0.8) > 0.28) || (isFiniteNumber(brier) && brier > 0.34)) {
    return "calibration_failing";
  }
  if ((isFiniteNumber(avgCoverage) && Math.abs(avgCoverage - 0.8) > 0.16) || (isFiniteNumber(monotonicity) && monotonicity < 0.55)) {
    return "calibration_watch";
  }
  return "calibration_usable";
}

function experimentRisk(records, options = {}) {
  const experimentCount = numeric(options.experimentCount, null);
  const familyCount = numeric(options.familyCount, null);
  const tried = numeric(experimentCount, familyCount);
  if (!isFiniteNumber(tried)) {
    return {
      level: "unknown",
      note: "No experiment-count metadata supplied; PBO risk cannot be estimated.",
    };
  }
  const recordCount = Math.max(1, records.length);
  const pressure = tried / recordCount;
  return {
    experimentCount: tried,
    recordCount,
    pressure,
    level: pressure > 4 ? "high_backtest_overfitting_risk" : pressure > 1.5 ? "moderate_backtest_overfitting_risk" : "low_recorded_experiment_pressure",
  };
}

function reliabilityFromCount(count, minRecords) {
  if (!isFiniteNumber(count) || count <= 0) return 0;
  return clamp(count / Math.max(1, minRecords), 0, 1);
}

function variableRecalibration(variable, stats = {}, options = {}) {
  const targetCoverage = numeric(options.targetCoverage80, 0.8);
  const minRecords = numeric(options.minCalibrationRecords, 12);
  const countReliability = reliabilityFromCount(stats.count, minRecords);
  const coverage = numeric(stats.coverage80, null);
  const bias = numeric(stats.bias, null);
  const coverageGap = isFiniteNumber(coverage) ? targetCoverage - coverage : null;
  const intervalScale = isFiniteNumber(coverageGap) ? clamp(1 + coverageGap * 1.25, 0.72, 1.85) : 1;
  const centerShift = isFiniteNumber(bias) ? bias * countReliability : 0;
  const action =
    countReliability < 0.35
      ? "observe_more"
      : Math.abs(centerShift) > 0.01 || Math.abs(intervalScale - 1) > 0.08
        ? "apply_shift_and_scale"
        : "no_material_adjustment";

  return {
    variable,
    count: stats.count || 0,
    reliability: countReliability,
    observedCoverage80: coverage,
    targetCoverage80: targetCoverage,
    coverageGap,
    centerShift,
    intervalScale,
    action,
  };
}

function buildRecalibrationPolicy(summary = {}, decision = "calibration_pending", options = {}) {
  const minRecords = numeric(options.minCalibrationRecords, 12);
  const variables = Object.entries(summary.continuous || {}).reduce((acc, [name, stats]) => {
    acc[name] = variableRecalibration(name, stats, { ...options, minCalibrationRecords: minRecords });
    return acc;
  }, {});
  const variableItems = Object.values(variables);
  const averageReliability = mean(variableItems.map((item) => item.reliability)) ?? reliabilityFromCount(summary.scoredRecords, minRecords);
  const averageIntervalScale = mean(variableItems.map((item) => item.intervalScale)) ?? 1;
  const investment = summary.investment || {};
  const returnBias = numeric(investment.meanReturnError, 0);
  const predictedNegative = numeric(investment.meanPredictedNegativeReturnProbability, null);
  const observedNegative = numeric(investment.observedNegativeReturnRate, null);
  const negativeReturnProbabilityShift =
    isFiniteNumber(predictedNegative) && isFiniteNumber(observedNegative) ? clamp(observedNegative - predictedNegative, -0.28, 0.28) : 0;
  const brier = numeric(investment.meanBrier, null);
  const monotonicity = numeric(investment.monotonicity, null);
  const brierPenalty = isFiniteNumber(brier) ? clamp((brier - 0.22) / 0.18, 0, 1) : 0;
  const monotonicityPenalty = isFiniteNumber(monotonicity) ? clamp((0.65 - monotonicity) / 0.35, 0, 1) : 0;
  const modelRiskPenalty = Math.max(brierPenalty, monotonicityPenalty);
  const uncertaintyScale = clamp(averageIntervalScale * (1 + modelRiskPenalty * 0.35), 0.72, 2.1);
  const confidenceHaircut = clamp((1 - averageReliability) * 0.28 + modelRiskPenalty * 0.32, 0, 0.75);
  const abstentionThresholdShift = clamp(modelRiskPenalty * 0.18 + (decision === "calibration_failing" ? 0.12 : 0), 0, 0.35);
  const action =
    decision === "calibration_pending"
      ? "collect_realized_outcomes"
      : decision === "calibration_failing"
        ? "freeze_promotion_and_apply_conservative_overrides"
        : decision === "calibration_watch"
          ? "apply_recalibration_in_shadow"
          : "apply_recalibration_with_monitoring";

  return {
    version: "aurora_recalibration_policy_v1",
    action,
    minRecords,
    reliability: averageReliability,
    variables,
    globalAdjustments: {
      returnBiasShift: returnBias * averageReliability,
      negativeReturnProbabilityShift: negativeReturnProbabilityShift * averageReliability,
      uncertaintyScale,
      confidenceHaircut,
      abstentionThresholdShift,
    },
    diagnostics: {
      meanPredictedNegativeReturnProbability: predictedNegative,
      observedNegativeReturnRate: observedNegative,
      brier,
      monotonicity,
      modelRiskPenalty,
    },
  };
}

function averageCoverage(summary = {}) {
  return mean(Object.values(summary.continuous || {}).map((item) => item.coverage80));
}

function buildCalibrationAuthority(summary = {}, decision = "calibration_pending", policy = {}, options = {}) {
  const minRecords = numeric(options.minCalibrationRecords, numeric(policy.minRecords, 12));
  const scoredRecords = numeric(summary.scoredRecords, 0);
  const reliability = clamp(numeric(policy.reliability, reliabilityFromCount(scoredRecords, minRecords)), 0, 1);
  const coverage80 = averageCoverage(summary);
  const brier = numeric(summary.investment?.meanBrier, null);
  const monotonicity = numeric(summary.investment?.monotonicity, null);
  const experimentLevel = summary.experimentRisk?.level || "unknown";
  const coveragePenalty = isFiniteNumber(coverage80) ? clamp(Math.abs(coverage80 - 0.8) / 0.4, 0, 1) : scoredRecords ? 0.35 : 0.55;
  const brierPenalty = isFiniteNumber(brier) ? clamp((brier - 0.18) / 0.28, 0, 1) : scoredRecords ? 0.25 : 0.45;
  const monotonicityPenalty = isFiniteNumber(monotonicity) ? clamp((0.7 - monotonicity) / 0.45, 0, 1) : scoredRecords >= 5 ? 0.25 : 0.45;
  const experimentPenalty =
    experimentLevel === "high_backtest_overfitting_risk" ? 0.22 : experimentLevel === "moderate_backtest_overfitting_risk" ? 0.1 : 0;
  const pendingPenalty = scoredRecords ? 0 : 0.28;
  const failingPenalty = decision === "calibration_failing" ? 0.24 : decision === "calibration_watch" ? 0.1 : 0;
  const authorityScore = clamp(
    0.18 +
      reliability * 0.34 +
      (1 - coveragePenalty) * 0.2 +
      (1 - brierPenalty) * 0.16 +
      (1 - monotonicityPenalty) * 0.12 -
      experimentPenalty -
      pendingPenalty -
      failingPenalty,
    0,
    1,
  );
  const evidenceTier =
    scoredRecords < Math.max(3, Math.ceil(minRecords * 0.35))
      ? "insufficient_history"
      : authorityScore >= 0.72 && decision === "calibration_usable"
        ? "decision_grade"
        : authorityScore >= 0.52 && decision !== "calibration_failing"
          ? "research_grade"
          : authorityScore >= 0.34
            ? "shadow_grade"
            : "memo_only";
  const hardBlocks = [
    decision === "calibration_failing" ? "calibration_failing" : null,
    experimentLevel === "high_backtest_overfitting_risk" ? "high_backtest_overfitting_risk" : null,
    scoredRecords < Math.max(3, Math.ceil(minRecords * 0.35)) ? "insufficient_realized_outcomes" : null,
    isFiniteNumber(coverage80) && Math.abs(coverage80 - 0.8) > 0.28 ? "interval_coverage_failure" : null,
    isFiniteNumber(brier) && brier > 0.34 ? "negative_return_probability_failure" : null,
    isFiniteNumber(monotonicity) && monotonicity < 0.5 ? "return_ranking_not_monotonic" : null,
  ].filter(Boolean);
  const decisionRights =
    decision === "calibration_pending"
      ? "observe_only"
      : hardBlocks.includes("calibration_failing") || hardBlocks.includes("high_backtest_overfitting_risk")
        ? "freeze_promotion"
        : evidenceTier === "decision_grade"
          ? "use_calibrated_branch_with_monitoring"
          : evidenceTier === "research_grade"
            ? "stage_with_guardrails"
            : "shadow_or_memo_only";
  const mode =
    decisionRights === "use_calibrated_branch_with_monitoring"
      ? "production_monitoring"
      : decisionRights === "stage_with_guardrails"
        ? "guardrailed_stage"
        : decisionRights === "freeze_promotion"
          ? "conservative_override"
          : decisionRights === "observe_only"
            ? "observe_only"
            : "shadow";
  const requiredEvidence = [
    scoredRecords < minRecords ? `${Math.max(0, minRecords - scoredRecords)} more realized calibration records` : null,
    coverage80 == null ? "realized growth, margin, ROIC, reinvestment, and value outcomes" : null,
    monotonicity == null ? "enough predictions to build return buckets" : null,
    experimentLevel === "unknown" ? "experiment-count metadata for PBO pressure" : null,
  ].filter(Boolean);

  return {
    version: "aurora_calibration_authority_v1",
    authorityScore,
    evidenceTier,
    decisionRights,
    mode,
    scoredRecords,
    minRecords,
    reliability,
    diagnostics: {
      coverage80,
      coveragePenalty,
      brier,
      brierPenalty,
      monotonicity,
      monotonicityPenalty,
      experimentRisk: experimentLevel,
      experimentPenalty,
    },
    hardBlocks,
    requiredEvidence,
    riskControls: {
      allowProductionUse: decisionRights === "use_calibrated_branch_with_monitoring",
      allowStagingUse: ["use_calibrated_branch_with_monitoring", "stage_with_guardrails"].includes(decisionRights),
      forceShadow: ["shadow_or_memo_only", "observe_only"].includes(decisionRights),
      forceAbstention: decisionRights === "freeze_promotion" || authorityScore < 0.28,
    },
    memo: {
      headline: `Calibration authority is ${evidenceTier.replaceAll("_", " ")}; ${decisionRights.replaceAll("_", " ")}.`,
      score: authorityScore,
      primaryBlock: hardBlocks[0] || null,
      requiredEvidence: requiredEvidence[0] || null,
    },
  };
}

const SEGMENT_DEFINITIONS = [
  { level: "horizon", keys: ["horizon"] },
  { level: "sector", keys: ["sector"] },
  { level: "archetype", keys: ["archetype"] },
  { level: "horizon_archetype", keys: ["horizon", "archetype"] },
  { level: "horizon_sector", keys: ["horizon", "sector"] },
  { level: "decision_state", keys: ["decisionState"] },
];

function summarizeScored(scored = [], records = [], options = {}) {
  return {
    recordCount: records.length,
    scoredRecords: scored.length,
    pendingRecords: Math.max(0, records.length - scored.length),
    continuous: aggregateContinuous(scored),
    investment: aggregateInvestment(scored),
    experimentRisk: experimentRisk(records, options),
  };
}

function segmentKeyFor(context = {}, definition = {}) {
  return definition.keys.map((key) => `${key}:${context[key] || "unknown"}`).join("|");
}

function segmentHumanLabel(definition = {}, context = {}) {
  return definition.keys.map((key) => `${key}=${context[key] || "unknown"}`).join(", ");
}

function buildSegmentCalibration(scored = [], options = {}) {
  const minRecords = numeric(options.minCalibrationRecords, 12);
  const minSegmentRecords = numeric(options.minSegmentRecords, Math.max(3, Math.ceil(minRecords * 0.35)));
  const segments = [];

  SEGMENT_DEFINITIONS.forEach((definition) => {
    const groups = new Map();
    scored.forEach((record) => {
      const context = record.context || {};
      if (definition.keys.some((key) => !context[key] || context[key] === "unknown")) return;
      const key = segmentKeyFor(context, definition);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });

    groups.forEach((items, key) => {
      const context = items[0]?.context || {};
      const segmentSummary = summarizeScored(items, items, {
        ...options,
        experimentCount: null,
        familyCount: null,
      });
      const decision = calibrationDecision(segmentSummary);
      const policy = buildRecalibrationPolicy(segmentSummary, decision, {
        ...options,
        minCalibrationRecords: minSegmentRecords,
      });
      const authority = buildCalibrationAuthority(segmentSummary, decision, policy, {
        ...options,
        minCalibrationRecords: minSegmentRecords,
      });
      const eligible =
        items.length >= minSegmentRecords &&
        !["calibration_failing", "calibration_pending"].includes(decision) &&
        !authority.hardBlocks.includes("interval_coverage_failure") &&
        !authority.hardBlocks.includes("negative_return_probability_failure");

      segments.push({
        key,
        level: definition.level,
        keys: definition.keys,
        label: segmentHumanLabel(definition, context),
        context: definition.keys.reduce((acc, name) => {
          acc[name] = context[name];
          return acc;
        }, {}),
        count: items.length,
        eligible,
        decision,
        policy,
        authority,
        summary: segmentSummary,
      });
    });
  });

  segments.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.keys.length !== b.keys.length) return b.keys.length - a.keys.length;
    return b.count - a.count;
  });

  return {
    version: "aurora_contextual_calibration_v1",
    minSegmentRecords,
    segmentCount: segments.length,
    eligibleSegmentCount: segments.filter((segment) => segment.eligible).length,
    segmentDefinitions: SEGMENT_DEFINITIONS,
    segments,
    memo: {
      headline: segments.some((segment) => segment.eligible)
        ? "Contextual calibration has eligible segment policies."
        : "Contextual calibration is collecting segment evidence.",
      strongestSegment: segments[0]?.label || null,
    },
  };
}

function segmentMatchesContext(segment = {}, context = {}) {
  return segment.keys.every((key) => segment.context?.[key] && segment.context[key] === context[key]);
}

function selectContextualCalibration(prediction = {}, calibration = {}, options = {}) {
  const contextual = calibration.summary?.contextualCalibration || calibration.contextualCalibration || null;
  const context = predictionContext(prediction, {}, {}, options.calibrationContext || options);
  const segments = arrayOrEmpty(contextual?.segments);
  const matches = segments
    .filter((segment) => segment.eligible && segmentMatchesContext(segment, context))
    .sort((a, b) => {
      if (a.keys.length !== b.keys.length) return b.keys.length - a.keys.length;
      return b.count - a.count;
    });
  const activeSegment = matches[0] || null;
  return {
    version: "aurora_contextual_calibration_selection_v1",
    available: Boolean(contextual),
    applied: Boolean(activeSegment),
    context,
    activeSegment: activeSegment
      ? {
          key: activeSegment.key,
          level: activeSegment.level,
          label: activeSegment.label,
          count: activeSegment.count,
          decision: activeSegment.decision,
          authorityScore: activeSegment.authority?.authorityScore ?? null,
        }
      : null,
    missedReason: activeSegment ? null : contextual ? "no_eligible_matching_segment" : "no_contextual_calibration_available",
    segmentPolicy: activeSegment?.policy || null,
  };
}

function blendNumber(globalValue, segmentValue, weight, fallback = 0) {
  const globalParsed = numeric(globalValue, fallback);
  const segmentParsed = numeric(segmentValue, globalParsed);
  return globalParsed * (1 - weight) + segmentParsed * weight;
}

function blendPolicyWithSegment(policy = {}, selection = {}, options = {}) {
  const segmentPolicy = selection.segmentPolicy || null;
  if (!selection.applied || !segmentPolicy) return policy;
  const segmentWeight = clamp(numeric(options.segmentCalibrationWeight, null) ?? numeric(segmentPolicy.reliability, 0) * 0.65, 0, 0.72);
  const variableNames = new Set([...Object.keys(policy.variables || {}), ...Object.keys(segmentPolicy.variables || {})]);
  const variables = {};
  variableNames.forEach((name) => {
    const globalVariable = policy.variables?.[name] || {};
    const segmentVariable = segmentPolicy.variables?.[name] || {};
    variables[name] = {
      ...globalVariable,
      segmentAction: segmentVariable.action || null,
      centerShift: blendNumber(globalVariable.centerShift, segmentVariable.centerShift, segmentWeight, 0),
      intervalScale: clamp(1 + blendNumber(numeric(globalVariable.intervalScale, 1) - 1, numeric(segmentVariable.intervalScale, 1) - 1, segmentWeight, 0), 0.45, 3.5),
      reliability: Math.max(numeric(globalVariable.reliability, 0), numeric(segmentVariable.reliability, 0) * segmentWeight),
      contextualWeight: segmentWeight,
    };
  });

  const globalAdjustments = {
    ...policy.globalAdjustments,
    returnBiasShift: blendNumber(policy.globalAdjustments?.returnBiasShift, segmentPolicy.globalAdjustments?.returnBiasShift, segmentWeight, 0),
    negativeReturnProbabilityShift: blendNumber(
      policy.globalAdjustments?.negativeReturnProbabilityShift,
      segmentPolicy.globalAdjustments?.negativeReturnProbabilityShift,
      segmentWeight,
      0,
    ),
    uncertaintyScale: clamp(
      1 + blendNumber(numeric(policy.globalAdjustments?.uncertaintyScale, 1) - 1, numeric(segmentPolicy.globalAdjustments?.uncertaintyScale, 1) - 1, segmentWeight, 0),
      0.45,
      3.5,
    ),
    confidenceHaircut: blendNumber(policy.globalAdjustments?.confidenceHaircut, segmentPolicy.globalAdjustments?.confidenceHaircut, segmentWeight, 0),
    abstentionThresholdShift: blendNumber(
      policy.globalAdjustments?.abstentionThresholdShift,
      segmentPolicy.globalAdjustments?.abstentionThresholdShift,
      segmentWeight,
      0,
    ),
  };

  return {
    ...policy,
    version: "aurora_contextual_recalibration_policy_v1",
    basePolicyVersion: policy.version,
    contextualSegment: selection.activeSegment,
    contextualWeight: segmentWeight,
    reliability: Math.max(numeric(policy.reliability, 0), numeric(segmentPolicy.reliability, 0) * segmentWeight),
    variables,
    globalAdjustments,
  };
}

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function policyActionMode(action) {
  return (
    {
      collect_realized_outcomes: "observe_only",
      apply_recalibration_with_monitoring: "production_monitoring",
      apply_recalibration_in_shadow: "shadow",
      freeze_promotion_and_apply_conservative_overrides: "conservative_override",
    }[action] || "observe_only"
  );
}

function adjustedDistribution(name, dist = {}, policy = {}) {
  if (!dist || typeof dist !== "object") return dist;
  const variable = policy.variables?.[name] || {};
  const global = policy.globalAdjustments || {};
  const centerShift = numeric(variable.centerShift, 0);
  const intervalScale = clamp(numeric(variable.intervalScale, 1) * numeric(global.uncertaintyScale, 1), 0.45, 3.5);
  const p50 = numeric(dist.p50, numeric(dist.mean, null));
  const meanValue = numeric(dist.mean, p50);
  const p10 = numeric(dist.p10, null);
  const p90 = numeric(dist.p90, null);
  const shiftedCenter = isFiniteNumber(p50) ? p50 + centerShift : p50;
  const shiftedMean = isFiniteNumber(meanValue) ? meanValue + centerShift : meanValue;

  return {
    ...dist,
    p10: isFiniteNumber(p10) && isFiniteNumber(p50) ? shiftedCenter + (p10 - p50) * intervalScale : p10,
    p50: shiftedCenter,
    p90: isFiniteNumber(p90) && isFiniteNumber(p50) ? shiftedCenter + (p90 - p50) * intervalScale : p90,
    mean: shiftedMean,
    sd: isFiniteNumber(dist.sd) ? Math.abs(dist.sd) * intervalScale : dist.sd,
    calibrationAdjustment: {
      centerShift,
      intervalScale,
      reliability: numeric(variable.reliability, policy.reliability ?? 0),
      action: variable.action || "global_scale_only",
    },
  };
}

function adjustValueRange(range = {}, policy = {}) {
  if (!range || typeof range !== "object") return range;
  const variable = policy.variables?.value || {};
  const global = policy.globalAdjustments || {};
  const centerShift = numeric(variable.centerShift, 0);
  const intervalScale = clamp(numeric(variable.intervalScale, 1) * numeric(global.uncertaintyScale, 1), 0.45, 3.5);
  const p50 = numeric(range.p50, null);
  const adjustedP50 = isFiniteNumber(p50) ? p50 + centerShift : p50;
  return {
    ...range,
    p10: isFiniteNumber(range.p10) && isFiniteNumber(p50) ? adjustedP50 + (range.p10 - p50) * intervalScale : range.p10,
    p50: adjustedP50,
    p90: isFiniteNumber(range.p90) && isFiniteNumber(p50) ? adjustedP50 + (range.p90 - p50) * intervalScale : range.p90,
  };
}

function scenarioShift(scenario = {}, policy = {}) {
  const variables = policy.variables || {};
  const valueShift = numeric(variables.value?.centerShift, 0);
  return {
    ...scenario,
    growth: isFiniteNumber(scenario.growth) ? scenario.growth + numeric(variables.growth?.centerShift, 0) : scenario.growth,
    margin: isFiniteNumber(scenario.margin) ? scenario.margin + numeric(variables.margin?.centerShift, 0) : scenario.margin,
    roic: isFiniteNumber(scenario.roic) ? scenario.roic + numeric(variables.roic?.centerShift, 0) : scenario.roic,
    reinvestment: isFiniteNumber(scenario.reinvestment)
      ? scenario.reinvestment + numeric(variables.reinvestment?.centerShift, 0)
      : scenario.reinvestment,
    fairValue: isFiniteNumber(scenario.fairValue) ? Math.max(0, scenario.fairValue + valueShift) : scenario.fairValue,
  };
}

function applyPolicyToForecast(forecast = {}, policy = {}) {
  if (!forecast || typeof forecast !== "object") return forecast;
  const next = deepClone(forecast);
  const posterior = next.posterior || {};
  ["growth", "margin", "roic", "reinvestment", "wacc", "terminalGrowth"].forEach((name) => {
    if (posterior[name]) posterior[name] = adjustedDistribution(name, posterior[name], policy);
  });
  if (Array.isArray(next.scenarios)) {
    next.scenarios = next.scenarios.map((scenario) => scenarioShift(scenario, policy));
  }
  const valuePolicy = policy.variables?.value || {};
  const valueShift = numeric(valuePolicy.centerShift, 0);
  const uncertaintyScale = numeric(policy.globalAdjustments?.uncertaintyScale, 1);
  if (isFiniteNumber(next.expectedFairValue)) next.expectedFairValue = Math.max(0, next.expectedFairValue + valueShift);
  if (next.uncertainty && typeof next.uncertainty === "object") {
    next.uncertainty = {
      ...next.uncertainty,
      total: clamp(numeric(next.uncertainty.total, 0.45) * uncertaintyScale, 0, 1),
      calibrationScale: uncertaintyScale,
    };
  }
  next.calibrated = true;
  next.calibrationAction = policy.action;
  return next;
}

function applyPolicyToEnsemble(ensemble = {}, policy = {}, price = null) {
  if (!ensemble || typeof ensemble !== "object") return ensemble;
  const next = deepClone(ensemble);
  const valueShift = numeric(policy.variables?.value?.centerShift, 0);
  if (next.summary && typeof next.summary === "object") {
    const weightedFairValue = numeric(next.summary.weightedFairValue, null);
    if (isFiniteNumber(weightedFairValue)) next.summary.weightedFairValue = Math.max(0, weightedFairValue + valueShift);
    if (next.summary.valueRange) next.summary.valueRange = adjustValueRange(next.summary.valueRange, policy);
    const effectivePrice = numeric(price, null);
    if (isFiniteNumber(effectivePrice) && effectivePrice > 0 && isFiniteNumber(next.summary.weightedFairValue)) {
      next.summary.expectedReturn = next.summary.weightedFairValue / effectivePrice - 1;
    }
    if (isFiniteNumber(next.summary.disagreement)) {
      next.summary.disagreement = clamp(next.summary.disagreement * numeric(policy.globalAdjustments?.uncertaintyScale, 1), 0, 2);
    }
  }
  if (Array.isArray(next.lensOutputs)) {
    next.lensOutputs = next.lensOutputs.map((lens) => ({
      ...lens,
      expectedValue: isFiniteNumber(lens.expectedValue) && lens.role === "intrinsic_lens" ? Math.max(0, lens.expectedValue + valueShift) : lens.expectedValue,
    }));
  }
  next.calibrated = true;
  next.calibrationAction = policy.action;
  return next;
}

function getPredictionPrice(prediction = {}) {
  return getPrice(prediction);
}

function integrationWarnings(policy = {}, calibration = {}) {
  const warnings = [];
  const authority = calibration.calibrationAuthority || null;
  if (policy.action === "collect_realized_outcomes") {
    warnings.push("No scored realization history yet; integration must observe without altering production decisions.");
  }
  if (policy.action === "apply_recalibration_in_shadow") {
    warnings.push("Calibration is watch-level; use the calibrated branch in shadow before promoting it.");
  }
  if (policy.action === "freeze_promotion_and_apply_conservative_overrides") {
    warnings.push("Calibration is failing; freeze promotion and use conservative uncertainty/confidence overrides.");
  }
  if (calibration.summary?.experimentRisk?.level?.includes("overfitting")) {
    warnings.push(`Experiment risk is ${calibration.summary.experimentRisk.level}; treat apparent lift cautiously.`);
  }
  if (authority?.hardBlocks?.length) {
    warnings.push(`Calibration authority blocks: ${authority.hardBlocks.join(", ")}.`);
  }
  return warnings;
}

export function buildAuroraCalibrationIntegrationPacket(prediction = {}, calibration = {}, options = {}) {
  const policy = calibration.recalibrationPolicy || buildRecalibrationPolicy(calibration.summary || {}, calibration.decision || "calibration_pending", options);
  const calibrationAuthority =
    calibration.calibrationAuthority || buildCalibrationAuthority(calibration.summary || {}, calibration.decision || "calibration_pending", policy, options);
  const contextualCalibration = selectContextualCalibration(prediction, calibration, options);
  const effectivePolicy = blendPolicyWithSegment(policy, contextualCalibration, options);
  const price = getPredictionPrice(prediction);
  const calibratedForecast = applyPolicyToForecast(getForecast(prediction), effectivePolicy);
  const calibratedValuationEnsemble = applyPolicyToEnsemble(getEnsemble(prediction), effectivePolicy, price);
  const negativeReturnProbability = clamp(
    predictedNegativeReturnProbability(prediction) + numeric(effectivePolicy.globalAdjustments?.negativeReturnProbabilityShift, 0),
    0.01,
    0.99,
  );
  const baseConfidence = clamp(1 - numeric(getForecast(prediction)?.uncertainty?.total, 0.55), 0, 1);
  const confidence = clamp(baseConfidence - numeric(effectivePolicy.globalAdjustments?.confidenceHaircut, 0), 0, 1);
  const abstentionThreshold = clamp(numeric(options.baseAbstentionThreshold, 0.55) + numeric(effectivePolicy.globalAdjustments?.abstentionThresholdShift, 0), 0, 1);
  const mode = policyActionMode(policy.action);

  return {
    version: "aurora_calibration_integration_packet_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    mode,
    policyVersion: effectivePolicy.version,
    basePolicyVersion: policy.version,
    action: policy.action,
    decision: calibration.decision || "calibration_pending",
    calibratedForecast,
    calibratedValuationEnsemble,
    riskControls: {
      confidence,
      confidenceHaircut: numeric(effectivePolicy.globalAdjustments?.confidenceHaircut, 0),
      negativeReturnProbability,
      abstentionThreshold,
      uncertaintyScale: numeric(effectivePolicy.globalAdjustments?.uncertaintyScale, 1),
      authorityScore: calibrationAuthority.authorityScore,
      authorityMode: calibrationAuthority.mode,
      decisionRights: calibrationAuthority.decisionRights,
      shouldAbstain:
        confidence < abstentionThreshold || mode === "conservative_override" || calibrationAuthority.riskControls?.forceAbstention === true,
    },
    appliedAdjustments: {
      variables: effectivePolicy.variables || {},
      globalAdjustments: effectivePolicy.globalAdjustments || {},
      reliability: effectivePolicy.reliability,
      contextualCalibration: {
        applied: contextualCalibration.applied,
        activeSegment: contextualCalibration.activeSegment,
        contextualWeight: effectivePolicy.contextualWeight || 0,
      },
    },
    contextualCalibration,
    calibrationAuthority,
    warnings: integrationWarnings(policy, calibration),
    memo: {
      headline: `Calibration integration is ${mode.replaceAll("_", " ")} using ${policy.action.replaceAll("_", " ")}.`,
      confidence,
      abstentionThreshold,
      shouldAbstain:
        confidence < abstentionThreshold || mode === "conservative_override" || calibrationAuthority.riskControls?.forceAbstention === true,
      authority: calibrationAuthority.evidenceTier,
      warningCount: integrationWarnings(policy, calibration).length,
    },
  };
}

export function buildAuroraCalibrationEngine(input = {}, options = {}) {
  const records = arrayOrEmpty(input.records || input.predictions || input.history || input);
  const scoredRecords = records.map(scoreRecord);
  const scored = scoredRecords.filter((record) => record.status === "scored");
  const pending = scoredRecords.filter((record) => record.status !== "scored");
  const summary = summarizeScored(scored, scoredRecords, { ...options, ...input.experimentLog });
  summary.pendingRecords = pending.length;
  summary.contextualCalibration = buildSegmentCalibration(scored, options);
  const decision = calibrationDecision(summary);
  const recalibrationPolicy = buildRecalibrationPolicy(summary, decision, options);
  const calibrationAuthority = buildCalibrationAuthority(summary, decision, recalibrationPolicy, options);

  return {
    version: "aurora_calibration_engine_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    decision,
    summary,
    recalibrationPolicy,
    calibrationAuthority,
    contextualCalibration: summary.contextualCalibration,
    records: scoredRecords,
    memo: {
      headline: `Calibration engine says ${decision.replaceAll("_", " ")}.`,
      scoredRecords: summary.scoredRecords,
      pendingRecords: summary.pendingRecords,
      coverage80: averageCoverage(summary),
      meanBrier: summary.investment.meanBrier,
      recalibrationAction: recalibrationPolicy.action,
      calibrationAuthority: calibrationAuthority.decisionRights,
      authorityScore: calibrationAuthority.authorityScore,
      uncertaintyScale: recalibrationPolicy.globalAdjustments.uncertaintyScale,
      confidenceHaircut: recalibrationPolicy.globalAdjustments.confidenceHaircut,
      experimentRisk: summary.experimentRisk.level,
      contextualSegments: summary.contextualCalibration.eligibleSegmentCount,
    },
  };
}
