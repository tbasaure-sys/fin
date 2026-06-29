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

function mean(values) {
  const clean = values.filter(isFiniteNumber);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function boolish(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return /^(true|yes|y|1|available|validated|present)$/i.test(value.trim());
  return Boolean(value);
}

function classifySource(record = {}) {
  const provider = String(firstText(record.provider, record.source, record.name, record.url, "")).toLowerCase();
  const type = String(firstText(record.type, record.kind, record.category, record.datasetType, "")).toLowerCase();
  const combined = `${provider} ${type}`;
  if (/sec|edgar|xbrl|10-k|10-q|20-f|regulatory filing|annual report/.test(combined)) return "primary_disclosure";
  if (/fmp|financial modeling prep|factset|capital iq|refinitiv|bloomberg|yfinance|normalized/.test(combined)) return "normalized_vendor";
  if (/alfred|vintage/.test(combined)) return "macro_point_in_time";
  if (/fred|bls|eia|treasury|macro|inflation|employment|energy/.test(combined)) return "macro_public";
  if (/investor relations|ir|presentation|earnings release|company press/.test(combined)) return "company_ir";
  if (/transcript|earnings call|conference call/.test(combined)) return "management_transcript";
  if (/news|gdelt|article|media/.test(combined)) return "news_narrative";
  if (/patent|citation|traffic|web|common crawl|app rank|hiring|job posting|import|export|customs|tender|alternative|alt data|scrape|satellite|price check/.test(combined)) {
    return "alternative_data";
  }
  return "manual_or_unknown";
}

function extractExplicitSources(input = {}) {
  return [
    ...arrayOrEmpty(input.sources),
    ...arrayOrEmpty(input.sourceLedger),
    ...arrayOrEmpty(input.dataSources),
    ...arrayOrEmpty(input.sourceGovernance?.sources),
  ];
}

function extractDocumentSources(input = {}) {
  const documents = [
    ...arrayOrEmpty(input.documents),
    ...arrayOrEmpty(input.evidenceDocuments),
    ...arrayOrEmpty(input.snippets),
    ...arrayOrEmpty(input.texts),
  ];
  return documents.map((document, index) => {
    if (typeof document === "string") {
      return {
        id: `document_source_${index + 1}`,
        type: "manual text",
        provider: "inline",
        source: "inline",
        title: null,
        usedFor: ["evidence"],
      };
    }
    return {
      id: document.id || document.url || `document_source_${index + 1}`,
      type: document.type || document.kind || "document",
      provider: document.provider || document.source || document.url || "inline",
      source: document.source || document.provider || document.url || "inline",
      title: document.title || document.headline || null,
      publishedAt: document.publishedAt || document.date || null,
      availableAt: document.availableAt || document.asOfDate || document.filingDate || document.acceptedDate || document.publishedAt || document.date || null,
      methodologyVersion: document.methodologyVersion || null,
      usedFor: document.usedFor || ["evidence"],
      economicDefinition: document.economicDefinition,
      historyStart: document.historyStart,
      historyEnd: document.historyEnd,
      methodologyChangeLog: document.methodologyChangeLog,
      validation: document.validation,
    };
  });
}

function normalizeSource(record = {}, index = 0) {
  const sourceClass = classifySource(record);
  const usedFor = arrayOrEmpty(record.usedFor || record.use || record.feeds || record.purpose).map(String);
  return {
    id: record.id || record.sourceId || `source_${index + 1}`,
    provider: firstText(record.provider, record.source, record.name, record.url, "unknown"),
    type: firstText(record.type, record.kind, record.category, record.datasetType, "unknown"),
    sourceClass,
    url: record.url || null,
    title: record.title || null,
    observationDate: record.observationDate || record.date || record.periodEnd || record.fiscalDate || null,
    releaseDate: record.releaseDate || record.publishedAt || record.filingDate || null,
    availableAt: record.availableAt || record.acceptedDate || record.asOfDate || record.releaseDate || record.publishedAt || record.filingDate || null,
    vintageDate: record.vintageDate || record.realtimeStart || record.realtime_start || record.alfredVintage || null,
    methodologyVersion: record.methodologyVersion || record.schemaVersion || record.revision || null,
    methodologyChangeLog: record.methodologyChangeLog || record.changeLog || record.methodologyNotes || null,
    economicDefinition: record.economicDefinition || record.definition || record.metricDefinition || null,
    historyStart: record.historyStart || record.firstObservationDate || null,
    historyEnd: record.historyEnd || record.lastObservationDate || null,
    historyAvailable: boolish(record.historyAvailable || (record.historyStart && record.historyEnd)),
    validation: record.validation || record.outcomeValidation || record.backtestValidation || null,
    usedFor: usedFor.length ? usedFor : ["evidence"],
    usedForValuation: record.usedForValuation !== false && !/memo|display_only|context_only/i.test(String(usedFor.join(" "))),
  };
}

function controlsForSource(source) {
  const missing = [];
  const hasAvailability = Boolean(source.availableAt || source.vintageDate);
  const hasMethodologyControl = Boolean(source.methodologyVersion || source.methodologyChangeLog);
  const hasValidation = Boolean(source.validation);
  const hasHistory = Boolean(source.historyAvailable || source.historyStart || source.historyEnd);
  const hasDefinition = Boolean(source.economicDefinition);

  if (!hasAvailability) missing.push("availability_date");
  if (source.sourceClass === "macro_public" && !source.vintageDate) missing.push("macro_vintage");

  if (source.sourceClass === "alternative_data") {
    if (!hasDefinition) missing.push("economic_definition");
    if (!hasHistory) missing.push("history");
    if (!hasMethodologyControl) missing.push("methodology_change_control");
    if (!hasValidation) missing.push("outcome_validation");
  }

  if (source.sourceClass === "manual_or_unknown") {
    if (!hasDefinition) missing.push("source_definition");
  }

  return {
    hasAvailability,
    hasMethodologyControl,
    hasValidation,
    hasHistory,
    hasDefinition,
    missing,
  };
}

function baseScoreForClass(sourceClass) {
  return {
    primary_disclosure: 92,
    macro_point_in_time: 88,
    normalized_vendor: 76,
    company_ir: 70,
    management_transcript: 66,
    macro_public: 64,
    news_narrative: 52,
    alternative_data: 46,
    manual_or_unknown: 38,
  }[sourceClass] || 40;
}

function scoreSource(source) {
  const controls = controlsForSource(source);
  const missingPenalty = controls.missing.length * (source.sourceClass === "alternative_data" ? 18 : 9);
  const vintagePenalty = source.sourceClass === "macro_public" && !source.vintageDate ? 16 : 0;
  const controlBonus =
    source.sourceClass === "alternative_data"
      ? (controls.hasDefinition ? 8 : 0)
        + (controls.hasHistory ? 10 : 0)
        + (controls.hasAvailability ? 8 : 0)
        + (controls.hasMethodologyControl ? 10 : 0)
        + (controls.hasValidation ? 12 : 0)
      : (controls.hasAvailability ? 4 : 0) + (controls.hasMethodologyControl ? 3 : 0) + (controls.hasValidation ? 3 : 0);
  const score = clamp(baseScoreForClass(source.sourceClass) + controlBonus - missingPenalty - vintagePenalty, 0, 100);
  const alternativeBlocked = source.sourceClass === "alternative_data" && controls.missing.length > 0 && source.usedForValuation;
  const macroWarning = source.sourceClass === "macro_public" && !source.vintageDate && source.usedForValuation;
  const valuationUse = alternativeBlocked ? "restricted" : macroWarning ? "allowed_with_vintage_warning" : score >= 58 ? "allowed" : "memo_only";
  return {
    ...source,
    controls,
    trustScore: score,
    pointInTimeStatus: controls.hasAvailability
      ? source.vintageDate
        ? "vintage_available"
        : "availability_date_available"
      : "availability_missing",
    valuationUse,
    warnings: [
      ...(alternativeBlocked ? ["Alternative data source lacks required controls and cannot feed valuation directly."] : []),
      ...(macroWarning ? ["Macro source lacks vintage metadata; beware revised-data leakage."] : []),
      ...(source.sourceClass === "manual_or_unknown" ? ["Unknown source class; treat as memo support until defined."] : []),
    ],
  };
}

function buildSummary(scoredSources) {
  const byClass = scoredSources.reduce((acc, source) => {
    acc[source.sourceClass] ||= { count: 0, restricted: 0, averageTrustScore: null, scores: [] };
    acc[source.sourceClass].count += 1;
    if (source.valuationUse === "restricted") acc[source.sourceClass].restricted += 1;
    acc[source.sourceClass].scores.push(source.trustScore);
    return acc;
  }, {});
  Object.values(byClass).forEach((item) => {
    item.averageTrustScore = mean(item.scores);
    delete item.scores;
  });

  const restricted = scoredSources.filter((source) => source.valuationUse === "restricted");
  const alternative = scoredSources.filter((source) => source.sourceClass === "alternative_data");
  const available = scoredSources.filter((source) => source.controls.hasAvailability);
  const methodologyControlled = scoredSources.filter((source) => source.controls.hasMethodologyControl);
  const validated = scoredSources.filter((source) => source.controls.hasValidation);
  return {
    sourceCount: scoredSources.length,
    byClass,
    restrictedValuationSources: restricted.length,
    restrictedSourceIds: restricted.map((source) => source.id),
    alternativeSourceCount: alternative.length,
    alternativeReadyShare: alternative.length ? alternative.filter((source) => source.valuationUse !== "restricted").length / alternative.length : null,
    pointInTimeScore: scoredSources.length ? available.length / scoredSources.length : null,
    methodologyControlScore: scoredSources.length ? methodologyControlled.length / scoredSources.length : null,
    validationScore: scoredSources.length ? validated.length / scoredSources.length : null,
    averageTrustScore: mean(scoredSources.map((source) => source.trustScore)),
    warnings: [...new Set(scoredSources.flatMap((source) => source.warnings))],
  };
}

function decisionFromSummary(summary) {
  if (!summary.sourceCount) return "source_governance_pending";
  if (summary.restrictedValuationSources > 0) return "source_governance_restricted";
  if ((summary.pointInTimeScore ?? 1) < 0.45 || (summary.averageTrustScore ?? 100) < 55) return "source_governance_watch";
  return "source_governance_usable";
}

export function buildAuroraSourceGovernanceEngine(input = {}, options = {}) {
  const rawSources = [...extractExplicitSources(input), ...extractDocumentSources(input)];
  const deduped = [];
  const seen = new Set();
  rawSources.forEach((record, index) => {
    const source = normalizeSource(record, index);
    const key = `${source.id}|${source.provider}|${source.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(source);
  });
  const sources = deduped.map(scoreSource);
  const summary = buildSummary(sources);
  const decision = decisionFromSummary(summary);

  return {
    version: "aurora_source_governance_engine_v1",
    builtAt: options.builtAt || new Date().toISOString(),
    decision,
    sources,
    summary,
    memo: {
      headline: `Source governance is ${decision.replaceAll("_", " ")}.`,
      sourceCount: summary.sourceCount,
      restrictedValuationSources: summary.restrictedValuationSources,
      averageTrustScore: summary.averageTrustScore,
      topWarning: summary.warnings[0] || null,
    },
  };
}
