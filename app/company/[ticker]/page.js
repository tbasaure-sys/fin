import { headers } from "next/headers";

import CompanyDecisionWorkspace from "@/components/company-decision-workspace";
import { PublicSiteHeader } from "@/components/public-shell/public-site-header";
import { TXN_COMPANY_DEMO_VIEW } from "@/lib/company-demo";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function cleanTicker(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 16) || "EMPRESA";
}
export function generateMetadata({ params }) {
  const ticker = cleanTicker(params?.ticker);
  return {
    title: `${ticker} | Lectura de compañía`,
    description: `Precio, rango defendible, tesis, escenarios, evidencia y auditoría de ${ticker} en una sola lectura.`,
    alternates: { canonical: `/company/${encodeURIComponent(ticker)}` },
  };
}

export default function PublicCompanyPage({ params, searchParams }) {
  const ticker = cleanTicker(params?.ticker);
  const language = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  const initialView = ticker === "TXN" && searchParams?.demo === "1" ? TXN_COMPANY_DEMO_VIEW : null;

  return (
    <div className={styles.route}>
      <PublicSiteHeader availableLanguages={["es"]} initialLanguage={language} />
      <CompanyDecisionWorkspace initialView={initialView} publicMode ticker={ticker} />
    </div>
  );
}
