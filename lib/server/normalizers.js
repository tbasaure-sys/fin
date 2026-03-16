import {
  FALLBACK_ALERTS,
  FALLBACK_MARKET_RIBBON,
  FALLBACK_SCENARIOS,
  FALLBACK_THEMES,
} from "./demo-data.js";
import { SHARED_ALPHA_PROFILE } from "./shared-alpha-data.js";

const MODULE_META = [
  ["portfolio", "Your Portfolio", "Portfolio"],
  ["actions", "Next Best Moves", "Actions"],
  ["command", "Capital Protocol", "Protocol"],
  ["scanner", "Stock Ideas", "Ideas"],
  ["risk", "Risk Check", "Risk"],
  ["spectral", "Diversification Map", "Balance"],
  ["themes", "Areas to Watch", "Themes"],
  ["international", "Beyond the US", "Global"],
  ["audit", "Decision Log", "Log"],
];

const PANEL_ALIAS = {
  actions: "risk",
  command: "risk",
  portfolio: "portfolio",
  scanner: "screener",
  risk: "risk",
  spectral: "risk",
  themes: "sectors",
  international: "international",
  audit: "statement_intelligence",
};

const COUNTRY_CURRENCY_MAP = {
  brazil: "BRL",
  china: "CNY",
  taiwan: "TWD",
  netherlands: "EUR",
  germany: "EUR",
  france: "EUR",
  "united kingdom": "GBP",
  uk: "GBP",
  japan: "JPY",
  india: "INR",
  canada: "CAD",
  australia: "AUD",
  mexico: "MXN",
  switzerland: "CHF",
  "south korea": "KRW",
};

function numberOr(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ratioOrPercent(value, fallback = null) {
  if (typeof value === "string" && value.trim().endsWith("%")) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed / 100 : fallback;
  }
  return numberOr(value, fallback);
}

function fmtPct(value) {
  const parsed = numberOr(value, null);
  return parsed === null ? "-" : `${(parsed * 100).toFixed(1)}%`;
}

function humanizeEngineLabel(value) {
  if (!value) return "";
  if (typeof value !== "string") return String(value);
  if (value === "beta_040") return "Keep risk moderate";
  if (value === "beta_020") return "Stay defensive";
  if (value === "beta_060") return "Lean more into risk";
  if (value.includes(" ")) return value;

  return value
    .replace(/_/g, " ")
    .replace(/\b\d+\b/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function describeRiskPosture(betaValue, fallback) {
  const beta = numberOr(betaValue, null);
  if (beta === null) return fallback;
  if (beta <= 0.2) return "Stay defensive";
  if (beta <= 0.4) return "Take moderate risk";
  if (beta <= 0.6) return "Lean into opportunities";
  return "Take higher risk";
}

function describeConfidence(value, fallback) {
  const numeric = numberOr(value, null);
  if (numeric === null) return fallback;
  if (numeric >= 0.75) return "High";
  if (numeric >= 0.5) return "Medium";
  return "Low";
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function formatUpdatedAt(value) {
  if (!value) return "Awaiting refresh";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatSignedPct(value) {
  const parsed = numberOr(value, null);
  if (parsed === null) return "-";
  const sign = parsed > 0 ? "+" : "";
  return `${sign}${(parsed * 100).toFixed(1)}%`;
}

function formatEdgeScore(value) {
  const parsed = numberOr(value, null);
  return parsed === null ? "-" : parsed.toFixed(2);
}

function edgeId(lane, label) {
  return `${lane}-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function buildMarketBrief(marketRibbon, sharedAlpha) {
  const ordered = [...marketRibbon].sort((left, right) => Number(right.changePct || 0) - Number(left.changePct || 0));
  const leader = ordered[0];
  const laggard = ordered[ordered.length - 1];
  const positiveCount = marketRibbon.filter((item) => Number(item.changePct || 0) >= 0).length;
  const bias = positiveCount >= 4 ? "Positive" : positiveCount <= 2 ? "Defensive" : "Mixed";

  return {
    bias,
    leader: leader ? `${leader.symbol} ${fmtPct(leader.changePct)}` : "Awaiting quotes",
    laggard: laggard ? `${laggard.symbol} ${fmtPct(laggard.changePct)}` : "Awaiting quotes",
    headline:
      bias === "Positive"
        ? "Tape is leaning constructive, but the shared alpha still prefers selective adds over broad chasing."
        : bias === "Defensive"
          ? "Tape is defensive enough to keep ballast relevant and punish lazy beta."
          : sharedAlpha.pulse,
  };
}

function buildEdgeRows(rows, options = {}) {
  const {
    lane = "edge",
    labelKey = "label",
    tickerKey = "ticker",
    scoreKeys = ["score", "opportunity_score", "discovery_score", "composite_score"],
    noteBuilder,
    detailBuilder,
  } = options;
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const score = scoreKeys
        .map((key) => numberOr(row?.[key], null))
        .find((value) => value !== null);
      const label = row?.[labelKey] || row?.sector || row?.market || row?.ticker || row?.proxy_ticker;
      const ticker = row?.[tickerKey] || row?.ticker || null;
      if (!label || score === null) return null;
      const details = detailBuilder ? detailBuilder(row, score) : {};
      return {
        id: edgeId(lane, label),
        lane,
        label,
        ticker,
        score,
        note: noteBuilder ? noteBuilder(row) : null,
        ...details,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((row) => ({
      ...row,
      scoreLabel: formatEdgeScore(row.score),
    }));
}

function buildCurrencyEdges(countryEdges, snapshot, sharedAlpha) {
  const fallback = sharedAlpha.edgeBoard?.currencies || [];
  const macro = snapshot?.risk?.macro || {};
  const dollarMomentum = numberOr(macro.dollar_return_3m, null);
  const goldRatio = numberOr(macro.gold_commodity_ratio, null);

  const derived = countryEdges
    .map((row) => {
      const code = COUNTRY_CURRENCY_MAP[String(row.label).toLowerCase()];
      if (!code) return null;
      const noteParts = [];
      if (dollarMomentum !== null) {
        noteParts.push(dollarMomentum > 0 ? "USD is still firm" : "USD pressure is easing");
      }
      if (goldRatio !== null && goldRatio > 1) {
        noteParts.push("real assets are still helping");
      }
      return {
        id: edgeId("currencies", code),
        lane: "currencies",
        label: code,
        score: clamp01(row.score * 0.88 + (dollarMomentum !== null ? Math.max(-dollarMomentum, 0) * 0.2 : 0)),
        note: noteParts.length ? `${row.label} edge with ${noteParts.join(", ")}.` : `${row.label} opportunity is strong enough to matter in FX too.`,
        expression: row.label,
        support: [
          `Inherited from ${row.label} country strength`,
          dollarMomentum !== null ? `Dollar 3m move: ${fmtPct(dollarMomentum)}` : "Dollar trend still loading",
          goldRatio !== null ? `Gold/commodity ratio: ${formatEdgeScore(goldRatio)}` : "Real-asset ratio still loading",
        ],
      };
    })
    .filter(Boolean)
    .slice(0, 3)
    .map((row) => ({
      ...row,
      scoreLabel: formatEdgeScore(row.score),
    }));

  return derived.length
    ? derived
    : fallback.map((row) => ({
      id: edgeId("currencies", row.label),
      lane: "currencies",
      ...row,
      expression: row.expression || row.label,
      support: row.support || [row.note],
      scoreLabel: formatEdgeScore(row.score),
    }));
}

function buildEdgeBoard(snapshot, sharedAlpha) {
  const sectorRows = buildEdgeRows(snapshot?.sectors?.preferred || snapshot?.sectors?.records, {
    lane: "sectors",
    labelKey: "sector",
    scoreKeys: ["score", "opportunity_score", "defense_fit"],
    noteBuilder: (row) => row.view ? `Current view: ${humanizeBucket(row.view)}.` : "Strong cross-sectional fit right now.",
    detailBuilder: (row, score) => ({
      expression: row.proxy_ticker || row.sector,
      support: [
        `Edge score: ${formatEdgeScore(score)}`,
        row.view ? `Current view: ${humanizeBucket(row.view)}` : "Cross-sectional fit is constructive",
        row.proxy_ticker ? `Liquid proxy: ${row.proxy_ticker}` : "Use best-in-class names inside the group",
      ],
    }),
  });
  const countryRows = buildEdgeRows(snapshot?.international?.preferred || snapshot?.international?.records, {
    lane: "countries",
    labelKey: "label",
    scoreKeys: ["score", "opportunity_score"],
    noteBuilder: (row) => row.ticker ? `${row.ticker} is the cleanest liquid expression.` : "Country setup is improving.",
    detailBuilder: (row, score) => ({
      expression: row.ticker || row.label,
      support: [
        `Edge score: ${formatEdgeScore(score)}`,
        row.ticker ? `Main liquid expression: ${row.ticker}` : "Broader country setup still improving",
        numberOr(row.momentum, numberOr(row.mom_60d, null)) !== null
          ? `Momentum: ${fmtPct(numberOr(row.momentum, numberOr(row.mom_60d, null)))}`
          : "Momentum still loading",
      ],
    }),
  });
  const stockSource = filterScannerIdeas(snapshot?.screener?.rows || [], getHoldingTickerSet(snapshot, sharedAlpha));
  const stockRows = buildEdgeRows(stockSource, {
    lane: "stocks",
    labelKey: "ticker",
    scoreKeys: ["discovery_score", "composite_score"],
    noteBuilder: (row) => {
      const parts = [];
      const momentum = numberOr(row.momentum_6m, null);
      const gap = numberOr(row.valuation_gap, null);
      if (momentum !== null) parts.push(`momentum ${fmtPct(momentum)}`);
      if (gap !== null) parts.push(`value gap ${fmtPct(gap)}`);
      return parts.length ? `Confirmed by ${parts.join(" and ")}.` : "Research stack still ranks it near the top.";
    },
    detailBuilder: (row, score) => ({
      expression: row.ticker,
      support: [
        `Discovery score: ${formatEdgeScore(score)}`,
        numberOr(row.momentum_6m, null) !== null ? `Momentum: ${fmtPct(row.momentum_6m)}` : "Momentum still loading",
        numberOr(row.valuation_gap, null) !== null ? `Value gap: ${fmtPct(row.valuation_gap)}` : "Valuation gap still loading",
        row.thesis_bucket ? `Type: ${humanizeBucket(row.thesis_bucket)}` : "Research bucket still loading",
      ],
    }),
  });

  const sectors = sectorRows.length
    ? sectorRows
    : (sharedAlpha.edgeBoard?.sectors || []).map((row) => ({
      id: edgeId("sectors", row.label),
      lane: "sectors",
      ...row,
      expression: row.expression || row.label,
      support: row.support || [row.note],
      scoreLabel: formatEdgeScore(row.score),
    }));
  const countries = countryRows.length
    ? countryRows
    : (sharedAlpha.edgeBoard?.countries || []).map((row) => ({
      id: edgeId("countries", row.label),
      lane: "countries",
      ...row,
      expression: row.expression || row.ticker || row.label,
      support: row.support || [row.note],
      scoreLabel: formatEdgeScore(row.score),
    }));
  const stocks = stockRows.length
    ? stockRows
    : (sharedAlpha.edgeBoard?.stocks || []).map((row) => ({
      id: edgeId("stocks", row.label),
      lane: "stocks",
      ...row,
      expression: row.expression || row.label,
      support: row.support || [row.note],
      scoreLabel: formatEdgeScore(row.score),
    }));
  const currencies = buildCurrencyEdges(countries, snapshot, sharedAlpha);

  const topSector = sectors[0]?.label || "sector edge";
  const topCountry = countries[0]?.label || "country edge";
  const topStock = stocks[0]?.label || "stock edge";

  return {
    headline:
      `${topSector} leads the sector tape, ${topCountry} is the clearest country expression, and ${topStock} is the sharpest stock-level edge right now.`,
    sectors,
    countries,
    currencies,
    stocks,
    drilldowns: [...sectors, ...countries, ...currencies, ...stocks],
  };
}

function describeDecisionRights(trustScore, autonomyScore) {
  if (trustScore >= 0.78 && autonomyScore >= 0.7) return "Sleeve automation allowed";
  if (trustScore >= 0.62 && autonomyScore >= 0.55) return "Stage position";
  if (trustScore >= 0.48 && autonomyScore >= 0.4) return "Guardrail required";
  if (trustScore >= 0.34) return "Suggest only";
  return "Explain only";
}

function describeTrustState(trustScore) {
  if (trustScore >= 0.75) return "Act";
  if (trustScore >= 0.55) return "Stage";
  if (trustScore >= 0.35) return "Observe";
  return "Protect";
}

function describeRecoverability(frontierDistance) {
  if (frontierDistance >= 0.05) return "Healthy";
  if (frontierDistance >= -0.02) return "Narrow";
  return "Tight";
}

function normalizeMetricEntries(rawValue) {
  if (!rawValue) return [];
  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => ({
      id: item.id || item.key || item.label?.toLowerCase().replace(/\s+/g, "_"),
      label: item.label || humanizeBucket(item.id || item.key || "metric"),
      value: item.value || fmtPct(numberOr(item.numeric, item.score)),
      numeric: clamp01(numberOr(item.numeric, numberOr(item.score, 0))),
    }));
  }

  return Object.entries(rawValue).map(([id, value]) => ({
    id,
    label: humanizeBucket(id),
    value: fmtPct(value),
    numeric: clamp01(numberOr(value, 0)),
  }));
}

function pickShadowSleeve(snapshot) {
  const ideas = Array.isArray(snapshot?.screener?.rows) ? snapshot.screener.rows : [];
  const sectors = new Set(
    ideas
      .filter((row) => !row.is_current_holding)
      .slice(0, 6)
      .map((row) => row.sector)
      .filter(Boolean),
  );
  const sleeves = [];

  if (!sectors.has("Utilities") && !sectors.has("Consumer Staples")) {
    sleeves.push("Defensive dividend quality");
  }
  if (!sectors.has("Financials")) {
    sleeves.push("Broadening basket");
  }
  sleeves.push("Rate-sensitive cash generators");
  return sleeves.slice(0, 3);
}

function humanizeBucket(value) {
  if (!value) return "Idea";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPositionSize(value, fallback = "Starter size only") {
  const numeric = numberOr(value, null);
  if (numeric === null || numeric <= 0) return fallback;
  return `Up to ${(numeric * 100).toFixed(1)}% of portfolio`;
}

function normalizeTrendSeries(rows, key) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      date: row.date,
      value: numberOr(row[key], null),
    }))
    .filter((row) => row.value !== null);
}

function buildPortfolioTrend(rows) {
  const portfolio = normalizeTrendSeries(rows, "portfolio_growth");
  const benchmark = normalizeTrendSeries(rows, "spy_growth");
  if (!portfolio.length && !benchmark.length) return [];

  const joined = [];
  const maxLength = Math.max(portfolio.length, benchmark.length);
  for (let index = 0; index < maxLength; index += 1) {
    joined.push({
      date: portfolio[index]?.date || benchmark[index]?.date || String(index),
      portfolio: portfolio[index]?.value ?? null,
      benchmark: benchmark[index]?.value ?? null,
    });
  }
  return joined.slice(-90);
}

function buildFallbackPortfolioTrend(sharedAlpha) {
  const ribbon = Array.isArray(sharedAlpha?.marketRibbon) ? sharedAlpha.marketRibbon : [];
  if (!ribbon.length) return [];

  const averageChange = ribbon.reduce((sum, row) => sum + numberOr(row.changePct, 0), 0) / ribbon.length;
  const focusTilt = ribbon
    .filter((row) => row.status === "focus")
    .reduce((sum, row, index, rows) => sum + (numberOr(row.changePct, 0) / Math.max(rows.length, 1)), 0);
  const baseReturn = numberOr(sharedAlpha?.analytics?.annualReturn, 0.08) / 252;
  const series = [];
  let portfolio = 1;
  let benchmark = 1;

  for (let index = 0; index < 24; index += 1) {
    const benchmarkDrift = baseReturn * 0.7 + averageChange * 0.55 + Math.cos((index + 2) / 4.2) * 0.0024;
    const portfolioDrift = baseReturn + averageChange * 0.35 + focusTilt * 0.45 + Math.sin((index + 1) / 3.1) * 0.0031;
    portfolio *= 1 + portfolioDrift;
    benchmark *= 1 + benchmarkDrift;
    series.push({
      date: `D-${24 - index}`,
      portfolio: Number(portfolio.toFixed(4)),
      benchmark: Number(benchmark.toFixed(4)),
    });
  }

  return series;
}

function buildValuationDistribution(histogram) {
  const rows = Array.isArray(histogram) ? histogram : [];
  const maxCount = Math.max(...rows.map((row) => numberOr(row.count, 0)), 0);
  if (!rows.length || !maxCount) return [];
  return rows.map((row, index) => {
    const x0 = numberOr(row.x0, 0);
    const x1 = numberOr(row.x1, 0);
    const midpoint = (x0 + x1) / 2;
    const count = numberOr(row.count, 0);
    return {
      id: `valuation-${index}`,
      label: fmtPct(midpoint),
      count,
      ratio: count / maxCount,
      valueLabel: `${count} names`,
    };
  });
}

function buildSectorExposure(rows) {
  const sectors = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      label: row.sector || "Other",
      value: numberOr(row.portfolio_weight, numberOr(row.weight, null)),
    }))
    .filter((row) => row.value !== null)
    .slice(0, 5);
  const maxValue = Math.max(...sectors.map((row) => row.value), 0);
  return sectors.map((row) => ({
    ...row,
    ratio: maxValue ? row.value / maxValue : 0,
    valueLabel: fmtPct(row.value),
  }));
}

function buildFallbackSectorExposure(rows) {
  const sectorMap = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const label = row?.sector || "Other";
    const value = numberOr(row?.weight, null);
    if (value === null) continue;
    sectorMap.set(label, (sectorMap.get(label) || 0) + value);
  }

  const sectors = [...sectorMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);
  const maxValue = Math.max(...sectors.map((row) => row.value), 0);

  return sectors.map((row) => ({
    ...row,
    ratio: maxValue ? row.value / maxValue : 0,
    valueLabel: fmtPct(row.value),
  }));
}

function buildFallbackValuationDistribution(rows) {
  const values = (Array.isArray(rows) ? rows : [])
    .map((row) => numberOr(row?.valuation_gap, numberOr(row?.valuationGap, numberOr(row?.upside, null))))
    .filter((value) => value !== null);
  if (!values.length) return [];

  const bucketCount = Math.min(Math.max(values.length, 3), 6);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / bucketCount || 0.2;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    x0: min + (index * width),
    x1: min + ((index + 1) * width),
    count: 0,
  }));

  for (const value of values) {
    const rawIndex = Math.floor((value - min) / width);
    const index = Math.max(0, Math.min(bucketCount - 1, Number.isFinite(rawIndex) ? rawIndex : 0));
    buckets[index].count += 1;
  }

  return buildValuationDistribution(buckets);
}

function getPortfolioHoldings(snapshot) {
  const detailed = Array.isArray(snapshot?.portfolio?.holdings) ? snapshot.portfolio.holdings : [];
  if (detailed.length) return detailed;
  return Array.isArray(snapshot?.portfolio?.top_holdings) ? snapshot.portfolio.top_holdings : [];
}

function getSimulationRows(snapshot) {
  return Array.isArray(snapshot?.portfolio?.simulation_rank) ? snapshot.portfolio.simulation_rank : [];
}

function describeRiskBudget(snapshot) {
  const betaTarget = numberOr(snapshot?.overview?.beta_target, numberOr(snapshot?.portfolio?.alignment?.beta_target, null));
  const currentBeta = numberOr(snapshot?.portfolio?.alignment?.portfolio_beta, numberOr(snapshot?.portfolio?.analytics?.Beta, null));
  if (betaTarget === null || currentBeta === null) return "Risk budget is being inferred from the broader market posture.";
  if (currentBeta <= betaTarget) return "Portfolio risk is still inside the current comfort zone.";
  if (currentBeta <= betaTarget + 0.15) return "Portfolio risk is slightly elevated, so adds should stay disciplined.";
  return "Portfolio risk is above the current comfort zone, so trims and defense matter more.";
}

function pickFundingSource(snapshot, excludedTickers = []) {
  const holdings = getPortfolioHoldings(snapshot)
    .filter((row) => !excludedTickers.includes(row.ticker))
    .sort((left, right) => numberOr(right.weight, 0) - numberOr(left.weight, 0));
  const defensive = holdings.find((row) => row.ticker === "SGOV" || row.ticker === "SHY" || row.sector === "ETF");
  const selectedHedge = snapshot?.overview?.selected_hedge;
  if (selectedHedge && !excludedTickers.includes(selectedHedge)) return selectedHedge;
  if (defensive?.ticker) return defensive.ticker;
  return holdings[0]?.ticker || "cash sleeve";
}

function findSimulationMatch(rows, ticker) {
  return rows.find((row) => row.ticker === ticker) || null;
}

function getLiveAddCandidate(snapshot) {
  const rows = Array.isArray(snapshot?.screener?.rows) ? snapshot.screener.rows : [];
  const simulations = getSimulationRows(snapshot);
  const candidates = rows
    .filter((row) => !row.is_current_holding)
    .map((row) => ({ ...row, simulation: findSimulationMatch(simulations, row.ticker) }))
    .sort((left, right) => {
      const rightRank = numberOr(right.simulation?.suggested_position, numberOr(right.suggested_position, 0))
        + numberOr(right.discovery_score, numberOr(right.composite_score, 0));
      const leftRank = numberOr(left.simulation?.suggested_position, numberOr(left.suggested_position, 0))
        + numberOr(left.discovery_score, numberOr(left.composite_score, 0));
      return rightRank - leftRank;
    });
  return candidates[0] || null;
}

function getLiveTrimCandidate(snapshot) {
  const rows = Array.isArray(snapshot?.screener?.rows) ? snapshot.screener.rows : [];
  const simulations = getSimulationRows(snapshot);
  const heldCandidates = rows
    .filter((row) => row.is_current_holding)
    .map((row) => ({ ...row, simulation: findSimulationMatch(simulations, row.ticker) }))
    .sort((left, right) =>
      (numberOr(right.simulation?.prob_loss, 0) + Math.abs(numberOr(right.valuation_gap, 0)))
      - (numberOr(left.simulation?.prob_loss, 0) + Math.abs(numberOr(left.valuation_gap, 0))));
  if (heldCandidates.length) return heldCandidates[0];

  const holdings = getPortfolioHoldings(snapshot);
  return holdings
    .filter((row) => numberOr(row.upside, null) !== null)
    .sort((left, right) => numberOr(left.upside, 0) - numberOr(right.upside, 0))[0] || null;
}

function getLiveHoldCandidate(snapshot) {
  const selectedHedge = snapshot?.overview?.selected_hedge;
  const holdings = getPortfolioHoldings(snapshot);
  if (selectedHedge) {
    const matching = holdings.find((row) => row.ticker === selectedHedge);
    if (matching) return { ...matching, ticker: selectedHedge };
    return { ticker: selectedHedge, thesis_bucket: "defense" };
  }
  return holdings.find((row) => row.sector === "ETF") || holdings[0] || null;
}

function buildLiveActionItems(snapshot, sharedAlpha) {
  const addCandidate = getLiveAddCandidate(snapshot);
  const trimCandidate = getLiveTrimCandidate(snapshot);
  const holdCandidate = getLiveHoldCandidate(snapshot);
  const fallback = sharedAlpha.guide.actions;
  const liveActions = [];
  const seen = new Set();
  const riskBudget = describeRiskBudget(snapshot);

  if (addCandidate) {
    seen.add(addCandidate.ticker);
    const fundingTicker = pickFundingSource(snapshot, [addCandidate.ticker]);
    liveActions.push({
      id: `add-${addCandidate.ticker}`,
      type: "add",
      ticker: addCandidate.ticker,
      company: addCandidate.ticker,
      size: formatPositionSize(numberOr(addCandidate.simulation?.suggested_position, addCandidate.suggested_position)),
      funding: `Fund gradually from ${fundingTicker}`,
      conviction: `${humanizeBucket(addCandidate.thesis_bucket)} with one of the strongest live discovery scores in the stack.`,
      whyNow: `${addCandidate.ticker} is ranking near the top of the live screener with momentum ${fmtPct(addCandidate.momentum_6m)} and discovery ${formatNumberLike(numberOr(addCandidate.discovery_score, addCandidate.composite_score))}. ${riskBudget}`,
      watchFor: numberOr(addCandidate.valuation_gap, null) !== null
        ? `Stay patient if the price remains ${fmtPct(addCandidate.valuation_gap)} away from fair value.`
        : "Keep it as a staged entry until more valuation context comes in.",
      role: humanizeBucket(addCandidate.thesis_bucket),
      invalidation: "Back away if stronger ideas stop confirming it or the tape turns defensive.",
      sourceLabel: "Live research",
    });
  }

  if (trimCandidate) {
    if (seen.has(trimCandidate.ticker)) return fallback.map((action) => ({ ...action, sourceLabel: "Shared alpha" }));
    seen.add(trimCandidate.ticker);
    liveActions.push({
      id: `trim-${trimCandidate.ticker}`,
      type: "trim",
      ticker: trimCandidate.ticker,
      company: trimCandidate.ticker,
      size: "Trim 1.0% and reassess",
      funding: "Recycle into stronger setups",
      conviction: `${trimCandidate.ticker} looks less attractive than the best live adds right now.`,
      whyNow: numberOr(trimCandidate.valuation_gap, null) !== null
        ? `${trimCandidate.ticker} shows a live value gap of ${fmtPct(trimCandidate.valuation_gap)}, which makes it harder to justify as a larger weight.`
        : `${trimCandidate.ticker} already carries meaningful portfolio weight and deserves tighter risk discipline.`,
      watchFor: numberOr(trimCandidate.simulation?.prob_loss, null) !== null
        ? `The simulation layer shows ${formatNumberLike(trimCandidate.simulation.prob_loss)} probability of loss, so this name needs stricter sizing discipline.`
        : "Trim faster if the tape turns defensive or stronger ideas keep outranking it.",
      role: humanizeBucket(trimCandidate.thesis_bucket || trimCandidate.sector),
      invalidation: "Only stop trimming if the live opportunity set weakens and this name improves on both value and momentum.",
      sourceLabel: "Live research",
    });
  }

  if (holdCandidate) {
    if (seen.has(holdCandidate.ticker)) return fallback.map((action) => ({ ...action, sourceLabel: "Shared alpha" }));
    liveActions.push({
      id: `hold-${holdCandidate.ticker}`,
      type: "hold",
      ticker: holdCandidate.ticker,
      company: holdCandidate.ticker,
      size: "Keep current size",
      funding: "No change",
      conviction: `${holdCandidate.ticker} is still part of the portfolio's protection layer while the rest of the book stays selective.`,
      whyNow: `The current setup still rewards keeping some dry powder and stability in the book instead of forcing every dollar into aggressive ideas. ${riskBudget}`,
      watchFor: "Revisit only if protection stops helping during weak markets.",
      role: humanizeBucket(holdCandidate.thesis_bucket || holdCandidate.sector || "Defense"),
      invalidation: "Reduce this sleeve only if the market backdrop improves enough that protection becomes a drag instead of a cushion.",
      sourceLabel: "Live research",
    });
  }

  if (liveActions.length === 3) return liveActions;

  return fallback.map((action) => ({
    ...action,
    invalidation: action.watchFor,
    sourceLabel: "Shared alpha",
  }));
}

function chooseSharedAlpha(sharedAlpha) {
  return sharedAlpha || SHARED_ALPHA_PROFILE;
}

function buildMarketRibbon(snapshot, sharedAlpha) {
  const quotes = snapshot?.portfolio?.quotes || [];
  if (quotes.length) {
    return quotes.slice(0, 6).map((quote) => ({
      symbol: quote.ticker,
      label: quote.ticker,
      price: numberOr(quote.price, null),
      changePct: numberOr(quote.return_1d, 0),
      status: quote.source === "fmp_or_fallback" ? "live" : "cache",
    }));
  }
  return sharedAlpha.marketRibbon || FALLBACK_MARKET_RIBBON;
}

function buildAlerts(snapshot, sharedAlpha) {
  const warnings = snapshot?.status?.warnings || [];
  const panels = snapshot?.status?.panels || [];
  const alerts = [];

  warnings.forEach((warning, index) => {
    alerts.push({
      id: `warning-${index}`,
      severity: "medium",
      title: "Desk note: pipeline needs attention",
      body: warning,
      action: "Inspect terminal health",
      source: "backend",
    });
  });

  panels
    .filter((panel) => panel.status === "stale" || panel.status === "aging")
    .forEach((panel) => {
      alerts.push({
        id: `panel-${panel.name}`,
        severity: panel.status === "stale" ? "high" : "medium",
        title: `Desk note: ${panel.name} is ${panel.status}`,
        body: panel.stale_days === null
          ? "This module needs a fresh snapshot."
          : `Latest artifact is ${panel.stale_days} day(s) old.`,
        action: "Push a fresh snapshot",
        source: "status",
      });
    });

  const crashProb = numberOr(snapshot?.overview?.crash_prob, null);
  if (crashProb !== null && crashProb >= 0.65) {
    alerts.unshift({
      id: "tail-risk",
      severity: "high",
      title: "Risk desk: crash probability is elevated",
      body: `Current crash probability is ${fmtPct(crashProb)} and the terminal is leaning defensive.`,
      action: "Cut gross beta",
      source: "policy",
    });
  }

  return alerts.length ? alerts : sharedAlpha.alerts || FALLBACK_ALERTS;
}

function buildActionsModule(snapshot, sharedAlpha) {
  const liveAction = snapshot?.overview?.recommended_action;
  const actions = buildLiveActionItems(snapshot, sharedAlpha).map((action, index) => ({
    ...action,
    priority: index + 1,
    plainLabel:
      action.type === "add" ? "Add slowly" : action.type === "trim" ? "Trim if needed" : "Keep in place",
  }));

  return {
    id: "actions",
    kicker: "Actions",
    title: sharedAlpha.guide.title,
    subtitle: liveAction
      ? `Current engine stance: ${humanizeEngineLabel(liveAction)}. These are the clearest next moves for a retail user.`
      : sharedAlpha.guide.subtitle,
    actions,
  };
}

function buildProtocolModule(snapshot, sharedAlpha) {
  const liveProtocol = snapshot?.protocol;
  if (liveProtocol?.protocol || liveProtocol?.protocol_label || liveProtocol?.protocolLabel) {
    return buildBackendProtocolModule(snapshot, sharedAlpha);
  }

  const fallback = sharedAlpha.protocol;
  const playbook = buildPlaybookModule(snapshot, sharedAlpha);
  const confidence = numberOr(snapshot?.overview?.confidence, fallback.trustScore);
  const freshness = snapshot?.status?.warnings?.length ? 0.72 : 0.92;
  const driftPenalty = (snapshot?.status?.panels || []).some((panel) => panel.status === "stale") ? 0.2 : 0.08;
  const trustScore = clamp01(confidence * freshness * (1 - driftPenalty));
  const crashProb = numberOr(snapshot?.overview?.crash_prob, 0.35);
  const tailRisk = numberOr(snapshot?.overview?.tail_risk_score, 0.35);
  const compression = numberOr(snapshot?.risk?.spectral?.latest?.compression_score, 0.45);
  const betaTarget = numberOr(snapshot?.overview?.beta_target, numberOr(snapshot?.portfolio?.alignment?.beta_target, null));
  const currentBeta = numberOr(snapshot?.portfolio?.alignment?.portfolio_beta, numberOr(snapshot?.portfolio?.analytics?.Beta, null));
  const betaPenalty = betaTarget !== null && currentBeta !== null ? Math.max(currentBeta - betaTarget, 0) : 0.08;
  const hedgeWeight = numberOr(snapshot?.portfolio?.alignment?.selected_hedge_weight, 0.06);
  const mismatchCount = Array.isArray(snapshot?.portfolio?.alignment?.mismatched_sectors)
    ? snapshot.portfolio.alignment.mismatched_sectors.length
    : 1;
  const autonomyScore = clamp01(
    0.68
      + hedgeWeight * 0.9
      - crashProb * 0.28
      - tailRisk * 0.18
      - compression * 0.16
      - mismatchCount * 0.04
      - betaPenalty * 0.35,
  );
  const reserveTarget = 0.52 + crashProb * 0.18 + mismatchCount * 0.03;
  const frontierDistance = autonomyScore - reserveTarget;
  const trustState = describeTrustState(trustScore);
  const decisionRights = describeDecisionRights(trustScore, autonomyScore);
  const recoverabilityBudget = describeRecoverability(frontierDistance);
  const supportDependency = {
    passive_flows: clamp01(compression * 0.55 + crashProb * 0.12),
    valuation_tolerance: clamp01(Math.abs(numberOr(getLiveTrimCandidate(snapshot)?.valuation_gap, 0.18))),
    cheap_refinancing: clamp01(0.12 + betaPenalty * 0.6 + tailRisk * 0.12),
    narrative_breadth: clamp01(0.15 + mismatchCount * 0.07),
  };
  const protectiveValue = {
    cash: clamp01(numberOr(snapshot?.portfolio?.alignment?.selected_hedge_weight, hedgeWeight)),
    duration: clamp01(numberOr(snapshot?.portfolio?.alignment?.selected_hedge_weight, hedgeWeight) + 0.04),
    convexity: clamp01(numberOr(snapshot?.hedges?.ranking?.[0]?.score, fallback.protectiveValue.convexity)),
    quality: clamp01(0.08 + (numberOr(snapshot?.overview?.confidence, 0.5) * 0.08)),
  };
  const protocol =
    trustState === "Protect" ? "protect_and_rebuild"
      : frontierDistance < -0.05 ? "wean_and_rebuild"
        : trustState === "Stage" ? "challenge_and_stage"
          : "preserve_and_compound";
  const protocolLabel = protocol
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const stepDownTrials = [
    {
      name: "Flow withdrawal",
      shock: "Reduce passive support by 20%",
      autonomyScore: clamp01(autonomyScore - supportDependency.passive_flows * 0.22),
    },
    {
      name: "Valuation compression",
      shock: "Compress valuation tolerance by 1 standard deviation",
      autonomyScore: clamp01(autonomyScore - supportDependency.valuation_tolerance * 0.26),
    },
    {
      name: "Breadth collapse",
      shock: "Narrow idea breadth across the book",
      autonomyScore: clamp01(autonomyScore - supportDependency.narrative_breadth * 0.21),
    },
  ].map((trial) => ({
    ...trial,
    verdict:
      trial.autonomyScore >= 0.55 ? "Still recoverable"
        : trial.autonomyScore >= 0.4 ? "Needs staged response"
          : "Protection first",
  }));

  return {
    id: "command",
    kicker: "Protocol",
    title: "Capital Protocol",
    protocol,
    protocolLabel,
    trustScore: fmtPct(trustScore),
    trustState,
    decisionRights,
    autonomyScore: fmtPct(autonomyScore),
    frontierDistance: formatSignedPct(frontierDistance),
    recoverabilityBudget,
    supportDependency: Object.entries(supportDependency).map(([id, value]) => ({
      id,
      label: humanizeBucket(id),
      value: fmtPct(value),
      numeric: value,
    })),
    protectiveValue: Object.entries(protectiveValue).map(([id, value]) => ({
      id,
      label: humanizeBucket(id),
      value: fmtPct(value),
      numeric: value,
    })),
    stepDownTrials,
    disproofSleeve: pickShadowSleeve(snapshot).length ? pickShadowSleeve(snapshot) : fallback.disproofSleeve,
    playbook,
    notes: [
      `Decision rights are currently ${decisionRights.toLowerCase()}.`,
      `Trust is in ${trustState.toLowerCase()} mode, so the system should ${trustState === "Act" ? "speak clearly" : trustState === "Stage" ? "add in stages" : trustState === "Observe" ? "watch more than add" : "protect capital first"}.`,
      `Recoverability budget is ${recoverabilityBudget.toLowerCase()}, with frontier distance ${formatSignedPct(frontierDistance)}.`,
    ],
  };
}

function buildBackendProtocolModule(snapshot, sharedAlpha) {
  const fallback = sharedAlpha.protocol;
  const protocol = snapshot?.protocol || {};
  const playbook = buildPlaybookModule(snapshot, sharedAlpha);
  const trustScore = numberOr(protocol.trust_score, numberOr(protocol.trustScore, fallback.trustScore));
  const autonomyScore = numberOr(protocol.autonomy_score, numberOr(protocol.autonomyScore, fallback.autonomyScore));
  const frontierDistance = numberOr(protocol.frontier_distance, numberOr(protocol.frontierDistance, fallback.frontierDistance));

  return {
    id: "command",
    kicker: "Protocol",
    title: "Capital Protocol",
    protocol: protocol.protocol || fallback.protocol,
    protocolLabel: protocol.protocol_label || protocol.protocolLabel || humanizeBucket(protocol.protocol || fallback.protocol),
    trustScore: fmtPct(trustScore),
    trustState: protocol.trust_state || protocol.trustState || describeTrustState(trustScore ?? fallback.trustScore),
    decisionRights:
      protocol.decision_rights
      || protocol.decisionRights
      || describeDecisionRights(trustScore ?? fallback.trustScore, autonomyScore ?? fallback.autonomyScore),
    autonomyScore: fmtPct(autonomyScore),
    frontierDistance: formatSignedPct(frontierDistance),
    recoverabilityBudget:
      protocol.recoverability_budget
      || protocol.recoverabilityBudget
      || describeRecoverability(frontierDistance ?? fallback.frontierDistance),
    supportDependency: normalizeMetricEntries(protocol.support_dependency || protocol.supportDependency),
    protectiveValue: normalizeMetricEntries(protocol.protective_value || protocol.protectiveValue),
    stepDownTrials: (protocol.step_down_trials || protocol.stepDownTrials || []).map((trial) => ({
      name: trial.name,
      shock: trial.shock,
      autonomyScore: fmtPct(numberOr(trial.autonomy_score, trial.autonomyScore)),
      verdict: trial.verdict,
    })),
    disproofSleeve: protocol.disproof_sleeve || protocol.disproofSleeve || fallback.disproofSleeve,
    playbook,
    notes: protocol.notes?.length ? protocol.notes : fallback.notes || [
      "Protocol is live, but still waiting for richer backend context.",
    ],
    gaps: protocol.gaps || null,
  };
}

function buildPlaybookModule(snapshot, sharedAlpha) {
  const overview = snapshot?.overview || {};
  const risk = snapshot?.risk || {};
  const portfolio = snapshot?.portfolio || {};
  const fallback = sharedAlpha.command;
  const summary = [
    ...(overview.why_this_action || []),
    ...(portfolio?.alignment?.notes || []),
  ].slice(0, 4);
  const flips = (overview.conditions_that_flip || []).slice(0, 3);

  return {
    id: "command",
    kicker: "Playbook",
    title: "Market Playbook",
    headline: overview.recommended_action ? humanizeEngineLabel(overview.recommended_action) : fallback.headline,
    betaTarget: describeRiskPosture(overview.beta_target, fallback.readout),
    confidence: describeConfidence(overview.confidence, fallback.confidence),
    hedge: overview.selected_hedge || fallback.hedge,
    regime: overview.regime || fallback.regime,
    structureState: overview.spectral_state || risk?.spectral?.latest?.structural_state || fallback.structureState,
    summary: summary.length ? summary : fallback.summary,
    flips: flips.length ? flips : fallback.flips,
    scenarios: (sharedAlpha.command?.scenarios || FALLBACK_SCENARIOS).map((scenario) => ({
      ...scenario,
      probability: numberOr(
        overview?.scenario_synthesis?.posterior?.[scenario.name.toLowerCase().replace(/ /g, "_")],
        scenario.probability,
      ),
    })),
  };
}

function buildPortfolioModule(snapshot, watchlistCount, sharedAlpha) {
  const portfolio = snapshot?.portfolio || {};
  const holdings = portfolio?.top_holdings || [];
  const alignment = portfolio?.alignment || {};
  const analytics = portfolio?.analytics || {};
  const fallbackAnalytics = sharedAlpha.analytics;
  const fallbackHoldings = sharedAlpha.portfolio.holdings;
  const fallbackNotes = sharedAlpha.portfolio.notes;
  const rows = holdings.length ? holdings : fallbackHoldings;
  const liveGrowthComparison = buildPortfolioTrend(portfolio.current_mix_vs_spy);
  const liveSectorExposure = buildSectorExposure(portfolio.sector_weights);
  const liveValuationDistribution = buildValuationDistribution(portfolio.valuation_histogram);
  const fallbackValuationRows = [...fallbackHoldings, ...(sharedAlpha.scannerRows || [])];

  return {
    id: "portfolio",
    kicker: "Portfolio",
    title: "Your Portfolio",
    holdings: rows.slice(0, 8).map((row) => ({
      ticker: row.ticker,
      sector: row.sector || "Unknown",
      weight: fmtPct(row.weight),
      upside: row.upside === null || row.upside === undefined ? "Briefing" : fmtPct(row.upside),
      composite: numberOr(row.composite_score, null),
      conviction: row.conviction || null,
    })),
    notes: alignment.notes?.length ? alignment.notes : fallbackNotes,
    shadowBalance: portfolio.shadowBalance || sharedAlpha.portfolio.shadowBalance,
    topSectors: (portfolio?.sector_weights || []).slice(0, 4),
    watchlistCount,
    analytics: {
      asOf: analytics["As of"] || fallbackAnalytics.asOf || snapshot?.generated_at,
      beta: fmtPct(numberOr(alignment.portfolio_beta, numberOr(analytics.Beta, null))),
      holdingsCount: analytics["Holdings Count"] || holdings.length || fallbackAnalytics.holdingsCount || 0,
      annualReturn: fmtPct(numberOr(analytics["Annual Return"], fallbackAnalytics.annualReturn)),
      annualVolatility: fmtPct(numberOr(analytics["Annual Volatility"], fallbackAnalytics.annualVolatility)),
      sharpeRatio: formatNumberLike(numberOr(analytics["Sharpe Ratio"], fallbackAnalytics.sharpeRatio)),
    },
    charts: {
      growthComparison: liveGrowthComparison.length ? liveGrowthComparison : buildFallbackPortfolioTrend(sharedAlpha),
      sectorExposure: liveSectorExposure.length ? liveSectorExposure : buildFallbackSectorExposure(rows),
      valuationDistribution: liveValuationDistribution.length ? liveValuationDistribution : buildFallbackValuationDistribution(fallbackValuationRows),
    },
    chartSource:
      liveGrowthComparison.length || liveSectorExposure.length || liveValuationDistribution.length
        ? "Live portfolio snapshot"
        : "Shared alpha fallback",
  };
}

function formatNumberLike(value, digits = 2) {
  const parsed = numberOr(value, null);
  return parsed === null ? "-" : parsed.toFixed(digits);
}

function isTrueLike(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return Boolean(value);
}

function getHoldingTickerSet(snapshot, sharedAlpha) {
  const snapshotHoldings = getPortfolioHoldings(snapshot);
  const sharedHoldings = sharedAlpha?.portfolio?.holdings || [];
  return new Set(
    [...snapshotHoldings, ...sharedHoldings]
      .map((row) => row?.ticker)
      .filter(Boolean),
  );
}

function filterScannerIdeas(rows, holdingTickers) {
  return rows.filter((row) => {
    if (!row?.ticker) return false;
    if (isTrueLike(row.is_current_holding)) return false;
    if (holdingTickers.has(row.ticker)) return false;

    const source = String(row.screen_origin || "").toLowerCase();
    const suggested = numberOr(row.suggested_position, null);
    const discovery = numberOr(row.discovery_score, numberOr(row.discovery, numberOr(row.composite_score, null)));

    if (source === "discovery" || source === "watchlist" || source === "shared_alpha") return true;
    if (suggested !== null && suggested > 0) return true;
    return discovery !== null && discovery > 0;
  });
}

function buildIdeaMap(rows) {
  return rows
    .map((row) => ({
      ticker: row.ticker,
      bucket: row.bucket || row.thesis_bucket || row.statement_bucket || "Watch",
      x: numberOr(row.valuation_gap, numberOr(row.valuationGap, null)),
      y: numberOr(row.momentum_6m, numberOr(row.momentum, null)),
      score: numberOr(row.discovery_score, numberOr(row.discovery, numberOr(row.composite_score, null))),
    }))
    .filter((row) => row.x !== null && row.y !== null && row.score !== null)
    .slice(0, 12)
    .map((row) => ({
      ...row,
      size: clamp01(row.score),
    }));
}

function buildFundamentalConfirmation(rows) {
  return rows.slice(0, 4).map((row) => ({
    ticker: row.ticker,
    signals: [
      {
        id: "quality",
        label: "Quality",
        value: clamp01(numberOr(row.quality_score, numberOr(row.discovery_score, numberOr(row.discovery, 0)) * 0.9)),
      },
      {
        id: "value",
        label: "Value",
        value: clamp01(numberOr(row.value_score, 0.5 + (Math.max(-numberOr(row.valuation_gap, numberOr(row.valuationGap, 0)), 0) * 0.35))),
      },
      {
        id: "growth",
        label: "Growth",
        value: clamp01(numberOr(row.growth_score, 0.45 + (Math.max(numberOr(row.momentum_6m, numberOr(row.momentum, 0)), 0) * 0.45))),
      },
      {
        id: "discipline",
        label: "Risk fit",
        value: clamp01(numberOr(row.risk_score, numberOr(row.discovery_score, numberOr(row.discovery, 0)) * 0.75)),
      },
    ],
  }));
}

function buildRiskSignalBars(snapshot) {
  const compression = numberOr(snapshot?.risk?.spectral?.latest?.compression_score, numberOr(snapshot?.overview?.compression_score, null));
  return [
    { id: "crash", label: "Crash", value: numberOr(snapshot?.overview?.crash_prob, null), tone: "bad" },
    { id: "tail", label: "Stress", value: numberOr(snapshot?.overview?.tail_risk_score, null), tone: "bad" },
    { id: "fragility", label: "Fragility", value: numberOr(snapshot?.overview?.legitimacy_risk, null), tone: "warn" },
    { id: "compression", label: "Crowding", value: compression, tone: "warn" },
    { id: "ceiling", label: "Risk ceiling", value: numberOr(snapshot?.overview?.structural_beta_ceiling, null), tone: "good" },
  ].filter((item) => item.value !== null).map((item) => ({
    ...item,
    valueLabel: fmtPct(item.value),
    ratio: clamp01(item.value),
  }));
}

function buildFallbackRiskSignalBars(sharedAlpha) {
  const analytics = sharedAlpha?.analytics || {};
  const spectral = sharedAlpha?.spectral || {};

  return [
    {
      id: "drawdown",
      label: "Drawdown",
      valueLabel: fmtPct(numberOr(analytics.maxDrawdown, null)),
      ratio: clamp01(Math.abs(numberOr(analytics.maxDrawdown, 0)) / 0.25),
      tone: "bad",
    },
    {
      id: "stress",
      label: "Stress day",
      valueLabel: fmtPct(numberOr(analytics.cvar95, null)),
      ratio: clamp01(Math.abs(numberOr(analytics.cvar95, 0)) / 0.05),
      tone: "bad",
    },
    {
      id: "crowding",
      label: "Crowding",
      valueLabel: spectral.compressionScore || "-",
      ratio: clamp01(ratioOrPercent(spectral.compressionScore, 0)),
      tone: "warn",
    },
    {
      id: "breadth",
      label: "Diversification room",
      valueLabel: spectral.freedomScore || "-",
      ratio: clamp01(ratioOrPercent(spectral.freedomScore, 0)),
      tone: "good",
    },
  ];
}

function buildScannerModule(snapshot, sharedAlpha) {
  const screener = snapshot?.screener || {};
  const rows = screener.rows || [];
  const fallbackRows = sharedAlpha.scannerRows || [];
  const holdingTickers = getHoldingTickerSet(snapshot, sharedAlpha);
  const liveIdeas = filterScannerIdeas(rows, holdingTickers);
  const fallbackIdeas = filterScannerIdeas(fallbackRows, holdingTickers);
  const visibleRows = (liveIdeas.length ? liveIdeas : fallbackIdeas).slice(0, 8);

  return {
    id: "scanner",
    kicker: "Ideas",
    title: "Stock Ideas",
    source: screener.source_file || "discovery_screener.csv",
    sourceLabel: liveIdeas.length ? `Live screener: ${screener.source_file || "discovery_screener.csv"}` : "Shared alpha discovery feed",
    rows: visibleRows.map((row) => ({
      ticker: row.ticker,
      sector: row.sector || "Unknown",
      bucket: row.bucket || row.thesis_bucket || row.statement_bucket || "Watch",
      discovery: numberOr(row.discovery, numberOr(row.discovery_score, numberOr(row.composite_score, null))),
      valuationGap: row.valuationGap !== undefined ? fmtPct(row.valuationGap) : fmtPct(row.valuation_gap),
      momentum: row.momentum !== undefined ? fmtPct(row.momentum) : fmtPct(row.momentum_6m),
    })),
    ideaMap: buildIdeaMap(visibleRows),
    confirmation: buildFundamentalConfirmation(visibleRows),
    insight:
      liveIdeas.length > 0
        ? "Cross-sectional discovery is live and now excludes names already sitting in the portfolio."
        : "Scanner is online with a curated shared alpha feed while fresh discovery artifacts are still promoting.",
  };
}

function buildRiskModule(snapshot, sharedAlpha) {
  const risk = snapshot?.risk || {};
  const fallback = sharedAlpha.risk;
  const liveMetrics = [
    { label: "Chance of sharp drop", value: fmtPct(snapshot?.overview?.crash_prob) },
    { label: "Stress risk", value: fmtPct(snapshot?.overview?.tail_risk_score) },
    { label: "Market fragility", value: fmtPct(snapshot?.overview?.legitimacy_risk) },
    { label: "Suggested risk ceiling", value: fmtPct(snapshot?.overview?.structural_beta_ceiling) },
  ];
  const hasLiveRisk = liveMetrics.some((metric) => metric.value !== "-");
  const narrative = [
    ...(risk?.explanation?.why_this_action || []),
    ...(risk?.forecast_baseline?.warnings || []),
  ].slice(0, 4);
  const liveSignalBars = buildRiskSignalBars(snapshot);

  return {
    id: "risk",
    kicker: "Risk",
    title: "Risk Check",
    metrics: hasLiveRisk ? liveMetrics : fallback.metrics,
    signalBars: liveSignalBars.length ? liveSignalBars : buildFallbackRiskSignalBars(sharedAlpha),
    narrative: narrative.length ? narrative : fallback.narrative,
    chartSource: liveSignalBars.length ? "Live structural inputs" : "Shared alpha risk fallback",
  };
}

function buildSpectralModule(snapshot, sharedAlpha) {
  const latest = snapshot?.risk?.spectral?.latest || {};
  const fallback = sharedAlpha.spectral;
  return {
    id: "spectral",
    kicker: "Balance",
    title: "Diversification Map",
    compressionScore: latest.compression_score !== undefined ? fmtPct(latest.compression_score) : fallback.compressionScore,
    freedomScore: latest.freedom_score !== undefined ? fmtPct(latest.freedom_score) : fallback.freedomScore,
    effectiveDimension: numberOr(latest.effective_dimension, fallback.effectiveDimension),
    eig1Share: latest.eig1_share !== undefined ? fmtPct(latest.eig1_share) : fallback.eig1Share,
    state: latest.structural_state || "transition",
    narrative: (latest.structural_narrative || []).slice(0, 3).length
      ? (latest.structural_narrative || []).slice(0, 3)
      : fallback.narrative,
  };
}

function buildThemesModule(snapshot, sharedAlpha) {
  const sectors = snapshot?.sectors || {};
  const preferred = sectors.preferred || sectors.records || [];
  return {
    id: "themes",
    kicker: "Themes",
    title: "Areas to Watch",
    rows: (preferred.length ? preferred : sharedAlpha.themes || FALLBACK_THEMES).slice(0, 6).map((row, index) => ({
      label: row.label || row.sector || row.proxy_ticker || FALLBACK_THEMES[index]?.label || "Theme",
      signal: row.signal || row.view || FALLBACK_THEMES[index]?.signal || "monitor",
      score: numberOr(row.score, numberOr(row.opportunity_score, FALLBACK_THEMES[index]?.score ?? null)),
    })),
  };
}

function buildInternationalModule(snapshot, sharedAlpha) {
  const rows = snapshot?.international?.preferred || snapshot?.international?.records || [];
  return {
    id: "international",
    kicker: "Global",
    title: "Beyond the US",
    rows: (rows.length ? rows : sharedAlpha.international || []).slice(0, 5).map((row) => ({
      label: row.label || row.market || row.ticker || "Global market",
      ticker: row.ticker || "-",
      score: numberOr(row.score, numberOr(row.opportunity_score, null)),
      momentum: row.momentum !== undefined ? fmtPct(row.momentum) : fmtPct(row.mom_60d),
    })),
    note: rows.length
      ? "Global diversification is ranked by opportunity score and structural fit."
      : "International sleeves are seeded from the shared alpha book until live rankings are promoted.",
  };
}

function buildAuditModule(snapshot, sharedAlpha) {
  const warnings = snapshot?.forecast?.warnings || [];
  return {
    id: "audit",
    kicker: "Log",
    title: "Decision Log",
    lines: warnings.length
      ? warnings.slice(0, 4)
      : sharedAlpha.audit.lines,
  };
}

export function normalizeWorkspaceDashboard({
  workspaceId,
  snapshot,
  watchlist,
  alerts,
  savedViews,
  commandHistory,
  sharedAlpha,
}) {
  const alpha = chooseSharedAlpha(sharedAlpha);
  const moduleStatus = MODULE_META.map(([id, title, kicker]) => {
    const panel = (snapshot?.status?.panels || []).find((item) => item.name === PANEL_ALIAS[id])
      || { status: "unknown", stale_days: null };
    return {
      id,
      title,
      kicker,
      status: panel.status || "unknown",
      staleDays: panel.stale_days,
    };
  });

  const normalizedAlerts = [...alerts, ...buildAlerts(snapshot, alpha)].reduce((acc, alert) => {
    if (!acc.some((item) => item.id === alert.id)) acc.push(alert);
    return acc;
  }, []);

  const modules = {
    actions: buildActionsModule(snapshot, alpha),
    command: buildProtocolModule(snapshot, alpha),
    portfolio: buildPortfolioModule(snapshot, watchlist.length, alpha),
    scanner: buildScannerModule(snapshot, alpha),
    risk: buildRiskModule(snapshot, alpha),
    spectral: buildSpectralModule(snapshot, alpha),
    themes: buildThemesModule(snapshot, alpha),
    international: buildInternationalModule(snapshot, alpha),
    audit: buildAuditModule(snapshot, alpha),
  };
  const marketRibbon = buildMarketRibbon(snapshot, alpha);

  return {
    workspace_summary: {
      id: workspaceId,
      name: "BLS Prime Alpha",
      persona: "Retail decision terminal",
      mode: "Invite-only alpha",
      last_updated: snapshot?.generated_at || alpha.analytics.asOf || new Date().toISOString(),
      last_updated_label: formatUpdatedAt(snapshot?.generated_at || alpha.analytics.asOf),
      backend_status: snapshot?.status?.warnings?.length ? "briefing" : "live",
      primary_stance: humanizeEngineLabel(snapshot?.overview?.recommended_action) || alpha.command.readout,
    },
    data_control: {
      analysisSource: snapshot?.status?.warnings?.length ? "Shared alpha fallback over sparse Railway snapshot" : "Railway live snapshot",
      screenerSource: modules.scanner.sourceLabel,
      lastRefreshLabel: formatUpdatedAt(snapshot?.generated_at || alpha.analytics.asOf),
      notes: [
        "Refresh asks Railway to rebuild the research snapshot behind the terminal.",
        "Stock Ideas turns fully live only after Railway promotes a fresh discovery screener artifact.",
      ],
    },
    market_ribbon: marketRibbon,
    market_brief: buildMarketBrief(marketRibbon, alpha),
    edge_board: buildEdgeBoard(snapshot, alpha),
    module_status: moduleStatus,
    alerts: normalizedAlerts,
    portfolio_state: {
      holdings_count: modules.portfolio.analytics.holdingsCount,
      beta: modules.portfolio.analytics.beta,
      watchlist_count: watchlist.length,
      top_holdings: modules.portfolio.holdings,
    },
    alpha_briefing: {
      asOf: alpha.asOf,
      pulse: alpha.pulse,
      topIdeas: alpha.watchlist.slice(0, 4),
      stats: [
        { label: "Annual return", value: fmtPct(alpha.analytics.annualReturn) },
        { label: "Typical swings", value: fmtPct(alpha.analytics.annualVolatility) },
        { label: "Reward vs risk", value: formatNumberLike(alpha.analytics.sharpeRatio) },
        { label: "Holdings", value: String(alpha.analytics.holdingsCount) },
      ],
    },
    playbook: buildPlaybookModule(snapshot, alpha),
    watchlist,
    saved_views: savedViews || alpha.savedViews,
    command_history: commandHistory || [],
    module_refs: MODULE_META.map(([id, title, kicker]) => ({ id, title, kicker })),
    modules,
  };
}
