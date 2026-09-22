"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./private-carteras-dashboard.module.css";

const labels = {
  possible_contradiction: "Posible contradicción",
  possible_support: "Evidencia compatible con la premisa",
  needs_review: "Revisión pendiente",
};
const sectionNames = { thesis: "Tesis central", bull: "Caso favorable", bear: "Contraargumento", risks: "Riesgos", catalysts: "Hitos", invalidation: "Qué la invalidaría" };
const date = (value) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(value)) : "Sin revisión";

export default function LivingCasesPanel({ holdings = [] }) {
  const [state, setState] = useState({ busy: true, data: null, error: "", message: "", checking: "" });
  async function load() {
    try {
      const response = await fetch("/api/research/living-case", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo consultar el seguimiento.");
      const data = await response.json();
      setState((previous) => ({ ...previous, busy: false, data, error: "" }));
    } catch (error) { setState((previous) => ({ ...previous, busy: false, error: error.message })); }
  }
  useEffect(() => { load(); }, []);
  async function check(ticker) {
    setState((previous) => ({ ...previous, checking: ticker, message: "", error: "" }));
    try {
      const response = await fetch("/api/research/living-case", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh", ticker }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === "CASE_NOT_FOUND" ? "La empresa ya no se sigue en este espacio." : "No se pudo comprobar la evidencia ahora.");
      await load();
      setState((previous) => ({ ...previous, message: result.status === "recently_checked"
        ? `${ticker}: ya se comprobó durante la última hora.`
        : `${ticker}: ${result.newSources} documento(s) nuevo(s) en el conjunto consultado.${result.morePending ? " Quedan documentos por revisar en la próxima comprobación." : ""}` }));
    } catch (error) { setState((previous) => ({ ...previous, error: error.message })); }
    finally { setState((previous) => ({ ...previous, checking: "" })); }
  }
  const weights = new Map(holdings.map((row) => [row.ticker, row.weightOfKnown]));
  const cases = state.data?.cases || [];
  const events = state.data?.events || [];
  return <section className={styles.riskPanel} aria-label="Seguimiento de tesis" style={{ marginTop: 22 }}>
    <div className={styles.sectionHeader}><div><span className={styles.eyebrow}>Investigación que continúa</span><h2>Qué cambió para mi cartera</h2><p>Compara documentos nuevos con las premisas de las tesis que sigues. Las señales piden revisión humana.</p></div></div>
    {state.busy ? <p role="status">Cargando seguimiento…</p> : null}
    {state.error ? <p role="alert">{state.error}</p> : null}
    {state.message ? <p role="status">{state.message}</p> : null}
    {!state.busy && !cases.length ? <p>Genera una tesis para una empresa y elige «Seguir esta tesis» para empezar. Puedes comenzar con una de tus posiciones.</p> : null}
    <div className={styles.caseList}>{cases.map((item) => {
      const related = events.filter((event) => event.ticker === item.ticker).slice(0, 5);
      const weight = weights.get(item.ticker);
      return <article className={styles.caseCard} key={item.ticker}>
        <div className={styles.caseHeading}><div><h3>{item.ticker}</h3><small>Línea base documental: {date(item.baselineAsOf)} · última comprobación: {date(item.lastCheckedAt)}{typeof weight === "number" ? ` · ${(weight * 100).toFixed(1)} % del valor conocido` : " · fuera de las posiciones valoradas"}</small></div><div className={styles.caseActions}><button type="button" onClick={() => check(item.ticker)} disabled={Boolean(state.checking)}>{state.checking === item.ticker ? "Comprobando…" : "Comprobar documentos"}</button><Link href={`/research?ticker=${encodeURIComponent(item.ticker)}&view=thesis&lang=es`}>Investigación actual</Link></div></div>
        <details><summary>Ver tesis guardada</summary><div className={styles.caseBaseline}>{(item.baselineSections || []).map((section) => <section key={section.id}><h4>{sectionNames[section.id] || section.id}</h4>{section.findings.length ? section.findings.map((finding, index) => <div key={index}><p><strong>Premisa:</strong> {finding.premise}</p><p><strong>Interpretación:</strong> {finding.text}</p></div>) : <p>Sin conclusión verificable en los extractos guardados.</p>}</section>)}</div></details>
        {related.length ? <ul className={styles.eventList}>{related.map((event, index) => <li key={`${event.source?.accession}:${event.claim?.id || 'document'}:${index}`}>
          <span className={styles.eyebrow}>{event.kind === "new_document" ? "Nuevo documento" : labels[event.reviewStatus] || labels.needs_review}</span>
          <p>{event.claim ? `${event.claim.section}: ${event.claim.premise}` : `${event.source?.form || "Documento"} presentado el ${date(event.source?.acceptedAt)}`}</p>
          {event.excerpt ? <details><summary>Ver extracto seleccionado</summary><blockquote>{event.excerpt}</blockquote></details> : null}
          {event.source?.url ? <a href={event.source.url} target="_blank" rel="noreferrer">Fuente original · {date(event.source.acceptedAt)}</a> : null}
        </li>)}</ul> : <p className={styles.caseQuiet}>Aún no hay documentos nuevos registrados desde esta tesis.</p>}
      </article>;
    })}</div>
    <p className={styles.caseQuiet}>Cobertura: documentos SEC seleccionados para cada empresa. La ausencia de una señal no confirma que la tesis siga vigente; Jev compara texto citado, no resultados de inversión.</p>
  </section>;
}
