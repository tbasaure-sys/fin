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

function variance(values) {
  const avg = mean(values);
  if (!isFiniteNumber(avg)) return null;
  const clean = values.filter(isFiniteNumber);
  return clean.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(1, clean.length - 1);
}

function firstFinite(...values) {
  for (const value of values) {
    const parsed = numeric(value, null);
    if (isFiniteNumber(parsed)) return parsed;
  }
  return null;
}

function normalInv(p) {
  const x = clamp(p, 1e-9, 1 - 1e-9);
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q;
  if (x < plow) {
    q = Math.sqrt(-2 * Math.log(x));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (x <= phigh) {
    q = x - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
      / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - x));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function normalCdf(z) {
  const x = clamp(z, -8, 8);
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function vdc(index, base) {
  let i = index;
  let f = 1 / base;
  let result = 0;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

function quasiPoint(index, dimensions) {
  const bases = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29];
  return Array.from({ length: dimensions }, (_, dim) => vdc(index + 1, bases[dim]));
}

function cholesky(matrix) {
  const n = matrix.length;
  const l = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = matrix[i][j];
      for (let k = 0; k < j; k += 1) sum -= l[i][k] * l[j][k];
      if (i === j) l[i][j] = Math.sqrt(Math.max(sum, 1e-8));
      else l[i][j] = sum / Math.max(l[j][j], 1e-8);
    }
  }
  return l;
}

const FACTORS = ["growth", "margin", "roic", "reinvestment", "wacc", "terminalGrowth"];
const CORRELATION = [
  [1, 0.32, 0.25, 0.42, 0.08, 0.24],
  [0.32, 1, 0.52, -0.06, -0.05, 0.18],
  [0.25, 0.52, 1, -0.12, -0.08, 0.22],
  [0.42, -0.06, -0.12, 1, 0.1, 0.06],
  [0.08, -0.05, -0.08, 0.1, 1, 0.35],
  [0.24, 0.18, 0.22, 0.06, 0.35, 1],
];

function getForecast(input = {}) {
  return input.calibrationIntegration?.calibratedForecast || input.forecast || input.bayesianForecast || null;
}

function getCompiled(input = {}) {
  return input.compiled || input.pipeline?.compiled || null;
}

function getDrivers(input = {}) {
  return getCompiled(input)?.drivers || input.drivers || {};
}

function distribution(forecast, key, fallbackMean, fallbackSd, min, max) {
  const dist = forecast?.posterior?.[key] || {};
  const p50 = firstFinite(dist.p50, dist.mean, fallbackMean);
  const p10 = firstFinite(dist.p10, isFiniteNumber(p50) ? p50 - fallbackSd * 1.2816 : null);
  const p90 = firstFinite(dist.p90, isFiniteNumber(p50) ? p50 + fallbackSd * 1.2816 : null);
  const sd = firstFinite(dist.sd, isFiniteNumber(p10) && isFiniteNumber(p90) ? Math.abs(p90 - p10) / 2.5632 : fallbackSd);
  return {
    key,
    mean: clamp(firstFinite(dist.mean, p50, fallbackMean), min, max),
    p50: clamp(firstFinite(p50, fallbackMean), min, max),
    sd: Math.max(1e-5, Math.abs(firstFinite(sd, fallbackSd))),
    min,
    max,
  };
}

function distributions(input = {}) {
  const forecast = getForecast(input);
  const drivers = getDrivers(input);
  return {
    growth: distribution(forecast, "growth", numeric(drivers.revenueCagr, 0.05), 0.08, -0.35, 0.55),
    margin: distribution(forecast, "margin", numeric(drivers.margin, 0.14), 0.08, -0.25, 0.72),
    roic: distribution(forecast, "roic", numeric(drivers.roic, 0.11), 0.1, -0.2, 0.85),
    reinvestment: distribution(forecast, "reinvestment", numeric(drivers.reinvestment, 0.32), 0.16, 0.01, 1.2),
    wacc: distribution(forecast, "wacc", numeric(drivers.wacc, 0.09), 0.025, 0.025, 0.28),
    terminalGrowth: distribution(forecast, "terminalGrowth", numeric(drivers.terminalGrowth, 0.025), 0.012, -0.03, 0.075),
  };
}

function correlatedNormals(index) {
  const raw = quasiPoint(index, FACTORS.length).map(normalInv);
  const l = cholesky(CORRELATION);
  return raw.map((_, i) => {
    let value = 0;
    for (let j = 0; j <= i; j += 1) value += l[i][j] * raw[j];
    return value;
  });
}

function sampleFactors(index, dists) {
  const z = correlatedNormals(index);
  return FACTORS.reduce((acc, key, dim) => {
    const dist = dists[key];
    acc[key] = clamp(dist.mean + z[dim] * dist.sd, dist.min, dist.max);
    return acc;
  }, {});
}

function valuePath(sample, drivers = {}, options = {}) {
  const revenue = numeric(drivers.revenue, 100);
  const price = numeric(drivers.price, null);
  const taxRate = clamp(numeric(drivers.taxRate, 0.21), 0, 0.45);
  const horizon = Math.max(3, Math.round(numeric(options.horizonYears, 5)));
  const terminalGrowth = Math.min(sample.terminalGrowth, sample.wacc - 0.025);
  let presentValue = 0;
  let yearRevenue = revenue;
  const yearly = [];
  for (let year = 1; year <= horizon; year += 1) {
    yearRevenue *= 1 + sample.growth;
    const nopat = yearRevenue * sample.margin * (1 - taxRate);
    const reinvestmentAmount = Math.max(0, nopat * sample.reinvestment);
    const fcff = nopat - reinvestmentAmount;
    presentValue += fcff / Math.pow(1 + sample.wacc, year);
    yearly.push({ year, revenue: yearRevenue, nopat, reinvestment: reinvestmentAmount, fcff });
  }
  const terminalFcf = yearly[yearly.length - 1].fcff * (1 + terminalGrowth);
  const terminalDenominator = Math.max(0.025, sample.wacc - terminalGrowth);
  const terminalValue = terminalFcf / terminalDenominator;
  const fairValue = Math.max(0, presentValue + terminalValue / Math.pow(1 + sample.wacc, horizon));
  const irr = isFiniteNumber(price) && price > 0 ? Math.pow(fairValue / price, 1 / horizon) - 1 : null;
  return {
    ...sample,
    horizonYears: horizon,
    effectiveTerminalGrowth: terminalGrowth,
    fairValue,
    irr,
    terminalValueShare: fairValue > 0 ? terminalValue / Math.pow(1 + sample.wacc, horizon) / fairValue : null,
    finalRevenue: yearly[yearly.length - 1].revenue,
    finalFcf: yearly[yearly.length - 1].fcff,
  };
}

function distributionSummary(values) {
  return {
    mean: mean(values),
    p5: quantile(values, 0.05),
    p10: quantile(values, 0.1),
    p25: quantile(values, 0.25),
    p50: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    p90: quantile(values, 0.9),
    p95: quantile(values, 0.95),
  };
}

function cvar(values, q = 0.1) {
  const threshold = quantile(values, q);
  if (!isFiniteNumber(threshold)) return null;
  return mean(values.filter((value) => isFiniteNumber(value) && value <= threshold));
}

function sensitivity(paths, target = "irr") {
  const targetValues = paths.map((path) => numeric(path[target], null)).filter(isFiniteNumber);
  const totalVariance = variance(targetValues);
  if (!isFiniteNumber(totalVariance) || totalVariance <= 1e-12) {
    return {
      method: "variance_decomposition_quasi_mc_v1",
      target,
      totalVariance,
      firstOrder: [],
    };
  }

  const firstOrder = FACTORS.map((factor) => {
    const rows = paths
      .map((path) => ({ factorValue: numeric(path[factor], null), targetValue: numeric(path[target], null) }))
      .filter((row) => isFiniteNumber(row.factorValue) && isFiniteNumber(row.targetValue))
      .sort((a, b) => a.factorValue - b.factorValue);
    const bucketCount = Math.min(8, Math.max(2, Math.floor(Math.sqrt(rows.length))));
    const bucketMeans = [];
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const start = Math.floor((rows.length * bucket) / bucketCount);
      const end = Math.floor((rows.length * (bucket + 1)) / bucketCount);
      bucketMeans.push(mean(rows.slice(start, Math.max(start + 1, end)).map((row) => row.targetValue)));
    }
    return {
      factor,
      firstOrderIndex: clamp((variance(bucketMeans) || 0) / totalVariance, 0, 1),
    };
  }).sort((a, b) => b.firstOrderIndex - a.firstOrderIndex);

  const total = firstOrder.reduce((sum, item) => sum + item.firstOrderIndex, 0);
  return {
    method: "variance_decomposition_quasi_mc_v1",
    target,
    totalVariance,
    firstOrder: firstOrder.map((item) => ({
      ...item,
      normalizedShare: total > 0 ? item.firstOrderIndex / total : 0,
    })),
    dominantFactor: firstOrder[0]?.factor || null,
  };
}

function decisionFromRisk(risk, valueDistribution) {
  if (!isFiniteNumber(valueDistribution.p50)) return "probabilistic_insufficient";
  if (risk.probabilityPermanentLoss >= 0.32 || risk.downsideCvarIrr <= -0.22) return "probabilistic_extreme_downside";
  if ((valueDistribution.p90 - valueDistribution.p10) / Math.max(1, valueDistribution.p50) > 1.2) return "probabilistic_wide_distribution";
  return "probabilistic_distribution_usable";
}

export function buildAuroraProbabilisticValuation(input = {}, options = {}) {
  const drivers = getDrivers(input);
  const dists = distributions(input);
  const sampleCount = Math.max(64, Math.min(4096, Math.round(numeric(options.probabilisticSampleCount, options.sampleCount ?? 768))));
  const paths = Array.from({ length: sampleCount }, (_, index) => valuePath(sampleFactors(index, dists), drivers, options));
  const fairValues = paths.map((path) => path.fairValue);
  const irrs = paths.map((path) => path.irr);
  const price = numeric(drivers.price, null);
  const valueDist = distributionSummary(fairValues);
  const irrDist = { horizonYears: Math.max(3, Math.round(numeric(options.horizonYears, 5))), ...distributionSummary(irrs) };
  const risk = {
    probabilityValueBelowPrice:
      isFiniteNumber(price) && price > 0 ? paths.filter((path) => path.fairValue < price).length / Math.max(1, paths.length) : null,
    probabilityNegativeIrr: paths.filter((path) => isFiniteNumber(path.irr) && path.irr < 0).length / Math.max(1, paths.length),
    probabilityPermanentLoss: paths.filter((path) => isFiniteNumber(path.irr) && path.irr <= -0.12).length / Math.max(1, paths.length),
    downsideCvarIrr: cvar(irrs, 0.1),
    downsideCvarValue: cvar(fairValues, 0.1),
  };
  const irrSensitivity = sensitivity(paths, "irr");
  const valueSensitivity = sensitivity(paths, "fairValue");
  const decision = decisionFromRisk(risk, valueDist);
  const retained = Math.max(0, Math.min(sampleCount, Math.round(numeric(options.retainSamplePaths, 160))));

  return {
    version: "aurora_probabilistic_valuation_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    ticker: drivers.ticker || getCompiled(input)?.ticker || null,
    name: drivers.name || getCompiled(input)?.name || null,
    method: {
      sampler: "quasi_monte_carlo_halton_v1",
      sensitivity: "sobol_style_first_order_variance_decomposition",
      sampleCount,
      retainedPathCount: retained,
      correlation: Object.fromEntries(FACTORS.map((factor, index) => [factor, CORRELATION[index]])),
    },
    factorDistributions: dists,
    valueDistribution: valueDist,
    irrDistribution: irrDist,
    risk,
    sensitivity: {
      irr: irrSensitivity,
      fairValue: valueSensitivity,
      dominantFactor: irrSensitivity.dominantFactor || valueSensitivity.dominantFactor,
    },
    retainedPaths: paths.slice(0, retained),
    decision,
    memo: {
      headline: `Probabilistic valuation is ${decision.replaceAll("_", " ")}.`,
      expectedIrr: irrDist.mean,
      medianIrr: irrDist.p50,
      probabilityNegativeIrr: risk.probabilityNegativeIrr,
      downsideCvarIrr: risk.downsideCvarIrr,
      dominantSensitivity: irrSensitivity.dominantFactor || valueSensitivity.dominantFactor,
      note: "Quasi-Monte Carlo paths use posterior distributions and explicit correlation; this is not arbitrary normal-noise decoration.",
    },
  };
}
