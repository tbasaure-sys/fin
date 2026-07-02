import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "bls_stress_engine_v8_same_stack_baseline";
const MAX_ENDPOINT_SCENARIOS = 6000;
const DEFAULT_HISTORY_LOOKBACK_DAYS = 900;
const MIN_HISTORY_ROWS = 90;
const MIN_PAIRWISE_OVERLAP = 60;
const FMP_PRICE_CACHE_TTL_MS = 30 * 60 * 1000;
const FMP_PRICE_CACHE = new Map();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = path.resolve(__dirname, "../../artifacts/market_simulation/latest/contract.json");
const SCENARIO_BANK_DIR = path.resolve(__dirname, "../../artifacts/market_simulation/latest/scenario_bank");
const SCENARIO_BANK_MANIFEST_PATH = path.join(SCENARIO_BANK_DIR, "scenario_bank_manifest.json");
let SCENARIO_BANK_CACHE = undefined;

const FALLBACK_ENDPOINT_CONTRACT = Object.freeze({
  endpoint: "/api/v1/workspaces/{workspaceId}/market-simulation",
  status: "v8_calibrated_factor_stress_engine",
  run_id: "factor_ddpm_run_20260702_035744",
  served_engine: "same_stack_gaussian_factor_stress_engine",
  challenger_engine: "factor_ddpm_research_challenger",
  checkpoint_path: "/content/drive/MyDrive/blsprime_ddpm_market_sim/checkpoints/best_factor_ddpm_market_simulator.pt",
  manifest_path: "/content/drive/MyDrive/blsprime_ddpm_market_sim/artifacts/factor_ddpm_run_20260702_035744/blsprime_market_simulation_manifest.json",
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
  stress_book_q01: -0.446091,
  stress_book_q01_note: "Pooled ladder q01 from v8 stress sleeves; report sleeve quantiles separately before citing as an estimated market tail.",
  scenario_count_ok_for_stress_endpoint: true,
  stress_replay_status: "v8_unconditional_stress_floor_not_episode_conditioned",
  ready_for_endpoint_requires: "Served engine is the calibrated factor stress baseline; DDPM remains research-only until it beats same-stack Gaussian, t-copula, and FHS out of sample.",
});

const FALLBACK_CHAMPION_METRICS = Object.freeze({
  universe_symbols_selected: 500,
  usable_assets: 420,
  factors: 44,
  pca_explained_variance: 0.5963,
  model_params_millions: 11.14,
  train: {
    first_valid_noise_mse: 1.039895,
    best_valid_noise_mse: 0.563476,
    last_valid_noise_mse: 0.563992,
    best_epoch: 178,
    valid_improvement_pct: 45.814173,
    skipped_batches: 2,
    skipped_batch_rate: 0.00044444444444444447,
  },
  champion: {
    model: "gaussian_factor_same_calibration_stack",
    status: "served_baseline_champion",
    reason: "Best v8 projected MMD among deployable CPU baselines while using the same calibration, reconstruction, and residual-bootstrap stack.",
    mmd_rbf_projected: 0.018319,
    mmd_rbf_projected_multi_mean: 0.01679,
    corr_mae: 0.114396,
    corr_top20_eigen_rmse: 3.465929,
    cvar5: -0.210428,
    probability_drawdown_10pct: 0.358974,
  },
  base_eval: {
    model: "factor_ddpm_base",
    distribution_coverage: 0.913346,
    mmd_rbf_projected: 0.150648,
    mmd_rbf_projected_multi_mean: 0.142561,
    corr_fidelity: 0.853159,
    corr_mae: 0.146841,
    corr_top20_eigen_rmse: 8.094619,
    cvar5: -0.237334,
    probability_drawdown_10pct: 0.666667,
  },
  gaussian_cov_train: {
    mmd_rbf_projected: 0.019252,
    mmd_rbf_projected_multi_mean: 0.021844,
    corr_mae: 0.09,
    corr_top20_eigen_rmse: 3.3,
    cvar5: -0.162153,
    probability_drawdown_10pct: 0.384615,
  },
  t_copula_train: {
    mmd_rbf_projected: 0.021834,
    mmd_rbf_projected_multi_mean: 0.018571,
    corr_mae: 0.091423,
    corr_top20_eigen_rmse: 3.352917,
    cvar5: -0.198261,
    probability_drawdown_10pct: 0.538462,
  },
  filtered_historical_simulation_train: {
    mmd_rbf_projected: 0.019066,
    mmd_rbf_projected_multi_mean: 0.016969,
    corr_mae: 0.094841,
    corr_top20_eigen_rmse: 3.953707,
    cvar5: -0.189157,
    probability_drawdown_10pct: 0.423077,
  },
  gaussian_factor_same_calibration_stack: {
    mmd_rbf_projected: 0.018319,
    mmd_rbf_projected_multi_mean: 0.01679,
    corr_mae: 0.114396,
    corr_top20_eigen_rmse: 3.465929,
    cvar5: -0.210428,
    probability_drawdown_10pct: 0.358974,
  },
  relative_to_gaussian: {
    mmd_ratio_candidate_vs_gaussian: 7.82498,
    mmd_multi_ratio_candidate_vs_gaussian: 6.526204,
    corr_mae_delta_candidate_minus_gaussian: 0.057144,
    eigen_rmse_delta_candidate_minus_gaussian: 4.751873,
    candidate_corr_near_gaussian_within_tol: false,
    candidate_mmd_ratio_within_research_gate: false,
  },
  relative_to_champion: {
    ddpm_mmd_multi_ratio_vs_same_stack: 8.490828,
    ddpm_corr_mae_delta_vs_same_stack: 0.032445,
    same_stack_beats_ddpm_mmd: true,
    same_stack_is_served_champion: true,
  },
  factor_space: {
    factor_mmd_base: 0.110333,
    factor_mmd_base_multi_mean: 0.113566,
    factor_eval_windows: 78,
  },
  walk_forward: {
    periods: 3,
    stress_walk_forward_1pct_covers_all: true,
    walk_forward_1pct_covers_all: true,
    stress_walk_forward_methodology_validated: false,
    stress_walk_forward_methodology_note:
      "V8 compares one unconditional stress ladder against historical episodes. Treat this as a stress-floor diagnostic, not episode-conditioned replay coverage.",
    covid_crash_2020_actual_min: -0.35164,
    covid_crash_2020_synthetic_q01: -0.446091,
    inflation_bear_2022_actual_min: -0.159088,
    inflation_bear_2022_synthetic_q01: -0.446091,
    bank_stress_2023_actual_min: -0.014601,
    bank_stress_2023_synthetic_q01: -0.446091,
  },
  scorecard: {
    beats_gaussian_mmd: false,
    beats_gaussian_mmd_multi: false,
    mmd_ratio_within_research_gate: false,
    beats_gaussian_corr: false,
    beats_t_copula_mmd: false,
    beats_fhs_mmd: false,
    beats_same_stack_gaussian_mmd: false,
    corr_near_gaussian: false,
    corr_fidelity_ge_0_80: true,
    target_cvar_close_to_eval_reference: true,
    stress_walk_forward_1pct_covers_all: true,
    walk_forward_1pct_covers_all: true,
    stress_stratified_sampling: true,
    endpoint_scenario_count_ok: true,
    skipped_batch_rate_ok: true,
    no_validation_used_for_guidance_or_cholesky: true,
    no_full_window_stress_floor: true,
    non_overlapping_eval_windows: false,
    eval_metric_sample_size_ok: true,
    ddpm_research_champion: false,
    research_champion: false,
    same_stack_champion: true,
    ready_for_endpoint: true,
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
const MARKET_SIMULATION_CONTRACT = Object.freeze(MARKET_SIMULATION_MANIFEST.contract);
const MARKET_SIMULATION_METRICS = Object.freeze(MARKET_SIMULATION_MANIFEST.championMetrics);

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
    ? MARKET_SIMULATION_CONTRACT.endpoint_min_stress_scenarios
    : MARKET_SIMULATION_CONTRACT.endpoint_min_scenarios;
  const defaultN = MARKET_SIMULATION_CONTRACT.endpoint_default_scenarios;
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
    smallRequestPolicy: MARKET_SIMULATION_CONTRACT.endpoint_small_request_policy,
    scenarioCountOkForStressEndpoint: !stressRegime || effective >= MARKET_SIMULATION_CONTRACT.endpoint_min_stress_scenarios,
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

  const entries = Object.entries(MARKET_SIMULATION_CONTRACT.stress_multiplier_counts)
    .map(([key, count]) => ({ value: Number(key), count: Number(count) }))
    .filter((row) => Number.isFinite(row.value) && Number.isFinite(row.count) && row.count > 0);
  const total = entries.reduce((sum, row) => sum + row.count, 0) || MARKET_SIMULATION_CONTRACT.generated_scenarios;
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
    status: MARKET_SIMULATION_CONTRACT.status,
    statusLabel: "V8 calibrated stress champion",
    researchChampion: MARKET_SIMULATION_METRICS.scorecard.research_champion,
    ddpmResearchChampion: MARKET_SIMULATION_METRICS.scorecard.ddpm_research_champion,
    sameStackChampion: MARKET_SIMULATION_METRICS.scorecard.same_stack_champion,
    readyForEndpoint: MARKET_SIMULATION_METRICS.scorecard.ready_for_endpoint,
    endpointGate: "Endpoint serves the calibrated factor stress baseline; DDPM remains a gated research challenger.",
    endpoint: MARKET_SIMULATION_CONTRACT.endpoint,
    runtime: {
      servedEngine: MARKET_SIMULATION_CONTRACT.served_engine || "same_stack_gaussian_factor_stress_engine",
      trainedCheckpointServed: false,
      offlineChampionCheckpointAvailable: false,
      offlineChallengerCheckpointAvailable: Boolean(MARKET_SIMULATION_CONTRACT.checkpoint_path),
      checkpointPath: MARKET_SIMULATION_CONTRACT.checkpoint_path,
      manifestPath: MARKET_SIMULATION_CONTRACT.manifest_path,
    },
    requestPolicy,
    stressBook: {
      stratifiedSampling: guidanceInfo.stratified,
      requestedMultiplierCounts: guidanceInfo.counts,
      notebookMultiplierCounts: MARKET_SIMULATION_CONTRACT.stress_multiplier_counts,
      notebookStressBookQ01: MARKET_SIMULATION_CONTRACT.stress_book_q01,
      notebookStressBookQ01Note: MARKET_SIMULATION_CONTRACT.stress_book_q01_note,
    },
    contract: MARKET_SIMULATION_CONTRACT,
    championMetrics: MARKET_SIMULATION_METRICS,
    scorecard: MARKET_SIMULATION_METRICS.scorecard,
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

function usableEnvValue(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return null;
  if (["replace_me", "your_key_here", "changeme", "todo", "none", "null", "dummy"].includes(cleaned.toLowerCase())) return null;
  return cleaned;
}

function fmpApiKey() {
  return usableEnvValue(process.env.FMP_API_KEY) || usableEnvValue(process.env.FINANCIAL_MODELING_PREP_API_KEY);
}

function isoDateDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function historicalRowsForTicker(container, ticker) {
  if (!container) return [];
  if (container instanceof Map) return container.get(ticker) || container.get(ticker.toUpperCase()) || [];
  const aliases = [ticker, ticker.toUpperCase(), ticker.replace(".", "-"), ticker.replace("-", ".")];
  for (const alias of aliases) {
    if (Array.isArray(container?.[alias])) return container[alias];
  }
  return [];
}

function rowsToReturnSeries(rows) {
  const sorted = safeList(rows)
    .map((row, index) => {
      if (typeof row === "number") return { date: String(index), return: row };
      const date = row?.date || row?.datetime || row?.timestamp || String(index);
      const directReturn = firstFinite(row?.return, row?.dailyReturn, row?.ret, row?.r);
      const close = firstFinite(row?.adjClose, row?.adjustedClose, row?.close, row?.price);
      return { date: String(date).slice(0, 10), close, return: directReturn };
    })
    .filter((row) => row.return !== null || row.close !== null)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));

  const returns = [];
  let priorClose = null;
  for (const row of sorted) {
    if (row.return !== null) {
      returns.push({ date: row.date, value: clamp(row.return, -0.75, 1.5) });
      priorClose = row.close ?? priorClose;
      continue;
    }
    if (priorClose !== null && row.close !== null && priorClose > 0 && row.close > 0) {
      returns.push({ date: row.date, value: clamp(row.close / priorClose - 1, -0.75, 1.5) });
    }
    if (row.close !== null && row.close > 0) priorClose = row.close;
  }
  return returns.filter((row) => Number.isFinite(row.value));
}

function pairwiseCorrelation(leftRows, rightRows) {
  const rightByDate = new Map(rightRows.map((row) => [row.date, row.value]));
  const left = [];
  const right = [];
  for (const row of leftRows) {
    const matched = rightByDate.get(row.date);
    if (Number.isFinite(matched)) {
      left.push(row.value);
      right.push(matched);
    }
  }
  if (left.length < MIN_PAIRWISE_OVERLAP) return { correlation: null, overlap: left.length };
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
  if (denom <= 0) return { correlation: null, overlap: left.length };
  return { correlation: clamp(numerator / denom, -0.75, 0.95), overlap: left.length };
}

function fallbackPairCorrelation(left, right, observedAverageCorrelation) {
  if (left.ticker === right.ticker) return 1;
  const sameSector = left.sector && right.sector && left.sector === right.sector;
  if (observedAverageCorrelation !== null) {
    return sameSector
      ? clamp(observedAverageCorrelation + 0.12, 0.08, 0.78)
      : clamp(observedAverageCorrelation, 0.02, 0.62);
  }
  return sameSector ? 0.48 : 0.22;
}

function buildHistoricalReturnModelFromRows(universe, rowsByTicker, source, observedAverageCorrelation, options = {}) {
  const minRows = Math.max(30, Number(options.minHistoryRows || MIN_HISTORY_ROWS));
  const returnSeriesByTicker = new Map();
  const assetStats = new Map();
  const limitedHistoryTickers = [];

  for (const asset of universe) {
    const rows = historicalRowsForTicker(rowsByTicker, asset.ticker);
    const returns = rowsToReturnSeries(rows);
    returnSeriesByTicker.set(asset.ticker, returns);
    const values = returns.map((row) => row.value);
    const dailyVol = std(values);
    const dailyMean = mean(values);
    const sufficient = returns.length >= minRows && dailyVol !== null && dailyVol > 0.00005;
    if (!sufficient) limitedHistoryTickers.push(asset.ticker);
    assetStats.set(asset.ticker, {
      ticker: asset.ticker,
      rows: returns.length,
      sufficient,
      dailyVol: sufficient ? clamp(dailyVol, 0.0004, 0.09) : null,
      dailyMean: sufficient ? clamp(dailyMean || 0, -0.004, 0.004) : null,
      firstDate: returns[0]?.date || null,
      lastDate: returns[returns.length - 1]?.date || null,
    });
  }

  const n = universe.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  const overlapMatrix = Array.from({ length: n }, () => Array(n).fill(0));
  let realPairCount = 0;
  let fallbackPairCount = 0;

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) {
        matrix[i][j] = 1;
        overlapMatrix[i][j] = assetStats.get(universe[i].ticker)?.rows || 0;
        continue;
      }
      const left = returnSeriesByTicker.get(universe[i].ticker) || [];
      const right = returnSeriesByTicker.get(universe[j].ticker) || [];
      const pair = pairwiseCorrelation(left, right);
      overlapMatrix[i][j] = pair.overlap;
      if (pair.correlation !== null) {
        matrix[i][j] = clamp(pair.correlation * 0.88, -0.65, 0.92);
        realPairCount += 1;
      } else {
        matrix[i][j] = fallbackPairCorrelation(universe[i], universe[j], observedAverageCorrelation);
        fallbackPairCount += 1;
      }
    }
  }

  const sufficientAssets = universe.filter((asset) => assetStats.get(asset.ticker)?.sufficient).length;
  if (!sufficientAssets && realPairCount === 0) return null;

  return {
    source,
    rowsByTicker: Object.fromEntries(universe.map((asset) => [asset.ticker, assetStats.get(asset.ticker)?.rows || 0])),
    assetStats,
    matrix,
    overlapMatrix,
    minHistoryRows: minRows,
    minPairwiseOverlap: MIN_PAIRWISE_OVERLAP,
    sufficientAssets,
    includedAssets: universe.length,
    realPairCount: Math.floor(realPairCount / 2),
    fallbackPairCount: Math.floor(fallbackPairCount / 2),
    limitedHistoryTickers,
    coverageRatio: universe.length ? sufficientAssets / universe.length : 0,
  };
}

function resolveHistoricalReturnModel(universe, dashboard, options = {}) {
  const observedAverageCorrelation = dashboardAverageCorrelation(dashboard);
  if (options.historicalReturnModel) return options.historicalReturnModel;
  const rowsByTicker = options.returnHistory || options.returnsHistory || options.priceHistory || options.pricePanel;
  if (!rowsByTicker) return null;
  return buildHistoricalReturnModelFromRows(
    universe,
    rowsByTicker,
    options.returnHistory || options.returnsHistory ? "provided_historical_returns" : "provided_historical_prices",
    observedAverageCorrelation,
    options,
  );
}

function applyHistoricalReturnModel(universe, historicalModel) {
  if (!historicalModel?.assetStats) {
    return universe.map((asset) => ({
      ...asset,
      volSource: "risk_score_fallback",
      historyRows: 0,
      limitedHistory: true,
    }));
  }
  return universe.map((asset) => {
    const stats = historicalModel.assetStats.get(asset.ticker);
    if (!stats?.sufficient) {
      return {
        ...asset,
        volSource: "risk_score_fallback_limited_history",
        historyRows: stats?.rows || 0,
        limitedHistory: true,
      };
    }
    return {
      ...asset,
      vol: stats.dailyVol,
      drift: clamp((stats.dailyMean || 0) * 0.25, -0.001, 0.001),
      volSource: historicalModel.source,
      historyRows: stats.rows,
      historyStartDate: stats.firstDate,
      historyEndDate: stats.lastDate,
      limitedHistory: false,
    };
  });
}

function stressCorrelationMatrix(baseMatrix, regimeKey) {
  const liftByRegime = {
    baseline: 0,
    recovery: 0.18,
    inflation: 0.34,
    crisis: 0.45,
  };
  const lift = liftByRegime[regimeKey] ?? 0.35;
  return baseMatrix.map((row, i) => row.map((value, j) => {
    if (i === j) return 1;
    const corr = clamp(value, -0.75, 0.95);
    const stressed = corr >= 0 ? corr + (1 - corr) * lift : corr * (1 - lift);
    return clamp(stressed, -0.45, 0.97);
  }));
}

async function fetchFmpHistoricalPrices(ticker, { apiKey, startDate, endDate }) {
  const cacheKey = `${ticker}:${startDate}:${endDate}`;
  const cached = FMP_PRICE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < FMP_PRICE_CACHE_TTL_MS) return cached.rows;

  const url = new URL("https://financialmodelingprep.com/stable/historical-price-eod/full");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("from", startDate);
  url.searchParams.set("to", endDate);
  url.searchParams.set("apikey", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`FMP ${response.status}`);
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.historical) ? payload.historical : [];
    FMP_PRICE_CACHE.set(cacheKey, { createdAt: Date.now(), rows });
    return rows;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveHistoricalReturnModelAsync(universe, dashboard, options = {}) {
  const localModel = resolveHistoricalReturnModel(universe, dashboard, options);
  if (localModel) return { model: localModel, warning: null };
  if (options.useRealReturnData === false) return { model: null, warning: "Real-return covariance disabled for this request." };

  const apiKey = fmpApiKey();
  if (!apiKey) {
    return {
      model: null,
      warning: "FMP_API_KEY is not configured; endpoint used an explicit limited-history covariance fallback.",
    };
  }

  const startDate = options.historyStartDate || isoDateDaysAgo(Number(options.historyLookbackDays || DEFAULT_HISTORY_LOOKBACK_DAYS));
  const endDate = options.historyEndDate || todayIsoDate();
  const rowsByTicker = {};
  const failures = [];
  const results = await Promise.allSettled(
    universe.map(async (asset) => {
      const rows = await fetchFmpHistoricalPrices(asset.ticker, { apiKey, startDate, endDate });
      rowsByTicker[asset.ticker] = rows;
    }),
  );
  results.forEach((result, index) => {
    if (result.status === "rejected") failures.push(universe[index]?.ticker);
  });
  const model = buildHistoricalReturnModelFromRows(universe, rowsByTicker, "fmp_historical_prices", dashboardAverageCorrelation(dashboard), options);
  return {
    model: model
      ? {
        ...model,
        historyStartDate: startDate,
        historyEndDate: endDate,
        failedFetchTickers: failures,
      }
      : null,
    warning: failures.length
      ? `FMP historical fetch failed for ${failures.join(", ")}; those positions use limited-history fallback.`
      : null,
  };
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

function buildTargetMatrix(universe, regime, observedAverageCorrelation, historicalModel, regimeKey) {
  if (historicalModel?.matrix) return stressCorrelationMatrix(historicalModel.matrix, regimeKey);
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

function buildReturnHistogram(values, buckets = 16) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return [];
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (min === max) {
    return [{
      min: round(min, 4),
      max: round(max, 4),
      count: valid.length,
      countLabel: String(valid.length),
      midpoint: round(min, 4),
      midpointLabel: pct(min),
    }];
  }
  const width = (max - min) / buckets;
  const rows = Array.from({ length: buckets }, (_, index) => ({
    min: min + width * index,
    max: index === buckets - 1 ? max : min + width * (index + 1),
    count: 0,
  }));
  for (const value of valid) {
    const index = Math.min(buckets - 1, Math.max(0, Math.floor((value - min) / width)));
    rows[index].count += 1;
  }
  return rows.map((row) => {
    const midpoint = (row.min + row.max) / 2;
    return {
      min: round(row.min, 4),
      max: round(row.max, 4),
      count: row.count,
      countLabel: String(row.count),
      midpoint: round(midpoint, 4),
      midpointLabel: pct(midpoint),
    };
  });
}

function loadScenarioBank() {
  if (SCENARIO_BANK_CACHE !== undefined) return SCENARIO_BANK_CACHE;
  try {
    const manifest = JSON.parse(fs.readFileSync(SCENARIO_BANK_MANIFEST_PATH, "utf8"));
    const baseBuffer = fs.readFileSync(path.join(SCENARIO_BANK_DIR, manifest.files.baseTerminalReturnsI16));
    const stressBuffer = fs.readFileSync(path.join(SCENARIO_BANK_DIR, manifest.files.stressTerminalReturnsI16));
    const multiplierBuffer = fs.readFileSync(path.join(SCENARIO_BANK_DIR, manifest.files.stressMultiplierCodesU8));
    const expectedReturnBytes = Number(manifest.scenarioCount) * Number(manifest.assetCount) * 2;
    if (baseBuffer.length !== expectedReturnBytes || stressBuffer.length !== expectedReturnBytes) {
      throw new Error("Scenario bank return matrix size mismatch");
    }
    if (multiplierBuffer.length !== Number(manifest.scenarioCount)) {
      throw new Error("Scenario bank multiplier code size mismatch");
    }
    const symbolIndex = new Map(safeList(manifest.symbols).map((symbol, index) => [cleanTicker(symbol, symbol), index]));
    SCENARIO_BANK_CACHE = {
      manifest,
      baseBuffer,
      stressBuffer,
      multiplierBuffer,
      symbolIndex,
    };
  } catch {
    SCENARIO_BANK_CACHE = null;
  }
  return SCENARIO_BANK_CACHE;
}

function readScenarioBankReturn(buffer, scenarioIndex, assetIndex, assetCount, scaleBps) {
  const offset = (scenarioIndex * assetCount + assetIndex) * 2;
  if (offset < 0 || offset + 2 > buffer.length) return 0;
  return buffer.readInt16LE(offset) / scaleBps;
}

function buildScenarioBankOverlay({ universe, weights, regimeKey }) {
  const bank = loadScenarioBank();
  if (!bank) {
    return {
      status: "unavailable",
      available: false,
      servedAsPrimary: false,
      warnings: ["Deployable v8 scenario bank artifact is not available in this runtime."],
    };
  }

  const manifest = bank.manifest;
  const scenarioCount = Number(manifest.scenarioCount) || 0;
  const assetCount = Number(manifest.assetCount) || 0;
  const scaleBps = Number(manifest.scaleBps) || 10000;
  const returnSet = isStressRegime(regimeKey) ? "stress" : "base";
  const buffer = returnSet === "stress" ? bank.stressBuffer : bank.baseBuffer;
  const matched = [];
  const missingAssets = [];
  universe.forEach((asset, universeIndex) => {
    const bankIndex = bank.symbolIndex.get(asset.ticker);
    if (Number.isInteger(bankIndex)) {
      matched.push({
        universeIndex,
        bankIndex,
        ticker: asset.ticker,
        weight: weights[universeIndex],
      });
    } else {
      missingAssets.push(asset.ticker);
    }
  });

  const matchedWeightCoverage = matched.reduce((sum, row) => sum + row.weight, 0);
  if (!scenarioCount || !assetCount || matched.length < 1 || matchedWeightCoverage <= 0) {
    return {
      status: "insufficient_coverage",
      available: true,
      servedAsPrimary: false,
      role: manifest.role,
      sourceRunId: manifest.runId,
      matchedAssets: matched.map((row) => row.ticker),
      missingAssets,
      matchedWeightCoverage: round(matchedWeightCoverage, 4),
      matchedWeightCoverageLabel: pct(matchedWeightCoverage),
      warnings: ["No current holdings matched the deployable v8 scenario bank universe."],
    };
  }

  const portfolioReturns = [];
  const scenarioAssetContributions = [];
  for (let scenarioIndex = 0; scenarioIndex < scenarioCount; scenarioIndex += 1) {
    let portfolioReturn = 0;
    const assetContributions = [];
    for (const row of matched) {
      const assetReturn = readScenarioBankReturn(buffer, scenarioIndex, row.bankIndex, assetCount, scaleBps);
      const contribution = assetReturn * row.weight;
      portfolioReturn += contribution;
      assetContributions.push({ ticker: row.ticker, contribution });
    }
    portfolioReturns.push(portfolioReturn);
    scenarioAssetContributions.push(assetContributions);
  }

  const var5 = quantile(portfolioReturns, 0.05);
  const var1 = quantile(portfolioReturns, 0.01);
  const tail = portfolioReturns.filter((value) => var5 !== null && value <= var5);
  const cvar5 = mean(tail);
  const tailScenarioIndexes = portfolioReturns
    .map((value, index) => ({ value, index }))
    .filter((row) => var5 !== null && row.value <= var5)
    .map((row) => row.index);
  const contributionByTicker = new Map();
  for (const scenarioIndex of tailScenarioIndexes) {
    for (const row of scenarioAssetContributions[scenarioIndex] || []) {
      contributionByTicker.set(row.ticker, (contributionByTicker.get(row.ticker) || 0) + row.contribution);
    }
  }
  const divisor = Math.max(1, tailScenarioIndexes.length);
  const tailContributors = Array.from(contributionByTicker.entries())
    .map(([ticker, contribution]) => ({
      ticker,
      contribution: round(contribution / divisor, 4),
      contributionLabel: pct(contribution / divisor),
      weight: round(matched.find((row) => row.ticker === ticker)?.weight || 0, 4),
    }))
    .sort((left, right) => left.contribution - right.contribution)
    .slice(0, 5);

  const multiplierCounts = {};
  for (const code of bank.multiplierBuffer.values()) {
    const value = manifest.stressMultiplierValues?.[code] ?? code;
    const key = guidanceKey(value);
    multiplierCounts[key] = (multiplierCounts[key] || 0) + 1;
  }

  const status = matchedWeightCoverage >= 0.7 ? "available" : "partial_coverage";
  return {
    status,
    available: true,
    servedAsPrimary: false,
    role: manifest.role,
    sourceRunId: manifest.runId,
    sourceArray: manifest.sourceArrays?.[returnSet],
    returnSet,
    disclosure: manifest.disclosure,
    scenarioCount,
    horizonDays: manifest.horizonDays,
    matchedAssets: matched.map((row) => row.ticker),
    missingAssets,
    matchedWeightCoverage: round(matchedWeightCoverage, 4),
    matchedWeightCoverageLabel: pct(matchedWeightCoverage),
    terminalReturnClip: manifest.terminalReturnClip,
    dailyReturnClip: manifest.dailyReturnClip,
    stressMultiplierCounts: multiplierCounts,
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
      histogram: buildReturnHistogram(portfolioReturns),
    },
    tailContributors,
    warnings: [
      "Scenario bank overlay is not the served champion; it is a capped v8 DDPM research stress overlay for matched tickers.",
      matchedWeightCoverage < 0.7
        ? `Only ${pct(matchedWeightCoverage)} of portfolio weight matched the v8 bank universe; treat overlay numbers as partial-book diagnostics.`
        : null,
      missingAssets.length ? `Scenario bank has no direct path for ${missingAssets.join(", ")}.` : null,
    ].filter(Boolean),
  };
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
    coverageLabel: valid.length ? `${methodologyValidated ? "" : "Floor "}${coveredCount}/${valid.length}` : "-",
    methodologyValidated,
    methodologyStatus: methodologyValidated ? "validated" : "unconditional_stress_floor",
    methodologyNote:
      walkForward.stress_walk_forward_methodology_note ||
      "V8 replay uses one unconditional stress ladder against historical episodes. It is a floor diagnostic, not episode-conditioned coverage.",
  };
}

function buildBaselineComparison(championMetrics) {
  const relative = championMetrics?.relative_to_gaussian || {};
  const relativeToChampion = championMetrics?.relative_to_champion || {};
  const champion = championMetrics?.champion || {};
  const scorecard = championMetrics?.scorecard || {};
  const mmdRatio = numberOrNull(relative.mmd_multi_ratio_candidate_vs_gaussian ?? relative.mmd_ratio_candidate_vs_gaussian);
  const championRatio = numberOrNull(relativeToChampion.ddpm_mmd_multi_ratio_vs_same_stack);
  const corrDelta = numberOrNull(relative.corr_mae_delta_candidate_minus_gaussian);
  return {
    championModel: champion.model || "gaussian_factor_same_calibration_stack",
    championStatus: champion.status || "served_baseline_champion",
    championMmdProjectedMultiMean: round(champion.mmd_rbf_projected_multi_mean, 6),
    ddpmVsChampionMmdRatio: round(championRatio, 4),
    ddpmVsChampionMmdRatioLabel: Number.isFinite(championRatio) ? `${championRatio.toFixed(2)}x` : "-",
    sameStackBeatsDdpmMmd: Boolean(relativeToChampion.same_stack_beats_ddpm_mmd),
    gaussianMmdRatio: round(mmdRatio, 4),
    gaussianMmdRatioLabel: Number.isFinite(mmdRatio) ? `${mmdRatio.toFixed(2)}x` : "-",
    gaussianCorrDelta: round(corrDelta, 4),
    beatsGaussianMmd: Boolean(scorecard.beats_gaussian_mmd || scorecard.beats_gaussian_mmd_multi),
    beatsGaussianCorr: Boolean(scorecard.beats_gaussian_corr),
    ddpmResearchChampion: Boolean(scorecard.ddpm_research_champion),
    sameStackChampion: Boolean(scorecard.same_stack_champion),
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

function cumulativePortfolioCurve(path, weights) {
  let value = 1;
  return path.map((day) => {
    const daily = day.reduce((sum, assetReturn, index) => sum + assetReturn * weights[index], 0);
    value *= (1 + daily);
    return round(value - 1, 4);
  });
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
  const rawUniverse = buildUniverse(dashboard);
  const historicalModel = resolveHistoricalReturnModel(rawUniverse, dashboard, options);
  const universe = applyHistoricalReturnModel(rawUniverse, historicalModel);
  const observedAverageCorrelation = dashboardAverageCorrelation(dashboard);
  const targetMatrix = buildTargetMatrix(universe, regime, observedAverageCorrelation, historicalModel, regimeKey);
  const lower = cholesky(targetMatrix);
  const weights = universe.map((row) => row.weight);
  const scenarioRows = [];
  const oneDayAssetSamples = [];
  const runId = `stress_${String(seed).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 72)}`;
  const sourceHoldingsCount = safeList(dashboard?.modules?.portfolio?.holdings).length;
  const historicalReplay = buildHistoricalReplay(MARKET_SIMULATION_METRICS);
  const baselineComparison = buildBaselineComparison(MARKET_SIMULATION_METRICS);
  const guidanceInfo = buildGuidanceSchedule(
    nScenarios,
    guidanceScale,
    regimeKey,
    options.stratifiedStress !== false && MARKET_SIMULATION_CONTRACT.stress_stratified_sampling,
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
      cumulativePath: cumulativePortfolioCurve(path, weights),
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
  const scenarioBankOverlay = buildScenarioBankOverlay({ universe, weights, regimeKey });

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    runId,
    seed,
    status: "available",
    regime: regimeKey,
    regimeLabel: regime.label,
    model: {
      family: "Calibrated Factor Stress Engine",
      championModel: baselineComparison.championModel,
      trained: false,
      offlineChampionTrained: false,
      offlineChallengerTrained: true,
      trainedCheckpointServed: false,
      note: "V8 dethroned the DDPM. The shipped module is framed as a calibrated factor stress engine; the DDPM checkpoint remains a research challenger.",
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
      correlationSource: historicalModel?.source || (observedAverageCorrelation !== null ? "dashboard_spectral_average_correlation" : "sector_heuristic_fallback"),
      realReturnData: Boolean(historicalModel),
      covarianceSource: historicalModel ? "estimated_from_daily_return_history" : "limited_history_structural_fallback",
      observedAverageCorrelation: round(observedAverageCorrelation, 4),
      historyStartDate: historicalModel?.historyStartDate || null,
      historyEndDate: historicalModel?.historyEndDate || null,
      minHistoryRows: historicalModel?.minHistoryRows || MIN_HISTORY_ROWS,
      minPairwiseOverlap: historicalModel?.minPairwiseOverlap || MIN_PAIRWISE_OVERLAP,
      historyCoverage: historicalModel ? round(historicalModel.coverageRatio, 4) : 0,
      historyCoverageLabel: historicalModel ? pct(historicalModel.coverageRatio) : "0.0%",
      realPairCount: historicalModel?.realPairCount || 0,
      fallbackPairCount: historicalModel?.fallbackPairCount || 0,
      limitedHistoryTickers: historicalModel?.limitedHistoryTickers || universe.map((row) => row.ticker),
      failedFetchTickers: historicalModel?.failedFetchTickers || [],
      scenarioBankOverlay: {
        status: scenarioBankOverlay.status,
        available: Boolean(scenarioBankOverlay.available),
        servedAsPrimary: false,
        sourceRunId: scenarioBankOverlay.sourceRunId || null,
        matchedWeightCoverage: scenarioBankOverlay.matchedWeightCoverage ?? null,
        matchedWeightCoverageLabel: scenarioBankOverlay.matchedWeightCoverageLabel || null,
        matchedAssets: scenarioBankOverlay.matchedAssets || [],
        missingAssets: scenarioBankOverlay.missingAssets || [],
      },
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
      volSource: row.volSource,
      historyRows: row.historyRows,
      historyStartDate: row.historyStartDate || null,
      historyEndDate: row.historyEndDate || null,
      limitedHistory: Boolean(row.limitedHistory),
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
      histogram: buildReturnHistogram(portfolioReturns),
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
        statusLabel: baselineComparison.readyForEndpoint ? "V8 baseline ready" : "Research gated",
        reason: MARKET_SIMULATION_CONTRACT.ready_for_endpoint_requires,
      },
    },
    scenarioBankOverlay,
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
        cumulativePath: row.cumulativePath,
      })),
    warnings: [
      universe.length < 3 ? "Portfolio universe is thin; correlation diagnostics are weak." : null,
      sourceHoldingsCount > universe.length ? `Runtime includes the top ${universe.length} holdings by weight out of ${sourceHoldingsCount}; expand the endpoint contract before treating full-book tails as final.` : null,
      requestPolicy.policyApplied === "aggregated_to_minimum"
        ? `Requested scenario count was below the v8 minimum; aggregated to ${nScenarios}.`
        : null,
      options.historicalReturnDataWarning || null,
      historicalModel
        ? null
        : "Real-return covariance was unavailable; this run used a visible limited-history structural fallback instead of silently inventing covariance.",
      historicalModel?.limitedHistoryTickers?.length
        ? `Limited return history for ${historicalModel.limitedHistoryTickers.join(", ")}; those positions use fallback volatility or pairwise correlation where necessary.`
        : null,
      historicalModel?.fallbackPairCount
        ? `${historicalModel.fallbackPairCount} asset-pair correlations used fallback estimates because overlapping return history was too short.`
        : null,
      ...(scenarioBankOverlay.warnings || []),
      "DDPM research remains gated after v8; same-stack/FHS/t-copula baselines beat it on MMD and correlation diagnostics.",
      historicalModel
        ? "Live endpoint serves the v8 calibrated stress runtime with covariance and volatility estimated from historical return data when available; the PyTorch DDPM checkpoint remains an offline challenger artifact."
        : "Live endpoint serves the v8 calibrated stress runtime, but this request did not have enough historical return data to estimate full real covariance.",
      "Synthetic scenarios are research artifacts, not predictions or investment advice.",
    ].filter(Boolean),
  };
}

export async function buildDiffusionMarketSimulationAsync(dashboard = {}, options = {}) {
  const rawUniverse = buildUniverse(dashboard);
  const { model, warning } = await resolveHistoricalReturnModelAsync(rawUniverse, dashboard, options);
  return buildDiffusionMarketSimulation(dashboard, {
    ...options,
    historicalReturnModel: model,
    historicalReturnDataWarning: warning,
  });
}
