import { BREAKPOINT_HURDLES, BREAKPOINT_VERSION, cleanBreakpointTicker, cloneJson, isFiniteNumber } from "./contract.js";
import { localizeDecisionStatement, localizeFalsifier, localizeLimitations, localizeMarketFamily, normalizeBreakpointLocale } from "./presentation.js";

export function isSupportedBreakpointHurdle(value) {
  return BREAKPOINT_HURDLES.some((rate) => Math.abs(Number(value) - rate) < 0.000001);
}

function asPercent(value) {
  return isFiniteNumber(value) ? Number(value) : null;
}

function firstText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function attentionRun({ ticker, hurdleRate, snapshot, reason, locale }) {
  return {
    version: BREAKPOINT_VERSION,
    status: "needs_attention",
    ticker: cleanBreakpointTicker(ticker || snapshot?.company?.ticker),
    generatedAt: new Date().toISOString(),
    hurdle: { rate: hurdleRate, horizonYears: 5 },
    market: { anchor: null, family: null, feasibility: null },
    breakpoint: { bull: null, bear: null },
    monitor: { primaryDriver: null, falsifier: null },
    provenance: {
      asOf: snapshot?.asOf || null,
      sources: cloneJson(snapshot?.sources, []),
      inputs: { observed: [], estimated: [], manual: [] },
    },
    limitations: [reason, ...localizeLimitations(locale).slice(-1)],
  };
}

function normalizeDecisionFlip(value, kind, locale) {
  if (!value?.target) return null;
  return {
    statement: localizeDecisionStatement(value, kind, locale),
    target: {
      growth: asPercent(value.target.growth),
      margin: asPercent(value.target.margin),
      roic: asPercent(value.target.roic),
      reinvestment: asPercent(value.target.reinvestment),
      valueToPrice: asPercent(value.target.valueToPrice),
      feasibilityClass: value.target.feasibilityClass || "unclassified",
    },
    changes: (value.deltas || []).slice(0, 2).map((delta) => ({
      driver: delta.key,
      from: asPercent(delta.from),
      to: asPercent(delta.to),
      delta: asPercent(delta.delta),
    })),
    constraints: (value.target.constraints || []).slice(0, 3).map((constraint) => ({
      key: constraint.key,
      message: constraint.message,
      severity: asPercent(constraint.severity),
    })),
  };
}

function sourceList(snapshot = {}) {
  const explicit = Array.isArray(snapshot.sources) ? snapshot.sources : [];
  if (explicit.length) return cloneJson(explicit, []);
  const sources = [];
  if (snapshot.coverage?.secCompanyFacts) sources.push({ label: "SEC company facts", date: snapshot.company?.filedAt || null });
  if (snapshot.quote?.source) sources.push({ label: snapshot.quote.source, date: snapshot.asOf || null });
  if (snapshot.riskFree?.source) sources.push({ label: snapshot.riskFree.source, date: snapshot.riskFree.date || null });
  return sources;
}

export function composeBreakpointRun({ pipeline = {}, snapshot = {}, hurdleRate = 0.1, locale: requestedLocale, now } = {}) {
  if (!isSupportedBreakpointHurdle(hurdleRate)) {
    throw new Error("Breakpoint hurdle must be one of 8%, 10%, or 12%.");
  }

  const locale = normalizeBreakpointLocale(requestedLocale);
  const omega = pipeline?.omegaSpine;
  const expectations = pipeline?.expectations;
  const manifold = pipeline?.feasibilityManifold;
  const ticker = cleanBreakpointTicker(omega?.ticker || pipeline?.company?.ticker || snapshot?.company?.ticker);
  const anchor = omega?.marketBeliefFamily?.anchorCell;
  const bull = omega?.counterfactualArena?.minimumViableBullCase;
  const bear = omega?.counterfactualArena?.minimumViableBearCase;

  if (!ticker || !anchor || !bull || !bear || !expectations || !manifold) {
    return attentionRun({
      ticker,
      hurdleRate,
      snapshot,
      reason: "Insufficient valuation coverage to establish a market-clearing breakpoint.",
      locale,
    });
  }

  const rawFamily = omega.marketBeliefFamily?.narrative || {};
  const primaryDriver = omega.monitoringFocus?.primaryVariable || omega.valueDriverGradient?.dominant?.key || null;
  const family = localizeMarketFamily({ family: rawFamily, primaryDriver, locale });
  const sources = sourceList(snapshot);

  return {
    version: BREAKPOINT_VERSION,
    status: "ready",
    ticker,
    company: {
      name: firstText(omega.name || snapshot?.company?.entityName || snapshot?.company?.name, ticker),
      archetype: omega.archetype || "unclassified",
    },
    generatedAt: now || new Date().toISOString(),
    model: {
      auroraVersion: pipeline.version || null,
      expectationsVersion: expectations.version || null,
      manifoldVersion: manifold.version || null,
      omegaVersion: omega.version || null,
    },
    hurdle: { rate: Number(hurdleRate), horizonYears: 5 },
    market: {
      anchor: {
        growth: asPercent(anchor.growth),
        margin: asPercent(anchor.margin),
        valueToPrice: asPercent(anchor.valueToPrice),
        feasibility: asPercent(anchor.feasibility),
      },
      family: {
        label: family.family || "unclassified",
        narrative: firstText(family.narrative, "The market-clearing operating path is available below."),
        fragility: firstText(family.fragility, "No dominant fragility was isolated."),
        tension: family.tension || null,
      },
      feasibility: {
        contourClass: manifold.summary?.contourClass || null,
        viableShare: asPercent(manifold.summary?.viableShare),
        topConstraint: manifold.summary?.topConstraint?.key || null,
      },
    },
    breakpoint: {
      bull: normalizeDecisionFlip(bull, "bull", locale),
      bear: normalizeDecisionFlip(bear, "bear", locale),
      primaryLever: omega.counterfactualArena?.decisionFlip?.primaryLever || primaryDriver,
    },
    monitor: {
      primaryDriver,
      label: omega.valueDriverGradient?.dominant?.label || primaryDriver,
      falsifier: localizeFalsifier({ driver: primaryDriver, fallback: omega.monitoringFocus?.falsifier, locale }),
    },
    provenance: {
      asOf: snapshot.asOf || null,
      sources,
      inputs: {
        observed: ["reported financial history", "market price"],
        estimated: ["market-clearing operating path", "feasibility manifold", "minimum decision flips"],
        manual: [],
      },
    },
    limitations: localizeLimitations(locale),
  };
}
