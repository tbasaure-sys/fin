const LOOP_VERSION = "bls_research_loop_v1";

function safeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function cleanText(value, fallback = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function tickerOf(row, fallback = "WORKSPACE") {
  return cleanText(row?.ticker || row?.symbol || row?.asset || row?.id, fallback).toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 16) || fallback;
}

function ageHours(value, nowMs) {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (nowMs - parsed) / (1000 * 60 * 60));
}

function confidenceFrom(...values) {
  const numeric = values.map(numberOrNull).filter((value) => value !== null);
  if (!numeric.length) return 0.5;
  const normalized = numeric.map((value) => (Math.abs(value) > 1 ? value / 100 : value));
  return clamp(normalized.reduce((sum, value) => sum + value, 0) / normalized.length, 0.05, 0.98);
}

function taskId(type, key) {
  return `${type}:${String(key || "workspace").toLowerCase().replace(/[^a-z0-9.\-:]+/g, "-")}`.slice(0, 96);
}

function buildPrimaryTask(dashboard) {
  const action = dashboard?.primary_action;
  if (!action?.title) return null;
  const ticker = tickerOf(action, "PORTFOLIO");
  return {
    id: taskId("decision", action.id || ticker),
    type: "decision_review",
    ticker,
    title: cleanText(action.title, "Review current workspace action"),
    hypothesis: cleanText(action.summary || action.body || dashboard?.state_summary?.decisionSummary, "The current suggested action may be valid, but needs maker/checker review before it becomes a decision."),
    source: "workspace_primary_action",
    priority: 92,
    confidence: confidenceFrom(action.confidence, action.score, 0.7),
    evidence: [
      cleanText(dashboard?.state_summary?.stance),
      cleanText(dashboard?.evidence_drawer?.headline),
      ...safeList(dashboard?.evidence_drawer?.currentRead).map((item) => cleanText(item?.title || item)),
    ].filter(Boolean).slice(0, 5),
  };
}

function buildAlertTasks(dashboard) {
  return safeList(dashboard?.alerts || dashboard?.decision_workspace?.alerts)
    .slice(0, 6)
    .map((alert, index) => {
      const severity = cleanText(alert?.severity, "medium").toLowerCase();
      const priority = severity === "high" ? 88 : severity === "medium" ? 74 : 58;
      return {
        id: taskId("alert", alert?.id || index),
        type: "risk_alert",
        ticker: tickerOf(alert, "PORTFOLIO"),
        title: cleanText(alert?.title, "Investigate workspace alert"),
        hypothesis: cleanText(alert?.body || alert?.summary, "A workspace alert may identify an unresolved risk or evidence gap."),
        source: "workspace_alert",
        priority,
        confidence: confidenceFrom(alert?.confidence, priority / 100),
        evidence: [cleanText(alert?.body), cleanText(alert?.source)].filter(Boolean),
      };
    });
}

function buildHoldingTasks(dashboard) {
  return safeList(dashboard?.modules?.portfolio?.holdings)
    .map((holding) => {
      const weight = numberOrNull(holding?.weightValue) ?? numberOrNull(holding?.weight) ?? 0;
      const risk = numberOrNull(holding?.riskScore) ?? 0;
      const shouldReview = risk >= 4 || weight >= 0.08 || /review|risk|reduce|trim/i.test(String(holding?.currentAction || ""));
      if (!shouldReview) return null;
      const ticker = tickerOf(holding);
      return {
        id: taskId("holding", ticker),
        type: "position_review",
        ticker,
        title: `${ticker} position review`,
        hypothesis: cleanText(
          holding?.thesis || holding?.nextReviewTrigger || holding?.currentAction,
          "This position may deserve a fresh thesis, sizing, or risk review.",
        ),
        source: "portfolio_holding",
        priority: Math.round(60 + Math.min(28, risk * 4 + weight * 100)),
        confidence: confidenceFrom(risk / 5, weight * 4),
        evidence: [
          holding?.sector ? `Sector: ${holding.sector}` : "",
          holding?.weight ? `Weight: ${holding.weight}` : "",
          holding?.currentAction ? `Action: ${holding.currentAction}` : "",
        ].filter(Boolean),
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

function buildCandidateTasks(dashboard) {
  return safeList(dashboard?.modules?.scanner?.rows || dashboard?.alpha_briefing?.topIdeas)
    .slice(0, 5)
    .map((row, index) => {
      const ticker = tickerOf(row, `CANDIDATE${index + 1}`);
      return {
        id: taskId("candidate", ticker),
        type: "candidate_research",
        ticker,
        title: `${ticker} research candidate`,
        hypothesis: cleanText(row?.thesis || row?.reason || row?.summary || row?.signal, "A screened candidate may deserve a full research pass."),
        source: "candidate_screener",
        priority: Math.round(54 + (5 - index) * 5 + confidenceFrom(row?.score, row?.rankScore) * 12),
        confidence: confidenceFrom(row?.score, row?.rankScore, row?.confidence),
        evidence: [
          row?.sector ? `Sector: ${row.sector}` : "",
          row?.score ? `Score: ${row.score}` : "",
          row?.signal ? `Signal: ${row.signal}` : "",
        ].filter(Boolean),
      };
    });
}

function dedupeTasks(tasks) {
  const seen = new Set();
  const output = [];
  for (const task of tasks.filter(Boolean)) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    output.push(task);
  }
  return output.sort((left, right) => right.priority - left.priority).slice(0, 8);
}

function gate(id, label, status, detail) {
  return { id, label, status, detail };
}

function buildVerification(task, dashboard, nowMs) {
  const freshnessHours = ageHours(
    dashboard?.workspace_summary?.market_data_as_of || dashboard?.workspace_summary?.last_updated,
    nowMs,
  );
  const evidenceCount = safeList(task.evidence).length;
  const gates = [
    gate(
      "fresh_data",
      "Market snapshot freshness",
      freshnessHours === null ? "warn" : freshnessHours <= 36 ? "pass" : "warn",
      freshnessHours === null ? "No timestamp found." : `${Math.round(freshnessHours)}h since latest workspace snapshot.`,
    ),
    gate(
      "evidence_floor",
      "Minimum evidence floor",
      evidenceCount >= 2 ? "pass" : "fail",
      `${evidenceCount} evidence item${evidenceCount === 1 ? "" : "s"} attached.`,
    ),
    gate(
      "no_future_leakage",
      "No future-data leakage",
      /future|lead\(|lookahead|post[-\s]?decision/i.test(task.hypothesis) ? "fail" : "pass",
      "Task is reviewed before any model output can become a candidate.",
    ),
    gate(
      "human_stop",
      "Human stop condition",
      "pass",
      "Loop can draft research, but cannot place trades or mark itself final.",
    ),
  ];
  const failing = gates.filter((item) => item.status === "fail");
  const warnings = gates.filter((item) => item.status === "warn");
  return {
    status: failing.length ? "blocked" : warnings.length ? "review" : "ready",
    gates,
  };
}

function buildMakerChecker(task, verification) {
  return {
    maker: {
      role: "research_maker",
      objective: `Draft the smallest useful research pass for ${task.ticker}.`,
      prompt: [
        `Hypothesis: ${task.hypothesis}`,
        "Use only point-in-time workspace evidence.",
        "Return a memo with thesis, disconfirming evidence, required data, and a next test.",
      ],
    },
    checker: {
      role: "research_checker",
      objective: `Reject weak or leaking work before ${task.ticker} reaches the user as a decision.`,
      gates: verification.gates,
      stopCondition: verification.status === "ready"
        ? "Ready for human review, not execution."
        : "Do not promote. Add evidence or repair the task first.",
    },
  };
}

export function buildResearchLoopIteration(dashboard = {}, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const nowMs = now.getTime();
  const tasks = dedupeTasks([
    buildPrimaryTask(dashboard),
    ...buildAlertTasks(dashboard),
    ...buildHoldingTasks(dashboard),
    ...buildCandidateTasks(dashboard),
  ]);
  const activeTask = tasks[0] || null;
  const verification = activeTask ? buildVerification(activeTask, dashboard, nowMs) : null;
  const agents = activeTask ? buildMakerChecker(activeTask, verification) : null;
  const stateItems = safeList(dashboard?.memory?.recentEvents || dashboard?.memory?.weeklyBrief);

  return {
    version: LOOP_VERSION,
    generatedAt: now.toISOString(),
    status: activeTask ? verification.status : "idle",
    headline: activeTask
      ? `${activeTask.ticker}: ${activeTask.title}`
      : "No loop task is ready from the current workspace snapshot.",
    architecture: {
      heartbeat: "Run after each market refresh or on a daily schedule.",
      memory: stateItems.length ? "Workspace memory and decision ledger are available." : "No durable research events yet; this iteration starts a memory trail.",
      isolation: "Each task is treated as an isolated research lane before promotion.",
      skills: ["point-in-time evidence", "no future leakage", "maker/checker split", "human stop condition"],
      connectors: ["workspace dashboard", "portfolio holdings", "candidate screener", "equity research endpoint"],
    },
    activeTask,
    queue: tasks,
    agents,
    nextRunPrompt: activeTask
      ? `Read the workspace snapshot. Work only on ${activeTask.id}. Draft evidence, run checker gates, and stop unless all gates pass.`
      : "Read the workspace snapshot and create a research task only if evidence has changed.",
    stopCondition: activeTask
      ? {
          status: verification.status,
          label: verification.status === "ready" ? "Ready for human review" : "Needs repair before promotion",
          reason: verification.gates.find((item) => item.status === "fail")?.detail || verification.gates.find((item) => item.status === "warn")?.detail || "All gates passed.",
        }
      : {
          status: "idle",
          label: "No task",
          reason: "The current snapshot did not surface a candidate, alert, or position requiring loop work.",
        },
  };
}
