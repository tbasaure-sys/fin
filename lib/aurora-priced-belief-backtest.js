import { compileAuroraBeliefObject } from "./aurora-belief-compiler.js";

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
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function beliefMetricDirection(key) {
  return key === "reinvestment" || key === "dilution" ? "lower_is_better" : "higher_is_better";
}

function orientedGap(key, actual, implied) {
  if (!isFiniteNumber(actual) || !isFiniteNumber(implied)) return null;
  return beliefMetricDirection(key) === "lower_is_better" ? implied - actual : actual - implied;
}

function variableActual(actuals = {}, key) {
  const aliases = {
    growth: ["growth", "revenueGrowth", "revenueCagr", "revenueCagr3y", "revenueCagr5y"],
    margin: ["margin", "operatingMargin", "ebitMargin", "terminalMargin"],
    roic: ["roic", "roiic", "returnOnInvestedCapital"],
    reinvestment: ["reinvestment", "reinvestmentRate"],
    fcfMargin: ["fcfMargin", "freeCashFlowMargin", "ownerEarningsMargin", "cashFlowMargin"],
    dilution: ["dilution", "dilutionRate", "shareGrowth", "shareCountCagr"],
  }[key] || [key];
  for (const alias of aliases) {
    const value = numeric(actuals?.[alias], null);
    if (isFiniteNumber(value)) return value;
  }
  return null;
}

function impliedBeliefMean(beliefObject = {}, key) {
  const market = beliefObject?.marketImpliedBeliefs || {};
  const aliases = {
    growth: ["revenueCagr5y"],
    margin: ["terminalMargin"],
    roic: ["roicPath"],
    reinvestment: ["reinvestmentRate"],
    fcfMargin: ["fcfMargin"],
    dilution: ["dilution"],
  }[key] || [key];
  for (const alias of aliases) {
    const value = numeric(market?.[alias]?.mean, null);
    if (isFiniteNumber(value)) return value;
  }
  return null;
}

function predictedBeliefGap(beliefObject = {}, key) {
  const raw = numeric(beliefObject?.beliefGap?.[key]?.gap, null);
  if (isFiniteNumber(raw)) {
    return beliefMetricDirection(key) === "lower_is_better" ? -raw : raw;
  }
  const actualFeasible = numeric(beliefObject?.businessPhysicsBeliefs?.evidenceAdjusted?.[key]?.mean, null);
  const implied = impliedBeliefMean(beliefObject, key);
  if (!isFiniteNumber(actualFeasible) || !isFiniteNumber(implied)) return null;
  return beliefMetricDirection(key) === "lower_is_better" ? implied - actualFeasible : actualFeasible - implied;
}

function actualReturn(actuals = {}, prediction = {}) {
  const explicit = numeric(actuals.realizedReturn, numeric(actuals.return, numeric(actuals.irr, null)));
  if (isFiniteNumber(explicit)) return explicit;
  const price = numeric(prediction?.beliefObject?.price, numeric(prediction?.market?.price, null));
  const future = numeric(actuals.value, numeric(actuals.fairValue, numeric(actuals.futurePrice, null)));
  return isFiniteNumber(price) && price > 0 && isFiniteNumber(future) ? future / price - 1 : null;
}

function sameDirection(left, right, tolerance = 1e-6) {
  if (!isFiniteNumber(left) || !isFiniteNumber(right)) return null;
  if (Math.abs(left) <= tolerance && Math.abs(right) <= tolerance) return true;
  if (Math.abs(left) <= tolerance || Math.abs(right) <= tolerance) return null;
  return Math.sign(left) === Math.sign(right);
}

function rank(values) {
  const rows = values.map((value, index) => ({ value, index })).filter((row) => isFiniteNumber(row.value)).sort((a, b) => a.value - b.value);
  const ranked = new Array(values.length).fill(null);
  let cursor = 0;
  while (cursor < rows.length) {
    let end = cursor;
    while (end + 1 < rows.length && rows[end + 1].value === rows[cursor].value) end += 1;
    const averageRank = (cursor + end + 2) / 2;
    for (let i = cursor; i <= end; i += 1) ranked[rows[i].index] = averageRank;
    cursor = end + 1;
  }
  return ranked;
}

function pearson(x, y) {
  const pairs = [];
  for (let i = 0; i < x.length; i += 1) {
    if (isFiniteNumber(x[i]) && isFiniteNumber(y[i])) pairs.push([x[i], y[i]]);
  }
  if (pairs.length < 2) return null;
  const mx = mean(pairs.map((pair) => pair[0]));
  const my = mean(pairs.map((pair) => pair[1]));
  let numerator = 0;
  let dx = 0;
  let dy = 0;
  pairs.forEach(([left, right]) => {
    numerator += (left - mx) * (right - my);
    dx += (left - mx) ** 2;
    dy += (right - my) ** 2;
  });
  if (dx <= 0 || dy <= 0) return null;
  return numerator / Math.sqrt(dx * dy);
}

function spearman(x, y) {
  return pearson(rank(x), rank(y));
}

function predictionForRecord(record = {}, options = {}) {
  if (record.prediction) return record.prediction;
  if (record.pipeline) return record.pipeline;
  if (record.compiled) return record.compiled;
  if (record.snapshot) return compileAuroraBeliefObject(record.snapshot, options.compilerOptions || options);
  return compileAuroraBeliefObject(record, options.compilerOptions || options);
}

function componentWeight(name) {
  return {
    growth: 0.25,
    margin: 0.25,
    roic: 0.25,
    fcfMargin: 0.15,
    dilution: 0.1,
    reinvestment: 0.1,
  }[name] || 0;
}

function dominantComponent(components = []) {
  return arrayOrEmpty(components)
    .filter((item) => isFiniteNumber(item.absoluteViolation))
    .sort((a, b) => b.absoluteViolation - a.absoluteViolation)[0] || null;
}

function topBurdenKey(beliefObject = {}) {
  return beliefObject?.assumptionBurdenOfProof?.components?.[0]?.key || null;
}

function topFalsifierVariable(beliefObject = {}) {
  return beliefObject?.falsifiers?.[0]?.variable || null;
}

function computeExpectationViolation(beliefObject = {}, actuals = {}) {
  const keys = ["growth", "margin", "roic", "fcfMargin", "dilution", "reinvestment"];
  const components = keys
    .map((key) => {
      const implied = impliedBeliefMean(beliefObject, key);
      const actual = variableActual(actuals, key);
      const violation = orientedGap(key, actual, implied);
      const predictedGap = predictedBeliefGap(beliefObject, key);
      if (!isFiniteNumber(implied) || !isFiniteNumber(actual) || !isFiniteNumber(violation)) return null;
      return {
        key,
        direction: beliefMetricDirection(key),
        weight: componentWeight(key),
        implied,
        actual,
        predictedGap,
        violation,
        absoluteViolation: Math.abs(violation),
        directionMatch: sameDirection(predictedGap, violation),
      };
    })
    .filter(Boolean);

  const used = components.filter((item) => item.weight > 0);
  const denominator = used.reduce((sum, item) => sum + item.weight, 0);
  const compositeScore = denominator > 0 ? used.reduce((sum, item) => sum + item.violation * item.weight, 0) / denominator : null;
  const predictedCompositeGap =
    denominator > 0 ? used.reduce((sum, item) => sum + (isFiniteNumber(item.predictedGap) ? item.predictedGap : 0) * item.weight, 0) / denominator : null;
  return {
    components,
    dominant: dominantComponent(used),
    compositeScore,
    predictedCompositeGap,
    directionMatch: sameDirection(predictedCompositeGap, compositeScore),
    clearedPriceBelief: isFiniteNumber(compositeScore) ? compositeScore >= 0 : null,
  };
}

function classifyErrorGenome(prediction = {}, actuals = {}, expectationViolation = {}, memoTruth = {}) {
  const tags = [];
  const evidenceDebt = numeric(prediction?.beliefObject?.evidenceDebt, 0);
  const abstain = Boolean(prediction?.beliefObject?.abstain);
  const realizedReturn = actualReturn(actuals, prediction);
  const score = numeric(expectationViolation?.compositeScore, null);
  const directionMatch = expectationViolation?.directionMatch;
  const driverHit = memoTruth?.primaryValueDriverHit;
  const falsifierHit = Boolean(actuals?.falsifierHit || actuals?.falsifierTriggered || actuals?.falsified);

  if (directionMatch === false) tags.push("price_implied_error");
  if (isFiniteNumber(score) && Math.abs(score) >= 0.06 && directionMatch !== false) tags.push("fundamental_forecast_error");
  if (driverHit === false) tags.push("value_driver_error");
  if (falsifierHit) tags.push("falsifier_error");
  if (evidenceDebt > 0.55) tags.push("evidence_error");
  if (abstain === false && isFiniteNumber(score) && Math.abs(score) < 0.01) tags.push("abstention_error");
  if (isFiniteNumber(score) && isFiniteNumber(realizedReturn) && score > 0.03 && realizedReturn < 0) tags.push("multiple_or_timing_error");
  if (isFiniteNumber(score) && isFiniteNumber(realizedReturn) && score < -0.03 && realizedReturn > 0) tags.push("reflexivity_or_timing_error");

  const priority = [
    "multiple_or_timing_error",
    "reflexivity_or_timing_error",
    "price_implied_error",
    "fundamental_forecast_error",
    "value_driver_error",
    "falsifier_error",
    "evidence_error",
    "abstention_error",
  ];
  const primary = priority.find((tag) => tags.includes(tag));

  return {
    primary: primary || (isFiniteNumber(score) && score >= 0 ? "validated_priced_belief" : "belief_underperformance"),
    tags: [...new Set(tags)],
  };
}

function memoTruthForRecord(prediction = {}, actuals = {}, expectationViolation = {}) {
  const beliefObject = prediction?.beliefObject || {};
  const dominant = expectationViolation?.dominant || null;
  const primaryValueDriverPredicted = topBurdenKey(beliefObject);
  const primaryValueDriverObserved = dominant?.key || null;
  const primaryValueDriverHit =
    primaryValueDriverPredicted && primaryValueDriverObserved ? primaryValueDriverPredicted === primaryValueDriverObserved : null;
  const topFalsifierPredicted = topFalsifierVariable(beliefObject);
  const falsifierTriggered = Boolean(actuals?.falsifierHit || actuals?.falsifierTriggered || actuals?.falsified);
  const abstentionPredicted = Boolean(beliefObject?.abstain);
  const abstentionCorrect =
    isFiniteNumber(expectationViolation?.compositeScore) ? abstentionPredicted === (Math.abs(expectationViolation.compositeScore) < 0.015) : null;
  return {
    impliedBeliefDirectionCorrect: expectationViolation?.directionMatch ?? null,
    primaryValueDriverPredicted,
    primaryValueDriverObserved,
    primaryValueDriverHit,
    topFalsifierPredicted,
    falsifierTriggered,
    abstentionPredicted,
    abstentionCorrect,
  };
}

function buildBacktestRow(record = {}, options = {}) {
  const prediction = predictionForRecord(record, options);
  const beliefObject = prediction?.beliefObject || {};
  const actuals = record.actuals || record.realized || record.outcome || prediction?.actuals || {};
  const expectationViolation = computeExpectationViolation(beliefObject, actuals);
  const memoTruth = memoTruthForRecord(prediction, actuals, expectationViolation);
  const errorGenome = classifyErrorGenome(prediction, actuals, expectationViolation, memoTruth);
  const realizedReturn = actualReturn(actuals, prediction);

  return {
    id: record.id || prediction?.ticker || beliefObject?.ticker || null,
    ticker: prediction?.ticker || beliefObject?.ticker || null,
    date: beliefObject?.date || firstText(record.date, record.asOfDate, actuals?.date),
    decisionClass: beliefObject?.decisionClass || null,
    abstain: Boolean(beliefObject?.abstain),
    beliefDistortionIndex: numeric(beliefObject?.beliefDistortionIndex, null),
    signedOpportunityScore: numeric(beliefObject?.signedOpportunityScore, null),
    marketImpliedBeliefs: beliefObject?.marketImpliedBeliefs || {},
    realizedOutcomes: {
      growth: variableActual(actuals, "growth"),
      margin: variableActual(actuals, "margin"),
      roic: variableActual(actuals, "roic"),
      reinvestment: variableActual(actuals, "reinvestment"),
      fcfMargin: variableActual(actuals, "fcfMargin"),
      dilution: variableActual(actuals, "dilution"),
      realizedReturn,
    },
    expectationViolation,
    memoTruth,
    errorGenome,
  };
}

function summarizeExpectationViolation(rows = []) {
  const components = {};
  rows.forEach((row) => {
    arrayOrEmpty(row.expectationViolation?.components).forEach((component) => {
      components[component.key] ||= [];
      components[component.key].push(component);
    });
  });
  const componentSummary = Object.entries(components).reduce((acc, [key, items]) => {
    const directionRows = items.filter((item) => item.directionMatch != null);
    acc[key] = {
      count: items.length,
      meanViolation: mean(items.map((item) => item.violation)),
      meanAbsoluteViolation: mean(items.map((item) => item.absoluteViolation)),
      directionAccuracy: directionRows.length ? mean(directionRows.map((item) => (item.directionMatch ? 1 : 0))) : null,
    };
    return acc;
  }, {});
  const compositeRows = rows.filter((row) => isFiniteNumber(row.expectationViolation?.compositeScore));
  const directionRows = compositeRows.filter((row) => row.expectationViolation.directionMatch != null);
  return {
    count: compositeRows.length,
    componentSummary,
    composite: {
      meanScore: mean(compositeRows.map((row) => row.expectationViolation.compositeScore)),
      meanAbsoluteScore: mean(compositeRows.map((row) => Math.abs(row.expectationViolation.compositeScore))),
      directionAccuracy: directionRows.length ? mean(directionRows.map((row) => (row.expectationViolation.directionMatch ? 1 : 0))) : null,
      returnCorrelation: spearman(
        compositeRows.map((row) => row.expectationViolation.compositeScore),
        compositeRows.map((row) => row.realizedOutcomes.realizedReturn),
      ),
      opportunityCorrelation: spearman(
        compositeRows.map((row) => row.signedOpportunityScore),
        compositeRows.map((row) => row.expectationViolation.compositeScore),
      ),
    },
  };
}

function summarizeMemoTruth(rows = []) {
  const driverRows = rows.filter((row) => row.memoTruth?.primaryValueDriverHit != null);
  const abstentionRows = rows.filter((row) => row.memoTruth?.abstentionCorrect != null);
  const directionRows = rows.filter((row) => row.memoTruth?.impliedBeliefDirectionCorrect != null);
  return {
    count: rows.length,
    primaryValueDriverHitRate: driverRows.length ? mean(driverRows.map((row) => (row.memoTruth.primaryValueDriverHit ? 1 : 0))) : null,
    abstentionCorrectRate: abstentionRows.length ? mean(abstentionRows.map((row) => (row.memoTruth.abstentionCorrect ? 1 : 0))) : null,
    beliefDirectionAccuracy: directionRows.length ? mean(directionRows.map((row) => (row.memoTruth.impliedBeliefDirectionCorrect ? 1 : 0))) : null,
    falsifierTriggeredRate: mean(rows.map((row) => (row.memoTruth?.falsifierTriggered ? 1 : 0))),
  };
}

function summarizeErrorGenome(rows = []) {
  return rows.reduce(
    (acc, row) => {
      const primary = row.errorGenome?.primary || "unknown";
      acc.primaryCounts[primary] = (acc.primaryCounts[primary] || 0) + 1;
      arrayOrEmpty(row.errorGenome?.tags).forEach((tag) => {
        acc.tagCounts[tag] = (acc.tagCounts[tag] || 0) + 1;
      });
      return acc;
    },
    { primaryCounts: {}, tagCounts: {} },
  );
}

export function buildAuroraPricedBeliefBacktest(input = {}, options = {}) {
  const records = arrayOrEmpty(input.records || input.rows || input.items || input);
  const rows = records.map((record) => buildBacktestRow(record, options));
  const expectationViolation = summarizeExpectationViolation(rows);
  const memoTruth = summarizeMemoTruth(rows);
  const errorGenome = summarizeErrorGenome(rows);

  return {
    version: "aurora_priced_belief_backtest_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    count: rows.length,
    summary: {
      expectationViolation,
      memoTruth,
      errorGenome,
    },
    rows,
    memo: {
      headline: "AURORA priced-belief backtest scores what price required and what the business later delivered.",
      keyRead:
        expectationViolation.composite?.directionAccuracy == null
          ? "Realized expectation-violation coverage is still sparse."
          : `Composite priced-belief direction accuracy: ${(expectationViolation.composite.directionAccuracy * 100).toFixed(1)}%.`,
      dominantError:
        Object.entries(errorGenome.primaryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown",
      nextQuestion:
        memoTruth.primaryValueDriverHitRate == null
          ? "Collect realized value-driver outcomes."
          : "Did AURORA identify the variable that actually drove the thesis outcome?",
    },
  };
}
