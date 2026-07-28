import Link from "next/link";
import { headers } from "next/headers";

import styles from "@/app/public-section.module.css";
import { PublicSiteHeader } from "@/components/public-shell/public-site-header";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

const COPY = {
  es: {
    eyebrow: "BLS Prime · Metodología",
    title: "La confianza empieza donde terminan los datos.",
    lead: "Cada lectura separa hechos observados, supuestos, cálculos y juicio. Cuando la evidencia no alcanza, el resultado debe decirlo.",
    rows: [
      ["01", "Fecha y fuente", "Toda cifra financiera visible debe indicar su fecha, su procedencia o un estado explícito de dato faltante."],
      ["02", "Supuestos visibles", "Los rangos y escenarios conservan los supuestos que los producen para que otra persona pueda discutirlos o reproducirlos."],
      ["03", "Incertidumbre honesta", "Una lectura incompleta no se convierte en una cifra precisa. Se muestra qué falta y por qué importa."],
      ["04", "Sin asesoría", "BLS Prime organiza investigación. No ejecuta operaciones ni sustituye el juicio independiente del usuario."],
    ],
    closing: "Revisa el método dentro de cada resultado, no en una caja negra separada.",
    cta: "Ver producto",
  },
  en: {
    eyebrow: "BLS Prime · Methodology",
    title: "Trust begins where the data ends.",
    lead: "Every reading separates observed facts, assumptions, calculations, and judgment. When evidence is insufficient, the result must say so.",
    rows: [
      ["01", "Date and source", "Every visible financial figure must show its date, provenance, or an explicit missing-data state."],
      ["02", "Visible assumptions", "Ranges and scenarios preserve the assumptions that produce them so another person can challenge or reproduce the result."],
      ["03", "Honest uncertainty", "An incomplete reading does not become a precise figure. It shows what is missing and why it matters."],
      ["04", "No advice", "BLS Prime organizes research. It does not execute trades or replace the user's independent judgment."],
    ],
    closing: "Inspect the method inside each result, not in a separate black box.",
    cta: "View product",
  },
};

export function generateMetadata() {
  const locale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  return {
    title: locale === "en" ? "Methodology" : "Metodología",
    description: COPY[locale].lead,
    alternates: { canonical: "/methodology" },
  };
}

export default function MethodologyPage() {
  const locale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  const copy = COPY[locale];

  return (
    <main className={styles.page} data-no-translate>
      <PublicSiteHeader initialLanguage={locale} />
      <div className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
          </div>
          <p className={styles.lead}>{copy.lead}</p>
        </section>
        <section className={styles.rows} aria-label={locale === "en" ? "Method principles" : "Principios del método"}>
          {copy.rows.map(([index, title, body]) => (
            <article className={styles.row} key={title}>
              <span className={styles.rowIndex}>{index}</span>
              <h2>{title}</h2>
              <p>{body}</p>
            </article>
          ))}
        </section>
        <section className={styles.closing}>
          <h2>{copy.closing}</h2>
          <Link className={styles.cta} href={`/product?lang=${locale}`}>{copy.cta}</Link>
        </section>
      </div>
    </main>
  );
}
