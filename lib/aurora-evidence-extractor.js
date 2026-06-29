const SIGNAL_DEFINITIONS = {
  pricingPower: {
    positive: [
      /pricing power/i,
      /price(?:s|d| increases?| actions?)?\b/i,
      /raise(?:d|s)? prices/i,
      /higher asp/i,
      /favorable pricing/i,
      /disciplined pricing/i,
      /pass(?:ing)? through costs/i,
    ],
    negative: [/price cuts?/i, /discounting/i, /pricing pressure/i, /lower asp/i, /promotional activity/i],
  },
  demandVisibility: {
    positive: [
      /backlog/i,
      /order book/i,
      /demand visibility/i,
      /bookings? growth/i,
      /multi[- ]year demand/i,
      /long[- ]term agreements?/i,
      /customer commitments?/i,
    ],
    negative: [/demand weakness/i, /order cancellations?/i, /inventory correction/i, /destocking/i, /lower bookings?/i],
  },
  capacityConstraint: {
    positive: [
      /capacity constrained/i,
      /supply constrained/i,
      /bottleneck/i,
      /lead times?/i,
      /scarce capacity/i,
      /limited supply/i,
      /utilization remains high/i,
    ],
    negative: [/excess capacity/i, /capacity additions?/i, /oversupply/i, /utilization declined/i, /supply glut/i],
  },
  marginPressure: {
    positive: [
      /margin pressure/i,
      /gross margin declined/i,
      /cost inflation/i,
      /mix headwind/i,
      /wage inflation/i,
      /input costs?/i,
      /freight costs?/i,
    ],
    negative: [/margin expansion/i, /gross margin expanded/i, /operating leverage/i, /cost discipline/i, /productivity gains?/i],
  },
  accountingTrust: {
    positive: [/clean audit/i, /internal controls effective/i, /no material weakness/i, /conservative accounting/i],
    negative: [/material weakness/i, /restatement/i, /impairment/i, /going concern/i, /sec investigation/i, /aggressive accounting/i],
  },
  customerConcentration: {
    positive: [/customer concentration/i, /largest customer/i, /single customer/i, /top customer/i],
    negative: [/diversified customer/i, /broad customer base/i],
  },
  regulatoryRisk: {
    positive: [/regulatory risk/i, /export controls?/i, /antitrust/i, /litigation/i, /tariffs?/i, /sanctions?/i],
    negative: [/regulatory approval/i, /settlement reached/i],
  },
  capitalDiscipline: {
    positive: [/capital discipline/i, /share repurchases?/i, /buybacks?/i, /dividend growth/i, /return capital/i, /high roic/i],
    negative: [/dilution/i, /equity issuance/i, /overinvestment/i, /large acquisition/i, /capex surge/i],
  },
};

const CLAIM_LABELS = {
  pricing_power: ["pricingPower"],
  demand_visibility: ["demandVisibility"],
  capacity_constraint: ["capacityConstraint"],
  margin_pressure: ["marginPressure"],
  accounting_quality: ["accountingTrust"],
  concentration_risk: ["customerConcentration"],
  regulatory_risk: ["regulatoryRisk"],
  capital_discipline: ["capitalDiscipline"],
};

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

function normalizeDocument(document, index = 0) {
  if (typeof document === "string") {
    return {
      id: `doc_${index + 1}`,
      type: "text",
      source: "inline",
      title: null,
      date: null,
      text: document,
    };
  }
  return {
    id: document.id || document.url || `doc_${index + 1}`,
    type: document.type || document.kind || "text",
    source: document.source || document.provider || document.url || "inline",
    title: document.title || document.headline || null,
    date: document.date || document.publishedAt || document.filingDate || null,
    text: String(document.text || document.body || document.content || document.summary || ""),
  };
}

function splitSentences(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function compactExcerpt(sentence, maxLength = 220) {
  const clean = String(sentence || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trim()}…`;
}

function findMatches(sentence, patterns) {
  return patterns.filter((pattern) => pattern.test(sentence));
}

function scoreDefinition(sentence, definition) {
  const positive = findMatches(sentence, definition.positive);
  const negative = findMatches(sentence, definition.negative);
  return {
    positiveCount: positive.length,
    negativeCount: negative.length,
    score: positive.length - negative.length,
  };
}

function labelFromSignal(signalKey, signedScore) {
  const label = Object.entries(CLAIM_LABELS).find(([, signals]) => signals.includes(signalKey))?.[0] || signalKey;
  return signedScore >= 0 ? label : `${label}_negative`;
}

function sourceWeight(document) {
  const type = String(document.type || "").toLowerCase();
  const source = String(document.source || "").toLowerCase();
  if (/10-k|10q|10-q|annual|filing|sec/.test(type) || /sec|edgar/.test(source)) return 1;
  if (/earnings|transcript|call/.test(type)) return 0.9;
  if (/company|press/.test(type) || /investor/.test(source)) return 0.72;
  if (/news|article/.test(type)) return 0.58;
  return 0.5;
}

function initializeSignalAccumulator() {
  return Object.fromEntries(
    Object.keys(SIGNAL_DEFINITIONS).map((key) => [
      key,
      {
        weightedScore: 0,
        weightedEvidence: 0,
        positive: 0,
        negative: 0,
        examples: [],
      },
    ]),
  );
}

function normalizedSignalValue(signalKey, acc) {
  if (!acc.weightedEvidence) {
    if (signalKey === "accountingTrust") return 0.58;
    if (signalKey === "marginPressure") return 0.35;
    return 0.45;
  }
  const raw = acc.weightedScore / Math.max(0.001, acc.weightedEvidence);
  if (signalKey === "marginPressure" || signalKey === "customerConcentration" || signalKey === "regulatoryRisk") {
    return clamp(0.42 + raw * 0.28, 0.05, 0.95);
  }
  if (signalKey === "accountingTrust") {
    return clamp(0.62 + raw * 0.25, 0.05, 0.95);
  }
  return clamp(0.5 + raw * 0.3, 0.05, 0.95);
}

function riskFlagsFromSignals(textSignals) {
  const flags = [];
  if (textSignals.marginPressure >= 0.62) flags.push({ key: "margin_pressure", severity: textSignals.marginPressure, text: "Evidence points to margin pressure." });
  if (textSignals.accountingTrust <= 0.42) flags.push({ key: "accounting_quality", severity: 1 - textSignals.accountingTrust, text: "Accounting quality evidence is weak or adverse." });
  if (textSignals.customerConcentration >= 0.62) flags.push({ key: "customer_concentration", severity: textSignals.customerConcentration, text: "Customer concentration appears material." });
  if (textSignals.regulatoryRisk >= 0.62) flags.push({ key: "regulatory_risk", severity: textSignals.regulatoryRisk, text: "Regulatory or legal risk appears material." });
  if (textSignals.capacityConstraint <= 0.32 && textSignals.demandVisibility <= 0.38) flags.push({ key: "supply_demand_softness", severity: 0.65, text: "Demand or supply-chain evidence is soft." });
  return flags.sort((a, b) => b.severity - a.severity);
}

function buildEvidenceQuality(documents, claims, textSignals) {
  const filingLike = documents.some((doc) => sourceWeight(doc) >= 0.95);
  const weightedDocs = documents.reduce((sum, doc) => sum + sourceWeight(doc), 0);
  const signalCoverage = Object.values(textSignals).filter((value) => Number.isFinite(value)).length / Object.keys(SIGNAL_DEFINITIONS).length;
  const claimDepth = clamp(claims.length / 10, 0, 1);
  const score = clamp(0.12 + weightedDocs * 0.09 + signalCoverage * 0.25 + claimDepth * 0.3 + (filingLike ? 0.12 : 0), 0, 1);
  return {
    score,
    level: score >= 0.72 ? "strong" : score >= 0.48 ? "usable" : score >= 0.28 ? "thin" : "insufficient",
    documentCount: documents.length,
    claimCount: claims.length,
    filingLike,
  };
}

export function extractAuroraEvidenceSignals(input = {}, options = {}) {
  const rawDocuments = Array.isArray(input) ? input : input.documents || input.snippets || input.texts || input.evidence || [];
  const documents = arrayOrEmpty(rawDocuments).map(normalizeDocument).filter((doc) => doc.text.trim());
  const accumulator = initializeSignalAccumulator();
  const claims = [];

  documents.forEach((document) => {
    const weight = sourceWeight(document);
    splitSentences(document.text).forEach((sentence) => {
      Object.entries(SIGNAL_DEFINITIONS).forEach(([signalKey, definition]) => {
        const scored = scoreDefinition(sentence, definition);
        if (scored.positiveCount || scored.negativeCount) {
          const signedScore = scored.score === 0 ? scored.positiveCount - scored.negativeCount : scored.score;
          const magnitude = Math.max(scored.positiveCount, scored.negativeCount, Math.abs(signedScore));
          accumulator[signalKey].weightedScore += signedScore * weight;
          accumulator[signalKey].weightedEvidence += magnitude * weight;
          accumulator[signalKey].positive += scored.positiveCount;
          accumulator[signalKey].negative += scored.negativeCount;
          if (accumulator[signalKey].examples.length < 4) {
            accumulator[signalKey].examples.push({
              documentId: document.id,
              source: document.source,
              sentence: compactExcerpt(sentence),
              signedScore,
            });
          }
          claims.push({
            type: labelFromSignal(signalKey, signedScore),
            signal: signalKey,
            score: clamp(0.5 + signedScore * 0.12, 0.05, 0.95),
            confidence: clamp(0.42 + weight * 0.42 + magnitude * 0.04, 0.05, 0.96),
            polarity: signedScore >= 0 ? "supportive" : "adverse",
            source: document.source,
            documentId: document.id,
            excerpt: compactExcerpt(sentence),
          });
        }
      });
    });
  });

  const textSignals = Object.fromEntries(Object.entries(accumulator).map(([key, acc]) => [key, normalizedSignalValue(key, acc)]));
  const riskFlags = riskFlagsFromSignals(textSignals);
  const quality = buildEvidenceQuality(documents, claims, textSignals);
  const sourceLineage = Object.fromEntries(
    Object.entries(accumulator).map(([key, acc]) => [
      key,
      {
        positiveMatches: acc.positive,
        negativeMatches: acc.negative,
        examples: acc.examples,
      },
    ]),
  );

  return {
    version: "aurora_evidence_extractor_v1",
    extractedAt: options.extractedAt || new Date().toISOString(),
    textSignals,
    claims,
    riskFlags,
    quality,
    sourceLineage,
    documents: documents.map((document) => ({
      id: document.id,
      type: document.type,
      source: document.source,
      title: document.title,
      date: document.date,
      sourceWeight: sourceWeight(document),
    })),
  };
}

export function evidenceForBeliefCompiler(input = {}, options = {}) {
  const extracted = extractAuroraEvidenceSignals(input, options);
  return {
    version: "aurora_compiler_evidence_v1",
    textSignals: extracted.textSignals,
    claims: extracted.claims,
    risks: extracted.riskFlags,
    quality: extracted.quality.score,
    accountingTrust: extracted.textSignals.accountingTrust,
    sourceLineage: extracted.sourceLineage,
    extractor: {
      version: extracted.version,
      extractedAt: extracted.extractedAt,
      quality: extracted.quality,
      documents: extracted.documents,
    },
  };
}

export function summarizeAuroraEvidence(input = {}, options = {}) {
  const extracted = extractAuroraEvidenceSignals(input, options);
  const strongestSignals = Object.entries(extracted.textSignals)
    .sort((a, b) => Math.abs(b[1] - 0.5) - Math.abs(a[1] - 0.5))
    .slice(0, 5)
    .map(([key, value]) => ({ key, value }));
  return {
    version: "aurora_evidence_summary_v1",
    quality: extracted.quality,
    strongestSignals,
    topClaims: extracted.claims.slice(0, 8),
    topRisks: extracted.riskFlags.slice(0, 5),
  };
}
