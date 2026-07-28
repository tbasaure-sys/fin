"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StressAccountGate } from "@/components/stress-account-gate";
import styles from "@/components/stress-portfolio-demo.module.css";

const DEFAULT_HOLDINGS = [
  { ticker: "MSFT", name: "Microsoft", weightPct: 28 },
  { ticker: "GOOGL", name: "Alphabet", weightPct: 22 },
  { ticker: "JPM", name: "JPMorgan Chase", weightPct: 20 },
  { ticker: "XOM", name: "Exxon Mobil", weightPct: 18 },
  { ticker: "SGOV", name: "US Treasury 0-3M", weightPct: 12 },
];

const CANDIDATES = [
  { ticker: "NVDA", name: "NVIDIA" },
  { ticker: "AMD", name: "AMD" },
  { ticker: "LLY", name: "Eli Lilly" },
];

const COPY = {
  es: {
    eyebrow: "Laboratorio público · motor funcional",
    title: "Edita una cartera y comprueba dónde se rompe.",
    body: "Cambia los pesos, agrega una empresa y ejecuta el mismo motor de escenarios que usa el espacio privado. Esta cartera es un ejemplo editable; los resultados no son una demo prefabricada.",
    portfolio: "Cartera actual",
    weight: "Peso",
    total: "Suma ingresada",
    normalized: "El motor normaliza los pesos a 100% antes de calcular.",
    candidate: "Empresa a evaluar",
    candidateWeight: "Peso propuesto",
    run: "Ejecutar stress",
    rerun: "Recalcular",
    running: "Calculando 5.000 escenarios…",
    retry: "Reintentar",
    changed: "Hay cambios sin calcular.",
    error: "No pudimos ejecutar la simulación.",
    current: "Ahora",
    proposed: "Con la empresa",
    cvar: "Pérdida media en el peor 5%",
    loss: "Escenarios con pérdida",
    concentration: "Peso de las 2 mayores",
    effective: "Posiciones efectivas",
    tail: "Quién explica las pérdidas severas",
    exposure: "Exposición por sector",
    contribution: "aporte a la pérdida",
    better: "reduce",
    worse: "aumenta",
    unchanged: "no cambia",
    sentenceStart: "Agregar",
    sentenceTail: "la pérdida severa estimada",
    sentenceConcentration: "y cambia la concentración de las dos mayores en",
    points: "puntos porcentuales",
    provenance: "Procedencia del cálculo",
    example: "Cartera de ejemplo editable",
    notLive: "No usa precios live ni predice el mercado.",
    modelDate: "Escenarios generados",
    coverage: "Cobertura del banco",
    scenarios: "escenarios",
    account: "Aplicar a mi cartera real — requiere cuenta",
    sectors: {
      Technology: "Tecnología",
      "Communication Services": "Servicios de comunicación",
      Financials: "Finanzas",
      Energy: "Energía",
      "Cash & Treasuries": "Caja y bonos del Tesoro",
      "Health Care": "Salud",
    },
  },
  en: {
    eyebrow: "Public lab · working engine",
    title: "Edit a portfolio and see where it breaks.",
    body: "Change the weights, add a company, and run the same scenario engine used by the private workspace. This is an editable example portfolio; the results are not a canned demo.",
    portfolio: "Current portfolio",
    weight: "Weight",
    total: "Entered total",
    normalized: "The engine normalizes weights to 100% before calculation.",
    candidate: "Company to evaluate",
    candidateWeight: "Proposed weight",
    run: "Run stress test",
    rerun: "Recalculate",
    running: "Calculating 5,000 scenarios…",
    retry: "Try again",
    changed: "There are uncalculated changes.",
    error: "We could not run the simulation.",
    current: "Current",
    proposed: "With company",
    cvar: "Average loss in the worst 5%",
    loss: "Scenarios with a loss",
    concentration: "Weight of top 2",
    effective: "Effective positions",
    tail: "What drives severe losses",
    exposure: "Sector exposure",
    contribution: "loss contribution",
    better: "reduces",
    worse: "increases",
    unchanged: "does not change",
    sentenceStart: "Adding",
    sentenceTail: "estimated severe loss",
    sentenceConcentration: "and changes top-two concentration by",
    points: "percentage points",
    provenance: "Calculation provenance",
    example: "Editable example portfolio",
    notLive: "It does not use live prices or predict the market.",
    modelDate: "Scenarios generated",
    coverage: "Scenario-bank coverage",
    scenarios: "scenarios",
    account: "Apply to my real portfolio — account required",
    sectors: {},
  },
};

function pct(value, language, digits = 1) {
  if (!Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat(language === "es" ? "es-CL" : "en-US", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function number(value, language, digits = 1) {
  if (!Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat(language === "es" ? "es-CL" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function dateLabel(value, language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "es" ? "es-CL" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function ResultColumn({ label, result, language, copy }) {
  return (
    <article className={styles.resultColumn}>
      <p className={styles.resultLabel}>{label}</p>
      <div className={styles.metricList}>
        <div><span>{copy.cvar}</span><strong>{pct(result.risk.cvar5, language)}</strong></div>
        <div><span>{copy.loss}</span><strong>{pct(result.risk.probabilityLoss, language)}</strong></div>
        <div><span>{copy.concentration}</span><strong>{pct(result.concentration.topTwoWeight, language)}</strong></div>
        <div><span>{copy.effective}</span><strong>{number(result.concentration.effectivePositions, language)}</strong></div>
      </div>
      <div className={styles.detailBlock}>
        <h4>{copy.exposure}</h4>
        {result.exposures.slice(0, 4).map((row) => (
          <div className={styles.barRow} key={row.sector}>
            <span>{copy.sectors[row.sector] || row.sector}</span>
            <i><b style={{ width: `${Math.min(100, row.weight * 100)}%` }} /></i>
            <em>{pct(row.weight, language, 0)}</em>
          </div>
        ))}
      </div>
      <div className={styles.detailBlock}>
        <h4>{copy.tail}</h4>
        <ol className={styles.contributors}>
          {result.tailContributors.slice(0, 3).map((row) => (
            <li key={row.ticker}>
              <Link href={`/company/${row.ticker}?lang=${language}`}>{row.ticker}</Link>
              <span>{pct(row.contribution, language)} {copy.contribution}</span>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

export function StressPortfolioDemo({ language = "es" }) {
  const copy = COPY[language] || COPY.es;
  const [holdings, setHoldings] = useState(DEFAULT_HOLDINGS);
  const [candidateTicker, setCandidateTicker] = useState("NVDA");
  const [candidateWeight, setCandidateWeight] = useState(10);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);

  const totalWeight = useMemo(
    () => holdings.reduce((sum, row) => sum + Number(row.weightPct || 0), 0),
    [holdings],
  );

  const runSimulation = useCallback(async () => {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/public/stress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          holdings: holdings.map(({ ticker, weightPct }) => ({ ticker, weightPct })),
          candidate: { ticker: candidateTicker, weightPct: candidateWeight },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || copy.error);
      setResult(payload);
      setDirty(false);
      setStatus("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.error);
      setStatus("error");
    }
  }, [candidateTicker, candidateWeight, copy.error, holdings]);

  useEffect(() => {
    runSimulation();
  }, []); // The initial example is calculated once; later edits require an explicit rerun.

  function updateHolding(ticker, nextValue) {
    const weightPct = Math.max(1, Math.min(70, Number(nextValue) || 1));
    setHoldings((rows) => rows.map((row) => (row.ticker === ticker ? { ...row, weightPct } : row)));
    setDirty(true);
  }

  const cvarDeltaPoints = (result?.comparison?.cvar5Delta || 0) * 100;
  const concentrationDeltaPoints = (result?.comparison?.topTwoWeightDelta || 0) * 100;
  const riskVerb = cvarDeltaPoints > 0.05 ? copy.better : cvarDeltaPoints < -0.05 ? copy.worse : copy.unchanged;

  return (
    <section className={styles.demo} id="portfolio-demo" aria-labelledby="portfolio-demo-title">
      <header className={styles.intro}>
        <p>{copy.eyebrow}</p>
        <h2 id="portfolio-demo-title">{copy.title}</h2>
        <span>{copy.body}</span>
      </header>

      <div className={styles.workspace}>
        <form className={styles.controls} onSubmit={(event) => { event.preventDefault(); runSimulation(); }}>
          <div className={styles.controlHeading}>
            <h3>{copy.portfolio}</h3>
            <strong>{copy.total}: {number(totalWeight, language, 0)}%</strong>
          </div>
          <div className={styles.holdings}>
            {holdings.map((holding) => (
              <label key={holding.ticker}>
                <span><b>{holding.ticker}</b><small>{holding.name}</small></span>
                <input
                  aria-label={`${copy.weight} ${holding.ticker}`}
                  max="70"
                  min="1"
                  onChange={(event) => updateHolding(holding.ticker, event.target.value)}
                  step="1"
                  type="number"
                  value={holding.weightPct}
                />
                <em>%</em>
              </label>
            ))}
          </div>
          <small className={styles.normalization}>{copy.normalized}</small>

          <div className={styles.candidateControls}>
            <label>
              <span>{copy.candidate}</span>
              <select
                aria-label={copy.candidate}
                onChange={(event) => { setCandidateTicker(event.target.value); setDirty(true); }}
                value={candidateTicker}
              >
                {CANDIDATES.map((candidate) => (
                  <option key={candidate.ticker} value={candidate.ticker}>{candidate.ticker} · {candidate.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{copy.candidateWeight}</span>
              <select
                aria-label={copy.candidateWeight}
                onChange={(event) => { setCandidateWeight(Number(event.target.value)); setDirty(true); }}
                value={candidateWeight}
              >
                {[5, 10, 15, 20].map((weight) => <option key={weight} value={weight}>{weight}%</option>)}
              </select>
            </label>
          </div>

          <button className={styles.runButton} disabled={status === "loading"} type="submit">
            {status === "loading" ? copy.running : result ? copy.rerun : copy.run}
          </button>
          <div className={styles.status} aria-live="polite">
            {dirty && status !== "loading" ? copy.changed : null}
            {status === "error" ? <><span>{message || copy.error}</span><button onClick={runSimulation} type="button">{copy.retry}</button></> : null}
          </div>
        </form>

        <div className={styles.results} aria-busy={status === "loading"} aria-live="polite">
          {status === "loading" && !result ? <div className={styles.loading}>{copy.running}</div> : null}
          {result ? (
            <>
              <div className={styles.decision}>
                <span>{copy.sentenceStart} {result.candidate.ticker}</span>
                <strong>{riskVerb} {copy.sentenceTail} en {number(Math.abs(cvarDeltaPoints), language)} {copy.points}</strong>
                <small>{copy.sentenceConcentration} {cvarDeltaPoints === 0 && concentrationDeltaPoints === 0 ? "0" : `${concentrationDeltaPoints > 0 ? "+" : ""}${number(concentrationDeltaPoints, language)}`} {copy.points}.</small>
              </div>
              <div className={styles.resultGrid}>
                <ResultColumn copy={copy} label={copy.current} language={language} result={result.current} />
                <ResultColumn copy={copy} label={`${copy.proposed}: ${result.candidate.ticker}`} language={language} result={result.proposed} />
              </div>
              <footer className={styles.provenance}>
                <div>
                  <strong>{copy.provenance}</strong>
                  <span>{copy.example} · {result.provenance.scenarioCount.toLocaleString(language === "es" ? "es-CL" : "en-US")} {copy.scenarios} · {result.provenance.horizonDays}d</span>
                  <span>{copy.modelDate}: {dateLabel(result.provenance.modelAsOf, language)} · {copy.coverage}: {result.proposed.model.matchedWeightCoverageLabel || "—"}</span>
                  <small>{copy.notLive}</small>
                </div>
                <StressAccountGate className={styles.accountButton} language={language}>{copy.account}</StressAccountGate>
              </footer>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
