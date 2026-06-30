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

const USEFUL_DECISION_CLASSES = new Set([
  "mispriced_belief",
  "correctly_priced",
  "heroic_expectations",
  "research_priority",
  "transition_candidate",
  "cheap_but_unfalsifiable",
]);

const NON_USEFUL_DECISION_CLASSES = new Set(["research_not_rankable", "memo_only", "unknown"]);

function isUsefulDecisionClass(value) {
  return USEFUL_DECISION_CLASSES.has(normalizeDecisionClass(value));
}

function decisionClassEvidenceUseful(value) {
  const decisionClass = normalizeDecisionClass(value);
  if (NON_USEFUL_DECISION_CLASSES.has(decisionClass)) return 0;
  if (isUsefulDecisionClass(decisionClass)) return 0.62;
  return 0.45;
}

function lensLegitimacyHeadroom(lensLegitimacy = []) {
  const top = arrayOrEmpty(lensLegitimacy)
    .map((lens) => numeric(lens?.legitimacy, null))
    .filter(isFiniteNumber)
    .sort((a, b) => b - a);
  if (!top.length) return null;
  return mean(top.slice(0, 3));
}

function inferThesisUsefulFromPrediction(prediction = {}) {
  const beliefObject = prediction?.beliefObject || {};
  const decisionClass = normalizeDecisionClass(beliefObject.decisionClass);
  const confidence = numeric(beliefObject.decisionEvidence?.confidence, null);
  const classSupport = numeric(beliefObject.decisionClassLedger?.classSupport, null);
  const falsifiabilityYield = numeric(beliefObject.falsifiabilityYield, null);
  const transitionSignal = numeric(beliefObject.transitionSignal?.archetypeMigrationScore, null);
  const evidenceDebt = numeric(beliefObject.evidenceDebt, null);
  const burdenScore = numeric(beliefObject.assumptionBurdenOfProof?.score, null);
  const lensLegitimacy = lensLegitimacyHeadroom(beliefObject.lensLegitimacy);
  const beliefDistortion = numeric(beliefObject.beliefDistortionIndex, null);
  const decisionAbstain = Boolean(beliefObject?.abstain || false);

  if (decisionAbstain) {
    return { score: 0, boolean: false };
  }

  if (
    !isFiniteNumber(confidence) &&
    !isFiniteNumber(classSupport) &&
    !isFiniteNumber(falsifiabilityYield) &&
    !isFiniteNumber(transitionSignal) &&
    !isFiniteNumber(evidenceDebt) &&
    !isFiniteNumber(burdenScore) &&
    lensLegitimacy == null &&
    !isFiniteNumber(beliefDistortion)
  ) {
    return { score: null, boolean: null };
  }

  const usableClassSignal = decisionClassEvidenceUseful(decisionClass);
  const confidenceSignal = isFiniteNumber(confidence) ? confidence * 0.36 : 0;
  const supportSignal = isFiniteNumber(classSupport) ? classSupport * 0.22 : 0;
  const falsifiabilitySignal = isFiniteNumber(falsifiabilityYield) ? clamp(falsifiabilityYield, 0, 1) * 0.14 : 0;
  const transitionPenalty = isFiniteNumber(transitionSignal) ? clamp(transitionSignal, 0, 1) * -0.12 : 0;
  const evidenceDebtPenalty = isFiniteNumber(evidenceDebt) ? clamp(evidenceDebt, 0, 1) * -0.2 : 0;
  const burdenSignal = isFiniteNumber(burdenScore) ? (0.35 - Math.min(burdenScore, 0.35)) * 0.5 : 0;
  const lensSignal = isFiniteNumber(lensLegitimacy) ? Math.max(0, lensLegitimacy - 0.2) * 0.1 : 0;
  const distortionSignal = isFiniteNumber(beliefDistortion) ? clamp((Math.abs(beliefDistortion) - 45) / 55, -0.2, 0.1) : 0;

  const score = clamp(
    usableClassSignal + confidenceSignal + supportSignal + falsifiabilitySignal + burdenSignal + lensSignal + distortionSignal + transitionPenalty + evidenceDebtPenalty,
    0,
    1,
  );
  return {
    score,
    boolean: score >= 0.5,
  };
}

function inferThesisUsefulFromActual(actuals = {}) {
  const actualClass = normalizeDecisionClass(beliefActual(actuals, "decisionClass"));
  if (isUsefulDecisionClass(actualClass)) {
    return true;
  }
  if (NON_USEFUL_DECISION_CLASSES.has(actualClass)) {
    return false;
  }
  const actualFalsifier = beliefActual(actuals, "falsifierHit");
  if (Boolean(actualFalsifier)) return false;
  return null;
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
  const decisionClass = firstText(
    options.decisionClass,
    prediction.beliefObject?.decisionClass,
    prediction.decisionClass,
    actuals?.decisionClass,
    "unknown",
  );
  return {
    horizon: normalizeKey(horizon),
    sector: normalizeKey(sector),
    archetype: normalizeKey(archetype),
    decisionState: normalizeKey(decisionState),
    decisionClass: normalizeKey(decisionClass),
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

function scoreBeliefOutcome(prediction = {}, actuals = {}, context = {}) {
  const predictedClass = normalizeDecisionClass(prediction.beliefObject?.decisionClass);
  const actualClass = normalizeDecisionClass(beliefActual(actuals, "decisionClass"));
  const predictedAbstain = Boolean(prediction.beliefObject?.abstain || prediction.decision?.state === "memo_only");
  const actualAbstain = Boolean(beliefActual(actuals, "abstain"));
  const decisionEvidenceConfidence = numeric(prediction.beliefObject?.decisionEvidence?.confidence, null);
  const decisionSupport = numeric(prediction.beliefObject?.decisionClassLedger?.classSupport, null);
  const falsifiabilityYield = numeric(prediction.beliefObject?.falsifiabilityYield, null);
  const transitionSignal = numeric(prediction.beliefObject?.transitionSignal?.archetypeMigrationScore, null);
  const thesisUsefulActual = beliefActual(actuals, "thesisUseful");
  const thesisUsefulPred = inferThesisUsefulFromPrediction(prediction);
  const thesisUsefulObserved = thesisUsefulActual == null ? inferThesisUsefulFromActual(actuals) : Boolean(thesisUsefulActual);
  return {
    decisionClassPred: predictedClass,
    decisionClassActual: actualClass || "unknown",
    decisionClassMatch:
      predictedClass && actualClass && actualClass !== "unknown" && predictedClass === actualClass ? 1 : predictedClass && actualClass && actualClass !== "unknown" ? 0 : null,
    abstentionPredicted: predictedAbstain,
    abstentionActual: actualAbstain || null,
    abstentionCorrect: actualAbstain == null ? null : predictedAbstain === actualAbstain,
    decisionConfidence: isFiniteNumber(decisionEvidenceConfidence) ? decisionEvidenceConfidence : null,
    classSupport: isFiniteNumber(decisionSupport) ? decisionSupport : null,
    falsifiabilityYield,
    transitionSignal,
    thesisUsefulObserved,
    thesisUsefulPredicted: thesisUsefulPred.boolean,
    thesisUsefulPredictedScore: thesisUsefulPred.score,
    falsifierObserved: beliefActual(actuals, "falsifierHit"),
  };
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
    fcfMargin: ["fcfMargin", "freeCashFlowMargin", "ownerEarningsMargin", "cashFlowMargin"],
    dilution: ["dilution", "shareCountCagr", "shareGrowth", "dilutionRate"],
  }[key] || [key];
  for (const alias of aliases) {
    const value = numeric(actuals[alias], null);
    if (isFiniteNumber(value)) return value;
  }
  return null;
}

function beliefMetricDirection(key) {
  return key === "reinvestment" || key === "dilution" ? "lower_is_better" : "higher_is_better";
}

function orientedBeliefGap(value, key) {
  if (!isFiniteNumber(value)) return null;
  return beliefMetricDirection(key) === "lower_is_better" ? -value : value;
}

function impliedBeliefDistribution(prediction = {}, key) {
  const market = prediction?.beliefObject?.marketImpliedBeliefs || {};
  const aliases = {
    growth: ["revenueCagr5y"],
    margin: ["terminalMargin"],
    roic: ["roicPath"],
    reinvestment: ["reinvestmentRate"],
    fcfMargin: ["fcfMargin"],
    dilution: ["dilution"],
  }[key] || [key];
  for (const alias of aliases) {
    const value = market?.[alias];
    if (value && typeof value === "object") return value;
  }
  return null;
}

function feasibleBeliefDistribution(prediction = {}, key) {
  const physics = prediction?.beliefObject?.businessPhysicsBeliefs?.evidenceAdjusted || {};
  const aliases = {
    growth: ["revenueCagr5y"],
    margin: ["terminalMargin"],
    roic: ["roicPath"],
    reinvestment: ["reinvestmentRate"],
    fcfMargin: ["fcfMargin"],
    dilution: ["dilution"],
  }[key] || [key];
  for (const alias of aliases) {
    const value = physics?.[alias];
    if (value && typeof value === "object") return value;
  }
  return null;
}

function predictedBeliefGap(prediction = {}, key) {
  const direct = numeric(prediction?.beliefObject?.beliefGap?.[key]?.gap, null);
  if (isFiniteNumber(direct)) return orientedBeliefGap(direct, key);
  const market = numeric(impliedBeliefDistribution(prediction, key)?.mean, null);
  const feasible = numeric(feasibleBeliefDistribution(prediction, key)?.mean, null);
  return isFiniteNumber(market) && isFiniteNumber(feasible) ? orientedBeliefGap(feasible - market, key) : null;
}

function observedBeliefGap(prediction = {}, actuals = {}, key) {
  const market = numeric(impliedBeliefDistribution(prediction, key)?.mean, null);
  const actual = variableActual(actuals, key);
  if (!isFiniteNumber(market) || !isFiniteNumber(actual)) return null;
  return orientedBeliefGap(actual - market, key);
}

function sameDirection(left, right, tolerance = 1e-6) {
  if (!isFiniteNumber(left) || !isFiniteNumber(right)) return null;
  if (Math.abs(left) <= tolerance && Math.abs(right) <= tolerance) return true;
  if (Math.abs(left) <= tolerance || Math.abs(right) <= tolerance) return null;
  return Math.sign(left) === Math.sign(right);
}

function scoreExpectationViolation(prediction = {}, actuals = {}) {
  const componentWeights = {
    growth: 0.26,
    margin: 0.24,
    roic: 0.24,
    reinvestment: 0.12,
    fcfMargin: 0.14,
  };

  const components = Object.entries(componentWeights)
    .map(([name, weight]) => {
      const predictedGap = predictedBeliefGap(prediction, name);
      const observedGap = observedBeliefGap(prediction, actuals, name);
      if (!isFiniteNumber(predictedGap) || !isFiniteNumber(observedGap)) return null;
      return {
        name,
        weight,
        direction: beliefMetricDirection(name),
        marketImplied: numeric(impliedBeliefDistribution(prediction, name)?.mean, null),
        actual: variableActual(actuals, name),
        predictedGap,
        observedGap,
        gapError: observedGap - predictedGap,
        absoluteGapError: Math.abs(observedGap - predictedGap),
        directionMatch: sameDirection(predictedGap, observedGap),
      };
    })
    .filter(Boolean);

  const weightedDenominator = components.reduce((sum, item) => sum + item.weight, 0);
  const compositePredictedGap =
    weightedDenominator > 0 ? components.reduce((sum, item) => sum + item.predictedGap * item.weight, 0) / weightedDenominator : null;
  const compositeObservedGap =
    weightedDenominator > 0 ? components.reduce((sum, item) => sum + item.observedGap * item.weight, 0) / weightedDenominator : null;
  const compositeGapError =
    isFiniteNumber(compositePredictedGap) && isFiniteNumber(compositeObservedGap) ? compositeObservedGap - compositePredictedGap : null;

  return {
    count: components.length,
    weightedDenominator,
    components,
    compositePredictedGap,
    compositeObservedGap,
    compositeGapError,
    compositeAbsoluteGapError: isFiniteNumber(compositeGapError) ? Math.abs(compositeGapError) : null,
    directionMatch: sameDirection(compositePredictedGap, compositeObservedGap),
    expectationClearedPredicted: isFiniteNumber(compositePredictedGap) ? compositePredictedGap >= 0 : null,
    expectationClearedObserved: isFiniteNumber(compositeObservedGap) ? compositeObservedGap >= 0 : null,
  };
}

function beliefActual(actuals = {}, key) {
  const aliases = {
    decisionClass: ["decisionClass", "expectedDecisionClass", "label"],
    abstain: ["abstain", "shouldAbstain", "wasAbstained", "decisionWasAbstention"],
    transition: ["transitionCandidate", "transitionSignal", "transitionArchetypeShift"],
    thesisUseful: ["memoUseful", "thesisUseful", "researchUseful", "ideaUseful"],
    falsifierHit: ["falsifierHit", "falsifierTriggered", "falsified", "falsifierObserved"],
  }[key] || [key];
  for (const alias of aliases) {
    const value = actuals[alias];
    if (value != null) return value;
  }
  return null;
}

function normalizeDecisionClass(value) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
      belief: scoreBeliefOutcome(prediction, {}, context),
      expectationViolation: null,
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
    belief: scoreBeliefOutcome(prediction, actuals, context),
    expectationViolation: scoreExpectationViolation(prediction, actuals),
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

function aggregateExpectationViolation(scored) {
  const rows = scored.map((record) => record.expectationViolation).filter((row) => row && row.count > 0);
  const byName = {};
  rows.forEach((row) => {
    arrayOrEmpty(row.components).forEach((component) => {
      byName[component.name] ||= [];
      byName[component.name].push(component);
    });
  });
  const components = Object.entries(byName).reduce((acc, [name, items]) => {
    const directionRows = items.filter((item) => item.directionMatch != null);
    acc[name] = {
      count: items.length,
      meanPredictedGap: mean(items.map((item) => item.predictedGap)),
      meanObservedGap: mean(items.map((item) => item.observedGap)),
      bias: mean(items.map((item) => item.gapError)),
      meanAbsoluteError: mean(items.map((item) => item.absoluteGapError)),
      directionAccuracy: directionRows.length ? mean(directionRows.map((item) => (item.directionMatch ? 1 : 0))) : null,
    };
    return acc;
  }, {});
  const compositeDirectionRows = rows.filter((row) => row.directionMatch != null);
  return {
    count: rows.length,
    coverage: scored.length ? rows.length / scored.length : 0,
    components,
    composite: {
      count: rows.length,
      meanPredictedGap: mean(rows.map((row) => row.compositePredictedGap)),
      meanObservedGap: mean(rows.map((row) => row.compositeObservedGap)),
      bias: mean(rows.map((row) => row.compositeGapError)),
      meanAbsoluteError: mean(rows.map((row) => row.compositeAbsoluteGapError)),
      directionAccuracy: compositeDirectionRows.length ? mean(compositeDirectionRows.map((row) => (row.directionMatch ? 1 : 0))) : null,
      expectationClearedPredictedRate: mean(rows.map((row) => (row.expectationClearedPredicted == null ? null : Number(row.expectationClearedPredicted)))),
      expectationClearedObservedRate: mean(rows.map((row) => (row.expectationClearedObserved == null ? null : Number(row.expectationClearedObserved)))),
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

function aggregateBelief(scored) {
  const rows = scored.map((record) => record.belief).filter(Boolean);
  const classRows = rows.filter((row) => isFiniteNumber(row.decisionClassMatch));
  const abstentionRows = rows.filter((row) => isFiniteNumber(row.abstentionActual) || isFiniteNumber(row.abstentionPredicted));
  const thesisRows = rows.filter((row) => row.thesisUsefulObserved != null || row.thesisUsefulPredicted != null);
  const falsifierRows = rows.filter((row) => isFiniteNumber(row.falsifierObserved));
  const decisionClassCoverage = rows.length ? classRows.length / rows.length : 0;
  const abstentionCoverage = rows.length ? abstentionRows.length / rows.length : 0;
  const thesisCoverage = rows.length ? thesisRows.length / rows.length : 0;
  const falsifierCoverage = rows.length ? falsifierRows.length / rows.length : 0;
  const thesisAgreement = rows
    .map((row) => (row.thesisUsefulObserved != null && row.thesisUsefulPredicted != null ? row.thesisUsefulObserved === row.thesisUsefulPredicted : null))
    .filter(isFiniteNumber)
    .map((value) => (value ? 1 : 0));
  return {
    count: rows.length,
    decisionClassAccuracy: mean(classRows.map((row) => row.decisionClassMatch)),
    decisionClassCoverage,
    abstentionAccuracy: mean(abstentionRows.map((row) => (row.abstentionActual == null ? null : Number(row.abstentionPredicted === row.abstentionActual)))),
    abstentionCoverage,
    avgDecisionConfidence: mean(rows.map((row) => row.decisionConfidence)),
    avgClassSupport: mean(rows.map((row) => row.classSupport)),
    avgTransitionSignal: mean(rows.map((row) => row.transitionSignal)),
    avgFalsifiabilityYield: mean(rows.map((row) => row.falsifiabilityYield)),
    thesisUsefulObservedRate: mean(thesisRows.map((row) => (row.thesisUsefulObserved ? 1 : 0))),
    thesisUsefulPredictedRate: mean(thesisRows.map((row) => (row.thesisUsefulPredicted ? 1 : 0))),
    thesisUsefulAgreementRate: mean(thesisAgreement),
    thesisUsefulCoverage: thesisCoverage,
    falsifierObservedRate: mean(falsifierRows.map((row) => (row.falsifierObserved ? 1 : 0))),
    falsifierObservedCoverage: falsifierCoverage,
  };
}

function calibrationDecision(summary) {
  if (!summary.scoredRecords) return "calibration_pending";
  const continuous = Object.values(summary.continuous || {});
  const coverageValues = continuous.map((item) => item.coverage80).filter(isFiniteNumber);
  const avgCoverage = mean(coverageValues);
  const brier = summary.investment?.meanBrier;
  const monotonicity = summary.investment?.monotonicity;
  const belief = summary.belief || {};
  const decisionClassAccuracy = numeric(belief.decisionClassAccuracy, null);
  const decisionClassCoverage = numeric(belief.decisionClassCoverage, null);
  const expectation = summary.expectationViolation || {};
  const expectationCoverage = numeric(expectation.coverage, 0);
  const expectationCount = numeric(expectation.count, 0);
  const expectationDirectionAccuracy = numeric(expectation.composite?.directionAccuracy, null);
  const beliefClassConcern =
    isFiniteNumber(decisionClassAccuracy) && isFiniteNumber(decisionClassCoverage) && decisionClassCoverage >= 0.4 && decisionClassAccuracy < 0.28;
  const expectationConcern =
    expectationCount >= 5 && expectationCoverage >= 0.5 && isFiniteNumber(expectationDirectionAccuracy) && expectationDirectionAccuracy < 0.35;
  const expectationWatch =
    expectationCount >= 5 && expectationCoverage >= 0.5 && isFiniteNumber(expectationDirectionAccuracy) && expectationDirectionAccuracy < 0.5;

  if ((isFiniteNumber(avgCoverage) && Math.abs(avgCoverage - 0.8) > 0.28) || (isFiniteNumber(brier) && brier > 0.34) || beliefClassConcern || expectationConcern) {
    return "calibration_failing";
  }
  if (
    (isFiniteNumber(avgCoverage) && Math.abs(avgCoverage - 0.8) > 0.16) ||
    (isFiniteNumber(monotonicity) && monotonicity < 0.55) ||
    (isFiniteNumber(decisionClassAccuracy) && isFiniteNumber(decisionClassCoverage) && decisionClassCoverage >= 0.4 && decisionClassAccuracy < 0.42) ||
    expectationWatch
  ) {
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
  const belief = summary.belief || {};
  const decisionClassCoverage = numeric(belief.decisionClassCoverage, 0);
  const decisionClassAccuracy = numeric(belief.decisionClassAccuracy, null);
  const expectation = summary.expectationViolation || {};
  const expectationCoverage = numeric(expectation.coverage, 0);
  const expectationCount = numeric(expectation.count, 0);
  const expectationDirectionAccuracy = numeric(expectation.composite?.directionAccuracy, null);
  const expectationGapError = numeric(expectation.composite?.meanAbsoluteError, null);
  const beliefDecisionClassPenalty = isFiniteNumber(decisionClassAccuracy) && decisionClassCoverage >= 0.4
    ? clamp((0.45 - decisionClassAccuracy) / 0.45, 0, 1)
    : 0;
  const decisionClassMismatch = isFiniteNumber(decisionClassAccuracy) && decisionClassCoverage >= 0.5 && decisionClassAccuracy < 0.2;
  const expectationPenalty =
    expectationCount >= Math.max(4, Math.ceil(minRecords * 0.35)) && expectationCoverage >= 0.5 && isFiniteNumber(expectationDirectionAccuracy)
      ? clamp((0.58 - expectationDirectionAccuracy) / 0.58, 0, 1)
      : 0;
  const expectationMismatch =
    expectationCount >= Math.max(4, Math.ceil(minRecords * 0.35)) &&
    expectationCoverage >= 0.5 &&
    isFiniteNumber(expectationDirectionAccuracy) &&
    expectationDirectionAccuracy < 0.25;
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
      beliefDecisionClassPenalty * 0.12 -
      expectationPenalty * 0.14 -
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
    decisionClassMismatch ? "decision_class_mismatch" : null,
    expectationMismatch ? "expectation_violation_inverted" : null,
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
    decisionClassCoverage < 0.5 && scoredRecords >= minRecords ? "decision-class labels for a larger realized sample" : null,
    expectationCoverage < 0.5 && scoredRecords >= Math.max(3, Math.ceil(minRecords * 0.35))
      ? "realized fundamental-versus-implied expectation labels"
      : null,
    expectationCount >= Math.max(4, Math.ceil(minRecords * 0.35)) &&
    expectationCoverage >= 0.5 &&
    isFiniteNumber(expectationDirectionAccuracy) &&
    expectationDirectionAccuracy < 0.58
      ? "better expectation-violation direction accuracy before promotion"
      : null,
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
      expectationViolationCoverage: expectationCoverage,
      expectationViolationDirectionAccuracy: expectationDirectionAccuracy,
      expectationViolationMeanAbsoluteError: expectationGapError,
      expectationViolationPenalty: expectationPenalty,
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
  { level: "decision_class", keys: ["decisionClass"] },
  { level: "horizon_archetype", keys: ["horizon", "archetype"] },
  { level: "horizon_sector", keys: ["horizon", "sector"] },
  { level: "decision_state", keys: ["decisionState"] },
  { level: "decision_horizon", keys: ["decisionClass", "horizon"] },
];

function summarizeScored(scored = [], records = [], options = {}) {
  return {
    recordCount: records.length,
    scoredRecords: scored.length,
    pendingRecords: Math.max(0, records.length - scored.length),
    continuous: aggregateContinuous(scored),
    investment: aggregateInvestment(scored),
    belief: aggregateBelief(scored),
    expectationViolation: aggregateExpectationViolation(scored),
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

function contractStatus(mode, authority = {}, riskControls = {}) {
  if (authority.decisionRights === "freeze_promotion" || mode === "conservative_override") return "blocked";
  if (authority.decisionRights === "observe_only" || mode === "observe_only") return "observe";
  if (riskControls.shouldAbstain) return "blocked";
  if (authority.decisionRights === "shadow_or_memo_only") return "shadow";
  if (authority.decisionRights === "stage_with_guardrails") return "guardrailed";
  if (authority.decisionRights === "use_calibrated_branch_with_monitoring") return "ready";
  if (mode === "shadow") return "shadow";
  if (mode === "production_monitoring" || mode === "guardrailed_stage") return "guardrailed";
  return "shadow";
}

function statusLabel(status) {
  return (
    {
      ready: "Ready with monitoring",
      guardrailed: "Stage with guardrails",
      shadow: "Shadow only",
      observe: "Observe only",
      blocked: "Blocked",
    }[status] || "Shadow only"
  );
}

function branchUse(status) {
  return (
    {
      ready: "calibrated_primary",
      guardrailed: "calibrated_with_size_cap",
      shadow: "raw_primary_calibrated_shadow",
      observe: "raw_primary_collect_outcomes",
      blocked: "raw_primary_calibration_risk_override",
    }[status] || "raw_primary_calibrated_shadow"
  );
}

function calibratedWeight(status, authorityScore, contextualApplied) {
  const score = clamp(numeric(authorityScore, 0), 0, 1);
  const contextBonus = contextualApplied ? 0.08 : 0;
  if (status === "ready") return clamp(0.65 + score * 0.3 + contextBonus, 0, 1);
  if (status === "guardrailed") return clamp(0.22 + score * 0.28 + contextBonus, 0, 0.6);
  if (status === "shadow") return 0;
  if (status === "observe") return 0;
  return 0;
}

function sizingCap(status, authorityScore, riskControls = {}) {
  if (status === "blocked" || status === "observe" || status === "shadow") return 0;
  const score = clamp(numeric(authorityScore, 0), 0, 1);
  const confidence = clamp(numeric(riskControls.confidence, 0), 0, 1);
  const negative = clamp(numeric(riskControls.negativeReturnProbability, 0.5), 0.01, 0.99);
  const rawCap = status === "ready" ? 0.35 + score * 0.55 : 0.1 + score * 0.35;
  return clamp(rawCap * (0.65 + confidence * 0.35) * (1 - negative * 0.3), 0, status === "ready" ? 1 : 0.5);
}

function monitoringPlan(calibration = {}, authority = {}, riskControls = {}, contextualCalibration = {}) {
  const summary = calibration.summary || {};
  const investment = summary.investment || {};
  const diagnostics = authority.diagnostics || {};
  const segmentLabel = contextualCalibration.activeSegment?.label || null;
  const expectation = summary.expectationViolation || {};
  const metrics = [
    {
      id: "interval_coverage_80",
      label: "80% interval coverage",
      observed: diagnostics.coverage80 ?? averageCoverage(summary),
      target: 0.8,
      tolerance: 0.16,
    },
    {
      id: "negative_return_brier",
      label: "Negative-return probability score",
      observed: diagnostics.brier ?? investment.meanBrier ?? null,
      target: 0.18,
      max: 0.34,
    },
    {
      id: "return_bucket_monotonicity",
      label: "Return bucket order",
      observed: diagnostics.monotonicity ?? investment.monotonicity ?? null,
      target: 0.7,
      min: 0.5,
    },
    {
      id: "authority_score",
      label: "Calibration authority score",
      observed: authority.authorityScore ?? null,
      target: 0.72,
      min: 0.34,
    },
    {
      id: "expectation_violation_direction_accuracy",
      label: "Expectation-violation direction accuracy",
      observed: diagnostics.expectationViolationDirectionAccuracy ?? expectation.composite?.directionAccuracy ?? null,
      target: 0.58,
      min: 0.4,
    },
    {
      id: "abstention_rate_control",
      label: "Abstention control",
      observed: riskControls.shouldAbstain ? 1 : 0,
      target: 0,
      max: 0,
    },
  ];
  return {
    cadence: "score_after_realized_outcomes",
    activeSegment: segmentLabel,
    metrics,
    requiredEvidence: authority.requiredEvidence || [],
    revocationTriggers: [
      "calibration_failing decision",
      "interval coverage outside target tolerance",
      "negative-return Brier score above failure threshold",
      "return buckets stop ranking outcomes",
      "high experiment-count pressure",
      "hard block appears in calibration authority",
    ],
  };
}

function buildCalibrationContract({
  prediction = {},
  calibration = {},
  policy = {},
  effectivePolicy = {},
  calibrationAuthority = {},
  contextualCalibration = {},
  riskControls = {},
  mode = "observe_only",
  calibratedValuationEnsemble = {},
  options = {},
} = {}) {
  const status = contractStatus(mode, calibrationAuthority, riskControls);
  const authorityScore = clamp(numeric(calibrationAuthority.authorityScore, 0), 0, 1);
  const branch = branchUse(status);
  const displayMode =
    status === "ready"
      ? "show_calibrated_as_primary"
      : status === "guardrailed"
        ? "show_calibrated_with_raw_comparison"
        : status === "blocked"
          ? "show_raw_and_block_calibrated_decision"
          : "show_raw_and_shadow_calibrated";
  const weight = calibratedWeight(status, authorityScore, contextualCalibration.applied);
  const cap = sizingCap(status, authorityScore, riskControls);
  const calibratedExpectedReturn = numeric(calibratedValuationEnsemble?.summary?.expectedReturn, null);
  const rawExpectedReturn = numeric(getEnsemble(prediction)?.summary?.expectedReturn, null);
  const expectedReturnDelta =
    isFiniteNumber(calibratedExpectedReturn) && isFiniteNumber(rawExpectedReturn) ? calibratedExpectedReturn - rawExpectedReturn : null;
  const hardBlocks = calibrationAuthority.hardBlocks || [];
  const warnings = integrationWarnings(policy, calibration);
  const canUseForDecision = ["ready", "guardrailed"].includes(status) && !riskControls.shouldAbstain && !hardBlocks.length;

  return {
    version: "aurora_calibration_contract_v1",
    status,
    label: statusLabel(status),
    mode,
    action: policy.action || null,
    canUseForDecision,
    branch,
    displayMode,
    authority: {
      score: authorityScore,
      tier: calibrationAuthority.evidenceTier || null,
      rights: calibrationAuthority.decisionRights || null,
      hardBlocks,
      requiredEvidence: calibrationAuthority.requiredEvidence || [],
    },
    adoption: {
      calibratedWeight: weight,
      maxPositionSizeMultiplier: cap,
      mustShowRawComparison: status !== "ready",
      mustShowWarnings: Boolean(warnings.length || hardBlocks.length || riskControls.shouldAbstain),
      promoteOnlyAfter: [
        "decision rights reach use_calibrated_branch_with_monitoring",
        "hard blocks are empty",
        "80% interval coverage remains inside tolerance",
        "negative-return probability score remains usable",
      ],
    },
    productRead: {
      primaryBranch: branch.startsWith("calibrated") ? "calibrated" : "raw",
      secondaryBranch: branch.includes("shadow") || branch.includes("comparison") || status === "guardrailed" ? "calibrated" : "none",
      confidence: riskControls.confidence ?? null,
      uncertaintyScale: riskControls.uncertaintyScale ?? null,
      negativeReturnProbability: riskControls.negativeReturnProbability ?? null,
      shouldAbstain: Boolean(riskControls.shouldAbstain),
      expectedReturnDelta,
    },
    contextualCalibration: {
      applied: Boolean(contextualCalibration.applied),
      activeSegment: contextualCalibration.activeSegment || null,
      missedReason: contextualCalibration.missedReason || null,
      contextualWeight: effectivePolicy.contextualWeight || 0,
    },
    monitoring: monitoringPlan(calibration, calibrationAuthority, riskControls, contextualCalibration),
    warnings,
    memo: {
      headline: `${statusLabel(status)}; branch=${branch}.`,
      reason: hardBlocks[0] || (riskControls.shouldAbstain ? "risk_controls_require_abstention" : contextualCalibration.missedReason || "calibration_contract_ok"),
      nextEvidence: calibrationAuthority.requiredEvidence?.[0] || null,
      integrationNote: options.integrationNote || null,
    },
  };
}

function gateStatus(value, goodWhen = "high") {
  const parsed = numeric(value, null);
  if (!isFiniteNumber(parsed)) return "unknown";
  if (goodWhen === "low") {
    if (parsed <= 0.18) return "pass";
    if (parsed <= 0.34) return "warn";
    return "fail";
  }
  if (parsed >= 0.7) return "pass";
  if (parsed >= 0.5) return "warn";
  return "fail";
}

function promotionChecklist(authority = {}, contract = {}, calibration = {}) {
  const diagnostics = authority.diagnostics || {};
  const scoredRecords = numeric(authority.scoredRecords, 0);
  const minRecords = numeric(authority.minRecords, 12);
  const coverage80 = numeric(diagnostics.coverage80, null);
  const brier = numeric(diagnostics.brier, null);
  const monotonicity = numeric(diagnostics.monotonicity, null);
  const expectationDirectionAccuracy = numeric(diagnostics.expectationViolationDirectionAccuracy, null);
  const experimentRisk = diagnostics.experimentRisk || calibration.summary?.experimentRisk?.level || "unknown";
  const hardBlocks = authority.hardBlocks || [];
  return [
    {
      id: "realized_outcomes",
      label: "Realized outcomes",
      status: scoredRecords >= minRecords ? "pass" : scoredRecords >= Math.max(3, Math.ceil(minRecords * 0.35)) ? "warn" : "fail",
      observed: scoredRecords,
      target: minRecords,
      message:
        scoredRecords >= minRecords
          ? "Enough realized outcomes for the global calibration contract."
          : `${Math.max(0, minRecords - scoredRecords)} more realized outcomes are needed.`,
    },
    {
      id: "hard_blocks_clear",
      label: "Hard blocks",
      status: hardBlocks.length ? "fail" : "pass",
      observed: hardBlocks.length,
      target: 0,
      message: hardBlocks.length ? hardBlocks.join(", ") : "No hard calibration blocks.",
    },
    {
      id: "interval_coverage_80",
      label: "80% interval coverage",
      status: isFiniteNumber(coverage80) ? (Math.abs(coverage80 - 0.8) <= 0.16 ? "pass" : Math.abs(coverage80 - 0.8) <= 0.28 ? "warn" : "fail") : "unknown",
      observed: coverage80,
      target: 0.8,
      message: isFiniteNumber(coverage80) ? "Coverage is measured against the stated 80% interval." : "Coverage needs realized variable outcomes.",
    },
    {
      id: "negative_return_brier",
      label: "Negative-return probability score",
      status: gateStatus(brier, "low"),
      observed: brier,
      target: 0.18,
      max: 0.34,
      message: isFiniteNumber(brier) ? "Brier score checks whether downside probabilities are honest." : "Needs realized return outcomes.",
    },
    {
      id: "return_bucket_order",
      label: "Return bucket order",
      status: gateStatus(monotonicity, "high"),
      observed: monotonicity,
      target: 0.7,
      min: 0.5,
      message: isFiniteNumber(monotonicity) ? "Higher expected-return buckets should realize better outcomes." : "Needs enough predictions for buckets.",
    },
    {
      id: "expectation_violation_direction",
      label: "Expectation violation direction",
      status: gateStatus(expectationDirectionAccuracy, "high"),
      observed: expectationDirectionAccuracy,
      target: 0.58,
      min: 0.4,
      message: isFiniteNumber(expectationDirectionAccuracy)
        ? "Priced-belief direction should match realized fundamental-versus-implied outcomes."
        : "Needs realized expectation-violation labels.",
    },
    {
      id: "experiment_pressure",
      label: "Experiment pressure",
      status: experimentRisk === "high_backtest_overfitting_risk" ? "fail" : experimentRisk === "moderate_backtest_overfitting_risk" ? "warn" : "pass",
      observed: experimentRisk,
      target: "low_recorded_experiment_pressure",
      message:
        experimentRisk === "unknown"
          ? "Experiment-count metadata is missing."
          : experimentRisk.replaceAll("_", " "),
    },
    {
      id: "contract_permission",
      label: "Contract permission",
      status: contract.canUseForDecision ? "pass" : contract.status === "guardrailed" || contract.status === "shadow" ? "warn" : "fail",
      observed: contract.status,
      target: "ready_or_guardrailed",
      message: contract.canUseForDecision ? "Calibration may affect decision support." : "Calibration remains raw-primary, shadow, or blocked.",
    },
  ];
}

function buildCalibrationAdoptionGate({
  calibration = {},
  calibrationAuthority = {},
  calibrationContract = {},
  contextualCalibration = {},
  riskControls = {},
  warnings = [],
} = {}) {
  const status = calibrationContract.status || "shadow";
  const authorityScore = clamp(numeric(calibrationAuthority.authorityScore, calibrationContract.authority?.score ?? 0), 0, 1);
  const calibratedWeight = clamp(numeric(calibrationContract.adoption?.calibratedWeight, 0), 0, 1);
  const primaryBranch = calibrationContract.productRead?.primaryBranch || "raw";
  const shadowWeight =
    status === "shadow"
      ? clamp(0.25 + authorityScore * 0.45 + (contextualCalibration.applied ? 0.08 : 0), 0, 0.75)
      : status === "observe"
        ? 0
        : 0;
  const rawWeight = primaryBranch === "raw" ? 1 : clamp(1 - calibratedWeight, 0, 1);
  const checklist = promotionChecklist(calibrationAuthority, calibrationContract, calibration);
  const failed = checklist.filter((item) => item.status === "fail");
  const warningItems = checklist.filter((item) => item.status === "warn");
  const decisionUse =
    status === "ready"
      ? "calibrated_primary"
      : status === "guardrailed"
        ? "calibrated_with_raw_check"
        : status === "blocked"
          ? "blocked"
          : status === "observe"
            ? "raw_primary_collect_outcomes"
            : "raw_primary_calibrated_shadow";
  const explanation =
    status === "ready"
      ? "Calibration has earned primary use, but monitoring remains mandatory."
      : status === "guardrailed"
        ? "Calibration can inform the view with size limits and raw comparison."
        : status === "blocked"
          ? "Calibration failed or triggered a hard block; do not use it for decision support."
          : status === "observe"
            ? "There is not enough realized history; keep raw output primary and collect outcomes."
            : "Calibration can be shown as shadow evidence, not as the decision branch.";

  return {
    version: "aurora_calibration_adoption_gate_v1",
    status,
    decisionUse,
    canPromote: status === "ready" && calibrationContract.canUseForDecision === true,
    canStage: ["ready", "guardrailed"].includes(status) && !riskControls.shouldAbstain,
    mustUseRawPrimary: primaryBranch === "raw",
    mustAbstain: Boolean(riskControls.shouldAbstain) || status === "blocked",
    adoption: {
      primaryBranch,
      calibratedWeight,
      rawWeight,
      shadowWeight,
      maxPositionSizeMultiplier: calibrationContract.adoption?.maxPositionSizeMultiplier ?? 0,
      mustShowRawComparison: calibrationContract.adoption?.mustShowRawComparison !== false,
      mustShowWarnings: Boolean(calibrationContract.adoption?.mustShowWarnings || warnings.length || failed.length),
    },
    evidence: {
      authorityScore,
      evidenceTier: calibrationAuthority.evidenceTier || calibrationContract.authority?.tier || "unknown",
      scoredRecords: calibrationAuthority.scoredRecords ?? null,
      minRecords: calibrationAuthority.minRecords ?? null,
      activeSegment: contextualCalibration.activeSegment || null,
      contextualApplied: Boolean(contextualCalibration.applied),
      hardBlocks: calibrationAuthority.hardBlocks || [],
      requiredEvidence: calibrationAuthority.requiredEvidence || calibrationContract.authority?.requiredEvidence || [],
    },
    checklist,
    blockers: failed.map((item) => item.id),
    warnings: [...warnings, ...warningItems.map((item) => item.message)].filter(Boolean),
    monitoring: calibrationContract.monitoring || null,
    memo: {
      headline: `${statusLabel(status)}; ${decisionUse.replaceAll("_", " ")}.`,
      explanation,
      nextStep:
        failed[0]?.message ||
        warningItems[0]?.message ||
        calibrationContract.authority?.requiredEvidence?.[0] ||
        "Keep scoring realized outcomes and monitor revocation triggers.",
    },
  };
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
  const shouldAbstain =
    confidence < abstentionThreshold || mode === "conservative_override" || calibrationAuthority.riskControls?.forceAbstention === true;
  const riskControls = {
    confidence,
    confidenceHaircut: numeric(effectivePolicy.globalAdjustments?.confidenceHaircut, 0),
    negativeReturnProbability,
    abstentionThreshold,
    uncertaintyScale: numeric(effectivePolicy.globalAdjustments?.uncertaintyScale, 1),
    authorityScore: calibrationAuthority.authorityScore,
    authorityMode: calibrationAuthority.mode,
    decisionRights: calibrationAuthority.decisionRights,
    shouldAbstain,
  };
  const warnings = integrationWarnings(policy, calibration);
  const calibrationContract = buildCalibrationContract({
    prediction,
    calibration,
    policy,
    effectivePolicy,
    calibrationAuthority,
    contextualCalibration,
    riskControls,
    mode,
    calibratedValuationEnsemble,
    options,
  });
  const calibrationAdoptionGate = buildCalibrationAdoptionGate({
    calibration,
    calibrationAuthority,
    calibrationContract,
    contextualCalibration,
    riskControls,
    warnings,
  });

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
    riskControls,
    calibrationContract,
    calibrationAdoptionGate,
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
    warnings,
    memo: {
      headline: `Calibration integration is ${mode.replaceAll("_", " ")} using ${policy.action.replaceAll("_", " ")}.`,
      confidence,
      abstentionThreshold,
      shouldAbstain,
      authority: calibrationAuthority.evidenceTier,
      contractStatus: calibrationContract.status,
      adoptionGate: calibrationAdoptionGate.status,
      branch: calibrationContract.branch,
      warningCount: warnings.length,
    },
  };
}

export { buildCalibrationAdoptionGate as buildAuroraCalibrationAdoptionGate };

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
