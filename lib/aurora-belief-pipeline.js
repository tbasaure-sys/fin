import { buildAuroraAccountingEngine } from "./aurora-accounting-engine.js";
import { buildAuroraBayesianForecastEngine } from "./aurora-bayesian-forecast-engine.js";
import { compileAuroraBeliefObject } from "./aurora-belief-compiler.js";
import { buildAuroraDriverGraph } from "./aurora-driver-graph.js";
import { buildAuroraEquilibriumEngine } from "./aurora-equilibrium-engine.js";
import { buildAuroraExpectationsEngine } from "./aurora-expectations-engine.js";
import { buildAuroraFeasibilityManifold } from "./aurora-feasibility-manifold.js";
import { buildAuroraValuationEnsemble } from "./aurora-valuation-ensemble.js";
import { evidenceForBeliefCompiler } from "./aurora-evidence-extractor.js";
import { monitorAuroraThesis } from "./aurora-thesis-monitor.js";

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

function arrayOrEmpty(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function firstAvailable(...values) {
  return values.find((value) => value != null);
}

function extractDocuments(input = {}) {
  return arrayOrEmpty(firstAvailable(input.documents, input.evidenceDocuments, input.snippets, input.texts));
}

function mergeSignalValue(existing, extracted) {
  const existingNumber = Number(existing);
  const extractedNumber = Number(extracted);
  if (Number.isFinite(existingNumber) && Number.isFinite(extractedNumber)) return clamp(existingNumber * 0.55 + extractedNumber * 0.45, 0, 1);
  if (Number.isFinite(existingNumber)) return clamp(existingNumber, 0, 1);
  if (Number.isFinite(extractedNumber)) return clamp(extractedNumber, 0, 1);
  return undefined;
}

function mergeEvidence(existingEvidence = {}, extractedEvidence = null) {
  if (!extractedEvidence) return existingEvidence || {};
  const existingSignals = existingEvidence.textSignals || existingEvidence.signals || {};
  const extractedSignals = extractedEvidence.textSignals || {};
  const signalKeys = new Set([...Object.keys(existingSignals), ...Object.keys(extractedSignals)]);
  const textSignals = {};
  signalKeys.forEach((key) => {
    const value = mergeSignalValue(existingSignals[key], extractedSignals[key]);
    if (isFiniteNumber(value)) textSignals[key] = value;
  });

  return {
    ...existingEvidence,
    textSignals,
    claims: [...arrayOrEmpty(existingEvidence.claims), ...arrayOrEmpty(extractedEvidence.claims)],
    risks: [...arrayOrEmpty(existingEvidence.risks || existingEvidence.riskFlags), ...arrayOrEmpty(extractedEvidence.risks || extractedEvidence.riskFlags)],
    quality: Math.max(Number(existingEvidence.quality) || 0, Number(extractedEvidence.quality) || 0),
    accountingTrust: firstAvailable(existingEvidence.accountingTrust, extractedEvidence.accountingTrust, textSignals.accountingTrust),
    sourceLineage: {
      ...(existingEvidence.sourceLineage || {}),
      extracted: extractedEvidence.sourceLineage || {},
    },
    extractor: extractedEvidence.extractor || existingEvidence.extractor || null,
  };
}

function stripPipelineOnlyFields(input = {}) {
  const {
    documents,
    evidenceDocuments,
    snippets,
    texts,
    observations,
    options,
    accounting,
    equilibrium,
    ...snapshot
  } = input;
  return snapshot;
}

function mergeEquilibriumDrivers(drivers = {}, equilibrium = null) {
  if (!equilibrium?.drivers) return drivers || {};
  const next = { ...(drivers || {}) };
  if (next.demandSupply == null && equilibrium.drivers.demandSupply != null) next.demandSupply = equilibrium.drivers.demandSupply;
  if (next.bottleneckPower == null && equilibrium.drivers.bottleneckPower != null) next.bottleneckPower = equilibrium.drivers.bottleneckPower;
  if (next.priceFormationPressure == null && equilibrium.drivers.priceFormationPressure != null) next.priceFormationPressure = equilibrium.drivers.priceFormationPressure;
  if (next.reflexivityScore == null && equilibrium.drivers.reflexivityScore != null) next.reflexivityScore = equilibrium.drivers.reflexivityScore;
  return next;
}

function buildPipelineDecision(
  compiled,
  monitor,
  extractedEvidence,
  driverGraph = null,
  equilibrium = null,
  forecast = null,
  valuationEnsemble = null,
  expectations = null,
  feasibilityManifold = null,
) {
  const qualityLevel = compiled.driverQuality?.level || "unknown";
  const beliefObject = compiled.beliefObject;
  const evidenceQuality = extractedEvidence?.extractor?.quality?.level || compiled.evidenceSignals?.quality?.level || null;

  if (qualityLevel === "insufficient") {
    return {
      state: "repair_inputs",
      action: "repair_inputs_before_interpretation",
      severity: 0.86,
      reason: "Critical valuation drivers are missing or too weak.",
    };
  }

  if (driverGraph?.graphHealth?.level === "incoherent" || driverGraph?.graphHealth?.hardViolationCount >= 2) {
    return {
      state: "causal_model_violation",
      action: "repair_driver_assumptions",
      severity: clamp(0.68 + (1 - driverGraph.graphHealth.score) * 0.24, 0, 1),
      reason: driverGraph.memo?.topConstraint || "Causal driver graph has incompatible assumptions.",
    };
  }

  if (equilibrium?.aggregate?.risk === "high_negative_pressure" || equilibrium?.reflexivity?.priceHurtsFundamentals) {
    return {
      state: "equilibrium_pressure_review",
      action: "review_supply_demand_and_price_formation",
      severity: clamp(0.58 + Math.abs(equilibrium.aggregate.score) * 0.28, 0, 1),
      reason: equilibrium.memo?.headline || "Supply/demand or equity-flow pressure is materially adverse.",
    };
  }

  if (forecast?.decision === "forecast_requires_review") {
    return {
      state: "forecast_requires_review",
      action: "review_posterior_assumptions",
      severity: clamp(0.58 + forecast.uncertainty.epistemic * 0.28, 0, 1),
      reason: forecast.memo?.topCheck || "Bayesian posterior forecast requires review before underwriting.",
    };
  }

  if (valuationEnsemble?.decision === "ensemble_requires_review" || valuationEnsemble?.decision === "ensemble_insufficient") {
    return {
      state: "valuation_ensemble_review",
      action: "review_method_disagreement_before_underwriting",
      severity: clamp(0.54 + (valuationEnsemble.summary?.disagreement || 0) * 0.26, 0, 1),
      reason: valuationEnsemble.memo?.headline || "Valuation ensemble requires method review.",
    };
  }

  if (expectations?.decision === "market_expectations_heroic" || expectations?.decision === "expectations_surface_insufficient") {
    return {
      state: "expectations_surface_review",
      action: "review_market_implied_expectations",
      severity: clamp(0.54 + (1 - (expectations.summary?.marketClearingFeasibility ?? 0.35)) * 0.24, 0, 1),
      reason: expectations.memo?.headline || "Market-implied expectations require review.",
    };
  }

  if (feasibilityManifold?.decision === "market_contour_implausible" || feasibilityManifold?.decision === "manifold_insufficient") {
    return {
      state: "feasibility_manifold_review",
      action: "review_economic_plausibility_of_market_contour",
      severity: clamp(0.58 + (1 - (feasibilityManifold.summary?.contourScore ?? 0.25)) * 0.22, 0, 1),
      reason: feasibilityManifold.memo?.headline || "Market contour falls outside plausible economic geometry.",
    };
  }

  if (monitor?.status === "tripped") {
    return {
      state: "thesis_broken_or_needs_reunderwriting",
      action: "re-underwrite_or_reject_thesis",
      severity: clamp(0.72 + monitor.confidence * 0.22, 0, 1),
      reason: monitor.memo?.headline || "At least one falsifier tripped.",
    };
  }

  if (monitor?.status === "deteriorating") {
    return {
      state: "thesis_deteriorating",
      action: "collect_evidence_and_update_belief_object",
      severity: clamp(0.48 + monitor.confidence * 0.22, 0, 1),
      reason: monitor.memo?.headline || "Evidence is deteriorating.",
    };
  }

  if (monitor?.status === "stale") {
    return {
      state: "refresh_required",
      action: "refresh_belief_object",
      severity: 0.58,
      reason: monitor.memo?.headline || "Thesis half-life expired.",
    };
  }

  if (beliefObject.abstain) {
    return {
      state: "memo_only",
      action: compiled.compilerMemo?.nextAction || "use_as_memo_only_and_collect_evidence",
      severity: 0.42,
      reason: beliefObject.memo?.headline || "Belief object recommends abstention.",
    };
  }

  if (monitor?.status === "intact") {
    return {
      state: "active_thesis_intact",
      action: "continue_monitoring",
      severity: 0.22,
      reason: monitor.memo?.headline || "Falsifiers remain intact.",
    };
  }

  return {
    state: "priced_belief_ready",
    action: "ready_for_priced_belief_review",
    severity: evidenceQuality === "insufficient" ? 0.48 : 0.3,
    reason: compiled.compilerMemo?.nextAction || "Compiled belief object is ready for review.",
  };
}

function buildPipelineMemo(
  compiled,
  monitor,
  decision,
  driverGraph = null,
  equilibrium = null,
  forecast = null,
  valuationEnsemble = null,
  expectations = null,
  feasibilityManifold = null,
) {
  const belief = compiled.beliefObject;
  const topLens = belief.lensLegitimacy?.[0]?.key || "unknown";
  const topFalsifier = monitor?.topIssues?.[0]?.message || compiled.compilerMemo?.topFalsifier?.text || belief.falsifiers?.[0]?.text || null;
  return {
    headline: decision.reason,
    state: decision.state,
    action: decision.action,
    bullets: [
      `Driver readiness: ${compiled.driverQuality.level}.`,
      `Belief status: ${belief.status}.`,
      driverGraph ? `Driver graph: ${driverGraph.graphHealth.level}.` : "Driver graph: not run.",
      equilibrium ? `Equilibrium: ${equilibrium.aggregate.risk}.` : "Equilibrium: not run.",
      forecast ? `Forecast: ${forecast.decision}.` : "Forecast: not run.",
      valuationEnsemble ? `Valuation ensemble: ${valuationEnsemble.decision}.` : "Valuation ensemble: not run.",
      expectations ? `Expectations surface: ${expectations.decision}.` : "Expectations surface: not run.",
      feasibilityManifold ? `Feasibility manifold: ${feasibilityManifold.decision}.` : "Feasibility manifold: not run.",
      `Top valuation lens: ${topLens}.`,
      monitor ? `Monitor status: ${monitor.status}.` : "Monitor status: not run.",
    ],
    topFalsifier,
  };
}

export function runAuroraBeliefPipeline(input = {}, options = {}) {
  const pipelineOptions = { ...(input.options || {}), ...options };
  const documents = extractDocuments(input);
  const extractedEvidence = documents.length
    ? evidenceForBeliefCompiler({ documents }, pipelineOptions)
    : null;
  const evidence = mergeEvidence(input.evidence || {}, extractedEvidence);
  const baseSnapshot = {
    ...stripPipelineOnlyFields(input),
    evidence,
  };
  const accounting = input.accounting || buildAuroraAccountingEngine(baseSnapshot, pipelineOptions);
  const equilibriumBase = {
    ...baseSnapshot,
    accounting,
  };
  const equilibrium = input.equilibrium || buildAuroraEquilibriumEngine(equilibriumBase, pipelineOptions);
  const snapshot = {
    ...baseSnapshot,
    accounting,
    equilibrium,
    drivers: mergeEquilibriumDrivers(baseSnapshot.drivers, equilibrium),
  };
  const compiled = compileAuroraBeliefObject(snapshot, pipelineOptions);
  const driverGraph = buildAuroraDriverGraph(compiled, pipelineOptions);
  const forecast = buildAuroraBayesianForecastEngine(
    {
      ...baseSnapshot,
      evidence,
      accounting,
      equilibrium,
      compiled,
      driverGraph,
    },
    pipelineOptions,
  );
  const valuationEnsemble = buildAuroraValuationEnsemble(
    {
      ...baseSnapshot,
      evidence,
      accounting,
      equilibrium,
      compiled,
      driverGraph,
      forecast,
      beliefObject: compiled.beliefObject,
    },
    pipelineOptions,
  );
  const expectations = buildAuroraExpectationsEngine(
    {
      ...baseSnapshot,
      evidence,
      accounting,
      equilibrium,
      compiled,
      driverGraph,
      forecast,
      valuationEnsemble,
      beliefObject: compiled.beliefObject,
    },
    pipelineOptions,
  );
  const feasibilityManifold = buildAuroraFeasibilityManifold(
    {
      ...baseSnapshot,
      evidence,
      accounting,
      equilibrium,
      compiled,
      driverGraph,
      forecast,
      valuationEnsemble,
      expectations,
      beliefObject: compiled.beliefObject,
    },
    pipelineOptions,
  );
  const observations = input.observations || null;
  const monitor = observations ? monitorAuroraThesis(compiled, observations, pipelineOptions) : null;
  const decision = buildPipelineDecision(compiled, monitor, extractedEvidence, driverGraph, equilibrium, forecast, valuationEnsemble, expectations, feasibilityManifold);

  return {
    version: "aurora_belief_pipeline_v1",
    ranAt: pipelineOptions.ranAt || new Date().toISOString(),
    ticker: compiled.ticker,
    name: compiled.name,
    decision,
    evidence,
    extractedEvidence,
    accounting,
    equilibrium,
    compiled,
    driverGraph,
    forecast,
    valuationEnsemble,
    expectations,
    feasibilityManifold,
    beliefObject: compiled.beliefObject,
    monitor,
    memo: buildPipelineMemo(compiled, monitor, decision, driverGraph, equilibrium, forecast, valuationEnsemble, expectations, feasibilityManifold),
  };
}

export function runAuroraBeliefPipelinePanel(items = [], options = {}) {
  const rows = arrayOrEmpty(items).map((item) => runAuroraBeliefPipeline(item, options));
  const counts = rows.reduce((acc, row) => {
    acc[row.decision.state] = (acc[row.decision.state] || 0) + 1;
    return acc;
  }, {});
  const averageSeverity = rows.length ? rows.reduce((sum, row) => sum + row.decision.severity, 0) / rows.length : 0;
  const monitorCounts = rows.reduce((acc, row) => {
    const status = row.monitor?.status || "not_run";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return {
    version: "aurora_belief_pipeline_panel_v1",
    count: rows.length,
    counts,
    monitorCounts,
    averageSeverity,
    rows,
  };
}
