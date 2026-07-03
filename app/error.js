"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const rawAppName = process.env.NEXT_PUBLIC_BLS_APP_NAME || "BLS Prime";
const appName = /allocator workspace/i.test(rawAppName) ? "BLS Prime" : rawAppName;

const COPY = {
  en: {
    kicker: "Workspace problem",
    title: "We could not open the workspace.",
    body: "The workspace needs a clean session. Start from the Stress Engine presentation, then sign in only when you are ready to run your portfolio.",
    retry: "Reload workspace",
    stress: "Stress Engine",
    home: "Home",
  },
  es: {
    kicker: "Problema de workspace",
    title: "No pudimos abrir el workspace.",
    body:
      "El workspace necesita una sesi\u00f3n limpia. Parte desde la presentaci\u00f3n de Stress Engine e inicia sesi\u00f3n solo cuando quieras correr tu cartera.",
    retry: "Recargar workspace",
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
          <Link className="primary-button" href="/stress">
            {copy.stress}
          </Link>
          <Link className="ghost-button" href="/">
            {copy.home}
          </Link>
          <button className="ghost-button" onClick={() => reset()}>
            {copy.retry}
          </button>
        </div>
      </div>
    </main>
  );
}
