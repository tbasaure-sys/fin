const DEFAULT_LENS_KEYS = [
  "dcf",
  "roicFade",
  "reverseDcf",
  "residualIncome",
  "assetValue",
  "unitEconomics",
  "bottleneck",
  "realOptions",
  "ownerEarnings",
  "capitalCycle",
];

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numberOrNull(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function mean(values) {
  const clean = values.filter(isFiniteNumber);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function median(values) {
  const clean = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function rank(values) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = Array(values.length).fill(null);
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].value === sorted[i].value) j += 1;
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k += 1) ranks[sorted[k].index] = avgRank;
    i = j;
  }
  return ranks;
}

function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const xMean = mean(xs);
  const yMean = mean(ys);
  if (!isFiniteNumber(xMean) || !isFiniteNumber(yMean)) return null;
  let num = 0;
  let xDen = 0;
  let yDen = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    num += dx * dy;
    xDen += dx * dx;
    yDen += dy * dy;
  }
  if (xDen <= 1e-12 || yDen <= 1e-12) return null;
  return num / Math.sqrt(xDen * yDen);
}

function spearman(xs, ys) {
  const pairs = xs
    .map((x, index) => ({ x, y: ys[index] }))
    .filter((pair) => isFiniteNumber(pair.x) && isFiniteNumber(pair.y));
  if (pairs.length < 3) return null;
  return pearson(rank(pairs.map((pair) => pair.x)), rank(pairs.map((pair) => pair.y)));
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (key === null || key === undefined || key === "") return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return groups;
}

function lensOutputFromArray(outputs, key) {
  if (!Array.isArray(outputs)) return null;
  return outputs.find((item) => item?.key === key) || null;
}

function readLensPrediction(row, key) {
  const direct = numberOrNull(row?.[`pred_${key}`]);
  if (direct !== null) return direct;
  const camel = numberOrNull(row?.[`${key}Prediction`]);
  if (camel !== null) return camel;
  const lensesObject = row?.lenses && typeof row.lenses === "object" ? row.lenses[key] : null;
  if (isFiniteNumber(lensesObject)) return lensesObject;
  if (lensesObject && typeof lensesObject === "object") {
    return (
      numberOrNull(lensesObject.expectedReturn3y)
      ?? numberOrNull(lensesObject.expectedReturn)
      ?? numberOrNull(lensesObject.forecast)
      ?? null
    );
  }
  const arrayOutput =
    lensOutputFromArray(row?.lensOutputs, key)
    || lensOutputFromArray(row?.lensForge?.outputs, key)
    || lensOutputFromArray(row?.router?.lensForge?.outputs, key);
  return (
    numberOrNull(arrayOutput?.expectedReturn3y)
    ?? numberOrNull(arrayOutput?.expectedReturn)
    ?? numberOrNull(arrayOutput?.forecast)
    ?? null
  );
}

function readTargetReturn(row) {
  return (
    numberOrNull(row?.targetReturn)
    ?? numberOrNull(row?.target_return)
    ?? numberOrNull(row?.realizedReturn)
    ?? numberOrNull(row?.ann_return_3y_fwd)
    ?? numberOrNull(row?.return_3y_fwd)
    ?? numberOrNull(row?.ann_return_1y_fwd)
    ?? null
  );
}

function readRegime(row) {
  if (typeof row?.regime === "string") return row.regime;
  if (typeof row?.routerRegime === "string") return row.routerRegime;
  if (typeof row?.router_regime_rule === "string") return row.router_regime_rule;
  if (typeof row?.dominantRegime === "string") return row.dominantRegime;
  if (typeof row?.router?.dominantRegime?.key === "string") return row.router.dominantRegime.key;
  return "unknown";
}

function normalizeRows(rows, lensKeys) {
  return rows
    .map((row, index) => {
      const targetReturn = readTargetReturn(row);
      const predictions = Object.fromEntries(
        lensKeys.map((key) => [key, readLensPrediction(row, key)]),
      );
      const errors = Object.fromEntries(
        Object.entries(predictions).map(([key, value]) => [
          key,
          isFiniteNumber(value) && isFiniteNumber(targetReturn) ? Math.abs(value - targetReturn) : null,
        ]),
      );
      return {
        index,
        ticker: row?.ticker || row?.symbol || null,
        year: numberOrNull(row?.year ?? row?.fiscalYear),
        sector: row?.sector || row?.industry || "unknown",
        regime: readRegime(row),
        targetReturn,
        predictions,
        errors,
        original: row,
      };
    })
    .filter((row) => isFiniteNumber(row.targetReturn) && Object.values(row.predictions).some(isFiniteNumber));
}

function rowLabel(row, lensKeys, options) {
  const ranked = lensKeys
    .map((key) => ({ key, error: row.errors[key] }))
    .filter((item) => isFiniteNumber(item.error))
    .sort((a, b) => a.error - b.error);
  if (ranked.length < 2) {
    return {
      label: "insufficient",
      bestLens: ranked[0]?.key || null,
      secondLens: null,
      margin: null,
      errors: row.errors,
      reliability: {},
    };
  }
  const [best, second] = ranked;
  const margin = second.error - best.error;
  const label = margin >= options.minErrorMargin ? best.key : "indeterminate";
  const reliabilityRaw = Object.fromEntries(
    ranked.map((item) => [item.key, Math.exp(-(item.error - best.error) / options.regretTemperature)]),
  );
  const total = Object.values(reliabilityRaw).reduce((sum, value) => sum + value, 0);
  const reliability = Object.fromEntries(Object.entries(reliabilityRaw).map(([key, value]) => [key, value / total]));
  return {
    label,
    bestLens: best.key,
    secondLens: second.key,
    margin,
    errors: row.errors,
    reliability,
  };
}

function lensMetrics(rows, lensKeys) {
  return Object.fromEntries(
    lensKeys.map((key) => {
      const usable = rows.filter((row) => isFiniteNumber(row.predictions[key]) && isFiniteNumber(row.targetReturn));
      const absErrors = usable.map((row) => Math.abs(row.predictions[key] - row.targetReturn));
      return [
        key,
        {
          rows: usable.length,
          mae: mean(absErrors),
          medianAbsoluteError: median(absErrors),
          bias: mean(usable.map((row) => row.predictions[key] - row.targetReturn)),
          directionalAccuracy: mean(usable.map((row) => (Math.sign(row.predictions[key]) === Math.sign(row.targetReturn) ? 1 : 0))),
          spearmanIc: spearman(usable.map((row) => row.predictions[key]), usable.map((row) => row.targetReturn)),
        },
      ];
    }),
  );
}

function summarizeLabels(labeledRows, lensKeys) {
  const counts = {};
  labeledRows.forEach((row) => {
    counts[row.label] = (counts[row.label] || 0) + 1;
  });
  const highConvictionRows = labeledRows.filter((row) => row.label !== "indeterminate" && row.label !== "insufficient");
  const bestLensCounts = {};
  labeledRows.forEach((row) => {
    if (!row.bestLens) return;
    bestLensCounts[row.bestLens] = (bestLensCounts[row.bestLens] || 0) + 1;
  });
  const maxBestShare = labeledRows.length
    ? Math.max(0, ...lensKeys.map((key) => (bestLensCounts[key] || 0) / labeledRows.length))
    : 0;
  return {
    counts,
    highConvictionShare: labeledRows.length ? highConvictionRows.length / labeledRows.length : 0,
    indeterminateShare: labeledRows.length ? (counts.indeterminate || 0) / labeledRows.length : 0,
    maxBestLensShare: maxBestShare,
    bestLensCounts,
  };
}

function groupAudit(rows, lensKeys, keyFn) {
  return Object.fromEntries(
    [...groupBy(rows, keyFn).entries()].map(([key, groupRows]) => [
      key,
      {
        rows: groupRows.length,
        lensMetrics: lensMetrics(groupRows, lensKeys),
      },
    ]),
  );
}

export function buildAuroraLabelFactory(rows = [], options = {}) {
  const lensKeys = options.lensKeys || DEFAULT_LENS_KEYS;
  const policy = {
    minErrorMargin: options.minErrorMargin ?? 0.015,
    regretTemperature: options.regretTemperature ?? 0.06,
  };
  const normalizedRows = normalizeRows(rows, lensKeys);
  const labels = normalizedRows.map((row) => ({
    index: row.index,
    ticker: row.ticker,
    year: row.year,
    sector: row.sector,
    regime: row.regime,
    targetReturn: row.targetReturn,
    ...rowLabel(row, lensKeys, policy),
  }));
  return {
    version: "aurora_label_factory_v1",
    policy,
    rowCount: normalizedRows.length,
    lensKeys,
    labels,
    summary: summarizeLabels(labels, lensKeys),
  };
}

export function buildAuroraLensAudit(rows = [], options = {}) {
  const lensKeys = options.lensKeys || DEFAULT_LENS_KEYS;
  const normalizedRows = normalizeRows(rows, lensKeys);
  const labelFactory = buildAuroraLabelFactory(rows, options);
  const metrics = lensMetrics(normalizedRows, lensKeys);
  const rankedByMae = Object.entries(metrics)
    .filter(([, value]) => isFiniteNumber(value.mae))
    .sort((a, b) => a[1].mae - b[1].mae)
    .map(([key, value]) => ({ key, ...value }));
  const rankedByIc = Object.entries(metrics)
    .filter(([, value]) => isFiniteNumber(value.spearmanIc))
    .sort((a, b) => b[1].spearmanIc - a[1].spearmanIc)
    .map(([key, value]) => ({ key, ...value }));
  const gates = {
    enoughRows: normalizedRows.length >= (options.minRows ?? 100),
    enoughHighConvictionLabels: labelFactory.summary.highConvictionShare >= (options.minHighConvictionShare ?? 0.18),
    noSingleLensDominatesLabels: labelFactory.summary.maxBestLensShare <= (options.maxBestLensShare ?? 0.55),
    atLeastOnePositiveIc: rankedByIc.some((item) => item.spearmanIc > (options.minPositiveIc ?? 0.02)),
    lensForecastsPresent: rankedByMae.length >= Math.min(4, lensKeys.length),
  };
  return {
    version: "aurora_lens_audit_v1",
    rowCount: normalizedRows.length,
    lensKeys,
    metrics,
    rankedByMae,
    rankedByIc,
    byYear: groupAudit(normalizedRows, lensKeys, (row) => row.year),
    bySector: groupAudit(normalizedRows, lensKeys, (row) => row.sector),
    byRegime: groupAudit(normalizedRows, lensKeys, (row) => row.regime),
    labelFactory,
    gates,
    readyForResidualTraining: Object.values(gates).every(Boolean),
  };
}

export { DEFAULT_LENS_KEYS };
