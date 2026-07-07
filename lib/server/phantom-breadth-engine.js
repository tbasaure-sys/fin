/**
 * Phantom Diversification engine (pure JavaScript).
 *
 * Faithful implementation of "Phantom Diversification: Tested Breadth and
 * Hidden Fragility in Calm Markets" (Basaure Larrain, 2026), adapted to a
 * user's weighted portfolio:
 *
 *  - raw breadth  B_raw  = exp(entropy of the shrinkage-covariance spectrum)
 *                          (perplexity of eigenvalue weights = effective bets)
 *  - decomposition:  B_tested = B_raw * (1 - e^{-kV}),  B_phantom = B_raw * e^{-kV}
 *    with V = trace of the weighted covariance (stress intensity) and k = 100
 *    (fixed baseline from the paper, not tuned ex post)
 *  - phantom share S = e^{-kV};  quality ratio Q = 1 - S
 *  - conditional fragility: within calm regimes, drawdown risk rises sharply
 *    once phantom share exceeds ~92% (paper Exhibit 6) — surfaced as a flag
 *  - leave-one-out contributors: real diversifier / phantom diversifier /
 *    crowding source
 *
 * This mirrors the Python module (src/meta_alpha_allocator/research/
 * phantom_diversification.py) with the same output contract, so the product
 * keeps working on serverless runtimes where Python is unavailable.
 */

const WINDOW_DAYS = 63;
const CORRECTION_K = 100;
const SERIES_POINTS = 252;
const FRAGILITY_PHANTOM_SHARE = 0.92;

export class PhantomBreadthError extends Error {}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// ---------- linear algebra helpers ----------

/** Jacobi eigenvalue algorithm for a symmetric matrix. Returns eigenvalues. */
export function symmetricEigenvalues(input) {
  const n = input.length;
  const a = input.map((row) => row.slice());
  const maxSweeps = 120;

  for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
    let off = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) off += a[i][j] * a[i][j];
    }
    if (off < 1e-18) break;

    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k += 1) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k += 1) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
      }
    }
  }
  return Array.from({ length: n }, (_, i) => a[i][i]);
}

/**
 * Ledoit-Wolf style shrinkage toward the scaled identity:
 * cov_shrunk = (1 - delta) * S + delta * mu * I, with the standard
 * Ledoit-Wolf (2004) delta estimate.
 */
export function ledoitWolfShrinkage(returns) {
  const t = returns.length;
  const n = returns[0].length;
  const means = Array(n).fill(0);
  for (const row of returns) for (let j = 0; j < n; j += 1) means[j] += row[j] / t;
  const centered = returns.map((row) => row.map((value, j) => value - means[j]));

  const sample = Array.from({ length: n }, () => Array(n).fill(0));
  for (const row of centered) {
    for (let i = 0; i < n; i += 1) {
      for (let j = i; j < n; j += 1) {
        sample[i][j] += (row[i] * row[j]) / t;
      }
    }
  }
  for (let i = 0; i < n; i += 1) for (let j = 0; j < i; j += 1) sample[i][j] = sample[j][i];

  const mu = sample.reduce((sum, row, i) => sum + row[i], 0) / n;
  let d2 = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const target = i === j ? mu : 0;
      d2 += (sample[i][j] - target) ** 2;
    }
  }
  d2 /= n;

  let b2sum = 0;
  for (const row of centered) {
    let norm = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        norm += (row[i] * row[j] - sample[i][j]) ** 2;
      }
    }
    b2sum += norm;
  }
  const b2 = Math.min(b2sum / (t * t * n), d2);
  const delta = d2 > 0 ? Math.max(0, Math.min(1, b2 / d2)) : 0;

  return sample.map((row, i) => row.map((value, j) => (1 - delta) * value + (i === j ? delta * mu : 0)));
}

function weightedMatrix(matrix, weights) {
  const sqrtW = weights.map((w) => Math.sqrt(Math.max(w, 0)));
  return matrix.map((row, i) => row.map((value, j) => sqrtW[i] * value * sqrtW[j]));
}

function effectiveRank(matrix, dimensions) {
  const eigvals = symmetricEigenvalues(matrix).map((value) => Math.max(value, 1e-12));
  const total = eigvals.reduce((sum, value) => sum + value, 0);
  const probs = eigvals.map((value) => value / total);
  const entropy = -probs.reduce((sum, p) => sum + p * Math.log(p), 0);
  return {
    breadth: Math.exp(entropy),
    entropyRatio: entropy / Math.log(Math.max(dimensions, 2)),
  };
}

// ---------- portfolio metrics ----------

function windowMetrics(windowReturns, weights) {
  if (windowReturns.length < WINDOW_DAYS - 1) {
    throw new PhantomBreadthError("Not enough overlapping history to compute the 63-day window.");
  }
  const cov = ledoitWolfShrinkage(windowReturns);
  const weighted = weightedMatrix(cov, weights);
  const { breadth: rawBreadth, entropyRatio } = effectiveRank(weighted, weights.length);
  const stressIntensity = weighted.reduce((sum, row, i) => sum + row[i], 0);
  const correctionFactor = Math.max(0, Math.min(1, 1 - Math.exp(-CORRECTION_K * stressIntensity)));
  const realBreadth = rawBreadth * correctionFactor;
  const phantomBreadth = Math.max(rawBreadth - realBreadth, 0);
  let portfolioVariance = 0;
  for (let i = 0; i < weights.length; i += 1) {
    for (let j = 0; j < weights.length; j += 1) portfolioVariance += weights[i] * cov[i][j] * weights[j];
  }
  const hhi = weights.reduce((sum, w) => sum + w * w, 0);

  return {
    raw_breadth: rawBreadth,
    real_breadth: realBreadth,
    phantom_breadth: phantomBreadth,
    phantom_share: Math.max(0, Math.min(1, 1 - correctionFactor)),
    correction_factor: correctionFactor,
    realized_variance: portfolioVariance,
    stress_intensity: stressIntensity,
    tested_ratio: rawBreadth > 0 ? realBreadth / rawBreadth : 0,
    naive_breadth: hhi > 0 ? 1 / hhi : 0,
    entropy_ratio: entropyRatio,
    raw_entropy_ratio: entropyRatio,
    hhi,
  };
}

function classification(testedRatio) {
  if (testedRatio >= 0.67) return "real-dominant";
  if (testedRatio >= 0.34) return "mixed";
  return "phantom-dominant";
}

function classificationLabel(value) {
  return {
    "real-dominant": "Diversification holding up well",
    mixed: "Some diversification is real, some is fragile",
    "phantom-dominant": "Diversification looks weaker under stress",
  }[value] || "Diversification read pending";
}

function verdictCopy(testedRatio, phantomShare) {
  const fragile = phantomShare >= FRAGILITY_PHANTOM_SHARE;
  if (testedRatio >= 0.67) {
    return [
      "La mayor parte de tu diversificación sobrevive cuando las posiciones empiezan a moverse juntas.",
      "El portafolio no es solo ancho en papel: una buena parte de los nombres siguen actuando como apuestas distintas.",
      "La siguiente mejora suele ser control de concentración: recorta posiciones sobredimensionadas antes de agregar más nombres.",
    ];
  }
  if (testedRatio >= 0.34) {
    return [
      "Parte de tu diversificación es real, pero una parte relevante desaparece en condiciones difíciles.",
      "Estás más diversificado que un libro concentrado, pero menos de lo que sugiere el número de tickers.",
      "El upgrade más limpio es reemplazar nombres que se solapan por posiciones que de verdad se comportan distinto.",
    ];
  }
  return [
    fragile
      ? "Casi toda la diversificación visible es 'fantasma': está en zona de fragilidad condicional (el paper documenta que sobre ~92% de phantom share la probabilidad de drawdowns futuros sube de forma abrupta)."
      : "Una gran parte de la diversificación desaparece al someter el portafolio a stress.",
    "Muchas posiciones te dan la sensación de diversificación sin independencia real: en la práctica siguen siendo pocas apuestas latentes.",
    "Prioriza reducir solapamiento y agrega exposiciones con drivers de retorno distintos (sector, país, factor), no solo más tickers.",
  ];
}

function roleCopy(deltaReal, deltaRaw) {
  if (deltaReal > 0) {
    return ["real diversifier", "This holding is adding diversification that still survives in tougher conditions."];
  }
  if (deltaRaw > 0) {
    return ["phantom diversifier", "This holding improves the headline breadth, but much of that benefit fades under stress."];
  }
  return ["crowding source", "This holding overlaps with the rest of the portfolio enough that removing it does not hurt diversification."];
}

// ---------- panel plumbing ----------

function normalizeHoldings(rows) {
  const aggregated = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const ticker = String(row?.ticker || "").trim().toUpperCase();
    const weight = Number(row?.weight || 0);
    if (!ticker || !(weight > 0)) continue;
    const current = aggregated.get(ticker) || { weight: 0, sector: null };
    current.weight += weight;
    current.sector = current.sector || (row.sector ? String(row.sector) : null);
    aggregated.set(ticker, current);
  }
  const total = [...aggregated.values()].reduce((sum, item) => sum + item.weight, 0);
  if (!(total > 0)) throw new PhantomBreadthError("Holdings weights must sum to more than zero.");
  const normalized = [...aggregated.entries()]
    .map(([ticker, item]) => ({ ticker, weight: item.weight / total, sector: item.sector }))
    .sort((left, right) => right.weight - left.weight);
  if (normalized.length < 3) {
    throw new PhantomBreadthError("At least 3 supported holdings are required for analysis.");
  }
  return normalized;
}

/** Align a { TICKER: { date: close } } panel into common dated log-returns. */
function buildAlignedLogReturns(holdings, priceHistory) {
  const seriesByTicker = holdings.map((holding) => priceHistory?.[holding.ticker]);
  const missing = holdings.filter((_, index) => !seriesByTicker[index] || Object.keys(seriesByTicker[index]).length < WINDOW_DAYS);
  if (missing.length) {
    throw new PhantomBreadthError(
      `Unsupported holdings for live history or proxy mapping: ${missing.map((row) => row.ticker).join(", ")}. ` +
      "Add a sector, country, or ETF proxy such as Technology, Canada, or XLK.",
    );
  }

  let commonDates = null;
  for (const series of seriesByTicker) {
    const dates = new Set(Object.keys(series));
    commonDates = commonDates === null ? dates : new Set([...commonDates].filter((date) => dates.has(date)));
  }
  const dates = [...commonDates].sort();
  if (dates.length < WINDOW_DAYS + 1) {
    throw new PhantomBreadthError("The selected holdings do not share enough overlapping history for a 63-day analysis.");
  }

  const rows = [];
  for (let index = 1; index < dates.length; index += 1) {
    const row = [];
    let valid = true;
    for (const series of seriesByTicker) {
      const current = Number(series[dates[index]]);
      const previous = Number(series[dates[index - 1]]);
      if (!(current > 0) || !(previous > 0)) { valid = false; break; }
      row.push(Math.log(current / previous));
    }
    if (valid) rows.push({ date: dates[index], returns: row });
  }
  if (rows.length < WINDOW_DAYS) {
    throw new PhantomBreadthError("Not enough overlapping history to compute the 63-day window.");
  }
  return rows;
}

function seriesMetrics(returnRows, weights) {
  const records = [];
  for (let end = WINDOW_DAYS - 1; end < returnRows.length; end += 1) {
    const window = returnRows.slice(end - (WINDOW_DAYS - 1), end + 1).map((row) => row.returns);
    records.push({ date: returnRows[end].date, ...windowMetrics(window, weights) });
  }
  if (!records.length) throw new PhantomBreadthError("No rolling window could be computed for this portfolio.");
  return { series: records.slice(-SERIES_POINTS), current: records[records.length - 1] };
}

function contributorRows(returnRows, holdings, current) {
  const contributors = [];
  for (let index = 0; index < holdings.length; index += 1) {
    const reduced = holdings.filter((_, i) => i !== index);
    if (reduced.length < 2) continue;
    const reducedTotal = reduced.reduce((sum, row) => sum + row.weight, 0);
    const reducedWeights = reduced.map((row) => row.weight / reducedTotal);
    const reducedReturns = returnRows.map((row) => ({
      date: row.date,
      returns: row.returns.filter((_, i) => i !== index),
    }));
    const { current: reducedCurrent } = seriesMetrics(reducedReturns, reducedWeights);
    const deltaRaw = current.raw_breadth - reducedCurrent.raw_breadth;
    const deltaReal = current.real_breadth - reducedCurrent.real_breadth;
    const deltaPhantom = current.phantom_breadth - reducedCurrent.phantom_breadth;
    const [role, roleSummary] = roleCopy(deltaReal, deltaRaw);
    contributors.push({
      ticker: holdings[index].ticker,
      weight: Number(holdings[index].weight.toFixed(4)),
      delta_raw_breadth: Number(deltaRaw.toFixed(4)),
      delta_real_breadth: Number(deltaReal.toFixed(4)),
      delta_phantom_breadth: Number(deltaPhantom.toFixed(4)),
      role,
      role_summary: roleSummary,
      history_source: "ticker",
      history_symbol: holdings[index].ticker,
      history_label: null,
    });
  }
  return contributors.sort((left, right) => right.delta_real_breadth - left.delta_real_breadth);
}

/**
 * Main entry point. Same output contract as the Python module.
 *
 * rows: [{ ticker, weight, sector? }]
 * priceHistory: { TICKER: { "YYYY-MM-DD": close } }
 */
export function analyzePhantomBreadth(rows, priceHistory, { workspaceId = null } = {}) {
  const holdings = normalizeHoldings(rows);
  const returnRows = buildAlignedLogReturns(holdings, priceHistory);
  const weights = holdings.map((row) => row.weight);
  const { series, current } = seriesMetrics(returnRows, weights);
  const contributors = contributorRows(returnRows, holdings, current);
  const [verdict, phantomText, improveText] = verdictCopy(current.tested_ratio, current.phantom_share);
  const classified = classification(current.tested_ratio);
  const fragileRegime = current.phantom_share >= FRAGILITY_PHANTOM_SHARE;

  return {
    workspace_id: workspaceId,
    as_of: series[series.length - 1].date,
    engine: "phantom_breadth_js_v1",
    input: { holdings: holdings.map((row) => ({ ticker: row.ticker, weight: row.weight })) },
    current: {
      holdings_count: holdings.length,
      holdings_hhi_breadth: Number(current.naive_breadth.toFixed(3)),
      raw_breadth: Number(current.raw_breadth.toFixed(3)),
      real_breadth: Number(current.real_breadth.toFixed(3)),
      phantom_breadth: Number(current.phantom_breadth.toFixed(3)),
      phantom_share: Number(current.phantom_share.toFixed(4)),
      correction_factor: Number(current.correction_factor.toFixed(4)),
      realized_variance: Number(current.realized_variance.toFixed(6)),
      stress_intensity: Number(current.stress_intensity.toFixed(6)),
      classification: classified,
      classification_label: classificationLabel(classified),
      tested_ratio: Number(current.tested_ratio.toFixed(4)),
      entropy_ratio: Number(current.entropy_ratio.toFixed(4)),
      raw_entropy_ratio: Number(current.raw_entropy_ratio.toFixed(4)),
      conditional_fragility_flag: fragileRegime,
      conditional_fragility_threshold: FRAGILITY_PHANTOM_SHARE,
    },
    series: series.map((row) => ({
      date: row.date,
      raw_breadth: Number(row.raw_breadth.toFixed(3)),
      real_breadth: Number(row.real_breadth.toFixed(3)),
      phantom_breadth: Number(row.phantom_breadth.toFixed(3)),
      realized_variance: Number(row.realized_variance.toFixed(6)),
      stress_intensity: Number(row.stress_intensity.toFixed(6)),
      correction_factor: Number(row.correction_factor.toFixed(4)),
    })),
    contributors,
    diagnostics: {
      common_history_days: returnRows.length + 1,
      window_days: WINDOW_DAYS,
      correction_k: CORRECTION_K,
      covariance_method: "Ledoit-Wolf shrinkage (JS)",
      supported_tickers: holdings.map((row) => row.ticker),
      source_labels: ["js_engine"],
      paper_formula: "B_raw = effective_rank(W^1/2 Cov W^1/2); B_tested = B_raw (1 - exp(-kV)); B_phantom = B_raw exp(-kV)",
      portfolio_adaptation: "The paper uses the shrinkage covariance spectrum and stress intensity V. This module adapts that decomposition to the user's weighted portfolio covariance.",
      proxy_assignments: holdings.map((row) => ({
        ticker: row.ticker,
        history_symbol: row.ticker,
        history_source: "ticker",
        history_label: null,
        proxy_used: false,
      })),
      proxied_holdings: [],
      unsupported_tickers: [],
    },
    copy: {
      verdict,
      phantom: phantomText,
      improve: improveText,
      naive_breadth: "Amplitud visible: qué tan diversificado se ve el portafolio mirando solo los tamaños de posición (muchos tickers ≠ muchas apuestas).",
      raw_breadth: "Amplitud de mercado: cuántas apuestas separadas sugiere el historial de precios en condiciones calmas. En mercados calmos este número se infla.",
      real_breadth: "Amplitud stress-tested: cuántas apuestas separadas sobreviven después de condicionar por stress. Esta es la diversificación en la que puedes confiar.",
      phantom_share: "Diversificación en riesgo: la fracción de la amplitud visible que aún no ha sido validada por stress. Sobre ~92% el paper documenta un salto en la probabilidad de drawdowns futuros.",
      leave_one_out: "Quitamos una posición a la vez para ver si aporta diversificación real, diversificación cosmética o solo solapamiento.",
      proxy_note: "Cuando un ticker no tiene historial usable, el análisis puede usar un ETF sectorial, de país o un proxy que definas.",
    },
  };
}
