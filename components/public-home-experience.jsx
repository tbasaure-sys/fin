"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import styles from "@/app/home-page.module.css";
import { LANGUAGE_STORAGE_KEY, writeStoredLanguage } from "@/components/language-layer";
import { StressAccountGate } from "@/components/stress-account-gate";

const COPY = {
  es: {
    languageName: "Español",
    languageAria: "Elegir idioma",
    login: "Iniciar sesión",
    kicker: "BLS Prime · Terminal de research institucional",
    headline: "La tesis se prueba antes de mover el capital.",
    subheadline:
      "Valoración fundamental, selección con reglas visibles y estrés de cartera. Un solo sistema disciplinado.",
    ctaPrimary: "Entrar a la terminal",
    ctaSecondary: "Ver los módulos",
    footer: "Software de análisis. No es asesoría financiera.",
    terms: "Términos",
    terminal: {
      title: "BLS PRIME · RESEARCH",
      meta: "sesión auditada",
      pane1Title: "Valoración",
      pane1Tag: "AURORA",
      ticker: "TXN",
      kv1: [
        ["Precio", "price"],
        ["Valor intrínseco", "$168 – 214"],
        ["Margen de seguridad", "mos"],
        ["ROIC", "32.8%"],
        ["FCF yield", "3.6%"],
      ],
      verdict: "En rango",
      pane2Title: "Selección",
      pane2Tag: "FACTORLAB",
      rankHeader: ["Ticker", "Score"],
      pane3Title: "Estrés",
      pane3Tag: "STRESS ENGINE",
      stressBigLabel: "CVaR 5% · 20 días",
      kv3: [
        ["P(pérdida)", "ploss"],
        ["P(caída ≤ −10%)", "dd"],
        ["Peor escenario", "worst"],
      ],
      stressFoot: "5.000 escenarios · régimen: crisis · seed 8841",
      statusline: "banco factorial point-in-time · corrida reproducible · escenarios, no predicciones",
    },
    modulesKicker: "El sistema",
    modulesTitle: "Tres módulos. Una decisión.",
    modulesSub: "Cada módulo es una pieza de la misma terminal, no una herramienta suelta.",
    modules: [
      {
        index: "01",
        label: "Valoración",
        title: "AURORA",
        question: "¿Vale la acción lo que cuesta?",
        body: "Precio contra valor, calidad del negocio y qué tendría que ser cierto para que la tesis falle.",
        spec: "10-K · ROIC · FCF · margen de seguridad",
        href: "/aurora",
        cta: "Abrir AURORA",
      },
      {
        index: "02",
        label: "Selección",
        title: "FactorLab",
        question: "¿Qué acciones merecen atención?",
        body: "Candidatas ordenadas con las reglas a la vista. Sin cajas negras, sin señales mágicas.",
        spec: "ranking point-in-time · reglas visibles",
        href: "/factorlab",
        cta: "Abrir FactorLab",
      },
      {
        index: "03",
        label: "Riesgo de cartera",
        title: "Stress Engine",
        question: "¿Qué tan mal puede salir?",
        body: "Miles de escenarios adversos contra la cartera real. La pérdida, su probabilidad y sus causas, a la vista.",
        spec: "5.000 escenarios · CVaR · atribución de cola",
        href: "/stress",
        cta: "Probar mi cartera",
        gated: true,
      },
    ],
    workflowKicker: "El proceso",
    workflowSteps: [
      ["01", "Valora la empresa."],
      ["02", "Ordena la oportunidad."],
      ["03", "Estresa la cartera."],
    ],
    workflowClosing: "Recién entonces se mueve el capital.",
  },
  en: {
    languageName: "English",
    languageAria: "Choose language",
    login: "Sign in",
    kicker: "BLS Prime · Institutional research terminal",
    headline: "Before capital moves, the thesis is tested.",
    subheadline:
      "Fundamental valuation, rule-visible selection, and portfolio stress. One disciplined system.",
    ctaPrimary: "Enter the terminal",
    ctaSecondary: "See the modules",
    footer: "Research software. Not financial advice.",
    terms: "Terms",
    terminal: {
      title: "BLS PRIME · RESEARCH",
      meta: "audited session",
      pane1Title: "Valuation",
      pane1Tag: "AURORA",
      ticker: "TXN",
      kv1: [
        ["Price", "price"],
        ["Intrinsic value", "$168 – 214"],
        ["Margin of safety", "mos"],
        ["ROIC", "32.8%"],
        ["FCF yield", "3.6%"],
      ],
      verdict: "In range",
      pane2Title: "Selection",
      pane2Tag: "FACTORLAB",
      rankHeader: ["Ticker", "Score"],
      pane3Title: "Stress",
      pane3Tag: "STRESS ENGINE",
      stressBigLabel: "CVaR 5% · 20 days",
      kv3: [
        ["P(loss)", "ploss"],
        ["P(drawdown ≤ −10%)", "dd"],
        ["Worst scenario", "worst"],
      ],
      stressFoot: "5,000 scenarios · regime: crisis · seed 8841",
      statusline: "point-in-time factor bank · reproducible run · scenarios, not predictions",
    },
    modulesKicker: "The system",
    modulesTitle: "Three modules. One decision.",
    modulesSub: "Each module is a part of the same terminal, not a loose tool.",
    modules: [
      {
        index: "01",
        label: "Valuation",
        title: "AURORA",
        question: "Is the stock worth its price?",
        body: "Price against value, business quality, and what would have to be true for the thesis to fail.",
        spec: "10-K · ROIC · FCF · margin of safety",
        href: "/aurora",
        cta: "Open AURORA",
      },
      {
        index: "02",
        label: "Selection",
        title: "FactorLab",
        question: "Which stocks deserve attention?",
        body: "Candidates ranked with the rules in plain sight. No black boxes, no magic signals.",
        spec: "point-in-time ranking · visible rules",
        href: "/factorlab",
        cta: "Open FactorLab",
      },
      {
        index: "03",
        label: "Portfolio risk",
        title: "Stress Engine",
        question: "How bad can it get?",
        body: "Thousands of adverse scenarios against the actual portfolio. The loss, its probability, and its causes, in plain sight.",
        spec: "5,000 scenarios · CVaR · tail attribution",
        href: "/stress",
        cta: "Test my portfolio",
        gated: true,
      },
    ],
    workflowKicker: "The workflow",
    workflowSteps: [
      ["01", "Value the company."],
      ["02", "Rank the opportunity."],
      ["03", "Stress the portfolio."],
    ],
    workflowClosing: "Only then does capital move.",
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

function getInitialLanguage() {
  if (typeof window === "undefined") return "es";
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "en" || stored === "es") return stored;
  return window.navigator.language?.toLowerCase().startsWith("en") ? "en" : "es";
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

function TerminalSim({ copy, reducedMotion }) {
  const [metrics, setMetrics] = useState({
    price: 187.2,
    mos: 4.6,
    cvar: -23.4,
    ploss: 46.2,
    dd: 31.4,
    worst: -38.1,
  });
  const [activeRow, setActiveRow] = useState(0);
  const tickRef = useRef(0);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const keys = Object.keys(METRIC_BANDS);
    const id = setInterval(() => {
      tickRef.current += 1;
      const key = keys[tickRef.current % keys.length];
      setMetrics((prev) => {
        const [lo, hi] = METRIC_BANDS[key];
        const drift = (hi - lo) * 0.12 * (Math.random() - 0.5) * 2;
        const next = Math.min(hi, Math.max(lo, prev[key] + drift));
        return { ...prev, [key]: next };
      });
    }, 4200);
    return () => clearInterval(id);
  }, [reducedMotion]);

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

export function PublicHomeExperience({ brand }) {
  const [language, setLanguage] = useState("es");
  const [resolved, setResolved] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const copy = COPY[language];
  const displayBrand = "BL'S";

  useEffect(() => {
    setLanguage(getInitialLanguage());
    setResolved(true);
  }, []);

  useEffect(() => {
    if (resolved) writeStoredLanguage(language);
  }, [language, resolved]);

  useReveal();

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.logo} href="/" aria-label={displayBrand}>
          {displayBrand}
        </Link>
        <div className={styles.topActions}>
          <LanguageToggle copy={copy} language={language} onChange={setLanguage} />
          <Link className={styles.loginLink} href={`/login?lang=${language}`}>
            {copy.login}
          </Link>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>{copy.kicker}</p>
          <h1 className={styles.headline} id="home-title">
            {copy.headline}
          </h1>
          <p className={styles.subheadline}>{copy.subheadline}</p>
          <div className={styles.ctaRow}>
            <Link className={styles.ctaPrimary} href={`/login?lang=${language}`}>
              {copy.ctaPrimary}
            </Link>
            <a className={styles.ctaSecondary} href="#modules">
              {copy.ctaSecondary}
            </a>
          </div>
        </div>
        <div className={styles.terminalWrap}>
          <TerminalSim copy={copy} reducedMotion={reducedMotion} />
        </div>
      </section>

      <section className={styles.modules} id="modules">
        <div className={`${styles.sectionHead} ${styles.reveal}`}>
          <p className={styles.sectionKicker}>{copy.modulesKicker}</p>
          <h2 className={styles.sectionTitle}>{copy.modulesTitle}</h2>
          <p className={styles.sectionSub}>{copy.modulesSub}</p>
        </div>

        <nav className={styles.moduleDeck} aria-label="BLS Prime modules">
          {copy.modules.map((module, i) => {
            const content = (
              <>
                <span className={styles.moduleTop}>
                  <span className={styles.moduleIndex}>{module.index}</span>
                  <span className={styles.moduleLabel}>{module.label}</span>
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
          <Link className={styles.ctaPrimary} href={`/login?lang=${language}`}>
            {copy.ctaPrimary}
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>{copy.footer}</span>
        <Link href="/terms">{copy.terms}</Link>
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
