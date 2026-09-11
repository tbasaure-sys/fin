import { headers } from "next/headers";
import { PublicHomeExperience } from "@/components/public-home-experience";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

const HOME_METADATA = {
  es: {
    title: "BLS Prime | Espacio de decisión de inversión",
    description:
      "El valor no siempre está a la vista. Investiga el negocio, cuestiona el precio y conecta evidencia, valoración y cartera.",
  },
  en: {
    title: "BLS Prime | Investment decision workspace",
    description:
      "Value is not always in plain sight. Study the business, question the price and connect evidence, valuation and portfolio context.",
  },
};

export function generateMetadata() {
  const locale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  const copy = HOME_METADATA[locale];

  return {
    title: { absolute: copy.title },
    description: copy.description,
    alternates: {
      canonical: "/",
      languages: { es: "/?lang=es", en: "/?lang=en" },
    },
    openGraph: {
      locale: locale === "en" ? "en_US" : "es_ES",
      title: copy.title,
      description: copy.description,
    },
    twitter: {
      title: copy.title,
      description: copy.description,
    },
  };
}

export default async function HomePage() {
  const initialLanguage = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");

  return <PublicHomeExperience initialLanguage={initialLanguage} />;
}
