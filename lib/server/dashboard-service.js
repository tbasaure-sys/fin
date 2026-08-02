import {
  fetchBackendAnalogs,
  fetchBackendBalanceSheet,
  fetchBackendFailureModes,
  fetchBackendHealth,
  fetchBackendLegitimacy,
  fetchBackendPolicy,
  fetchBackendRepairs,
  fetchBackendSnapshot,
  fetchBackendState,
  fetchBackendStateContract,
  fetchBackendStateV2,
  fetchBackendTransitions,
  triggerBackendRefresh,
} from "./backend.js";
import { buildUnavailableSnapshot, getSnapshotAgeHours, isSnapshotUsable, selectBackendSnapshot } from "./backend-snapshot.js";
import { getOperationalConfig, getServerConfig, getWorkspacePolicyConfig } from "./config.js";
import { normalizeWorkspaceDashboard } from "./normalizers.js";
import { applyLocalPortfolioOverlay, previewHoldingsInstruction, updateHoldingsFromInstruction } from "./private-portfolio.js";
import { SHARED_ALPHA_PROFILE } from "./shared-alpha-data.js";
import { randomUUID } from "node:crypto";

import {
  addWorkspaceWatchlistItem,
  appendWorkspaceDecisionEvent,
  appendWorkspaceAlerts,
  getWorkspaceDecisionEvents,
  getWorkspaceEscrowDecisions,
  getWorkspaceFinancePlan,
  getWorkspaceAlerts,
  getWorkspaceCommandHistory,
  getWorkspaceSavedViews,
  getWorkspaceWatchlist,
  pushCommandHistory,
  saveWorkspaceSavedView,
  upsertWorkspaceEscrowDecision,
  upsertWorkspaceFinancePlan,
} from "./workspace-store.js";
import * as workspaceStore from "./workspace-store.js";
import { getStorageBackend } from "./data/neon.js";
import { getRuntimeDocumentPayload } from "./data/runtime-documents.js";
import { buildDecisionOsSections } from "./decision-os.js";
import { buildPlanContext, getWorkspacePlanSnapshot } from "./billing.js";
import { linkSignalRunToDecision } from "./signal-intelligence.js";

function buildFallbackWorkspaceDashboard(workspaceId, error, billingPlan = null) {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId,
    snapshot: buildUnavailableSnapshot(error),
    watchlist: [],
    alerts: [
      {
        id: "workspace-bootstrap-warning",
        severity: "high",
        title: "Workspace loaded with limited data",
        body: String(error?.message || error || "The live workspace could not be fully assembled."),
        source: "workspace",
      },
    ],
    savedViews: [],
    commandHistory: [],
    escrowDecisions: [],
    decisionEvents: [],
    sharedAlpha: SHARED_ALPHA_PROFILE,
    billingPlan,
  });
  return {
    ...dashboard,
    ...buildDecisionOsSections(dashboard),
    personal_finance: buildPersonalFinanceSummary({}, dashboard),
  };
}

function buildUnavailableStatePayload(error, version = "state_contract_v1") {
  const message = String(error?.message || error || "The live state backend is unavailable.");
  return {
    contract_version: version,
    model_version: null,
    measured_state: {},
    probabilistic_state: {
      source: "unavailable",
      model_package_version: null,
    },
    policy_state: {},
    uncertainty: {
      probability_package_metrics: [],
    },
    status: {
      contract_status: "fallback_unavailable",
      warnings: [`Live state backend unavailable: ${message}`],
    },
  };
}

function buildUnavailableBackendFeaturePayload(error, feature) {
  const label = String(feature || "backend feature").trim() || "backend feature";
  const message = String(error?.message || error || `The live ${label} backend is unavailable.`);
  return {
    ok: false,
    feature: label,
    source: "unavailable",
    status: {
      contract_status: "fallback_unavailable",
      warnings: [`Live ${label} backend unavailable: ${message}`],
    },
  };
}

async function loadPersistedDashboardSnapshot() {
  try {
    return await getRuntimeDocumentPayload("dashboard_snapshot");
  } catch {
    return null;
  }
}

function allowPersistedSnapshotFallback() {
  const value = String(process.env.BLS_PRIME_ALLOW_PERSISTED_SNAPSHOT_FALLBACK || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function numberOr(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function buildPersonalFinanceSummary(plan = {}, dashboard = {}) {
  const inputs = {
    monthlyIncome: Math.max(0, numberOr(plan.monthlyIncome, 0)),
    fixedExpenses: Math.max(0, numberOr(plan.fixedExpenses, 0)),
    variableExpenses: Math.max(0, numberOr(plan.variableExpenses, 0)),
    safetyBuffer: Math.max(0, numberOr(plan.safetyBuffer, 0)),
    targetMonthlyInvestment: Math.max(0, numberOr(plan.targetMonthlyInvestment, 0)),
    baseCurrency: String(plan.baseCurrency || "USD").trim().toUpperCase() || "USD",
    updatedAt: plan.updatedAt || null,
  };
  const monthlyOutflow = inputs.fixedExpenses + inputs.variableExpenses;
  const monthlyInvestable = Math.max(0, inputs.monthlyIncome - monthlyOutflow - inputs.safetyBuffer);
  const incomeReady = inputs.monthlyIncome > 0;
  const savingsRate = incomeReady ? monthlyInvestable / inputs.monthlyIncome : null;
  const spendingRate = incomeReady ? monthlyOutflow / inputs.monthlyIncome : null;
  const targetCoverage = inputs.targetMonthlyInvestment > 0 ? monthlyInvestable / inputs.targetMonthlyInvestment : null;
  const fundingGap = Math.max(0, inputs.targetMonthlyInvestment - monthlyInvestable);
  const portfolioValue = numberOr(dashboard?.modules?.portfolio?.analytics?.totalValueUsd, 0);
  const annualContributionRate = portfolioValue > 0 ? (monthlyInvestable * 12) / portfolioValue : null;
  const monthsToFundTarget = inputs.targetMonthlyInvestment > 0 && monthlyInvestable > 0
    ? inputs.targetMonthlyInvestment / monthlyInvestable
    : null;

  let status = "setup_needed";
  let title = "Add income and expenses";
  let body = "Enter the monthly cashflow once and the workspace will separate living costs from investable cash.";
  let tone = "warn";

  if (incomeReady && monthlyInvestable <= 0) {
    status = "cashflow_blocked";
    title = "No monthly investable cash yet";
    body = "Fixed costs, variable spending, and buffer consume current income. Hold new buys until the plan opens room.";
    tone = "bad";
  } else if (incomeReady && inputs.targetMonthlyInvestment > 0 && monthlyInvestable >= inputs.targetMonthlyInvestment) {
    status = "target_funded";
    title = "Monthly investment target is funded";
    body = "The cashflow plan supports the target contribution before touching existing holdings.";
    tone = "good";
  } else if (incomeReady && inputs.targetMonthlyInvestment > 0) {
    status = "target_partial";
    title = "Contribution target is partially funded";
    body = "There is cash available, but the target needs either a smaller contribution or lower monthly spending.";
    tone = "warn";
  } else if (incomeReady) {
    status = "investable_ready";
    title = "Investable cash is visible";
    body = "Set a target contribution to connect this monthly surplus to portfolio allocation.";
    tone = "good";
  }

  const denominator = Math.max(inputs.monthlyIncome, monthlyOutflow + inputs.safetyBuffer + monthlyInvestable, 1);
  const allocation = [
    { id: "fixed", label: "Fixed", value: inputs.fixedExpenses, ratio: clampRatio(inputs.fixedExpenses / denominator) },
    { id: "variable", label: "Variable", value: inputs.variableExpenses, ratio: clampRatio(inputs.variableExpenses / denominator) },
    { id: "buffer", label: "Buffer", value: inputs.safetyBuffer, ratio: clampRatio(inputs.safetyBuffer / denominator) },
    { id: "investable", label: "Investable", value: monthlyInvestable, ratio: clampRatio(monthlyInvestable / denominator) },
  ];

  return {
    inputs,
    status,
    tone,
    title,
    body,
    metrics: {
      monthlyOutflow,
      monthlyInvestable,
      savingsRate,
      spendingRate,
      targetCoverage,
      fundingGap,
      annualContributionRate,
      monthsToFundTarget,
      portfolioValue,
    },
    allocation,
  };
}

async function loadBestBackendSnapshot() {
  let liveError = null;
  let liveSnapshot = null;
  let persistedSnapshot = null;

  try {
    liveSnapshot = await fetchBackendSnapshot();
  } catch (error) {
    liveError = error;
  }

  try {
    persistedSnapshot = await loadPersistedDashboardSnapshot();
  } catch {
    persistedSnapshot = null;
  }

  return selectBackendSnapshot({
    liveSnapshot,
    liveError,
    persistedSnapshot,
    allowPersistedFallback: allowPersistedSnapshotFallback(),
    operationalConfig: getOperationalConfig(),
  });
}

async function loadDecisionOsState(workspaceId, dashboard) {
  const positionStories = typeof workspaceStore.getWorkspacePositionStories === "function"
    ? await workspaceStore.getWorkspacePositionStories(workspaceId).catch(() => null)
    : null;
  const memoryProfile = typeof workspaceStore.getWorkspaceMemoryProfile === "function"
    ? await workspaceStore.getWorkspaceMemoryProfile(workspaceId).catch(() => null)
    : null;
  const counterfactualLedger = typeof workspaceStore.getWorkspaceCounterfactualOutcomes === "function"
    ? await workspaceStore.getWorkspaceCounterfactualOutcomes(workspaceId).catch(() => null)
    : null;
  const capitalTwin = typeof workspaceStore.getWorkspaceCapitalTwin === "function"
    ? await workspaceStore.getWorkspaceCapitalTwin(workspaceId).catch(() => null)
    : null;
  const mandate = typeof workspaceStore.getWorkspaceMandate === "function"
    ? await workspaceStore.getWorkspaceMandate(workspaceId).catch(() => null)
    : null;

  const sections = buildDecisionOsSections(dashboard, {
    positionStories,
    memoryGuidance: memoryProfile,
    counterfactualLedger,
    capitalTwin,
    mandate,
  });

  const persistence = [];
  if (typeof workspaceStore.upsertWorkspacePositionStory === "function") {
    for (const story of sections.position_stories?.items || []) {
      persistence.push(workspaceStore.upsertWorkspacePositionStory(workspaceId, story).catch(() => null));
    }
  }
  if (typeof workspaceStore.upsertWorkspaceMemoryProfile === "function") {
    persistence.push(workspaceStore.upsertWorkspaceMemoryProfile(workspaceId, sections.memory_guidance).catch(() => null));
  }
  if (typeof workspaceStore.upsertWorkspaceCounterfactualOutcome === "function") {
    for (const item of sections.counterfactual_ledger?.items || []) {
      persistence.push(workspaceStore.upsertWorkspaceCounterfactualOutcome(workspaceId, item).catch(() => null));
    }
  }
  if (typeof workspaceStore.upsertWorkspaceCapitalTwin === "function") {
    persistence.push(workspaceStore.upsertWorkspaceCapitalTwin(workspaceId, sections.capital_twin).catch(() => null));
  }

  if (persistence.length) {
    void Promise.all(persistence);
  }

  return sections;
}

export async function getSessionPayload(authSession = null) {
  const config = getServerConfig();
  let health = null;

  try {
    health = await fetchBackendHealth();
  } catch (error) {
    health = { ok: false, error: String(error) };
  }

  if (authSession) {
    const plan = authSession.user.billing || await buildPlanContext(authSession.user.plan || "free", authSession.user.id);
    return {
      user: {
        id: authSession.user.id,
        name: authSession.user.name,
        email: authSession.user.email,
        role: authSession.user.plan || "member",
        plan: plan.id,
        billing: plan,
      },
      workspace: {
        id: authSession.workspace.id,
        name: authSession.workspace.name,
        mode: "private",
      },
      access: {
        inviteOnly: false,
        provider: "account",
        sharedLinkEnabled: false,
        queryKey: "",
        inviteContact: config.inviteContact,
        privateWorkspace: plan.access.privateWorkspace,
        upgradeRequired: plan.access.upgradeRequired,
      },
      backend: health,
      storage: {
        backend: getStorageBackend(),
      },
      plan,
    };
  }

  return {
    user: {
      id: "public-visitor",
      name: config.sessionUserName,
      email: config.sessionUserEmail,
      role: "visitor",
      plan: "free",
    },
      workspace: {
        id: config.workspaceId,
        name: config.publicWorkspaceName,
        mode: "public",
      },
    access: {
      inviteOnly: false,
      provider: "public",
      sharedLinkEnabled: false,
      queryKey: "",
      inviteContact: config.inviteContact,
      privateWorkspace: false,
      upgradeRequired: true,
    },
    backend: health,
    storage: {
      backend: getStorageBackend(),
    },
    plan: await buildPlanContext("free"),
  };
}

export async function getWorkspaceDashboard(workspaceId) {
  try {
    const [
      watchlist,
      alerts,
      savedViews,
      commandHistory,
      rawEscrowDecisions,
      decisionEvents,
      backendSnapshotResult,
      billingPlan,
      financePlan,
    ] = await Promise.all([
      getWorkspaceWatchlist(workspaceId),
      getWorkspaceAlerts(workspaceId),
      getWorkspaceSavedViews(workspaceId),
      getWorkspaceCommandHistory(workspaceId),
      getWorkspaceEscrowDecisions(workspaceId),
      getWorkspaceDecisionEvents(workspaceId),
      loadBestBackendSnapshot(),
      getWorkspacePlanSnapshot(workspaceId).catch(() => null),
      getWorkspaceFinancePlan(workspaceId).catch(() => ({})),
    ]);
    const escrowDecisions = await refreshOperationalEscrowDecisions(workspaceId, rawEscrowDecisions);
    const backendSnapshot = backendSnapshotResult || buildUnavailableSnapshot("No snapshot received");
    const snapshot = await applyLocalPortfolioOverlay(backendSnapshot, workspaceId);
    const dashboard = normalizeWorkspaceDashboard({
      workspaceId,
      snapshot,
      watchlist,
      alerts,
      savedViews,
      commandHistory,
      escrowDecisions,
      decisionEvents,
      sharedAlpha: SHARED_ALPHA_PROFILE,
      billingPlan,
    });
    const decisionOs = await loadDecisionOsState(workspaceId, dashboard);
    await appendWorkspaceAlerts(workspaceId, dashboard.alerts);
    return {
      ...dashboard,
      ...decisionOs,
      personal_finance: buildPersonalFinanceSummary(financePlan, dashboard),
    };
  } catch (error) {
    const billingPlan = await getWorkspacePlanSnapshot(workspaceId).catch(() => null);
    return buildFallbackWorkspaceDashboard(workspaceId, error, billingPlan);
  }
}

export async function getWorkspaceModule(workspaceId, moduleId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    module_status: dashboard.module_status.find((item) => item.id === moduleId) || null,
    module: dashboard.modules[moduleId] || null,
  };
}

export async function refreshWorkspace(workspaceId) {
  await triggerBackendRefresh();
  return getWorkspaceDashboard(workspaceId);
}

export async function updateWorkspaceHoldings(workspaceId, instruction) {
  const backendSnapshot = await loadBestBackendSnapshot();
  const updateResult = await updateHoldingsFromInstruction(backendSnapshot || buildUnavailableSnapshot("No snapshot received"), workspaceId, instruction);
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    ...dashboard,
    holdings_update: {
      sync_status: updateResult?.sync_status || null,
      sync_label: updateResult?.sync_label || null,
      instruction: updateResult?.instruction || null,
    },
  };
}

export async function previewWorkspaceHoldingInstruction(workspaceId, instruction) {
  const backendSnapshot = await loadBestBackendSnapshot();
  return previewHoldingsInstruction(
    backendSnapshot || buildUnavailableSnapshot("No snapshot received"),
    instruction,
  );
}

export async function getWorkspacePortfolio(workspaceId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    portfolio_state: dashboard.portfolio_state,
    watchlist: dashboard.watchlist,
    module: dashboard.modules.portfolio,
  };
}

export async function getWorkspacePersonalFinance(workspaceId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    personal_finance: dashboard.personal_finance,
    portfolio_state: dashboard.portfolio_state,
  };
}

export async function updateWorkspacePersonalFinance(workspaceId, input) {
  await upsertWorkspaceFinancePlan(workspaceId, input);
  return getWorkspaceDashboard(workspaceId);
}

export async function getWorkspaceFrontier(workspaceId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    mandate: dashboard.mandate,
    frontier: dashboard.frontier,
    confidence_panel: dashboard.confidence_panel,
  };
}

export async function getWorkspacePositionStory(workspaceId, ticker) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  const storyLookup = dashboard.position_stories?.byTicker || {};
  return {
    workspace_summary: dashboard.workspace_summary,
    story: storyLookup[String(ticker || "").toUpperCase()] || null,
    stories: dashboard.position_stories,
  };
}

export async function getWorkspaceCounterfactualLedger(workspaceId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    ledger: dashboard.counterfactual_ledger,
    memory_guidance: dashboard.memory_guidance,
  };
}

export async function getWorkspaceBalanceSheet(workspaceId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    balance_sheet: dashboard.recoverability_balance_sheet,
    confidence_panel: dashboard.confidence_panel,
  };
}

export async function getWorkspaceCapitalTwin(workspaceId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    twin: dashboard.capital_twin,
    mandate: dashboard.mandate,
    xray: dashboard.xray,
  };
}

export async function getWorkspaceMandate(workspaceId) {
  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    mandate: dashboard.mandate,
    frontier: dashboard.frontier,
  };
}

export async function updateWorkspaceMandate(workspaceId, patch) {
  const current = await getWorkspaceMandate(workspaceId);
  const nextMandate = {
    ...current.mandate,
    ...patch,
    thresholds: {
      ...(current.mandate?.thresholds || {}),
      ...(patch?.thresholds || {}),
    },
    guardrails: Array.isArray(patch?.guardrails) ? patch.guardrails : current.mandate?.guardrails || [],
    updatedAt: new Date().toISOString(),
    source: "workspace",
  };

  if (typeof workspaceStore.upsertWorkspaceMandate === "function") {
    await workspaceStore.upsertWorkspaceMandate(workspaceId, nextMandate);
  }

  const dashboard = await getWorkspaceDashboard(workspaceId);
  return {
    workspace_summary: dashboard.workspace_summary,
    mandate: dashboard.mandate,
    frontier: dashboard.frontier,
    capital_twin: dashboard.capital_twin,
  };
}

export async function getWorkspaceState(_workspaceId) {
  try {
    return await fetchBackendState();
  } catch (error) {
    return buildUnavailableStatePayload(error, "state_contract_v1");
  }
}

export async function getWorkspacePolicy(_workspaceId) {
  return fetchBackendPolicy();
}

export async function getWorkspaceStateContract(_workspaceId) {
  try {
    return await fetchBackendStateContract();
  } catch (error) {
    return buildUnavailableStatePayload(error, "state_contract_v1");
  }
}

export async function getWorkspaceRepairs(_workspaceId) {
  return fetchBackendRepairs();
}

export async function getWorkspaceAnalogs(_workspaceId) {
  try {
    return await fetchBackendAnalogs();
  } catch (error) {
    return {
      ...buildUnavailableBackendFeaturePayload(error, "analogs"),
      analogs: [],
    };
  }
}

export async function getWorkspaceBackendBalanceSheet(_workspaceId) {
  return fetchBackendBalanceSheet();
}

export async function getWorkspaceStateV2(_workspaceId) {
  try {
    return await fetchBackendStateV2();
  } catch (error) {
    const fallback = buildUnavailableStatePayload(error, "state_contract_v2");
    return {
      ...fallback,
      bls_state_v1: buildUnavailableStatePayload(error, "state_contract_v1"),
    };
  }
}

export async function getWorkspaceLegitimacy(_workspaceId) {
  try {
    return await fetchBackendLegitimacy();
  } catch (error) {
    return {
      ...buildUnavailableBackendFeaturePayload(error, "legitimacy"),
      legitimacy_surface: null,
    };
  }
}

export async function getWorkspaceFailureModes(_workspaceId) {
  try {
    return await fetchBackendFailureModes();
  } catch (error) {
    return {
      ...buildUnavailableBackendFeaturePayload(error, "failure modes"),
      failure_modes: null,
    };
  }
}

export async function getWorkspaceTransitions(_workspaceId) {
  return fetchBackendTransitions();
}

export async function getWorkspaceSavedState(workspaceId) {
  return {
    watchlist: await getWorkspaceWatchlist(workspaceId),
    savedViews: await getWorkspaceSavedViews(workspaceId),
    commandHistory: await getWorkspaceCommandHistory(workspaceId),
  };
}

export async function upsertWorkspaceSavedView(workspaceId, view) {
  await saveWorkspaceSavedView(workspaceId, view);
  return getWorkspaceDashboard(workspaceId);
}

export async function addWatchlistSymbol(workspaceId, item) {
  return addWorkspaceWatchlistItem(workspaceId, item);
}

export async function recordCommand(workspaceId, command) {
  return pushCommandHistory(workspaceId, command);
}

function defaultExpiry(days = getWorkspacePolicyConfig().escrow.expiryDays) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

async function refreshOperationalEscrowDecisions(workspaceId, escrowDecisions) {
  const items = Array.isArray(escrowDecisions) ? escrowDecisions : [];
  const refreshableStatuses = new Set(["staged", "ready", "revoked", "expired"]);
  const now = Date.now();

  const refreshedEntries = items
    .filter((item) => refreshableStatuses.has(String(item?.status || "staged").toLowerCase()))
    .map((item) => {
      const expiresAt = Date.parse(item?.expiresAt || "");
      if (Number.isFinite(expiresAt) && expiresAt >= now) {
        return null;
      }

      return {
        ...item,
        status: "staged",
        expiresAt: defaultExpiry(),
        updatedAt: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (!refreshedEntries.length) {
    return items;
  }

  await Promise.all(
    refreshedEntries.map((item) => upsertWorkspaceEscrowDecision(workspaceId, item)),
  );

  const refreshedById = new Map(refreshedEntries.map((item) => [item.id, item]));
  return items.map((item) => refreshedById.get(item.id) || item);
}

function trimText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

export async function stageWorkspaceEscrowDecision(workspaceId, payload) {
  const workspacePolicy = getWorkspacePolicyConfig();
  const action = payload?.action || {};
  const escrowId = trimText(payload?.id, `escrow-${randomUUID()}`);
  const entry = {
    id: escrowId,
    actionId: trimText(action.id),
    title: trimText(action.title, "Staged decision"),
    summary: trimText(action.summary || action.whyNow),
    slot: trimText(action.slot, "Also valid"),
    ticker: trimText(action.ticker || "", null),
    tone: trimText(action.tone, "neutral"),
    funding: trimText(action.funding, "No change"),
    sizeLabel: trimText(action.sizeLabel || action.size, "Staged"),
    sizeValue: Number.isFinite(Number(action.sizeValue)) ? Number(action.sizeValue) : null,
    status: "staged",
    autoMature: Boolean(payload?.autoMature),
    readiness: workspacePolicy.escrow.readinessDefault,
    maturityConditions: [trimText(action.trigger, "Wait for confirmation.")].filter(Boolean),
    invalidationConditions: [trimText(action.watchFor, "State weakens again.")].filter(Boolean),
    sourcePayload: action,
    expiresAt: payload?.expiresAt || defaultExpiry(),
    executedAt: null,
  };
  const decisionId = `decision-${randomUUID()}`;
  const signalRunIds = Array.isArray(payload?.signalRunIds)
    ? payload.signalRunIds.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 12)
    : [];

  await Promise.all([
    upsertWorkspaceEscrowDecision(workspaceId, entry),
    appendWorkspaceDecisionEvent(workspaceId, {
      id: decisionId,
      actionId: entry.actionId,
      escrowId: entry.id,
      title: entry.title,
      userResponse: "staged",
      sizeOverride: entry.sizeValue,
      note: payload?.note || "",
      stateSnapshot: { ...(payload?.stateSummary || {}), signalRunIds },
      counterfactual: {},
      recordVersion: "decision-record.v1",
      subjectType: payload?.subjectType || (entry.ticker ? "asset" : null),
      subjectKey: payload?.subjectKey || entry.ticker || null,
      asOfDate: payload?.asOfDate || null,
      occurredAt: new Date().toISOString(),
    }),
  ]);
  await Promise.all(signalRunIds.map((analysisRunId) => linkSignalRunToDecision({
    workspaceId,
    decisionEventId: decisionId,
    analysisRunId,
    role: "market_state",
  })));

  return getWorkspaceDashboard(workspaceId);
}

export async function patchWorkspaceEscrowDecision(workspaceId, escrowId, payload) {
  const current = await getWorkspaceEscrowDecisions(workspaceId);
  const existing = current.find((item) => item.id === escrowId);
  if (!existing) {
    throw new Error("Escrow decision not found.");
  }

  const next = {
    ...existing,
    autoMature: payload?.autoMature ?? existing.autoMature,
    readiness: Number.isFinite(Number(payload?.readiness)) ? Number(payload.readiness) : existing.readiness,
  };

  const action = trimText(payload?.action);
  let response = "updated";

  if (action === "cancel") {
    next.status = "cancelled";
    response = "cancelled";
  } else if (action === "execute") {
    next.status = "executed";
    next.executedAt = new Date().toISOString();
    response = "executed";
  }
  const decisionId = `decision-${randomUUID()}`;
  const signalRunIds = Array.isArray(payload?.signalRunIds)
    ? payload.signalRunIds.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 12)
    : [];

  await Promise.all([
    upsertWorkspaceEscrowDecision(workspaceId, next),
    appendWorkspaceDecisionEvent(workspaceId, {
      id: decisionId,
      actionId: next.actionId,
      escrowId: next.id,
      title: next.title,
      userResponse: response,
      sizeOverride: next.sizeValue,
      note: trimText(payload?.note),
      stateSnapshot: { ...(payload?.stateSummary || {}), signalRunIds },
      counterfactual: {},
      recordVersion: "decision-record.v1",
      subjectType: payload?.subjectType || (next.ticker ? "asset" : null),
      subjectKey: payload?.subjectKey || next.ticker || null,
      asOfDate: payload?.asOfDate || null,
      occurredAt: new Date().toISOString(),
    }),
  ]);
  await Promise.all(signalRunIds.map((analysisRunId) => linkSignalRunToDecision({
    workspaceId,
    decisionEventId: decisionId,
    analysisRunId,
    role: "market_state",
  })));

  return getWorkspaceDashboard(workspaceId);
}

export async function recordWorkspaceDecision(workspaceId, payload) {
  const decisionId = `decision-${randomUUID()}`;
  const signalRunIds = Array.isArray(payload?.signalRunIds)
    ? payload.signalRunIds.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 12)
    : [];
  await appendWorkspaceDecisionEvent(workspaceId, {
    id: decisionId,
    actionId: trimText(payload?.action?.id),
    escrowId: trimText(payload?.escrowId),
    title: trimText(payload?.action?.title, "Decision event"),
    userResponse: trimText(payload?.userResponse, "noted"),
    sizeOverride: Number.isFinite(Number(payload?.sizeOverride)) ? Number(payload.sizeOverride) : null,
    note: trimText(payload?.note),
    stateSnapshot: {
      ...(payload?.stateSummary || {}),
      signalRunIds,
    },
    counterfactual: payload?.counterfactual || {},
    recordVersion: "decision-record.v1",
    subjectType: payload?.subjectType || (payload?.action?.ticker ? "asset" : null),
    subjectKey: payload?.subjectKey || payload?.action?.ticker || null,
    asOfDate: payload?.asOfDate || null,
    occurredAt: new Date().toISOString(),
  });
  await Promise.all(signalRunIds.map((analysisRunId) => linkSignalRunToDecision({
    workspaceId,
    decisionEventId: decisionId,
    analysisRunId,
    role: "market_state",
  })));

  return getWorkspaceDashboard(workspaceId);
}
