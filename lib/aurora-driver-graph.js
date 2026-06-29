const CORE_NODE_LABELS = {
  market_price: "Market price",
  revenue_growth: "Revenue growth",
  reinvestment_rate: "Reinvestment rate",
  roiic: "ROIIC",
  roic: "ROIC",
  wacc: "WACC",
  roic_spread: "ROIC spread",
  moat_half_life: "Moat half-life",
  pricing_power: "Pricing power",
  demand_visibility: "Demand visibility",
  capacity_constraint: "Capacity constraint",
  operating_margin: "Operating margin",
  free_cash_flow: "Free cash flow",
  value: "Business value",
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numeric(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return min;
  return Math.min(Math.max(numericValue, min), max);
}

function firstAvailable(...values) {
  for (const value of values) {
    if (value != null) return value;
  }
  return null;
}

function distribution(mean, spread, min = -Infinity, max = Infinity) {
  if (!isFiniteNumber(mean)) return null;
  const width = Math.max(Math.abs(spread || 0), 1e-6);
  return {
    mean: clamp(mean, min, max),
    p10: clamp(mean - width * 1.28, min, max),
    p50: clamp(mean, min, max),
    p90: clamp(mean + width * 1.28, min, max),
    spread: width,
  };
}

function getCompiled(input = {}) {
  if (input?.version === "aurora_belief_compiler_v1") return input;
  if (input?.compiled?.version === "aurora_belief_compiler_v1") return input.compiled;
  return null;
}

function getBeliefObject(input = {}, compiled = null) {
  if (input?.version === "aurora_priced_belief_object_v1") return input;
  if (input?.beliefObject?.version === "aurora_priced_belief_object_v1") return input.beliefObject;
  if (compiled?.beliefObject?.version === "aurora_priced_belief_object_v1") return compiled.beliefObject;
  return null;
}

function getDrivers(input = {}, compiled = null) {
  return compiled?.drivers || input?.drivers || input?.compiled?.drivers || {};
}

function getEvidence(input = {}, compiled = null) {
  return input?.evidence || compiled?.evidenceSignals || input?.compiled?.evidenceSignals || {};
}

function textSignal(evidence = {}, key, fallback = 0.45) {
  return clamp(firstAvailable(evidence.textSignals?.[key], evidence.signals?.[key], evidence[key], fallback), 0, 1);
}

function estimateCompetitivePersistence(drivers = {}, evidence = {}) {
  const thesisQuality = clamp(numeric(drivers.thesisQuality, 0.5), 0, 1);
  const bottleneckPower = clamp(numeric(drivers.bottleneckPower, textSignal(evidence, "capacityConstraint", 0.45)), 0, 1);
  const pricingPower = textSignal(evidence, "pricingPower", 0.45);
  const modelRisk = clamp(numeric(drivers.modelRisk, 0.45), 0, 1);
  return clamp(0.35 + thesisQuality * 0.24 + bottleneckPower * 0.18 + pricingPower * 0.14 - modelRisk * 0.16, 0.18, 0.94);
}

function halfLifeFromPhi(phi) {
  if (!isFiniteNumber(phi) || phi <= 0 || phi >= 1) return null;
  return Math.log(0.5) / Math.log(phi);
}

function buildNodes({ drivers, beliefObject, evidence, derived }) {
  const market = beliefObject?.marketImpliedBeliefs || {};
  const physics = beliefObject?.businessPhysicsBeliefs?.evidenceAdjusted || {};
  const nodes = [
    {
      id: "market_price",
      label: CORE_NODE_LABELS.market_price,
      type: "market",
      value: numeric(drivers.price, beliefObject?.price ?? null),
      source: "market quote",
    },
    {
      id: "revenue_growth",
      label: CORE_NODE_LABELS.revenue_growth,
      type: "economic_driver",
      value: numeric(drivers.revenueCagr, physics.growth?.mean ?? null),
      marketImplied: market.revenueCagr5y || null,
      feasible: physics.growth || null,
      source: "financial history / reverse DCF",
    },
    {
      id: "reinvestment_rate",
      label: CORE_NODE_LABELS.reinvestment_rate,
      type: "economic_driver",
      value: numeric(drivers.reinvestment, physics.reinvestmentRate?.mean ?? null),
      marketImplied: market.reinvestmentRate || null,
      feasible: physics.reinvestmentRate || null,
      source: "capex and invested capital bridge",
    },
    {
      id: "roiic",
      label: CORE_NODE_LABELS.roiic,
      type: "derived_driver",
      value: derived.impliedROIIC,
      distribution: distribution(derived.impliedROIIC, 0.08, -0.5, 1.5),
      source: "growth / reinvestment identity",
    },
    {
      id: "roic",
      label: CORE_NODE_LABELS.roic,
      type: "economic_driver",
      value: numeric(drivers.roic, physics.roicPath?.mean ?? null),
      marketImplied: market.roicPath || null,
      feasible: physics.roicPath || null,
      source: "NOPAT / invested capital",
    },
    {
      id: "wacc",
      label: CORE_NODE_LABELS.wacc,
      type: "cost_of_capital",
      value: numeric(drivers.wacc, null),
      source: "macro + beta + sector prior",
    },
    {
      id: "roic_spread",
      label: CORE_NODE_LABELS.roic_spread,
      type: "derived_driver",
      value: derived.roicSpread,
      distribution: distribution(derived.roicSpread, 0.04, -0.5, 0.8),
      source: "ROIC - WACC",
    },
    {
      id: "moat_half_life",
      label: CORE_NODE_LABELS.moat_half_life,
      type: "derived_driver",
      value: derived.moatHalfLifeYears,
      distribution: distribution(derived.moatHalfLifeYears, 1.4, 0, 20),
      source: "competitive persistence phi",
    },
    {
      id: "pricing_power",
      label: CORE_NODE_LABELS.pricing_power,
      type: "qualitative_driver",
      value: textSignal(evidence, "pricingPower", 0.45),
      source: "evidence extractor",
    },
    {
      id: "demand_visibility",
      label: CORE_NODE_LABELS.demand_visibility,
      type: "qualitative_driver",
      value: textSignal(evidence, "demandVisibility", 0.45),
      source: "evidence extractor",
    },
    {
      id: "capacity_constraint",
      label: CORE_NODE_LABELS.capacity_constraint,
      type: "qualitative_driver",
      value: textSignal(evidence, "capacityConstraint", 0.45),
      source: "evidence extractor",
    },
    {
      id: "operating_margin",
      label: CORE_NODE_LABELS.operating_margin,
      type: "economic_driver",
      value: numeric(drivers.margin, physics.margin?.mean ?? null),
      marketImplied: market.terminalMargin || null,
      feasible: physics.margin || null,
      source: "income statement / reverse DCF",
    },
    {
      id: "free_cash_flow",
      label: CORE_NODE_LABELS.free_cash_flow,
      type: "economic_output",
      value: numeric(drivers.baseFcf, null),
      source: "cash flow statement",
    },
    {
      id: "value",
      label: CORE_NODE_LABELS.value,
      type: "valuation_output",
      value: beliefObject?.signedOpportunityScore ?? null,
      source: "priced belief object",
    },
  ];
  return nodes;
}

function buildEdges() {
  return [
    {
      from: "reinvestment_rate",
      to: "revenue_growth",
      relation: "growth_requires_reinvestment",
      equation: "g_NPAT ~= reinvestment_rate * ROIIC",
    },
    {
      from: "roiic",
      to: "revenue_growth",
      relation: "incremental_returns_drive_growth",
      equation: "ROIIC = delta_NOPAT / delta_invested_capital",
    },
    {
      from: "roic",
      to: "roic_spread",
      relation: "excess_return",
      equation: "roic_spread = ROIC - WACC",
    },
    {
      from: "wacc",
      to: "roic_spread",
      relation: "cost_of_capital_hurdle",
      equation: "roic_spread = ROIC - WACC",
    },
    {
      from: "roic_spread",
      to: "moat_half_life",
      relation: "competitive_advantage_decay",
      equation: "ROIC_{t+1}-WACC = phi*(ROIC_t-WACC)+betaX+epsilon",
    },
    {
      from: "pricing_power",
      to: "operating_margin",
      relation: "price_cost_spread",
      equation: "margin responds to price realization and cost pass-through",
    },
    {
      from: "demand_visibility",
      to: "revenue_growth",
      relation: "demand_supports_growth",
      equation: "revenue = volume * price",
    },
    {
      from: "capacity_constraint",
      to: "pricing_power",
      relation: "scarcity_supports_pricing",
      equation: "price rises when demand exceeds effective capacity",
    },
    {
      from: "operating_margin",
      to: "free_cash_flow",
      relation: "profit_conversion",
      equation: "FCFF = NOPAT - reinvestment",
    },
    {
      from: "free_cash_flow",
      to: "value",
      relation: "cash_flow_valuation",
      equation: "value = discounted distribution of owner cash flows",
    },
    {
      from: "market_price",
      to: "value",
      relation: "reverse_dcf_constraint",
      equation: "price implies a belief set about growth, margin, ROIC and reinvestment",
    },
  ];
}

function addViolation(violations, violation) {
  violations.push({
    ...violation,
    severity: clamp(violation.severity, 0, 1),
  });
}

function evaluateConstraints({ drivers, evidence, derived, beliefObject }) {
  const violations = [];
  const growth = numeric(drivers.revenueCagr, beliefObject?.businessPhysicsBeliefs?.evidenceAdjusted?.growth?.mean ?? null);
  const reinvestment = numeric(drivers.reinvestment, beliefObject?.businessPhysicsBeliefs?.evidenceAdjusted?.reinvestmentRate?.mean ?? null);
  const roic = numeric(drivers.roic, null);
  const wacc = numeric(drivers.wacc, null);
  const terminalGrowth = numeric(drivers.terminalGrowth, null);
  const margin = numeric(drivers.margin, null);
  const marginPressure = textSignal(evidence, "marginPressure", 0.35);
  const pricingPower = textSignal(evidence, "pricingPower", 0.45);
  const demandVisibility = textSignal(evidence, "demandVisibility", 0.45);
  const capacityConstraint = textSignal(evidence, "capacityConstraint", 0.45);
  const bottleneckPower = clamp(numeric(drivers.bottleneckPower, capacityConstraint), 0, 1);

  if (isFiniteNumber(growth) && isFiniteNumber(reinvestment) && growth > 0.08 && reinvestment < 0.06) {
    addViolation(violations, {
      key: "growth_without_reinvestment",
      status: "violation",
      severity: 0.74,
      message: "Growth is high while reinvestment is near zero; the growth mechanism is under-specified.",
      affectedNodes: ["revenue_growth", "reinvestment_rate", "roiic"],
    });
  }

  if (isFiniteNumber(derived.impliedROIIC) && derived.impliedROIIC > 0.65) {
    addViolation(violations, {
      key: "heroic_roiic",
      status: derived.impliedROIIC > 0.95 ? "violation" : "watch",
      severity: clamp((derived.impliedROIIC - 0.45) / 0.7, 0.35, 1),
      message: "Growth requires unusually high incremental returns on invested capital.",
      affectedNodes: ["roiic", "revenue_growth", "reinvestment_rate"],
    });
  }

  if (isFiniteNumber(roic) && isFiniteNumber(wacc) && roic <= wacc && isFiniteNumber(growth) && growth > 0.05) {
    addViolation(violations, {
      key: "growth_below_cost_of_capital",
      status: "violation",
      severity: clamp((wacc - roic + growth) * 4.2, 0.35, 1),
      message: "The company is growing while ROIC is at or below WACC; growth may destroy value.",
      affectedNodes: ["roic", "wacc", "revenue_growth", "value"],
    });
  }

  if (isFiniteNumber(terminalGrowth) && isFiniteNumber(wacc) && terminalGrowth >= wacc - 0.015) {
    addViolation(violations, {
      key: "terminal_growth_too_close_to_wacc",
      status: "violation",
      severity: clamp(0.5 + (terminalGrowth - (wacc - 0.015)) * 8, 0.4, 1),
      message: "Terminal growth is too close to WACC, making terminal value unstable.",
      affectedNodes: ["wacc", "value"],
    });
  }

  if (bottleneckPower > 0.72 && Math.max(pricingPower, demandVisibility, capacityConstraint) < 0.55) {
    addViolation(violations, {
      key: "bottleneck_without_evidence",
      status: "violation",
      severity: 0.72,
      message: "Bottleneck power is asserted without enough pricing, demand, or capacity evidence.",
      affectedNodes: ["capacity_constraint", "pricing_power", "demand_visibility"],
    });
  }

  if (isFiniteNumber(margin) && margin > 0.22 && marginPressure > 0.68 && pricingPower < 0.45) {
    addViolation(violations, {
      key: "margin_without_pricing_support",
      status: "watch",
      severity: clamp(0.42 + marginPressure * 0.28 - pricingPower * 0.2, 0.25, 0.85),
      message: "High margin assumptions conflict with margin-pressure evidence and weak pricing support.",
      affectedNodes: ["operating_margin", "pricing_power"],
    });
  }

  return violations.sort((a, b) => b.severity - a.severity);
}

function graphHealthFromViolations(violations) {
  const hard = violations.filter((item) => item.status === "violation");
  const watches = violations.filter((item) => item.status === "watch");
  const penalty = hard.reduce((sum, item) => sum + item.severity * 0.22, 0) + watches.reduce((sum, item) => sum + item.severity * 0.09, 0);
  const score = clamp(1 - penalty, 0, 1);
  return {
    score,
    level: score >= 0.82 ? "coherent" : score >= 0.62 ? "usable_with_watches" : score >= 0.42 ? "fragile" : "incoherent",
    hardViolationCount: hard.length,
    watchCount: watches.length,
  };
}

function qualitativeMap(evidence = {}) {
  return [
    {
      concept: "Moat",
      drivers: ["roic_spread", "moat_half_life", "pricing_power"],
      currentEvidence: {
        pricingPower: textSignal(evidence, "pricingPower", 0.45),
        accountingTrust: textSignal(evidence, "accountingTrust", 0.58),
      },
    },
    {
      concept: "Supply-demand bottleneck",
      drivers: ["capacity_constraint", "demand_visibility", "pricing_power"],
      currentEvidence: {
        capacityConstraint: textSignal(evidence, "capacityConstraint", 0.45),
        demandVisibility: textSignal(evidence, "demandVisibility", 0.45),
      },
    },
    {
      concept: "Management / accounting quality",
      drivers: ["reinvestment_rate", "free_cash_flow", "roic"],
      currentEvidence: {
        capitalDiscipline: textSignal(evidence, "capitalDiscipline", 0.45),
        accountingTrust: textSignal(evidence, "accountingTrust", 0.58),
      },
    },
  ];
}

export function buildAuroraDriverGraph(input = {}, options = {}) {
  const compiled = getCompiled(input);
  const beliefObject = getBeliefObject(input, compiled);
  const drivers = getDrivers(input, compiled);
  const evidence = getEvidence(input, compiled);
  const growth = numeric(drivers.revenueCagr, beliefObject?.businessPhysicsBeliefs?.evidenceAdjusted?.growth?.mean ?? null);
  const reinvestment = numeric(drivers.reinvestment, beliefObject?.businessPhysicsBeliefs?.evidenceAdjusted?.reinvestmentRate?.mean ?? null);
  const roic = numeric(drivers.roic, null);
  const wacc = numeric(drivers.wacc, null);
  const phi = estimateCompetitivePersistence(drivers, evidence);
  const derived = {
    impliedROIIC: isFiniteNumber(growth) && isFiniteNumber(reinvestment) && Math.abs(reinvestment) > 1e-6 ? growth / reinvestment : null,
    roicSpread: isFiniteNumber(roic) && isFiniteNumber(wacc) ? roic - wacc : null,
    competitivePersistencePhi: phi,
    moatHalfLifeYears: halfLifeFromPhi(phi),
  };
  const nodes = buildNodes({ drivers, beliefObject, evidence, derived });
  const edges = buildEdges();
  const constraintViolations = evaluateConstraints({ drivers, evidence, derived, beliefObject });
  const graphHealth = graphHealthFromViolations(constraintViolations);

  return {
    version: "aurora_driver_graph_v1",
    ticker: drivers.ticker || compiled?.ticker || beliefObject?.ticker || null,
    name: drivers.name || compiled?.name || beliefObject?.name || null,
    builtAt: options.builtAt || new Date().toISOString(),
    nodes,
    edges,
    derived,
    constraintViolations,
    graphHealth,
    qualitativeDriverMap: qualitativeMap(evidence),
    memo: {
      headline:
        graphHealth.level === "coherent"
          ? "The driver graph is causally coherent."
          : graphHealth.level === "usable_with_watches"
            ? "The driver graph is usable, but some assumptions need monitoring."
            : graphHealth.level === "fragile"
              ? "The driver graph is fragile; key assumptions need repair."
              : "The driver graph is incoherent; do not underwrite from this state.",
      topConstraint: constraintViolations[0]?.message || null,
      coreEquation: "g_NPAT ~= reinvestment_rate * ROIIC; ROIC spread fades with competitive persistence phi.",
    },
  };
}

export function buildAuroraDriverGraphPanel(items = [], options = {}) {
  const rows = (Array.isArray(items) ? items : []).map((item) => buildAuroraDriverGraph(item, options));
  const counts = rows.reduce((acc, row) => {
    acc[row.graphHealth.level] = (acc[row.graphHealth.level] || 0) + 1;
    return acc;
  }, {});
  return {
    version: "aurora_driver_graph_panel_v1",
    count: rows.length,
    counts,
    averageHealth: rows.length ? rows.reduce((sum, row) => sum + row.graphHealth.score, 0) / rows.length : 0,
    rows,
  };
}
