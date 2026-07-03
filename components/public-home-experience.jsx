"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "@/app/home-page.module.css";
import { LANGUAGE_STORAGE_KEY, writeStoredLanguage } from "@/components/language-layer";

const COPY = {
  es: {
    languageName: "Espa\u00f1ol",
    languageAria: "Elegir idioma",
    kicker: "BLS Prime",
    category: "Terminal institucional de an\u00e1lisis de acciones.",
    headline: "Tres m\u00f3dulos. Una decisi\u00f3n.",
    body: "Valora una empresa, encuentra candidatas y pon a prueba tu cartera antes de mover capital.",
    login: "Iniciar sesi\u00f3n",
    footer: "Software de an\u00e1lisis. No es asesor\u00eda financiera.",
    terms: "T\u00e9rminos",
    modules: [
      {
        title: "AURORA",
        label: "Valoraci\u00f3n",
        body: "\u00bfVale la acci\u00f3n lo que cuesta? Una lectura completa y auditable de cualquier empresa.",
        href: "/aurora",
        cta: "Abrir AURORA",
      },
      {
        title: "FactorLab",
        label: "Selecci\u00f3n",
        body: "\u00bfQu\u00e9 acciones merecen atenci\u00f3n? Candidatas ordenadas con las reglas a la vista.",
        href: "/factorlab",
        cta: "Abrir FactorLab",
      },
      {
        title: "Stress Engine",
        label: "Riesgo de cartera",
        body: "\u00bfQu\u00e9 tan mal puede salir? Miles de escenarios adversos contra tu cartera real.",
        href: "/stress",
        cta: "Ver Stress Engine",
      },
    ],
  },
  en: {
    languageName: "English",
    languageAria: "Choose language",
    kicker: "BLS Prime",
    category: "Institutional research terminal for equity decisions.",
    headline: "Three modules. One decision.",
    body: "Value companies, surface candidates, and stress test a real portfolio before capital moves.",
    login: "Login",
    footer: "Research software. Not financial advice.",
    terms: "Terms",
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
        body: "How bad can it get? Thousands of adverse scenarios run against your actual portfolio.",
        href: "/stress",
        cta: "See Stress Engine",
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

export function PublicHomeExperience() {
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
            <Link className={styles.loginLink} href={`/login?lang=${language}`}>
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
          {copy.modules.map((module, index) => {
            const content = (
              <>
                <span className={styles.moduleIndex}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.moduleText}>
                  <span>{module.label}</span>
                  <strong>{module.title}</strong>
                  <small>{module.body}</small>
                </span>
                <em>{module.cta}</em>
              </>
            );

            return (
              <Link className={styles.moduleButton} href={module.href} key={module.title}>
                {content}
              </Link>
            );
          })}
        </nav>

        <footer className={styles.footer}>
          <span>{copy.footer}</span>
          <Link href="/terms">{copy.terms}</Link>
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
