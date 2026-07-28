const AUTHORIZATION_LABELS = {
  RANKABLE: {
    en: "High research priority",
    es: "Prioridad de investigación alta",
  },
  RESEARCHABLE: {
    en: "Open research file",
    es: "Abrir archivo de investigación",
  },
  ABSTAIN: {
    en: "Insufficient evidence",
    es: "Evidencia insuficiente",
  },
};

const OPPORTUNITY_TYPE_LABELS = {
  COMPOUNDER: {
    en: "Reinvestment quality",
    es: "Calidad reinvertible",
  },
  INFLECTION: {
    en: "Operational inflection",
    es: "Mejora operacional",
  },
  DEEP_VALUE: {
    en: "Discounted asset",
    es: "Activo descontado",
  },
  OPTIONALITY: {
    en: "Optionality review",
    es: "Opcionalidad con revisión",
  },
};

const TYPE_ORDER = ["COMPOUNDER", "INFLECTION", "DEEP_VALUE", "OPTIONALITY"];

const TYPE_WEIGHTS = {
  COMPOUNDER: { quality: 0.3, growth: 0.2, survival: 0.13, neglect: 0.2, inflection: 0.05, valuation: 0.12 },
  INFLECTION: { quality: 0.1, growth: 0.12, survival: 0.2, neglect: 0.18, inflection: 0.28, valuation: 0.12 },
  DEEP_VALUE: { quality: 0.1, growth: 0.05, survival: 0.25, neglect: 0.18, inflection: 0.1, valuation: 0.32 },
  OPTIONALITY: { quality: 0.05, growth: 0.1, survival: 0.4, neglect: 0.2, inflection: 0.15, valuation: 0.1 },
};

const DISCLAIMER =
  "This module prioritizes research only. It is not financial advice, a buy/sell recommendation, or an invitation to transact. Every thesis must be verified independently against primary filings.";

const SAMPLE_UNIVERSE = [
  {
    ticker: "HROW",
    name: "Harrow",
    sector: "Healthcare",
    industry: "Specialty pharmaceuticals",
    region: "US",
    platform: "Tradable now",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-05-09",
    marketCapUsd: 820_000_000,
    advUsd: 5_400_000,
    price: 22.8,
    residualVol: 0.46,
    grossMargin: 0.72,
    fcfMargin: 0.08,
    roic: 0.09,
    revenueGrowthTtm: 0.22,
    revenueAcceleration: 0.11,
    grossMarginExpansion: 0.04,
    ebitMarginExpansion: 0.05,
    fcfImprovementToSales: 0.04,
    netCashToMarketCap: -0.08,
    cashRunwayMonths: null,
    isBurning: false,
    dilutionTtm: 0.04,
    fcfYield: 0.061,
    evGrossProfit: 5.8,
    evSales: 3.9,
    analystCount: 3,
    institutionalOwnership: 0.17,
    newsCount90d: 18,
    thesis:
      "Specialty pharma platform with operating leverage and improving cash conversion after a heavy investment period.",
    whyNow:
      "Quarterly revenue acceleration and product mix are starting to show through reported margins.",
    killCriteria:
      "FCF fails to scale, debt becomes the thesis, or share count expands faster than revenue.",
    sourceNotes: "FMP quarterly fundamentals, SEC filing freshness, and catalyst news adapter.",
  },
  {
    ticker: "KITS",
    name: "Kits Eyecare",
    sector: "Consumer digital",
    industry: "Internet retail",
    region: "North America",
    platform: "Tradable now",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-05-15",
    marketCapUsd: 310_000_000,
    advUsd: 420_000,
    price: 9.7,
    residualVol: 0.43,
    grossMargin: 0.34,
    fcfMargin: 0.07,
    roic: 0.15,
    revenueGrowthTtm: 0.28,
    revenueAcceleration: 0.04,
    grossMarginExpansion: 0.02,
    ebitMarginExpansion: 0.02,
    fcfImprovementToSales: 0.03,
    netCashToMarketCap: 0.06,
    cashRunwayMonths: null,
    isBurning: false,
    dilutionTtm: 0.05,
    fcfYield: 0.038,
    evGrossProfit: 8.2,
    evSales: 2.7,
    analystCount: 2,
    institutionalOwnership: 0.11,
    newsCount90d: 9,
    thesis:
      "Small digital optical retailer with repeat purchase behavior, improving scale economics, and low institutional attention.",
    whyNow:
      "Unit economics are improving while the market still treats it as a thinly followed consumer name.",
    killCriteria:
      "CAC rises faster than gross profit, growth decelerates sharply, or inventory discipline breaks.",
    sourceNotes: "Small-cap sample with tradability, neglect, and filing freshness checks.",
  },
  {
    ticker: "GCT",
    name: "GigaCloud Technology",
    sector: "Internet commerce",
    industry: "Marketplace logistics",
    region: "US",
    platform: "Tradable now",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-05-07",
    marketCapUsd: 1_150_000_000,
    advUsd: 10_600_000,
    price: 27.1,
    residualVol: 0.63,
    grossMargin: 0.28,
    fcfMargin: 0.12,
    roic: 0.11,
    revenueGrowthTtm: 0.36,
    revenueAcceleration: 0.02,
    grossMarginExpansion: 0.005,
    ebitMarginExpansion: 0.004,
    fcfImprovementToSales: 0.015,
    netCashToMarketCap: 0.18,
    cashRunwayMonths: null,
    isBurning: false,
    dilutionTtm: 0.09,
    fcfYield: 0.116,
    evGrossProfit: 3.7,
    evSales: 1.05,
    analystCount: 4,
    institutionalOwnership: 0.24,
    newsCount90d: 25,
    manualReview: true,
    thesis:
      "Fast-growing marketplace/logistics model trading at a value multiple because investors distrust durability.",
    whyNow:
      "Cash generation and net cash can force a re-read if growth persists through the next filing cycle.",
    killCriteria:
      "Revenue quality deteriorates, working capital consumes cash, or governance flags rise.",
    sourceNotes: "High-upside/high-controversy sample; governance review is mandatory.",
  },
  {
    ticker: "TSSI",
    name: "TSS",
    sector: "AI infrastructure services",
    industry: "Technology services",
    region: "US",
    platform: "Tradable now",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-05-14",
    marketCapUsd: 260_000_000,
    advUsd: 1_700_000,
    price: 12.4,
    residualVol: 0.58,
    grossMargin: 0.24,
    fcfMargin: 0.04,
    roic: 0.06,
    revenueGrowthTtm: 0.49,
    revenueAcceleration: 0.16,
    grossMarginExpansion: 0.03,
    ebitMarginExpansion: 0.06,
    fcfImprovementToSales: 0.05,
    netCashToMarketCap: 0.02,
    cashRunwayMonths: null,
    isBurning: false,
    dilutionTtm: 0.18,
    fcfYield: 0.044,
    evGrossProfit: 7.5,
    evSales: 1.8,
    analystCount: 1,
    institutionalOwnership: 0.08,
    newsCount90d: 14,
    thesis:
      "Small service provider exposed to AI data-center buildout with operating leverage if demand remains real.",
    whyNow:
      "Backlog and revenue acceleration can move the business before broad analyst coverage catches up.",
    killCriteria:
      "Customer concentration bites, margins fail to expand, or AI capex demand normalizes abruptly.",
    sourceNotes: "Catalyst-heavy sample; any memo needs customer-concentration review.",
  },
  {
    ticker: "PFIE",
    name: "Profire Energy",
    sector: "Energy equipment",
    industry: "Oilfield equipment",
    region: "US",
    platform: "Tradable now",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-05-08",
    marketCapUsd: 96_000_000,
    advUsd: 240_000,
    price: 2.1,
    residualVol: 0.35,
    grossMargin: 0.39,
    fcfMargin: 0.1,
    roic: 0.08,
    revenueGrowthTtm: 0.08,
    revenueAcceleration: -0.01,
    grossMarginExpansion: 0.005,
    ebitMarginExpansion: 0.003,
    fcfImprovementToSales: 0.01,
    netCashToMarketCap: 0.35,
    cashRunwayMonths: null,
    isBurning: false,
    dilutionTtm: -0.02,
    fcfYield: 0.093,
    evGrossProfit: 2.8,
    evSales: 1.0,
    analystCount: 0,
    institutionalOwnership: null,
    newsCount90d: 4,
    thesis:
      "Tiny profitable equipment name with net cash and low attention; upside depends on capital discipline.",
    whyNow:
      "The setup is more balance-sheet asymmetry than growth: net cash reduces permanent-loss risk.",
    killCriteria:
      "Energy cycle weakens, cash is spent poorly, or liquidity becomes too thin.",
    sourceNotes: "Neglect/value sample; missing institutional ownership is neutralized and flagged.",
  },
  {
    ticker: "CECO",
    name: "CECO Environmental",
    sector: "Industrials",
    industry: "Environmental systems",
    region: "US",
    platform: "Tradable now",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-05-06",
    marketCapUsd: 1_050_000_000,
    advUsd: 6_200_000,
    price: 29.9,
    residualVol: 0.37,
    grossMargin: 0.36,
    fcfMargin: 0.06,
    roic: 0.14,
    revenueGrowthTtm: 0.2,
    revenueAcceleration: 0.035,
    grossMarginExpansion: 0.015,
    ebitMarginExpansion: 0.015,
    fcfImprovementToSales: 0.02,
    netCashToMarketCap: -0.16,
    cashRunwayMonths: null,
    isBurning: false,
    dilutionTtm: 0.08,
    fcfYield: 0.035,
    evGrossProfit: 9.0,
    evSales: 3.2,
    analystCount: 5,
    institutionalOwnership: 0.37,
    newsCount90d: 17,
    thesis:
      "Niche industrial environmental systems with secular demand and an acquisition-led compounding path.",
    whyNow:
      "Backlog and margin execution can validate the small industrial compounder story.",
    killCriteria:
      "Integration debt rises, backlog quality weakens, or margin gains reverse.",
    sourceNotes: "Near upper bound of the small-cap universe; less neglected than the microcaps.",
  },
  {
    ticker: "AEHR",
    name: "Aehr Test Systems",
    sector: "Semiconductor equipment",
    industry: "Semiconductor equipment",
    region: "US",
    platform: "Tradable now",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-04-12",
    marketCapUsd: 360_000_000,
    advUsd: 4_700_000,
    price: 12.2,
    residualVol: 0.71,
    grossMargin: 0.5,
    fcfMargin: -0.02,
    roic: 0.02,
    revenueGrowthTtm: -0.04,
    revenueAcceleration: 0.08,
    grossMarginExpansion: -0.01,
    ebitMarginExpansion: -0.02,
    fcfImprovementToSales: -0.01,
    netCashToMarketCap: 0.22,
    cashRunwayMonths: 42,
    isBurning: true,
    dilutionTtm: 0.11,
    fcfYield: -0.014,
    evGrossProfit: 8.8,
    evSales: 4.4,
    analystCount: 3,
    institutionalOwnership: 0.19,
    newsCount90d: 22,
    optionalityDriver: true,
    thesis:
      "Semicap optionality with customer concentration and cyclical uncertainty; potentially asymmetric but fragile.",
    whyNow:
      "New order flow or customer diversification could matter more than trailing numbers.",
    killCriteria:
      "No order recovery, customer concentration worsens, or cash burn accelerates.",
    sourceNotes: "High-volatility optionality file; human review is mandatory before valuation.",
  },
  {
    ticker: "REPX",
    name: "Riley Exploration Permian",
    sector: "Energy",
    industry: "Oil & gas exploration",
    region: "US",
    platform: "Tradable now",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-05-10",
    marketCapUsd: 610_000_000,
    advUsd: 980_000,
    price: 29.2,
    residualVol: 0.41,
    grossMargin: 0.59,
    fcfMargin: 0.18,
    roic: 0.1,
    revenueGrowthTtm: 0.11,
    revenueAcceleration: -0.02,
    grossMarginExpansion: -0.005,
    ebitMarginExpansion: -0.003,
    fcfImprovementToSales: 0.01,
    netCashToMarketCap: -0.22,
    cashRunwayMonths: null,
    isBurning: false,
    dilutionTtm: 0.06,
    fcfYield: 0.132,
    evGrossProfit: 3.2,
    evSales: 1.4,
    analystCount: 4,
    institutionalOwnership: 0.15,
    newsCount90d: 11,
    thesis:
      "Cash-flowing small energy producer where shareholder returns can matter if commodity risk is understood.",
    whyNow:
      "High FCF yield plus capital return discipline can re-rate a neglected energy small cap.",
    killCriteria:
      "Commodity downside, leverage creep, or reserve quality disappointment.",
    sourceNotes: "Commodity-linked value file; portfolio stress engine should handle risk after memo.",
  },
  {
    ticker: "EAF",
    name: "GrafTech International",
    sector: "Materials",
    industry: "Graphite electrodes",
    region: "US",
    platform: "Tradable now",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-05-02",
    marketCapUsd: 520_000_000,
    advUsd: 3_100_000,
    price: 2.0,
    residualVol: 0.66,
    grossMargin: 0.12,
    fcfMargin: -0.19,
    roic: -0.04,
    revenueGrowthTtm: -0.21,
    revenueAcceleration: -0.1,
    grossMarginExpansion: -0.07,
    ebitMarginExpansion: -0.09,
    fcfImprovementToSales: -0.08,
    netCashToMarketCap: -1.4,
    cashRunwayMonths: 7,
    isBurning: true,
    dilutionTtm: 0.03,
    fcfYield: -0.19,
    evGrossProfit: 18.5,
    evSales: 5.8,
    analystCount: 4,
    institutionalOwnership: 0.42,
    newsCount90d: 19,
    redFlagPenalty: 0.44,
    thesis:
      "Cheap-looking cyclical with balance-sheet stress; useful as an example of why cheap is not enough.",
    whyNow:
      "Only interesting if the cycle turns and refinancing risk falls.",
    killCriteria:
      "Debt burden remains high or pricing fails to recover.",
    sourceNotes: "Expected diagnostic file; red flags should dominate the authorization tier.",
  },
];

const BLOCK_LABELS = {
  quality: { en: "Quality", es: "Calidad" },
  growth: { en: "Growth", es: "Crecimiento" },
  survival: { en: "Survival", es: "Supervivencia" },
  neglect: { en: "Neglect", es: "Atención baja" },
  inflection: { en: "Inflection", es: "Inflexión" },
  valuation: { en: "Valuation", es: "Valoración" },
};

const SCORE_CUTS = {
  grossMargin: [[0.2, 25], [0.35, 45], [0.5, 65], [0.65, 85], [0.8, 95]],
  fcfMargin: [[0, 40], [0.05, 60], [0.1, 75], [0.15, 88], [0.25, 95]],
  roic: [[0.05, 35], [0.09, 55], [0.13, 72], [0.18, 85], [0.25, 95]],
  growth: [[0, 30], [0.05, 45], [0.1, 60], [0.2, 78], [0.35, 90], [0.5, 95]],
  acceleration: [[-0.05, 30], [0, 50], [0.03, 65], [0.08, 80], [0.15, 92]],
  marginExpansion: [[-0.02, 30], [0, 50], [0.01, 62], [0.03, 78], [0.06, 90]],
  netCash: [[-0.3, 20], [-0.1, 40], [0, 60], [0.1, 75], [0.25, 90]],
  runway: [[9, 15], [12, 35], [18, 55], [24, 75], [36, 90]],
  dilution: [[0.03, 95], [0.08, 78], [0.15, 55], [0.3, 30], [0.5, 12]],
  fcfYield: [[0, 30], [0.03, 50], [0.06, 68], [0.09, 82], [0.13, 93]],
  evGrossProfit: [[3, 92], [5, 78], [8, 60], [12, 42], [18, 25]],
  evSales: [[0.8, 90], [1.5, 75], [3, 58], [5, 40], [8, 22]],
  analysts: [[0, 100], [1, 88], [3, 68], [5, 42], [8, 18]],
  news: [[3, 92], [8, 75], [20, 52], [45, 28], [90, 10]],
};

function clamp(value, low, high) {
  const number = Number(value);
  if (!Number.isFinite(number)) return low;
  return Math.min(Math.max(number, low), high);
}

function cleanDate(value, fallback = "2026-06-24") {
  const text = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

function present(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function normalizeUniverse(value) {
  const text = typeof value === "string" ? value : "tradable";
  return ["tradable", "us", "micro", "inflection", "diagnostics"].includes(text) ? text : "tradable";
}

function stepScore(value, cuts, higherIsBetter = true, neutral = 50) {
  if (!present(value)) return { score: neutral, present: false };
  let score = 5;
  for (const [threshold, nextScore] of cuts) {
    if (higherIsBetter && value >= threshold) score = nextScore;
    if (!higherIsBetter && value <= threshold) score = Math.max(score, nextScore);
  }
  return { score, present: true };
}

function institutionalOwnershipScore(value, neutral = 50) {
  if (!present(value)) return { score: neutral, present: false };
  if (value < 0.02) return { score: 55, present: true };
  if (value < 0.05) return { score: 80, present: true };
  if (value < 0.2) return { score: 95, present: true };
  if (value < 0.4) return { score: 60, present: true };
  if (value < 0.6) return { score: 30, present: true };
  return { score: 10, present: true };
}

function weightedBlock(components, neutral = 50) {
  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  const available = components.filter((item) => item.present);
  if (!available.length || totalWeight <= 0) return { score: neutral, completeness: 0 };
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  return {
    score: available.reduce((sum, item) => sum + item.score * item.weight, 0) / availableWeight,
    completeness: availableWeight / totalWeight,
  };
}

function block(scores, weights) {
  return scores.map(({ score, present }, index) => ({ score, present, weight: weights[index] }));
}

function classifyOpportunityType(row) {
  const industry = String(row.industry || "").toLowerCase();
  const optionalityIndustry = ["biotechnology", "uranium", "gold", "silver", "copper", "mining", "semiconductor equipment"].some((term) =>
    industry.includes(term),
  );
  const preRevenue = !present(row.revenueTtm) || row.revenueTtm < 10_000_000;
  if (row.optionalityDriver || optionalityIndustry || (preRevenue && row.isBurning)) return "OPTIONALITY";
  if (row.fcfMargin > 0 && row.roic >= 0.12 && row.revenueGrowthTtm >= 0.07) return "COMPOUNDER";
  const cheap = row.netCashToMarketCap > 0.2 || row.fcfYield > 0.08 || row.evSales < 1.2;
  const inflecting = row.ebitMarginExpansion > 0.01 || row.fcfImprovementToSales > 0.03 || row.revenueAcceleration > 0.05;
  if (cheap && !inflecting) return "DEEP_VALUE";
  if (inflecting) return "INFLECTION";
  return row.isBurning ? "INFLECTION" : "DEEP_VALUE";
}

function scoreBlocks(row) {
  const quality = weightedBlock(
    block(
      [
        stepScore(row.grossMargin, SCORE_CUTS.grossMargin),
        stepScore(row.roic, SCORE_CUTS.roic),
        stepScore(row.fcfMargin, SCORE_CUTS.fcfMargin),
      ],
      [0.35, 0.35, 0.3],
    ),
  );
  const growth = weightedBlock(
    block(
      [stepScore(row.revenueGrowthTtm, SCORE_CUTS.growth), stepScore(row.revenueAcceleration, SCORE_CUTS.acceleration)],
      [0.55, 0.45],
    ),
  );
  const survivalComponents = block(
    [stepScore(row.netCashToMarketCap, SCORE_CUTS.netCash), stepScore(row.dilutionTtm, SCORE_CUTS.dilution, false)],
    [0.4, 0.35],
  );
  survivalComponents.push(
    row.isBurning
      ? { ...stepScore(row.cashRunwayMonths, SCORE_CUTS.runway), weight: 0.25 }
      : { score: 85, present: true, weight: 0.25 },
  );
  const survival = weightedBlock(survivalComponents);
  const neglect = weightedBlock(
    block(
      [
        stepScore(row.analystCount, SCORE_CUTS.analysts, false),
        institutionalOwnershipScore(row.institutionalOwnership),
        stepScore(row.newsCount90d, SCORE_CUTS.news, false),
      ],
      [0.4, 0.35, 0.25],
    ),
  );
  const inflection = weightedBlock(
    block(
      [
        stepScore(row.revenueAcceleration, SCORE_CUTS.acceleration),
        stepScore(row.grossMarginExpansion, SCORE_CUTS.marginExpansion),
        stepScore(row.ebitMarginExpansion, SCORE_CUTS.marginExpansion),
        stepScore(row.fcfImprovementToSales, SCORE_CUTS.acceleration),
      ],
      [0.25, 0.25, 0.25, 0.25],
    ),
  );
  const valuation = weightedBlock(
    block(
      [
        stepScore(row.fcfYield, SCORE_CUTS.fcfYield),
        stepScore(row.evGrossProfit, SCORE_CUTS.evGrossProfit, false),
        stepScore(row.evSales, SCORE_CUTS.evSales, false),
      ],
      [0.4, 0.35, 0.25],
    ),
  );

  return { quality, growth, survival, neglect, inflection, valuation };
}

function aggregateScore(blockScores, opportunityType) {
  const weights = TYPE_WEIGHTS[opportunityType] || TYPE_WEIGHTS.DEEP_VALUE;
  const score = Object.entries(weights).reduce((sum, [key, weight]) => sum + blockScores[key].score * weight, 0);
  const completeness = Object.entries(weights).reduce((sum, [key, weight]) => sum + blockScores[key].completeness * weight, 0);
  return { score: clamp(score, 0, 100), completeness: clamp(completeness, 0, 1) };
}

function isEligibleForUniverse(row, universe) {
  const type = classifyOpportunityType(row);
  if (universe === "us") return row.region === "US";
  if (universe === "micro") return row.marketCapUsd <= 500_000_000;
  if (universe === "inflection") return type === "INFLECTION" || type === "COMPOUNDER";
  if (universe === "diagnostics") return row.redFlagPenalty >= 0.2 || row.outOfScope;
  return row.platform === "Tradable now";
}

function gateReasons(row, spec) {
  const reasons = [];
  if (row.priceDate > spec.asof || row.fundamentalsDate > spec.asof) reasons.push("Future data");
  if (spec.requireTradableNow && row.platform !== "Tradable now") reasons.push("Watch-only security");
  if (!present(row.advUsd)) reasons.push("Liquidity observation unavailable");
  if (row.advUsd < spec.minAdvUsd) reasons.push("Liquidity below floor");
  if (!present(row.marketCapUsd)) reasons.push("Market capitalization unavailable");
  if (row.marketCapUsd > spec.maxMarketCapUsd) reasons.push("Too large for this mandate");
  if (!present(row.price)) reasons.push("Market price unavailable");
  if (row.price < 1) reasons.push("Price below floor");
  if (!present(row.residualVol)) reasons.push("Volatility observation unavailable");
  if (row.residualVol > spec.maxResidualVol) reasons.push("Volatility above screen");
  if (row.isBurning && present(row.cashRunwayMonths) && row.cashRunwayMonths < 9) reasons.push("Cash runway critical");
  if (row.dilutionTtm > 0.5) reasons.push("Extreme dilution");
  if (row.redFlagPenalty >= 0.35) reasons.push("Red flags dominate");
  if (row.outOfScope) reasons.push("Out of scope for FCF screen");
  return reasons;
}

function authorize({ score, completeness, reasons, opportunityType, manualReview }) {
  const notes = [];
  if (reasons.length) return { tier: "ABSTAIN", notes: reasons };
  if (completeness < 0.55) return { tier: "ABSTAIN", notes: ["Channel incomplete"] };

  let tier = "ABSTAIN";
  if (score >= 72 && completeness >= 0.75) tier = "RANKABLE";
  else if (score >= 58) tier = "RESEARCHABLE";
  else notes.push("Evidence not strong enough");

  if (opportunityType === "OPTIONALITY" && tier === "RANKABLE") {
    tier = "RESEARCHABLE";
    notes.push("Requires human review before prioritization");
  }
  if (manualReview && tier === "RANKABLE") {
    tier = "RESEARCHABLE";
    notes.push("Manual review required");
  }
  return { tier, notes };
}

function cleanBlockScores(blockScores) {
  return Object.fromEntries(
    Object.entries(blockScores).map(([key, value]) => [
      key,
      {
        label: BLOCK_LABELS[key],
        score: value.score,
        completeness: value.completeness,
      },
    ]),
  );
}

function buildMemoQuestions(row) {
  return [
    `What would make ${row.ticker}'s reported improvement durable rather than cyclical?`,
    `Which filing item most directly challenges the one-line thesis?`,
    `What primary evidence would invalidate the setup before valuation work starts?`,
  ];
}

export function factorLabDomLabel(engineTerm, language = "en") {
  const labels = AUTHORIZATION_LABELS[engineTerm] || OPPORTUNITY_TYPE_LABELS[engineTerm];
  if (!labels) throw new Error(`Unmapped FactorLab engine term: ${engineTerm}`);
  return labels[language] || labels.en;
}

export function buildFactorLabSpec(input = {}) {
  return {
    name: "factorlab_neglected_opportunity_authorization",
    version: "0.4",
    asof: cleanDate(input.asof),
    topK: Math.round(clamp(input.topK ?? 6, 1, 12)),
    universe: normalizeUniverse(input.universe),
    minAdvUsd: Math.round(clamp(input.minAdvUsd ?? 250_000, 50_000, 10_000_000)),
    maxMarketCapUsd: Math.round(clamp(input.maxMarketCapUsd ?? 2_000_000_000, 50_000_000, 5_000_000_000)),
    maxResidualVol: clamp(input.maxResidualVol ?? 0.7, 0.1, 1),
    requireTradableNow: input.requireTradableNow !== false,
    includeDiagnostics: Boolean(input.includeDiagnostics ?? input.includeQuarantine),
    includeFutureReturn: Boolean(input.includeFutureReturn),
    typeWeights: TYPE_WEIGHTS,
    factorNull: {
      required: true,
      file: "aurora_v02_factor_null_input.csv",
      nulls: ["size", "value", "momentum"],
    },
    sources: {
      market: { adapter: "fmp_company_screener_or_snapshot", pointInTime: true },
      fundamentals: { adapter: "fmp_quarterly_ttm", lagPolicy: "filed_date_lte_asof" },
      neglect: { adapter: "fmp_analyst_ownership_news", missingPolicy: "neutral_score_plus_completeness_penalty" },
      filings: { adapter: "sec_submissions", lagPolicy: "accepted_date_lte_asof" },
      catalysts: { adapter: "fmp_news_brave_search", pointInTime: true },
    },
  };
}

function validateSpec(spec) {
  if (spec.includeFutureReturn) {
    return {
      refused: true,
      errorType: "LookaheadError",
      op: "lead(next_return)",
      message: "Future return is only valid as a training label, not as an input for a live research screen.",
      fix: "Turn off the future-return signal and rerun the screen.",
    };
  }
  return null;
}

function buildPipeline(spec) {
  const common = [
    {
      id: "asof",
      op: "observable_data_cut",
      status: "pit",
      input: "market + fundamentals + filings + catalyst adapters",
      params: `date=${spec.asof}`,
      plain: "Drops any row that was not observable by the screen date.",
    },
    {
      id: "gates",
      op: "hard_gates_before_scoring",
      status: "safe",
      input: "raw universe",
      params: `adv>=${spec.minAdvUsd}, market_cap<=${spec.maxMarketCapUsd}`,
      plain: "Rejects liquidity traps, future data, critical cash runway, and red-flag dominated files before scoring.",
    },
    {
      id: "type",
      op: "opportunity_type_first",
      status: "safe",
      input: "quarterly TTM features",
      params: "quality, inflection, discounted asset, optionality",
      plain: "Classifies the setup before applying weights so incompatible opportunities are not averaged together.",
    },
    {
      id: "score",
      op: "fixed_breakpoint_scorecard",
      status: "safe",
      input: "type-specific blocks",
      params: "no batch percentiles; missing values neutralized and penalized through completeness",
      plain: "Scores the channel using stable breakpoints and real neglect variables, not market-cap proxies.",
    },
    {
      id: "null",
      op: "factor_null_export",
      status: "pending",
      input: "authorized research files",
      params: spec.factorNull.file,
      plain: "Exports the queue for the size, value, and momentum null test before trusting composite weights.",
    },
    {
      id: "memo",
      op: "research_memo_queue",
      status: "safe",
      input: "authorized files",
      params: "questions + kill criteria + source notes",
      plain: "Returns research questions and invalidation criteria, not a buy list.",
    },
  ];
  if (spec.includeFutureReturn) {
    common.splice(3, 0, {
      id: "future",
      op: "lead(next_return)",
      status: "refused",
      input: "future returns",
      params: "period=next_month",
      plain: "This would leak future data into the live screen.",
    });
  }
  return common;
}

export function runFactorLab(input = {}) {
  const spec = buildFactorLabSpec(input);
  const universeRows = Array.isArray(input.rows) ? input.rows : SAMPLE_UNIVERSE;
  const pipeline = buildPipeline(spec);
  const refusal = validateSpec(spec);
  if (refusal) {
    return {
      ok: false,
      accepted: false,
      spec,
      pipeline,
      refusal,
      candidates: [],
      audit: ["Spec parsed.", `Refused at ${refusal.op}: ${refusal.message}`, refusal.fix],
      summary: { eligible: 0, returned: 0, coverage: 0, universeTotal: universeRows.length, topScore: null, abstain: 0, researchable: 0, rankable: 0 },
      disclaimer: DISCLAIMER,
    };
  }

  const scoped = universeRows.filter((row) => isEligibleForUniverse(row, spec.universe));
  const evaluated = scoped.map((row) => {
    const opportunityType = classifyOpportunityType(row);
    const blockScores = scoreBlocks(row);
    const aggregate = aggregateScore(blockScores, opportunityType);
    const reasons = gateReasons(row, spec);
    const authorization = authorize({
      score: aggregate.score,
      completeness: aggregate.completeness,
      reasons,
      opportunityType,
      manualReview: row.manualReview,
    });
    return {
      ...row,
      opportunityType,
      opportunityTypeLabel: OPPORTUNITY_TYPE_LABELS[opportunityType],
      opportunityScore: aggregate.score,
      score: aggregate.score / 100,
      dataCompleteness: aggregate.completeness,
      blockScores: cleanBlockScores(blockScores),
      authorizationTier: authorization.tier,
      authorizationLabel: AUTHORIZATION_LABELS[authorization.tier],
      tier: authorization.tier,
      tierLabel: AUTHORIZATION_LABELS[authorization.tier],
      tierNotes: authorization.notes,
      gateReasons: reasons,
      memoQuestions: buildMemoQuestions(row),
      disclaimer: DISCLAIMER,
    };
  });

  const authorized = evaluated.filter((row) => row.authorizationTier !== "ABSTAIN");
  const surfaced = (spec.includeDiagnostics ? evaluated : authorized).filter((row) => row.authorizationTier !== "ABSTAIN" || spec.includeDiagnostics);

  if (!surfaced.length) {
    const emptyRefusal = {
      refused: true,
      errorType: "CoverageError",
      op: "filter",
      message: "No research file survived the point-in-time gates.",
      fix: "Relax liquidity, volatility, universe, market cap, or as-of date.",
    };
    return {
      ok: false,
      accepted: false,
      spec,
      pipeline,
      refusal: emptyRefusal,
      candidates: [],
      audit: ["Spec parsed.", `Refused at filter: ${emptyRefusal.message}`, emptyRefusal.fix],
      summary: {
        eligible: 0,
        returned: 0,
        coverage: 0,
        universeTotal: universeRows.length,
        topScore: null,
        abstain: evaluated.length,
        researchable: 0,
        rankable: 0,
      },
      disclaimer: DISCLAIMER,
    };
  }

  const typeRank = new Map();
  for (const opportunityType of TYPE_ORDER) {
    const byType = surfaced
      .filter((row) => row.opportunityType === opportunityType)
      .sort((a, b) => b.opportunityScore - a.opportunityScore);
    byType.forEach((row, index) => typeRank.set(row.ticker, index + 1));
  }

  const priority = { RANKABLE: 0, RESEARCHABLE: 1, ABSTAIN: 2 };
  const globallyRanked = surfaced
    .map((row) => ({ ...row, rankWithinType: typeRank.get(row.ticker) || null }))
    .sort((a, b) => {
      if (priority[a.authorizationTier] !== priority[b.authorizationTier]) {
        return priority[a.authorizationTier] - priority[b.authorizationTier];
      }
      if (b.opportunityScore !== a.opportunityScore) return b.opportunityScore - a.opportunityScore;
      return a.ticker.localeCompare(b.ticker);
    });
  const ranked = globallyRanked
    .map((row, index) => ({ ...row, globalRank: index + 1 }))
    .slice(0, spec.topK);

  const rankable = evaluated.filter((row) => row.authorizationTier === "RANKABLE").length;
  const researchable = evaluated.filter((row) => row.authorizationTier === "RESEARCHABLE").length;
  const abstain = evaluated.filter((row) => row.authorizationTier === "ABSTAIN").length;

  return {
    ok: true,
    accepted: true,
    spec,
    pipeline,
    refusal: null,
    candidates: ranked,
    audit: [
      `Screen date ${spec.asof}.`,
      `${authorized.length} of ${universeRows.length} files cleared hard gates and evidence threshold.`,
      `${abstain} files were held back before research triage.`,
      "Scores use fixed breakpoints, quarterly TTM features, and real neglect variables.",
      "Composite weights remain provisional until the factor-null export beats size, value, and momentum.",
      `${ranked.length} research files returned.`,
    ],
    summary: {
      eligible: authorized.length,
      returned: ranked.length,
      coverage: universeRows.length ? authorized.length / universeRows.length : 0,
      universeTotal: universeRows.length,
      topScore: ranked[0]?.score ?? null,
      abstain,
      researchable,
      rankable,
      factorNullRequired: true,
    },
    disclaimer: DISCLAIMER,
  };
}

export const factorLabSampleUniverse = SAMPLE_UNIVERSE;
export const factorLabTypeWeights = TYPE_WEIGHTS;
export const factorLabDefaultWeights = TYPE_WEIGHTS;
export const factorLabDisclaimer = DISCLAIMER;
