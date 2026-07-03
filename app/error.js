"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const rawAppName = process.env.NEXT_PUBLIC_BLS_APP_NAME || "BLS Prime";
const appName = /allocator workspace/i.test(rawAppName) ? "BLS Prime" : rawAppName;

const COPY = {
  en: {
    kicker: "Workspace problem",
    title: "We could not open the workspace.",
    body: "The public pages are still available. Try again, or return to the Stress Engine presentation before signing in.",
    retry: "Try again",
    stress: "Stress Engine",
    home: "Home",
  },
  es: {
    kicker: "Problema de workspace",
    title: "No pudimos abrir el workspace.",
    body:
      "Las p\u00e1ginas p\u00fablicas siguen disponibles. Intenta de nuevo o vuelve a la presentaci\u00f3n de Stress Engine antes de iniciar sesi\u00f3n.",
    retry: "Intentar de nuevo",
    stress: "Stress Engine",
    home: "Inicio",
  },
};

function getInitialLanguage() {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem("blsprime_language_preference");
  if (stored === "en" || stored === "es") return stored;
  return window.navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

export default function Error({ error, reset }) {
  const [language, setLanguage] = useState("en");
  const copy = COPY[language] || COPY.en;

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    setLanguage(getInitialLanguage());
  }, []);

  return (
    <main className="status-page">
      <div className="status-shell premium-card">
        <p className="landing-kicker">{copy.kicker}</p>
        <p className="brand-wordmark">{appName}</p>
        <h1>{copy.title}</h1>
        <p className="landing-support">{copy.body}</p>
        <div className="hero-cta-row">
          <button className="primary-button" onClick={() => reset()}>
            {copy.retry}
          </button>
          <Link className="ghost-button" href="/stress">
            {copy.stress}
          </Link>
          <Link className="ghost-button" href="/">
            {copy.home}
          </Link>
        </div>
      </div>
    </main>
  );
}
