"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import styles from "@/app/factorlab/factorlab.module.css";
import { useLanguagePreference } from "@/components/language-layer";

const COPY = {
  en: {
    navAria: "FactorLab navigation",
    nav: { builder: "Builder", catalog: "Catalog", diagnostics: "Diagnostics" },
    workspace: "Workspace",
    language: "Language",
    hero: {
      kicker: "FactorLab",
      title: "Point-in-time screening with refusals built in.",
      body:
        "Build factor screens, check the logic before a run, and get a clear refusal when a step would leak future data.",
    },
    status: {
      aria: "FactorLab status",
      registry: "Registry",
      operators: "63 operators",
      sourceMode: "Source mode",
      sourceValue: "Parquet / CSV",
      currentRun: "Current run",
      accepted: "Accepted",
      refused: "Refused",
    },
    catalog: {
      title: "Operator catalog",
      count: "9 families",
      ariaSuffix: "operator family",
    },
    builder: {
      label: "Screen builder",
      asof: "As of",
      topK: "Top K",
    },
    inspector: {
      label: "Selected node",
      pit: "PIT join",
      deterministic: "deterministic",
      handle: "Handle",
      input: "Input",
      params: "Params",
      dagAria: "DAG view",
    },
    spec: {
      label: "Spec JSON",
      value: "round-trip ready",
    },
    run: {
      label: "Run state",
      validTitle: "Ranked candidates",
      refusedTitle: "Structured refusal",
      modeAria: "Run mode",
      valid: "Valid",
      refused: "Refused",
      entity: "Entity",
      score: "Score",
      mom: "Mom Z",
      quality: "Quality Z",
      resvol: "Resvol",
      refusal: "Refused",
      refusalMessage: "lead() introduces look-ahead bias unless explicitly acknowledged for labeling.",
    },
    footer: "Candidate rankings and diagnostics. Not financial advice.",
  },
  es: {
    navAria: "Navegación de FactorLab",
    nav: { builder: "Constructor", catalog: "Catálogo", diagnostics: "Diagnóstico" },
    workspace: "Espacio",
    language: "Idioma",
    hero: {
      kicker: "FactorLab",
      title: "Filtros de factores con fecha real y rechazos claros.",
      body:
        "Arma filtros de inversión, revisa la lógica antes de correrlos y recibe un rechazo claro si un paso mira datos del futuro.",
    },
    status: {
      aria: "Estado de FactorLab",
      registry: "Catálogo",
      operators: "63 operadores",
      sourceMode: "Datos",
      sourceValue: "Parquet / CSV",
      currentRun: "Corrida actual",
      accepted: "Aceptada",
      refused: "Rechazada",
    },
    catalog: {
      title: "Catálogo de operadores",
      count: "9 familias",
      ariaSuffix: "familia de operadores",
    },
    builder: {
      label: "Constructor de filtro",
      asof: "Fecha de corte",
      topK: "Top K",
    },
    inspector: {
      label: "Nodo seleccionado",
      pit: "Join con fecha real",
      deterministic: "determinístico",
      handle: "Nombre",
      input: "Entrada",
      params: "Parámetros",
      dagAria: "Vista DAG",
    },
    spec: {
      label: "Spec JSON",
      value: "listo para guardar y recargar",
    },
    run: {
      label: "Estado de corrida",
      validTitle: "Candidatos rankeados",
      refusedTitle: "Rechazo estructurado",
      modeAria: "Modo de corrida",
      valid: "Válida",
      refused: "Rechazada",
      entity: "Activo",
      score: "Puntaje",
      mom: "Mom Z",
      quality: "Calidad Z",
      resvol: "Volatilidad",
      refusal: "Rechazado",
      refusalMessage: "lead() mira datos futuros, salvo que se use explícitamente para crear etiquetas.",
    },
    footer: "Ranking de candidatos y diagnóstico. No es asesoría financiera.",
  },
};

const families = [
  {
    name: "sources",
    count: 3,
    operators: ["as_of", "materialize", "restrict_window"],
  },
  {
    name: "timeseries",
    count: 7,
    operators: ["lag", "lead", "diff", "pct_change", "log_return", "yoy", "qoq"],
  },
  {
    name: "rolling",
    count: 8,
    operators: ["rolling_mean", "rolling_std", "rolling_sum", "ewma"],
  },
  {
    name: "relational",
    count: 9,
    operators: ["asof_join", "attach_exposures", "left_join", "union"],
  },
  {
    name: "crosssection",
    count: 7,
    operators: ["neutralize", "cs_zscore", "winsorize", "cs_rank"],
  },
  {
    name: "select",
    count: 11,
    operators: ["compare", "filter", "composite_score", "top_k"],
  },
];

const pipeline = [
  {
    id: "ret1",
    op: "log_return",
    source: "prices",
    params: "col=close, periods=1, out=ret1",
    status: "safe",
  },
  {
    id: "resvol",
    op: "rolling_std",
    source: "ret1",
    params: "window=63, min_periods=40, out=resvol",
    status: "safe",
  },
  {
    id: "mom_neutral",
    op: "neutralize",
    source: "mom11m + exposures",
    params: "factors=[size,resvol], out=mom_neutral",
    status: "safe",
  },
  {
    id: "quality_z",
    op: "asof_join",
    source: "fundamentals",
    params: "columns=[eps_ttm,book_value], tolerance_days=200",
    status: "pit",
  },
  {
    id: "top10",
    op: "top_k",
    source: "score",
    params: "col=score, k=10, by_date=true",
    status: "safe",
  },
];

const results = [
  { entity: "E036", score: "1.2930", mom: "2.1026", quality: "-0.5961", resvol: "0.0270" },
  { entity: "E001", score: "0.4616", mom: "0.8939", quality: "-0.5469", resvol: "0.0260" },
  { entity: "E017", score: "-0.0298", mom: "0.1395", quality: "-0.4246", resvol: "0.0196" },
  { entity: "E029", score: "-0.0559", mom: "0.1708", quality: "-0.5851", resvol: "0.0237" },
  { entity: "E007", score: "-0.0737", mom: "0.0675", quality: "-0.4033", resvol: "0.0341" },
];

const validSpec = {
  name: "momentum_quality",
  version: "0.1",
  asof: "2023-12-29",
  sources: {
    prices: { adapter: "synthetic", kind: "wide" },
    fundamentals: { adapter: "synthetic", kind: "wide" },
  },
  pipeline: [
    { as: "ret1", op: "log_return", on: "prices", params: { col: "close", periods: 1, out: "ret1" } },
    { as: "resvol", op: "rolling_std", params: { col: "ret1", window: 63, min_periods: 40, out: "resvol" } },
    { as: "withq", op: "asof_join", inputs: ["fundamentals"], params: { columns: ["eps_ttm", "book_value"], tolerance_days: 200 } },
    { as: "final", op: "top_k", params: { col: "score", k: 10, by_date: true } },
  ],
  output: "final",
};

const refusalPayload = {
  refused: true,
  error_type: "LookaheadError",
  op: "lead",
  message: "lead() introduces look-ahead bias unless explicitly acknowledged for labeling.",
  node_index: 7,
};

export function FactorLabWorkstation() {
  const { language, setLanguage } = useLanguagePreference();
  const copy = COPY[language] || COPY.en;
  const [activeStep, setActiveStep] = useState(pipeline[0].id);
  const [mode, setMode] = useState("valid");
  const [asof, setAsof] = useState("2023-12-29");
  const [k, setK] = useState(10);

  const activeNode = useMemo(
    () => pipeline.find((step) => step.id === activeStep) || pipeline[0],
    [activeStep],
  );

  const renderedSpec = useMemo(
    () => ({
      ...validSpec,
      asof,
      pipeline: validSpec.pipeline.map((step) =>
        step.op === "top_k" ? { ...step, params: { ...step.params, k } } : step,
      ),
    }),
    [asof, k],
  );

  return (
    <section className={styles.shell}>
      <div className={styles.backdrop} aria-hidden="true" />

      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          BLS Prime
        </Link>
        <nav className={styles.nav} aria-label={copy.navAria}>
          <a href="#builder">{copy.nav.builder}</a>
          <a href="#catalog">{copy.nav.catalog}</a>
          <a href="#diagnostics">{copy.nav.diagnostics}</a>
        </nav>
        <div className={styles.headerActions}>
          <div className={styles.languageToggle} aria-label={copy.language} role="group">
            <span>{copy.language}</span>
            <button data-active={language === "en"} onClick={() => setLanguage("en")} type="button">EN</button>
            <button data-active={language === "es"} onClick={() => setLanguage("es")} type="button">ES</button>
          </div>
          <Link className={styles.workspaceLink} href="/app">
            {copy.workspace}
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>{copy.hero.kicker}</p>
          <h1>{copy.hero.title}</h1>
          <p>
            {copy.hero.body}
          </p>
        </div>

        <div className={styles.statusPlane} aria-label={copy.status.aria}>
          <div>
            <span>{copy.status.registry}</span>
            <strong>{copy.status.operators}</strong>
          </div>
          <div>
            <span>{copy.status.sourceMode}</span>
            <strong>{copy.status.sourceValue}</strong>
          </div>
          <div>
            <span>{copy.status.currentRun}</span>
            <strong>{mode === "valid" ? copy.status.accepted : copy.status.refused}</strong>
          </div>
        </div>
      </section>

      <section className={styles.workbench} id="builder">
        <aside className={styles.rail} id="catalog">
          <div className={styles.railHeader}>
            <span>{copy.catalog.title}</span>
            <strong>{copy.catalog.count}</strong>
          </div>
          <div className={styles.familyList}>
            {families.map((family) => (
              <button
                className={styles.familyButton}
                key={family.name}
                type="button"
                aria-label={`${family.name} ${copy.catalog.ariaSuffix}`}
              >
                <span>{family.name}</span>
                <strong>{family.count}</strong>
                <small>{family.operators.join(" / ")}</small>
              </button>
            ))}
          </div>
        </aside>

        <div className={styles.mainGrid}>
          <section className={styles.builderPanel}>
            <div className={styles.panelTopline}>
              <div>
                <span>{copy.builder.label}</span>
                <strong>momentum_quality</strong>
              </div>
              <div className={styles.controlRow}>
                <label>
                  <span>{copy.builder.asof}</span>
                  <input value={asof} onChange={(event) => setAsof(event.target.value)} />
                </label>
                <label>
                  <span>{copy.builder.topK}</span>
                  <input
                    min="1"
                    max="50"
                    type="number"
                    value={k}
                    onChange={(event) => setK(Number(event.target.value) || 1)}
                  />
                </label>
              </div>
            </div>

            <div className={styles.pipeline}>
              {pipeline.map((step, index) => (
                <button
                  className={styles.pipelineStep}
                  data-active={activeStep === step.id}
                  key={step.id}
                  onClick={() => setActiveStep(step.id)}
                  type="button"
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{step.op}</strong>
                  <small>{step.params}</small>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.inspectorPanel}>
            <div className={styles.panelTopline}>
              <div>
                <span>{copy.inspector.label}</span>
                <strong>{activeNode.op}</strong>
              </div>
              <mark>{activeNode.status === "pit" ? copy.inspector.pit : copy.inspector.deterministic}</mark>
            </div>

            <div className={styles.nodeDetail}>
              <dl>
                <div>
                  <dt>{copy.inspector.handle}</dt>
                  <dd>{activeNode.id}</dd>
                </div>
                <div>
                  <dt>{copy.inspector.input}</dt>
                  <dd>{activeNode.source}</dd>
                </div>
                <div>
                  <dt>{copy.inspector.params}</dt>
                  <dd>{activeNode.params}</dd>
                </div>
              </dl>
            </div>

            <div className={styles.dagView} aria-label={copy.inspector.dagAria}>
              {pipeline.map((step) => (
                <div className={styles.dagNode} data-active={activeStep === step.id} key={step.id}>
                  <span>{step.id}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.specPanel}>
            <div className={styles.panelTopline}>
              <div>
                <span>{copy.spec.label}</span>
                <strong>{copy.spec.value}</strong>
              </div>
            </div>
            <pre>{JSON.stringify(renderedSpec, null, 2)}</pre>
          </section>

          <section className={styles.runPanel} id="diagnostics">
            <div className={styles.panelTopline}>
              <div>
                <span>{copy.run.label}</span>
                <strong>{mode === "valid" ? copy.run.validTitle : copy.run.refusedTitle}</strong>
              </div>
              <div className={styles.segmented} role="tablist" aria-label={copy.run.modeAria}>
                <button data-active={mode === "valid"} onClick={() => setMode("valid")} type="button">
                  {copy.run.valid}
                </button>
                <button data-active={mode === "refused"} onClick={() => setMode("refused")} type="button">
                  {copy.run.refused}
                </button>
              </div>
            </div>

            {mode === "valid" ? (
              <table className={styles.resultsTable}>
                <thead>
                  <tr>
                    <th>{copy.run.entity}</th>
                    <th>{copy.run.score}</th>
                    <th>{copy.run.mom}</th>
                    <th>{copy.run.quality}</th>
                    <th>{copy.run.resvol}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={row.entity}>
                      <td>{row.entity}</td>
                      <td>{row.score}</td>
                      <td>{row.mom}</td>
                      <td>{row.quality}</td>
                      <td>{row.resvol}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.refusal}>
                <span>{copy.run.refusal}</span>
                <strong>
                  {refusalPayload.error_type} in {refusalPayload.op}() at step {refusalPayload.node_index}
                </strong>
                <p>{copy.run.refusalMessage}</p>
                <pre>{JSON.stringify(refusalPayload, null, 2)}</pre>
              </div>
            )}
          </section>
        </div>
      </section>
      <footer className="factorlab-page-footer">
        <Link href="/">BLS Prime</Link>
        <span>{copy.footer}</span>
      </footer>
    </section>
  );
}
