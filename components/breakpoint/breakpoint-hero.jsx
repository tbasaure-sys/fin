"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./breakpoint.module.css";

const COPY = {
  es: {
    eyebrow: "BLS BREAKPOINT · RESEARCH PÚBLICO",
    title: "Ve qué tendría que ser cierto al precio de hoy.",
    body: "No otra valoración genérica. BLS revela el mínimo cambio operativo que vuelve defendible —o rompe— una acción.",
    label: "Ticker estadounidense",
    placeholder: "Ej. ASML",
    submit: "Ver el punto de quiebre",
    loading: "Trazando la superficie de expectativas…",
    helper: "Sin cuenta. Datos públicos y supuestos visibles.",
    error: "No pudimos construir un punto de quiebre con datos actuales. Prueba otro ticker en cobertura SEC.",
  },
  en: {
    eyebrow: "BLS BREAKPOINT · PUBLIC RESEARCH",
    title: "See what must be true at today’s price.",
    body: "Not another generic valuation. BLS exposes the smallest operating shift that makes a stock defensible — or breaks it.",
    label: "US ticker",
    placeholder: "E.g. ASML",
    submit: "See the breakpoint",
    loading: "Tracing the expectations surface…",
    helper: "No account. Public data and visible assumptions.",
    error: "BLS could not establish a breakpoint from current data. Try another SEC-covered ticker.",
  },
};

export function BreakpointHero({ language = "es" }) {
  const router = useRouter();
  const copy = COPY[language] || COPY.es;
  const [ticker, setTicker] = useState("ASML");
  const [state, setState] = useState({ status: "idle", message: "" });

  async function onSubmit(event) {
    event.preventDefault();
    setState({ status: "loading", message: copy.loading });
    try {
      const response = await fetch("/api/public/breakpoints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker, hurdleRate: 0.1, locale: language }),
      });
      const result = await response.json();
      if (!response.ok || !result?.ok || !result?.runId) throw new Error(result?.message || copy.error);
      router.push(`/breakpoint/${encodeURIComponent(result.ticker)}/${encodeURIComponent(result.runId)}?lang=${language}`);
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : copy.error });
    }
  }

  return (
    <section className={styles.hero} aria-labelledby="breakpoint-title">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1 id="breakpoint-title">{copy.title}</h1>
        <p className={styles.body}>{copy.body}</p>
        <form className={styles.form} onSubmit={onSubmit}>
          <label htmlFor="breakpoint-ticker">{copy.label}</label>
          <div className={styles.formRow}>
            <input id="breakpoint-ticker" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder={copy.placeholder} autoCapitalize="characters" autoCorrect="off" spellCheck="false" maxLength={12} required />
            <button type="submit" disabled={state.status === "loading"}>{state.status === "loading" ? copy.loading : copy.submit}</button>
          </div>
          <p className={styles.helper}>{copy.helper}</p>
          <p className={styles.status} aria-live="polite" data-error={state.status === "error"}>{state.message}</p>
        </form>
      </div>
      <div className={styles.surface} aria-hidden="true">
        <div className={styles.surfaceHeader}><span>MARKET-CLEARING SURFACE</span><span>5Y · 10%</span></div>
        <div className={styles.surfacePlot}>
          <span className={styles.axisY}>OPERATING MARGIN</span>
          <span className={styles.axisX}>REVENUE CAGR</span>
          <svg viewBox="0 0 560 330" role="presentation">
            <path className={styles.grid} d="M35 42H530M35 106H530M35 170H530M35 234H530M35 298H530M92 20V298M174 20V298M256 20V298M338 20V298M420 20V298M502 20V298" />
            <path className={styles.feasible} d="M58 246C125 236 157 218 206 183C252 151 291 132 338 126C392 118 437 78 505 43L505 298L58 298Z" />
            <path className={styles.boundary} d="M58 246C125 236 157 218 206 183C252 151 291 132 338 126C392 118 437 78 505 43" />
            <circle className={styles.anchor} cx="338" cy="126" r="6" />
          </svg>
          <div className={styles.surfaceNote}><span>WHAT PRICE REQUIRES</span><strong>growth + margin durability</strong></div>
        </div>
      </div>
    </section>
  );
}
