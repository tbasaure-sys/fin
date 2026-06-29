const DEFAULT_TAX_RATE = 0.22;

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

function statementYear(statement = {}) {
  const raw = statement.fiscalYear || statement.calendarYear || statement.year || statement.date || statement.fiscalDate;
  if (raw == null) return 0;
  const text = String(raw);
  const year = Number(text.slice(0, 4));
  return Number.isFinite(year) ? year : Number(raw) || 0;
}

function sortStatements(statements) {
  return arrayOrEmpty(statements)
    .filter((item) => item && typeof item === "object")
    .sort((a, b) => statementYear(a) - statementYear(b));
}

function latestStatement(statements) {
  const sorted = sortStatements(statements);
  return sorted[sorted.length - 1] || {};
}

function revenueFrom(statement = {}) {
  return firstFinite(statement.revenue, statement.totalRevenue, statement.sales, statement.netSales);
}

function ebitFrom(statement = {}) {
  return firstFinite(statement.ebit, statement.operatingIncome, statement.incomeFromOperations);
}

function rdFrom(statement = {}) {
  return firstFinite(statement.researchAndDevelopmentExpenses, statement.researchAndDevelopment, statement.rAndD, statement.rdExpense) || 0;
}

function sbcFrom(statement = {}) {
  return firstFinite(statement.stockBasedCompensation, statement.shareBasedCompensation, statement.sbc) || 0;
}

function operatingCashFlowFrom(statement = {}) {
  return firstFinite(statement.operatingCashFlow, statement.netCashProvidedByOperatingActivities, statement.cashFromOperations);
}

function capexFrom(statement = {}) {
  const capex = firstFinite(statement.capitalExpenditure, statement.capitalExpenditures, statement.capex);
  return isFiniteNumber(capex) ? Math.abs(capex) : null;
}

function freeCashFlowFrom(statement = {}) {
  const explicit = firstFinite(statement.freeCashFlow, statement.fcf);
  if (isFiniteNumber(explicit)) return explicit;
  const ocf = operatingCashFlowFrom(statement);
  const capex = capexFrom(statement);
  if (isFiniteNumber(ocf) && isFiniteNumber(capex)) return ocf - capex;
  return null;
}

function debtFrom(statement = {}) {
  const shortDebt = numeric(statement.shortTermDebt, 0);
  const longDebt = numeric(statement.longTermDebt, 0);
  return firstFinite(statement.totalDebt, shortDebt + longDebt, statement.debt) || 0;
}

function cashFrom(statement = {}) {
  return firstFinite(statement.cashAndCashEquivalents, statement.cashAndShortTermInvestments, statement.cash) || 0;
}

function equityFrom(statement = {}) {
  return firstFinite(statement.totalStockholdersEquity, statement.totalEquity, statement.shareholdersEquity);
}

function goodwillFrom(statement = {}) {
  return firstFinite(statement.goodwill, statement.goodwillAndIntangibleAssets) || 0;
}

function leaseDebtFrom(statement = {}) {
  return (
    firstFinite(
      statement.operatingLeaseLiability,
      statement.operatingLeaseLiabilities,
      statement.financeLeaseLiability,
      statement.leaseLiabilities,
      statement.operatingLeaseRightOfUseAsset,
    ) || 0
  );
}

function sectorRdLifeYears(sectorText = "") {
  const sector = String(sectorText).toLowerCase();
  if (/biotech|pharma|drug|life science/.test(sector)) return 10;
  if (/software|internet|platform|semiconductor|technology/.test(sector)) return 5;
  if (/industrial|aerospace|medical/.test(sector)) return 4;
  return 3;
}

function computeRdAsset(incomeStatements, lifeYears) {
  const sorted = sortStatements(incomeStatements);
  const history = sorted.slice(-lifeYears).reverse();
  let asset = 0;
  let amortization = 0;
  const schedule = history.map((statement, age) => {
    const rd = rdFrom(statement);
    const remainingShare = Math.max(0, 1 - (age + 1) / lifeYears);
    const carryingValue = rd * remainingShare;
    const annualAmortization = rd / lifeYears;
    asset += carryingValue;
    amortization += annualAmortization;
    return {
      year: statementYear(statement),
      rd,
      age,
      carryingValue,
      annualAmortization,
    };
  });
  return {
    asset,
    amortization,
    schedule,
  };
}

function computeGrowthSplit(incomeStatements) {
  const sorted = sortStatements(incomeStatements);
  if (sorted.length < 2) {
    return {
      organicGrowth: null,
      acquiredGrowth: null,
      acquisitionIntensity: null,
    };
  }
  const current = sorted[sorted.length - 1];
  const prior = sorted[sorted.length - 2];
  const revenue = revenueFrom(current);
  const priorRevenue = revenueFrom(prior);
  const acquiredRevenue = firstFinite(current.acquiredRevenue, current.revenueFromAcquisitions, current.acquisitionRevenue) || 0;
  const totalGrowth = isFiniteNumber(revenue) && isFiniteNumber(priorRevenue) && priorRevenue > 0 ? (revenue - priorRevenue) / priorRevenue : null;
  const acquiredGrowth = isFiniteNumber(priorRevenue) && priorRevenue > 0 ? acquiredRevenue / priorRevenue : null;
  return {
    organicGrowth: isFiniteNumber(totalGrowth) && isFiniteNumber(acquiredGrowth) ? totalGrowth - acquiredGrowth : totalGrowth,
    acquiredGrowth,
    acquisitionIntensity: safeDivide(acquiredRevenue, revenue, 0),
  };
}

function sourceCompleteness(inputs) {
  const fields = [
    inputs.revenue,
    inputs.reportedEbit,
    inputs.reportedFcf,
    inputs.equity,
    inputs.debt,
    inputs.rdCurrent,
  ];
  const available = fields.filter((value) => isFiniteNumber(value)).length;
  return available / fields.length;
}

export function buildAuroraAccountingEngine(snapshot = {}, options = {}) {
  const financials = snapshot.financials || {};
  const company = snapshot.company || snapshot.profile || {};
  const incomeStatements = financials.incomeStatements || financials.incomeStatement || snapshot.incomeStatements || snapshot.incomeStatement;
  const balanceSheets = financials.balanceSheets || financials.balanceSheet || snapshot.balanceSheets || snapshot.balanceSheet;
  const cashFlows = financials.cashFlows || financials.cashFlow || snapshot.cashFlows || snapshot.cashFlow;
  const income = latestStatement(incomeStatements);
  const balance = latestStatement(balanceSheets);
  const cashFlow = latestStatement(cashFlows);
  const policy = {
    capitalizeResearchAndDevelopment: options.capitalizeResearchAndDevelopment ?? true,
    rdLifeYears: options.rdLifeYears || snapshot.accountingPolicy?.rdLifeYears || sectorRdLifeYears(`${company.sector || ""} ${company.industry || ""}`),
    treatSbcAsEconomicCost: options.treatSbcAsEconomicCost ?? true,
    addLeaseDebtToInvestedCapital: options.addLeaseDebtToInvestedCapital ?? true,
    taxRate: clamp(options.taxRate ?? snapshot.taxRate ?? snapshot.drivers?.taxRate ?? DEFAULT_TAX_RATE, 0, 0.45),
  };

  const revenue = revenueFrom(income);
  const reportedEbit = ebitFrom(income);
  const reportedFcf = freeCashFlowFrom(cashFlow);
  const rdCurrent = rdFrom(income);
  const sbc = sbcFrom(cashFlow) || sbcFrom(income);
  const capex = capexFrom(cashFlow);
  const debt = debtFrom(balance);
  const cash = cashFrom(balance);
  const equity = equityFrom(balance);
  const goodwill = goodwillFrom(balance);
  const leaseDebt = policy.addLeaseDebtToInvestedCapital ? leaseDebtFrom(balance) : 0;
  const rdCapitalization = policy.capitalizeResearchAndDevelopment ? computeRdAsset(incomeStatements, policy.rdLifeYears) : { asset: 0, amortization: 0, schedule: [] };
  const adjustedEbit = isFiniteNumber(reportedEbit)
    ? reportedEbit + (policy.capitalizeResearchAndDevelopment ? rdCurrent - rdCapitalization.amortization : 0)
    : null;
  const sbcEconomicCost = policy.treatSbcAsEconomicCost ? sbc : 0;
  const adjustedNopat = isFiniteNumber(adjustedEbit) ? (adjustedEbit - sbcEconomicCost) * (1 - policy.taxRate) : null;
  const reportedInvestedCapital = isFiniteNumber(equity) ? Math.max(1, equity + debt - cash) : null;
  const adjustedInvestedCapital = isFiniteNumber(reportedInvestedCapital)
    ? Math.max(1, reportedInvestedCapital + rdCapitalization.asset + leaseDebt)
    : null;
  const adjustedRoic = safeDivide(adjustedNopat, adjustedInvestedCapital, null);
  const adjustedMargin = safeDivide(adjustedEbit, revenue, null);
  const adjustedFcf = isFiniteNumber(reportedFcf)
    ? reportedFcf - sbcEconomicCost + (policy.capitalizeResearchAndDevelopment ? rdCurrent - rdCapitalization.amortization : 0)
    : null;
  const reinvestment = isFiniteNumber(adjustedNopat) && isFiniteNumber(capex) ? clamp((capex + rdCurrent) / Math.max(1, adjustedNopat), 0, 1.25) : null;
  const dilutionDrag = safeDivide(sbcEconomicCost, revenue, 0);
  const goodwillShareOfCapital = safeDivide(goodwill, adjustedInvestedCapital, 0);
  const growthSplit = computeGrowthSplit(incomeStatements);
  const completeness = sourceCompleteness({ revenue, reportedEbit, reportedFcf, equity, debt, rdCurrent });
  const warnings = [];
  if (!isFiniteNumber(revenue)) warnings.push("missing_revenue");
  if (!isFiniteNumber(reportedEbit)) warnings.push("missing_reported_ebit");
  if (!isFiniteNumber(reportedFcf)) warnings.push("missing_reported_fcf");
  if (!isFiniteNumber(equity)) warnings.push("missing_equity_for_invested_capital");
  if (dilutionDrag > 0.08) warnings.push("high_sbc_dilution_drag");
  if (goodwillShareOfCapital > 0.45) warnings.push("high_goodwill_share_of_capital");

  return {
    version: "aurora_accounting_engine_v1",
    company: {
      ticker: snapshot.ticker || company.ticker || company.symbol || null,
      name: company.name || company.companyName || null,
      sector: company.sector || null,
      industry: company.industry || null,
    },
    policy,
    reported: {
      revenue,
      ebit: reportedEbit,
      operatingMargin: safeDivide(reportedEbit, revenue, null),
      freeCashFlow: reportedFcf,
      investedCapital: reportedInvestedCapital,
      roic: isFiniteNumber(reportedEbit) && isFiniteNumber(reportedInvestedCapital) ? (reportedEbit * (1 - policy.taxRate)) / reportedInvestedCapital : null,
      capex,
      researchAndDevelopment: rdCurrent,
      stockBasedCompensation: sbc,
      debt,
      cash,
      equity,
      goodwill,
      leaseDebt,
    },
    adjustments: {
      rdAsset: rdCapitalization.asset,
      rdAmortization: rdCapitalization.amortization,
      rdSchedule: rdCapitalization.schedule,
      sbcEconomicCost,
      leaseDebt,
      goodwillShareOfCapital,
      dilutionDrag,
      growthSplit,
    },
    economic: {
      adjustedEbit,
      adjustedNopat,
      adjustedOperatingMargin: adjustedMargin,
      adjustedFreeCashFlow: adjustedFcf,
      adjustedInvestedCapital,
      adjustedRoic,
      reinvestment,
    },
    drivers: {
      baseFcf: adjustedFcf,
      margin: adjustedMargin,
      roic: adjustedRoic,
      reinvestment,
      taxRate: policy.taxRate,
    },
    quality: {
      score: clamp(0.18 + completeness * 0.72 - warnings.length * 0.035, 0, 1),
      level: completeness >= 0.84 ? "decision_grade" : completeness >= 0.58 ? "research_grade" : completeness >= 0.34 ? "memo_only" : "insufficient",
      completeness,
      warnings,
    },
    sourceLineage: {
      revenue: "latest income statement",
      ebit: "latest income statement",
      fcf: "latest cash-flow statement",
      investedCapital: "latest balance sheet + economic adjustments",
      rdAsset: "R&D capitalization schedule",
      sbcEconomicCost: "cash flow / income statement stock-based compensation",
    },
    memo: {
      headline: "Accounting engine reconstructed economic EBIT, invested capital, ROIC and FCF.",
      rdCapitalized: policy.capitalizeResearchAndDevelopment,
      sbcTreatment: policy.treatSbcAsEconomicCost ? "SBC remains an economic cost; it is not blindly added back." : "SBC economic cost adjustment disabled.",
      warnings,
    },
  };
}
