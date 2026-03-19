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

function resolveLocalHoldingsPath() {
  if (process.env.BLS_PRIME_LOCAL_HOLDINGS_CSV) {
    return process.env.BLS_PRIME_LOCAL_HOLDINGS_CSV;
  }
  const portfolioRoot = process.env.META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT;
  if (!portfolioRoot) return null;
  return path.join(portfolioRoot, "output", "latest", "holdings_normalized.csv");
}

export async function applyLocalPortfolioOverlay(snapshot) {
  const csvPath = resolveLocalHoldingsPath();
  if (!csvPath) return snapshot;

  try {
    const holdings = await loadHoldingsCsv(csvPath);
    if (!holdings.length) return snapshot;

    const nextSnapshot = {
      ...snapshot,
      portfolio: {
        ...(snapshot?.portfolio || {}),
        holdings_source: "local_overlay",
        holdings_source_label: "Private holdings file",
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

    return nextSnapshot;
  } catch {
    return snapshot;
  }
}
