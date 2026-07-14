const DEFAULT_STALE_AFTER_DAYS = 14;

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 16);
}

export function assessPortfolioFreshness(updatedAt, { now = new Date(), staleAfterDays = DEFAULT_STALE_AFTER_DAYS } = {}) {
  const timestamp = Date.parse(String(updatedAt || ""));
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now || ""));
  if (!Number.isFinite(timestamp) || !Number.isFinite(nowMs)) {
    return {
      status: "unconfirmed",
      canAnalyze: false,
      ageDays: null,
      updatedAt: null,
      staleAfterDays,
    };
  }

  const ageDays = Math.max(0, (nowMs - timestamp) / 86_400_000);
  const status = ageDays > staleAfterDays ? "stale" : "current";
  return {
    status,
    canAnalyze: status === "current",
    ageDays: Number(ageDays.toFixed(1)),
    updatedAt: new Date(timestamp).toISOString(),
    staleAfterDays,
  };
}

export function normalizePortfolioDraft(input) {
  const aggregated = new Map();

  for (const raw of Array.isArray(input) ? input : []) {
    const ticker = cleanTicker(raw?.ticker);
    const quantity = finiteNumber(raw?.quantity ?? raw?.shares);
    const price = finiteNumber(raw?.currentPriceUsd ?? raw?.current_price_usd ?? raw?.price);
    const marketValue = finiteNumber(raw?.marketValueUsd ?? raw?.market_value_usd);
    const avgCostUsd = finiteNumber(raw?.avgCostUsd ?? raw?.avg_cost_usd);
    if (!ticker || quantity === null || quantity <= 0) continue;

    const value = price !== null && price > 0
      ? quantity * price
      : marketValue !== null && marketValue > 0
        ? marketValue
        : 0;
    const current = aggregated.get(ticker) || {
      ticker,
      quantity: 0,
      marketValueUsd: 0,
      avgCostNumerator: 0,
      avgCostQuantity: 0,
      currentPriceUsd: price,
      sector: raw?.sector || "Unknown",
      assetType: raw?.assetType || raw?.asset_type || "equity",
    };
    current.quantity += quantity;
    current.marketValueUsd += value;
    if (avgCostUsd !== null && avgCostUsd >= 0) {
      current.avgCostNumerator += avgCostUsd * quantity;
      current.avgCostQuantity += quantity;
    }
    if (current.currentPriceUsd === null && price !== null) current.currentPriceUsd = price;
    if ((!current.sector || current.sector === "Unknown") && raw?.sector) current.sector = raw.sector;
    aggregated.set(ticker, current);
  }

  const rows = [...aggregated.values()];
  const totalValue = rows.reduce((sum, row) => sum + row.marketValueUsd, 0);
  return rows
    .map((row) => ({
      ticker: row.ticker,
      quantity: Number(row.quantity.toFixed(8)),
      currentPriceUsd: row.currentPriceUsd,
      marketValueUsd: Number(row.marketValueUsd.toFixed(2)),
      avgCostUsd: row.avgCostQuantity > 0
        ? Number((row.avgCostNumerator / row.avgCostQuantity).toFixed(4))
        : null,
      sector: row.sector || "Unknown",
      assetType: row.assetType || "equity",
      weight: totalValue > 0 ? Number((row.marketValueUsd / totalValue).toFixed(8)) : 0,
    }))
    .sort((left, right) => right.marketValueUsd - left.marketValueUsd || left.ticker.localeCompare(right.ticker));
}

export function summarizePortfolioWeights(holdings) {
  const rows = normalizePortfolioDraft(holdings);
  const cashLike = new Set(["SGOV", "BIL", "SHV", "SHY", "JPST", "VGSH", "CASH"]);
  const cashWeight = rows.reduce((sum, row) =>
    sum + (cashLike.has(row.ticker) || String(row.assetType).toLowerCase() === "cash" ? row.weight : 0), 0);
  const largest = rows[0] || null;
  const hhi = rows.reduce((sum, row) => sum + row.weight ** 2, 0);
  return {
    holdingsCount: rows.length,
    totalValueUsd: rows.reduce((sum, row) => sum + row.marketValueUsd, 0),
    cashWeight,
    largestHolding: largest,
    sizeOnlyBreadth: hhi > 0 ? 1 / hhi : 0,
  };
}
