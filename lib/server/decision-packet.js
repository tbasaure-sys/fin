import crypto from "node:crypto";

function safeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function numberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric));
}

function parsePercent(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value > 1 ? clamp01(value / 100) : clamp01(value);
  }

  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) return null;
  return raw.includes("%") || parsed > 1 ? clamp01(parsed / 100) : clamp01(parsed);
}

function formatMoneyValue(value, currency = "USD") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
      maximumFractionDigits: Math.abs(numeric) >= 1000 ? 0 : 2,
    }).format(numeric);
  } catch {
    return `$${numeric.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
}

function scoreLabel(value) {
  const ratio = parsePercent(value);
  return ratio === null ? "-" : `${Math.round(ratio * 100)}%`;
}

function packetHash(input) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

function actionTypeFromText(value) {
  const raw = String(value || "").toLowerCase();
  if (/wait|hold|patient|defer|observe|pause/.test(raw)) return "wait";
  if (/trim|reduce|cut|sell/.test(raw)) return "trim";
  if (/repair|rebalance|hedge/.test(raw)) return "repair";
  if (/investigate|research|review/.test(raw)) return "investigate";
  if (/add|buy|increase/.test(raw)) return "add";
  return "review";
}

function actionTone(actionType, evidenceStrength = "usable") {
  if (actionType === "add") return evidenceStrength === "strong" ? "good" : "warn";
  if (actionType === "trim" || actionType === "repair") return "warn";
  if (actionType === "wait") return "warn";
  return "neutral";
}

function evidenceBand(dashboard) {
  const raw = text(
    dashboard?.confidence_panel?.confidenceBand
      || dashboard?.state_summary?.evidenceStrength
      || dashboard?.stress_mode?.authorityLabel,
    "Usable",
  );
  const normalized = raw.toLowerCase();
  if (/weak|low|thin|limited/.test(normalized)) return "weak";
  if (/strong|high/.test(normalized)) return "strong";
  return "usable";
}

function buildMoneyRead(dashboard) {
  const finance = dashboard?.personal_finance || {};
  const metrics = finance.metrics || {};
  const inputs = finance.inputs || {};
  const amount = numberOrNull(metrics.monthlyInvestable);
  const targetCoverage = numberOrNull(metrics.targetCoverage);
  const currency = text(inputs.baseCurrency, "USD").toUpperCase();
  const hasIncome = Number(inputs.monthlyIncome || 0) > 0;
  const reserve = numberOrNull(inputs.safetyBuffer);

  if (!hasIncome) {
    return {
      status: "setup_needed",
      title: "Add your money plan",
      summary: "Income, expenses, and cash reserve are needed before new-money guidance is reliable.",
      amount: null,
      currency,
      reserveStatus: "unknown",
      safeContribution: null,
      blocker: "Money plan is missing.",
      target: "#invest",
    };
  }

  if (!amount || amount <= 0) {
    return {
      status: "blocked",
      title: "No monthly room yet",
      summary: "Current income, expenses, and reserve do not leave investable cash this month.",
      amount: Math.max(0, amount || 0),
      currency,
      reserveStatus: reserve && reserve > 0 ? "funded" : "thin",
      safeContribution: 0,
      blocker: "Monthly plan is fully consumed.",
      target: "#invest",
    };
  }

  const safeContribution = targetCoverage !== null && targetCoverage < 1
    ? Math.max(0, amount * Math.max(0.25, targetCoverage))
    : amount;

  return {
    status: targetCoverage !== null && targetCoverage < 1 ? "allowed_with_limits" : "allowed",
    title: `${formatMoneyValue(amount, currency)} available this month`,
    summary: targetCoverage !== null && targetCoverage < 1
      ? "There is investable cash, but the target contribution is only partly funded."
      : "The monthly plan leaves room to invest before touching existing holdings.",
    amount,
    currency,
    reserveStatus: reserve && reserve > 0 ? "funded" : "thin",
    safeContribution,
    blocker: null,
    target: "#invest",
  };
}

function buildRiskRead(dashboard) {
  const xray = dashboard?.xray || {};
  const riskCluster = dashboard?.modules?.risk?.clusterDecomposition || {};
  const balanceSheet = dashboard?.recoverability_balance_sheet || {};
  const portfolio = dashboard?.modules?.portfolio || {};
  const holdings = safeList(portfolio.holdings);
  const carriers = safeList(xray.carriers).length ? safeList(xray.carriers) : holdings.slice(0, 3);
  const positions = carriers.map((item) => text(item.ticker)).filter(Boolean).slice(0, 5);
  const dominantRisk = text(
    riskCluster.dominantLabel
      || riskCluster.dominant
      || balanceSheet.dominantFailureMode
      || dashboard?.state_summary?.mainRisk,
    holdings.length ? "Concentration in the largest holdings" : "Portfolio risk is not available yet",
  );
  const topFive = text(xray?.concentration?.topFive);
  const summary = positions.length
    ? `${positions.join(", ")} carry the main risk now${topFive ? `; top-five concentration is ${topFive}` : ""}.`
    : "Add positions to identify the biggest portfolio risk.";

  return {
    status: positions.length ? "watch" : "setup_needed",
    title: dominantRisk,
    summary,
    dominantRisk,
    positions,
    riskReducer: text(balanceSheet.repairNote || dashboard?.frontier?.closeCondition, "Do not add similar risk until the structure is clearer."),
    urgency: positions.length ? "monitor" : "setup",
    target: "#risk",
  };
}

function buildDiversificationRead(dashboard) {
  const xray = dashboard?.xray || {};
  const balanceSheet = dashboard?.recoverability_balance_sheet || {};
  const portfolio = dashboard?.modules?.portfolio || {};
  const holdingsCount = Number(xray.holdingsCount || portfolio?.analytics?.holdingsCount || safeList(portfolio.holdings).length || 0);
  const recoveryShare = parsePercent(xray.recoveryShare);
  const fragileShare = parsePercent(xray.fragileShare);
  const phantomTax = parsePercent(balanceSheet.phantomTax);
  const netFreedom = parsePercent(balanceSheet.netFreedom);

  const visibleBets = holdingsCount || null;
  const realRatioParts = [recoveryShare, fragileShare === null ? null : 1 - fragileShare, phantomTax === null ? null : 1 - phantomTax, netFreedom]
    .filter((value) => value !== null);
  const realRatio = realRatioParts.length
    ? realRatioParts.reduce((sum, value) => sum + value, 0) / realRatioParts.length
    : null;
  const realBets = visibleBets && realRatio !== null ? Math.max(1, Math.round(visibleBets * realRatio)) : null;
  const hiddenOverlapPct = visibleBets && realBets !== null ? clamp01((visibleBets - realBets) / visibleBets) : phantomTax;
  const overstated = hiddenOverlapPct !== null && hiddenOverlapPct >= 0.2;

  return {
    status: !visibleBets ? "setup_needed" : overstated ? "overstated" : "healthy",
    title: !visibleBets
      ? "Add positions to test real diversification"
      : overstated
        ? "The portfolio looks broader than it behaves"
        : "Diversification is holding up",
    visibleBets,
    realBets,
    hiddenOverlapPct,
    plainSummary: !visibleBets
      ? "The diversification read unlocks once positions are connected."
      : overstated
        ? "Some positions repeat the same risk instead of adding protection."
        : "Current positions still provide usable separation under stress.",
    target: "#risk:diversification",
  };
}

function buildOpportunityCandidates(dashboard) {
  const actions = [
    dashboard?.primary_action,
    ...safeList(dashboard?.secondary_actions),
    ...safeList(dashboard?.frontier?.allItems),
  ].filter(Boolean);
  const seen = new Set();

  return actions
    .map((action, index) => {
      const ticker = text(action.ticker || action.symbol);
      const idBase = ticker || text(action.id, `candidate-${index + 1}`);
      const key = idBase.toUpperCase();
      if (seen.has(key)) return null;
      seen.add(key);
      const title = ticker ? `${ticker}` : text(action.title, "Opportunity");
      const summary = text(action.summary || action.whyNow || action.slot, "Review why this deserves attention before acting.");
      return {
        id: text(action.id, `opp-${key.toLowerCase()}`),
        ticker: ticker || null,
        name: text(action.name || action.title, title),
        status: actionTypeFromText(`${action.title} ${summary}`) === "add" ? "investigate" : "review",
        whySurfaced: [summary],
        whatCouldBeWrong: [text(action.disproofCondition || action.watchFor || action.invalidation, "The evidence may weaken or repeat an existing risk.")],
        portfolioFit: text(action.funding || action.laneLabel, "Needs fit check"),
        evidenceStrength: evidenceBand(dashboard),
        trustBadges: [
          {
            type: "date_safe",
            label: "Uses available evidence for the current decision date",
          },
        ],
        target: ticker ? `#opportunities:${ticker.toLowerCase()}` : "#opportunities",
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

function buildOpportunityRead(dashboard, opportunities) {
  if (!opportunities.length) {
    return {
      status: "none",
      title: "No opportunity is cleared for attention right now",
      count: 0,
      target: "#opportunities",
    };
  }

  const stageable = opportunities.filter((item) => item.status === "investigate").length;
  return {
    status: "investigate",
    title: `${opportunities.length} idea${opportunities.length === 1 ? "" : "s"} deserve attention`,
    summary: stageable
      ? "Investigate fit and what could be wrong before staging anything."
      : "Review the shortlist before turning an idea into an action.",
    count: opportunities.length,
    target: "#opportunities",
  };
}

function buildChangedSinceLastTime(dashboard, moneyRead, riskRead, diversificationRead) {
  const recentEvents = safeList(dashboard?.memory?.recentEvents);
  const alerts = safeList(dashboard?.alerts);
  const changes = [];

  if (recentEvents[0]) {
    changes.push({
      id: text(recentEvents[0].id, "change-decision"),
      type: "decision",
      title: text(recentEvents[0].title, "Recent decision updated"),
      summary: text(recentEvents[0].summary || recentEvents[0].note || recentEvents[0].response, "Decision memory has a new event."),
      tone: "neutral",
    });
  }

  if (alerts[0]) {
    changes.push({
      id: text(alerts[0].id, "change-alert"),
      type: "alert",
      title: text(alerts[0].title, "Workspace alert"),
      summary: text(alerts[0].body || alerts[0].summary, "A workspace alert needs attention."),
      tone: String(alerts[0].severity || "").toLowerCase() === "high" ? "warn" : "neutral",
    });
  }

  changes.push({
    id: "change-money-read",
    type: "money",
    title: moneyRead.status === "setup_needed" ? "Money plan is missing" : "Money room is readable",
    summary: moneyRead.summary,
    tone: moneyRead.status === "blocked" ? "warn" : moneyRead.status === "setup_needed" ? "warn" : "good",
  });

  changes.push({
    id: "change-risk-read",
    type: "risk",
    title: riskRead.status === "setup_needed" ? "Risk read needs positions" : "Biggest risk is identified",
    summary: riskRead.summary,
    tone: riskRead.status === "setup_needed" ? "warn" : "neutral",
  });

  if (diversificationRead.status === "overstated") {
    changes.push({
      id: "change-diversification-read",
      type: "risk",
      title: "Diversification may be overstated",
      summary: diversificationRead.plainSummary,
      tone: "warn",
    });
  }

  return changes.slice(0, 4);
}

function buildWrongnessRead(dashboard, riskRead, diversificationRead) {
  const disproof = safeList(dashboard?.confidence_panel?.disproofConditions)[0]
    || dashboard?.frontier?.nextUnlockCondition
    || dashboard?.state_summary?.changeTrigger;

  return {
    status: "open",
    title: "Main assumption: today's constraint is still the right one",
    couldBeWrongIf: text(disproof, "New data shows the main risk has eased or the opportunity no longer repeats it."),
    watch: [
      riskRead.title,
      diversificationRead.status === "overstated" ? "Hidden overlap improves" : "Diversification weakens",
      "Money plan changes",
    ].filter(Boolean).slice(0, 3),
    target: "#evidence",
  };
}

function buildEvidence(dashboard) {
  const band = evidenceBand(dashboard);
  const currentRead = safeList(dashboard?.evidence_drawer?.currentRead).map((item, index) => ({
    id: text(item.id, `support-${index + 1}`),
    title: text(item.title || item, "Evidence"),
    summary: text(item.summary || item.detail || item),
    source: text(item.source, "workspace"),
  })).slice(0, 4);
  const disproof = safeList(dashboard?.confidence_panel?.disproofConditions).map((item, index) => ({
    id: `weakens-${index + 1}`,
    title: "Condition to watch",
    summary: text(item),
  }));

  return {
    strength: band,
    summary: band === "strong"
      ? "Evidence is strong enough to support a direct next step."
      : band === "weak"
        ? "Evidence is thin; keep actions small or focus on setup."
        : "Evidence is usable for guidance, but still needs a clear recheck condition.",
    supports: currentRead,
    weakens: disproof,
    rejected: [],
    sources: safeList(dashboard?.evidence_drawer?.thresholds).slice(0, 4),
  };
}

export function buildDecisionPacket(dashboard = {}, options = {}) {
  const workspaceSummary = dashboard.workspace_summary || {};
  const stateSummary = dashboard.state_summary || {};
  const primaryAction = dashboard.primary_action || null;
  const blockedAction = dashboard.blocked_action || null;
  const activeAction = primaryAction || blockedAction || safeList(dashboard?.frontier?.allItems)[0] || null;
  const evidenceStrength = evidenceBand(dashboard);
  const moneyRead = buildMoneyRead(dashboard);
  const riskRead = buildRiskRead(dashboard);
  const diversificationRead = buildDiversificationRead(dashboard);
  const opportunities = buildOpportunityCandidates(dashboard);
  const opportunityRead = buildOpportunityRead(dashboard, opportunities);
  const wrongnessRead = buildWrongnessRead(dashboard, riskRead, diversificationRead);
  const changedSinceLastTime = buildChangedSinceLastTime(dashboard, moneyRead, riskRead, diversificationRead);
  const actionType = actionTypeFromText(`${activeAction?.title || ""} ${stateSummary.stance || ""}`);
  const recommendationTitle = text(
    activeAction?.title || stateSummary.stance,
    moneyRead.status === "setup_needed" ? "Add your money plan first" : "Review today's brief",
  );
  const recommendationBody = text(
    activeAction?.summary || activeAction?.whyNow || stateSummary.decisionSummary,
    "Start with money room, biggest risk, and real diversification before moving capital.",
  );
  const asOf = text(options.asOf || workspaceSummary.last_updated || workspaceSummary.market_data_as_of, new Date().toISOString());
  const marketDataAsOf = text(workspaceSummary.market_data_as_of || workspaceSummary.market_data_label, "");
  const hashInput = {
    workspaceId: workspaceSummary.id,
    asOf,
    recommendationTitle,
    recommendationBody,
    moneyRead,
    riskRead,
    diversificationRead,
    opportunityRead,
    evidenceStrength,
  };
  const inputSnapshotHash = packetHash(hashInput);
  const packetKey = `packet-${inputSnapshotHash.slice(0, 16)}`;

  return {
    id: packetKey,
    workspaceId: text(workspaceSummary.id, "workspace"),
    schemaVersion: "decision_packet.v1",
    packetVersion: 1,
    status: "current",
    asOf,
    marketDataAsOf: marketDataAsOf || null,
    language: options.language || "en",
    headline: {
      label: "Today",
      title: recommendationTitle,
      summary: recommendationBody,
      stance: actionType,
      tone: actionTone(actionType, evidenceStrength),
    },
    recommendation: {
      actionType,
      title: recommendationTitle,
      body: recommendationBody,
      primaryCta: {
        label: actionType === "investigate" ? "Review opportunities" : actionType === "add" ? "Check risk first" : "Review biggest risk",
        target: actionType === "investigate" ? "#opportunities" : "#risk",
      },
      secondaryCtas: [
        { label: "Ask why", target: "chat:packet" },
        { label: "See decisions", target: "#decisions" },
      ],
      confidence: evidenceStrength,
      urgency: actionType === "add" ? "today" : "monitor",
    },
    answers: {
      canInvest: moneyRead,
      biggestRisk: riskRead,
      diversification: diversificationRead,
      opportunities: opportunityRead,
      wrongness: wrongnessRead,
    },
    changedSinceLastTime,
    actions: {
      primary: {
        id: text(activeAction?.id, "action-review-brief"),
        type: actionType,
        title: recommendationTitle,
        summary: recommendationBody,
        target: actionType === "investigate" ? "#opportunities" : "#risk",
        status: activeAction ? "available" : "review",
        source: activeAction ? "dashboard" : "packet",
      },
      available: [primaryAction, ...safeList(dashboard.secondary_actions)].filter(Boolean).map((action) => ({
        id: text(action.id, "action"),
        type: actionTypeFromText(`${action.title} ${action.summary || action.whyNow || ""}`),
        title: text(action.title, "Action"),
        summary: text(action.summary || action.whyNow),
        target: action.ticker ? `#opportunities:${String(action.ticker).toLowerCase()}` : "#decisions",
        status: "available",
      })),
      blocked: blockedAction ? [{
        id: text(blockedAction.id, "blocked-action"),
        type: actionTypeFromText(`${blockedAction.title} ${blockedAction.summary || ""}`),
        title: text(blockedAction.title, "Blocked action"),
        reason: text(blockedAction.summary || blockedAction.whyLane, "This action is blocked by the current state."),
        reopensWhen: text(blockedAction.disproofCondition || dashboard?.frontier?.nextUnlockCondition, "The current risk state improves."),
      }] : [],
      staged: safeList(dashboard?.escrow?.items).map((item) => ({
        id: text(item.id),
        type: actionTypeFromText(`${item.title} ${item.summary || ""}`),
        title: text(item.title, "Staged action"),
        summary: text(item.summary || item.slot),
        status: text(item.status, "staged"),
        expiresAt: item.expiresAt || null,
      })),
    },
    opportunities,
    evidence: buildEvidence(dashboard),
    memory: {
      lastPacketId: null,
      relatedDecisionEventIds: safeList(dashboard?.memory?.recentEvents).map((item) => item.id).filter(Boolean).slice(0, 8),
      openOutcomeIds: safeList(dashboard?.counterfactual_ledger?.items).map((item) => item.id || item.outcomeKey).filter(Boolean).slice(0, 8),
      profileHint: text(dashboard?.memory_guidance?.profileSummary, "The system is still learning your decision pattern."),
    },
    audit: {
      createdBy: "decision_packet_builder.v1",
      inputSnapshotHash,
      sourceDashboardVersion: "dashboard.v1",
      modelVersions: {
        normalizer: "v1",
        decisionOs: "v1",
        decisionPacket: "v1",
      },
      warnings: safeList(dashboard?.alerts).map((item) => text(item.title || item.body)).filter(Boolean).slice(0, 6),
      generatedAt: new Date().toISOString(),
    },
  };
}

export function buildFallbackDecisionPacket(workspaceId, error) {
  const message = text(error?.message || error, "The workspace could not build today's brief.");
  return buildDecisionPacket({
    workspace_summary: {
      id: workspaceId,
      backend_status: "briefing",
      last_updated: new Date().toISOString(),
    },
    state_summary: {
      stance: "Today's brief is limited",
      decisionSummary: message,
      evidenceStrength: "Weak",
      mainRisk: "Data is incomplete",
    },
    alerts: [
      {
        id: "decision-packet-fallback",
        severity: "high",
        title: "Today's brief is limited",
        body: message,
      },
    ],
  });
}
