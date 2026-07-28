import { headers } from "next/headers";

import { StressEnginePublicPage } from "@/components/stress-engine-public-page";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

const METADATA = {
  es: {
    title: "Riesgo de cartera",
    description:
      "Prueba el riesgo de una cartera con escenarios condicionados por régimen, CVaR, probabilidad de caída y supuestos visibles.",
  },
  en: {
    title: "Portfolio risk",
    description:
      "Test portfolio risk with regime-conditioned scenarios, CVaR, drawdown probability, and visible assumptions.",
  },
};

export function generateMetadata() {
  const locale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  const copy = METADATA[locale];

  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: "/stress",
      languages: { es: "/stress?lang=es", en: "/stress?lang=en" },
    },
  };
}

export default function StressPage() {
  const initialLanguage = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");

  return <StressEnginePublicPage initialLanguage={initialLanguage} />;
}
