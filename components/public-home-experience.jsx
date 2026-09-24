"use client";
import Link from "next/link";
import { useLanguagePreference } from "@/components/language-layer";
import { PublicSiteHeader } from "@/components/public-shell/public-site-header";
import styles from "@/app/landing-page.module.css";
import { exampleCashBridge, publicExample as example } from "@/lib/research/public-example.mjs";

const STEPS = {
  es: [
    { title: "Leer antes de escribir", body: "Abre los documentos de la empresa por ticker. Cada cifra conserva su fecha y su fuente.", cta: "Investigar una empresa", href: "/research" },
    { title: "Contrastar la tesis", body: "Hipótesis, contraargumento y la comprobación que podría cambiar la lectura, en un solo expediente.", cta: "Ver el método", href: "/methodology" },
    { title: "Conectar con tu cartera", body: "Mide qué le hace una posición a tu concentración y a tu pérdida en escenarios adversos.", cta: "Medir riesgo de cartera", href: "/stress" },
  ],
  en: [
    { title: "Read before you write", body: "Open a company's filings by ticker. Every figure keeps its date and its source.", cta: "Research a company", href: "/research" },
    { title: "Challenge the thesis", body: "Hypothesis, counterargument and the check that could change the reading, in a single file.", cta: "See the method", href: "/methodology" },
    { title: "Connect it to your portfolio", body: "Measure what a position does to your concentration and to your loss in adverse scenarios.", cta: "Measure portfolio risk", href: "/stress" },
  ],
};

export function PublicHomeExperience({ initialLanguage = "es" }) {
  const { language } = useLanguagePreference(initialLanguage);
  const en = language === "en";
  const research = `/research?lang=${language}`;
  const bridge = exampleCashBridge();
  const fmt = (value) => new Intl.NumberFormat(en ? "en-US" : "es-CL", { maximumFractionDigits: 0 }).format(value);
  return (
    <div className={styles.page} data-no-translate>
      <div className={styles.scene} aria-hidden="true" />
      <a className={styles.skip} href="#main">{en ? "Skip to content" : "Ir al contenido"}</a>
      <PublicSiteHeader initialLanguage={initialLanguage} variant="overlay" />
      <main className={styles.main} id="main">
        <div className={styles.intro}>
          <p className={styles.signature}>BLS Prime</p>
          <h1>{en ? <>Value is not always<br />in plain sight.</> : <>El valor no siempre<br />está a la vista.</>}</h1>
          <p className={styles.description}>{en ? "Understand the cash, challenge your thesis, and connect it to your portfolio." : "Entiende la caja, cuestiona tu tesis y conéctala con tu cartera."}</p>
          <Link className={styles.enter} href={`/example?lang=${language}`}>
            {en ? "See a real example" : "Ver un ejemplo real"}
          </Link>
          <p className={styles.note}>{en ? "Microsoft · sources and calculations · no account" : "Microsoft · fuentes y cálculos · sin cuenta"}</p>
        </div>
      </main>
      <section className={styles.steps} aria-labelledby="steps-title">
        <div className={styles.sectionHead}>
          <p className={styles.kicker}>{en ? "How it works" : "Cómo funciona"}</p>
          <h2 id="steps-title">{en ? "From a document to a decision, with every step visible." : "Del documento a la decisión, con cada paso a la vista."}</h2>
        </div>
        <ol className={styles.stepList}>
          {STEPS[language].map((step, index) => (
            <li key={step.title}>
              <span className={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <Link href={`${step.href}?lang=${language}`}>{step.cta}</Link>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.proof} aria-labelledby="proof-title">
        <div className={styles.proofCopy}>
          <p className={styles.kicker}>{en ? "One company. A concrete question." : "Una empresa. Una pregunta concreta."}</p>
          <h2 id="proof-title">{en ? "More operating cash does not always mean more cash left over." : "Más caja operativa no siempre significa más caja disponible."}</h2>
          <p>{en ? "Walk through a historical Microsoft case: what changed, what remains unknown, and why position size matters. Then investigate a company of your own." : "Recorre un caso histórico de Microsoft: qué cambió, qué falta saber y por qué importa el tamaño de la posición. Después, investiga una empresa propia."}</p>
          <Link className={styles.enter} href={`/example?lang=${language}`}>{en ? "Read the case" : "Leer el caso"}</Link>
        </div>
        <figure className={styles.proofFigure}>
          <figcaption>{en ? "Microsoft · USD millions · fiscal years" : "Microsoft · millones de USD · ejercicios"}</figcaption>
          <table>
            <thead>
              <tr><th scope="col">{en ? "Measure" : "Concepto"}</th>{example.years.map((year) => <th scope="col" key={year}>{year}</th>)}</tr>
            </thead>
            <tbody>
              <tr><th scope="row">{en ? "Operating cash flow" : "Flujo operativo"}</th>{example.cfo.map((value, i) => <td key={i}>{fmt(value)}</td>)}</tr>
              <tr><th scope="row">{en ? "Capital expenditure" : "Inversión en activos"}</th>{example.capex.map((value, i) => <td key={i}>{fmt(value)}</td>)}</tr>
              <tr className={styles.total}><th scope="row">{en ? "Difference" : "Diferencia"}</th>{bridge.residual.map((value, i) => <td key={i}>{fmt(value)}</td>)}</tr>
            </tbody>
          </table>
          <p>{en ? "Source: Microsoft Annual Report 2025. Historical case, not a current assessment." : "Fuente: Microsoft Annual Report 2025. Caso histórico, no una evaluación actual."}</p>
        </figure>
      </section>

      <section className={styles.closing} aria-labelledby="closing-title">
        <h2 id="closing-title">{en ? "Your research stays private." : "Tu investigación permanece privada."}</h2>
        <p>
          {en ? "An account is required to save theses and connect holdings. " : "Para guardar tesis y conectar posiciones necesitas una cuenta. "}
          <Link href={`/privacy?lang=${language}`}>{en ? "What we store" : "Qué guardamos"}</Link>
        </p>
        <div className={styles.closingActions}>
          <Link className={styles.enter} href={research}>{en ? "Open my research space" : "Abrir mi espacio de investigación"}</Link>
          <Link className={styles.secondary} href={`/app/carteras?lang=${language}`}>{en ? "Go to portfolios" : "Ir a carteras"}</Link>
        </div>
      </section>
    </div>
  );
}
