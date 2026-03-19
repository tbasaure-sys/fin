import fs from "fs/promises";
import path from "path";

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
  if (!portfolioRoot) return null;
  return path.join(portfolioRoot, "output", "latest", "holdings_normalized.csv");
}

async function loadHoldingsState(workspaceId) {
  const statePath = resolveHoldingsStatePath(workspaceId);
  try {
    const text = await fs.readFile(statePath, "utf8");
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== "object") return null;
    const holdings = Array.isArray(payload.holdings) ? payload.holdings.filter((row) => row && row.ticker) : [];
    if (!holdings.length) return null;
    return {
      ...payload,
      holdings,
      source: payload.source || "ui_editable_overlay",
      source_label: payload.source_label || "Edited in UI",
      state_path: statePath,
    };
  } catch {
    return null;
  }
}

async function saveHoldingsState(workspaceId, payload) {
  const statePath = resolveHoldingsStatePath(workspaceId);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(payload, null, 2), "utf8");
  return statePath;
}

function normalizeHoldingsForOutput(holdings) {
  return [...holdings]
    .map((row) => ({
      ticker: row.ticker || null,
      asset_type: row.asset_type || "equity",
      quantity: parseNumber(row.quantity),
      currency: row.currency || "USD",
      avg_cost_usd: parseNumber(row.avg_cost_usd),
      current_price_usd: parseNumber(row.current_price_usd),
      market_value_usd: parseNumber(row.market_value_usd),
      weight: parseNumber(row.weight),
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
  const explicitTickerMatch = raw.match(/\b(?:of|in|for|into|to|buy|bought|sell|sold|trim|reduce|close)\s+([A-Za-z]{1,6}(?:\.[A-Za-z]{1,2})?)\b/i);
  const tickerCandidates = [...raw.matchAll(/\b([A-Za-z]{1,6}(?:\.[A-Za-z]{1,2})?)\b/g)]
    .map((match) => match[1].toUpperCase())
    .filter((token) => !["I", "A", "AN", "THE", "OF", "IN", "FOR", "TO", "USD", "BUY", "BOUGHT", "BUYING", "SELL", "SOLD", "SELLING", "TRIM", "REDUCE", "CLOSE", "SHARES", "SHARE", "STOCK"].includes(token));
  const ticker = (explicitTickerMatch?.[1] || tickerCandidates.at(-1) || null)?.toUpperCase() || null;
  const amountMatch = raw.match(/(?:\$|usd\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:usd|dollars?|bucks)?/i);
  const shareMatch = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:shares?|sh)\b/i);
  const explicitPriceMatch = raw.match(/(?:at|@|around)\s*\$?([0-9]+(?:\.[0-9]+)?)/i);

  let side = null;
  if (/(?:\bbuy\b|\bbought\b|\bbuying\b|\badd\b|\bpurchased\b)/i.test(lowered)) side = "buy";
  if (/(?:\bsell\b|\bsold\b|\bselling\b|\btrim\b|\breduce\b|\bcut\b|\bclose\b)/i.test(lowered)) side = "sell";
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

function applyInstructionToHoldings(holdings, instruction, price, meta) {
  const normalized = normalizeHoldingsForOutput(holdings);
  const ticker = instruction.ticker;
  const existingIndex = normalized.findIndex((row) => String(row.ticker || "").toUpperCase() === ticker);
  const existing = existingIndex >= 0 ? normalized[existingIndex] : null;
  const signed = instruction.side === "sell" ? -1 : 1;
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
    normalized.unshift({
      ticker,
      asset_type: meta.asset_type,
      quantity: nextQuantity,
      currency: "USD",
      avg_cost_usd: price,
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

export async function applyLocalPortfolioOverlay(snapshot, workspaceId = "default") {
  const state = await loadHoldingsState(workspaceId);
  const csvPath = resolveLocalHoldingsPath();
  let holdings = null;
  let source = "shared_snapshot";
  let sourceLabel = "Shared snapshot";

  if (state?.holdings?.length) {
    holdings = normalizeHoldingsForOutput(state.holdings);
    source = state.source || "ui_editable_overlay";
    sourceLabel = state.source_label || "Edited in UI";
  } else if (csvPath) {
    try {
      const csvHoldings = await loadHoldingsCsv(csvPath);
      if (csvHoldings.length) {
        holdings = csvHoldings;
        source = "local_overlay";
        sourceLabel = "Private holdings file";
      }
    } catch {
      holdings = null;
    }
  }

  if (!holdings || !holdings.length) return snapshot;

  return {
    ...snapshot,
    portfolio: {
      ...(snapshot?.portfolio || {}),
      holdings_source: source,
      holdings_source_label: sourceLabel,
      holdings_source_available: true,
      holdings,
      top_holdings: holdings.slice(0, 12).map((row) => ({
        ticker: row.ticker,
        sector: row.sector,
        industry: row.industry,
        weight: row.weight,
        market_value_usd: row.market_value_usd,
        current_price_usd: row.current_price_usd,
        upside: null,
        composite_score: null,
        momentum_6m: null,
        thesis_bucket: null,
      })),
      analytics: {
        ...((snapshot?.portfolio || {}).analytics || {}),
        "Holdings Count": holdings.length,
      },
    },
  };
}

export async function updateHoldingsFromInstruction(snapshot, workspaceId, input) {
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
  }

  const meta = getTickerMeta(snapshot, instruction.ticker);
  const nextHoldings = applyInstructionToHoldings(baselineHoldings, instruction, currentPrice, meta);
  const totalValue = nextHoldings.reduce((sum, row) => sum + (parseNumber(row.market_value_usd) || 0), 0);
  const quantityDelta = instruction.shares !== null ? instruction.shares : (instruction.amountUsd || 0) / currentPrice;
  const signedQuantityDelta = instruction.side === "sell" ? -quantityDelta : quantityDelta;
  const nextState = {
    available: true,
    source: "ui_editable_overlay",
    source_label: "Edited in UI",
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

  await saveHoldingsState(workspaceId, nextState);
  return nextState;
}
