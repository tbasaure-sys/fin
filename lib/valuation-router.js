import { buildAuroraDataTrust } from "./aurora-data-trust.js";
import { buildAuroraLensForge } from "./aurora-lens-forge.js";

const MODEL_LABELS = {
  dcf: "DCF",
  roicFade: "ROIC fade",
  reverseDcf: "Reverse DCF",
  residualIncome: "Residual income",
  assetValue: "Asset value",
  unitEconomics: "Unit economics",
  bottleneck: "Bottleneck model",
  realOptions: "Real options",
  ownerEarnings: "Owner earnings",
  capitalCycle: "Capital cycle",
};

const REGIME_LABELS = {
  compounder: "Quality compounder",
  cyclical: "Cyclical / capacity cycle",
  financial: "Financial balance-sheet business",
  assetHeavy: "Asset-heavy / commodity-linked",
  networkPlatform: "Network or platform economics",
  turnaround: "Turnaround / normalization",
  highGrowth: "High-growth reinvestment",
  preProfitOption: "Pre-profit optionality",
  bottleneck: "Bottleneck / scarce capacity",
  secularDecline: "Secular decline risk",
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeWeights(input) {
  const entries = Object.entries(input).map(([key, value]) => [key, Math.max(0, Number(value) || 0)]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return Object.fromEntries(entries.map(([key]) => [key, 0]));
  return Object.fromEntries(entries.map(([key, value]) => [key, value / total]));
}

function weightedBlend(baseWeights, score) {
  const next = {};
  Object.entries(baseWeights).forEach(([key, value]) => {
    next[key] = (next[key] || 0) + value * score;
  });
  return next;
}

function textIncludes(text, terms) {
  const haystack = String(text || "").toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function regimeBaseWeights(regime) {
  const map = {
    compounder: { dcf: 0.18, roicFade: 0.26, reverseDcf: 0.11, residualIncome: 0.03, assetValue: 0.02, unitEconomics: 0.1, bottleneck: 0.07, realOptions: 0.06, ownerEarnings: 0.15, capitalCycle: 0.02 },
    cyclical: { dcf: 0.11, roicFade: 0.12, reverseDcf: 0.18, residualIncome: 0.02, assetValue: 0.11, unitEconomics: 0.06, bottleneck: 0.12, realOptions: 0.09, ownerEarnings: 0.04, capitalCycle: 0.15 },
    financial: { dcf: 0.03, roicFade: 0.05, reverseDcf: 0.11, residualIncome: 0.44, assetValue: 0.14, unitEconomics: 0.01, bottleneck: 0.01, realOptions: 0.07, ownerEarnings: 0.11, capitalCycle: 0.03 },
    assetHeavy: { dcf: 0.08, roicFade: 0.09, reverseDcf: 0.15, residualIncome: 0.03, assetValue: 0.32, unitEconomics: 0.02, bottleneck: 0.06, realOptions: 0.08, ownerEarnings: 0.04, capitalCycle: 0.13 },
    networkPlatform: { dcf: 0.12, roicFade: 0.13, reverseDcf: 0.1, residualIncome: 0.02, assetValue: 0.01, unitEconomics: 0.27, bottleneck: 0.06, realOptions: 0.16, ownerEarnings: 0.11, capitalCycle: 0.02 },
    turnaround: { dcf: 0.06, roicFade: 0.09, reverseDcf: 0.19, residualIncome: 0.07, assetValue: 0.19, unitEconomics: 0.05, bottleneck: 0.02, realOptions: 0.18, ownerEarnings: 0.05, capitalCycle: 0.1 },
    highGrowth: { dcf: 0.1, roicFade: 0.09, reverseDcf: 0.11, residualIncome: 0.01, assetValue: 0.01, unitEconomics: 0.28, bottleneck: 0.07, realOptions: 0.19, ownerEarnings: 0.1, capitalCycle: 0.04 },
    preProfitOption: { dcf: 0.03, roicFade: 0.02, reverseDcf: 0.17, residualIncome: 0.01, assetValue: 0.07, unitEconomics: 0.21, bottleneck: 0.05, realOptions: 0.34, ownerEarnings: 0.03, capitalCycle: 0.07 },
    bottleneck: { dcf: 0.1, roicFade: 0.16, reverseDcf: 0.13, residualIncome: 0.01, assetValue: 0.02, unitEconomics: 0.09, bottleneck: 0.31, realOptions: 0.07, ownerEarnings: 0.08, capitalCycle: 0.03 },
    secularDecline: { dcf: 0.06, roicFade: 0.15, reverseDcf: 0.24, residualIncome: 0.06, assetValue: 0.2, unitEconomics: 0.01, bottleneck: 0.01, realOptions: 0.1, ownerEarnings: 0.07, capitalCycle: 0.1 },
  };
  return map[regime] || map.compounder;
}

function weightEntropy(weights) {
  const values = Object.values(weights).filter((value) => value > 0);
  if (!values.length) return 0;
  const entropy = values.reduce((sum, value) => sum - value * Math.log(value), 0);
  return entropy / Math.log(values.length);
}

function weightConcentration(weights) {
  return Object.values(weights).reduce((sum, value) => sum + value * value, 0);
}

export function buildValuationRouter(drivers = {}, snapshot = {}) {
  const sectorText = [drivers.sector, drivers.name, snapshot?.company?.industry, snapshot?.company?.sicDescription]
    .filter(Boolean)
    .join(" ");
  const roicSpread = isFiniteNumber(drivers.roic) && isFiniteNumber(drivers.wacc) ? drivers.roic - drivers.wacc : 0;
  const growth = isFiniteNumber(drivers.revenueCagr) ? drivers.revenueCagr : 0;
  const margin = isFiniteNumber(drivers.margin) ? drivers.margin : 0;
  const reinvestment = isFiniteNumber(drivers.reinvestment) ? drivers.reinvestment : 0.45;
  const thesis = isFiniteNumber(drivers.thesisQuality) ? drivers.thesisQuality : 0.5;
  const demand = isFiniteNumber(drivers.demandSupply) ? drivers.demandSupply : 0.5;
  const bottleneckPower = isFiniteNumber(drivers.bottleneckPower) ? drivers.bottleneckPower : 0.4;
  const dataQuality = isFiniteNumber(drivers.dataQuality) ? drivers.dataQuality : 0.5;
  const modelRisk = isFiniteNumber(drivers.modelRisk) ? drivers.modelRisk : 0.35;
  const dataTrust = buildAuroraDataTrust({ drivers, snapshot, missingDrivers: snapshot?.missingDrivers });

  const rawRegimes = {
    compounder:
      0.18 +
      Math.max(0, roicSpread) * 2.2 +
      Math.max(0, margin - 0.14) * 0.9 +
      thesis * 0.24 +
      (growth > 0.025 ? 0.08 : 0),
    cyclical:
      0.1 +
      (textIncludes(sectorText, ["semiconductor", "equipment", "autos", "industrial", "housing", "travel", "airline"]) ? 0.42 : 0) +
      Math.max(0, modelRisk - 0.28) * 0.7 +
      Math.max(0, reinvestment - 0.48) * 0.3,
    financial:
      0.03 + (textIncludes(sectorText, ["bank", "financial", "insurance", "broker", "credit", "deposit"]) ? 0.78 : 0),
    assetHeavy:
      0.05 +
      (textIncludes(sectorText, ["energy", "oil", "gas", "mining", "materials", "commodity", "utility", "rail", "shipping"]) ? 0.54 : 0) +
      Math.max(0, reinvestment - 0.55) * 0.4,
    networkPlatform:
      0.04 + (textIncludes(sectorText, ["platform", "network", "marketplace", "advertising", "payments", "social"]) ? 0.58 : 0),
    turnaround: 0.04 + Math.max(0, 0.09 - margin) * 1.8 + Math.max(0, 0.03 - roicSpread) * 1.5,
    highGrowth: 0.05 + Math.max(0, growth - 0.09) * 3.4 + Math.max(0, reinvestment - 0.5) * 0.25,
    preProfitOption:
      0.02 +
      (!isFiniteNumber(drivers.baseFcf) || drivers.baseFcf <= 0 ? 0.42 : 0) +
      Math.max(0, growth - 0.14) * 2.2,
    bottleneck:
      0.08 +
      bottleneckPower * 0.34 +
      demand * 0.18 +
      (textIncludes(sectorText, ["semiconductor", "lithography", "scarce", "capacity", "aerospace"]) ? 0.24 : 0),
    secularDecline:
      0.03 + Math.max(0, 0.01 - growth) * 4.5 + Math.max(0, 0.42 - demand) * 0.3 + Math.max(0, 0.45 - thesis) * 0.25,
  };

  const regimes = normalizeWeights(rawRegimes);
  let methodWeights = {};
  Object.entries(regimes).forEach(([regime, score]) => {
    const contribution = weightedBlend(regimeBaseWeights(regime), score);
    Object.entries(contribution).forEach(([method, value]) => {
      methodWeights[method] = (methodWeights[method] || 0) + value;
    });
  });

  if (dataQuality < 0.45 || modelRisk > 0.46) {
    methodWeights.reverseDcf = (methodWeights.reverseDcf || 0) + 0.08;
    methodWeights.realOptions = (methodWeights.realOptions || 0) + 0.04;
    methodWeights.dcf = Math.max(0, (methodWeights.dcf || 0) - 0.04);
  }
  if (regimes.financial < 0.18) {
    methodWeights.residualIncome = Math.min(methodWeights.residualIncome || 0, 0.12);
  }
  methodWeights = normalizeWeights(methodWeights);
  const priorWeights = methodWeights;
  const lensForge = buildAuroraLensForge(drivers, { regimes, methodWeights: priorWeights });
  const residualPolicy = {
    mode: "deterministic_prior_only",
    learnedResidualEnabled: false,
    rho: 0,
    reason: "Neural residual remains shadow-only until it beats AURORA validation gates.",
  };

  const topRegimes = Object.entries(regimes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key, weight]) => ({ key, label: REGIME_LABELS[key], weight }));
  const topModels = Object.entries(methodWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key, weight]) => ({ key, label: MODEL_LABELS[key], weight }));

  const concentration = topRegimes[0]?.weight || 0;
  const trustAdjustment = (dataTrust.overallScore - 65) / 100;
  const lensDispersionPenalty = Math.min(0.14, Math.max(0, (lensForge.dispersion || 0) - 0.22) * 0.28);
  const confidence = clamp(
    0.18 + concentration * 0.34 + dataQuality * 0.25 + trustAdjustment * 0.24 - modelRisk * 0.2 - lensDispersionPenalty,
    0.05,
    0.92,
  );
  const abstain =
    confidence < 0.32 ||
    dataTrust.level === "research_only" ||
    Boolean(dataTrust.doNotTrainReason && dataTrust.overallScore < 60) ||
    (!isFiniteNumber(drivers.price) || !isFiniteNumber(drivers.baseFcf)) ||
    (topRegimes[0]?.key === "preProfitOption" && !isFiniteNumber(drivers.revenueCagr));
  const uncertainty = {
    weightEntropy: weightEntropy(methodWeights),
    weightConcentration: weightConcentration(methodWeights),
    lensDispersion: lensForge.dispersion,
    oodRisk: clamp(modelRisk * 0.55 + (dataTrust.overallScore < 60 ? 0.28 : 0) + ((lensForge.dispersion || 0) > 0.36 ? 0.14 : 0), 0, 1),
    abstain,
  };

  return {
    version: "aurora_router_v1",
    regimes,
    topRegimes,
    methodWeights,
    priorWeights,
    topModels,
    dominantRegime: topRegimes[0] || null,
    dominantModel: topModels[0] || null,
    confidence,
    abstain,
    dataTrust,
    lensForge,
    residualPolicy,
    uncertainty,
    investorMemo: {
      routerDecision: topRegimes[0] ? `${topRegimes[0].label} with ${topModels[0]?.label || "no dominant lens"}` : "No reliable regime read",
      primaryLens: topModels[0] || null,
      secondaryLens: topModels[1] || null,
      discardedLenses: Object.entries(methodWeights)
        .filter(([, weight]) => weight < 0.035)
        .map(([key, weight]) => ({ key, label: MODEL_LABELS[key], weight })),
      falsifiers: lensForge.dominantDisagreements.map((item) => item.falsifier).filter(Boolean),
    },
    rationale: [
      topRegimes[0] ? `Primary regime: ${topRegimes[0].label}` : "No primary regime identified.",
      topModels[0] ? `Highest model weight: ${topModels[0].label}` : "No model family cleared weight checks.",
      confidence < 0.45 ? "La confianza de AURORA es baja; usa la valoración como punto de partida de research, no como decisión." : "La confianza de AURORA alcanza para una primera lectura de valoración.",
      `Data trust: ${dataTrust.overallScore}/100 (${dataTrust.level}).`,
      residualPolicy.reason,
      abstain ? "The system should allow abstention until core evidence is repaired." : "Core inputs are sufficient for a provisional committee read.",
    ],
  };
}

export { MODEL_LABELS, REGIME_LABELS };
