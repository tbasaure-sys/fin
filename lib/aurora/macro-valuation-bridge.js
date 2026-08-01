function clamp(value, low, high) {
  return Math.min(Math.max(Number(value) || 0, low), high);
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function unique(value) {
  return [...new Set(list(value).map((item) => String(item || "").trim()).filter(Boolean))];
}

function validDate(value) {
  const text = String(value || "").trim();
  return Number.isFinite(Date.parse(text)) ? text.slice(0, 10) : null;
}

function documentedLink(row) {
  if (!row || typeof row !== "object" || row.verified !== true) return null;
  const marketId = String(row.marketId || row.market_id || "").trim() || null;
  const factorId = String(row.factorId || row.factor_id || "").trim() || null;
  const driver = String(row.driver || "").trim();
  const axis = String(row.axis || "").trim() || null;
  const provenance = String(row.provenance || "").trim();
  const sourceIds = unique(row.sourceIds || row.source_ids);
  const asOf = validDate(row.asOf || row.as_of);
  const sensitivity = Number(row.sensitivity);
  const direction = Number(row.direction);
  const isLiquidity = factorId === "global_liquidity" && driver === "financing_cost_and_dilution";
  const isMarket = Boolean(marketId) && ["supply", "demand", "price"].includes(axis);
  if (
    (!isLiquidity && !isMarket)
    || !driver
    || !provenance
    || !sourceIds.length
    || !asOf
    || !Number.isFinite(sensitivity)
    || sensitivity <= 0
    || sensitivity > 1
    || ![-1, 1].includes(direction)
  ) return null;
  return {
    marketId,
    factorId,
    driver,
    axis: isLiquidity ? "liquidity" : axis,
    sensitivity,
    direction,
    verified: true,
    provenance,
    sourceIds,
    asOf,
    confidence: Number.isFinite(Number(row.confidence)) ? clamp(row.confidence, 0, 1) : null,
    capPct: Number.isFinite(Number(row.capPct ?? row.cap_pct)) ? clamp(row.capPct ?? row.cap_pct, 0, 0.15) : null,
  };
}

export function buildCompanyExposureGraph({ fingerprint = {}, profile = {}, exposureLinks = null } = {}) {
  const documented = exposureLinks
    || profile.mosaicExposureLinks
    || profile.mosaic_exposure_links
    || fingerprint.mosaicExposureLinks
    || fingerprint.mosaic_exposure_links
    || [];
  const links = list(documented).map(documentedLink).filter(Boolean).map((link) => ({
    ...link,
    from: link.marketId || link.factorId,
    to: "company",
  }));
  const nodes = [
    { id: "company", kind: "company", label: profile.ticker || fingerprint.ticker || "Empresa" },
    ...links.map((link) => ({
      id: link.from,
      kind: link.factorId ? "macro_factor" : "physical_market",
      label: link.from,
    })),
  ].filter((node, index, rows) => rows.findIndex((candidate) => candidate.id === node.id) === index);
  return {
    version: "aurora_company_exposure_graph_v1",
    nodes,
    links,
    policy: "documented_exposures_only",
  };
}

function baseRangeContract(baseValuation) {
  const status = String(baseValuation?.status || "").toLowerCase();
  const range = baseValuation?.range || {};
  const low = Number(range.low);
  const high = Number(range.high);
  if (status === "research_grade") {
    const valid = Number.isFinite(low)
      && Number.isFinite(high)
      && low >= 0
      && low < high
      && (range.central === null || range.central === undefined || range.central === "");
    return { eligible: true, valid, status, range: valid ? { low, high } : range };
  }
  if (status === "decision_ready") {
    const central = Number(range.central);
    const valid = Number.isFinite(low)
      && Number.isFinite(central)
      && Number.isFinite(high)
      && low >= 0
      && low < central
      && central < high;
    return { eligible: true, valid, status, range: valid ? { low, central, high } : range };
  }
  return { eligible: false, valid: false, status, range };
}

function freshAndTraceable(target) {
  return Boolean(
    target
      && target.freshness?.usable === true
      && ["current", "lagged"].includes(String(target.freshness?.status || ""))
      && validDate(target.asOf)
      && unique(target.sourceIds).length,
  );
}

function linkIsCurrentForTarget(link, target) {
  const companyDate = Date.parse(link?.asOf || "");
  const targetDate = Date.parse(target?.asOf || "");
  if (!Number.isFinite(companyDate) || !Number.isFinite(targetDate)) return false;
  if (companyDate > targetDate) return false;
  const ageDays = (targetDate - companyDate) / 86_400_000;
  return ageDays <= 30;
}

function resolveTarget(link, context) {
  if (link.factorId === "global_liquidity") {
    const target = context?.liquidity;
    if (!freshAndTraceable(target) || target.usable !== true || !linkIsCurrentForTarget(link, target)) return null;
    return {
      kind: "liquidity",
      id: "global_liquidity",
      signal: clamp(Number(target.axis) / 100, -1, 1),
      confidence: clamp(target.confidence, 0, 1),
      sourceIds: unique(target.sourceIds),
      asOf: validDate(target.asOf),
    };
  }
  const market = list(context?.markets).find((candidate) => candidate?.id === link.marketId);
  if (!freshAndTraceable(market) || !linkIsCurrentForTarget(link, market)) return null;
  return {
    kind: "market",
    id: market.id,
    signal: clamp(Number(market.axes?.[link.axis]) / 100, -1, 1),
    confidence: clamp(market.confidence, 0, 1),
    sourceIds: unique(market.sourceIds),
    asOf: validDate(market.asOf),
  };
}

export function applyMosaicContextToValuation({ baseValuation = {}, fingerprint = {}, exposures = {}, context = {} } = {}) {
  const contract = baseRangeContract(baseValuation);
  const preservedRange = contract.valid ? contract.range : (baseValuation.range || {});
  const unchanged = {
    version: "aurora_mosaic_bridge_v1",
    base: { ...baseValuation, range: preservedRange },
    contextual: { ...baseValuation, range: preservedRange },
    adjustments: [],
    status: !contract.eligible
      ? "base_valuation_ineligible"
      : contract.valid
        ? "no_material_context_link"
        : "base_valuation_unavailable",
  };
  if (!contract.eligible || !contract.valid || context.version !== "mosaic_context_v2") return unchanged;

  const adjustments = [];
  for (const link of list(exposures.links)) {
    if (!link?.verified || !unique(link.sourceIds).length || !validDate(link.asOf)) continue;
    const target = resolveTarget(link, context);
    if (!target) continue;
    const sensitivity = clamp(link.sensitivity, 0, 1);
    const targetConfidence = target.confidence;
    const confidence = link.confidence === null || link.confidence === undefined
      ? targetConfidence
      : Math.min(targetConfidence, clamp(link.confidence, 0, 1));
    const defaultCapPct = link.factorId === "global_liquidity" ? 0.15 : 0.12;
    const capPct = link.capPct === null || link.capPct === undefined
      ? defaultCapPct
      : Math.min(defaultCapPct, clamp(link.capPct, 0, defaultCapPct));
    const centralImpactPct = clamp(
      target.signal * confidence * sensitivity * 0.18 * link.direction,
      -capPct,
      capPct,
    );
    if (Math.abs(centralImpactPct) < 0.005) continue;
    const marketSourceIds = target.kind === "market" ? target.sourceIds : [];
    const liquiditySourceIds = target.kind === "liquidity" ? target.sourceIds : [];
    adjustments.push({
      driver: link.driver,
      marketId: link.marketId || null,
      factorId: link.factorId || null,
      axis: link.axis,
      signal: target.signal,
      sensitivity,
      confidence,
      centralImpactPct,
      capPct,
      sourceIds: unique([...target.sourceIds, ...link.sourceIds]),
      marketSourceIds,
      liquiditySourceIds,
      companySourceIds: unique(link.sourceIds),
      asOf: { context: target.asOf, company: link.asOf },
      provenance: link.provenance,
      chain: `${target.id} -> ${link.driver} -> valuation`,
    });
  }
  if (!adjustments.length) return unchanged;

  const aggregateImpact = clamp(adjustments.reduce((sum, item) => sum + item.centralImpactPct, 0), -0.18, 0.18);
  const uncertaintyExpansion = clamp(
    adjustments.reduce(
      (sum, item) => sum + Math.abs(item.signal) * item.sensitivity * (1 - item.confidence * 0.45),
      0,
    ) * 0.11,
    0.015,
    0.18,
  );
  const contextualRange = contract.status === "decision_ready"
    ? {
        low: Math.max(0, contract.range.low * (1 + aggregateImpact - uncertaintyExpansion)),
        central: Math.max(0, contract.range.central * (1 + aggregateImpact)),
        high: Math.max(0, contract.range.high * (1 + aggregateImpact + uncertaintyExpansion)),
      }
    : {
        low: Math.max(0, contract.range.low * (1 + aggregateImpact - uncertaintyExpansion)),
        high: Math.max(0, contract.range.high * (1 + aggregateImpact + uncertaintyExpansion)),
      };

  return {
    version: "aurora_mosaic_bridge_v1",
    status: "context_applied",
    base: { ...baseValuation, range: contract.range },
    contextual: { ...baseValuation, range: contextualRange },
    adjustments,
    aggregateImpactPct: aggregateImpact,
    uncertaintyExpansionPct: uncertaintyExpansion,
    context: {
      version: context.version,
      asOf: context.asOf || null,
      status: context.status || "unknown",
    },
    fingerprint: { stage: fingerprint.stage, archetype: fingerprint.primaryArchetype },
  };
}
