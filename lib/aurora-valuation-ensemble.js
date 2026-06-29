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

function getForecast(input = {}) {
  return input?.forecast || input?.bayesianForecast || null;
}

function getDrivers(input = {}, compiled = null) {
  return compiled?.drivers || input?.drivers || {};
}

function getAccounting(input = {}, compiled = null) {
  return input?.accounting || compiled?.accounting || null;
}

function getBeliefObject(input = {}, compiled = null) {
  return input?.beliefObject || compiled?.beliefObject || null;
}

function sectorText(input = {}, drivers = {}) {
  const company = input.company || input.profile || {};
  const accountingCompany = input.accounting?.company || input.compiled?.accounting?.company || {};
  return `${drivers.sector || company.sector || accountingCompany.sector || ""} ${company.industry || accountingCompany.industry || ""}`.toLowerCase();
}

function scenarioProbability(scenario) {
  return clamp(numeric(scenario?.probability, 1 / 3), 0, 1);
}

function weightedAverage(items, field = "value") {
  const clean = items.filter((item) => isFiniteNumber(item[field]) && isFiniteNumber(item.probability) && item.probability > 0);
  const totalWeight = clean.reduce((sum, item) => sum + item.probability, 0);
  if (!clean.length || totalWeight <= 0) return null;
  return clean.reduce((sum, item) => sum + item[field] * item.probability, 0) / totalWeight;
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

function getLensLegitimacy(beliefObject = null) {
  const rows = Array.isArray(beliefObject?.lensLegitimacy) ? beliefObject.lensLegitimacy : [];
  return rows.reduce((acc, lens) => {
    if (lens?.key) acc[lens.key] = clamp(numeric(lens.legitimacy, 0.2), 0, 1);
    return acc;
  }, {});
}

function inferArchetype(sector = "") {
  if (/bank|insurance|financial|broker|credit/.test(sector)) return "financial";
  if (/software|saas|cloud|platform|marketplace|payments/.test(sector)) return "asset_light_platform";
  if (/energy|commodity|mining|materials|shipping|airline|utility|reit|real estate/.test(sector)) return "asset_heavy";
  if (/semiconductor|aerospace|equipment|industrial|auto|chemical/.test(sector)) return "capacity_cycle";
  if (/biotech|pharma|drug/.test(sector)) return "event_driven";
  return "general";
}

function lensPriors(archetype) {
  const base = {
    fcffDcf: 0.22,
    roicFade: 0.18,
    residualIncome: 0.12,
    assetValue: 0.12,
    apv: 0.1,
    realOptions: 0.08,
    bottleneck: 0.08,
    unitEconomics: 0.06,
    capitalCycle: 0.04,
  };
  if (archetype === "financial") {
    return { ...base, fcffDcf: 0.02, residualIncome: 0.42, assetValue: 0.22, roicFade: 0.08, apv: 0.1, realOptions: 0.04 };
  }
  if (archetype === "asset_light_platform") {
    return { ...base, fcffDcf: 0.2, roicFade: 0.18, unitEconomics: 0.18, realOptions: 0.16, assetValue: 0.02, residualIncome: 0.04 };
  }
  if (archetype === "asset_heavy") {
    return { ...base, assetValue: 0.3, capitalCycle: 0.18, apv: 0.14, fcffDcf: 0.12, residualIncome: 0.1, realOptions: 0.04 };
  }
  if (archetype === "capacity_cycle") {
    return { ...base, bottleneck: 0.18, capitalCycle: 0.14, roicFade: 0.17, fcffDcf: 0.18, assetValue: 0.11, realOptions: 0.1 };
  }
  if (archetype === "event_driven") {
    return { ...base, realOptions: 0.32, fcffDcf: 0.1, assetValue: 0.1, residualIncome: 0.04, unitEconomics: 0.12 };
  }
  return base;
}

function currentEconomics(drivers = {}, accounting = null) {
  const economic = accounting?.economic || {};
  const reported = accounting?.reported || {};
  return {
    price: numeric(drivers.price, null),
    revenue: numeric(drivers.revenue, numeric(reported.revenue, 100)),
    baseFcf: numeric(drivers.baseFcf, numeric(economic.adjustedFreeCashFlow, null)),
    investedCapital: numeric(economic.adjustedInvestedCapital, numeric(reported.investedCapital, null)),
    equity: numeric(reported.equity, null),
    debt: numeric(reported.debt, 0),
    cash: numeric(reported.cash, 0),
    taxRate: clamp(numeric(drivers.taxRate, accounting?.policy?.taxRate ?? DEFAULT_TAX_RATE), 0, 0.45),
    dataQuality: clamp(numeric(drivers.dataQuality, accounting?.quality?.score ?? 0.55), 0, 1),
    accountingQuality: clamp(numeric(accounting?.quality?.score, drivers.dataQuality ?? 0.55), 0, 1),
  };
}

function dcfValue(scenario) {
  return numeric(scenario.fairValue, null);
}

function roicFadeValue(scenario, economics) {
  const revenue = economics.revenue;
  const capital = numeric(economics.investedCapital, Math.max(1, revenue * 1.15));
  const taxRate = economics.taxRate;
  const wacc = clamp(scenario.wacc, 0.035, 0.24);
  const terminalGrowth = clamp(Math.min(scenario.terminalGrowth, wacc - 0.025), -0.02, 0.055);
  const horizon = 8;
  let value = 0;
  let yearRevenue = revenue;
  let yearCapital = capital;
  for (let year = 1; year <= horizon; year += 1) {
    const fade = Math.exp(-0.18 * (year - 1));
    const roic = wacc + (scenario.roic - wacc) * fade;
    yearRevenue *= 1 + scenario.growth * fade + terminalGrowth * (1 - fade);
    yearCapital += Math.max(0, yearCapital * scenario.reinvestment * 0.12);
    const nopat = Math.max(yearRevenue * scenario.margin * (1 - taxRate), yearCapital * roic);
    const reinvestment = Math.max(0, nopat * clamp(scenario.reinvestment, 0, 1.1) * fade);
    value += (nopat - reinvestment) / Math.pow(1 + wacc, year);
  }
  const steadyNopat = yearCapital * Math.max(wacc + 0.01, scenario.roic * 0.45 + wacc * 0.55);
  const terminalFcf = steadyNopat * (1 - Math.max(0, terminalGrowth) / Math.max(wacc + 0.01, scenario.roic * 0.45 + wacc * 0.55));
  return value + terminalFcf / Math.max(0.025, wacc - terminalGrowth) / Math.pow(1 + wacc, horizon);
}

function residualIncomeValue(scenario, economics) {
  const bookCapital = numeric(economics.equity, numeric(economics.investedCapital, economics.revenue));
  const wacc = clamp(scenario.wacc, 0.035, 0.24);
  const spread = scenario.roic - wacc;
  const persistence = clamp(0.45 + Math.max(0, spread) * 2.2, 0.2, 0.9);
  const residualIncome = bookCapital * spread * persistence;
  return bookCapital + residualIncome / Math.max(0.035, wacc + 0.015);
}

function assetValue(scenario, economics, input = {}) {
  const sector = sectorText(input);
  const capital = numeric(economics.investedCapital, economics.revenue);
  const netCash = economics.cash - economics.debt;
  const replacementPremium = /semiconductor|industrial|equipment|aerospace|utility|energy|mining|materials/.test(sector)
    ? 0.2
    : 0.04;
  const profitabilityAdjustment = clamp((scenario.roic - scenario.wacc) * 1.4, -0.35, 0.45);
  return Math.max(0, capital * (1 + replacementPremium + profitabilityAdjustment) + netCash);
}

function apvValue(scenario, economics) {
  const unleveredValue = dcfValue(scenario);
  if (!isFiniteNumber(unleveredValue)) return null;
  const debt = Math.max(0, economics.debt);
  const taxShield = debt * economics.taxRate * 0.75;
  const leverage = safeDivide(debt, Math.max(1, economics.investedCapital || economics.revenue), 0);
  const distressCost = unleveredValue * clamp((leverage - 0.45) * 0.22, 0, 0.18);
  return unleveredValue + taxShield - distressCost;
}

function realOptionsValue(scenario, economics, forecast = null) {
  const base = dcfValue(scenario);
  if (!isFiniteNumber(base)) return null;
  const scenarios = Array.isArray(forecast?.scenarios) ? forecast.scenarios : [];
  const baseScenario = scenarios.find((item) => item.name === "base");
  const bullScenario = scenarios.find((item) => item.name === "bull");
  const convexity = isFiniteNumber(bullScenario?.fairValue) && isFiniteNumber(baseScenario?.fairValue)
    ? Math.max(0, bullScenario.fairValue - baseScenario.fairValue)
    : base * Math.max(0, scenario.growth);
  const optionIntensity = clamp(Math.max(0, scenario.growth) * 1.8 + Math.max(0, scenario.roic - scenario.wacc) * 0.8, 0, 0.75);
  return base + convexity * optionIntensity * 0.18;
}

function bottleneckValue(scenario, economics, input = {}) {
  const base = dcfValue(scenario);
  if (!isFiniteNumber(base)) return null;
  const equilibrium = input.equilibrium || {};
  const bottleneckPower = clamp(numeric(input.compiled?.drivers?.bottleneckPower, input.drivers?.bottleneckPower ?? 0.4), 0, 1);
  const productPressure = clamp(numeric(equilibrium.productMarket?.pricingPressure, 0), -1, 1);
  const scarcityPremium = clamp(bottleneckPower * 0.18 + Math.max(0, productPressure) * 0.16, 0, 0.32);
  return base * (1 + scarcityPremium);
}

function unitEconomicsValue(scenario, economics) {
  const revenue = economics.revenue;
  const normalizedContribution = revenue * clamp(scenario.margin + Math.max(0, scenario.growth) * 0.35, -0.1, 0.75) * (1 - economics.taxRate);
  const scaleReinvestment = normalizedContribution * clamp(scenario.reinvestment * 0.72, 0, 0.85);
  return (normalizedContribution - scaleReinvestment) / Math.max(0.035, scenario.wacc - Math.min(scenario.terminalGrowth, scenario.wacc - 0.03));
}

function capitalCycleValue(scenario, economics, input = {}) {
  const base = dcfValue(scenario);
  if (!isFiniteNumber(base)) return null;
  const equilibrium = input.equilibrium || {};
  const pressure = clamp(numeric(equilibrium.aggregate?.score, 0), -1, 1);
  const utilization = clamp(numeric(equilibrium.productMarket?.utilization, 0.75), 0, 1.4);
  const cycleAdjustment = clamp(pressure * 0.18 + (utilization - 0.8) * 0.2 - scenario.reinvestment * 0.05, -0.28, 0.28);
  return base * (1 + cycleAdjustment);
}

function lensScenarioValue(key, scenario, economics, input, forecast) {
  if (key === "fcffDcf") return dcfValue(scenario);
  if (key === "roicFade") return roicFadeValue(scenario, economics);
  if (key === "residualIncome") return residualIncomeValue(scenario, economics);
  if (key === "assetValue") return assetValue(scenario, economics, input);
  if (key === "apv") return apvValue(scenario, economics);
  if (key === "realOptions") return realOptionsValue(scenario, economics, forecast);
  if (key === "bottleneck") return bottleneckValue(scenario, economics, input);
  if (key === "unitEconomics") return unitEconomicsValue(scenario, economics);
  if (key === "capitalCycle") return capitalCycleValue(scenario, economics, input);
  return null;
}

function mapLegitimacyKey(key) {
  return {
    fcffDcf: "dcf",
    roicFade: "roicFade",
    residualIncome: "residualIncome",
    assetValue: "assetValue",
    apv: "dcf",
    realOptions: "realOptions",
    bottleneck: "bottleneck",
    unitEconomics: "unitEconomics",
    capitalCycle: "capitalCycle",
  }[key] || key;
}

function normalizeLensWeights(lenses) {
  const total = lenses.reduce((sum, lens) => sum + Math.max(0, lens.rawWeight), 0);
  if (total <= 0) return lenses.map((lens) => ({ ...lens, weight: 0 }));
  return lenses.map((lens) => ({ ...lens, weight: Math.max(0, lens.rawWeight) / total }));
}

function buildLensOutputs(input, forecast, economics, archetype, legitimacy) {
  const scenarios = Array.isArray(forecast?.scenarios) && forecast.scenarios.length
    ? forecast.scenarios
    : [{ name: "base", probability: 1, growth: 0.04, margin: 0.12, roic: 0.1, reinvestment: 0.32, wacc: 0.09, terminalGrowth: 0.025, fairValue: economics.baseFcf ? economics.baseFcf / 0.065 : economics.revenue }];
  const priors = lensPriors(archetype);
  const forecastConfidence = 1 - clamp(numeric(forecast?.uncertainty?.total, 0.45), 0, 1) * 0.45;
  const accountingConfidence = clamp(0.35 + economics.accountingQuality * 0.65, 0.35, 1);

  const intrinsic = Object.keys(priors).map((key) => {
    const scenarioValues = scenarios.map((scenario) => ({
      scenario: scenario.name,
      probability: scenarioProbability(scenario),
      value: lensScenarioValue(key, scenario, economics, input, forecast),
    }));
    const expectedValue = weightedAverage(scenarioValues, "value");
    const available = isFiniteNumber(expectedValue);
    const legitimacyScore = clamp(numeric(legitimacy[mapLegitimacyKey(key)], 0.28), 0, 1);
    const rawWeight = available ? priors[key] * (0.28 + legitimacyScore * 0.72) * forecastConfidence * accountingConfidence : 0;
    return {
      key,
      role: "intrinsic_lens",
      expectedValue,
      scenarioValues,
      legitimacy: legitimacyScore,
      priorWeight: priors[key],
      rawWeight,
      confidence: clamp((0.35 + legitimacyScore * 0.4 + economics.dataQuality * 0.25) * forecastConfidence, 0, 1),
    };
  });

  return normalizeLensWeights(intrinsic).concat([
    {
      key: "reverseDcf",
      role: "market_implied_benchmark",
      expectedValue: economics.price,
      scenarioValues: [],
      legitimacy: clamp(numeric(legitimacy.reverseDcf, 0.86), 0, 1),
      priorWeight: 0,
      rawWeight: 0,
      weight: 0,
      confidence: clamp(numeric(legitimacy.reverseDcf, 0.86), 0, 1),
    },
  ]);
}

function summarizeEnsemble(lensOutputs, price) {
  const intrinsic = lensOutputs.filter((lens) => lens.role === "intrinsic_lens" && lens.weight > 0 && isFiniteNumber(lens.expectedValue));
  const weightedFairValue = intrinsic.reduce((sum, lens) => sum + lens.expectedValue * lens.weight, 0);
  const weightedVariance = intrinsic.reduce((sum, lens) => sum + lens.weight * (lens.expectedValue - weightedFairValue) ** 2, 0);
  const weightedSd = Math.sqrt(Math.max(0, weightedVariance));
  const values = intrinsic.map((lens) => lens.expectedValue);
  const expectedReturn = isFiniteNumber(price) && price > 0 ? weightedFairValue / price - 1 : null;
  const dispersion = weightedFairValue > 0 ? weightedSd / weightedFairValue : 1;
  const topLens = [...intrinsic].sort((a, b) => b.weight - a.weight)[0] || null;
  const disagreement = clamp(dispersion, 0, 2);
  return {
    weightedFairValue,
    expectedReturn,
    valueRange: {
      p10: quantile(values, 0.1),
      p50: quantile(values, 0.5),
      p90: quantile(values, 0.9),
    },
    dispersion,
    disagreement,
    topLens: topLens?.key || null,
    methodCount: intrinsic.length,
  };
}

function buildDecision(summary, forecast) {
  if (!summary.methodCount || !isFiniteNumber(summary.weightedFairValue)) {
    return "ensemble_insufficient";
  }
  if (forecast?.decision === "forecast_requires_review") {
    return "ensemble_waits_for_forecast_review";
  }
  if (summary.disagreement > 0.7) return "ensemble_requires_review";
  if (summary.disagreement > 0.42) return "ensemble_wide_range_use_caution";
  return "ensemble_usable";
}

export function buildAuroraValuationEnsemble(input = {}, options = {}) {
  const compiled = getCompiled(input);
  const forecast = getForecast(input);
  const drivers = getDrivers(input, compiled);
  const accounting = getAccounting(input, compiled);
  const beliefObject = getBeliefObject(input, compiled);
  const sector = sectorText(input, drivers);
  const archetype = inferArchetype(sector);
  const economics = currentEconomics(drivers, accounting);
  const legitimacy = getLensLegitimacy(beliefObject);
  const lensOutputs = buildLensOutputs(input, forecast, economics, archetype, legitimacy);
  const summary = summarizeEnsemble(lensOutputs, economics.price);
  const decision = buildDecision(summary, forecast);

  return {
    version: "aurora_valuation_ensemble_v1",
    ticker: drivers.ticker || compiled?.ticker || null,
    name: drivers.name || compiled?.name || null,
    builtAt: options.builtAt || new Date().toISOString(),
    archetype,
    lensOutputs,
    summary,
    decision,
    memo: {
      headline: `Valuation ensemble is ${decision.replaceAll("_", " ")} with ${summary.topLens || "no"} leading lens.`,
      weightedFairValue: summary.weightedFairValue,
      expectedReturn: summary.expectedReturn,
      disagreement: summary.disagreement,
      topLens: summary.topLens,
      reverseDcfRole: "Reverse DCF is treated as a market-implied benchmark, not as intrinsic value.",
    },
  };
}
