"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import SignalIntelligencePanel from "@/components/signal-intelligence-panel";
import { useLanguagePreference } from "@/components/language-layer";
import { useEffect, useMemo, useState } from "react";

import { buildCompanyDecisionView } from "@/lib/company-decision-view";
import styles from "./company-decision-workspace.module.css";

const TABS = ["Valor", "Tesis", "Escenarios", "Evidencia", "Cambios", "Auditoría"];

function cleanTicker(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 16);
}

function formatMoney(value, currency = "USD") {
  if (value === null || value === undefined || value === "") return "No publicado";
  const number = Number(value);
  if (!Number.isFinite(number)) return "No publicado";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(number);
}

function formatValue(value, unit) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (unit === "percent") return new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 1 }).format(number);
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(number);
}

function formatDate(value) {
  if (!value) return "Fecha no disponible";
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || payload?.error || "No pudimos cargar esta lectura.");
  }
  return payload;
}

async function fetchWithTimeout(input, init = {}, timeoutMs = 45_000) {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const abortFromCaller = () => controller.abort();
  let timedOut = false;
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error("El análisis excedió 45 segundos. Intenta nuevamente.");
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function EmptyRows({ children = "No hay registros disponibles en esta lectura." }) {
  return <p className={styles.empty}>{children}</p>;
}

function ValuePanel({ view }) {
  const range = view.valuation.range;
  const approximate = view.valuation.kind === "approximate";
  const explanation = view.valuation.explanation || {};
  const explanationWhy = Array.isArray(explanation.why) ? explanation.why : [];
  const explanationRisks = Array.isArray(explanation.risks) ? explanation.risks : [];
  return (
    <div className={styles.valueLayout}>
      <section className={styles.rangePanel} data-kind={view.valuation.kind}>
        <span className={styles.sectionLabel}>{approximate ? "RANGO APROXIMADO" : "RANGO DEFENDIBLE"}</span>
        {range ? (
          <>
            <div className={styles.rangeNumbers}>
              <strong>{formatMoney(range.low, view.market.currency)}</strong>
              <span>Centro {formatMoney(range.central, view.market.currency)}</span>
              <strong>{formatMoney(range.high, view.market.currency)}</strong>
            </div>
            <div className={styles.rangeTrack} aria-label={approximate ? "Rango aproximado" : "Rango defendible"}>
              <span />
              {Number.isFinite(Number(view.market.price)) ? <i title={`Precio ${formatMoney(view.market.price, view.market.currency)}`} /> : null}
            </div>
            <div className={styles.rangeMeta}>
              <p>{view.valuation.method}</p>
              <span data-confidence={String(view.valuation.confidence?.label || "").toLowerCase()}>
                Confianza {view.valuation.confidence?.label || "no clasificada"}
              </span>
            </div>
          </>
        ) : (
          <div className={styles.withheld}>
            <strong>Rango en recálculo.</strong>
            <p>{view.valuation.reason}</p>
          </div>
        )}
      </section>
      <section className={styles.valuationExplanation}>
        <span className={styles.sectionLabel}>LECTURA DEL MODELO</span>
        <h2>Por qué da este rango</h2>
        {explanation.summary ? <p className={styles.explanationSummary}>{explanation.summary}</p> : null}
        {explanationWhy.length ? (
          <div className={styles.explanationGrid}>
            {explanationWhy.map((item, index) => (
              <article key={`${item.title}-${index}`}>
                <strong>{item.title}</strong>
                <p>{item.explanation}</p>
              </article>
            ))}
          </div>
        ) : null}
        {explanation.confidenceExplanation ? (
          <div className={styles.confidenceNote}>
            <span>Qué significa la confianza</span>
            <p>{explanation.confidenceExplanation}</p>
          </div>
        ) : null}
        {explanationRisks.length ? (
          <div className={styles.valuationRisks}>
            <span>Qué puede mover o romper el rango</span>
            <ul>{explanationRisks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
          </div>
        ) : null}
        {explanation.provider === "huggingface" ? (
          <small className={styles.modelDisclosure}>Explicación asistida por {explanation.model || "un modelo open source de Hugging Face"}. Las cifras provienen del motor determinístico.</small>
        ) : (
          <small className={styles.modelDisclosure}>Cifras y explicación generadas por reglas determinísticas auditables.</small>
        )}
      </section>
      {view.expectations.length ? (
        <section className={styles.expectationsPanel}>
          <span className={styles.sectionLabel}>EXPECTATIVAS IMPLÍCITAS</span>
          <div className={styles.expectations}>
            {view.expectations.map((item) => (
              <article key={`${item.years}-${item.label}`}>
                <span>{item.years} años</span>
                <strong>{formatValue(item.value, item.unit)}</strong>
                <p>{item.label}</p>
                {item.detail ? <small>{item.detail}</small> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ThesisPanel({ view }) {
  return (
    <div className={styles.panelGrid}>
      <section className={styles.prosePanel}>
        <span className={styles.sectionLabel}>TESIS ACTUAL</span>
        <h2>{view.thesis.summary}</h2>
        <div className={styles.driverPair}>
          <article><span>Principal impulsor</span><strong>{view.thesis.mainDriver}</strong></article>
          <article><span>Principal riesgo</span><strong>{view.thesis.mainRisk}</strong></article>
        </div>
      </section>
      <section className={styles.listPanel}>
        <div><span className={styles.sectionLabel}>QUÉ DEBE CUMPLIRSE</span>{view.thesis.drivers.length ? <ul>{view.thesis.drivers.map((item) => <li key={item}>{item}</li>)}</ul> : <EmptyRows />}</div>
        <div><span className={styles.sectionLabel}>QUÉ ROMPE LA TESIS</span>{view.thesis.risks.length ? <ul>{view.thesis.risks.map((item) => <li key={item}>{item}</li>)}</ul> : <EmptyRows />}</div>
      </section>
    </div>
  );
}

function ScenariosPanel({ view }) {
  if (!view.scenarios.length) return <EmptyRows>El motor está recalculando los escenarios para esta empresa.</EmptyRows>;
  return <div className={styles.scenarioGrid}>{view.scenarios.map((scenario) => <article key={scenario.key}><span>{scenario.label}</span><strong>{formatMoney(scenario.value, view.market.currency)}</strong><p>{scenario.explanation}</p></article>)}</div>;
}

function EvidencePanel({ view }) {
  const evidence = view.evidence;
  return (
    <div className={styles.panelGrid}>
      <section className={styles.evidenceScore}>
        <span className={styles.sectionLabel}>COBERTURA</span>
        <strong>{evidence.score === null ? "—" : `${Math.round(evidence.score)}%`}</strong>
        <p>{evidence.covered !== null && evidence.expected !== null ? `${evidence.covered} de ${evidence.expected} controles cubiertos.` : "Cobertura numérica no informada."}</p>
      </section>
      <section className={styles.evidenceLists}>
        <div><span className={styles.sectionLabel}>DISPONIBLE</span>{evidence.available.length ? evidence.available.map((item) => <p key={item.key}><strong>{item.label}</strong>{item.source ? <small>{item.source}</small> : null}</p>) : <EmptyRows />}</div>
        <div><span className={styles.sectionLabel}>BRECHAS Y CONTROLES</span>{evidence.missing.length ? evidence.missing.map((item) => <p key={item.key}><strong>{item.label}</strong></p>) : <p className={styles.complete}>Sin brechas requeridas.</p>}</div>
      </section>
    </div>
  );
}

function ChangesPanel({ view }) {
  if (!view.changes.length) return <EmptyRows>No existe una lectura anterior comparable para esta empresa.</EmptyRows>;
  return <div className={styles.changeList}>{view.changes.map((item, index) => <article key={item.key}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.label}</strong><p>{item.detail}</p></div></article>)}</div>;
}

function AuditPanel({ view }) {
  return (
    <div className={styles.auditPanel}>
      <div className={styles.auditMeta}>
        <span><small>Estado</small><strong>{view.audit.status}</strong></span>
        <span><small>Modelo</small><strong>{view.audit.modelVersion || "No informado"}</strong></span>
        <span><small>Método</small><strong>{view.audit.method || "No publicado"}</strong></span>
        <span><small>Lecturas guardadas</small><strong>{view.audit.runCount}</strong></span>
      </div>
      {view.audit.findings.length ? <div className={styles.findings}>{view.audit.findings.map((item) => <article key={item.key} data-severity={item.severity}><span>{item.severity}</span><p>{item.message}</p></article>)}</div> : <p className={styles.complete}>La auditoría no registra hallazgos abiertos.</p>}
    </div>
  );
}

function ClosurePlan({ items }) {
  if (!items.length) return null;
  return (
    <section className={styles.closure} aria-labelledby="closure-title">
      <div className={styles.closureLead}><span>PLAN DE CIERRE</span><h2 id="closure-title">Qué falta para salir de “En revisión”.</h2></div>
      <div className={styles.closureGrid}>{items.map((item) => <article key={item.key}><header><strong>{item.control}</strong><span>{item.resolvable ? "Resoluble" : "No resoluble"}</span></header><dl><div><dt>Por qué cambia la decisión</dt><dd>{item.why}</dd></div><div><dt>Impacto estimado</dt><dd>{item.estimatedImpact}</dd></div><div><dt>Fuente necesaria</dt><dd>{item.sourceNeeded}</dd></div><div><dt>Próxima acción</dt><dd>{item.nextAction}</dd></div></dl></article>)}</div>
    </section>
  );
}

export default function CompanyDecisionWorkspace({ initialView = null, publicMode = true, ticker, workspaceId = "" }) {
  const router = useRouter();
  const { language } = useLanguagePreference();
  const symbol = cleanTicker(ticker);
  const [view, setView] = useState(initialView);
  const [pending, setPending] = useState(!initialView);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("Valor");
  const [tickerDraft, setTickerDraft] = useState(symbol);
  const [saveState, setSaveState] = useState("idle");

  async function loadResearch(signal) {
    if (!symbol || (!publicMode && !workspaceId)) return;
    setPending(true);
    setError("");
    try {
      const payload = publicMode
        ? await parseResponse(await fetchWithTimeout("/api/public/equity-research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: symbol, mode: "quick" }),
          cache: "no-store",
          signal,
        }))
        : await parseResponse(await fetchWithTimeout(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/research/${encodeURIComponent(symbol)}?mode=quick`, { cache: "no-store", signal }));
      setView(buildCompanyDecisionView(payload));
    } catch (requestError) {
      if (requestError?.name !== "AbortError") setError(String(requestError?.message || requestError || "No pudimos cargar esta lectura."));
    } finally {
      if (!signal?.aborted) setPending(false);
    }
  }

  useEffect(() => {
    setTickerDraft(symbol);
    if (initialView) {
      setView(initialView);
      setPending(false);
      return undefined;
    }
    setView(null);
    const controller = new AbortController();
    loadResearch(controller.signal);
    return () => controller.abort();
  }, [initialView, publicMode, symbol, workspaceId]);

  const loginTarget = `/app/company/${encodeURIComponent(symbol)}`;
  const loginHref = `/login?intent=signin&next=${encodeURIComponent(loginTarget)}&lang=es`;
  const signupHref = `/signup?next=${encodeURIComponent(loginTarget)}&lang=es`;
  const panels = useMemo(() => ({
    Valor: <ValuePanel view={view} />,
    Tesis: <ThesisPanel view={view} />,
    Escenarios: <ScenariosPanel view={view} />,
    Evidencia: <EvidencePanel view={view} />,
    Cambios: <ChangesPanel view={view} />,
    Auditoría: <AuditPanel view={view} />,
  }), [view]);

  function submitTicker(event) {
    event.preventDefault();
    const nextTicker = cleanTicker(tickerDraft);
    if (!nextTicker) return;
    router.push(`${publicMode ? "/company" : "/app/company"}/${encodeURIComponent(nextTicker)}`);
  }

  async function saveToWatchlist() {
    if (!workspaceId || !view) return;
    setSaveState("saving");
    try {
      const response = await fetch(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/watchlists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: view.company.ticker,
          name: view.company.name,
          conviction: view.verdict.label,
          lastSignal: view.verdict.headline,
        }),
      });
      await parseResponse(response);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  if (!view) {
    return (
      <main className={styles.page}>
        <section className={styles.loadingState} aria-live="polite">
          <span>{pending ? "ANÁLISIS EN CURSO" : "LECTURA NO DISPONIBLE"}</span>
          <h1>{pending ? `Construyendo la lectura de ${symbol}…` : `No pudimos cerrar la lectura de ${symbol}.`}</h1>
          <p>{error || "Estamos conciliando mercado, estados, supuestos y evidencia."}</p>
          {!pending ? <button onClick={() => loadResearch()} type="button">Reintentar</button> : <i />}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.commandBar} aria-label="Cambiar empresa">
        <form onSubmit={submitTicker}><label htmlFor="company-ticker">Empresa</label><input id="company-ticker" onChange={(event) => setTickerDraft(cleanTicker(event.target.value))} placeholder="Ej. TXN" value={tickerDraft} /><button type="submit">Abrir</button></form>
        <p>{publicMode ? "Lectura pública · no se guarda" : "Workspace privado · historial activo"}</p>
      </section>

      <section className={styles.hero} data-verdict={view.verdict.kind}>
        <div className={styles.identity}>
          <div><span className={styles.ticker}>{view.company.ticker}</span><span>{view.company.exchange || "Mercado no informado"}</span></div>
          <h1>{view.company.name}</h1>
          {view.demo ? <p className={styles.demoBadge}><strong>{view.demo.label}</strong>{view.demo.disclosure}</p> : null}
        </div>

        <div className={styles.marketBlock}>
          <span>PRECIO OBSERVADO</span>
          <strong>{formatMoney(view.market.price, view.market.currency)}</strong>
          <p>{view.market.asOf ? `${view.market.state} · al ${formatDate(view.market.asOf)}` : view.market.state}</p>
          {view.market.source ? <small>{view.market.source}{view.market.contextual ? " · solo contexto" : ""}</small> : null}
        </div>

        <div className={styles.verdictBlock}>
          <div><span>ESTADO DEL ANÁLISIS</span><strong>{view.analysis.label}</strong></div>
          <p className={styles.verdictLabel}>{view.verdict.label}</p>
          <h2>{view.verdict.headline}</h2>
          <p>{view.verdict.explanation}</p>
        </div>

        <div className={styles.decisionDrivers}>
          <article><span>Impulsor principal</span><strong>{view.thesis.mainDriver}</strong></article>
          <article><span>Riesgo principal</span><strong>{view.thesis.mainRisk}</strong></article>
        </div>

        <div className={styles.actions}>
          {publicMode ? (
            <>
              <Link className={styles.primaryAction} href={signupHref}>Guardar en un workspace</Link>
              <Link href={loginHref}>Añadir a seguimiento</Link>
              <Link href="/factorlab?lang=es">Comparar</Link>
              <Link href={loginHref}>Ver impacto en portafolio</Link>
            </>
          ) : (
            <>
              <button className={styles.primaryAction} disabled={saveState === "saving" || saveState === "saved"} onClick={saveToWatchlist} type="button">{saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Añadida a seguimiento" : "Añadir a seguimiento"}</button>
              <Link href="/app#aurora">Abrir mesa AURORA</Link>
              <Link href="/factorlab?lang=es">Comparar</Link>
              <Link href="/app#holdings">Ver impacto en portafolio</Link>
              {saveState === "error" ? <span role="status">No se pudo guardar. Intenta otra vez.</span> : null}
            </>
          )}
        </div>
      </section>

      {!publicMode && workspaceId ? <SignalIntelligencePanel focusAsset={symbol} language={language} workspaceId={workspaceId} /> : null}

      <ClosurePlan items={view.closurePlan} />

      <section className={styles.researchBody}>
        <nav aria-label="Capas de la investigación" className={styles.tabs}>{TABS.map((tab) => <button aria-selected={activeTab === tab} data-active={activeTab === tab} key={tab} onClick={() => setActiveTab(tab)} role="tab" type="button">{tab}</button>)}</nav>
        <div aria-live="polite" className={styles.tabPanel} role="tabpanel">{panels[activeTab]}</div>
      </section>

      <footer className={styles.disclaimer}>Software de investigación. No es asesoría financiera ni ejecuta operaciones.</footer>
    </main>
  );
}
