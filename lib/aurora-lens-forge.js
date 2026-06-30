function clamp(value, min, max) {
  if (!Number.isFinite(Number(value))) return min;
  return Math.min(Math.max(Number(value), min), max);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function safe(value, fallback) {
  return isFiniteNumber(value) ? value : fallback;
}

function fairValueToReturn(fairValue, price, years = 3) {
  if (!isFiniteNumber(fairValue) || !isFiniteNumber(price) || price <= 0 || fairValue <= 0) return null;
  return Math.pow(fairValue / price, 1 / years) - 1;
}

function distribution(base, fragility) {
  const spread = clamp(fragility, 0.08, 0.55);
  return {
    fairValueBase: base,
    fairValueP10: isFiniteNumber(base) ? base * (1 - spread) : null,
    fairValueP90: isFiniteNumber(base) ? base * (1 + spread * 1.25) : null,
  };
}

function lens({ key, label, base, price, confidence, fragility, assumptions, falsifiers }) {
  const range = distribution(base, fragility);
  return {
    key,
    label,
    ...range,
    expectedReturn3y: fairValueToReturn(range.fairValueBase, price, 3),
    downsideProbability: isFiniteNumber(price) && isFiniteNumber(range.fairValueP10) ? clamp(0.5 + (price - range.fairValueBase) / Math.max(price, 1), 0.05, 0.95) : null,
    upsideProbability: isFiniteNumber(price) && isFiniteNumber(range.fairValueP90) ? clamp(0.5 + (range.fairValueBase - price) / Math.max(price, 1), 0.05, 0.95) : null,
    confidence: clamp(confidence, 0.05, 0.95),
    fragility: clamp(fragility, 0.05, 0.95),
    assumptions: assumptions.filter(Boolean),
    falsifiers: falsifiers.filter(Boolean),
  };
}

export function buildAuroraLensForge(drivers = {}, routerPrior = {}) {
  const price = safe(drivers.price, null);
  const baseFcf = safe(drivers.baseFcf, null);
  const wacc = clamp(safe(drivers.wacc, 0.095), 0.045, 0.18);
  const terminalGrowth = clamp(safe(drivers.terminalGrowth, 0.025), -0.01, 0.045);
  const growth = clamp(safe(drivers.revenueCagr, 0.04), -0.08, 0.28);
  const margin = clamp(safe(drivers.margin, 0.16), -0.12, 0.55);
  const roic = clamp(safe(drivers.roic, wacc + 0.02), -0.08, 0.55);
  const terminalRoic = clamp(safe(drivers.terminalRoic, Math.max(wacc, roic * 0.72)), 0.03, 0.45);
  const reinvestment = clamp(safe(drivers.reinvestment, 0.42), 0.02, 0.9);
  const thesis = clamp(safe(drivers.thesisQuality, 0.5), 0, 1);
  const demand = clamp(safe(drivers.demandSupply, 0.5), 0, 1);
  const bottleneckPower = clamp(safe(drivers.bottleneckPower, 0.4), 0, 1);
  const modelRisk = clamp(safe(drivers.modelRisk, 0.35), 0, 1);
  const dataQuality = clamp(safe(drivers.dataQuality, 0.5), 0, 1);
  const roicSpread = roic - wacc;
  const discountGap = Math.max(0.025, wacc - terminalGrowth);
  const fcf = isFiniteNumber(baseFcf) && baseFcf > 0 ? baseFcf : null;
  const fallbackBase = isFiniteNumber(price) ? price : 100;
  const dcfBase = fcf ? (fcf * (1 + growth) * (1 - reinvestment * 0.18)) / discountGap : fallbackBase;
  const marketAnchor = isFiniteNumber(price) ? price : dcfBase;
  const qualityMultiple = clamp(0.84 + Math.max(0, roicSpread) * 2.6 + thesis * 0.22, 0.65, 1.45);
  const capitalCycleSignal = clamp(0.92 + demand * 0.16 - reinvestment * 0.18 + bottleneckPower * 0.14, 0.65, 1.35);

  const outputs = [
    lens({
      key: "dcf",
      label: "DCF",
      base: dcfBase,
      price,
      confidence: dataQuality * 0.55 + (fcf ? 0.25 : 0.05) + (1 - modelRisk) * 0.2,
      fragility: 0.18 + modelRisk * 0.2 + Math.abs(growth) * 0.5,
      assumptions: ["FCF normalization", "reinvestment fade", "WACC and terminal growth"],
      falsifiers: ["FCF conversion weakens", "terminal growth exceeds reinvestment capacity", "discount rate source is stale"],
    }),
    lens({
      key: "roicFade",
      label: "ROIC fade",
      base: dcfBase * qualityMultiple,
      price,
      confidence: clamp(0.25 + Math.max(0, roicSpread) * 2.1 + thesis * 0.35 + dataQuality * 0.2, 0.05, 0.95),
      fragility: 0.16 + Math.max(0, terminalRoic - roic) * 0.8 + modelRisk * 0.16,
      assumptions: ["Excess ROIC persistence", "incremental capital earns above WACC", "moat half-life is measurable"],
      falsifiers: ["incremental ROIC falls below WACC", "gross margin compression", "reinvestment runway shortens"],
    }),
    lens({
      key: "reverseDcf",
      label: "Reverse DCF",
      base: marketAnchor,
      price,
      confidence: 0.52 + dataQuality * 0.2,
      fragility: 0.12 + modelRisk * 0.12,
      assumptions: ["Current market price embeds the expectation set", "useful as feasibility check"],
      falsifiers: ["market price is distorted by temporary flows", "expectations cannot be mapped to fundamentals"],
    }),
    lens({
      key: "residualIncome",
      label: "Residual income",
      base: dcfBase * clamp(0.72 + Math.max(0, roicSpread) * 2.2 + margin * 0.45, 0.55, 1.35),
      price,
      confidence: clamp(0.18 + dataQuality * 0.22 + Math.max(0, roicSpread) * 1.2, 0.05, 0.82),
      fragility: 0.2 + modelRisk * 0.18,
      assumptions: ["book capital is economically meaningful", "ROE/COE spread can be normalized"],
      falsifiers: ["book value is not economically comparable", "one-offs dominate earnings"],
    }),
    lens({
      key: "assetValue",
      label: "Asset value",
      base: dcfBase * clamp(0.72 + (0.45 - margin) * 0.25 + reinvestment * 0.32, 0.55, 1.2),
      price,
      confidence: clamp(0.22 + reinvestment * 0.25 + (routerPrior.regimes?.assetHeavy || 0) * 0.55, 0.05, 0.9),
      fragility: 0.19 + modelRisk * 0.18,
      assumptions: ["assets or replacement cost anchor downside", "current earnings may understate value"],
      falsifiers: ["asset base is impaired", "replacement cost is falling", "liabilities consume recovery value"],
    }),
    lens({
      key: "unitEconomics",
      label: "Unit economics",
      base: dcfBase * clamp(0.78 + growth * 1.25 + thesis * 0.16 + demand * 0.12, 0.6, 1.55),
      price,
      confidence: clamp(0.18 + Math.max(0, growth) * 1.6 + thesis * 0.28 + dataQuality * 0.14, 0.05, 0.9),
      fragility: 0.24 + modelRisk * 0.22 + Math.max(0, growth - 0.12) * 0.8,
      assumptions: ["marginal customer economics are attractive", "scale improves contribution margin"],
      falsifiers: ["payback period lengthens", "cohort retention weakens", "growth requires uneconomic incentives"],
    }),
    lens({
      key: "bottleneck",
      label: "Bottleneck power",
      base: dcfBase * clamp(0.82 + bottleneckPower * 0.32 + demand * 0.16 + Math.max(0, roicSpread) * 0.9, 0.7, 1.55),
      price,
      confidence: clamp(0.16 + bottleneckPower * 0.45 + demand * 0.22 + dataQuality * 0.12, 0.05, 0.95),
      fragility: 0.18 + (1 - bottleneckPower) * 0.22 + modelRisk * 0.12,
      assumptions: ["scarce capacity is monetizable", "pricing power survives supply response"],
      falsifiers: ["competitor supply enters without pricing response", "backlog normalizes", "customers dual-source faster than expected"],
    }),
    lens({
      key: "realOptions",
      label: "Real options",
      base: dcfBase * clamp(0.72 + growth * 1.05 + thesis * 0.2 + modelRisk * 0.12, 0.58, 1.45),
      price,
      confidence: clamp(0.14 + Math.max(0, growth) * 1.2 + thesis * 0.25, 0.05, 0.8),
      fragility: 0.3 + modelRisk * 0.28,
      assumptions: ["future optionality is economically exercisable", "platform/R&D creates convex payoff"],
      falsifiers: ["new-market adoption stalls", "R&D fails to commercialize", "option value is already overcapitalized"],
    }),
    lens({
      key: "ownerEarnings",
      label: "Owner earnings",
      base: dcfBase * clamp(0.86 + margin * 0.34 + Math.max(0, 0.55 - reinvestment) * 0.18 - modelRisk * 0.12, 0.66, 1.32),
      price,
      confidence: clamp(0.2 + dataQuality * 0.25 + margin * 0.35 + (1 - modelRisk) * 0.18, 0.05, 0.88),
      fragility: 0.14 + modelRisk * 0.18,
      assumptions: ["reported cash flow approximates owner cash", "maintenance capex can be separated from growth capex"],
      falsifiers: ["working capital absorbs cash", "maintenance capex is understated", "capital allocation destroys value"],
    }),
    lens({
      key: "capitalCycle",
      label: "Capital cycle",
      base: dcfBase * capitalCycleSignal,
      price,
      confidence: clamp(0.16 + (routerPrior.regimes?.cyclical || 0) * 0.28 + (routerPrior.regimes?.assetHeavy || 0) * 0.32 + demand * 0.16, 0.05, 0.84),
      fragility: 0.22 + reinvestment * 0.2 + modelRisk * 0.14,
      assumptions: ["industry supply response drives future margins", "capacity additions are visible enough to underwrite"],
      falsifiers: ["new supply arrives faster than expected", "demand shock overwhelms supply discipline", "cycle position is misread"],
    }),
  ];

  const values = outputs.map((item) => item.fairValueBase).filter(isFiniteNumber);
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const dispersion =
    values.length && isFiniteNumber(mean) && Math.abs(mean) > 1e-9
      ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) / Math.abs(mean)
      : null;

  return {
    version: "aurora_lens_forge_v1",
    outputs,
    dispersion,
    dominantDisagreements: outputs
      .slice()
      .sort((a, b) => (b.fragility || 0) - (a.fragility || 0))
      .slice(0, 3)
      .map((item) => ({ key: item.key, label: item.label, fragility: item.fragility, falsifier: item.falsifiers[0] || null })),
  };
}
