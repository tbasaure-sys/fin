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
  ["command", "Market Playbook", "Playbook"],
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

function numberOr(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function formatUpdatedAt(value) {
  if (!value) return "Awaiting refresh";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
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

function buildCommandModule(snapshot, sharedAlpha) {
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
  };
}

function formatNumberLike(value, digits = 2) {
  const parsed = numberOr(value, null);
  return parsed === null ? "-" : parsed.toFixed(digits);
}

function buildScannerModule(snapshot, sharedAlpha) {
  const screener = snapshot?.screener || {};
  const rows = screener.rows || [];
  const fallbackRows = sharedAlpha.scannerRows || [];
  return {
    id: "scanner",
    kicker: "Ideas",
    title: "Stock Ideas",
    source: screener.source_file || "discovery_screener.csv",
    rows: (rows.length ? rows : fallbackRows).slice(0, 8).map((row) => ({
      ticker: row.ticker,
      sector: row.sector || "Unknown",
      bucket: row.bucket || row.thesis_bucket || row.statement_bucket || "Watch",
      discovery: numberOr(row.discovery, numberOr(row.discovery_score, numberOr(row.composite_score, null))),
      valuationGap: row.valuationGap !== undefined ? fmtPct(row.valuationGap) : fmtPct(row.valuation_gap),
      momentum: row.momentum !== undefined ? fmtPct(row.momentum) : fmtPct(row.momentum_6m),
    })),
    insight:
      rows.length > 0
        ? "Cross-sectional discovery is live and ranked by asymmetric upside plus conviction overlays."
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

  return {
    id: "risk",
    kicker: "Risk",
    title: "Risk Check",
    metrics: hasLiveRisk ? liveMetrics : fallback.metrics,
    narrative: narrative.length ? narrative : fallback.narrative,
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
    command: buildCommandModule(snapshot, alpha),
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
    market_ribbon: marketRibbon,
    market_brief: buildMarketBrief(marketRibbon, alpha),
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
    watchlist,
    saved_views: savedViews || alpha.savedViews,
    command_history: commandHistory || [],
    module_refs: MODULE_META.map(([id, title, kicker]) => ({ id, title, kicker })),
    modules,
  };
}
