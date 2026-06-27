const DEFAULT_WEIGHTS = {
  momentum: 0.36,
  quality: 0.32,
  value: 0.22,
  lowVol: 0.1,
};

const SAMPLE_UNIVERSE = [
  {
    ticker: "ASML",
    name: "ASML Holding",
    sector: "Semicap equipment",
    region: "Europe",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-02-25",
    liquidity: 0.92,
    momentum: 0.19,
    quality: 0.84,
    value: 0.42,
    resvol: 0.28,
    nextReturn: 0.041,
  },
  {
    ticker: "TSM",
    name: "Taiwan Semiconductor",
    sector: "Semiconductors",
    region: "Asia",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-04-18",
    liquidity: 0.95,
    momentum: 0.14,
    quality: 0.88,
    value: 0.51,
    resvol: 0.24,
    nextReturn: 0.019,
  },
  {
    ticker: "MSFT",
    name: "Microsoft",
    sector: "Software",
    region: "US",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-04-30",
    liquidity: 0.99,
    momentum: 0.12,
    quality: 0.9,
    value: 0.34,
    resvol: 0.18,
    nextReturn: 0.012,
  },
  {
    ticker: "META",
    name: "Meta Platforms",
    sector: "Software",
    region: "US",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-04-24",
    liquidity: 0.96,
    momentum: 0.22,
    quality: 0.78,
    value: 0.47,
    resvol: 0.31,
    nextReturn: -0.008,
  },
  {
    ticker: "LVMUY",
    name: "LVMH",
    sector: "Consumer luxury",
    region: "Europe",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-04-15",
    liquidity: 0.7,
    momentum: -0.04,
    quality: 0.74,
    value: 0.56,
    resvol: 0.21,
    nextReturn: 0.028,
  },
  {
    ticker: "NVO",
    name: "Novo Nordisk",
    sector: "Healthcare",
    region: "Europe",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-05-02",
    liquidity: 0.82,
    momentum: -0.08,
    quality: 0.86,
    value: 0.39,
    resvol: 0.27,
    nextReturn: 0.036,
  },
  {
    ticker: "JPM",
    name: "JPMorgan Chase",
    sector: "Financials",
    region: "US",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-04-11",
    liquidity: 0.97,
    momentum: 0.09,
    quality: 0.68,
    value: 0.63,
    resvol: 0.23,
    nextReturn: 0.006,
  },
  {
    ticker: "CAT",
    name: "Caterpillar",
    sector: "Industrials",
    region: "US",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-04-29",
    liquidity: 0.83,
    momentum: 0.07,
    quality: 0.61,
    value: 0.67,
    resvol: 0.29,
    nextReturn: -0.014,
  },
  {
    ticker: "SHOP",
    name: "Shopify",
    sector: "Software",
    region: "North America",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-05-08",
    liquidity: 0.76,
    momentum: 0.26,
    quality: 0.58,
    value: 0.28,
    resvol: 0.47,
    nextReturn: 0.052,
  },
  {
    ticker: "BHP",
    name: "BHP Group",
    sector: "Materials",
    region: "Global",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-02-20",
    liquidity: 0.79,
    momentum: -0.02,
    quality: 0.57,
    value: 0.72,
    resvol: 0.33,
    nextReturn: -0.003,
  },
  {
    ticker: "COST",
    name: "Costco",
    sector: "Consumer staples",
    region: "US",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-05-29",
    liquidity: 0.89,
    momentum: 0.11,
    quality: 0.81,
    value: 0.21,
    resvol: 0.16,
    nextReturn: 0.009,
  },
  {
    ticker: "MELI",
    name: "MercadoLibre",
    sector: "Internet commerce",
    region: "LatAm",
    priceDate: "2026-06-24",
    fundamentalsDate: "2026-05-07",
    liquidity: 0.73,
    momentum: 0.18,
    quality: 0.69,
    value: 0.37,
    resvol: 0.41,
    nextReturn: 0.033,
  },
];

function clamp(value, low, high) {
  const number = Number(value);
  if (!Number.isFinite(number)) return low;
  return Math.min(Math.max(number, low), high);
}

function cleanDate(value, fallback = "2026-06-24") {
  const text = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

function normalizeUniverse(value) {
  const text = typeof value === "string" ? value : "global";
  return ["global", "us", "ex-us", "quality", "cyclical"].includes(text) ? text : "global";
}

function normalizeWeights(input = {}) {
  const raw = {
    momentum: clamp(input.momentum ?? DEFAULT_WEIGHTS.momentum, 0, 1),
    quality: clamp(input.quality ?? DEFAULT_WEIGHTS.quality, 0, 1),
    value: clamp(input.value ?? DEFAULT_WEIGHTS.value, 0, 1),
    lowVol: clamp(input.lowVol ?? DEFAULT_WEIGHTS.lowVol, 0, 1),
  };
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value / total]));
}

export function buildFactorLabSpec(input = {}) {
  return {
    name: "factorlab_point_in_time_screen",
    version: "0.2",
    asof: cleanDate(input.asof),
    topK: Math.round(clamp(input.topK ?? 5, 1, 12)),
    universe: normalizeUniverse(input.universe),
    minLiquidity: clamp(input.minLiquidity ?? 0.65, 0, 1),
    maxResidualVol: clamp(input.maxResidualVol ?? 0.5, 0.1, 0.8),
    neutralizeSector: input.neutralizeSector !== false,
    includeFutureReturn: Boolean(input.includeFutureReturn),
    weights: normalizeWeights(input.weights),
    sources: {
      prices: { adapter: "sample_equity_prices", pointInTime: true },
      fundamentals: { adapter: "sample_fundamentals", lagPolicy: "filed_date_lte_asof" },
    },
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function std(values) {
  const center = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - center) ** 2))) || 1;
}

function zscore(value, values) {
  return (value - mean(values)) / std(values);
}

function isEligibleForUniverse(row, universe) {
  if (universe === "us") return row.region === "US";
  if (universe === "ex-us") return row.region !== "US";
  if (universe === "quality") return row.quality >= 0.68;
  if (universe === "cyclical") return ["Industrials", "Materials", "Semicap equipment", "Semiconductors", "Financials"].includes(row.sector);
  return true;
}

function validateSpec(spec) {
  if (spec.includeFutureReturn) {
    return {
      refused: true,
      errorType: "LookaheadError",
      op: "lead(next_return)",
      message: "Future return is only valid as a label for training, not as an input for a live screen.",
      fix: "Turn off the future-return signal and rerun the screen.",
    };
  }

  if (spec.topK < 1) {
    return {
      refused: true,
      errorType: "SpecError",
      op: "top_k",
      message: "Top K must be at least 1.",
      fix: "Use a positive number of candidates.",
    };
  }

  return null;
}

function buildPipeline(spec) {
  const steps = [
    {
      id: "asof",
      op: "as_of",
      status: "safe",
      input: "prices + fundamentals",
      params: `date=${spec.asof}`,
      plain: "Drops any row whose price or filing date is after the screen date.",
    },
    {
      id: "liquidity",
      op: "filter",
      status: "safe",
      input: "eligible universe",
      params: `liquidity>=${spec.minLiquidity.toFixed(2)}, resvol<=${spec.maxResidualVol.toFixed(2)}`,
      plain: "Removes names that are too illiquid or too volatile for this run.",
    },
    {
      id: "score",
      op: "composite_score",
      status: "safe",
      input: "momentum + quality + value + low vol",
      params: `weights=${Object.entries(spec.weights).map(([key, value]) => `${key}:${value.toFixed(2)}`).join(",")}`,
      plain: "Combines normalized factor signals into one ranking score.",
    },
    {
      id: "neutralize",
      op: spec.neutralizeSector ? "sector_neutralize" : "pass_through",
      status: spec.neutralizeSector ? "pit" : "safe",
      input: "composite score",
      params: spec.neutralizeSector ? "subtract sector mean score" : "no sector adjustment",
      plain: spec.neutralizeSector
        ? "Penalizes crowded sector bets so the list is not just one theme."
        : "Keeps the raw factor score without sector adjustment.",
    },
    {
      id: "topk",
      op: "top_k",
      status: "safe",
      input: "final score",
      params: `k=${spec.topK}`,
      plain: "Ranks candidates and returns the top names.",
    },
  ];

  if (spec.includeFutureReturn) {
    steps.splice(2, 0, {
      id: "future",
      op: "lead(next_return)",
      status: "refused",
      input: "future returns",
      params: "period=next_month",
      plain: "This would leak future data into the live screen.",
    });
  }

  return steps;
}

export function runFactorLab(input = {}) {
  const spec = buildFactorLabSpec(input);
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
      audit: [
        "Spec parsed.",
        `Refused at ${refusal.op}: ${refusal.message}`,
        refusal.fix,
      ],
      summary: {
        eligible: 0,
        returned: 0,
        coverage: 0,
        topScore: null,
      },
    };
  }

  const eligible = SAMPLE_UNIVERSE.filter(
    (row) =>
      row.priceDate <= spec.asof &&
      row.fundamentalsDate <= spec.asof &&
      row.liquidity >= spec.minLiquidity &&
      row.resvol <= spec.maxResidualVol &&
      isEligibleForUniverse(row, spec.universe),
  );

  if (!eligible.length) {
    const emptyRefusal = {
      refused: true,
      errorType: "CoverageError",
      op: "filter",
      message: "No candidate survived the point-in-time filters.",
      fix: "Relax liquidity, volatility, universe, or as-of date.",
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
        topScore: null,
      },
    };
  }

  const vectors = {
    momentum: eligible.map((row) => row.momentum),
    quality: eligible.map((row) => row.quality),
    value: eligible.map((row) => row.value),
    lowVol: eligible.map((row) => -row.resvol),
  };

  const scored = eligible.map((row) => {
    const factorScores = {
      momentum: zscore(row.momentum, vectors.momentum),
      quality: zscore(row.quality, vectors.quality),
      value: zscore(row.value, vectors.value),
      lowVol: zscore(-row.resvol, vectors.lowVol),
    };
    const rawScore =
      factorScores.momentum * spec.weights.momentum +
      factorScores.quality * spec.weights.quality +
      factorScores.value * spec.weights.value +
      factorScores.lowVol * spec.weights.lowVol;
    return { ...row, factorScores, rawScore };
  });

  const sectorMeans = scored.reduce((acc, row) => {
    acc[row.sector] ||= [];
    acc[row.sector].push(row.rawScore);
    return acc;
  }, {});
  const sectorMeanScores = Object.fromEntries(Object.entries(sectorMeans).map(([sector, values]) => [sector, mean(values)]));

  const ranked = scored
    .map((row) => {
      const sectorAdjustment = spec.neutralizeSector ? sectorMeanScores[row.sector] || 0 : 0;
      const score = row.rawScore - sectorAdjustment;
      return {
        ticker: row.ticker,
        name: row.name,
        sector: row.sector,
        region: row.region,
        score,
        rawScore: row.rawScore,
        sectorAdjustment,
        momentumZ: row.factorScores.momentum,
        qualityZ: row.factorScores.quality,
        valueZ: row.factorScores.value,
        lowVolZ: row.factorScores.lowVol,
        liquidity: row.liquidity,
        resvol: row.resvol,
        priceDate: row.priceDate,
        fundamentalsDate: row.fundamentalsDate,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, spec.topK)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    ok: true,
    accepted: true,
    spec,
    pipeline,
    refusal: null,
    candidates: ranked,
    audit: [
      `Screen date ${spec.asof}.`,
      `${eligible.length} of ${SAMPLE_UNIVERSE.length} names passed point-in-time filters.`,
      spec.neutralizeSector ? "Sector means were removed before ranking." : "Raw composite scores were ranked.",
      `${ranked.length} candidates returned.`,
    ],
    summary: {
      eligible: eligible.length,
      returned: ranked.length,
      coverage: eligible.length / SAMPLE_UNIVERSE.length,
      topScore: ranked[0]?.score ?? null,
    },
  };
}

export const factorLabSampleUniverse = SAMPLE_UNIVERSE;
export const factorLabDefaultWeights = DEFAULT_WEIGHTS;
