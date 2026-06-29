function safeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function defaultMandate() {
  return {
    id: "compound_without_fake_rebounds",
    label: "Crecer sin perseguir rebotes dudosos",
    statement: "Agregar con cuidado y rechazar compras que todavia no pasan la prueba de recuperacion.",
    guardrails: [
      "Preferir defensa y calidad antes que saltos rapidos de mercado.",
      "Subir riesgo solo cuando mejoren soporte y recuperacion.",
      "Tratar rebotes dudosos como trampas, no invitaciones.",
    ],
    options: [
      {
        id: "compound_without_fake_rebounds",
        label: "Crecer sin perseguir rebotes dudosos",
      },
      {
        id: "defend_drawdown",
        label: "Defender la caida primero",
      },
      {
        id: "stage_only_on_recoverability",
        label: "Guardar hasta que mejore la recuperacion",
      },
    ],
    source: "derived_default",
  };
}

function buildFallbackFrontier(dashboard) {
  const unlocked = [dashboard?.primary_action, ...safeList(dashboard?.secondary_actions)].filter(Boolean).map((item) => ({
    id: item.id,
    lane: "unlocked",
    laneLabel: "Listo",
    title: item.title,
    ticker: item.ticker || null,
    summary: item.summary || item.whyNow || "",
    sizeLabel: item.sizeLabel || "-",
    funding: item.funding || "Sin cambio",
    evidenceBand: dashboard?.stress_mode?.authorityLabel || dashboard?.state_summary?.evidenceStrength || "Evidencia usable",
    whyLane: "Esta accion cabe dentro del permiso actual y puede hacerse con cuidado.",
    disproofCondition: dashboard?.state_summary?.changeTrigger || "Si la lectura en vivo se debilita.",
  }));
  const staged = safeList(dashboard?.escrow?.items).map((item) => ({
    id: item.id,
    lane: "staged",
    laneLabel: "Guardado",
    title: item.title,
    ticker: item.ticker || null,
    summary: item.summary || "",
    sizeLabel: item.sizeLabel || "Guardado",
    funding: item.funding || "Sin cambio",
    evidenceBand: dashboard?.stress_mode?.authorityLabel || "Evidencia usable",
    whyLane: "La opcion sigue abierta, pero necesita confirmacion.",
    disproofCondition: safeList(item.invalidationConditions)[0] || dashboard?.state_summary?.changeTrigger || "Si el mercado se debilita.",
  }));
  const blocked = dashboard?.blocked_action ? [{
    id: dashboard.blocked_action.id,
    lane: "illegitimate",
    laneLabel: "Bloqueado",
    title: dashboard.blocked_action.title,
    ticker: dashboard.blocked_action.ticker || null,
    summary: dashboard.blocked_action.summary || "",
    sizeLabel: dashboard.blocked_action.sizeLabel || "-",
    funding: dashboard.blocked_action.funding || "Sin cambio",
    evidenceBand: dashboard?.stress_mode?.authorityLabel || "Evidencia usable",
    whyLane: "Puede ser tentador, pero la lectura actual lo bloquea.",
    disproofCondition: dashboard?.state_summary?.changeTrigger || "Sin cambios por ahora.",
  }] : [];

  return {
    headline: "Acciones posibles",
    subhead: "Mira que esta listo, que queda guardado y que sigue bloqueado antes de mover capital.",
    lanes: [
      { id: "unlocked", label: "Listo", items: unlocked },
      { id: "staged", label: "Guardado", items: staged },
      { id: "illegitimate", label: "Bloqueado", items: blocked },
    ],
    laneSummary: [
      { id: "unlocked", label: "Listo", count: unlocked.length },
      { id: "staged", label: "Guardado", count: staged.length },
      { id: "illegitimate", label: "Bloqueado", count: blocked.length },
    ],
    nextUnlockCondition: dashboard?.decision_workspace?.reopenTrigger || dashboard?.state_summary?.changeTrigger || "Esperar mejor soporte y recuperacion.",
    closeCondition: dashboard?.decision_workspace?.closeTrigger || dashboard?.state_summary?.mainRisk || "Si la lectura se debilita, recortar riesgo primero.",
    allItems: [...unlocked, ...staged, ...blocked],
  };
}

function buildFallbackXray(dashboard) {
  const portfolio = dashboard?.modules?.portfolio || {};
  const holdings = safeList(portfolio?.holdings);
  const topFive = holdings.slice(0, 5);
  return {
    headline: "Que sostiene la cartera ahora",
    subhead: "Lee la cartera por rol, concentracion, fragilidad y aporte a recuperacion.",
    totalValueUsd: portfolio?.analytics?.totalValueUsd || null,
    holdingsCount: portfolio?.analytics?.holdingsCount || holdings.length,
    concentration: {
      topFive: topFive.length ? `${(topFive.reduce((sum, item) => sum + (Number.parseFloat(String(item.weight || "0")) / 100 || 0), 0) * 100).toFixed(1)}%` : "-",
      topTen: "-",
      ballast: "-",
      verdict: "Conectada",
    },
    roleBands: [],
    carriers: topFive,
    concentrationWarnings: [],
    weightedHoldings: holdings,
  };
}

function buildFallbackStories(xray, dashboard) {
  const items = safeList(xray?.weightedHoldings).slice(0, 8).map((holding) => ({
    ticker: String(holding.ticker || "").toUpperCase(),
    title: `${holding.ticker} en la cartera`,
    role: holding.roleLabel || "Posicion",
    roleDescription: holding.sector || "Rol pendiente.",
    weight: holding.weight || "-",
    marketValueUsd: holding.marketValueUsd || null,
    whyExists: [`${holding.ticker} es parte de la cartera y debe justificar su lugar por rol y concentracion.`],
    whatBreaks: ["Si agrega mas fragilidad que recuperacion, debe perder prioridad."],
    whatCouldReplace: [],
    improvesConfidence: [dashboard?.state_summary?.changeTrigger || "Una senal de recuperacion mas clara."],
  }));

  return {
    headline: "Historia de posiciones",
    subhead: "Cada posicion importante debe explicar por que esta en la cartera.",
    selectedTicker: items[0]?.ticker || null,
    items,
    byTicker: Object.fromEntries(items.map((item) => [item.ticker, item])),
  };
}

export function buildDecisionOsSections(dashboard, overrides = {}) {
  const frontier = overrides.frontier || dashboard?.frontier || buildFallbackFrontier(dashboard);
  const xray = overrides.xray || dashboard?.xray || buildFallbackXray(dashboard);
  const positionStories = overrides.positionStories || dashboard?.position_stories || buildFallbackStories(xray, dashboard);
  const items = safeList(positionStories?.items);
  const byTicker = Object.fromEntries(items.map((item) => [String(item.ticker || "").toUpperCase(), item]));
  const memoryGuidance = overrides.memoryGuidance || dashboard?.memory_guidance || {
    profileLabel: "Aun aprendiendo",
    profileSummary: "El sistema todavia esta aprendiendo tu patron de decision.",
    overlays: [],
    warnings: [],
    brief: safeList(dashboard?.memory?.weeklyBrief),
  };
  const counterfactualLedger = overrides.counterfactualLedger || dashboard?.counterfactual_ledger || {
    headline: "Historial de decisiones",
    subhead: "Mide que paso despues de actuar, esperar o pasar.",
    items: [],
  };
  const capitalTwin = overrides.capitalTwin || dashboard?.capital_twin || {
    headline: "Escenarios de cartera",
    subhead: "Caminos posibles proyectados desde la cartera actual.",
    baselineLabel: "Comparado con la cartera conectada actual.",
    historyLabel: "El historial se completa a medida que se guardan fotos de la cartera.",
    scenarios: [],
    exposures: [],
  };
  const mandate = {
    ...defaultMandate(),
    ...(dashboard?.mandate || {}),
    ...(overrides.mandate || {}),
  };
  const recoverabilityMap = overrides.recoverabilityMap || dashboard?.recoverability_map || {
    headline: "Mapa de oportunidades",
    subhead: "Muestra que posiciones e ideas se ven mas firmes y cuales necesitan una mejor senal.",
    filters: [
      { id: "holdings", label: "Posiciones", count: 0 },
      { id: "watch", label: "Ideas en observacion", count: 0 },
      { id: "blocked", label: "Bloqueadas", count: 0 },
    ],
    items: [],
  };
  const recoverabilityBalanceSheet = overrides.recoverabilityBalanceSheet || dashboard?.recoverability_balance_sheet || {
    headline: "Balance de recuperacion",
    subhead: "Muestra que ayuda a la cartera, que la debilita y cuanta liquidez queda para actuar.",
    accountingState: "Respaldo",
    headlineState: "La capa contable no esta disponible, asi que se usa una lectura simple de respaldo.",
    netFreedom: "-",
    optionalityReserve: "-",
    phantomTax: "-",
    legitimacySlack: "-",
    spendingCapacity: "-",
    budgetState: "Sin dato",
    dominantFailureMode: "-",
    assets: [],
    liabilities: [],
    reserves: [],
    spendRule: dashboard?.state_summary?.changeTrigger || "Esperar mejor soporte y recuperacion.",
    repairNote: dashboard?.primary_action?.summary || "Todavia no hay una nota de ajuste disponible.",
    notes: [],
    source: "respaldo",
  };
  const confidencePanel = overrides.confidencePanel || dashboard?.confidence_panel || {
    headline: "Confianza verificable",
    confidenceBand: dashboard?.state_summary?.evidenceStrength || "Evidencia usable",
    trustState: dashboard?.state_summary?.mode || "-",
    decisionRights: dashboard?.modules?.command?.decisionRights || "-",
    evidenceTier: dashboard?.stress_mode?.evidenceTier || "En vivo",
    analogCount: 0,
    disproofConditions: [dashboard?.state_summary?.changeTrigger].filter(Boolean),
    note: "La confianza se muestra junto a las condiciones que podrian invalidarla.",
  };

  return {
    frontier,
    xray,
    position_stories: {
      ...positionStories,
      items,
      byTicker,
    },
    counterfactual_ledger: counterfactualLedger,
    memory_guidance: memoryGuidance,
    recoverability_map: recoverabilityMap,
    recoverability_balance_sheet: recoverabilityBalanceSheet,
    confidence_panel: confidencePanel,
    capital_twin: capitalTwin,
    mandate,
  };
}
