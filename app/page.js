import { headers } from "next/headers";
import { PublicHomeExperience } from "@/components/public-home-experience";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";
import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

const HOME_METADATA = {
  es: {
    title: "BLS Prime | Espacio de decisión de inversión",
    description:
      "Descubre empresas, contrasta precio y valor, y comprueba el efecto sobre tu cartera con datos fechados, supuestos visibles y razones claras para actuar o pasar.",
  },
  en: {
    title: "BLS Prime | Investment decision workspace",
    description:
      "Discover companies, weigh price against value, and test the effect on your portfolio with dated data, visible assumptions, and clear reasons to act or pass.",
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
  const config = getServerConfig();
  const publicBrand = /allocator workspace/i.test(config.appName) ? "BLS Prime" : config.appName;
  const initialLanguage = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");

  return <PublicHomeExperience brand={publicBrand} initialLanguage={initialLanguage} />;
}
