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

function getAccounting(input = {}, compiled = null) {
  return input.accounting || compiled?.accounting || null;
}

function getExpectations(input = {}) {
  return input.expectations || input.expectationsSurface || null;
}

function sectorText(input = {}, drivers = {}) {
  const company = input.company || input.profile || {};
  const accountingCompany = input.accounting?.company || input.compiled?.accounting?.company || {};
  return `${drivers.sector || company.sector || accountingCompany.sector || ""} ${company.industry || accountingCompany.industry || ""}`.toLowerCase();
}

function inferArchetype(sector = "") {
  if (/bank|insurance|financial|broker|credit/.test(sector)) return "financial";
  if (/software|saas|cloud|platform|marketplace|payments/.test(sector)) return "asset_light_platform";
  if (/energy|commodity|mining|materials|shipping|airline|utility|reit|real estate/.test(sector)) return "asset_heavy";
  if (/semiconductor|aerospace|equipment|industrial|auto|chemical/.test(sector)) return "capacity_cycle";
  if (/biotech|pharma|drug/.test(sector)) return "event_driven";
  return "general";
}

function currentContext(input = {}, drivers = {}, accounting = null) {
  const reported = accounting?.reported || {};
  const economic = accounting?.economic || {};
  const equilibrium = input.equilibrium || {};
  const revenue = numeric(drivers.revenue, numeric(reported.revenue, 100));
  const capex = numeric(reported.capex, null);
  const investedCapital = numeric(economic.adjustedInvestedCapital, numeric(reported.investedCapital, null));
  const debt = numeric(reported.debt, 0);
  const cash = numeric(reported.cash, 0);
  return {
    revenue,
    investedCapital,
    capexIntensity: safeDivide(capex, revenue, numeric(drivers.capexIntensity, 0.06)),
    assetTurnover: safeDivide(revenue, investedCapital, 1),
    leverage: safeDivide(debt - cash, Math.max(1, investedCapital || revenue), 0),
    utilization: clamp(numeric(equilibrium.productMarket?.utilization, 0.75), 0, 1.4),
    pricingPressure: clamp(numeric(equilibrium.productMarket?.pricingPressure, 0), -1, 1),
    bottleneckPower: clamp(numeric(drivers.bottleneckPower, 0.4), 0, 1),
    dataQuality: clamp(numeric(drivers.dataQuality, accounting?.quality?.score ?? 0.55), 0, 1),
  };
}

function sectorKernel(archetype) {
  const kernels = {
    financial: {
      spreads: { growth: 0.045, margin: 0.08, roic: 0.055, reinvestment: 0.16 },
      prototypes: [
        { label: "steady_book_spread", growth: 0.035, margin: 0.16, roic: 0.1, reinvestment: 0.2 },
        { label: "credit_stress", growth: -0.03, margin: 0.05, roic: 0.04, reinvestment: 0.35 },
        { label: "high_rote_compounder", growth: 0.07, margin: 0.22, roic: 0.16, reinvestment: 0.28 },
      ],
    },
    asset_light_platform: {
      spreads: { growth: 0.11, margin: 0.12, roic: 0.14, reinvestment: 0.22 },
      prototypes: [
        { label: "efficient_scale_platform", growth: 0.14, margin: 0.25, roic: 0.22, reinvestment: 0.35 },
        { label: "land_grab", growth: 0.28, margin: 0.04, roic: 0.06, reinvestment: 0.72 },
        { label: "mature_software", growth: 0.07, margin: 0.32, roic: 0.28, reinvestment: 0.18 },
      ],
    },
    asset_heavy: {
      spreads: { growth: 0.08, margin: 0.1, roic: 0.09, reinvestment: 0.22 },
      prototypes: [
        { label: "midcycle_asset_base", growth: 0.035, margin: 0.14, roic: 0.09, reinvestment: 0.34 },
        { label: "upcycle_scarcity", growth: 0.09, margin: 0.24, roic: 0.16, reinvestment: 0.48 },
        { label: "downcycle_reset", growth: -0.06, margin: 0.04, roic: 0.03, reinvestment: 0.16 },
      ],
    },
    capacity_cycle: {
      spreads: { growth: 0.1, margin: 0.11, roic: 0.12, reinvestment: 0.24 },
      prototypes: [
        { label: "scarce_capacity_compounder", growth: 0.16, margin: 0.28, roic: 0.24, reinvestment: 0.38 },
        { label: "capacity_buildout", growth: 0.2, margin: 0.18, roic: 0.14, reinvestment: 0.66 },
        { label: "inventory_correction", growth: -0.05, margin: 0.09, roic: 0.06, reinvestment: 0.18 },
      ],
    },
    event_driven: {
      spreads: { growth: 0.18, margin: 0.22, roic: 0.22, reinvestment: 0.28 },
      prototypes: [
        { label: "pre_revenue_option", growth: 0.35, margin: -0.12, roic: -0.08, reinvestment: 0.85 },
        { label: "approved_asset_ramp", growth: 0.28, margin: 0.24, roic: 0.18, reinvestment: 0.5 },
        { label: "failed_pipeline_reset", growth: -0.15, margin: -0.2, roic: -0.12, reinvestment: 0.28 },
      ],
    },
    general: {
      spreads: { growth: 0.08, margin: 0.1, roic: 0.1, reinvestment: 0.2 },
      prototypes: [
        { label: "steady_compounder", growth: 0.06, margin: 0.16, roic: 0.14, reinvestment: 0.28 },
        { label: "cyclical_reset", growth: -0.02, margin: 0.07, roic: 0.06, reinvestment: 0.2 },
        { label: "growth_investment", growth: 0.14, margin: 0.12, roic: 0.11, reinvestment: 0.55 },
      ],
    },
  };
  return kernels[archetype] || kernels.general;
}

function normalizedDistance(cell, prototype, spreads) {
  const parts = ["growth", "margin", "roic", "reinvestment"].map((key) => {
    const spread = Math.max(0.01, spreads[key]);
    return ((numeric(cell[key], 0) - prototype[key]) / spread) ** 2;
  });
  return Math.sqrt(parts.reduce((sum, value) => sum + value, 0) / parts.length);
}

function nearestTrajectory(cell, kernel) {
  const ranked = kernel.prototypes
    .map((prototype) => ({
      label: prototype.label,
      distance: normalizedDistance(cell, prototype, kernel.spreads),
      prototype,
    }))
    .sort((a, b) => a.distance - b.distance);
  return ranked[0];
}

function explicitConstraints(cell, context, archetype) {
  const constraints = [];
  const requiredReinvestment = cell.growth > 0 && cell.roic > 0 ? clamp((cell.growth / Math.max(0.035, cell.roic)) * 0.42, 0, 1.15) : 0.02;
  if (cell.growth > 0.22 && cell.reinvestment < requiredReinvestment * 0.72) {
    constraints.push({
      key: "growth_without_reinvestment",
      severity: clamp(0.58 + (requiredReinvestment - cell.reinvestment) * 0.45, 0, 1),
      message: "High growth is underfunded by the implied reinvestment path.",
    });
  }
  if (["asset_heavy", "capacity_cycle"].includes(archetype) && cell.growth > 0.16 && context.capexIntensity < 0.045 && context.utilization < 0.82) {
    constraints.push({
      key: "physical_growth_without_capacity",
      severity: 0.78,
      message: "Physical growth is high despite low capex intensity and no utilization pressure.",
    });
  }
  if (cell.margin > 0.35 && context.pricingPressure < 0.12 && context.bottleneckPower < 0.55 && !["asset_light_platform", "event_driven"].includes(archetype)) {
    constraints.push({
      key: "margin_without_pricing_power",
      severity: 0.7,
      message: "High margin requires pricing power, bottleneck evidence, or asset-light scale economics.",
    });
  }
  if (cell.roic > 0.35 && context.assetTurnover < 0.65 && cell.growth > 0.12) {
    constraints.push({
      key: "roic_at_scale_problem",
      severity: 0.66,
      message: "Very high ROIC at scale conflicts with low asset turnover and high growth.",
    });
  }
  if (context.leverage > 0.65 && cell.reinvestment > 0.55 && cell.growth > 0.1) {
    constraints.push({
      key: "levered_growth_funding_gap",
      severity: 0.68,
      message: "Levered balance sheet may not fund high reinvestment and growth simultaneously.",
    });
  }
  if (cell.roic < cell.wacc && cell.growth > 0.08) {
    constraints.push({
      key: "growth_below_cost_of_capital",
      severity: 0.75,
      message: "Growth below cost of capital destroys value and should not support bullish valuation.",
    });
  }
  return constraints.sort((a, b) => b.severity - a.severity);
}

function scoreCell(cell, kernel, context, archetype) {
  const nearest = nearestTrajectory(cell, kernel);
  const trajectoryScore = Math.exp(-0.5 * nearest.distance * nearest.distance);
  const constraints = explicitConstraints(cell, context, archetype);
  const constraintPenalty = constraints.reduce((product, constraint) => product * (1 - constraint.severity * 0.55), 1);
  const priorSurfaceScore = clamp(numeric(cell.feasibility, 0.5), 0, 1);
  const score = clamp(Math.pow(trajectoryScore * priorSurfaceScore, 0.5) * constraintPenalty, 0, 1);
  return {
    ...cell,
    manifoldScore: score,
    nearestTrajectory: {
      label: nearest.label,
      distance: nearest.distance,
      prototype: nearest.prototype,
    },
    constraints,
    feasibilityClass:
      constraints.some((constraint) => constraint.severity >= 0.82) || score < 0.14
        ? "impossible"
        : score < 0.3
          ? "implausible"
          : score < 0.5
            ? "stretched"
            : "plausible",
  };
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

function summarize(scoredCells, expectations = null) {
  const count = scoredCells.length;
  const classes = scoredCells.reduce((acc, cell) => {
    acc[cell.feasibilityClass] = (acc[cell.feasibilityClass] || 0) + 1;
    return acc;
  }, {});
  const plausibleCells = scoredCells.filter((cell) => cell.feasibilityClass === "plausible");
  const viableCells = scoredCells.filter((cell) => ["plausible", "stretched"].includes(cell.feasibilityClass));
  const contourSeeds = Array.isArray(expectations?.marketContour) ? expectations.marketContour.slice(0, 12) : [];
  const contourCells = contourSeeds
    .map((contour) =>
      scoredCells.find(
        (cell) =>
          Math.abs(cell.growth - contour.growth) < 1e-9 &&
          Math.abs(cell.margin - contour.margin) < 1e-9,
      ),
    )
    .filter(Boolean);
  const contourScore = contourCells.length
    ? contourCells.reduce((sum, cell) => sum + cell.manifoldScore, 0) / contourCells.length
    : null;
  const impossibleConstraints = scoredCells
    .flatMap((cell) => cell.constraints.map((constraint) => constraint.key))
    .reduce((acc, key) => {
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  const topConstraint = Object.entries(impossibleConstraints).sort((a, b) => b[1] - a[1])[0] || null;

  return {
    cellCount: count,
    classCounts: classes,
    plausibleShare: safeDivide(plausibleCells.length, count, 0),
    viableShare: safeDivide(viableCells.length, count, 0),
    contourScore,
    contourClass:
      contourScore == null
        ? "unknown"
        : contourScore >= 0.5
          ? "plausible"
          : contourScore >= 0.3
            ? "stretched"
            : contourScore >= 0.14
              ? "implausible"
              : "impossible",
    manifoldScoreP10: quantile(scoredCells.map((cell) => cell.manifoldScore), 0.1),
    manifoldScoreP50: quantile(scoredCells.map((cell) => cell.manifoldScore), 0.5),
    manifoldScoreP90: quantile(scoredCells.map((cell) => cell.manifoldScore), 0.9),
    topConstraint: topConstraint ? { key: topConstraint[0], count: topConstraint[1] } : null,
  };
}

function buildDecision(summary) {
  if (!summary.cellCount) return "manifold_insufficient";
  if (["impossible", "implausible"].includes(summary.contourClass) && summary.viableShare < 0.35) return "market_contour_implausible";
  if (summary.contourClass === "stretched" || summary.viableShare < 0.45) return "market_contour_stretched";
  return "manifold_usable";
}

export function buildAuroraFeasibilityManifold(input = {}, options = {}) {
  const compiled = getCompiled(input);
  const drivers = getDrivers(input, compiled);
  const accounting = getAccounting(input, compiled);
  const expectations = getExpectations(input);
  const surface = expectations?.surface || input.surface || null;
  const sector = sectorText(input, drivers);
  const archetype = inferArchetype(sector);
  const kernel = sectorKernel(archetype);
  const context = currentContext(input, drivers, accounting);
  const cells = Array.isArray(surface?.cells) ? surface.cells : [];
  const scoredCells = cells.map((cell) => scoreCell(cell, kernel, context, archetype));
  const summary = summarize(scoredCells, expectations);
  const decision = buildDecision(summary);

  return {
    version: "aurora_feasibility_manifold_v1",
    ticker: drivers.ticker || compiled?.ticker || null,
    name: drivers.name || compiled?.name || null,
    builtAt: options.builtAt || new Date().toISOString(),
    archetype,
    kernel: {
      archetype,
      prototypes: kernel.prototypes,
      spreads: kernel.spreads,
      method: "deterministic sector kernel plus explicit economic constraints",
    },
    annotatedSurface: {
      axes: surface?.axes || null,
      cells: scoredCells,
    },
    summary,
    decision,
    memo: {
      headline: `Feasibility manifold says ${decision.replaceAll("_", " ")}.`,
      contourClass: summary.contourClass,
      viableShare: summary.viableShare,
      topConstraint: summary.topConstraint?.key || null,
      note: "This v1 manifold is auditable and deterministic; future versions can replace kernels with trained historical geometry.",
    },
  };
}

