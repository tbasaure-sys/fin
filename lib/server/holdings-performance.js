/**
 * Holdings-based performance engine.
 *
 * Reconstructs portfolio performance directly from the user's holdings
 * (quantity + cost basis + purchase date) and real historical ticker prices,
 * without depending on stored dashboard snapshots.
 *
 * It produces four clearly-separated readings:
 *  - current:        return since cost basis (no history required)
 *  - reconstructed:  historical trajectory rebuilt from holdings + real prices
 *  - twr:            time-weighted return from stored snapshots (when reliable)
 *  - benchmark:      same cashflows invested in the benchmark on the same dates
 *
 * All computation functions are pure so they can be unit-tested with
 * injected price panels. Only fetchDailyCloseHistory touches the network.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LOOKBACK_DAYS = 5 * 366;
const PRICE_CACHE_TTL_MS = 30 * 60 * 1000;

const priceCache = globalThis.__BLS_HOLDINGS_PERF_PRICE_CACHE__ || new Map();
globalThis.__BLS_HOLDINGS_PERF_PRICE_CACHE__ = priceCache;

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateOnly(value) {
  const text = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const millis = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(millis) ? text : null;
}

function fmtPct(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : null;
}

/**
 * Assess whether the holdings carry enough data to compute performance
 * without snapshots. Produces an honest empty-state contract for the UI.
 */
export function assessPerformanceInputs(holdings) {
  const rows = Array.isArray(holdings) ? holdings : [];
  const positions = rows.filter((row) => row?.ticker && (toNumber(row.quantity) || 0) > 0);
  const missing = [];
  let withCost = 0;
  let withDate = 0;

  for (const row of positions) {
    const gaps = [];
    const cost = toNumber(row.avg_cost_usd);
    const date = parseDateOnly(row.purchase_date || row.purchaseDate || row.entry_date);
    if (cost === null || cost <= 0) gaps.push("costo base");
    else withCost += 1;
    if (!date) gaps.push("fecha de compra");
    else withDate += 1;
    if (gaps.length) missing.push({ ticker: row.ticker, missing: gaps });
  }

  let status = "ok";
  if (!positions.length) status = "no_holdings";
  else if (withCost === 0 && withDate === 0) status = "missing_cost_and_dates";
  else if (withDate === 0) status = "missing_purchase_dates";
  else if (withCost === 0) status = "missing_cost_basis";
  else if (missing.length) status = "partial";

  const actions = [];
  if (status === "no_holdings") {
    actions.push("Agrega al menos una posición con cantidad para empezar.");
  }
  if (["missing_cost_and_dates", "missing_cost_basis", "partial"].includes(status) && withCost < positions.length) {
    actions.push(`Agrega el costo base (precio promedio de compra) a ${positions.length - withCost} posición${positions.length - withCost === 1 ? "" : "es"} para calcular retorno desde compra.`);
  }
  if (["missing_cost_and_dates", "missing_purchase_dates", "partial"].includes(status) && withDate < positions.length) {
    actions.push(`Agrega la fecha de compra a ${positions.length - withDate} posición${positions.length - withDate === 1 ? "" : "es"} para reconstruir la trayectoria histórica y comparar contra benchmark.`);
  }

  return {
    status,
    positionCount: positions.length,
    withCostBasis: withCost,
    withPurchaseDate: withDate,
    readyForCostBasisReturn: withCost > 0,
    readyForReconstruction: withDate > 0 && positions.length >= 1,
    missing,
    actions,
  };
}

/**
 * Current performance from cost basis (no history needed).
 * Includes professional per-position analysis.
 */
export function buildCostBasisPerformance(holdings) {
  const rows = (Array.isArray(holdings) ? holdings : [])
    .filter((row) => row?.ticker);
  const tracked = [];
  let totalValue = 0;
  let totalCost = 0;

  for (const row of rows) {
    const quantity = toNumber(row.quantity);
    const avgCost = toNumber(row.avg_cost_usd);
    const marketValue = toNumber(row.market_value_usd) ?? (quantity !== null && toNumber(row.current_price_usd) !== null ? quantity * toNumber(row.current_price_usd) : null);
    if (marketValue !== null && marketValue > 0) totalValue += marketValue;
    if (quantity === null || avgCost === null || quantity <= 0 || avgCost <= 0 || marketValue === null) continue;
    const costBasis = quantity * avgCost;
    totalCost += costBasis;
    tracked.push({
      ticker: row.ticker,
      sector: row.sector || "Unknown",
      quantity,
      costBasisUsd: costBasis,
      marketValueUsd: marketValue,
      pnlUsd: marketValue - costBasis,
      returnValue: (marketValue / costBasis) - 1,
      purchaseDate: parseDateOnly(row.purchase_date || row.purchaseDate) || null,
    });
  }

  const totalPnl = tracked.reduce((sum, row) => sum + row.pnlUsd, 0);
  const totalReturn = totalCost > 0 ? totalPnl / totalCost : null;

  // Contribution: each position's P&L as share of cost basis of tracked book.
  const contributions = tracked
    .map((row) => ({
      ...row,
      weight: totalValue > 0 ? row.marketValueUsd / totalValue : null,
      contribution: totalCost > 0 ? row.pnlUsd / totalCost : null,
      returnLabel: fmtPct(row.returnValue),
      contributionLabel: totalCost > 0 ? fmtPct(row.pnlUsd / totalCost, 2) : null,
    }))
    .sort((left, right) => right.pnlUsd - left.pnlUsd);

  const winners = contributions.filter((row) => row.pnlUsd > 0).slice(0, 5);
  const losers = [...contributions].reverse().filter((row) => row.pnlUsd < 0).slice(0, 5);

  // Concentration on full holdings (market value based).
  const values = rows
    .map((row) => toNumber(row.market_value_usd))
    .filter((value) => value !== null && value > 0);
  const totalMarket = values.reduce((sum, value) => sum + value, 0);
  const weights = totalMarket > 0 ? values.map((value) => value / totalMarket) : [];
  const hhi = weights.reduce((sum, w) => sum + w * w, 0);
  const sortedWeights = [...weights].sort((a, b) => b - a);
  const topWeight = sortedWeights[0] || null;
  const topFiveWeight = sortedWeights.slice(0, 5).reduce((sum, w) => sum + w, 0) || null;

  // Annualized return per position when purchase date is known; portfolio-level
  // annualization uses cost-weighted average holding period (approximation, labeled).
  const now = Date.now();
  let weightedYears = 0;
  let weightedYearsCost = 0;
  for (const row of tracked) {
    if (!row.purchaseDate) continue;
    const years = (now - Date.parse(`${row.purchaseDate}T00:00:00Z`)) / (365.25 * DAY_MS);
    if (years > 0) {
      weightedYears += years * row.costBasisUsd;
      weightedYearsCost += row.costBasisUsd;
    }
  }
  const avgYears = weightedYearsCost > 0 ? weightedYears / weightedYearsCost : null;
  const annualizedReturn = totalReturn !== null && avgYears !== null && avgYears >= 0.25
    ? Math.pow(1 + totalReturn, 1 / avgYears) - 1
    : null;

  return {
    method: "cost_basis_current",
    methodLabel: "Performance actual desde costo base",
    trackedPositions: tracked.length,
    totalPositions: rows.length,
    totalValueUsd: totalValue > 0 ? totalValue : null,
    totalCostUsd: totalCost > 0 ? totalCost : null,
    totalPnlUsd: totalCost > 0 ? totalPnl : null,
    totalReturn,
    totalReturnLabel: fmtPct(totalReturn),
    annualizedReturn,
    annualizedReturnLabel: fmtPct(annualizedReturn),
    annualizedBasisYears: avgYears,
    contributions,
    winners,
    losers,
    concentration: {
      hhi: weights.length ? hhi : null,
      effectivePositions: hhi > 0 ? 1 / hhi : null,
      topWeight,
      topWeightLabel: fmtPct(topWeight),
      topFiveWeight,
      topFiveWeightLabel: fmtPct(topFiveWeight),
    },
  };
}

function sortedDatesFromPanel(priceHistory) {
  const dates = new Set();
  for (const series of Object.values(priceHistory || {})) {
    for (const key of Object.keys(series || {})) {
      const date = parseDateOnly(key);
      if (date) dates.add(date);
    }
  }
  return [...dates].sort();
}

function closeOnOrBefore(series, date) {
  if (!series) return null;
  const direct = toNumber(series[date]);
  if (direct !== null && direct > 0) return direct;
  const keys = Object.keys(series).filter((key) => key <= date).sort();
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    const value = toNumber(series[keys[index]]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

/**
 * Rebuild the portfolio's historical trajectory from purchase dates,
 * quantities and real daily closes. Positions enter the series on their
 * purchase date. The benchmark leg invests the same cost amounts into the
 * benchmark on the same dates, so the comparison is flow-fair.
 *
 * priceHistory: { TICKER: { "YYYY-MM-DD": close } }
 * benchmarkHistory: { "YYYY-MM-DD": close }
 */
export function reconstructPortfolioSeries({ holdings, priceHistory, benchmarkHistory, benchmarkSymbol = "SPY" }) {
  const rows = (Array.isArray(holdings) ? holdings : [])
    .map((row) => {
      const quantity = toNumber(row?.quantity);
      const purchaseDate = parseDateOnly(row?.purchase_date || row?.purchaseDate);
      if (!row?.ticker || quantity === null || quantity <= 0 || !purchaseDate) return null;
      const ticker = String(row.ticker).toUpperCase();
      const series = priceHistory?.[ticker];
      if (!series || !Object.keys(series).length) return null;
      const explicitCost = toNumber(row.avg_cost_usd);
      const entryClose = closeOnOrBefore(series, purchaseDate);
      const unitCost = explicitCost !== null && explicitCost > 0 ? explicitCost : entryClose;
      if (unitCost === null || unitCost <= 0) return null;
      return {
        ticker,
        quantity,
        purchaseDate,
        unitCost,
        costUsd: quantity * unitCost,
        costSource: explicitCost !== null && explicitCost > 0 ? "user_cost_basis" : "estimated_from_history",
        series,
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    return { status: "insufficient_inputs", series: [], includedTickers: [], excludedTickers: [], notes: ["Ninguna posición tiene fecha de compra con historial de precios utilizable."] };
  }

  const allHoldings = (Array.isArray(holdings) ? holdings : []).filter((row) => row?.ticker && (toNumber(row.quantity) || 0) > 0);
  const includedTickers = rows.map((row) => row.ticker);
  const excludedTickers = allHoldings
    .map((row) => String(row.ticker).toUpperCase())
    .filter((ticker) => !includedTickers.includes(ticker));

  const firstPurchase = rows.map((row) => row.purchaseDate).sort()[0];
  const panelDates = sortedDatesFromPanel(priceHistory)
    .filter((date) => date >= firstPurchase);

  if (panelDates.length < 2) {
    return { status: "insufficient_history", series: [], includedTickers, excludedTickers, notes: ["No hay suficientes cierres históricos posteriores a la primera compra."] };
  }

  const series = [];
  let benchmarkUnits = 0;
  const pendingBenchmarkBuys = [...rows].sort((left, right) => (left.purchaseDate < right.purchaseDate ? -1 : 1));
  let investedCost = 0;
  const active = [];
  let buyIndex = 0;

  for (const date of panelDates) {
    while (buyIndex < pendingBenchmarkBuys.length && pendingBenchmarkBuys[buyIndex].purchaseDate <= date) {
      const buy = pendingBenchmarkBuys[buyIndex];
      active.push(buy);
      investedCost += buy.costUsd;
      const benchClose = closeOnOrBefore(benchmarkHistory, buy.purchaseDate) ?? closeOnOrBefore(benchmarkHistory, date);
      if (benchClose !== null && benchClose > 0) benchmarkUnits += buy.costUsd / benchClose;
      buyIndex += 1;
    }
    if (!active.length) continue;

    let portfolioValue = 0;
    let priced = 0;
    for (const position of active) {
      const close = closeOnOrBefore(position.series, date);
      if (close !== null && close > 0) {
        portfolioValue += position.quantity * close;
        priced += 1;
      }
    }
    if (priced < active.length || portfolioValue <= 0) continue;

    const benchClose = closeOnOrBefore(benchmarkHistory, date);
    const benchmarkValue = benchmarkUnits > 0 && benchClose !== null && benchClose > 0 ? benchmarkUnits * benchClose : null;

    series.push({
      date,
      portfolio_value_usd: portfolioValue,
      invested_cost_usd: investedCost,
      benchmark_value_usd: benchmarkValue,
      // Growth indexes normalized against invested capital so deposits
      // (new purchases) do not appear as fake performance jumps.
      portfolio_growth: investedCost > 0 ? portfolioValue / investedCost : null,
      spy_growth: benchmarkValue !== null && investedCost > 0 ? benchmarkValue / investedCost : null,
      external_flow_usd: 0,
      performance_method: "reconstructed_holdings_history",
    });
  }

  if (series.length < 2) {
    return { status: "insufficient_history", series: [], includedTickers, excludedTickers, notes: ["La reconstrucción no produjo suficientes puntos con precios completos."] };
  }

  const notes = [];
  if (excludedTickers.length) {
    notes.push(`Excluidas de la reconstrucción por falta de fecha de compra o historial: ${excludedTickers.join(", ")}.`);
  }
  const estimated = rows.filter((row) => row.costSource === "estimated_from_history");
  if (estimated.length) {
    notes.push(`Costo base estimado desde el precio histórico de la fecha de compra para: ${estimated.map((row) => row.ticker).join(", ")}.`);
  }

  return {
    status: "ok",
    benchmarkSymbol,
    firstPurchaseDate: firstPurchase,
    series,
    includedTickers,
    excludedTickers,
    costSources: rows.map((row) => ({ ticker: row.ticker, source: row.costSource })),
    notes,
  };
}

/**
 * Quality gate for any performance series: refuses to bless charts built on
 * zeros, sparse snapshots, or artificial sawtooth alternation.
 */
export function assessSeriesQuality(series) {
  const rows = Array.isArray(series) ? series : [];
  const values = rows
    .map((row) => toNumber(row.portfolio_value_usd ?? row.portfolio_growth ?? row.portfolio))
    .filter((value) => value !== null);
  const issues = [];

  if (values.length < 2) issues.push("too_few_points");
  const zeroOrNegative = values.filter((value) => value <= 0).length;
  if (zeroOrNegative > 0) issues.push("zero_or_negative_values");

  const returns = [];
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] > 0 && values[index] > 0) returns.push(values[index] / values[index - 1] - 1);
  }
  const meaningful = returns.filter((value) => Math.abs(value) >= 0.025);
  if (meaningful.length >= 10) {
    const flips = meaningful.slice(1).reduce((sum, value, index) => (Math.sign(value) !== Math.sign(meaningful[index]) ? sum + 1 : sum), 0);
    const sortedAbs = meaningful.map((value) => Math.abs(value)).sort((a, b) => a - b);
    const medianAbs = sortedAbs[Math.floor(sortedAbs.length / 2)] || 0;
    if (flips / Math.max(1, meaningful.length - 1) >= 0.65 && medianAbs >= 0.04) {
      issues.push("suspicious_alternating_series");
    }
  }
  const extreme = returns.filter((value) => Math.abs(value) > 0.6).length;
  if (extreme > 0) issues.push("extreme_period_returns");

  return {
    usable: !issues.includes("too_few_points") && !issues.includes("suspicious_alternating_series") && !issues.includes("zero_or_negative_values"),
    issues,
  };
}

function metricsFromValueSeries(series, valueKey, benchmarkKey) {
  const rows = (Array.isArray(series) ? series : []).filter((row) => toNumber(row[valueKey]) !== null && toNumber(row[valueKey]) > 0);
  if (rows.length < 2) return null;

  const first = toNumber(rows[0][valueKey]);
  const last = toNumber(rows[rows.length - 1][valueKey]);
  const spanDays = (Date.parse(rows[rows.length - 1].date) - Date.parse(rows[0].date)) / DAY_MS;
  const totalReturn = first > 0 ? last / first - 1 : null;
  const years = spanDays / 365.25;
  const annualizedReturn = totalReturn !== null && years >= 0.15 ? Math.pow(1 + totalReturn, 1 / years) - 1 : null;

  const dailyReturns = [];
  let peak = first;
  let maxDrawdown = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const value = toNumber(rows[index][valueKey]);
    if (value > peak) peak = value;
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
    if (index > 0) {
      const previous = toNumber(rows[index - 1][valueKey]);
      if (previous > 0) dailyReturns.push(value / previous - 1);
    }
  }
  const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / Math.max(1, dailyReturns.length);
  const variance = dailyReturns.length > 1
    ? dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (dailyReturns.length - 1)
    : 0;
  const annualVolatility = dailyReturns.length >= 20 ? Math.sqrt(Math.max(variance, 0)) * Math.sqrt(252) : null;

  let benchmarkReturn = null;
  if (benchmarkKey) {
    const benchRows = rows.filter((row) => toNumber(row[benchmarkKey]) !== null && toNumber(row[benchmarkKey]) > 0);
    if (benchRows.length >= 2) {
      const firstBench = toNumber(benchRows[0][benchmarkKey]);
      const lastBench = toNumber(benchRows[benchRows.length - 1][benchmarkKey]);
      benchmarkReturn = firstBench > 0 ? lastBench / firstBench - 1 : null;
    }
  }

  return {
    points: rows.length,
    spanDays: Math.round(spanDays),
    startDate: rows[0].date,
    endDate: rows[rows.length - 1].date,
    totalReturn,
    totalReturnLabel: fmtPct(totalReturn),
    annualizedReturn,
    annualizedReturnLabel: fmtPct(annualizedReturn),
    annualVolatility,
    annualVolatilityLabel: fmtPct(annualVolatility),
    maxDrawdown,
    maxDrawdownLabel: fmtPct(maxDrawdown),
    benchmarkReturn,
    benchmarkReturnLabel: fmtPct(benchmarkReturn),
    benchmarkSpread: totalReturn !== null && benchmarkReturn !== null ? totalReturn - benchmarkReturn : null,
    benchmarkSpreadLabel: totalReturn !== null && benchmarkReturn !== null ? fmtPct(totalReturn - benchmarkReturn) : null,
  };
}

/**
 * Full performance report with the four separated readings and a
 * plain-language explanation.
 */
export function buildPerformanceReport({ holdings, reconstruction = null, snapshotHistoryRows = [], twrMetrics = null, benchmarkSymbol = "SPY" }) {
  const inputs = assessPerformanceInputs(holdings);
  const current = buildCostBasisPerformance(holdings);
  const reconQuality = reconstruction?.series?.length ? assessSeriesQuality(reconstruction.series) : null;
  const reconstructed = reconstruction?.status === "ok" && reconQuality?.usable
    ? {
      ...metricsFromValueSeries(reconstruction.series, "portfolio_value_usd", "benchmark_value_usd"),
      method: "reconstructed_holdings_history",
      methodLabel: "Trayectoria reconstruida desde posiciones y precios históricos reales",
      includedTickers: reconstruction.includedTickers,
      excludedTickers: reconstruction.excludedTickers,
      notes: reconstruction.notes,
    }
    : null;

  const snapshotQuality = snapshotHistoryRows.length >= 2
    ? assessSeriesQuality(snapshotHistoryRows.map((row) => ({ date: row.capture_bucket || row.captured_at || row.date, portfolio_value_usd: toNumber(row.total_value_usd) })))
    : null;
  const twr = twrMetrics && snapshotQuality?.usable && snapshotHistoryRows.length >= 20
    ? {
      method: "twr_snapshots",
      methodLabel: "TWR desde fotos guardadas (ajustado por flujos cuando existen)",
      totalTwr: twrMetrics.totalTwr ?? null,
      totalTwrLabel: twrMetrics.totalTwrLabel ?? null,
      moneyWeightedReturn: twrMetrics.moneyWeightedReturn ?? null,
      moneyWeightedReturnLabel: twrMetrics.moneyWeightedReturnLabel ?? null,
      sessions: snapshotHistoryRows.length,
      performanceMethod: twrMetrics.performanceMethod || null,
    }
    : null;

  const explanation = [];
  if (current.totalReturn !== null) {
    explanation.push(`Desde tu costo base, la cartera ${current.totalReturn >= 0 ? "gana" : "pierde"} ${fmtPct(Math.abs(current.totalReturn))} (${current.trackedPositions} de ${current.totalPositions} posiciones con costo cargado).`);
  } else {
    explanation.push("Todavía no se puede calcular retorno desde compra: falta costo base en tus posiciones.");
  }
  if (reconstructed?.totalReturn !== null && reconstructed !== null) {
    explanation.push(`La trayectoria reconstruida con precios reales cubre ${reconstructed.spanDays} días. Retorno total ${reconstructed.totalReturnLabel}${reconstructed.annualizedReturnLabel ? ` (${reconstructed.annualizedReturnLabel} anualizado)` : ""}, drawdown máximo ${reconstructed.maxDrawdownLabel || "N/D"}.`);
    if (reconstructed.benchmarkSpread !== null) {
      explanation.push(`Contra ${benchmarkSymbol} con los mismos aportes en las mismas fechas: ${reconstructed.benchmarkSpread >= 0 ? "vas ganando por" : "vas perdiendo por"} ${fmtPct(Math.abs(reconstructed.benchmarkSpread))}.`);
    }
  } else if (inputs.readyForReconstruction === false) {
    explanation.push("Sin fechas de compra no reconstruimos trayectoria histórica; mostramos solo la lectura actual para no inventar un gráfico.");
  }
  if (current.concentration.topWeight !== null && current.concentration.topWeight >= 0.25) {
    explanation.push(`Ojo con la concentración: la posición más grande pesa ${current.concentration.topWeightLabel} y las 5 mayores suman ${current.concentration.topFiveWeightLabel || "N/D"}.`);
  }
  if (twr) {
    explanation.push(`El TWR de fotos guardadas (${twr.totalTwrLabel || "N/D"}) mide la habilidad de la cartera neta de aportes/retiros; puede diferir del retorno desde costo base.`);
  }

  return {
    version: "holdings_performance_v1",
    benchmarkSymbol,
    inputs,
    current,
    reconstructed,
    reconstructedStatus: reconstruction?.status || (inputs.readyForReconstruction ? "not_run" : "missing_inputs"),
    reconstructedQuality: reconQuality,
    twr,
    twrAvailable: Boolean(twr),
    explanation,
  };
}

/**
 * Fetch daily closes for a set of tickers from FMP. Returns
 * { TICKER: { "YYYY-MM-DD": close } }. Best-effort: tickers that fail are
 * simply absent so callers can degrade honestly.
 */
export async function fetchDailyCloseHistory(tickers, { fromDate, toDate } = {}) {
  const apiKey = process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY;
  const unique = [...new Set((tickers || []).map((t) => String(t || "").toUpperCase()).filter(Boolean))];
  if (!apiKey || !unique.length) return {};

  const today = new Date().toISOString().slice(0, 10);
  const minFrom = new Date(Date.now() - MAX_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10);
  const from = fromDate && fromDate > minFrom ? fromDate : minFrom;
  const to = toDate || today;

  const results = await Promise.allSettled(unique.map(async (ticker) => {
    const cacheKey = `${ticker}:${from}:${to.slice(0, 10)}`;
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < PRICE_CACHE_TTL_MS) return [ticker, cached.series];

    const url = new URL("https://financialmodelingprep.com/stable/historical-price-eod/full");
    url.searchParams.set("symbol", ticker);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("apikey", apiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(9000), cache: "no-store" });
    if (!response.ok) throw new Error(`FMP ${response.status} for ${ticker}`);
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.historical) ? payload.historical : [];
    const series = {};
    for (const row of rows) {
      const date = parseDateOnly(row?.date);
      const close = toNumber(row?.adjClose ?? row?.close);
      if (date && close !== null && close > 0) series[date] = close;
    }
    if (!Object.keys(series).length) throw new Error(`FMP empty history for ${ticker}`);
    priceCache.set(cacheKey, { createdAt: Date.now(), series });
    return [ticker, series];
  }));

  return Object.fromEntries(results.filter((r) => r.status === "fulfilled").map((r) => r.value));
}
