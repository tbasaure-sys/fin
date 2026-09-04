import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { mergeG820DailyPriceOverlay, selectG820DailyPriceOverlay } from "@/lib/g820/daily-price-overlay";
import { fetchG820DailyPriceOverlay } from '@/lib/g820/daily-refresh';
import { getRuntimeDocumentPayload, upsertRuntimeDocument } from "@/lib/server/data/runtime-documents";

export const G820_DAILY_PRICE_DOCUMENT_KEY = "g820:daily-price:v1";

const INDEX_PATH = path.join(process.cwd(), "public", "data", "g820", "current.json");

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
  let bundled = null;
  try {
    bundled = JSON.parse(await readFile(path.join(path.dirname(INDEX_PATH), 'daily-price.json'), 'utf8'));
  } catch {
    // A bundled daily cut is optional; it is not evidence of a successful scheduled run.
  }
  const selected = selectG820DailyPriceOverlay(index, [overlay, bundled]);
  return mergeG820DailyPriceOverlay(index, selected ? {
    ...selected, storageSource: selected === overlay ? 'runtime' : 'bundled_cut',
  } : overlay || bundled);
}

async function loadG820Runtime(index) {
  const runtimePath = path.join(process.cwd(), 'public/data/g820/snapshots', index.meta.snapshotId, 'runtime.json');
  const runtime = JSON.parse(await readFile(runtimePath, 'utf8'));
  if (runtime.snapshotId !== index.meta.snapshotId || runtime.config.engineVersion !== index.meta.engineVersion) throw new Error('G820 runtime identity mismatch');
  return runtime;
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
  const concurrency = Math.max(1, Math.min(20, Number(process.env.G820_REFRESH_CONCURRENCY) || 10));
  const overlay = await fetchG820DailyPriceOverlay({ index, runtime, apiKey, fetchImpl, concurrency, minimumCoverage });
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
