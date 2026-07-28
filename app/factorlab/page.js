import { FactorLabWorkstation } from "@/components/factorlab-workstation";
import { headers } from "next/headers";

import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";
import { parseFactorLabFilters } from "@/lib/factorlab-workspace";

export const dynamic = "force-dynamic";

const METADATA = {
  es: {
    title: "Descubrimiento de empresas",
    description:
      "Descubre empresas con datos de mercado actuales, estados financieros presentados y controles de investigación visibles.",
  },
  en: {
    title: "Company discovery",
    description:
      "Discover companies with current market data, filed financial statements, and visible research gates.",
  },
};

export function generateMetadata() {
  const locale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  const copy = METADATA[locale];

  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: "/factorlab",
      languages: { es: "/factorlab?lang=es", en: "/factorlab?lang=en" },
    },
  };
}

export default function FactorLabPage({ searchParams }) {
  const initialLanguage = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  const initialFilters = parseFactorLabFilters(searchParams);

  return (
    <main className="factorlab-route">
      <FactorLabWorkstation initialFilters={initialFilters} initialLanguage={initialLanguage} />
    </main>
  );
}
