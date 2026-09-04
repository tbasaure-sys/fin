import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildG820DailyPriceOverlay,
  mergeG820DailyPriceOverlay,
  normalizeFmpQuote,
  selectG820DailyUniverse,
} from "@/lib/g820/daily-price-overlay";
import { getRuntimeDocumentPayload, upsertRuntimeDocument } from "@/lib/server/data/runtime-documents";

export const G820_DAILY_PRICE_DOCUMENT_KEY = "g820:daily-price:v1";

const INDEX_PATH = path.join(process.cwd(), "public", "data", "g820", "current.json");

async function mapConcurrent(items, concurrency, operation) {
  const results = Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, worker));
  return results;
}

export async function loadStaticG820Index() {
  const payload = JSON.parse(await readFile(INDEX_PATH, "utf8"));
  if (payload?.meta?.schemaVersion !== "g820-index-v1" || !Array.isArray(payload?.companies)) {
    throw new Error("Bundled G820 index is invalid.");
  }
  return payload;
}

export async function loadPublicG820Index() {
  const index = await loadStaticG820Index();
  let overlay = null;
  try {
    overlay = await getRuntimeDocumentPayload(G820_DAILY_PRICE_DOCUMENT_KEY);
  } catch {
    // The immutable bundled snapshot remains a valid fallback when runtime storage is unavailable.
  }
  return mergeG820DailyPriceOverlay(index, overlay);
}

async function loadG820Runtime(index) {
  const runtimePath = path.join(process.cwd(), 'public/data/g820/snapshots', index.meta.snapshotId, 'runtime.json');
  const runtime = JSON.parse(await readFile(runtimePath, 'utf8'));
  if (runtime.snapshotId !== index.meta.snapshotId || runtime.config.engineVersion !== index.meta.engineVersion) throw new Error('G820 runtime identity mismatch');
  return runtime;
}

async function fetchFmpQuote(ticker, apiKey, fetchImpl) {
  const url = new URL("https://financialmodelingprep.com/stable/quote");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("apikey", apiKey);
  const response = await fetchImpl(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  return normalizeFmpQuote(await response.json(), ticker, new Date().toISOString().slice(0, 10));
}

export async function refreshG820DailyPriceOverlay({
  fetchImpl = fetch,
  loadIndex = loadStaticG820Index,
  loadRuntime = loadG820Runtime,
  persist = upsertRuntimeDocument,
  minimumCoverage = 0.8,
} = {}) {
  const apiKey = String(process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY || "").trim();
  if (!apiKey) throw new Error("FMP_API_KEY is required for the G820 daily refresh.");

  const index = await loadIndex();
  const runtime = await loadRuntime(index);
  const frontier = selectG820DailyUniverse(index);
  const concurrency = Math.max(1, Math.min(20, Number(process.env.G820_REFRESH_CONCURRENCY) || 10));
  const quotes = await mapConcurrent(frontier, concurrency, async (company) => {
    try {
      return await fetchFmpQuote(company.ticker, apiKey, fetchImpl);
    } catch {
      return null;
    }
  });
  const overlay = buildG820DailyPriceOverlay(index, quotes, new Date().toISOString(), runtime);
  if (overlay.coverage.ratio < minimumCoverage) {
    throw new Error(`G820 refresh coverage ${overlay.coverage.succeeded}/${overlay.coverage.requested} is below the publish gate.`);
  }
  const stored = await persist(G820_DAILY_PRICE_DOCUMENT_KEY, overlay, {
    metadata: {
      provider: "Financial Modeling Prep stable/quote",
      baseSnapshotId: overlay.baseSnapshotId,
      marketAsOf: overlay.marketAsOf,
      coverage: overlay.coverage,
    },
  });
  if (!stored) throw new Error("G820 refresh could not persist its runtime document.");
  return overlay;
}
