import "server-only";
import { readOwnedPortfolio } from "./thesis-financials.js";
import { usingNeonStorage } from "./data/neon.js";

const unavailable = (status = "unavailable") => ({
  currency: "USD", status, asOf: null, totalKnownUsd: null,
  pricedCount: 0, holdings: [],
});

function nonnegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function summarizeOwnedHoldings(rows) {
  const holdings = (Array.isArray(rows) ? rows : []).map((row) => {
    const quantity = nonnegative(row.quantity);
    const savedPriceUsd = nonnegative(row.current_price_usd);
    const recordedValueUsd = nonnegative(row.market_value_usd)
      ?? (quantity !== null && savedPriceUsd !== null ? quantity * savedPriceUsd : null);
    return {
      ticker: String(row.ticker || "").toUpperCase(),
      assetType: row.asset_type || "equity",
      quantity,
      savedPriceUsd,
      recordedValueUsd,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  }).filter((row) => /^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(row.ticker));
  const priced = holdings.filter((row) => row.recordedValueUsd !== null);
  const totalKnownUsd = priced.reduce((sum, row) => sum + row.recordedValueUsd, 0);
  const asOf = holdings.map((row) => row.updatedAt).filter(Boolean).sort().at(-1) || null;
  return {
    currency: "USD", status: "available", asOf,
    totalKnownUsd: priced.length ? totalKnownUsd : null,
    pricedCount: priced.length,
    holdings: holdings.map((row) => ({
      ...row,
      weightOfKnown: row.recordedValueUsd !== null && totalKnownUsd > 0
        ? row.recordedValueUsd / totalKnownUsd : null,
    })).sort((a, b) => (b.recordedValueUsd ?? -1) - (a.recordedValueUsd ?? -1) || a.ticker.localeCompare(b.ticker)),
  };
}

export async function getCarterasDashboard(session, { readPortfolio = readOwnedPortfolio, neonAvailable = usingNeonStorage } = {}) {
  if (!session?.user?.id || !session?.workspace?.id) return unavailable();
  if (!neonAvailable()) return unavailable();
  try {
    const result = await readPortfolio(session.user.id, session.workspace.id);
    if (result?.status !== "available") return unavailable();
    return summarizeOwnedHoldings(result.holdings);
  } catch {
    return unavailable();
  }
}
