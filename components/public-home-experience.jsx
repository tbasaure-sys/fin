"use client";

import Link from "next/link";
import { useEffect } from "react";

import styles from "@/app/home-page.module.css";
import { BreakpointHero } from "@/components/breakpoint/breakpoint-hero";
import { useLanguagePreference } from "@/components/language-layer";
import { PublicSiteHeader } from "@/components/public-shell/public-site-header";
import { StressAccountGate } from "@/components/stress-account-gate";

const COPY = {
  es: {
    workflowKicker: "Cuatro decisiones conectadas",
    workflowTitle: "De una señal a una decisión defendible.",
    workflowSub:
      "BLS Prime ordena la investigación en una secuencia. Cada paso produce una salida concreta para el siguiente.",
    steps: [
      {
        index: "01",
        title: "Descubrir",
        engine: "FactorLab",
        outcome: "Candidatos priorizados, con una razón verificable para dedicarles tiempo.",
        action: "Buscar candidatos",
        href: "/factorlab",
      },
      {
        index: "02",
        title: "Entender el precio",
        engine: "Breakpoint",
        outcome: "Expectativas implícitas de crecimiento y rentabilidad que el precio necesita.",
        action: "Analizar una empresa",
        href: "#breakpoint",
      },
      {
        index: "03",
        title: "Construir la tesis",
        engine: "AURORA",
        outcome: "Rango y estado de valoración, impulsores de valor y condiciones que invalidan la tesis.",
        action: "Abrir AURORA",
        href: "/aurora",
      },
      {
        index: "04",
        title: "Medir el riesgo",
        engine: "Stress",
        outcome: "Contribución al downside, concentración y posiciones que explican la pérdida.",
        action: "Analizar mi cartera",
        note: "Requiere cuenta",
        requiresAccount: true,
        href: "/stress",
      },
    ],
    demo: {
      kicker: "Demo determinista",
      title: "Una lectura conectada, no cuatro herramientas sueltas.",
      body:
        "Este caso de Texas Instruments muestra cómo una señal avanza hasta una lectura de empresa y su impacto en cartera.",
      disclosure: "Ejemplo congelado · 30 de junio de 2026 · No son datos en vivo.",
      company: "Texas Instruments",
      ticker: "TXN",
      status: "En rango · revisar supuestos",
      cards: [
        ["Descubrimiento", "priority", "Calidad y caja justifican una revisión más profunda."],
        ["Precio", "price", "El precio exige sostener crecimiento y rentabilidad; no basta con extrapolar el pasado."],
        ["Tesis", "range", "El rango depende de márgenes, reinversión y recuperación del ciclo industrial."],
        ["Riesgo", "downside", "Downside ilustrativo en un escenario adverso de 20 días; no es un pronóstico."],
      ],
      provenance:
        "Cifras ilustrativas y estáticas para demostrar el producto. Una lectura real identifica la fecha de cada fuente, los supuestos usados y cualquier evidencia faltante.",
      primary: "Abrir la lectura completa",
      secondary: "Crear espacio de trabajo",
    },
    footer: "Software de análisis. No es asesoría financiera.",
    terms: "Términos",
    privacy: "Privacidad",
  },
  en: {
    workflowKicker: "Four connected decisions",
    workflowTitle: "From a signal to a defensible decision.",
    workflowSub:
      "BLS Prime organizes research into a sequence. Each step produces a concrete output for the next one.",
    steps: [
      {
        index: "01",
        title: "Discover",
        engine: "FactorLab",
        outcome: "Prioritized candidates with a verifiable reason to spend more time on them.",
        action: "Find candidates",
        href: "/factorlab",
      },
      {
        index: "02",
        title: "Understand the price",
        engine: "Breakpoint",
        outcome: "Implied growth and profitability expectations the price needs.",
        action: "Analyze a company",
        href: "#breakpoint",
      },
      {
        index: "03",
        title: "Build the thesis",
        engine: "AURORA",
        outcome: "Valuation range and state, value drivers, and conditions that falsify the thesis.",
        action: "Open AURORA",
        href: "/aurora",
      },
      {
        index: "04",
        title: "Measure risk",
        engine: "Stress",
        outcome: "Downside contribution, concentration, and the positions that explain the loss.",
        action: "Analyze my portfolio",
        note: "Account required",
        requiresAccount: true,
        href: "/stress",
      },
    ],
    demo: {
      kicker: "Deterministic demo",
      title: "One connected reading, not four separate tools.",
      body:
        "This Texas Instruments case shows how a signal moves into a company reading and its portfolio impact.",
      disclosure: "Frozen example · June 30, 2026 · Not live data.",
      company: "Texas Instruments",
      ticker: "TXN",
      status: "In range · review assumptions",
      cards: [
        ["Discovery", "priority", "Quality and cash generation justify a deeper review."],
        ["Price", "price", "The price requires sustained growth and profitability; past performance alone is not enough."],
        ["Thesis", "range", "The range depends on margins, reinvestment, and an industrial-cycle recovery."],
        ["Risk", "downside", "Illustrative downside in a 20-day adverse scenario; this is not a forecast."],
      ],
      provenance:
        "Static illustrative figures used to demonstrate the product. A real reading identifies each source date, every assumption, and any missing evidence.",
      primary: "Open the full company read",
      secondary: "Create workspace",
    },
    footer: "Research software. Not financial advice.",
    terms: "Terms",
    privacy: "Privacy",
  },
};

// Fixed demo figures. They are intentionally immutable so the example can
// never behave like a live market panel.
const SAMPLE_METRICS = Object.freeze({
  price: 187.2,
  valueLow: 168,
  valueHigh: 214,
  priority: 0.88,
  downside: -23.4,
});

function formatDemoMetric(key, language) {
  const locale = language === "en" ? "en-US" : "es-CL";
  if (key === "priority") return `${language === "en" ? "Priority" : "Prioridad"} ${SAMPLE_METRICS.priority.toLocaleString(locale)}`;
  if (key === "price") return SAMPLE_METRICS.price.toLocaleString(locale, { style: "currency", currency: "USD" });
  if (key === "range") return `$${SAMPLE_METRICS.valueLow}–${SAMPLE_METRICS.valueHigh}`;
  if (key === "downside") return `${SAMPLE_METRICS.downside.toLocaleString(locale)}%`;
  return language === "en" ? "3 tests" : "3 pruebas";
}

function useReveal() {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return undefined;
    const nodes = Array.from(document.querySelectorAll(`.${styles.reveal}`));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add(styles.revealIn);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

function localizeHref(href, language) {
  if (href.startsWith("#")) return href;
  return `${href}${href.includes("?") ? "&" : "?"}lang=${language}`;
}

export function PublicHomeExperience({ initialLanguage = "es" }) {
  const { language } = useLanguagePreference(initialLanguage);
  const copy = COPY[language] || COPY.es;

  useReveal();

  return (
    <main className={styles.page}>
      <PublicSiteHeader initialLanguage={initialLanguage} />

      <div id="breakpoint">
        <BreakpointHero language={language} />
      </div>

      <section className={styles.workflow} aria-labelledby="workflow-title" id="workflow">
        <div className={`${styles.sectionLead} ${styles.reveal}`}>
          <p className={styles.sectionKicker}>{copy.workflowKicker}</p>
          <h2 id="workflow-title">{copy.workflowTitle}</h2>
          <p>{copy.workflowSub}</p>
        </div>

        <ol className={styles.decisionRail}>
          {copy.steps.map((step, index) => (
            <li className={`${styles.decisionStep} ${styles.reveal}`} key={step.index}>
              <span className={styles.stepIndex}>{step.index}</span>
              <div className={styles.stepCopy}>
                <span className={styles.engine}>{step.engine}</span>
                <h3>{step.title}</h3>
                <p>{step.outcome}</p>
                {step.requiresAccount ? (
                  <StressAccountGate className={styles.stepAction} language={language}>
                    {step.action}
                    {step.note ? <small>{step.note}</small> : null}
                    <span aria-hidden="true">→</span>
                  </StressAccountGate>
                ) : (
                  <Link className={styles.stepAction} href={localizeHref(step.href, language)}>
                    {step.action}
                    {step.note ? <small>{step.note}</small> : null}
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
              </div>
              {index < copy.steps.length - 1 ? <span className={styles.connector} aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.demo} aria-labelledby="demo-title" id="demo">
        <div className={`${styles.demoLead} ${styles.reveal}`}>
          <div>
            <p className={styles.sectionKicker}>{copy.demo.kicker}</p>
            <h2 id="demo-title">{copy.demo.title}</h2>
          </div>
          <p>{copy.demo.body}</p>
        </div>

        <article className={`${styles.demoFrame} ${styles.reveal}`}>
          <header className={styles.demoHeader}>
            <div>
              <span>{copy.demo.ticker}</span>
              <strong>{copy.demo.company}</strong>
            </div>
            <p>{copy.demo.disclosure}</p>
          </header>
          <div className={styles.demoStatus}>
            <span>{language === "en" ? "DECISION STATE" : "ESTADO DE DECISIÓN"}</span>
            <strong>{copy.demo.status}</strong>
          </div>
          <div className={styles.demoGrid}>
            {copy.demo.cards.map(([label, metric, detail]) => (
              <section key={label}>
                <span>{label}</span>
                <strong>{formatDemoMetric(metric, language)}</strong>
                <p>{detail}</p>
              </section>
            ))}
          </div>
          <footer className={styles.demoProvenance}>
            <span>{language === "en" ? "PROVENANCE" : "PROVENIENCIA"}</span>
            <p>{copy.demo.provenance}</p>
          </footer>
        </article>

        <div className={`${styles.finalActions} ${styles.reveal}`}>
          <Link className={styles.primaryAction} href={`/company/TXN?demo=1&lang=${language}`}>
            {copy.demo.primary}
          </Link>
          <Link className={styles.secondaryAction} href={`/login?intent=signup&lang=${language}`}>
            {copy.demo.secondary}
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>{copy.footer}</span>
        <nav aria-label={`${copy.privacy} / ${copy.terms}`}>
          <Link href={`/privacy?lang=${language}`}>{copy.privacy}</Link>
          <Link href={`/terms?lang=${language}`}>{copy.terms}</Link>
        </nav>
      </footer>
    </main>
  );
}
