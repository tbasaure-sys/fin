const ECONOMIC_VARIABLE_WEIGHTS = {
  revenue_durability: 0.84,
  revenue_growth: 0.78,
  growth_durability: 0.8,
  pricing_power: 0.82,
  gross_margin: 0.8,
  operating_margin: 0.82,
  margin_durability: 0.84,
  fcf_conversion: 0.86,
  free_cash_flow_conversion: 0.86,
  roic: 0.82,
  reinvestment_efficiency: 0.78,
  balance_sheet: 0.82,
  liquidity: 0.86,
  debt_refinancing: 0.84,
  customer_concentration: 0.8,
  moat: 0.76,
  regulatory_risk: 0.78,
  accounting_quality: 0.88,
  management_credibility: 0.82,
  capital_allocation: 0.74,
};

const EVIDENCE_TYPE_WEIGHTS = {
  accounting_quality: 0.9,
  liquidity: 0.88,
  debt: 0.86,
  covenant: 0.86,
  customer_concentration: 0.84,
  margin_pressure: 0.82,
  pricing_power: 0.8,
  demand_visibility: 0.78,
  backlog: 0.78,
  bookings: 0.78,
  mdna_driver_change: 0.78,
  risk_factor: 0.74,
  regulatory_risk: 0.74,
  capital_allocation: 0.72,
  management_claim: 0.72,
  boilerplate: 0.18,
};

const DIGESTION_WEIGHTS = {
  priceReaction: 0.3,
  volumeReaction: 0.15,
  newsCoverage: 0.18,
  analystRevision: 0.2,
  transcriptAttention: 0.1,
  consensusNarrative: 0.07,
};

const ISSUE_KEYWORD_MAP = {
  revenue_durability: [/revenue/i, /growth/i, /demand/i, /bookings?/i, /rpo/i, /backlog/i],
  revenue_growth: [/revenue/i, /growth/i, /demand/i, /bookings?/i],
  growth_durability: [/growth/i, /demand/i, /bookings?/i, /retention/i],
  pricing_power: [/pricing/i, /price increases?/i, /discounting/i, /asp/i],
  gross_margin: [/gross margin/i, /margin/i, /mix/i, /cost inflation/i],
  operating_margin: [/operating margin/i, /margin/i, /operating leverage/i, /cost discipline/i],
  margin_durability: [/margin/i, /pricing/i, /discounting/i, /cost inflation/i],
  fcf_conversion: [/free cash flow/i, /cash conversion/i, /working capital/i, /receivables?/i, /inventory/i],
  free_cash_flow_conversion: [/free cash flow/i, /cash conversion/i, /working capital/i, /receivables?/i, /inventory/i],
  liquidity: [/liquidity/i, /cash/i, /revolver/i, /refinancing/i, /covenants?/i],
  balance_sheet: [/balance sheet/i, /leverage/i, /debt/i, /cash/i, /refinancing/i],
  customer_concentration: [/customer concentration/i, /largest customer/i, /top customer/i, /single customer/i],
  accounting_quality: [/accounting/i, /internal controls?/i, /material weakness/i, /restatement/i, /audit/i],
  regulatory_risk: [/regulatory/i, /litigation/i, /investigation/i, /tariff/i, /sanction/i],
  management_credibility: [/guidance/i, /management/i, /credibility/i, /execution/i],
};

function clamp(value, min = 0, max = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

function numeric(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function arrayOrEmpty(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function scoreFromRaw(value, options = {}) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (options.percent) return clamp(parsed / 100);
  if (Math.abs(parsed) <= 1) return clamp(Math.abs(parsed));
  if (options.logScale) return clamp(Math.log1p(Math.abs(parsed)) / Math.log1p(options.logScale));
  return clamp(parsed / (options.scale || 100));
}

function daysBetween(start, end) {
  const a = start ? new Date(start) : null;
  const b = end ? new Date(end) : null;
  if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function freshnessScore(eventDate, asOfDate, halfLifeDays = 45) {
  const age = daysBetween(eventDate, asOfDate || new Date().toISOString());
  if (!Number.isFinite(age)) return 0.58;
  if (age < 0) return 0.55;
  return clamp(Math.exp(-age / Math.max(1, halfLifeDays)), 0.08, 1);
}

function firstText(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || null;
}

function scoreEvidenceImportance(item = {}, context = {}) {
  const explicit = numeric(item.evidenceImportance ?? item.importance ?? item.importanceScore, null);
  if (explicit != null) return clamp(explicit > 1 ? explicit / 100 : explicit);

  const evidenceType = normalizeKey(item.evidenceType || item.type || item.signal || item.key);
  const thesisVariable = normalizeKey(item.thesisVariable || item.variable || item.affectedVariable);
  const typeWeight = EVIDENCE_TYPE_WEIGHTS[evidenceType] ?? 0.5;
  const variableWeight = ECONOMIC_VARIABLE_WEIGHTS[thesisVariable] ?? 0.52;
  const financialMateriality = clamp(numeric(item.financialMateriality, null) ?? Math.max(typeWeight, variableWeight));
  const semanticNovelty = clamp(numeric(item.semanticNovelty ?? item.noveltyScore ?? item.semanticChangeScore, null) ?? 0.5);
  const thesisRelevance = clamp(numeric(item.thesisRelevance ?? item.thesisWeight, null) ?? variableWeight);
  const contradictionStrength = clamp(numeric(item.contradictionStrength ?? item.contradiction, null) ?? (item.contradicts ? 0.78 : 0.28));
  const baseRateRisk = clamp(numeric(item.baseRateRisk ?? item.base_rate_risk, null) ?? (["liquidity", "accounting_quality", "customer_concentration"].includes(evidenceType) ? 0.68 : 0.42));
  const managementCredibilityChange = clamp(
    numeric(item.managementCredibilityChange ?? item.managementCredibility, null) ?? (evidenceType === "management_claim" ? 0.66 : 0.38),
  );
  const sourceBoost = /10-k|10-q|sec|filing|md&a|mdna/i.test(String(item.source || item.eventType || context.eventType || "")) ? 0.05 : 0;
  return clamp(
    0.25 * financialMateriality +
      0.2 * semanticNovelty +
      0.2 * thesisRelevance +
      0.15 * contradictionStrength +
      0.1 * baseRateRisk +
      0.1 * managementCredibilityChange +
      sourceBoost,
  );
}

function scoreMarketDigestion(attention = {}) {
  const priceReaction =
    numeric(attention.priceReactionScore, null) ??
    scoreFromRaw(attention.abnormalReturn ?? attention.priceReaction ?? attention.eventReturn, { scale: 0.12 });
  const volumeReaction =
    numeric(attention.volumeReactionScore, null) ??
    scoreFromRaw(attention.abnormalVolume ?? attention.volumeReaction ?? attention.volumeZ, { logScale: 6 });
  const newsCoverage =
    numeric(attention.newsCoverageScore, null) ??
    scoreFromRaw(attention.newsCount ?? attention.newsMentions, { logScale: 18 });
  const analystRevision =
    numeric(attention.analystRevisionScore, null) ??
    scoreFromRaw(attention.analystRevision ?? attention.ratingRevision ?? attention.estimateRevision, { scale: 0.35 });
  const transcriptAttention =
    numeric(attention.transcriptAttentionScore, null) ??
    scoreFromRaw(attention.transcriptMentions ?? attention.analystQuestionCount, { logScale: 8 });
  const consensusNarrative =
    numeric(attention.consensusNarrativeScore, null) ??
    scoreFromRaw(attention.narrativeMentions ?? attention.consensusMentions, { logScale: 12 });

  const components = {
    priceReaction: clamp(priceReaction ?? 0),
    volumeReaction: clamp(volumeReaction ?? 0),
    newsCoverage: clamp(newsCoverage ?? 0),
    analystRevision: clamp(analystRevision ?? 0),
    transcriptAttention: clamp(transcriptAttention ?? 0),
    consensusNarrative: clamp(consensusNarrative ?? 0),
  };
  const score = Object.entries(DIGESTION_WEIGHTS).reduce((sum, [key, weight]) => sum + components[key] * weight, 0);
  return {
    score: clamp(score),
    level: score >= 0.72 ? "high" : score >= 0.46 ? "partial" : score >= 0.22 ? "thin" : "low",
    components,
  };
}

function eventAttentionInput(attention = {}) {
  if (attention.eventAttention || attention.event) return attention.eventAttention || attention.event;
  return attention;
}

function issueEventsFromAttention(attention = {}, input = {}) {
  return [
    ...arrayOrEmpty(attention.issueAttentionEvents || attention.issueEvents || attention.issues),
    ...arrayOrEmpty(input.issueAttentionEvents || input.issueEvents),
  ];
}

function textMatchesIssue(text, issueKey) {
  const patterns = ISSUE_KEYWORD_MAP[issueKey] || [];
  return patterns.some((pattern) => pattern.test(String(text || "")));
}

function eventIssueKey(event = {}) {
  return normalizeKey(event.thesisVariable || event.variable || event.issueKey || event.evidenceType || event.topic);
}

function issueEventRelevance(event = {}, item = {}) {
  const itemVariable = normalizeKey(item.thesisVariable || item.variable || item.affectedVariable);
  const itemType = normalizeKey(item.evidenceType || item.type || item.signal);
  const issueKey = eventIssueKey(event);
  const explicit = numeric(event.issueRelevanceScore ?? event.relevance ?? event.issueRelevance, null);
  if (explicit != null) return clamp(explicit > 1 ? explicit / 100 : explicit);
  if (issueKey && (issueKey === itemVariable || issueKey === itemType)) return 1;
  const text = [event.excerpt, event.headline, event.summary, event.text, event.title].filter(Boolean).join(" ");
  if (textMatchesIssue(text, itemVariable) || textMatchesIssue(text, itemType)) return 0.78;
  if (issueKey) return 0;
  return 0;
}

function scoreIssueLevelDigestion(item = {}, attention = {}, input = {}) {
  const explicit =
    numeric(item.issueDigestionScore, null) ??
    numeric(attention.issueDigestionScore, null) ??
    numeric(attention.issueDigestionScores?.[normalizeKey(item.thesisVariable)], null) ??
    numeric(attention.issueDigestionScores?.[normalizeKey(item.evidenceType)], null);
  if (explicit != null) {
    const score = clamp(explicit > 1 ? explicit / 100 : explicit);
    return {
      score,
      level: score >= 0.72 ? "high" : score >= 0.46 ? "partial" : score >= 0.22 ? "thin" : "low",
      components: { explicit: score },
      coverage: "explicit",
      matchedEvents: 0,
      totalEvents: 0,
    };
  }

  const events = issueEventsFromAttention(attention, input);
  if (!events.length) return null;

  let weighted = 0;
  let weight = 0;
  let matchedEvents = 0;
  events.forEach((event) => {
    const relevance = issueEventRelevance(event, item);
    if (relevance <= 0) return;
    matchedEvents += 1;
    const intensity =
      numeric(event.digestionContribution, null) ??
      numeric(event.attentionIntensity, null) ??
      numeric(event.intensity, null) ??
      scoreFromRaw(event.newsCount ?? event.mentions ?? event.count ?? 1, { logScale: 10 }) ??
      0.35;
    weighted += clamp(intensity) * relevance;
    weight += relevance;
  });

  const score = weight > 0 ? clamp(weighted / weight) : 0;
  return {
    score,
    level: score >= 0.72 ? "high" : score >= 0.46 ? "partial" : score >= 0.22 ? "thin" : "low",
    components: {
      matchedIssueEvents: matchedEvents,
      totalIssueEvents: events.length,
      weightedIssueAttention: score,
    },
    coverage: matchedEvents ? "matched_issue_events" : "no_matching_issue_events",
    matchedEvents,
    totalEvents: events.length,
  };
}

function combineDigestion(eventDigestion, issueDigestion) {
  if (!issueDigestion) {
    return {
      ...eventDigestion,
      mode: "event_level",
      eventAttention: eventDigestion,
      issueAttention: eventDigestion,
      misdirectedAttentionScore: 0,
      misdirectedAttentionLevel: "none",
    };
  }
  const misdirected = clamp(eventDigestion.score - issueDigestion.score);
  return {
    score: issueDigestion.score,
    level: issueDigestion.level,
    components: issueDigestion.components,
    mode: "issue_level",
    eventAttention: eventDigestion,
    issueAttention: issueDigestion,
    misdirectedAttentionScore: misdirected,
    misdirectedAttentionLevel: misdirected >= 0.55 ? "high" : misdirected >= 0.32 ? "medium" : misdirected >= 0.16 ? "low" : "none",
  };
}

function scoreConfidence(item = {}, extractedEvidence = null) {
  const explicit = numeric(item.confidence, null);
  if (explicit != null) return clamp(explicit > 1 ? explicit / 100 : explicit);
  const extractionQuality = numeric(extractedEvidence?.quality?.score ?? extractedEvidence?.quality, null);
  const hasExcerpt = Boolean(item.excerpt || item.sourceQuote || item.whatChanged);
  const hasVariable = Boolean(item.thesisVariable || item.variable || item.affectedVariable);
  return clamp(0.34 + (extractionQuality ?? 0.45) * 0.32 + (hasExcerpt ? 0.14 : 0) + (hasVariable ? 0.12 : 0));
}

function scoreInvestability(context = {}) {
  const explicit = numeric(context.investability, null);
  if (explicit != null) return clamp(explicit > 1 ? explicit / 100 : explicit);
  const marketCap = numeric(context.marketCap ?? context.market_cap, null);
  const liquidity = numeric(context.liquidityScore ?? context.averageDollarVolumeScore, null);
  const coverage = numeric(context.coverageScore ?? context.analystCoverageScore, null);
  let score = 0.62;
  if (marketCap != null) score += marketCap >= 10_000_000_000 ? 0.12 : marketCap >= 1_000_000_000 ? 0.06 : -0.12;
  if (liquidity != null) score = score * 0.72 + clamp(liquidity) * 0.28;
  if (coverage != null) score = score * 0.82 + clamp(coverage) * 0.18;
  return clamp(score, 0.12, 1);
}

function classifyQuadrant(importance, digestion) {
  if (importance >= 0.68 && digestion <= 0.38) return "aurora_zone";
  if (importance >= 0.68 && digestion > 0.38) return "important_but_likely_processed";
  if (importance < 0.68 && digestion <= 0.38) return "low_attention_noise";
  return "low_priority_digestible";
}

function decisionFromScore(score, quadrant, confidence) {
  if (quadrant === "low_attention_noise") return "dismiss_or_archive";
  if (quadrant === "important_but_likely_processed") return "monitor_digesting_consensus";
  if (quadrant === "aurora_zone" && score >= 0.5 && confidence >= 0.58) return "investigate_now";
  if (score >= 0.35) return "active_watchlist";
  if (score >= 0.32) return "monitor_only";
  return "low_priority";
}

function defaultFalsifier(item = {}) {
  const variable = normalizeKey(item.thesisVariable || item.variable || item.affectedVariable);
  if (/margin/.test(variable)) return "Downgrade if the next reported margin metrics do not deteriorate or management explains the pressure as temporary.";
  if (/revenue|growth|demand/.test(variable)) return "Downgrade if bookings, revenue growth, or demand commentary remain stable in the next update.";
  if (/liquidity|debt|balance/.test(variable)) return "Downgrade if cash conversion, revolver usage, and refinancing metrics normalize in the next report.";
  if (/customer/.test(variable)) return "Downgrade if customer concentration declines or the named customer risk is not visible in revenue quality.";
  if (/accounting/.test(variable)) return "Downgrade if subsequent filings and auditor language show no control, restatement, or cash-conversion deterioration.";
  return "Downgrade if the affected thesis variable is not confirmed by the next filing, transcript, or KPI update.";
}

function normalizeEvidenceItem(raw = {}, index = 0, context = {}) {
  const eventDate = raw.eventDate || raw.date || raw.filingDate || context.eventDate || context.filingDate || context.date || null;
  return {
    id: raw.id || raw.evidenceId || `evidence_${index + 1}`,
    ticker: raw.ticker || context.ticker || context.company?.ticker || null,
    companyName: raw.companyName || context.companyName || context.company?.name || null,
    eventType: raw.eventType || raw.filingType || context.eventType || context.formType || "public_evidence",
    eventDate,
    evidenceType: normalizeKey(raw.evidenceType || raw.type || raw.signal || "public_evidence"),
    direction: raw.direction || raw.polarity || "uncertain",
    thesisVariable: normalizeKey(raw.thesisVariable || raw.variable || raw.affectedVariable || "unspecified"),
    summary: firstText(raw.summary, raw.claim, raw.text, raw.whatChanged) || "Public evidence changed.",
    whyItMatters: firstText(raw.whyItMatters, raw.why_it_matters, raw.interpretation) || "This may affect an economically relevant thesis variable.",
    whatChanged: firstText(raw.whatChanged, raw.diffText, raw.excerpt, raw.sourceQuote, raw.summary) || "Evidence changed relative to the prior state.",
    source: raw.source || raw.documentId || raw.filingUrl || context.source || null,
    excerpt: raw.excerpt || raw.sourceQuote || null,
    falsifier: firstText(raw.falsifier, raw.falsifierText) || defaultFalsifier(raw),
    raw,
  };
}

function evidenceItemsFromExtractor(extractedEvidence = null, context = {}) {
  if (!extractedEvidence) return [];
  const claims = arrayOrEmpty(extractedEvidence.claims);
  const risks = arrayOrEmpty(extractedEvidence.risks || extractedEvidence.riskFlags);
  const claimItems = claims.slice(0, 12).map((claim, index) => ({
    id: claim.id || `claim_${index + 1}`,
    evidenceType: claim.type || claim.signal,
    direction: claim.polarity === "adverse" ? "bearish" : claim.polarity === "supportive" ? "bullish" : "uncertain",
    thesisVariable: claim.thesisVariable || claim.signal,
    summary: claim.excerpt || `${claim.type || claim.signal} evidence detected.`,
    whatChanged: claim.excerpt,
    whyItMatters: "The extracted filing/transcript language maps to a thesis variable that may need review.",
    confidence: claim.confidence,
    source: claim.source || claim.documentId,
    excerpt: claim.excerpt,
    eventDate: context.eventDate,
  }));
  const riskItems = risks.slice(0, 8).map((risk, index) => ({
    id: risk.id || `risk_${index + 1}`,
    evidenceType: risk.key || "risk_flag",
    direction: "bearish",
    thesisVariable: risk.key || "risk_flag",
    summary: risk.text || "Evidence risk flag requires review.",
    whatChanged: risk.text,
    whyItMatters: "Risk flags are only actionable when they affect a live thesis variable and appear underprocessed.",
    confidence: risk.severity,
    semanticNovelty: risk.severity,
    financialMateriality: risk.severity,
    source: risk.source || null,
    eventDate: context.eventDate,
  }));
  return [...claimItems, ...riskItems];
}

function buildEvidenceCard(item, scores) {
  return {
    version: "aurora_evidence_card_v1",
    id: item.id,
    ticker: item.ticker,
    event: {
      type: item.eventType,
      date: item.eventDate,
      source: item.source,
    },
    signalType: item.evidenceType,
    direction: item.direction,
    thesisVariable: item.thesisVariable,
    processingGapScore: Math.round(scores.priorityScore * 100),
    evidenceImportance: Math.round(scores.evidenceImportance * 100),
    marketDigestion: Math.round(scores.marketDigestion.score * 100),
    digestionMode: scores.marketDigestion.mode,
    eventAttention: Math.round((scores.marketDigestion.eventAttention?.score ?? scores.marketDigestion.score) * 100),
    issueAttention: Math.round((scores.marketDigestion.issueAttention?.score ?? scores.marketDigestion.score) * 100),
    misdirectedAttention: Math.round((scores.marketDigestion.misdirectedAttentionScore || 0) * 100),
    misdirectedAttentionLevel: scores.marketDigestion.misdirectedAttentionLevel || "none",
    confidence: scores.confidence >= 0.72 ? "high" : scores.confidence >= 0.48 ? "medium" : "low",
    status: scores.decision,
    quadrant: scores.quadrant,
    whatChanged: item.whatChanged,
    whyItMatters: item.whyItMatters,
    marketDigestionEvidence: scores.marketDigestion.components,
    eventAttentionEvidence: scores.marketDigestion.eventAttention?.components || scores.marketDigestion.components,
    issueAttentionEvidence: scores.marketDigestion.issueAttention?.components || scores.marketDigestion.components,
    auroraInterpretation:
      scores.marketDigestion.misdirectedAttentionScore >= 0.32 && scores.quadrant === "aurora_zone"
        ? "The market appears to have paid attention to the event, but not to this specific thesis issue."
        : scores.quadrant === "aurora_zone"
        ? "Public evidence appears economically important and not yet visibly digested by the market."
        : scores.quadrant === "important_but_likely_processed"
          ? "The evidence matters, but observable market digestion is already meaningful."
          : scores.quadrant === "low_attention_noise"
            ? "Attention is low, but the evidence does not yet appear economically important enough."
            : "The evidence is low priority or already digested.",
    recommendedResearchAction:
      scores.decision === "investigate_now"
        ? scores.marketDigestion.misdirectedAttentionScore >= 0.32
          ? "Audit what the market focused on, then test the overlooked issue against filings, peers, estimates, and the next KPI release."
          : "Review the affected thesis variable, compare peers, inspect source language, and define a monitoring KPI."
        : scores.decision === "active_watchlist"
          ? "Keep on active watchlist and seek confirming evidence before underwriting."
          : scores.decision === "monitor_digesting_consensus"
            ? "Monitor whether consensus digestion completes; avoid treating low gap as mispricing."
            : "Archive unless new evidence raises economic importance.",
    falsifier: item.falsifier,
    sourceExcerpt: item.excerpt,
  };
}

export function buildAuroraProcessingGapEngine(input = {}, options = {}) {
  const context = {
    ...(input.context || {}),
    ticker: input.ticker || input.company?.ticker || input.context?.ticker,
    company: input.company || input.context?.company,
    eventDate: input.eventDate || input.filingDate || input.context?.eventDate,
    marketCap: input.marketCap ?? input.market?.marketCap ?? input.context?.marketCap,
    liquidityScore: input.liquidityScore ?? input.market?.liquidityScore ?? input.context?.liquidityScore,
  };
  const extractedEvidence = input.extractedEvidence || input.evidence || null;
  const rawItems = [
    ...arrayOrEmpty(input.evidenceItems || input.items || input.cards),
    ...evidenceItemsFromExtractor(extractedEvidence, context),
  ];
  const attention = input.attention || input.marketAttention || input.marketDigestion || {};
  const asOfDate = options.asOfDate || input.asOfDate || new Date().toISOString();
  const investability = scoreInvestability({ ...context, investability: input.investability });
  const cards = rawItems.map((raw, index) => {
    const item = normalizeEvidenceItem(raw, index, context);
    const evidenceImportance = scoreEvidenceImportance(raw, context);
    const rawAttention = raw.attention || attention;
    const eventDigestion = scoreMarketDigestion(eventAttentionInput(rawAttention));
    const issueDigestion = scoreIssueLevelDigestion(item, rawAttention, input);
    const marketDigestion = combineDigestion(eventDigestion, issueDigestion);
    const confidence = scoreConfidence(raw, extractedEvidence);
    const freshness = freshnessScore(item.eventDate, asOfDate, options.halfLifeDays ?? input.halfLifeDays ?? 45);
    const misdirectedBoost = 1 + (marketDigestion.misdirectedAttentionScore || 0) * 0.22;
    const priorityScore = clamp(evidenceImportance * (1 - marketDigestion.score) * confidence * freshness * investability * misdirectedBoost);
    const quadrant = classifyQuadrant(evidenceImportance, marketDigestion.score);
    const decision = decisionFromScore(priorityScore, quadrant, confidence);
    return buildEvidenceCard(item, {
      evidenceImportance,
      marketDigestion,
      confidence,
      freshness,
      investability,
      priorityScore,
      quadrant,
      decision,
    });
  });
  const sortedCards = cards.sort((a, b) => b.processingGapScore - a.processingGapScore);
  const auroraZone = sortedCards.filter((card) => card.quadrant === "aurora_zone");
  const summaryScore = sortedCards.length ? Math.max(...sortedCards.map((card) => card.processingGapScore)) : 0;
  const decision =
    auroraZone.some((card) => card.status === "investigate_now")
      ? "processing_gap_investigate_now"
      : auroraZone.length
        ? "processing_gap_watchlist"
        : sortedCards.some((card) => card.quadrant === "important_but_likely_processed")
          ? "important_but_likely_processed"
          : "no_actionable_processing_gap";

  return {
    version: "aurora_processing_gap_engine_v1",
    createdAt: options.createdAt || new Date().toISOString(),
    thesis:
      "AURORA does not assume public evidence is secret; it scores whether economically relevant public evidence appears underprocessed by the market.",
    context,
    summary: {
      evidenceCards: sortedCards.length,
      auroraZoneCards: auroraZone.length,
      processingGapScore: summaryScore,
      decision,
      topThesisVariable: sortedCards[0]?.thesisVariable || null,
      topSignalType: sortedCards[0]?.signalType || null,
      topMisdirectedAttention: sortedCards.length ? Math.max(...sortedCards.map((card) => card.misdirectedAttention || 0)) : 0,
    },
    radar: {
      xAxis: "Issue-Level Market Digestion",
      yAxis: "Evidence Importance",
      quadrants: {
        aurora_zone: "High evidence importance + low market digestion: investigate now.",
        important_but_likely_processed: "High evidence importance + high digestion: important but probably not overlooked.",
        low_attention_noise: "Low importance + low digestion: low attention is not enough.",
        low_priority_digestible: "Low importance + high digestion: low priority.",
      },
    },
    evidenceCards: sortedCards,
  };
}

export function summarizeAuroraProcessingGap(input = {}, options = {}) {
  const result = buildAuroraProcessingGapEngine(input, options);
  const top = result.evidenceCards[0] || null;
  return {
    version: "aurora_processing_gap_summary_v1",
    decision: result.summary.decision,
    processingGapScore: result.summary.processingGapScore,
    auroraZoneCards: result.summary.auroraZoneCards,
    headline: top
      ? `${top.ticker || "Company"}: ${top.signalType} affects ${top.thesisVariable}; market digestion ${top.marketDigestion}/100.`
      : "No evidence card supplied.",
    topCard: top,
  };
}
