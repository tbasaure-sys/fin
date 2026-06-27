import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 3 * 60 * 1000;

const runtimeState =
  globalThis.__VALUATION_OS_DEBATE_RUNTIME__ ||
  {
    cache: new Map(),
    finalOrchestratorRetryAt: 0,
  };

globalThis.__VALUATION_OS_DEBATE_RUNTIME__ = runtimeState;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numberOrNull(value) {
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
    dataQuality: numberOrNull(drivers.dataQuality),
    modelRisk: numberOrNull(drivers.modelRisk),
    beta: numberOrNull(drivers.beta),
  };
}

function safeContext(body) {
  const drivers = safeDrivers(body?.drivers);
  const snapshot = body?.snapshot && typeof body.snapshot === "object" ? body.snapshot : {};
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
  return {
    ticker: cleanString(body?.ticker || drivers.ticker || snapshot?.company?.ticker || "UNKNOWN").toUpperCase(),
    mode: ["bear", "base", "bull"].includes(body?.mode) ? body.mode : "base",
    drivers,
    snapshot: {
      company: {
        ticker: cleanString(snapshot?.company?.ticker),
        entityName: cleanString(snapshot?.company?.entityName || snapshot?.company?.name),
        fiscalYear: cleanString(snapshot?.company?.fiscalYear),
        form: cleanString(snapshot?.company?.form),
        filed: cleanString(snapshot?.company?.filed),
      },
      coverage: snapshot?.coverage && typeof snapshot.coverage === "object" ? snapshot.coverage : {},
      quote: snapshot?.quote && typeof snapshot.quote === "object" ? snapshot.quote : {},
      riskFree: snapshot?.riskFree && typeof snapshot.riskFree === "object" ? snapshot.riskFree : {},
      facts: snapshot?.facts && typeof snapshot.facts === "object" ? snapshot.facts : {},
    },
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
  const d = ctx.drivers;
  const required = ["baseFcf", "revenueCagr", "margin", "roic", "reinvestment"];
  const missingRequired = required.filter((key) => !isFiniteNumber(d[key]));
  const sourceScore =
    (coverageFlag(coverage, "secCompanyFacts", "secCompanyfacts", "secCompanyfactsAvailable") ? 0.25 : 0) +
    (coverage.quoteSource || coverage.fmpConfigured ? 0.2 : 0) +
    (coverage.fredConfigured || ctx.snapshot.riskFree?.rate ? 0.15 : 0) +
    (isFiniteNumber(facts.revenue) ? 0.15 : 0) +
    (isFiniteNumber(facts.operatingCashFlow) || isFiniteNumber(facts.freeCashFlow) ? 0.1 : 0);
  const completenessPenalty = Math.min(0.35, (ctx.missingDrivers.length + missingRequired.length) * 0.07);
  const modelPenalty = isFiniteNumber(d.modelRisk) ? clamp(d.modelRisk, 0, 1) * 0.12 : 0.04;
  const qualityBoost = (isFiniteNumber(ctx.quality) ? ctx.quality : isFiniteNumber(d.dataQuality) ? d.dataQuality : 0.5) * 0.15;
  const score = clamp(sourceScore + qualityBoost - completenessPenalty - modelPenalty, 0, 1);
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
  const sourceScore = clamp(researchability.score - missing * 0.05, 0, 1);
  const valuationScore = clamp(0.5 + upside, 0, 1);

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
      "accounting",
      "02 Accounting",
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
      "03 Business Twin",
      "Business analyst",
      "Moat half-life, fade path, operating drivers.",
      twinScore,
      twinScore > 0.62 ? "durable fade path" : "fragile fade path",
      `Moat half-life is ${isFiniteNumber(d.moatHalfLife) ? d.moatHalfLife.toFixed(1) : "N/A"} years with terminal ROIC ${fmtPct(d.terminalRoic)}.`,
      [
        `Mode: ${ctx.mode}`,
        `Active falsifiers: ${ctx.tripwires.length}`,
        `Terminal spread: ${
          isFiniteNumber(d.terminalRoic) && isFiniteNumber(d.wacc) ? fmtPct(d.terminalRoic - d.wacc) : "N/A"
        }`,
      ],
      ctx.tripwires.map((item) => item.falsifier || item.label).slice(0, 3),
    ),
    agent(
      "bayesian",
      "04 Bayesian",
      "Scenario researcher",
      "Priors, feasibility, probability above price.",
      bayesScore,
      bayesScore > 0.64 ? "posterior supportive" : "posterior demanding",
      `Feasibility is ${fmtPct(feasibility, 0)} and model risk is ${fmtPct(d.modelRisk, 0)}.`,
      [
        `Probability above price: ${fmtPct(ctx.probabilityAbovePrice, 0)}`,
        `Market-implied CAGR: ${fmtPct(ctx.impliedCagr)}`,
        `Scenario quality: ${fmtPct(quality, 0)}`,
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
      "05 Valuation",
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

async function buildDebate(ctx) {
  const researchability = researchabilityAssessment(ctx);
  const quickKill = quickKillChecks(ctx, researchability);
  const agents = buildAgents(ctx, researchability);
  const deterministic = committeeVerdict(ctx, agents, researchability, quickKill);
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
    analysis: deterministic,
  };

  if (config.enabled) {
    const waitMs = finalOrchestratorWaitMs();
    if (waitMs > 0) {
      finalOrchestrator.status = "rate_limited";
      finalOrchestrator.retry_after_ms = waitMs;
    } else {
      try {
        const analysis = await callFinalOrchestrator(ctx, agents, deterministic, config);
        finalOrchestrator.status = "ok";
        finalOrchestrator.analysis = { ...deterministic, ...analysis };
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

  return {
    version: "valuation_os_committee_v2",
    runtime: "deterministic_investment_committee_plus_single_optional_orchestrator",
    call_budget: finalOrchestrator.call_budget,
    researchability,
    quick_kill: quickKill,
    agents,
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
