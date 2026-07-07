import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getNeonSql, usingNeonStorage } from "./data/neon.js";
import { ensureWorkspaceRecord } from "./data/workspaces.js";
import { getServerConfig } from "./config.js";
import {
  assessPerformanceInputs,
  buildPerformanceReport,
  fetchDailyCloseHistory,
  reconstructPortfolioSeries,
} from "./holdings-performance.js";

async function fetchFmpQuotes(tickers) {
  const apiKey = process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY;
  if (!apiKey || !tickers.length) return {};

  const unique = [...new Set(tickers.map((t) => String(t || "").toUpperCase()).filter(Boolean))];

  const results = await Promise.allSettled(
    unique.map(async (symbol) => {
      const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const data = await response.json();
      const quote = Array.isArray(data) ? data[0] : null;
      if (!quote || !Number.isFinite(Number(quote.price)) || Number(quote.price) <= 0) return null;
      return [symbol, Number(quote.price)];
    }),
  );

  return Object.fromEntries(
    results
      .filter((r) => r.status === "fulfilled" && r.value !== null)
      .map((r) => r.value),
  );
}

function parseNumber(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDelimitedRow(line) {
  return line.split(";").map((value) => value.trim());
}

async function loadHoldingsCsv(csvPath) {
  const text = await fs.readFile(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseDelimitedRow(lines[0]);

  return lines
    .slice(1)
    .map((line) => {
      const cells = parseDelimitedRow(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
      return {
        ticker: row.ticker || null,
        asset_type: row.asset_type || null,
        quantity: parseNumber(row.quantity),
        currency: row.currency || null,
        avg_cost_usd: parseNumber(row.avg_cost_usd),
        purchase_date: parsePurchaseDate(row.purchase_date || row.entry_date),
        current_price_usd: parseNumber(row.current_price_usd),
        market_value_usd: parseNumber(row.market_value_usd),
        weight: parseNumber(row.weight),
        source_sheet: row.source_sheet || null,
        sector: row.sector || "Unknown",
        industry: row.industry || "Unknown",
      };
    })
    .filter((row) => row.ticker)
    .sort((left, right) => (right.weight || 0) - (left.weight || 0));
}

function resolveWorkspaceStateDir() {
  if (process.env.BLS_PRIME_HOLDINGS_STATE_DIR) {
    return process.env.BLS_PRIME_HOLDINGS_STATE_DIR;
  }
  return path.join(process.cwd(), "_local_data", "workspaces");
}

function resolveHoldingsStatePath(workspaceId) {
  return path.join(resolveWorkspaceStateDir(), String(workspaceId || "default"), "holdings_state.json");
}

function resolveLocalHoldingsPath() {
  if (process.env.BLS_PRIME_LOCAL_HOLDINGS_CSV) {
    return process.env.BLS_PRIME_LOCAL_HOLDINGS_CSV;
  }
  const portfolioRoot = process.env.META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT;
  if (portfolioRoot) {
    return path.join(portfolioRoot, "output", "latest", "holdings_normalized.csv");
  }

  const candidates = [
    path.resolve(process.cwd(), "..", "portfolio_manager", "output", "latest", "holdings_normalized.csv"),
    path.resolve(process.cwd(), "_local_data", "finance", "portfolio_manager", "output", "latest", "holdings_normalized.csv"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function deriveHoldingsStateUrl(sourceUrl) {
  const raw = String(sourceUrl || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/dashboard_snapshot\.json$/, "holdings_state.json");
    if (!/holdings_state\.json$/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/?$/, "/holdings_state.json");
    }
    return url.toString();
  } catch {
    return raw.replace(/dashboard_snapshot\.json(\?.*)?$/, "holdings_state.json$1");
  }
}

function resolveRemoteHoldingsStateUrl() {
  const explicit = (
    process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_URL ||
    process.env.META_ALLOCATOR_REMOTE_HOLDINGS_STATE_URL ||
    ""
  ).trim();
  if (explicit) return explicit;
  return deriveHoldingsStateUrl(
    process.env.BLS_PRIME_REMOTE_SNAPSHOT_URL ||
    process.env.META_ALLOCATOR_REMOTE_SNAPSHOT_URL ||
    "",
  );
}

function resolveRemoteHoldingsStatePutUrl() {
  const explicit = (
    process.env.BLS_PRIME_REMOTE_HOLDINGS_STATE_PUT_URL ||
    process.env.META_ALLOCATOR_REMOTE_HOLDINGS_STATE_PUT_URL ||
    ""
  ).trim();
  if (explicit) return explicit;
  return deriveHoldingsStateUrl(
    process.env.BLS_PRIME_REMOTE_SNAPSHOT_PUT_URL ||
    process.env.META_ALLOCATOR_REMOTE_SNAPSHOT_PUT_URL ||
    "",
  );
}

function remoteHoldingsStateEnabled() {
  return Boolean(resolveRemoteHoldingsStateUrl() || resolveRemoteHoldingsStatePutUrl());
}

function parseUpdatedAt(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const millis = Date.parse(text);
  return Number.isFinite(millis) ? millis : null;
}

async function ensureNeonWorkspace(workspaceId) {
  const { defaultWorkspaceName } = getServerConfig();
  return ensureWorkspaceRecord({
    workspaceId,
    name: defaultWorkspaceName,
    visibility: "private",
  });
}

async function ensurePortfolioCashLedger(sql) {
  if (globalThis.__BLS_PORTFOLIO_CASH_LEDGER_READY__) return;
  await sql.query(`
    CREATE TABLE IF NOT EXISTS bls_portfolio_cash_ledger (
      id BIGSERIAL PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      amount_usd NUMERIC,
      ticker TEXT,
      quantity NUMERIC,
      price_usd NUMERIC,
      source TEXT,
      note TEXT,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_bls_portfolio_cash_ledger_workspace_time
    ON bls_portfolio_cash_ledger (workspace_id, occurred_at)`,
  );
  globalThis.__BLS_PORTFOLIO_CASH_LEDGER_READY__ = true;
}

async function ensurePurchaseDateColumn(sql) {
  if (globalThis.__BLS_PORTFOLIO_PURCHASE_DATE_READY__) return;
  await sql.query(`ALTER TABLE bls_portfolio_positions ADD COLUMN IF NOT EXISTS purchase_date DATE`);
  globalThis.__BLS_PORTFOLIO_PURCHASE_DATE_READY__ = true;
}

function parsePurchaseDate(value) {
  const text = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return Number.isFinite(Date.parse(`${text}T00:00:00Z`)) ? text : null;
}

function allowLegacyHoldingsFallback() {
  const explicit = String(process.env.BLS_PRIME_ALLOW_HOLDINGS_FILE_FALLBACK || "").trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return !usingNeonStorage();
}

function roundDateToBucket(dateValue, minutes = 15) {
  const date = dateValue instanceof Date ? new Date(dateValue) : new Date(dateValue || Date.now());
  if (Number.isNaN(date.getTime())) return new Date();
  const bucketMs = minutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / bucketMs) * bucketMs);
}

function signedExternalFlowUsd(trade) {
  const quantity = Math.abs(parseNumber(trade?.quantity) ?? parseNumber(trade?.quantity_delta) ?? 0);
  const price = parseNumber(trade?.price_usd) ?? parseNumber(trade?.price) ?? 0;
  const value = quantity * price;
  if (!(value > 0)) return 0;
  const side = String(trade?.side || trade?.action || "").trim().toLowerCase();
  if (["buy", "bought", "add", "deposit", "contribution"].includes(side)) return value;
  if (["sell", "sold", "trim", "withdrawal", "withdraw"].includes(side)) return -value;
  return 0;
}

function signedCashImpactUsd(trade) {
  const explicit = parseNumber(trade?.trade_value_usd ?? trade?.amount_usd ?? trade?.amountUsd);
  const quantity = Math.abs(parseNumber(trade?.quantity) ?? parseNumber(trade?.quantity_delta) ?? 0);
  const price = parseNumber(trade?.price_usd) ?? parseNumber(trade?.price) ?? 0;
  const value = explicit !== null ? Math.abs(explicit) : quantity * price;
  if (!(value > 0)) return 0;
  const side = String(trade?.side || trade?.action || "").trim().toLowerCase();
  if (["buy", "bought", "add"].includes(side)) return -value;
  if (["sell", "sold", "trim"].includes(side)) return value;
  return 0;
}

export function signedCashLedgerExternalFlowUsd(row) {
  const eventType = String(row?.event_type || row?.eventType || row?.type || "").trim().toLowerCase();
  const amount = parseNumber(row?.amount_usd ?? row?.amountUsd ?? row?.amount);
  if (amount === null || amount === 0) return 0;
  if (["deposit", "contribution"].includes(eventType)) return Math.abs(amount);
  if (["withdrawal", "withdraw"].includes(eventType)) return -Math.abs(amount);
  return 0;
}

function normalizeCashEvent(input) {
  const raw = input?.cashEvent || input?.cash_event || input;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const eventType = String(raw.event_type || raw.eventType || raw.type || raw.action || "").trim().toLowerCase();
  const amount = parseNumber(raw.amount_usd ?? raw.amountUsd ?? raw.amount);
  if (!eventType || amount === null || amount === 0) return null;
  const allowed = new Set(["deposit", "contribution", "withdrawal", "withdraw", "dividend", "fee", "adjustment"]);
  if (!allowed.has(eventType)) return null;
  return {
    event_type: eventType === "withdraw" ? "withdrawal" : eventType,
    amount_usd: ["withdrawal", "withdraw", "fee"].includes(eventType) ? -Math.abs(amount) : Math.abs(amount),
    source: String(raw.source || input?.source || "portfolio_cash_ledger").trim() || "portfolio_cash_ledger",
    note: String(raw.note || raw.memo || "").trim().slice(0, 400) || null,
  };
}

function dateMillis(value) {
  const millis = Date.parse(value || "");
  return Number.isFinite(millis) ? millis : null;
}

function attachHistoryExternalFlows(historyRows, flowRows) {
  const rows = [...(Array.isArray(historyRows) ? historyRows : [])].sort((left, right) => {
    const leftTime = dateMillis(left.capture_bucket || left.captured_at) ?? 0;
    const rightTime = dateMillis(right.capture_bucket || right.captured_at) ?? 0;
    return leftTime - rightTime;
  });
  const flows = (Array.isArray(flowRows) ? flowRows : [])
    .map((trade) => ({
      ...trade,
      flowUsd: parseNumber(trade.flow_usd ?? trade.flowUsd) ?? signedExternalFlowUsd(trade),
      time: dateMillis(trade.occurred_at || trade.created_at || trade.trade_date || trade.date),
    }))
    .filter((trade) => trade.time !== null && trade.flowUsd !== 0);

  return rows.map((row, index) => {
    const currentTime = dateMillis(row.capture_bucket || row.captured_at);
    const previousTime = index > 0 ? dateMillis(rows[index - 1].capture_bucket || rows[index - 1].captured_at) : null;
    const intervalFlows = flows.filter((trade) => (
      currentTime !== null &&
      trade.time <= currentTime &&
      (previousTime === null || trade.time > previousTime)
    ));
    const externalFlowUsd = intervalFlows.reduce((sum, trade) => sum + trade.flowUsd, 0);
    return {
      ...row,
      external_flow_usd: externalFlowUsd,
      trade_count: intervalFlows.length,
    };
  });
}

export function buildHistorySeries(rows) {
  const seriesRows = [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const leftTime = dateMillis(left.capture_bucket || left.captured_at || left.date) ?? 0;
    const rightTime = dateMillis(right.capture_bucket || right.captured_at || right.date) ?? 0;
    return leftTime - rightTime;
  });
  const firstPortfolio = seriesRows.find((row) => {
    const value = parseNumber(row.total_value_usd);
    return value !== null && value > 0;
  })?.total_value_usd ?? null;
  const firstBenchmark = seriesRows.find((row) => parseNumber(row.benchmark_price_usd) !== null)?.benchmark_price_usd ?? null;
  const hasFlowData = seriesRows.some((row) => parseNumber(row.external_flow_usd) !== null || parseNumber(row.trade_count) !== null);
  let priorPortfolioValue = null;
  let twrIndex = 1;

  return seriesRows.map((row, index) => {
    const rawPortfolioValue = parseNumber(row.total_value_usd);
    const portfolioValue = rawPortfolioValue !== null && rawPortfolioValue > 0 ? rawPortfolioValue : null;
    const benchmarkValue = parseNumber(row.benchmark_price_usd);
    const externalFlow = parseNumber(row.external_flow_usd) || 0;
    let periodReturn = null;
    let portfolioGrowth = null;

    if (index === 0 && portfolioValue !== null) {
      twrIndex = 1;
      portfolioGrowth = twrIndex;
    } else if (portfolioValue !== null && priorPortfolioValue !== null && priorPortfolioValue > 0) {
      periodReturn = (portfolioValue - priorPortfolioValue - externalFlow) / priorPortfolioValue;
      if (Number.isFinite(periodReturn)) {
        periodReturn = Math.max(-0.95, Math.min(2.5, periodReturn));
        twrIndex *= 1 + periodReturn;
        portfolioGrowth = twrIndex;
      }
    } else if (portfolioValue !== null && priorPortfolioValue === null) {
      twrIndex = 1;
      portfolioGrowth = twrIndex;
    }

    if (portfolioValue !== null) priorPortfolioValue = portfolioValue;

    return {
      date: row.capture_bucket || row.captured_at || row.date,
      portfolio_growth: portfolioGrowth,
      value_growth:
        firstPortfolio !== null && firstPortfolio > 0 && portfolioValue !== null
          ? portfolioValue / firstPortfolio
          : null,
      spy_growth:
        firstBenchmark !== null && firstBenchmark > 0 && benchmarkValue !== null
          ? benchmarkValue / firstBenchmark
          : null,
      external_flow_usd: externalFlow,
      period_return: periodReturn,
      performance_method: hasFlowData ? "twr_external_flow_adjusted" : "twr_no_recorded_flows",
    };
  }).filter((row) => row.portfolio_growth !== null || row.spy_growth !== null);
}

export function buildHistoryPerformanceMetrics(rows) {
  const series = buildHistorySeries(rows);
  const portfolioPoints = series.filter((row) => parseNumber(row.portfolio_growth) !== null);
  const first = portfolioPoints[0]?.portfolio_growth;
  const last = portfolioPoints[portfolioPoints.length - 1]?.portfolio_growth;
  const totalTwr = first && first > 0 && last ? (last / first) - 1 : null;
  const flowCount = series.reduce((sum, row) => sum + (Math.abs(parseNumber(row.external_flow_usd) || 0) > 0 ? 1 : 0), 0);
  const moneyWeightedReturn = moneyWeightedReturnFromHistory(rows);
  return {
    totalTwr,
    totalTwrLabel: totalTwr === null ? null : `${(totalTwr * 100).toFixed(1)}%`,
    moneyWeightedReturn,
    moneyWeightedReturnLabel: moneyWeightedReturn === null ? null : `${(moneyWeightedReturn * 100).toFixed(1)}%`,
    performanceMethod: flowCount > 0 ? "time_weighted_external_flow_adjusted" : "time_weighted_no_recorded_flows",
    externalFlowCount: flowCount,
  };
}

function yearsBetween(start, end) {
  const startMs = dateMillis(start);
  const endMs = dateMillis(end);
  if (startMs === null || endMs === null) return null;
  return (endMs - startMs) / (365.25 * 24 * 60 * 60 * 1000);
}

function xnpv(rate, cashflows) {
  const startDate = cashflows[0]?.date;
  return cashflows.reduce((sum, flow) => {
    const years = yearsBetween(startDate, flow.date);
    if (years === null) return sum;
    return sum + flow.amount / ((1 + rate) ** years);
  }, 0);
}

function solveXirr(cashflows) {
  const valid = cashflows.filter((flow) => Number.isFinite(flow.amount) && dateMillis(flow.date) !== null);
  if (valid.length < 2) return null;
  const hasPositive = valid.some((flow) => flow.amount > 0);
  const hasNegative = valid.some((flow) => flow.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  let low = -0.9999;
  let high = 10;
  let lowValue = xnpv(low, valid);
  let highValue = xnpv(high, valid);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) return null;

  for (let expand = 0; lowValue * highValue > 0 && expand < 8; expand += 1) {
    high *= 2;
    highValue = xnpv(high, valid);
    if (!Number.isFinite(highValue)) return null;
  }
  if (lowValue * highValue > 0) return null;

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const midValue = xnpv(mid, valid);
    if (!Number.isFinite(midValue)) return null;
    if (Math.abs(midValue) < 1e-7) return mid;
    if (lowValue * midValue <= 0) {
      high = mid;
      highValue = midValue;
    } else {
      low = mid;
      lowValue = midValue;
    }
  }
  const result = (low + high) / 2;
  return Number.isFinite(result) ? Math.max(-0.9999, Math.min(20, result)) : null;
}

function moneyWeightedReturnFromHistory(rows) {
  const sorted = [...(Array.isArray(rows) ? rows : [])]
    .map((row) => ({
      date: row.capture_bucket || row.captured_at || row.date,
      value: parseNumber(row.total_value_usd),
      flow: parseNumber(row.external_flow_usd) || 0,
    }))
    .filter((row) => row.date && row.value !== null)
    .sort((left, right) => (dateMillis(left.date) ?? 0) - (dateMillis(right.date) ?? 0));
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!(first.value > 0) || !(last.value > 0)) return null;
  const spanYears = yearsBetween(first.date, last.date);
  if (spanYears === null || spanYears < 30 / 365.25) return null;
  const cashflows = [
    { date: first.date, amount: -first.value },
    ...sorted.slice(1).flatMap((row) => (
      row.flow !== 0 ? [{ date: row.date, amount: -row.flow }] : []
    )),
    { date: last.date, amount: last.value },
  ];
  return solveXirr(cashflows);
}

async function getNeonPortfolioHistory(workspaceId, limit = 320) {
  const sql = await ensureNeonWorkspace(workspaceId);
  await ensurePortfolioCashLedger(sql);
  const [historyRows, tradeRows, cashLedgerRows] = await Promise.all([
    sql.query(
      `SELECT capture_bucket, captured_at, total_value_usd, benchmark_symbol, benchmark_price_usd, metadata
       FROM bls_portfolio_history
       WHERE workspace_id = $1
       ORDER BY capture_bucket ASC
       LIMIT $2`,
      [workspaceId, limit],
    ),
    sql.query(
      `SELECT side, quantity, price_usd, created_at
       FROM bls_portfolio_trade_events
       WHERE workspace_id = $1
       ORDER BY created_at ASC
       LIMIT 2000`,
      [workspaceId],
    ),
    sql.query(
      `SELECT event_type, amount_usd, ticker, quantity, price_usd, occurred_at, created_at
       FROM bls_portfolio_cash_ledger
       WHERE workspace_id = $1
       ORDER BY occurred_at ASC, created_at ASC
       LIMIT 5000`,
      [workspaceId],
    ),
  ]);
  const mappedHistory = historyRows.map((row) => ({
    capture_bucket: row.capture_bucket,
    captured_at: row.captured_at,
    total_value_usd: parseNumber(row.total_value_usd),
    benchmark_symbol: row.benchmark_symbol || "SPY",
    benchmark_price_usd: parseNumber(row.benchmark_price_usd),
    metadata: row.metadata || {},
  }));
  const cashFlowRows = cashLedgerRows
    .map((row) => ({
      ...row,
      flow_usd: signedCashLedgerExternalFlowUsd(row),
    }))
    .filter((row) => row.flow_usd !== 0);
  return attachHistoryExternalFlows(mappedHistory, cashLedgerRows.length ? cashFlowRows : tradeRows);
}

async function appendNeonPortfolioHistorySnapshot(workspaceId, snapshot, holdings, sourceLabel) {
  const rows = Array.isArray(holdings) ? holdings : [];
  if (!rows.length) return [];

  const sql = await ensureNeonWorkspace(workspaceId);
  const totalValueUsd = rows.reduce((sum, row) => sum + (parseNumber(row.market_value_usd) || 0), 0);
  if (!(totalValueUsd > 0)) {
    return getNeonPortfolioHistory(workspaceId);
  }

  const benchmarkSymbol = "SPY";
  const benchmarkPriceUsd = getCurrentPriceForTicker(snapshot, benchmarkSymbol);
  const generatedAt = snapshot?.generated_at || snapshot?.portfolio?.quotes_as_of || new Date().toISOString();
  const captureBucket = roundDateToBucket(generatedAt, 15).toISOString();

  await sql.query(
    `INSERT INTO bls_portfolio_history (
      workspace_id,
      capture_bucket,
      captured_at,
      total_value_usd,
      benchmark_symbol,
      benchmark_price_usd,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    ON CONFLICT (workspace_id, capture_bucket)
    DO UPDATE SET
      captured_at = EXCLUDED.captured_at,
      total_value_usd = EXCLUDED.total_value_usd,
      benchmark_symbol = EXCLUDED.benchmark_symbol,
      benchmark_price_usd = EXCLUDED.benchmark_price_usd,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()`,
    [
      workspaceId,
      captureBucket,
      generatedAt,
      totalValueUsd,
      benchmarkSymbol,
      benchmarkPriceUsd,
      JSON.stringify({
        source_label: sourceLabel || "Private workspace",
        holdings_count: rows.length,
      }),
    ],
  );

  return getNeonPortfolioHistory(workspaceId);
}

async function loadNeonHoldingsState(workspaceId) {
  const sql = await ensureNeonWorkspace(workspaceId);
  await ensurePurchaseDateColumn(sql);
  const [positions, latestTrade] = await Promise.all([
    sql.query(
      `SELECT
        ticker,
        asset_type,
        quantity,
        currency,
        avg_cost_usd,
        purchase_date,
        current_price_usd,
        market_value_usd,
        weight,
        source_sheet,
        sector,
        industry,
        updated_at
       FROM bls_portfolio_positions
       WHERE workspace_id = $1
       ORDER BY updated_at DESC, ticker ASC`,
      [workspaceId],
    ),
    sql.query(
      `SELECT ticker, side, quantity, price_usd, source, created_at
       FROM bls_portfolio_trade_events
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [workspaceId],
    ),
  ]);

  if (!positions.length) return null;

  const updatedAt = positions
    .map((row) => parseUpdatedAt(row.updated_at))
    .filter((value) => value !== null)
    .sort((left, right) => right - left)[0];

  return {
    available: true,
    source: "neon_portfolio",
    source_label: "Private workspace",
    updated_at: updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString(),
    workspace_id: workspaceId,
    sync_status: "neon_synced",
    sync_label: "Saved to Neon",
    holdings: positions.map((row) => ({
      ticker: row.ticker,
      asset_type: row.asset_type,
      quantity: parseNumber(row.quantity),
      currency: row.currency || "USD",
      avg_cost_usd: parseNumber(row.avg_cost_usd),
      purchase_date: parsePurchaseDate(row.purchase_date),
      current_price_usd: parseNumber(row.current_price_usd),
      market_value_usd: parseNumber(row.market_value_usd),
      weight: parseNumber(row.weight),
      source_sheet: row.source_sheet || "Neon",
      sector: row.sector || "Unknown",
      industry: row.industry || "Unknown",
    })),
    trade: latestTrade[0]
      ? {
        ticker: latestTrade[0].ticker,
        side: latestTrade[0].side,
        quantity_delta: parseNumber(latestTrade[0].quantity),
        price_usd: parseNumber(latestTrade[0].price_usd),
        source: latestTrade[0].source || "neon",
        created_at: latestTrade[0].created_at,
      }
      : null,
  };
}

async function loadHoldingsState(workspaceId) {
  if (usingNeonStorage()) {
    const neonState = await loadNeonHoldingsState(workspaceId);
    if (neonState?.holdings?.length) {
      return neonState;
    }
  }

  if (!allowLegacyHoldingsFallback()) {
    return null;
  }

  const candidates = [];
  const remoteUrl = resolveRemoteHoldingsStateUrl();
  if (remoteUrl) {
    try {
      const response = await fetch(remoteUrl, {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (response.ok) {
        const payload = await response.json();
        if (payload && typeof payload === "object") {
          const holdings = Array.isArray(payload.holdings) ? payload.holdings.filter((row) => row && row.ticker) : [];
          if (holdings.length) {
            candidates.push({
              ...payload,
              holdings,
              source: payload.source || "remote_overlay",
              source_label: payload.source_label || "Remote holdings overlay",
              state_path: remoteUrl,
            });
          }
        }
      }
    } catch {
      // Fall through to local backup.
    }
  }

  const statePath = resolveHoldingsStatePath(workspaceId);
  try {
    const text = await fs.readFile(statePath, "utf8");
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== "object") return null;
    const holdings = Array.isArray(payload.holdings) ? payload.holdings.filter((row) => row && row.ticker) : [];
    if (!holdings.length) return null;
    candidates.push({
      ...payload,
      holdings,
      source: payload.source || "ui_editable_overlay",
      source_label: payload.source_label || "Edited in UI",
      state_path: statePath,
    });
  } catch {
    // ignore local read failures; remote may still be available
  }

  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const ranked = [...candidates].sort((left, right) => {
    const leftTime = parseUpdatedAt(left.updated_at) ?? parseUpdatedAt(left.updatedAt) ?? 0;
    const rightTime = parseUpdatedAt(right.updated_at) ?? parseUpdatedAt(right.updatedAt) ?? 0;
    return rightTime - leftTime;
  });
  return ranked[0];
}

async function saveHoldingsState(workspaceId, payload) {
  if (usingNeonStorage()) {
    const sql = await ensureNeonWorkspace(workspaceId);
    await ensurePortfolioCashLedger(sql);
    await ensurePurchaseDateColumn(sql);
    const holdings = normalizeHoldingsForOutput(payload?.holdings || []);
    const statements = [
      sql.query(`DELETE FROM bls_portfolio_positions WHERE workspace_id = $1`, [workspaceId]),
      ...holdings.map((row) => sql.query(
        `INSERT INTO bls_portfolio_positions (
          workspace_id,
          ticker,
          asset_type,
          quantity,
          avg_cost_usd,
          purchase_date,
          currency,
          notes,
          sector,
          industry,
          source_sheet,
          current_price_usd,
          market_value_usd,
          weight
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          workspaceId,
          row.ticker,
          row.asset_type || "equity",
          parseNumber(row.quantity),
          parseNumber(row.avg_cost_usd),
          parsePurchaseDate(row.purchase_date),
          row.currency || "USD",
          null,
          row.sector || "Unknown",
          row.industry || "Unknown",
          row.source_sheet || "Neon",
          parseNumber(row.current_price_usd),
          parseNumber(row.market_value_usd),
          parseNumber(row.weight),
        ],
      )),
    ];

    if (payload?.trade?.ticker && payload?.trade?.side) {
      statements.push(sql.query(
        `INSERT INTO bls_portfolio_trade_events (
          workspace_id,
          ticker,
          side,
          quantity,
          price_usd,
          source
        )
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          workspaceId,
          payload.trade.ticker,
          payload.trade.side,
          parseNumber(payload.trade.quantity_delta),
          parseNumber(payload.trade.price_usd),
          payload.source || "neon_portfolio",
        ],
      ));

      const cashImpact = signedCashImpactUsd(payload.trade);
      if (cashImpact !== 0) {
        statements.push(sql.query(
          `INSERT INTO bls_portfolio_cash_ledger (
            workspace_id,
            event_type,
            amount_usd,
            ticker,
            quantity,
            price_usd,
            source,
            note
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            workspaceId,
            String(payload.trade.side || "").trim().toLowerCase(),
            cashImpact,
            payload.trade.ticker,
            Math.abs(parseNumber(payload.trade.quantity_delta) || parseNumber(payload.trade.quantity) || 0),
            parseNumber(payload.trade.price_usd),
            payload.source || "neon_portfolio",
            "Internal trade cash movement",
          ],
        ));
      }
    }

    const cashEvent = normalizeCashEvent(payload);
    if (cashEvent) {
      statements.push(sql.query(
        `INSERT INTO bls_portfolio_cash_ledger (
          workspace_id,
          event_type,
          amount_usd,
          source,
          note
        )
        VALUES ($1, $2, $3, $4, $5)`,
        [
          workspaceId,
          cashEvent.event_type,
          cashEvent.amount_usd,
          cashEvent.source,
          cashEvent.note,
        ],
      ));
    }

    await sql.transaction(statements);
    return { statePath: `neon:${workspaceId}`, remoteSynced: true, remotePutUrl: "neon" };
  }

  const statePath = resolveHoldingsStatePath(workspaceId);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(payload, null, 2), "utf8");
  let remoteSynced = false;
  const remotePutUrl = resolveRemoteHoldingsStatePutUrl();
  if (remotePutUrl) {
    try {
      const response = await fetch(remotePutUrl, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      remoteSynced = response.ok;
    } catch {
      // Local save already succeeded; remote sync is best-effort.
    }
  }
  return { statePath, remoteSynced, remotePutUrl };
}

function normalizeHoldingsForOutput(holdings) {
  return [...holdings]
    .map((row) => ({
      ticker: row.ticker || null,
      asset_type: row.asset_type || "equity",
      quantity: parseNumber(row.quantity),
      currency: row.currency || "USD",
      avg_cost_usd: parseNumber(row.avg_cost_usd),
      purchase_date: parsePurchaseDate(row.purchase_date || row.purchaseDate),
      current_price_usd: parseNumber(row.current_price_usd),
      market_value_usd: parseNumber(row.market_value_usd),
      weight: parseNumber(row.weight),
      upside: parseNumber(row.upside),
      source_sheet: row.source_sheet || "UI_Overlay",
      sector: row.sector || "Unknown",
      industry: row.industry || "Unknown",
    }))
    .filter((row) => row.ticker)
    .sort((left, right) => (right.market_value_usd || right.weight || 0) - (left.market_value_usd || left.weight || 0));
}

function getCurrentPriceForTicker(snapshot, ticker) {
  const target = String(ticker || "").toUpperCase();
  const quotes = Array.isArray(snapshot?.portfolio?.quotes) ? snapshot.portfolio.quotes : [];
  const quote = quotes.find((row) => String(row?.ticker || "").toUpperCase() === target);
  const quotePrice = parseNumber(quote?.price);
  if (quotePrice !== null) return quotePrice;

  const portfolioRows = Array.isArray(snapshot?.portfolio?.holdings)
    ? snapshot.portfolio.holdings
    : Array.isArray(snapshot?.portfolio?.top_holdings)
      ? snapshot.portfolio.top_holdings
      : [];
  const holding = portfolioRows.find((row) => String(row?.ticker || "").toUpperCase() === target);
  const holdingPrice = parseNumber(holding?.current_price_usd);
  if (holdingPrice !== null) return holdingPrice;

  const screenerRows = Array.isArray(snapshot?.screener?.rows) ? snapshot.screener.rows : [];
  const screenerRow = screenerRows.find((row) => String(row?.ticker || "").toUpperCase() === target);
  const screenerPrice = parseNumber(screenerRow?.current_price ?? screenerRow?.current_price_usd ?? screenerRow?.fair_value);
  if (screenerPrice !== null) return screenerPrice;

  return null;
}

function getTickerMeta(snapshot, ticker) {
  const target = String(ticker || "").toUpperCase();
  const holdings = Array.isArray(snapshot?.portfolio?.holdings)
    ? snapshot.portfolio.holdings
    : Array.isArray(snapshot?.portfolio?.top_holdings)
      ? snapshot.portfolio.top_holdings
      : [];
  const holding = holdings.find((row) => String(row?.ticker || "").toUpperCase() === target);
  const screenerRows = Array.isArray(snapshot?.screener?.rows) ? snapshot.screener.rows : [];
  const screenerRow = screenerRows.find((row) => String(row?.ticker || "").toUpperCase() === target);

  return {
    asset_type: holding?.asset_type || screenerRow?.asset_type || "equity",
    sector: holding?.sector || screenerRow?.sector || "Unknown",
    industry: holding?.industry || screenerRow?.industry || "Unknown",
  };
}

function parseTradeInstruction(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  const explicitTickerMatch = raw.match(/\b(?:of|in|for|into|to|buy|bought|sell|sold|trim|reduce|close|de|en|compr(?:e|ar|é)|vend(?:i|er|í))\s+([A-Za-z]{1,6}(?:\.[A-Za-z]{1,2})?)\b/i);
  const tickerCandidates = [...raw.matchAll(/\b([A-Za-z]{1,6}(?:\.[A-Za-z]{1,2})?)\b/g)]
    .map((match) => match[1].toUpperCase())
    .filter((token) => !["I", "A", "AN", "THE", "OF", "IN", "FOR", "TO", "DE", "EN", "USD", "BUY", "BOUGHT", "BUYING", "SELL", "SOLD", "SELLING", "TRIM", "REDUCE", "CLOSE", "COMPRE", "COMPRAR", "COMPRÉ", "VENDI", "VENDER", "VENDÍ", "ACCION", "ACCIONES", "SHARES", "SHARE", "STOCK"].includes(token));
  const ticker = (explicitTickerMatch?.[1] || tickerCandidates.at(-1) || null)?.toUpperCase() || null;
  const amountMatch = raw.match(/(?:\$|usd\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:usd|dollars?|bucks)?/i);
  const shareMatch = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:shares?|sh|acciones?)\b/i);
  const explicitPriceMatch = raw.match(/(?:at|@|around|a|por)\s*\$?([0-9]+(?:\.[0-9]+)?)/i);

  let side = null;
  if (/(?:\bbuy\b|\bbought\b|\bbuying\b|\badd\b|\bpurchased\b|\bcompre\b|\bcomprar\b|\bcompré\b)/i.test(lowered)) side = "buy";
  if (/(?:\bsell\b|\bsold\b|\bselling\b|\btrim\b|\breduce\b|\bcut\b|\bclose\b|\bvendi\b|\bvender\b|\bvendí\b)/i.test(lowered)) side = "sell";
  if (!ticker || !side) return null;

  const shares = shareMatch ? parseNumber(shareMatch[1]) : null;
  const amountUsd = shares === null ? parseNumber(amountMatch?.[1]) : null;
  const explicitPrice = explicitPriceMatch ? parseNumber(explicitPriceMatch[1]) : null;

  return {
    text: raw,
    ticker,
    side,
    shares,
    amountUsd,
    explicitPrice,
  };
}

function isExplicitHoldingsEdit(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const ticker = String(input.ticker || input.symbol || "").trim();
  return Boolean(
    ticker &&
      (
        input.target_value_usd !== undefined ||
        input.targetValueUsd !== undefined ||
        input.market_value_usd !== undefined ||
        input.marketValueUsd !== undefined ||
        input.quantity !== undefined ||
        input.target_quantity !== undefined ||
        input.targetQuantity !== undefined
      ),
  );
}

function rebuildWeights(holdings) {
  const rows = holdings.map((row) => {
    const quantity = parseNumber(row.quantity) ?? 0;
    const price = parseNumber(row.current_price_usd) ?? 0;
    const marketValue = parseNumber(row.market_value_usd);
    const resolvedMarketValue = marketValue !== null ? marketValue : quantity * price;
    return {
      ...row,
      quantity,
      current_price_usd: price || null,
      market_value_usd: resolvedMarketValue,
    };
  });
  const totalValue = rows.reduce((sum, row) => sum + (parseNumber(row.market_value_usd) || 0), 0);
  return rows.map((row) => ({
    ...row,
    weight: totalValue > 0 ? (parseNumber(row.market_value_usd) || 0) / totalValue : parseNumber(row.weight),
  }));
}

function deriveHoldingReturn(row) {
  const quantity = parseNumber(row?.quantity);
  const avgCost = parseNumber(row?.avg_cost_usd);
  const marketValue = parseNumber(row?.market_value_usd);
  const costBasis = quantity !== null && avgCost !== null ? quantity * avgCost : null;
  if (costBasis === null || costBasis <= 0 || marketValue === null) return null;
  return (marketValue / costBasis) - 1;
}

function withDerivedHoldingMetrics(holdings) {
  return normalizeHoldingsForOutput(holdings).map((row) => ({
    ...row,
    upside: deriveHoldingReturn(row),
  }));
}

function buildOverlaySectorWeights(holdings) {
  const totals = new Map();
  for (const row of Array.isArray(holdings) ? holdings : []) {
    const sector = row?.sector || "Other";
    const value = parseNumber(row?.market_value_usd);
    if (value === null || value <= 0) continue;
    totals.set(sector, (totals.get(sector) || 0) + value);
  }

  const totalValue = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return [...totals.entries()]
    .map(([sector, value]) => ({
      sector,
      market_value_usd: value,
      portfolio_weight: totalValue > 0 ? value / totalValue : null,
      weight: totalValue > 0 ? value / totalValue : null,
    }))
    .sort((left, right) => (right.market_value_usd || 0) - (left.market_value_usd || 0));
}

function buildOverlayReturnHistogram(holdings) {
  const returns = (Array.isArray(holdings) ? holdings : [])
    .map((row) => deriveHoldingReturn(row))
    .filter((value) => value !== null);

  if (!returns.length) return [];

  const bucketCount = Math.min(Math.max(returns.length, 3), 6);
  const min = Math.min(...returns);
  const max = Math.max(...returns);
  const width = (max - min) / bucketCount || 0.12;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    x0: min + (index * width),
    x1: min + ((index + 1) * width),
    count: 0,
  }));

  for (const value of returns) {
    const rawIndex = Math.floor((value - min) / width);
    const index = Math.max(0, Math.min(bucketCount - 1, Number.isFinite(rawIndex) ? rawIndex : 0));
    buckets[index].count += 1;
  }

  return buckets;
}

function buildOverlayPortfolioAnalytics(snapshot, holdings, sourceLabel) {
  const rows = Array.isArray(holdings) ? holdings : [];
  const totalValueUsd = rows.reduce((sum, row) => sum + (parseNumber(row.market_value_usd) || 0), 0);
  const totalCostUsd = rows.reduce((sum, row) => {
    const quantity = parseNumber(row.quantity);
    const avgCost = parseNumber(row.avg_cost_usd);
    if (quantity === null || avgCost === null) return sum;
    return sum + (quantity * avgCost);
  }, 0);
  const weightedReturns = rows
    .map((row) => {
      const quantity = parseNumber(row.quantity);
      const avgCost = parseNumber(row.avg_cost_usd);
      const marketValue = parseNumber(row.market_value_usd);
      if (quantity === null || avgCost === null || marketValue === null || quantity <= 0 || avgCost <= 0) return null;
      return {
        weight: marketValue,
        returnValue: (marketValue / (quantity * avgCost)) - 1,
      };
    })
    .filter(Boolean);
  const weightedTotal = weightedReturns.reduce((sum, row) => sum + row.weight, 0);
  const weightedMeanReturn = weightedReturns.length
    ? weightedReturns.reduce((sum, row) => sum + (row.returnValue * (weightedTotal > 0 ? row.weight / weightedTotal : 0)), 0)
    : null;
  const weightedVariance = weightedReturns.length > 1 && weightedMeanReturn !== null
    ? weightedReturns.reduce((sum, row) => {
        const normalizedWeight = weightedTotal > 0 ? row.weight / weightedTotal : 0;
        return sum + (((row.returnValue - weightedMeanReturn) ** 2) * normalizedWeight);
      }, 0)
    : null;
  const holdingsVolatility = weightedVariance !== null ? Math.sqrt(Math.max(weightedVariance, 0)) : null;
  const unrealizedReturn = totalCostUsd > 0 ? (totalValueUsd / totalCostUsd) - 1 : weightedMeanReturn;
  const proxySharpe = unrealizedReturn !== null && holdingsVolatility !== null && holdingsVolatility > 0
    ? unrealizedReturn / holdingsVolatility
    : null;
  const topSector = buildOverlaySectorWeights(rows)[0]?.sector || null;
  const existingNotes = Array.isArray(snapshot?.portfolio?.alignment?.notes) ? snapshot.portfolio.alignment.notes : [];
  const notes = [
    `Private holdings are loaded from ${sourceLabel}.`,
    topSector ? `Largest sector in the current book: ${topSector}.` : "Sector mix will appear as holdings metadata fills in.",
    unrealizedReturn === null
      ? "Cost basis is incomplete, so return since purchase cannot be calculated yet."
      : "Return since purchase is calculated from current market value versus stored cost basis.",
    "Portfolio return, volatility, and Sharpe are estimated from the private holdings book until dedicated history is stored.",
  ];

  return {
    analytics: {
      ...((snapshot?.portfolio || {}).analytics || {}),
      "Holdings Count": rows.length,
      "Current Value": totalValueUsd > 0 ? totalValueUsd : null,
      "Cost Basis": totalCostUsd > 0 ? totalCostUsd : null,
      "Unrealized Return": unrealizedReturn,
      "Annual Return": weightedMeanReturn,
      "Annual Volatility": holdingsVolatility,
      "Sharpe Ratio": proxySharpe,
      "Portfolio Volatility Proxy": holdingsVolatility,
      "Analytics Source": "holdings_proxy",
    },
    sector_weights: buildOverlaySectorWeights(rows),
    valuation_histogram: buildOverlayReturnHistogram(rows),
    alignment: {
      ...((snapshot?.portfolio || {}).alignment || {}),
      notes: [...new Set([...notes, ...existingNotes])],
    },
  };
}

function applyInstructionToHoldings(holdings, instruction, price, meta) {
  const normalized = normalizeHoldingsForOutput(holdings);
  const ticker = instruction.ticker;
  const existingIndex = normalized.findIndex((row) => String(row.ticker || "").toUpperCase() === ticker);
  const existing = existingIndex >= 0 ? normalized[existingIndex] : null;
  const hasExplicitSize = instruction.shares !== null || instruction.amountUsd !== null;
  if (!hasExplicitSize) {
    throw new Error(`Include a share count or USD amount for ${ticker}. Try 'buy 2 shares of ${ticker}' or 'buy 100 USD of ${ticker}'.`);
  }
  const signed = instruction.side === "sell" ? -1 : 1;
  if (instruction.side === "sell" && !existing) {
    throw new Error(`Cannot sell ${ticker} because it is not in your current holdings.`);
  }
  const deltaQuantity = instruction.shares !== null
    ? instruction.shares * signed
    : ((instruction.amountUsd || 0) / price) * signed;
  const currentQuantity = parseNumber(existing?.quantity) || 0;
  const nextQuantity = currentQuantity + deltaQuantity;

  if (existing && nextQuantity <= 0) {
    normalized.splice(existingIndex, 1);
  } else if (existing) {
    const nextValue = nextQuantity * price;
    const priorValue = currentQuantity * (parseNumber(existing.avg_cost_usd) || price);
    const tradeValue = Math.abs(deltaQuantity) * price;
    normalized[existingIndex] = {
      ...existing,
      quantity: nextQuantity,
      current_price_usd: price,
      market_value_usd: nextValue,
      avg_cost_usd: instruction.side === "buy" ? (priorValue + tradeValue) / nextQuantity : parseNumber(existing.avg_cost_usd) || price,
      asset_type: existing.asset_type || meta.asset_type,
      sector: existing.sector || meta.sector,
      industry: existing.industry || meta.industry,
    };
  } else {
    if (nextQuantity <= 0) {
      throw new Error(`The trade size for ${ticker} must result in a positive position.`);
    }
    normalized.unshift({
      ticker,
      asset_type: meta.asset_type,
      quantity: nextQuantity,
      currency: "USD",
      avg_cost_usd: price,
      purchase_date: new Date().toISOString().slice(0, 10),
      current_price_usd: price,
      market_value_usd: nextQuantity * price,
      weight: null,
      source_sheet: "UI_Overlay",
      sector: meta.sector,
      industry: meta.industry,
    });
  }

  return normalizeHoldingsForOutput(rebuildWeights(normalized));
}

function applyExplicitEditToHoldings(holdings, input, price, meta) {
  const normalized = normalizeHoldingsForOutput(holdings);
  const ticker = String(input.ticker || input.symbol || "").toUpperCase();
  const existingIndex = normalized.findIndex((row) => String(row.ticker || "").toUpperCase() === ticker);
  const existing = existingIndex >= 0 ? normalized[existingIndex] : null;
  const explicitQuantity = parseNumber(input.quantity ?? input.target_quantity ?? input.targetQuantity);
  const explicitValue = parseNumber(
    input.target_value_usd ??
      input.targetValueUsd ??
      input.market_value_usd ??
      input.marketValueUsd ??
      input.value_usd ??
      input.valueUsd,
  );
  const targetQuantity = explicitQuantity !== null
    ? explicitQuantity
    : explicitValue !== null
      ? explicitValue / price
      : null;

  if (targetQuantity === null) {
    throw new Error("Please provide a target quantity or target value for the holding.");
  }

  if (targetQuantity <= 0) {
    if (existingIndex >= 0) {
      normalized.splice(existingIndex, 1);
      return normalizeHoldingsForOutput(rebuildWeights(normalized));
    }
    return normalizeHoldingsForOutput(normalized);
  }

  const editPurchaseDate = parsePurchaseDate(input.purchase_date ?? input.purchaseDate);
  const editAvgCost = parseNumber(input.avg_cost_usd ?? input.avgCostUsd);
  const nextMarketValue = targetQuantity * price;
  if (existingIndex >= 0) {
    normalized[existingIndex] = {
      ...existing,
      quantity: targetQuantity,
      current_price_usd: price,
      market_value_usd: nextMarketValue,
      avg_cost_usd: editAvgCost || parseNumber(existing.avg_cost_usd) || price,
      purchase_date: editPurchaseDate || parsePurchaseDate(existing.purchase_date) || null,
      asset_type: existing.asset_type || meta.asset_type,
      sector: existing.sector || meta.sector,
      industry: existing.industry || meta.industry,
      source_sheet: existing.source_sheet || "UI_Overlay",
    };
  } else {
    normalized.unshift({
      ticker,
      asset_type: meta.asset_type,
      quantity: targetQuantity,
      currency: "USD",
      avg_cost_usd: editAvgCost || price,
      purchase_date: editPurchaseDate || new Date().toISOString().slice(0, 10),
      current_price_usd: price,
      market_value_usd: nextMarketValue,
      weight: null,
      source_sheet: "UI_Overlay",
      sector: meta.sector,
      industry: meta.industry,
    });
  }

  return normalizeHoldingsForOutput(rebuildWeights(normalized));
}

export async function applyLocalPortfolioOverlay(snapshot, workspaceId = "default") {
  const state = await loadHoldingsState(workspaceId);
  const csvPath = resolveLocalHoldingsPath();
  let holdings = null;
  let source = "shared_snapshot";
  let sourceLabel = "Shared snapshot";

  if (state?.holdings?.length) {
    holdings = withDerivedHoldingMetrics(state.holdings);
    source = state.source || "ui_editable_overlay";
    sourceLabel = state.source_label || (source === "remote_overlay" ? "Remote holdings overlay" : "Edited in UI");
  } else if (allowLegacyHoldingsFallback() && csvPath) {
    try {
      const csvHoldings = await loadHoldingsCsv(csvPath);
      if (csvHoldings.length) {
        holdings = withDerivedHoldingMetrics(csvHoldings);
        source = "local_overlay";
        sourceLabel = "Private holdings file";
      }
    } catch {
      holdings = null;
    }
  }

  if (!holdings || !holdings.length) return snapshot;

  const liveQuotes = await fetchFmpQuotes(holdings.map((h) => h.ticker).filter(Boolean));
  const pricedHoldings = normalizeHoldingsForOutput(rebuildWeights(
    holdings.map((holding) => {
      const freshPrice = liveQuotes[String(holding.ticker || "").toUpperCase()];
      if (!freshPrice) return holding;
      const qty = parseNumber(holding.quantity) ?? 0;
      return {
        ...holding,
        current_price_usd: freshPrice,
        market_value_usd: qty > 0 ? qty * freshPrice : holding.market_value_usd,
      };
    }),
  ));

  let historyRows = [];
  if (usingNeonStorage()) {
    try {
      historyRows = await appendNeonPortfolioHistorySnapshot(workspaceId, snapshot, pricedHoldings, sourceLabel);
    } catch {
      historyRows = [];
    }
  }
  const overlayPortfolio = buildOverlayPortfolioAnalytics(snapshot, pricedHoldings, sourceLabel);
  let growthComparison = historyRows.length ? buildHistorySeries(historyRows) : [];
  const performanceMetrics = historyRows.length ? buildHistoryPerformanceMetrics(historyRows) : null;
  if (performanceMetrics) {
    overlayPortfolio.analytics["Time Weighted Return"] = performanceMetrics.totalTwr;
    overlayPortfolio.analytics["Money Weighted Return"] = performanceMetrics.moneyWeightedReturn;
    overlayPortfolio.analytics["Performance Method"] = performanceMetrics.performanceMethod;
    overlayPortfolio.analytics["External Flow Count"] = performanceMetrics.externalFlowCount;
  }

  // Snapshot-free performance: reconstruct the historical trajectory directly
  // from holdings (purchase date + cost basis) and real historical closes.
  let performanceReport = null;
  try {
    const inputAssessment = assessPerformanceInputs(pricedHoldings);
    let reconstruction = null;
    if (inputAssessment.readyForReconstruction) {
      const benchmarkSymbol = "SPY";
      const datedHoldings = pricedHoldings.filter((row) => parsePurchaseDate(row.purchase_date));
      const earliestPurchase = datedHoldings
        .map((row) => parsePurchaseDate(row.purchase_date))
        .sort()[0];
      const tickers = [...new Set(datedHoldings.map((row) => String(row.ticker || "").toUpperCase()))];
      const priceHistory = await fetchDailyCloseHistory([...tickers, benchmarkSymbol], { fromDate: earliestPurchase });
      const benchmarkHistory = priceHistory[benchmarkSymbol] || null;
      reconstruction = reconstructPortfolioSeries({
        holdings: datedHoldings,
        priceHistory,
        benchmarkHistory,
        benchmarkSymbol,
      });
    }
    performanceReport = buildPerformanceReport({
      holdings: pricedHoldings,
      reconstruction,
      snapshotHistoryRows: historyRows,
      twrMetrics: performanceMetrics,
    });

    // When stored snapshots cannot support a trustworthy chart yet but the
    // reconstruction can, use the reconstructed trajectory for the chart.
    const snapshotSessions = growthComparison.filter((row) => parseNumber(row.portfolio_growth) !== null).length;
    if (performanceReport?.reconstructed && reconstruction?.status === "ok" && snapshotSessions < 20) {
      growthComparison = reconstruction.series.map((row) => ({
        date: row.date,
        portfolio_growth: row.portfolio_growth,
        value_growth: row.portfolio_growth,
        spy_growth: row.spy_growth,
        external_flow_usd: 0,
        period_return: null,
        performance_method: "reconstructed_holdings_history",
      }));
      overlayPortfolio.analytics["Performance Method"] = "reconstructed_holdings_history";
    }
  } catch {
    performanceReport = null;
  }

  return {
    ...snapshot,
    portfolio: {
      ...(snapshot?.portfolio || {}),
      ...overlayPortfolio,
      current_mix_vs_spy: growthComparison.length ? growthComparison : (snapshot?.portfolio?.current_mix_vs_spy || []),
      performance_report: performanceReport,
      holdings_source: source,
      holdings_source_label: sourceLabel,
      holdings_source_available: true,
      holdings_sync_status: state?.sync_status || (source === "remote_overlay" ? "remote_synced" : "local_only"),
      holdings_sync_label: state?.sync_label || (source === "remote_overlay" ? "Remote + local saved" : "Saved locally"),
      holdings: pricedHoldings,
      top_holdings: pricedHoldings.slice(0, 12).map((row) => ({
        ticker: row.ticker,
        sector: row.sector,
        industry: row.industry,
        weight: row.weight,
        market_value_usd: row.market_value_usd,
        current_price_usd: row.current_price_usd,
        upside: row.upside,
        composite_score: null,
        momentum_6m: null,
        thesis_bucket: null,
      })),
    },
  };
}

export async function updateHoldingsFromInstruction(snapshot, workspaceId, input) {
  const cashEvent = normalizeCashEvent(input);
  if (cashEvent) {
    const state = await loadHoldingsState(workspaceId);
    const holdings = normalizeHoldingsForOutput(state?.holdings || []);
    const nextState = {
      available: true,
      source: state?.source || (remoteHoldingsStateEnabled() ? "remote_overlay" : "ui_editable_overlay"),
      source_label: state?.source_label || (remoteHoldingsStateEnabled() ? "Remote holdings overlay" : "Edited in UI"),
      updated_at: new Date().toISOString(),
      workspace_id: workspaceId,
      instruction: `${cashEvent.event_type} cash ${Math.abs(cashEvent.amount_usd).toFixed(2)} USD`,
      cashEvent,
      holdings,
    };
    const syncResult = await saveHoldingsState(workspaceId, nextState);
    return {
      ...nextState,
      sync_status: syncResult.remotePutUrl === "neon"
        ? "neon_synced"
        : syncResult.remotePutUrl ? (syncResult.remoteSynced ? "remote_synced" : "remote_sync_failed") : "local_only",
      sync_label: syncResult.remotePutUrl === "neon"
        ? "Saved to Neon"
        : syncResult.remotePutUrl ? (syncResult.remoteSynced ? "Remote + local saved" : "Saved locally, remote sync failed") : "Saved locally",
    };
  }

  if (isExplicitHoldingsEdit(input)) {
    const ticker = String(input.ticker || input.symbol || "").toUpperCase();
    const currentPrice = parseNumber(input?.price) ?? parseNumber(input?.currentPrice) ?? getCurrentPriceForTicker(snapshot, ticker);
    if (currentPrice === null) {
      throw new Error(`No current price found for ${ticker}. Add an explicit price or choose a ticker already present in the live quote set.`);
    }
    const state = await loadHoldingsState(workspaceId);
    let baselineHoldings = state?.holdings?.length ? state.holdings : null;
    if (!baselineHoldings) {
      if (allowLegacyHoldingsFallback()) {
        const csvPath = resolveLocalHoldingsPath();
        if (csvPath) {
          try {
            baselineHoldings = await loadHoldingsCsv(csvPath);
          } catch {
            baselineHoldings = [];
          }
        } else {
          baselineHoldings = [];
        }
      } else {
        baselineHoldings = [];
      }
    }

    const meta = getTickerMeta(snapshot, ticker);
    const nextHoldings = applyExplicitEditToHoldings(baselineHoldings, input, currentPrice, meta);
    const totalValue = nextHoldings.reduce((sum, row) => sum + (parseNumber(row.market_value_usd) || 0), 0);
    const targetQuantity = parseNumber(input.quantity ?? input.target_quantity ?? input.targetQuantity);
    const targetValue = parseNumber(
      input.target_value_usd ??
        input.targetValueUsd ??
        input.market_value_usd ??
        input.marketValueUsd ??
        input.value_usd ??
        input.valueUsd,
    );
    const resolvedQuantity = targetQuantity !== null ? targetQuantity : targetValue !== null ? targetValue / currentPrice : 0;
    const nextState = {
      available: true,
      source: remoteHoldingsStateEnabled() ? "remote_overlay" : "ui_editable_overlay",
      source_label: remoteHoldingsStateEnabled() ? "Remote holdings overlay" : "Edited in UI",
      updated_at: new Date().toISOString(),
      workspace_id: workspaceId,
      instruction: typeof input === "string" ? input : `Set ${ticker} holdings`,
      edit: {
        type: "explicit",
        ticker,
        target_quantity: resolvedQuantity,
        target_value_usd: resolvedQuantity * currentPrice,
        price_usd: currentPrice,
        parsed: {
          ticker,
          quantity: targetQuantity,
          target_value_usd: targetValue,
        },
        meta,
      },
      holdings: nextHoldings.map((row) => ({
        ...row,
        market_value_usd: parseNumber(row.market_value_usd) || 0,
        weight: totalValue > 0 ? (parseNumber(row.market_value_usd) || 0) / totalValue : parseNumber(row.weight),
      })),
    };

    const syncResult = await saveHoldingsState(workspaceId, nextState);
    return {
      ...nextState,
      sync_status: syncResult.remotePutUrl === "neon"
        ? "neon_synced"
        : syncResult.remotePutUrl ? (syncResult.remoteSynced ? "remote_synced" : "remote_sync_failed") : "local_only",
      sync_label: syncResult.remotePutUrl === "neon"
        ? "Saved to Neon"
        : syncResult.remotePutUrl ? (syncResult.remoteSynced ? "Remote + local saved" : "Saved locally, remote sync failed") : "Saved locally",
    };
  }

  const instruction = parseTradeInstruction(input?.instruction || input?.text || input);
  if (!instruction) {
    throw new Error("Could not parse a buy/sell instruction. Try: 'I bought 100 USD of NVDA stock' or 'sold 2 shares of AAPL'.");
  }

  const currentPrice = parseNumber(input?.price) ?? parseNumber(input?.currentPrice) ?? parseNumber(input?.explicitPrice) ?? instruction.explicitPrice ?? getCurrentPriceForTicker(snapshot, instruction.ticker);
  if (currentPrice === null) {
    throw new Error(`No current price found for ${instruction.ticker}. Add an explicit price like 'at 125.50' or choose a ticker already present in the live quote set.`);
  }

  const state = await loadHoldingsState(workspaceId);
  let baselineHoldings = state?.holdings?.length ? state.holdings : null;
  if (!baselineHoldings) {
    if (allowLegacyHoldingsFallback()) {
      const csvPath = resolveLocalHoldingsPath();
      if (csvPath) {
        try {
          baselineHoldings = await loadHoldingsCsv(csvPath);
        } catch {
          baselineHoldings = [];
        }
      } else {
        baselineHoldings = [];
      }
    } else {
      baselineHoldings = [];
    }
  }

  const meta = getTickerMeta(snapshot, instruction.ticker);
  const nextHoldings = applyInstructionToHoldings(baselineHoldings, instruction, currentPrice, meta);
  const totalValue = nextHoldings.reduce((sum, row) => sum + (parseNumber(row.market_value_usd) || 0), 0);
  const quantityDelta = instruction.shares !== null ? instruction.shares : (instruction.amountUsd || 0) / currentPrice;
  const signedQuantityDelta = instruction.side === "sell" ? -quantityDelta : quantityDelta;
  const nextState = {
    available: true,
    source: remoteHoldingsStateEnabled() ? "remote_overlay" : "ui_editable_overlay",
    source_label: remoteHoldingsStateEnabled() ? "Remote holdings overlay" : "Edited in UI",
    updated_at: new Date().toISOString(),
    workspace_id: workspaceId,
    instruction: instruction.text,
    trade: {
      ticker: instruction.ticker,
      side: instruction.side,
      quantity_delta: signedQuantityDelta,
      trade_value_usd: Math.abs(quantityDelta * currentPrice),
      price_usd: currentPrice,
      parsed: instruction,
      meta,
    },
    holdings: nextHoldings.map((row) => ({
      ...row,
      market_value_usd: parseNumber(row.market_value_usd) || 0,
      weight: totalValue > 0 ? (parseNumber(row.market_value_usd) || 0) / totalValue : parseNumber(row.weight),
    })),
  };

  const syncResult = await saveHoldingsState(workspaceId, nextState);
  return {
    ...nextState,
    sync_status: syncResult.remotePutUrl === "neon"
      ? "neon_synced"
      : syncResult.remotePutUrl ? (syncResult.remoteSynced ? "remote_synced" : "remote_sync_failed") : "local_only",
    sync_label: syncResult.remotePutUrl === "neon"
      ? "Saved to Neon"
      : syncResult.remotePutUrl ? (syncResult.remoteSynced ? "Remote + local saved" : "Saved locally, remote sync failed") : "Saved locally",
  };
}
