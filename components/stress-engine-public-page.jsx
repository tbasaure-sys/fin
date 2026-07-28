"use client";

import Link from "next/link";

import styles from "@/app/stress/stress.module.css";
import { useLanguagePreference } from "@/components/language-layer";
import { StressAccountGate } from "@/components/stress-account-gate";
import { PlainMetric } from "@/components/ui/plain-metric";

const COPY = {
  en: {
    back: "BLS Prime",
    navPrimary: "What it shows",
    navSecondary: "Methodology",
    label: "03 - Portfolio Risk",
    title: "Portfolio risk",
    subtitle: "Before you add to a position, see how much you could lose.",
    body:
      "BLS Prime tests the positions you own against severe market scenarios and shows the loss, the weak spots, and the positions responsible.",
    primary: "See what it shows",
    workspaceCta: "Run on my portfolio — account required",
    secondary: "Read methodology",
    disclaimer: "Research software. Not financial advice.",
    metricsLabel: "What you get",
    explainerTitle: "What happens when you run the review",
    explainerBody:
      "You do not need to understand financial models. The review answers one practical question: if markets fall sharply, where does this portfolio hurt?",
    steps: [
      ["Add holdings", "Enter tickers and weights once. Cash and unmatched tickers stay visible instead of being hidden."],
      ["Test difficult markets", "The review applies severe but plausible market moves to the positions it can match."],
      ["Read where it hurts", "You see the loss in a bad scenario and which positions explain it."],
    ],
    metrics: [
      {
        plain: "If the next 30 days go badly, how much does the portfolio lose?",
        value: "CVaR 5%",
        techLabel: "Average loss in the most severe scenarios",
        definitionKey: "cvar5",
        tone: "bad",
      },
      {
        plain: "How often do simulated scenarios finish below zero?",
        value: "Loss share",
        techLabel: "Share of scenarios with a loss",
        definitionKey: "probabilityLoss",
        tone: "warn",
      },
      {
        plain: "Which positions hurt most when the bad scenarios arrive?",
        value: "Risk drivers",
        techLabel: "Positions that explain the loss",
        definitionKey: "tailContributor",
      },
      {
        plain: "Can a reviewer reproduce this exact run later?",
        value: "Run record",
        techLabel: "Details saved for review",
        definitionKey: "runFingerprint",
        tone: "good",
      },
    ],
    trustEyebrow: "How to read it",
    trustTitle: "A reference for studying difficult markets.",
    trustBody:
      "The calculation uses historical market relationships and severe scenarios. It is a way to understand exposure, not a forecast of the next market move.",
    replayTitle: "Checks against past market drops",
    replayBody: "We compare the size of the simulated loss with several historical episodes:",
    replayCaveat:
      "This is a comparison with past episodes, not a claim that the calculation can reproduce every crisis.",
    replay: [
      ["Pre-2020 COVID check", "Real drop -33.3%", "Stress q01 -36.9%", "Pass"],
      ["Pre-2022 inflation check", "Real drop -13.5%", "Stress q01 -41.7%", "Pass"],
      ["Pre-2023 rate stress check", "Real drop -6.8%", "Stress q01 -42.0%", "Pass"],
    ],
    methodologyTitle: "How it is calculated",
    methodologySubtitle: "The short version",
    methodology:
      "The review uses historical market relationships and applies difficult market conditions to the holdings it can match. If coverage is incomplete, the page shows the gap instead of pretending the portfolio is complete. Each run keeps its inputs and date for later review.",
    limitsTitle: "What it cannot do",
    limitations: [
      "It does not tell you what will happen next. It shows how your current portfolio behaves in difficult simulated markets.",
      "It is not a day-by-day market forecast.",
      "Some tickers may not have enough matching history. When that happens, the page shows the gap instead of hiding it.",
      "The headline loss is deliberately severe. It describes a difficult scenario, not the most likely market case.",
      "It is analysis software, not advice, not a trade instruction, and not a replacement for human judgment.",
    ],
    ctaTitle: "Review your actual holdings.",
    ctaBody: "Open the workspace, choose the type of market you want to examine, and review the portfolio you own.",
  },
  es: {
    back: "BLS Prime",
    navPrimary: "Qu\u00e9 muestra",
    navSecondary: "Metodolog\u00eda",
    label: "03 - Riesgo de cartera",
    title: "Riesgo de cartera",
    subtitle: "Antes de aumentar una posición, revisa cuánto puedes perder.",
    body:
      "BLS Prime prueba las posiciones que tienes en escenarios de caídas fuertes y muestra la pérdida, los puntos frágiles y las posiciones responsables.",
    primary: "Ver qu\u00e9 muestra",
    workspaceCta: "Analizar mi cartera — requiere cuenta",
    secondary: "Leer metodolog\u00eda",
    disclaimer: "Software de an\u00e1lisis. No es asesor\u00eda financiera.",
    metricsLabel: "Qu\u00e9 recibes",
    explainerTitle: "Qué pasa cuando haces la revisión",
    explainerBody:
      "No necesitas entender modelos financieros. La revisión responde: ¿qué puede pasar si el mercado cae con fuerza y dónde duele esta cartera?",
    steps: [
      ["Agregas posiciones", "Ingresas tickers y pesos una vez. Caja y tickers sin cobertura quedan visibles en vez de esconderse."],
      ["Pruebas mercados difíciles", "La revisión aplica movimientos fuertes pero plausibles a las posiciones que puede comparar."],
      ["Lees dónde duele", "Ves la pérdida de un escenario malo y qué posiciones la explican."],
    ],
    metrics: [
      {
        plain: "Si los pr\u00f3ximos 30 d\u00edas salen mal, \u00bfcu\u00e1nto pierde la cartera?",
        value: "CVaR 5%",
        techLabel: "Pérdida promedio en los escenarios más severos",
        definitionKey: "cvar5",
        tone: "bad",
      },
      {
        plain: "\u00bfQu\u00e9 tan seguido los escenarios simulados terminan en p\u00e9rdida?",
        value: "P\u00e9rdida",
        techLabel: "Parte de los escenarios con pérdida",
        definitionKey: "probabilityLoss",
        tone: "warn",
      },
      {
        plain: "\u00bfQu\u00e9 posiciones duelen m\u00e1s cuando llegan los escenarios malos?",
        value: "Focos de riesgo",
        techLabel: "Posiciones que explican la pérdida",
        definitionKey: "tailContributor",
      },
      {
        plain: "\u00bfPuede un revisor reproducir esta corrida exacta despu\u00e9s?",
        value: "Registro de corrida",
        techLabel: "Detalles guardados para revisar",
        definitionKey: "runFingerprint",
        tone: "good",
      },
    ],
    trustEyebrow: "Cómo leerlo",
    trustTitle: "Una referencia para estudiar mercados difíciles.",
    trustBody:
      "La lectura usa relaciones históricas de mercado y escenarios severos. Sirve para entender la exposición, no para pronosticar el próximo movimiento.",
    replayTitle: "Comparaciones con caídas pasadas",
    replayBody: "Comparamos la pérdida simulada con algunos episodios históricos:",
    replayCaveat:
      "Es una comparación con episodios pasados, no una afirmación de que la lectura pueda reproducir cada crisis.",
    replay: [
      ["Chequeo pre-2020 COVID", "Ca\u00edda real -33,3%", "q01 estr\u00e9s -36,9%", "Cumple"],
      ["Chequeo pre-2022 inflaci\u00f3n", "Ca\u00edda real -13,5%", "q01 estr\u00e9s -41,7%", "Cumple"],
      ["Chequeo pre-2023 tasas", "Ca\u00edda real -6,8%", "q01 estr\u00e9s -42,0%", "Cumple"],
    ],
    methodologyTitle: "Cómo se calcula",
    methodologySubtitle: "La versión corta",
    methodology:
      "La revisión usa relaciones históricas de mercado y aplica condiciones difíciles a las posiciones que puede comparar. Si faltan datos, muestra la brecha en vez de fingir que la cartera está completa. Cada corrida guarda sus datos y fecha para revisarla después.",
    limitsTitle: "Lo que no puede hacer",
    limitations: [
      "No dice qué va a pasar después. Muestra cómo se comporta tu cartera actual en mercados difíciles simulados.",
      "No es un pronóstico diario del mercado.",
      "Algunos tickers pueden no tener suficiente historia comparable. Cuando pasa, la página muestra la brecha en vez de esconderla.",
      "La pérdida principal es deliberadamente severa. Describe un escenario difícil, no el caso más probable del mercado.",
      "Es software de análisis: no es asesoría, no es una orden de compra o venta y no reemplaza el juicio humano.",
    ],
    ctaTitle: "Revisa tu cartera real.",
    ctaBody: "Abre tu espacio de trabajo, elige el tipo de mercado que quieres examinar y revisa la cartera que tienes.",
  },
};

export function StressEnginePublicPage({ initialLanguage = "es" }) {
  const { language } = useLanguagePreference(initialLanguage);
  const copy = COPY[language] || COPY.en;

  return (
    <main className={styles.page} data-no-translate>
      <header className={styles.topbar}>
        <Link href="/" className={styles.logo} aria-label="Back to BLS Prime">
          {copy.back}
        </Link>
        <nav aria-label={language === "es" ? "Enlaces de riesgo de cartera" : "Portfolio risk links"}>
          <Link className={styles.actionButton} href="#what-you-get">
            {copy.navPrimary}
          </Link>
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
            {copy.workspaceCta}
          </StressAccountGate>
          <Link className={styles.actionButton} href="#what-you-get">
            {copy.primary}
          </Link>
          <Link href="#methodology">{copy.secondary}</Link>
        </div>
        <small>{copy.disclaimer}</small>
      </section>

      <section className={styles.explainer} id="what-you-get">
        <div>
          <p>{copy.metricsLabel}</p>
          <h2>{copy.explainerTitle}</h2>
          <span>{copy.explainerBody}</span>
        </div>
        <ol>
          {copy.steps.map(([title, body], index) => (
            <li key={title}>
              <em>{String(index + 1).padStart(2, "0")}</em>
              <strong>{title}</strong>
              <span>{body}</span>
            </li>
          ))}
        </ol>
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
          {copy.workspaceCta}
        </StressAccountGate>
        <small>{copy.disclaimer}</small>
      </section>
    </main>
  );
}
