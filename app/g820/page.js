import { headers } from "next/headers";

import { G820Workstation } from "@/components/g820-workstation";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

const METADATA = {
  es: {
    title: "G820 · Dislocación y margen de seguridad",
    description: "Un compilador de evidencia inspirado en los capítulos 8 y 20 de Graham para priorizar diligencia, no compras.",
  },
  en: {
    title: "G820 · Dislocation and margin of safety",
    description: "A Graham chapters 8 and 20 evidence compiler for prioritizing diligence, not trades.",
  },
};

export function generateMetadata() {
  const locale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  return {
    ...METADATA[locale],
    alternates: {
      canonical: "/g820",
      languages: { es: "/g820?lang=es", en: "/g820?lang=en" },
    },
  };
}

export default function G820Page() {
  const initialLanguage = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  return <G820Workstation initialLanguage={initialLanguage} />;
}
