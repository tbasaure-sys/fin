"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import styles from "@/app/factorlab/factorlab.module.css";
import { useLanguagePreference } from "@/components/language-layer";
import { factorLabDefaultWeights, factorLabSampleUniverse, runFactorLab } from "@/lib/factorlab-engine";

const COPY = {
  en: {
    navAria: "FactorLab navigation",
    nav: { builder: "Builder", audit: "Audit", results: "Results" },
    workspace: "Valuation OS",
    language: "Language",
    hero: {
      kicker: "FactorLab",
      title: "Prioritize candidates before valuation.",
      body:
        "FactorLab is not a valuation model. It ranks research candidates using market factors plus qualitative thesis strength, demand/supply changes, and bottleneck power.",
    },
    status: {
      universe: "Universe",
      eligible: "Eligible",
      returned: "Returned",
      guard: "PIT guard",
      blocked: "Blocked",
      accepted: "Accepted",
      refused: "Refused",
    },
    builder: {
      label: "Screen builder",
      plain:
        "Pick a universe, set the screen date, and choose how much each signal matters. The result updates from the same spec shown below.",
      asof: "As of",
      topK: "Top K",
      universe: "Universe",
      minLiquidity: "Min liquidity",
      maxResidualVol: "Max residual vol",
      neutralize: "Sector neutralize",
      futureSignal: "Use future return",
      futureHelp: "Intentionally invalid. Turns on a look-ahead signal so the refusal path is visible.",
    },
    weights: {
      momentum: "Momentum",
      quality: "Financial quality",
      value: "Value",
      lowVol: "Low vol",
      thesis: "Thesis quality",
      demandSupply: "Demand/supply",
      bottleneck: "Bottleneck",
    },
    signalGuide: [
      ["Market tape", "Momentum, value, and volatility show how the market is currently pricing the name."],
      ["Business quality", "Financial quality is the accounting base; thesis quality captures qualitative durability and optionality."],
      ["Industry setup", "Demand/supply and bottleneck power capture capacity constraints, scarcity, and pricing pressure."],
    ],
    universeOptions: {
      global: "Global liquid sample",
      us: "US only",
      "ex-us": "Ex-US",
      quality: "Quality bias",
      cyclical: "Cyclicals",
    },
    inspector: {
      label: "Selected step",
      deterministic: "deterministic",
      pit: "point-in-time",
      refused: "refused",
      handle: "Handle",
      input: "Input",
      params: "Params",
      plain: "Plain meaning",
      dagAria: "Pipeline view",
    },
    spec: {
      label: "Runnable spec",
      value: "copied as JSON",
      copy: "Copy spec",
      copied: "Copied",
    },
    results: {
      label: "Run state",
      validTitle: "Ranked candidates",
      refusedTitle: "Structured refusal",
      rank: "Rank",
      ticker: "Ticker",
      score: "Score",
      sector: "Sector",
      evidence: "Why it ranked",
      empty: "No candidates returned.",
    },
    audit: {
      title: "Audit trail",
      body:
        "This is the part that matters: every run records the date filter, data coverage, ranking rule, and refusal reason.",
    },
    stepPlain: {
      asof: "Drops any row whose price or filing date is after the screen date.",
      liquidity: "Removes names that are too illiquid or too volatile for this run.",
      future: "This would leak future data into the live screen.",
      score: "Combines market factors, qualitative thesis, demand/supply setup, and bottleneck power.",
      neutralize: "Penalizes crowded sector bets so the list is not just one theme.",
      raw: "Keeps the raw factor score without sector adjustment.",
      topk: "Ranks candidates and returns the top names.",
    },
    refusalText: {
      lookaheadMessage: "Future return is only valid as a label for training, not as an input for a live screen.",
      lookaheadFix: "Turn off the future-return signal and rerun the screen.",
      coverageMessage: "No candidate survived the point-in-time filters.",
      coverageFix: "Relax liquidity, volatility, universe, or as-of date.",
    },
    footer: "Candidate rankings and diagnostics. Research-only, not financial advice.",
  },
  es: {
    navAria: "Navegación de FactorLab",
    nav: { builder: "Constructor", audit: "Auditoría", results: "Resultados" },
    workspace: "Valuation OS",
    language: "Idioma",
    hero: {
      kicker: "FactorLab",
      title: "Arma un filtro de factores y ve por qué pasa.",
      body:
        "FactorLab convierte una idea de factores en una lista point-in-time de candidatos, y rechaza la corrida si el spec usa datos futuros.",
    },
    status: {
      universe: "Universo",
      eligible: "Elegibles",
      returned: "Devueltos",
      guard: "Control PIT",
      blocked: "Bloqueado",
      accepted: "Aceptada",
      refused: "Rechazada",
    },
    builder: {
      label: "Constructor de filtro",
      plain:
        "Elige universo, fecha de corte y pesos. El resultado se recalcula desde el mismo spec JSON que queda visible abajo.",
      asof: "Fecha de corte",
      topK: "Top K",
      universe: "Universo",
      minLiquidity: "Liquidez mínima",
      maxResidualVol: "Volatilidad máx.",
      neutralize: "Neutralizar sector",
      futureSignal: "Usar retorno futuro",
      futureHelp: "Intencionalmente inválido. Activa una señal con look-ahead para mostrar el rechazo.",
    },
    weights: {
      momentum: "Momentum",
      quality: "Calidad",
      value: "Valor",
      lowVol: "Baja vol.",
      thesis: "Tesis cualitativa",
      demandSupply: "Oferta/demanda",
      bottleneck: "Cuello de botella",
    },
    signalGuide: [
      ["Mercado", "Momentum, valor y volatilidad muestran como el mercado esta tratando al nombre."],
      ["Calidad del negocio", "La calidad financiera es la base contable; la tesis cualitativa captura durabilidad y opcionalidad."],
      ["Setup industrial", "Oferta/demanda y cuello de botella capturan restricciones de capacidad, escasez y poder de precio."],
    ],
    universeOptions: {
      global: "Muestra líquida global",
      us: "Solo US",
      "ex-us": "Ex-US",
      quality: "Sesgo calidad",
      cyclical: "Cíclicos",
    },
    inspector: {
      label: "Paso seleccionado",
      deterministic: "determinístico",
      pit: "point-in-time",
      refused: "rechazado",
      handle: "Nombre",
      input: "Entrada",
      params: "Parámetros",
      plain: "En simple",
      dagAria: "Vista del pipeline",
    },
    spec: {
      label: "Spec ejecutable",
      value: "copiable como JSON",
      copy: "Copiar spec",
      copied: "Copiado",
    },
    results: {
      label: "Estado de corrida",
      validTitle: "Candidatos rankeados",
      refusedTitle: "Rechazo estructurado",
      rank: "Rank",
      ticker: "Ticker",
      score: "Puntaje",
      sector: "Sector",
      evidence: "Por qué rankea",
      empty: "No hubo candidatos.",
    },
    audit: {
      title: "Registro de auditoría",
      body:
        "Esta es la parte importante: cada corrida deja visible la fecha, cobertura de datos, regla de ranking y motivo de rechazo.",
    },
    stepPlain: {
      asof: "Elimina cualquier fila cuyo precio o filing sea posterior a la fecha de corte.",
      liquidity: "Remueve nombres demasiado ilíquidos o volátiles para esta corrida.",
      future: "Esto filtraría datos futuros dentro del filtro en vivo.",
      score: "Combina señales normalizadas de factores en un puntaje único.",
      neutralize: "Resta el promedio sectorial para que la lista no sea solo un tema.",
      raw: "Rankea el puntaje bruto sin ajuste sectorial.",
      topk: "Ordena candidatos y devuelve los mejores nombres.",
    },
    refusalText: {
      lookaheadMessage: "El retorno futuro solo sirve como etiqueta de entrenamiento, no como input de un filtro en vivo.",
      lookaheadFix: "Apaga la señal de retorno futuro y vuelve a correr el filtro.",
      coverageMessage: "Ningún candidato sobrevivió los filtros point-in-time.",
      coverageFix: "Relaja liquidez, volatilidad, universo o fecha de corte.",
    },
    footer: "Ranking de candidatos y diagnóstico. Investigación solamente; no es asesoría financiera.",
  },
};

const universeOptions = ["global", "us", "ex-us", "quality", "cyclical"];

function fmtPct(value, digits = 0) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "N/A";
}

function fmtScore(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "N/A";
}

function statusForStep(step, copy) {
  if (step.status === "refused") return copy.inspector.refused;
  if (step.status === "pit") return copy.inspector.pit;
  return copy.inspector.deterministic;
}

function stepPlain(step, copy) {
  if (step.id === "asof") return copy.stepPlain.asof;
  if (step.id === "liquidity") return copy.stepPlain.liquidity;
  if (step.id === "future") return copy.stepPlain.future;
  if (step.id === "score") {
    return copy.weights.thesis === "Thesis quality"
      ? "Combines market factors, qualitative thesis, demand/supply setup, and bottleneck power."
      : "Combina factores de mercado, tesis cualitativa, oferta/demanda y cuellos de botella.";
  }
  if (step.id === "neutralize") return step.op === "sector_neutralize" ? copy.stepPlain.neutralize : copy.stepPlain.raw;
  if (step.id === "topk") return copy.stepPlain.topk;
  return step.plain;
}

function refusalMessage(refusal, copy) {
  if (!refusal) return "";
  if (refusal.errorType === "LookaheadError") return copy.refusalText.lookaheadMessage;
  if (refusal.errorType === "CoverageError") return copy.refusalText.coverageMessage;
  return refusal.message;
}

function refusalFix(refusal, copy) {
  if (!refusal) return "";
  if (refusal.errorType === "LookaheadError") return copy.refusalText.lookaheadFix;
  if (refusal.errorType === "CoverageError") return copy.refusalText.coverageFix;
  return refusal.fix;
}

function auditText(item, copy, language) {
  if (language === "en") return item;
  if (/^Spec parsed\./i.test(item)) return "Spec leído.";
  if (/Screen date/i.test(item)) return item.replace("Screen date", "Fecha de corte");
  if (/point-in-time filters/i.test(item)) {
    return item
      .replace("of", "de")
      .replace("names passed point-in-time filters.", "nombres pasaron los filtros point-in-time.");
  }
  if (/Sector means were removed before ranking/i.test(item)) return "Se restó el promedio sectorial antes del ranking.";
  if (/Raw composite scores were ranked/i.test(item)) return "Se rankeó el puntaje compuesto bruto.";
  if (/candidates returned/i.test(item)) return item.replace("candidates returned.", "candidatos devueltos.");
  if (/Refused at lead\(next_return\)/i.test(item)) return `Rechazado en lead(next_return): ${copy.refusalText.lookaheadMessage}`;
  if (/Turn off the future-return/i.test(item)) return copy.refusalText.lookaheadFix;
  if (/Refused at filter/i.test(item)) return `Rechazado en filter: ${copy.refusalText.coverageMessage}`;
  return item;
}

function factorEvidence(row, copy) {
  const entries = [
    [copy.weights.momentum, row.momentumZ],
    [copy.weights.quality, row.qualityZ],
    [copy.weights.value, row.valueZ],
    [copy.weights.lowVol, row.lowVolZ],
    [copy.weights.thesis, row.thesisZ],
    [copy.weights.demandSupply, row.demandSupplyZ],
    [copy.weights.bottleneck, row.bottleneckZ],
  ]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3);
  const note = [row.qualitativeNote, row.demandSupplyNote, row.bottleneckNote].filter(Boolean)[0];
  return {
    factors: entries.map(([label, value]) => `${label} ${fmtScore(value)}z`),
    note,
  };
}

export function FactorLabWorkstation() {
  const { language, setLanguage } = useLanguagePreference();
  const copy = COPY[language] || COPY.en;
  const heroTitle = language === "es" ? "Prioriza candidatos antes de valorar." : copy.hero.title;
  const heroBody =
    language === "es"
      ? "FactorLab no es un modelo de valoracion. Ordena candidatos de investigacion usando factores de mercado, tesis cualitativa, cambios de oferta/demanda y poder de cuello de botella."
      : copy.hero.body;
  const [activeStepId, setActiveStepId] = useState("score");
  const [asof, setAsof] = useState("2026-06-24");
  const [topK, setTopK] = useState(5);
  const [universe, setUniverse] = useState("global");
  const [minLiquidity, setMinLiquidity] = useState(0.65);
  const [maxResidualVol, setMaxResidualVol] = useState(0.5);
  const [neutralizeSector, setNeutralizeSector] = useState(true);
  const [includeFutureReturn, setIncludeFutureReturn] = useState(false);
  const [weights, setWeights] = useState(factorLabDefaultWeights);
  const [copied, setCopied] = useState(false);

  const run = useMemo(
    () =>
      runFactorLab({
        asof,
        topK,
        universe,
        minLiquidity,
        maxResidualVol,
        neutralizeSector,
        includeFutureReturn,
        weights,
      }),
    [asof, topK, universe, minLiquidity, maxResidualVol, neutralizeSector, includeFutureReturn, weights],
  );

  const activeStep = run.pipeline.find((step) => step.id === activeStepId) || run.pipeline[0];
  const specText = useMemo(() => JSON.stringify(run.spec, null, 2), [run.spec]);
  const topScore = run.summary.topScore;

  function updateWeight(key, value) {
    setWeights((current) => ({ ...current, [key]: Number(value) / 100 }));
  }

  async function copySpec() {
    try {
      await navigator.clipboard.writeText(specText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={styles.shell}>
      <div className={styles.backdrop} aria-hidden="true" />

      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          BLS Prime
        </Link>
        <nav className={styles.nav} aria-label={copy.navAria}>
          <a href="#builder">{copy.nav.builder}</a>
          <a href="#audit">{copy.nav.audit}</a>
          <a href="#results">{copy.nav.results}</a>
        </nav>
        <div className={styles.headerActions}>
          <div className={styles.languageToggle} aria-label={copy.language} role="group">
            <span>{copy.language}</span>
            <button data-active={language === "en"} onClick={() => setLanguage("en")} type="button">
              EN
            </button>
            <button data-active={language === "es"} onClick={() => setLanguage("es")} type="button">
              ES
            </button>
          </div>
          <Link className={styles.workspaceLink} href="/valuation-os-lab">
            {copy.workspace}
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>{copy.hero.kicker}</p>
          <h1>{heroTitle}</h1>
          <p>{heroBody}</p>
        </div>

        <div className={styles.statusPlane} aria-label="FactorLab status">
          <div>
            <span>{copy.status.universe}</span>
            <strong>{copy.universeOptions[universe]}</strong>
          </div>
          <div>
            <span>{copy.status.eligible}</span>
            <strong>{run.accepted ? `${run.summary.eligible} / ${factorLabSampleUniverse.length}` : copy.status.blocked}</strong>
          </div>
          <div>
            <span>{copy.status.guard}</span>
            <strong>{run.accepted ? copy.status.accepted : copy.status.refused}</strong>
          </div>
        </div>
      </section>

      <section className={styles.workbench}>
        <aside className={styles.rail}>
          <div className={styles.railHeader}>
            <div>
              <span>{copy.builder.label}</span>
              <strong>{copy.builder.plain}</strong>
            </div>
          </div>

          <div className={styles.controlStack} id="builder">
            <label>
              <span>{copy.builder.asof}</span>
              <input value={asof} onChange={(event) => setAsof(event.target.value)} type="date" />
            </label>

            <label>
              <span>{copy.builder.universe}</span>
              <select value={universe} onChange={(event) => setUniverse(event.target.value)}>
                {universeOptions.map((option) => (
                  <option key={option} value={option}>
                    {copy.universeOptions[option]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>{copy.builder.topK}</span>
              <input min="1" max="12" type="number" value={topK} onChange={(event) => setTopK(Number(event.target.value) || 1)} />
            </label>

            <label>
              <span>{copy.builder.minLiquidity}</span>
              <input
                max="1"
                min="0"
                step="0.01"
                type="range"
                value={minLiquidity}
                onChange={(event) => setMinLiquidity(Number(event.target.value))}
              />
              <em>{fmtPct(minLiquidity)}</em>
            </label>

            <label>
              <span>{copy.builder.maxResidualVol}</span>
              <input
                max="0.8"
                min="0.1"
                step="0.01"
                type="range"
                value={maxResidualVol}
                onChange={(event) => setMaxResidualVol(Number(event.target.value))}
              />
              <em>{fmtPct(maxResidualVol)}</em>
            </label>

            <div className={styles.toggleGrid}>
              <label>
                <input checked={neutralizeSector} onChange={(event) => setNeutralizeSector(event.target.checked)} type="checkbox" />
                <span>{copy.builder.neutralize}</span>
              </label>
              <label data-danger={includeFutureReturn}>
                <input checked={includeFutureReturn} onChange={(event) => setIncludeFutureReturn(event.target.checked)} type="checkbox" />
                <span>{copy.builder.futureSignal}</span>
              </label>
              <p>{copy.builder.futureHelp}</p>
            </div>
          </div>
        </aside>

        <div className={styles.mainGrid}>
          <section className={styles.builderPanel}>
            <div className={styles.panelTopline}>
              <div>
                <span>{copy.builder.label}</span>
                <strong>factor_plus_thesis_screen</strong>
              </div>
              <mark data-state={run.accepted ? "accepted" : "refused"}>
                {run.accepted ? copy.status.accepted : copy.status.refused}
              </mark>
            </div>

            <div className={styles.signalGuide}>
              {copy.signalGuide.map(([title, body]) => (
                <div key={title}>
                  <span>{title}</span>
                  <p>{body}</p>
                </div>
              ))}
            </div>

            <div className={styles.weightGrid}>
              {Object.entries(copy.weights).map(([key, label]) => (
                <label className={styles.weightControl} key={key}>
                  <span>{label}</span>
                  <input
                    max="100"
                    min="0"
                    type="range"
                    value={Math.round((weights[key] ?? 0) * 100)}
                    onChange={(event) => updateWeight(key, event.target.value)}
                  />
                  <strong>{fmtPct(run.spec.weights[key])}</strong>
                </label>
              ))}
            </div>

            <div className={styles.pipeline}>
              {run.pipeline.map((step, index) => (
                <button
                  className={styles.pipelineStep}
                  data-active={activeStep.id === step.id}
                  data-status={step.status}
                  key={step.id}
                  onClick={() => setActiveStepId(step.id)}
                  type="button"
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{step.op}</strong>
                  <small>{stepPlain(step, copy)}</small>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.inspectorPanel}>
            <div className={styles.panelTopline}>
              <div>
                <span>{copy.inspector.label}</span>
                <strong>{activeStep.op}</strong>
              </div>
              <mark data-state={activeStep.status}>{statusForStep(activeStep, copy)}</mark>
            </div>

            <div className={styles.nodeDetail}>
              <dl>
                <div>
                  <dt>{copy.inspector.handle}</dt>
                  <dd>{activeStep.id}</dd>
                </div>
                <div>
                  <dt>{copy.inspector.input}</dt>
                  <dd>{activeStep.input}</dd>
                </div>
                <div>
                  <dt>{copy.inspector.params}</dt>
                  <dd>{activeStep.params}</dd>
                </div>
                <div>
                  <dt>{copy.inspector.plain}</dt>
                  <dd>{stepPlain(activeStep, copy)}</dd>
                </div>
              </dl>
            </div>

            <div className={styles.dagView} aria-label={copy.inspector.dagAria}>
              {run.pipeline.map((step) => (
                <button
                  className={styles.dagNode}
                  data-active={activeStep.id === step.id}
                  data-status={step.status}
                  key={step.id}
                  onClick={() => setActiveStepId(step.id)}
                  type="button"
                >
                  <span>{step.id}</span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.specPanel} id="audit">
            <div className={styles.panelTopline}>
              <div>
                <span>{copy.spec.label}</span>
                <strong>{copy.spec.value}</strong>
              </div>
              <button className={styles.smallButton} onClick={copySpec} type="button">
                {copied ? copy.spec.copied : copy.spec.copy}
              </button>
            </div>
            <pre>{specText}</pre>
          </section>

          <section className={styles.runPanel} id="results">
            <div className={styles.panelTopline}>
              <div>
                <span>{copy.results.label}</span>
                <strong>{run.accepted ? copy.results.validTitle : copy.results.refusedTitle}</strong>
              </div>
              <mark data-state={run.accepted ? "accepted" : "refused"}>
                {run.accepted ? `${copy.status.returned}: ${run.summary.returned}` : run.refusal?.errorType}
              </mark>
            </div>

            {run.accepted ? (
              <div className={styles.resultsWrap}>
                <div className={styles.summaryBar}>
                  <div>
                    <span>{copy.status.eligible}</span>
                    <strong>{run.summary.eligible}</strong>
                  </div>
                  <div>
                    <span>{copy.status.returned}</span>
                    <strong>{run.summary.returned}</strong>
                  </div>
                  <div>
                    <span>{copy.results.score}</span>
                    <strong>{fmtScore(topScore)}</strong>
                  </div>
                </div>

                {run.candidates.length ? (
                  <table className={styles.resultsTable}>
                    <thead>
                      <tr>
                        <th>{copy.results.rank}</th>
                        <th>{copy.results.ticker}</th>
                        <th>{copy.results.score}</th>
                        <th>{copy.results.sector}</th>
                        <th>{copy.results.evidence}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.candidates.map((row) => (
                        <tr key={row.ticker}>
                          <td>{row.rank}</td>
                          <td>
                            <strong>{row.ticker}</strong>
                            <span>{row.name}</span>
                          </td>
                          <td>
                            <b>{fmtScore(row.score)}</b>
                            <i style={{ "--score-width": `${Math.max(8, Math.min(100, 50 + row.score * 24))}%` }} />
                          </td>
                          <td>{row.sector}</td>
                          <td>
                            {(() => {
                              const evidence = factorEvidence(row, copy);
                              return (
                                <div className={styles.evidenceStack}>
                                  {evidence.factors.map((item) => (
                                    <span key={item}>{item}</span>
                                  ))}
                                  {evidence.note ? <p>{evidence.note}</p> : null}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className={styles.emptyState}>{copy.results.empty}</p>
                )}
              </div>
            ) : (
              <div className={styles.refusal}>
                <span>{run.refusal?.errorType}</span>
                <strong>
                  {run.refusal?.op}: {refusalMessage(run.refusal, copy)}
                </strong>
                <p>{refusalFix(run.refusal, copy)}</p>
                <pre>{JSON.stringify(run.refusal, null, 2)}</pre>
              </div>
            )}
          </section>

          <section className={styles.auditPanel}>
            <div className={styles.panelTopline}>
              <div>
                <span>{copy.audit.title}</span>
                <strong>{copy.audit.body}</strong>
              </div>
            </div>
            <ol className={styles.auditList}>
              {run.audit.map((item) => (
                <li key={item}>{auditText(item, copy, language)}</li>
              ))}
            </ol>
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
