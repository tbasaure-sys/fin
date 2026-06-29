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

function firstFinite(...values) {
  for (const value of values) {
    const parsed = numeric(value, null);
    if (isFiniteNumber(parsed)) return parsed;
  }
  return null;
}

function companyText(input = {}) {
  const company = input.company || input.profile || {};
  return `${company.ticker || input.ticker || ""} ${company.name || input.name || ""} ${company.sector || ""} ${company.industry || ""} ${
    input.sector || ""
  } ${input.industry || ""}`.toLowerCase();
}

function isSemiconductorBusiness(input = {}) {
  const text = companyText(input);
  return /semiconductor|chip|lithography|foundry|wafer|fab|memory|euv|asic|gpu|integrated circuit|semi cap|semicap/.test(text);
}

function inputBlock(input = {}) {
  return {
    ...(input.industryEquilibrium || {}),
    ...(input.productMarket || {}),
    ...(input.equilibrium?.productMarket || {}),
    ...(input.sectorTwin || {}),
    ...(input.industryData || {}),
    ...(input.semiconductor || {}),
    ...(input.semi || {}),
  };
}

function evidenceSignal(input = {}, key, fallback = null) {
  const signals = input.evidence?.textSignals || input.evidence?.signals || input.compiled?.evidenceSignals || {};
  return numeric(signals[key], fallback);
}

function normalizeSemiconductorInputs(input = {}) {
  const block = inputBlock(input);
  const capacity = firstFinite(block.capacity, block.waferCapacity, block.installedCapacity);
  const capacityAdditions = firstFinite(block.capacityAdditions, block.announcedCapacity, block.newCapacity, 0);
  const capacityGrowth = firstFinite(
    block.capacityGrowth,
    block.supplyGrowth,
    block.waferCapacityGrowth,
    isFiniteNumber(capacity) && isFiniteNumber(capacityAdditions) ? capacityAdditions / Math.max(1, capacity) : null,
    0,
  );
  const demand = firstFinite(block.demand, block.industryDemand, block.unitDemand);
  const demandGrowth = firstFinite(block.demandGrowth, block.industryDemandGrowth, block.unitDemandGrowth, block.backlogGrowth, 0);
  const utilization = firstFinite(block.utilization, block.fabUtilization, safeDivide(demand, capacity, null));
  const bookToBill = firstFinite(block.bookToBill, block.ordersToShipments, null);
  const backlogGrowth = firstFinite(block.backlogGrowth, block.orderBacklogGrowth, null);
  const inventory = firstFinite(block.inventory, null);
  const normalInventory = firstFinite(block.normalInventory, block.targetInventory, null);
  const inventoryDays = firstFinite(block.inventoryDays, block.daysInventory, block.dio, null);
  const normalInventoryDays = firstFinite(block.normalInventoryDays, block.targetInventoryDays, null);
  const inventoryGrowth = firstFinite(block.inventoryGrowth, block.inventoryYoY, 0);
  const aspGrowth = firstFinite(block.aspGrowth, block.averageSellingPriceGrowth, block.productPriceGrowth, block.pricingGrowth, 0);
  const pricingPower = firstFinite(block.pricingPower, evidenceSignal(input, "pricingPower", null), 0.45);
  const demandVisibility = firstFinite(block.demandVisibility, evidenceSignal(input, "demandVisibility", null), null);
  const capacityConstraint = firstFinite(block.capacityConstraint, evidenceSignal(input, "capacityConstraint", null), null);
  const capexGrowth = firstFinite(block.capexGrowth, block.foundryCapexGrowth, block.industryCapexGrowth, 0);
  const leadTimeMonths = firstFinite(block.leadTimeMonths, block.equipmentLeadTimeMonths, block.toolLeadTimeMonths, 12);
  const orderCancellations = firstFinite(block.orderCancellations, block.cancellationRate, 0);
  const customerConcentration = firstFinite(block.customerConcentration, block.topCustomerShare, 0.25);
  const exportControlRisk = firstFinite(block.exportControlRisk, block.chinaRestrictionRisk, 0);
  const leadingNodeMix = firstFinite(block.leadingNodeMix, block.advancedNodeMix, block.euvMix, null);
  const memoryExposure = firstFinite(block.memoryExposure, block.memoryRevenueShare, 0);

  return {
    capacity,
    capacityAdditions,
    capacityGrowth,
    demand,
    demandGrowth,
    utilization,
    bookToBill,
    backlogGrowth,
    inventory,
    normalInventory,
    inventoryDays,
    normalInventoryDays,
    inventoryGrowth,
    aspGrowth,
    pricingPower,
    demandVisibility,
    capacityConstraint,
    capexGrowth,
    leadTimeMonths,
    orderCancellations,
    customerConcentration,
    exportControlRisk,
    leadingNodeMix,
    memoryExposure,
  };
}

function scoreInventoryOverhang(inputs) {
  const inventoryRatio =
    isFiniteNumber(inputs.inventoryDays) && isFiniteNumber(inputs.normalInventoryDays)
      ? safeDivide(inputs.inventoryDays, inputs.normalInventoryDays, null)
      : isFiniteNumber(inputs.inventory) && isFiniteNumber(inputs.normalInventory)
        ? safeDivide(inputs.inventory, inputs.normalInventory, null)
        : null;
  const ratioPressure = isFiniteNumber(inventoryRatio) ? (inventoryRatio - 1) * 0.9 : 0;
  return clamp(0.35 + ratioPressure + inputs.inventoryGrowth * 0.9 + inputs.orderCancellations * 0.55 - inputs.aspGrowth * 0.45, 0, 1);
}

function scoreDemandVisibility(inputs) {
  const bookSignal = isFiniteNumber(inputs.bookToBill) ? (inputs.bookToBill - 1) * 0.95 : 0;
  const backlogSignal = isFiniteNumber(inputs.backlogGrowth) ? inputs.backlogGrowth * 0.72 : 0;
  const explicit = isFiniteNumber(inputs.demandVisibility) ? (inputs.demandVisibility - 0.5) * 0.55 : 0;
  return clamp(0.48 + inputs.demandGrowth * 0.9 + bookSignal + backlogSignal + explicit - inputs.orderCancellations * 0.45, 0, 1);
}

function scoreCapacityPressure(inputs, inventoryOverhang, demandVisibility) {
  const utilizationSignal = isFiniteNumber(inputs.utilization) ? (inputs.utilization - 0.84) * 1.8 : 0;
  const bookSignal = isFiniteNumber(inputs.bookToBill) ? (inputs.bookToBill - 1) * 0.7 : 0;
  const explicitConstraint = isFiniteNumber(inputs.capacityConstraint) ? (inputs.capacityConstraint - 0.5) * 0.35 : 0;
  const leadTimeSignal = clamp((inputs.leadTimeMonths - 9) / 30, 0, 0.35);
  return clamp(
    0.48 +
      (inputs.demandGrowth - inputs.capacityGrowth) * 1.05 +
      utilizationSignal +
      bookSignal +
      leadTimeSignal +
      explicitConstraint +
      (demandVisibility - 0.5) * 0.22 -
      inventoryOverhang * 0.18,
    0,
    1,
  );
}

function scoreAspPower(inputs, capacityPressure, inventoryOverhang) {
  return clamp(0.42 + inputs.aspGrowth * 1.9 + (inputs.pricingPower - 0.45) * 0.55 + capacityPressure * 0.24 - inventoryOverhang * 0.32, 0, 1);
}

function scoreCapexCyclePressure(inputs) {
  return clamp(0.36 + inputs.capacityGrowth * 1.1 + inputs.capexGrowth * 0.95 + clamp((inputs.leadTimeMonths - 12) / 36, 0, 0.22), 0, 1);
}

function scoreBottleneckDurability(inputs, scores) {
  const leadingNodeBonus = isFiniteNumber(inputs.leadingNodeMix) ? clamp((inputs.leadingNodeMix - 0.35) * 0.22, 0, 0.12) : 0;
  const memoryPenalty = clamp(inputs.memoryExposure * 0.12, 0, 0.12);
  const concentrationPenalty = clamp(Math.max(0, inputs.customerConcentration - 0.35) * 0.18, 0, 0.12);
  const exportPenalty = clamp(inputs.exportControlRisk * 0.12, 0, 0.12);
  return clamp(
    scores.capacityPressure * 0.36 +
      scores.aspPower * 0.22 +
      scores.demandVisibility * 0.18 +
      (inputs.leadTimeMonths >= 12 ? 0.1 : 0) +
      leadingNodeBonus -
      memoryPenalty -
      concentrationPenalty -
      exportPenalty,
    0,
    1,
  );
}

function scoreCycleRisk(inputs, scores) {
  const supplyExcess = Math.max(0, inputs.capacityGrowth - inputs.demandGrowth);
  const aspDecline = Math.max(0, -inputs.aspGrowth);
  return clamp(
    0.2 +
      scores.inventoryOverhang * 0.36 +
      scores.capexCyclePressure * 0.24 +
      supplyExcess * 1.15 +
      aspDecline * 1.1 +
      inputs.orderCancellations * 0.45 +
      inputs.memoryExposure * 0.12 +
      inputs.exportControlRisk * 0.12 -
      scores.capacityPressure * 0.12,
    0,
    1,
  );
}

function classifyState(scores) {
  if (scores.cycleRisk >= 0.68 && (scores.inventoryOverhang >= 0.58 || scores.capexCyclePressure >= 0.68)) return "capacity_glut_risk";
  if (scores.bottleneckDurability >= 0.68 && scores.capacityPressure >= 0.62 && scores.aspPower >= 0.55) return "durable_bottleneck";
  if (scores.inventoryOverhang >= 0.62 && scores.demandVisibility < 0.55) return "inventory_reset";
  if (scores.capacityPressure >= 0.58 && scores.capexCyclePressure >= 0.58) return "cyclical_upcycle_supply_response";
  if (scores.demandVisibility >= 0.62 && scores.aspPower >= 0.55) return "demand_led_upcycle";
  return "mixed_cycle";
}

function decisionFromState(state) {
  return (
    {
      durable_bottleneck: "semiconductor_bottleneck_supported",
      demand_led_upcycle: "semiconductor_cycle_watch",
      cyclical_upcycle_supply_response: "semiconductor_cycle_watch",
      inventory_reset: "semiconductor_inventory_reset",
      capacity_glut_risk: "semiconductor_glut_risk",
      mixed_cycle: "semiconductor_mixed",
    }[state] || "semiconductor_mixed"
  );
}

function buildAdjustments(scores) {
  return {
    bottleneckEvidenceDelta: clamp((scores.bottleneckDurability - 0.5) * 0.22, -0.12, 0.14),
    marginDurabilityDelta: clamp((scores.aspPower - 0.5) * 0.16 - Math.max(0, scores.inventoryOverhang - 0.55) * 0.08, -0.12, 0.14),
    reinvestmentConfidenceDelta: clamp((scores.demandVisibility - 0.5) * 0.12 - Math.max(0, scores.cycleRisk - 0.55) * 0.12, -0.12, 0.12),
    cycleRiskPenalty: clamp(Math.max(0, scores.cycleRisk - 0.5) * 0.24, 0, 0.18),
    forecastUncertaintyMultiplier: clamp(1 + scores.cycleRisk * 0.32 - Math.max(0, scores.bottleneckDurability - 0.65) * 0.08, 0.92, 1.58),
  };
}

function buildFalsifiers(inputs, scores, state) {
  return [
    scores.bottleneckDurability >= 0.58 ? "Fab utilization falls below 85% while ASP stops rising." : null,
    scores.capacityPressure >= 0.55 ? "Book-to-bill drops below 1.0 or backlog growth turns negative." : null,
    scores.inventoryOverhang >= 0.5 ? "Inventory days remain above normal for two reporting periods." : null,
    scores.capexCyclePressure >= 0.55 ? "New capacity arrives faster than demand growth absorbs it." : null,
    scores.aspPower >= 0.55 ? "ASP growth turns negative despite claimed pricing power." : null,
    inputs.exportControlRisk > 0.35 ? "Export controls materially reduce addressable demand or delay shipments." : null,
    state === "capacity_glut_risk" ? "Order cancellations rise while utilization and ASP both decline." : null,
  ].filter(Boolean);
}

function companyIdentity(input = {}) {
  const company = input.company || input.profile || {};
  return {
    ticker: company.ticker || input.ticker || input.compiled?.ticker || null,
    name: company.name || input.name || input.compiled?.name || null,
  };
}

export function buildAuroraSemiconductorTwin(input = {}, options = {}) {
  const identity = companyIdentity(input);
  if (!isSemiconductorBusiness(input)) {
    return {
      version: "aurora_semiconductor_twin_v1",
      builtAt: options.builtAt || new Date().toISOString(),
      applicable: false,
      ticker: identity.ticker,
      name: identity.name,
      state: "not_applicable",
      decision: "sector_twin_not_applicable",
      reason: "Company is not classified as a semiconductor, semicap, memory, foundry, lithography, GPU, or chip business.",
      scores: {},
      adjustments: {},
      falsifiers: [],
      dashboard: {
        status: "not_applicable",
        state: "not_applicable",
        headline: "Semiconductor twin not applicable.",
      },
    };
  }

  const inputs = normalizeSemiconductorInputs(input);
  const inventoryOverhang = scoreInventoryOverhang(inputs);
  const demandVisibility = scoreDemandVisibility(inputs);
  const capacityPressure = scoreCapacityPressure(inputs, inventoryOverhang, demandVisibility);
  const aspPower = scoreAspPower(inputs, capacityPressure, inventoryOverhang);
  const capexCyclePressure = scoreCapexCyclePressure(inputs);
  const partialScores = { inventoryOverhang, demandVisibility, capacityPressure, aspPower, capexCyclePressure };
  const bottleneckDurability = scoreBottleneckDurability(inputs, partialScores);
  const cycleRisk = scoreCycleRisk(inputs, { ...partialScores, bottleneckDurability });
  const scores = {
    capacityPressure,
    demandVisibility,
    inventoryOverhang,
    aspPower,
    capexCyclePressure,
    bottleneckDurability,
    cycleRisk,
  };
  const state = classifyState(scores);
  const decision = decisionFromState(state);
  const adjustments = buildAdjustments(scores);
  const falsifiers = buildFalsifiers(inputs, scores, state);

  return {
    version: "aurora_semiconductor_twin_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    applicable: true,
    ticker: identity.ticker,
    name: identity.name,
    inputs,
    scores,
    state,
    decision,
    adjustments,
    falsifiers,
    dashboard: {
      status: "ready",
      state,
      decision,
      headline:
        decision === "semiconductor_bottleneck_supported"
          ? "Semiconductor twin supports a durable bottleneck read."
          : decision === "semiconductor_glut_risk"
            ? "Semiconductor twin warns that supply, inventory, or ASP may be cycling down."
            : "Semiconductor twin is mixed; keep cycle and bottleneck evidence separate.",
      bars: [
        { key: "capacityPressure", label: "Capacity pressure", value: capacityPressure },
        { key: "inventoryOverhang", label: "Inventory overhang", value: inventoryOverhang },
        { key: "aspPower", label: "ASP power", value: aspPower },
        { key: "bottleneckDurability", label: "Bottleneck durability", value: bottleneckDurability },
        { key: "cycleRisk", label: "Cycle risk", value: cycleRisk },
      ],
    },
    memo: {
      headline: `${state.replaceAll("_", " ")} with bottleneck durability ${bottleneckDurability.toFixed(2)} and cycle risk ${cycleRisk.toFixed(2)}.`,
      primaryQuestion:
        decision === "semiconductor_bottleneck_supported"
          ? "Is scarce technical capacity durable enough to sustain pricing and ROIC?"
          : decision === "semiconductor_glut_risk"
            ? "Is the thesis extrapolating a cycle as supply and inventory normalize?"
            : "Which evidence separates structural bottleneck from normal semiconductor cyclicality?",
      topFalsifier: falsifiers[0] || null,
    },
  };
}
