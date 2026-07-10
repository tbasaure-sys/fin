"use client";

import { useEffect, useState } from "react";
import { useLanguagePreference } from "@/components/language-layer";
import { InfoTip } from "@/components/ui/info-tip";
import { VERDICT } from "@/lib/aurora-copy-map";

const COPY = {
  en: {
    aria: "AURORA verdict",
    reason: "Why",
    nextStep: "Next step",
    techLabel: "Valuation reading",
  },
  es: {
    aria: "Veredicto AURORA",
    reason: "Motivo",
    nextStep: "Próximo paso",
    techLabel: "Lectura de valoración",
  },
};

export function AuroraVerdictCard({ tier, reason, nextStep, className = "" }) {
  const { language } = useLanguagePreference();
  const [resolvedLanguage, setResolvedLanguage] = useState("es");
  useEffect(() => setResolvedLanguage(document.documentElement.lang === "en" ? "en" : "es"), [language]);
  const copy = COPY[resolvedLanguage] || COPY.es;
  const verdict = VERDICT[tier] || VERDICT.ABSTAIN;

  return (
    <section className={className} data-tone={verdict.tone} aria-label={copy.aria}>
      <span>{verdict.label}</span>
      <h2>{verdict.headline}</h2>
      <p>{verdict.sub}</p>
      <p>
        <strong>{copy.techLabel}</strong>
        <InfoTip definitionKey="score" language={resolvedLanguage} />
      </p>
      {reason ? <p><strong>{copy.reason}:</strong> {reason}</p> : null}
      {nextStep ? <p><strong>{copy.nextStep}:</strong> {nextStep}</p> : null}
    </section>
  );
}
