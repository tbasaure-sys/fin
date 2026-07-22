import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { macroBrainSnapshot as fallbackSnapshot } from "../macro-brain-snapshot.js";

const DEPLOYABLE_SOURCE = path.resolve(process.cwd(), "public", "data", "macro_brain_latest.json");

const DEFAULT_RELATIVE_SOURCE = path.resolve(
  process.cwd(),
  "..",
  "02_Finance",
  "Fin_model",
  "validation_output",
  "macro_brain_v2",
  "macro_brain_latest.json",
);

const SERIES_COPY = {
  "GC=F": { label: "Oro", up: "más fuerte", down: "más débil" },
  "COP=X": { label: "FX Colombia", up: "más presión", down: "menos presión" },
  LQD: { label: "Crédito", up: "mejor", down: "peor" },
  "CLP=X": { label: "FX Chile", up: "más presión", down: "más fuerte" },
  "BRL=X": { label: "FX Brasil", up: "más débil", down: "más fuerte" },
  MOVE: { label: "Volatilidad de tasas", up: "más estrés", down: "más calma" },
  DXY: { label: "Dólar amplio", up: "más fuerte", down: "más débil" },
  "HG=F": { label: "Cobre", up: "más fuerte", down: "más débil" },
};

const RELEASE_COPY = {
  "US CPI": "IPC EE.UU.",
  "China trade / credit impulse": "Crédito China",
  "US payrolls": "Payrolls EE.UU.",
  "CFTC positioning": "Posicionamiento CFTC",
  "Chile CPI / BCCh": "IPC Chile / BCCh",
};

const TIMING_COPY = {
  "next release": "próxima publicación",
  Friday: "viernes",
  "Friday lag": "viernes con rezago",
};

function safeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percentValue(value, fallback = 0) {
  const parsed = finiteNumber(value, fallback);
  return Math.round((parsed <= 1 ? parsed * 100 : parsed) || 0);
}

function sourceDateLabel(value) {
  const text = String(value || "").slice(0, 10);
  return text || "fecha no disponible";
}

function directionFromSign(value) {
  const sign = finiteNumber(value, 0);
  if (sign > 0) return "up";
  if (sign < 0) return "down";
  return "flat";
}

function impulsePlainText(row, direction) {
  const copy = SERIES_COPY[row?.series_id] || {};
  if (direction === "up") return copy.up || "sube";
  if (direction === "down") return copy.down || "baja";
  return "sin cambio claro";
}

function normalizeImpulse(row) {
  const direction = directionFromSign(row?.impulse_sign);
  const fallbackLabel = String(row?.label || row?.series_id || "Señal").replace(/\s+futures$/i, "");
  return {
    label: SERIES_COPY[row?.series_id]?.label || fallbackLabel,
    plain: impulsePlainText(row, direction),
    direction,
    intensity: Math.abs(finiteNumber(row?.impulse_z, finiteNumber(row?.impulse, 0)) || 0),
  };
}

function thesisState(licenseState) {
  const value = String(licenseState || "").toUpperCase();
  if (value === "LICENSED") return "open";
  return "watch";
}

function thesisStatus(licenseState) {
  const value = String(licenseState || "").toUpperCase();
  if (value === "LICENSED") return "Sigue abierta";
  if (value === "REVOKED") return "Pausada";
  return "Mirar de cerca";
}

function thesisWhy(row) {
  const confirmations = finiteNumber(row?.confirmations, 0);
  const contradictions = finiteNumber(row?.contradictions, 0);
  const neutrals = finiteNumber(row?.neutrals, 0);
  if (contradictions > confirmations) {
    return "Hay más señales en contra que a favor; conviene revisar antes de aumentar exposición.";
  }
  if (confirmations > contradictions) {
    return "La idea todavía tiene más señales a favor que en contra.";
  }
  if (neutrals > 0) {
    return "No está rota, pero faltan señales decisivas.";
  }
  return "Lectura viva del set de confirmación.";
}

function normalizeThesis(row) {
  const id = String(row?.thesis_id || row?.id || "T").trim();
  return {
    id,
    title: String(row?.title || id),
    expression: String(row?.market_expression || row?.expression || ""),
    status: thesisStatus(row?.license_state),
    state: thesisState(row?.license_state),
    confidence: percentValue(row?.confidence, 0),
    attention: Math.min(100, Math.max(0, percentValue(row?.amb_display, 0))),
    confirmations: finiteNumber(row?.confirmations, 0),
    openQuestions: finiteNumber(row?.neutrals, 0),
    contradictions: finiteNumber(row?.contradictions, 0),
    why: thesisWhy(row),
    canBreak: safeList(row?.invalidation)[0] || "Una señal clave contradice la tesis.",
  };
}

function normalizeLiquidity(raw) {
  const componentEntries = Object.entries(raw?.components || {});
  const components = componentEntries
    .filter(([key]) => key !== "us_net_liquidity_ex_rrp")
    .map(([key, value]) => ({
      label: String(value?.label || key),
      stance: finiteNumber(value?.impulse, 0) < 0 ? "drena levemente" : "aporta levemente",
    }));
  const main = raw?.components?.us_net_liquidity_ex_rrp || {};
  return {
    status: raw?.status === "available" ? "Parcial" : "Pendiente",
    summary:
      raw?.summary ||
      "La liquidez se calcula desde las fuentes disponibles y se marca como parcial si falta una pieza.",
    direction: main?.impulse_direction || "neutral",
    impulse: finiteNumber(main?.impulse, 0),
    components,
  };
}

function normalizeNextCheck(row) {
  return {
    event: RELEASE_COPY[row?.release] || String(row?.release || "Dato pendiente"),
    timing: TIMING_COPY[row?.timing] || String(row?.timing || "próxima publicación"),
    value: finiteNumber(row?.license_value, 0),
  };
}

function normalizeStability(raw) {
  const metrics = raw?.metrics || {};
  const rho = finiteNumber(metrics.rho_q50, null);
  const rhoLow = finiteNumber(metrics.rho_q05, null);
  const rhoHigh = finiteNumber(metrics.rho_q95, null);
  const pressure = Math.round((finiteNumber(metrics.amb_upper, 0) || 0) * 100);
  const status = raw?.status === "NO_PSM_ALERT" ? "Tranquilo" : "Alerta";
  const fragileMode = Object.entries(raw?.dominant_mode || {})
    .sort((left, right) => Math.abs(finiteNumber(right[1], 0)) - Math.abs(finiteNumber(left[1], 0)))
    .slice(0, 4)
    .map(([key]) => key.replace(/_/g, " "));

  return {
    status,
    rho,
    range: rhoLow !== null && rhoHigh !== null ? `${rhoLow.toFixed(2)}-${rhoHigh.toFixed(2)}` : "-",
    pressure,
    fragileMode,
    read:
      status === "Tranquilo"
        ? "El chequeo de estrés no está cerca de alerta. La lectura sigue siendo monitoreo, no señal de ruptura."
        : "El chequeo de estrés pide revisar tesis expuestas al modo frágil.",
  };
}

function buildShortRead({ impulses, theses, stability }) {
  const firstImpulse = impulses[0];
  const watchCount = theses.filter((item) => item.state === "watch").length;
  const openCount = theses.filter((item) => item.state === "open").length;
  const impulseText = firstImpulse ? `${firstImpulse.label} está ${firstImpulse.plain}` : "No hay cambio dominante";
  return `${impulseText}; ${openCount} tesis abiertas y ${watchCount} en revisión. Estrés: ${String(stability.status || "sin lectura").toLowerCase()}.`;
}

function fallbackWithError(error) {
  return {
    ...fallbackSnapshot,
    sourceLabel: "Última foto guardada",
    dataStatus: "No pude leer la fuente live; usando respaldo guardado.",
    sourceError: String(error?.message || error || ""),
    live: false,
  };
}

export function normalizeMacroBrainPayload(raw, source = {}) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Macro Brain payload is empty or invalid.");
  }

  const impulses = safeList(raw.impulse_changes)
    .map(normalizeImpulse)
    .sort((left, right) => right.intensity - left.intensity);
  const theses = safeList(raw.theses).map(normalizeThesis);
  const stability = normalizeStability(raw.psm || raw.stability || {});
  const nextChecks = safeList(raw.defeater_calendar).map(normalizeNextCheck);
  const runDate = sourceDateLabel(raw.run_date || raw.generated_on);
  const generatedOn = String(raw.generated_on || new Date().toISOString());

  return {
    ...fallbackSnapshot,
    runDate,
    generatedOn,
    sourceLabel: source.label || "Transmisión live del motor macro",
    sourcePath: source.path || source.url || fallbackSnapshot.sourcePath,
    freshnessLabel: `Generado el ${runDate}`,
    dataStatus: source.status || "Leído ahora desde la última corrida disponible.",
    live: true,
    loadedAt: new Date().toISOString(),
    modelVersion: raw.model_version || fallbackSnapshot.modelVersion || "",
    observations: finiteNumber(raw.observations, fallbackSnapshot.observations),
    seriesCount: finiteNumber(raw.series_count, fallbackSnapshot.seriesCount),
    shortRead: buildShortRead({ impulses, theses, stability }),
    impulseChanges: impulses,
    liquidity: normalizeLiquidity(raw.liquidity || {}),
    theses,
    nextChecks,
    stability,
    ledger: {
      ...fallbackSnapshot.ledger,
      liveTheses: theses.length,
      question: raw.question_of_day || fallbackSnapshot.ledger?.question,
    },
  };
}

async function readJsonFile(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function readJsonUrl(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Macro Brain URL failed (${response.status}).`);
  }
  return response.json();
}

function candidatePaths(options = {}) {
  const explicit = options.sourcePath || process.env.MACRO_BRAIN_SNAPSHOT_PATH || "";
  const configured = String(explicit)
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...configured, DEPLOYABLE_SOURCE, DEFAULT_RELATIVE_SOURCE];
}

export async function loadMacroBrainSnapshot(options = {}) {
  const sourceUrl = options.sourceUrl || process.env.MACRO_BRAIN_SNAPSHOT_URL || "";
  if (sourceUrl) {
    try {
      const raw = await readJsonUrl(sourceUrl);
      return normalizeMacroBrainPayload(raw, {
        label: "Transmisión live del motor macro",
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
      return normalizeMacroBrainPayload(raw, {
        label: "Transmisión live del motor macro",
        path: filePath,
        status: "Leído ahora desde la última corrida local.",
      });
    } catch (error) {
      lastError = error;
    }
  }

  if (options.throwOnError) throw lastError || new Error("Macro Brain source not found.");
  return fallbackWithError(lastError);
}
