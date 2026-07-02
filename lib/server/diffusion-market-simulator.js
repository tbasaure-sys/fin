import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "bls_stress_engine_v1_guarded_proxy";
const MAX_ENDPOINT_SCENARIOS = 6000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = path.resolve(__dirname, "../../artifacts/market_simulation/latest/contract.json");

const FALLBACK_ENDPOINT_CONTRACT = Object.freeze({
  endpoint: "/api/v1/workspaces/{workspaceId}/market-simulation",
  status: "research_champion_offline_only",
  run_id: "factor_ddpm_run_20260701_170222",
  checkpoint_path: "/content/drive/MyDrive/blsprime_ddpm_market_sim/checkpoints/best_factor_ddpm_market_simulator.pt",
  manifest_path: "/content/drive/MyDrive/blsprime_ddpm_market_sim/artifacts/factor_ddpm_run_20260701_170222/blsprime_market_simulation_manifest.json",
  generated_scenarios: 5000,
  endpoint_default_scenarios: 5000,
  endpoint_min_scenarios: 2000,
  endpoint_min_stress_scenarios: 5000,
  endpoint_stress_quantile: 0.01,
  endpoint_small_request_policy: "reject_or_aggregate",
  stress_stratified_sampling: true,
  stress_multiplier_counts: {
    "1.0": 3150,
    "1.45": 1100,
    "2.4": 500,
    "6.0": 250,
  },
  stress_book_q01: -0.35458617455426983,
  scenario_count_ok_for_stress_endpoint: true,
  stress_replay_status: "legacy_v7_provisional_full_window_floor_pending_v8",
  ready_for_endpoint_requires: "v8 no-clamp stress book, strict baseline, exception, and correlation gates; current research champion is offline only",
});

const FALLBACK_CHAMPION_METRICS = Object.freeze({
  universe_symbols_selected: 500,
  usable_assets: 420,
  factors: 108,
  pca_explained_variance: 0.7381,
  model_params_millions: 11.18,
  train: {
    first_valid_noise_mse: 1.039301,
    best_valid_noise_mse: 0.638418,
    best_epoch: 180,
    valid_improvement_pct: 38.572402,
    skipped_batch_rate: 0.00022222222222222223,
  },
  base_eval: {
    distribution_coverage: 0.967068,
    mmd_rbf_projected: 0.012236,
    mmd_rbf_projected_multi_mean: 0.012267,
    corr_fidelity: 0.913575,
    corr_mae: 0.086425,
    corr_top20_eigen_rmse: 3.669018,
    cvar5: -0.20565,
    probability_drawdown_10pct: 0.538095,
  },
  gaussian_cov_train: {
    mmd_rbf_projected: 0.007574,
    mmd_rbf_projected_multi_mean: 0.008276,
    corr_mae: 0.084033,
    corr_top20_eigen_rmse: 3.243003,
    cvar5: -0.166597,
    probability_drawdown_10pct: 0.352381,
  },
  relative_to_gaussian: {
    mmd_ratio_candidate_vs_gaussian: 1.615503,
    mmd_multi_ratio_candidate_vs_gaussian: 1.482253,
    corr_mae_delta_candidate_minus_gaussian: 0.002392,
    candidate_corr_near_gaussian_within_tol: true,
    candidate_mmd_ratio_within_research_gate: true,
  },
  factor_space: {
    factor_mmd_base: 0.005767,
    factor_mmd_base_multi_mean: 0.006182,
    factor_eval_windows: 420,
  },
  walk_forward: {
    periods: 3,
    stress_walk_forward_1pct_covers_all: true,
    walk_forward_1pct_covers_all: true,
    stress_walk_forward_methodology_validated: false,
    stress_walk_forward_methodology_note:
      "v7 coverage is legacy/provisional because the severe stress sleeve used a full-window market-factor floor; rerun v8 sparse stress before promotion.",
    covid_crash_2020_actual_min: -0.313964,
    covid_crash_2020_synthetic_q01: -0.354586,
    inflation_bear_2022_actual_min: -0.158997,
    bank_stress_2023_actual_min: -0.013722,
  },
  scorecard: {
    beats_gaussian_mmd: false,
    beats_gaussian_mmd_multi: false,
    mmd_ratio_within_research_gate: true,
    beats_gaussian_corr: false,
    corr_near_gaussian: true,
    corr_fidelity_ge_0_80: true,
    target_cvar_close_to_eval_reference: true,
    stress_walk_forward_1pct_covers_all: true,
    endpoint_scenario_count_ok: true,
    skipped_batch_rate_ok: true,
    no_validation_used_for_guidance_or_cholesky: true,
    research_champion: true,
    ready_for_endpoint: false,
  },
});

function loadMarketSimulationManifest() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONTRACT_PATH, "utf8"));
    return {
      contract: parsed?.contract || FALLBACK_ENDPOINT_CONTRACT,
      championMetrics: parsed?.championMetrics || FALLBACK_CHAMPION_METRICS,
      source: CONTRACT_PATH,
    };
  } catch {
    return {
      contract: FALLBACK_ENDPOINT_CONTRACT,
      championMetrics: FALLBACK_CHAMPION_METRICS,
      source: "compiled_fallback",
    };
  }
}

const MARKET_SIMULATION_MANIFEST = loadMarketSimulationManifest();
const DDPM_V7_ENDPOINT_CONTRACT = Object.freeze(MARKET_SIMULATION_MANIFEST.contract);
const DDPM_V7_CHAMPION_METRICS = Object.freeze(MARKET_SIMULATION_MANIFEST.championMetrics);

const REGIMES = {
  baseline: {
    label: "Baseline",
    drift: 0.00015,
    volMultiplier: 1.0,
    correlationFloor: 0.32,
    tailProbability: 0.018,
    tailMean: -0.018,
    tailScale: 0.014,
  },
  crisis: {
    label: "Crisis",
    drift: -0.0005,
    volMultiplier: 1.6,
    correlationFloor: 0.74,
    tailProbability: 0.028,
    tailMean: -0.018,
    tailScale: 0.012,
  },
  recovery: {
    label: "Recovery",
    drift: 0.00075,
    volMultiplier: 1.45,
    correlationFloor: 0.52,
    tailProbability: 0.035,
    tailMean: -0.021,
    tailScale: 0.016,
  },
  inflation: {
    label: "Inflation shock",
    drift: -0.00035,
    volMultiplier: 1.7,
    correlationFloor: 0.62,
    tailProbability: 0.06,
    tailMean: -0.028,
    tailScale: 0.021,
  },
};

function safeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function positiveIntegerOrNull(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.floor(number);
}

function round(value, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
}

function pct(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${(number * 100).toFixed(digits)}%`;
}

function cleanTicker(value, fallback) {
  const text = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  return text || fallback;
}

function guidanceKey(value) {
  const rounded = Number(Number(value).toFixed(4));
  return Number.isInteger(rounded) ? `${rounded}.0` : String(rounded);
}

function runtimeGuidanceFromStressMultiplier(multiplier, baseGuidanceScale) {
  const safeMultiplier = Math.max(1, Number(multiplier) || 1);
  const runtimeScale = Number(baseGuidanceScale) * (1 + Math.log(safeMultiplier) * 0.35);
  return clamp(runtimeScale, 0.5, 2.2);
}

function isStressRegime(regimeKey) {
  return regimeKey !== "baseline" && regimeKey !== "recovery";
}

function resolveScenarioRequest(options, regimeKey) {
  const requested = positiveIntegerOrNull(options.nScenarios);
  const stressRegime = isStressRegime(regimeKey);
  const minimum = stressRegime
    ? DDPM_V7_ENDPOINT_CONTRACT.endpoint_min_stress_scenarios
    : DDPM_V7_ENDPOINT_CONTRACT.endpoint_min_scenarios;
  const defaultN = DDPM_V7_ENDPOINT_CONTRACT.endpoint_default_scenarios;
  let effective = requested ?? defaultN;
  let policyApplied = requested === null ? "defaulted" : "accepted";

  if (effective < minimum) {
    effective = minimum;
    policyApplied = "aggregated_to_minimum";
  }

  if (effective > MAX_ENDPOINT_SCENARIOS) {
    effective = MAX_ENDPOINT_SCENARIOS;
    policyApplied = policyApplied === "accepted" ? "capped_to_runtime_max" : `${policyApplied}_and_capped_to_runtime_max`;
  }

  return {
    requestedNScenarios: requested,
    effectiveNScenarios: effective,
    minimumNScenarios: minimum,
    defaultNScenarios: defaultN,
    maximumNScenarios: MAX_ENDPOINT_SCENARIOS,
    stressRegime,
    policyApplied,
    smallRequestPolicy: DDPM_V7_ENDPOINT_CONTRACT.endpoint_small_request_policy,
    scenarioCountOkForStressEndpoint: !stressRegime || effective >= DDPM_V7_ENDPOINT_CONTRACT.endpoint_min_stress_scenarios,
  };
}

function buildGuidanceSchedule(nScenarios, baseGuidanceScale, regimeKey, useStratifiedStress) {
  if (!useStratifiedStress || !isStressRegime(regimeKey)) {
    return {
      stratified: false,
      schedule: Array.from({ length: nScenarios }, () => baseGuidanceScale),
      counts: { [guidanceKey(baseGuidanceScale)]: nScenarios },
    };
  }

  const entries = Object.entries(DDPM_V7_ENDPOINT_CONTRACT.stress_multiplier_counts)
    .map(([key, count]) => ({ value: Number(key), count: Number(count) }))
    .filter((row) => Number.isFinite(row.value) && Number.isFinite(row.count) && row.count > 0);
  const total = entries.reduce((sum, row) => sum + row.count, 0) || DDPM_V7_ENDPOINT_CONTRACT.generated_scenarios;
  const scaled = entries.map((row) => {
    const raw = (nScenarios * row.count) / total;
    const floor = Math.floor(raw);
    return { ...row, floor, remainder: raw - floor };
  });
  let remaining = nScenarios - scaled.reduce((sum, row) => sum + row.floor, 0);
  scaled
    .slice()
    .sort((left, right) => right.remainder - left.remainder)
    .forEach((row) => {
      if (remaining <= 0) return;
      row.floor += 1;
      remaining -= 1;
    });

  const counts = {};
  const schedule = [];
  for (const row of scaled) {
    const key = guidanceKey(row.value);
    const runtimeGuidance = runtimeGuidanceFromStressMultiplier(row.value, baseGuidanceScale);
    counts[key] = row.floor;
    for (let i = 0; i < row.floor; i += 1) schedule.push(runtimeGuidance);
  }

  return {
    stratified: true,
    schedule,
    counts,
  };
}

function buildDeploymentContract(requestPolicy, guidanceInfo) {
  return {
    status: DDPM_V7_ENDPOINT_CONTRACT.status,
    statusLabel: "Research champion offline only",
    researchChampion: DDPM_V7_CHAMPION_METRICS.scorecard.research_champion,
    readyForEndpoint: DDPM_V7_CHAMPION_METRICS.scorecard.ready_for_endpoint,
    endpointGate: "Deploy only when ready_for_endpoint is true; current endpoint is a guarded research/stress simulator.",
    endpoint: DDPM_V7_ENDPOINT_CONTRACT.endpoint,
    runtime: {
      servedEngine: "js_correlation_proxy_with_v7_contract",
      trainedCheckpointServed: false,
      offlineChampionCheckpointAvailable: true,
      checkpointPath: DDPM_V7_ENDPOINT_CONTRACT.checkpoint_path,
      manifestPath: DDPM_V7_ENDPOINT_CONTRACT.manifest_path,
    },
    requestPolicy,
    stressBook: {
      stratifiedSampling: guidanceInfo.stratified,
      requestedMultiplierCounts: guidanceInfo.counts,
      notebookMultiplierCounts: DDPM_V7_ENDPOINT_CONTRACT.stress_multiplier_counts,
      notebookStressBookQ01: DDPM_V7_ENDPOINT_CONTRACT.stress_book_q01,
    },
    contract: DDPM_V7_ENDPOINT_CONTRACT,
    championMetrics: DDPM_V7_CHAMPION_METRICS,
    scorecard: DDPM_V7_CHAMPION_METRICS.scorecard,
  };
}

function holdingWeight(holding) {
  const direct = numberOrNull(holding?.weightValue);
  if (direct !== null) return direct;
  const raw = String(holding?.weight || "").trim();
  if (raw.endsWith("%")) return clamp(Number(raw.slice(0, -1)) / 100, 0, 1);
  const parsed = numberOrNull(raw);
  if (parsed === null) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function normalizeWeights(rows) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.weight), 0);
  if (total > 0) return rows.map((row) => ({ ...row, weight: row.weight / total }));
  const equal = rows.length ? 1 / rows.length : 0;
  return rows.map((row) => ({ ...row, weight: equal }));
}

function seededRandom(seedText) {
  let seed = 2166136261;
  for (const char of String(seedText || "bls-prime")) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand) {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function quantile(values, q) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = clamp((sorted.length - 1) * q, 0, sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const weight = position - lowerIndex;
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function std(values) {
  const avg = mean(values);
  if (avg === null) return null;
  const valid = values.filter(Number.isFinite);
  if (valid.length < 2) return 0;
  return Math.sqrt(valid.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (valid.length - 1));
}

function buildUniverse(dashboard) {
  const holdings = safeList(dashboard?.modules?.portfolio?.holdings)
    .slice()
    .sort((left, right) => holdingWeight(right) - holdingWeight(left))
    .slice(0, 12)
    .map((holding, index) => {
      const dayReturn =
        numberOrNull(holding?.dayReturn) ??
        numberOrNull(holding?.return1d) ??
        numberOrNull(holding?.return_1d) ??
        numberOrNull(holding?.changePct);
      const riskScore = numberOrNull(holding?.riskScore);
      const weight = holdingWeight(holding);
      const baseVol = clamp(0.009 + (riskScore || 2.5) * 0.0032 + Math.sqrt(Math.max(weight, 0)) * 0.012, 0.008, 0.075);
      return {
        ticker: cleanTicker(holding?.ticker || holding?.symbol, `ASSET${index + 1}`),
        sector: String(holding?.sector || holding?.theme || "Other"),
        weight,
        drift: dayReturn !== null ? clamp(dayReturn * 0.08, -0.002, 0.002) : 0,
        vol: baseVol,
        riskScore: riskScore || null,
      };
    });

  if (holdings.length) return normalizeWeights(holdings);

  return normalizeWeights([
    { ticker: "SPY", sector: "Market", weight: 0.55, drift: 0, vol: 0.014, riskScore: 3 },
    { ticker: "QQQ", sector: "Growth", weight: 0.3, drift: 0, vol: 0.019, riskScore: 4 },
    { ticker: "SGOV", sector: "Cash", weight: 0.15, drift: 0, vol: 0.0015, riskScore: 1 },
  ]);
}

function firstFinite(...values) {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

function dashboardAverageCorrelation(dashboard) {
  return firstFinite(
    dashboard?.modules?.risk?.spectral?.latest?.avg_corr,
    dashboard?.risk?.spectral?.latest?.avg_corr,
    dashboard?.modules?.portfolio?.analytics?.averageCorrelation,
    dashboard?.modules?.portfolio?.analytics?.avgCorrelation,
  );
}

function targetCorrelation(left, right, regime, observedAverageCorrelation) {
  if (left.ticker === right.ticker) return 1;
  const sameSector = left.sector && right.sector && left.sector === right.sector;
  const structural = observedAverageCorrelation !== null
    ? (sameSector
      ? clamp(observedAverageCorrelation + 0.18, 0.16, 0.86)
      : clamp(observedAverageCorrelation, 0.05, 0.72))
    : (sameSector ? 0.58 : 0.28);
  return clamp(Math.max(regime.correlationFloor, structural), 0.05, 0.96);
}

function cholesky(matrix) {
  const n = matrix.length;
  const lower = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = 0;
      for (let k = 0; k < j; k += 1) sum += lower[i][k] * lower[j][k];
      if (i === j) {
        lower[i][j] = Math.sqrt(Math.max(matrix[i][i] - sum, 1e-8));
      } else {
        lower[i][j] = (matrix[i][j] - sum) / Math.max(lower[j][j], 1e-8);
      }
    }
  }
  return lower;
}

function multiplyLower(lower, vector) {
  return lower.map((row, i) => row.slice(0, i + 1).reduce((sum, value, j) => sum + value * vector[j], 0));
}

function buildTargetMatrix(universe, regime, observedAverageCorrelation) {
  return universe.map((left) => universe.map((right) => targetCorrelation(left, right, regime, observedAverageCorrelation)));
}

function empiricalCorrelation(samples, nAssets) {
  const columns = Array.from({ length: nAssets }, (_, assetIndex) => samples.map((row) => row[assetIndex]));
  return columns.map((left) => columns.map((right) => {
    const leftMean = mean(left) || 0;
    const rightMean = mean(right) || 0;
    let numerator = 0;
    let leftVar = 0;
    let rightVar = 0;
    for (let i = 0; i < left.length; i += 1) {
      const l = left[i] - leftMean;
      const r = right[i] - rightMean;
      numerator += l * r;
      leftVar += l * l;
      rightVar += r * r;
    }
    const denom = Math.sqrt(leftVar * rightVar);
    return denom > 0 ? numerator / denom : 0;
  }));
}

function correlationFidelity(target, observed) {
  let total = 0;
  let count = 0;
  for (let i = 0; i < target.length; i += 1) {
    for (let j = 0; j < target.length; j += 1) {
      if (i === j) continue;
      total += Math.abs(target[i][j] - observed[i][j]);
      count += 1;
    }
  }
  return count ? clamp(1 - total / count, 0, 1) : 1;
}

function distributionCoverage(portfolioReturns, baselineVol) {
  const min = -baselineVol * 4;
  const max = baselineVol * 4;
  const bins = 24;
  const seen = new Set();
  for (const value of portfolioReturns) {
    const index = Math.floor(((value - min) / Math.max(max - min, 1e-8)) * bins);
    if (index >= 0 && index < bins) seen.add(index);
  }
  return seen.size / bins;
}

function buildHistoricalReplay(championMetrics) {
  const walkForward = championMetrics?.walk_forward || {};
  const methodologyValidated = walkForward.stress_walk_forward_methodology_validated === true;
  const rows = [
    {
      id: "covid_2020",
      episode: "COVID crash 2020",
      actualMin: numberOrNull(walkForward.covid_crash_2020_actual_min),
      syntheticQ01: numberOrNull(walkForward.covid_crash_2020_synthetic_q01),
    },
    {
      id: "inflation_bear_2022",
      episode: "Inflation bear 2022",
      actualMin: numberOrNull(walkForward.inflation_bear_2022_actual_min),
      syntheticQ01: numberOrNull(walkForward.inflation_bear_2022_synthetic_q01 ?? walkForward.covid_crash_2020_synthetic_q01),
    },
    {
      id: "bank_stress_2023",
      episode: "Bank stress 2023",
      actualMin: numberOrNull(walkForward.bank_stress_2023_actual_min),
      syntheticQ01: numberOrNull(walkForward.bank_stress_2023_synthetic_q01 ?? walkForward.covid_crash_2020_synthetic_q01),
    },
  ].map((row) => {
    const covered = row.actualMin !== null && row.syntheticQ01 !== null ? row.syntheticQ01 <= row.actualMin : null;
    return {
      ...row,
      covered,
      actualMinLabel: pct(row.actualMin),
      syntheticQ01Label: pct(row.syntheticQ01),
    };
  });
  const valid = rows.filter((row) => row.covered !== null);
  const coveredCount = valid.filter((row) => row.covered).length;
  return {
    rows,
    coveredCount,
    episodeCount: valid.length,
    coverageRate: valid.length ? round(coveredCount / valid.length, 4) : null,
    coverageLabel: valid.length ? `${methodologyValidated ? "" : "Legacy "}${coveredCount}/${valid.length}` : "-",
    methodologyValidated,
    methodologyStatus: methodologyValidated ? "validated" : "legacy_provisional_pending_v8",
    methodologyNote:
      walkForward.stress_walk_forward_methodology_note ||
      "Replay coverage is legacy/provisional until the v8 sparse stress ladder replaces the v7 full-window floor.",
  };
}

function buildBaselineComparison(championMetrics) {
  const relative = championMetrics?.relative_to_gaussian || {};
  const scorecard = championMetrics?.scorecard || {};
  const mmdRatio = numberOrNull(relative.mmd_multi_ratio_candidate_vs_gaussian ?? relative.mmd_ratio_candidate_vs_gaussian);
  const corrDelta = numberOrNull(relative.corr_mae_delta_candidate_minus_gaussian);
  return {
    gaussianMmdRatio: round(mmdRatio, 4),
    gaussianMmdRatioLabel: Number.isFinite(mmdRatio) ? `${mmdRatio.toFixed(2)}x` : "-",
    gaussianCorrDelta: round(corrDelta, 4),
    beatsGaussianMmd: Boolean(scorecard.beats_gaussian_mmd || scorecard.beats_gaussian_mmd_multi),
    beatsGaussianCorr: Boolean(scorecard.beats_gaussian_corr),
    readyForEndpoint: Boolean(scorecard.ready_for_endpoint),
  };
}

function makeScenarioPath({ universe, lower, regime, rand, horizonDays, guidanceScale }) {
  const path = [];
  const guidedTailProbability = clamp(regime.tailProbability * guidanceScale, 0, 0.45);
  const guidedVolMultiplier = regime.volMultiplier * (0.72 + guidanceScale * 0.18);
  for (let day = 0; day < horizonDays; day += 1) {
    const independent = universe.map(() => normal(rand));
    const correlated = multiplyLower(lower, independent);
    const marketTail = rand() < guidedTailProbability
      ? regime.tailMean - Math.abs(normal(rand)) * regime.tailScale
      : 0;
    const returns = universe.map((asset, index) => {
      const idiosyncraticTail = rand() < guidedTailProbability * 0.16
        ? regime.tailMean * 0.55 - Math.abs(normal(rand)) * regime.tailScale * 0.55
        : 0;
      return asset.drift + regime.drift + correlated[index] * asset.vol * guidedVolMultiplier + marketTail + idiosyncraticTail;
    });
    path.push(returns);
  }
  return path;
}

function cumulativeReturn(path, weights) {
  let value = 1;
  for (const day of path) {
    const daily = day.reduce((sum, assetReturn, index) => sum + assetReturn * weights[index], 0);
    value *= (1 + daily);
  }
  return value - 1;
}

function maxDrawdownFromDaily(path, weights) {
  let value = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const day of path) {
    const daily = day.reduce((sum, assetReturn, index) => sum + assetReturn * weights[index], 0);
    value *= (1 + daily);
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
  }
  return maxDrawdown;
}

function scenarioContributors(paths, weights, cvarThreshold) {
  const tailPaths = paths.filter((item) => item.portfolioReturn <= cvarThreshold);
  if (!tailPaths.length) return [];
  const nAssets = weights.length;
  return Array.from({ length: nAssets }, (_, index) => {
    const contribution = mean(tailPaths.map((item) => item.assetReturns[index] * weights[index])) || 0;
    return { index, contribution };
  }).sort((left, right) => left.contribution - right.contribution);
}

export function buildDiffusionMarketSimulation(dashboard = {}, options = {}) {
  const regimeKey = REGIMES[options.regime] ? options.regime : "crisis";
  const regime = REGIMES[regimeKey];
  const requestPolicy = resolveScenarioRequest(options, regimeKey);
  const nScenarios = requestPolicy.effectiveNScenarios;
  const horizonDays = Math.max(5, Math.min(90, Number(options.horizonDays || 20)));
  const tailIntensity = clamp(Number(options.tailIntensity ?? options.guidanceScale ?? 1.0), 0.5, 6);
  const guidanceScale = tailIntensity;
  const seed = options.seed || `${dashboard?.workspace_summary?.id || "workspace"}:${regimeKey}:${horizonDays}:${nScenarios}`;
  const rand = seededRandom(seed);
  const universe = buildUniverse(dashboard);
  const observedAverageCorrelation = dashboardAverageCorrelation(dashboard);
  const targetMatrix = buildTargetMatrix(universe, regime, observedAverageCorrelation);
  const lower = cholesky(targetMatrix);
  const weights = universe.map((row) => row.weight);
  const scenarioRows = [];
  const oneDayAssetSamples = [];
  const runId = `stress_${String(seed).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 72)}`;
  const sourceHoldingsCount = safeList(dashboard?.modules?.portfolio?.holdings).length;
  const historicalReplay = buildHistoricalReplay(DDPM_V7_CHAMPION_METRICS);
  const baselineComparison = buildBaselineComparison(DDPM_V7_CHAMPION_METRICS);
  const guidanceInfo = buildGuidanceSchedule(
    nScenarios,
    guidanceScale,
    regimeKey,
    options.stratifiedStress !== false && DDPM_V7_ENDPOINT_CONTRACT.stress_stratified_sampling,
  );

  for (let i = 0; i < nScenarios; i += 1) {
    const scenarioGuidanceScale = guidanceInfo.schedule[i] ?? guidanceScale;
    const path = makeScenarioPath({ universe, lower, regime, rand, horizonDays, guidanceScale: scenarioGuidanceScale });
    const terminalAssetReturns = universe.map((_, assetIndex) => {
      let value = 1;
      for (const day of path) value *= (1 + day[assetIndex]);
      return value - 1;
    });
    scenarioRows.push({
      portfolioReturn: cumulativeReturn(path, weights),
      maxDrawdown: maxDrawdownFromDaily(path, weights),
      assetReturns: terminalAssetReturns,
    });
    oneDayAssetSamples.push(path[0]);
  }

  const portfolioReturns = scenarioRows.map((row) => row.portfolioReturn);
  const drawdowns = scenarioRows.map((row) => row.maxDrawdown);
  const var5 = quantile(portfolioReturns, 0.05);
  const var1 = quantile(portfolioReturns, 0.01);
  const tail = portfolioReturns.filter((value) => var5 !== null && value <= var5);
  const cvar5 = mean(tail);
  const observedCorr = empiricalCorrelation(oneDayAssetSamples, universe.length);
  const baselineVol = Math.sqrt(weights.reduce((sum, weight, index) => sum + (weight * universe[index].vol) ** 2, 0));
  const contributors = scenarioContributors(scenarioRows, weights, var5 ?? -Infinity)
    .slice(0, 5)
    .map((row) => ({
      ticker: universe[row.index]?.ticker || `ASSET${row.index + 1}`,
      contribution: round(row.contribution, 4),
      contributionLabel: pct(row.contribution),
      weight: round(weights[row.index], 4),
    }));

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    runId,
    seed,
    status: "available",
    regime: regimeKey,
    regimeLabel: regime.label,
    model: {
      family: "Stress Engine guarded proxy with offline diffusion research gate",
      trained: false,
      offlineChampionTrained: true,
      trainedCheckpointServed: false,
      note: "The offline diffusion checkpoint remains a research champion. This live endpoint serves a guarded stress proxy until strict endpoint gates pass.",
      horizonDays,
      nScenarios,
      requestedNScenarios: requestPolicy.requestedNScenarios,
      guidanceScale,
      tailIntensity,
      stratifiedStressBook: guidanceInfo.stratified,
      stressMultiplierCounts: guidanceInfo.counts,
    },
    inputSources: {
      manifestSource: MARKET_SIMULATION_MANIFEST.source,
      correlationSource: observedAverageCorrelation !== null ? "dashboard_spectral_average_correlation" : "sector_heuristic_fallback",
      observedAverageCorrelation: round(observedAverageCorrelation, 4),
      includedAssets: universe.length,
      sourceHoldings: sourceHoldingsCount || universe.length,
      universePolicy: sourceHoldingsCount > universe.length ? `Top ${universe.length} holdings by weight included from ${sourceHoldingsCount}.` : "All available holdings included.",
    },
    universe: universe.map((row) => ({
      ticker: row.ticker,
      sector: row.sector,
      weight: round(row.weight, 4),
      weightLabel: pct(row.weight),
      dailyVol: round(row.vol, 4),
    })),
    risk: {
      expectedReturn: round(mean(portfolioReturns), 4),
      expectedReturnLabel: pct(mean(portfolioReturns)),
      medianReturn: round(quantile(portfolioReturns, 0.5), 4),
      medianReturnLabel: pct(quantile(portfolioReturns, 0.5)),
      var5: round(var5, 4),
      var5Label: pct(var5),
      var1: round(var1, 4),
      var1Label: pct(var1),
      cvar5: round(cvar5, 4),
      cvar5Label: pct(cvar5),
      worstReturn: round(Math.min(...portfolioReturns), 4),
      worstReturnLabel: pct(Math.min(...portfolioReturns)),
      probabilityLoss: round(portfolioReturns.filter((value) => value < 0).length / portfolioReturns.length, 4),
      probabilityLossLabel: pct(portfolioReturns.filter((value) => value < 0).length / portfolioReturns.length),
      probabilityDrawdown10: round(drawdowns.filter((value) => value <= -0.1).length / drawdowns.length, 4),
      probabilityDrawdown10Label: pct(drawdowns.filter((value) => value <= -0.1).length / drawdowns.length),
    },
    diagnostics: {
      distributionCoverage: round(distributionCoverage(portfolioReturns, baselineVol * Math.sqrt(horizonDays)), 4),
      distributionCoverageLabel: pct(distributionCoverage(portfolioReturns, baselineVol * Math.sqrt(horizonDays))),
      correlationFidelity: round(correlationFidelity(targetMatrix, observedCorr), 4),
      correlationFidelityLabel: pct(correlationFidelity(targetMatrix, observedCorr)),
      targetAverageCorrelation: round(mean(targetMatrix.flat().filter((_, index) => index % (targetMatrix.length + 1) !== 0)), 4),
      baselineComparison,
      sampler: guidanceInfo.stratified
        ? "seeded stress proxy with stratified tail-intensity mix"
        : "seeded stress proxy",
    },
    validation: {
      historicalReplay,
      baselineComparison,
      endpointGate: {
        ready: baselineComparison.readyForEndpoint,
        statusLabel: baselineComparison.readyForEndpoint ? "Ready" : "Research gated",
        reason: DDPM_V7_ENDPOINT_CONTRACT.ready_for_endpoint_requires,
      },
    },
    deployment: buildDeploymentContract(requestPolicy, guidanceInfo),
    tailContributors: contributors,
    samplePaths: scenarioRows
      .slice()
      .sort((left, right) => left.portfolioReturn - right.portfolioReturn)
      .slice(0, 8)
      .map((row, index) => ({
        id: `tail-${index + 1}`,
        portfolioReturn: round(row.portfolioReturn, 4),
        portfolioReturnLabel: pct(row.portfolioReturn),
        maxDrawdown: round(row.maxDrawdown, 4),
        maxDrawdownLabel: pct(row.maxDrawdown),
      })),
    warnings: [
      universe.length < 3 ? "Portfolio universe is thin; correlation diagnostics are weak." : null,
      sourceHoldingsCount > universe.length ? `Runtime includes the top ${universe.length} holdings by weight out of ${sourceHoldingsCount}; expand the endpoint contract before treating full-book tails as final.` : null,
      requestPolicy.policyApplied === "aggregated_to_minimum"
        ? `Requested scenario count was below the v7 minimum; aggregated to ${nScenarios}.`
        : null,
      "Offline diffusion research remains gated; this endpoint is not production-ready until strict baseline, exception, and correlation gates pass.",
      "Live endpoint currently serves a calibrated JavaScript stress proxy; the PyTorch checkpoint remains an offline Colab artifact.",
      "Synthetic scenarios are research artifacts, not predictions or investment advice.",
    ].filter(Boolean),
  };
}
