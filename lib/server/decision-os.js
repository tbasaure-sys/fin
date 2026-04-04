function safeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function defaultMandate() {
  return {
    id: "compound_without_fake_rebounds",
    label: "Compound without fake rebounds",
    statement: "Compound carefully, but refuse rebound adds that still fail the recoverability test.",
    guardrails: [
      "Prefer defense plus quality over beta spikes.",
      "Only widen risk when sponsorship and recoverability both improve.",
      "Treat phantom rebounds as traps, not invitations.",
    ],
    options: [
      {
        id: "compound_without_fake_rebounds",
        label: "Compound without fake rebounds",
      },
      {
        id: "defend_drawdown",
        label: "Defend drawdown first",
      },
      {
        id: "stage_only_on_recoverability",
        label: "Stage only on recoverability",
      },
    ],
    source: "derived_default",
  };
}

function buildFallbackFrontier(dashboard) {
  const unlocked = [dashboard?.primary_action, ...safeList(dashboard?.secondary_actions)].filter(Boolean).map((item) => ({
    id: item.id,
    lane: "unlocked",
    laneLabel: "Unlocked",
    title: item.title,
    ticker: item.ticker || null,
    summary: item.summary || item.whyNow || "",
    sizeLabel: item.sizeLabel || "-",
    funding: item.funding || "No change",
    evidenceBand: dashboard?.stress_mode?.authorityLabel || dashboard?.state_summary?.evidenceStrength || "Usable",
    whyLane: "This sits inside the current decision rights and can be acted on carefully.",
    disproofCondition: dashboard?.state_summary?.changeTrigger || "If the live state weakens again.",
  }));
  const staged = safeList(dashboard?.escrow?.items).map((item) => ({
    id: item.id,
    lane: "staged",
    laneLabel: "Staged",
    title: item.title,
    ticker: item.ticker || null,
    summary: item.summary || "",
    sizeLabel: item.sizeLabel || "Staged",
    funding: item.funding || "No change",
    evidenceBand: dashboard?.stress_mode?.authorityLabel || "Usable",
    whyLane: "You have preserved the option, but it still needs confirmation.",
    disproofCondition: safeList(item.invalidationConditions)[0] || dashboard?.state_summary?.changeTrigger || "If the market structure weakens.",
  }));
  const blocked = dashboard?.blocked_action ? [{
    id: dashboard.blocked_action.id,
    lane: "illegitimate",
    laneLabel: "Illegitimate",
    title: dashboard.blocked_action.title,
    ticker: dashboard.blocked_action.ticker || null,
    summary: dashboard.blocked_action.summary || "",
    sizeLabel: dashboard.blocked_action.sizeLabel || "-",
    funding: dashboard.blocked_action.funding || "No change",
    evidenceBand: dashboard?.stress_mode?.authorityLabel || "Usable",
    whyLane: "This is tempting, but the current legitimacy surface still blocks it.",
    disproofCondition: dashboard?.state_summary?.changeTrigger || "Wait for a cleaner state.",
  }] : [];

  return {
    headline: "Action frontier",
    subhead: "See what is unlocked, what is staged, and what is still illegitimate before you move capital.",
    lanes: [
      { id: "unlocked", label: "Unlocked", items: unlocked },
      { id: "staged", label: "Staged", items: staged },
      { id: "illegitimate", label: "Illegitimate", items: blocked },
    ],
    laneSummary: [
      { id: "unlocked", label: "Unlocked", count: unlocked.length },
      { id: "staged", label: "Staged", count: staged.length },
      { id: "illegitimate", label: "Illegitimate", count: blocked.length },
    ],
    nextUnlockCondition: dashboard?.decision_workspace?.reopenTrigger || dashboard?.state_summary?.changeTrigger || "Wait for stronger sponsorship and recoverability.",
    closeCondition: dashboard?.decision_workspace?.closeTrigger || dashboard?.state_summary?.mainRisk || "If the structure weakens, cut risk back first.",
    allItems: [...unlocked, ...staged, ...blocked],
  };
}

function buildFallbackXray(dashboard) {
  const portfolio = dashboard?.modules?.portfolio || {};
  const holdings = safeList(portfolio?.holdings);
  const topFive = holdings.slice(0, 5);
  return {
    headline: "What is actually carrying the book right now.",
    subhead: "Read the portfolio by role, concentration, fragility, and recovery contribution.",
    totalValueUsd: portfolio?.analytics?.totalValueUsd || null,
    holdingsCount: portfolio?.analytics?.holdingsCount || holdings.length,
    concentration: {
      topFive: topFive.length ? `${(topFive.reduce((sum, item) => sum + (Number.parseFloat(String(item.weight || "0")) / 100 || 0), 0) * 100).toFixed(1)}%` : "-",
      topTen: "-",
      ballast: "-",
      verdict: "Connected",
    },
    roleBands: [],
    carriers: topFive,
    concentrationWarnings: [],
    weightedHoldings: holdings,
  };
}

function buildFallbackStories(xray, dashboard) {
  const items = safeList(xray?.weightedHoldings).slice(0, 8).map((holding) => ({
    ticker: String(holding.ticker || "").toUpperCase(),
    title: `${holding.ticker} story`,
    role: holding.roleLabel || "Holding",
    roleDescription: holding.sector || "Holding role pending.",
    weight: holding.weight || "-",
    marketValueUsd: holding.marketValueUsd || null,
    whyExists: [`${holding.ticker} is part of the current book and should justify its place through role and concentration.`],
    whatBreaks: ["If it adds more fragility than recoverability, it should lose priority."],
    whatCouldReplace: [],
    improvesConfidence: [dashboard?.state_summary?.changeTrigger || "A cleaner recoverability signal."],
  }));

  return {
    headline: "Position stories",
    subhead: "Every major holding should explain itself.",
    selectedTicker: items[0]?.ticker || null,
    items,
    byTicker: Object.fromEntries(items.map((item) => [item.ticker, item])),
  };
}

export function buildDecisionOsSections(dashboard, overrides = {}) {
  const frontier = overrides.frontier || dashboard?.frontier || buildFallbackFrontier(dashboard);
  const xray = overrides.xray || dashboard?.xray || buildFallbackXray(dashboard);
  const positionStories = overrides.positionStories || dashboard?.position_stories || buildFallbackStories(xray, dashboard);
  const items = safeList(positionStories?.items);
  const byTicker = Object.fromEntries(items.map((item) => [String(item.ticker || "").toUpperCase(), item]));
  const memoryGuidance = overrides.memoryGuidance || dashboard?.memory_guidance || {
    profileLabel: "Still learning",
    profileSummary: "The system is still learning your decision pattern.",
    overlays: [],
    warnings: [],
    brief: safeList(dashboard?.memory?.weeklyBrief),
  };
  const counterfactualLedger = overrides.counterfactualLedger || dashboard?.counterfactual_ledger || {
    headline: "Counterfactual ledger",
    subhead: "Track what happened after you acted, waited, or passed.",
    items: [],
  };
  const capitalTwin = overrides.capitalTwin || dashboard?.capital_twin || {
    headline: "Capital twin",
    subhead: "Scenario paths projected from the current live book, not from a benchmark claim.",
    baselineLabel: "Compared with the current connected book.",
    historyLabel: "The history line fills in as stored portfolio snapshots accumulate.",
    scenarios: [],
    exposures: [],
  };
  const mandate = {
    ...defaultMandate(),
    ...(dashboard?.mandate || {}),
    ...(overrides.mandate || {}),
  };
  const recoverabilityMap = overrides.recoverabilityMap || dashboard?.recoverability_map || {
    headline: "Market map",
    subhead: "See which holdings and ideas look steadier, and which ones still need a cleaner setup.",
    filters: [
      { id: "holdings", label: "Current holdings", count: 0 },
      { id: "watch", label: "Watch ideas", count: 0 },
      { id: "blocked", label: "Blocked ideas", count: 0 },
    ],
    items: [],
  };
  const recoverabilityBalanceSheet = overrides.recoverabilityBalanceSheet || dashboard?.recoverability_balance_sheet || {
    headline: "Recoverability balance sheet",
    subhead: "Assets create future freedom. Liabilities consume it. Reserves decide whether the book can afford new risk.",
    accountingState: "Fallback",
    headlineState: "The accounting layer is unavailable, so the workspace is using a simple fallback read.",
    netFreedom: "-",
    optionalityReserve: "-",
    phantomTax: "-",
    legitimacySlack: "-",
    spendingCapacity: "-",
    budgetState: "Unknown",
    dominantFailureMode: "-",
    assets: [],
    liabilities: [],
    reserves: [],
    spendRule: dashboard?.state_summary?.changeTrigger || "Wait for stronger sponsorship and recoverability.",
    repairNote: dashboard?.primary_action?.summary || "No repair note is available yet.",
    notes: [],
    source: "fallback",
  };
  const confidencePanel = overrides.confidencePanel || dashboard?.confidence_panel || {
    headline: "Truthful confidence",
    confidenceBand: dashboard?.state_summary?.evidenceStrength || "Usable",
    trustState: dashboard?.state_summary?.mode || "-",
    decisionRights: dashboard?.modules?.command?.decisionRights || "-",
    evidenceTier: dashboard?.stress_mode?.evidenceTier || "Live",
    analogCount: 0,
    disproofConditions: [dashboard?.state_summary?.changeTrigger].filter(Boolean),
    note: "Confidence stays paired with disproof conditions.",
  };

  return {
    frontier,
    xray,
    position_stories: {
      ...positionStories,
      items,
      byTicker,
    },
    counterfactual_ledger: counterfactualLedger,
    memory_guidance: memoryGuidance,
    recoverability_map: recoverabilityMap,
    recoverability_balance_sheet: recoverabilityBalanceSheet,
    confidence_panel: confidencePanel,
    capital_twin: capitalTwin,
    mandate,
  };
}
