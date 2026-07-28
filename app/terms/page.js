import Link from "next/link";
import { headers } from "next/headers";

import styles from "@/app/public-home.module.css";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";
import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  const locale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  return {
    title: locale === "en" ? "Terms of Service" : "Términos de Servicio",
    description: locale === "en"
      ? "Research software, not financial advice. How BLS Prime may be used."
      : "Software de investigación, no asesoría financiera. Cómo debe usarse BLS Prime.",
    alternates: {
      canonical: "/terms",
      languages: { es: "/terms?lang=es", en: "/terms?lang=en" },
    },
  };
}

const COPY = {
  en: {
    home: "Home",
    tag: "Terms of Service",
    title: "Research software, not financial advice.",
    intro: (brand) => `These terms explain how ${brand} should be used. The short version: the product helps you organize information and think more clearly, but you remain responsible for every financial decision.`,
    effective: "Effective date: April 20, 2026",
    sections: [
      ["1. Educational and research use only", (brand) => `${brand} provides portfolio organization, market context, risk analytics, equity research outputs, and AI-assisted explanations for informational and educational purposes. It is not a registered investment adviser, broker, dealer, tax adviser, or law firm.`],
      ["2. No personalized financial advice", "Nothing in the product is financial, investment, tax, accounting, or legal advice. Outputs should not be treated as a recommendation to buy, sell, hold, hedge, rebalance, or otherwise transact in any security or asset. You should make decisions independently or with a qualified professional who understands your full circumstances."],
      ["3. No trading or execution", "The workspace does not place trades, route orders, manage money, or execute transactions. Any staged action, memo, valuation, model, alert, or checklist is a research artifact only."],
      ["4. Data and model limitations", "Market data, financial statements, third-party APIs, user-entered holdings, AI outputs, and derived calculations may be delayed, incomplete, stale, wrong, or unavailable. Deterministic calculations can still be wrong if the source data or assumptions are wrong. You should verify important information against primary sources before acting."],
      ["5. AI-assisted analysis", "AI may summarize, critique, or explain sourced data and deterministic model outputs. AI can make mistakes, omit context, or overstate confidence. Treat AI text as a draft research aid, not an authority."],
      ["6. Your responsibility", "You are responsible for the accuracy of holdings you enter, the assumptions you accept, the professionals you consult, and any decision you make outside the product. Past performance, model output, valuation estimates, and risk scores do not guarantee future results."],
      ["7. Acceptable use", "Do not use the workspace to automate trading, manipulate markets, violate laws, reverse engineer protected services, overload third-party data providers, or make decisions for another person without proper permission."],
    ],
  },
  es: {
    home: "Inicio",
    tag: "Términos de Servicio",
    title: "Software de investigación, no asesoría financiera.",
    intro: (brand) => `Estos términos explican cómo debe usarse ${brand}. En breve: el producto ayuda a organizar información y razonar con mayor claridad, pero tú sigues siendo responsable de cada decisión financiera.`,
    effective: "Vigente desde el 20 de abril de 2026",
    sections: [
      ["1. Uso educativo y de investigación", (brand) => `${brand} ofrece organización de cartera, contexto de mercado, analítica de riesgo, research de renta variable y explicaciones asistidas por IA con fines informativos y educativos. No es un asesor de inversiones registrado, corredor, intermediario, asesor tributario ni estudio jurídico.`],
      ["2. Sin asesoría financiera personalizada", "Nada en el producto constituye asesoría financiera, de inversión, tributaria, contable o legal. Los resultados no deben tratarse como una recomendación para comprar, vender, mantener, cubrir, rebalancear o transar un valor o activo. Debes decidir de forma independiente o con un profesional calificado que comprenda toda tu situación."],
      ["3. Sin negociación ni ejecución", "El espacio de trabajo no realiza operaciones, enruta órdenes, administra dinero ni ejecuta transacciones. Toda acción preparada, memo, valoración, modelo, alerta o checklist es únicamente un artefacto de investigación."],
      ["4. Limitaciones de datos y modelos", "Los datos de mercado, estados financieros, APIs de terceros, posiciones ingresadas por el usuario, resultados de IA y cálculos derivados pueden estar retrasados, incompletos, desactualizados, equivocados o no disponibles. Incluso un cálculo determinista puede fallar si la fuente o los supuestos son incorrectos. Verifica la información importante contra fuentes primarias antes de actuar."],
      ["5. Análisis asistido por IA", "La IA puede resumir, cuestionar o explicar datos con fuente y resultados de modelos deterministas. Puede equivocarse, omitir contexto o exagerar su confianza. Trata el texto de IA como un borrador de apoyo al research, no como una autoridad."],
      ["6. Tu responsabilidad", "Eres responsable de la precisión de las posiciones que ingresas, los supuestos que aceptas, los profesionales que consultas y cualquier decisión que tomes fuera del producto. El desempeño pasado, los modelos, las estimaciones de valoración y los puntajes de riesgo no garantizan resultados futuros."],
      ["7. Uso aceptable", "No uses el espacio de trabajo para automatizar operaciones, manipular mercados, infringir leyes, hacer ingeniería inversa de servicios protegidos, sobrecargar proveedores de datos ni decidir por otra persona sin la autorización adecuada."],
    ],
  },
};

function resolveText(value, brand) {
  return typeof value === "function" ? value(brand) : value;
}

export default function TermsPage() {
  const config = getServerConfig();
  const locale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  const copy = COPY[locale];

  return (
    <main className={`${styles.page} ${styles.legalPage}`}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href={`/?lang=${locale}`}>
          <span className={styles.brandName}>{config.appName}</span>
        </Link>
        <div className={styles.navActions}>
          <Link className={styles.btnGhost} href={`/privacy?lang=${locale}`}>
            {locale === "en" ? "Privacy" : "Privacidad"}
          </Link>
          <Link className={styles.btnGhost} href={`/?lang=${locale}`}>{copy.home}</Link>
        </div>
      </nav>

      <section className={styles.legalHero}>
        <p className={styles.tag}>{copy.tag}</p>
        <h1>{copy.title}</h1>
        <p>{copy.intro(config.appName)}</p>
        <span>{copy.effective}</span>
      </section>

      <section className={styles.legalBody}>
        {copy.sections.map(([title, body]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{resolveText(body, config.appName)}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
