import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { mosaicObservatorySnapshot as fallbackSnapshot } from "../mosaic-observatory-snapshot.js";

const DEFAULT_RELATIVE_SOURCE = path.resolve(
  process.cwd(),
  "..",
  "02_Finance",
  "Fin_model",
  "validation_output",
  "mosaic_observatory",
  "mosaic_embed.json",
);

const MARKET_NAMES = {
  "grid transformers": "Equipos clave de red eléctrica",
  "container shipping": "Fletes contenedores",
  "fertilizer and shipping": "Fertilizantes y fletes",
  "natural gas": "Gas natural",
  "durable goods": "Bienes durables",
  property: "Propiedad China",
  "refined copper": "Cobre refinado",
  "used autos": "Autos usados",
  "uranium enrichment": "Uranio",
};

const READING_COPY = {
  "Shortage probable": "Escasez probable",
  Tightening: "Más tensión",
  "Bottleneck emerging": "Cuello de botella",
  Mixed: "Mixto",
  Loosening: "Demanda floja",
  "Inventory overhang": "Exceso de inventario",
  "Hidden shortage risk": "Riesgo escondido",
};

const WHY_COPY = [
  [/prices are moving faster/i, "los precios suben rápido"],
  [/demand is slowing/i, "la demanda resta algo"],
  [/inventory/i, "inventarios"],
  [/trade/i, "estrés comercial"],
  [/capacity/i, "capacidad"],
];

function safeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sourceDateLabel(value) {
  return String(value || "").slice(0, 10) || "";
}

function plainMarketName(value) {
  const text = String(value || "").trim();
  return MARKET_NAMES[text] || text || "Mercado";
}

function plainReading(value) {
  const text = String(value || "").trim();
  return READING_COPY[text] || text || "Sin lectura";
}

function plainWhy(value) {
  const text = String(value || "").trim();
  if (!text) return "Señales mixtas.";
  const fragments = WHY_COPY
    .filter(([pattern]) => pattern.test(text))
    .map(([, copy]) => copy);
  if (fragments.length >= 2) return `${fragments[0]}; ${fragments.slice(1).join(", ")}.`;
  if (fragments.length === 1) return `${fragments[0]}.`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function normalizeMarket(row) {
  return {
    id: String(row?.market_id || row?.item || "market"),
    name: plainMarketName(row?.item),
    score: finiteNumber(row?.score, 0),
    reading: plainReading(row?.reading),
    why: plainWhy(row?.why),
    quality: finiteNumber(row?.data_quality, 0),
    sources: finiteNumber(row?.source_coverage?.connected_series, safeList(row?.source_series).length),
  };
}

function normalizeProvider(row) {
  return {
    name: String(row?.name || "Fuente"),
    used: finiteNumber(row?.used_series, 0),
    warming: finiteNumber(row?.warming_series, 0),
    latest: sourceDateLabel(row?.latest_date),
  };
}

function normalizeGap(row) {
  return {
    market: plainMarketName(row?.market),
    missing: String(row?.missing_layer || row?.next_connector || "Fuente pendiente"),
  };
}

function fallbackWithError(error) {
  return {
    ...fallbackSnapshot,
    sourceLabel: "Última foto guardada",
    dataStatus: "No pude leer MOSAIC live; usando respaldo guardado.",
    sourceError: String(error?.message || error || ""),
    live: false,
  };
}

export function normalizeMosaicPayload(raw, source = {}) {
  if (!raw || typeof raw !== "object") {
    throw new Error("MOSAIC payload is empty or invalid.");
  }

  const markets = safeList(raw.markets).map(normalizeMarket);
  const topMarket = markets[0];
  const sourceSummary = raw.source_summary || {};
  const health = raw.source_health || {};
  const providers = safeList(sourceSummary.providers).map(normalizeProvider);
  const generatedAt = String(raw.generated_at || new Date().toISOString());
  const latestProvider = providers
    .map((item) => item.latest)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    ...fallbackSnapshot,
    generatedAt,
    index: finiteNumber(raw.global_disequilibrium_index, fallbackSnapshot.index),
    conflict: finiteNumber(raw.conflict_index, fallbackSnapshot.conflict),
    headline: topMarket
      ? `${topMarket.name} muestra la presión más clara.`
      : fallbackSnapshot.headline,
    sourceLine:
      sourceSummary.series ||
      `${finiteNumber(health.used_series, 0)} series públicas, ${finiteNumber(health.manual_series, 0)} cargas manuales, ${finiteNumber(health.watched_warming_series, 0)} en observación, ${finiteNumber(health.error_series, 0)} errores.`,
    freshness:
      sourceSummary.freshness ||
      (latestProvider ? `Fuente más reciente: ${latestProvider}.` : fallbackSnapshot.freshness),
    sourceLabel: source.label || "Transmisión live de MOSAIC",
    sourcePath: source.path || source.url || fallbackSnapshot.sourcePath || "",
    dataStatus: source.status || "Leído ahora desde el último embed disponible.",
    live: true,
    loadedAt: new Date().toISOString(),
    markets,
    providers,
    gaps: safeList(sourceSummary.open_gaps).slice(0, 5).map(normalizeGap),
  };
}

async function readJsonFile(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function readJsonUrl(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`MOSAIC URL failed (${response.status}).`);
  }
  return response.json();
}

function candidatePaths(options = {}) {
  const explicit = options.sourcePath || process.env.MOSAIC_SNAPSHOT_PATH || "";
  const configured = String(explicit)
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...configured, DEFAULT_RELATIVE_SOURCE];
}

export async function loadMosaicSnapshot(options = {}) {
  const sourceUrl = options.sourceUrl || process.env.MOSAIC_SNAPSHOT_URL || "";
  if (sourceUrl) {
    try {
      const raw = await readJsonUrl(sourceUrl);
      return normalizeMosaicPayload(raw, {
        label: "Transmisión live de MOSAIC",
        url: sourceUrl,
        status: "Leído ahora desde la URL configurada.",
      });
    } catch (error) {
      if (options.throwOnError) throw error;
    }
  }

  let lastError = null;
  for (const filePath of candidatePaths(options)) {
    try {
      const raw = await readJsonFile(filePath);
      return normalizeMosaicPayload(raw, {
        label: "Transmisión live de MOSAIC",
        path: filePath,
        status: "Leído ahora desde el último embed local.",
      });
    } catch (error) {
      lastError = error;
    }
  }

  if (options.throwOnError) throw lastError || new Error("MOSAIC source not found.");
  return fallbackWithError(lastError);
}
