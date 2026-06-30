import { buildAuroraPricedBeliefObject } from "./aurora-belief-object.js";

const DEFAULT_RISK_FREE_RATE = 0.043;
const DEFAULT_EQUITY_RISK_PREMIUM = 0.052;
const DEFAULT_TERMINAL_GROWTH = 0.025;

const FIELD_WEIGHTS = {
  ticker: 0.04,
  price: 0.12,
  revenue: 0.12,
  baseFcf: 0.1,
  revenueCagr: 0.1,
  margin: 0.1,
  roic: 0.12,
  wacc: 0.1,
  reinvestment: 0.08,
  sector: 0.06,
  evidence: 0.06,
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

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function arrayOrEmpty(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function statementDate(statement) {
  const raw = statement?.fiscalDate || statement?.date || statement?.calendarYear || statement?.year || statement?.fiscalYear;
  if (raw == null) return 0;
  const text = String(raw);
  const year = Number(text.slice(0, 4));
  if (Number.isFinite(year)) return year;
  return Number(raw) || 0;
}

function sortStatements(statements) {
  return arrayOrEmpty(statements)
    .filter((item) => item && typeof item === "object")
    .sort((a, b) => statementDate(a) - statementDate(b));
}

function latestStatement(...candidates) {
  for (const candidate of candidates) {
    const sorted = sortStatements(candidate);
    if (sorted.length) return sorted[sorted.length - 1];
  }
  return {};
}

function revenueFromStatement(statement) {
  return firstFinite(statement?.revenue, statement?.totalRevenue, statement?.sales, statement?.netSales);
}

function ebitFromStatement(statement) {
  return firstFinite(statement?.ebit, statement?.operatingIncome, statement?.incomeFromOperations);
}

function cashFromStatement(statement) {
  return firstFinite(statement?.cashAndCashEquivalents, statement?.cashAndShortTermInvestments, statement?.cash);
}

function totalDebtFromStatement(statement) {
  return firstFinite(statement?.totalDebt, statement?.shortTermDebt + statement?.longTermDebt, statement?.debt);
}

function equityFromStatement(statement) {
  return firstFinite(statement?.totalStockholdersEquity, statement?.totalEquity, statement?.shareholdersEquity);
}

function capexFromStatement(statement) {
  const capex = firstFinite(statement?.capitalExpenditure, statement?.capitalExpenditures, statement?.capex);
  return isFiniteNumber(capex) ? Math.abs(capex) : null;
}

function operatingCashFlowFromStatement(statement) {
  return firstFinite(statement?.operatingCashFlow, statement?.netCashProvidedByOperatingActivities, statement?.cashFromOperations);
}

function freeCashFlowFromStatement(statement) {
  const explicit = firstFinite(statement?.freeCashFlow, statement?.fcf);
  if (isFiniteNumber(explicit)) return explicit;
  const ocf = operatingCashFlowFromStatement(statement);
  const capex = capexFromStatement(statement);
  if (isFiniteNumber(ocf) && isFiniteNumber(capex)) return ocf - capex;
  return null;
}

function computeRevenueCagr(incomeStatements) {
  const sorted = sortStatements(incomeStatements).filter((item) => isFiniteNumber(revenueFromStatement(item)) && revenueFromStatement(item) > 0);
  if (sorted.length < 2) return null;
  const latest = sorted[sorted.length - 1];
  const latestYear = statementDate(latest);
  const targetYear = latestYear - 3;
  const base =
    sorted
      .slice(0, -1)
      .reverse()
      .find((item) => statementDate(item) <= targetYear) || sorted[0];
  const years = Math.max(1, latestYear - statementDate(base));
  const startRevenue = revenueFromStatement(base);
  const endRevenue = revenueFromStatement(latest);
  if (!isFiniteNumber(startRevenue) || !isFiniteNumber(endRevenue) || startRevenue <= 0 || endRevenue <= 0) return null;
  return Math.pow(endRevenue / startRevenue, 1 / years) - 1;
}

function computeMargin(income) {
  const revenue = revenueFromStatement(income);
  const ebit = ebitFromStatement(income);
  return safeDivide(ebit, revenue, null);
}

function computeRoic(income, balance, taxRate) {
  const ebit = ebitFromStatement(income);
  const debt = totalDebtFromStatement(balance);
  const equity = equityFromStatement(balance);
  const cash = cashFromStatement(balance) || 0;
  const investedCapital = isFiniteNumber(debt) && isFiniteNumber(equity) ? Math.max(1, debt + equity - cash) : null;
  if (!isFiniteNumber(ebit) || !isFiniteNumber(investedCapital)) return null;
  return (ebit * (1 - taxRate)) / investedCapital;
}

function sectorRiskAdjustment(sectorText) {
  const sector = String(sectorText || "").toLowerCase();
  if (/bank|insurance|financial|broker|credit/.test(sector)) return 0.006;
  if (/energy|commodity|mining|materials|airline|shipping/.test(sector)) return 0.012;
  if (/biotech|pre-profit|venture|early/.test(sector)) return 0.018;
  if (/utility|regulated|infrastructure/.test(sector)) return -0.008;
  if (/software|semiconductor|industrial|consumer/.test(sector)) return 0.003;
  return 0.005;
}

function computeWacc(snapshot, sectorText) {
  const drivers = snapshot?.drivers || {};
  const macro = snapshot?.macro || {};
  const market = snapshot?.market || snapshot?.quote || {};
  const explicit = firstFinite(drivers.wacc, snapshot?.wacc, market?.wacc);
  if (isFiniteNumber(explicit)) return explicit > 0.3 ? explicit / 100 : explicit;
  const riskFreeRaw = firstFinite(macro.riskFreeRate, macro.riskFree10y, macro.treasury10y, drivers.riskFreeRate);
  const riskFree = isFiniteNumber(riskFreeRaw) ? (riskFreeRaw > 0.3 ? riskFreeRaw / 100 : riskFreeRaw) : DEFAULT_RISK_FREE_RATE;
  const erpRaw = firstFinite(macro.equityRiskPremium, macro.erp, drivers.equityRiskPremium);
  const erp = isFiniteNumber(erpRaw) ? (erpRaw > 0.3 ? erpRaw / 100 : erpRaw) : DEFAULT_EQUITY_RISK_PREMIUM;
  const beta = clamp(firstFinite(market.beta, snapshot?.beta, drivers.beta) ?? 1, 0.45, 2.1);
  return clamp(riskFree + beta * erp + sectorRiskAdjustment(sectorText), 0.045, 0.22);
}

function computeTerminalGrowth(snapshot) {
  const drivers = snapshot?.drivers || {};
  const macro = snapshot?.macro || {};
  const explicit = firstFinite(drivers.terminalGrowth, snapshot?.terminalGrowth);
  if (isFiniteNumber(explicit)) return explicit > 0.3 ? explicit / 100 : explicit;
  const inflation = firstFinite(macro.inflation, macro.longRunInflation, macro.cpiTrend);
  if (isFiniteNumber(inflation)) return clamp(inflation > 0.3 ? inflation / 100 : inflation, -0.01, 0.055);
  return DEFAULT_TERMINAL_GROWTH;
}

function computeReinvestment(income, cashFlow, taxRate) {
  const capex = capexFromStatement(cashFlow);
  const ebit = ebitFromStatement(income);
  const nopat = isFiniteNumber(ebit) ? Math.max(1, ebit * (1 - taxRate)) : null;
  if (!isFiniteNumber(capex) || !isFiniteNumber(nopat)) return null;
  return clamp(capex / nopat, 0.02, 0.95);
}

function stdev(values) {
  const clean = values.filter(isFiniteNumber);
  if (clean.length < 2) return null;
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1);
  return Math.sqrt(variance);
}

function aggregateEvidenceSignals(evidence = {}, company = {}) {
  const claims = arrayOrEmpty(evidence.claims);
  const textSignals = evidence.textSignals || evidence.signals || {};
  const sector = `${company.sector || ""} ${company.industry || ""}`.toLowerCase();
  const signal = (key, fallback = 0.45) => clamp(firstFinite(textSignals[key], evidence[key]) ?? fallback, 0, 1);
  const claimScore = (patterns, fallback = 0.45) => {
    const matched = claims
      .filter((claim) => patterns.some((pattern) => pattern.test(String(claim.type || claim.label || claim.text || ""))))
      .map((claim) => clamp(firstFinite(claim.score, claim.sentiment, claim.confidence) ?? 0.55, 0, 1));
    if (!matched.length) return fallback;
    return matched.reduce((sum, value) => sum + value, 0) / matched.length;
  };

  const pricingPower = Math.max(signal("pricingPower", 0.45), claimScore([/pricing/i, /price/i], 0.45));
  const demandVisibility = Math.max(signal("demandVisibility", 0.45), claimScore([/demand/i, /backlog/i, /visibility/i], 0.45));
  const capacityConstraint = Math.max(signal("capacityConstraint", 0.4), claimScore([/capacity/i, /constraint/i, /bottleneck/i, /supply/i], 0.4));
  const marginPressure = Math.max(signal("marginPressure", 0.35), claimScore([/margin.*pressure/i, /cost/i], 0.35));
  const accountingTrust = signal("accountingTrust", firstFinite(evidence.accountingTrust, evidence.quality) ?? 0.58);
  const sectorBottleneckPrior = /semiconductor|lithography|aerospace|equipment|scarce|capacity/.test(sector) ? 0.18 : 0;

  return {
    pricingPower,
    demandVisibility,
    capacityConstraint,
    marginPressure,
    accountingTrust,
    demandSupply: clamp((pricingPower * 0.32 + demandVisibility * 0.38 + capacityConstraint * 0.3) * (1 - marginPressure * 0.18), 0, 1),
    bottleneckPower: clamp(capacityConstraint * 0.52 + pricingPower * 0.26 + demandVisibility * 0.14 + sectorBottleneckPrior, 0, 1),
    evidenceCount: claims.length + Object.keys(textSignals).length,
  };
}

function computeThesisQuality({ incomeStatements, margin, roic, wacc, baseFcf, revenue, evidenceSignals }) {
  const margins = sortStatements(incomeStatements)
    .map((statement) => computeMargin(statement))
    .filter(isFiniteNumber);
  const marginVol = stdev(margins.slice(-5));
  const fcfMargin = safeDivide(baseFcf, revenue, null);
  const roicSpread = isFiniteNumber(roic) && isFiniteNumber(wacc) ? roic - wacc : null;
  let score = 0.45;
  if (isFiniteNumber(fcfMargin)) score += clamp((fcfMargin - 0.04) * 1.8, -0.16, 0.2);
  if (isFiniteNumber(roicSpread)) score += clamp(roicSpread * 1.9, -0.22, 0.26);
  if (isFiniteNumber(margin)) score += clamp((margin - 0.1) * 0.55, -0.08, 0.14);
  if (isFiniteNumber(marginVol)) score -= clamp(marginVol * 1.8, 0, 0.18);
  score += (evidenceSignals.accountingTrust - 0.55) * 0.16;
  return clamp(score, 0.05, 0.96);
}

function sourceLineageEntry(source, value, confidence = 1) {
  return {
    source,
    available: isFiniteNumber(value) || (typeof value === "string" && Boolean(value)),
    confidence: clamp(confidence, 0, 1),
  };
}

function buildQualityReport(drivers, lineage, warnings) {
  const missing = [];
  const available = [];
  let weightedScore = 0;
  let totalWeight = 0;

  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    totalWeight += weight;
    const entry = lineage[field] || { available: false, confidence: 0 };
    if (entry.available) {
      available.push(field);
      weightedScore += weight * entry.confidence;
    } else {
      missing.push(field);
    }
  }

  const sanityPenalty =
    (isFiniteNumber(drivers.wacc) && (drivers.wacc < 0.035 || drivers.wacc > 0.24) ? 0.18 : 0) +
    (isFiniteNumber(drivers.roic) && (drivers.roic < -0.4 || drivers.roic > 0.9) ? 0.14 : 0) +
    (isFiniteNumber(drivers.margin) && (drivers.margin < -0.4 || drivers.margin > 0.75) ? 0.14 : 0);
  const criticalMissing = missing.filter((field) => ["price", "revenue", "baseFcf", "revenueCagr", "roic"].includes(field)).length;
  const criticalPenalty = criticalMissing * 0.035;
  const score = clamp(weightedScore / Math.max(0.001, totalWeight) - sanityPenalty - criticalPenalty, 0, 1);
  return {
    score,
    level: score >= 0.78 ? "decision_grade" : score >= 0.58 ? "research_grade" : score >= 0.38 ? "memo_only" : "insufficient",
    available,
    missing,
    warnings,
    lineage,
  };
}

function applyOverrideLineage(lineage, overrides) {
  const next = { ...lineage };
  for (const key of Object.keys(overrides || {})) {
    if (!next[key]) continue;
    next[key] = {
      ...next[key],
      source: `manual driver override over ${next[key].source}`,
      override: true,
      rawSource: next[key].source,
      confidence: 1,
    };
  }
  return next;
}

function compilerNextAction(quality, beliefObject) {
  if (quality.level === "insufficient") return "repair_inputs_before_interpretation";
  if (beliefObject.beliefDistortionIndex < 4) return "no_strong_belief_gap_monitor_only";
  if (beliefObject.abstain) return "use_as_memo_only_and_collect_evidence";
  return "ready_for_priced_belief_review";
}

export function compileAuroraBeliefDrivers(snapshot = {}, options = {}) {
  const company = snapshot.company || snapshot.profile || {};
  const driversOverride = snapshot.drivers || {};
  const accountingDrivers = snapshot.accounting?.drivers || snapshot.accounting?.economicDrivers || {};
  const market = snapshot.market || snapshot.quote || {};
  const financials = snapshot.financials || {};
  const incomeStatements = financials.incomeStatements || financials.incomeStatement || snapshot.incomeStatements || snapshot.incomeStatement;
  const balanceSheets = financials.balanceSheets || financials.balanceSheet || snapshot.balanceSheets || snapshot.balanceSheet;
  const cashFlows = financials.cashFlows || financials.cashFlow || snapshot.cashFlows || snapshot.cashFlow;
  const income = latestStatement(incomeStatements, financials.income);
  const balance = latestStatement(balanceSheets, financials.balance);
  const cashFlow = latestStatement(cashFlows, financials.cash);
  const taxRate = clamp(firstFinite(driversOverride.taxRate, accountingDrivers.taxRate, snapshot.taxRate) ?? 0.22, 0, 0.45);
  const sector = firstText(driversOverride.sector, company.sector, company.industry, snapshot.sector);
  const evidenceSignals = aggregateEvidenceSignals(snapshot.evidence || {}, company);

  const revenue = firstFinite(driversOverride.revenue, snapshot.revenue, revenueFromStatement(income));
  const baseFcf = firstFinite(driversOverride.baseFcf, driversOverride.fcf, accountingDrivers.baseFcf, accountingDrivers.fcf, snapshot.baseFcf, freeCashFlowFromStatement(cashFlow));
  const margin = firstFinite(driversOverride.margin, accountingDrivers.margin, snapshot.margin, computeMargin(income));
  const roic = firstFinite(driversOverride.roic, accountingDrivers.roic, snapshot.roic, computeRoic(income, balance, taxRate));
  const revenueCagr = firstFinite(driversOverride.revenueCagr, snapshot.revenueCagr, computeRevenueCagr(incomeStatements));
  const wacc = computeWacc(snapshot, sector);
  const terminalGrowth = computeTerminalGrowth(snapshot);
  const reinvestment = firstFinite(driversOverride.reinvestment, accountingDrivers.reinvestment, snapshot.reinvestment, computeReinvestment(income, cashFlow, taxRate));
  const price = firstFinite(driversOverride.price, snapshot.price, market.price, market.sharePrice, market.close, market.marketPrice);
  const ticker = firstText(driversOverride.ticker, company.ticker, company.symbol, snapshot.ticker, market.ticker, market.symbol);
  const name = firstText(driversOverride.name, company.name, company.companyName, snapshot.name);
  const thesisQuality = firstFinite(
    driversOverride.thesisQuality,
    snapshot.thesisQuality,
    computeThesisQuality({ incomeStatements, margin, roic, wacc, baseFcf, revenue, evidenceSignals }),
  );
  const demandSupply = firstFinite(driversOverride.demandSupply, snapshot.demandSupply, evidenceSignals.demandSupply);
  const bottleneckPower = firstFinite(driversOverride.bottleneckPower, snapshot.bottleneckPower, evidenceSignals.bottleneckPower);

  const rawLineage = {
    ticker: sourceLineageEntry(ticker ? "company/profile/snapshot" : "missing", ticker, 1),
    price: sourceLineageEntry("market.price", price, 1),
    revenue: sourceLineageEntry("latest income statement revenue", revenue, 1),
    baseFcf: sourceLineageEntry(accountingDrivers.baseFcf != null ? "accounting engine adjusted free cash flow" : "latest cash flow free cash flow", baseFcf, isFiniteNumber(baseFcf) ? 1 : 0),
    revenueCagr: sourceLineageEntry("income statement history CAGR", revenueCagr, isFiniteNumber(revenueCagr) ? 0.85 : 0),
    margin: sourceLineageEntry(accountingDrivers.margin != null ? "accounting engine adjusted EBIT / revenue" : "latest EBIT / revenue", margin, isFiniteNumber(margin) ? 0.9 : 0),
    roic: sourceLineageEntry(accountingDrivers.roic != null ? "accounting engine adjusted ROIC" : "NOPAT / invested capital", roic, isFiniteNumber(roic) ? 0.78 : 0),
    wacc: sourceLineageEntry("macro + beta + sector prior", wacc, 0.7),
    reinvestment: sourceLineageEntry(accountingDrivers.reinvestment != null ? "accounting engine economic reinvestment" : "capex / NOPAT", reinvestment, isFiniteNumber(reinvestment) ? 0.72 : 0),
    sector: sourceLineageEntry("company sector/industry", sector, sector ? 1 : 0),
    evidence: sourceLineageEntry("structured evidence claims/signals", evidenceSignals.evidenceCount, evidenceSignals.evidenceCount ? 0.85 : 0.35),
  };
  const lineage = applyOverrideLineage(rawLineage, driversOverride);

  const warnings = [];
  if (!isFiniteNumber(price)) warnings.push("missing_price");
  if (!isFiniteNumber(revenue)) warnings.push("missing_revenue");
  if (!isFiniteNumber(baseFcf)) warnings.push("missing_fcf");
  if (!isFiniteNumber(roic)) warnings.push("missing_roic");
  if (!isFiniteNumber(revenueCagr)) warnings.push("missing_revenue_cagr");

  const preliminaryDrivers = {
    ticker,
    name,
    sector,
    price,
    revenue,
    baseFcf,
    revenueCagr,
    margin,
    roic,
    wacc,
    terminalGrowth,
    reinvestment,
    taxRate,
    thesisQuality,
    demandSupply,
    bottleneckPower,
    dataQuality: 0.5,
    modelRisk: 0.5,
  };
  const quality = buildQualityReport(preliminaryDrivers, lineage, warnings);
  const dataQuality = firstFinite(driversOverride.dataQuality, snapshot.dataQuality, quality.score);
  const modelRisk = firstFinite(
    driversOverride.modelRisk,
    snapshot.modelRisk,
    clamp(1 - quality.score + warnings.length * 0.025 + (evidenceSignals.accountingTrust < 0.45 ? 0.08 : 0), 0.04, 0.95),
  );

  const drivers = {
    ...preliminaryDrivers,
    ...driversOverride,
    dataQuality,
    modelRisk,
  };

  return {
    version: "aurora_belief_driver_compiler_v1",
    ticker,
    name,
    drivers,
    evidenceSignals,
    accounting: snapshot.accounting || null,
    quality: buildQualityReport(drivers, lineage, warnings),
    sourceLineage: lineage,
    options,
  };
}

export function compileAuroraBeliefObject(snapshot = {}, options = {}) {
  const compiled = compileAuroraBeliefDrivers(snapshot, options);
  const beliefObject = buildAuroraPricedBeliefObject(compiled.drivers, snapshot, options);
  return {
    version: "aurora_belief_compiler_v1",
    compiledAt: options.compiledAt || new Date().toISOString(),
    ticker: compiled.ticker,
    name: compiled.name,
    drivers: compiled.drivers,
    driverQuality: compiled.quality,
    evidenceSignals: compiled.evidenceSignals,
    accounting: compiled.accounting,
    sourceLineage: compiled.sourceLineage,
    beliefObject,
    compilerMemo: {
      status: beliefObject.status,
      dataReadiness: compiled.quality.level,
      nextAction: compilerNextAction(compiled.quality, beliefObject),
      missingCriticalDrivers: compiled.quality.missing.filter((field) => ["price", "revenue", "baseFcf", "roic", "revenueCagr"].includes(field)),
      topBurden: beliefObject.assumptionBurdenOfProof.components[0] || null,
      topFalsifier: beliefObject.falsifiers[0] || null,
      decisionClass: beliefObject.decisionClass || null,
      decisionClassConfidence: beliefObject.decisionEvidence?.confidence ?? null,
      transitionSignal: beliefObject.transitionSignal || null,
      transitionScore: beliefObject.transitionSignal?.archetypeMigrationScore ?? null,
      falsifiabilityYield: beliefObject.falsifiabilityYield ?? null,
      topFalsifierSensitivity: beliefObject.falsifierSensitivity?.[0]?.key || null,
      valueDriverConcentration: beliefObject.valueDriverConcentration ?? null,
      evidenceDebt: beliefObject.evidenceDebt ?? null,
      beliefDistortionIndex: beliefObject.beliefDistortionIndex ?? null,
      assumptionLegitimacyTop: beliefObject.lensLegitimacy?.[0] || null,
    },
  };
}

export function compileAuroraBeliefPanel(snapshots = [], options = {}) {
  const rows = arrayOrEmpty(snapshots);
  const objects = rows.map((snapshot) => compileAuroraBeliefObject(snapshot, options));
  const abstentions = objects.filter((item) => item.beliefObject.abstain).length;
  const readinessCounts = objects.reduce((acc, item) => {
    acc[item.driverQuality.level] = (acc[item.driverQuality.level] || 0) + 1;
    return acc;
  }, {});
  const averageDistortion = objects.length
    ? objects.reduce((sum, item) => sum + item.beliefObject.beliefDistortionIndex, 0) / objects.length
    : 0;
  return {
    version: "aurora_belief_panel_v1",
    count: objects.length,
    abstentionShare: objects.length ? abstentions / objects.length : 0,
    readinessCounts,
    averageDistortion,
    objects,
  };
}
