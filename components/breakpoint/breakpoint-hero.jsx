"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./breakpoint.module.css";

const REQUEST_TIMEOUT_MS = 45_000;
const TICKER_PATTERN = /^[A-Z][A-Z.\-]{0,11}$/;

const COPY = {
  es: {
    eyebrow: "BLS PRIME · ESPACIO DE DECISIÓN",
    title: "Antes de invertir, entiende qué necesita el precio.",
    body: "Conecta descubrimiento, precio y valor, efecto en cartera y monitoreo. Cada lectura muestra su fecha, sus fuentes y sus supuestos para ayudarte a actuar o pasar.",
    label: "Ticker estadounidense",
    placeholder: "Ej. TICKER",
    submit: "Analizar empresa",
    submitting: "Analizando…",
    retry: "Reintentar",
    helper: "Primera lectura sin cuenta.",
    demo: "Explorar una demo",
    guarantees: [
      "Primera lectura sin cuenta",
      "Fecha, fuente y supuestos visibles",
      "Si falta evidencia, te decimos exactamente cuál",
    ],
    stages: [
      "Validando el ticker…",
      "Buscando datos públicos (SEC / mercado)…",
      "Leyendo estados financieros…",
      "Calculando lo que el precio exige…",
      "Preparando la lectura…",
    ],
    errors: {
      EMPTY: "Escribe un ticker para continuar.",
      FORMAT: "Formato no válido. Usa letras, punto o guion (por ejemplo BRK.B).",
      INVALID_INPUT: "Ese ticker no es válido para esta lectura. Prueba con otra empresa con cobertura SEC.",
      INVALID_REQUEST: "No pudimos leer la solicitud. Vuelve a intentarlo.",
      RATE_LIMITED: "Demasiadas lecturas seguidas. Espera un minuto y vuelve a intentarlo.",
      DATA_UNAVAILABLE: "No hay datos públicos suficientes para construir esta lectura. Prueba otro ticker con cobertura SEC.",
      TIMEOUT: "La lectura superó los 45 segundos y se detuvo. Tu ticker sigue en el campo: puedes reintentar.",
      NETWORK: "No hay conexión con el servicio de datos. Revisa tu red y reintenta.",
      UNKNOWN: "Algo falló al construir la lectura. Puedes reintentar o probar otro ticker.",
    },
    temporaryReady: "La lectura está lista.",
    temporaryTitle: "Lectura inicial",
    requirements: "Lo que el precio necesitaría",
    risk: "Lo que podría romper la lectura",
    temporaryNotice: "No se guardó un enlace compartible; puedes revisar esta lectura ahora mismo.",
    asOfUnknown: "Fecha de datos no informada por la fuente",
    asOfLabel: "Datos al",
  },
  en: {
    eyebrow: "BLS PRIME · INVESTMENT DECISION WORKSPACE",
    title: "Before you invest, understand what the price needs.",
    body: "Connect discovery, price and value, portfolio impact, and monitoring. Every reading shows its date, sources, and assumptions so you can act or pass.",
    label: "US ticker",
    placeholder: "E.g. TICKER",
    submit: "Analyze company",
    submitting: "Analyzing…",
    retry: "Try again",
    helper: "First reading without an account.",
    demo: "Explore a demo",
    guarantees: [
      "First reading without an account",
      "Visible date, source, and assumptions",
      "If evidence is missing, we tell you exactly what",
    ],
    stages: [
      "Validating the ticker…",
      "Fetching public data (SEC / market)…",
      "Reading financial statements…",
      "Computing what the price requires…",
      "Preparing the reading…",
    ],
    errors: {
      EMPTY: "Enter a ticker to continue.",
      FORMAT: "Invalid format. Use letters, a dot, or a hyphen (for example BRK.B).",
      INVALID_INPUT: "That ticker is not valid for this reading. Try another SEC-covered company.",
      INVALID_REQUEST: "We could not read the request. Please try again.",
      RATE_LIMITED: "Too many readings in a row. Wait a minute and try again.",
      DATA_UNAVAILABLE: "There is not enough public data to build this reading. Try another SEC-covered ticker.",
      TIMEOUT: "The reading passed 45 seconds and was stopped. Your ticker is still in the field: you can retry.",
      NETWORK: "No connection to the data service. Check your network and retry.",
      UNKNOWN: "Something failed while building the reading. Retry or try another ticker.",
    },
    temporaryReady: "The reading is ready.",
    temporaryTitle: "First reading",
    requirements: "What the price would need",
    risk: "What could break the reading",
    temporaryNotice: "A shareable link was not saved; you can review this reading now.",
    asOfUnknown: "Data date not reported by the source",
    asOfLabel: "Data as of",
  },
};

const STATUS_CODE_MAP = {
  400: "INVALID_REQUEST",
  422: "INVALID_INPUT",
  429: "RATE_LIMITED",
  503: "DATA_UNAVAILABLE",
  504: "TIMEOUT",
};

function validateTicker(raw) {
  const value = String(raw || "").trim().toUpperCase();
  if (!value) return { ok: false, code: "EMPTY" };
  if (!TICKER_PATTERN.test(value)) return { ok: false, code: "FORMAT" };
  return { ok: true, value };
}

function resolveAsOf(run, copy, language) {
  const raw =
    run?.provenance?.asOf ||
    run?.market?.asOf ||
    run?.asOf ||
    run?.market?.price?.asOf ||
    null;
  if (!raw) return { known: false, text: copy.asOfUnknown };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { known: false, text: copy.asOfUnknown };
  const formatted = new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-ES", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(parsed);
  return { known: true, text: `${copy.asOfLabel} ${formatted}` };
}

export function BreakpointHero({ language = "es" }) {
  const router = useRouter();
  const copy = COPY[language] || COPY.es;
  const [ticker, setTicker] = useState("");
  // status: idle | loading | error | ready | navigating
  const [state, setState] = useState({ status: "idle", code: null, message: "" });
  const [stageIndex, setStageIndex] = useState(0);
  const [temporaryRun, setTemporaryRun] = useState(null);
  const abortRef = useRef(null);
  const timeoutRef = useRef(null);
  const stageTimerRef = useRef(null);
  const navigationWatchdogRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearTimeout(timeoutRef.current);
      clearInterval(stageTimerRef.current);
      clearTimeout(navigationWatchdogRef.current);
    };
  }, []);

  // Only the in-flight request timers. The navigation watchdog outlives the
  // fetch on purpose and is cleared on unmount or when a new run starts.
  const clearTimers = useCallback(() => {
    clearTimeout(timeoutRef.current);
    clearInterval(stageTimerRef.current);
    timeoutRef.current = null;
    stageTimerRef.current = null;
  }, []);

  const fail = useCallback(
    (code) => {
      if (!mountedRef.current) return;
      clearTimers();
      setState({ status: "error", code, message: copy.errors[code] || copy.errors.UNKNOWN });
    },
    [clearTimers, copy],
  );

  const run = useCallback(async () => {
    clearTimeout(navigationWatchdogRef.current);
    navigationWatchdogRef.current = null;

    const validation = validateTicker(ticker);
    if (!validation.ok) {
      fail(validation.code);
      return;
    }

    setTemporaryRun(null);
    setStageIndex(0);
    setState({ status: "loading", code: null, message: copy.stages[0] });

    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;

    stageTimerRef.current = setInterval(() => {
      setStageIndex((index) => Math.min(index + 1, copy.stages.length - 1));
    }, 4000);

    timeoutRef.current = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("/api/public/breakpoints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker: validation.value, hurdleRate: 0.1, locale: language }),
        signal: controller.signal,
      });

      let result = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (!response.ok || !result?.ok) {
        fail(result?.code && copy.errors[result.code] ? result.code : STATUS_CODE_MAP[response.status] || "UNKNOWN");
        return;
      }

      if (result?.run && result?.durable === false) {
        clearTimers();
        if (!mountedRef.current) return;
        setTemporaryRun(result.run);
        setState({ status: "ready", code: null, message: result?.storageWarning || copy.temporaryReady });
        return;
      }

      if (!result?.runId) {
        fail("DATA_UNAVAILABLE");
        return;
      }

      clearTimers();
      if (!mountedRef.current) return;
      setState({ status: "navigating", code: null, message: copy.stages[copy.stages.length - 1] });
      const target = `/breakpoint/${encodeURIComponent(result.ticker)}/${encodeURIComponent(result.runId)}?lang=${language}`;
      // Watchdog: if the route transition never lands, hand the controls back
      // instead of leaving the button disabled forever.
      navigationWatchdogRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setState({ status: "error", code: "UNKNOWN", message: copy.errors.UNKNOWN });
      }, 15_000);
      router.push(target);
    } catch (error) {
      if (timedOut) fail("TIMEOUT");
      else if (error?.name === "AbortError") fail("TIMEOUT");
      else fail("NETWORK");
    } finally {
      clearTimers();
      abortRef.current = null;
    }
  }, [clearTimers, copy, fail, language, router, ticker]);

  function onSubmit(event) {
    event.preventDefault();
    run();
  }

  const busy = state.status === "loading" || state.status === "navigating";
  const statusText = state.status === "loading" ? copy.stages[stageIndex] : state.message;
  const asOf = temporaryRun ? resolveAsOf(temporaryRun, copy, language) : null;

  return (
    <section className={styles.hero} aria-labelledby="breakpoint-title">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1 id="breakpoint-title">{copy.title}</h1>
        <p className={styles.body}>{copy.body}</p>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <label htmlFor="breakpoint-ticker">{copy.label}</label>
          <div className={styles.formRow}>
            <input
              aria-describedby="breakpoint-helper breakpoint-status"
              aria-invalid={state.status === "error"}
              autoCapitalize="characters"
              autoCorrect="off"
              id="breakpoint-ticker"
              maxLength={12}
              onChange={(event) => {
                setTicker(event.target.value.toUpperCase());
                if (state.status === "error") setState({ status: "idle", code: null, message: "" });
              }}
              placeholder={copy.placeholder}
              spellCheck="false"
              value={ticker}
            />
            <button type="submit" disabled={busy}>
              {busy ? copy.submitting : copy.submit}
            </button>
          </div>
          <p className={styles.helper} id="breakpoint-helper">
            {copy.helper}
          </p>
          <p
            className={styles.status}
            id="breakpoint-status"
            role="status"
            aria-live="polite"
            data-error={state.status === "error"}
          >
            {statusText}
          </p>
          {state.status === "error" ? (
            <button className={styles.retryButton} onClick={run} type="button">
              {copy.retry}
            </button>
          ) : null}
        </form>
        <a className={styles.demoLink} href="#demo">
          {copy.demo}
          <span aria-hidden="true">↓</span>
        </a>
        <ul className={styles.guarantees} aria-label={language === "en" ? "Reading guarantees" : "Garantías de la lectura"}>
          {copy.guarantees.map((guarantee) => (
            <li key={guarantee}>{guarantee}</li>
          ))}
        </ul>
        {temporaryRun ? (
          <section className={styles.temporaryRun} aria-live="polite">
            <p>
              {copy.temporaryTitle} · {temporaryRun.ticker}
            </p>
            <p className={styles.asOf} data-unknown={!asOf.known}>
              {asOf.text}
            </p>
            <h2>
              {temporaryRun.market?.family?.narrative || temporaryRun.limitations?.[0] || copy.temporaryReady}
            </h2>
            <div>
              <span>{copy.requirements}</span>
              <strong>{temporaryRun.breakpoint?.bull?.statement || "—"}</strong>
            </div>
            <div>
              <span>{copy.risk}</span>
              <strong>
                {temporaryRun.breakpoint?.bear?.statement || temporaryRun.monitor?.falsifier || "—"}
              </strong>
            </div>
            <small>{copy.temporaryNotice}</small>
          </section>
        ) : null}
      </div>
      <div className={styles.surface} aria-hidden="true">
        <div className={styles.surfaceHeader}>
          <span>{language === "en" ? "WHAT THE PRICE NEEDS" : "LO QUE EL PRECIO NECESITA"}</span>
          <span>{language === "en" ? "5 YEARS · 10%" : "5 AÑOS · 10%"}</span>
        </div>
        <div className={styles.surfacePlot}>
          <span className={styles.axisY}>{language === "en" ? "PROFITABILITY" : "RENTABILIDAD"}</span>
          <span className={styles.axisX}>{language === "en" ? "GROWTH" : "CRECIMIENTO"}</span>
          <svg viewBox="0 0 560 330" role="presentation">
            <path
              className={styles.grid}
              d="M35 42H530M35 106H530M35 170H530M35 234H530M35 298H530M92 20V298M174 20V298M256 20V298M338 20V298M420 20V298M502 20V298"
            />
            <path
              className={styles.feasible}
              d="M58 246C125 236 157 218 206 183C252 151 291 132 338 126C392 118 437 78 505 43L505 298L58 298Z"
            />
            <path
              className={styles.boundary}
              d="M58 246C125 236 157 218 206 183C252 151 291 132 338 126C392 118 437 78 505 43"
            />
            <circle className={styles.anchor} cx="338" cy="126" r="6" />
          </svg>
          <div className={styles.surfaceNote}>
            <span>{language === "en" ? "ILLUSTRATIVE SHAPE · NOT LIVE DATA" : "FORMA ILUSTRATIVA · NO SON DATOS EN VIVO"}</span>
            <strong>
              {language === "en"
                ? "sustained growth and profitability"
                : "crecimiento y rentabilidad sostenidos"}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}
