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
    build: "V8 verdict",
    buildText:
      "V8 dethroned the DDPM. The served product is the calibrated factor stress engine; the diffusion checkpoint stays research-only until it beats same-stack Gaussian, t-copula, and FHS.",
    replayTitle: "Stress Floor",
    replayBody: "The v8 crisis table is an unconditional stress-floor diagnostic, not episode-conditioned replay. It shows whether the stress ladder is severe enough, not whether it predicted each episode.",
    replay: [
      ["COVID crash 2020", "Actual min -35.2%", "Stress q01 -44.6%", "Floor"],
      ["Inflation bear 2022", "Actual min -15.9%", "Stress q01 -44.6%", "Floor"],
      ["Bank stress 2023", "Actual min -1.5%", "Stress q01 -44.6%", "Floor"],
    ],
    metrics: [
      ["5,000", "synthetic paths per stress run"],
      ["CVaR 5% / 1%", "tail risk readouts"],
      ["Tail attribution", "position-level loss contributors"],
      ["Run ID + seed", "deterministic audit trail"],
    ],
    methodologyTitle: "Methodology And Gates",
    methodology:
      "Current live engine: calibrated factor stress baseline, implemented as a CPU runtime with Cholesky correlation, stratified stress sampling, and visible warnings. V8 results: same-stack Gaussian MMD 0.0168, FHS 0.0170, t-copula 0.0186, DDPM base 0.1426. The DDPM is not the champion.",
    limitationsTitle: "Current Limits",
    limitations: [
      "Do not brand the live surface as DDPM; v8 showed the same calibration stack with Gaussian factor noise beats it.",
      "The pooled -44.6% q01 is a stress-ladder output; report sleeve quantiles before treating it as an estimated market tail.",
      "MMD and sampler-fidelity diagnostics stay below the fold; risk users see VaR, CVaR, drawdown, stress-floor status, and tail contributors first.",
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
    build: "Veredicto v8",
    buildText:
      "V8 destrono al DDPM. El producto servido es el motor calibrado de stress factorial; el checkpoint de difusion queda solo como investigacion hasta que supere same-stack Gaussian, t-copula y FHS.",
    replayTitle: "Piso De Stress",
    replayBody: "La tabla de crisis v8 es un diagnostico de piso de stress incondicional, no replay condicionado por episodio. Mide severidad suficiente, no prediccion de cada episodio.",
    replay: [
      ["COVID crash 2020", "Min real -35.2%", "Q01 stress -44.6%", "Piso"],
      ["Inflation bear 2022", "Min real -15.9%", "Q01 stress -44.6%", "Piso"],
      ["Bank stress 2023", "Min real -1.5%", "Q01 stress -44.6%", "Piso"],
    ],
    metrics: [
      ["5.000", "trayectorias sinteticas por corrida"],
      ["CVaR 5% / 1%", "lecturas de riesgo de cola"],
      ["Atribucion de cola", "contribuidores de perdida por posicion"],
      ["Run ID + seed", "trazabilidad deterministica"],
    ],
    methodologyTitle: "Metodologia Y Gates",
    methodology:
      "Motor vivo actual: baseline calibrado de stress factorial, implementado como runtime CPU con correlacion Cholesky, stress sampling estratificado y warnings visibles. Resultados v8: same-stack Gaussian MMD 0.0168, FHS 0.0170, t-copula 0.0186, DDPM base 0.1426. El DDPM no es el champion.",
    limitationsTitle: "Limites Actuales",
    limitations: [
      "No se marca la superficie viva como DDPM; v8 mostro que el mismo stack de calibracion con ruido Gaussian factor le gana.",
      "El q01 agregado de -44.6% es output de stress ladder; hay que reportar cuantiles por sleeve antes de tratarlo como cola estimada de mercado.",
      "MMD y fidelidad del sampler quedan bajo el fold; el usuario de riesgo ve primero VaR, CVaR, drawdown, estado del piso y contribuidores de cola.",
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
