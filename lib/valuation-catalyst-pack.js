function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function fmtPct(value, digits = 1) {
  return isFiniteNumber(value) ? `${(value * 100).toFixed(digits)}%` : "N/A";
}

function textIncludes(text, terms) {
  const haystack = String(text || "").toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function catalyst(id, label, score, stance, evidence, falsifiers, status = "estimated") {
  return {
    id,
    label,
    score: Number(clamp(score, 0, 1).toFixed(4)),
    stance,
    status,
    evidence: evidence.filter(Boolean).slice(0, 5),
    falsifiers: falsifiers.filter(Boolean).slice(0, 5),
  };
}

function evidenceItemsFor(evidencePack = {}, id) {
  const items = Array.isArray(evidencePack.items) ? evidencePack.items : [];
  return items.filter((item) => Array.isArray(item.catalystTags) && item.catalystTags.includes(id));
}

function evidenceAdjustment(items = [], id) {
  const raw = items.reduce((sum, item) => {
    if (item.polarity === "positive") return sum + (id === "regulation" ? 0.02 : 0.035);
    if (item.polarity === "negative") return sum - (id === "regulation" ? 0.055 : 0.04);
    if (item.polarity === "mixed") return sum - 0.012;
    return sum;
  }, 0);
  return clamp(raw, -0.12, 0.12);
}

function evidenceLines(items = []) {
  return items.slice(0, 2).map((item) => {
    const source = item.source || item.provider || "source";
    const polarity = item.polarity && item.polarity !== "neutral" ? `, ${item.polarity}` : "";
    return `${source}: ${item.title}${polarity}.`;
  });
}

function evidenceFalsifiers(items = []) {
  return items
    .filter((item) => item.polarity === "negative" || item.polarity === "mixed")
    .slice(0, 2)
    .map((item) => `${item.title} becomes thesis-confirming rather than a one-off headline.`);
}

function stanceFromScore(score, riskBias = 0) {
  const adjusted = score - riskBias;
  if (adjusted >= 0.64) return "supportive";
  if (adjusted <= 0.38) return "risk";
  return "watch";
}

function scoreStatus(values) {
  const present = values.filter(isFiniteNumber).length;
  if (present === values.length) return "available";
  if (present >= Math.ceil(values.length * 0.6)) return "partial";
  return "estimated";
}

export function buildValuationCatalystPack(input = {}) {
  const drivers = input.drivers || {};
  const snapshot = input.snapshot || {};
  const router = input.router || {};
  const evidencePack = input.evidencePack || input.catalystEvidence || snapshot.catalystEvidence || {};
  const facts = snapshot.facts || {};
  const industryText = [
    drivers.sector,
    drivers.name,
    snapshot.company?.industry,
    snapshot.company?.sicDescription,
    router.dominantRegime?.label,
  ]
    .filter(Boolean)
    .join(" ");
  const revenueCagr = isFiniteNumber(drivers.revenueCagr) ? drivers.revenueCagr : 0;
  const margin = isFiniteNumber(drivers.margin) ? drivers.margin : null;
  const roicSpread = isFiniteNumber(drivers.roic) && isFiniteNumber(drivers.wacc) ? drivers.roic - drivers.wacc : null;
  const reinvestment = isFiniteNumber(drivers.reinvestment) ? drivers.reinvestment : null;
  const thesis = isFiniteNumber(drivers.thesisQuality) ? drivers.thesisQuality : 0.5;
  const demandSupply = isFiniteNumber(drivers.demandSupply) ? drivers.demandSupply : 0.5;
  const bottleneckPower = isFiniteNumber(drivers.bottleneckPower) ? drivers.bottleneckPower : 0.4;
  const capexToRevenue = isFiniteNumber(facts.capexToRevenue) ? facts.capexToRevenue : null;
  const revenueSeries = Array.isArray(facts.revenueSeries) ? facts.revenueSeries : [];
  const latestRevenue = revenueSeries.at(-1)?.value;
  const priorRevenue = revenueSeries.at(0)?.value;
  const revenueSeriesGrowth =
    isFiniteNumber(latestRevenue) && isFiniteNumber(priorRevenue) && priorRevenue > 0 && revenueSeries.length > 1
      ? Math.pow(latestRevenue / priorRevenue, 1 / (revenueSeries.length - 1)) - 1
      : null;

  const semis = textIncludes(industryText, ["semiconductor", "lithography", "equipment", "foundry", "chip"]);
  const software = textIncludes(industryText, ["software", "platform", "cloud", "subscription"]);
  const financial = textIncludes(industryText, ["bank", "insurance", "financial", "credit", "deposit"]);
  const regulated = financial || textIncludes(industryText, ["utility", "healthcare", "pharma", "defense", "telecom", "china"]);
  const cyclical = textIncludes(industryText, ["energy", "materials", "commodity", "autos", "airline", "housing", "industrial", "capacity"]);

  const demandScore = clamp(0.38 + demandSupply * 0.34 + revenueCagr * 1.4 + (revenueSeriesGrowth || 0) * 0.8, 0, 1);
  const supplyScore = clamp(0.42 + bottleneckPower * 0.34 + (semis ? 0.12 : 0) - Math.max(0, Number(capexToRevenue || 0) - 0.18) * 0.55, 0, 1);
  const bottleneckScore = clamp(0.28 + bottleneckPower * 0.52 + (semis ? 0.16 : 0) + (software ? 0.06 : 0), 0, 1);
  const regulationScore = clamp(0.62 - (regulated ? 0.16 : 0) - (financial ? 0.08 : 0) + thesis * 0.12, 0, 1);
  const earningsScore = clamp(0.36 + (margin || 0.12) * 0.72 + Math.max(0, Number(roicSpread || 0)) * 1.7 + revenueCagr * 0.8, 0, 1);
  const capexCycleScore = clamp(
    0.5 +
      (isFiniteNumber(reinvestment) ? (0.52 - reinvestment) * 0.32 : 0) +
      (isFiniteNumber(capexToRevenue) ? (0.16 - capexToRevenue) * 0.6 : 0) -
      (cyclical ? 0.08 : 0) +
      bottleneckPower * 0.08,
    0,
    1,
  );

  const evidenceById = {
    demand: evidenceItemsFor(evidencePack, "demand"),
    supply: evidenceItemsFor(evidencePack, "supply"),
    bottleneck: evidenceItemsFor(evidencePack, "bottleneck"),
    regulation: evidenceItemsFor(evidencePack, "regulation"),
    earnings: evidenceItemsFor(evidencePack, "earnings"),
    capex_cycle: evidenceItemsFor(evidencePack, "capex_cycle"),
  };

  const catalysts = [
    catalyst(
      "demand",
      "Demand trajectory",
      demandScore + evidenceAdjustment(evidenceById.demand, "demand"),
      stanceFromScore(demandScore + evidenceAdjustment(evidenceById.demand, "demand")),
      [
        ...evidenceLines(evidenceById.demand),
        `Demand/supply score ${fmtPct(demandSupply, 0)}.`,
        `Revenue CAGR input ${fmtPct(revenueCagr)}.`,
        isFiniteNumber(revenueSeriesGrowth) ? `Recent reported revenue bridge implies ${fmtPct(revenueSeriesGrowth)} CAGR.` : null,
      ],
      [
        ...evidenceFalsifiers(evidenceById.demand),
        "Orders, backlog, usage, or unit volumes slow before the model lowers growth.",
        "Pricing growth offsets volume weakness for only one filing cycle.",
      ],
      evidenceById.demand.length ? "available" : scoreStatus([drivers.demandSupply, drivers.revenueCagr]),
    ),
    catalyst(
      "supply",
      "Supply response",
      supplyScore + evidenceAdjustment(evidenceById.supply, "supply"),
      stanceFromScore(supplyScore + evidenceAdjustment(evidenceById.supply, "supply"), cyclical ? 0.05 : 0),
      [
        ...evidenceLines(evidenceById.supply),
        `Bottleneck power ${fmtPct(bottleneckPower, 0)}.`,
        isFiniteNumber(capexToRevenue) ? `Capex/revenue ${fmtPct(capexToRevenue)}.` : null,
        semis ? "Semiconductor/equipment language suggests capacity-chain relevance." : null,
      ],
      [
        ...evidenceFalsifiers(evidenceById.supply),
        "New capacity, substitutes, or customer dual-sourcing arrive faster than pricing can adjust.",
        "Lead times normalize while the valuation still assumes scarcity.",
      ],
      evidenceById.supply.length ? "available" : scoreStatus([drivers.bottleneckPower, facts.capexToRevenue]),
    ),
    catalyst(
      "bottleneck",
      "Bottleneck power",
      bottleneckScore + evidenceAdjustment(evidenceById.bottleneck, "bottleneck"),
      stanceFromScore(bottleneckScore + evidenceAdjustment(evidenceById.bottleneck, "bottleneck")),
      [
        ...evidenceLines(evidenceById.bottleneck),
        `Router regime: ${router.dominantRegime?.label || "not classified"}.`,
        `Bottleneck score ${fmtPct(bottleneckPower, 0)}.`,
        semis ? "Industry terms point to scarce technical capacity." : null,
      ],
      [
        ...evidenceFalsifiers(evidenceById.bottleneck),
        "Customers prove credible alternatives or internalize the constrained step.",
        "Scarcity remains true but no longer belongs to this company.",
      ],
      evidenceById.bottleneck.length ? "available" : scoreStatus([drivers.bottleneckPower]),
    ),
    catalyst(
      "regulation",
      "Regulatory and policy drag",
      regulationScore + evidenceAdjustment(evidenceById.regulation, "regulation"),
      stanceFromScore(regulationScore + evidenceAdjustment(evidenceById.regulation, "regulation")),
      [
        ...evidenceLines(evidenceById.regulation),
        regulated ? "Industry is policy-sensitive; require explicit regulation watch." : "No obvious policy-heavy industry flag from current metadata.",
        financial ? "Financial balance-sheet businesses need capital and credit-cycle constraints." : null,
      ],
      [
        ...evidenceFalsifiers(evidenceById.regulation),
        "New regulation changes unit economics, capital intensity, pricing, or customer access.",
        "Export controls, reimbursement, rate caps, or capital rules become thesis-critical.",
      ],
      evidenceById.regulation.length ? "available" : "estimated",
    ),
    catalyst(
      "earnings",
      "Earnings power",
      earningsScore + evidenceAdjustment(evidenceById.earnings, "earnings"),
      stanceFromScore(earningsScore + evidenceAdjustment(evidenceById.earnings, "earnings")),
      [
        ...evidenceLines(evidenceById.earnings),
        `Margin ${fmtPct(margin)}.`,
        isFiniteNumber(roicSpread) ? `ROIC spread ${fmtPct(roicSpread)}.` : null,
        `Thesis quality ${fmtPct(thesis, 0)}.`,
      ],
      [
        ...evidenceFalsifiers(evidenceById.earnings),
        "Reported margin improves while cash conversion deteriorates.",
        "ROIC spread fades before revenue growth slows.",
      ],
      evidenceById.earnings.length ? "available" : scoreStatus([drivers.margin, drivers.roic, drivers.wacc]),
    ),
    catalyst(
      "capex_cycle",
      "Capex and reinvestment cycle",
      capexCycleScore + evidenceAdjustment(evidenceById.capex_cycle, "capex_cycle"),
      stanceFromScore(capexCycleScore + evidenceAdjustment(evidenceById.capex_cycle, "capex_cycle"), cyclical ? 0.04 : 0),
      [
        ...evidenceLines(evidenceById.capex_cycle),
        `Reinvestment ${fmtPct(reinvestment)}.`,
        isFiniteNumber(capexToRevenue) ? `Capex/revenue ${fmtPct(capexToRevenue)}.` : null,
        cyclical ? "Cyclical/capacity language makes reinvestment timing important." : null,
      ],
      [
        ...evidenceFalsifiers(evidenceById.capex_cycle),
        "Growth requires more reinvestment than the current free-cash-flow bridge allows.",
        "Capex cycle turns down because demand is weaker, not because productivity improved.",
      ],
      evidenceById.capex_cycle.length ? "available" : scoreStatus([drivers.reinvestment, facts.capexToRevenue]),
    ),
  ];

  const aggregateScore = catalysts.reduce((sum, item) => sum + item.score, 0) / catalysts.length;
  const dominantCatalysts = [...catalysts].sort((a, b) => b.score - a.score).slice(0, 3);
  const riskCatalysts = catalysts.filter((item) => item.stance === "risk").slice(0, 3);

  return {
    version: "valuation_catalyst_pack_v1",
    source: evidencePack?.items?.length ? "derived_from_sec_fmp_brave_catalyst_news" : "derived_from_sec_fmp_router_inputs",
    status: catalysts.some((item) => item.status === "available") ? "partial" : "estimated",
    aggregateScore: Number(aggregateScore.toFixed(4)),
    catalysts,
    dominantCatalysts,
    riskCatalysts,
    evidencePack: evidencePack?.version
      ? {
          version: evidencePack.version,
          status: evidencePack.status,
          asOf: evidencePack.asOf,
          itemCount: Array.isArray(evidencePack.items) ? evidencePack.items.length : 0,
          items: Array.isArray(evidencePack.items) ? evidencePack.items.slice(0, 8) : [],
          providerDiagnostics: evidencePack.providerDiagnostics || [],
        }
      : null,
    warnings: [
      evidencePack?.items?.length ? null : "This is a structured catalyst map, not a live news search.",
      ...(evidencePack?.warnings || []),
      riskCatalysts.length ? `Risk catalysts: ${riskCatalysts.map((item) => item.label).join(", ")}.` : null,
    ].filter(Boolean),
  };
}
