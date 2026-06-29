import { compileAuroraBeliefObject } from "./aurora-belief-compiler.js";
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
    ...snapshot
  } = input;
  return snapshot;
}

function buildPipelineDecision(compiled, monitor, extractedEvidence) {
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

function buildPipelineMemo(compiled, monitor, decision) {
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
  const snapshot = {
    ...stripPipelineOnlyFields(input),
    evidence,
  };
  const compiled = compileAuroraBeliefObject(snapshot, pipelineOptions);
  const observations = input.observations || null;
  const monitor = observations ? monitorAuroraThesis(compiled, observations, pipelineOptions) : null;
  const decision = buildPipelineDecision(compiled, monitor, extractedEvidence);

  return {
    version: "aurora_belief_pipeline_v1",
    ranAt: pipelineOptions.ranAt || new Date().toISOString(),
    ticker: compiled.ticker,
    name: compiled.name,
    decision,
    evidence,
    extractedEvidence,
    compiled,
    beliefObject: compiled.beliefObject,
    monitor,
    memo: buildPipelineMemo(compiled, monitor, decision),
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
