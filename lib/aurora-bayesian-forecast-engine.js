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

function boundedDistribution(mean, sd, min, max) {
  const center = clamp(mean, min, max);
  const width = Math.max(Math.abs(sd), 1e-6);
  return {
    mean: center,
    p10: clamp(center - width * 1.2816, min, max),
    p50: center,
    p90: clamp(center + width * 1.2816, min, max),
    sd: width,
    min,
    max,
  };
}

function getCompiled(input = {}) {
  if (input?.version === "aurora_belief_compiler_v1") return input;
  if (input?.compiled?.version === "aurora_belief_compiler_v1") return input.compiled;
  return null;
}

function getDrivers(input = {}, compiled = null) {
  return compiled?.drivers || input?.drivers || input?.compiled?.drivers || {};
}

function getAccounting(input = {}, compiled = null) {
  return input?.accounting || compiled?.accounting || input?.compiled?.accounting || null;
}

function getEvidence(input = {}, compiled = null) {
  return input?.evidence || compiled?.evidenceSignals || input?.compiled?.evidenceSignals || {};
}

function getEquilibrium(input = {}) {
  return input?.equilibrium || input?.compiled?.equilibrium || null;
}

function getDriverGraph(input = {}) {
  return input?.driverGraph || input?.graph || null;
}

function sectorText(input = {}, drivers = {}) {
  const company = input.company || input.profile || {};
  return `${drivers.sector || company.sector || ""} ${company.industry || ""}`.toLowerCase();
}

function archetypeFrom(input = {}, sector = "") {
  const equilibrium = getEquilibrium(input);
  if (equilibrium?.productMarket?.archetype) return equilibrium.productMarket.archetype;
  if (/software|saas|cloud/.test(sector)) return "saas";
  if (/marketplace|platform|exchange|payments/.test(sector)) return "marketplace";
  if (/bank|insurance|financial/.test(sector)) return "banking";
  if (/semiconductor|energy|commodity|mining|shipping|airline|industrial|auto|chemical/.test(sector)) return "physical_capacity";
  return "general";
}

function prior(mean, sd, source, weight = 1) {
  return { mean, sd: Math.max(sd, 1e-6), source, weight };
}

function combinePriors(priors, min, max) {
  const clean = priors.filter((item) => isFiniteNumber(item.mean) && isFiniteNumber(item.sd) && item.weight > 0);
  if (!clean.length) return boundedDistribution((min + max) / 2, (max - min) / 8, min, max);
  let precision = 0;
  let weightedMean = 0;
  clean.forEach((item) => {
    const p = item.weight / (item.sd * item.sd);
    precision += p;
    weightedMean += item.mean * p;
  });
  const mean = weightedMean / precision;
  const posteriorSd = Math.sqrt(1 / precision);
  return boundedDistribution(mean, posteriorSd, min, max);
}

function globalPriors() {
  return {
    growth: prior(0.045, 0.08, "global equity base rate", 0.8),
    margin: prior(0.13, 0.09, "global operating margin base rate", 0.75),
    roic: prior(0.105, 0.09, "global ROIC base rate", 0.75),
    reinvestment: prior(0.32, 0.2, "global reinvestment base rate", 0.7),
    wacc: prior(0.09, 0.035, "global cost of capital base rate", 0.75),
    terminalGrowth: prior(0.025, 0.015, "global nominal terminal growth", 0.7),
  };
}

function sectorPriors(sector = "", archetype = "general") {
  if (archetype === "saas") {
    return {
      growth: prior(0.09, 0.11, "SaaS sector prior", 0.9),
      margin: prior(0.18, 0.12, "SaaS target margin prior", 0.8),
      roic: prior(0.14, 0.14, "SaaS ROIC prior", 0.7),
      reinvestment: prior(0.42, 0.22, "SaaS reinvestment prior", 0.75),
      wacc: prior(0.095, 0.035, "SaaS WACC prior", 0.65),
    };
  }
  if (archetype === "banking") {
    return {
      growth: prior(0.035, 0.055, "banking growth prior", 0.9),
      margin: prior(0.16, 0.08, "banking profitability proxy prior", 0.55),
      roic: prior(0.095, 0.055, "banking ROE/ROIC proxy prior", 0.75),
      reinvestment: prior(0.22, 0.16, "banking capital retention prior", 0.75),
      wacc: prior(0.085, 0.025, "banking cost of equity prior", 0.75),
    };
  }
  if (archetype === "physical_capacity") {
    return {
      growth: prior(0.045, 0.12, "capacity-cycle growth prior", 0.8),
      margin: prior(0.14, 0.12, "capacity-cycle margin prior", 0.75),
      roic: prior(0.11, 0.13, "capacity-cycle ROIC prior", 0.75),
      reinvestment: prior(0.45, 0.24, "capacity-cycle reinvestment prior", 0.75),
      wacc: prior(/commodity|shipping|airline/.test(sector) ? 0.11 : 0.095, 0.04, "capacity-cycle WACC prior", 0.7),
    };
  }
  return {
    growth: prior(0.05, 0.09, "general sector growth prior", 0.75),
    margin: prior(0.14, 0.1, "general sector margin prior", 0.7),
    roic: prior(0.11, 0.1, "general sector ROIC prior", 0.7),
    reinvestment: prior(0.34, 0.2, "general sector reinvestment prior", 0.65),
    wacc: prior(0.09, 0.035, "general sector WACC prior", 0.7),
  };
}

function companyHistoryPriors(drivers = {}, accounting = null) {
  const quality = clamp(numeric(drivers.dataQuality, accounting?.quality?.score ?? 0.55), 0, 1);
  const modelRisk = clamp(numeric(drivers.modelRisk, 0.4), 0, 1);
  const confidence = clamp(0.35 + quality * 0.55 - modelRisk * 0.25, 0.1, 0.9);
  return {
    growth: prior(numeric(drivers.revenueCagr, 0.04), 0.06 + (1 - confidence) * 0.14, "company revenue history", confidence),
    margin: prior(numeric(drivers.margin, 0.12), 0.045 + (1 - confidence) * 0.12, "company adjusted margin", confidence),
    roic: prior(numeric(drivers.roic, 0.1), 0.055 + (1 - confidence) * 0.14, "company adjusted ROIC", confidence),
    reinvestment: prior(numeric(drivers.reinvestment, 0.32), 0.08 + (1 - confidence) * 0.18, "company reinvestment history", confidence),
    wacc: prior(numeric(drivers.wacc, 0.09), 0.018 + (1 - confidence) * 0.035, "company current WACC", confidence * 0.8),
    terminalGrowth: prior(numeric(drivers.terminalGrowth, 0.025), 0.012 + (1 - confidence) * 0.02, "company terminal growth anchor", confidence * 0.6),
  };
}

function evidencePriors(evidence = {}, equilibrium = null) {
  const signals = evidence.textSignals || evidence.signals || evidence;
  const pricingPower = clamp(numeric(signals.pricingPower, 0.45), 0, 1);
  const demandVisibility = clamp(numeric(signals.demandVisibility, 0.45), 0, 1);
  const marginPressure = clamp(numeric(signals.marginPressure, 0.35), 0, 1);
  const accountingTrust = clamp(numeric(signals.accountingTrust, 0.58), 0, 1);
  const demandSupply = clamp(numeric(equilibrium?.drivers?.demandSupply, 0.5), 0, 1);
  const flowPressure = clamp(numeric(equilibrium?.drivers?.priceFormationPressure, 0), -1, 1);
  return {
    growth: prior(0.03 + (demandVisibility - 0.45) * 0.16 + (demandSupply - 0.5) * 0.1, 0.09, "evidence demand/growth likelihood", 0.55),
    margin: prior(0.12 + (pricingPower - 0.45) * 0.18 - Math.max(0, marginPressure - 0.5) * 0.12, 0.09, "evidence margin likelihood", 0.55),
    roic: prior(0.1 + (pricingPower - 0.45) * 0.12 + (accountingTrust - 0.55) * 0.08, 0.1, "evidence ROIC likelihood", 0.45),
    reinvestment: prior(0.34 + Math.max(0, demandVisibility - 0.55) * 0.18, 0.18, "evidence reinvestment likelihood", 0.4),
    wacc: prior(0.09 + Math.max(0, -flowPressure) * 0.025 + Math.max(0, 0.45 - accountingTrust) * 0.025, 0.035, "evidence risk likelihood", 0.4),
  };
}

function buildPriorStack({ drivers, accounting, evidence, equilibrium, sector, archetype }) {
  const global = globalPriors();
  const sectorLayer = sectorPriors(sector, archetype);
  const company = companyHistoryPriors(drivers, accounting);
  const evidenceLayer = evidencePriors(evidence, equilibrium);
  const variables = ["growth", "margin", "roic", "reinvestment", "wacc", "terminalGrowth"];
  const stack = {};
  variables.forEach((variable) => {
    stack[variable] = [global[variable], sectorLayer[variable], company[variable], evidenceLayer[variable]].filter(Boolean);
  });
  return stack;
}

function posteriorFromStack(stack) {
  return {
    growth: combinePriors(stack.growth, -0.25, 0.45),
    margin: combinePriors(stack.margin, -0.2, 0.65),
    roic: combinePriors(stack.roic, -0.2, 0.8),
    reinvestment: combinePriors(stack.reinvestment, 0.01, 1.15),
    wacc: combinePriors(stack.wacc, 0.035, 0.24),
    terminalGrowth: combinePriors(stack.terminalGrowth, -0.02, 0.06),
  };
}

function applyDependenceAdjustments(posterior, { equilibrium, driverGraph }) {
  const next = JSON.parse(JSON.stringify(posterior));
  const productPressure = numeric(equilibrium?.productMarket?.pricingPressure, 0);
  const flowPressure = numeric(equilibrium?.equityMarket?.expectedPriceImpact, 0);
  const graphHealth = numeric(driverGraph?.graphHealth?.score, 0.75);
  const hardViolations = numeric(driverGraph?.graphHealth?.hardViolationCount, 0);

  next.growth.mean = clamp(next.growth.mean + productPressure * 0.035 + flowPressure * 0.01, next.growth.min, next.growth.max);
  next.margin.mean = clamp(next.margin.mean + productPressure * 0.028, next.margin.min, next.margin.max);
  next.wacc.mean = clamp(next.wacc.mean + Math.max(0, -flowPressure) * 0.018 + hardViolations * 0.006, next.wacc.min, next.wacc.max);

  if (next.growth.mean > 0.1 && next.reinvestment.mean < 0.16) {
    next.reinvestment.mean = clamp(0.16 + (next.growth.mean - 0.1) * 1.2, next.reinvestment.min, next.reinvestment.max);
  }
  if (next.growth.mean > 0.12) {
    next.margin.mean = clamp(next.margin.mean - (next.growth.mean - 0.12) * 0.2, next.margin.min, next.margin.max);
  }

  const widening = clamp(1 + (1 - graphHealth) * 0.6 + hardViolations * 0.18, 1, 2.2);
  Object.values(next).forEach((dist) => {
    dist.sd *= widening;
    dist.p10 = clamp(dist.mean - dist.sd * 1.2816, dist.min, dist.max);
    dist.p50 = dist.mean;
    dist.p90 = clamp(dist.mean + dist.sd * 1.2816, dist.min, dist.max);
  });

  return next;
}

function scenarioFromPosterior(name, posterior, probability) {
  const pick =
    name === "bear"
      ? { g: "p10", m: "p10", r: "p10", reinv: "p90", w: "p90", tg: "p10" }
      : name === "bull"
        ? { g: "p90", m: "p90", r: "p90", reinv: "p10", w: "p10", tg: "p90" }
        : { g: "p50", m: "p50", r: "p50", reinv: "p50", w: "p50", tg: "p50" };
  return {
    name,
    probability,
    growth: posterior.growth[pick.g],
    margin: posterior.margin[pick.m],
    roic: posterior.roic[pick.r],
    reinvestment: posterior.reinvestment[pick.reinv],
    wacc: posterior.wacc[pick.w],
    terminalGrowth: posterior.terminalGrowth[pick.tg],
  };
}

function scenarioProbabilities(posterior, equilibrium = null, driverGraph = null) {
  const pressure = numeric(equilibrium?.aggregate?.score, 0);
  const graphHealth = numeric(driverGraph?.graphHealth?.score, 0.75);
  let bear = 0.25 - pressure * 0.12 + (1 - graphHealth) * 0.12;
  let bull = 0.25 + pressure * 0.1;
  let base = 1 - bear - bull;
  bear = clamp(bear, 0.12, 0.55);
  bull = clamp(bull, 0.1, 0.5);
  base = clamp(base, 0.25, 0.68);
  const total = bear + base + bull;
  return { bear: bear / total, base: base / total, bull: bull / total };
}

function valueScenario(scenario, drivers = {}) {
  const revenue = numeric(drivers.revenue, 100);
  const price = numeric(drivers.price, null);
  const taxRate = clamp(numeric(drivers.taxRate, DEFAULT_TAX_RATE), 0, 0.45);
  const effectiveTerminalGrowth = Math.min(scenario.terminalGrowth, scenario.wacc - 0.025);
  const horizon = 5;
  let presentValue = 0;
  let yearRevenue = revenue;
  const yearly = [];
  for (let year = 1; year <= horizon; year += 1) {
    yearRevenue *= 1 + scenario.growth;
    const nopat = yearRevenue * scenario.margin * (1 - taxRate);
    const reinvestmentAmount = Math.max(0, nopat * scenario.reinvestment);
    const fcff = nopat - reinvestmentAmount;
    const discount = Math.pow(1 + scenario.wacc, year);
    presentValue += fcff / discount;
    yearly.push({ year, revenue: yearRevenue, nopat, reinvestment: reinvestmentAmount, fcff });
  }
  const terminalFcf = yearly[yearly.length - 1].fcff * (1 + effectiveTerminalGrowth);
  const terminalDenominator = Math.max(0.025, scenario.wacc - effectiveTerminalGrowth);
  const terminalValue = terminalFcf / terminalDenominator;
  const fairValue = presentValue + terminalValue / Math.pow(1 + scenario.wacc, horizon);
  return {
    ...scenario,
    effectiveTerminalGrowth,
    yearly,
    fairValue,
    expectedReturn: isFiniteNumber(price) && price > 0 ? fairValue / price - 1 : null,
  };
}

function uncertaintyDecomposition(posterior, drivers = {}, driverGraph = null) {
  const aleatoric =
    (posterior.growth.sd / 0.18 +
      posterior.margin.sd / 0.18 +
      posterior.roic.sd / 0.2 +
      posterior.reinvestment.sd / 0.35 +
      posterior.wacc.sd / 0.08) /
    5;
  const dataQuality = clamp(numeric(drivers.dataQuality, 0.55), 0, 1);
  const modelRisk = clamp(numeric(drivers.modelRisk, 0.4), 0, 1);
  const graphPenalty = 1 - clamp(numeric(driverGraph?.graphHealth?.score, 0.75), 0, 1);
  const epistemic = clamp((1 - dataQuality) * 0.45 + modelRisk * 0.35 + graphPenalty * 0.2, 0, 1);
  return {
    aleatoric: clamp(aleatoric, 0, 1),
    epistemic,
    total: clamp(aleatoric * 0.55 + epistemic * 0.45, 0, 1),
    decomposition: "Var(V) = E[Var(V|theta)] + Var(E[V|theta])",
  };
}

function posteriorPredictiveChecks(posterior, driverGraph = null) {
  const checks = [];
  if (posterior.growth.p90 > 0.18 && posterior.reinvestment.p10 < 0.08) {
    checks.push({ key: "growth_without_reinvestment_tail", severity: 0.72, message: "Bullish growth tail still permits too little reinvestment." });
  }
  if (posterior.terminalGrowth.p90 >= posterior.wacc.p10 - 0.015) {
    checks.push({ key: "terminal_growth_discount_gap", severity: 0.78, message: "Terminal growth tail approaches the lower WACC tail." });
  }
  if ((driverGraph?.graphHealth?.hardViolationCount || 0) > 0) {
    checks.push({ key: "driver_graph_violations", severity: 0.7, message: "Driver graph violations widen posterior uncertainty." });
  }
  return checks;
}

export function buildAuroraBayesianForecastEngine(input = {}, options = {}) {
  const compiled = getCompiled(input);
  const drivers = getDrivers(input, compiled);
  const accounting = getAccounting(input, compiled);
  const evidence = getEvidence(input, compiled);
  const equilibrium = getEquilibrium(input);
  const driverGraph = getDriverGraph(input);
  const sector = sectorText(input, drivers);
  const archetype = archetypeFrom(input, sector);
  const priorStack = buildPriorStack({ drivers, accounting, evidence, equilibrium, sector, archetype });
  const rawPosterior = posteriorFromStack(priorStack);
  const posterior = applyDependenceAdjustments(rawPosterior, { equilibrium, driverGraph });
  const probabilities = scenarioProbabilities(posterior, equilibrium, driverGraph);
  const scenarios = [
    valueScenario(scenarioFromPosterior("bear", posterior, probabilities.bear), drivers),
    valueScenario(scenarioFromPosterior("base", posterior, probabilities.base), drivers),
    valueScenario(scenarioFromPosterior("bull", posterior, probabilities.bull), drivers),
  ];
  const expectedFairValue = scenarios.reduce((sum, scenario) => sum + scenario.fairValue * scenario.probability, 0);
  const price = numeric(drivers.price, null);
  const expectedReturn = isFiniteNumber(price) && price > 0 ? expectedFairValue / price - 1 : null;
  const uncertainty = uncertaintyDecomposition(posterior, drivers, driverGraph);
  const checks = posteriorPredictiveChecks(posterior, driverGraph);

  return {
    version: "aurora_bayesian_forecast_engine_v1",
    ticker: drivers.ticker || compiled?.ticker || null,
    name: drivers.name || compiled?.name || null,
    builtAt: options.builtAt || new Date().toISOString(),
    archetype,
    priorStack,
    posterior,
    scenarios,
    expectedFairValue,
    expectedReturn,
    uncertainty,
    posteriorPredictiveChecks: checks,
    decision:
      uncertainty.epistemic > 0.68 || checks.some((check) => check.severity >= 0.75)
        ? "forecast_requires_review"
        : uncertainty.total > 0.55
          ? "wide_distribution_use_caution"
          : "forecast_distribution_usable",
    memo: {
      headline: "Bayesian engine converted priors, company evidence and dependencies into a posterior forecast distribution.",
      expectedReturn,
      uncertainty: uncertainty.total,
      topCheck: checks[0]?.message || null,
    },
  };
}
