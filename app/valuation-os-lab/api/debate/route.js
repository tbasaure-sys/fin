import crypto from "node:crypto";
import { buildValuationRouter } from "../../../../lib/valuation-router.js";
import { buildValuationContextPack } from "../../../../lib/valuation-context-pack.js";
import { buildValuationCatalystPack } from "../../../../lib/valuation-catalyst-pack.js";
import { normalizeValuationDecision, validateValuationDecision } from "../../../../lib/valuation-decision-schema.js";
import { renderValuationMemo } from "../../../../lib/valuation-memo.js";
import { buildPreRevenueValuation } from "../../../../lib/valuation-pre-revenue.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// runtime_mode: deterministic committee with optional single LLM call.

const CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 3 * 60 * 1000;

const runtimeState =
  globalThis.__VALUATION_OS_DEBATE_RUNTIME__ ||
  {
    cache: new Map(),
    finalOrchestratorRetryAt: 0,
    lastByTicker: new Map(),
  };
if (!runtimeState.lastByTicker) runtimeState.lastByTicker = new Map();

globalThis.__VALUATION_OS_DEBATE_RUNTIME__ = runtimeState;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function fmtPct(value, digits = 1) {
  return isFiniteNumber(value) ? `${(value * 100).toFixed(digits)}%` : "N/A";
}

function fmtMoney(value) {
  if (!isFiniteNumber(value)) return "N/A";
  if (Math.abs(value) >= 1000) return `$${value.toFixed(0)}`;
  if (Math.abs(value) >= 100) return `$${value.toFixed(1)}`;
  return `$${value.toFixed(2)}`;
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

function compactJson(value) {
  return JSON.stringify(value, (_key, nestedValue) => {
    if (typeof nestedValue === "number" && Number.isFinite(nestedValue)) {
      return Number(nestedValue.toFixed(6));
    }
    return nestedValue;
  });
}

function digestPayload(payload) {
  return crypto.createHash("sha256").update(compactJson(payload)).digest("hex").slice(0, 24);
}

function getCache(key) {
  const cached = runtimeState.cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
    runtimeState.cache.delete(key);
    return null;
  }
  return cached.payload;
}

function setCache(key, payload) {
  runtimeState.cache.set(key, { createdAt: Date.now(), payload });
}

function finalOrchestratorWaitMs() {
  return Math.max(0, Number(runtimeState.finalOrchestratorRetryAt || 0) - Date.now());
}

function markFinalOrchestratorRateLimited(retryAfterMs) {
  const cooldownMs = Math.max(30000, Number(retryAfterMs || process.env.VALUATION_OS_LLM_RATE_LIMIT_COOLDOWN_MS || DEFAULT_COOLDOWN_MS));
  runtimeState.finalOrchestratorRetryAt = Date.now() + cooldownMs;
}

function isRateLimitError(message) {
  return /429|rate[\s_-]*limit|too many requests|too many api request/i.test(String(message || ""));
}

function retryAfterMsFromResponse(response) {
  const retryAfter = response?.headers?.get?.("retry-after");
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(30000, seconds * 1000);
  const parsedDate = Date.parse(retryAfter);
  return Number.isFinite(parsedDate) ? Math.max(30000, parsedDate - Date.now()) : null;
}

function llmConfig() {
  const envEnabled = cleanString(process.env.VALUATION_OS_LLM_ENABLED || "auto").toLowerCase();
  const apiKey =
    cleanString(process.env.VALUATION_OS_LLM_API_KEY) ||
    cleanString(process.env.EQUITY_RESEARCH_LLM_API_KEY) ||
    cleanString(process.env.OPENAI_API_KEY);
  return {
    enabled: envEnabled !== "0" && envEnabled !== "false" && Boolean(apiKey),
    apiKey,
    model: cleanString(process.env.VALUATION_OS_LLM_MODEL) || cleanString(process.env.OPENAI_MODEL) || "gpt-4o-mini",
    baseUrl: cleanString(process.env.OPENAI_BASE_URL) || "https://api.openai.com/v1",
    timeoutMs: Math.max(3500, Number(process.env.VALUATION_OS_LLM_TIMEOUT_MS || 12000)),
    maxTokens: Math.max(350, Number(process.env.VALUATION_OS_LLM_MAX_TOKENS || 900)),
  };
}

function safeDrivers(input) {
  const drivers = input && typeof input === "object" ? input : {};
  return {
    ticker: cleanString(drivers.ticker).toUpperCase(),
    name: cleanString(drivers.name),
    sector: cleanString(drivers.sector),
    price: numberOrNull(drivers.price),
    baseFcf: numberOrNull(drivers.baseFcf),
    revenueCagr: numberOrNull(drivers.revenueCagr),
    margin: numberOrNull(drivers.margin),
    roic: numberOrNull(drivers.roic),
    terminalRoic: numberOrNull(drivers.terminalRoic),
    wacc: numberOrNull(drivers.wacc),
    terminalGrowth: numberOrNull(drivers.terminalGrowth),
    reinvestment: numberOrNull(drivers.reinvestment),
    dilution: numberOrNull(drivers.dilution),
    moatHalfLife: numberOrNull(drivers.moatHalfLife),
    thesisQuality: numberOrNull(drivers.thesisQuality),
    demandSupply: numberOrNull(drivers.demandSupply),
    bottleneckPower: numberOrNull(drivers.bottleneckPower),
    dataQuality: numberOrNull(drivers.dataQuality),
    modelRisk: numberOrNull(drivers.modelRisk),
    beta: numberOrNull(drivers.beta),
  };
}

function safeContext(body) {
  const drivers = safeDrivers(body?.drivers);
  const snapshot = body?.snapshot && typeof body.snapshot === "object" ? body.snapshot : {};
  const cleanSnapshot = {
    company: {
      ticker: cleanString(snapshot?.company?.ticker),
      entityName: cleanString(snapshot?.company?.entityName || snapshot?.company?.name),
      fiscalYear: cleanString(snapshot?.company?.fiscalYear),
      form: cleanString(snapshot?.company?.form),
      filed: cleanString(snapshot?.company?.filed),
      industry: cleanString(snapshot?.company?.industry),
      sicDescription: cleanString(snapshot?.company?.sicDescription),
    },
    coverage: snapshot?.coverage && typeof snapshot.coverage === "object" ? snapshot.coverage : {},
    quote: snapshot?.quote && typeof snapshot.quote === "object" ? snapshot.quote : {},
    riskFree: snapshot?.riskFree && typeof snapshot.riskFree === "object" ? snapshot.riskFree : {},
    facts: snapshot?.facts && typeof snapshot.facts === "object" ? snapshot.facts : {},
    assumptions: snapshot?.assumptions && typeof snapshot.assumptions === "object" ? snapshot.assumptions : {},
    catalystEvidence: snapshot?.catalystEvidence && typeof snapshot.catalystEvidence === "object" ? snapshot.catalystEvidence : {},
  };
  const missingDrivers = Array.isArray(body?.missingDrivers)
    ? body.missingDrivers.map((item) => cleanString(item)).filter(Boolean).slice(0, 12)
    : [];
  const tripwires = Array.isArray(body?.tripwires)
    ? body.tripwires
        .map((item) => ({
          key: cleanString(item?.key),
          label: cleanString(item?.label),
          falsifier: cleanString(item?.falsifier),
        }))
        .filter((item) => item.key || item.label)
        .slice(0, 12)
    : [];
  const router = buildValuationRouter(drivers, cleanSnapshot);
  const baseContext = {
    ticker: cleanString(body?.ticker || drivers.ticker || snapshot?.company?.ticker || "UNKNOWN").toUpperCase(),
    mode: ["bear", "base", "bull"].includes(body?.mode) ? body.mode : "base",
    drivers,
    snapshot: cleanSnapshot,
    router,
    missingDrivers,
    tripwires,
    valuation: numberOrNull(body?.valuation),
    upside: numberOrNull(body?.upside),
    expectedIrr: numberOrNull(body?.expectedIrr),
    impliedCagr: numberOrNull(body?.impliedCagr),
    feasibility: numberOrNull(body?.feasibility),
    quality: numberOrNull(body?.quality),
    probabilityAbovePrice: numberOrNull(body?.probabilityAbovePrice),
  };
  const preRevenueExtras = body?.preRevenueExtras && typeof body.preRevenueExtras === "object" ? body.preRevenueExtras : {};
  baseContext.preRevenueExtras = preRevenueExtras;
  const clientCatalystPack = body?.catalystPack && typeof body.catalystPack === "object" ? body.catalystPack : null;
  const catalystPack =
    clientCatalystPack?.version === "valuation_catalyst_pack_v1"
      ? clientCatalystPack
      : buildValuationCatalystPack({ ...baseContext, snapshot: cleanSnapshot, router });
  const clientPack = body?.contextPack && typeof body.contextPack === "object" ? body.contextPack : null;
  return {
    ...baseContext,
    catalystPack,
    contextPack:
      clientPack?.version === "valuation_context_pack_v1"
        ? clientPack
        : buildValuationContextPack({ ...baseContext, catalystPack }),
  };
}

function voteFromScore(score) {
  if (score >= 0.66) return "constructive";
  if (score <= 0.38) return "reject";
  return "watch";
}

function score5(score) {
  return Number((1 + clamp(score, 0, 1) * 4).toFixed(1));
}

function coverageFlag(coverage, ...keys) {
  return keys.some((key) => Boolean(coverage?.[key]));
}

function statusFromCheck(status) {
  if (status === "fail") return "fail";
  if (status === "warn") return "warn";
  return "pass";
}

function researchabilityAssessment(ctx) {
  const coverage = ctx.snapshot.coverage || {};
  const facts = ctx.snapshot.facts || {};
  const packQuality = ctx.contextPack?.dataQuality || {};
  const d = ctx.drivers;
  const required = ["baseFcf", "revenueCagr", "margin", "roic", "reinvestment", "thesisQuality", "demandSupply", "bottleneckPower"];
  const missingRequired = required.filter((key) => !isFiniteNumber(d[key]));
  const sourceScore =
    (coverageFlag(coverage, "secCompanyFacts", "secCompanyfacts", "secCompanyfactsAvailable") ? 0.25 : 0) +
    (coverage.quoteSource || coverage.fmpConfigured ? 0.2 : 0) +
    (coverage.fredConfigured || ctx.snapshot.riskFree?.rate ? 0.15 : 0) +
    (isFiniteNumber(facts.revenue) ? 0.15 : 0) +
    (isFiniteNumber(facts.operatingCashFlow) || isFiniteNumber(facts.freeCashFlow) ? 0.1 : 0);
  const completenessPenalty = Math.min(0.35, (ctx.missingDrivers.length + missingRequired.length) * 0.07);
  const modelPenalty = isFiniteNumber(d.modelRisk) ? clamp(d.modelRisk, 0, 1) * 0.12 : 0.04;
  const qualityInput = isFiniteNumber(packQuality.overallScore)
    ? packQuality.overallScore / 100
    : isFiniteNumber(ctx.quality)
      ? ctx.quality
      : isFiniteNumber(d.dataQuality)
        ? d.dataQuality
        : 0.5;
  const qualityBoost = qualityInput * 0.15;
  const packPenalty = packQuality.level === "poor" ? 0.12 : packQuality.level === "limited" ? 0.06 : 0;
  const score = clamp(sourceScore + qualityBoost - completenessPenalty - modelPenalty - packPenalty, 0, 1);
  const grade = score >= 0.72 ? "A" : score >= 0.48 ? "B" : "C";

  return {
    grade,
    score,
    label:
      grade === "A"
        ? "Decision-grade research file"
        : grade === "B"
          ? "Usable, with explicit uncertainty"
          : "Research file too thin for a final call",
    reasons: [
      coverageFlag(coverage, "secCompanyFacts", "secCompanyfacts", "secCompanyfactsAvailable")
        ? "SEC companyfacts are present."
        : "SEC companyfacts are missing or not confirmed.",
      coverage.quoteSource || coverage.fmpConfigured ? `Market quote source: ${coverage.quoteSource || "configured provider"}.` : "No reliable quote provider is confirmed.",
      coverage.fredConfigured || ctx.snapshot.riskFree?.rate ? "Risk-free rate source is configured." : "Risk-free rate should be refreshed from a market source.",
      ctx.missingDrivers.length ? `Missing live drivers: ${ctx.missingDrivers.join(", ")}.` : "Core live drivers are present.",
      isFiniteNumber(packQuality.overallScore) ? `Context pack quality is ${packQuality.overallScore}/100 (${packQuality.level}).` : "Context pack quality was not available.",
    ],
    warnings: [
      missingRequired.length ? `Driver fields absent from payload: ${missingRequired.join(", ")}.` : null,
      isFiniteNumber(d.modelRisk) && d.modelRisk > 0.42 ? "Model risk is high enough to reduce position confidence." : null,
    ].filter(Boolean),
    strategy:
      grade === "A"
        ? "Allow committee verdict, then track falsifiers and next filing."
        : grade === "B"
          ? "Use as a watchlist decision; require manual confirmation before sizing."
          : "Do not size from this output until source coverage and live drivers are repaired.",
  };
}

function quickKillChecks(ctx, researchability) {
  const d = ctx.drivers;
  const upside = isFiniteNumber(ctx.upside) ? ctx.upside : null;
  const roicSpread = isFiniteNumber(d.roic) && isFiniteNumber(d.wacc) ? d.roic - d.wacc : null;
  const terminalSpread = isFiniteNumber(d.terminalRoic) && isFiniteNumber(d.wacc) ? d.terminalRoic - d.wacc : null;
  const researchFileFails = researchability?.grade === "C";
  const checks = [
    {
      id: "source_file",
      label: "Research file complete enough",
      status: ctx.missingDrivers.length || researchFileFails ? "fail" : "pass",
      note: ctx.missingDrivers.length
        ? `Missing ${ctx.missingDrivers.join(", ")}.`
        : researchFileFails
          ? "Source coverage is too thin for sizing."
          : "No missing live drivers reported.",
      hardFail: Boolean(ctx.missingDrivers.length || researchFileFails),
    },
    {
      id: "cash_generation",
      label: "FCF base is usable",
      status: !isFiniteNumber(d.baseFcf) ? "fail" : d.baseFcf <= 0 ? "warn" : "pass",
      note: !isFiniteNumber(d.baseFcf) ? "Base FCF is absent." : `Base FCF/share is ${fmtMoney(d.baseFcf)}.`,
      hardFail: !isFiniteNumber(d.baseFcf),
    },
    {
      id: "roic_hurdle",
      label: "ROIC clears WACC",
      status: roicSpread === null ? "warn" : roicSpread <= 0 ? "fail" : roicSpread < 0.03 ? "warn" : "pass",
      note: roicSpread === null ? "ROIC or WACC is absent." : `Current spread is ${fmtPct(roicSpread)}.`,
      hardFail: roicSpread !== null && roicSpread <= 0,
    },
    {
      id: "fade_path",
      label: "Terminal economics survive fade",
      status: terminalSpread === null ? "warn" : terminalSpread <= 0 ? "fail" : terminalSpread < 0.025 ? "warn" : "pass",
      note: terminalSpread === null ? "Terminal ROIC or WACC is absent." : `Terminal spread is ${fmtPct(terminalSpread)}.`,
      hardFail: false,
    },
    {
      id: "reinvestment_burden",
      label: "Growth does not consume too much capital",
      status: !isFiniteNumber(d.reinvestment) ? "warn" : d.reinvestment > 0.68 ? "fail" : d.reinvestment > 0.56 ? "warn" : "pass",
      note: !isFiniteNumber(d.reinvestment) ? "Reinvestment is absent." : `Reinvestment is ${fmtPct(d.reinvestment)}.`,
      hardFail: false,
    },
    {
      id: "price_gap",
      label: "Price gives margin of safety",
      status: upside === null ? "warn" : upside < -0.1 ? "fail" : upside < 0.08 ? "warn" : "pass",
      note: upside === null ? "Upside is not available." : `Modeled upside/downside is ${fmtPct(upside)}.`,
      hardFail: false,
    },
    {
      id: "model_risk",
      label: "Model disagreement is controlled",
      status: !isFiniteNumber(d.modelRisk) ? "warn" : d.modelRisk > 0.55 ? "fail" : d.modelRisk > 0.38 ? "warn" : "pass",
      note: !isFiniteNumber(d.modelRisk) ? "Model risk is absent." : `Model risk is ${fmtPct(d.modelRisk, 0)}.`,
      hardFail: false,
    },
    {
      id: "falsifiers",
      label: "Falsifiers are trackable",
      status: ctx.tripwires.length > 8 ? "warn" : "pass",
      note: `${ctx.tripwires.length} active falsifier${ctx.tripwires.length === 1 ? "" : "s"} in the ledger.`,
      hardFail: false,
    },
    {
      id: "structural_support",
      label: "Qualitative support is explicit",
      status:
        !isFiniteNumber(d.thesisQuality) || !isFiniteNumber(d.demandSupply) || !isFiniteNumber(d.bottleneckPower)
          ? "fail"
          : (d.thesisQuality + d.demandSupply + d.bottleneckPower) / 3 < 0.42
            ? "warn"
            : "pass",
      note:
        !isFiniteNumber(d.thesisQuality) || !isFiniteNumber(d.demandSupply) || !isFiniteNumber(d.bottleneckPower)
          ? "Thesis, demand/supply, or bottleneck signal is absent."
          : `Structural score is ${fmtPct((d.thesisQuality + d.demandSupply + d.bottleneckPower) / 3, 0)}.`,
      hardFail: !isFiniteNumber(d.thesisQuality) || !isFiniteNumber(d.demandSupply) || !isFiniteNumber(d.bottleneckPower),
    },
    {
      id: "model_router",
      label: "Model family matches business regime",
      status: ctx.router?.abstain ? "fail" : ctx.router?.confidence < 0.45 ? "warn" : "pass",
      note: ctx.router?.dominantRegime
        ? `${ctx.router.dominantRegime.label}; dominant model ${ctx.router.dominantModel?.label || "N/A"}; confidence ${fmtPct(ctx.router.confidence, 0)}.`
        : "No valuation router output was available.",
      hardFail: Boolean(ctx.router?.abstain),
    },
  ];

  const tally = checks.reduce(
    (acc, item) => {
      acc[statusFromCheck(item.status)] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 },
  );

  return {
    hard_fail: checks.some((item) => item.hardFail),
    tally,
    checks,
  };
}

function agent(id, label, role, lens, score, stance, summary, evidence = [], concerns = [], extra = {}) {
  const vote = voteFromScore(score);
  return {
    id,
    label,
    role,
    lens,
    status: "complete",
    stance,
    score: clamp(score, 0, 1),
    score_5: score5(score),
    vote,
    summary,
    evidence: evidence.filter(Boolean).slice(0, 5),
    concerns: concerns.filter(Boolean).slice(0, 5),
    bull_points: (extra.bull_points || evidence).filter(Boolean).slice(0, 3),
    bear_points: (extra.bear_points || concerns).filter(Boolean).slice(0, 3),
    confidence: extra.confidence || "medium",
  };
}

function catalystEvidence(catalystPack = {}) {
  const catalysts = Array.isArray(catalystPack.catalysts) ? catalystPack.catalysts : [];
  const dominant = Array.isArray(catalystPack.dominantCatalysts) ? catalystPack.dominantCatalysts : catalysts.slice(0, 3);
  const risks = Array.isArray(catalystPack.riskCatalysts) ? catalystPack.riskCatalysts : catalysts.filter((item) => item.stance === "risk");
  const evidence = dominant.map((item) => `${item.label}: ${fmtPct(item.score, 0)} (${item.stance || "watch"}). ${item.evidence?.[0] || ""}`);
  const concerns = risks.map((item) => `${item.label}: ${item.falsifiers?.[0] || "watch for thesis break"}`);
  return {
    aggregateScore: isFiniteNumber(catalystPack.aggregateScore) ? catalystPack.aggregateScore : null,
    evidence,
    concerns,
    dominant,
    risks,
  };
}

function buildAgents(ctx, researchability) {
  const d = ctx.drivers;
  const coverage = ctx.snapshot.coverage || {};
  const facts = ctx.snapshot.facts || {};
  const fiscalYear = ctx.snapshot.company?.fiscalYear || "latest";
  const quality = isFiniteNumber(ctx.quality) ? ctx.quality : isFiniteNumber(d.dataQuality) ? d.dataQuality : 0.5;
  const feasibility = isFiniteNumber(ctx.feasibility) ? ctx.feasibility : 0.5;
  const upside = isFiniteNumber(ctx.upside) ? ctx.upside : 0;
  const missing = ctx.missingDrivers.length;
  const accountingScore = clamp(
    0.45 +
      (isFiniteNumber(d.margin) ? (d.margin - 0.18) * 1.15 : -0.08) +
      (isFiniteNumber(d.roic) && isFiniteNumber(d.wacc) ? (d.roic - d.wacc) * 1.8 : -0.06) -
      (isFiniteNumber(d.reinvestment) ? Math.max(0, d.reinvestment - 0.58) * 0.45 : 0.08),
    0,
    1,
  );
  const twinScore = clamp(
    0.42 +
      (isFiniteNumber(d.moatHalfLife) ? d.moatHalfLife / 32 : 0) +
      (isFiniteNumber(d.terminalRoic) && isFiniteNumber(d.wacc) ? (d.terminalRoic - d.wacc) * 1.4 : 0) -
      ctx.tripwires.length * 0.035,
    0,
    1,
  );
  const bayesScore = clamp(feasibility * 0.6 + quality * 0.25 + (isFiniteNumber(ctx.probabilityAbovePrice) ? ctx.probabilityAbovePrice : 0.5) * 0.15, 0, 1);
  const structuralScore = clamp(
    0.34 +
      (isFiniteNumber(d.thesisQuality) ? (d.thesisQuality - 0.5) * 0.42 : -0.08) +
      (isFiniteNumber(d.demandSupply) ? (d.demandSupply - 0.5) * 0.34 : -0.08) +
      (isFiniteNumber(d.bottleneckPower) ? (d.bottleneckPower - 0.5) * 0.3 : -0.08) +
      (isFiniteNumber(d.moatHalfLife) ? d.moatHalfLife / 55 : 0),
    0,
    1,
  );
  const sourceScore = clamp(researchability.score - missing * 0.05, 0, 1);
  const valuationScore = clamp(0.5 + upside + (structuralScore - 0.5) * 0.12, 0, 1);
  const routerScore = clamp((ctx.router?.confidence || 0.35) - (ctx.router?.abstain ? 0.28 : 0) + 0.12, 0, 1);
  const catalysts = catalystEvidence(ctx.catalystPack);
  const catalystScore = clamp(
    (isFiniteNumber(catalysts.aggregateScore) ? catalysts.aggregateScore : 0.48) * 0.58 +
      (isFiniteNumber(d.demandSupply) ? d.demandSupply : 0.5) * 0.18 +
      (isFiniteNumber(d.bottleneckPower) ? d.bottleneckPower : 0.45) * 0.16 +
      (isFiniteNumber(d.thesisQuality) ? d.thesisQuality : 0.5) * 0.08,
    0,
    1,
  );

  return [
    agent(
      "data_truth",
      "01 Data Truth",
      "Evidence controller",
      "Point-in-time filings, source coverage, stale-data risk.",
      sourceScore,
      missing ? "incomplete" : "source-backed",
      missing
        ? `${ctx.ticker} has ${missing} missing live driver${missing === 1 ? "" : "s"}; valuation should stay provisional.`
        : `${ctx.ticker} has enough live inputs to run the valuation stack.`,
      [
        `SEC form ${ctx.snapshot.company?.form || "unknown"} / FY${fiscalYear}`,
        coverage.quoteSource ? `Quote source: ${coverage.quoteSource}` : "Quote source not configured",
        coverageFlag(coverage, "secCompanyFacts", "secCompanyfacts", "secCompanyfactsAvailable") ? "SEC companyfacts loaded" : "SEC companyfacts unavailable",
        coverage.fredConfigured ? "FRED risk-free rate configured" : "FRED rate unavailable",
        isFiniteNumber(facts.revenue) ? `Revenue fact: ${fmtMoney(facts.revenue / 1_000_000)}m` : null,
      ],
      [
        missing ? `Missing: ${ctx.missingDrivers.join(", ")}` : null,
        !coverage.fmpConfigured && !coverage.quoteSource ? "No market quote provider was available." : null,
      ],
    ),
    agent(
      "model_router",
      "02 Model Router",
      "Method selector",
      "Business regime, method weights, and abstention policy.",
      routerScore,
      ctx.router?.abstain ? "abstain" : "model fit checked",
      `${ctx.router?.dominantRegime?.label || "Unknown regime"} routed toward ${ctx.router?.dominantModel?.label || "N/A"}.`,
      [
        ...(ctx.router?.topRegimes || []).slice(0, 3).map((item) => `${item.label}: ${fmtPct(item.weight, 0)}`),
        ...(ctx.router?.topModels || []).slice(0, 2).map((item) => `${item.label}: ${fmtPct(item.weight, 0)}`),
      ],
      [
        ctx.router?.abstain ? "Router recommends abstention until evidence or regime fit improves." : null,
        ctx.router?.confidence < 0.45 ? "Router confidence is low; do not over-weight the blended valuation." : null,
      ],
    ),
    agent(
      "accounting",
      "03 Accounting",
      "Financial analyst",
      "FCF bridge, economic profit, capital intensity.",
      accountingScore,
      accountingScore > 0.6 ? "economic profit visible" : "needs bridge",
      `FCF/share ${fmtMoney(d.baseFcf)}, margin ${fmtPct(d.margin)}, ROIC ${fmtPct(d.roic)} versus WACC ${fmtPct(d.wacc)}.`,
      [
        `Revenue CAGR input: ${fmtPct(d.revenueCagr)}`,
        `Reinvestment rate: ${fmtPct(d.reinvestment)}`,
        `Terminal growth: ${fmtPct(d.terminalGrowth)}`,
      ],
      [
        isFiniteNumber(d.roic) && isFiniteNumber(d.wacc) && d.roic < d.wacc
          ? "Current ROIC does not clear the discount-rate hurdle."
          : null,
        isFiniteNumber(d.reinvestment) && d.reinvestment > 0.62 ? "Growth path consumes a high reinvestment share." : null,
      ],
    ),
    agent(
      "business_twin",
      "04 Business Twin",
      "Business analyst",
      "Qualitative thesis, demand/supply, bottleneck power, and fade path.",
      clamp(twinScore * 0.55 + structuralScore * 0.45, 0, 1),
      structuralScore > 0.62 ? "structural support visible" : "structural support fragile",
      `Thesis ${fmtPct(d.thesisQuality, 0)}, demand/supply ${fmtPct(d.demandSupply, 0)}, bottleneck ${fmtPct(d.bottleneckPower, 0)}; moat half-life ${isFiniteNumber(d.moatHalfLife) ? d.moatHalfLife.toFixed(1) : "N/A"} years.`,
      [
        `Mode: ${ctx.mode}`,
        `Active falsifiers: ${ctx.tripwires.length}`,
        `Terminal spread: ${
          isFiniteNumber(d.terminalRoic) && isFiniteNumber(d.wacc) ? fmtPct(d.terminalRoic - d.wacc) : "N/A"
        }`,
        `Qualitative thesis score: ${fmtPct(d.thesisQuality, 0)}`,
        `Demand/supply score: ${fmtPct(d.demandSupply, 0)}`,
      ],
      [
        isFiniteNumber(d.thesisQuality) && d.thesisQuality < 0.45 ? "Narrative support is too weak for a valuation premium." : null,
        isFiniteNumber(d.demandSupply) && d.demandSupply < 0.45 ? "Supply/demand setup does not support the growth path." : null,
        isFiniteNumber(d.bottleneckPower) && d.bottleneckPower < 0.38 ? "No bottleneck power; pricing may fade faster than modeled." : null,
        ...ctx.tripwires.map((item) => item.falsifier || item.label),
      ].slice(0, 5),
    ),
    agent(
      "catalyst_map",
      "05 Catalyst Map",
      "Supply-demand analyst",
      "Demand, supply response, bottlenecks, regulation, earnings power, and capex cycle.",
      catalystScore,
      catalystScore > 0.62 ? "catalysts support the modeled fade" : catalystScore < 0.42 ? "catalysts challenge the model" : "catalysts need monitoring",
      `Catalyst pack score ${fmtPct(catalystScore, 0)} across demand, supply, bottlenecks, regulation, earnings, and capex cycle.`,
      catalysts.evidence.length ? catalysts.evidence : ["No catalyst pack was available; qualitative assumptions remain manual."],
      [
        ...catalysts.concerns,
        ctx.catalystPack?.warnings?.[0] || null,
      ],
      {
        confidence: ctx.catalystPack?.status === "partial" ? "medium" : "low",
      },
    ),
    agent(
      "bayesian",
      "06 Bayesian",
      "Scenario researcher",
      "Priors, feasibility, probability above price.",
      bayesScore,
      bayesScore > 0.64 ? "posterior supportive" : "posterior demanding",
      `Feasibility is ${fmtPct(feasibility, 0)} and model risk is ${fmtPct(d.modelRisk, 0)}.`,
      [
        `Probability above price: ${fmtPct(ctx.probabilityAbovePrice, 0)}`,
        `Market-implied CAGR: ${fmtPct(ctx.impliedCagr)}`,
        `Scenario quality: ${fmtPct(quality, 0)}`,
        `Structural support: ${fmtPct(structuralScore, 0)}`,
      ],
      [
        isFiniteNumber(ctx.impliedCagr) && isFiniteNumber(d.revenueCagr) && ctx.impliedCagr > d.revenueCagr + 0.025
          ? "Market requires more growth than the current thesis supplies."
          : null,
        isFiniteNumber(d.modelRisk) && d.modelRisk > 0.4 ? "High model disagreement should widen the posterior." : null,
      ],
    ),
    agent(
      "valuation",
      "07 Valuation",
      "Portfolio lead",
      "Entry price, margin of safety, expected return.",
      valuationScore,
      isFiniteNumber(upside) && upside >= 0.15 ? "value gap" : "price discipline",
      `Intrinsic estimate ${fmtMoney(ctx.valuation)} versus price ${fmtMoney(d.price)} gives ${fmtPct(upside)} upside/downside.`,
      [
        `Expected 5Y IRR: ${fmtPct(ctx.expectedIrr)}`,
        `Base FCF/share: ${fmtMoney(d.baseFcf)}`,
      ],
      [isFiniteNumber(upside) && upside < -0.1 ? "The current price already discounts stronger economics than modeled." : null],
    ),
  ];
}

function mirrorTest(ctx) {
  const d = ctx.drivers;
  return [
    `Business: ${ctx.snapshot.company?.entityName || ctx.drivers.name || ctx.ticker} in ${d.sector || "its reported sector"}.`,
    `Economics: ROIC ${fmtPct(d.roic)} versus WACC ${fmtPct(d.wacc)}, with terminal ROIC ${fmtPct(d.terminalRoic)}.`,
    `Moat: modeled half-life ${isFiniteNumber(d.moatHalfLife) ? `${d.moatHalfLife.toFixed(1)} years` : "N/A"} before fade assumptions dominate.`,
    `Structure: thesis ${fmtPct(d.thesisQuality, 0)}, demand/supply ${fmtPct(d.demandSupply, 0)}, bottleneck ${fmtPct(d.bottleneckPower, 0)}.`,
    `Router: ${ctx.router?.dominantRegime?.label || "unknown regime"} with ${ctx.router?.dominantModel?.label || "unknown model"} as the highest-weight method.`,
    `Price/value: estimate ${fmtMoney(ctx.valuation)} versus price ${fmtMoney(d.price)}, or ${fmtPct(ctx.upside)} upside/downside.`,
    `Downside trigger: ${ctx.tripwires[0]?.falsifier || ctx.tripwires[0]?.label || "next filing breaks one of the core drivers"}.`,
  ];
}

function committeeVerdict(ctx, agents, researchability, quickKill) {
  const votes = agents.reduce(
    (acc, item) => {
      acc[item.vote] = (acc[item.vote] || 0) + 1;
      return acc;
    },
    { constructive: 0, watch: 0, reject: 0 },
  );
  const missing = ctx.missingDrivers.length;
  const upside = isFiniteNumber(ctx.upside) ? ctx.upside : null;
  const feasibility = isFiniteNumber(ctx.feasibility) ? ctx.feasibility : 0.5;
  const composite = agents.reduce((sum, item) => sum + item.score, 0) / Math.max(1, agents.length);
  const hardFail = quickKill.hard_fail || researchability.grade === "C";
  let decision = "Watch";
  if (missing || hardFail) decision = "Not decision-ready";
  else if (votes.constructive >= 3 && isFiniteNumber(upside) && upside > 0.12 && feasibility >= 0.52) decision = "Build / accumulate";
  else if (votes.reject >= 2 || (isFiniteNumber(upside) && upside < -0.15)) decision = "Reject / wait for price";
  const topConcerns = agents.flatMap((item) => item.concerns.slice(0, 1)).filter(Boolean).slice(0, 5);
  const topEvidence = agents
    .filter((item) => item.vote === "constructive" || item.score >= 0.56)
    .flatMap((item) => item.evidence.slice(0, 1))
    .slice(0, 5);
  const oneLine =
    decision === "Not decision-ready"
      ? `${ctx.ticker}: not decision-ready until the data file passes the quick-kill gates.`
      : `${ctx.ticker}: ${decision.toLowerCase()} under ${ctx.mode}, with ${fmtPct(upside)} upside/downside and ${fmtPct(feasibility, 0)} feasibility.`;

  return {
    decision,
    action:
      decision === "Build / accumulate"
        ? "constructive"
        : decision === "Reject / wait for price"
          ? "reject"
          : decision === "Not decision-ready"
            ? "repair_data"
            : "watch",
    one_line_conclusion: oneLine,
    composite_score: score5(composite),
    researchability,
    scorecard: agents.map((item) => ({
      id: item.id,
      label: item.label,
      role: item.role,
      vote: item.vote,
      score_5: item.score_5,
      stance: item.stance,
      summary: item.summary,
    })),
    quick_kill: quickKill,
    mirror_test: mirrorTest(ctx),
    bull_case: topEvidence.length ? topEvidence : ["No constructive point cleared the committee threshold."],
    bear_case: topConcerns.length ? topConcerns : ["Main risk is valuation sensitivity rather than an identified source break."],
    executive_judgment:
      decision === "Not decision-ready"
        ? `Do not treat ${ctx.ticker} as decision-ready until data and driver gates are repaired. ${researchability.strategy}`
        : `${ctx.ticker} is ${decision.toLowerCase()} under the ${ctx.mode} case: valuation gap ${fmtPct(upside)}, feasibility ${fmtPct(feasibility, 0)}, and ${ctx.tripwires.length} active falsifier${ctx.tripwires.length === 1 ? "" : "s"}.`,
    strongest_points: topEvidence,
    red_team: topConcerns,
    kill_criteria: quickKill.checks
      .filter((item) => item.status !== "pass")
      .map((item) => `${item.label}: ${item.note}`)
      .slice(0, 5),
    open_questions: [
      missing ? `Fill missing drivers: ${ctx.missingDrivers.join(", ")}.` : null,
      researchability.warnings[0] || null,
      ctx.tripwires[0]?.falsifier || ctx.tripwires[0]?.label || null,
      "Re-run after the next filing or material price move.",
    ].filter(Boolean),
    data_limitations: researchability.warnings,
    vote_tally: votes,
  };
}

function parseJsonish(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Empty orchestrator response.");
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Orchestrator response was not JSON.");
  return JSON.parse(candidate.slice(start, end + 1));
}

function orchestratorInput(ctx, agents, verdict) {
  return {
    ticker: ctx.ticker,
    mode: ctx.mode,
    drivers: ctx.drivers,
    router: ctx.router,
    context_quality: ctx.contextPack?.dataQuality || null,
    provider_diagnostics: ctx.contextPack?.providerDiagnostics || [],
    catalyst_pack: {
      version: ctx.catalystPack?.version || null,
      status: ctx.catalystPack?.status || null,
      aggregateScore: ctx.catalystPack?.aggregateScore ?? null,
      dominantCatalysts: ctx.catalystPack?.dominantCatalysts || [],
      riskCatalysts: ctx.catalystPack?.riskCatalysts || [],
      evidence: ctx.catalystPack?.evidencePack
        ? {
            status: ctx.catalystPack.evidencePack.status,
            itemCount: ctx.catalystPack.evidencePack.itemCount,
            items: ctx.catalystPack.evidencePack.items || [],
          }
        : null,
      warnings: ctx.catalystPack?.warnings || [],
    },
    metrics: {
      valuation: ctx.valuation,
      price: ctx.drivers.price,
      upside: ctx.upside,
      expectedIrr: ctx.expectedIrr,
      impliedCagr: ctx.impliedCagr,
      feasibility: ctx.feasibility,
      quality: ctx.quality,
    },
    missingDrivers: ctx.missingDrivers,
    tripwires: ctx.tripwires,
    agents,
    deterministic_verdict: verdict,
    required_output_contract: {
      preserve: ["decision", "one_line_conclusion", "composite_score", "researchability", "scorecard", "quick_kill", "bull_case", "bear_case", "kill_criteria", "open_questions"],
      optional: ["memo_patch"],
    },
  };
}

function currentChangeSnapshot(ctx, analysis) {
  return {
    asOf: new Date().toISOString(),
    ticker: ctx.ticker,
    mode: ctx.mode,
    decision: analysis?.decision || null,
    action: analysis?.action || null,
    valuation: ctx.valuation,
    upside: ctx.upside,
    expectedIrr: ctx.expectedIrr,
    contextQuality: ctx.contextPack?.dataQuality?.overallScore ?? null,
    dominantRegime: ctx.router?.dominantRegime?.label || null,
    dominantModel: ctx.router?.dominantModel?.label || null,
    catalystScore: ctx.catalystPack?.aggregateScore ?? null,
    missingDrivers: ctx.missingDrivers.length,
  };
}

function diffChange(label, previous, current, formatter = (value) => String(value)) {
  if (previous === current) return null;
  return {
    label,
    previous: previous === null || previous === undefined ? "N/A" : formatter(previous),
    current: current === null || current === undefined ? "N/A" : formatter(current),
  };
}

function numericDiffChange(label, previous, current, threshold, formatter) {
  if (!isFiniteNumber(previous) || !isFiniteNumber(current)) return diffChange(label, previous, current, formatter);
  if (Math.abs(current - previous) < threshold) return null;
  return diffChange(label, previous, current, formatter);
}

function buildChangeLog(ctx, analysis) {
  const key = `${ctx.ticker}:${ctx.mode}`;
  const previous = runtimeState.lastByTicker.get(key) || null;
  const current = currentChangeSnapshot(ctx, analysis);
  runtimeState.lastByTicker.set(key, current);
  const changes = previous
    ? [
        diffChange("Decision", previous.decision, current.decision),
        diffChange("Action", previous.action, current.action),
        numericDiffChange("Fair value", previous.valuation, current.valuation, Math.max(1, Math.abs(current.valuation || 0) * 0.01), fmtMoney),
        numericDiffChange("Upside/downside", previous.upside, current.upside, 0.025, fmtPct),
        numericDiffChange("Context quality", previous.contextQuality, current.contextQuality, 5, (value) => `${Number(value).toFixed(0)}/100`),
        diffChange("Dominant regime", previous.dominantRegime, current.dominantRegime),
        diffChange("Dominant model", previous.dominantModel, current.dominantModel),
        numericDiffChange("Catalyst score", previous.catalystScore, current.catalystScore, 0.05, (value) => fmtPct(value, 0)),
        numericDiffChange("Missing drivers", previous.missingDrivers, current.missingDrivers, 1, (value) => String(value)),
      ].filter(Boolean)
    : [];
  return {
    version: "valuation_change_log_v1",
    status: previous ? (changes.length ? "changed" : "unchanged") : "baseline",
    previousAsOf: previous?.asOf || null,
    currentAsOf: current.asOf,
    changes,
  };
}

async function callFinalOrchestrator(ctx, agents, verdict, config) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.15,
        max_tokens: config.maxTokens,
        messages: [
          {
            role: "system",
            content:
              "You are the final team lead for Valuation OS. Specialists already produced deterministic, source-aware views. Use only the supplied JSON; do not invent data. Preserve the supplied contract fields and improve only wording, prioritization, and memo_patch. Return only valid JSON.",
          },
          {
            role: "user",
            content: `Issue the final valuation verdict from this payload:\n${compactJson(orchestratorInput(ctx, agents, verdict))}`,
          },
        ],
      }),
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const retryAfterMs = retryAfterMsFromResponse(response);
      const error = new Error(`Final orchestrator failed (${response.status}): ${text.slice(0, 240)}`);
      error.retryAfterMs = retryAfterMs;
      throw error;
    }
    const data = await response.json();
    return parseJsonish(data?.choices?.[0]?.message?.content);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      throw new Error(`Final orchestrator timed out after ${config.timeoutMs}ms.`);
    }
    throw error;
  }
}

function runtimeModeDescriptor(finalOrchestrator) {
  if (!finalOrchestrator.enabled) {
    return {
      id: "no_api",
      label: "Modo sin API",
      detail: "Debate 100% determinístico local. No se necesita ninguna API de LLM: el veredicto del comité es completo y usable.",
    };
  }
  if (finalOrchestrator.status === "ok") {
    return {
      id: "llm_full",
      label: "Modo LLM completo",
      detail: "Veredicto determinístico + una sola llamada opcional de revisión final al LLM (presupuesto máximo: 1 llamada).",
    };
  }
  if (finalOrchestrator.status === "rate_limited") {
    return {
      id: "llm_degraded",
      label: "Modo LLM degradado",
      detail: `El veredicto determinístico está completo. La revisión LLM quedó en pausa por límite de uso${finalOrchestrator.retry_after_ms ? ` (reintento en ~${Math.ceil(finalOrchestrator.retry_after_ms / 60000)} min)` : ""}. Nada del análisis depende de esa llamada.`,
    };
  }
  if (finalOrchestrator.status === "error") {
    return {
      id: "llm_degraded",
      label: "Modo LLM degradado",
      detail: "La llamada opcional al LLM falló; se muestra el veredicto determinístico completo.",
    };
  }
  return {
    id: "deterministic",
    label: "Modo determinístico",
    detail: "Veredicto local determinístico; la revisión LLM es opcional y no corrió en esta pasada.",
  };
}

async function buildDebate(ctx) {
  const researchability = researchabilityAssessment(ctx);
  const quickKill = quickKillChecks(ctx, researchability);
  const agents = buildAgents(ctx, researchability);
  const preRevenue = buildPreRevenueValuation({
    drivers: ctx.drivers,
    snapshot: ctx.snapshot,
    extras: ctx.preRevenueExtras || {},
  });
  const deterministic = normalizeValuationDecision(committeeVerdict(ctx, agents, researchability, quickKill));
  const deterministicValidation = validateValuationDecision(deterministic);
  const config = llmConfig();
  const finalOrchestrator = {
    enabled: config.enabled,
    status: config.enabled ? "skipped" : "unavailable",
    model: config.model,
    runtime: "vercel-single-call",
    call_budget: {
      specialist_llm_calls: 0,
      final_orchestrator_max_calls: 1,
      final_orchestrator_actual_calls: 0,
    },
    analysis: deterministicValidation.normalized,
    schema: {
      ok: deterministicValidation.ok,
      issues: deterministicValidation.issues,
    },
  };

  if (config.enabled) {
    const waitMs = finalOrchestratorWaitMs();
    if (waitMs > 0) {
      finalOrchestrator.status = "rate_limited";
      finalOrchestrator.retry_after_ms = waitMs;
    } else {
      try {
        const analysis = await callFinalOrchestrator(ctx, agents, deterministic, config);
        const merged = normalizeValuationDecision({ ...deterministic, ...analysis }, deterministic);
        const validation = validateValuationDecision(merged);
        finalOrchestrator.status = "ok";
        finalOrchestrator.analysis = validation.normalized;
        finalOrchestrator.schema = {
          ok: validation.ok,
          issues: validation.issues,
        };
        finalOrchestrator.call_budget.final_orchestrator_actual_calls = 1;
      } catch (error) {
        const message = String(error?.message || error || "Unknown orchestrator error");
        if (isRateLimitError(message)) {
          markFinalOrchestratorRateLimited(error?.retryAfterMs);
          finalOrchestrator.status = "rate_limited";
          finalOrchestrator.retry_after_ms = finalOrchestratorWaitMs();
        } else {
          finalOrchestrator.status = "error";
        }
        finalOrchestrator.error = message.slice(0, 300);
      }
    }
  }
  const finalValidation = validateValuationDecision(finalOrchestrator.analysis);
  finalOrchestrator.analysis = finalValidation.normalized;
  finalOrchestrator.schema = {
    ok: finalValidation.ok,
    issues: finalValidation.issues,
  };
  const contextPackSummary = {
    version: ctx.contextPack?.version || null,
    subject: ctx.contextPack?.subject || null,
    dataQuality: ctx.contextPack?.dataQuality || null,
    providerDiagnostics: ctx.contextPack?.providerDiagnostics || [],
  };
  const catalystPackSummary = {
    version: ctx.catalystPack?.version || null,
    source: ctx.catalystPack?.source || null,
    status: ctx.catalystPack?.status || null,
    aggregateScore: ctx.catalystPack?.aggregateScore ?? null,
    dominantCatalysts: ctx.catalystPack?.dominantCatalysts || [],
    riskCatalysts: ctx.catalystPack?.riskCatalysts || [],
    evidence: ctx.catalystPack?.evidencePack
      ? {
          status: ctx.catalystPack.evidencePack.status,
          itemCount: ctx.catalystPack.evidencePack.itemCount,
          items: ctx.catalystPack.evidencePack.items || [],
          providerDiagnostics: ctx.catalystPack.evidencePack.providerDiagnostics || [],
        }
      : null,
    warnings: ctx.catalystPack?.warnings || [],
  };
  const changeLog = buildChangeLog(ctx, finalOrchestrator.analysis);
  const memo = renderValuationMemo({
    ctx,
    debate: {
      context_pack: contextPackSummary,
      catalyst_pack: catalystPackSummary,
    },
    analysis: finalOrchestrator.analysis,
  });

  return {
    version: "valuation_os_committee_v2",
    runtime: "deterministic_investment_committee_plus_single_optional_orchestrator",
    runtime_mode: runtimeModeDescriptor(finalOrchestrator),
    call_budget: finalOrchestrator.call_budget,
    context_pack: contextPackSummary,
    catalyst_pack: catalystPackSummary,
    change_log: changeLog,
    memo,
    researchability,
    quick_kill: quickKill,
    agents,
    pre_revenue: preRevenue,
    deterministic_verdict: deterministic,
    final_orchestrator: finalOrchestrator,
  };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = safeContext(body);
    const cacheKey = `${ctx.ticker}:${ctx.mode}:${digestPayload({
      drivers: ctx.drivers,
      missingDrivers: ctx.missingDrivers,
      contextQuality: ctx.contextPack?.dataQuality,
      catalystPack: {
        version: ctx.catalystPack?.version,
        aggregateScore: ctx.catalystPack?.aggregateScore,
        evidenceItemCount: ctx.catalystPack?.evidencePack?.itemCount,
        dominantCatalysts: ctx.catalystPack?.dominantCatalysts?.map((item) => [item.id, item.score, item.stance]),
        riskCatalysts: ctx.catalystPack?.riskCatalysts?.map((item) => [item.id, item.score, item.stance]),
      },
      valuation: ctx.valuation,
      upside: ctx.upside,
      feasibility: ctx.feasibility,
      tripwires: ctx.tripwires,
    })}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return Response.json({ ...cached, cached: true });
    }

    const debate = await buildDebate(ctx);
    const payload = {
      ok: true,
      cached: false,
      asOf: new Date().toISOString(),
      ticker: ctx.ticker,
      mode: ctx.mode,
      debate,
    };
    setCache(cacheKey, payload);
    return Response.json(payload);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Valuation debate failed.",
      },
      { status: 500 },
    );
  }
}
