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

function arrayOrEmpty(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function mean(values) {
  const clean = values.filter(isFiniteNumber);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function firstText(...values) {
  for (const value of values) {
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function getCompiled(input = {}) {
  return input.compiled || (input.version === "aurora_belief_compiler_v1" ? input : null);
}

function getDrivers(input = {}, compiled = null) {
  return compiled?.drivers || input.drivers || {};
}

function getExpectations(input = {}) {
  return input.expectations || null;
}

function getManifold(input = {}) {
  return input.feasibilityManifold || null;
}

function getProbabilistic(input = {}) {
  return input.probabilisticValuation || null;
}

function posteriorDistribution(input = {}, key) {
  const forecast = input.forecast || input.bayesianForecast || {};
  const dist = forecast?.posterior?.[key] || {};
  const defaults = {
    growth: { mean: 0.05, sd: 0.08 },
    margin: { mean: 0.14, sd: 0.08 },
    roic: { mean: 0.12, sd: 0.1 },
    reinvestment: { mean: 0.3, sd: 0.16 },
  }[key] || { mean: 0, sd: 0.1 };
  return {
    mean: numeric(dist.p50, numeric(dist.mean, defaults.mean)),
    sd: Math.max(1e-6, numeric(dist.sd, defaults.sd)),
  };
}

function safeDistance(left, right, scales) {
  const parts = ["growth", "margin", "roic", "reinvestment"].map((key) => {
    const scale = Math.max(1e-6, numeric(scales[key], 0.08));
    const l = numeric(left?.[key], null);
    const r = numeric(right?.[key], null);
    if (!isFiniteNumber(l) || !isFiniteNumber(r)) return null;
    return ((l - r) / scale) ** 2;
  }).filter(isFiniteNumber);
  if (!parts.length) return null;
  return Math.sqrt(parts.reduce((sum, value) => sum + value, 0) / parts.length);
}

function familyLabel(cell = {}, archetype = "general", drivers = {}) {
  const growth = numeric(cell.growth, 0);
  const margin = numeric(cell.margin, 0);
  const bottleneck = clamp(numeric(drivers.bottleneckPower, 0.4), 0, 1);
  if (archetype === "capacity_cycle" && bottleneck >= 0.62 && margin >= 0.22) return "bottleneck_compounder";
  if (archetype === "asset_light_platform" && growth >= 0.14 && margin >= 0.18) return "scaling_platform";
  if (archetype === "asset_heavy" && margin <= 0.12 && growth <= 0.06) return "cyclical_reset";
  if (archetype === "financial" && margin >= 0.14) return "spread_compounder";
  if (growth >= 0.16 && margin >= 0.22) return "heroic_compounder";
  if (growth >= 0.08 && margin >= 0.14) return "durable_compounder";
  if (growth <= 0.03 && margin >= 0.16) return "bond_proxy_maturity";
  if (growth <= 0.02 && margin <= 0.1) return "melting_or_reset";
  return "generalized_earnings_power";
}

function contourWithManifold(expectations = null, manifold = null, archetype = "general", drivers = {}) {
  const contour = arrayOrEmpty(expectations?.marketContour);
  const cells = arrayOrEmpty(manifold?.annotatedSurface?.cells);
  return contour.map((item) => {
    const scored =
      cells.find(
        (cell) =>
          Math.abs(numeric(cell.growth, 0) - numeric(item.growth, 0)) < 1e-9 &&
          Math.abs(numeric(cell.margin, 0) - numeric(item.margin, 0)) < 1e-9,
      ) || item;
    return {
      ...scored,
      family: familyLabel(scored, archetype, drivers),
    };
  });
}

function summarizeFamilies(contourCells = []) {
  const groups = new Map();
  contourCells.forEach((cell) => {
    const key = cell.family || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cell);
  });
  return [...groups.entries()]
    .map(([family, items]) => ({
      family,
      count: items.length,
      support: clamp(mean(items.map((item) => numeric(item.feasibility, numeric(item.manifoldScore, 0.2)))) || 0, 0, 1),
      growthRange: [Math.min(...items.map((item) => numeric(item.growth, 0))), Math.max(...items.map((item) => numeric(item.growth, 0)))],
      marginRange: [Math.min(...items.map((item) => numeric(item.margin, 0))), Math.max(...items.map((item) => numeric(item.margin, 0)))],
      roicRange: [Math.min(...items.map((item) => numeric(item.roic, 0))), Math.max(...items.map((item) => numeric(item.roic, 0)))],
      reinvestmentRange: [
        Math.min(...items.map((item) => numeric(item.reinvestment, 0))),
        Math.max(...items.map((item) => numeric(item.reinvestment, 0))),
      ],
    }))
    .sort((a, b) => b.support - a.support || b.count - a.count);
}

function topConstraint(manifold = null) {
  return manifold?.summary?.topConstraint?.key || manifold?.memo?.topConstraint || null;
}

function narrativeForCell(cell = {}, archetype = "general", drivers = {}, manifold = null) {
  const bottleneck = clamp(numeric(drivers.bottleneckPower, 0.4), 0, 1);
  const family = familyLabel(cell, archetype, drivers);
  const lead =
    family === "bottleneck_compounder"
      ? "The market is underwriting a bottleneck asset with durable pricing power."
      : family === "scaling_platform"
        ? "The market is underwriting a scaling platform that converts growth into durable margins."
        : family === "bond_proxy_maturity"
          ? "The market is underwriting a mature cash machine with modest growth but sticky margins."
          : family === "cyclical_reset"
            ? "The market is underwriting a cyclical reset rather than a structurally impaired business."
            : family === "heroic_compounder"
              ? "The market is underwriting a rare compounder path with both strong growth and high margins."
              : "The market is underwriting a durable earnings-power story.";
  const fragility =
    bottleneck >= 0.65
      ? "The thesis leans on scarcity durability."
      : numeric(cell.margin, 0) >= 0.22
        ? "The thesis leans on margin durability."
        : "The thesis leans on steady execution rather than optionality.";
  const constraint = topConstraint(manifold);
  return {
    family,
    narrative: lead,
    fragility,
    tension: constraint ? `Main business-physics tension: ${constraint}.` : "No single dominant business-physics tension surfaced.",
  };
}

function driverGradient(probabilistic = null) {
  const rows = arrayOrEmpty(probabilistic?.sensitivity?.fairValue?.firstOrder).map((item) => ({
    key: item.factor,
    share: numeric(item.normalizedShare, numeric(item.firstOrderIndex, 0)),
    firstOrderIndex: numeric(item.firstOrderIndex, 0),
    label: {
      growth: "revenue growth",
      margin: "EBIT margin",
      roic: "ROIC",
      reinvestment: "reinvestment rate",
      wacc: "WACC",
      terminalGrowth: "terminal growth",
    }[item.factor] || item.factor,
  }));
  const ordered = rows.sort((a, b) => b.share - a.share);
  return {
    dominant: ordered[0] || null,
    drivers: ordered,
    concentration: rows.length ? rows.slice(0, 3).reduce((sum, row) => sum + row.share, 0) : null,
  };
}

function candidateScore(cell, anchor, scales, desiredDirection) {
  const distance = safeDistance(cell, anchor, scales);
  const feasibility = numeric(cell.manifoldScore, numeric(cell.feasibility, 0));
  const valueToPrice = numeric(cell.valueToPrice, null);
  if (!isFiniteNumber(distance) || !isFiniteNumber(feasibility) || !isFiniteNumber(valueToPrice)) return null;
  const valueSignal = desiredDirection === "bull" ? Math.max(0, valueToPrice - 1) : Math.max(0, 1 - valueToPrice);
  return distance * 0.65 - feasibility * 0.22 - valueSignal * 0.13;
}

function chooseScenario(cells, anchor, scales, desiredDirection) {
  const cutoffs = desiredDirection === "bull" ? [1.15, 1.05, 1.0] : [0.9, 0.95, 1.0];
  for (const cutoff of cutoffs) {
    const eligible = cells.filter((cell) => {
      const valueToPrice = numeric(cell.valueToPrice, null);
      const feasible = ["plausible", "stretched"].includes(cell.feasibilityClass || "unknown");
      if (!isFiniteNumber(valueToPrice) || !feasible) return false;
      return desiredDirection === "bull" ? valueToPrice >= cutoff : valueToPrice <= cutoff;
    });
    const ranked = eligible
      .map((cell) => ({ cell, score: candidateScore(cell, anchor, scales, desiredDirection) }))
      .filter((row) => isFiniteNumber(row.score))
      .sort((a, b) => a.score - b.score);
    if (ranked[0]?.cell) return ranked[0].cell;
  }
  const fallback = cells
    .filter((cell) => ["plausible", "stretched"].includes(cell.feasibilityClass || "unknown") && isFiniteNumber(numeric(cell.valueToPrice, null)))
    .sort((a, b) => {
      const valueDiff =
        desiredDirection === "bull"
          ? numeric(b.valueToPrice, 0) - numeric(a.valueToPrice, 0)
          : numeric(a.valueToPrice, 0) - numeric(b.valueToPrice, 0);
      if (Math.abs(valueDiff) > 1e-9) return valueDiff;
      return (safeDistance(a, anchor, scales) || 0) - (safeDistance(b, anchor, scales) || 0);
    });
  return fallback[0] || null;
}

function variableDeltaLines(anchor = {}, target = {}, scales = {}) {
  const lines = ["growth", "margin", "roic", "reinvestment"]
    .map((key) => {
      const start = numeric(anchor[key], null);
      const end = numeric(target[key], null);
      if (!isFiniteNumber(start) || !isFiniteNumber(end)) return null;
      const delta = end - start;
      const scale = Math.max(1e-6, numeric(scales[key], 0.08));
      return {
        key,
        from: start,
        to: end,
        delta,
        standardized: Math.abs(delta) / scale,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.standardized - a.standardized);
  return lines;
}

function scenarioDescription(anchor = {}, target = {}, scales = {}, direction = "bull") {
  if (!target) return null;
  const deltas = variableDeltaLines(anchor, target, scales);
  const phrasing = deltas.slice(0, 3).map((item) => {
    const percent = `${(item.to * 100).toFixed(1)}%`;
    if (item.key === "growth") return `revenue CAGR ${direction === "bull" ? "reaches" : "falls to"} ${percent}`;
    if (item.key === "margin") return `EBIT margin ${direction === "bull" ? "holds near" : "slips to"} ${percent}`;
    if (item.key === "roic") return `ROIC ${direction === "bull" ? "stays above" : "fades toward"} ${percent}`;
    return `reinvestment ${direction === "bull" ? "settles near" : "moves toward"} ${percent}`;
  });
  return {
    target,
    deltas,
    oneLine: phrasing.join(", "),
  };
}

function buildCounterfactualArena(expectations = null, manifold = null, probabilistic = null, input = {}) {
  const contourCell = expectations?.summary?.marketClearingCell || null;
  const cells = arrayOrEmpty(manifold?.annotatedSurface?.cells);
  const scales = {
    growth: posteriorDistribution(input, "growth").sd,
    margin: posteriorDistribution(input, "margin").sd,
    roic: posteriorDistribution(input, "roic").sd,
    reinvestment: posteriorDistribution(input, "reinvestment").sd,
  };
  if (!contourCell || !cells.length) {
    return {
      minimumViableBullCase: null,
      minimumViableBearCase: null,
      decisionFlip: null,
    };
  }
  const bull = chooseScenario(cells, contourCell, scales, "bull");
  const bear = chooseScenario(cells, contourCell, scales, "bear");
  const bullDesc = scenarioDescription(contourCell, bull, scales, "bull");
  const bearDesc = scenarioDescription(contourCell, bear, scales, "bear");
  const dominant = probabilistic?.sensitivity?.dominantFactor || null;
  return {
    minimumViableBullCase: bullDesc,
    minimumViableBearCase: bearDesc,
    decisionFlip: {
      primaryLever: dominant,
      easiestBullShift: bullDesc?.deltas?.[0]?.key || null,
      easiestBearShift: bearDesc?.deltas?.[0]?.key || null,
    },
  };
}

function buildMonitoringFocus(beliefObject = {}, gradient = {}, arena = {}) {
  const topFalsifier = beliefObject?.falsifiers?.[0] || null;
  const dominantDriver = gradient?.dominant?.key || null;
  const nextBullLever = arena?.decisionFlip?.easiestBullShift || null;
  return {
    primaryVariable: dominantDriver || topFalsifier?.variable || null,
    falsifier: topFalsifier?.text || null,
    nextBullLever,
  };
}

function inferArchetype(compiled = {}, manifold = null) {
  return firstText(
    compiled?.beliefObject?.businessGenome?.primary,
    manifold?.archetype,
    compiled?.drivers?.sector,
    "general",
  );
}

export function buildAuroraOmegaSpine(input = {}, options = {}) {
  const compiled = getCompiled(input);
  const drivers = getDrivers(input, compiled);
  const beliefObject = compiled?.beliefObject || input.beliefObject || {};
  const expectations = getExpectations(input);
  const manifold = getManifold(input);
  const probabilistic = getProbabilistic(input);
  const archetype = inferArchetype(compiled, manifold);
  const contourCells = contourWithManifold(expectations, manifold, archetype, drivers);
  const families = summarizeFamilies(contourCells);
  const anchor = expectations?.summary?.marketClearingCell || contourCells[0] || null;
  const narrative = narrativeForCell(anchor || {}, archetype, drivers, manifold);
  const gradient = driverGradient(probabilistic);
  const counterfactualArena = buildCounterfactualArena(expectations, manifold, probabilistic, input);
  const monitoringFocus = buildMonitoringFocus(beliefObject, gradient, counterfactualArena);

  return {
    version: "aurora_omega_spine_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    ticker: compiled?.ticker || drivers.ticker || null,
    name: compiled?.name || drivers.name || null,
    archetype,
    marketBeliefFamily: {
      anchorCell: anchor,
      families,
      narrative,
    },
    valueDriverGradient: gradient,
    counterfactualArena,
    monitoringFocus,
    memo: {
      headline: "AURORA Omega spine compiled the market belief, value-driver gradient, and minimal decision-flip scenarios.",
      marketBelief: narrative.narrative,
      fragility: narrative.fragility,
      primaryDriver: gradient?.dominant?.label || "unknown",
      bullCase: counterfactualArena?.minimumViableBullCase?.oneLine || null,
      bearCase: counterfactualArena?.minimumViableBearCase?.oneLine || null,
      monitor: monitoringFocus.primaryVariable || null,
    },
  };
}
