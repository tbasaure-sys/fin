function clamp(value, low, high) {
  return Math.min(Math.max(Number(value) || 0, low), high);
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function buildCompanyExposureGraph({ fingerprint = {}, profile = {} } = {}) {
  const text = `${profile.sector || ""} ${profile.industry || ""} ${profile.description || ""}`.toLowerCase();
  const nodes = [
    { id: "company", kind: "company", label: profile.ticker || fingerprint.ticker || "Empresa" },
  ];
  const links = [];
  const financingDependence = clamp(fingerprint.financingDependence, 0, 1);
  if (financingDependence > 0) {
    nodes.push({ id: "global_liquidity", kind: "macro_factor", label: "Liquidez global" });
    links.push({
      from: "global_liquidity",
      to: "company",
      driver: "financing_cost_and_dilution",
      sensitivity: financingDependence,
      direction: 1,
    });
  }
  if (/copper|mining|metal/.test(text)) {
    nodes.push({ id: "refined_copper", kind: "physical_market", label: "Cobre refinado" });
    links.push({ from: "refined_copper", to: "company", driver: "realized_price_and_margin", sensitivity: 0.72, direction: 1 });
  }
  if (/airline|shipping|transport/.test(text)) {
    nodes.push({ id: "energy_and_freight", kind: "physical_market", label: "Energía y fletes" });
    links.push({ from: "energy_and_freight", to: "company", driver: "input_cost_margin", sensitivity: 0.58, direction: -1 });
  }
  if (/semiconductor|grid|electrical equipment|transformer/.test(text)) {
    nodes.push({ id: "industrial_capacity", kind: "physical_market", label: "Capacidad industrial" });
    links.push({ from: "industrial_capacity", to: "company", driver: "capacity_and_backlog", sensitivity: 0.64, direction: 1 });
  }
  return { version: "aurora_company_exposure_graph_v1", nodes, links };
}

function sourceIds(context) {
  return [...new Set(list(context?.evidence).flatMap((item) => list(item.sourceIds)))];
}

export function applyMosaicContextToValuation({ baseValuation = {}, fingerprint = {}, exposures = {}, context = {} } = {}) {
  const baseRange = baseValuation.range || {};
  const original = {
    low: Number(baseRange.low),
    central: Number(baseRange.central),
    high: Number(baseRange.high),
  };
  const validRange = Object.values(original).every(Number.isFinite) && original.low <= original.central && original.central <= original.high;
  const unchanged = {
    version: "aurora_mosaic_bridge_v1",
    base: { ...baseValuation, range: validRange ? original : baseRange },
    contextual: { ...baseValuation, range: validRange ? original : baseRange },
    adjustments: [],
    status: validRange ? "no_material_context_link" : "base_valuation_unavailable",
  };
  if (!validRange || context.version !== "mosaic_context_v2" || context.status !== "current") return unchanged;
  const links = list(exposures.links);
  if (!links.length) return unchanged;
  const evidenceSourceIds = sourceIds(context);
  if (!evidenceSourceIds.length) return unchanged;

  const adjustments = [];
  for (const link of links) {
    let signal = 0;
    let capPct = 0.12;
    if (link.driver === "financing_cost_and_dilution") {
      signal = clamp(Number(context.axes?.liquidity) / 100, -1, 1);
      capPct = 0.15;
    } else if (link.driver === "realized_price_and_margin" || link.driver === "capacity_and_backlog") {
      signal = clamp(Number(context.axes?.supply) / 100, -1, 1);
    } else if (link.driver === "input_cost_margin") {
      signal = clamp(Number(context.axes?.supply) / 100, -1, 1);
    }
    const confidence = clamp(context.confidence, 0, 1);
    const sensitivity = clamp(link.sensitivity, 0, 1);
    const centralImpactPct = clamp(signal * confidence * sensitivity * 0.18 * (link.direction || 1), -capPct, capPct);
    if (Math.abs(centralImpactPct) < 0.005) continue;
    adjustments.push({
      driver: link.driver,
      signal,
      sensitivity,
      confidence,
      centralImpactPct,
      capPct,
      sourceIds: evidenceSourceIds,
      chain: `${link.from} → ${link.driver} → valoración`,
    });
  }
  if (!adjustments.length) return unchanged;

  const aggregateImpact = clamp(adjustments.reduce((sum, item) => sum + item.centralImpactPct, 0), -0.18, 0.18);
  const uncertaintyExpansion = clamp(
    adjustments.reduce((sum, item) => sum + Math.abs(item.signal) * item.sensitivity * (1 - item.confidence * 0.45), 0) * 0.11,
    0.015,
    0.18,
  );
  const contextualRange = {
    low: Math.max(0, original.low * (1 + aggregateImpact - uncertaintyExpansion)),
    central: Math.max(0, original.central * (1 + aggregateImpact)),
    high: Math.max(0, original.high * (1 + aggregateImpact + uncertaintyExpansion)),
  };

  return {
    version: "aurora_mosaic_bridge_v1",
    status: "context_applied",
    base: { ...baseValuation, range: original },
    contextual: { ...baseValuation, range: contextualRange },
    adjustments,
    aggregateImpactPct: aggregateImpact,
    uncertaintyExpansionPct: uncertaintyExpansion,
    context: { version: context.version, asOf: context.asOf || null, confidence: context.confidence },
    fingerprint: { stage: fingerprint.stage, archetype: fingerprint.primaryArchetype },
  };
}

