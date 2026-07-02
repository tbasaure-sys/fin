"use client";

import Link from "next/link";

import styles from "@/app/stress/stress.module.css";
import { useLanguagePreference } from "@/components/language-layer";
import { StressAccountGate } from "@/components/stress-account-gate";
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
    methodologySubtitle: "How the engine works",
    methodology:
      "The live engine is a classical statistical simulator calibrated to years of real market behavior. It models how your positions move together, runs thousands of stressed scenarios against them, and stamps every run with a fingerprint so any result can be reproduced and audited. What you see first is what matters for the decision: simulated loss, drawdown, and which positions do the damage. Full model scores and test thresholds live in the diagnostics section for technical reviewers.",
    limitsTitle: "What it cannot do",
    limitations: [
      "It does not predict the next crisis. It shows what could happen if bad market weather hits your current portfolio.",
      "It is built from today's largest listed companies, which understates how harsh history really was. Treat results as a floor for tail risk, not a ceiling.",
      "The headline stress number is deliberately severe. It describes a harsh simulated world, not an estimate of what the market will actually lose.",
      "It is research software — not advice, not a trade instruction, and not a replacement for human judgment.",
    ],
    ctaTitle: "Test your actual holdings.",
    ctaBody: "Open the workspace, choose the market regime, and run the stress test on the book you own.",
  },
  es: {
    back: "BL'S",
    navPrimary: "Abrir mi espacio",
    navSecondary: "Metodología",
    label: "03 - Riesgo de cartera",
    title: "Stress Engine",
    subtitle: "Mira cuánto daño recibe tu cartera en crisis simuladas.",
    body:
      "BLS Prime corre miles de escenarios duros de mercado contra tus posiciones reales y te muestra la pérdida, la probabilidad de perder y qué posiciones hacen el daño.",
    primary: "Probar mi cartera",
    secondary: "Leer metodología",
    disclaimer: "Software de análisis. No es asesoría financiera.",
    metricsLabel: "Qué recibes",
    metrics: [
      {
        plain: "Si los próximos 20 días salen mal, ¿cuánto pierde la cartera?",
        value: "CVaR 5%",
        techLabel: "Promedio del peor tramo",
        definitionKey: "cvar5",
        tone: "bad",
      },
      {
        plain: "¿Qué tan seguido los escenarios simulados terminan en pérdida?",
        value: "Pérdida",
        techLabel: "Probabilidad de pérdida",
        definitionKey: "probabilityLoss",
        tone: "warn",
      },
      {
        plain: "¿Qué posiciones duelen más cuando llegan los escenarios malos?",
        value: "Focos de riesgo",
        techLabel: "Atribución de cola",
        definitionKey: "tailContributor",
      },
      {
        plain: "¿Puede un revisor reproducir esta corrida exacta después?",
        value: "Run ID + seed",
        techLabel: "Huella auditable",
        definitionKey: "runFingerprint",
        tone: "good",
      },
    ],
    trustEyebrow: "Cómo elegimos el motor",
    trustTitle: "Ganó el motor clásico. Eso es lo que usamos.",
    trustBody:
      "Probamos un simulador experimental de inteligencia artificial contra motores estadísticos clásicos, con datos de mercado que ninguno había visto. Ganó el clásico, y ese es el Stress Engine que está en producción. El modelo de IA se queda en el laboratorio hasta que se gane el puesto. Todas las pruebas y sus umbrales están publicados en la metodología.",
    replayTitle: "Piso histórico de estrés",
    replayBody: "Verificamos que nuestras crisis simuladas sean al menos tan severas como las reales:",
    replayCaveat:
      "Esto es un piso de severidad: garantiza que la simulación es suficientemente dura, no que el motor haya predicho cada crisis.",
    replay: [
      ["Crisis COVID 2020", "Caída real -35%", "Piso simulado -45%", "Cumple"],
      ["Mercado bajista 2022", "Caída real -16%", "Piso simulado -45%", "Cumple"],
      ["Crisis bancaria 2023", "Caída real -2%", "Piso simulado -45%", "Cumple"],
    ],
    methodologyTitle: "Metodología",
    methodologySubtitle: "Cómo funciona el motor",
    methodology:
      "El motor en producción es un simulador estadístico clásico, calibrado con años de comportamiento real del mercado. Modela cómo se mueven juntas tus posiciones, corre miles de escenarios de estrés contra ellas y sella cada corrida con una huella que permite reproducirla y auditarla. Lo primero que ves es lo que importa para decidir: pérdida simulada, caída máxima y qué posiciones hacen el daño. Los puntajes completos del modelo y sus umbrales quedan en la sección de diagnóstico para revisores técnicos.",
    limitsTitle: "Lo que no puede hacer",
    limitations: [
      "No predice la próxima crisis. Muestra qué podría pasar si el mal clima de mercado golpea tu cartera actual.",
      "Se construye con las empresas listadas más grandes de hoy, lo que suaviza lo dura que fue la historia real. Toma el resultado como un piso del riesgo, no como un techo.",
      "El número de estrés principal es deliberadamente severo. Describe un mundo simulado muy duro, no una estimación de lo que el mercado va a perder.",
      "Es software de análisis: no es asesoría, no es una orden de compra o venta, y no reemplaza el juicio humano.",
    ],
    ctaTitle: "Prueba tu cartera real.",
    ctaBody: "Abre tu espacio de trabajo, elige el clima de mercado que quieres simular y corre la prueba sobre la cartera que tienes.",
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
          <StressAccountGate className={styles.actionButton} language={language}>
            {copy.navPrimary}
          </StressAccountGate>
          <Link href="#methodology">{copy.navSecondary}</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <p>{copy.label}</p>
        <h1>{copy.title}</h1>
        <h2>{copy.subtitle}</h2>
        <span>{copy.body}</span>
        <div className={styles.heroActions}>
          <StressAccountGate className={styles.actionButton} language={language}>
            {copy.primary}
          </StressAccountGate>
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
          <h2>{copy.methodologySubtitle}</h2>
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
        <StressAccountGate className={styles.ctaButton} language={language}>
          {copy.primary}
        </StressAccountGate>
        <small>{copy.disclaimer}</small>
      </section>
    </main>
  );
}
