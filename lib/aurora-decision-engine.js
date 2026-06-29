function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numeric(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

function arrayOrEmpty(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function firstFinite(...values) {
  for (const value of values) {
    const parsed = numeric(value, null);
    if (isFiniteNumber(parsed)) return parsed;
  }
  return null;
}

function getDrivers(input = {}) {
  return input.compiled?.drivers || input.drivers || {};
}

function riskSnapshot(input = {}) {
  const probabilistic = input.probabilisticValuation || {};
  const dashboard = input.dashboardContract || {};
  const calibration = input.calibrationIntegration || {};
  const panel = dashboard.primaryPanel || {};
  return {
    expectedIrr: firstFinite(probabilistic.irrDistribution?.mean, probabilistic.irrDistribution?.p50, panel.expectedIrr5y),
    medianIrr: firstFinite(probabilistic.irrDistribution?.p50, panel.expectedIrr5y),
    downsideCvarIrr: firstFinite(probabilistic.risk?.downsideCvarIrr),
    probabilityNegativeIrr: firstFinite(probabilistic.risk?.probabilityNegativeIrr, panel.probabilityNegativeIrr),
    probabilityPermanentLoss: firstFinite(probabilistic.risk?.probabilityPermanentLoss),
    probabilityValueBelowPrice: firstFinite(probabilistic.risk?.probabilityValueBelowPrice, panel.probabilityValueBelowPrice),
    valueP10: firstFinite(probabilistic.valueDistribution?.p10, panel.valueRange?.p10),
    valueP50: firstFinite(probabilistic.valueDistribution?.p50, panel.valueRange?.p50),
    valueP90: firstFinite(probabilistic.valueDistribution?.p90, panel.valueRange?.p90),
    uncertaintyScale: firstFinite(calibration.riskControls?.uncertaintyScale, 1),
    calibrationShouldAbstain: Boolean(calibration.riskControls?.shouldAbstain),
    confidence: firstFinite(calibration.riskControls?.confidence, 1 - numeric(input.forecast?.uncertainty?.total, 0.55)),
  };
}

function qualitySnapshot(input = {}) {
  const dashboard = input.dashboardContract || {};
  const dataQuality = dashboard.primaryPanel?.dataQuality || {};
  const disagreement = dashboard.primaryPanel?.modelDisagreement || {};
  return {
    pipelineState: input.decision?.state || null,
    pipelineAction: input.decision?.action || null,
    dataQualityLevel: dataQuality.level || input.compiled?.driverQuality?.level || "unknown",
    dataQualityScore: firstFinite(dataQuality.score, input.compiled?.driverQuality?.score),
    modelDisagreementLevel: disagreement.level || "unknown",
    modelDisagreementScore: firstFinite(disagreement.score),
    calibrationMode: input.calibrationIntegration?.mode || "observe_only",
    dashboardReadiness: dashboard.readiness?.level || "unknown",
    sourceGovernanceDecision: input.sourceGovernance?.decision || null,
    assumptionLedgerDecision: input.assumptionLedger?.decision || null,
    monitorStatus: input.monitor?.status || "not_run",
  };
}

function hardBlocks(input = {}, risk = riskSnapshot(input), quality = qualitySnapshot(input)) {
  const blocks = [];
  const state = quality.pipelineState;
  if (["repair_inputs", "source_governance_review", "causal_model_violation", "calibration_review", "assumption_ledger_review", "thesis_broken_or_needs_reunderwriting"].includes(state)) {
    blocks.push({
      key: state,
      severity: 0.9,
      reason: input.decision?.reason || "Pipeline has a hard review state.",
    });
  }
  if (risk.calibrationShouldAbstain) {
    blocks.push({
      key: "calibration_abstention",
      severity: 0.76,
      reason: "Calibration risk controls recommend abstention.",
    });
  }
  if (risk.probabilityPermanentLoss >= 0.38) {
    blocks.push({
      key: "permanent_loss_risk",
      severity: clamp(0.62 + risk.probabilityPermanentLoss * 0.45, 0, 1),
      reason: "Permanent-loss probability is too high for underwriting.",
    });
  }
  if (risk.downsideCvarIrr <= -0.28) {
    blocks.push({
      key: "downside_cvar",
      severity: clamp(0.58 + Math.abs(risk.downsideCvarIrr) * 0.9, 0, 1),
      reason: "Downside CVaR is too severe for a decision-ready thesis.",
    });
  }
  return blocks.sort((a, b) => b.severity - a.severity);
}

function positiveEvidence(risk = {}) {
  let score = 0;
  score += clamp((numeric(risk.expectedIrr, 0) - 0.04) / 0.16, -0.3, 1) * 0.38;
  score += clamp((numeric(risk.medianIrr, 0) - 0.035) / 0.15, -0.25, 1) * 0.28;
  score += clamp((numeric(risk.valueP50, 0) - numeric(risk.valueP10, 0)) / Math.max(1, numeric(risk.valueP50, 1)), 0, 1) * 0.08;
  score += clamp((0.35 - numeric(risk.probabilityValueBelowPrice, 0.5)) / 0.35, -0.4, 1) * 0.26;
  return clamp(score, 0, 1);
}

function riskPenalty(risk = {}, quality = {}) {
  let penalty = 0;
  penalty += clamp(numeric(risk.probabilityNegativeIrr, 0.5) / 0.65, 0, 1) * 0.22;
  penalty += clamp(numeric(risk.probabilityPermanentLoss, 0.2) / 0.35, 0, 1) * 0.28;
  penalty += clamp(Math.abs(Math.min(0, numeric(risk.downsideCvarIrr, 0))) / 0.35, 0, 1) * 0.22;
  penalty += clamp(numeric(quality.modelDisagreementScore, 0.4) / 1.1, 0, 1) * 0.12;
  penalty += clamp((numeric(risk.uncertaintyScale, 1) - 1) / 1.2, 0, 1) * 0.1;
  penalty += clamp((0.58 - numeric(quality.dataQualityScore, 0.58)) / 0.58, 0, 1) * 0.06;
  return clamp(penalty, 0, 1);
}

function decisionRights(edgeScore, blocks, quality = {}) {
  if (blocks.length) return "blocked";
  if (["low", "insufficient", "memo_only", "unknown"].includes(quality.dataQualityLevel)) return "memo_only";
  if (quality.modelDisagreementLevel === "high") return edgeScore >= 0.55 ? "stage_only" : "watch_only";
  if (edgeScore >= 0.62) return "underwrite_allowed";
  if (edgeScore >= 0.42) return "stage_only";
  if (edgeScore >= 0.24) return "watch_only";
  return "avoid";
}

function actionFromRights(rights, risk = {}) {
  const actions = {
    blocked: "do_not_underwrite",
    memo_only: "research_memo_only",
    avoid: "avoid_or_reject",
    watch_only: "watch_for_better_asymmetry",
    stage_only: "stage_small_and_wait_for_confirmation",
    underwrite_allowed: "underwrite_with_sizing_limits",
  };
  const label = actions[rights] || "research_memo_only";
  const reason =
    rights === "underwrite_allowed"
      ? "Expected IRR and downside distribution are good enough to underwrite with limits."
      : rights === "stage_only"
        ? "There is enough signal to stage, but risk controls still limit size."
        : rights === "watch_only"
          ? "Distribution is not poor enough to reject, but asymmetry is not yet decision-grade."
          : rights === "avoid"
            ? "Expected return does not compensate for downside risk."
            : rights === "blocked"
              ? "A hard review state or risk control blocks underwriting."
              : "Use only as research until evidence quality improves.";
  return {
    label,
    reason,
    expectedIrr: risk.expectedIrr,
    downsideCvarIrr: risk.downsideCvarIrr,
  };
}

function prudentSize(rights, edgeScore, risk = {}, quality = {}) {
  if (["blocked", "memo_only", "avoid", "watch_only"].includes(rights)) return 0;
  const base = rights === "underwrite_allowed" ? 0.055 : 0.018;
  const rewardMultiplier = clamp(0.45 + edgeScore, 0.25, 1.35);
  const lossHaircut = clamp(1 - numeric(risk.probabilityPermanentLoss, 0.2) * 1.7, 0.12, 1);
  const cvarHaircut = clamp(1 - Math.abs(Math.min(0, numeric(risk.downsideCvarIrr, 0))) * 1.8, 0.1, 1);
  const confidenceHaircut = clamp(numeric(risk.confidence, 0.55), 0.15, 1);
  const qualityHaircut = clamp(numeric(quality.dataQualityScore, 0.58), 0.2, 1);
  return clamp(base * rewardMultiplier * lossHaircut * cvarHaircut * confidenceHaircut * qualityHaircut, 0, rights === "underwrite_allowed" ? 0.08 : 0.025);
}

function adverseScenarios(input = {}, risk = riskSnapshot(input)) {
  const sensitivity = arrayOrEmpty(input.probabilisticValuation?.sensitivity?.irr?.firstOrder).slice(0, 4);
  const scenarios = sensitivity.map((item) => ({
    key: `${item.factor}_shock`,
    driver: item.factor,
    severity: clamp(numeric(item.normalizedShare, item.firstOrderIndex) || 0.2, 0.05, 1),
    question: `What happens if ${item.factor} moves against the thesis?`,
  }));
  if (risk.downsideCvarIrr <= -0.15) {
    scenarios.push({
      key: "left_tail_path",
      driver: "portfolio_loss",
      severity: clamp(Math.abs(risk.downsideCvarIrr), 0.05, 1),
      question: "Can the thesis survive the left-tail IRR path?",
    });
  }
  return scenarios;
}

function allowedActions(rights) {
  const actions = {
    blocked: ["repair_inputs", "review_blocking_issue"],
    memo_only: ["collect_sources", "improve_data_quality", "do_not_size"],
    avoid: ["reject", "archive_watchlist_reason"],
    watch_only: ["watch", "set_reopen_trigger"],
    stage_only: ["stage_small", "define_falsifiers", "wait_for_confirmation"],
    underwrite_allowed: ["underwrite", "stage_or_size_with_limits", "monitor_falsifiers"],
  };
  return actions[rights] || actions.memo_only;
}

function blockedActions(rights) {
  if (rights === "underwrite_allowed") return ["unbounded_position", "ignore_falsifiers"];
  if (rights === "stage_only") return ["full_position", "average_down_without_new_evidence"];
  return ["new_position", "increase_position", "full_underwrite"];
}

function reopenTriggers(input = {}, risk = riskSnapshot(input), quality = qualitySnapshot(input)) {
  const triggers = [];
  if (quality.dataQualityLevel === "low" || quality.dataQualityLevel === "insufficient") triggers.push("Upgrade data quality to research grade or better.");
  if (risk.probabilityNegativeIrr >= 0.45) triggers.push("Probability of negative IRR falls below 35%.");
  if (risk.probabilityPermanentLoss >= 0.25) triggers.push("Permanent-loss probability falls below 20%.");
  if (quality.modelDisagreementLevel === "high") triggers.push("Model disagreement falls to medium or low.");
  const topFalsifier = input.monitor?.topIssues?.[0]?.message || input.assumptionLedger?.ledger?.find((item) => item.status !== "current")?.driver;
  if (topFalsifier) triggers.push(`Resolve or falsify: ${topFalsifier}.`);
  return triggers.length ? triggers : ["Refresh the thesis after the next material disclosure."];
}

export function buildAuroraDecisionEngine(input = {}, options = {}) {
  const risk = riskSnapshot(input);
  const quality = qualitySnapshot(input);
  const blocks = hardBlocks(input, risk, quality);
  const edge = positiveEvidence(risk);
  const penalty = riskPenalty(risk, quality);
  const edgeScore = clamp(edge - penalty + 0.28, 0, 1);
  const rights = decisionRights(edgeScore, blocks, quality);
  const action = actionFromRights(rights, risk);
  const maxPositionPct = prudentSize(rights, edgeScore, risk, quality);
  const adverse = adverseScenarios(input, risk);
  const drivers = getDrivers(input);

  return {
    version: "aurora_decision_engine_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    ticker: input.ticker || input.compiled?.ticker || drivers.ticker || null,
    name: input.name || input.compiled?.name || drivers.name || null,
    decisionRights: rights,
    action,
    edgeScore,
    components: {
      positiveEvidence: edge,
      riskPenalty: penalty,
      blockCount: blocks.length,
    },
    risk,
    quality,
    sizing: {
      maxPositionPct,
      sizingPolicy: "prudential_fractional_cap_v1",
      note: "This is a decision-support cap, not an instruction to trade.",
    },
    allowedActions: allowedActions(rights),
    blockedActions: blockedActions(rights),
    hardBlocks: blocks,
    adverseScenarios: adverse,
    reopenTriggers: reopenTriggers(input, risk, quality),
    memo: {
      headline: `${rights.replaceAll("_", " ")}: ${action.label.replaceAll("_", " ")}.`,
      expectedIrr: risk.expectedIrr,
      probabilityPermanentLoss: risk.probabilityPermanentLoss,
      downsideCvarIrr: risk.downsideCvarIrr,
      maxPositionPct,
      topBlock: blocks[0]?.reason || null,
      topAdverseScenario: adverse[0]?.key || null,
    },
  };
}
