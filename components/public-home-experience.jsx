"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "@/app/home-page.module.css";
import { LANGUAGE_STORAGE_KEY, writeStoredLanguage } from "@/components/language-layer";

const COPY = {
  es: {
    languageName: "Espanol",
    languageAria: "Elegir idioma",
    kicker: "BLS Prime",
    headline: "Tres modulos. Una decision.",
    body: "Valora una tesis, filtra candidatos o simula el mercado antes de mover capital.",
    enter: "Entrar",
    login: "Login",
    footer: "Research software. No es asesoria financiera.",
    modules: [
      {
        title: "AURORA",
        label: "Valuation OS",
        body: "Precio, negocio, cartera y falsificadores en una lectura revisable.",
        href: "/aurora",
        cta: "Abrir AURORA",
      },
      {
        title: "FactorLab",
        label: "Screening",
        body: "Ranking point-in-time de candidatos sin leakage y con reglas visibles.",
        href: "/factorlab",
        cta: "Abrir FactorLab",
      },
      {
        title: "Market Simulation",
        label: "Factor-DDPM",
        body: "Stress book sintetico, CVaR, drawdown y contrato v7 offline-gated.",
        href: "/app#risk",
        cta: "Abrir simulador",
      },
    ],
  },
  en: {
    languageName: "English",
    languageAria: "Choose language",
    kicker: "BLS Prime",
    headline: "Three modules. One decision.",
    body: "Value a thesis, screen candidates, or simulate market stress before moving capital.",
    enter: "Enter",
    login: "Login",
    footer: "Research software. Not financial advice.",
    modules: [
      {
        title: "AURORA",
        label: "Valuation OS",
        body: "Price, business quality, portfolio risk, and falsifiers in one auditable read.",
        href: "/aurora",
        cta: "Open AURORA",
      },
      {
        title: "FactorLab",
        label: "Screening",
        body: "Point-in-time candidate ranking with visible rules and no leakage.",
        href: "/factorlab",
        cta: "Open FactorLab",
      },
      {
        title: "Market Simulation",
        label: "Factor-DDPM",
        body: "Synthetic stress book, CVaR, drawdown, and the gated v7 deployment contract.",
        href: "/app#risk",
        cta: "Open simulator",
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
