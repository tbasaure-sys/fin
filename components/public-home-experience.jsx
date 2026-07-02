"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "@/app/home-page.module.css";
import { LANGUAGE_STORAGE_KEY, writeStoredLanguage } from "@/components/language-layer";

const COPY = {
  es: {
    languageName: "Español",
    languageAria: "Elegir idioma",
    kicker: "BLS Prime",
    category: "Terminal institucional de análisis de acciones.",
    headline: "Tres módulos. Una decisión.",
    body: "Valora una empresa, encuentra candidatas y pon a prueba tu cartera antes de mover capital.",
    enter: "Entrar",
    login: "Iniciar sesión",
    footer: "Software de análisis. No es asesoría financiera.",
    modules: [
      {
        title: "AURORA",
        label: "Valoración",
        body: "¿Vale la acción lo que cuesta? Una lectura completa y auditable de cualquier empresa.",
        href: "/aurora",
        cta: "Abrir AURORA",
      },
      {
        title: "FactorLab",
        label: "Selección",
        body: "¿Qué acciones merecen atención? Candidatas ordenadas con las reglas a la vista.",
        href: "/factorlab",
        cta: "Abrir FactorLab",
      },
      {
        title: "Stress Engine",
        label: "Riesgo de cartera",
        body: "¿Qué tan mal puede salir? Miles de crisis simuladas contra tu cartera real.",
        href: "/app#holdings",
        cta: "Probar mi cartera",
      },
    ],
  },
  en: {
    languageName: "English",
    languageAria: "Choose language",
    kicker: "BLS Prime",
    category: "Institutional research terminal for equity decisions.",
    headline: "Three modules. One decision.",
    body: "Institutional equity research terminal for valuation, candidate selection, and portfolio stress testing before capital moves.",
    enter: "Enter",
    login: "Login",
    footer: "Research software. Not financial advice.",
    modules: [
      {
        title: "AURORA",
        label: "Valuation",
        body: "Is this stock worth its price? A full, auditable read on any company.",
        href: "/aurora",
        cta: "Open AURORA",
      },
      {
        title: "FactorLab",
        label: "Screening",
        body: "Which stocks deserve a look? Ranked candidates with the rules shown, not hidden.",
        href: "/factorlab",
        cta: "Open FactorLab",
      },
      {
        title: "Stress Engine",
        label: "Portfolio Risk",
        body: "How bad can it get? Thousands of simulated crises run against your actual portfolio.",
        href: "/app#holdings",
        cta: "Run stress test",
      },
    ],
  },
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

export function PublicHomeExperience({ brand }) {
  const [language, setLanguage] = useState("es");
  const [resolved, setResolved] = useState(false);
  const copy = COPY[language];
  const displayBrand = "BL'S";

  useEffect(() => {
    setLanguage(getInitialLanguage());
    setResolved(true);
  }, []);

  useEffect(() => {
    if (resolved) writeStoredLanguage(language);
  }, [language, resolved]);

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="home-title">
        <header className={styles.topbar}>
          <Link className={styles.logo} href="/" aria-label={displayBrand}>
            {displayBrand}
          </Link>

          <div className={styles.topActions}>
            <LanguageToggle copy={copy} language={language} onChange={setLanguage} />
            <Link className={styles.loginLink} href="/login">
              {copy.login}
            </Link>
          </div>
        </header>

        <div className={styles.copyBlock}>
          <p className={styles.kicker}>{copy.kicker}</p>
          <p className={styles.categoryLine}>{copy.category}</p>
          <h1 id="home-title">{copy.headline}</h1>
          <p>{copy.body}</p>
        </div>

        <nav className={styles.moduleDeck} aria-label="BLS Prime modules">
          {copy.modules.map((module, index) => (
            <Link className={styles.moduleButton} href={module.href} key={module.title}>
              <span className={styles.moduleIndex}>{String(index + 1).padStart(2, "0")}</span>
              <span className={styles.moduleText}>
                <span>{module.label}</span>
                <strong>{module.title}</strong>
                <small>{module.body}</small>
              </span>
              <em>{module.cta}</em>
            </Link>
          ))}
        </nav>

        <footer className={styles.footer}>
          <span>{copy.footer}</span>
          <Link href="/terms">Terms</Link>
        </footer>
      </section>
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
