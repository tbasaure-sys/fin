import fs from "fs/promises";
import path from "path";

import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { getServerConfig } from "../lib/server/config.js";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

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
        asset_type: row.asset_type || "equity",
        quantity: parseNumber(row.quantity),
        currency: row.currency || "USD",
        avg_cost_usd: parseNumber(row.avg_cost_usd),
        current_price_usd: parseNumber(row.current_price_usd),
        market_value_usd: parseNumber(row.market_value_usd),
        weight: parseNumber(row.weight),
        source_sheet: row.source_sheet || "Imported_CSV",
        sector: row.sector || "Unknown",
        industry: row.industry || "Unknown",
      };
    })
    .filter((row) => row.ticker)
    .sort((left, right) => (right.market_value_usd || right.weight || 0) - (left.market_value_usd || left.weight || 0));
}

async function resolveCsvPath(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.BLS_PRIME_LOCAL_HOLDINGS_CSV,
    path.resolve(process.cwd(), "..", "portfolio_manager", "output", "latest", "holdings_normalized.csv"),
    path.resolve(process.cwd(), "_local_data", "finance", "portfolio_manager", "output", "latest", "holdings_normalized.csv"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  throw new Error("No holdings CSV could be found. Pass a path or set BLS_PRIME_LOCAL_HOLDINGS_CSV.");
}

async function main() {
  const [, , workspaceId, explicitCsvPath] = process.argv;
  if (!workspaceId) {
    throw new Error("Usage: npm run db:holdings:bootstrap -- <workspaceId> [csvPath]");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const csvPath = await resolveCsvPath(explicitCsvPath);
  const holdings = await loadHoldingsCsv(csvPath);
  if (!holdings.length) {
    throw new Error(`No holdings found in ${csvPath}.`);
  }

  const sql = neon(process.env.DATABASE_URL);
  const { defaultWorkspaceName } = getServerConfig();
  await sql.query(
    `INSERT INTO bls_workspaces (id, name, slug, visibility)
     VALUES ($1, $2, $3, 'private')
     ON CONFLICT (id) DO NOTHING`,
    [workspaceId, defaultWorkspaceName, workspaceId],
  );

  await sql.query(`DELETE FROM bls_portfolio_positions WHERE workspace_id = $1`, [workspaceId]);

  for (const row of holdings) {
    await sql.query(
      `INSERT INTO bls_portfolio_positions (
        workspace_id,
        ticker,
        asset_type,
        quantity,
        avg_cost_usd,
        currency,
        sector,
        industry,
        source_sheet,
        current_price_usd,
        market_value_usd,
        weight
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        workspaceId,
        row.ticker,
        row.asset_type,
        row.quantity,
        row.avg_cost_usd,
        row.currency,
        row.sector,
        row.industry,
        row.source_sheet,
        row.current_price_usd,
        row.market_value_usd,
        row.weight,
      ],
    );
  }

  console.log(JSON.stringify({
    workspaceId,
    csvPath,
    imported: holdings.length,
    topTickers: holdings.slice(0, 5).map((row) => row.ticker),
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
