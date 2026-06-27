const ALLOWED_ACTIONS = new Set(["constructive", "watch", "reject", "repair_data"]);

function cleanString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

function normalizeQuickKill(value) {
  const checks = asArray(value?.checks).map((item) => ({
    id: cleanString(item?.id, "check"),
    label: cleanString(item?.label, "Check"),
    status: ["pass", "warn", "fail"].includes(item?.status) ? item.status : "warn",
    note: cleanString(item?.note),
    hardFail: Boolean(item?.hardFail),
  }));
  return {
    hard_fail: Boolean(value?.hard_fail || checks.some((item) => item.hardFail && item.status === "fail")),
    tally: value?.tally && typeof value.tally === "object" ? value.tally : {
      pass: checks.filter((item) => item.status === "pass").length,
      warn: checks.filter((item) => item.status === "warn").length,
      fail: checks.filter((item) => item.status === "fail").length,
    },
    checks,
  };
}

export function normalizeValuationDecision(analysis = {}, fallback = {}) {
  const source = analysis && typeof analysis === "object" ? analysis : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const decision = cleanString(source.decision, cleanString(base.decision, "Watch"));
  const action = ALLOWED_ACTIONS.has(source.action)
    ? source.action
    : ALLOWED_ACTIONS.has(base.action)
      ? base.action
      : decision === "Not decision-ready"
        ? "repair_data"
        : "watch";
  const sourceScorecard = asArray(source.scorecard);
  const baseScorecard = asArray(base.scorecard);
  const scorecard = sourceScorecard.length >= 4 ? sourceScorecard : baseScorecard;
  const researchability = source.researchability || base.researchability || {
    grade: "C",
    score: 0,
    label: "Researchability unavailable",
    reasons: [],
    warnings: ["Decision schema filled missing researchability."],
  };

  return {
    ...base,
    ...source,
    decision,
    action,
    one_line_conclusion: cleanString(
      source.one_line_conclusion,
      cleanString(base.one_line_conclusion, `${decision}: valuation verdict requires more context.`),
    ),
    composite_score: numberOr(source.composite_score, numberOr(base.composite_score, 1)),
    researchability,
    scorecard,
    quick_kill: normalizeQuickKill(source.quick_kill || base.quick_kill),
    mirror_test: asArray(source.mirror_test).length ? asArray(source.mirror_test) : asArray(base.mirror_test),
    bull_case: asArray(source.bull_case).length ? asArray(source.bull_case) : asArray(base.bull_case),
    bear_case: asArray(source.bear_case).length ? asArray(source.bear_case) : asArray(base.bear_case),
    executive_judgment: cleanString(source.executive_judgment, cleanString(base.executive_judgment, "")),
    strongest_points: asArray(source.strongest_points).length ? asArray(source.strongest_points) : asArray(base.strongest_points),
    red_team: asArray(source.red_team).length ? asArray(source.red_team) : asArray(base.red_team),
    kill_criteria: asArray(source.kill_criteria).length ? asArray(source.kill_criteria) : asArray(base.kill_criteria),
    open_questions: asArray(source.open_questions).length ? asArray(source.open_questions) : asArray(base.open_questions),
    data_limitations: asArray(source.data_limitations).length ? asArray(source.data_limitations) : asArray(base.data_limitations),
  };
}

export function validateValuationDecision(analysis = {}) {
  const normalized = normalizeValuationDecision(analysis);
  const issues = [];
  if (!normalized.decision) issues.push("missing_decision");
  if (!ALLOWED_ACTIONS.has(normalized.action)) issues.push("invalid_action");
  if (!normalized.one_line_conclusion) issues.push("missing_one_line_conclusion");
  if (!Array.isArray(normalized.scorecard) || normalized.scorecard.length < 4) issues.push("scorecard_too_thin");
  if (!normalized.quick_kill?.checks?.length) issues.push("missing_quick_kill_checks");
  if (!normalized.researchability?.grade) issues.push("missing_researchability");
  return {
    ok: issues.length === 0,
    issues,
    normalized,
  };
}
