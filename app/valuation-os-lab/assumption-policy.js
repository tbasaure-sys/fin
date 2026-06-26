const DEFAULT_TAX_RATE = 0.21;
const DEFAULT_EQUITY_RISK_PREMIUM = 0.047;

export const INDUSTRY_POLICIES = {
  software: {
    label: "Software / digital infrastructure",
    beta: 1.08,
    debtWeight: 0.08,
    debtSpread: 0.018,
    terminalRoicRange: [0.12, 0.26],
    waccRange: [0.075, 0.13],
    terminalGrowthRange: [0.018, 0.038],
    reinvestmentMultiplier: 2.2,
    moatBaseYears: 7,
    cyclicality: 0.22,
  },
  semiconductors: {
    label: "Semiconductors / capital equipment",
    beta: 1.22,
    debtWeight: 0.12,
    debtSpread: 0.022,
    terminalRoicRange: [0.09, 0.24],
    waccRange: [0.08, 0.145],
    terminalGrowthRange: [0.016, 0.035],
    reinvestmentMultiplier: 3.1,
    moatBaseYears: 6,
    cyclicality: 0.42,
  },
  bank: {
    label: "Bank / credit institution",
    beta: 1.05,
    debtWeight: 0,
    debtSpread: 0,
    terminalRoicRange: [0.075, 0.15],
    waccRange: [0.085, 0.135],
    terminalGrowthRange: [0.012, 0.028],
    reinvestmentMultiplier: 1.0,
    moatBaseYears: 4,
    cyclicality: 0.5,
  },
  insurance: {
    label: "Insurance / financial balance sheet",
    beta: 0.92,
    debtWeight: 0,
    debtSpread: 0,
    terminalRoicRange: [0.07, 0.15],
    waccRange: [0.078, 0.125],
    terminalGrowthRange: [0.012, 0.027],
    reinvestmentMultiplier: 1.0,
    moatBaseYears: 4,
    cyclicality: 0.38,
  },
  utility: {
    label: "Regulated utility",
    beta: 0.62,
    debtWeight: 0.42,
    debtSpread: 0.018,
    terminalRoicRange: [0.055, 0.105],
    waccRange: [0.055, 0.09],
    terminalGrowthRange: [0.01, 0.024],
    reinvestmentMultiplier: 4.8,
    moatBaseYears: 10,
    cyclicality: 0.12,
  },
  energy: {
    label: "Energy / commodity producer",
    beta: 1.15,
    debtWeight: 0.22,
    debtSpread: 0.028,
    terminalRoicRange: [0.07, 0.17],
    waccRange: [0.08, 0.15],
    terminalGrowthRange: [0.005, 0.024],
    reinvestmentMultiplier: 4.4,
    moatBaseYears: 3,
    cyclicality: 0.66,
  },
  realEstate: {
    label: "Real estate / REIT",
    beta: 0.82,
    debtWeight: 0.38,
    debtSpread: 0.024,
    terminalRoicRange: [0.045, 0.095],
    waccRange: [0.06, 0.105],
    terminalGrowthRange: [0.01, 0.026],
    reinvestmentMultiplier: 5.2,
    moatBaseYears: 5,
    cyclicality: 0.35,
  },
  healthcare: {
    label: "Healthcare / medical products",
    beta: 0.88,
    debtWeight: 0.14,
    debtSpread: 0.019,
    terminalRoicRange: [0.09, 0.22],
    waccRange: [0.07, 0.12],
    terminalGrowthRange: [0.016, 0.034],
    reinvestmentMultiplier: 2.6,
    moatBaseYears: 7,
    cyclicality: 0.22,
  },
  consumerStaples: {
    label: "Consumer staples",
    beta: 0.72,
    debtWeight: 0.18,
    debtSpread: 0.017,
    terminalRoicRange: [0.08, 0.19],
    waccRange: [0.065, 0.105],
    terminalGrowthRange: [0.014, 0.03],
    reinvestmentMultiplier: 2.8,
    moatBaseYears: 6,
    cyclicality: 0.18,
  },
  industrial: {
    label: "Industrial / capital goods",
    beta: 1.05,
    debtWeight: 0.18,
    debtSpread: 0.022,
    terminalRoicRange: [0.075, 0.18],
    waccRange: [0.075, 0.135],
    terminalGrowthRange: [0.012, 0.03],
    reinvestmentMultiplier: 3.5,
    moatBaseYears: 4.5,
    cyclicality: 0.45,
  },
  default: {
    label: "Broad operating company",
    beta: 1.0,
    debtWeight: 0.16,
    debtSpread: 0.022,
    terminalRoicRange: [0.07, 0.2],
    waccRange: [0.07, 0.14],
    terminalGrowthRange: [0.012, 0.033],
    reinvestmentMultiplier: 3.2,
    moatBaseYears: 4.5,
    cyclicality: 0.35,
  },
};

function clamp(value, min, max) {
  if (!Number.isFinite(Number(value))) return min;
  return Math.min(Math.max(Number(value), min), max);
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : null;
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

export function classifyIndustry({ name, sicDescription } = {}) {
  const text = `${name || ""} ${sicDescription || ""}`.toLowerCase();
  if (includesAny(text, ["bank", "bancorp", "credit", "savings institution", "commercial banks"])) return "bank";
  if (includesAny(text, ["insurance", "assurance", "reinsurance"])) return "insurance";
  if (includesAny(text, ["semiconductor", "semi-conductor", "chip", "lithography", "wafer", "asml"])) return "semiconductors";
  if (includesAny(text, ["software", "cloud", "saas", "internet services", "data processing", "prepackaged software"])) return "software";
  if (includesAny(text, ["electric", "gas utility", "water supply", "regulated utility", "utilities"])) return "utility";
  if (includesAny(text, ["oil", "gas", "energy", "petroleum", "mining", "coal"])) return "energy";
  if (includesAny(text, ["reit", "real estate", "property", "lessors"])) return "realEstate";
  if (includesAny(text, ["pharma", "biotechnology", "medical", "health", "drug", "diagnostic"])) return "healthcare";
  if (includesAny(text, ["food", "beverage", "household", "tobacco", "staples"])) return "consumerStaples";
  if (includesAny(text, ["industrial", "machinery", "aerospace", "transportation equipment", "capital goods"])) return "industrial";
  return "default";
}

export function buildAssumptionPolicy({ name, sicDescription, riskFreeRate, roic, capexToRevenue, factsPresent }) {
  const industryKey = classifyIndustry({ name, sicDescription });
  const policy = INDUSTRY_POLICIES[industryKey] || INDUSTRY_POLICIES.default;
  const rf = finiteNumberOrNull(riskFreeRate) ?? 0.042;
  const beta = policy.beta;
  const equityCost = rf + beta * DEFAULT_EQUITY_RISK_PREMIUM;
  const afterTaxDebtCost = (rf + policy.debtSpread) * (1 - DEFAULT_TAX_RATE);
  const waccRaw = equityCost * (1 - policy.debtWeight) + afterTaxDebtCost * policy.debtWeight;
  const roicValue = finiteNumberOrNull(roic);
  const capexValue = finiteNumberOrNull(capexToRevenue);
  const lowProfitabilityPenalty = roicValue !== null ? Math.max(0, policy.waccRange[0] - roicValue) * 0.12 : 0.002;
  const wacc = clamp(waccRaw + lowProfitabilityPenalty, policy.waccRange[0], policy.waccRange[1]);
  const roicInput = roicValue ?? (policy.terminalRoicRange[0] + policy.terminalRoicRange[1]) / 2;
  const fadeWeight = industryKey === "utility" || industryKey === "realEstate" || industryKey === "bank" ? 0.5 : 0.68;
  const terminalRoic = clamp(
    roicInput * fadeWeight + wacc * (1 - fadeWeight),
    policy.terminalRoicRange[0],
    policy.terminalRoicRange[1],
  );
  const terminalGrowth = clamp(rf * 0.42 + (1 - policy.cyclicality) * 0.004, policy.terminalGrowthRange[0], policy.terminalGrowthRange[1]);
  const reinvestment =
    capexValue !== null
      ? clamp(capexValue * policy.reinvestmentMultiplier, 0.1, industryKey === "utility" || industryKey === "realEstate" ? 0.85 : 0.72)
      : null;
  const moatHalfLife = clamp(policy.moatBaseYears + Math.max(0, roicInput - wacc) * 35 - policy.cyclicality * 1.5, 2, 15);
  const confidence = clamp(0.46 + Number(factsPresent || 0) * 0.035 - policy.cyclicality * 0.08, 0.25, 0.82);

  return {
    industryKey,
    label: policy.label,
    riskFreeRate: rf,
    equityRiskPremium: DEFAULT_EQUITY_RISK_PREMIUM,
    beta,
    debtWeight: policy.debtWeight,
    debtSpread: policy.debtSpread,
    taxRate: DEFAULT_TAX_RATE,
    waccRange: policy.waccRange,
    terminalRoicRange: policy.terminalRoicRange,
    terminalGrowthRange: policy.terminalGrowthRange,
    wacc,
    terminalRoic,
    terminalGrowth,
    reinvestment,
    moatHalfLife,
    confidence,
    sources: [
      "Risk-free: FRED DGS10 when configured; otherwise U.S. Treasury daily yield curve 10Y, then CBOE 10Y market proxy; final explicit fallback only if all fail.",
      "Industry prior: internal policy keyed from SEC SIC description and issuer name.",
      "WACC: risk-free + beta-adjusted ERP + after-tax debt spread, bounded by industry range.",
      "Terminal ROIC / growth / reinvestment: sector-bounded priors adjusted by observed ROIC and capex intensity.",
    ],
  };
}
