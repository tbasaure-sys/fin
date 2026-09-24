import Link from "next/link";
import { headers } from "next/headers";

import { PublicSiteHeader } from "@/components/public-shell/public-site-header";
import styles from "@/components/status/status-page.module.css";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

const COPY = {
  es: {
    kicker: "Error 404",
    title: "Esta página no existe.",
    body: "Puede que el enlace esté incompleto o que la página se haya movido. Empieza desde el ejemplo público o vuelve al inicio.",
    example: "Ver ejemplo",
    research: "Investigar una empresa",
    home: "Volver al inicio",
  },
  en: {
    kicker: "Error 404",
    title: "This page does not exist.",
    body: "The link may be incomplete or the page may have moved. Start from the public example or go back home.",
    example: "See example",
    research: "Research a company",
    home: "Back to home",
  },
};

export const metadata = {
  title: "404",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  const language = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  const copy = COPY[language];

  return (
    <>
      <PublicSiteHeader initialLanguage={language} />
      <main className={styles.page}>
        <div className={styles.inner}>
          <p className={styles.kicker}>{copy.kicker}</p>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.body}>{copy.body}</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href={`/example?lang=${language}`}>{copy.example}</Link>
            <Link className={styles.secondary} href={`/research?lang=${language}`}>{copy.research}</Link>
            <Link className={styles.secondary} href={`/?lang=${language}`}>{copy.home}</Link>
          </div>
        </div>
      </main>
    </>
  );
}
