const DEFAULT_TAX_RATE = 0.22;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numberOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

function safeDivide(numerator, denominator, fallback = 0) {
  return isFiniteNumber(numerator) && isFiniteNumber(denominator) && Math.abs(denominator) > 1e-9
    ? numerator / denominator
    : fallback;
}

function normalCdfApprox(z) {
  const x = clamp(z, -8, 8);
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function distribution(mean, spread, min = -Infinity, max = Infinity) {
  const center = clamp(mean, min, max);
  const width = Math.max(Math.abs(spread), 1e-6);
  return {
    mean: center,
    p10: clamp(center - width * 1.28, min, max),
    p50: center,
    p90: clamp(center + width * 1.28, min, max),
    spread: width,
  };
}

function formatPct(value, digits = 1) {
  return isFiniteNumber(value) ? `${(value * 100).toFixed(digits)}%` : "n/a";
}

function inferFcf(drivers) {
  if (isFiniteNumber(drivers.baseFcf) && drivers.baseFcf > 0) return drivers.baseFcf;
  const revenue = numberOr(drivers.revenue, null);
  if (!isFiniteNumber(revenue) || revenue <= 0) return null;
  const margin = clamp(numberOr(drivers.margin, 0.12), -0.2, 0.65);
  const taxRate = clamp(numberOr(drivers.taxRate, DEFAULT_TAX_RATE), 0, 0.45);
  const reinvestment = clamp(numberOr(drivers.reinvestment, 0.42), 0.02, 0.95);
  return Math.max(0, revenue * margin * (1 - taxRate) * (1 - reinvestment * 0.35));
}

function estimateStatusFromScore(score, high = 0.08, medium = 0.025) {
  if (score >= high) return "market_underprices_feasible_future";
  if (score <= -high) return "market_requires_heroic_future";
  if (Math.abs(score) <= medium) return "beliefs_roughly_balanced";
  return score > 0 ? "market_slightly_underprices_future" : "market_slightly_overdemands_future";
}

function buildImpliedBeliefs(drivers) {
  const price = numberOr(drivers.price, null);
  const fcf = inferFcf(drivers);
  const revenue = numberOr(drivers.revenue, null);
  const currentGrowth = clamp(numberOr(drivers.revenueCagr, 0.04), -0.2, 0.35);
  const currentMargin = clamp(numberOr(drivers.margin, 0.14), -0.25, 0.65);
  const currentRoic = clamp(numberOr(drivers.roic, 0.1), -0.25, 0.75);
  const reinvestment = clamp(numberOr(drivers.reinvestment, 0.42), 0.01, 0.95);
  const wacc = clamp(numberOr(drivers.wacc, 0.095), 0.04, 0.22);
  const terminalGrowth = clamp(numberOr(drivers.terminalGrowth, 0.025), -0.02, 0.06);
  const discountGap = Math.max(0.02, wacc - terminalGrowth);
  const fallbackFcf = isFiniteNumber(revenue) && revenue > 0 ? revenue * Math.max(0.02, currentMargin) * 0.58 : null;
  const normalizedFcf = fcf || fallbackFcf || (isFiniteNumber(price) ? price * 0.045 : 4.5);
  const baseValue = normalizedFcf * (1 + currentGrowth) * (1 - reinvestment * 0.16) / discountGap;
  const pricePressure = isFiniteNumber(price) && price > 0 && baseValue > 0 ? Math.log(price / baseValue) : 0;
  const positivePressure = Math.max(0, pricePressure);
  const negativePressure = Math.max(0, -pricePressure);
  const impliedGrowth = clamp(currentGrowth + pricePressure * 0.055, -0.18, 0.4);
  const impliedMargin = clamp(currentMargin + positivePressure * 0.055 - negativePressure * 0.018, -0.2, 0.72);
  const impliedRoic = clamp(currentRoic + positivePressure * 0.06 - negativePressure * 0.02, -0.2, 0.8);
  const impliedReinvestment = clamp(reinvestment + positivePressure * 0.065, 0.01, 0.98);
  const impliedTerminalGrowth = clamp(terminalGrowth + pricePressure * 0.006, -0.02, 0.07);
  const impliedFcfMargin = isFiniteNumber(revenue) && revenue > 0 ? clamp(normalizedFcf / revenue + pricePressure * 0.025, -0.15, 0.55) : clamp(currentMargin * 0.55 + pricePressure * 0.025, -0.15, 0.55);
  const uncertainty = clamp(0.035 + Math.abs(pricePressure) * 0.035 + numberOr(drivers.modelRisk, 0.35) * 0.045, 0.025, 0.18);

  return {
    pricePressure,
    baseValue,
    impliedFcfYield: isFiniteNumber(price) && price > 0 ? normalizedFcf / price : null,
    revenueCagr5y: distribution(impliedGrowth, uncertainty, -0.3, 0.5),
    terminalMargin: distribution(impliedMargin, uncertainty * 1.15, -0.3, 0.8),
    roicPath: distribution(impliedRoic, uncertainty * 1.25, -0.3, 0.9),
    reinvestmentRate: distribution(impliedReinvestment, uncertainty * 1.1, 0, 1),
    fcfMargin: distribution(impliedFcfMargin, uncertainty * 0.9, -0.25, 0.65),
    terminalGrowth: distribution(impliedTerminalGrowth, uncertainty * 0.35, -0.03, 0.08),
    dilution: distribution(clamp(numberOr(drivers.dilution, 0.01) + positivePressure * 0.008, -0.08, 0.15), 0.025, -0.15, 0.2),
  };
}

function buildBusinessPhysicsBeliefs(drivers) {
  const dataQuality = clamp(numberOr(drivers.dataQuality, 0.55), 0, 1);
  const modelRisk = clamp(numberOr(drivers.modelRisk, 0.35), 0, 1);
  const evidenceSpread = clamp(0.035 + modelRisk * 0.08 + (1 - dataQuality) * 0.05, 0.025, 0.22);
  const currentGrowth = clamp(numberOr(drivers.revenueCagr, 0.04), -0.22, 0.35);
  const currentMargin = clamp(numberOr(drivers.margin, 0.14), -0.25, 0.65);
  const currentRoic = clamp(numberOr(drivers.roic, 0.1), -0.25, 0.75);
  const wacc = clamp(numberOr(drivers.wacc, 0.095), 0.04, 0.22);
  const reinvestment = clamp(numberOr(drivers.reinvestment, 0.42), 0.01, 0.95);
  const thesisQuality = clamp(numberOr(drivers.thesisQuality, 0.5), 0, 1);
  const demandSupply = clamp(numberOr(drivers.demandSupply, 0.5), 0, 1);
  const bottleneckPower = clamp(numberOr(drivers.bottleneckPower, 0.4), 0, 1);
  const growthMean = clamp(currentGrowth * 0.74 + (demandSupply - 0.5) * 0.045 + bottleneckPower * 0.025, -0.2, 0.32);
  const marginMean = clamp(currentMargin + (thesisQuality - 0.5) * 0.045 + bottleneckPower * 0.025 - modelRisk * 0.012, -0.25, 0.7);
  const roicMean = clamp(currentRoic * 0.84 + Math.max(0, currentRoic - wacc) * 0.16 + bottleneckPower * 0.025 - modelRisk * 0.015, -0.25, 0.78);
  const reinvestmentMean = clamp(reinvestment + Math.max(0, growthMean) * 0.38 - Math.max(0, currentRoic - wacc) * 0.12, 0.01, 0.95);
  const fcfMarginMean = clamp(marginMean * (0.52 + Math.max(0, currentRoic - wacc) * 0.45) - reinvestmentMean * 0.045, -0.22, 0.58);

  return {
    historicalBaseRate: {
      revenueCagr5y: distribution(growthMean, evidenceSpread, -0.3, 0.5),
      terminalMargin: distribution(marginMean, evidenceSpread * 1.05, -0.3, 0.8),
      roicPath: distribution(roicMean, evidenceSpread * 1.25, -0.3, 0.9),
      reinvestmentRate: distribution(reinvestmentMean, evidenceSpread * 1.2, 0, 1),
      fcfMargin: distribution(fcfMarginMean, evidenceSpread, -0.3, 0.7),
    },
    evidenceAdjusted: {
      revenueCagr5y: distribution(growthMean + (thesisQuality - 0.5) * 0.025, evidenceSpread * 0.95, -0.3, 0.5),
      terminalMargin: distribution(marginMean + bottleneckPower * 0.018, evidenceSpread, -0.3, 0.8),
      roicPath: distribution(roicMean + thesisQuality * 0.018, evidenceSpread * 1.1, -0.3, 0.9),
      reinvestmentRate: distribution(reinvestmentMean, evidenceSpread * 1.15, 0, 1),
      fcfMargin: distribution(fcfMarginMean + (dataQuality - 0.5) * 0.015, evidenceSpread * 0.95, -0.3, 0.7),
    },
    evidenceQuality: dataQuality,
    modelRisk,
  };
}

function metricGap(market, feasible, direction = "higher_is_better") {
  const gap = feasible.mean - market.mean;
  const pooledSpread = Math.sqrt((market.spread || 0.001) ** 2 + (feasible.spread || 0.001) ** 2);
  const z = safeDivide(market.mean - feasible.mean, pooledSpread, 0);
  const burden = direction === "lower_is_better" ? normalCdfApprox(-z) : normalCdfApprox(z);
  return {
    market: market.mean,
    feasible: feasible.mean,
    gap,
    z,
    burden: clamp(burden, 0, 1),
  };
}

function buildBeliefGap(market, physics) {
  const feasible = physics.evidenceAdjusted;
  return {
    growth: metricGap(market.revenueCagr5y, feasible.revenueCagr5y),
    margin: metricGap(market.terminalMargin, feasible.terminalMargin),
    roic: metricGap(market.roicPath, feasible.roicPath),
    reinvestment: metricGap(market.reinvestmentRate, feasible.reinvestmentRate, "lower_is_better"),
    fcfMargin: metricGap(market.fcfMargin, feasible.fcfMargin),
  };
}

function weightedGapScore(gaps) {
  const weights = { growth: 0.26, margin: 0.24, roic: 0.24, reinvestment: 0.12, fcfMargin: 0.14 };
  return Object.entries(weights).reduce((sum, [key, weight]) => {
    const item = gaps[key];
    if (!item) return sum;
    const signed = key === "reinvestment" ? -item.gap : item.gap;
    return sum + signed * weight;
  }, 0);
}

function buildAssumptionBurden(gaps, evidenceQuality) {
  const weights = { growth: 0.28, margin: 0.24, roic: 0.24, reinvestment: 0.1, fcfMargin: 0.14 };
  const evidenceWeakness = 1 - clamp(evidenceQuality, 0, 1);
  const components = Object.entries(weights).map(([key, importance]) => {
    const item = gaps[key];
    const burden = item?.burden ?? 0.5;
    return {
      key,
      burden,
      importance,
      evidenceWeakness,
      contribution: burden * importance * (0.55 + evidenceWeakness * 0.45),
    };
  });
  const score = components.reduce((sum, item) => sum + item.contribution, 0);
  return {
    score: clamp(score, 0, 1),
    level: score >= 0.66 ? "high" : score >= 0.42 ? "medium" : "low",
    components: components.sort((a, b) => b.contribution - a.contribution),
  };
}

function herfindahl(values) {
  const positives = values.map((value) => Math.max(0, Number(value) || 0));
  const total = positives.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;
  return positives.reduce((sum, value) => sum + (value / total) ** 2, 0);
}

function buildFalsifiers(gaps, drivers) {
  const currentMargin = clamp(numberOr(drivers.margin, gaps.margin?.feasible ?? 0.12), -0.25, 0.65);
  const currentRoic = clamp(numberOr(drivers.roic, gaps.roic?.feasible ?? 0.1), -0.25, 0.75);
  const currentGrowth = clamp(numberOr(drivers.revenueCagr, gaps.growth?.feasible ?? 0.03), -0.2, 0.35);
  const wacc = clamp(numberOr(drivers.wacc, 0.095), 0.04, 0.22);
  const items = [
    {
      key: "growth_hurdle",
      variable: "revenue_growth",
      threshold: Math.min(gaps.growth.market - 0.025, currentGrowth - 0.015),
      horizon: "2 reporting periods",
      text: `Revenue growth below ${formatPct(Math.min(gaps.growth.market - 0.025, currentGrowth - 0.015))} for two periods weakens the priced growth belief.`,
      sourceNeeded: "revenue bridge, backlog, segment growth",
    },
    {
      key: "margin_hurdle",
      variable: "operating_margin",
      threshold: Math.max(currentMargin - 0.025, gaps.margin.market - 0.035),
      horizon: "6 quarters",
      text: `Operating margin fails to approach ${formatPct(Math.max(currentMargin - 0.025, gaps.margin.market - 0.035))} within 6 quarters.`,
      sourceNeeded: "income statement, segment margin, price/mix disclosures",
    },
    {
      key: "roic_hurdle",
      variable: "roic",
      threshold: Math.max(wacc, Math.min(currentRoic - 0.025, gaps.roic.market - 0.04)),
      horizon: "2 fiscal years",
      text: `ROIC remains below ${formatPct(Math.max(wacc, Math.min(currentRoic - 0.025, gaps.roic.market - 0.04)))} for two fiscal years.`,
      sourceNeeded: "NOPAT, invested capital, acquisition adjustments",
    },
    {
      key: "reinvestment_burden",
      variable: "reinvestment_rate",
      threshold: Math.min(0.9, gaps.reinvestment.market + 0.05),
      horizon: "annual filing",
      text: `Reinvestment need exceeds ${formatPct(Math.min(0.9, gaps.reinvestment.market + 0.05))} without enough growth payoff.`,
      sourceNeeded: "capex, working capital, capitalized R&D, acquisitions",
    },
  ];
  return items;
}

function inferThesisHalfLife(drivers, burden) {
  const sector = String(drivers.sector || drivers.name || "").toLowerCase();
  let months = 9;
  if (/commodity|energy|shipping|airline|housing|auto|semiconductor/.test(sector)) months = 4;
  if (/bank|insurance|utility|regulated/.test(sector)) months = 6;
  if (/software|consumer|health|medical/.test(sector)) months = 9;
  if (burden.level === "high") months = Math.max(3, months - 2);
  if (clamp(numberOr(drivers.thesisQuality, 0.5), 0, 1) > 0.75) months += 2;
  return {
    months,
    nextEvidenceEvents: ["next earnings release", "updated guidance or backlog", "cash-flow and reinvestment bridge"],
    expiresUnless: `Refresh the belief object within ${months} months or after the next material filing.`,
  };
}

function buildLensLegitimacy(drivers, gaps) {
  const sector = String(drivers.sector || drivers.name || "").toLowerCase();
  const roic = numberOr(drivers.roic, null);
  const margin = numberOr(drivers.margin, null);
  const baseFcf = inferFcf(drivers);
  const reinvestment = clamp(numberOr(drivers.reinvestment, 0.42), 0.01, 0.95);
  const assetHeavy = /energy|materials|utility|industrial|shipping|rail|commodity|mining/.test(sector);
  const financial = /bank|insurance|financial|broker|credit/.test(sector);
  const platform = /software|platform|marketplace|network|payments/.test(sector);
  const bottleneck = /semiconductor|aerospace|equipment|scarce|capacity/.test(sector) || clamp(numberOr(drivers.bottleneckPower, 0.4), 0, 1) > 0.7;

  const lenses = [
    {
      key: "reverseDcf",
      legitimacy: 0.86,
      reason: "Always useful as price-as-question spine.",
    },
    {
      key: "roicFade",
      legitimacy: clamp((isFiniteNumber(roic) ? 0.36 : 0.08) + Math.max(0, roic - numberOr(drivers.wacc, 0.095)) * 2.1 + (financial ? -0.18 : 0), 0, 1),
      reason: "Valid when excess ROIC and reinvestment runway are measurable.",
    },
    {
      key: "dcf",
      legitimacy: clamp((baseFcf ? 0.42 : 0.12) + (Math.abs(gaps.growth.gap) < 0.07 ? 0.18 : 0) + (financial ? -0.18 : 0), 0, 1),
      reason: "Valid when normalized FCF and discount assumptions are not doing all the work.",
    },
    {
      key: "assetValue",
      legitimacy: clamp((assetHeavy ? 0.45 : 0.12) + reinvestment * 0.25 + (margin < 0.08 ? 0.12 : 0), 0, 1),
      reason: "Valid when tangible/replacement assets can anchor downside or recovery value.",
    },
    {
      key: "residualIncome",
      legitimacy: clamp((financial ? 0.62 : 0.18) + (isFiniteNumber(roic) ? 0.12 : 0), 0, 1),
      reason: "Valid when book capital is economically meaningful.",
    },
    {
      key: "unitEconomics",
      legitimacy: clamp((platform ? 0.45 : 0.14) + Math.max(0, numberOr(drivers.revenueCagr, 0.04)) * 1.6, 0, 1),
      reason: "Valid when marginal customer economics drive enterprise value.",
    },
    {
      key: "bottleneck",
      legitimacy: clamp((bottleneck ? 0.55 : 0.1) + clamp(numberOr(drivers.bottleneckPower, 0.4), 0, 1) * 0.35, 0, 1),
      reason: "Valid when scarce capacity or switching costs can sustain pricing power.",
    },
    {
      key: "capitalCycle",
      legitimacy: clamp((assetHeavy || /semiconductor|industrial/.test(sector) ? 0.42 : 0.12) + reinvestment * 0.2, 0, 1),
      reason: "Valid when supply response and utilization drive future margins.",
    },
  ];
  return lenses.sort((a, b) => b.legitimacy - a.legitimacy);
}

function buildMonitoringPlan(falsifiers, halfLife) {
  return {
    thesisHalfLifeMonths: halfLife.months,
    nextCheck: halfLife.expiresUnless,
    watchlist: falsifiers.map((item) => ({
      variable: item.variable,
      threshold: item.threshold,
      horizon: item.horizon,
      evidence: item.sourceNeeded,
    })),
  };
}

export function buildAuroraPricedBeliefObject(drivers = {}, snapshot = {}, options = {}) {
  const market = buildImpliedBeliefs(drivers);
  const physics = buildBusinessPhysicsBeliefs(drivers);
  const gaps = buildBeliefGap(market, physics);
  const signedOpportunityScore = weightedGapScore(gaps);
  const beliefDistortionIndex = clamp(Math.abs(signedOpportunityScore) * 520, 0, 100);
  const status = estimateStatusFromScore(signedOpportunityScore);
  const burden = buildAssumptionBurden(gaps, physics.evidenceQuality);
  const falsifiers = buildFalsifiers(gaps, drivers);
  const halfLife = inferThesisHalfLife(drivers, burden);
  const evidenceDebt = clamp(burden.components.filter((item) => item.burden > 0.65).length / burden.components.length, 0, 1);
  const valueDriverConcentration = herfindahl(burden.components.map((item) => item.contribution));
  const falsifiabilityYield = clamp((burden.score + evidenceDebt * 0.45) / Math.max(1, halfLife.months), 0, 1);
  const lensLegitimacy = buildLensLegitimacy(drivers, gaps);
  const abstain = beliefDistortionIndex < 4 || evidenceDebt > 0.72 || clamp(numberOr(drivers.dataQuality, 0.55), 0, 1) < 0.28;

  return {
    version: "aurora_priced_belief_object_v1",
    ticker: drivers.ticker || snapshot?.ticker || snapshot?.company?.ticker || null,
    name: drivers.name || snapshot?.company?.name || null,
    date: options.asOfDate || snapshot?.asOfDate || new Date().toISOString().slice(0, 10),
    price: isFiniteNumber(drivers.price) ? drivers.price : null,
    marketImpliedBeliefs: market,
    businessPhysicsBeliefs: physics,
    beliefGap: gaps,
    beliefDistortionIndex,
    signedOpportunityScore,
    status,
    assumptionBurdenOfProof: burden,
    lensLegitimacy,
    falsifiers,
    thesisHalfLife: halfLife,
    falsifiabilityYield,
    valueDriverConcentration,
    evidenceDebt,
    abstain,
    monitoringPlan: buildMonitoringPlan(falsifiers, halfLife),
    memo: {
      headline: `At this price, the market belief looks ${status.replaceAll("_", " ")}.`,
      marketBelieves: [
        `Revenue CAGR near ${formatPct(market.revenueCagr5y.mean)}.`,
        `Terminal margin near ${formatPct(market.terminalMargin.mean)}.`,
        `ROIC path near ${formatPct(market.roicPath.mean)}.`,
        `Reinvestment rate near ${formatPct(market.reinvestmentRate.mean)}.`,
      ],
      auroraJudgment: [
        `Belief Distortion Index: ${beliefDistortionIndex.toFixed(1)}/100.`,
        `Assumption burden: ${burden.level}.`,
        `Top valid lens: ${lensLegitimacy[0]?.key || "unknown"}.`,
        abstain ? "Use as memo-only until evidence debt is lower." : "Usable as a priced-belief memo candidate.",
      ],
      mainFalsifier: falsifiers[0]?.text || null,
    },
  };
}

export { buildBeliefGap, buildBusinessPhysicsBeliefs, buildImpliedBeliefs };
