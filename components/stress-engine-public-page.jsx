"use client";

import Link from "next/link";

import styles from "@/app/stress/stress.module.css";
import { useLanguagePreference } from "@/components/language-layer";
import { PlainMetric } from "@/components/ui/plain-metric";

const COPY = {
  en: {
    back: "BL'S",
    navPrimary: "Run in workspace",
    navSecondary: "Methodology",
    label: "03 - Portfolio Risk",
    title: "Stress Engine",
    subtitle: "See how much damage your portfolio takes in simulated crises.",
    body:
      "BLS Prime runs thousands of harsh market scenarios against your actual holdings, then shows the loss, the probability of pain, and the positions doing the damage.",
    primary: "Run in workspace",
    secondary: "Read methodology",
    disclaimer: "Research software. Not financial advice.",
    metricsLabel: "What you get",
    metrics: [
      {
        plain: "If the next 20 days go badly, how much does the portfolio lose?",
        value: "CVaR 5%",
        techLabel: "Worst-slice average",
        definitionKey: "cvar5",
        tone: "bad",
      },
      {
        plain: "How often do simulated scenarios finish below zero?",
        value: "Loss share",
        techLabel: "Probability of loss",
        definitionKey: "probabilityLoss",
        tone: "warn",
      },
      {
        plain: "Which positions hurt most when the bad scenarios arrive?",
        value: "Tail drivers",
        techLabel: "Tail attribution",
        definitionKey: "tailContributor",
      },
      {
        plain: "Can a reviewer reproduce this exact run later?",
        value: "Run ID + seed",
        techLabel: "Audit fingerprint",
        definitionKey: "runFingerprint",
        tone: "good",
      },
    ],
    trustEyebrow: "How we chose the engine",
    trustTitle: "The classical engine won. So that is what we ship.",
    trustBody:
      "We tested an experimental AI simulator against classical statistical engines on out-of-sample market data. The classical engine won, so it is the live Stress Engine. The AI model stays in the lab until it earns its place. Every test and threshold remains visible in the methodology.",
    replayTitle: "Historical stress floor",
    replayBody: "We check that our simulated crises are at least as severe as real historical ones:",
    replayCaveat:
      "This is a severity floor, not a claim that the engine replayed or predicted each crisis.",
    replay: [
      ["COVID crash 2020", "Real drop -35%", "Stress floor -45%", "Pass"],
      ["Inflation bear 2022", "Real drop -16%", "Stress floor -45%", "Pass"],
      ["Bank stress 2023", "Real drop -2%", "Stress floor -45%", "Pass"],
    ],
    methodologyTitle: "Methodology",
    methodology:
      "Live engine: calibrated factor stress baseline with Cholesky correlation, stratified stress sampling, visible warnings, and deterministic run fingerprints. V8 results moved raw model scores below the fold because the user decision depends on simulated loss, drawdown, stress-floor status, and tail contributors first.",
    limitsTitle: "What it cannot do",
    limitations: [
      "It does not predict the next crisis. It shows what could happen if bad market weather hits your current book.",
      "It is built from today's investable universe, which can understate how harsh history really was. Treat the result as a lower bound on tail risk.",
      "The pooled stress floor is deliberately severe. Read sleeve-level outputs before treating one tail number as an estimated market loss.",
      "It is research software, not advice, execution instruction, tax guidance, or a replacement for human judgment.",
    ],
    ctaTitle: "Test your actual holdings.",
    ctaBody: "Open the workspace, choose the market regime, and run the stress test on the book you own.",
  },
  es: {
    back: "BL'S",
    navPrimary: "Correr en workspace",
    navSecondary: "Metodologia",
    label: "03 - Riesgo de cartera",
    title: "Stress Engine",
    subtitle: "Ve cuanto dano recibe tu cartera en crisis simuladas.",
    body:
      "BLS Prime corre miles de escenarios duros de mercado contra tus posiciones reales y muestra la perdida, la probabilidad de dolor y que posiciones hacen el dano.",
    primary: "Correr en workspace",
    secondary: "Leer metodologia",
    disclaimer: "Research software. No es asesoria financiera.",
    metricsLabel: "Que recibes",
    metrics: [
      {
        plain: "Si los proximos 20 dias salen mal, cuanto pierde la cartera?",
        value: "CVaR 5%",
        techLabel: "Promedio del peor tramo",
        definitionKey: "cvar5",
        tone: "bad",
      },
      {
        plain: "Con que frecuencia los escenarios simulados terminan bajo cero?",
        value: "Perdida",
        techLabel: "Probabilidad de perdida",
        definitionKey: "probabilityLoss",
        tone: "warn",
      },
      {
        plain: "Que posiciones duelen mas cuando llegan los escenarios malos?",
        value: "Drivers de cola",
        techLabel: "Atribucion de cola",
        definitionKey: "tailContributor",
      },
      {
        plain: "Puede un revisor reproducir esta corrida exacta despues?",
        value: "Run ID + seed",
        techLabel: "Huella auditable",
        definitionKey: "runFingerprint",
        tone: "good",
      },
    ],
    trustEyebrow: "Como elegimos el motor",
    trustTitle: "El motor clasico gano. Eso es lo que servimos.",
    trustBody:
      "Probamos un simulador experimental de IA contra motores estadisticos clasicos en datos fuera de muestra. El motor clasico gano, por eso es el Stress Engine vivo. El modelo de IA queda en el laboratorio hasta ganarse el lugar. Cada prueba y umbral sigue visible en metodologia.",
    replayTitle: "Piso historico de stress",
    replayBody: "Chequeamos que las crisis simuladas sean al menos tan severas como crisis reales:",
    replayCaveat:
      "Esto es un piso de severidad, no una afirmacion de que el motor reprodujo o predijo cada crisis.",
    replay: [
      ["COVID crash 2020", "Caida real -35%", "Piso stress -45%", "Pasa"],
      ["Inflation bear 2022", "Caida real -16%", "Piso stress -45%", "Pasa"],
      ["Bank stress 2023", "Caida real -2%", "Piso stress -45%", "Pasa"],
    ],
    methodologyTitle: "Metodologia",
    methodology:
      "Motor vivo: baseline calibrado de stress factorial con correlacion Cholesky, stress sampling estratificado, warnings visibles y huellas deterministicas de corrida. V8 movio los scores crudos bajo el fold porque la decision del usuario depende primero de perdida simulada, drawdown, piso de stress y contribuidores de cola.",
    limitsTitle: "Lo que no puede hacer",
    limitations: [
      "No predice la proxima crisis. Muestra que podria pasar si mal clima de mercado golpea tu cartera actual.",
      "Se construye desde el universo invertible de hoy, lo que puede subestimar la dureza real de la historia. Trata el resultado como piso de riesgo de cola.",
      "El piso agregado de stress es deliberadamente severo. Lee los outputs por sleeve antes de tratar un numero de cola como perdida estimada de mercado.",
      "Es software de investigacion, no asesoria, instruccion de ejecucion, guia tributaria ni reemplazo del juicio humano.",
    ],
    ctaTitle: "Prueba tus posiciones reales.",
    ctaBody: "Abre el workspace, elige el regimen de mercado y corre el stress test sobre la cartera que tienes.",
  },
};

export function StressEnginePublicPage() {
  const { language } = useLanguagePreference();
  const copy = COPY[language] || COPY.en;

  return (
    <main className={styles.page} data-no-translate>
      <header className={styles.topbar}>
        <Link href="/" className={styles.logo} aria-label="Back to BLS Prime">
          {copy.back}
        </Link>
        <nav aria-label="Stress Engine links">
          <Link href="/app#risk">{copy.navPrimary}</Link>
          <Link href="#methodology">{copy.navSecondary}</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <p>{copy.label}</p>
        <h1>{copy.title}</h1>
        <h2>{copy.subtitle}</h2>
        <span>{copy.body}</span>
        <div className={styles.heroActions}>
          <Link href="/app#risk">{copy.primary}</Link>
          <Link href="#methodology">{copy.secondary}</Link>
        </div>
        <small>{copy.disclaimer}</small>
      </section>

      <section className={styles.metrics} aria-label={copy.metricsLabel}>
        {copy.metrics.map((metric) => (
          <PlainMetric
            definitionKey={metric.definitionKey}
            key={metric.plain}
            language={language}
            plain={metric.plain}
            techLabel={metric.techLabel}
            tone={metric.tone}
            value={metric.value}
          />
        ))}
      </section>

      <section className={styles.split}>
        <article>
          <p>{copy.trustEyebrow}</p>
          <h2>{copy.trustTitle}</h2>
          <span>{copy.trustBody}</span>
        </article>
        <article>
          <p>{copy.replayTitle}</p>
          <span>{copy.replayBody}</span>
          <div className={styles.replayTable}>
            {copy.replay.map(([episode, actual, synthetic, status]) => (
              <div key={episode}>
                <strong>{episode}</strong>
                <span>{actual}</span>
                <span>{synthetic}</span>
                <em>{status}</em>
              </div>
            ))}
          </div>
          <small>{copy.replayCaveat}</small>
        </article>
      </section>

      <section className={styles.methodology} id="methodology">
        <div>
          <p>{copy.methodologyTitle}</p>
          <h2>{copy.replayTitle}</h2>
          <span>{copy.methodology}</span>
        </div>
        <article>
          <h3>{copy.limitsTitle}</h3>
          <ul>
            {copy.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className={styles.cta}>
        <h2>{copy.ctaTitle}</h2>
        <p>{copy.ctaBody}</p>
        <Link href="/app#risk">{copy.primary}</Link>
        <small>{copy.disclaimer}</small>
      </section>
    </main>
  );
}
