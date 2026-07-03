"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import styles from "@/app/factorlab/factorlab.module.css";
import { useLanguagePreference } from "@/components/language-layer";
import { factorLabSampleUniverse, runFactorLab } from "@/lib/factorlab-engine";

const COPY = {
  en: {
    navAria: "FactorLab navigation",
    nav: { builder: "Search", results: "Files", audit: "Audit" },
    aurora: "AURORA",
    language: "Language",
    hero: {
      kicker: "FactorLab",
      title: "Find neglected asymmetric research files before they become obvious.",
      body:
        "A research triage engine for small and microcaps: hard gates first, opportunity type second, evidence score last.",
      cta: "Run discovery",
      secondary: "Open AURORA",
    },
    status: {
      universe: "Universe",
      eligible: "Researchable",
      returned: "Returned",
      held: "Held back",
      topScore: "Top score",
      accepted: "Accepted",
      refused: "Refused",
      high: "High priority",
      open: "Open files",
    },
    builder: {
      title: "Search controls",
      body:
        "This does not decide what to buy. It decides whether the information channel is strong enough to justify human research.",
      asof: "As of",
      universe: "Universe",
      topK: "Files returned",
      minAdv: "Min daily value traded",
      maxMarketCap: "Max market cap",
      maxResidualVol: "Max residual volatility",
      includeDiagnostics: "Show held-back diagnostics",
      futureSignal: "Use future return",
      futureHelp: "Invalid by design. It proves the screen refuses look-ahead leakage.",
    },
    universeOptions: {
      tradable: "Tradable small/microcaps",
      us: "US-listed only",
      micro: "Microcap focus",
      inflection: "Improvement stories",
      diagnostics: "Held-back diagnostics",
    },
    weights: {
      quality: "Quality",
      growth: "Growth",
      survival: "Survival",
      neglect: "Neglect",
      inflection: "Inflection",
      valuation: "Valuation",
    },
    model: [
      ["Hard gates first", "Liquidity, future data, cash runway, and severe red flags are checked before any score exists."],
      ["Type before score", "A quality compounder, an inflection, a discounted asset, and an option-like file are not ranked by one generic recipe."],
      ["Null test pending", "The composite must still beat size, value, and momentum before the weights become trusted."],
    ],
    pipeline: {
      selected: "Selected step",
      handle: "Handle",
      input: "Input",
      params: "Params",
      meaning: "Plain meaning",
    },
    results: {
      label: "Research files",
      validTitle: "Authorized for human work",
      refusedTitle: "Structured refusal",
      rank: "Type rank",
      file: "File",
      score: "Evidence score",
      completeness: "Completeness",
      setup: "Setup",
      why: "Why now",
      kill: "What kills it",
      next: "Research status",
      aurora: "Open in AURORA",
      empty: "No research files returned.",
      questions: "Questions",
    },
    stats: {
      marketCap: "Market cap",
      adv: "ADV",
      fcfYield: "FCF yield",
      dilution: "Dilution TTM",
      analysts: "Analysts",
      news: "News 90d",
      completeness: "Data",
    },
    spec: {
      title: "Runnable spec",
      subtitle: "User-safe JSON",
      copy: "Copy spec",
      copied: "Copied",
    },
    audit: {
      title: "Audit trail",
      body:
        "Every run records the as-of date, adapters, gates, held-back count, and refusal reason. Research software, not financial advice.",
    },
    refusal: {
      lookaheadMessage: "Future return is only valid as a label for training, not as an input for a live screen.",
      lookaheadFix: "Turn off the future-return signal and rerun the screen.",
      coverageMessage: "No research file survived the point-in-time filters.",
      coverageFix: "Relax liquidity, volatility, market cap, universe, or as-of date.",
    },
    footer:
      "Research prioritization only. No financial advice. Every file still needs primary filings, a thesis, a bear/base/bull model, and invalidation criteria.",
  },
  es: {
    navAria: "Navegación de FactorLab",
    nav: { builder: "Búsqueda", results: "Archivos", audit: "Auditoría" },
    aurora: "AURORA",
    language: "Idioma",
    hero: {
      kicker: "FactorLab",
      title: "Encuentra archivos de investigación asimétrica antes de que sean obvios.",
      body:
        "Un motor de autorización para small y microcaps: primero filtros duros, después tipo de oportunidad, al final puntaje de evidencia.",
      cta: "Correr búsqueda",
      secondary: "Abrir AURORA",
    },
    status: {
      universe: "Universo",
      eligible: "Investigables",
      returned: "Devueltos",
      held: "Retenidos",
      topScore: "Mejor puntaje",
      accepted: "Aceptado",
      refused: "Rechazado",
      high: "Prioridad alta",
      open: "Archivos abiertos",
    },
    builder: {
      title: "Controles de búsqueda",
      body:
        "Esto no decide qué comprar. Decide si el canal de información alcanza para justificar investigación humana.",
      asof: "Fecha de corte",
      universe: "Universo",
      topK: "Archivos devueltos",
      minAdv: "Valor transado mínimo diario",
      maxMarketCap: "Market cap máximo",
      maxResidualVol: "Volatilidad residual máx.",
      includeDiagnostics: "Mostrar diagnósticos retenidos",
      futureSignal: "Usar retorno futuro",
      futureHelp: "Inválido a propósito. Prueba que el filtro rechaza look-ahead.",
    },
    universeOptions: {
      tradable: "Small/microcaps transables",
      us: "Solo listadas en EE. UU.",
      micro: "Foco microcap",
      inflection: "Historias de mejora",
      diagnostics: "Diagnósticos retenidos",
    },
    weights: {
      quality: "Calidad",
      growth: "Crecimiento",
      survival: "Supervivencia",
      neglect: "Baja atención",
      inflection: "Inflexión",
      valuation: "Valoración",
    },
    model: [
      ["Filtros primero", "Liquidez, datos futuros, runway de caja y red flags severos se revisan antes de que exista un puntaje."],
      ["Tipo antes que score", "Una calidad reinvertible, una mejora operacional, un activo descontado y una opción frágil no usan la misma receta."],
      ["Null pendiente", "El compuesto todavía debe ganarle a size, value y momentum antes de confiar en los pesos."],
    ],
    pipeline: {
      selected: "Paso seleccionado",
      handle: "Nombre",
      input: "Input",
      params: "Parámetros",
      meaning: "En simple",
    },
    results: {
      label: "Archivos de investigación",
      validTitle: "Autorizados para trabajo humano",
      refusedTitle: "Rechazo estructurado",
      rank: "Rank por tipo",
      file: "Archivo",
      score: "Puntaje de evidencia",
      completeness: "Completitud",
      setup: "Setup",
      why: "Por qué ahora",
      kill: "Qué lo mata",
      next: "Estado de research",
      aurora: "Abrir en AURORA",
      empty: "No hubo archivos devueltos.",
      questions: "Preguntas",
    },
    stats: {
      marketCap: "Market cap",
      adv: "ADV",
      fcfYield: "FCF yield",
      dilution: "Dilución TTM",
      analysts: "Analistas",
      news: "Noticias 90d",
      completeness: "Datos",
    },
    spec: {
      title: "Spec ejecutable",
      subtitle: "JSON seguro para usuario",
      copy: "Copiar spec",
      copied: "Copiado",
    },
    audit: {
      title: "Registro de auditoría",
      body:
        "Cada corrida deja fecha de corte, adaptadores, filtros, archivos retenidos y motivo de rechazo. Software de research, no asesoría financiera.",
    },
    refusal: {
      lookaheadMessage: "El retorno futuro sirve como etiqueta de entrenamiento, no como input de una búsqueda en vivo.",
      lookaheadFix: "Apaga la señal de retorno futuro y vuelve a correr.",
      coverageMessage: "Ningún archivo sobrevivió los filtros point-in-time.",
      coverageFix: "Relaja liquidez, volatilidad, market cap, universo o fecha de corte.",
    },
    footer:
      "Solo priorización de investigación. No es asesoría financiera. Cada archivo requiere filings primarios, tesis, modelo bear/base/bull y criterios de invalidación.",
  },
};

const universeOptions = ["tradable", "us", "micro", "inflection", "diagnostics"];

function fmtPct(value, digits = 0) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "-";
}

function fmtScore(value) {
  return Number.isFinite(value) ? Math.round(value * 100).toString() : "-";
}

function fmtScore100(value) {
  return Number.isFinite(value) ? Math.round(value).toString() : "-";
}

function fmtMoney(value) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value < 1_000_000) return `$${Math.round(value / 1_000)}k`;
  return `$${(value / 1_000_000).toFixed(0)}M`;
}

function pipelineText(step, language) {
  if (language === "es") {
    if (step.id === "asof") return "Elimina datos que no eran observables en la fecha de corte.";
    if (step.id === "gates") return "Retiene trampas de liquidez, caja crítica y red flags antes del scoring.";
    if (step.id === "type") return "Clasifica el tipo de oportunidad antes de aplicar pesos.";
    if (step.id === "score") return "Usa breakpoints fijos y neglect real; no percentiles del batch.";
    if (step.id === "null") return "Exporta el compuesto para probarlo contra size, value y momentum.";
    if (step.id === "memo") return "Devuelve preguntas de investigación, no una lista de compra.";
    if (step.id === "future") return "Esto filtraría datos futuros dentro de la búsqueda.";
  }
  return step.plain;
}

function refusalMessage(refusal, copy) {
  if (!refusal) return "";
  if (refusal.errorType === "LookaheadError") return copy.refusal.lookaheadMessage;
  if (refusal.errorType === "CoverageError") return copy.refusal.coverageMessage;
  return refusal.message;
}

function refusalFix(refusal, copy) {
  if (!refusal) return "";
  if (refusal.errorType === "LookaheadError") return copy.refusal.lookaheadFix;
  if (refusal.errorType === "CoverageError") return copy.refusal.coverageFix;
  return refusal.fix;
}

function auditText(item, language) {
  if (language === "en") return item;
  return item
    .replace("Screen date", "Fecha de corte")
    .replace("files cleared hard gates and evidence threshold.", "archivos pasaron filtros duros y umbral de evidencia.")
    .replace("files were held back before research triage.", "archivos fueron retenidos antes del triage de investigación.")
    .replace("Scores use fixed breakpoints, quarterly TTM features, and real neglect variables.", "Los puntajes usan breakpoints fijos, datos trimestrales TTM y variables reales de baja atención.")
    .replace("Composite weights remain provisional until the factor-null export beats size, value, and momentum.", "Los pesos del compuesto siguen provisionales hasta ganarle al null de size, value y momentum.")
    .replace("research files returned.", "archivos de investigación devueltos.")
    .replace("Spec parsed.", "Spec leído.");
}

function strongestBlocks(row, language, copy) {
  return Object.entries(row.blockScores)
    .map(([key, value]) => ({
      key,
      label: value.label?.[language] || copy.weights[key] || key,
      score: value.score,
      completeness: value.completeness,
    }))
    .sort((a, b) => b.score * b.completeness - a.score * a.completeness)
    .slice(0, 3)
    .map((item) => `${item.label} ${fmtScore100(item.score)} (${fmtPct(item.completeness)})`);
}

function displaySpec(run) {
  return {
    ...run.spec,
    typeWeights: "type-specific scorecards are mapped in the engine and not rendered as internal labels",
    factorNull: {
      ...run.spec.factorNull,
      status: run.summary.factorNullRequired ? "required before trusting composite weights" : "not required",
    },
  };
}

export function FactorLabWorkstation() {
  const { language, setLanguage } = useLanguagePreference();
  const copy = COPY[language] || COPY.en;
  const [activeStepId, setActiveStepId] = useState("score");
  const [asof, setAsof] = useState("2026-06-24");
  const [topK, setTopK] = useState(6);
  const [universe, setUniverse] = useState("tradable");
  const [minAdvUsd, setMinAdvUsd] = useState(250_000);
  const [maxMarketCapUsd, setMaxMarketCapUsd] = useState(2_000_000_000);
  const [maxResidualVol, setMaxResidualVol] = useState(0.7);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false);
  const [includeFutureReturn, setIncludeFutureReturn] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = useMemo(
    () =>
      runFactorLab({
        asof,
        topK,
        universe,
        minAdvUsd,
        maxMarketCapUsd,
        maxResidualVol,
        includeDiagnostics,
        includeFutureReturn,
      }),
    [asof, topK, universe, minAdvUsd, maxMarketCapUsd, maxResidualVol, includeDiagnostics, includeFutureReturn],
  );

  const activeStep = run.pipeline.find((step) => step.id === activeStepId) || run.pipeline[0];
  const specText = useMemo(() => JSON.stringify(displaySpec(run), null, 2), [run]);
  const topFile = run.candidates[0] || null;

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
          <a href="#results">{copy.nav.results}</a>
          <a href="#audit">{copy.nav.audit}</a>
        </nav>
        <div className={styles.headerActions}>
          <div className={styles.languageToggle} aria-label={copy.language} role="group">
            <span>{copy.language}</span>
            <button data-active={language === "en"} onClick={() => setLanguage("en")} type="button">EN</button>
            <button data-active={language === "es"} onClick={() => setLanguage("es")} type="button">ES</button>
          </div>
          <Link className={styles.workspaceLink} href="/aurora">
            {copy.aurora}
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>{copy.hero.kicker}</p>
          <h1>{copy.hero.title}</h1>
          <p>{copy.hero.body}</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#results">{copy.hero.cta}</a>
            <Link className={styles.secondaryButton} href="/aurora">{copy.hero.secondary}</Link>
          </div>
        </div>

        <div className={styles.thesisPlane} aria-label="FactorLab model">
          {copy.model.map(([title, body]) => (
            <article key={title}>
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.statusStrip} aria-label="FactorLab status">
        <div>
          <span>{copy.status.universe}</span>
          <strong>{copy.universeOptions[universe]}</strong>
        </div>
        <div>
          <span>{copy.status.eligible}</span>
          <strong>{run.accepted ? `${run.summary.eligible} / ${factorLabSampleUniverse.length}` : copy.status.refused}</strong>
        </div>
        <div>
          <span>{copy.status.high}</span>
          <strong>{run.summary.rankable}</strong>
        </div>
        <div>
          <span>{copy.status.topScore}</span>
          <strong>{fmtScore(run.summary.topScore)}</strong>
        </div>
      </section>

      <section className={styles.workbench}>
        <aside className={styles.rail} id="builder">
          <div className={styles.railHeader}>
            <span>{copy.builder.title}</span>
            <p>{copy.builder.body}</p>
          </div>

          <div className={styles.controlStack}>
            <label>
              <span>{copy.builder.asof}</span>
              <input value={asof} onChange={(event) => setAsof(event.target.value)} type="date" />
            </label>

            <label>
              <span>{copy.builder.universe}</span>
              <select value={universe} onChange={(event) => setUniverse(event.target.value)}>
                {universeOptions.map((option) => (
                  <option key={option} value={option}>{copy.universeOptions[option]}</option>
                ))}
              </select>
            </label>

            <label>
              <span>{copy.builder.topK}</span>
              <input min="1" max="12" type="number" value={topK} onChange={(event) => setTopK(Number(event.target.value) || 1)} />
            </label>

            <label>
              <span>{copy.builder.minAdv}</span>
              <input
                max="5000000"
                min="50000"
                step="50000"
                type="range"
                value={minAdvUsd}
                onChange={(event) => setMinAdvUsd(Number(event.target.value))}
              />
              <em>{fmtMoney(minAdvUsd)}</em>
            </label>

            <label>
              <span>{copy.builder.maxMarketCap}</span>
              <input
                max="5000000000"
                min="50000000"
                step="50000000"
                type="range"
                value={maxMarketCapUsd}
                onChange={(event) => setMaxMarketCapUsd(Number(event.target.value))}
              />
              <em>{fmtMoney(maxMarketCapUsd)}</em>
            </label>

            <label>
              <span>{copy.builder.maxResidualVol}</span>
              <input
                max="1"
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
                <input checked={includeDiagnostics} onChange={(event) => setIncludeDiagnostics(event.target.checked)} type="checkbox" />
                <span>{copy.builder.includeDiagnostics}</span>
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
                <span>{copy.builder.title}</span>
                <strong>neglected_opportunity_triage</strong>
              </div>
              <mark data-state={run.accepted ? "accepted" : "refused"}>
                {run.accepted ? copy.status.accepted : copy.status.refused}
              </mark>
            </div>

            <div className={styles.weightGrid}>
              {copy.model.map(([title, body]) => (
                <article className={styles.weightControl} key={title}>
                  <span>{title}</span>
                  <strong>{body}</strong>
                </article>
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
                  <small>{pipelineText(step, language)}</small>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.inspectorPanel}>
            <div className={styles.panelTopline}>
              <div>
                <span>{copy.pipeline.selected}</span>
                <strong>{activeStep.op}</strong>
              </div>
              <mark data-state={activeStep.status}>{activeStep.status}</mark>
            </div>

            <dl className={styles.nodeDetail}>
              <div>
                <dt>{copy.pipeline.handle}</dt>
                <dd>{activeStep.id}</dd>
              </div>
              <div>
                <dt>{copy.pipeline.input}</dt>
                <dd>{activeStep.input}</dd>
              </div>
              <div>
                <dt>{copy.pipeline.params}</dt>
                <dd>{activeStep.params}</dd>
              </div>
              <div>
                <dt>{copy.pipeline.meaning}</dt>
                <dd>{pipelineText(activeStep, language)}</dd>
              </div>
            </dl>

            {topFile ? (
              <div className={styles.topCandidate}>
                <span>{copy.results.next}</span>
                <strong>{topFile.ticker}: {topFile.tierLabel[language]}</strong>
                <p>{topFile.whyNow}</p>
              </div>
            ) : null}
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
              <div className={styles.candidateList}>
                {run.candidates.length ? run.candidates.map((row) => (
                  <article className={styles.candidateRow} data-gate={row.tier} key={row.ticker}>
                    <div className={styles.rankCell}>
                      <span>{copy.results.rank}</span>
                      <strong>{row.rankWithinType || "-"}</strong>
                    </div>
                    <div className={styles.candidateMain}>
                      <div className={styles.candidateHead}>
                        <div>
                          <strong>{row.ticker}</strong>
                          <span>{row.name} · {row.opportunityTypeLabel[language]}</span>
                        </div>
                        <mark data-tier={row.tier}>{row.tierLabel[language]}</mark>
                      </div>
                      <p className={styles.thesisText}>{row.thesis}</p>
                      <div className={styles.reasonGrid}>
                        <div>
                          <span>{copy.results.why}</span>
                          <p>{row.whyNow}</p>
                        </div>
                        <div>
                          <span>{copy.results.kill}</span>
                          <p>{row.killCriteria}</p>
                        </div>
                      </div>
                      <div className={styles.factorChips}>
                        {strongestBlocks(row, language, copy).map((item) => <span key={item}>{item}</span>)}
                      </div>
                    </div>
                    <div className={styles.metricCell}>
                      <span>{copy.results.score}</span>
                      <strong>{fmtScore100(row.opportunityScore)}</strong>
                      <i style={{ "--score-width": `${Math.max(8, Math.min(100, row.opportunityScore))}%` }} />
                      <dl>
                        <div><dt>{copy.stats.completeness}</dt><dd>{fmtPct(row.dataCompleteness)}</dd></div>
                        <div><dt>{copy.stats.marketCap}</dt><dd>{fmtMoney(row.marketCapUsd)}</dd></div>
                        <div><dt>{copy.stats.adv}</dt><dd>{fmtMoney(row.advUsd)}</dd></div>
                        <div><dt>{copy.stats.fcfYield}</dt><dd>{fmtPct(row.fcfYield, 1)}</dd></div>
                        <div><dt>{copy.stats.dilution}</dt><dd>{fmtPct(row.dilutionTtm, 1)}</dd></div>
                        <div><dt>{copy.stats.analysts}</dt><dd>{Number.isFinite(row.analystCount) ? row.analystCount : "-"}</dd></div>
                      </dl>
                      <Link className={styles.smallButton} href={`/aurora?ticker=${encodeURIComponent(row.ticker)}`}>
                        {copy.results.aurora}
                      </Link>
                    </div>
                  </article>
                )) : <p className={styles.emptyState}>{copy.results.empty}</p>}
              </div>
            ) : (
              <div className={styles.refusal}>
                <span>{run.refusal?.errorType}</span>
                <strong>{run.refusal?.op}: {refusalMessage(run.refusal, copy)}</strong>
                <p>{refusalFix(run.refusal, copy)}</p>
                <pre>{JSON.stringify(run.refusal, null, 2)}</pre>
              </div>
            )}
          </section>

          <section className={styles.specPanel} id="audit">
            <div className={styles.panelTopline}>
              <div>
                <span>{copy.spec.title}</span>
                <strong>{copy.spec.subtitle}</strong>
              </div>
              <button className={styles.smallButton} onClick={copySpec} type="button">
                {copied ? copy.spec.copied : copy.spec.copy}
              </button>
            </div>
            <pre>{specText}</pre>
          </section>

          <section className={styles.auditPanel}>
            <div className={styles.panelTopline}>
              <div>
                <span>{copy.audit.title}</span>
                <strong>{copy.audit.body}</strong>
              </div>
            </div>
            <ol className={styles.auditList}>
              {run.audit.map((item) => <li key={item}>{auditText(item, language)}</li>)}
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
