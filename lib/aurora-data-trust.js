function clamp(value, min, max) {
  if (!Number.isFinite(Number(value))) return min;
  return Math.min(Math.max(Number(value), min), max);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function scoreFromMissing(required, missing) {
  if (!required.length) return 100;
  return clamp(100 * (1 - missing.length / required.length), 0, 100);
}

function macroCheck(riskFreeRate) {
  if (!isFiniteNumber(riskFreeRate)) {
    return {
      score: 62,
      status: "estimated",
      warnings: ["Risk-free rate missing; fallback assumption required."],
      doNotTrainReason: null,
    };
  }
  if (riskFreeRate < 0 || riskFreeRate > 0.12) {
    return {
      score: 0,
      status: "fail",
      warnings: [`Risk-free rate ${riskFreeRate} is outside the allowed 0%-12% sanity band.`],
      doNotTrainReason: "macro_rate_out_of_bounds",
    };
  }
  if (riskFreeRate > 0.085) {
    return {
      score: 45,
      status: "warn",
      warnings: [`Risk-free rate ${(riskFreeRate * 100).toFixed(1)}% is unusually high; verify source units.`],
      doNotTrainReason: null,
    };
  }
  return {
    score: 100,
    status: "pass",
    warnings: [],
    doNotTrainReason: null,
  };
}

function accountingCheck(drivers, snapshot) {
  const fcf = drivers.baseFcf;
  const margin = drivers.margin;
  const roic = drivers.roic;
  const facts = snapshot?.facts || {};
  const warnings = [];
  let score = 76;

  if (isFiniteNumber(fcf) && fcf > 0) score += 8;
  else warnings.push("Base FCF is missing or non-positive.");

  if (isFiniteNumber(margin) && margin >= -0.05 && margin <= 0.65) score += 8;
  else warnings.push("Operating margin is missing or outside sanity bounds.");

  if (isFiniteNumber(roic) && roic >= -0.15 && roic <= 0.65) score += 8;
  else warnings.push("ROIC is missing or outside sanity bounds.");

  if (facts.revenue || facts.operatingCashFlow || facts.freeCashFlow || facts.fcf) score += 4;

  return {
    score: clamp(score, 0, 100),
    status: warnings.length >= 2 ? "warn" : "pass",
    warnings,
  };
}

export function buildAuroraDataTrust({ drivers = {}, snapshot = {}, missingDrivers = [] } = {}) {
  const required = ["price", "baseFcf", "revenueCagr", "margin", "roic", "wacc", "reinvestment"];
  const missing = new Set(Array.isArray(missingDrivers) ? missingDrivers : []);
  required.forEach((key) => {
    if (!isFiniteNumber(drivers[key])) missing.add(key);
  });

  const completenessScore = scoreFromMissing(required, [...missing]);
  const macro = macroCheck(drivers.riskFreeRate ?? snapshot?.riskFree?.value ?? snapshot?.assumptions?.riskFree?.value);
  const accounting = accountingCheck(drivers, snapshot);
  const coverage = snapshot?.coverage || {};
  const sourceScore = clamp(
    30
      + (coverage.secCompanyFacts || coverage.secCompanyfacts ? 25 : 0)
      + (coverage.quoteSource || coverage.fmpConfigured ? 18 : 0)
      + (coverage.fredConfigured || snapshot?.riskFree?.source ? 14 : 0)
      + (snapshot?.company?.filedAt || snapshot?.company?.fiscalYear ? 8 : 0),
    0,
    100,
  );
  const pointInTimeScore = coverage.secCompanyFacts || coverage.secCompanyfacts ? 82 : 58;
  const driverQuality = isFiniteNumber(drivers.dataQuality) ? clamp(drivers.dataQuality * 100, 0, 100) : 55;

  const overallScore = Math.round(
    completenessScore * 0.24
      + macro.score * 0.18
      + accounting.score * 0.2
      + sourceScore * 0.18
      + pointInTimeScore * 0.1
      + driverQuality * 0.1,
  );
  const warnings = [
    ...macro.warnings,
    ...accounting.warnings,
    ...[...missing].map((key) => `Missing required driver: ${key}.`),
  ];
  const doNotTrainReason =
    macro.doNotTrainReason
    || (completenessScore < 58 ? "insufficient_driver_completeness" : null)
    || (accounting.score < 45 ? "accounting_quality_too_low" : null);
  const level = overallScore >= 78 ? "decision_grade" : overallScore >= 60 ? "usable_with_caveats" : "research_only";

  return {
    version: "aurora_data_trust_v1",
    overallScore,
    level,
    trainEligible: !doNotTrainReason && overallScore >= 60,
    doNotTrainReason,
    scores: {
      completeness: Math.round(completenessScore),
      macroValidity: Math.round(macro.score),
      accountingQuality: Math.round(accounting.score),
      sourceReliability: Math.round(sourceScore),
      pointInTime: Math.round(pointInTimeScore),
      driverQuality: Math.round(driverQuality),
    },
    missingDrivers: [...missing],
    warnings,
    featureLineage: {
      financials: coverage.secCompanyFacts || coverage.secCompanyfacts ? "SEC companyfacts" : "not_confirmed",
      quote: coverage.quoteSource || (coverage.fmpConfigured ? "FMP configured" : "not_confirmed"),
      macro: snapshot?.riskFree?.source || snapshot?.assumptions?.riskFree?.source || "fallback_or_missing",
      catalyst: snapshot?.catalystEvidence?.source || "optional",
    },
  };
}
