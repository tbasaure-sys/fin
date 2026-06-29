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

function sectorText(snapshot = {}) {
  const company = snapshot.company || snapshot.profile || {};
  return `${company.sector || ""} ${company.industry || ""} ${snapshot.sector || ""}`.toLowerCase();
}

function inferProductArchetype(snapshot = {}) {
  const explicit = snapshot.equilibrium?.productArchetype || snapshot.productMarket?.archetype || snapshot.industryEquilibrium?.archetype;
  if (explicit) return explicit;
  const text = sectorText(snapshot);
  if (/software|saas|cloud|subscription/.test(text)) return "saas";
  if (/marketplace|exchange|payments|platform|ecommerce/.test(text)) return "marketplace";
  if (/bank|insurance|financial|credit|deposit/.test(text)) return "banking";
  if (/energy|oil|gas|commodity|mining|materials|semiconductor|hardware|shipping|airline|auto|chemical|construction|industrial|memory/.test(text)) {
    return "physical_capacity";
  }
  return "general";
}

function marketInputs(snapshot = {}) {
  return {
    ...(snapshot.industryEquilibrium || {}),
    ...(snapshot.productMarket || {}),
    ...(snapshot.equilibrium?.productMarket || {}),
  };
}

function equityInputs(snapshot = {}) {
  return {
    ...(snapshot.priceFormation || {}),
    ...(snapshot.equityMarket || {}),
    ...(snapshot.equilibrium?.equityMarket || {}),
  };
}

function scoreToLevel(score, positive = true) {
  const value = positive ? score : -score;
  if (value >= 0.35) return "strong_positive";
  if (value >= 0.12) return "positive";
  if (value <= -0.35) return "strong_negative";
  if (value <= -0.12) return "negative";
  return "neutral";
}

function physicalCapacityEquilibrium(inputs = {}) {
  const capacity = numeric(inputs.capacity, null);
  const demand = numeric(inputs.demand, numeric(inputs.industryDemand, null));
  const utilization = numeric(inputs.utilization, safeDivide(demand, capacity, null));
  const inventory = numeric(inputs.inventory, null);
  const normalInventory = numeric(inputs.normalInventory, numeric(inputs.targetInventory, null));
  const announcedCapacity = numeric(inputs.announcedCapacity, numeric(inputs.capacityAdditions, 0)) || 0;
  const leadTimeMonths = numeric(inputs.leadTimeMonths, 12);
  const marginalCost = numeric(inputs.marginalCost, null);
  const productPrice = numeric(inputs.productPrice, numeric(inputs.averageSellingPrice, null));
  const demandSupplyGap = isFiniteNumber(demand) && isFiniteNumber(capacity) ? safeDivide(demand - capacity, capacity, 0) : null;
  const inventoryTightness = isFiniteNumber(inventory) && isFiniteNumber(normalInventory) ? safeDivide(normalInventory - inventory, normalInventory, 0) : null;
  const utilizationPressure = isFiniteNumber(utilization) ? utilization - 0.82 : 0;
  const capacityLagPressure = leadTimeMonths >= 12 ? clamp(announcedCapacity / Math.max(1, capacity || announcedCapacity || 1), 0, 1) * -0.18 : 0;
  const priceCostSpread = isFiniteNumber(productPrice) && isFiniteNumber(marginalCost) ? safeDivide(productPrice - marginalCost, productPrice, 0) : null;
  const pricingPressure = clamp(
    (demandSupplyGap ?? 0) * 0.35 +
      (inventoryTightness ?? 0) * 0.3 +
      utilizationPressure * 0.28 +
      (priceCostSpread ?? 0) * 0.16 +
      capacityLagPressure,
    -1,
    1,
  );
  return {
    archetype: "physical_capacity",
    equation: "Qd(P,X) = Qs(P,Capacity); Inventory_t = Inventory_{t-1} + Qs - Qd",
    demand,
    capacity,
    utilization,
    inventory,
    normalInventory,
    announcedCapacity,
    leadTimeMonths,
    marginalCost,
    productPrice,
    demandSupplyGap,
    inventoryTightness,
    pricingPressure,
    level: scoreToLevel(pricingPressure),
    constraints: [
      ...(isFiniteNumber(utilization) && utilization > 0.92 ? ["high_utilization"] : []),
      ...(isFiniteNumber(inventoryTightness) && inventoryTightness > 0.2 ? ["tight_inventory"] : []),
      ...(announcedCapacity > 0 && leadTimeMonths <= 12 ? ["near_term_capacity_addition"] : []),
    ],
  };
}

function saasEquilibrium(inputs = {}) {
  const customers = numeric(inputs.customers, numeric(inputs.activeCustomers, null));
  const arpu = numeric(inputs.arpu, numeric(inputs.averageRevenuePerUser, null));
  const grossRetention = numeric(inputs.grossRevenueRetention, numeric(inputs.grr, null));
  const netRetention = numeric(inputs.netRevenueRetention, numeric(inputs.nrr, null));
  const logoChurn = numeric(inputs.logoChurn, null);
  const cacPaybackMonths = numeric(inputs.cacPaybackMonths, null);
  const salesProductivity = numeric(inputs.salesProductivity, null);
  const revenueRunRate = isFiniteNumber(customers) && isFiniteNumber(arpu) ? customers * arpu : null;
  const retentionPressure =
    (isFiniteNumber(netRetention) ? (netRetention - 1.05) * 1.4 : 0) +
    (isFiniteNumber(grossRetention) ? (grossRetention - 0.88) * 0.8 : 0) -
    (isFiniteNumber(logoChurn) ? Math.max(0, logoChurn - 0.12) * 1.2 : 0);
  const goToMarketPressure =
    (isFiniteNumber(cacPaybackMonths) ? clamp((18 - cacPaybackMonths) / 24, -0.6, 0.6) : 0) +
    (isFiniteNumber(salesProductivity) ? clamp((salesProductivity - 1) * 0.25, -0.25, 0.25) : 0);
  const pricingPressure = clamp(retentionPressure * 0.62 + goToMarketPressure * 0.38, -1, 1);
  return {
    archetype: "saas",
    equation: "Revenue = sum(Customers_c * Retention(t-c) * ARPU_c,t)",
    customers,
    arpu,
    revenueRunRate,
    grossRevenueRetention: grossRetention,
    netRevenueRetention: netRetention,
    logoChurn,
    cacPaybackMonths,
    salesProductivity,
    pricingPressure,
    level: scoreToLevel(pricingPressure),
    constraints: [
      ...(isFiniteNumber(netRetention) && netRetention < 0.95 ? ["weak_net_retention"] : []),
      ...(isFiniteNumber(cacPaybackMonths) && cacPaybackMonths > 30 ? ["slow_cac_payback"] : []),
    ],
  };
}

function marketplaceEquilibrium(inputs = {}) {
  const activeUsers = numeric(inputs.activeUsers, null);
  const transactionsPerUser = numeric(inputs.transactionsPerUser, null);
  const averageTicket = numeric(inputs.averageTicket, null);
  const takeRate = numeric(inputs.takeRate, null);
  const buyerGrowth = numeric(inputs.buyerGrowth, numeric(inputs.userGrowth, 0));
  const sellerGrowth = numeric(inputs.sellerGrowth, numeric(inputs.supplyGrowth, 0));
  const gmv = isFiniteNumber(activeUsers) && isFiniteNumber(transactionsPerUser) && isFiniteNumber(averageTicket) ? activeUsers * transactionsPerUser * averageTicket : null;
  const revenue = isFiniteNumber(gmv) && isFiniteNumber(takeRate) ? gmv * takeRate : null;
  const balance = buyerGrowth - sellerGrowth;
  const pricingPressure = clamp(balance * 0.45 + (isFiniteNumber(takeRate) ? (takeRate - 0.12) * 0.8 : 0), -1, 1);
  return {
    archetype: "marketplace",
    equation: "Revenue = ActiveUsers * TransactionsPerUser * AverageTicket * TakeRate",
    activeUsers,
    transactionsPerUser,
    averageTicket,
    takeRate,
    gmv,
    revenue,
    buyerGrowth,
    sellerGrowth,
    marketplaceBalance: balance,
    pricingPressure,
    level: scoreToLevel(pricingPressure),
    constraints: [Math.abs(balance) > 0.2 ? "marketplace_side_imbalance" : null].filter(Boolean),
  };
}

function bankingEquilibrium(inputs = {}) {
  const depositBeta = numeric(inputs.depositBeta, null);
  const loanGrowth = numeric(inputs.loanGrowth, null);
  const fundingCost = numeric(inputs.fundingCost, null);
  const creditLossRate = numeric(inputs.creditLossRate, null);
  const cet1 = numeric(inputs.cet1, numeric(inputs.cet1Ratio, null));
  const rwaGrowth = numeric(inputs.rwaGrowth, null);
  const capitalPressure = (isFiniteNumber(cet1) ? clamp((cet1 - 0.1) * 4, -0.5, 0.5) : 0) - (isFiniteNumber(rwaGrowth) ? Math.max(0, rwaGrowth - 0.06) * 2 : 0);
  const spreadPressure = -(isFiniteNumber(depositBeta) ? Math.max(0, depositBeta - 0.45) * 0.8 : 0) - (isFiniteNumber(creditLossRate) ? Math.max(0, creditLossRate - 0.015) * 6 : 0);
  const growthPressure = isFiniteNumber(loanGrowth) ? clamp((loanGrowth - 0.03) * 1.8, -0.35, 0.35) : 0;
  const pricingPressure = clamp(capitalPressure * 0.38 + spreadPressure * 0.38 + growthPressure * 0.24, -1, 1);
  return {
    archetype: "banking",
    equation: "Value pressure from deposits, loan growth, funding cost, credit losses, RWA and CET1",
    depositBeta,
    loanGrowth,
    fundingCost,
    creditLossRate,
    cet1,
    rwaGrowth,
    pricingPressure,
    level: scoreToLevel(pricingPressure),
    constraints: [
      ...(isFiniteNumber(cet1) && cet1 < 0.09 ? ["low_cet1"] : []),
      ...(isFiniteNumber(creditLossRate) && creditLossRate > 0.03 ? ["high_credit_losses"] : []),
    ],
  };
}

function generalEquilibrium(inputs = {}) {
  const demandGrowth = numeric(inputs.demandGrowth, numeric(inputs.industryDemandGrowth, 0));
  const supplyGrowth = numeric(inputs.supplyGrowth, numeric(inputs.capacityGrowth, 0));
  const inventoryTightness = numeric(inputs.inventoryTightness, 0);
  const pricingPressure = clamp((demandGrowth - supplyGrowth) * 0.65 + inventoryTightness * 0.35, -1, 1);
  return {
    archetype: "general",
    equation: "Pricing pressure ~= demand growth - supply growth + inventory tightness",
    demandGrowth,
    supplyGrowth,
    inventoryTightness,
    pricingPressure,
    level: scoreToLevel(pricingPressure),
    constraints: [],
  };
}

function buildProductMarket(snapshot = {}) {
  const archetype = inferProductArchetype(snapshot);
  const inputs = marketInputs(snapshot);
  if (archetype === "physical_capacity") return physicalCapacityEquilibrium(inputs);
  if (archetype === "saas") return saasEquilibrium(inputs);
  if (archetype === "marketplace") return marketplaceEquilibrium(inputs);
  if (archetype === "banking") return bankingEquilibrium(inputs);
  return generalEquilibrium(inputs);
}

function buildEquityMarket(snapshot = {}) {
  const inputs = equityInputs(snapshot);
  const floatMarketValue = numeric(inputs.floatMarketValue, numeric(inputs.floatValue, null));
  const buybacks = numeric(inputs.buybacks, 0) || 0;
  const issuance = numeric(inputs.issuance, numeric(inputs.equityIssuance, 0)) || 0;
  const etfFlows = numeric(inputs.etfFlows, 0) || 0;
  const institutionalNet = numeric(inputs.institutionalNet, numeric(inputs.institutionalChanges, 0)) || 0;
  const insiderNet = numeric(inputs.insiderNet, numeric(inputs.insiderFlows, 0)) || 0;
  const shortPressure = numeric(inputs.shortPressure, numeric(inputs.shortSalePressure, 0)) || 0;
  const optionHedging = numeric(inputs.optionHedging, 0) || 0;
  const indexFlow = numeric(inputs.indexFlow, numeric(inputs.indexInclusionFlow, 0)) || 0;
  const netSignedFlow = buybacks - issuance + etfFlows + institutionalNet + insiderNet + indexFlow - shortPressure - optionHedging;
  const flowPressure = isFiniteNumber(floatMarketValue) && floatMarketValue > 0 ? netSignedFlow / floatMarketValue : numeric(inputs.flowPressure, 0);
  const impactLambda = clamp(numeric(inputs.impactLambda, 0.8), 0, 3);
  const expectedPriceImpact = clamp(flowPressure * impactLambda, -1, 1);
  return {
    equation: "dlogP ~= lambda * NetSignedFlow + gamma * NewsShock + epsilon",
    floatMarketValue,
    buybacks,
    issuance,
    etfFlows,
    institutionalNet,
    insiderNet,
    indexFlow,
    shortPressure,
    optionHedging,
    netSignedFlow,
    flowPressure,
    impactLambda,
    expectedPriceImpact,
    level: scoreToLevel(expectedPriceImpact),
    constraints: [
      ...(issuance > buybacks && expectedPriceImpact < -0.02 ? ["net_equity_supply"] : []),
      ...(shortPressure > Math.max(buybacks + etfFlows, 0) && shortPressure > 0 ? ["short_pressure_dominates_flows"] : []),
    ],
  };
}

function buildReflexivity(snapshot = {}, productMarket, equityMarket) {
  const drivers = snapshot.drivers || {};
  const accounting = snapshot.accounting || {};
  const debt = numeric(accounting.reported?.debt, numeric(drivers.debt, null));
  const fcf = numeric(accounting.economic?.adjustedFreeCashFlow, numeric(drivers.baseFcf, null));
  const marketCap = numeric(snapshot.market?.marketCap, numeric(snapshot.market?.equityValue, null));
  const leverage = isFiniteNumber(debt) && isFiniteNumber(fcf) ? debt / Math.max(1, Math.abs(fcf)) : null;
  const financingNeed = numeric(snapshot.financingNeed, numeric(snapshot.equilibrium?.financingNeed, 0)) || 0;
  const priceHelpsFundamentals = equityMarket.expectedPriceImpact > 0.05 && financingNeed > 0;
  const priceHurtsFundamentals = equityMarket.expectedPriceImpact < -0.05 && (financingNeed > 0 || (isFiniteNumber(leverage) && leverage > 4));
  const score = clamp(
    (priceHelpsFundamentals ? 0.35 : 0) -
      (priceHurtsFundamentals ? 0.45 : 0) +
      productMarket.pricingPressure * 0.18 +
      equityMarket.expectedPriceImpact * 0.22,
    -1,
    1,
  );
  return {
    equation: "Price can affect fundamentals through financing cost, issuance capacity and survival runway.",
    leverage,
    marketCap,
    financingNeed,
    priceHelpsFundamentals,
    priceHurtsFundamentals,
    reflexivityScore: score,
    level: scoreToLevel(score),
  };
}

function aggregateEquilibrium(productMarket, equityMarket, reflexivity) {
  const score = clamp(productMarket.pricingPressure * 0.52 + equityMarket.expectedPriceImpact * 0.24 + reflexivity.reflexivityScore * 0.24, -1, 1);
  return {
    score,
    level: scoreToLevel(score),
    risk:
      score <= -0.35 || reflexivity.priceHurtsFundamentals
        ? "high_negative_pressure"
        : score <= -0.12
          ? "negative_pressure"
          : score >= 0.35
            ? "high_positive_pressure"
            : score >= 0.12
              ? "positive_pressure"
              : "balanced",
  };
}

export function buildAuroraEquilibriumEngine(snapshot = {}, options = {}) {
  const productMarket = buildProductMarket(snapshot);
  const equityMarket = buildEquityMarket(snapshot);
  const reflexivity = buildReflexivity(snapshot, productMarket, equityMarket);
  const aggregate = aggregateEquilibrium(productMarket, equityMarket, reflexivity);
  return {
    version: "aurora_equilibrium_engine_v1",
    ticker: snapshot.ticker || snapshot.company?.ticker || snapshot.company?.symbol || snapshot.drivers?.ticker || null,
    name: snapshot.company?.name || snapshot.company?.companyName || snapshot.drivers?.name || null,
    builtAt: options.builtAt || new Date().toISOString(),
    productMarket,
    equityMarket,
    reflexivity,
    aggregate,
    drivers: {
      demandSupply: clamp(0.5 + productMarket.pricingPressure * 0.42, 0, 1),
      bottleneckPower:
        productMarket.archetype === "physical_capacity"
          ? clamp(0.45 + Math.max(0, productMarket.pricingPressure) * 0.46, 0, 1)
          : undefined,
      priceFormationPressure: equityMarket.expectedPriceImpact,
      reflexivityScore: reflexivity.reflexivityScore,
    },
    memo: {
      headline:
        aggregate.risk === "balanced"
          ? "Product and equity-market pressure look balanced."
          : `Equilibrium engine reads ${aggregate.risk.replaceAll("_", " ")}.`,
      productMarket: `${productMarket.archetype}: ${productMarket.level}.`,
      equityMarket: `Equity flow pressure: ${equityMarket.level}.`,
      reflexivity: `Reflexivity: ${reflexivity.level}.`,
    },
  };
}
