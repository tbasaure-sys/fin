import {
  FALLBACK_SCENARIOS,
} from "./demo-data.js";
import { SHARED_ALPHA_PROFILE } from "./shared-alpha-data.js";
import { getFormattingConfig, getServerConfig } from "./config.js";

const MODULE_META = [
  ["actions", "Today's Plan", "Plan"],
  ["command", "Why This Plan", "Why"],
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
  if (value === null || value === undefined || value === "") return fallback;
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

function formatCurrency(value) {
  const parsed = numberOr(value, null);
  if (parsed === null) return "-";
  const formatting = getFormattingConfig();
  return new Intl.NumberFormat(formatting.locale, {
    style: "currency",
    currency: formatting.currency,
    maximumFractionDigits: parsed >= 1000 ? 0 : 2,
  }).format(parsed);
}

function humanizeEngineLabel(value) {
  if (!value) return "";
  if (typeof value !== "string") return String(value);
  const betaMatch = value.match(/^beta[_-]?(\d{2,3})$/i);
  if (betaMatch) {
    const beta = Number(betaMatch[1]) / 100;
    if (beta <= 0.25) return "Stay defensive";
    if (beta <= 0.45) return "Stay measured";
    if (beta <= 0.75) return "Add selectively";
    return "Risk-on, but selective";
  }
  if (value === "beta_040") return "Stay measured";
  if (value === "beta_020") return "Stay defensive";
  if (value === "beta_060") return "Add selectively";
  if (value === "protect") return "Stay defensive";
  if (value === "stage") return "Add selectively";
  if (value === "act") return "Risk-on, but selective";
  if (value.includes(" ")) return value;

  return value
    .replace(/_/g, " ")
    .replace(/\b\d+\b/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function normalizeWorkspaceName(value) {
  const text = String(value || "").trim();
  if (!text) return "BLS Prime";
  return /allocator workspace/i.test(text) ? "BLS Prime" : text;
}

function humanizeContractStatus(value) {
  if (!value) return "Modo respaldo";
  if (value === "canonical_valid") return "Lectura viva";
  if (value === "canonical_invalid_warn") return "Lectura limitada";
  if (value === "fallback_cached_valid") return "Lectura guardada";
  if (value === "fallback_legacy") return "Modo respaldo";
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
      summary: "Wait before adding more risk",
      source: "canonical_frontier_block",
      classification: "wait",
      funding: "Mantener caja disponible",
      firstConstraint:
        Array.isArray(policy.forbidden_sleeves) && policy.forbidden_sleeves.length
          ? `Still blocked for: ${policy.forbidden_sleeves.join(", ")}`
          : `The current protection mode is still blocking new buys`,
      firstInvalidation: `Review again after ${confirmation}.`,
      reason: "The market still does not support adding more risk with confidence.",
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
      ? "Many similar-looking states later broke down. That argues for tighter risk."
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
  if (score >= 0.68) return "Fuerte";
  if (score >= 0.46) return "Evidencia usable";
  return "Limitada";
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
    : "La lectura usa una ruta parcial mientras termina de cargar la sesión.";
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
    topAnalog: topAnalog ? `${topAnalog.as_of} · ${fmtPct(topAnalog.p_structural_restoration_realized)}` : "Sin análogos todavía",
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
  if (!value) return "Esperando actualización";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const ageMs = Math.max(0, Date.now() - date.getTime());
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours >= 18) return "Necesita actualización";

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
  if (stale === 0) return "Sesión actual";
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
          ? "Market conditions still favor risk discipline."
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
      explanation: "Structural view unavailable.",
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
  if (frontierDistance >= 0.05) return "Saludable";
  if (frontierDistance >= -0.02) return "Ajustado";
  return "Estrecho";
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
  if (value === "fallback_legacy") return "Modo respaldo";
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
    .replace("portfolio recoverability", "probabilidad de recuperacion")
    .replace("phantom rebound", "rebote dudoso")
    .replace("authority score", "fuerza de evidencia")
    .replace("visible correction", "calidad del rebote")
    .replace("structural restoration", "mejora estructural")
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
  const validIndexValue = (value) => {
    const numeric = numberOr(value, null);
    return numeric !== null && numeric > 0 ? numeric : null;
  };

  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({
      date: row?.date || row?.as_of || String(index),
      portfolio: validIndexValue(row?.portfolio_growth),
      valueGrowth: validIndexValue(row?.value_growth),
      benchmark: validIndexValue(row?.spy_growth ?? row?.benchmark_growth),
      externalFlowUsd: numberOr(row?.external_flow_usd, 0),
      periodReturn: numberOr(row?.period_return, null),
      performanceMethod: String(row?.performance_method || "").trim() || null,
    }))
    .filter((row) => row.portfolio !== null || row.benchmark !== null)
    .sort((left, right) => {
      const leftDate = parseTimelineDate(left.date);
      const rightDate = parseTimelineDate(right.date);
      if (leftDate && rightDate) return leftDate.getTime() - rightDate.getTime();
      return String(left.date).localeCompare(String(right.date));
    });
}

function parseTimelineDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffInDays(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) return null;
  const millis = end.getTime() - start.getTime();
  if (!Number.isFinite(millis)) return null;
  return millis / (24 * 60 * 60 * 1000);
}

function getSnapshotAgeDays(snapshot) {
  const generatedAt = parseTimelineDate(snapshot?.generated_at || snapshot?.portfolio?.quotes_as_of || snapshot?.as_of_date);
  if (!generatedAt) return null;
  return diffInDays(generatedAt, new Date());
}

function sumHoldingsMarketValue(rows) {
  const total = (Array.isArray(rows) ? rows : []).reduce(
    (sum, row) => sum + Math.max(
      0,
      numberOr(row?.market_value_usd, numberOr(row?.analysis_value_usd, numberOr(row?.analysisValueUsd, numberOr(row?.broker_value_usd, numberOr(row?.brokerValueUsd, 0))))),
    ),
    0,
  );
  return total > 0 ? total : null;
}

function isSuspiciousAlternatingPerformanceSeries(points) {
  const returns = [];
  for (let index = 1; index < points.length; index += 1) {
    const current = numberOr(points[index]?.portfolio, null);
    const previous = numberOr(points[index - 1]?.portfolio, null);
    if (current === null || previous === null || current <= 0 || previous <= 0) continue;
    const value = (current / previous) - 1;
    if (Number.isFinite(value)) returns.push(value);
  }

  const meaningful = returns.filter((value) => Math.abs(value) >= 0.025);
  if (meaningful.length < 10) return false;

  const flips = meaningful.slice(1).reduce((sum, value, index) => (
    Math.sign(value) !== Math.sign(meaningful[index]) ? sum + 1 : sum
  ), 0);
  const sortedAbs = meaningful.map((value) => Math.abs(value)).sort((left, right) => left - right);
  const medianAbs = sortedAbs[Math.floor(sortedAbs.length / 2)] || 0;
  const values = points.map((point) => numberOr(point?.portfolio, null)).filter((value) => value !== null && value > 0);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = minValue > 0 ? (maxValue / minValue) - 1 : 0;

  return flips / Math.max(1, meaningful.length - 1) >= 0.65 && medianAbs >= 0.04 && range >= 0.08;
}

function buildPerformanceAnalyticsFromSeries(series) {
  const rows = Array.isArray(series) ? series : [];
  const portfolioPoints = rows.filter((row) => numberOr(row?.portfolio, null) !== null);
  const benchmarkPoints = rows.filter((row) => numberOr(row?.benchmark, null) !== null);
  const historyStartDate = parseTimelineDate(portfolioPoints[0]?.date);
  const historyEndDate = parseTimelineDate(portfolioPoints[portfolioPoints.length - 1]?.date);
  const historySpanDays = diffInDays(historyStartDate, historyEndDate);
  const seriesIsSuspicious = isSuspiciousAlternatingPerformanceSeries(portfolioPoints);

  if (portfolioPoints.length < 2) {
    return {
      annualReturn: null,
      annualVolatility: null,
      sharpeRatio: null,
      totalReturn: null,
      benchmarkReturn: null,
      excessReturn: null,
      maxDrawdown: null,
      historyStart: portfolioPoints[0]?.date || null,
      historyEnd: portfolioPoints[portfolioPoints.length - 1]?.date || null,
      sessionCount: portfolioPoints.length,
      historySpanDays,
      seriesIsSuspicious,
    };
  }

  const dailyReturns = [];
  let peak = numberOr(portfolioPoints[0]?.portfolio, null);
  let maxDrawdown = 0;

  for (let index = 0; index < portfolioPoints.length; index += 1) {
    const value = numberOr(portfolioPoints[index]?.portfolio, null);
    if (value === null || value <= 0) continue;

    if (peak === null || value > peak) peak = value;
    if (peak && peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, (value / peak) - 1);
    }

    if (index === 0) continue;
    const previous = numberOr(portfolioPoints[index - 1]?.portfolio, null);
    if (previous !== null && previous > 0) {
      dailyReturns.push((value / previous) - 1);
    }
  }

  const sessionCount = dailyReturns.length;
  const firstPortfolio = numberOr(portfolioPoints[0]?.portfolio, null);
  const lastPortfolio = numberOr(portfolioPoints[portfolioPoints.length - 1]?.portfolio, null);
  const totalReturn = firstPortfolio !== null && lastPortfolio !== null && firstPortfolio > 0
    ? (lastPortfolio / firstPortfolio) - 1
    : null;

  const benchmarkReturn = benchmarkPoints.length >= 2
    ? (() => {
        const firstBenchmark = numberOr(benchmarkPoints[0]?.benchmark, null);
        const lastBenchmark = numberOr(benchmarkPoints[benchmarkPoints.length - 1]?.benchmark, null);
        if (firstBenchmark === null || lastBenchmark === null || firstBenchmark <= 0) return null;
        return (lastBenchmark / firstBenchmark) - 1;
      })()
    : null;

  if (!dailyReturns.length) {
    return {
      annualReturn: null,
      annualVolatility: null,
      sharpeRatio: null,
      totalReturn,
      benchmarkReturn,
      excessReturn: totalReturn !== null && benchmarkReturn !== null ? totalReturn - benchmarkReturn : null,
      maxDrawdown,
      historyStart: portfolioPoints[0]?.date || null,
      historyEnd: portfolioPoints[portfolioPoints.length - 1]?.date || null,
      sessionCount: portfolioPoints.length,
      historySpanDays,
      seriesIsSuspicious,
    };
  }

  const meanReturn = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
  const variance = dailyReturns.length > 1
    ? dailyReturns.reduce((sum, value) => sum + ((value - meanReturn) ** 2), 0) / (dailyReturns.length - 1)
    : 0;
  const dailyVolatility = Math.sqrt(Math.max(variance, 0));
  const annualVolatility = dailyReturns.length >= 5 ? dailyVolatility * Math.sqrt(252) : null;
  const annualReturn = totalReturn !== null && sessionCount >= 5
    ? (Math.pow(1 + totalReturn, 252 / sessionCount) - 1)
    : null;
  const sharpeRatio = annualVolatility && annualVolatility > 0 && sessionCount >= 20
    ? (meanReturn / dailyVolatility) * Math.sqrt(252)
    : null;

  return {
    annualReturn,
    annualVolatility,
    sharpeRatio,
    totalReturn,
    benchmarkReturn,
    excessReturn: totalReturn !== null && benchmarkReturn !== null ? totalReturn - benchmarkReturn : null,
    maxDrawdown,
    historyStart: portfolioPoints[0]?.date || null,
    historyEnd: portfolioPoints[portfolioPoints.length - 1]?.date || null,
    sessionCount: portfolioPoints.length,
    historySpanDays,
    seriesIsSuspicious,
  };
}

function formatMetricLabel(value, formatter, fallback = "Historial corto") {
  return value === null || value === undefined ? fallback : formatter(value);
}

function hasBenchmarkSeriesData(rows) {
  const values = (Array.isArray(rows) ? rows : [])
    .map((row) => numberOr(row?.benchmark, null))
    .filter((value) => value !== null && value > 0);
  if (values.length < 3) return false;
  return (Math.max(...values) - Math.min(...values)) > 0.0005;
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

function buildHoldingReturnBreakdown(rows) {
  const tracked = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const quantity = numberOr(row?.quantity, null);
      const avgCost = numberOr(row?.avg_cost_usd, null);
      const marketValue = numberOr(row?.market_value_usd, numberOr(row?.analysis_value_usd, numberOr(row?.analysisValueUsd, numberOr(row?.broker_value_usd, numberOr(row?.brokerValueUsd, null)))));
      const weight = numberOr(row?.weight, null);
      if (quantity === null || avgCost === null || marketValue === null || quantity <= 0 || avgCost <= 0) return null;

      const costBasisUsd = quantity * avgCost;
      const pnlUsd = marketValue - costBasisUsd;
      const returnValue = costBasisUsd > 0 ? (marketValue / costBasisUsd) - 1 : null;

      return {
        ticker: row?.ticker || "Holding",
        sector: row?.sector || row?.asset_type || "Holding",
        weight,
        marketValueUsd: marketValue,
        costBasisUsd,
        pnlUsd,
        returnValue,
      };
    })
    .filter(Boolean);

  const totalPositivePnl = tracked.reduce((sum, row) => sum + Math.max(0, row.pnlUsd), 0);
  const totalNegativePnl = tracked.reduce((sum, row) => sum + Math.abs(Math.min(0, row.pnlUsd)), 0);
  const totalPnlUsd = tracked.reduce((sum, row) => sum + row.pnlUsd, 0);
  const toDisplayRow = (row, denominator) => ({
    ticker: row.ticker,
    sector: row.sector,
    weightLabel: row.weight === null ? "-" : fmtPct(row.weight),
    marketValueLabel: formatCurrency(row.marketValueUsd),
    costBasisLabel: formatCurrency(row.costBasisUsd),
    pnlUsd: row.pnlUsd,
    pnlLabel: formatCurrency(row.pnlUsd),
    returnValue: row.returnValue,
    returnLabel: row.returnValue === null ? "-" : formatSignedPct(row.returnValue),
    shareOfBucket: denominator > 0 ? Math.abs(row.pnlUsd) / denominator : null,
    shareLabel: denominator > 0 ? fmtPct(Math.abs(row.pnlUsd) / denominator) : null,
  });

  return {
    trackedCount: tracked.length,
    totalPnlUsd,
    totalPnlLabel: formatCurrency(totalPnlUsd),
    leaders: tracked
      .filter((row) => row.pnlUsd > 0)
      .sort((left, right) => right.pnlUsd - left.pnlUsd)
      .slice(0, 5)
      .map((row) => toDisplayRow(row, totalPositivePnl)),
    detractors: tracked
      .filter((row) => row.pnlUsd < 0)
      .sort((left, right) => left.pnlUsd - right.pnlUsd)
      .slice(0, 4)
      .map((row) => toDisplayRow(row, totalNegativePnl)),
    rateLeaders: tracked
      .filter((row) => row.returnValue !== null)
      .sort((left, right) => right.returnValue - left.returnValue)
      .slice(0, 3)
      .map((row) => toDisplayRow(row, 0)),
  };
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

  if (source === "workspace_portfolio_empty") {
    return {
      source,
      label: label || "Sin cartera confirmada",
      connected: false,
      detail: "Aún no hay una cartera confirmada en este espacio.",
    };
  }

  if (source === "neon_portfolio" || source === "neon_workspace") {
    return {
      source,
      label: label || "Espacio privado",
      connected: true,
      detail: "Tus posiciones están guardadas en el espacio privado.",
    };
  }

  if (source === "local_overlay" || source === "remote_overlay" || source === "ui_editable_overlay") {
    const isRemote = source === "remote_overlay";
    return {
      source,
      label: label || (isRemote ? "Posiciones remotas" : "Archivo privado"),
      connected: true,
      detail: isRemote
        ? "Tus posiciones se cargan desde el espacio privado."
        : "Tus posiciones se cargan desde el archivo local.",
    };
  }

  if (source) {
    return {
      source,
      label: label || humanizeBucket(source),
      connected: false,
      detail: source === "backend_portfolio_manager"
        ? "La foto actual usa la cartera gestionada."
        : "La pantalla usa la foto de datos más reciente.",
    };
  }

  return {
    source: "backend_snapshot",
    label: hasHoldings ? "Posiciones conectadas" : "Foto de datos",
    connected: false,
    detail: hasHoldings
      ? "La pantalla muestra posiciones de la foto actual."
      : "Todavía no hay posiciones privadas conectadas.",
  };
}

function getSimulationRows(snapshot) {
  return Array.isArray(snapshot?.portfolio?.simulation_rank) ? snapshot.portfolio.simulation_rank : [];
}

function describeRiskBudget(snapshot) {
  const betaTarget = numberOr(snapshot?.overview?.beta_target, numberOr(snapshot?.portfolio?.alignment?.beta_target, null));
  const currentBeta = numberOr(snapshot?.portfolio?.alignment?.portfolio_beta, numberOr(snapshot?.portfolio?.analytics?.Beta, null));
  if (betaTarget === null || currentBeta === null) return "El riesgo se estima desde la lectura de mercado.";
  if (currentBeta <= betaTarget) return "El riesgo de la cartera sigue dentro del rango actual.";
  if (currentBeta <= betaTarget + 0.15) return "El riesgo de la cartera está algo alto; las compras deben ser selectivas.";
  return "El riesgo de la cartera está sobre el rango actual; recortes y defensa pesan más.";
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
  const cautionText = Number.isFinite(vix) ? `VIX está cerca de ${formatNumberLike(vix, 1)}; conviene usar rangos amplios.` : "La ejecución debe respetar un mercado frágil.";

  return {
    add:
      cluster.dominant === "G-dominated"
        ? `Las compras deben ser pequeñas y lentas: la debilidad interna pesa más que un rebote corto. ${cautionText}`
        : reboundQuality.state === "Restorative"
          ? `Un rebote con mejora interna permite compras graduales en los mejores nombres. ${cautionText}`
          : `Comprar solo tiene sentido en los nombres más limpios mientras el rebote no esté probado. ${cautionText}`,
    trim:
      cluster.dominant === "G-dominated"
        ? "Recortar importa más cuando la debilidad interna puede durar más que el rebote."
        : reboundConfidence.state === "Low"
          ? "Recortar sigue teniendo prioridad porque el rebote parte débil."
          : "Recorta primero el riesgo de menor calidad y conserva margen para un rebote real.",
    hold:
      cluster.dominant === "R-dominated" && reboundConfidence.state !== "Low"
        ? "Mantener protección durante el shock es defendible aquí."
        : "Mantén solo lo que mejora la recuperación, no lo que solo parece seguro.",
    invalidation:
      reboundQuality.state === "Restorative"
        ? "Retrocede si la amplitud deja de mejorar y el rebote se vuelve estrecho."
        : "Retrocede si sube la compresión, se frena la amplitud o el rebote es solo precio.",
    summary: `${cluster.dominantLabel || humanizeClusterLabel(cluster.dominant)} con recuperación ${reboundConfidence.state.toLowerCase()} y calidad de rebote ${reboundQuality.state.toLowerCase()}.`,
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
      funding: `Financiar gradual desde ${fundingTicker}`,
      conviction: `${humanizeBucket(addCandidate.thesis_bucket)} con una de las mejores lecturas del filtro. ${overlay.summary}`,
      whyNow: `${addCandidate.ticker} aparece arriba en el filtro, con momentum ${fmtPct(addCandidate.momentum_6m)} y puntaje ${formatNumberLike(numberOr(addCandidate.discovery_score, addCandidate.composite_score))}. ${riskBudget} ${overlay.add}`,
      watchFor: numberOr(addCandidate.valuation_gap, null) !== null
        ? `Esperar mejor entrada si el precio sigue a ${fmtPct(addCandidate.valuation_gap)} del valor razonable.`
        : "Entrar por etapas hasta tener más contexto de valoración.",
      role: humanizeBucket(addCandidate.thesis_bucket),
      invalidation: overlay.invalidation,
      sourceLabel: "Filtro vivo",
    });
  }

  if (trimCandidate) {
    if (seen.has(trimCandidate.ticker)) return fallback.map((action) => ({ ...action, sourceLabel: "Base compartida" }));
    seen.add(trimCandidate.ticker);
    liveActions.push({
      id: `trim-${trimCandidate.ticker}`,
      type: "trim",
      ticker: trimCandidate.ticker,
      company: trimCandidate.ticker,
      size: "Recortar 1.0% y revisar",
      sizeValue: 0.01,
      funding: "Mover a ideas más fuertes",
      conviction: `${trimCandidate.ticker} se ve menos atractivo que las mejores alternativas actuales. ${overlay.summary}`,
      whyNow: numberOr(trimCandidate.valuation_gap, null) !== null
        ? `${trimCandidate.ticker} muestra una brecha de valor de ${fmtPct(trimCandidate.valuation_gap)}, difícil de justificar con más peso. ${overlay.trim}`
        : `${trimCandidate.ticker} ya pesa bastante y necesita disciplina de tamaño. ${overlay.trim}`,
      watchFor: numberOr(trimCandidate.simulation?.prob_loss, null) !== null
        ? `La simulación muestra probabilidad de pérdida de ${formatNumberLike(trimCandidate.simulation.prob_loss)}; necesita menor tamaño.`
        : "Recortar más rápido si el mercado se vuelve defensivo o mejores ideas lo superan.",
      role: humanizeBucket(trimCandidate.thesis_bucket || trimCandidate.sector),
      invalidation: "Dejar de recortar solo si mejora el rebote y vuelve al grupo de mejores ideas.",
      sourceLabel: "Filtro vivo",
    });
  }

  if (holdCandidate) {
    if (seen.has(holdCandidate.ticker)) return fallback.map((action) => ({ ...action, sourceLabel: "Base compartida" }));
    liveActions.push({
      id: `hold-${holdCandidate.ticker}`,
      type: "hold",
      ticker: holdCandidate.ticker,
      company: holdCandidate.ticker,
      size: "Mantener tamaño",
      sizeValue: 0,
      funding: "Sin cambio",
      conviction: `${holdCandidate.ticker} sigue ayudando a proteger la cartera mientras el resto se mantiene selectivo. ${overlay.summary}`,
      whyNow: `La lectura actual premia conservar caja y estabilidad antes que forzar compras agresivas. ${riskBudget} ${overlay.hold}`,
      watchFor: "Revisar si deja de ayudar en mercados débiles.",
      role: humanizeBucket(holdCandidate.thesis_bucket || holdCandidate.sector || "Defense"),
      invalidation: "Reducir solo si el mercado mejora tanto que la protección pasa a estorbar.",
      sourceLabel: "Filtro vivo",
    });
  }

  if (liveActions.length === 3) return liveActions;

  return fallback.map((action) => ({
    ...action,
    invalidation: action.watchFor,
    sourceLabel: "Base compartida",
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
      : `Esperar ${confirmation}.`;
    return [{
      id: "no-valid-repair",
      type: "hold",
      ticker: "Esperar",
      company: "No agregar riesgo todavía",
      size: "Sin compras nuevas",
      sizeValue: 0,
      funding: "Mantener caja disponible",
      conviction: "El mercado todavía no sostiene más riesgo.",
      whyNow: "La recuperación sigue débil o las reglas actuales aún bloquean una mejor entrada.",
      watchFor: Array.isArray(policy.forbidden_sleeves) && policy.forbidden_sleeves.length
        ? `Aún bloqueado por: ${policy.forbidden_sleeves.join(", ")}.`
        : `Esperar ${confirmation}.`,
      role: policy.mode ? `${policy.mode}` : "Proteger",
      invalidation,
      sourceLabel: "Reglas vivas",
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
      ticker: tickerMatch?.[0] || `Ajuste ${index + 1}`,
      company: repair.classification.replace(/_/g, " "),
      size: policy.max_single_name_add !== undefined ? fmtPct(policy.max_single_name_add) : "Por etapas",
      sizeValue: numberOr(policy.max_single_name_add, 0.02),
      funding: repair.funding_source || "Cartera actual",
      conviction: `Este movimiento mejora la recuperación en ${fmtPct(repair.delta_recoverability)}. Tono de mercado: ${(framework.cluster.dominantLabel || humanizeClusterLabel(framework.cluster.dominant)).toLowerCase()}.`,
      whyNow: tradeSet.length ? tradeSet.join(" | ") : "Sin operación definida.",
      watchFor: (repair.binding_constraints || []).length
        ? `Puede bloquearlo: ${(repair.binding_constraints || []).join(", ")}.`
        : "Esperar que el riesgo siga mejorando.",
      role: policy.mode ? `${policy.mode}` : "Ajuste",
      invalidation: Array.isArray(repair.invalidation)
        ? humanizeTriggerRule(repair.invalidation.join("; "))
        : humanizeTriggerRule(String(repair.invalidation || "Policy state changes.")),
      sourceLabel: "Reglas vivas",
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
  const snapshotAgeDays = getSnapshotAgeDays(snapshot);
  const hasPrivateHoldings = snapshot?.portfolio?.holdings_source_available === true;
  const isBackendFallback = snapshot?.status?.contract_status === "fallback_legacy";
  const userWarnings = warnings.filter((warning) => !/runtime bootstrap|market:|alpha_volume_panel|fred request failed|internal server error|pipeline|traceback|exception|stack trace|\/api\/|railway|backend snapshot|live backend unavailable|unexpected token|not valid json|\bnan\b/i.test(String(warning || "")));
  const freshnessIssue =
    (snapshotAgeDays !== null && snapshotAgeDays > 1.5)
    || warnings.length > userWarnings.length
    || panels.some((panel) => panel.status === "stale" || panel.status === "aging");

  userWarnings.slice(0, 2).forEach((warning, index) => {
    if (hasPrivateHoldings && isBackendFallback) return;
    alerts.push({
      id: `market-note-${index}`,
      severity: "medium",
      title: "Nota de mercado",
      body: String(warning || "").trim(),
      action: "Revisar postura actual",
      source: "market",
    });
  });

  if (freshnessIssue) {
    const generatedAt = snapshot?.generated_at || snapshot?.portfolio?.quotes_as_of || snapshot?.as_of_date;
    alerts.push({
      id: "market-refresh-delayed",
      severity: snapshotAgeDays !== null && snapshotAgeDays > 1.5 ? "high" : "medium",
      title: snapshotAgeDays !== null && snapshotAgeDays > 1.5 ? "Actualizar sesión de mercado" : "La sesión en vivo sigue cargando",
      body: generatedAt
        ? `Última sesión completa cargada: ${generatedAt}.`
        : "El espacio usa la última sesión completa mientras termina la actualización en vivo.",
      action: "Actualizar datos de mercado",
      source: "freshness",
    });
  }

  const crashProb = numberOr(snapshot?.overview?.crash_prob, null);
  if (crashProb !== null && crashProb >= 0.65) {
    alerts.unshift({
      id: "tail-risk",
      severity: "high",
      title: "Riesgo estructural elevado",
      body: `La lectura de mercado todavía se ve frágil (${fmtPct(crashProb)} de riesgo de estrés). Mantén tamaños selectivos hasta que la estructura mejore.`,
      action: "Mantener tamaños selectivos",
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
      ? "The market still does not support adding more risk. Keep moves small."
      : liveAction
      ? `Current posture: ${humanizeEngineLabel(liveAction)}.`
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
  if (!action) return "Esperar mejor señal";
  if (action.adviceTitle) return action.adviceTitle;
  if (action.isBlockedState) return "Esperar antes de sumar riesgo";
  if (action.type === "add") return `Comprar poco ${action.ticker}`;
  if (action.type === "trim") return `Recortar ${action.ticker}`;

  const defensiveTicker = snapshot?.overview?.selected_hedge || pickFundingSource(snapshot, []);
  if ((action.ticker && ["SGOV", "SHY", "BIL", "TLT"].includes(action.ticker)) || action.ticker === defensiveTicker) {
    return "Mantener caja disponible";
  }
  if (stressMode?.repairState === "frontier_blocked") return "No hacer nada agresivo";
  return action.ticker ? `Mantener ${action.ticker}` : "Mantener postura";
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
    { label: "Recuperación", value: formatPointDelta(recoverabilityDelta) },
    { label: "Rebote dudoso", value: formatPointDelta(phantomDelta) },
    { label: "Beta cartera", value: formatBetaDelta(betaDelta) },
    {
      label: "Concentración",
      value: concentrationDelta <= -0.01 ? "Menor" : concentrationDelta >= 0.01 ? "Mayor" : "Similar",
    },
    {
      label: "Margen luego",
      value: flexibilityDelta >= 0.015 ? "Más" : flexibilityDelta <= -0.015 ? "Menos" : "Similar",
    },
  ];
}

function buildAdviceHeadline(primary, secondary, stressMode) {
  if (primary?.isBlockedState || stressMode?.repairState === "frontier_blocked") {
    return "Proteger primero. Todavia no hay compras agresivas abiertas.";
  }
  if (primary?.type === "trim") {
    return secondary?.type === "hold"
      ? "Recortar el riesgo mas debil, mantener defensa y esperar mejores compras."
      : "Recortar el riesgo mas debil primero y revisar de nuevo."
  }
  if (primary?.type === "add") {
    return "Una compra pequena esta bien, pero el resto de la cartera debe seguir disciplinada.";
  }
  return "Hacer solo cambios pequenos y reversibles hasta que la evidencia mejore.";
}

function buildAdviceThresholds(stressMode) {
  const recoverability = ratioOrPercent(stressMode?.recoverability, null);
  const phantom = ratioOrPercent(stressMode?.phantom, null);
  const ambiguity = String(stressMode?.fiberAtlas?.ambiguityLabel || "Unknown");

  return [
    {
      id: "recover-high",
      label: "Recuperación sobre 60%",
      meaning: "Las compras graduales pueden ampliarse si el rebote también parece real.",
      active: recoverability !== null && recoverability >= 0.6,
    },
    {
      id: "recover-mid",
      label: "Recuperación entre 35% y 60%",
      meaning: "Seguir selectivo. Compras pequeñas y financiadas.",
      active: recoverability !== null && recoverability >= 0.35 && recoverability < 0.6,
    },
    {
      id: "recover-low",
      label: "Recuperación bajo 35%",
      meaning: "Proteger primero. Recortes y cobertura pesan más que riesgo nuevo.",
      active: recoverability !== null && recoverability < 0.35,
    },
    {
      id: "phantom",
      label: "Rebote dudoso sobre 45%",
      meaning: "Los días verdes son sospechosos hasta que mejore la amplitud.",
      active: phantom !== null && phantom >= 0.45,
    },
    {
      id: "fiber",
      label: "Senal poco clara",
      meaning: "Estados parecidos se separan después; preferir movimientos pequeños y reversibles.",
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
      ? "Estados parecidos muchas veces fallaron después; la defensa reversible fue más segura."
      : "El historial está mixto; recortar compra tiempo sin forzar una gran tesis.";
  }
  if (action?.type === "add") {
    return ambiguity === "High"
      ? "Estados parecidos se separan después; cualquier compra debe ser pequeña."
      : generative >= 0.45
        ? "Una parte sana de estados parecidos mejoró lo suficiente para permitir una compra gradual."
        : "El historial no alcanza para comprar tamaño completo.";
  }
  return ambiguity === "High"
    ? "La ambigüedad alta justifica mantener protección."
    : "Mantener protección sigue justificado hasta tener confirmación más limpia.";
}

function buildAdviceMove(action, snapshot, modules, stressMode, slot) {
  if (!action) return null;
  const slotMeta = {
    primary: { label: "Mejor ahora", tone: "good" },
    secondary: { label: "También válido", tone: "warn" },
    caution: { label: "Todavía no", tone: "neutral" },
  }[slot] || { label: "Lectura", tone: "neutral" };

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
      ticker: "Riesgo amplio",
      adviceTitle: "No agregar riesgo amplio todavia",
      size: "Esperar",
      funding: "Mantener liquidez",
      conviction: "No subir el riesgo total mientras la senal siga poco clara.",
      whyNow: `Recuperacion ${stressMode?.recoverability || "-"}, rebote dudoso ${stressMode?.phantom || "-"}, senal comparable ${String(stressMode?.fiberAtlas?.ambiguityLabel || "unknown").toLowerCase()}.`,
      watchFor: "Esperar un rebote más creíble antes de agregar riesgo amplio.",
      invalidation: stressMode?.changeTrigger || `Esperar ${stressMode?.confirmation || "confirmación"}.`,
      sourceLabel: "Lectura viva",
      isBlockedState: true,
    };
  }

  return {
    id: "avoid-cutting-ballast",
    type: "hold",
    ticker: defensiveTicker,
    adviceTitle: `No recortar ${defensiveTicker} demasiado pronto`,
    size: "Mantener tamaño",
    funding: "Sin cambio",
    conviction: `${defensiveTicker} sigue comprando tiempo para el resto de la cartera.`,
    whyNow: "No conviene recortar protección temprano mientras la cartera aún tiene riesgo de crecimiento y casos especiales.",
    watchFor: "Reducir protección solo cuando mejore la recuperación y el rebote dure lo suficiente.",
    invalidation: "Si deja de ayudar en mercados débiles, revisar primero la manga defensiva.",
    sourceLabel: "Lectura viva",
  };
}

function buildBackupAdvice(snapshot) {
  const defensiveTicker = snapshot?.overview?.selected_hedge || pickFundingSource(snapshot, []);
  return {
    id: `keep-${defensiveTicker}`,
    type: "hold",
    ticker: defensiveTicker,
    adviceTitle: "Mantener caja disponible",
    size: "Mantener tamaño",
    sizeValue: 0,
    funding: "Sin cambio",
    conviction: "Sin cambios hasta que aparezca un mejor uso para esa caja.",
    whyNow: "La caja existe para mejorar decisiones futuras, no para convertirse en la idea principal.",
    watchFor: "Reducir esta protección solo cuando mejore la recuperación y el rebote sea confiable.",
    invalidation: "Si deja de ayudar en mercados débiles, revisar la protección.",
    sourceLabel: "Lectura viva",
  };
}

function normalizeDecisionPacket(packet, snapshot, stressMode, sharedAlpha) {
  const memory = packet?.memory || {};
  const moves = Array.isArray(packet?.moves) ? packet.moves : [];
  const currentRead = Array.isArray(packet?.current_read) ? packet.current_read : [];
  const thresholds = Array.isArray(packet?.thresholds) ? packet.thresholds : [];
  return {
    id: packet?.id || "advice",
    kicker: packet?.kicker || "Lectura",
    title: packet?.title || "Qué hacer",
    headline: packet?.headline || "Mantener la cartera recuperable antes de ampliar riesgo",
    summary: packet?.summary || "Lectura simple para esta cartera.",
    currentRead: currentRead.map((item) => ({
      label: item.label,
      value: item.value,
      detail: item.detail,
    })),
    moves: moves.map((move, index) => ({
      id: move.id || `move-${index}`,
      slot: move.slot || ["Mejor ahora", "También válido", "Todavía no"][index] || "Lectura",
      slotTone: move.slotTone || "neutral",
      tone: move.tone || "hold",
      title: move.title || "Lectura",
      ticker: move.ticker || "",
      size: move.size || "-",
      funding: move.funding || "Sin cambio",
      summary: move.summary || move.why || "",
      why: move.why || move.summary || "",
      watchFor: move.watchFor || null,
      fiberLine: move.fiberLine || packet?.fiberTakeaway || stressMode?.fiberAtlas?.takeaway || null,
      trigger: move.trigger || packet?.changeTrigger || null,
      sourceLabel: move.sourceLabel || "Lectura viva",
      effects: Array.isArray(move.effects) ? move.effects : [],
    })),
    thresholds: thresholds.map((item) => ({
      id: item.id,
      label: item.label,
      meaning: item.meaning,
      active: Boolean(item.active),
    })),
    fiberTakeaway: packet?.fiberTakeaway || stressMode?.fiberAtlas?.takeaway || "Sin lectura comparable.",
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
    kicker: "Lectura",
    title: "Qué hacer",
    headline: buildAdviceHeadline(primaryAction, secondaryAction, stressMode),
    summary: "Lectura simple para esta cartera.",
    currentRead: [
      { label: "Posiciones", value: String(modules?.portfolio?.analytics?.holdingsCount || holdings.length || 0), detail: biggestHolding ? `Mayor peso: ${biggestHolding.ticker} ${fmtPct(biggestHolding.weight)}` : "Sin tamaño disponible" },
      { label: "Recuperación", value: stressMode?.recoverability || "-", detail: "Sobre 60% permite compras graduales. Bajo 35% exige proteger primero." },
      { label: "Rebote dudoso", value: stressMode?.phantom || "-", detail: "Mientras más alto, menos confiable es un día verde." },
      { label: "Señal", value: stressMode?.authorityLabel || "-", detail: stressMode?.fiberAtlas?.headline || "Sin historial comparable." },
    ],
    moves,
    thresholds,
    fiberTakeaway: stressMode?.fiberAtlas?.takeaway || "Sin lectura comparable.",
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
  const hasPrivateHoldingsForFreshness = snapshot?.portfolio?.holdings_source_available === true;
  const isBackendFallbackForFreshness = snapshot?.status?.contract_status === "fallback_legacy";
  const freshness = snapshot?.status?.warnings?.length && !(hasPrivateHoldingsForFreshness && isBackendFallbackForFreshness) ? 0.72 : 0.92;
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
      `Permiso actual: ${decisionRights.toLowerCase()}.`,
      `Trust is in ${trustState.toLowerCase()} mode, so the system should ${trustState === "Act" ? "speak clearly" : trustState === "Stage" ? "add in stages" : trustState === "Observe" ? "watch more than add" : "protect capital first"}.`,
      `Margen de recuperacion: ${recoverabilityBudget.toLowerCase()}; distancia al limite: ${formatSignedPct(frontierDistance)}.`,
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
      mode === "act" ? "Actuar dentro del limite de riesgo"
        : mode === "stage" ? "Stage additions"
          : mode === "protect" ? "Protect and explain"
            : "Observe and confirm",
    autonomyScore: fmtPct(autonomyScore),
    frontierDistance: formatSignedPct(frontierDistance),
    recoverabilityBudget: autonomyScore >= 0.7 ? "Saludable" : autonomyScore >= 0.5 ? "Ajustado" : "Estrecho",
    supportDependency: [
      {
        id: "recoverability",
        label: "Recoverability",
        value: fmtPct(autonomyScore),
        numeric: clamp01(autonomyScore),
      },
      {
        id: "phantom_rebound",
        label: "Rebote dudoso",
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
      `Modo ${trustState.toLowerCase()} con evidencia ${fmtPct(trustScore)}.`,
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
  const transactions = portfolio?.transactions || portfolio?.transaction_log || portfolio?.activity || [];
  const holdingsSource = describeHoldingsSource(snapshot);
  const holdingsSync = {
    status: String(portfolio.holdings_sync_status || "").trim() || null,
    label: String(portfolio.holdings_sync_label || "").trim() || null,
    updatedAt: portfolio.holdings_updated_at || null,
  };
  const alignment = portfolio?.alignment || {};
  const analytics = portfolio?.analytics || {};
  const analyticsSource = String(analytics["Analytics Source"] || "").trim().toLowerCase();
  const fallbackAnalytics = sharedAlpha.analytics;
  const rows = holdings;
  const liveGrowthComparison = buildPortfolioTrend(portfolio.current_mix_vs_spy);
  const liveSectorExposure = buildSectorExposure(portfolio.sector_weights);
  const liveValuationDistribution = buildValuationDistribution(portfolio.valuation_histogram);
  const sectorExposure = liveSectorExposure.length ? liveSectorExposure : buildFallbackSectorExposure(rows);
  const valuationDistribution = liveValuationDistribution.length ? liveValuationDistribution : buildFallbackValuationDistribution(rows);
  const returnBreakdown = buildHoldingReturnBreakdown(rows);
  const computedAnalytics = buildPerformanceAnalyticsFromSeries(liveGrowthComparison);
  const displayGrowthComparison = computedAnalytics.seriesIsSuspicious
    ? liveGrowthComparison.map((row) => ({
        ...row,
        portfolio: null,
        valueGrowth: null,
        periodReturn: null,
      }))
    : liveGrowthComparison;
  const hasPerformanceHistory =
    !computedAnalytics.seriesIsSuspicious &&
    computedAnalytics.sessionCount >= 20 &&
    (computedAnalytics.historySpanDays ?? 0) >= 30 &&
    computedAnalytics.totalReturn !== null;
  const hasBenchmarkHistory = hasPerformanceHistory && computedAnalytics.benchmarkReturn !== null;
  const annualReturnValue = analyticsSource === "holdings_proxy"
    ? (hasPerformanceHistory ? computedAnalytics.annualReturn : null)
    : numberOr(analytics["Annual Return"], computedAnalytics.annualReturn);
  const annualVolatilityValue = analyticsSource === "holdings_proxy"
    ? (hasPerformanceHistory
        ? numberOr(analytics["Portfolio Volatility Proxy"], analytics["Annual Volatility"], computedAnalytics.annualVolatility)
        : null)
    : numberOr(analytics["Annual Volatility"], analytics["Portfolio Volatility Proxy"], computedAnalytics.annualVolatility);
  const sharpeRatioValue = analyticsSource === "holdings_proxy"
    ? (hasPerformanceHistory ? numberOr(computedAnalytics.sharpeRatio, analytics["Sharpe Ratio"]) : null)
    : numberOr(analytics["Sharpe Ratio"], computedAnalytics.sharpeRatio);
  const unrealizedReturnValue = numberOr(analytics["Unrealized Return"], null);
  const holdingsCount = numberOr(analytics["Holdings Count"], holdings.length) || 0;
  const totalValueUsd = sumHoldingsMarketValue(rows);
  const benchmarkSymbol = "SPY";
  const annualReturnLabel = annualReturnValue !== null
    ? fmtPct(annualReturnValue)
    : "Historial corto";
  const annualVolatilityLabel = annualVolatilityValue !== null
    ? fmtPct(annualVolatilityValue)
    : holdingsSource.connected
      ? "Historial corto"
      : "Historial corto";
  const sharpeRatioLabel = sharpeRatioValue !== null
    ? formatNumberLike(sharpeRatioValue)
    : holdingsSource.connected
      ? "Historial corto"
      : "Historial corto";
  const totalReturnValue = hasPerformanceHistory ? computedAnalytics.totalReturn : null;
  const totalReturnLabel = totalReturnValue !== null
    ? formatSignedPct(totalReturnValue)
    : "Historial corto";
  const benchmarkReturnLabel = hasBenchmarkHistory
    ? formatSignedPct(computedAnalytics.benchmarkReturn)
    : hasBenchmarkSeriesData(liveGrowthComparison)
      ? "Referencia sincronizando"
      : "Historial corto";
  const maxDrawdownLabel = computedAnalytics.maxDrawdown !== null
    ? (hasPerformanceHistory ? fmtPct(computedAnalytics.maxDrawdown) : "Historial corto")
    : holdingsSource.connected
      ? "Historial corto"
      : "Historial corto";

  const readText = (row, keys, fallback = null) => {
    for (const key of keys) {
      const value = row?.[key];
      if (value === null || value === undefined) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return fallback;
  };
  const readNumber = (row, keys, fallback = null) => {
    for (const key of keys) {
      const value = numberOr(row?.[key], null);
      if (value !== null) return value;
    }
    return fallback;
  };
  const normalizeHolding = (row) => {
    const brokerValueUsd = readNumber(row, ["broker_value_usd", "brokerValueUsd"]);
    const marketValueUsd = readNumber(row, ["market_value_usd", "marketValueUsd", "analysis_value_usd", "analysisValueUsd", "analysis_value", "analysisValue"], brokerValueUsd);
    const analysisValueUsd = readNumber(row, ["analysis_value_usd", "analysisValueUsd", "analysis_value", "analysisValue", "live_value_usd", "liveValueUsd"], marketValueUsd);
    const avgCostUsd = readNumber(row, ["avg_cost_usd", "avgCostUsd", "avg_cost", "avgCost"]);
    const quantity = readNumber(row, ["quantity", "shares", "share_count"]);
    const costBasisUsd = readNumber(row, ["cost_basis_usd", "costBasisUsd"], quantity !== null && avgCostUsd !== null ? quantity * avgCostUsd : null);
    const unrealizedPnlUsd = readNumber(
      row,
      ["unrealized_pnl_usd", "unrealizedPnlUsd", "broker_total_gain_usd", "brokerTotalGainUsd"],
      costBasisUsd !== null && marketValueUsd !== null ? marketValueUsd - costBasisUsd : null,
    );
    const unrealizedReturn = readNumber(row, ["unrealized_return", "unrealized_pct", "unrealizedPct"], costBasisUsd && marketValueUsd !== null ? (marketValueUsd / costBasisUsd) - 1 : null);
    const dividendsReceivedUsd = readNumber(row, ["dividends_received_usd", "dividendsReceivedUsd", "dividends_received", "dividends"]);
    const totalPnlInclDividendsUsd = readNumber(
      row,
      ["total_pnl_incl_dividends_usd", "totalPnlInclDividendsUsd", "total_pnl_usd", "totalPnlUsd"],
      unrealizedPnlUsd !== null || dividendsReceivedUsd !== null
        ? numberOr(unrealizedPnlUsd, 0) + numberOr(dividendsReceivedUsd, 0)
        : null,
    );
    const totalReturnInclDividends = readNumber(
      row,
      ["total_return_incl_dividends", "totalReturnInclDividends", "total_return", "totalReturn"],
      costBasisUsd && totalPnlInclDividendsUsd !== null ? totalPnlInclDividendsUsd / costBasisUsd : null,
    );
    const currentPriceUsd = readNumber(row, ["current_price_usd", "currentPriceUsd", "live_price", "livePrice"]);
    const dayReturn = readNumber(row, ["day_return", "dayReturn", "broker_day_pct", "brokerDayPct", "change_pct", "changePct"]);

    return {
      ticker: row.ticker,
      googleFinanceTicker: readText(row, ["google_finance_ticker", "googleFinanceTicker", "gf_ticker", "gfTicker"]),
      company: readText(row, ["company", "company_name", "name"]),
      theme: readText(row, ["theme", "thesis_bucket", "bucket", "strategy"]),
      assetType: row.asset_type || row.assetType || null,
      sector: row.sector || "Unknown",
      region: readText(row, ["region", "country", "geography"], "Global"),
      currency: readText(row, ["currency"], "USD"),
      weight: fmtPct(row.weight),
      weightValue: readNumber(row, ["weight", "portfolio_weight", "portfolioWeight"]),
      quantity,
      shares: quantity,
      avgCostUsd,
      purchaseDate: readText(row, ["purchase_date", "purchaseDate", "entry_date"]),
      costBasisUsd,
      dividendsReceivedUsd,
      totalPnlInclDividendsUsd,
      totalReturnInclDividends,
      totalReturnInclDividendsLabel: totalReturnInclDividends === null ? null : formatSignedPct(totalReturnInclDividends),
      marketValueUsd,
      analysisValueUsd,
      brokerValueUsd: brokerValueUsd ?? marketValueUsd,
      currentPriceUsd,
      previousCloseUsd: readNumber(row, ["previous_close_usd", "previousCloseUsd", "previous_close", "previousClose"]),
      high52wUsd: readNumber(row, ["high_52w_usd", "high52wUsd", "52w_high", "high_52w", "high52w"]),
      low52wUsd: readNumber(row, ["low_52w_usd", "low52wUsd", "52w_low", "low_52w", "low52w"]),
      marketCapUsd: readNumber(row, ["market_cap_usd", "marketCapUsd", "market_cap", "marketCap"]),
      peRatio: readNumber(row, ["pe_ratio", "peRatio", "price_earnings", "pe"]),
      eps: readNumber(row, ["eps", "earnings_per_share", "earningsPerShare"]),
      unrealizedPnlUsd,
      unrealizedReturn,
      unrealizedReturnLabel: unrealizedReturn === null ? null : formatSignedPct(unrealizedReturn),
      dayPnlUsd: readNumber(row, ["broker_day_gain_usd", "brokerDayGainUsd", "day_gain_usd", "dayGainUsd"]),
      dayReturn,
      dayReturnLabel: dayReturn === null ? null : formatSignedPct(dayReturn),
      valueSource: readText(row, ["value_source", "valueSource", "source"], currentPriceUsd !== null ? "Live" : brokerValueUsd !== null ? "Broker snapshot" : null),
      upside: row.upside === null || row.upside === undefined ? "Briefing" : fmtPct(row.upside),
      composite: numberOr(row.composite_score, null),
      qualityScore: readNumber(row, ["quality_score", "qualityScore", "quality"]),
      riskScore: readNumber(row, ["risk_score", "riskScore", "risk"]),
      include: readText(row, ["include", "include?", "included"], "Yes"),
      thesis: readText(row, ["analyst_thesis", "analyst_thesis_monitor", "analystThesis", "monitor", "thesis"]),
      currentAction: readText(row, ["current_action", "currentAction", "action", "recommendation"]),
      nextReviewTrigger: readText(row, ["next_review_trigger", "nextReviewTrigger", "review_trigger"]),
      conviction: row.conviction || null,
    };
  };
  const normalizeTransaction = (row, index) => ({
    id: readText(row, ["id", "transaction_id", "transactionId"], `tx-${index}`),
    source: readText(row, ["source"], "Registro"),
    date: readText(row, ["trade_date", "tradeDate", "date"]),
    ticker: readText(row, ["ticker", "symbol"], "CASH"),
    action: readText(row, ["action", "type"], "Movimiento"),
    shares: readNumber(row, ["shares", "quantity"]),
    price: readNumber(row, ["price", "fill_price", "fillPrice"]),
    amountUsd: readNumber(row, ["amount_usd", "amountUsd", "amount", "gross_amount"]),
    commissionUsd: readNumber(row, ["commission_usd", "commissionUsd", "commission"], 0),
    realizedPnlUsd: readNumber(row, ["realized_pnl_usd", "realizedPnlUsd", "realized_pnl"]),
    notes: readText(row, ["notes", "note", "memo"]),
  });
  const normalizedHoldings = rows.map(normalizeHolding);
  const holdingCostRows = normalizedHoldings.filter((row) => row.costBasisUsd !== null && row.marketValueUsd !== null);
  const derivedActiveCostBasisUsd = holdingCostRows.length
    ? holdingCostRows.reduce((sum, row) => sum + row.costBasisUsd, 0)
    : null;
  const derivedUnrealizedPnlUsd = holdingCostRows.length
    ? holdingCostRows.reduce((sum, row) => sum + row.unrealizedPnlUsd, 0)
    : null;
  const activeCostBasisUsd = numberOr(
    analytics["Active cost basis"],
    numberOr(analytics.active_cost_basis_usd, numberOr(analytics["Cost Basis"], derivedActiveCostBasisUsd)),
  );
  const unrealizedPnlUsd = numberOr(
    analytics["Unrealized P&L"],
    numberOr(analytics.unrealized_pnl_usd, derivedUnrealizedPnlUsd),
  );
  const realizedPnlUsd = numberOr(analytics["Realized P&L"], numberOr(analytics.realized_pnl_usd, null));
  const dividendsUsd = numberOr(analytics.Dividends, numberOr(analytics.dividends_usd, null));
  const derivedTotalPnlUsd = unrealizedPnlUsd !== null
    ? unrealizedPnlUsd + (realizedPnlUsd || 0) + (dividendsUsd || 0)
    : null;
  const totalPnlInclRealizedDividendsUsd = numberOr(
    analytics["Total P&L incl. realized/dividends"],
    numberOr(analytics.total_pnl_incl_realized_dividends_usd, derivedTotalPnlUsd),
  );
  const totalReturnInclDividends = numberOr(
    analytics["Total return incl. dividends"],
    numberOr(
      analytics.total_return_incl_dividends,
      activeCostBasisUsd && totalPnlInclRealizedDividendsUsd !== null
        ? totalPnlInclRealizedDividendsUsd / activeCostBasisUsd
        : unrealizedReturnValue,
    ),
  );
  const returnHorizonRows = portfolio?.return_horizons || portfolio?.returnHorizons || portfolio?.performance_horizons || [];

  return {
    id: "portfolio",
    kicker: "Cartera",
    title: "Mi cartera",
    performanceReport: portfolio?.performance_report || null,
    holdings: normalizedHoldings,
    transactions: transactions.slice(0, 60).map(normalizeTransaction),
    notes: alignment.notes?.length ? alignment.notes : [],
    shadowBalance: portfolio.shadowBalance || { assets: [], liabilities: [] },
    topSectors: (portfolio?.sector_weights || []).slice(0, 4),
    watchlistCount,
    analytics: {
      asOf: analytics["As of"] || fallbackAnalytics.asOf || snapshot?.generated_at,
      beta: fmtPct(numberOr(alignment.portfolio_beta, numberOr(analytics.Beta, null))),
      holdingsCount,
      totalValueUsd,
      annualReturn: annualReturnValue,
      annualReturnLabel,
      annualVolatility: annualVolatilityValue,
      annualVolatilityLabel,
      sharpeRatio: sharpeRatioValue,
      sharpeRatioLabel,
      totalReturn: totalReturnValue,
      totalReturnLabel,
      benchmarkReturn: hasBenchmarkHistory ? computedAnalytics.benchmarkReturn : null,
      benchmarkReturnLabel,
      excessReturn: hasBenchmarkHistory ? computedAnalytics.excessReturn : null,
      excessReturnLabel: hasBenchmarkHistory && computedAnalytics.excessReturn !== null
        ? formatSignedPct(computedAnalytics.excessReturn)
        : hasBenchmarkSeriesData(liveGrowthComparison)
          ? "Referencia sincronizando"
          : "Historial corto",
      maxDrawdown: computedAnalytics.maxDrawdown,
      maxDrawdownLabel,
      unrealizedReturn: unrealizedReturnValue,
      unrealizedReturnLabel: unrealizedReturnValue !== null ? formatSignedPct(unrealizedReturnValue) : null,
      timeWeightedReturn: numberOr(analytics["Time Weighted Return"], computedAnalytics.totalReturn),
      timeWeightedReturnLabel: numberOr(analytics["Time Weighted Return"], computedAnalytics.totalReturn) !== null
        ? formatSignedPct(numberOr(analytics["Time Weighted Return"], computedAnalytics.totalReturn))
        : null,
      moneyWeightedReturn: numberOr(analytics["Money Weighted Return"], null),
      moneyWeightedReturnLabel: numberOr(analytics["Money Weighted Return"], null) !== null
        ? formatSignedPct(numberOr(analytics["Money Weighted Return"], null))
        : null,
      performanceMethod: String(analytics["Performance Method"] || liveGrowthComparison[0]?.performanceMethod || "").trim() || null,
      externalFlowCount: numberOr(analytics["External Flow Count"], liveGrowthComparison.filter((row) => Math.abs(numberOr(row.externalFlowUsd, 0)) > 0).length),
      benchmarkSymbol,
      historyStart: computedAnalytics.historyStart,
      historyEnd: computedAnalytics.historyEnd,
      historySessions: computedAnalytics.sessionCount,
      historySpanDays: computedAnalytics.historySpanDays,
      performanceSeriesWarning: computedAnalytics.seriesIsSuspicious ? "suspicious_alternating_snapshots" : null,
      hasPerformanceHistory,
      hasBenchmarkHistory,
      activeCostBasisUsd,
      unrealizedPnlUsd,
      realizedPnlUsd,
      dividendsUsd,
      totalPnlInclRealizedDividendsUsd,
      totalReturnInclDividends,
      usdClp: numberOr(analytics.USDCLP, numberOr(analytics.usd_clp, numberOr(analytics["USDCLP"], numberOr(analytics["USD/CLP"], null)))),
      totalValueClp: numberOr(analytics["Total value CLP"], numberOr(analytics.total_value_clp, null)),
    },
    charts: {
      growthComparison: displayGrowthComparison,
      sectorExposure,
      valuationDistribution,
    },
    returns: {
      ...returnBreakdown,
      horizons: Array.isArray(returnHorizonRows)
        ? returnHorizonRows.map((row, index) => ({
            id: readText(row, ["id", "horizon"], `horizon-${index}`),
            label: readText(row, ["label", "horizon", "name"], `H${index + 1}`),
            value: readNumber(row, ["return", "value", "return_value", "returnValue"]),
          }))
        : [],
    },
    chartSource:
      liveGrowthComparison.length >= 5
        ? (String(analytics["Performance Method"] || liveGrowthComparison[0]?.performanceMethod || "").includes("external_flow")
            ? "TWR ajustado por flujos"
            : "TWR sin flujos registrados")
        : holdingsSource.connected
          ? "Posiciones conectadas. Historial en construcción."
          : "Sin historial de cartera",
    holdingsSource,
    holdingsSync,
  };
}

function formatNumberLike(value, digits = 2) {
  const parsed = numberOr(value, null);
  return parsed === null ? "-" : parsed.toFixed(digits);
}

function isEphemeralSystemAlert(alert) {
  const id = String(alert?.id || "").trim();
  const source = String(alert?.source || "").trim().toLowerCase();
  return (
    source === "backend" ||
    source === "workspace" ||
    id.startsWith("warning-") ||
    id.startsWith("panel-") ||
    id === "stale-snapshot" ||
    id === "workspace-page-fallback" ||
    id === "workspace-bootstrap-warning"
  );
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
    { id: "fragility", label: "Fragilidad", value: numberOr(snapshot?.overview?.legitimacy_risk, null), tone: "warn" },
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
        ? "La debilidad interna pesa más que un rebote corto. Mejorar resistencia antes de sumar riesgo."
        : dominant === "R-dominated"
          ? "El movimiento parece más shock que quiebre estructural. Un rebote es más plausible si se estabiliza."
          : dominant === "compound"
            ? "Debilidad interna y presión de shock siguen altas. Primero protección."
            : "Señales mixtas. Esperar mejora más clara antes de ampliar riesgo.";
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
          : "Recoverability is weak enough that waiting passively can become complacency from this state.";
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
        { label: "Rebote dudoso", value: fmtPct(phantom) },
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
        : "No live ideas right now.",
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
    { label: "Risk of a sharp fall", value: fmtPct(snapshot?.overview?.crash_prob) },
    { label: "Stress level", value: fmtPct(snapshot?.overview?.tail_risk_score) },
    { label: "Inestabilidad", value: fmtPct(snapshot?.overview?.legitimacy_risk) },
    { label: "Max risk level", value: fmtPct(snapshot?.overview?.structural_beta_ceiling) },
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
    chartSource: liveSignalBars.length ? "Live structural inputs" : "Structural view unavailable",
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

function actionSizeValue(action) {
  const sizeValue = ratioOrPercent(action?.sizeValue, null);
  if (sizeValue !== null) return sizeValue;
  return ratioOrPercent(action?.size, null);
}

function normalizeWorkspaceAction(action, status = "allowed") {
  if (!action) return null;
  return {
    id: action.id || null,
    slot: action.slot || (status === "blocked" ? "Todavía no" : "Lectura"),
    status,
    title: action.title || "Lectura",
    tone: action.tone || "neutral",
    ticker: action.ticker || null,
    summary: action.summary || action.why || "",
    whyNow: action.why || action.summary || "",
    watchFor: action.watchFor || null,
    trigger: action.trigger || null,
    funding: action.funding || "Sin cambio",
    sizeLabel: action.size || "Por etapas",
    sizeValue: actionSizeValue(action),
    sourceLabel: action.sourceLabel || "Lectura viva",
    effects: Array.isArray(action.effects) ? action.effects : [],
    evidenceLines: [action.fiberLine, action.watchFor, action.trigger].filter(Boolean),
  };
}

function responseLabel(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "staged") return "Guardada";
  if (normalized === "executed") return "Ejecutada";
  if (normalized === "executed_auto") return "Ejecutada automáticamente";
  if (normalized === "deferred") return "Postergada";
  if (normalized === "rejected") return "Rechazada";
  if (normalized === "cancelled") return "Cancelada";
  return humanizeBucket(normalized || "noted");
}

function buildWorkspaceStateSummary(snapshot, modules, justAdvice, stressMode) {
  const portfolioHoldings = getPortfolioHoldings(snapshot);
  const holdingsCount = modules?.portfolio?.analytics?.holdingsCount || portfolioHoldings.length || 0;
  return {
    mode: stressMode?.mode || "Observe",
    recovery: stressMode?.recoverability || justAdvice?.currentRead?.[1]?.value || "-",
    ambiguity: stressMode?.fiberAtlas?.ambiguityLabel || "Unknown",
    evidenceStrength: stressMode?.authorityLabel || justAdvice?.currentRead?.[3]?.value || "-",
    sponsorship: stressMode?.reboundDriver || "mixed",
    mainRisk: stressMode?.mainRisk || "none material",
    holdings: String(holdingsCount),
    stance: humanizeEngineLabel(snapshot?.overview?.recommended_action) || "Esperar señal más clara",
    updateLabel: formatUpdatedAt(snapshot?.generated_at || snapshot?.as_of_date),
    changeTrigger: stressMode?.changeTrigger || justAdvice?.changeTrigger || null,
    decisionSummary: stressMode?.decisionSummary || justAdvice?.summary || "",
  };
}

function deriveEscrowStatus(item, actionLookup, blockedActionId, referenceTimestamp = Date.now()) {
  const currentStatus = String(item?.status || "staged").toLowerCase();
  if (["executed", "cancelled", "expired"].includes(currentStatus)) {
    return { status: currentStatus, readiness: currentStatus === "executed" ? 1 : 0 };
  }

  if (item?.actionId && actionLookup.has(item.actionId)) {
    return { status: "ready", readiness: 0.92 };
  }

  const expiresAt = item?.expiresAt ? Date.parse(item.expiresAt) : NaN;
  if (Number.isFinite(expiresAt) && expiresAt < referenceTimestamp) {
    return { status: "expired", readiness: 0 };
  }

  if (blockedActionId && item?.actionId && blockedActionId === item.actionId) {
    return { status: "revoked", readiness: 0.08 };
  }

  return { status: "staged", readiness: clamp01(numberOr(item?.readiness, 0.45)) };
}

function buildWorkspaceEscrow(escrowDecisions, actions, blockedAction, referenceTimestamp = Date.now()) {
  const actionLookup = new Map(actions.filter(Boolean).map((action) => [action.id, action]));
  const blockedActionId = blockedAction?.id || null;
  const items = (Array.isArray(escrowDecisions) ? escrowDecisions : [])
    .map((item) => {
      const derived = deriveEscrowStatus(item, actionLookup, blockedActionId, referenceTimestamp);
      const sourcePayload = item?.sourcePayload || {};
      return {
        id: item.id,
        actionId: item.actionId || null,
        title: item.title || sourcePayload.title || "Decisión guardada",
        summary: item.summary || sourcePayload.summary || "",
        ticker: item.ticker || sourcePayload.ticker || null,
        slot: item.slot || sourcePayload.slot || "También válido",
        tone: item.tone || sourcePayload.tone || "neutral",
        funding: item.funding || sourcePayload.funding || "Sin cambio",
        sizeLabel: item.sizeLabel || sourcePayload.sizeLabel || sourcePayload.size || "Por etapas",
        sizeValue: numberOr(item.sizeValue, actionSizeValue(sourcePayload)),
        status: derived.status,
        readiness: derived.readiness,
        autoMature: Boolean(item.autoMature),
        maturityConditions: Array.isArray(item.maturityConditions) ? item.maturityConditions : [],
        invalidationConditions: Array.isArray(item.invalidationConditions) ? item.invalidationConditions : [],
        expiresAt: item.expiresAt || null,
        executedAt: item.executedAt || null,
        sourcePayload,
      };
    })
    .sort((left, right) => {
      const priority = { ready: 0, staged: 1, revoked: 2, expired: 3, executed: 4, cancelled: 5 };
      return (priority[left.status] ?? 9) - (priority[right.status] ?? 9);
    })
    .slice(0, 3);

  return {
    limit: 3,
    items,
    summary: items.length
      ? `${items.length} staged decisions are being tracked.`
      : "No staged decisions yet.",
  };
}

function buildWorkspaceMemory(decisionEvents, packetMemory, stressMode) {
  const events = (Array.isArray(decisionEvents) ? decisionEvents : []).slice(0, 8);
  const counts = events.reduce((acc, event) => {
    const key = String(event?.userResponse || "noted").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const recentEvents = events.slice(0, 5).map((event) => ({
    id: event.id,
    title: event.title || "Decision event",
    response: responseLabel(event.userResponse),
    responseKey: event.userResponse,
    note: event.note || "",
    occurredAt: event.occurredAt,
  }));

  let behaviorNote = "El sistema todavia esta aprendiendo tu patron de respuesta.";
  if ((counts.deferred || 0) >= 2 && (counts.deferred || 0) > (counts.executed || 0)) {
    behaviorNote = "Estas esperando mas de lo que ejecutas. Mantener esa disciplina solo cuando la senal siga poco clara.";
  } else if ((counts.executed || 0) >= 2) {
    behaviorNote = "Estas actuando sobre decisiones sugeridas. Mantener tamano pequeno cuando la lectura se debilite.";
  } else if ((counts.cancelled || 0) >= 2) {
    behaviorNote = "Estas guardando y cancelando seguido. Hacer mas claras las condiciones para ejecutar.";
  }

  const weeklyBrief = [
    ...(Array.isArray(packetMemory?.narrative) ? packetMemory.narrative.slice(0, 2) : []),
    behaviorNote,
    packetMemory?.penaltyReason ? `Nota de calibracion: ${packetMemory.penaltyReason}` : null,
    stressMode?.whatNeedsToImprove ? `Para reabrir riesgo, mirar: ${stressMode.whatNeedsToImprove}.` : null,
  ].filter(Boolean).slice(0, 4);

  return {
    available: Boolean(packetMemory?.available || events.length),
    recentEvents,
    stats: {
      staged: counts.staged || 0,
      executed: counts.executed || 0,
      deferred: counts.deferred || 0,
      cancelled: counts.cancelled || 0,
    },
    confidencePenalty: packetMemory?.confidencePenalty ?? null,
    penaltyReason: packetMemory?.penaltyReason || null,
    accuracyOverall: packetMemory?.accuracyOverall ?? null,
    calibrationGap: packetMemory?.calibrationGap ?? null,
    weeklyBrief,
    recentDecisions: Array.isArray(packetMemory?.recentDecisions) ? packetMemory.recentDecisions.slice(0, 4) : [],
  };
}

function buildDecisionWorkspace({
  snapshot,
  modules,
  justAdvice,
  stressMode,
  normalizedAlerts,
  escrowDecisions,
  decisionEvents,
}) {
  const moves = Array.isArray(justAdvice?.moves) ? justAdvice.moves : [];
  const primaryAction = normalizeWorkspaceAction(moves[0], "allowed");
  const secondaryActions = moves.slice(1, 2).map((move) => normalizeWorkspaceAction(move, "allowed")).filter(Boolean);
  const blockedSource = moves.find((move) => String(move?.slot || "").toLowerCase().includes("not yet"))
    || (stressMode?.repairState === "frontier_blocked"
      ? {
        id: "blocked-risk-add",
        slot: "Todavía no",
        tone: "hold",
        title: "No ampliar riesgo todavía",
        summary: stressMode?.decisionSummary || "El mercado todavía no sostiene más riesgo.",
        why: stressMode?.decisionSummary || "El mercado todavía no sostiene más riesgo.",
        watchFor: stressMode?.topMove?.firstConstraint || null,
        trigger: stressMode?.whatNeedsToImprove || stressMode?.changeTrigger || null,
        funding: stressMode?.topMove?.funding || "Mantener caja disponible",
        size: "Esperar",
        sourceLabel: "Lectura viva",
        effects: [],
      }
      : null);
  const blockedAction = normalizeWorkspaceAction(blockedSource, "blocked");
  const stateSummary = buildWorkspaceStateSummary(snapshot, modules, justAdvice, stressMode);
  const referenceTimestamp = Date.parse(snapshot?.generated_at || snapshot?.as_of_date || "") || Date.now();
  const escrow = buildWorkspaceEscrow(escrowDecisions, [primaryAction, ...secondaryActions], blockedAction, referenceTimestamp);
  const memory = buildWorkspaceMemory(decisionEvents, justAdvice?.memory || {}, stressMode);

  return {
    sections: ["now", "escrow", "memory"],
    stateSummary,
    primaryAction,
    secondaryActions,
    blockedAction,
    reopenTrigger: justAdvice?.changeTrigger || stressMode?.whatNeedsToImprove || null,
    closeTrigger: stressMode?.invalidation || stressMode?.mainRisk || null,
    alerts: normalizedAlerts.slice(0, 2),
    evidenceDrawer: {
      headline: justAdvice?.headline || "Mantener la cartera recuperable antes de ampliar riesgo",
      summary: justAdvice?.summary || stressMode?.decisionSummary || "",
      currentRead: Array.isArray(justAdvice?.currentRead) ? justAdvice.currentRead : [],
      thresholds: Array.isArray(justAdvice?.thresholds) ? justAdvice.thresholds : [],
      fiberTakeaway: justAdvice?.fiberTakeaway || stressMode?.fiberAtlas?.takeaway || "Sin lectura comparable.",
      decisionSummary: stressMode?.decisionSummary || "",
      topAnalog: stressMode?.topAnalog || "Sin análogos todavía",
      memoryNarrative: Array.isArray(justAdvice?.memoryNarrative) ? justAdvice.memoryNarrative : [],
    },
    escrow,
    memory,
  };
}

function parseDisplayRatio(value) {
  return ratioOrPercent(value, null);
}

function describeMandateOption(id) {
  if (id === "compound_without_fake_rebounds") {
    return {
      id,
      label: "Crecer sin perseguir rebotes dudosos",
      statement: "Agregar con cuidado y rechazar compras que todavia no superen la prueba de recuperacion.",
      guardrails: [
        "Preferir defensa y calidad antes que saltos rapidos de mercado.",
        "Subir riesgo solo cuando mejoren soporte y recuperacion.",
        "Tratar rebotes dudosos como trampas, no invitaciones.",
      ],
      rankingBias: "Penalizar ciclos fragiles y premiar negocios durables mas defensa.",
      stagingBias: "Guardar decisiones hasta que mejore la senal.",
    };
  }

  if (id === "defend_drawdown") {
    return {
      id,
      label: "Defender la caida primero",
      statement: "Proteger la cartera primero y agregar riesgo solo cuando la perdida este contenida.",
      guardrails: [
        "Mantener proteccion visible en la parte principal de la cartera.",
        "Recortar posiciones con demasiada fragilidad para su premio.",
        "Exigir que nuevas compras prueben su valor antes de ganar tamano.",
      ],
      rankingBias: "Favorecer estabilidad, defensa y ajustes menos fragiles.",
      stagingBias: "Guardar riesgo hasta que la presion de perdida baje claramente.",
    };
  }

  if (id === "stage_only_on_recoverability") {
    return {
      id,
      label: "Guardar hasta que mejore la recuperacion",
      statement: "Dejar decisiones en espera hasta que la recuperacion sea suficiente para ejecutarlas.",
      guardrails: [
        "No subir riesgo solo porque el precio reboto.",
        "Preferir mejoras claras antes que rebotes llamativos.",
        "Mantener visibles las acciones bloqueadas para evitar impulsos.",
      ],
      rankingBias: "Priorizar ajustes guardados y bajar acciones que aun no tienen buena senal.",
      stagingBias: "Guardar es la regla hasta que se abra una mejor oportunidad.",
    };
  }

  return describeMandateOption("compound_without_fake_rebounds");
}

function defaultMandateId(stressMode) {
  const mode = String(stressMode?.mode || "").toLowerCase();
  if (mode.includes("protect")) return "defend_drawdown";
  if (mode.includes("stage")) return "stage_only_on_recoverability";
  return "compound_without_fake_rebounds";
}

function buildMandateState(mandateState, stressMode) {
  const activeId = String(
    mandateState?.activeMandateId
      || mandateState?.active_mandate_id
      || mandateState?.id
      || defaultMandateId(stressMode),
  ).trim() || defaultMandateId(stressMode);
  const active = {
    ...describeMandateOption(activeId),
    updatedAt:
      mandateState?.updatedAt
      || mandateState?.updated_at
      || mandateState?.effective_at
      || new Date().toISOString(),
    notes: Array.isArray(mandateState?.notes) ? mandateState.notes : [],
  };
  const options = [
    describeMandateOption("compound_without_fake_rebounds"),
    describeMandateOption("defend_drawdown"),
    describeMandateOption("stage_only_on_recoverability"),
  ];

  return {
    ...active,
    options,
    source: mandateState ? "workspace" : "derived_default",
  };
}

function inferHoldingRole(holding) {
  const ticker = String(holding?.ticker || "").toUpperCase();
  const sector = String(holding?.sector || "").toLowerCase();
  const weightValue = parseDisplayRatio(holding?.weight) || 0;

  if ([
    "SGOV", "BIL", "SHV", "VGSH", "SHY", "IEF", "TLT", "AGG", "BND", "LQD", "TIP",
  ].includes(ticker) || sector.includes("bond") || sector.includes("treasury")) {
    return {
      id: "ballast",
      label: "Defense",
      description: "Mantiene margen para actuar mientras el mercado sigue exigente.",
      fragility: 0.12,
      recovery: 0.2,
      sponsorship: 0.3,
    };
  }

  if (sector.includes("health") || sector.includes("consumer staples") || sector.includes("utilities")) {
    return {
      id: "stability",
      label: "Stability",
      description: "Ayuda a sostener la cartera cuando el mercado esta dificil.",
      fragility: 0.28,
      recovery: 0.38,
      sponsorship: 0.46,
    };
  }

  if (sector.includes("technology") || sector.includes("communication")) {
    return {
      id: "compounder",
      label: "Compounder",
      description: "Aporta alza si la mejora es real y no solo un rebote corto.",
      fragility: 0.46,
      recovery: 0.74,
      sponsorship: 0.68,
    };
  }

  if (sector.includes("industrial") || sector.includes("financial") || sector.includes("energy") || sector.includes("materials")) {
    return {
      id: "cyclical",
      label: "Cyclical",
      description: "Aporta impulso solo si mejoran soporte y recuperacion.",
      fragility: 0.64,
      recovery: 0.67,
      sponsorship: 0.58,
    };
  }

  if (sector.includes("real estate") || sector.includes("biotech") || sector.includes("consumer discretionary") || sector.includes("unknown")) {
    return {
      id: "fragile",
      label: "Frágil",
      description: "Funciona solo si el rebote es real.",
      fragility: 0.78,
      recovery: 0.52,
      sponsorship: 0.42,
    };
  }

  if (weightValue >= 0.08) {
    return {
      id: "core",
      label: "Base",
      description: "Una de las posiciones que más pesa en la cartera.",
      fragility: 0.42,
      recovery: 0.58,
      sponsorship: 0.55,
    };
  }

  return {
    id: "satellite",
    label: "Satélite",
    description: "Posición menor que debe justificar su lugar.",
    fragility: 0.52,
    recovery: 0.5,
    sponsorship: 0.48,
  };
}

function buildRoleWeightedHoldings(portfolioModule) {
  const holdings = Array.isArray(portfolioModule?.holdings) ? portfolioModule.holdings : [];
  return holdings
    .map((holding) => {
      const role = inferHoldingRole(holding);
      const weightValue = parseDisplayRatio(holding?.weight) || 0;
      const fragilityScore = clamp01(role.fragility + (weightValue > 0.08 ? 0.08 : 0));
      const recoveryScore = clamp01(role.recovery + (weightValue > 0.06 ? 0.06 : 0));
      const sponsorshipScore = clamp01(role.sponsorship + (weightValue > 0.04 ? 0.04 : 0));
      return {
        ...holding,
        weightValue,
        roleId: role.id,
        roleLabel: role.label,
        roleDescription: role.description,
        fragilityScore,
        recoveryScore,
        sponsorshipScore,
      };
    })
    .sort((left, right) => right.weightValue - left.weightValue);
}

function buildPortfolioXRay(portfolioModule, stressMode, mandate) {
  const weightedHoldings = buildRoleWeightedHoldings(portfolioModule);
  const analytics = portfolioModule?.analytics || {};
  const roleBandsMap = new Map();

  for (const holding of weightedHoldings) {
    const current = roleBandsMap.get(holding.roleId) || {
      id: holding.roleId,
      label: holding.roleLabel,
      description: holding.roleDescription,
      weightValue: 0,
      fragility: 0,
      recovery: 0,
      sponsorship: 0,
      names: [],
    };
    current.weightValue += holding.weightValue;
    current.fragility += holding.fragilityScore * holding.weightValue;
    current.recovery += holding.recoveryScore * holding.weightValue;
    current.sponsorship += holding.sponsorshipScore * holding.weightValue;
    current.names.push(holding.ticker);
    roleBandsMap.set(holding.roleId, current);
  }

  const roleBands = [...roleBandsMap.values()]
    .map((band) => ({
      ...band,
      weight: fmtPct(band.weightValue),
      fragilityLabel: fmtPct(band.weightValue ? band.fragility / band.weightValue : 0),
      recoveryLabel: fmtPct(band.weightValue ? band.recovery / band.weightValue : 0),
      sponsorshipLabel: fmtPct(band.weightValue ? band.sponsorship / band.weightValue : 0),
      names: band.names.slice(0, 4),
    }))
    .sort((left, right) => right.weightValue - left.weightValue);

  const topFiveShare = weightedHoldings.slice(0, 5).reduce((sum, holding) => sum + holding.weightValue, 0);
  const topTenShare = weightedHoldings.slice(0, 10).reduce((sum, holding) => sum + holding.weightValue, 0);
  const ballastShare = roleBands.find((band) => band.id === "ballast")?.weightValue || 0;
  const fragileShare = weightedHoldings
    .filter((holding) => holding.fragilityScore >= 0.65)
    .reduce((sum, holding) => sum + holding.weightValue, 0);
  const recoveryShare = weightedHoldings
    .filter((holding) => holding.recoveryScore >= 0.65)
    .reduce((sum, holding) => sum + holding.weightValue, 0);
  const concentrationWarnings = [
    topFiveShare >= 0.58 ? `The top five positions control ${fmtPct(topFiveShare)} of the book.` : null,
    ballastShare <= 0.08 && String(stressMode?.mode || "").toLowerCase().includes("protect")
      ? "Ballast is thin for a protect regime. The book has less cushion than the current mode wants."
      : null,
    fragileShare >= 0.32 ? `Las posiciones frágiles suman ${fmtPct(fragileShare)} de la cartera. Es alto para un mandato cauto.` : null,
  ].filter(Boolean);

  return {
    headline: "Que sostiene la cartera ahora",
    subhead: mandate?.statement || "Lee la cartera por rol, concentracion, fragilidad y aporte a recuperacion.",
    totalValueUsd: analytics.totalValueUsd || null,
    holdingsCount: analytics.holdingsCount || weightedHoldings.length,
    concentration: {
      topFive: fmtPct(topFiveShare),
      topTen: fmtPct(topTenShare),
      ballast: fmtPct(ballastShare),
      verdict:
        topFiveShare >= 0.58 ? "Concentrada"
          : topFiveShare >= 0.42 ? "Enfocada"
            : "Balanceada",
    },
    roleBands,
    carriers: weightedHoldings.slice(0, 6).map((holding) => ({
      ticker: holding.ticker,
      sector: holding.sector,
      weight: holding.weight,
      weightValue: holding.weightValue,
      role: holding.roleLabel,
      fragility: fmtPct(holding.fragilityScore),
      recovery: fmtPct(holding.recoveryScore),
      sponsorship: fmtPct(holding.sponsorshipScore),
      marketValueUsd: holding.marketValueUsd || null,
    })),
    fragilityLoad: weightedHoldings
      .slice()
      .sort((left, right) => (right.fragilityScore * right.weightValue) - (left.fragilityScore * left.weightValue))
      .slice(0, 4)
      .map((holding) => ({
        ticker: holding.ticker,
        role: holding.roleLabel,
        load: fmtPct(holding.fragilityScore * holding.weightValue),
      })),
    recoveryDrivers: weightedHoldings
      .slice()
      .sort((left, right) => (right.recoveryScore * right.weightValue) - (left.recoveryScore * left.weightValue))
      .slice(0, 4)
      .map((holding) => ({
        ticker: holding.ticker,
        role: holding.roleLabel,
        contribution: fmtPct(holding.recoveryScore * holding.weightValue),
      })),
    sectorBalance: Array.isArray(portfolioModule?.charts?.sectorExposure) ? portfolioModule.charts.sectorExposure.slice(0, 5) : [],
    concentrationWarnings,
    weightedHoldings,
    carryingNarrative:
      weightedHoldings.length
        ? `${weightedHoldings[0].ticker} es el mayor peso visible; ${roleBands[0]?.label || "el grupo principal"} es el grupo más grande.`
        : "Todavia no hay posiciones privadas conectadas.",
    recoveryShare: fmtPct(recoveryShare),
    fragileShare: fmtPct(fragileShare),
  };
}

function decorateFrontierAction(action, lane, stressMode, mandate) {
  if (!action) return null;
  const laneLabel = lane === "unlocked" ? "Listo" : lane === "staged" ? "Guardado" : "Bloqueado";
  const disproof = lane === "illegitimate"
    ? stressMode?.changeTrigger || stressMode?.whatNeedsToImprove || "Esperar señal más limpia."
    : stressMode?.invalidation || stressMode?.mainRisk || "Invalidar si se debilita la estructura de mercado.";
  const whyLane = lane === "unlocked"
    ? "Esto está permitido por la lectura actual y puede ejecutarse con cuidado."
    : lane === "staged"
      ? "La opción sigue abierta, pero necesita confirmación."
      : "Puede ser tentador, pero la lectura actual lo bloquea.";

  return {
    id: action.id || edgeId(lane, action.title || action.ticker || "decision"),
    lane,
    laneLabel,
    title: action.title,
    ticker: action.ticker || null,
    summary: action.summary || action.whyNow || "",
    sizeLabel: action.sizeLabel || "-",
    sizeValue: action.sizeValue ?? null,
    funding: action.funding || "Sin cambio",
    evidenceBand: stressMode?.authorityLabel || "Usable",
    evidenceTier: stressMode?.evidenceTier || "Vivo",
    whyLane,
    disproofCondition: disproof,
    mandateFit: mandate?.label || "Regla de decisión",
    readiness: lane === "staged" ? null : undefined,
    watchFor: action.watchFor || action.trigger || null,
    effects: Array.isArray(action.effects) ? action.effects.slice(0, 3) : [],
  };
}

function buildActionFrontier(decisionWorkspace, stressMode, mandate) {
  const unlocked = [
    decorateFrontierAction(decisionWorkspace?.primaryAction, "unlocked", stressMode, mandate),
    ...((Array.isArray(decisionWorkspace?.secondaryActions) ? decisionWorkspace.secondaryActions : [])
      .map((action) => decorateFrontierAction(action, "unlocked", stressMode, mandate))),
  ].filter(Boolean);

  const staged = (Array.isArray(decisionWorkspace?.escrow?.items) ? decisionWorkspace.escrow.items : [])
    .filter((item) => !["cancelled", "executed", "expired"].includes(String(item.status || "").toLowerCase()))
    .map((item) => ({
      id: item.id,
      lane: "staged",
      laneLabel: "Guardada",
      title: item.title,
      ticker: item.ticker || null,
      summary: item.summary || "Decisión guardada esperando confirmación.",
      sizeLabel: item.sizeLabel || "Por etapas",
      sizeValue: item.sizeValue ?? null,
      funding: item.funding || "Sin cambio",
      evidenceBand: stressMode?.authorityLabel || "Usable",
      evidenceTier: stressMode?.evidenceTier || "Vivo",
      whyLane: "La acción está guardada, pero todavía necesita confirmación.",
      disproofCondition:
        (Array.isArray(item.invalidationConditions) ? item.invalidationConditions[0] : null)
        || stressMode?.changeTrigger
        || "Cancelar si se debilita la estructura de mercado.",
      readiness: fmtPct(item.readiness || 0),
      watchFor: Array.isArray(item.maturityConditions) ? item.maturityConditions[0] : null,
      effects: [],
    }));

  const illegitimate = [
    decorateFrontierAction(decisionWorkspace?.blockedAction, "illegitimate", stressMode, mandate),
  ].filter(Boolean);

  return {
    headline: "Acciones posibles",
    subhead: "Qué está listo, qué queda guardado y qué sigue bloqueado.",
    laneSummary: [
      { id: "unlocked", label: "Listo", count: unlocked.length, description: "Permitido ahora" },
      { id: "staged", label: "Guardado", count: staged.length, description: "Esperando confirmación" },
      { id: "illegitimate", label: "Bloqueado", count: illegitimate.length, description: "Bloqueado por el estado actual" },
    ],
    nextUnlockCondition: stressMode?.whatNeedsToImprove || decisionWorkspace?.reopenTrigger || "Esperar más soporte y recuperación.",
    closeCondition: decisionWorkspace?.closeTrigger || stressMode?.mainRisk || "Si el estado se debilita, recortar riesgo primero.",
    mandateBias: mandate?.rankingBias || null,
    lanes: [
      { id: "unlocked", label: "Listo", items: unlocked },
      { id: "staged", label: "Guardado", items: staged },
      { id: "illegitimate", label: "Bloqueado", items: illegitimate },
    ],
    allItems: [...unlocked, ...staged, ...illegitimate],
  };
}

function buildPositionStories(xray, frontier, stressMode, snapshot, persistedStories) {
  const storiesByTicker = new Map(
    (Array.isArray(persistedStories) ? persistedStories : [])
      .map((story) => [String(story?.ticker || "").toUpperCase(), story]),
  );
  const scannerRows = Array.isArray(snapshot?.screener?.rows) ? snapshot.screener.rows : [];
  const replacementTickers = scannerRows
    .map((row) => row?.ticker)
    .filter(Boolean)
    .slice(0, 8);
  const frontierByTicker = new Map(
    (Array.isArray(frontier?.allItems) ? frontier.allItems : [])
      .filter((item) => item?.ticker)
      .map((item) => [String(item.ticker).toUpperCase(), item]),
  );

  const items = (Array.isArray(xray?.weightedHoldings) ? xray.weightedHoldings : [])
    .slice(0, 8)
    .map((holding) => {
      const ticker = String(holding.ticker || "").toUpperCase();
      const persisted = storiesByTicker.get(ticker);
      const frontierItem = frontierByTicker.get(ticker);
      const roleLine = `grupo ${holding.roleLabel}`;
      const whyExists = persisted?.whyExists || persisted?.why_exists || [
        `${ticker} cumple el rol de ${roleLine.toLowerCase()} en la cartera.`,
        holding.roleId === "ballast"
          ? "Se justifica porque conserva margen para actuar despues."
          : holding.roleId === "compounder"
            ? "Es una forma relativamente limpia de participar si mejora la recuperacion."
            : "Debe aportar mas recuperacion que fragilidad para justificar su lugar.",
      ];
      const whatBreaks = persisted?.whatBreaks || persisted?.what_breaks || [
        stressMode?.mainRisk ? `Si ${String(stressMode.mainRisk).replace(/_/g, " ")} sigue subiendo, este grupo pierde atractivo.` : "Si la estructura de riesgo se debilita, esta posicion pierde atractivo.",
        holding.fragilityScore >= 0.65
          ? "Cuesta justificarla si baja el soporte antes de que mejore la recuperacion."
          : "Deja de ayudar si agrega fragilidad sin aportar suficiente recuperacion.",
      ];
      const whatCouldReplace = persisted?.whatCouldReplace || persisted?.what_could_replace || replacementTickers
        .filter((candidate) => candidate !== ticker)
        .slice(0, 3)
        .map((candidate) => `${candidate} si necesitas una forma mas limpia de usar el mismo riesgo.`);
      const improvesConfidence = persisted?.improvesConfidence || persisted?.improves_confidence || [
        stressMode?.whatNeedsToImprove || "Una lectura de recuperacion mas fuerte.",
        frontierItem?.watchFor || "Soporte mas claro en la lectura en vivo.",
      ].filter(Boolean);

      return {
        ticker,
        title: `${ticker} story`,
        sector: holding.sector || "Unknown",
        weight: holding.weight,
        role: holding.roleLabel,
        roleDescription: holding.roleDescription,
        marketValueUsd: holding.marketValueUsd || null,
        whyExists,
        whatBreaks,
        whatCouldReplace,
        improvesConfidence,
        disproofCondition: frontierItem?.disproofCondition || stressMode?.changeTrigger || "Si la senal vuelve a debilitarse.",
        evidenceBand: frontierItem?.evidenceBand || stressMode?.authorityLabel || "Evidencia usable",
        laneHint: frontierItem?.laneLabel || "Mantener",
      };
    });

  return {
    headline: "Historia de posiciones",
    subhead: "Cada posicion importante debe explicar por que esta, que la invalidaria y que podria reemplazarla.",
    selectedTicker: items[0]?.ticker || null,
    items,
  };
}

function getCounterfactualValue(record, keys) {
  for (const key of keys) {
    const value = numberOr(record?.[key], null);
    if (value !== null) return value;
  }
  return null;
}

function buildCounterfactualLedger(decisionEvents, counterfactualOutcomes) {
  const persistedByEvent = new Map(
    (Array.isArray(counterfactualOutcomes) ? counterfactualOutcomes : [])
      .map((item) => [String(item?.eventKey || item?.event_key || item?.id || ""), item]),
  );
  const events = Array.isArray(decisionEvents) ? decisionEvents.slice(0, 8) : [];

  const items = events.map((event) => {
    const counterfactual = event?.counterfactual || {};
    const persisted = persistedByEvent.get(String(event.id || ""));
    const source = persisted || counterfactual;
    const portfolioDelta = getCounterfactualValue(source, ["portfolioDelta", "portfolio_delta", "pnlDelta", "pnl_delta", "totalReturn", "total_return"]);
    const benchmarkDelta = getCounterfactualValue(source, ["benchmarkDelta", "benchmark_delta", "spyDelta", "spy_delta"]);
    const excessDelta = portfolioDelta !== null && benchmarkDelta !== null ? portfolioDelta - benchmarkDelta : null;
    const responseKey = String(event.userResponse || "noted").toLowerCase();
    const verdict =
      excessDelta === null
        ? "Aun en seguimiento"
        : excessDelta > 0.02
          ? "La decision agrego valor"
          : excessDelta < -0.02
            ? "La decision quedo atras"
            : "La decision siguio al mercado";
    const lesson =
      responseKey === "executed"
        ? "Sirve para aprender si actuar temprano mejoro la cartera."
        : responseKey === "deferred"
          ? "Sirve para aprender si esperar protegio capital o costo alza."
          : responseKey === "rejected"
            ? "Sirve para aprender si pasar evito un movimiento falso."
            : "Este resultado todavia se esta guardando en el historial.";

    return {
      id: event.id,
      title: event.title || "Decision event",
      response: responseLabel(responseKey),
      responseKey,
      occurredAt: event.occurredAt,
      verdict,
      portfolioDeltaLabel: portfolioDelta === null ? "En curso" : formatSignedPct(portfolioDelta),
      benchmarkDeltaLabel: benchmarkDelta === null ? "En curso" : formatSignedPct(benchmarkDelta),
      excessDeltaLabel: excessDelta === null ? "No listo" : formatSignedPct(excessDelta),
      note: event.note || "",
      lesson,
    };
  });

  return {
    headline: "Historial de decisiones",
    subhead: "Mide que paso despues de actuar, esperar o pasar, para saber si la lectura merece confianza.",
    items,
    available: items.length > 0,
  };
}

function buildMemoryGuidance(memory, stressMode, mandate) {
  const stats = memory?.stats || {};
  const staged = Number(stats.staged || 0);
  const executed = Number(stats.executed || 0);
  const deferred = Number(stats.deferred || 0);
  const cancelled = Number(stats.cancelled || 0);
  let profileLabel = "Aun aprendiendo";
  let profileSummary = "El sistema esta reuniendo suficientes decisiones para adaptar la guia a tu forma de actuar.";

  if (deferred >= 2 && deferred > executed) {
    profileLabel = "Cauto cuando la senal es poco clara";
    profileSummary = "Sueles esperar cuando la lectura no es limpia. La guia debe ser sobria y mostrar condiciones claras de invalidacion.";
  } else if (staged >= 2 && executed < staged) {
    profileLabel = "Guarda antes de ejecutar";
    profileSummary = "Mantienes opciones abiertas antes de actuar. Las decisiones guardadas deben seguir visibles y con umbrales claros.";
  } else if (executed >= 2) {
    profileLabel = "Actua cuando la evidencia mejora";
    profileSummary = "Actuas cuando el caso se ve suficientemente limpio. La guia debe mantener claros los motivos para cambiar de opinion.";
  } else if (cancelled >= 2) {
    profileLabel = "Reconsidera rapido";
    profileSummary = "Estas dispuesto a retroceder cuando el caso se deteriora. La app debe mantener muy visibles las alertas de invalidacion.";
  }

  const overlays = [
    `Tono: mantener la guia ${deferred > executed ? "medida y con foco en confirmacion" : "clara y orientada a accion"} con el estado actual.`,
    `Orden: ${mandate?.rankingBias || "Priorizar mejores lecturas de recuperacion."}`,
    `Decisiones guardadas: ${mandate?.stagingBias || "Guardar compras inciertas antes de ejecutarlas."}`,
  ];

  const warnings = [
    deferred > executed ? "No dejar que esperar se convierta en inercia cuando la oportunidad mejore de verdad." : null,
    executed > deferred && String(stressMode?.mode || "").toLowerCase().includes("protect")
      ? "Has estado mas activo de lo que pide el modo defensivo. Mantener tamano mas acotado."
      : null,
    cancelled >= 2 ? "Guardar y cancelar repetidamente sugiere que las condiciones de ejecucion aun estan vagas." : null,
  ].filter(Boolean);

  return {
    headline: "Guia basada en historial",
    profileLabel,
    profileSummary,
    overlays,
    warnings,
    brief: Array.isArray(memory?.weeklyBrief) ? memory.weeklyBrief.slice(0, 4) : [],
    confidencePenaltyLabel: memory?.confidencePenalty === null || memory?.confidencePenalty === undefined
      ? "Live"
      : fmtPct(memory.confidencePenalty),
  };
}

function buildRecoverabilityMap(snapshot, xray, frontier) {
  const screenerRows = Array.isArray(snapshot?.screener?.rows) ? snapshot.screener.rows : [];
  const holdingItems = (Array.isArray(xray?.weightedHoldings) ? xray.weightedHoldings : []).slice(0, 12).map((holding) => ({
    id: `holding-${holding.ticker}`,
    filter: "holdings",
    label: holding.ticker,
    kind: "Posicion",
    x: holding.recoveryScore,
    y: holding.fragilityScore,
    legitimacy: "live",
    sponsorship: holding.sponsorshipScore,
    quadrant: holding.recoveryScore >= 0.6 && holding.fragilityScore < 0.5 ? "Firme" : holding.fragilityScore >= 0.65 ? "Frágil" : "Condicional",
    meta: `${holding.roleLabel} · ${holding.weight}`,
  }));
  const watchItems = screenerRows.slice(0, 10).map((row, index) => ({
    id: `watch-${row.ticker || index}`,
    filter: "watch",
    label: row.ticker || row.label || `Idea ${index + 1}`,
    kind: "Idea",
    x: clamp01(numberOr(row.discovery_score, numberOr(row.composite_score, 0.45))),
    y: clamp01(Math.max(numberOr(row.valuation_gap, 0.12), 0) + Math.max(-numberOr(row.momentum_6m, numberOr(row.momentum, 0)), 0)),
    legitimacy: "watch",
    sponsorship: clamp01(numberOr(row.momentum_6m, numberOr(row.momentum, 0.45))),
    quadrant: "Observacion",
    meta: row.sector || row.bucket || "Idea",
  }));
  const blockedItems = (Array.isArray(frontier?.lanes) ? frontier.lanes.find((lane) => lane.id === "illegitimate")?.items || [] : [])
    .map((item, index) => ({
      id: `blocked-${item.id || index}`,
      filter: "blocked",
      label: item.ticker || item.title,
      kind: "Bloqueada",
      x: 0.22,
      y: 0.76,
      legitimacy: "blocked",
      sponsorship: 0.24,
      quadrant: "Bloqueada",
      meta: item.title,
    }));

  return {
    headline: "Mapa de oportunidades",
    subhead: "Muestra que posiciones e ideas se ven mas firmes y cuales necesitan una mejor senal.",
    filters: [
      { id: "holdings", label: "Posiciones", count: holdingItems.length },
      { id: "watch", label: "Ideas en observacion", count: watchItems.length },
      { id: "blocked", label: "Bloqueadas", count: blockedItems.length },
    ],
    items: [...holdingItems, ...watchItems, ...blockedItems],
  };
}

function buildConfidencePanel(stressMode, modules, frontier, ledger) {
  const analogCount = Array.isArray(stressMode?.fiberAtlas?.rows)
    ? stressMode.fiberAtlas.rows.reduce((sum, row) => sum + Number(row.count || 0), 0)
    : 0;
  const disproofConditions = [...new Set([
    stressMode?.changeTrigger || null,
    stressMode?.invalidation || null,
    frontier?.closeCondition || null,
  ].filter(Boolean))].slice(0, 3);
  return {
    headline: "Confianza verificable",
    confidenceBand: stressMode?.authorityLabel || "Usable",
    contractStatus: stressMode?.contractStatusLabel || "Modo respaldo",
    trustState: modules?.command?.trustState || "Observar",
    decisionRights: modules?.command?.decisionRights || "Solo sugerir",
    evidenceTier: stressMode?.evidenceTier || "Live",
    analogCount,
    sampleBasis: stressMode?.packageSamples || "-",
    brier: stressMode?.packageBrier || "-",
    disproofConditions,
    note:
      ledger?.items?.length
        ? "La confianza se muestra junto a condiciones que la invalidan, para poder desafiar la lectura."
        : "La confianza se mantiene prudente: las afirmaciones fuertes esperan mas historial y evidencia.",
  };
}

function buildRecoverabilityBalanceSheet(snapshot, stressMode, frontier) {
  const contract = getCanonicalContract(snapshot);
  const raw = contract?.balance_sheet || {};
  const normalizeRows = (rows) => (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row.id || edgeId("balance", row.label || row.title || "row"),
    label: row.label || row.title || "Line item",
    value: clamp01(numberOr(row.value, 0)),
    valueLabel: fmtPct(clamp01(numberOr(row.value, 0))),
    detail: row.detail || row.meaning || "",
  }));

  if (contract && raw && Object.keys(raw).length) {
    return {
      headline: "Balance de recuperacion",
      subhead: raw.summary || "Muestra que ayuda a la cartera, que la debilita y cuanta liquidez queda para actuar.",
      accountingState: humanizeBucket(raw.accounting_state || "balanced"),
      headlineState: raw.headline || "La cartera esta ganando y gastando margen de accion al mismo tiempo.",
      netFreedom: fmtPct(numberOr(raw.net_freedom, 0)),
      optionalityReserve: fmtPct(numberOr(raw.optionality_reserve, 0)),
      phantomTax: fmtPct(numberOr(raw.phantom_tax, 0)),
      legitimacySlack: fmtPct(numberOr(raw.legitimacy_slack, 0)),
      spendingCapacity: fmtPct(numberOr(raw.spending_capacity, 0)),
      budgetState: humanizeBucket(raw.budget_state || "unknown"),
      dominantFailureMode: humanizeBucket(raw.dominant_failure_mode || "none_material"),
      assets: normalizeRows(raw.assets),
      liabilities: normalizeRows(raw.liabilities),
      reserves: normalizeRows(raw.reserves),
      spendRule: raw.spend_rule || "Usar margen solo en movimientos que mejoren la cartera.",
      repairNote: raw.repair_note || "Todavia no hay una nota de ajuste disponible.",
      notes: Array.isArray(raw.notes) ? raw.notes : [],
      source: contract.contract_version || "contract",
    };
  }

  const recoverability = parseDisplayRatio(stressMode?.recoverability) || 0;
  const roomToAct = parseDisplayRatio(stressMode?.roomToAct) || 0;
  const phantom = parseDisplayRatio(stressMode?.phantom) || 0;
  const authority = parseDisplayRatio(stressMode?.authority) || 0;
  const netFreedom = clamp01((recoverability * 0.55) + (roomToAct * 0.25) + ((1 - phantom) * 0.20));
  const reserve = clamp01((roomToAct * 0.50) + (authority * 0.30) + ((1 - phantom) * 0.20));
  const assets = [
    { id: "recovery", label: "Probabilidad de recuperacion", value: recoverability, detail: "Cuanto puede resistir la cartera actual y aun recuperarse." },
    { id: "authority", label: "Fuerza de evidencia", value: authority, detail: "Cuanto merece pesar la evidencia actual." },
    { id: "room", label: "Margen para actuar", value: roomToAct, detail: "Cuanto espacio queda para hacer cambios." },
  ];
  const liabilities = [
    { id: "phantom", label: "Costo de rebote dudoso", value: phantom, detail: "Alivio visible que aun puede fallar." },
  ];

  return {
    headline: "Balance de recuperacion",
    subhead: "Vista simple de respaldo construida desde el estado actual de riesgo.",
    accountingState: netFreedom >= 0.55 ? "Balanced" : "Stressed",
    headlineState: "El margen de accion se estima desde la postura actual.",
    netFreedom: fmtPct(netFreedom),
    optionalityReserve: fmtPct(reserve),
    phantomTax: fmtPct(phantom),
    legitimacySlack: frontier?.laneSummary?.[0]?.count ? fmtPct(clamp01(frontier.laneSummary[0].count / 5)) : "-",
    spendingCapacity: fmtPct(clamp01((reserve * 0.6) + ((1 - phantom) * 0.4))),
    budgetState: "Respaldo",
    dominantFailureMode: humanizeBucket(stressMode?.mainRisk || "unknown"),
    assets: normalizeRows(assets),
    liabilities: normalizeRows(liabilities),
    reserves: [],
    spendRule: stressMode?.changeTrigger || "Sin cambios por ahora.",
    repairNote: stressMode?.topMove?.summary || "Todavia no hay una nota de ajuste disponible.",
    notes: Array.isArray(stressMode?.fiberAtlas?.rows) && stressMode.fiberAtlas.rows.length
      ? [`La senal comparable sigue ${String(stressMode.fiberAtlas.ambiguityLabel || "unknown").toLowerCase()}.`]
      : [],
    source: "fallback",
  };
}

function buildCapitalTwin(portfolioModule, xray, frontier, stressMode, mandate, escrow) {
  const totalValue = Number(portfolioModule?.analytics?.totalValueUsd || 0);
  const recoverability = parseDisplayRatio(stressMode?.recoverability) || 0.35;
  const phantom = parseDisplayRatio(stressMode?.phantom) || 0.25;
  const protectMode = String(stressMode?.mode || "").toLowerCase().includes("protect");
  const historySessions = Number(portfolioModule?.analytics?.historySessions || 0);
  const scenarioValues = [
    {
      id: "base",
      label: "Escenario base",
      delta: (recoverability * 0.06) - (phantom * 0.03),
      explanation: "Como se veria la cartera si las condiciones siguen parecidas.",
    },
    {
      id: "recovery",
      label: "Recuperacion mejora",
      delta: (recoverability * 0.14) + 0.03,
      explanation: "Que pasa si mejoran el soporte y la recuperacion.",
    },
    {
      id: "breakdown",
      label: "Deterioro vuelve",
      delta: -((phantom * 0.1) + (protectMode ? 0.03 : 0.06)),
      explanation: "Que pierde la cartera si el rebote reciente era fragil.",
    },
    {
      id: "phantom_rebound",
      label: "Rebote dudoso",
      delta: Math.max(-0.02, (recoverability * 0.02) - (phantom * 0.08)),
      explanation: "Los precios rebotan, pero no mejora lo suficiente para justificar riesgo amplio.",
    },
    {
      id: "sponsorship",
      label: "Soporte mejora",
      delta: (recoverability * 0.09) + 0.01,
      explanation: "Las acciones selectivas son mas creibles si mejora el soporte del mercado.",
    },
  ];

  return {
    headline: "Escenarios de cartera",
    subhead: "Caminos posibles proyectados desde la cartera actual.",
    mandateLabel: mandate?.label || "Regla de decision",
    currentValueUsd: totalValue || null,
    baselineLabel: totalValue
      ? `Comparado con tu cartera actual de ${formatCurrency(totalValue)}.`
      : "Comparado con la cartera conectada actual.",
    historyLabel:
      historySessions >= 5
        ? `El grafico compara la cartera guardada contra ${portfolioModule?.analytics?.benchmarkSymbol || "SPY"}.`
        : "El historial aun se esta construyendo; por ahora los escenarios son mas utiles que la linea historica.",
    activeActions: Array.isArray(frontier?.lanes)
      ? frontier.lanes.reduce((sum, lane) => sum + lane.items.length, 0)
      : 0,
    stagedCount: Array.isArray(escrow?.items) ? escrow.items.length : 0,
    exposures: (Array.isArray(xray?.roleBands) ? xray.roleBands : []).slice(0, 4).map((band) => ({
      label: band.label,
      weight: band.weight,
      recovery: band.recoveryLabel,
      fragility: band.fragilityLabel,
    })),
    scenarios: scenarioValues.map((scenario) => ({
      ...scenario,
      projectedValueUsd: totalValue ? totalValue * (1 + scenario.delta) : null,
      deltaLabel: formatSignedPct(scenario.delta),
    })),
    shadowActions: (Array.isArray(frontier?.allItems) ? frontier.allItems : []).slice(0, 4).map((item) => ({
      id: item.id,
      label: item.title,
      lane: item.laneLabel,
      size: item.sizeLabel,
      note: item.summary,
    })),
  };
}

export function normalizeWorkspaceDashboard({
  workspaceId,
  snapshot,
  watchlist,
  alerts,
  savedViews,
  commandHistory,
  escrowDecisions,
  decisionEvents,
  positionStories,
  memoryProfile,
  counterfactualOutcomes,
  capitalTwinRun,
  mandateState,
  sharedAlpha,
  billingPlan,
}) {
  const config = getServerConfig();
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

  const normalizedAlerts = [
    ...(Array.isArray(alerts) ? alerts.filter((alert) => !isEphemeralSystemAlert(alert)) : []),
    ...buildAlerts(snapshot, alpha),
  ].reduce((acc, alert) => {
    if (!acc.some((item) => item.id === alert.id)) acc.push(alert);
    return acc;
  }, []);
  const snapshotAgeDays = getSnapshotAgeDays(snapshot);
  const hasPrivateHoldingsForStatus = snapshot?.portfolio?.holdings_source_available === true;
  const isBackendFallbackForStatus = snapshot?.status?.contract_status === "fallback_legacy";
  const backendStatus = snapshot?.status?.warnings?.length && !(hasPrivateHoldingsForStatus && isBackendFallbackForStatus)
    ? "briefing"
    : snapshotAgeDays !== null && snapshotAgeDays > 1.5
      ? "stale"
      : "live";

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
  const justAdvice = buildJustAdviceModule(snapshot, modules, stressMode, alpha);
  const decisionWorkspace = buildDecisionWorkspace({
    snapshot,
    modules,
    justAdvice,
    stressMode,
    normalizedAlerts,
    escrowDecisions,
    decisionEvents,
  });
  const mandate = buildMandateState(mandateState, stressMode);
  const xray = buildPortfolioXRay(modules.portfolio, stressMode, mandate);
  const frontier = buildActionFrontier(decisionWorkspace, stressMode, mandate);
  const positionStoriesSurface = buildPositionStories(xray, frontier, stressMode, snapshot, positionStories);
  const counterfactualLedger = buildCounterfactualLedger(decisionEvents, counterfactualOutcomes);
  const memoryGuidance = memoryProfile
    ? {
      ...buildMemoryGuidance(decisionWorkspace.memory, stressMode, mandate),
      ...memoryProfile,
    }
    : buildMemoryGuidance(decisionWorkspace.memory, stressMode, mandate);
  const recoverabilityMap = buildRecoverabilityMap(snapshot, xray, frontier);
  const confidencePanel = buildConfidencePanel(stressMode, modules, frontier, counterfactualLedger);
  const recoverabilityBalanceSheet = buildRecoverabilityBalanceSheet(snapshot, stressMode, frontier);
  const capitalTwin = capitalTwinRun
    ? {
      ...buildCapitalTwin(modules.portfolio, xray, frontier, stressMode, mandate, decisionWorkspace.escrow),
      ...capitalTwinRun,
    }
    : buildCapitalTwin(modules.portfolio, xray, frontier, stressMode, mandate, decisionWorkspace.escrow);
  const plan = billingPlan || {
    id: "founder",
    label: "Founder",
    status: "active",
    access: {
      privateWorkspace: true,
      upgradeRequired: false,
    },
    capabilities: {
      privateWorkspace: true,
      liveRefresh: true,
      stagedActions: true,
      naturalLanguageTrades: true,
      mandateControls: true,
    },
  };

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
    just_advice: justAdvice,
    stress_mode: stressMode,
    decision_workspace: decisionWorkspace,
    state_summary: decisionWorkspace.stateSummary,
    primary_action: decisionWorkspace.primaryAction,
    secondary_actions: decisionWorkspace.secondaryActions,
    blocked_action: decisionWorkspace.blockedAction,
    evidence_drawer: decisionWorkspace.evidenceDrawer,
    escrow: decisionWorkspace.escrow,
    memory: decisionWorkspace.memory,
    frontier,
    xray,
    position_stories: positionStoriesSurface,
    counterfactual_ledger: counterfactualLedger,
    memory_guidance: memoryGuidance,
    recoverability_map: recoverabilityMap,
    recoverability_balance_sheet: recoverabilityBalanceSheet,
    confidence_panel: confidencePanel,
    capital_twin: capitalTwin,
    mandate,
    plan,
    access_control: {
      privateWorkspace: Boolean(plan?.access?.privateWorkspace),
      upgradeRequired: Boolean(plan?.access?.upgradeRequired),
      paywallHeadline: plan?.access?.paywallHeadline || null,
      paywallMessage: plan?.access?.paywallMessage || null,
      capabilities: plan?.capabilities || {},
    },
    workspace_summary: {
      id: workspaceId,
      name: normalizeWorkspaceName(config.publicWorkspaceName),
      persona: "Private portfolio workspace",
      mode: "Espacio privado",
      plan_id: plan.id,
      plan_label: plan.label,
      plan_status: plan.status,
      private_workspace_enabled: Boolean(plan?.access?.privateWorkspace),
      last_updated: snapshot?.generated_at || alpha.analytics.asOf || new Date().toISOString(),
      last_updated_label: formatUpdatedAt(snapshot?.generated_at || alpha.analytics.asOf),
      market_data_as_of: snapshot?.portfolio?.quotes_as_of || snapshot?.as_of_date || null,
      market_data_label: formatMarketDataLabel(
        snapshot?.portfolio?.quotes_as_of || snapshot?.as_of_date,
        snapshot?.portfolio?.quotes_stale_days ?? null,
      ),
      backend_status: backendStatus,
      primary_stance: humanizeEngineLabel(snapshot?.overview?.recommended_action) || alpha.command.readout,
    },
    data_control: {
      analysisSource:
        backendStatus === "briefing"
          ? "Latest completed session"
          : backendStatus === "stale"
            ? "Refresh needed"
            : "Live market read",
      contractStatus,
      holdingsSource: modules.portfolio.holdingsSource,
      plan: {
        id: plan.id,
        label: plan.label,
        status: plan.status,
        upgradeRequired: Boolean(plan?.access?.upgradeRequired),
      },
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
        "Refresh pulls in the latest market session and rebuilds the workspace.",
        "Prices reflect the latest market date currently loaded here.",
        "New research ideas appear after fresh discovery data is available.",
        modules.portfolio.holdingsSource?.connected
          ? "Tus posiciones privadas están conectadas a este espacio."
          : modules.portfolio.holdingsSource?.source === "workspace_portfolio_empty"
            ? "No hay cartera confirmada; no se muestran posiciones ni métricas de otro usuario."
            : "Tus posiciones privadas todavía no están conectadas.",
        contractStatus === "canonical_valid"
          ? "Live backend state is driving the current plan."
          : "Some live inputs are unavailable, so the workspace is showing a partial read instead of pretending to be complete.",
      ],
    },
    market_ribbon: marketRibbon,
    market_brief: buildMarketBrief(marketRibbon, alpha),
    edge_board: buildEdgeBoard(snapshot, alpha),
    module_status: moduleStatus,
    alerts: normalizedAlerts,
    saved_views: Array.isArray(savedViews) ? savedViews : [],
    portfolio_state: {
      holdings_count: modules.portfolio.analytics.holdingsCount,
      beta: modules.portfolio.analytics.beta,
      watchlist_count: watchlist.length,
      top_holdings: modules.portfolio.holdings,
      holdings_source: modules.portfolio.holdingsSource?.source || null,
      holdings_source_label: modules.portfolio.holdingsSource?.label || null,
      holdings_sync_status: modules.portfolio.holdingsSync?.status || null,
      holdings_sync_label: modules.portfolio.holdingsSync?.label || null,
      holdings_updated_at: modules.portfolio.holdingsSync?.updatedAt || null,
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
        { label: "Posiciones", value: String(alpha.analytics.holdingsCount) },
      ],
    },
    playbook: buildPlaybookModule(snapshot, alpha),
    watchlist,
    command_history: commandHistory || [],
    module_refs: MODULE_META.map(([id, title, kicker]) => ({ id, title, kicker })),
    modules,
  };
}
