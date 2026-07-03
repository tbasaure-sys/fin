"use client";

import Link from "next/link";

import styles from "@/app/stress/stress.module.css";
import { useLanguagePreference } from "@/components/language-layer";
import { StressAccountGate } from "@/components/stress-account-gate";
import { PlainMetric } from "@/components/ui/plain-metric";

const COPY = {
  en: {
    back: "BL'S",
    navPrimary: "What it shows",
    navSecondary: "Methodology",
    label: "03 - Portfolio Risk",
    title: "Stress Engine",
    subtitle: "Before you add risk, see what breaks first.",
    body:
      "Stress Engine takes the positions you own, runs them through thousands of harsh market scenarios, and shows the loss, the weak spots, and the names doing the damage.",
    primary: "See what it shows",
    workspaceCta: "Run on my portfolio",
    secondary: "Read methodology",
    disclaimer: "Research software. Not financial advice.",
    metricsLabel: "What you get",
    explainerTitle: "What happens when you run it",
    explainerBody:
      "You do not need to understand factor models. The product answers one practical question: if markets get ugly, where does this portfolio hurt?",
    steps: [
      ["Add holdings", "Enter tickers and weights once. Cash and unmatched tickers stay visible instead of being hidden."],
      ["Run adverse scenarios", "The engine projects a validated point-in-time factor bank onto the positions it can match."],
      ["Read the damage", "You get the bad-case loss, the chance of pain, and the positions responsible for the tail."],
    ],
    metrics: [
      {
        plain: "If the next 30 days go badly, how much does the portfolio lose?",
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
        value: "Risk drivers",
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
    trustEyebrow: "Current validation",
    trustTitle: "The stress engine is ready. The static book is not.",
    trustBody:
      "The live engine is the v9.7 point-in-time FHS factor stress bank. It beat the classical baselines on distribution fit, kept correlation quality in line with Gaussian covariance, and covered the walk-forward stress episodes. The separate daily VaR check now uses rolling conditional volatility, so a frozen scenario book is no longer treated as the VaR product.",
    replayTitle: "Walk-forward stress coverage",
    replayBody: "We refit before each cutoff, then check whether the stress book covered the next shock:",
    replayCaveat:
      "This is a pre-cutoff coverage check, not a claim that the engine replayed each crisis path.",
    replay: [
      ["Pre-2020 COVID check", "Real drop -33.3%", "Stress q01 -36.9%", "Pass"],
      ["Pre-2022 inflation check", "Real drop -13.5%", "Stress q01 -41.7%", "Pass"],
      ["Pre-2023 rate stress check", "Real drop -6.8%", "Stress q01 -42.0%", "Pass"],
    ],
    methodologyTitle: "Methodology",
    methodologySubtitle: "How the engine works",
    methodology:
      "The live engine uses a point-in-time FHS factor bank built from historical market membership, then projects those factor scenarios onto the holdings it can match. It serves the bank as primary only when coverage is sufficient; otherwise it falls back visibly to the historical-return runtime. The raw point-in-time data coverage is 86.4%, and every run keeps a fingerprint so a reviewer can reproduce it.",
    limitsTitle: "What it cannot do",
    limitations: [
      "It does not tell you what will happen next. It shows how your current portfolio behaves inside adverse simulated scenarios.",
      "Daily VaR is a separate rolling conditional risk check. The stress page shows adverse scenarios, not a full day-by-day market forecast.",
      "Some tickers may fall outside the factor bank. When that happens, the endpoint shows the coverage gap instead of silently pretending the book is complete.",
      "The headline stress number is deliberately severe. It describes an adverse simulated world, not a central market case.",
      "It is research software, not advice, not a trade instruction, and not a replacement for human judgment.",
    ],
    ctaTitle: "Test your actual holdings.",
    ctaBody: "Open the workspace, choose the market regime, and run the stress test on the book you own.",
  },
  es: {
    back: "BL'S",
    navPrimary: "Qu\u00e9 muestra",
    navSecondary: "Metodolog\u00eda",
    label: "03 - Riesgo de cartera",
    title: "Stress Engine",
    subtitle: "Antes de sumar riesgo, mira qu\u00e9 se rompe primero.",
    body:
      "Stress Engine toma las posiciones que tienes, las somete a miles de escenarios duros de mercado y muestra la p\u00e9rdida, los puntos fr\u00e1giles y los nombres que hacen el da\u00f1o.",
    primary: "Ver qu\u00e9 muestra",
    workspaceCta: "Probar mi cartera",
    secondary: "Leer metodolog\u00eda",
    disclaimer: "Software de an\u00e1lisis. No es asesor\u00eda financiera.",
    metricsLabel: "Qu\u00e9 recibes",
    explainerTitle: "Qu\u00e9 pasa cuando lo corres",
    explainerBody:
      "No necesitas entender modelos factoriales. El producto responde una pregunta pr\u00e1ctica: si el mercado se pone feo, \u00bfd\u00f3nde duele esta cartera?",
    steps: [
      ["Agregas posiciones", "Ingresas tickers y pesos una vez. Caja y tickers sin cobertura quedan visibles en vez de esconderse."],
      ["Corres escenarios adversos", "El motor proyecta un banco factorial point-in-time validado sobre las posiciones que puede calzar."],
      ["Lees el da\u00f1o", "Recibes la p\u00e9rdida de caso malo, la frecuencia de dolor y las posiciones responsables de la cola."],
    ],
    metrics: [
      {
        plain: "Si los pr\u00f3ximos 30 d\u00edas salen mal, \u00bfcu\u00e1nto pierde la cartera?",
        value: "CVaR 5%",
        techLabel: "Promedio del peor tramo",
        definitionKey: "cvar5",
        tone: "bad",
      },
      {
        plain: "\u00bfQu\u00e9 tan seguido los escenarios simulados terminan en p\u00e9rdida?",
        value: "P\u00e9rdida",
        techLabel: "Probabilidad de p\u00e9rdida",
        definitionKey: "probabilityLoss",
        tone: "warn",
      },
      {
        plain: "\u00bfQu\u00e9 posiciones duelen m\u00e1s cuando llegan los escenarios malos?",
        value: "Focos de riesgo",
        techLabel: "Atribuci\u00f3n de cola",
        definitionKey: "tailContributor",
      },
      {
        plain: "\u00bfPuede un revisor reproducir esta corrida exacta despu\u00e9s?",
        value: "Run ID + seed",
        techLabel: "Huella auditable",
        definitionKey: "runFingerprint",
        tone: "good",
      },
    ],
    trustEyebrow: "Validaci\u00f3n actual",
    trustTitle: "El motor de estr\u00e9s est\u00e1 listo. El libro est\u00e1tico no.",
    trustBody:
      "El motor en producci\u00f3n es el banco factorial FHS v9.7 point-in-time. Super\u00f3 a los baselines cl\u00e1sicos en ajuste distribucional, mantuvo calidad de correlaci\u00f3n al nivel de la covarianza Gaussian y cubri\u00f3 los episodios walk-forward de estr\u00e9s. El chequeo diario de VaR ahora usa volatilidad condicional rolling, por eso un libro congelado de escenarios ya no se trata como producto VaR.",
    replayTitle: "Cobertura walk-forward de estr\u00e9s",
    replayBody: "Reentrenamos antes de cada corte y verificamos si el libro de estr\u00e9s cubri\u00f3 el shock siguiente:",
    replayCaveat:
      "Esto es una prueba pre-corte de cobertura, no una afirmaci\u00f3n de que el motor reprodujo el camino exacto de cada crisis.",
    replay: [
      ["Chequeo pre-2020 COVID", "Ca\u00edda real -33,3%", "q01 estr\u00e9s -36,9%", "Cumple"],
      ["Chequeo pre-2022 inflaci\u00f3n", "Ca\u00edda real -13,5%", "q01 estr\u00e9s -41,7%", "Cumple"],
      ["Chequeo pre-2023 tasas", "Ca\u00edda real -6,8%", "q01 estr\u00e9s -42,0%", "Cumple"],
    ],
    methodologyTitle: "Metodolog\u00eda",
    methodologySubtitle: "C\u00f3mo funciona el motor",
    methodology:
      "El motor usa un banco factorial FHS point-in-time construido desde membres\u00eda hist\u00f3rica de mercado y proyecta esos escenarios sobre las posiciones que puede calzar. Sirve ese banco como fuente primaria solo cuando la cobertura es suficiente; si no, vuelve de forma visible al runtime de retornos hist\u00f3ricos. La cobertura cruda point-in-time es 86,4%, y cada corrida conserva una huella para reproducirla.",
    limitsTitle: "Lo que no puede hacer",
    limitations: [
      "No dice qu\u00e9 va a pasar despu\u00e9s. Muestra c\u00f3mo se comporta tu cartera actual dentro de escenarios adversos simulados.",
      "El VaR diario es un chequeo condicional rolling separado. Esta p\u00e1gina muestra escenarios adversos, no un pron\u00f3stico d\u00eda a d\u00eda del mercado.",
      "Algunos tickers pueden quedar fuera del banco factorial. Cuando pasa, el endpoint muestra la brecha de cobertura en vez de fingir que la cartera est\u00e1 completa.",
      "El n\u00famero principal de estr\u00e9s es deliberadamente severo. Describe un mundo adverso simulado, no un caso central de mercado.",
      "Es software de an\u00e1lisis: no es asesor\u00eda, no es una orden de compra o venta, y no reemplaza el juicio humano.",
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
