import Link from "next/link";
import { headers } from "next/headers";

import styles from "@/app/public-section.module.css";
import { PublicSiteHeader } from "@/components/public-shell/public-site-header";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

const COPY = {
  es: {
    eyebrow: "BLS Prime · Producto",
    title: "Una decisión, no una colección de herramientas.",
    lead: "Descubrimiento, expectativas, valoración y riesgo de cartera convergen en un mismo proceso de investigación.",
    rows: [
      ["01", "FactorLab", "Prioriza empresas que merecen una revisión y deja visible por qué aparecen ahora y qué puede invalidar la idea.", "/factorlab?lang=es", "Descubrir"],
      ["02", "AURORA", "Contrasta precio, valor y evidencia. Publica un rango defendible o explica la brecha concreta que impide hacerlo.", "/aurora?lang=es", "Investigar"],
      ["03", "Stress Engine", "Muestra concentración, escenarios adversos y las posiciones que más contribuyen a una pérdida potencial.", "/stress?lang=es", "Medir riesgo"],
    ],
    closing: "Empieza con una primera lectura pública y fechada.",
    cta: "Explorar demo",
  },
  en: {
    eyebrow: "BLS Prime · Product",
    title: "One decision, not a collection of tools.",
    lead: "Discovery, expectations, valuation, and portfolio risk converge in a single research process.",
    rows: [
      ["01", "FactorLab", "Prioritize companies worth reviewing and keep visible why they surfaced now and what could invalidate the idea.", "/factorlab?lang=en", "Discover"],
      ["02", "AURORA", "Contrast price, value, and evidence. Publish a defensible range or explain the exact gap that prevents one.", "/aurora?lang=es", "Research in Spanish"],
      ["03", "Stress Engine", "Show concentration, adverse scenarios, and the positions that contribute most to a potential loss.", "/stress?lang=en", "Measure risk"],
    ],
    closing: "Start with a public, dated first reading.",
    cta: "Explore demo",
  },
};

export function generateMetadata() {
  const locale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  return {
    title: locale === "en" ? "Product" : "Producto",
    description: COPY[locale].lead,
    alternates: { canonical: "/product" },
  };
}

export default function ProductPage() {
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
        <section className={styles.rows} aria-label={locale === "en" ? "Product engines" : "Motores del producto"}>
          {copy.rows.map(([index, title, body, href, action]) => (
            <article className={styles.row} key={title}>
              <span className={styles.rowIndex}>{index}</span>
              <h2>{title}</h2>
              <p>{body}</p>
              <Link href={href}>{action}</Link>
            </article>
          ))}
        </section>
        <section className={styles.closing}>
          <h2>{copy.closing}</h2>
          <Link className={styles.cta} href={`/?lang=${locale}#breakpoint`}>{copy.cta}</Link>
        </section>
      </div>
    </main>
  );
}
