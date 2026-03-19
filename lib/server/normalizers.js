import {
  FALLBACK_SCENARIOS,
} from "./demo-data.js";
import { SHARED_ALPHA_PROFILE } from "./shared-alpha-data.js";

const MODULE_META = [
  ["actions", "Next Best Moves", "Actions"],
  ["command", "Capital Protocol", "Protocol"],
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

function humanizeContractStatus(value) {
  if (!value) return "Fallback mode";
  if (value === "canonical_valid") return "Live decision engine";
  if (value === "canonical_invalid_warn") return "Partial decision engine";
  if (value === "fallback_cached_valid") return "Cached decision engine";
  if (value === "fallback_legacy") return "Fallback mode";
  return humanizeBucket(value);
}

function humanizeClusterLabel(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "g-dominated") return "Structural pressure";
  if (normalized === "r-dominated") return "Shock pressure";
  if (normalized === "compound") return "Broad stress";
  if (normalized === "mixed") return "Mixed";
  return normalized ? humanizeBucket(value) : "Mixed";
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

function getCanonicalContract(snapshot) {
  const candidates = [snapshot?.bls_state_v2, snapshot?.bls_state_v1];
  for (const contract of candidates) {
    if (!contract || typeof contract !== "object") continue;
    if (!contract.measured_state || !contract.probabilistic_state || !contract.policy_state) continue;
    return contract;
  }
  return null;
}

function getContractStatus(snapshot) {
  const explicit = snapshot?.status?.contract_status;
  if (explicit) return explicit;
  return getCanonicalContract(snapshot) ? "canonical_valid" : "fallback_legacy";
}

function buildStressTopMove(contract) {
  const repair = Array.isArray(contract?.repair_candidates) ? contract.repair_candidates[0] : null;
  if (repair) {
    return {
      summary: Array.isArray(repair.trade_set) ? repair.trade_set.join(" + ") : "Canonical repair candidate",
      source: "canonical_repair_candidate",
      classification: String(repair.classification || "").replace(/_/g, " "),
      funding: repair.funding_source || null,
      firstConstraint: Array.isArray(repair.binding_constraints) ? repair.binding_constraints[0] : null,
      firstInvalidation: Array.isArray(repair.invalidation) ? humanizeTriggerRule(repair.invalidation[0]) : null,
    };
  }
  if (contract) {
    const policy = contract.policy_state || {};
    const confirmation = String(policy.required_confirmation || "regime confirmation").replace(/_/g, " ");
    return {
      summary: "No valid repair under current frontier",
      source: "canonical_frontier_block",
      classification: "no valid repair",
      funding: "No new capital deployment allowed",
      firstConstraint:
        Array.isArray(policy.forbidden_sleeves) && policy.forbidden_sleeves.length
          ? `Forbidden sleeves: ${policy.forbidden_sleeves.join(", ")}`
          : `Mode ${String(policy.mode || "protect").replace(/_/g, " ")} is blocking fresh adds`,
      firstInvalidation: `Reassess only after ${confirmation}.`,
      reason: "Current recoverability, phantom risk, and mode constraints do not justify a frontier-valid move.",
    };
  }
  return {
    summary: "No repair candidate yet",
    source: "legacy_action_adapter",
    classification: null,
    funding: null,
    firstConstraint: null,
    firstInvalidation: null,
  };
}

function labelFiberOutcome(row) {
  const restoration = clamp01(numberOr(row?.p_structural_restoration_realized, 0));
  const visibleCorrection = clamp01(numberOr(row?.p_visible_correction_realized, 0));
  const drawdown = numberOr(row?.max_drawdown_from_state, 0);
  if (restoration >= 0.5 && drawdown >= -0.12) return "generative";
  if (restoration < 0.5 && drawdown <= -0.18) return "compressive";
  if (visibleCorrection >= 0.5) return "palliative";
  return drawdown <= -0.18 ? "compressive" : "palliative";
}

function describeFiberAtlas(contract) {
  const analogs = Array.isArray(contract?.analogs) ? contract.analogs : [];
  if (!analogs.length) {
    return {
      available: false,
      title: "Visible fiber",
      explanation: "This compares the current setup with similar past states to see whether similar-looking situations usually healed, stalled, or got worse.",
      headline: "No comparable states yet",
      takeaway: "No historical read yet.",
      ambiguityLabel: "Unknown",
      rows: [],
    };
  }

  const labeled = analogs.map((row) => ({ ...row, fiberOutcome: labelFiberOutcome(row) }));
  const generative = labeled.filter((row) => row.fiberOutcome === "generative").length;
  const palliative = labeled.filter((row) => row.fiberOutcome === "palliative").length;
  const compressive = labeled.filter((row) => row.fiberOutcome === "compressive").length;
  const total = labeled.length;
  const dominantShare = Math.max(generative, palliative, compressive) / total;
  const ambiguityLabel = dominantShare >= 0.65 ? "Low" : dominantShare >= 0.5 ? "Medium" : "High";
  const headline = `${total} similar states found`;
  const takeaway =
    compressive / total >= 0.4
      ? "Many similar-looking states later broke down. That argues for patience and tighter risk."
      : generative / total >= 0.45
        ? "A meaningful share of similar states healed well enough to support staged risk."
        : "Most similar states bounced a bit but did not truly improve. Treat this as a watch state, not a green light.";

  return {
    available: true,
    title: "Visible fiber",
    explanation: "This compares the current setup with similar past states to see whether similar-looking situations usually healed, stalled, or got worse.",
    headline,
    takeaway,
    ambiguityLabel,
    rows: [
      { id: "generative", label: "Healed well", count: generative, share: fmtPct(generative / total) },
      { id: "palliative", label: "Bounced but stayed weak", count: palliative, share: fmtPct(palliative / total) },
      { id: "compressive", label: "Got worse", count: compressive, share: fmtPct(compressive / total) },
    ],
  };
}

function describeEvidenceStrength(authority, samples, brier) {
  const authorityValue = numberOr(authority, null);
  const sampleCount = numberOr(samples, null);
  const error = numberOr(brier, null);
  const score = clamp01(
    (authorityValue === null ? 0.45 : authorityValue * 0.55)
      + (sampleCount === null ? 0.15 : Math.min(sampleCount / 400, 1) * 0.25)
      + (error === null ? 0.1 : Math.max(0, 0.2 - error) * 1.0),
  );
  if (score >= 0.68) return "Strong";
  if (score >= 0.46) return "Usable";
  return "Thin";
}

function buildStressMode(dashboardSnapshot, modules) {
  const contract = getCanonicalContract(dashboardSnapshot);
  const policy = contract?.policy_state || {};
  const probabilistic = contract?.probabilistic_state || {};
  const uncertainty = contract?.uncertainty || {};
  const budget = contract?.recoverability_budget || {};
  const healing = contract?.healing_dynamics || {};
  const sponsorship = contract?.rebound_sponsorship || {};
  const legitimacy = contract?.legitimacy_surface || {};
  const failureModes = contract?.failure_modes || {};
  const transitionMemory = contract?.transition_memory || {};
  const provenance = contract?.research_provenance || {};
  const topAnalog = Array.isArray(contract?.analogs) ? contract.analogs[0] : null;
  const packageMetrics = Array.isArray(uncertainty?.probability_package_metrics) ? uncertainty.probability_package_metrics : [];
  const recoverabilityMetric = packageMetrics.find((item) => item?.target === "portfolio_recoverability") || packageMetrics[0] || null;
  const diagnostics = packageMetrics.map((item) => ({
    target: String(item?.target || "").replace(/_/g, " "),
    folds: item?.fold_count ?? "-",
    brier: item?.brier_oof_calibrated === undefined ? "-" : Number(item.brier_oof_calibrated).toFixed(3),
    samples: item?.sample_count ?? "-",
    positiveRate: item?.positive_rate === undefined ? "-" : fmtPct(item.positive_rate),
  }));
  const topMove = buildStressTopMove(contract);
  const mode = String(policy.mode || modules?.command?.trustState || "observe");
  const modeLabel = mode.replace(/_/g, " ");
  const recoverability = numberOr(probabilistic.p_portfolio_recoverability, null);
  const phantom = numberOr(probabilistic.p_phantom_rebound, null);
  const authority = numberOr(uncertainty?.authority?.authority_policy_gate, numberOr(probabilistic.authority_score, null));
  const riskAddState = String(legitimacy.risk_add_state || "").replace(/_/g, " ") || (numberOr(policy.max_gross_add, 0) > 0 ? "open" : "closed");
  const defensiveState = String(legitimacy.defensive_state || "").replace(/_/g, " ") || "conditional";
  const marketTrend = String(healing.state || "").replace(/_/g, " ") || "mixed";
  const reboundDriver = String(sponsorship.type || "").replace(/_/g, " ") || "mixed";
  const mainRisk = String(failureModes.dominant_failure_mode || "").replace(/_/g, " ") || "none material";
  const roomToAct = numberOr(budget.remaining_budget, null);
  const topTrigger = Array.isArray(failureModes.trigger_map) ? failureModes.trigger_map[0] : null;
  const whatNeedsToImprove = topMove?.firstInvalidation || topTrigger?.meaning || String(policy.required_confirmation || "Need more confirmation").replace(/_/g, " ");
  const decisionSummary = contract
    ? blockedSummary(mode, riskAddState, topMove?.summary)
    : "System is using a partial fallback path.";
  const evidenceStrength = describeEvidenceStrength(authority, recoverabilityMetric?.sample_count, recoverabilityMetric?.brier_oof_calibrated);
  const fiberAtlas = describeFiberAtlas(contract);

  return {
    active: Boolean(contract),
    contractStatus: getContractStatus(dashboardSnapshot),
    contractStatusLabel: humanizeContractStatus(getContractStatus(dashboardSnapshot)),
    contractVersion: contract?.contract_version || null,
    repairCount: Array.isArray(contract?.repair_candidates) ? contract.repair_candidates.length : 0,
    repairState: contract
      ? (Array.isArray(contract?.repair_candidates) && contract.repair_candidates.length ? "frontier_open" : "frontier_blocked")
      : "legacy",
    decisionSummary,
    mode: modeLabel,
    canAddRisk: riskAddState,
    defensiveState,
    recoverability: recoverability === null ? "-" : fmtPct(recoverability),
    roomToAct: roomToAct === null ? "-" : fmtPct(roomToAct),
    marketTrend,
    reboundDriver,
    phantom: phantom === null ? "-" : fmtPct(phantom),
    authority: authority === null ? "-" : fmtPct(authority),
    authorityLabel: evidenceStrength,
    mainRisk,
    whatNeedsToImprove,
    cadence: policy.review_cadence || "legacy",
    confirmation: String(policy.required_confirmation || "legacy").replace(/_/g, " "),
    topMove,
    invalidation: Array.isArray(policy.invalidation_rules) ? humanizeTriggerRule(policy.invalidation_rules[0]) : null,
    changeTrigger: Array.isArray(policy.invalidation_rules) && policy.invalidation_rules.length
      ? (
        Array.isArray(contract?.repair_candidates) && contract.repair_candidates.length
          ? humanizeTriggerRule(policy.invalidation_rules[0])
          : humanizeReopenRule(policy.invalidation_rules.join("; "))
      )
      : topMove?.firstInvalidation || null,
    probabilitySource: probabilistic.source || uncertainty.probability_layer_source || "legacy",
    packageVersion: probabilistic.model_package_version || uncertainty.probability_model_package_version || null,
    evidenceTier: uncertainty.evidence_tier || uncertainty?.authority?.evidence_tier || "-",
    modelCoverage: uncertainty.coverage_component === undefined ? "-" : fmtPct(uncertainty.coverage_component),
    provenanceRoot: provenance.root_family || "-",
    artifactCoverage: provenance.coverage_ratio === undefined ? "-" : fmtPct(provenance.coverage_ratio),
    packageFoldCount: recoverabilityMetric?.fold_count ?? "-",
    packageBrier: recoverabilityMetric?.brier_oof_calibrated === undefined ? "-" : Number(recoverabilityMetric.brier_oof_calibrated).toFixed(3),
    packageSamples: recoverabilityMetric?.sample_count ?? "-",
    diagnostics,
    topAnalog: topAnalog ? `${topAnalog.as_of} · ${fmtPct(topAnalog.p_structural_restoration_realized)}` : "No analogs yet",
    fiberAtlas,
    phantomFragilityPrior: probabilistic.phantom_fragility_prior === undefined ? "-" : fmtPct(probabilistic.phantom_fragility_prior),
    phantomFragilityDecile: probabilistic.phantom_fragility_decile ?? "-",
    transitionCluster: transitionMemory.regime_cluster ? String(transitionMemory.regime_cluster).replace(/_/g, " ") : "-",
    transitionEvidence: transitionMemory.evidence_count ?? "-",
  };
}

function blockedSummary(mode, riskAddState, topMove) {
  if (mode === "protect") {
    return riskAddState === "closed"
      ? `Stay defensive. Do not add risk yet. ${topMove || "No valid repair is open."}`
      : `Stay defensive, but defensive changes are still allowed. ${topMove || ""}`.trim();
  }
  if (mode === "observe") {
    return `Watch for confirmation before adding risk. ${topMove || ""}`.trim();
  }
  if (mode === "stage") {
    return `Start small and keep changes funded. ${topMove || ""}`.trim();
  }
  return `Risk can be added selectively. ${topMove || ""}`.trim();
}

function formatUpdatedAt(value) {
  if (!value) return "Awaiting refresh";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const ageMs = Math.max(0, Date.now() - date.getTime());
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours >= 18) return "Needs refresh";

  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  if (sameDay) {
    return `Today ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMarketDataLabel(value, staleDays) {
  const stale = numberOr(staleDays, null);
  if (stale === 0) return "Current session";
  if (stale === 1) return "Previous close";
  if (stale !== null && stale > 1) return `${stale} sessions behind`;
  return formatUpdatedAt(value);
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

  if (!marketRibbon.length) {
    return {
      bias: "Unavailable",
      leader: "Awaiting quotes",
      laggard: "Awaiting quotes",
      headline: "Waiting for live market prices.",
    };
  }

  return {
    bias,
    leader: leader ? `${leader.symbol} ${fmtPct(leader.changePct)}` : "Awaiting quotes",
    laggard: laggard ? `${laggard.symbol} ${fmtPct(laggard.changePct)}` : "Awaiting quotes",
    headline:
      bias === "Positive"
        ? "Market conditions are improving, but portfolio changes should still stay selective."
        : bias === "Defensive"
          ? "Market conditions still favor patience and risk discipline."
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
        note: noteParts.length ? `Use ${code} only if you want a macro expression of ${row.label}; ${noteParts.join(", ")}.` : `Use ${code} as the currency expression of the ${row.label} setup.`,
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

  return derived;
}

function buildEdgeBoard(snapshot, sharedAlpha) {
  const sectorRows = buildEdgeRows(snapshot?.sectors?.preferred || snapshot?.sectors?.records, {
    lane: "sectors",
    labelKey: "sector",
    scoreKeys: ["score", "opportunity_score", "defense_fit"],
    noteBuilder: (row) => row.view ? `If you are adding equity risk, start with this group. Current view: ${humanizeBucket(row.view)}.` : "If you are adding equity risk, start here before broad beta.",
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
    noteBuilder: (row) => row.ticker ? `If you want non-US exposure, start with ${row.ticker}.` : "If you want non-US exposure, start here.",
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
      return parts.length ? `Best candidate if you want to add a single name. Confirmed by ${parts.join(" and ")}.` : "Best candidate if you want to add a single name.";
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

  const sectors = sectorRows.length ? sectorRows : [];
  const countries = countryRows.length ? countryRows : [];
  const stocks = stockRows.length ? stockRows : [];
  const currencies = buildCurrencyEdges(countries, snapshot, sharedAlpha);

  if (!sectors.length && !countries.length && !stocks.length && !currencies.length) {
    return {
      headline: "No live opportunities are available yet.",
      explanation: "Fresh sector, country, FX, or single-name signals will appear here once the backend publishes them.",
      sectors: [],
      countries: [],
      currencies: [],
      stocks: [],
      drilldowns: [],
    };
  }

  const topSector = sectors[0]?.label || "sector edge";
  const topCountry = countries[0]?.label || "country edge";
  const topStock = stocks[0]?.label || "stock edge";

  return {
    headline:
      `If you are putting new risk to work, start with ${topSector}; for non-US exposure, ${topCountry}; for single-name risk, ${topStock}.`,
    explanation:
      "Read this as a shortlist for where to act next. Sector and country lanes help with tilts, FX is for macro expressions, and single names are for new adds.",
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
  if (value === "convexity") return "Crash protection";
  if (value === "g_dominated" || value === "G-dominated") return "Structural pressure";
  if (value === "r_dominated" || value === "R-dominated") return "Shock pressure";
  if (value === "fallback_legacy") return "Fallback mode";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeTriggerRule(rule) {
  if (!rule) return null;
  return String(rule)
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => _formatTriggerPhrase(part))
    .join("; ");
}

function humanizeReopenRule(rule) {
  if (!rule) return null;
  return String(rule)
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*)_(above|below)_([0-9_]+)$/);
      if (!match) return part.replace(/_/g, " ");
      const [, rawMetric, direction, rawThreshold] = match;
      return _formatTriggerPhrase(`${rawMetric}_${direction === "above" ? "below" : "above"}_${rawThreshold}`);
    })
    .join("; ");
}

function _formatTriggerPhrase(rule) {
  const match = String(rule).match(/^(.*)_(above|below)_([0-9_]+)$/);
  if (!match) return String(rule).replace(/_/g, " ");
  const [, rawMetric, direction, rawThreshold] = match;
  const metric = rawMetric
    .replace(/^p_/, "")
    .replace("portfolio recoverability", "recovery chance")
    .replace("phantom rebound", "false rebound risk")
    .replace("authority score", "evidence strength")
    .replace("visible correction", "bounce quality")
    .replace("structural restoration", "structural healing")
    .replace(/_/g, " ");
  const threshold = Number(rawThreshold.replace(/_/g, "."));
  const formattedThreshold = Number.isFinite(threshold) && threshold <= 1
    ? `${(threshold * 100).toFixed(0)}%`
    : Number.isFinite(threshold)
      ? threshold.toFixed(2)
      : rawThreshold.replace(/_/g, ".");
  return `${metric} ${direction === "above" ? "rises above" : "falls below"} ${formattedThreshold}`;
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

function describeHoldingsSource(snapshot) {
  const portfolio = snapshot?.portfolio || {};
  const source = String(portfolio.holdings_source || "").trim();
  const label = String(portfolio.holdings_source_label || "").trim();
  const holdings = getPortfolioHoldings(snapshot);
  const hasHoldings = holdings.length > 0;

  if (source === "local_overlay" || source === "remote_overlay" || source === "ui_editable_overlay") {
    const isRemote = source === "remote_overlay";
    return {
      source,
      label: label || (isRemote ? "Remote holdings overlay" : "Private holdings file"),
      connected: true,
      detail: isRemote
        ? "The UI is reading your private holdings overlay from remote storage."
        : "The UI is reading your private holdings file from the local overlay.",
    };
  }

  if (source) {
    return {
      source,
      label: label || humanizeBucket(source),
      connected: false,
      detail: source === "backend_portfolio_manager"
        ? "The backend snapshot is using the managed portfolio book."
        : "The UI is using the latest backend snapshot.",
    };
  }

  return {
    source: "backend_snapshot",
    label: hasHoldings ? "Backend snapshot holdings" : "Backend snapshot",
    connected: false,
    detail: hasHoldings
      ? "The UI is showing holdings from the backend snapshot because no local overlay is attached."
      : "No private holdings file is attached, so the UI is showing the backend snapshot only.",
  };
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

function getVixLevel(snapshot, sharedAlpha) {
  return numberOr(
    snapshot?.overview?.vix,
    numberOr(
      snapshot?.overview?.vix_level,
      numberOr(
        snapshot?.risk?.macro?.vix,
        numberOr(sharedAlpha?.risk?.vix, null),
      ),
    ),
  );
}

function buildActionFramework(snapshot, sharedAlpha) {
  const contract = getCanonicalContract(snapshot);
  const cluster = buildVolatilityClusterDecomposition(snapshot, sharedAlpha);
  const reboundConfidence = buildReboundConfidence(snapshot, sharedAlpha);
  const reboundQuality = buildReboundQuality(snapshot, sharedAlpha);
  const measured = contract?.measured_state || {};
  const latest = snapshot?.risk?.spectral?.latest || {};
  const compression = clamp01(numberOr(measured.market_compression, numberOr(latest.compression_score, numberOr(snapshot?.overview?.compression_score, 0.41))));
  const freedom = clamp01(numberOr(measured.breadth, numberOr(latest.freedom_score, numberOr(snapshot?.overview?.freedom_score, 0.59))));
  const effectiveDimension = numberOr(measured.market_effective_dimension, numberOr(latest.effective_dimension, 6.2));
  const vix = getVixLevel(snapshot, sharedAlpha);
  const policy = contract?.policy_state || {};

  return {
    cluster,
    reboundConfidence,
    reboundQuality,
    compression,
    freedom,
    effectiveDimension,
    vix,
    policyMode: policy.mode || null,
    authority: numberOr(contract?.probabilistic_state?.authority_score, null),
  };
}

function buildActionOverlay(framework) {
  const { cluster, reboundConfidence, reboundQuality, vix } = framework;
  const cautionText = Number.isFinite(vix) ? `VIX is near ${formatNumberLike(vix, 1)}, so execution should respect wider ranges.` : "Execution should still respect a fragile tape.";

  return {
    add:
      cluster.dominant === "G-dominated"
        ? `Adds should stay small and slow because internal weakness matters more than a short-term bounce. ${cautionText}`
        : reboundQuality.state === "Restorative"
          ? `A rebound with real internal improvement can justify staged adds into the best names. ${cautionText}`
          : `Adds are acceptable only in the cleanest names while the rebound remains unproven. ${cautionText}`,
    trim:
      cluster.dominant === "G-dominated"
        ? "Trims matter more because internal weakness can last longer than a quick price bounce."
        : reboundConfidence.state === "Low"
          ? "Trims still deserve priority because rebound odds are weak from the current state."
          : "Trim lower-quality risk first while keeping room for a shock-led rebound.",
    hold:
      cluster.dominant === "R-dominated" && reboundConfidence.state !== "Low"
        ? "Holding protection while waiting through the shock is defensible here."
        : "Hold only the sleeves that genuinely improve recoverability, not the ones that merely feel safe.",
    invalidation:
      reboundQuality.state === "Restorative"
        ? "Back away if breadth stops improving and the rebound turns into narrow relief."
        : "Back away if compression worsens, breadth stalls, or the rebound remains purely price-led.",
    summary: `${cluster.dominantLabel || humanizeClusterLabel(cluster.dominant)} with recovery chance ${reboundConfidence.state.toLowerCase()} and rebound quality ${reboundQuality.state.toLowerCase()}.`,
  };
}

function buildLiveActionItems(snapshot, sharedAlpha) {
  const addCandidate = getLiveAddCandidate(snapshot);
  const trimCandidate = getLiveTrimCandidate(snapshot);
  const holdCandidate = getLiveHoldCandidate(snapshot);
  const fallback = sharedAlpha.guide.actions;
  const liveActions = [];
  const seen = new Set();
  const riskBudget = describeRiskBudget(snapshot);
  const framework = buildActionFramework(snapshot, sharedAlpha);
  const overlay = buildActionOverlay(framework);

  if (addCandidate) {
    seen.add(addCandidate.ticker);
    const fundingTicker = pickFundingSource(snapshot, [addCandidate.ticker]);
    liveActions.push({
      id: `add-${addCandidate.ticker}`,
      type: "add",
      ticker: addCandidate.ticker,
      company: addCandidate.ticker,
      size: formatPositionSize(numberOr(addCandidate.simulation?.suggested_position, addCandidate.suggested_position)),
      sizeValue: numberOr(addCandidate.simulation?.suggested_position, addCandidate.suggested_position),
      funding: `Fund gradually from ${fundingTicker}`,
      conviction: `${humanizeBucket(addCandidate.thesis_bucket)} with one of the strongest live discovery scores in the stack. ${overlay.summary}`,
      whyNow: `${addCandidate.ticker} is ranking near the top of the live screener with momentum ${fmtPct(addCandidate.momentum_6m)} and discovery ${formatNumberLike(numberOr(addCandidate.discovery_score, addCandidate.composite_score))}. ${riskBudget} ${overlay.add}`,
      watchFor: numberOr(addCandidate.valuation_gap, null) !== null
        ? `Stay patient if the price remains ${fmtPct(addCandidate.valuation_gap)} away from fair value.`
        : "Keep it as a staged entry until more valuation context comes in.",
      role: humanizeBucket(addCandidate.thesis_bucket),
      invalidation: overlay.invalidation,
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
      sizeValue: 0.01,
      funding: "Recycle into stronger setups",
      conviction: `${trimCandidate.ticker} looks less attractive than the best live adds right now. ${overlay.summary}`,
      whyNow: numberOr(trimCandidate.valuation_gap, null) !== null
        ? `${trimCandidate.ticker} shows a live value gap of ${fmtPct(trimCandidate.valuation_gap)}, which makes it harder to justify as a larger weight. ${overlay.trim}`
        : `${trimCandidate.ticker} already carries meaningful portfolio weight and deserves tighter risk discipline. ${overlay.trim}`,
      watchFor: numberOr(trimCandidate.simulation?.prob_loss, null) !== null
        ? `The simulation layer shows ${formatNumberLike(trimCandidate.simulation.prob_loss)} probability of loss, so this name needs stricter sizing discipline.`
        : "Trim faster if the tape turns defensive or stronger ideas keep outranking it.",
      role: humanizeBucket(trimCandidate.thesis_bucket || trimCandidate.sector),
      invalidation: "Only stop trimming if rebound quality improves materially and this name re-enters the top of the opportunity set.",
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
      sizeValue: 0,
      funding: "No change",
      conviction: `${holdCandidate.ticker} is still part of the portfolio's protection layer while the rest of the portfolio stays selective. ${overlay.summary}`,
      whyNow: `The current setup still rewards keeping some dry powder and stability in the portfolio instead of forcing every dollar into aggressive ideas. ${riskBudget} ${overlay.hold}`,
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

function buildContractActionItems(snapshot, sharedAlpha) {
  const contract = getCanonicalContract(snapshot);
  if (!contract) return [];
  const repairs = Array.isArray(contract.repair_candidates) ? contract.repair_candidates : [];
  const policy = contract.policy_state || {};
  const framework = buildActionFramework(snapshot, sharedAlpha);
  if (!repairs.length) {
    const confirmation = String(policy.required_confirmation || "regime confirmation").replace(/_/g, " ");
    const invalidation = Array.isArray(policy.invalidation_rules) && policy.invalidation_rules.length
      ? humanizeReopenRule(policy.invalidation_rules.join("; "))
      : `Wait for ${confirmation}.`;
    return [{
      id: "no-valid-repair",
      type: "hold",
      ticker: "No valid repair",
      company: "Current frontier is closed",
      size: "No fresh risk",
      sizeValue: 0,
      funding: "Preserve liquidity",
      conviction: `Policy mode is ${String(policy.mode || "protect").replace(/_/g, " ")} and the canonical repair frontier found no valid bundle for the current state.`,
      whyNow: "Recovery room is too thin, false-rebound risk is still binding, or current sleeve permissions do not allow a repair that improves the portfolio enough.",
      watchFor: Array.isArray(policy.forbidden_sleeves) && policy.forbidden_sleeves.length
        ? `Blocked sleeves: ${policy.forbidden_sleeves.join(", ")}.`
        : `Wait for ${confirmation}.`,
      role: policy.mode ? `${policy.mode} mode` : "Frontier block",
      invalidation,
      sourceLabel: "Canonical contract",
      isBlockedState: true,
    }];
  }

  return repairs.slice(0, 3).map((repair, index) => {
    const tradeSet = Array.isArray(repair.trade_set) ? repair.trade_set : [];
    const tickerMatch = String(tradeSet[0] || repair.id || "").match(/\b[A-Z]{2,6}\b/);
    const type =
      repair.classification === "real_repair" ? "add"
        : repair.classification === "optionality_preserving_defense" ? "hold"
          : "trim";

    return {
      id: repair.id || `repair-${index + 1}`,
      type,
      ticker: tickerMatch?.[0] || `Repair ${index + 1}`,
      company: repair.classification.replace(/_/g, " "),
      size: policy.max_single_name_add !== undefined ? fmtPct(policy.max_single_name_add) : "Staged",
      sizeValue: numberOr(policy.max_single_name_add, 0.02),
      funding: repair.funding_source || "Current portfolio",
      conviction: `${repair.classification.replace(/_/g, " ")} with recovery improvement ${fmtPct(repair.delta_recoverability)}. ${(framework.cluster.dominantLabel || humanizeClusterLabel(framework.cluster.dominant))} with recovery chance ${framework.reboundConfidence.state.toLowerCase()}.`,
      whyNow: tradeSet.length ? tradeSet.join(" | ") : "No trade set provided.",
      watchFor: (repair.binding_constraints || []).length
        ? `Binding constraints: ${(repair.binding_constraints || []).join(", ")}.`
        : "Watch the policy frontier and recoverability budget.",
      role: policy.mode ? `${policy.mode} mode` : "Repair path",
      invalidation: Array.isArray(repair.invalidation)
        ? humanizeTriggerRule(repair.invalidation.join("; "))
        : humanizeTriggerRule(String(repair.invalidation || "Policy state changes.")),
      sourceLabel: "Canonical contract",
    };
  });
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
      asOf: quote.as_of || snapshot?.portfolio?.quotes_as_of || null,
    }));
  }
  return [];
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

  return alerts;
}

function buildActionsModule(snapshot, sharedAlpha) {
  const liveAction = snapshot?.overview?.recommended_action;
  const framework = buildActionFramework(snapshot, sharedAlpha);
  const contractActions = buildContractActionItems(snapshot, sharedAlpha);
  const contract = getCanonicalContract(snapshot);
  const useLegacyFallback = !contract && !contractActions.length;
  const actions = (useLegacyFallback ? buildLiveActionItems(snapshot, sharedAlpha) : contractActions).map((action, index) => ({
    ...action,
    priority: index + 1,
    plainLabel:
      action.type === "add" ? "Add slowly" : action.type === "trim" ? "Trim if needed" : "Keep in place",
  }));
  const blocked = Boolean(contract && contractActions[0]?.isBlockedState);

  return {
    id: "actions",
    kicker: "Actions",
    title: sharedAlpha.guide.title,
    subtitle: blocked
      ? `No valid action is open right now. ${(framework.cluster.dominantLabel || humanizeClusterLabel(framework.cluster.dominant))} with recovery chance ${framework.reboundConfidence.state.toLowerCase()} and rebound quality ${framework.reboundQuality.state.toLowerCase()}.`
      : liveAction
      ? `Current stance: ${humanizeEngineLabel(liveAction)}. ${(framework.cluster.dominantLabel || humanizeClusterLabel(framework.cluster.dominant))} with recovery chance ${framework.reboundConfidence.state.toLowerCase()} and rebound quality ${framework.reboundQuality.state.toLowerCase()}.`
      : sharedAlpha.guide.subtitle,
    framework,
    blocked,
    actions,
  };
}

function formatPointDelta(value) {
  const numeric = numberOr(value, 0);
  const points = Math.round(numeric * 100);
  return `${points > 0 ? "+" : ""}${points} pts`;
}

function formatBetaDelta(value) {
  const numeric = numberOr(value, 0);
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(2)}`;
}

function getFiberShare(fiberAtlas, id, fallback = 0.33) {
  const row = (fiberAtlas?.rows || []).find((item) => item.id === id);
  return ratioOrPercent(row?.share, fallback);
}

function makeAdviceTitle(action, snapshot, stressMode) {
  if (!action) return "Wait for a cleaner setup";
  if (action.adviceTitle) return action.adviceTitle;
  if (action.isBlockedState) return "Wait before adding risk";
  if (action.type === "add") return `Start ${action.ticker} small`;
  if (action.type === "trim") return `Trim ${action.ticker}`;

  const defensiveTicker = snapshot?.overview?.selected_hedge || pickFundingSource(snapshot, []);
  if ((action.ticker && ["SGOV", "SHY", "BIL", "TLT"].includes(action.ticker)) || action.ticker === defensiveTicker) {
    return `Keep ${action.ticker} as ballast`;
  }
  if (stressMode?.repairState === "frontier_blocked") return "Do nothing aggressive";
  return action.ticker ? `Keep ${action.ticker} unchanged` : "Hold current posture";
}

function estimateAdviceEffects(action, snapshot, modules, stressMode) {
  const holdings = getPortfolioHoldings(snapshot);
  const holding = holdings.find((row) => row.ticker === action?.ticker) || null;
  const holdingWeight = numberOr(holding?.weight, 0);
  const addSize = numberOr(action?.sizeValue, action?.type === "add" ? 0.02 : 0);
  const isDefensive = Boolean(
    action?.isBlockedState
    || ["SGOV", "SHY", "BIL", "TLT", snapshot?.overview?.selected_hedge].includes(action?.ticker)
    || String(action?.role || "").toLowerCase().includes("defense")
  );
  const fiberAtlas = stressMode?.fiberAtlas || {};
  const generativeShare = getFiberShare(fiberAtlas, "generative");
  const compressiveShare = getFiberShare(fiberAtlas, "compressive");
  const ambiguity = String(fiberAtlas.ambiguityLabel || "Medium");
  const reboundQuality = String(modules?.spectral?.reboundQuality?.state || "");
  const canAddRisk = String(stressMode?.canAddRisk || "").toLowerCase();
  let recoverabilityDelta = 0;
  let phantomDelta = 0;
  let betaDelta = 0;
  let concentrationDelta = 0;
  let flexibilityDelta = 0;

  if (action?.isBlockedState) {
    recoverabilityDelta = 0.02;
    phantomDelta = -0.02;
    flexibilityDelta = 0.03;
  } else if (action?.type === "add") {
    recoverabilityDelta =
      0.01
      + (reboundQuality === "Restorative" ? 0.03 : reboundQuality === "Mixed" ? 0.01 : -0.02)
      + (canAddRisk.includes("open") ? 0.01 : -0.03)
      + ((generativeShare - compressiveShare) * 0.06)
      + (ambiguity === "Low" ? 0.01 : ambiguity === "High" ? -0.02 : 0);
    phantomDelta =
      (reboundQuality === "Restorative" ? -0.01 : 0.02)
      + (compressiveShare * 0.03)
      + (ambiguity === "High" ? 0.01 : 0);
    betaDelta = Math.max(addSize * 0.8, 0.01);
    concentrationDelta = holding ? 0.01 : -0.01;
    flexibilityDelta = -0.015 - addSize * 0.2 + (ambiguity === "High" ? -0.01 : 0);
  } else if (action?.type === "trim") {
    recoverabilityDelta = 0.03 + (compressiveShare * 0.03) + (holdingWeight > 0.04 ? 0.01 : 0);
    phantomDelta = -(0.02 + compressiveShare * 0.02);
    betaDelta = -Math.max(Math.min(holdingWeight, 0.03), 0.01);
    concentrationDelta = -Math.max(Math.min(holdingWeight / 2, 0.03), 0.01);
    flexibilityDelta = 0.03 + (ambiguity === "High" ? 0.01 : 0);
  } else if (isDefensive) {
    recoverabilityDelta = 0.01 + compressiveShare * 0.02;
    phantomDelta = -0.01;
    betaDelta = -0.01;
    flexibilityDelta = 0.01;
  } else {
    recoverabilityDelta = 0;
    phantomDelta = ambiguity === "High" ? 0.01 : 0;
  }

  return [
    { label: "Recovery chance", value: formatPointDelta(recoverabilityDelta) },
    { label: "False rebound risk", value: formatPointDelta(phantomDelta) },
    { label: "Portfolio beta", value: formatBetaDelta(betaDelta) },
    {
      label: "Concentration",
      value: concentrationDelta <= -0.01 ? "Lower" : concentrationDelta >= 0.01 ? "Higher" : "About the same",
    },
    {
      label: "Room later",
      value: flexibilityDelta >= 0.015 ? "More" : flexibilityDelta <= -0.015 ? "Less" : "About the same",
    },
  ];
}

function buildAdviceHeadline(primary, secondary, stressMode) {
  if (primary?.isBlockedState || stressMode?.repairState === "frontier_blocked") {
    return "Protect first. Nothing aggressive is open yet.";
  }
  if (primary?.type === "trim") {
    return secondary?.type === "hold"
      ? "Trim weaker risk, keep ballast on, and wait for cleaner adds."
      : "Trim weaker risk first, then reassess."
  }
  if (primary?.type === "add") {
    return "One small add is fine, but the rest of the book still needs discipline.";
  }
  return "Make only small, reversible moves until the market proves more.";
}

function buildAdviceThresholds(stressMode) {
  const recoverability = ratioOrPercent(stressMode?.recoverability, null);
  const phantom = ratioOrPercent(stressMode?.phantom, null);
  const ambiguity = String(stressMode?.fiberAtlas?.ambiguityLabel || "Unknown");

  return [
    {
      id: "recover-high",
      label: "Recovery chance above 60%",
      meaning: "Staged adds can widen, but only if the bounce also looks real.",
      active: recoverability !== null && recoverability >= 0.6,
    },
    {
      id: "recover-mid",
      label: "Recovery chance between 35% and 60%",
      meaning: "Stay selective. New adds should stay small and funded.",
      active: recoverability !== null && recoverability >= 0.35 && recoverability < 0.6,
    },
    {
      id: "recover-low",
      label: "Recovery chance below 35%",
      meaning: "Protect first. Trims, hedges, and patience matter more than new risk.",
      active: recoverability !== null && recoverability < 0.35,
    },
    {
      id: "phantom",
      label: "False rebound risk above 45%",
      meaning: "Green days are suspect until breadth improves underneath.",
      active: phantom !== null && phantom >= 0.45,
    },
    {
      id: "fiber",
      label: "Visible fiber ambiguity is high",
      meaning: "Similar-looking states split later, so prefer small reversible moves.",
      active: ambiguity === "High",
    },
  ];
}

function buildAdviceFiberLine(action, stressMode) {
  const fiberAtlas = stressMode?.fiberAtlas || {};
  const generative = getFiberShare(fiberAtlas, "generative");
  const compressive = getFiberShare(fiberAtlas, "compressive");
  const ambiguity = String(fiberAtlas.ambiguityLabel || "Medium");

  if (action?.type === "trim" || action?.isBlockedState) {
    return compressive >= 0.35
      ? "Similar-looking states often broke down later, so reversible defense has historically been safer."
      : "The historical split is mixed, so trims buy time without forcing a big view.";
  }
  if (action?.type === "add") {
    return ambiguity === "High"
      ? "Similar-looking states split later, so any add should stay small until the market proves itself."
      : generative >= 0.45
        ? "A healthy share of similar states healed well enough to support a staged add."
        : "History is not clean enough for a full-size add, even if one starter is allowed.";
  }
  return ambiguity === "High"
    ? "High ambiguity argues for keeping ballast until the state becomes clearer."
    : "Holding protection is still justified while the book waits for cleaner confirmation.";
}

function buildAdviceMove(action, snapshot, modules, stressMode, slot) {
  if (!action) return null;
  const slotMeta = {
    primary: { label: "Best now", tone: "good" },
    secondary: { label: "Also valid", tone: "warn" },
    caution: { label: "Not yet", tone: "neutral" },
  }[slot] || { label: "Advice", tone: "neutral" };

  return {
    id: `${slot}-${action.id || action.ticker || action.type}`,
    slot: slotMeta.label,
    slotTone: slotMeta.tone,
    tone: action.type === "add" ? "add" : action.type === "trim" ? "trim" : "hold",
    title: makeAdviceTitle(action, snapshot, stressMode),
    ticker: action.ticker,
    size: action.size,
    funding: action.funding,
    summary: action.conviction || action.whyNow,
    why: action.whyNow,
    watchFor: action.watchFor,
    trigger: action.invalidation || stressMode?.changeTrigger || null,
    sourceLabel: action.sourceLabel,
    effects: estimateAdviceEffects(action, snapshot, modules, stressMode),
    fiberLine: buildAdviceFiberLine(action, stressMode),
  };
}

function buildCautionAdvice(snapshot, modules, stressMode) {
  const defensiveTicker = snapshot?.overview?.selected_hedge || pickFundingSource(snapshot, []);
  const riskAddClosed = String(stressMode?.canAddRisk || "").toLowerCase().includes("closed");
  const ambiguityHigh = String(stressMode?.fiberAtlas?.ambiguityLabel || "").toLowerCase() === "high";
  const reboundQuality = String(modules?.spectral?.reboundQuality?.state || "");

  if (riskAddClosed || ambiguityHigh || reboundQuality !== "Restorative") {
    return {
      id: "avoid-broad-risk",
      type: "hold",
      ticker: "Broad beta",
      adviceTitle: "Do not add broad risk yet",
      size: "Wait",
      funding: "Preserve liquidity",
      conviction: "Do not widen the whole book while the state is still ambiguous.",
      whyNow: `Recovery chance is ${stressMode?.recoverability || "-"}, false rebound risk is ${stressMode?.phantom || "-"}, and visible fiber is ${String(stressMode?.fiberAtlas?.ambiguityLabel || "unknown").toLowerCase()} ambiguity.`,
      watchFor: "Wait for a more believable rebound before treating a green tape as permission to add broad risk.",
      invalidation: stressMode?.changeTrigger || `Wait for ${stressMode?.confirmation || "confirmation"}.`,
      sourceLabel: "Decision engine",
      isBlockedState: true,
    };
  }

  return {
    id: "avoid-cutting-ballast",
    type: "hold",
    ticker: defensiveTicker,
    adviceTitle: `Do not cut ${defensiveTicker} too early`,
    size: "Keep current size",
    funding: "No change",
    conviction: `${defensiveTicker} is still buying time for the rest of the portfolio.`,
    whyNow: `Do not cut protection too early while the book is still carrying enough special-situation and growth risk to need ballast.`,
    watchFor: "Only reduce ballast when recovery chance improves and the bounce remains real for long enough.",
    invalidation: "If protection stops helping during weak tape, reassess the ballast sleeve first.",
    sourceLabel: "Decision engine",
  };
}

function buildBackupAdvice(snapshot) {
  const defensiveTicker = snapshot?.overview?.selected_hedge || pickFundingSource(snapshot, []);
  return {
    id: `keep-${defensiveTicker}`,
    type: "hold",
    ticker: defensiveTicker,
    adviceTitle: `Keep ${defensiveTicker} as ballast`,
    size: "Keep current size",
    sizeValue: 0,
    funding: "No change",
    conviction: `${defensiveTicker} is the sleeve preserving room to act later.`,
    whyNow: `${defensiveTicker} is still the portfolio sleeve most likely to buy time if the market weakens again.`,
    watchFor: "Only cut this ballast when recovery chance improves and the bounce remains real long enough to trust.",
    invalidation: "If protection stops helping during weak tape, reassess the ballast sleeve.",
    sourceLabel: "Decision engine",
  };
}

function normalizeDecisionPacket(packet, snapshot, stressMode, sharedAlpha) {
  const memory = packet?.memory || {};
  const moves = Array.isArray(packet?.moves) ? packet.moves : [];
  const currentRead = Array.isArray(packet?.current_read) ? packet.current_read : [];
  const thresholds = Array.isArray(packet?.thresholds) ? packet.thresholds : [];
  return {
    id: packet?.id || "advice",
    kicker: packet?.kicker || "Decision packet",
    title: packet?.title || "Just advice",
    headline: packet?.headline || "Keep the portfolio recoverable before widening risk",
    summary: packet?.summary || "Plain-language advice for this exact portfolio.",
    currentRead: currentRead.map((item) => ({
      label: item.label,
      value: item.value,
      detail: item.detail,
    })),
    moves: moves.map((move, index) => ({
      id: move.id || `move-${index}`,
      slot: move.slot || ["Best now", "Also valid", "Not yet"][index] || "Advice",
      slotTone: move.slotTone || "neutral",
      tone: move.tone || "hold",
      title: move.title || "Advice",
      ticker: move.ticker || "",
      size: move.size || "-",
      funding: move.funding || "No change",
      summary: move.summary || move.why || "",
      why: move.why || move.summary || "",
      watchFor: move.watchFor || null,
      fiberLine: move.fiberLine || packet?.fiberTakeaway || stressMode?.fiberAtlas?.takeaway || null,
      trigger: move.trigger || packet?.changeTrigger || null,
      sourceLabel: move.sourceLabel || "Decision engine",
      effects: Array.isArray(move.effects) ? move.effects : [],
    })),
    thresholds: thresholds.map((item) => ({
      id: item.id,
      label: item.label,
      meaning: item.meaning,
      active: Boolean(item.active),
    })),
    fiberTakeaway: packet?.fiberTakeaway || stressMode?.fiberAtlas?.takeaway || "Comparable-state read unavailable.",
    changeTrigger: packet?.changeTrigger || null,
    memory: {
      available: Boolean(memory.available),
      policyMemory: memory.policy_memory || memory.policyMemory || {},
      auditSummary: memory.audit_summary || memory.auditSummary || {},
      narrative: Array.isArray(packet?.memoryNarrative) ? packet.memoryNarrative : memory.narrative || [],
      penaltyReason: memory.penalty_reason || memory.penaltyReason || null,
      confidencePenalty: memory.confidence_penalty || memory.confidencePenalty || null,
      recentConsecutiveErrors: memory.recent_consecutive_errors || memory.recentConsecutiveErrors || null,
      accuracyOverall: memory.accuracy_overall || memory.accuracyOverall || null,
      calibrationGap: memory.calibration_gap || memory.calibrationGap || null,
      recentDecisions: memory.recent_decisions || memory.recentDecisions || [],
    },
    memoryNarrative: Array.isArray(packet?.memoryNarrative)
      ? packet.memoryNarrative
      : memory.narrative || [],
    stateSummary: packet?.stateSummary || {},
  };
}

function buildJustAdviceModule(snapshot, modules, stressMode, sharedAlpha) {
  if (snapshot?.decision_packet) {
    return normalizeDecisionPacket(snapshot.decision_packet, snapshot, stressMode, sharedAlpha);
  }
  const holdings = getPortfolioHoldings(snapshot);
  const sortedHoldings = [...holdings].sort((left, right) => numberOr(right.weight, 0) - numberOr(left.weight, 0));
  const biggestHolding = sortedHoldings[0] || sharedAlpha?.portfolio?.holdings?.[0] || null;
  const primaryAction = modules?.actions?.actions?.[0] || null;
  const secondaryAction = modules?.actions?.actions?.[1] || buildBackupAdvice(snapshot);
  const cautionAction = buildCautionAdvice(snapshot, modules, stressMode);
  const moves = [
    buildAdviceMove(primaryAction, snapshot, modules, stressMode, "primary"),
    buildAdviceMove(secondaryAction, snapshot, modules, stressMode, "secondary"),
    buildAdviceMove(cautionAction, snapshot, modules, stressMode, "caution"),
  ].filter(Boolean);
  const thresholds = buildAdviceThresholds(stressMode);

  return {
    id: "advice",
    kicker: "Advice",
    title: "Just advice",
    headline: buildAdviceHeadline(primaryAction, secondaryAction, stressMode),
    summary: "Plain-language advice for this exact portfolio. Start here, then open the deeper modules only if you need to understand why.",
    currentRead: [
      { label: "Holdings", value: String(modules?.portfolio?.analytics?.holdingsCount || holdings.length || 0), detail: biggestHolding ? `Biggest holding: ${biggestHolding.ticker} at ${fmtPct(biggestHolding.weight)}` : "Portfolio size unavailable" },
      { label: "Recovery chance", value: stressMode?.recoverability || "-", detail: "Above 60% opens wider staged adds. Below 35% means protect first." },
      { label: "False rebound risk", value: stressMode?.phantom || "-", detail: "Higher means green days are easier to fake." },
      { label: "Evidence strength", value: stressMode?.authorityLabel || "-", detail: stressMode?.fiberAtlas?.headline || "Comparable-state history unavailable." },
    ],
    moves,
    thresholds,
    fiberTakeaway: stressMode?.fiberAtlas?.takeaway || "Comparable-state read unavailable.",
    changeTrigger: stressMode?.changeTrigger || null,
  };
}

function buildProtocolModule(snapshot, sharedAlpha) {
  if (getCanonicalContract(snapshot)) {
    return buildContractProtocolModule(snapshot, sharedAlpha);
  }

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
      shock: "Narrow idea breadth across the portfolio",
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
    title: "Decision Rules",
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
    title: "Decision Rules",
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

function buildContractProtocolModule(snapshot, sharedAlpha) {
  const fallback = sharedAlpha.protocol;
  const playbook = buildPlaybookModule(snapshot, sharedAlpha);
  const contract = getCanonicalContract(snapshot);
  const policy = contract?.policy_state || {};
  const probabilistic = contract?.probabilistic_state || {};
  const trustScore = numberOr(probabilistic.authority_score, fallback.trustScore);
  const autonomyScore = numberOr(probabilistic.p_portfolio_recoverability, fallback.autonomyScore);
  const frontierDistance = autonomyScore - numberOr(probabilistic.p_phantom_rebound, 0);
  const mode = String(policy.mode || "observe").toLowerCase();
  const trustState = mode === "act" ? "Act" : mode === "stage" ? "Stage" : mode === "protect" ? "Protect" : "Observe";

  return {
    id: "command",
    kicker: "Protocol",
    title: "Decision Rules",
    protocol: `${mode}_mode`,
    protocolLabel: `${trustState} Mode`,
    trustScore: fmtPct(trustScore),
    trustState,
    decisionRights:
      mode === "act" ? "Act inside contract frontier"
        : mode === "stage" ? "Stage additions"
          : mode === "protect" ? "Protect and explain"
            : "Observe and confirm",
    autonomyScore: fmtPct(autonomyScore),
    frontierDistance: formatSignedPct(frontierDistance),
    recoverabilityBudget: autonomyScore >= 0.7 ? "Healthy" : autonomyScore >= 0.5 ? "Narrow" : "Tight",
    supportDependency: [
      {
        id: "recoverability",
        label: "Recoverability",
        value: fmtPct(autonomyScore),
        numeric: clamp01(autonomyScore),
      },
      {
        id: "phantom_rebound",
        label: "Phantom rebound",
        value: fmtPct(numberOr(probabilistic.p_phantom_rebound, 0)),
        numeric: clamp01(numberOr(probabilistic.p_phantom_rebound, 0)),
      },
    ],
    protectiveValue: [
      {
        id: "hedge_floor",
        label: "Hedge floor",
        value: fmtPct(numberOr(policy.hedge_floor, 0)),
        numeric: clamp01(numberOr(policy.hedge_floor, 0)),
      },
      {
        id: "gross_add",
        label: "Max gross add",
        value: fmtPct(numberOr(policy.max_gross_add, 0)),
        numeric: clamp01(numberOr(policy.max_gross_add, 0)),
      },
    ],
    stepDownTrials: (policy.invalidation_rules || []).slice(0, 3).map((rule, index) => ({
      name: `Invalidation ${index + 1}`,
      shock: String(rule),
      autonomyScore: fmtPct(autonomyScore),
      verdict: "Review immediately",
    })),
    disproofSleeve: policy.forbidden_sleeves || fallback.disproofSleeve,
    playbook,
    notes: [
      `Mode is ${trustState.toLowerCase()} with authority ${fmtPct(trustScore)}.`,
      `Required confirmation: ${String(policy.required_confirmation || "n/a").replace(/_/g, " ")}.`,
      `Review cadence is ${policy.review_cadence || "n/a"} with rebalance delay ${policy.rebalance_delay ?? "n/a"}.`,
    ],
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
    title: "Market Read",
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
  const holdings = portfolio?.holdings || portfolio?.top_holdings || [];
  const holdingsSource = describeHoldingsSource(snapshot);
  const holdingsSync = {
    status: String(portfolio.holdings_sync_status || "").trim() || null,
    label: String(portfolio.holdings_sync_label || "").trim() || null,
  };
  const alignment = portfolio?.alignment || {};
  const analytics = portfolio?.analytics || {};
  const fallbackAnalytics = sharedAlpha.analytics;
  const rows = holdings;
  const liveGrowthComparison = buildPortfolioTrend(portfolio.current_mix_vs_spy);
  const liveSectorExposure = buildSectorExposure(portfolio.sector_weights);
  const liveValuationDistribution = buildValuationDistribution(portfolio.valuation_histogram);

  return {
    id: "portfolio",
    kicker: "Portfolio",
    title: "Your Portfolio",
    holdings: rows.map((row) => ({
      ticker: row.ticker,
      sector: row.sector || "Unknown",
      weight: fmtPct(row.weight),
      quantity: numberOr(row.quantity, null),
      marketValueUsd: numberOr(row.market_value_usd, null),
      currentPriceUsd: numberOr(row.current_price_usd, null),
      upside: row.upside === null || row.upside === undefined ? "Briefing" : fmtPct(row.upside),
      composite: numberOr(row.composite_score, null),
      conviction: row.conviction || null,
    })),
    notes: alignment.notes?.length ? alignment.notes : [],
    shadowBalance: portfolio.shadowBalance || { assets: [], liabilities: [] },
    topSectors: (portfolio?.sector_weights || []).slice(0, 4),
    watchlistCount,
    analytics: {
      asOf: analytics["As of"] || fallbackAnalytics.asOf || snapshot?.generated_at,
      beta: fmtPct(numberOr(alignment.portfolio_beta, numberOr(analytics.Beta, null))),
      holdingsCount: analytics["Holdings Count"] || holdings.length || 0,
      annualReturn: fmtPct(numberOr(analytics["Annual Return"], null)),
      annualVolatility: fmtPct(numberOr(analytics["Annual Volatility"], null)),
      sharpeRatio: formatNumberLike(numberOr(analytics["Sharpe Ratio"], null)),
    },
    charts: {
      growthComparison: liveGrowthComparison,
      sectorExposure: liveSectorExposure,
      valuationDistribution: liveValuationDistribution,
    },
    chartSource:
      liveGrowthComparison.length || liveSectorExposure.length || liveValuationDistribution.length
        ? "Live portfolio snapshot"
        : "No live portfolio history yet",
    holdingsSource,
    holdingsSync,
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

function buildVolatilityClusterDecomposition(snapshot, sharedAlpha) {
  const contract = getCanonicalContract(snapshot);
  if (contract) {
    const probabilistic = contract.probabilistic_state || {};
    const gScore = clamp01(numberOr(probabilistic.p_structural_dominance, 0));
    const rScore = clamp01(numberOr(probabilistic.p_regime_shock_dominance, 0));
    const dominant = probabilistic.cluster_type || "mixed";
    const dominantLabel = humanizeClusterLabel(dominant);
    const stance =
      dominant === "G-dominated"
        ? "Internal weakness matters more than a short bounce. Improve resilience before adding risk."
        : dominant === "R-dominated"
          ? "The move looks more shock-driven than structurally broken. A rebound is more plausible if conditions stabilize."
          : dominant === "compound"
            ? "Both internal weakness and shock pressure are elevated. Keep protection first."
            : "Signals are mixed. Wait for clearer improvement before widening risk.";
    return {
      dominant,
      dominantLabel,
      gScore,
      rScore,
      gLabel: fmtPct(gScore),
      rLabel: fmtPct(rScore),
      gMeaning:
        gScore >= 0.6 ? "Internal weakness is the main problem." : gScore <= 0.25 ? "Internal weakness is not the main problem." : "Internal weakness matters, but it is not dominant.",
      rMeaning:
        rScore >= 0.6 ? "Shock pressure is high enough to keep markets unstable." : rScore <= 0.25 ? "Shock pressure is not the main issue." : "Shock pressure is present, but not dominant.",
      stance,
      drivers: [
        `Internal weakness is ${fmtPct(gScore)}.`,
        `Shock pressure is ${fmtPct(rScore)}.`,
        `Confidence in this read is ${fmtPct(probabilistic.authority_score)}.`,
      ],
    };
  }

  const latest = snapshot?.risk?.spectral?.latest || {};
  const fallbackSpectral = sharedAlpha?.spectral || {};
  const compression = clamp01(numberOr(latest.compression_score, ratioOrPercent(fallbackSpectral.compressionScore, 0.41)));
  const freedom = clamp01(numberOr(latest.freedom_score, ratioOrPercent(fallbackSpectral.freedomScore, 0.59)));
  const crashProb = clamp01(numberOr(snapshot?.overview?.crash_prob, 0.34));
  const tailRisk = clamp01(numberOr(snapshot?.overview?.tail_risk_score, 0.31));
  const fragility = clamp01(numberOr(snapshot?.overview?.legitimacy_risk, 0.38));
  const gScore = clamp01((compression * 0.45) + ((1 - freedom) * 0.3) + (fragility * 0.25));
  const rScore = clamp01((crashProb * 0.45) + (tailRisk * 0.4) + (Math.max(crashProb - fragility, 0) * 0.15));
  const gap = gScore - rScore;
  const dominant = gap > 0.07 ? "G-dominated" : gap < -0.07 ? "R-dominated" : "Mixed";
  const dominantLabel = humanizeClusterLabel(dominant);
  const stance =
    dominant === "G-dominated"
      ? "Do not assume a fast rebound. Reduce fragility first."
      : dominant === "R-dominated"
        ? "Waiting for the rebound is more defensible while the shock stays acute."
        : "Treat rebounds selectively until structure and shock pressure separate more clearly.";
  const drivers = [
    `Structural pressure is ${fmtPct(gScore)} from crowding ${fmtPct(compression)} and breadth loss ${fmtPct(1 - freedom)}.`,
    `Regime shock pressure is ${fmtPct(rScore)} from crash probability ${fmtPct(crashProb)} and tail risk ${fmtPct(tailRisk)}.`,
    dominant === "G-dominated"
      ? "This cluster looks structural, so rebound advice should be skeptical."
      : dominant === "R-dominated"
        ? "This cluster looks shock-led, so a rebound can still be the right base case."
        : "This cluster mixes structural fragility with acute shock pressure.",
  ];

  return {
    dominant,
    dominantLabel,
    gScore,
    rScore,
    gLabel: fmtPct(gScore),
    rLabel: fmtPct(rScore),
    gMeaning:
      gScore >= 0.6 ? "Internal weakness is the main problem." : gScore <= 0.25 ? "Internal weakness is not the main problem." : "Internal weakness matters, but it is not dominant.",
    rMeaning:
      rScore >= 0.6 ? "Shock pressure is high enough to keep markets unstable." : rScore <= 0.25 ? "Shock pressure is not the main issue." : "Shock pressure is present, but not dominant.",
    stance,
    drivers,
  };
}

function buildReboundConfidence(snapshot, sharedAlpha) {
  const contract = getCanonicalContract(snapshot);
  if (contract) {
    const probabilistic = contract.probabilistic_state || {};
    const score = clamp01(numberOr(probabilistic.p_portfolio_recoverability, 0));
    const state = score >= 0.67 ? "High" : score >= 0.45 ? "Conditional" : "Low";
    const horizonDays = numberOr(contract.horizon_days, 20);
    const horizon = horizonDays <= 5 ? "1-5 days" : horizonDays <= 20 ? "5-20 days" : `${horizonDays} days`;
    const note =
      state === "High"
        ? "Recoverability is strong enough that staged risk can be justified from the current state."
        : state === "Conditional"
          ? "Visible relief is possible, but the portfolio should wait for structural confirmation before widening action rights."
          : "Recoverability is weak enough that passive patience can become complacency from this state.";
    return {
      score,
      state,
      scoreLabel: fmtPct(score),
      horizon,
      note,
    };
  }

  const latest = snapshot?.risk?.spectral?.latest || {};
  const fallbackSpectral = sharedAlpha?.spectral || {};
  const effectiveDimension = numberOr(latest.effective_dimension, numberOr(fallbackSpectral.effectiveDimension, 6.2));
  const freedom = clamp01(numberOr(latest.freedom_score, ratioOrPercent(fallbackSpectral.freedomScore, 0.59)));
  const compression = clamp01(numberOr(latest.compression_score, ratioOrPercent(fallbackSpectral.compressionScore, 0.41)));
  const tailRisk = clamp01(numberOr(snapshot?.overview?.tail_risk_score, 0.31));
  const crashProb = clamp01(numberOr(snapshot?.overview?.crash_prob, 0.34));
  const dimensionScore = clamp01(effectiveDimension / 8);
  const score = clamp01((freedom * 0.34) + (dimensionScore * 0.28) + ((1 - compression) * 0.2) + ((1 - tailRisk) * 0.1) + ((1 - crashProb) * 0.08));
  const state = score >= 0.67 ? "High" : score >= 0.45 ? "Conditional" : "Low";
  const horizon = score >= 0.67 ? "3-6 months" : score >= 0.45 ? "6-12 months" : "18-36 months";
  const note =
    state === "High"
      ? "Recoverability is good enough that holding through drawdowns is usually justified."
      : state === "Conditional"
        ? "Rebounds are possible, but the system should wait for structural confirmation."
        : "Blindly waiting is complacent here because the market may not restore diversification quickly.";

  return {
    score,
    state,
    scoreLabel: fmtPct(score),
    horizon,
    note,
  };
}

function buildReboundQuality(snapshot, sharedAlpha) {
  const contract = getCanonicalContract(snapshot);
  if (contract) {
    const measured = contract.measured_state || {};
    const probabilistic = contract.probabilistic_state || {};
    const score = clamp01(numberOr(probabilistic.p_structural_restoration, 0));
    const phantom = clamp01(numberOr(probabilistic.p_phantom_rebound, 0));
    const state = score >= 0.67 ? "Restorative" : score >= 0.45 ? "Mixed" : "Palliative";
    const note =
      state === "Restorative"
        ? "The rebound is more likely to reopen structure than simply relieve price pressure."
        : state === "Mixed"
          ? "Price relief is outpacing structural repair, so follow-through still needs confirmation."
          : "This rebound looks more palliative than reparative. Price may rise without healing the structure.";
    return {
      score,
      state,
      scoreLabel: fmtPct(score),
      note,
      pillars: [
        { label: "Restoration", value: fmtPct(score) },
        { label: "Phantom risk", value: fmtPct(phantom) },
        { label: "Compression", value: fmtPct(numberOr(measured.market_compression, 0)) },
        { label: "D_eff", value: formatNumberLike(numberOr(measured.market_effective_dimension, null), 1) },
      ],
    };
  }

  const latest = snapshot?.risk?.spectral?.latest || {};
  const fallbackSpectral = sharedAlpha?.spectral || {};
  const freedom = clamp01(numberOr(latest.freedom_score, ratioOrPercent(fallbackSpectral.freedomScore, 0.59)));
  const compression = clamp01(numberOr(latest.compression_score, ratioOrPercent(fallbackSpectral.compressionScore, 0.41)));
  const effectiveDimension = numberOr(latest.effective_dimension, numberOr(fallbackSpectral.effectiveDimension, 6.2));
  const eig1Share = clamp01(numberOr(latest.eig1_share, ratioOrPercent(fallbackSpectral.eig1Share, 0.24)));
  const dimensionScore = clamp01(effectiveDimension / 8);
  const score = clamp01((freedom * 0.4) + (dimensionScore * 0.3) + ((1 - compression) * 0.15) + ((1 - eig1Share) * 0.15));
  const state = score >= 0.67 ? "Restorative" : score >= 0.45 ? "Mixed" : "Palliative";
  const note =
    state === "Restorative"
      ? "The rebound is improving breadth and reducing concentration, so the structure is healing."
      : state === "Mixed"
        ? "Prices may be recovering faster than the structure, so follow-through still needs confirmation."
        : "This looks like relief without real structural repair; fragility is probably being reloaded.";

  return {
    score,
    state,
    scoreLabel: fmtPct(score),
    note,
    pillars: [
      { label: "Breadth", value: fmtPct(freedom) },
      { label: "D_eff", value: formatNumberLike(effectiveDimension, 1) },
      { label: "Compression", value: fmtPct(compression) },
      { label: "Top factor", value: fmtPct(eig1Share) },
    ],
  };
}

function buildHistoricalReboundSignals(snapshot, sharedAlpha) {
  const contract = getCanonicalContract(snapshot);
  if (contract && Array.isArray(contract.analogs) && contract.analogs.length) {
    return contract.analogs.slice(0, 8).map((row, index) => ({
      date: row.as_of || `A-${index + 1}`,
      confidence: clamp01(numberOr(row.p_visible_correction_realized, 0)),
      quality: clamp01(numberOr(row.p_structural_restoration_realized, 0)),
      compression: clamp01(numberOr(snapshot?.bls_state_v1?.measured_state?.market_compression, 0)),
      vix: numberOr(snapshot?.bls_state_v1?.measured_state?.macro_vix, numberOr(sharedAlpha?.risk?.vix, null)),
    }));
  }

  const history = Array.isArray(snapshot?.risk?.spectral?.history) ? snapshot.risk.spectral.history : [];
  const fallbackVix = numberOr(sharedAlpha?.risk?.vix, null);

  return history
    .slice(-48)
    .map((row, index, rows) => {
      const compression = clamp01(numberOr(row.compression_score, null));
      const freedom = clamp01(numberOr(row.freedom_score, 1 - compression));
      const effectiveDimension = numberOr(row.effective_dimension, null);
      const eig1Share = clamp01(numberOr(row.eig1_share, null));
      if (compression === null || freedom === null || effectiveDimension === null || eig1Share === null) return null;
      const dimensionScore = clamp01(effectiveDimension / 8);
      const confidence = clamp01((freedom * 0.38) + (dimensionScore * 0.32) + ((1 - compression) * 0.18) + ((1 - eig1Share) * 0.12));
      const quality = clamp01((freedom * 0.4) + (dimensionScore * 0.3) + ((1 - compression) * 0.15) + ((1 - eig1Share) * 0.15));
      return {
        date: row.date || `H-${rows.length - index}`,
        confidence,
        quality,
        compression,
        vix: numberOr(row.vix, fallbackVix),
      };
    })
    .filter(Boolean);
}

function buildScannerModule(snapshot, sharedAlpha) {
  const screener = snapshot?.screener || {};
  const rows = screener.rows || [];
  const holdingTickers = getHoldingTickerSet(snapshot, sharedAlpha);
  const liveIdeas = filterScannerIdeas(rows, holdingTickers);
  const visibleRows = liveIdeas.slice(0, 8);

  return {
    id: "scanner",
    kicker: "Ideas",
    title: "Stock Ideas",
    source: screener.source_file || "discovery_screener.csv",
    sourceLabel: liveIdeas.length ? `Live screener: ${screener.source_file || "discovery_screener.csv"}` : "No live screener output yet",
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
        : "No live discovery artifact is available yet, so no seeded ideas are being shown.",
  };
}

function buildRiskModule(snapshot, sharedAlpha) {
  const risk = snapshot?.risk || {};
  const fallback = sharedAlpha.risk;
  const cluster = buildVolatilityClusterDecomposition(snapshot, sharedAlpha);
  const reboundConfidence = buildReboundConfidence(snapshot, sharedAlpha);
  const reboundHistory = buildHistoricalReboundSignals(snapshot, sharedAlpha);
  const vixLevel = getVixLevel(snapshot, sharedAlpha);
  const liveMetrics = [
    { label: "VIX", value: vixLevel === null ? "-" : formatNumberLike(vixLevel, 1) },
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
    signalBars: liveSignalBars,
    narrative: [
      cluster.stance,
      reboundConfidence.note,
      ...(narrative.length ? narrative : fallback.narrative),
    ].slice(0, 5),
    clusterDecomposition: cluster,
    reboundConfidence: {
      ...reboundConfidence,
      history: reboundHistory.map((row) => ({ date: row.date, value: row.confidence, vix: row.vix })),
    },
    chartSource: liveSignalBars.length ? "Live structural inputs" : "No live structural inputs yet",
  };
}

function buildSpectralModule(snapshot, sharedAlpha) {
  const latest = snapshot?.risk?.spectral?.latest || {};
  const fallback = sharedAlpha.spectral;
  const reboundQuality = buildReboundQuality(snapshot, sharedAlpha);
  const reboundHistory = buildHistoricalReboundSignals(snapshot, sharedAlpha);
  return {
    id: "spectral",
    kicker: "Balance",
    title: "Diversification Map",
    compressionScore: latest.compression_score !== undefined ? fmtPct(latest.compression_score) : fallback.compressionScore,
    freedomScore: latest.freedom_score !== undefined ? fmtPct(latest.freedom_score) : fallback.freedomScore,
    effectiveDimension: numberOr(latest.effective_dimension, fallback.effectiveDimension),
    eig1Share: latest.eig1_share !== undefined ? fmtPct(latest.eig1_share) : fallback.eig1Share,
    state: latest.structural_state || "transition",
    reboundQuality: {
      ...reboundQuality,
      history: reboundHistory.map((row) => ({ date: row.date, value: row.quality, compression: row.compression })),
    },
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
    rows: preferred.slice(0, 6).map((row) => ({
      label: row.label || row.sector || row.proxy_ticker || "Theme",
      signal: row.signal || row.view || "monitor",
      score: numberOr(row.score, numberOr(row.opportunity_score, null)),
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
      : "No live international ranking is available yet.",
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
  const contractStatus = getContractStatus(snapshot);
  const fallbackDecisionEvents = Array.isArray(snapshot?.decision_events) ? snapshot.decision_events : [];
  const decisionEventLog = snapshot?.decision_event_log || {
    available: fallbackDecisionEvents.length > 0 || Boolean(snapshot?.decision_event),
    events: fallbackDecisionEvents,
    latest_refresh: snapshot?.decision_event || null,
  };
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
  const stressMode = buildStressMode(snapshot, modules);
  const decisionPacket = snapshot?.decision_packet || null;

  return {
    contract_status: contractStatus,
    decision_packet: decisionPacket,
    decision_event_log: decisionEventLog,
    decision_event: snapshot?.decision_event || decisionEventLog.latest_refresh || null,
    decision_events: Array.isArray(snapshot?.decision_events)
      ? snapshot.decision_events
      : Array.isArray(decisionEventLog.events)
        ? decisionEventLog.events
        : [],
    just_advice: buildJustAdviceModule(snapshot, modules, stressMode, alpha),
    stress_mode: stressMode,
    workspace_summary: {
      id: workspaceId,
      name: "BLS Prime Alpha",
      persona: "Retail decision terminal",
      mode: "Invite-only alpha",
      last_updated: snapshot?.generated_at || alpha.analytics.asOf || new Date().toISOString(),
      last_updated_label: formatUpdatedAt(snapshot?.generated_at || alpha.analytics.asOf),
      market_data_as_of: snapshot?.portfolio?.quotes_as_of || snapshot?.as_of_date || null,
      market_data_label: formatMarketDataLabel(
        snapshot?.portfolio?.quotes_as_of || snapshot?.as_of_date,
        snapshot?.portfolio?.quotes_stale_days ?? null,
      ),
      backend_status: snapshot?.status?.warnings?.length ? "briefing" : "live",
      primary_stance: humanizeEngineLabel(snapshot?.overview?.recommended_action) || alpha.command.readout,
    },
    data_control: {
      analysisSource: snapshot?.status?.warnings?.length ? "Live backend, partial analysis" : "Live backend",
      contractStatus,
      holdingsSource: modules.portfolio.holdingsSource,
      screenerSource: modules.scanner.sourceLabel,
      lastRefreshLabel: formatUpdatedAt(snapshot?.generated_at || alpha.analytics.asOf),
      marketData: {
        asOf: snapshot?.portfolio?.quotes_as_of || snapshot?.as_of_date || null,
        staleDays: snapshot?.portfolio?.quotes_stale_days ?? null,
        freshnessLabel: formatMarketDataLabel(
          snapshot?.portfolio?.quotes_as_of || snapshot?.as_of_date,
          snapshot?.portfolio?.quotes_stale_days ?? null,
        ),
      },
      notes: [
        "Refresh asks Railway to rebuild the research snapshot behind the terminal.",
        "Price tiles show the last market date in the snapshot. The stream does not invent live prices anymore.",
        "Stock ideas only appear when Railway promotes a fresh discovery screener artifact.",
        modules.portfolio.holdingsSource?.connected
          ? "Private holdings overlay is connected."
          : "Private holdings overlay is not connected; the UI is showing backend snapshot data only.",
        contractStatus === "canonical_valid"
          ? "Canonical backend state is driving the decision engine."
          : "Some decision-engine inputs are unavailable, so the app is showing limited live output instead of seeded fallback content.",
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
      holdings_source: modules.portfolio.holdingsSource?.source || null,
      holdings_source_label: modules.portfolio.holdingsSource?.label || null,
      holdings_sync_status: modules.portfolio.holdingsSync?.status || null,
      holdings_sync_label: modules.portfolio.holdingsSync?.label || null,
    },
    alpha_briefing: {
      asOf: alpha.asOf,
      pulse: alpha.pulse,
      frameworkSignal: {
        cluster: modules.risk.clusterDecomposition.dominantLabel || modules.risk.clusterDecomposition.dominant,
        reboundConfidence: modules.risk.reboundConfidence.state,
        reboundQuality: modules.spectral.reboundQuality.state,
      },
      topIdeas: watchlist.slice(0, 4),
      stats: [
        { label: "Annual return", value: fmtPct(alpha.analytics.annualReturn) },
        { label: "Typical swings", value: fmtPct(alpha.analytics.annualVolatility) },
        { label: "Reward vs risk", value: formatNumberLike(alpha.analytics.sharpeRatio) },
        { label: "Holdings", value: String(alpha.analytics.holdingsCount) },
      ],
    },
    playbook: buildPlaybookModule(snapshot, alpha),
    watchlist,
    saved_views: savedViews || [],
    command_history: commandHistory || [],
    module_refs: MODULE_META.map(([id, title, kicker]) => ({ id, title, kicker })),
    modules,
  };
}
