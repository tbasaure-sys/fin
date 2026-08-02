"use client";

import { useEffect, useMemo, useState } from "react";

import { parseResponse } from "@/components/workspace/live-data";
import styles from "./signal-intelligence-panel.module.css";

const COPY = {
  es: {
    eyebrow: "Inteligencia de mercado",
    title: "Qué está confirmando el mercado",
    subtitle: "Estado diario, evidencia paralela y desacuerdos. No cambia tu ranking ni tu valoración.",
    loading: "Cargando estado de mercado…",
    disabled: "Este motor todavía no está habilitado para este workspace.",
    blocked: "El motor está en espera: faltan datos o derechos aprobados.",
    insufficient: "Todavía no hay historial suficiente para una lectura completa.",
    stale: "La última lectura está vencida; se conserva como referencia, no como señal nueva.",
    asOf: "Sesión",
    coverage: "Cobertura",
    why: "Por qué",
    history: "Historia",
    audit: "Auditoría",
    disagreements: "Desacuerdos",
    noDisagreements: "No hay desacuerdos materiales entre familias disponibles.",
    open: "Abrir detalle",
    close: "Cerrar detalle",
    noAssets: "Agrega una posición o seguimiento para construir esta lectura.",
  },
  en: {
    eyebrow: "Market intelligence",
    title: "What the market is confirming",
    subtitle: "Daily state, parallel evidence, and disagreements. It does not change your ranking or valuation.",
    loading: "Loading market state…",
    disabled: "This engine is not enabled for this workspace yet.",
    blocked: "The engine is waiting: required data or rights are not approved.",
    insufficient: "There is not enough history for a complete reading yet.",
    stale: "The latest reading is stale; it remains reference data, not a new signal.",
    asOf: "Session",
    coverage: "Coverage",
    why: "Why",
    history: "History",
    audit: "Audit",
    disagreements: "Disagreements",
    noDisagreements: "No material disagreements among available families.",
    open: "Open detail",
    close: "Close detail",
    noAssets: "Add a holding or watchlist item to build this reading.",
  },
};

const STATE_LABELS = {
  es: { trend_up: "Tendencia alcista", trend_down: "Tendencia bajista", range: "Rango", transition: "Transición", uncertain: "Incierto", null: "Sin estado" },
  en: { trend_up: "Trend up", trend_down: "Trend down", range: "Range", transition: "Transition", uncertain: "Uncertain", null: "No state" },
};

function labelForState(state, language) {
  return STATE_LABELS[language]?.[state] || STATE_LABELS.es[state] || state || STATE_LABELS.es.null;
}

function familyLabel(key, language) {
  const labels = {
    trend: language === "es" ? "Tendencia" : "Trend",
    momentum: language === "es" ? "Momentum" : "Momentum",
    volatility: language === "es" ? "Volatilidad" : "Volatility",
    structure: language === "es" ? "Estructura" : "Structure",
    participation: language === "es" ? "Participación" : "Participation",
    relative: language === "es" ? "Relativa" : "Relative",
  };
  return labels[key] || key;
}

function formatDate(value, language) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(language === "es" ? "es-CL" : "en-US", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00Z`));
  } catch {
    return value;
  }
}

function statusMessage(status, copy) {
  if (status === "blocked") return copy.blocked;
  if (status === "insufficient_data") return copy.insufficient;
  if (status === "stale") return copy.stale;
  return "";
}

export default function SignalIntelligencePanel({ workspaceId, language = "es", focusAsset = "", onRunsVisible = null }) {
  const copy = COPY[language] || COPY.es;
  const [overview, setOverview] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!workspaceId) return undefined;
    const controller = new AbortController();
    const endpoint = focusAsset
      ? `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/signal-intelligence/assets/${encodeURIComponent(focusAsset)}?history=252`
      : `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/signal-intelligence`;
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(parseResponse)
      .then((payload) => {
        if (focusAsset) {
          const asset = payload.asset;
          onRunsVisible?.(asset?.runId ? [asset.runId] : []);
          setDetail(payload);
          setSelectedAsset(focusAsset);
          setOverview({
            enabled: payload.enabled,
            status: payload.status,
            latestAsOf: asset?.asOfDate || null,
            coverage: asset ? { totalAssets: 1, coveredAssets: asset.status === "ready" ? 1 : 0 } : { totalAssets: 1, coveredAssets: 0 },
            breadth: asset?.state ? { [asset.state]: 1 } : {},
            assets: asset ? [asset] : [],
            disagreements: asset?.disagreements || [],
          });
        } else {
          onRunsVisible?.((payload.assets || []).map((item) => item.runId).filter(Boolean));
          setOverview(payload);
        }
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          onRunsVisible?.([]);
          setOverview({ enabled: true, status: "blocked" });
        }
      });
    return () => controller.abort();
  }, [focusAsset, onRunsVisible, workspaceId]);

  async function openAsset(assetKey) {
    setSelectedAsset(assetKey);
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/signal-intelligence/assets/${encodeURIComponent(assetKey)}?history=252`, { cache: "no-store" });
      const payload = await parseResponse(response);
      onRunsVisible?.(payload.asset?.runId ? [payload.asset.runId] : []);
      setDetail(payload);
    } catch {
      setDetail({ status: "blocked", history: [] });
    } finally {
      setLoadingDetail(false);
    }
  }

  const statusText = useMemo(() => statusMessage(overview?.status, copy), [copy, overview?.status]);
  if (!overview || overview.status === "disabled") return null;

  return (
    <section className={styles.panel} data-testid="signal-intelligence-panel">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{copy.eyebrow}</span>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
        {overview.latestAsOf ? <span className={styles.date}>{copy.asOf} {formatDate(overview.latestAsOf, language)}</span> : null}
      </header>

      {statusText ? <div className={styles.notice} data-status={overview.status}>{statusText}</div> : null}

      {overview.coverage ? (
        <div className={styles.metrics}>
          <div><span>{copy.coverage}</span><strong>{overview.coverage.coveredAssets}/{overview.coverage.totalAssets}</strong></div>
          {Object.entries(overview.breadth || {}).map(([state, count]) => <div key={state}><span>{labelForState(state, language)}</span><strong>{count}</strong></div>)}
        </div>
      ) : null}

      {overview.assets?.length ? (
        <div className={styles.assetGrid}>
          {overview.assets.slice(0, 12).map((asset) => (
            <button className={styles.asset} data-active={selectedAsset === asset.subject.key} key={asset.subject.key} onClick={() => openAsset(asset.subject.key)} type="button">
              <span>{asset.subject.key}</span>
              <strong data-state={asset.state}>{labelForState(asset.state, language)}</strong>
              <small>{formatDate(asset.asOfDate, language)}</small>
            </button>
          ))}
        </div>
      ) : <p className={styles.empty}>{copy.noAssets}</p>}

      {overview.disagreements?.length ? (
        <div className={styles.disagreement}>
          <span>{copy.disagreements}</span>
          <p>{overview.disagreements.slice(0, 3).map((item) => `${item.assetKey}: ${familyLabel(item.left, language)} ↔ ${familyLabel(item.right, language)}`).join(" · ")}</p>
        </div>
      ) : overview.status === "ready" ? <p className={styles.quiet}>{copy.noDisagreements}</p> : null}

      {selectedAsset ? (
        <div className={styles.detail} data-testid="signal-intelligence-detail">
          <div className={styles.detailHeader}><div><span>{selectedAsset}</span><strong>{detail?.asset ? labelForState(detail.asset.state, language) : copy.loading}</strong></div><button onClick={() => { setSelectedAsset(null); setDetail(null); }} type="button">{copy.close}</button></div>
          {loadingDetail ? <p className={styles.empty}>{copy.loading}</p> : detail?.asset ? (
            <div className={styles.detailGrid}>
              <div><span>{language === "es" ? "Ahora" : "Now"}</span><p><strong>{labelForState(detail.asset.state, language)}</strong></p><p>{formatDate(detail.asset.asOfDate, language)} · {detail.asset.status}</p></div>
              <div><span>{copy.why}</span>{detail.asset.families.map((family) => <p key={family.key}><strong>{familyLabel(family.key, language)}</strong> <small>{family.state}</small></p>)}</div>
              <div><span>{copy.history}</span>{detail.history.slice(0, 8).map((item) => <p key={`${item.runId}-${item.asOfDate}`}><strong>{formatDate(item.asOfDate, language)}</strong> <small>{labelForState(item.state, language)}</small></p>)}</div>
              <div><span>{copy.audit}</span><p>{detail.asset.receipt.engineVersion || "signal-genome.v1"}</p><p>{detail.asset.dataQuality.coveragePct == null ? "—" : `${Math.round(detail.asset.dataQuality.coveragePct * 100)}% ${copy.coverage.toLowerCase()}`}</p><p>{detail.asset.receipt.configFingerprint ? detail.asset.receipt.configFingerprint.slice(0, 12) : "—"}</p></div>
            </div>
          ) : <p className={styles.empty}>{statusMessage(detail?.status, copy) || copy.blocked}</p>}
        </div>
      ) : null}
    </section>
  );
}
