const DEFAULT_TAX_RATE = 0.22;

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

function getCompiled(input = {}) {
  if (input?.version === "aurora_belief_compiler_v1") return input;
  if (input?.compiled?.version === "aurora_belief_compiler_v1") return input.compiled;
  return null;
}

function getDrivers(input = {}, compiled = null) {
  return compiled?.drivers || input?.drivers || {};
}

function getForecast(input = {}) {
  return input.forecast || input.bayesianForecast || null;
}

function getAccounting(input = {}, compiled = null) {
  return input.accounting || compiled?.accounting || null;
}

function getValuationEnsemble(input = {}) {
  return input.valuationEnsemble || input.ensemble || null;
}

function distributionFallback(dist, mean, sd, min, max) {
  const center = clamp(numeric(dist?.mean, numeric(dist?.p50, mean)), min, max);
  const width = Math.max(1e-6, numeric(dist?.sd, sd));
  return {
    mean: center,
    p10: clamp(numeric(dist?.p10, center - width * 1.2816), min, max),
    p50: clamp(numeric(dist?.p50, center), min, max),
    p90: clamp(numeric(dist?.p90, center + width * 1.2816), min, max),
    sd: width,
    min,
    max,
  };
}

function sequence(min, max, steps) {
  const count = Math.max(3, Math.floor(steps));
  if (Math.abs(max - min) < 1e-9) return Array.from({ length: count }, () => min);
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function currentEconomics(drivers = {}, accounting = null) {
  const economic = accounting?.economic || {};
  const reported = accounting?.reported || {};
  return {
    marketPrice: numeric(drivers.price, null),
    revenue: numeric(drivers.revenue, numeric(reported.revenue, 100)),
    investedCapital: numeric(economic.adjustedInvestedCapital, numeric(reported.investedCapital, null)),
    baseFcf: numeric(drivers.baseFcf, numeric(economic.adjustedFreeCashFlow, null)),
    taxRate: clamp(numeric(drivers.taxRate, accounting?.policy?.taxRate ?? DEFAULT_TAX_RATE), 0, 0.45),
    dataQuality: clamp(numeric(drivers.dataQuality, accounting?.quality?.score ?? 0.55), 0, 1),
  };
}

function valueCell({ revenue, taxRate }, assumptions) {
  const horizon = 7;
  const wacc = clamp(assumptions.wacc, 0.035, 0.24);
  const terminalGrowth = clamp(Math.min(assumptions.terminalGrowth, wacc - 0.025), -0.02, 0.055);
  const stableRoic = Math.max(wacc + 0.015, assumptions.roic * 0.45 + wacc * 0.55);
  let yearRevenue = Math.max(1, revenue);
  let presentValue = 0;
  for (let year = 1; year <= horizon; year += 1) {
    const fade = Math.exp(-0.18 * (year - 1));
    const growth = assumptions.growth * fade + terminalGrowth * (1 - fade);
    const margin = assumptions.margin * fade + Math.max(0.04, assumptions.margin * 0.65) * (1 - fade);
    yearRevenue *= 1 + growth;
    const nopat = yearRevenue * margin * (1 - taxRate);
    const reinvestment = Math.max(0, nopat * assumptions.reinvestment * fade);
    presentValue += (nopat - reinvestment) / Math.pow(1 + wacc, year);
  }
  const stableNopat = yearRevenue * Math.max(0.02, assumptions.margin * 0.62) * (1 - taxRate);
  const stableReinvestmentRate = clamp(Math.max(0, terminalGrowth) / stableRoic, 0, 0.85);
  const terminalFcf = stableNopat * (1 - stableReinvestmentRate) * (1 + terminalGrowth);
  const terminalValue = terminalFcf / Math.max(0.025, wacc - terminalGrowth);
  return presentValue + terminalValue / Math.pow(1 + wacc, horizon);
}

function normalDensityScore(value, dist) {
  const sd = Math.max(1e-6, numeric(dist.sd, Math.abs(dist.p90 - dist.p10) / 2.5632 || 0.05));
  const z = (value - dist.mean) / sd;
  return Math.exp(-0.5 * z * z);
}

function feasibilityScore({ growth, margin, roic, reinvestment }, posterior, marketPrice, value) {
  const growthScore = normalDensityScore(growth, posterior.growth);
  const marginScore = normalDensityScore(margin, posterior.margin);
  const roicScore = normalDensityScore(roic, posterior.roic);
  const reinvestmentScore = normalDensityScore(reinvestment, posterior.reinvestment);
  let score = Math.pow(growthScore * marginScore * roicScore * reinvestmentScore, 0.25);
  if (growth > 0.18 && reinvestment < 0.12) score *= 0.45;
  if (margin > 0.35 && roic < 0.12) score *= 0.55;
  if (roic < posterior.wacc.mean && growth > 0.08) score *= 0.55;
  if (isFiniteNumber(marketPrice) && isFiniteNumber(value)) {
    const pressure = Math.abs(Math.log(Math.max(value, 1e-6) / Math.max(marketPrice, 1e-6)));
    if (pressure < 0.04) score *= 1.08;
  }
  return clamp(score, 0, 1);
}

function buildPosterior(forecast = null, drivers = {}) {
  const posterior = forecast?.posterior || {};
  return {
    growth: distributionFallback(posterior.growth, numeric(drivers.revenueCagr, 0.05), 0.08, -0.25, 0.45),
    margin: distributionFallback(posterior.margin, numeric(drivers.margin, 0.13), 0.09, -0.2, 0.65),
    roic: distributionFallback(posterior.roic, numeric(drivers.roic, 0.1), 0.1, -0.2, 0.8),
    reinvestment: distributionFallback(posterior.reinvestment, numeric(drivers.reinvestment, 0.32), 0.18, 0.01, 1.15),
    wacc: distributionFallback(posterior.wacc, numeric(drivers.wacc, 0.09), 0.03, 0.035, 0.24),
    terminalGrowth: distributionFallback(posterior.terminalGrowth, numeric(drivers.terminalGrowth, 0.025), 0.015, -0.02, 0.06),
  };
}

function gridRanges(posterior, options = {}) {
  const marketPressure = Math.max(0, numeric(options.marketPressure, 0));
  const growthMin = clamp(numeric(options.growthMin, posterior.growth.p10 - 0.06), -0.25, 0.45);
  const growthMax = clamp(numeric(options.growthMax, posterior.growth.p90 + 0.08 + marketPressure * 0.12), growthMin + 0.02, 0.58);
  const marginMin = clamp(numeric(options.marginMin, posterior.margin.p10 - 0.06), -0.15, 0.65);
  const marginMax = clamp(numeric(options.marginMax, posterior.margin.p90 + 0.08 + marketPressure * 0.1), marginMin + 0.02, 0.82);
  return {
    growth: sequence(growthMin, growthMax, options.growthSteps || 13),
    margin: sequence(marginMin, marginMax, options.marginSteps || 13),
  };
}

function buildSurface(economics, posterior, options = {}) {
  const ranges = gridRanges(posterior, options);
  const wacc = posterior.wacc.p50;
  const terminalGrowth = posterior.terminalGrowth.p50;
  const baseRoic = posterior.roic.p50;
  const baseReinvestment = posterior.reinvestment.p50;
  const cells = [];

  for (const growth of ranges.growth) {
    for (const margin of ranges.margin) {
      const roic = clamp(baseRoic + (margin - posterior.margin.p50) * 0.65 + Math.max(0, growth - posterior.growth.p50) * 0.35, -0.2, 0.8);
      const reinvestmentFloor = growth > 0 ? safeDivide(growth, Math.max(0.04, roic), 0.1) * 0.28 : 0.04;
      const reinvestment = clamp(Math.max(baseReinvestment, reinvestmentFloor), 0.01, 1.15);
      const value = valueCell(economics, { growth, margin, roic, reinvestment, wacc, terminalGrowth });
      const valueToPrice = safeDivide(value, economics.marketPrice, null);
      const priceGap = isFiniteNumber(valueToPrice) ? valueToPrice - 1 : null;
      const feasibility = feasibilityScore({ growth, margin, roic, reinvestment }, posterior, economics.marketPrice, value);
      cells.push({
        growth,
        margin,
        roic,
        reinvestment,
        wacc,
        terminalGrowth,
        value,
        valueToPrice,
        priceGap,
        feasibility,
        region:
          !isFiniteNumber(priceGap)
            ? "unknown"
            : Math.abs(priceGap) <= 0.04
              ? "near_market_contour"
              : priceGap > 0
                ? "value_above_price"
                : "value_below_price",
        economicallyFeasible: feasibility >= 0.38,
      });
    }
  }
  return {
    axes: {
      growth: { min: ranges.growth[0], max: ranges.growth[ranges.growth.length - 1], steps: ranges.growth.length },
      margin: { min: ranges.margin[0], max: ranges.margin[ranges.margin.length - 1], steps: ranges.margin.length },
    },
    cells,
  };
}

function buildContour(surface, marketPrice) {
  if (!isFiniteNumber(marketPrice) || marketPrice <= 0) return [];
  return [...surface.cells]
    .filter((cell) => isFiniteNumber(cell.value))
    .map((cell) => ({
      growth: cell.growth,
      margin: cell.margin,
      value: cell.value,
      valueToPrice: cell.valueToPrice,
      feasibility: cell.feasibility,
      distanceToMarket: Math.abs(Math.log(Math.max(cell.value, 1e-6) / marketPrice)),
      economicallyFeasible: cell.economicallyFeasible,
    }))
    .sort((a, b) => a.distanceToMarket - b.distanceToMarket)
    .slice(0, 16);
}

function summarizeSurface(surface, contour, economics, posterior, valuationEnsemble = null) {
  const feasibleCells = surface.cells.filter((cell) => cell.economicallyFeasible);
  const feasibleAbove = feasibleCells.filter((cell) => isFiniteNumber(cell.valueToPrice) && cell.valueToPrice >= 1).length;
  const feasibleShareAbovePrice = feasibleCells.length ? feasibleAbove / feasibleCells.length : 0;
  const best = contour[0] || null;
  const posteriorCenterValue = valueCell(economics, {
    growth: posterior.growth.p50,
    margin: posterior.margin.p50,
    roic: posterior.roic.p50,
    reinvestment: posterior.reinvestment.p50,
    wacc: posterior.wacc.p50,
    terminalGrowth: posterior.terminalGrowth.p50,
  });
  const ensembleFairValue = numeric(valuationEnsemble?.summary?.weightedFairValue, null);
  const ensembleGap = isFiniteNumber(ensembleFairValue) && isFiniteNumber(economics.marketPrice) && economics.marketPrice > 0
    ? ensembleFairValue / economics.marketPrice - 1
    : null;
  return {
    marketPrice: economics.marketPrice,
    posteriorCenterValue,
    posteriorCenterValueToPrice: safeDivide(posteriorCenterValue, economics.marketPrice, null),
    ensembleFairValue,
    ensembleGap,
    feasibleShareAbovePrice,
    marketClearingCell: best,
    marketClearingFeasibility: best?.feasibility ?? null,
  };
}

function buildDecision(summary) {
  if (!isFiniteNumber(summary.marketPrice) || !summary.marketClearingCell) return "expectations_surface_insufficient";
  if (summary.marketClearingFeasibility < 0.18 && summary.feasibleShareAbovePrice < 0.2) return "market_expectations_heroic";
  if (summary.marketClearingFeasibility < 0.34 || summary.feasibleShareAbovePrice < 0.35) return "market_expectations_demanding";
  if (summary.feasibleShareAbovePrice > 0.62 && summary.posteriorCenterValueToPrice > 1.05) return "market_expectations_feasible_with_upside";
  return "market_expectations_balanced";
}

function normalizeExternalScenarios(input = {}) {
  const raw = input.managementScenarios || input.consensusScenarios || input.scenarios || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      label: item.label || item.name || item.source || "external_scenario",
      source: item.source || null,
      growth: numeric(item.growth ?? item.revenueCagr ?? item.revenueCagr5y, null),
      margin: numeric(item.margin ?? item.terminalMargin ?? item.ebitMargin, null),
      roic: numeric(item.roic ?? item.roiic, null),
      note: item.note || item.text || null,
    }));
}

export function buildAuroraExpectationsEngine(input = {}, options = {}) {
  const compiled = getCompiled(input);
  const drivers = getDrivers(input, compiled);
  const forecast = getForecast(input);
  const accounting = getAccounting(input, compiled);
  const valuationEnsemble = getValuationEnsemble(input);
  const posterior = buildPosterior(forecast, drivers);
  const economics = currentEconomics(drivers, accounting);
  const anchorValue = numeric(valuationEnsemble?.summary?.weightedFairValue, numeric(forecast?.expectedFairValue, null));
  const marketPressure =
    isFiniteNumber(economics.marketPrice) && economics.marketPrice > 0 && isFiniteNumber(anchorValue) && anchorValue > 0
      ? Math.max(0, Math.log(economics.marketPrice / anchorValue))
      : 0;
  const surface = buildSurface(economics, posterior, { ...options, marketPressure });
  const contour = buildContour(surface, economics.marketPrice);
  const summary = summarizeSurface(surface, contour, economics, posterior, valuationEnsemble);
  const decision = buildDecision(summary);
  const posteriorOverlay = {
    growth: { p10: posterior.growth.p10, p50: posterior.growth.p50, p90: posterior.growth.p90 },
    margin: { p10: posterior.margin.p10, p50: posterior.margin.p50, p90: posterior.margin.p90 },
    roic: { p10: posterior.roic.p10, p50: posterior.roic.p50, p90: posterior.roic.p90 },
    reinvestment: { p10: posterior.reinvestment.p10, p50: posterior.reinvestment.p50, p90: posterior.reinvestment.p90 },
  };

  return {
    version: "aurora_expectations_engine_v1",
    ticker: drivers.ticker || compiled?.ticker || null,
    name: drivers.name || compiled?.name || null,
    builtAt: options.builtAt || new Date().toISOString(),
    surface,
    marketContour: contour,
    posteriorOverlay,
    externalScenarios: normalizeExternalScenarios(input),
    summary,
    decision,
    memo: {
      headline: `Expectations surface says ${decision.replaceAll("_", " ")}.`,
      marketQuestion:
        summary.marketClearingCell
          ? `Market roughly clears near ${(summary.marketClearingCell.growth * 100).toFixed(1)}% growth and ${(summary.marketClearingCell.margin * 100).toFixed(1)}% margin.`
          : "Market-clearing assumptions could not be inferred.",
      feasibility: summary.marketClearingFeasibility,
      feasibleShareAbovePrice: summary.feasibleShareAbovePrice,
      reverseDcfRole: "This is a surface of required expectations, not a single growth plug.",
    },
  };
}
