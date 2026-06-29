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

function firstFinite(...values) {
  for (const value of values) {
    const parsed = numeric(value, null);
    if (isFiniteNumber(parsed)) return parsed;
  }
  return null;
}

function textSignal(input = {}, key, fallback = null) {
  const signals = input.evidence?.textSignals || input.evidence?.signals || input.compiled?.evidenceSignals || {};
  return numeric(signals[key], fallback);
}

function getDrivers(input = {}) {
  return input.compiled?.drivers || input.drivers || {};
}

function getCompany(input = {}) {
  const company = input.company || input.profile || {};
  const drivers = getDrivers(input);
  return {
    ticker: company.ticker || input.ticker || input.compiled?.ticker || drivers.ticker || null,
    name: company.name || input.name || input.compiled?.name || drivers.name || null,
    sector: company.sector || drivers.sector || input.sector || null,
    industry: company.industry || input.industry || null,
  };
}

function normalizeCompetitors(input = {}) {
  const raw =
    input.competitors ||
    input.peerSet ||
    input.peers ||
    input.competitiveLandscape?.competitors ||
    input.competitorGraph?.competitors ||
    input.competitiveMoat?.competitors ||
    [];
  return arrayOrEmpty(raw)
    .map((item, index) => ({
      id: item.id || item.ticker || item.name || `competitor_${index + 1}`,
      ticker: item.ticker || null,
      name: item.name || item.companyName || item.ticker || `Competitor ${index + 1}`,
      marketShare: numeric(item.marketShare, numeric(item.share, null)),
      shareGain: numeric(item.shareGain, numeric(item.marketShareGain, numeric(item.shareChange, 0))),
      revenueGrowth: numeric(item.revenueGrowth, numeric(item.growth, null)),
      grossMargin: numeric(item.grossMargin, numeric(item.margin, null)),
      roic: numeric(item.roic, numeric(item.returnOnInvestedCapital, null)),
      capacityGrowth: numeric(item.capacityGrowth, numeric(item.supplyGrowth, numeric(item.newCapacityGrowth, 0))),
      pricePressure: numeric(item.pricePressure, numeric(item.priceCutting, numeric(item.discounting, 0))),
      substitutionRisk: numeric(item.substitutionRisk, numeric(item.productSubstitutionRisk, 0)),
      productOverlap: numeric(item.productOverlap, numeric(item.overlap, 0.55)),
      customerOverlap: numeric(item.customerOverlap, 0.35),
      switchingCostDisadvantage: numeric(item.switchingCostDisadvantage, numeric(item.switchingCostAdvantage, 0)),
      rdIntensity: numeric(item.rdIntensity, numeric(item.researchIntensity, null)),
      scaleScore: numeric(item.scaleScore, numeric(item.scale, null)),
      qualityScore: numeric(item.qualityScore, numeric(item.quality, null)),
      source: item.source || null,
    }))
    .filter((item) => item.name || item.ticker);
}

function companyCompetitiveState(input = {}) {
  const drivers = getDrivers(input);
  const graph = input.driverGraph || {};
  const semis = input.semiconductorTwin || {};
  const pricingPower = clamp(textSignal(input, "pricingPower", numeric(drivers.pricingPower, 0.45)), 0, 1);
  const demandVisibility = clamp(textSignal(input, "demandVisibility", numeric(drivers.demandSupply, 0.5)), 0, 1);
  const bottleneckPower = clamp(numeric(drivers.bottleneckPower, numeric(semis.scores?.bottleneckDurability, 0.45)), 0, 1);
  const roic = numeric(drivers.roic, null);
  const wacc = numeric(drivers.wacc, null);
  const moatHalfLifeYears = numeric(graph.derived?.moatHalfLifeYears, null);
  return {
    marketShare: numeric(input.marketShare, numeric(input.competitiveLandscape?.marketShare, null)),
    revenueGrowth: numeric(drivers.revenueCagr, null),
    grossMargin: numeric(drivers.margin, null),
    roic,
    wacc,
    roicSpread: isFiniteNumber(roic) && isFiniteNumber(wacc) ? roic - wacc : null,
    pricingPower,
    demandVisibility,
    bottleneckPower,
    moatHalfLifeYears,
  };
}

function competitorThreat(competitor, company) {
  const shareThreat = clamp(0.42 + competitor.shareGain * 1.5 + Math.max(0, numeric(competitor.marketShare, 0) - numeric(company.marketShare, 0)) * 0.18, 0, 1);
  const priceThreat = clamp(competitor.pricePressure * 0.85 + competitor.productOverlap * 0.22 + competitor.customerOverlap * 0.18, 0, 1);
  const capacityThreat = clamp(competitor.capacityGrowth * 1.35 + competitor.productOverlap * 0.16, 0, 1);
  const innovationThreat = clamp(
    (isFiniteNumber(competitor.rdIntensity) ? competitor.rdIntensity * 1.4 : 0.18) +
      numeric(competitor.qualityScore, 0.45) * 0.22 +
      competitor.substitutionRisk * 0.5,
    0,
    1,
  );
  const economicsThreat = clamp(
    (isFiniteNumber(competitor.roic) && isFiniteNumber(company.roic) ? Math.max(0, competitor.roic - company.roic) * 1.4 : 0) +
      (isFiniteNumber(competitor.grossMargin) && isFiniteNumber(company.grossMargin)
        ? Math.max(0, competitor.grossMargin - company.grossMargin) * 0.9
        : 0),
    0,
    1,
  );
  const maxComponent = Math.max(shareThreat, priceThreat, capacityThreat, innovationThreat, economicsThreat);
  const aggregateThreat = clamp(
    maxComponent * 0.32 +
      shareThreat * 0.18 +
      priceThreat * 0.22 +
      capacityThreat * 0.18 +
      innovationThreat * 0.16 +
      economicsThreat * 0.12 -
      company.pricingPower * 0.05 -
      company.bottleneckPower * 0.06,
    0,
    1,
  );
  const primaryThreat = [
    ["share_gain", shareThreat],
    ["price_pressure", priceThreat],
    ["capacity_response", capacityThreat],
    ["innovation_substitution", innovationThreat],
    ["superior_unit_economics", economicsThreat],
  ].sort((a, b) => b[1] - a[1])[0][0];
  return {
    ...competitor,
    threat: {
      aggregate: aggregateThreat,
      shareThreat,
      priceThreat,
      capacityThreat,
      innovationThreat,
      economicsThreat,
      primaryThreat,
    },
  };
}

function hhi(shares) {
  const clean = shares.filter(isFiniteNumber);
  if (!clean.length) return null;
  return clean.reduce((sum, share) => sum + share * share, 0);
}

function aggregateThreats(scoredCompetitors, company) {
  const threats = scoredCompetitors.map((item) => item.threat.aggregate);
  const maxThreat = threats.length ? Math.max(...threats) : null;
  const averageThreat = threats.length ? threats.reduce((sum, value) => sum + value, 0) / threats.length : null;
  const shares = [
    company.marketShare,
    ...scoredCompetitors.map((item) => item.marketShare),
  ].filter(isFiniteNumber);
  return {
    competitorCount: scoredCompetitors.length,
    maxThreat,
    averageThreat,
    shareAtRisk: scoredCompetitors.reduce((sum, item) => sum + Math.max(0, item.shareGain) * clamp(item.productOverlap, 0, 1), 0),
    pricePressure: scoredCompetitors.length ? Math.max(...scoredCompetitors.map((item) => item.threat.priceThreat)) : null,
    capacityPressure: scoredCompetitors.length ? Math.max(...scoredCompetitors.map((item) => item.threat.capacityThreat)) : null,
    innovationPressure: scoredCompetitors.length ? Math.max(...scoredCompetitors.map((item) => item.threat.innovationThreat)) : null,
    marketConcentrationHhi: hhi(shares),
  };
}

function buildGraph(companyIdentity, scoredCompetitors) {
  const companyNode = {
    id: "company",
    type: "company",
    ticker: companyIdentity.ticker,
    label: companyIdentity.name || companyIdentity.ticker || "Company",
  };
  const competitorNodes = scoredCompetitors.map((item) => ({
    id: item.id,
    type: "competitor",
    ticker: item.ticker,
    label: item.name,
    threat: item.threat.aggregate,
    primaryThreat: item.threat.primaryThreat,
  }));
  const edges = scoredCompetitors.map((item) => ({
    from: item.id,
    to: "company",
    relation: item.threat.primaryThreat,
    weight: item.threat.aggregate,
    explanation:
      item.threat.primaryThreat === "price_pressure"
        ? "Competitor pressure can compress ASP or margin."
        : item.threat.primaryThreat === "capacity_response"
          ? "Competitor supply can shorten bottleneck duration."
          : item.threat.primaryThreat === "innovation_substitution"
            ? "Competitor innovation can shorten moat half-life."
            : item.threat.primaryThreat === "share_gain"
              ? "Competitor share gains can reduce growth runway."
              : "Competitor unit economics can pull returns toward industry parity.",
  }));
  return {
    nodes: [companyNode, ...competitorNodes],
    edges,
  };
}

function buildMoatAdjustment(company, aggregate) {
  const baseHalfLife = numeric(company.moatHalfLifeYears, null);
  const maxThreat = numeric(aggregate.maxThreat, 0.35);
  const averageThreat = numeric(aggregate.averageThreat, 0.35);
  const support = clamp(company.pricingPower * 0.28 + company.bottleneckPower * 0.42 + Math.max(0, numeric(company.roicSpread, 0)) * 1.2, 0, 1);
  const pressure = clamp(maxThreat * 0.55 + averageThreat * 0.25 + clamp(aggregate.shareAtRisk * 1.2, 0, 0.3), 0, 1);
  const extremeThreatPenalty = Math.max(0, maxThreat - 0.55) * 8;
  const deltaYears = clamp(support * 2.2 - pressure * 4.2 - extremeThreatPenalty, -6, 4);
  const adjustedHalfLifeYears = isFiniteNumber(baseHalfLife) ? clamp(baseHalfLife + deltaYears, 1, 20) : null;
  return {
    baseHalfLifeYears: baseHalfLife,
    adjustedHalfLifeYears,
    deltaYears,
    support,
    pressure,
    roicFadeMultiplier: clamp(1 - pressure * 0.22 + support * 0.12, 0.72, 1.16),
    forecastUncertaintyMultiplier: clamp(1 + pressure * 0.28 - support * 0.08, 0.92, 1.45),
  };
}

function buildDecision(aggregate, moatAdjustment) {
  if (!aggregate.competitorCount) return "competitive_graph_pending";
  if (numeric(aggregate.maxThreat, 0) >= 0.68 || numeric(moatAdjustment.deltaYears, 0) <= -2.5) return "moat_fade_risk";
  if (numeric(aggregate.maxThreat, 0) >= 0.48 || numeric(moatAdjustment.deltaYears, 0) < -0.75) return "competitive_pressure_watch";
  return "competitive_position_supported";
}

function falsifiers(aggregate, moatAdjustment, topCompetitor) {
  return [
    topCompetitor ? `${topCompetitor.name} keeps gaining share in overlapping products.` : null,
    numeric(aggregate.pricePressure, 0) > 0.5 ? "Competitor price cuts force ASP or gross-margin compression." : null,
    numeric(aggregate.capacityPressure, 0) > 0.5 ? "Competitor capacity additions shorten the bottleneck window." : null,
    numeric(aggregate.innovationPressure, 0) > 0.5 ? "A rival product narrows performance or switching-cost advantage." : null,
    numeric(moatAdjustment.deltaYears, 0) < 0 ? "Observed ROIC spread fades faster than the adjusted moat half-life." : null,
  ].filter(Boolean);
}

export function buildAuroraCompetitiveMoatEngine(input = {}, options = {}) {
  const companyIdentity = getCompany(input);
  const company = companyCompetitiveState(input);
  const competitors = normalizeCompetitors(input).map((item) => competitorThreat(item, company));
  competitors.sort((a, b) => b.threat.aggregate - a.threat.aggregate);
  const aggregate = aggregateThreats(competitors, company);
  const graph = buildGraph(companyIdentity, competitors);
  const moatAdjustment = buildMoatAdjustment(company, aggregate);
  const decision = buildDecision(aggregate, moatAdjustment);
  const topCompetitor = competitors[0] || null;

  return {
    version: "aurora_competitive_moat_engine_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    ticker: companyIdentity.ticker,
    name: companyIdentity.name,
    decision,
    company,
    competitors,
    aggregate,
    graph,
    moatAdjustment,
    falsifiers: falsifiers(aggregate, moatAdjustment, topCompetitor),
    dashboard: {
      status: competitors.length ? "ready" : "pending",
      headline:
        decision === "competitive_position_supported"
          ? "Competitive graph supports moat persistence."
          : decision === "moat_fade_risk"
            ? "Competitive graph warns that moat half-life may be too long."
            : decision === "competitive_pressure_watch"
              ? "Competitive graph shows pressure worth monitoring."
              : "Competitive graph needs peer inputs.",
      topCompetitor: topCompetitor
        ? {
            ticker: topCompetitor.ticker,
            name: topCompetitor.name,
            threat: topCompetitor.threat.aggregate,
            primaryThreat: topCompetitor.threat.primaryThreat,
          }
        : null,
      moatHalfLife: {
        base: moatAdjustment.baseHalfLifeYears,
        adjusted: moatAdjustment.adjustedHalfLifeYears,
        delta: moatAdjustment.deltaYears,
      },
    },
    memo: {
      headline: `${decision.replaceAll("_", " ")} with ${aggregate.competitorCount} competitor nodes.`,
      primaryQuestion:
        decision === "moat_fade_risk"
          ? "Is the assumed moat half-life too long given observable competitor pressure?"
          : "Which competitor can shorten the economic fade path?",
      topFalsifier: falsifiers(aggregate, moatAdjustment, topCompetitor)[0] || null,
    },
  };
}
