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

function safeDivide(numerator, denominator, fallback = null) {
  return isFiniteNumber(numerator) && isFiniteNumber(denominator) && Math.abs(denominator) > 1e-9
    ? numerator / denominator
    : fallback;
}

function sum(values) {
  return values.filter(isFiniteNumber).reduce((total, value) => total + value, 0);
}

function mean(values) {
  const clean = values.filter(isFiniteNumber);
  if (!clean.length) return null;
  return sum(clean) / clean.length;
}

function firstFinite(...values) {
  for (const value of values) {
    const parsed = numeric(value, null);
    if (isFiniteNumber(parsed)) return parsed;
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeType(rawType) {
  const type = String(rawType || "").toLowerCase();
  if (/m&a|acquisition|acquire|deal/.test(type)) return "acquisition";
  if (/buyback|repurchase|share repurchase/.test(type)) return "repurchase";
  if (/dividend/.test(type)) return "dividend";
  if (/debt|deleverage|repay/.test(type)) return "debt_reduction";
  if (/cash|hoard|liquidit/.test(type)) return "cash_build";
  if (/organic|reinvest|capex|r&d|research/.test(type)) return "organic_reinvestment";
  if (/waste|unproductive|impair|write.?off|stranded/.test(type)) return "unproductive_investment";
  return type || "unknown";
}

function extractEvents(input = {}) {
  if (Array.isArray(input.capitalAllocationEvents)) return input.capitalAllocationEvents;
  if (Array.isArray(input.allocationEvents)) return input.allocationEvents;
  if (Array.isArray(input.capitalAllocation?.events)) return input.capitalAllocation.events;
  if (Array.isArray(input.capitalAllocation)) return input.capitalAllocation;
  return [];
}

function contextFromInput(input = {}) {
  const compiledDrivers = input.compiled?.drivers || input.compiled?.beliefObject?.drivers || {};
  const valuationSummary = input.valuationEnsemble?.summary || {};
  const forecast = input.forecast || {};
  const accounting = input.accounting || {};
  const macro = input.macro || {};
  const market = input.market || {};
  const managementReliability = input.managementReliability || {};
  return {
    wacc: clamp(
      firstFinite(
        input.wacc,
        input.costOfCapital,
        compiledDrivers.wacc,
        compiledDrivers.discountRate,
        forecast.costOfCapital,
        macro.wacc,
        (numeric(macro.riskFreeRate, 0.04) || 0.04) + (numeric(macro.equityRiskPremium, 0.05) || 0.05) * (numeric(market.beta, 1) || 1),
      ) ?? 0.09,
      0.02,
      0.28,
    ),
    price: firstFinite(input.price, market.price, compiledDrivers.price, input.beliefObject?.price),
    intrinsicValuePerShare: firstFinite(
      input.intrinsicValuePerShare,
      input.fairValuePerShare,
      valuationSummary.weightedFairValue,
      valuationSummary.fairValue,
      forecast.expectedFairValue,
    ),
    sharesOutstanding: firstFinite(input.sharesOutstanding, market.sharesOutstanding, compiledDrivers.sharesOutstanding),
    investedCapital: firstFinite(accounting.economicDrivers?.investedCapital, input.investedCapital),
    organicReturnOnInvestment: firstFinite(input.organicReturnOnInvestment, input.roiic, compiledDrivers.roic, accounting.economicDrivers?.roic),
    managementBuybackPrior: firstFinite(managementReliability.adjustments?.buybackDisciplinePrior),
    managementAcquisitionPrior: firstFinite(managementReliability.adjustments?.acquisitionExecutionPrior),
  };
}

function normalizeEvent(record = {}, index = 0) {
  const type = normalizeType(firstText(record.type, record.category, record.kind, record.useOfCash));
  const averagePrice = firstFinite(record.averagePrice, record.purchasePrice, record.avgPrice, record.price);
  const sharesRepurchased = firstFinite(record.sharesRepurchased, record.sharesBought, record.grossSharesRepurchased);
  const buybackAmount = firstFinite(record.buybackAmount, record.repurchases, record.cashUsed, isFiniteNumber(averagePrice) && isFiniteNumber(sharesRepurchased) ? averagePrice * sharesRepurchased : null);
  return {
    id: record.id || `allocation_event_${index + 1}`,
    date: record.date || record.fiscalDate || record.period || null,
    type,
    rawType: firstText(record.type, record.category, record.kind, record.useOfCash),
    amount: Math.abs(
      firstFinite(
        record.amount,
        record.capitalAllocated,
        record.cashUsed,
        buybackAmount,
        record.dividendsPaid,
        record.debtRepaid,
        record.purchasePrice,
        record.capex,
        record.rAndD,
        0,
      ) || 0,
    ),
    source: record.source || null,
    note: record.note || record.description || null,
    averagePrice,
    intrinsicValuePerShare: firstFinite(record.intrinsicValuePerShare, record.fairValuePerShare, record.estimatedIntrinsicValuePerShare),
    sharesRepurchased,
    sbcOffsetShares: firstFinite(record.sbcOffsetShares, record.sbcCompensationShares, record.sharesIssuedForSbc, 0),
    opportunityCost: firstFinite(record.opportunityCost, null),
    leverageBefore: firstFinite(record.leverageBefore, record.netDebtToEbitdaBefore),
    leverageAfter: firstFinite(record.leverageAfter, record.netDebtToEbitdaAfter),
    debtRepaid: firstFinite(record.debtRepaid, record.debtReduction, record.debtPaidDown),
    interestRateOnDebt: firstFinite(record.interestRateOnDebt, record.costOfDebt),
    incrementalNopat: firstFinite(record.incrementalNopat, record.incrementalNOPAT, record.nopatAdded),
    purchasePrice: firstFinite(record.purchasePrice, record.dealValue, record.cashConsideration),
    assumedDebt: firstFinite(record.assumedDebt, record.debtAssumed, 0),
    stockIssuedValue: firstFinite(record.stockIssuedValue, record.equityIssuedValue, record.sharesIssuedValue, 0),
    earnouts: firstFinite(record.earnouts, record.earnOuts, 0),
    integrationCosts: firstFinite(record.integrationCosts, record.restructuringCosts, 0),
    additionalInvestment: firstFinite(record.additionalInvestment, record.requiredInvestment, 0),
    organicReturnOnInvestment: firstFinite(record.organicReturnOnInvestment, record.roiic, record.incrementalRoic),
  };
}

function scoreRepurchase(event, context) {
  const averagePrice = firstFinite(event.averagePrice, context.price);
  const intrinsicValuePerShare = firstFinite(event.intrinsicValuePerShare, context.intrinsicValuePerShare);
  const sharesRepurchased = firstFinite(event.sharesRepurchased, safeDivide(event.amount, averagePrice, null));
  const sbcOffsetShares = Math.max(0, numeric(event.sbcOffsetShares, 0) || 0);
  const netSharesReduced = Math.max(0, (sharesRepurchased || 0) - sbcOffsetShares);
  const sbcOffsetShare = safeDivide(sbcOffsetShares, sharesRepurchased, 0) || 0;
  const repurchaseReturn =
    isFiniteNumber(intrinsicValuePerShare) && isFiniteNumber(averagePrice) && averagePrice > 0
      ? (intrinsicValuePerShare - averagePrice) / averagePrice
      : null;
  const leveragePenalty =
    isFiniteNumber(event.leverageBefore) && isFiniteNumber(event.leverageAfter)
      ? clamp((event.leverageAfter - event.leverageBefore) * 0.08, -0.08, 0.2)
      : 0;
  const grossValueCreated =
    isFiniteNumber(intrinsicValuePerShare) && isFiniteNumber(averagePrice) && isFiniteNumber(netSharesReduced)
      ? (intrinsicValuePerShare - averagePrice) * netSharesReduced
      : (event.amount || 0) * numeric(repurchaseReturn, 0);
  const sbcPenalty = (event.amount || 0) * clamp(sbcOffsetShare, 0, 1) * 0.45;
  const valueCreated = grossValueCreated - sbcPenalty - (event.amount || 0) * leveragePenalty - numeric(event.opportunityCost, 0);
  const quality = clamp(0.5 + numeric(repurchaseReturn, 0) * 1.35 - sbcOffsetShare * 0.35 - leveragePenalty, 0, 1);
  return {
    metrics: {
      averagePrice,
      intrinsicValuePerShare,
      repurchaseReturn,
      sharesRepurchased,
      netSharesReduced,
      sbcOffsetShare,
      leverageBefore: event.leverageBefore,
      leverageAfter: event.leverageAfter,
    },
    valueCreated,
    quality,
    verdict:
      isFiniteNumber(repurchaseReturn) && repurchaseReturn < -0.08
        ? "value_destructive_repurchase"
        : sbcOffsetShare > 0.55
          ? "sbc_offset_repurchase"
          : quality >= 0.62
            ? "value_creating_repurchase"
            : "mixed_repurchase",
    flags: [
      ...(isFiniteNumber(repurchaseReturn) && repurchaseReturn < 0 ? ["bought_above_intrinsic_value"] : []),
      ...(sbcOffsetShare > 0.35 ? ["large_sbc_offset"] : []),
      ...(leveragePenalty > 0.08 ? ["leverage_worsened"] : []),
    ],
  };
}

function scoreAcquisition(event, context) {
  const totalEconomicPurchasePrice = sum([
    firstFinite(event.purchasePrice, event.amount),
    event.assumedDebt,
    event.stockIssuedValue,
    event.earnouts,
    event.integrationCosts,
    event.additionalInvestment,
  ]);
  const acquisitionRoic = safeDivide(event.incrementalNopat, totalEconomicPurchasePrice, null);
  const spread = isFiniteNumber(acquisitionRoic) ? acquisitionRoic - context.wacc : null;
  const valueCreated = isFiniteNumber(spread) ? (spread * totalEconomicPurchasePrice) / Math.max(context.wacc, 0.05) : 0;
  const stockShare = safeDivide(event.stockIssuedValue, totalEconomicPurchasePrice, 0) || 0;
  const executionPrior = numeric(context.managementAcquisitionPrior, 0.55);
  const quality = clamp(0.45 + numeric(spread, 0) * 2.4 + (executionPrior - 0.5) * 0.32 - stockShare * 0.18, 0, 1);
  return {
    metrics: {
      totalEconomicPurchasePrice,
      incrementalNopat: event.incrementalNopat,
      acquisitionRoic,
      spreadToWacc: spread,
      stockConsiderationShare: stockShare,
      executionPrior,
    },
    valueCreated,
    quality,
    verdict:
      isFiniteNumber(spread) && spread < -0.025
        ? "acquisition_below_cost_of_capital"
        : (isFiniteNumber(spread) && spread >= 0.03 && stockShare <= 0.45) || quality >= 0.62
          ? "acquisition_creates_value"
          : "acquisition_needs_integration_proof",
    flags: [
      ...(isFiniteNumber(spread) && spread < 0 ? ["roic_below_wacc"] : []),
      ...(stockShare > 0.45 ? ["material_stock_issuance"] : []),
      ...(event.integrationCosts > totalEconomicPurchasePrice * 0.15 ? ["high_integration_costs"] : []),
    ],
  };
}

function scoreOrganicReinvestment(event, context) {
  const roi = firstFinite(event.organicReturnOnInvestment, context.organicReturnOnInvestment);
  const spread = isFiniteNumber(roi) ? roi - context.wacc : null;
  const valueCreated = isFiniteNumber(spread) ? (spread * event.amount) / Math.max(context.wacc, 0.05) : 0;
  const quality = clamp(0.5 + numeric(spread, 0) * 2.1, 0, 1);
  return {
    metrics: {
      organicReturnOnInvestment: roi,
      spreadToWacc: spread,
    },
    valueCreated,
    quality,
    verdict:
      isFiniteNumber(spread) && spread < -0.015
        ? "organic_reinvestment_below_cost_of_capital"
        : quality >= 0.62
          ? "organic_reinvestment_creates_value"
          : "organic_reinvestment_needs_runway_proof",
    flags: isFiniteNumber(spread) && spread < 0 ? ["roiic_below_wacc"] : [],
  };
}

function scoreDebtReduction(event, context) {
  const debtRepaid = firstFinite(event.debtRepaid, event.amount) || 0;
  const interestSaved = debtRepaid * (firstFinite(event.interestRateOnDebt, context.wacc * 0.65) || 0);
  const leverageImprovement =
    isFiniteNumber(event.leverageBefore) && isFiniteNumber(event.leverageAfter)
      ? Math.max(0, event.leverageBefore - event.leverageAfter)
      : 0;
  const valueCreated = interestSaved / Math.max(context.wacc, 0.05) + debtRepaid * Math.min(0.06, leverageImprovement * 0.015);
  const quality = clamp(0.48 + leverageImprovement * 0.08 + safeDivide(interestSaved, Math.max(debtRepaid, 1), 0) * 1.3, 0, 1);
  return {
    metrics: {
      debtRepaid,
      interestSaved,
      leverageBefore: event.leverageBefore,
      leverageAfter: event.leverageAfter,
      leverageImprovement,
    },
    valueCreated,
    quality,
    verdict: quality >= 0.62 ? "deleveraging_adds_resilience" : "deleveraging_neutral",
    flags: [],
  };
}

function scoreDividend(event, context) {
  const opportunityCost = firstFinite(event.opportunityCost, Math.max(0, numeric(context.organicReturnOnInvestment, context.wacc) - context.wacc) * event.amount) || 0;
  const valueCreated = -opportunityCost * 0.35;
  const quality = clamp(0.56 - safeDivide(opportunityCost, Math.max(event.amount, 1), 0) * 0.8, 0, 1);
  return {
    metrics: { opportunityCost },
    valueCreated,
    quality,
    verdict: opportunityCost > event.amount * 0.08 ? "dividend_has_high_opportunity_cost" : "dividend_capital_return_neutral",
    flags: opportunityCost > event.amount * 0.08 ? ["high_reinvestment_opportunity_cost"] : [],
  };
}

function scoreCashBuild(event, context) {
  const cashDrag = event.amount * Math.max(0, context.wacc - 0.025);
  const valueCreated = -cashDrag;
  const quality = clamp(0.54 - safeDivide(cashDrag, Math.max(event.amount, 1), 0) * 2.2, 0, 1);
  return {
    metrics: { cashDrag },
    valueCreated,
    quality,
    verdict: quality < 0.45 ? "cash_build_drags_returns" : "cash_build_preserves_optionality",
    flags: quality < 0.45 ? ["cash_drag"] : [],
  };
}

function scoreUnproductive(event) {
  const valueCreated = -Math.abs(event.amount || 0) * 0.65;
  return {
    metrics: {},
    valueCreated,
    quality: 0.08,
    verdict: "unproductive_investment_destroyed_value",
    flags: ["unproductive_capital"],
  };
}

function scoreGeneric(event) {
  return {
    metrics: {},
    valueCreated: 0,
    quality: 0.42,
    verdict: "unclassified_allocation_use",
    flags: ["unclassified_capital_use"],
  };
}

function scoreEvent(event, context) {
  const scored =
    event.type === "repurchase"
      ? scoreRepurchase(event, context)
      : event.type === "acquisition"
        ? scoreAcquisition(event, context)
        : event.type === "organic_reinvestment"
          ? scoreOrganicReinvestment(event, context)
          : event.type === "debt_reduction"
            ? scoreDebtReduction(event, context)
            : event.type === "dividend"
              ? scoreDividend(event, context)
              : event.type === "cash_build"
                ? scoreCashBuild(event, context)
                : event.type === "unproductive_investment"
                  ? scoreUnproductive(event, context)
                  : scoreGeneric(event, context);
  return {
    ...event,
    ...scored,
    capitalAllocated: event.amount,
    alpha: safeDivide(scored.valueCreated, event.amount, 0) || 0,
  };
}

function allocationMix(scoredEvents) {
  const total = sum(scoredEvents.map((event) => event.capitalAllocated));
  const mix = scoredEvents.reduce((acc, event) => {
    acc[event.type] ||= { capitalAllocated: 0, share: 0, count: 0 };
    acc[event.type].capitalAllocated += event.capitalAllocated || 0;
    acc[event.type].count += 1;
    return acc;
  }, {});
  Object.values(mix).forEach((item) => {
    item.share = safeDivide(item.capitalAllocated, total, 0) || 0;
  });
  return { totalCapitalAllocated: total, byUse: mix };
}

function buildSummary(scoredEvents, context) {
  const mix = allocationMix(scoredEvents);
  const totalCapital = mix.totalCapitalAllocated;
  const totalValueCreated = sum(scoredEvents.map((event) => event.valueCreated));
  const capitalAllocationAlpha = safeDivide(totalValueCreated, totalCapital, null);
  const weightedQuality = safeDivide(sum(scoredEvents.map((event) => (event.quality || 0) * (event.capitalAllocated || 0))), totalCapital, null);
  const repurchases = scoredEvents.filter((event) => event.type === "repurchase");
  const acquisitions = scoredEvents.filter((event) => event.type === "acquisition");
  const organic = scoredEvents.filter((event) => event.type === "organic_reinvestment");
  const destructiveCapitalShare = safeDivide(
    sum(scoredEvents.filter((event) => event.valueCreated < 0).map((event) => event.capitalAllocated)),
    totalCapital,
    0,
  ) || 0;
  const flags = [...new Set(scoredEvents.flatMap((event) => event.flags || []))];
  return {
    ...mix,
    valueCreated: totalValueCreated,
    capitalAllocationAlpha,
    disciplineScore: clamp(numeric(weightedQuality, 0.45), 0, 1),
    buybackDiscipline: repurchases.length ? mean(repurchases.map((event) => event.quality)) : null,
    acquisitionDiscipline: acquisitions.length ? mean(acquisitions.map((event) => event.quality)) : null,
    organicReinvestmentQuality: organic.length ? mean(organic.map((event) => event.quality)) : null,
    destructiveCapitalShare,
    flags,
    context: {
      wacc: context.wacc,
      price: context.price,
      intrinsicValuePerShare: context.intrinsicValuePerShare,
      managementBuybackPrior: context.managementBuybackPrior,
      managementAcquisitionPrior: context.managementAcquisitionPrior,
    },
  };
}

function buildAdjustments(summary) {
  const discipline = numeric(summary.disciplineScore, 0.45);
  const alpha = numeric(summary.capitalAllocationAlpha, 0);
  return {
    reinvestmentConfidence: clamp(0.36 + discipline * 0.42 + alpha * 0.45, 0.1, 0.92),
    mnaExecutionPrior: clamp(0.34 + numeric(summary.acquisitionDiscipline, discipline) * 0.44 + alpha * 0.18, 0.1, 0.9),
    buybackDisciplinePrior: clamp(0.3 + numeric(summary.buybackDiscipline, discipline) * 0.48, 0.1, 0.9),
    dilutionRiskAdjustment: clamp((summary.flags.includes("material_stock_issuance") ? 0.08 : 0) + Math.max(0, -alpha) * 0.16, 0, 0.28),
    balanceSheetFlexibility: clamp(0.42 + discipline * 0.32 - summary.destructiveCapitalShare * 0.22, 0.08, 0.9),
  };
}

function decisionFromSummary(summary) {
  if (!summary.totalCapitalAllocated) return "capital_allocation_pending";
  if (summary.capitalAllocationAlpha < -0.16 || summary.destructiveCapitalShare > 0.55 || summary.disciplineScore < 0.25) {
    return "capital_allocation_destructive";
  }
  if (summary.capitalAllocationAlpha < -0.04 || summary.destructiveCapitalShare > 0.32 || summary.disciplineScore < 0.42) {
    return "capital_allocation_watch";
  }
  if (summary.capitalAllocationAlpha > 0.08 && summary.disciplineScore > 0.62) return "capital_allocation_alpha_positive";
  return "capital_allocation_usable";
}

export function buildAuroraCapitalAllocationEngine(input = {}, options = {}) {
  const context = contextFromInput(input);
  const events = extractEvents(input).map(normalizeEvent);
  const scoredEvents = events.map((event) => scoreEvent(event, context));
  const summary = buildSummary(scoredEvents, context);
  const adjustments = buildAdjustments(summary);
  const decision = decisionFromSummary(summary);
  const topIssue =
    summary.flags[0] ||
    (decision === "capital_allocation_pending"
      ? "No capital allocation history supplied."
      : [...scoredEvents].sort((a, b) => Math.abs(b.valueCreated) - Math.abs(a.valueCreated))[0]?.verdict);

  return {
    version: "aurora_capital_allocation_engine_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    decision,
    events: scoredEvents,
    summary,
    adjustments,
    memo: {
      headline: `Capital allocation is ${decision.replaceAll("_", " ")}.`,
      eventCount: scoredEvents.length,
      capitalAllocationAlpha: summary.capitalAllocationAlpha,
      disciplineScore: summary.disciplineScore,
      destructiveCapitalShare: summary.destructiveCapitalShare,
      topIssue,
    },
  };
}
