"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { useLanguagePreference } from "@/components/language-preference";

export * from "@/components/language-preference";

const LegacyLanguageTranslator = dynamic(
  () => import("@/components/legacy-language-layer").then((module) => module.LegacyLanguageTranslator),
  { ssr: false, loading: () => null },
);

const COMPONENT_LOCALIZED_PATHS = new Set([
  "/",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/terms",
  "/aurora",
  "/valuation-os-lab",
  "/factorlab",
  "/stress",
  "/channels",
]);

const LANGUAGE_DOCK_OMITTED_PATHS = new Set(["/", "/channels", "/aurora"]);

function LanguageDock({ language, setLanguage }) {
  return (
    <div className="global-language-dock" data-no-translate aria-label={language === "es" ? "Elegir idioma" : "Choose language"}>
      <span>{language === "es" ? "Idioma" : "Language"}</span>
      <button aria-pressed={language === "en"} data-active={language === "en"} onClick={() => setLanguage("en")} type="button">
        EN
      </button>
      <button aria-pressed={language === "es"} data-active={language === "es"} onClick={() => setLanguage("es")} type="button">
        ES
      </button>
    </div>
  );
}

export function LanguageLayer({ initialLanguage = "en" }) {
  const { language, setLanguage } = useLanguagePreference(initialLanguage);
  const path = usePathname() || "/";

  if (LANGUAGE_DOCK_OMITTED_PATHS.has(path)) return null;

  return (
    <>
      {COMPONENT_LOCALIZED_PATHS.has(path) ? null : <LegacyLanguageTranslator language={language} />}
      <LanguageDock language={language} setLanguage={setLanguage} />
    </>
  );
}
