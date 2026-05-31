"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import styles from "@/app/factorlab/factorlab.module.css";

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
        <nav className={styles.nav} aria-label="FactorLab navigation">
          <a href="#builder">Builder</a>
          <a href="#catalog">Catalog</a>
          <a href="#diagnostics">Diagnostics</a>
        </nav>
        <Link className={styles.workspaceLink} href="/app">
          Workspace
        </Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>FactorLab</p>
          <h1>Point-in-time screening with refusals built in.</h1>
          <p>
            Compose deterministic factor screens, inspect the DAG before execution, and surface unsafe work as
            structured diagnostics instead of silent output.
          </p>
        </div>

        <div className={styles.statusPlane} aria-label="FactorLab status">
          <div>
            <span>Registry</span>
            <strong>63 operators</strong>
          </div>
          <div>
            <span>Source mode</span>
            <strong>BYO parquet / CSV</strong>
          </div>
          <div>
            <span>Current run</span>
            <strong>{mode === "valid" ? "Accepted" : "Refused"}</strong>
          </div>
        </div>
      </section>

      <section className={styles.workbench} id="builder">
        <aside className={styles.rail} id="catalog">
          <div className={styles.railHeader}>
            <span>Operator catalog</span>
            <strong>9 families</strong>
          </div>
          <div className={styles.familyList}>
            {families.map((family) => (
              <button
                className={styles.familyButton}
                key={family.name}
                type="button"
                aria-label={`${family.name} operator family`}
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
                <span>Screen builder</span>
                <strong>momentum_quality</strong>
              </div>
              <div className={styles.controlRow}>
                <label>
                  <span>As of</span>
                  <input value={asof} onChange={(event) => setAsof(event.target.value)} />
                </label>
                <label>
                  <span>Top K</span>
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
                <span>Selected node</span>
                <strong>{activeNode.op}</strong>
              </div>
              <mark>{activeNode.status === "pit" ? "PIT join" : "deterministic"}</mark>
            </div>

            <div className={styles.nodeDetail}>
              <dl>
                <div>
                  <dt>Handle</dt>
                  <dd>{activeNode.id}</dd>
                </div>
                <div>
                  <dt>Input</dt>
                  <dd>{activeNode.source}</dd>
                </div>
                <div>
                  <dt>Params</dt>
                  <dd>{activeNode.params}</dd>
                </div>
              </dl>
            </div>

            <div className={styles.dagView} aria-label="DAG view">
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
                <span>Spec JSON</span>
                <strong>round-trip ready</strong>
              </div>
            </div>
            <pre>{JSON.stringify(renderedSpec, null, 2)}</pre>
          </section>

          <section className={styles.runPanel} id="diagnostics">
            <div className={styles.panelTopline}>
              <div>
                <span>Run state</span>
                <strong>{mode === "valid" ? "Ranked candidates" : "Structured refusal"}</strong>
              </div>
              <div className={styles.segmented} role="tablist" aria-label="Run mode">
                <button data-active={mode === "valid"} onClick={() => setMode("valid")} type="button">
                  Valid
                </button>
                <button data-active={mode === "refused"} onClick={() => setMode("refused")} type="button">
                  Refused
                </button>
              </div>
            </div>

            {mode === "valid" ? (
              <table className={styles.resultsTable}>
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Score</th>
                    <th>Mom Z</th>
                    <th>Quality Z</th>
                    <th>Resvol</th>
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
                <span>Refused</span>
                <strong>
                  {refusalPayload.error_type} in {refusalPayload.op}() at step {refusalPayload.node_index}
                </strong>
                <p>{refusalPayload.message}</p>
                <pre>{JSON.stringify(refusalPayload, null, 2)}</pre>
              </div>
            )}
          </section>
        </div>
      </section>
    </section>
  );
}
