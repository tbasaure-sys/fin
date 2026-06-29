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
  if (!actuals) {
    return {
      id: record.id || prediction.ticker || prediction.compiled?.ticker || null,
      ticker: prediction.ticker || prediction.compiled?.ticker || null,
      status: "pending_outcome",
      reason: "No realized outcome supplied.",
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
  return warnings;
}

export function buildAuroraCalibrationIntegrationPacket(prediction = {}, calibration = {}, options = {}) {
  const policy = calibration.recalibrationPolicy || buildRecalibrationPolicy(calibration.summary || {}, calibration.decision || "calibration_pending", options);
  const price = getPredictionPrice(prediction);
  const calibratedForecast = applyPolicyToForecast(getForecast(prediction), policy);
  const calibratedValuationEnsemble = applyPolicyToEnsemble(getEnsemble(prediction), policy, price);
  const negativeReturnProbability = clamp(
    predictedNegativeReturnProbability(prediction) + numeric(policy.globalAdjustments?.negativeReturnProbabilityShift, 0),
    0.01,
    0.99,
  );
  const baseConfidence = clamp(1 - numeric(getForecast(prediction)?.uncertainty?.total, 0.55), 0, 1);
  const confidence = clamp(baseConfidence - numeric(policy.globalAdjustments?.confidenceHaircut, 0), 0, 1);
  const abstentionThreshold = clamp(numeric(options.baseAbstentionThreshold, 0.55) + numeric(policy.globalAdjustments?.abstentionThresholdShift, 0), 0, 1);
  const mode = policyActionMode(policy.action);

  return {
    version: "aurora_calibration_integration_packet_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    mode,
    policyVersion: policy.version,
    action: policy.action,
    decision: calibration.decision || "calibration_pending",
    calibratedForecast,
    calibratedValuationEnsemble,
    riskControls: {
      confidence,
      confidenceHaircut: numeric(policy.globalAdjustments?.confidenceHaircut, 0),
      negativeReturnProbability,
      abstentionThreshold,
      uncertaintyScale: numeric(policy.globalAdjustments?.uncertaintyScale, 1),
      shouldAbstain: confidence < abstentionThreshold || mode === "conservative_override",
    },
    appliedAdjustments: {
      variables: policy.variables || {},
      globalAdjustments: policy.globalAdjustments || {},
      reliability: policy.reliability,
    },
    warnings: integrationWarnings(policy, calibration),
    memo: {
      headline: `Calibration integration is ${mode.replaceAll("_", " ")} using ${policy.action.replaceAll("_", " ")}.`,
      confidence,
      abstentionThreshold,
      shouldAbstain: confidence < abstentionThreshold || mode === "conservative_override",
      warningCount: integrationWarnings(policy, calibration).length,
    },
  };
}

export function buildAuroraCalibrationEngine(input = {}, options = {}) {
  const records = arrayOrEmpty(input.records || input.predictions || input.history || input);
  const scoredRecords = records.map(scoreRecord);
  const scored = scoredRecords.filter((record) => record.status === "scored");
  const pending = scoredRecords.filter((record) => record.status !== "scored");
  const summary = {
    recordCount: scoredRecords.length,
    scoredRecords: scored.length,
    pendingRecords: pending.length,
    continuous: aggregateContinuous(scored),
    investment: aggregateInvestment(scored),
    experimentRisk: experimentRisk(records, { ...options, ...input.experimentLog }),
  };
  const decision = calibrationDecision(summary);
  const recalibrationPolicy = buildRecalibrationPolicy(summary, decision, options);

  return {
    version: "aurora_calibration_engine_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    decision,
    summary,
    recalibrationPolicy,
    records: scoredRecords,
    memo: {
      headline: `Calibration engine says ${decision.replaceAll("_", " ")}.`,
      scoredRecords: summary.scoredRecords,
      pendingRecords: summary.pendingRecords,
      coverage80: mean(Object.values(summary.continuous).map((item) => item.coverage80)),
      meanBrier: summary.investment.meanBrier,
      recalibrationAction: recalibrationPolicy.action,
      uncertaintyScale: recalibrationPolicy.globalAdjustments.uncertaintyScale,
      confidenceHaircut: recalibrationPolicy.globalAdjustments.confidenceHaircut,
      experimentRisk: summary.experimentRisk.level,
    },
  };
}
