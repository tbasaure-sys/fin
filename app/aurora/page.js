import Link from "next/link";

import EquityResearchPanel from "@/components/equity-research-panel";
import { PublicSiteHeader } from "@/components/public-shell/public-site-header";
import styles from "./aurora.module.css";

export const metadata = {
  title: "AURORA | Valoración de empresas",
  description:
    "Revisa cuánto puede valer una empresa, qué supuestos sostienen el rango y qué datos impiden llegar a una conclusión confiable.",
  alternates: { canonical: "/aurora" },
};

const PUBLIC_SUGGESTIONS = {
  modules: {
    portfolio: {
      holdings: [{ ticker: "MU" }, { ticker: "MSFT" }, { ticker: "JPM" }, { ticker: "XOM" }, { ticker: "PLD" }],
    },
  },
};

export default function AuroraPage() {
  return (
    <div className={styles.page}>
      <PublicSiteHeader availableLanguages={["es"]} initialLanguage="es" />

      <main className={styles.main}>
        <section className={styles.intro} aria-labelledby="aurora-title">
          <div>
            <p className={styles.eyebrow}>AURORA · VALORACIÓN</p>
            <h1 id="aurora-title">Un rango aproximado para cada empresa, con los porqués a la vista.</h1>
          </div>
          <div className={styles.introCopy}>
            <p>
              Escribe una empresa. AURORA contrasta precio, acciones, estados recientes, estimaciones y el método adecuado para su tipo de negocio.
            </p>
            <p>
              Siempre entrega un intervalo orientativo cuando existe una cotización vigente. La amplitud y la confianza cambian según la evidencia disponible.
            </p>
          </div>
        </section>

        <EquityResearchPanel
          dashboard={PUBLIC_SUGGESTIONS}
          id="aurora-public-valuation"
          initialTicker="MU"
          publicMode
        />

        <aside className={styles.disclaimer} aria-label="Alcance de la valoración">
          <strong>Cómo usar esta lectura</strong>
          <p>
            Es material de investigación, no una recomendación. Revisa la fecha, las fuentes, los supuestos y las limitaciones antes de invertir.
          </p>
          <Link href="/terms">Términos y alcance</Link>
        </aside>
      </main>
    </div>
  );
}
