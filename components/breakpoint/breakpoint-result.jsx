"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "./breakpoint.module.css";
import { buildBreakpointCompanyLinks } from "@/lib/breakpoint/navigation";
import { localizeBreakpointDriver, localizeBreakpointSourceCategory, localizeBreakpointStatus } from "@/lib/breakpoint/presentation";

const COPY = {
  es: { loading: "Cargando lectura…", unavailable: "Esta lectura no está disponible.", eyebrow: "BLS BREAKPOINT · LECTURA DE EMPRESA", priceRequires: "Lo que el precio necesita", bull: "Si la empresa cumple", bear: "Si la empresa falla", monitor: "Qué conviene vigilar", provenance: "Datos y procedencia", limitations: "Lo que esta lectura no puede decir", terminal: "Ver valoración completa en la ficha", queue: "Añadir a cola · requiere cuenta", disclaimer: "Software de análisis. No constituye asesoría financiera.", dataDate: "Fecha de datos", requiredReturn: "Retorno exigido a 5 años", feasibility: "SUPUESTOS", growth: "CRECIMIENTO DE INGRESOS", margin: "MARGEN OPERATIVO", primary: "FACTOR PRINCIPAL", flip: "Dos caminos posibles" },
  en: { loading: "Loading company reading…", unavailable: "This reading is unavailable.", eyebrow: "BLS BREAKPOINT · COMPANY READING", priceRequires: "What the price needs", bull: "If the company delivers", bear: "If the company falls short", monitor: "What to monitor", provenance: "Data and sources", limitations: "What this reading cannot tell you", terminal: "See full valuation in company page", queue: "Add to queue · account required", disclaimer: "Research software. Not financial advice.", dataDate: "Data date", requiredReturn: "5-year required return", feasibility: "ASSUMPTIONS", growth: "REVENUE GROWTH", margin: "OPERATING MARGIN", primary: "MAIN DRIVER", flip: "Two possible paths" },
};

function percent(value) { return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "—"; }
function date(value) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—"; }

export function BreakpointResult({ runId, language = "es" }) {
  const copy = COPY[language] || COPY.es;
  const [state, setState] = useState({ status: "loading", run: null, message: "" });
  useEffect(() => {
    let active = true;
    fetch(`/api/public/breakpoints/${encodeURIComponent(runId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok || !body?.ok) throw new Error(body?.message || copy.unavailable);
        if (active) setState({ status: "ready", run: body.run, message: "" });
      })
      .catch(() => active && setState({ status: "error", run: null, message: copy.unavailable }));
    return () => { active = false; };
  }, [runId, copy.unavailable]);

  if (state.status === "loading") return <main className={styles.resultShell}><p className={styles.loading} aria-live="polite">{copy.loading}</p></main>;
  if (state.status === "error") return <main className={styles.resultShell}><p className={styles.loading} aria-live="polite">{state.message}</p></main>;
  const run = state.run?.payload || state.run;
  const attention = run.status !== "ready";
  const links = buildBreakpointCompanyLinks(run.ticker, language);
  return <main className={styles.resultShell}>
    <header className={styles.resultTop}><Link href={`/?lang=${language}`} className={styles.wordmark}>BLS Prime</Link><span>{run.ticker} · {run.model?.omegaVersion || "BREAKPOINT V1"}</span></header>
    <section className={styles.resultLead} aria-labelledby="breakpoint-result-title">
      <p className={styles.eyebrow}>{copy.eyebrow}</p>
      <h1 id="breakpoint-result-title">{attention ? copy.unavailable : run.market.family.narrative}</h1>
      {!attention && <p className={styles.leadText}>{run.market.family.fragility}</p>}
      <div className={styles.metricStrip}>
        <div><span>{copy.requiredReturn}</span><strong>{percent(run.hurdle?.rate)}</strong></div>
        <div><span>{copy.dataDate}</span><strong>{date(run.provenance?.asOf)}</strong></div>
        <div><span>{copy.feasibility}</span><strong>{localizeBreakpointStatus(run.market?.feasibility?.contourClass, language)}</strong></div>
      </div>
    </section>
    {!attention && <>
      <section className={styles.readingSection}><h2>{copy.priceRequires}</h2><dl className={styles.requirements}><div><dt>{copy.growth}</dt><dd>{percent(run.market.anchor?.growth)}</dd></div><div><dt>{copy.margin}</dt><dd>{percent(run.market.anchor?.margin)}</dd></div><div><dt>{copy.primary}</dt><dd>{localizeBreakpointDriver(run.breakpoint.primaryLever, language)}</dd></div></dl></section>
      <section className={styles.flipGrid} aria-label={copy.flip}><Flip title={copy.bull} flip={run.breakpoint.bull} language={language} /><Flip title={copy.bear} flip={run.breakpoint.bear} language={language} /></section>
      <section className={styles.monitor}><span>{copy.monitor}</span><strong>{localizeBreakpointDriver(run.monitor.primaryDriver, language)}</strong><p>{run.monitor.falsifier || "—"}</p></section>
    </>}
    <section className={styles.detailGrid}><div><h2>{copy.provenance}</h2><ul className={styles.sources}>{(run.provenance?.sources || []).map((source, index) => <li key={`${source.label}-${index}`}><span>{localizeBreakpointSourceCategory(source.category, language)}</span><strong>{source.label}</strong><small>{date(source.date)}</small></li>)}</ul></div><div><h2>{copy.limitations}</h2><ul className={styles.limitations}>{(run.limitations || []).map((item) => <li key={item}>{item}</li>)}</ul></div></section>
    <footer className={styles.resultFooter}><p>{copy.disclaimer}</p><div className={styles.resultActions}><Link href={links.company} className={styles.terminalLink}>{copy.terminal} <span>→</span></Link><Link href={links.queue} className={styles.queueLink}>{copy.queue}</Link></div></footer>
  </main>;
}

function Flip({ title, flip, language }) { return <article className={styles.flip}><span>{title}</span><h2>{flip?.statement || "—"}</h2><dl>{(flip?.changes || []).map((change) => <div key={change.driver}><dt>{localizeBreakpointDriver(change.driver, language)}</dt><dd>{percent(change.from)} → {percent(change.to)}</dd></div>)}</dl></article>; }
