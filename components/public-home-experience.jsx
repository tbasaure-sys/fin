"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "@/app/home-page.module.css";
import { writeStoredLanguage } from "@/components/language-layer";
import { StressAccountGate } from "@/components/stress-account-gate";
import { BreakpointHero } from "@/components/breakpoint/breakpoint-hero";

const COPY = {
  es: {
    languageName: "Español",
    languageAria: "Elegir idioma",
    login: "Iniciar sesión",
    kicker: "BLS Prime · Decisiones de inversión con información clara",
    category: "Una forma ordenada de estudiar empresas, oportunidades y riesgo antes de invertir.",
    headline: "La información importa más cuando tienes que decidir.",
    subheadline:
      "BLS Prime reúne valoración, búsqueda de oportunidades y riesgo de cartera en un solo proceso.",
    ctaPrimary: "Crear espacio de trabajo",
    ctaSecondary: "Ver los módulos",
    sampleDisclosure: "Ejemplo con datos ilustrativos. Ninguna cifra de este panel es un dato de mercado en vivo.",
    accountRequired: "Requiere cuenta",
    footer: "Software de análisis. No es asesoría financiera.",
    terms: "Términos",
    privacy: "Privacidad",
    terminal: {
      title: "BLS PRIME · RESEARCH",
      meta: "Ejemplo con datos ilustrativos",
      pane1Title: "Valoración",
      pane1Tag: "AURORA",
      ticker: "TXN",
      kv1: [
        ["Precio", "price"],
        ["Valor intrínseco", "$168 – 214"],
        ["Diferencia frente al valor", "mos"],
        ["ROIC", "32.8%"],
        ["Rendimiento de caja", "3.6%"],
      ],
      verdict: "En rango",
      pane2Title: "Selección",
      pane2Tag: "BÚSQUEDA",
      rankHeader: ["Empresa", "Prioridad"],
      pane3Title: "Estrés",
      pane3Tag: "RIESGO",
      stressBigLabel: "CVaR 5% · 20 días",
      kv3: [
        ["P(pérdida)", "ploss"],
        ["P(caída ≤ −10%)", "dd"],
        ["Peor escenario", "worst"],
      ],
      stressFoot: "Ejemplo · escenarios adversos, no pronósticos",
      statusline: "Ejemplo con datos ilustrativos · reglas y supuestos visibles",
    },
    modulesKicker: "El proceso",
    modulesTitle: "Antes de invertir, responde cinco preguntas.",
    modulesSub: "BLS Prime no decide por ti. Ordena la información para que puedas decidir mejor.",
    channel: {
      index: "00",
      label: "Inteligencia de cartera",
      title: "Portfolio Intelligence",
      question: "¿Cuántas apuestas distintas tienes realmente?",
      body:
        "Confirma tus posiciones, identifica clusters y correlaciones ocultas, y construye una cola semanal de empresas con KPI y pruebas concretas.",
      note: "Cartera propia · apuestas efectivas · canales investigables",
      cta: "Analizar mi cartera",
    },
    modules: [
      {
        index: "01",
        label: "Valoración",
        title: "AURORA",
        question: "¿Qué valor tiene?",
        body: "Compara el precio con una estimación de valor y revisa qué supuestos la sostienen.",
        spec: "Precio · caja · rentabilidad · supuestos",
        href: "/aurora",
        cta: "Abrir AURORA",
      },
      {
        index: "02",
        label: "Búsqueda de oportunidades",
        title: "FactorLab",
        question: "¿Qué oportunidad merece atención?",
        body: "Encuentra empresas que vale la pena revisar antes de dedicarles horas.",
        spec: "filtros básicos · razones para revisar",
        href: "/factorlab",
        cta: "Abrir FactorLab",
      },
      {
        index: "03",
        label: "Riesgo de cartera",
        title: "Stress Engine",
        question: "¿Qué puede salir mal?",
        body: "Mide cuánto puede caer tu cartera y qué posiciones explican la pérdida.",
        spec: "escenarios adversos · pérdida · causas",
        href: "/stress",
        cta: "Analizar mi cartera — requiere cuenta",
        gated: true,
        requiresAccount: true,
      },
    ],
    workflowKicker: "La decisión completa",
    workflowSteps: [
      ["00", "¿Qué apuestas tienes y dónde podrías tener una señal?"],
      ["01", "¿Qué valor tiene?"],
      ["02", "¿Merece atención?"],
      ["03", "¿Qué puede salir mal?"],
    ],
    workflowClosing: "Y por último: ¿qué tamaño merece?",
  },
  en: {
    languageName: "English",
    languageAria: "Choose language",
    login: "Sign in",
    kicker: "BLS Prime · Clear information for investment decisions",
    category: "A practical way to study companies, opportunities, and portfolio risk before investing.",
    headline: "Information matters most when you have to decide.",
    subheadline:
      "BLS Prime brings valuation, opportunity search, and portfolio risk into one process.",
    ctaPrimary: "Create workspace",
    ctaSecondary: "See the modules",
    sampleDisclosure: "Illustrative example with sample data. No figure in this panel is live market data.",
    accountRequired: "Account required",
    footer: "Research software. Not financial advice.",
    terms: "Terms",
    privacy: "Privacy",
    terminal: {
      title: "BLS PRIME · RESEARCH",
      meta: "Illustrative example with sample data",
      pane1Title: "Valuation",
      pane1Tag: "AURORA",
      ticker: "TXN",
      kv1: [
        ["Price", "price"],
        ["Intrinsic value", "$168 – 214"],
        ["Difference from estimated value", "mos"],
        ["ROIC", "32.8%"],
        ["Cash return", "3.6%"],
      ],
      verdict: "In range",
      pane2Title: "Selection",
      pane2Tag: "SEARCH",
      rankHeader: ["Company", "Priority"],
      pane3Title: "Stress",
      pane3Tag: "RISK",
      stressBigLabel: "CVaR 5% · 20 days",
      kv3: [
        ["P(loss)", "ploss"],
        ["P(drawdown ≤ −10%)", "dd"],
        ["Worst scenario", "worst"],
      ],
      stressFoot: "Example · adverse scenarios, not forecasts",
      statusline: "Illustrative example · visible rules and assumptions",
    },
    modulesKicker: "The process",
    modulesTitle: "Before investing, answer five questions.",
    modulesSub: "BLS Prime does not decide for you. It organizes the information so you can decide better.",
    channel: {
      index: "00",
      label: "Portfolio intelligence",
      title: "Portfolio Intelligence",
      question: "How many distinct bets do you actually own?",
      body:
        "Confirm your holdings, find hidden correlation clusters, and build a weekly company queue with concrete KPIs and public tests.",
      note: "Your portfolio · effective bets · testable channels",
      cta: "Analyze my portfolio",
    },
    modules: [
      {
        index: "01",
        label: "Valuation",
        title: "AURORA",
        question: "What is it worth?",
        body: "Compare price with an estimated value and review the assumptions behind it.",
        spec: "Price · cash · returns · assumptions",
        href: "/aurora",
        cta: "Open AURORA",
      },
      {
        index: "02",
        label: "Opportunity search",
        title: "FactorLab",
        question: "Which opportunity deserves attention?",
        body: "Find companies worth reviewing before you spend hours on them.",
        spec: "basic filters · reasons to review",
        href: "/factorlab",
        cta: "Open FactorLab",
      },
      {
        index: "03",
        label: "Portfolio risk",
        title: "Stress Engine",
        question: "What can go wrong?",
        body: "Measure how far your portfolio could fall and which positions explain the loss.",
        spec: "adverse scenarios · loss · causes",
        href: "/stress",
        cta: "Analyze my portfolio — account required",
        gated: true,
        requiresAccount: true,
      },
    ],
    workflowKicker: "The full decision",
    workflowSteps: [
      ["00", "What bets do you own, and where might you have a signal?"],
      ["01", "What is it worth?"],
      ["02", "Does it deserve attention?"],
      ["03", "What can go wrong?"],
    ],
    workflowClosing: "Finally: what position size is appropriate?",
  },
};

const RANK_ROWS = [
  { ticker: "ASML", score: 0.91 },
  { ticker: "TXN", score: 0.88 },
  { ticker: "CNI", score: 0.84 },
  { ticker: "MCO", score: 0.81 },
];

const METRIC_BANDS = {
  price: [186.4, 188.3],
  mos: [3.9, 5.2],
  cvar: [-24.6, -22.4],
  ploss: [45.0, 47.5],
  dd: [30.0, 33.0],
  worst: [-39.5, -36.8],
};

function normalizeLanguage(value) {
  return value === "en" ? "en" : "es";
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const onChange = (event) => setReduced(event.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

function useReveal() {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return undefined;
    const nodes = Array.from(document.querySelectorAll(`.${styles.reveal}`));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.revealIn);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.18 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

function formatMetric(key, value) {
  if (key === "price") return `$${value.toFixed(2)}`;
  if (key === "mos") return `+${value.toFixed(1)}%`;
  return `${value.toFixed(1)}%`;
}

// Fixed illustrative figures. These must never drift or animate: an example
// number that moves reads as live market data, which it is not.
const SAMPLE_METRICS = Object.freeze({
  price: 187.2,
  mos: 4.6,
  cvar: -23.4,
  ploss: 46.2,
  dd: 31.4,
  worst: -38.1,
});

function TerminalSim({ copy, reducedMotion }) {
  const metrics = SAMPLE_METRICS;
  const [activeRow, setActiveRow] = useState(0);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const id = setInterval(() => {
      setActiveRow((row) => (row + 1) % RANK_ROWS.length);
    }, 3200);
    return () => clearInterval(id);
  }, [reducedMotion]);

  const t = copy.terminal;

  return (
    <div className={styles.terminal} aria-hidden="true">
      <div className={styles.termHeader}>
        <span className={styles.termTitle}>{t.title}</span>
        <span className={styles.termMeta}>{t.meta}</span>
      </div>

      <div className={styles.termGrid}>
        <section className={styles.pane}>
          <header className={styles.paneHeader}>
            <span className={styles.paneTitle}>{t.pane1Title}</span>
            <span className={styles.paneTag}>{t.pane1Tag}</span>
          </header>
          <p className={styles.paneTicker}>{t.ticker}</p>
          <dl className={styles.kvList}>
            {t.kv1.map(([label, value]) => (
              <div className={styles.kv} key={label}>
                <dt>{label}</dt>
                <dd className={value in METRIC_BANDS ? styles.liveValue : undefined}>
                  {value in METRIC_BANDS ? formatMetric(value, metrics[value]) : value}
                </dd>
              </div>
            ))}
          </dl>
          <span className={styles.verdictChip}>{t.verdict}</span>
        </section>

        <section className={styles.pane}>
          <header className={styles.paneHeader}>
            <span className={styles.paneTitle}>{t.pane2Title}</span>
            <span className={styles.paneTag}>{t.pane2Tag}</span>
          </header>
          <div className={styles.rankTable}>
            <div className={styles.rankHead}>
              <span>{t.rankHeader[0]}</span>
              <span>{t.rankHeader[1]}</span>
            </div>
            {RANK_ROWS.map((row, index) => (
              <div className={styles.rankRow} data-active={index === activeRow} key={row.ticker}>
                <span className={styles.rankTicker}>{row.ticker}</span>
                <span className={styles.rankBarTrack}>
                  <span className={styles.rankBarFill} style={{ width: `${row.score * 100}%` }} />
                </span>
                <span className={styles.rankScore}>{row.score.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.pane}>
          <header className={styles.paneHeader}>
            <span className={styles.paneTitle}>{t.pane3Title}</span>
            <span className={styles.paneTag}>{t.pane3Tag}</span>
          </header>
          <p className={styles.stressBig}>
            <span className={styles.liveValue}>{metrics.cvar.toFixed(1)}%</span>
            <small>{t.stressBigLabel}</small>
          </p>
          <svg className={styles.spark} viewBox="0 0 220 56" fill="none" preserveAspectRatio="none">
            <path
              className={styles.sparkArea}
              d="M0 10 C 42 12, 82 16, 112 22 C 152 30, 188 42, 220 52 L 220 56 L 0 56 Z"
            />
            <path
              className={styles.sparkLine}
              d="M0 10 C 42 12, 82 16, 112 22 C 152 30, 188 42, 220 52"
            />
            <line className={styles.sparkMarker} x1="176" y1="6" x2="176" y2="56" />
          </svg>
          <dl className={styles.kvList}>
            {t.kv3.map(([label, key]) => (
              <div className={styles.kv} key={label}>
                <dt>{label}</dt>
                <dd className={styles.liveValue}>
                  {key === "worst" ? `${metrics.worst.toFixed(1)}%` : `${metrics[key].toFixed(1)}%`}
                </dd>
              </div>
            ))}
          </dl>
          <p className={styles.paneFoot}>{t.stressFoot}</p>
        </section>
      </div>

      <div className={styles.statusline}>
        <span>{t.statusline}</span>
        <span className={styles.cursor} />
      </div>
    </div>
  );
}

export function PublicHomeExperience({ brand, initialLanguage = "es" }) {
  const [language, setLanguage] = useState(() => normalizeLanguage(initialLanguage));
  const reducedMotion = usePrefersReducedMotion();
  const copy = COPY[language];
  const displayBrand = brand || "BLS Prime";

  useEffect(() => {
    writeStoredLanguage(language);
  }, [language]);

  useReveal();

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.logo} href="/" aria-label={displayBrand}>
          {displayBrand}
        </Link>
        <div className={styles.topActions}>
          <LanguageToggle copy={copy} language={language} onChange={setLanguage} />
          <Link className={styles.loginLink} href={"/login?intent=signin&lang=" + language}>
            {copy.login}
          </Link>
        </div>
      </header>

      <BreakpointHero language={language} />

      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>{copy.kicker}</p>
          <p className={styles.categoryLine}>{copy.category}</p>
          <h2 className={styles.headline} id="home-title">
            {copy.headline}
          </h2>
          <p className={styles.subheadline}>{copy.subheadline}</p>
          <div className={styles.ctaRow}>
            <Link className={styles.ctaPrimary} href={"/login?intent=signup&lang=" + language}>
              {copy.ctaPrimary}
            </Link>
            <a className={styles.ctaSecondary} href="#modules">
              {copy.ctaSecondary}
            </a>
          </div>
        </div>
        <div className={styles.terminalWrap}>
          <p className={styles.sampleDisclosure}>{copy.sampleDisclosure}</p>
          <TerminalSim copy={copy} reducedMotion={reducedMotion} />
        </div>
      </section>

      <section className={styles.modules} id="modules">
        <div className={`${styles.sectionHead} ${styles.reveal}`}>
          <p className={styles.sectionKicker}>{copy.modulesKicker}</p>
          <h2 className={styles.sectionTitle}>{copy.modulesTitle}</h2>
          <p className={styles.sectionSub}>{copy.modulesSub}</p>
        </div>

        <Link
          className={`${styles.channelStrip} ${styles.reveal}`}
          href={`/channels?lang=${language}`}
        >
          <span className={styles.channelStripTop}>
            <span className={styles.channelIndex}>{copy.channel.index}</span>
            <span className={styles.channelLabel}>{copy.channel.label}</span>
          </span>
          <span className={styles.channelStripMain}>
            <span>
              <strong className={styles.channelTitle}>{copy.channel.title}</strong>
              <span className={styles.channelQuestion}>{copy.channel.question}</span>
            </span>
            <span className={styles.channelBody}>{copy.channel.body}</span>
          </span>
          <span className={styles.channelStripFoot}>
            <span className={styles.channelNote}>{copy.channel.note}</span>
            <em className={styles.moduleCta}>
              {copy.channel.cta}
              <span className={styles.ctaArrow}>→</span>
            </em>
          </span>
        </Link>

        <nav className={styles.moduleDeck} aria-label="BLS Prime modules">
          {copy.modules.map((module, i) => {
            const content = (
              <>
                <span className={styles.moduleTop}>
                  <span className={styles.moduleIndex}>{module.index}</span>
                  <span className={styles.moduleLabel}>{module.label}</span>
                  {module.requiresAccount ? (
                    <span className={styles.accountBadge}>{copy.accountRequired}</span>
                  ) : null}
                </span>
                <strong className={styles.moduleTitle}>{module.title}</strong>
                <span className={styles.moduleQuestion}>{module.question}</span>
                <span className={styles.moduleBody}>{module.body}</span>
                <span className={styles.moduleSpec}>{module.spec}</span>
                <em className={styles.moduleCta}>
                  {module.cta}
                  <span className={styles.ctaArrow}>→</span>
                </em>
              </>
            );
            const revealClass = `${styles.moduleCard} ${styles.reveal} ${styles[`delay${i}`]}`;
            return module.gated ? (
              <StressAccountGate className={revealClass} key={module.title} language={language}>
                {content}
              </StressAccountGate>
            ) : (
              <Link className={revealClass} href={module.href} key={module.title}>
                {content}
              </Link>
            );
          })}
        </nav>
      </section>

      <section className={styles.workflow}>
        <div className={`${styles.sectionHead} ${styles.reveal}`}>
          <p className={styles.sectionKicker}>{copy.workflowKicker}</p>
        </div>
        <ol className={`${styles.steps} ${styles.reveal}`}>
          {copy.workflowSteps.map(([index, text]) => (
            <li className={styles.step} key={index}>
              <span className={styles.stepIndex}>{index}</span>
              <span className={styles.stepText}>{text}</span>
            </li>
          ))}
        </ol>
        <p className={`${styles.closing} ${styles.reveal}`}>{copy.workflowClosing}</p>
        <div className={`${styles.closingCtaRow} ${styles.reveal}`}>
          <Link className={styles.ctaPrimary} href={"/login?intent=signup&lang=" + language}>
            {copy.ctaPrimary}
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>{copy.footer}</span>
        <nav className={styles.footerLinks} aria-label={copy.privacy + " / " + copy.terms}>
          <Link href={"/privacy?lang=" + language}>{copy.privacy}</Link>
          <Link href={"/terms?lang=" + language}>{copy.terms}</Link>
        </nav>
      </footer>
    </main>
  );
}

function LanguageToggle({ copy, language, onChange }) {
  return (
    <div className={styles.languageToggle} aria-label={copy.languageAria} role="group">
      {[
        { code: "es", label: "ES" },
        { code: "en", label: "EN" },
      ].map((option) => (
        <button
          aria-label={COPY[option.code].languageName}
          aria-pressed={language === option.code}
          data-active={language === option.code}
          key={option.code}
          onClick={() => onChange(normalizeLanguage(option.code))}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
