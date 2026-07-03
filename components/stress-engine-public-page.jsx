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
    subtitle: "See where your portfolio breaks under adverse market scenarios.",
    body:
      "BLS Prime projects a point-in-time factor scenario bank onto your actual holdings, then shows the simulated loss, the chance of pain, and the positions doing the damage.",
    primary: "Run in workspace",
    secondary: "Read methodology",
    disclaimer: "Research software. Not financial advice.",
    metricsLabel: "What you get",
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
    navPrimary: "Abrir mi espacio",
    navSecondary: "Metodología",
    label: "03 - Riesgo de cartera",
    title: "Stress Engine",
    subtitle: "Mira dónde se rompe tu cartera bajo escenarios adversos de mercado.",
    body:
      "BLS Prime proyecta un banco factorial point-in-time sobre tus posiciones reales y te muestra la pérdida simulada, la frecuencia de daño y qué posiciones hacen el daño.",
    primary: "Probar mi cartera",
    secondary: "Leer metodología",
    disclaimer: "Software de análisis. No es asesoría financiera.",
    metricsLabel: "Qué recibes",
    metrics: [
      {
        plain: "Si los próximos 30 días salen mal, ¿cuánto pierde la cartera?",
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
    trustEyebrow: "Validación actual",
    trustTitle: "El motor de estrés está listo. El libro estático no.",
    trustBody:
      "El motor en producción es el banco factorial FHS v9.7 point-in-time. Superó a los baselines clásicos en ajuste distribucional, mantuvo calidad de correlación al nivel de la covarianza Gaussian y cubrió los episodios walk-forward de estrés. El chequeo diario de VaR ahora usa volatilidad condicional rolling, por eso un libro congelado de escenarios ya no se trata como producto VaR.",
    replayTitle: "Cobertura walk-forward de estrés",
    replayBody: "Reentrenamos antes de cada corte y verificamos si el libro de estrés cubrió el shock siguiente:",
    replayCaveat:
      "Esto es una prueba pre-corte de cobertura, no una afirmación de que el motor reprodujo el camino exacto de cada crisis.",
    replay: [
      ["Chequeo pre-2020 COVID", "Caída real -33,3%", "q01 estrés -36,9%", "Cumple"],
      ["Chequeo pre-2022 inflación", "Caída real -13,5%", "q01 estrés -41,7%", "Cumple"],
      ["Chequeo pre-2023 tasas", "Caída real -6,8%", "q01 estrés -42,0%", "Cumple"],
    ],
    methodologyTitle: "Metodología",
    methodologySubtitle: "Cómo funciona el motor",
    methodology:
      "El motor usa un banco factorial FHS point-in-time construido desde membresía histórica de mercado y proyecta esos escenarios sobre las posiciones que puede calzar. Sirve ese banco como fuente primaria solo cuando la cobertura es suficiente; si no, vuelve de forma visible al runtime de retornos históricos. La cobertura cruda point-in-time es 86,4%, y cada corrida conserva una huella para reproducirla.",
    limitsTitle: "Lo que no puede hacer",
    limitations: [
      "No dice qué va a pasar después. Muestra cómo se comporta tu cartera actual dentro de escenarios adversos simulados.",
      "El VaR diario es un chequeo condicional rolling separado. Esta página muestra escenarios adversos, no un pronóstico día a día del mercado.",
      "Algunos tickers pueden quedar fuera del banco factorial. Cuando pasa, el endpoint muestra la brecha de cobertura en vez de fingir que la cartera está completa.",
      "El número principal de estrés es deliberadamente severo. Describe un mundo adverso simulado, no un caso central de mercado.",
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
