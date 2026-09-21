"use client";
import Link from "next/link";
import { TickerSearch } from "./ticker-search";
import styles from "./research.module.css";

export function ResearchEntry({ language = "es" }) {
  const en = language === "en";
  return (
    <section
      className={styles.entry}
      data-no-translate
      aria-labelledby="research-entry-title"
    >
      <div className={styles.entryInner}>
        <div className={styles.entryHeading}>
          <p className={styles.kicker}>
            {en ? "COMPANY RESEARCH" : "INVESTIGACIÓN DE EMPRESAS"}
          </p>
          <h1 id="research-entry-title">
            BLS Prime
            <span>
              {en ? "Understand the business." : "Entiende el negocio."}
              <br />
              {en ? "Examine the evidence." : "Contrasta la evidencia."}
            </span>
          </h1>
          <p className={styles.lead}>
            {en
              ? "Start with a ticker. Read the filings, examine cash generation, and identify what your thesis still needs."
              : "Empieza con un ticker. Lee los documentos, examina la caja y detecta qué falta para sostener tu tesis."}
          </p>
          <TickerSearch language={language} home />
          <div className={styles.entryLinks}>
            <Link href={`/example?lang=${language}`}>
              {en
                ? "See the historical Microsoft example"
                : "Ver el ejemplo histórico de Microsoft"}{" "}

            </Link>
            <span>
              {en
                ? "Public evidence · no account required"
                : "Evidencia pública · sin cuenta"}
            </span>
          </div>
        </div>
        <div
          className={styles.preview}
          aria-label={en ? "Dossier contents" : "Contenido del expediente"}
        >
          <div className={styles.previewHead}>
            <span>TRAMA / 01</span>
            <span>{en ? "DOCUMENTARY DOSSIER" : "EXPEDIENTE DOCUMENTAL"}</span>
          </div>
          <div className={styles.previewTitle}>
            <span>MSFT</span>
            <h2>Microsoft</h2>
            <p>10-K · {en ? "Fiscal year" : "Ejercicio"} 2026</p>
          </div>
          <ol>
            {(en
              ? [
                  "Business & competitive position",
                  "Cash & capital allocation",
                  "Risks & thesis tests",
                ]
              : [
                  "Negocio y posición competitiva",
                  "Caja y asignación de capital",
                  "Riesgos y pruebas de la tesis",
                ]
            ).map((x, i) => (
              <li key={x}>
                <span>0{i + 1}</span>
                {x}

              </li>
            ))}
          </ol>
          <p className={styles.previewNote}>
            {en
              ? "Sources and excerpts available. Automated interpretation pending activation."
              : "Fuentes y extractos disponibles. Interpretación automática pendiente de activación."}
          </p>
          <Link href={`/research?ticker=MSFT&lang=${language}`}>
            {en ? "Open documentary dossier" : "Abrir expediente documental"}
          </Link>
        </div>
      </div>
      <nav
        className={styles.toolRail}
        aria-label={en ? "Research tools" : "Herramientas de investigación"}
      >
        {[
          [en ? "Discover" : "Descubrir", "G820", "/g820"],
          [en ? "Value" : "Valorar", "AURORA", "/aurora"],
          [
            en ? "Test price assumptions" : "Contrastar el precio",
            "Breakpoint",
            "/#breakpoint",
          ],
          [
            en ? "Portfolio risk" : "Riesgo de cartera",
            en ? "Stress test" : "Prueba de estrés",
            "/stress",
          ],
        ].map(([label, name, href]) => (
          <Link
            key={name}
            href={
              href.includes("#")
                ? `/?lang=${language}#breakpoint`
                : `${href}?lang=${language}`
            }
          >
            <span>{label}</span>
            <strong>{name}</strong>

          </Link>
        ))}
      </nav>
    </section>
  );
}
