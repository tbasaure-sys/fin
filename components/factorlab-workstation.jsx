"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/app/factorlab/factorlab.module.css";
import { useLanguagePreference } from "@/components/language-layer";
import { PublicSiteHeader } from "@/components/public-shell/public-site-header";
import { factorLabSampleUniverse, runFactorLab } from "@/lib/factorlab-engine";
import {
  FACTORLAB_DEFAULT_FILTERS,
  buildFactorLabQueueItem,
  buildFactorLabSharePath,
  factorLabScoreReading,
  parseFactorLabFilters,
} from "@/lib/factorlab-workspace";

const COPY = {
  es: {
    title: "Descubre qué empresa merece tu próxima hora.",
    intro: "Encuentra empresas que vale la pena revisar y asigna una Prioridad de revisión antes de abrir cada expediente. FactorLab ordena investigación; no recomienda compras.",
    publicNote: "Ver ejemplo con un snapshot congelado. Para guardar candidatos necesitas un workspace.",
    privateNote: "La cola está conectada a tu workspace. El universo de esta pantalla sigue siendo demostrativo.",
    demo: "Demo",
    dataDate: "Datos al 24 jun 2026",
    cadence: "Snapshot fijo · sin actualización automática",
    queueConnected: "Research queue activa",
    filters: "Filtros de búsqueda",
    filtersBody: "Cambia el mandato. La URL conserva cada filtro para que puedas compartir exactamente la misma búsqueda.",
    asof: "Fecha de corte",
    universe: "Universo",
    topK: "Resultados",
    minAdv: "Transado diario mínimo",
    maxCap: "Capitalización máxima",
    maxVol: "Volatilidad inusual máxima",
    diagnostics: "Incluir expedientes apartados",
    share: "Compartir filtros",
    copied: "Enlace copiado",
    reset: "Restablecer filtros",
    universeOptions: {
      tradable: "Small caps líquidas",
      us: "Solo EE. UU.",
      micro: "Microcaps",
      inflection: "Historias de mejora",
      diagnostics: "Diagnóstico de descartes",
    },
    considered: "Universo observado",
    eligible: "Con evidencia suficiente",
    shown: "Expedientes abiertos",
    held: "Apartados por controles",
    results: "Cola priorizada",
    resultsTitle: "Empresas que justifican una revisión",
    resultsBody: "El ranking global decide qué revisar primero. El ranking por arquetipo compara solo empresas con una lógica económica semejante.",
    globalRank: "Ranking global",
    typeRank: "Dentro de su arquetipo",
    why: "Por qué ahora",
    kill: "Qué mata la tesis",
    evidence: "Cobertura de datos",
    marketCap: "Capitalización",
    adv: "Transado diario",
    fcf: "Rendimiento de caja",
    open: "Abrir ficha",
    add: "Añadir a research queue",
    addPublic: "Añadir a cola · requiere cuenta",
    saving: "Guardando…",
    saved: "Añadida a la cola",
    saveError: "No se pudo guardar · reintentar",
    methodology: "Metodología y auditoría",
    close: "Cerrar",
    modelVersion: "Versión del modelo",
    sources: "Fuentes y adaptadores",
    lag: "Política temporal",
    lagValue: "Solo información presentada o aceptada antes de la fecha de corte.",
    json: "Especificación reproducible",
    copyJson: "Copiar JSON",
    jsonCopied: "JSON copiado",
    downloadJson: "Descargar JSON",
    methodNote: "Los umbrales son fijos; los datos faltantes reducen cobertura y no se convierten automáticamente en una mala señal.",
    emptyTitle: "Ninguna empresa sobrevivió a estos filtros.",
    emptyBody: "Amplía liquidez, capitalización o volatilidad, o vuelve al mandato demo.",
    disclosure: "Herramienta de priorización de investigación. No es asesoría financiera ni una recomendación de compra o venta.",
  },
  en: {
    title: "Discover which company deserves your next hour.",
    intro: "FactorLab narrows a small universe into files worth opening. It ranks research; it does not recommend trades.",
    publicNote: "Explore the method with a frozen snapshot. A workspace is required to save candidates.",
    privateNote: "The queue is connected to your workspace. This screen's universe remains demonstrative.",
    demo: "Demo",
    dataDate: "Data as of 24 Jun 2026",
    cadence: "Fixed snapshot · no automatic updates",
    queueConnected: "Research queue active",
    filters: "Search filters",
    filtersBody: "Change the mandate. The URL preserves every filter so the exact search can be shared.",
    asof: "Cut-off date",
    universe: "Universe",
    topK: "Results",
    minAdv: "Minimum daily traded value",
    maxCap: "Maximum market cap",
    maxVol: "Maximum unusual volatility",
    diagnostics: "Include held-back files",
    share: "Share filters",
    copied: "Link copied",
    reset: "Reset filters",
    universeOptions: {
      tradable: "Liquid small caps",
      us: "US only",
      micro: "Microcaps",
      inflection: "Improvement stories",
      diagnostics: "Rejection diagnostics",
    },
    considered: "Observed universe",
    eligible: "Enough evidence",
    shown: "Open files",
    held: "Held back by controls",
    results: "Prioritized queue",
    resultsTitle: "Companies that justify a review",
    resultsBody: "Global rank decides what to review first. Archetype rank compares only companies with a similar economic logic.",
    globalRank: "Global rank",
    typeRank: "Within its archetype",
    why: "Why now",
    kill: "What kills the thesis",
    evidence: "Data coverage",
    marketCap: "Market cap",
    adv: "Daily traded value",
    fcf: "Cash yield",
    open: "Open company",
    add: "Add to research queue",
    addPublic: "Add to queue · account required",
    saving: "Saving…",
    saved: "Added to queue",
    saveError: "Could not save · retry",
    methodology: "Methodology and audit",
    close: "Close",
    modelVersion: "Model version",
    sources: "Sources and adapters",
    lag: "Time policy",
    lagValue: "Only information filed or accepted before the cut-off date.",
    json: "Reproducible specification",
    copyJson: "Copy JSON",
    jsonCopied: "JSON copied",
    downloadJson: "Download JSON",
    methodNote: "Thresholds are fixed; missing data reduces coverage and is not automatically treated as a bad signal.",
    emptyTitle: "No company survived these filters.",
    emptyBody: "Widen liquidity, market-cap, or volatility limits, or return to the demo mandate.",
    disclosure: "Research prioritization software. Not financial advice or a recommendation to buy or sell.",
  },
};

const SPANISH_NARRATIVE = {
  HROW: {
    thesis: "Plataforma farmacéutica especializada con apalancamiento operativo y mejor conversión de caja después de un periodo intensivo de inversión.",
    whyNow: "La aceleración de ingresos y la mezcla de productos empiezan a reflejarse en los márgenes reportados.",
    killCriteria: "El flujo de caja no escala, la deuda pasa a dominar la tesis o las acciones crecen más rápido que los ingresos.",
  },
  KITS: {
    thesis: "Óptica digital pequeña, con compras repetidas, economías de escala en mejora y poca atención institucional.",
    whyNow: "La economía unitaria mejora mientras el mercado aún la trata como un nombre de consumo poco seguido.",
    killCriteria: "El costo de adquisición crece más que la utilidad bruta, el crecimiento cae con fuerza o se pierde disciplina de inventario.",
  },
  GCT: {
    thesis: "Marketplace logístico de rápido crecimiento valorado con descuento porque el mercado duda de su durabilidad.",
    whyNow: "La generación de caja y la caja neta pueden forzar una relectura si el crecimiento persiste en el próximo ciclo de resultados.",
    killCriteria: "Se deteriora la calidad de ingresos, el capital de trabajo consume caja o aumentan las alertas de gobierno corporativo.",
  },
  TSSI: {
    thesis: "Proveedor pequeño de servicios para infraestructura de IA con apalancamiento operativo si la demanda se sostiene.",
    whyNow: "La cartera de pedidos y la aceleración de ingresos pueden mover el negocio antes de que llegue cobertura amplia.",
    killCriteria: "La concentración de clientes golpea, los márgenes no expanden o la inversión en IA se normaliza abruptamente.",
  },
  PFIE: {
    thesis: "Empresa pequeña y rentable de equipos energéticos, con caja neta y baja atención; el upside depende de disciplina de capital.",
    whyNow: "La asimetría está en el balance más que en el crecimiento: la caja neta reduce el riesgo de pérdida permanente.",
    killCriteria: "Se debilita el ciclo energético, la caja se asigna mal o la liquidez bursátil se vuelve insuficiente.",
  },
  CECO: {
    thesis: "Sistemas ambientales industriales de nicho, con demanda secular y una ruta de crecimiento apoyada en adquisiciones.",
    whyNow: "La cartera de pedidos y la ejecución de márgenes pueden validar la tesis de compounder industrial pequeño.",
    killCriteria: "Aumenta la deuda de integración, cae la calidad de la cartera o se revierten las mejoras de margen.",
  },
  AEHR: {
    thesis: "Opcionalidad en equipos para semiconductores, con concentración de clientes e incertidumbre cíclica.",
    whyNow: "Nuevos pedidos o diversificación de clientes pueden importar más que las cifras rezagadas.",
    killCriteria: "No se recuperan los pedidos, aumenta la concentración o se acelera el consumo de caja.",
  },
  REPX: {
    thesis: "Productor energético pequeño y generador de caja donde el retorno al accionista importa si se comprende el riesgo de commodities.",
    whyNow: "El alto rendimiento de caja y la disciplina de capital pueden revalorizar una small cap energética poco seguida.",
    killCriteria: "Caen los commodities, vuelve a subir el apalancamiento o decepciona la calidad de reservas.",
  },
  EAF: {
    thesis: "Cíclica aparentemente barata con estrés de balance; muestra por qué un múltiplo bajo no basta.",
    whyNow: "Solo gana interés si gira el ciclo y cae el riesgo de refinanciamiento.",
    killCriteria: "La deuda sigue alta o los precios no se recuperan.",
  },
};

const UNIVERSE_OPTIONS = ["tradable", "us", "micro", "inflection", "diagnostics"];

function formatMoney(value) {
  if (!Number.isFinite(Number(value))) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
  return `$${Math.round(value / 1_000)}k`;
}

function formatPercent(value, digits = 0) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(digits)}%` : "—";
}

function typeLabel(row, language) {
  return row.opportunityTypeLabel?.[language] || row.opportunityTypeLabel?.en || "";
}

function narrative(row, language) {
  if (language === "es" && SPANISH_NARRATIVE[row.ticker]) return SPANISH_NARRATIVE[row.ticker];
  return row;
}

function sourceLabel(key, language) {
  const labels = {
    es: { market: "Mercado", fundamentals: "Fundamentales", neglect: "Atención de mercado", filings: "Presentaciones regulatorias", catalysts: "Catalizadores" },
    en: { market: "Market", fundamentals: "Fundamentals", neglect: "Market attention", filings: "Regulatory filings", catalysts: "Catalysts" },
  };
  return labels[language]?.[key] || key;
}

export function FactorLabWorkstation({
  initialLanguage = "es",
  initialFilters = FACTORLAB_DEFAULT_FILTERS,
  publicMode = true,
  workspaceId = "",
}) {
  const router = useRouter();
  const { language } = useLanguagePreference(initialLanguage);
  const copy = COPY[language] || COPY.es;
  const parsedInitial = useMemo(() => parseFactorLabFilters(initialFilters), [initialFilters]);
  const [asof, setAsof] = useState(parsedInitial.asof);
  const [universe, setUniverse] = useState(parsedInitial.universe);
  const [topK, setTopK] = useState(parsedInitial.topK);
  const [minAdvUsd, setMinAdvUsd] = useState(parsedInitial.minAdvUsd);
  const [maxMarketCapUsd, setMaxMarketCapUsd] = useState(parsedInitial.maxMarketCapUsd);
  const [maxResidualVol, setMaxResidualVol] = useState(parsedInitial.maxResidualVol);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(parsedInitial.includeDiagnostics);
  const [auditOpen, setAuditOpen] = useState(false);
  const [copyState, setCopyState] = useState("");
  const [queueState, setQueueState] = useState({});

  const filters = useMemo(() => ({ asof, universe, topK, minAdvUsd, maxMarketCapUsd, maxResidualVol, includeDiagnostics }), [
    asof, universe, topK, minAdvUsd, maxMarketCapUsd, maxResidualVol, includeDiagnostics,
  ]);
  const basePath = publicMode ? "/factorlab" : "/app/discover";
  const sharePath = useMemo(() => buildFactorLabSharePath(filters, language, basePath), [filters, language, basePath]);
  const run = useMemo(() => runFactorLab({ ...filters, includeFutureReturn: false }), [filters]);
  const auditJson = useMemo(() => JSON.stringify({ spec: run.spec, summary: run.summary, audit: run.audit }, null, 2), [run]);

  useEffect(() => {
    const timer = window.setTimeout(() => router.replace(sharePath, { scroll: false }), 180);
    return () => window.clearTimeout(timer);
  }, [router, sharePath]);

  async function copyValue(value, state) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(state);
      window.setTimeout(() => setCopyState(""), 1400);
    } catch {
      setCopyState("");
    }
  }

  function resetFilters() {
    const defaults = FACTORLAB_DEFAULT_FILTERS;
    setAsof(defaults.asof);
    setUniverse(defaults.universe);
    setTopK(defaults.topK);
    setMinAdvUsd(defaults.minAdvUsd);
    setMaxMarketCapUsd(defaults.maxMarketCapUsd);
    setMaxResidualVol(defaults.maxResidualVol);
    setIncludeDiagnostics(defaults.includeDiagnostics);
  }

  async function addToQueue(row) {
    if (!workspaceId) return;
    setQueueState((current) => ({ ...current, [row.ticker]: "saving" }));
    try {
      const response = await fetch(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/watchlists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildFactorLabQueueItem(row)),
      });
      if (!response.ok) throw new Error("queue_failed");
      setQueueState((current) => ({ ...current, [row.ticker]: "saved" }));
    } catch {
      setQueueState((current) => ({ ...current, [row.ticker]: "error" }));
    }
  }

  function downloadAudit() {
    const blob = new Blob([auditJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `factorlab-audit-${asof}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const loginNext = buildFactorLabSharePath(filters, "es", "/app/discover");
  const loginHref = `/login?intent=signin&next=${encodeURIComponent(loginNext)}&lang=${language}`;

  return (
    <div className={styles.shell}>
      <div className={styles.backdrop} aria-hidden="true" />
      {publicMode ? (
        <PublicSiteHeader initialLanguage={initialLanguage} />
      ) : (
        <header className={styles.privateHeader}>
          <Link href="/app"><strong>BLS Prime</strong><span>Workspace privado</span></Link>
          <nav aria-label="Navegación del workspace"><Link href="/app">Inicio</Link><Link href="/app#holdings">Portafolio</Link></nav>
        </header>
      )}

      <main>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>FactorLab / research discovery</p>
            <h1>{copy.title}</h1>
            <p className={styles.lede}>{copy.intro}</p>
            <p className={styles.modeNote}>{publicMode ? copy.publicNote : copy.privateNote}</p>
          </div>
          <div className={styles.freshness} aria-label={language === "es" ? "Estado de los datos" : "Data status"}>
            <strong>{copy.demo}</strong>
            <span>{copy.dataDate}</span>
            <span>{copy.cadence}</span>
            {!publicMode ? <span data-positive="true">{copy.queueConnected}</span> : null}
          </div>
        </section>

        <section className={styles.statusStrip} aria-label={language === "es" ? "Resumen de búsqueda" : "Search summary"}>
          <div><span>{copy.considered}</span><strong>{factorLabSampleUniverse.length}</strong></div>
          <div><span>{copy.eligible}</span><strong>{run.summary.eligible}</strong></div>
          <div><span>{copy.shown}</span><strong>{run.summary.returned}</strong></div>
          <div><span>{copy.held}</span><strong>{run.summary.abstain}</strong></div>
        </section>

        <section className={styles.workspace}>
          <aside className={styles.filters}>
            <div className={styles.sectionHeading}><span>01</span><div><h2>{copy.filters}</h2><p>{copy.filtersBody}</p></div></div>
            <div className={styles.controlStack}>
              <label><span>{copy.asof}</span><input max="2026-06-24" onChange={(event) => setAsof(event.target.value)} type="date" value={asof} /></label>
              <label><span>{copy.universe}</span><select onChange={(event) => setUniverse(event.target.value)} value={universe}>{UNIVERSE_OPTIONS.map((option) => <option key={option} value={option}>{copy.universeOptions[option]}</option>)}</select></label>
              <label><span>{copy.topK}</span><input max="12" min="1" onChange={(event) => setTopK(Math.max(1, Number(event.target.value) || 1))} type="number" value={topK} /></label>
              <label><span>{copy.minAdv}</span><input max="10000000" min="50000" onChange={(event) => setMinAdvUsd(Number(event.target.value))} step="50000" type="range" value={minAdvUsd} /><em>{formatMoney(minAdvUsd)}</em></label>
              <label><span>{copy.maxCap}</span><input max="5000000000" min="50000000" onChange={(event) => setMaxMarketCapUsd(Number(event.target.value))} step="50000000" type="range" value={maxMarketCapUsd} /><em>{formatMoney(maxMarketCapUsd)}</em></label>
              <label><span>{copy.maxVol}</span><input max="1" min="0.1" onChange={(event) => setMaxResidualVol(Number(event.target.value))} step="0.01" type="range" value={maxResidualVol} /><em>{formatPercent(maxResidualVol)}</em></label>
              <label className={styles.checkbox}><input checked={includeDiagnostics} onChange={(event) => setIncludeDiagnostics(event.target.checked)} type="checkbox" /><span>{copy.diagnostics}</span></label>
            </div>
            <div className={styles.filterActions}>
              <button onClick={() => copyValue(`${window.location.origin}${sharePath}`, "link")} type="button">{copyState === "link" ? copy.copied : copy.share}</button>
              <button onClick={resetFilters} type="button">{copy.reset}</button>
            </div>
          </aside>

          <section className={styles.results} id="results">
            <div className={styles.resultsHeader}>
              <div className={styles.sectionHeading}><span>02</span><div><p>{copy.results}</p><h2>{copy.resultsTitle}</h2><small>{copy.resultsBody}</small></div></div>
              <button className={styles.auditButton} onClick={() => setAuditOpen(true)} type="button">{copy.methodology}</button>
            </div>

            {run.accepted && run.candidates.length ? (
              <div className={styles.candidateList}>
                {run.candidates.map((row) => {
                  const reading = factorLabScoreReading(row.opportunityScore, language);
                  const words = narrative(row, language);
                  const state = queueState[row.ticker] || "idle";
                  return (
                    <article className={styles.candidate} data-candidate="true" key={row.ticker}>
                      <div className={styles.rankBlock}>
                        <div><span>{copy.globalRank}</span><strong>{row.globalRank}</strong></div>
                        <div><span>{copy.typeRank}</span><strong>{row.rankWithinType}</strong><small>{typeLabel(row, language)}</small></div>
                      </div>
                      <div className={styles.candidateBody}>
                        <header><div><p>{row.ticker}</p><h3>{row.name}</h3></div><div className={styles.score} data-level={reading.key}><strong>{Math.round(row.opportunityScore)}</strong><span>{reading.label}</span></div></header>
                        <p className={styles.thesis}>{words.thesis}</p>
                        <div className={styles.decisionGrid}>
                          <div><span>{copy.why}</span><p>{words.whyNow}</p></div>
                          <div><span>{copy.kill}</span><p>{words.killCriteria}</p></div>
                        </div>
                        <p className={styles.scoreExplanation}>{reading.explanation}</p>
                        <dl className={styles.metrics}>
                          <div><dt>{copy.evidence}</dt><dd>{formatPercent(row.dataCompleteness)}</dd></div>
                          <div><dt>{copy.marketCap}</dt><dd>{formatMoney(row.marketCapUsd)}</dd></div>
                          <div><dt>{copy.adv}</dt><dd>{formatMoney(row.advUsd)}</dd></div>
                          <div><dt>{copy.fcf}</dt><dd>{formatPercent(row.fcfYield, 1)}</dd></div>
                        </dl>
                        <div className={styles.candidateActions}>
                          <Link href={`${publicMode ? "/company" : "/app/company"}/${encodeURIComponent(row.ticker)}${publicMode ? `?lang=${language}` : ""}`}>{copy.open}</Link>
                          {publicMode ? <Link className={styles.secondaryAction} href={loginHref}>{copy.addPublic}</Link> : <button className={styles.secondaryAction} disabled={state === "saving" || state === "saved"} onClick={() => addToQueue(row)} type="button">{state === "saving" ? copy.saving : state === "saved" ? copy.saved : state === "error" ? copy.saveError : copy.add}</button>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState} role="status"><span>0 resultados</span><h3>{copy.emptyTitle}</h3><p>{copy.emptyBody}</p><button onClick={resetFilters} type="button">{copy.reset}</button></div>
            )}
          </section>
        </section>
      </main>

      <footer className={styles.footer}><Link href="/">BLS Prime</Link><p>{copy.disclosure}</p></footer>

      {auditOpen ? (
        <div className={styles.drawerBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setAuditOpen(false); }}>
          <section aria-labelledby="factorlab-audit-title" aria-modal="true" className={styles.drawer} role="dialog">
            <header><div><p>FactorLab / audit trail</p><h2 id="factorlab-audit-title">{copy.methodology}</h2></div><button aria-label={copy.close} onClick={() => setAuditOpen(false)} type="button">×</button></header>
            <p className={styles.methodNote}>{copy.methodNote}</p>
            <dl className={styles.auditFacts}>
              <div><dt>{copy.modelVersion}</dt><dd>{run.spec.version}</dd></div>
              <div><dt>{copy.dataDate}</dt><dd>{copy.cadence}</dd></div>
              <div><dt>{copy.lag}</dt><dd>{copy.lagValue}</dd></div>
            </dl>
            <section className={styles.sourceSection}><h3>{copy.sources}</h3>{Object.entries(run.spec.sources).map(([key, value]) => <div key={key}><strong>{sourceLabel(key, language)}</strong><span>{value.adapter}</span></div>)}</section>
            <section className={styles.pipelineSection}><h3>Pipeline</h3>{run.pipeline.map((step, index) => <div key={step.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step.id}</strong><p>{step.plain}</p></div>)}</section>
            <section className={styles.jsonSection}><div><h3>{copy.json}</h3><span>{run.spec.name}</span></div><pre>{auditJson}</pre><div className={styles.jsonActions}><button onClick={() => copyValue(auditJson, "json")} type="button">{copyState === "json" ? copy.jsonCopied : copy.copyJson}</button><button onClick={downloadAudit} type="button">{copy.downloadJson}</button></div></section>
          </section>
        </div>
      ) : null}
    </div>
  );
}
