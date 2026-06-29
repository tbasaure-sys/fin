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

function quantile(values, q) {
  const clean = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (!clean.length) return null;
  const position = (clean.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return clean[low];
  return clean[low] + (clean[high] - clean[low]) * (position - low);
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeGuidanceRecords(input = {}) {
  const raw =
    input.managementGuidance ||
    input.guidanceRecords ||
    input.guidance ||
    input.management?.guidance ||
    input.managementReliability?.records ||
    [];
  return arrayOrEmpty(raw).map((record, index) => ({
    id: record.id || `guidance_${index + 1}`,
    date: record.date || record.issuedAt || record.filedAt || null,
    actualDate: record.actualDate || record.realizedAt || null,
    kpi: firstText(record.kpi, record.metric, record.variable, "unknown"),
    horizon: firstText(record.horizon, record.period, record.fiscalYear, "unknown"),
    source: record.source || record.document || null,
    explanation: record.explanation || record.reason || record.text || null,
    low: numeric(record.low, numeric(record.min, null)),
    high: numeric(record.high, numeric(record.max, null)),
    midpoint: numeric(record.midpoint, numeric(record.mid, null)),
    actual: numeric(record.actual, numeric(record.realized, numeric(record.result, null))),
    scale: numeric(record.scale, null),
    revisionOf: record.revisionOf || record.priorGuidanceId || null,
    revisionDirection: record.revisionDirection || record.direction || null,
    regime: firstText(record.regime, record.marketRegime, record.cycle, ""),
    team: firstText(record.team, record.managementTeam, record.executive, "company_management"),
  }));
}

function midpoint(record) {
  if (isFiniteNumber(record.midpoint)) return record.midpoint;
  if (isFiniteNumber(record.low) && isFiniteNumber(record.high)) return (record.low + record.high) / 2;
  if (isFiniteNumber(record.low)) return record.low;
  if (isFiniteNumber(record.high)) return record.high;
  return null;
}

function guidanceScale(record, mid, actual) {
  if (isFiniteNumber(record.scale) && record.scale > 0) return record.scale;
  const width = isFiniteNumber(record.low) && isFiniteNumber(record.high) ? Math.abs(record.high - record.low) : null;
  return Math.max(1e-6, Math.abs(mid || 0), Math.abs(actual || 0), width || 0);
}

function scoreGuidanceRecord(record) {
  const mid = midpoint(record);
  const actual = record.actual;
  const hasActual = isFiniteNumber(mid) && isFiniteNumber(actual);
  if (!hasActual) {
    return {
      ...record,
      status: "pending_outcome",
      midpoint: mid,
      error: null,
      absoluteError: null,
      hit: null,
    };
  }
  const scale = guidanceScale(record, mid, actual);
  const error = (actual - mid) / scale;
  const hit =
    isFiniteNumber(record.low) && isFiniteNumber(record.high)
      ? actual >= Math.min(record.low, record.high) && actual <= Math.max(record.low, record.high)
      : Math.abs(error) <= 0.06;
  return {
    ...record,
    status: "scored",
    midpoint: mid,
    scale,
    error,
    absoluteError: Math.abs(error),
    hit,
    missDirection: hit ? "hit" : error > 0 ? "underpromised" : "overpromised",
  };
}

function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] ||= [];
    acc[key].push(item);
    return acc;
  }, {});
}

function summarizeGroup(records) {
  const scored = records.filter((record) => record.status === "scored");
  const errors = scored.map((record) => record.error);
  const absoluteErrors = scored.map((record) => record.absoluteError);
  const hitRate = scored.length ? scored.filter((record) => record.hit).length / scored.length : null;
  const meanAbsoluteError = mean(absoluteErrors);
  const bias = mean(errors);
  const precision = isFiniteNumber(meanAbsoluteError) ? 1 / (1 + meanAbsoluteError * 4) : null;
  const underpromiseRate = scored.length ? scored.filter((record) => record.missDirection === "underpromised").length / scored.length : null;
  return {
    count: records.length,
    scored: scored.length,
    pending: records.length - scored.length,
    hitRate,
    bias,
    meanAbsoluteError,
    precision,
    underpromiseRate,
    errorP10: quantile(errors, 0.1),
    errorP50: quantile(errors, 0.5),
    errorP90: quantile(errors, 0.9),
  };
}

function aggregateKpis(scoredRecords) {
  const groups = groupBy(scoredRecords, (record) => record.kpi || "unknown");
  return Object.entries(groups).reduce((acc, [kpi, records]) => {
    acc[kpi] = summarizeGroup(records);
    return acc;
  }, {});
}

function aggregateTeams(scoredRecords) {
  const groups = groupBy(scoredRecords, (record) => record.team || "company_management");
  return Object.entries(groups).reduce((acc, [team, records]) => {
    acc[team] = summarizeGroup(records);
    return acc;
  }, {});
}

function revisionSummary(records) {
  const revisions = records.filter((record) => record.revisionOf || record.revisionDirection);
  const downward = revisions.filter((record) => /down|cut|lower|negative/i.test(String(record.revisionDirection))).length;
  const upward = revisions.filter((record) => /up|raise|higher|positive/i.test(String(record.revisionDirection))).length;
  return {
    revisionCount: revisions.length,
    revisionFrequency: records.length ? revisions.length / records.length : 0,
    downwardRevisionShare: revisions.length ? downward / revisions.length : null,
    upwardRevisionShare: revisions.length ? upward / revisions.length : null,
  };
}

function downturnSummary(scoredRecords) {
  const downturn = scoredRecords.filter((record) => /downturn|recession|stress|bear|crisis|cycle_down/i.test(String(record.regime)));
  const summary = summarizeGroup(downturn);
  return {
    ...summary,
    regimeRecordCount: downturn.length,
  };
}

function credibilityPosterior(overall, revisions, downturn) {
  if (!overall.scored) {
    return {
      p10: 0.25,
      p50: 0.5,
      p90: 0.75,
      status: "insufficient_history",
    };
  }
  const hit = numeric(overall.hitRate, 0.45);
  const precision = numeric(overall.precision, 0.45);
  const biasPenalty = Math.min(0.24, Math.abs(numeric(overall.bias, 0)) * 0.45);
  const revisionPenalty = Math.min(0.18, revisions.revisionFrequency * 0.35 + numeric(revisions.downwardRevisionShare, 0) * 0.08);
  const downturnPenalty =
    downturn.regimeRecordCount && isFiniteNumber(downturn.meanAbsoluteError)
      ? Math.min(0.16, Math.max(0, downturn.meanAbsoluteError - numeric(overall.meanAbsoluteError, 0)) * 0.45)
      : 0;
  const center = clamp(0.16 + hit * 0.34 + precision * 0.36 - biasPenalty - revisionPenalty - downturnPenalty, 0.02, 0.98);
  const width = clamp(0.22 / Math.sqrt(Math.max(1, overall.scored)) + revisions.revisionFrequency * 0.06, 0.06, 0.28);
  return {
    p10: clamp(center - width, 0, 1),
    p50: center,
    p90: clamp(center + width, 0, 1),
    status: center >= 0.68 ? "reliable" : center >= 0.48 ? "mixed" : "low_reliability",
  };
}

function adjustmentRecommendations(posterior, overall, revisions) {
  const credibility = numeric(posterior.p50, 0.5);
  const bias = numeric(overall.bias, 0);
  return {
    forecastSdMultiplier: clamp(1.35 - credibility * 0.45 + revisions.revisionFrequency * 0.25, 0.85, 1.65),
    guidanceProbabilityHaircut: clamp((0.62 - credibility) * 0.55 + Math.max(0, -bias) * 0.2, 0, 0.45),
    acquisitionExecutionPrior: clamp(0.35 + credibility * 0.45, 0.2, 0.9),
    buybackDisciplinePrior: clamp(0.32 + credibility * 0.42 - revisions.revisionFrequency * 0.08, 0.15, 0.9),
    dilutionRiskAdjustment: clamp((0.56 - credibility) * 0.18 + revisions.revisionFrequency * 0.06, 0, 0.22),
  };
}

function buildDecision(posterior, overall) {
  if (!overall.scored) return "management_reliability_pending";
  if (posterior.p50 < 0.38 || numeric(overall.hitRate, 0) < 0.35) return "management_reliability_poor";
  if (posterior.p50 < 0.58 || Math.abs(numeric(overall.bias, 0)) > 0.18) return "management_reliability_mixed";
  return "management_reliability_usable";
}

export function buildAuroraManagementReliabilityEngine(input = {}, options = {}) {
  const records = normalizeGuidanceRecords(input).map(scoreGuidanceRecord);
  const overall = summarizeGroup(records);
  const revisions = revisionSummary(records);
  const downturn = downturnSummary(records.filter((record) => record.status === "scored"));
  const byKpi = aggregateKpis(records);
  const byTeam = aggregateTeams(records);
  const posterior = credibilityPosterior(overall, revisions, downturn);
  const adjustments = adjustmentRecommendations(posterior, overall, revisions);
  const decision = buildDecision(posterior, overall);

  return {
    version: "aurora_management_reliability_engine_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    decision,
    records,
    summary: {
      overall,
      revisions,
      downturn,
      byKpi,
      byTeam,
    },
    posterior,
    adjustments,
    memo: {
      headline: `Management reliability is ${decision.replaceAll("_", " ")}.`,
      scoredGuidance: overall.scored,
      pendingGuidance: overall.pending,
      credibility: posterior.p50,
      hitRate: overall.hitRate,
      bias: overall.bias,
      revisionFrequency: revisions.revisionFrequency,
      primaryAdjustment: `Forecast SD multiplier ${adjustments.forecastSdMultiplier.toFixed(2)}.`,
    },
  };
}

