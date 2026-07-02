"use client";

import Link from "next/link";

import styles from "@/app/stress/stress.module.css";
import { useLanguagePreference } from "@/components/language-layer";

const COPY = {
  en: {
    back: "BL'S",
    label: "03 - Portfolio Risk",
    title: "STRESS ENGINE",
    subtitle: "Regime-conditioned scenario generation for tail risk.",
    body:
      "Synthetic stress scenarios on the current book. CVaR, drawdown probability, and tail attribution are surfaced first; model architecture and gates stay in methodology.",
    primary: "Run in workspace",
    secondary: "Read methodology",
    build: "Research build",
    buildText:
      "The live endpoint serves a guarded correlation proxy while the offline diffusion champion remains gated. It is explicit about non-readiness instead of dressing research as production.",
    replayTitle: "Historical Replay",
    replayBody: "Stress coverage is shown against named market episodes, not against the sampler's own target matrix.",
    replay: [
      ["COVID crash 2020", "Actual min -31.4%", "Synthetic q01 -35.5%", "Covered"],
      ["Inflation bear 2022", "Actual min -15.9%", "Synthetic q01 -35.5%", "Covered"],
      ["Bank stress 2023", "Actual min -1.4%", "Synthetic q01 -35.5%", "Covered"],
    ],
    metrics: [
      ["5,000", "synthetic paths per stress run"],
      ["CVaR 5% / 1%", "tail risk readouts"],
      ["Tail attribution", "position-level loss contributors"],
      ["Run ID + seed", "deterministic audit trail"],
    ],
    methodologyTitle: "Methodology And Gates",
    methodology:
      "Current live engine: seeded, regime-conditioned covariance proxy with Cholesky correlation, stratified stress sampling, and visible warnings. Offline research: diffusion champion trained in Colab. Gate status: not ready for production endpoint until baseline tests clear Gaussian/t-copula/FHS comparisons and exception backtests.",
    limitationsTitle: "Current Limits",
    limitations: [
      "Do not brand the live surface as DDPM until the served checkpoint clears endpoint gates.",
      "MMD and sampler-fidelity diagnostics stay below the fold; risk users see VaR, CVaR, drawdown, replay coverage, and tail contributors first.",
      "Synthetic scenarios are research artifacts, not forecasts, advice, or execution signals.",
    ],
  },
  es: {
    back: "BL'S",
    label: "03 - Riesgo de cartera",
    title: "STRESS ENGINE",
    subtitle: "Generacion de escenarios por regimen para riesgo de cola.",
    body:
      "Escenarios de stress sinteticos sobre la cartera actual. Primero aparecen CVaR, probabilidad de drawdown y atribucion de cola; la arquitectura y los gates viven en metodologia.",
    primary: "Correr en workspace",
    secondary: "Leer metodologia",
    build: "Build de investigacion",
    buildText:
      "El endpoint vivo sirve un proxy correlacional con guardrails mientras el champion de difusion sigue offline y gated. La no-preparacion queda explicita; no se disfraza investigacion como produccion.",
    replayTitle: "Replay Historico",
    replayBody: "La cobertura de stress se muestra contra episodios de mercado, no contra la matriz objetivo del propio sampler.",
    replay: [
      ["COVID crash 2020", "Min real -31.4%", "Q01 sintetico -35.5%", "Cubre"],
      ["Inflation bear 2022", "Min real -15.9%", "Q01 sintetico -35.5%", "Cubre"],
      ["Bank stress 2023", "Min real -1.4%", "Q01 sintetico -35.5%", "Cubre"],
    ],
    metrics: [
      ["5.000", "trayectorias sinteticas por corrida"],
      ["CVaR 5% / 1%", "lecturas de riesgo de cola"],
      ["Atribucion de cola", "contribuidores de perdida por posicion"],
      ["Run ID + seed", "trazabilidad deterministica"],
    ],
    methodologyTitle: "Metodologia Y Gates",
    methodology:
      "Motor vivo actual: proxy de covarianza por regimen, con semilla deterministica, correlacion Cholesky, stress sampling estratificado y warnings visibles. Investigacion offline: champion de difusion entrenado en Colab. Estado del gate: no listo para endpoint productivo hasta superar comparaciones Gaussian/t-copula/FHS y backtests de excepciones.",
    limitationsTitle: "Limites Actuales",
    limitations: [
      "No se marca la superficie viva como DDPM hasta que el checkpoint servido pase los gates de endpoint.",
      "MMD y fidelidad del sampler quedan bajo el fold; el usuario de riesgo ve primero VaR, CVaR, drawdown, replay historico y contribuidores de cola.",
      "Los escenarios sinteticos son artefactos de investigacion, no pronosticos, asesoria ni senales de ejecucion.",
    ],
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
          <Link href="/app#risk">{copy.primary}</Link>
          <Link href="#methodology">{copy.secondary}</Link>
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
      </section>

      <section className={styles.metrics} aria-label="Stress Engine capabilities">
        {copy.metrics.map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <section className={styles.split}>
        <article>
          <p>{copy.build}</p>
          <h2>{copy.replayTitle}</h2>
          <span>{copy.replayBody}</span>
        </article>
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
      </section>

      <section className={styles.methodology} id="methodology">
        <div>
          <p>{copy.methodologyTitle}</p>
          <h2>{copy.build}</h2>
          <span>{copy.buildText}</span>
        </div>
        <article>
          <p>{copy.methodology}</p>
          <h3>{copy.limitationsTitle}</h3>
          <ul>
            {copy.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
