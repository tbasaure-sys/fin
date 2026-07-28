"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import styles from "@/app/factorlab/factorlab.module.css";
import { useLanguagePreference } from "@/components/language-layer";
import { factorLabSampleUniverse, runFactorLab } from "@/lib/factorlab-engine";

const COPY = {
  en: {
    navAria: "Opportunity search navigation",
    nav: { builder: "Search", results: "Companies", audit: "How it works" },
    aurora: "AURORA",
    language: "Language",
    hero: {
      kicker: "FactorLab",
      title: "Find companies worth reviewing before you spend hours on them.",
      body:
        "Use a few visible filters to find opportunities, understand why they appear, and see what deserves caution.",
      cta: "See companies to review",
      secondary: "Open valuation",
      disclosure: "Illustrative example; connect your workspace for live company data.",
    },
    status: {
      universe: "Companies considered",
      eligible: "Enough data",
      returned: "Shown",
      held: "Set aside",
      topScore: "Top priority",
      accepted: "Ready to review",
      refused: "No result",
      high: "High priority",
      open: "Companies to review",
    },
    builder: {
      title: "Search filters",
      body:
        "This does not decide what to buy. It helps you decide which companies deserve a closer look.",
      asof: "Date",
      universe: "Company group",
      topK: "Companies shown",
      minAdv: "Minimum daily trading value",
      maxMarketCap: "Maximum market value",
      maxResidualVol: "Maximum unusual volatility",
      includeDiagnostics: "Show companies set aside",
      futureSignal: "Include future information",
      futureHelp: "Disabled: a live search must not use information from the future.",
    },
    universeOptions: {
      tradable: "Liquid smaller companies",
      us: "US-listed only",
      micro: "Microcap focus",
      inflection: "Improvement stories",
      diagnostics: "Companies set aside",
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
      ["Basic filters first", "Liquidity, available data, cash needs, and major warning signs are checked before a company is shown."],
      ["Reason before priority", "A profitable compounder, a turnaround, and a discounted asset need different questions."],
      ["Comparison still pending", "The priority is a starting point for review, not proof that one method is better than the others."],
    ],
    pipeline: {
      selected: "Selected step",
      handle: "Internal name",
      input: "Input data",
      params: "Settings",
      meaning: "In plain words",
    },
    results: {
      label: "Companies to review",
      validTitle: "Ready for a closer look",
      refusedTitle: "No company met the filters",
      rank: "Priority within group",
      file: "Company",
      score: "Review priority",
      completeness: "Data available",
      setup: "Current situation",
      why: "Why now",
      kill: "What kills it",
      next: "Review status",
      aurora: "See valuation",
      empty: "No company met the selected filters.",
      questions: "Questions",
    },
    stats: {
      marketCap: "Market value",
      adv: "Daily trading value",
      fcfYield: "Cash return",
      dilution: "Dilution, last 12 months",
      analysts: "Analyst coverage",
      news: "News, last 90 days",
      completeness: "Data",
    },
    spec: {
      title: "Search details",
      subtitle: "Filters used in this search",
      copy: "Copy filters",
      copied: "Copied",
    },
    audit: {
      title: "What this search records",
      body:
        "Each search records its date, filters, companies set aside, and reason for an empty result. Analysis software, not financial advice.",
    },
    refusal: {
      lookaheadMessage: "Future returns cannot be used in a live search.",
      lookaheadFix: "Turn off future returns and run the search again.",
      coverageMessage: "No company had enough data for these filters.",
      coverageFix: "Adjust liquidity, volatility, market value, company group, or date.",
    },
      footer:
        "This only prioritizes what to review. It is not financial advice. Each company still needs public reports, a clear thesis, scenarios, and reasons to change your mind.",
  },
  es: {
    navAria: "Navegación de búsqueda de oportunidades",
    nav: { builder: "Búsqueda", results: "Empresas", audit: "Cómo funciona" },
    aurora: "AURORA",
    language: "Idioma",
    hero: {
      kicker: "FactorLab",
      title: "Encuentra empresas que vale la pena revisar antes de dedicarles horas.",
      body:
        "Usa filtros visibles para encontrar oportunidades, entender por qué aparecen y ver qué requiere cuidado.",
      cta: "Ver empresas para revisar",
      secondary: "Ver valoración",
      disclosure: "Ver ejemplo con datos ilustrativos; conecta tu espacio para trabajar con datos vivos.",
    },
    status: {
      universe: "Empresas consideradas",
      eligible: "Datos suficientes",
      returned: "Mostradas",
      held: "Apartadas",
      topScore: "Mayor prioridad",
      accepted: "Listas para revisar",
      refused: "Sin resultado",
      high: "Prioridad alta",
      open: "Empresas para revisar",
    },
    builder: {
      title: "Filtros de búsqueda",
      body:
        "Esto no decide qué comprar. Ayuda a decidir qué empresas merecen una revisión más cercana.",
      asof: "Fecha de corte",
      universe: "Universo",
      topK: "Empresas mostradas",
      minAdv: "Valor mínimo transado al día",
      maxMarketCap: "Valor máximo de mercado",
      maxResidualVol: "Volatilidad inusual máxima",
      includeDiagnostics: "Mostrar empresas apartadas",
      futureSignal: "Incluir información futura",
      futureHelp: "Desactivado: una búsqueda real no debe usar información del futuro.",
    },
    universeOptions: {
      tradable: "Empresas pequeñas con liquidez",
      us: "Solo listadas en EE. UU.",
      micro: "Foco microcap",
      inflection: "Historias de mejora",
      diagnostics: "Empresas apartadas",
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
      ["Filtros básicos primero", "Liquidez, datos disponibles, necesidades de caja y alertas importantes se revisan antes de mostrar una empresa."],
      ["Razón antes que prioridad", "Una empresa rentable, una mejora operacional y un activo descontado necesitan preguntas distintas."],
      ["Comparación pendiente", "La prioridad es un punto de partida para revisar, no una prueba de que un método sea mejor que otro."],
    ],
    pipeline: {
      selected: "Paso seleccionado",
      handle: "Nombre",
      input: "Dato de entrada",
      params: "Parámetros",
      meaning: "En simple",
    },
    results: {
      label: "Empresas para revisar",
      validTitle: "Listas para una revisión cercana",
      refusedTitle: "Ninguna empresa cumplió los filtros",
      rank: "Prioridad dentro del grupo",
      file: "Empresa",
      score: "Prioridad de revisión",
      completeness: "Datos disponibles",
      setup: "Situación actual",
      why: "Por qué ahora",
      kill: "Qué lo mata",
      next: "Estado de revisión",
      aurora: "Ver valoración",
      empty: "Ninguna empresa cumplió los filtros elegidos.",
      questions: "Preguntas",
    },
    stats: {
      marketCap: "Valor de mercado",
      adv: "Valor transado al día",
      fcfYield: "Rendimiento de caja",
      dilution: "Dilución, últimos 12 meses",
      analysts: "Cobertura de analistas",
      news: "Noticias, últimos 90 días",
      completeness: "Datos",
    },
    spec: {
      title: "Detalles de la búsqueda",
      subtitle: "Filtros usados en esta búsqueda",
      copy: "Copiar filtros",
      copied: "Copiado",
    },
    audit: {
      title: "Qué registra esta búsqueda",
      body:
        "Cada búsqueda guarda su fecha, filtros, empresas apartadas y motivo si no hay resultados. Software de análisis, no asesoría financiera.",
    },
    refusal: {
      lookaheadMessage: "Los retornos futuros no se pueden usar como dato en una búsqueda real.",
      lookaheadFix: "Desactiva los retornos futuros y vuelve a buscar.",
      coverageMessage: "Ninguna empresa tuvo datos suficientes para estos filtros.",
      coverageFix: "Ajusta liquidez, volatilidad, valor de mercado, grupo de empresas o fecha.",
    },
      footer:
      "Solo prioriza qué revisar. No es asesoría financiera. Cada empresa necesita informes públicos, una tesis clara, escenarios y razones para cambiar de opinión.",
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
    if (step.id === "gates") return "Aparta problemas de liquidez, caja crítica y alertas importantes antes de ordenar las empresas.";
    if (step.id === "type") return "Clasifica la situación de cada empresa antes de asignar prioridades.";
    if (step.id === "score") return "Compara cada empresa con umbrales fijos y con el nivel de atención que recibe.";
    if (step.id === "null") return "Permite comparar la prioridad con otros criterios sencillos.";
    if (step.id === "memo") return "Devuelve preguntas para revisar, no una lista de compras.";
    if (step.id === "future") return "Evita que la búsqueda use datos que todavía no existían.";
  }
  const plain = {
    asof: "Removes information that was not available on the selected date.",
    gates: "Sets aside liquidity problems, critical cash needs, and major warnings before ranking companies.",
    type: "Groups each company by situation before assigning review priority.",
    score: "Compares each company with fixed rules and the level of attention it receives.",
    null: "Compares the priority with other simple criteria.",
    memo: "Returns questions to review, not a list of stocks to buy.",
    future: "Stops the search from using information that did not exist yet.",
  };
  return plain[step.id] || step.plain;
}

function pipelineLabel(step, language) {
  const labels = language === "es"
    ? { asof: "Fecha de corte", gates: "Filtros básicos", type: "Tipo de empresa", score: "Prioridad", null: "Comparación", memo: "Preguntas para revisar", future: "Información futura" }
    : { asof: "Cut-off date", gates: "Basic filters", type: "Company type", score: "Review priority", null: "Comparison", memo: "Review questions", future: "Future information" };
  return labels[step.id] || step.op;
}

function pipelineStatusLabel(status, language) {
  const labels = language === "es" ? { pass: "Listo", safe: "Listo", warn: "Revisar", fail: "Apartado", pending: "Pendiente" } : { pass: "Ready", safe: "Ready", warn: "Review", fail: "Set aside", pending: "Pending" };
  return labels[status] || status;
}

function pipelineDetail(step, field, language) {
  const details = language === "es"
    ? {
        asof: { input: "Fecha seleccionada", params: "Solo datos disponibles hasta esa fecha" },
        gates: { input: "Liquidez, caja y alertas", params: "Filtros básicos antes de ordenar" },
        type: { input: "Situación de la empresa", params: "Preguntas distintas para cada grupo" },
        score: { input: "Datos financieros y atención del mercado", params: "Reglas fijas y datos faltantes visibles" },
        null: { input: "Otros criterios sencillos", params: "Comparación pendiente" },
        memo: { input: "Resultados y señales de cuidado", params: "Preguntas para la revisión" },
        future: { input: "Datos posteriores a la fecha", params: "Desactivado en una búsqueda real" },
      }
    : {
        asof: { input: "Selected date", params: "Only information available by that date" },
        gates: { input: "Liquidity, cash, and warnings", params: "Basic filters before ranking" },
        type: { input: "Company situation", params: "Different questions for each group" },
        score: { input: "Financial data and market attention", params: "Fixed rules and missing data stay visible" },
        null: { input: "Other simple criteria", params: "Comparison still pending" },
        memo: { input: "Results and caution points", params: "Questions for the review" },
        future: { input: "Information after the selected date", params: "Disabled in a live search" },
      };
  return details[step.id]?.[field] || (field === "input" ? step.input : step.params);
}

function reviewStatusLabel(row, language) {
  const source = String(row?.tierLabel?.[language] || "").toLowerCase();
  if (source.includes("research") || source.includes("investig")) return language === "es" ? "Revisión pendiente" : "Review needed";
  return language === "es" ? "Lista para revisar" : "Ready to review";
}

function opportunityTypeLabel(row, language) {
  const source = String(row?.opportunityTypeLabel?.[language] || row?.opportunityType || "").toLowerCase();
  if (source.includes("reinvestment") || source.includes("compounder") || source.includes("rentabilidad")) return language === "es" ? "Empresa rentable" : "Profitable business";
  if (source.includes("inflection") || source.includes("operational") || source.includes("mejora")) return language === "es" ? "Mejora operacional" : "Operational improvement";
  if (source.includes("discounted") || source.includes("descontado")) return language === "es" ? "Activo con descuento" : "Discounted asset";
  return row?.opportunityTypeLabel?.[language] || row?.opportunityType || (language === "es" ? "Empresa para revisar" : "Company to review");
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

function refusalLabel(refusal, language) {
  if (refusal?.errorType === "LookaheadError") return language === "es" ? "Datos futuros no permitidos" : "Future data not allowed";
  if (refusal?.errorType === "CoverageError") return language === "es" ? "Datos insuficientes" : "Not enough data";
  return language === "es" ? "Búsqueda sin resultado" : "Search returned no result";
}

function auditText(item, language) {
  if (language === "en") return item;
  return item
    .replace("Screen date", "Fecha de corte")
    .replace("files cleared hard gates and evidence threshold.", "empresas pasaron los filtros y el nivel mínimo de datos.")
    .replace("files were held back before research triage.", "empresas fueron apartadas antes de la revisión.")
    .replace("Scores use fixed breakpoints, quarterly TTM features, and real neglect variables.", "Las prioridades usan umbrales fijos, datos recientes y el nivel de atención que recibe cada empresa.")
    .replace("Composite weights remain provisional until the factor-null export beats size, value, and momentum.", "La prioridad sigue siendo orientativa hasta compararla con otros criterios sencillos.")
    .replace("research files returned.", "empresas mostradas.")
    .replace("Spec parsed.", "Filtros leídos.");
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
    typeWeights: "Cada grupo usa preguntas distintas; aquí se muestran solo las etiquetas útiles para revisar",
    factorNull: {
      ...run.spec.factorNull,
      status: run.summary.factorNullRequired ? "comparación pendiente" : "no necesaria en esta búsqueda",
    },
  };
}

export function FactorLabWorkstation({ initialLanguage = "es" }) {
  const { language, setLanguage } = useLanguagePreference(initialLanguage);
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
          <small>{copy.hero.disclosure}</small>
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
                <strong>{language === "es" ? "Filtros visibles · prioridad de revisión" : "Visible filters · review priority"}</strong>
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
                  <strong>{pipelineLabel(step, language)}</strong>
                  <small>{pipelineText(step, language)}</small>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.inspectorPanel}>
            <div className={styles.panelTopline}>
              <div>
                <span>{copy.pipeline.selected}</span>
                <strong>{pipelineLabel(activeStep, language)}</strong>
              </div>
              <mark data-state={activeStep.status}>{pipelineStatusLabel(activeStep.status, language)}</mark>
            </div>

            <dl className={styles.nodeDetail}>
              <div>
                <dt>{copy.pipeline.handle}</dt>
                <dd>{pipelineLabel(activeStep, language)}</dd>
              </div>
              <div>
                <dt>{copy.pipeline.input}</dt>
                <dd>{pipelineDetail(activeStep, "input", language)}</dd>
              </div>
              <div>
                <dt>{copy.pipeline.params}</dt>
                <dd>{pipelineDetail(activeStep, "params", language)}</dd>
              </div>
              <div>
                <dt>{copy.pipeline.meaning}</dt>
                <dd>{pipelineText(activeStep, language)}</dd>
              </div>
            </dl>

            {topFile ? (
              <div className={styles.topCandidate}>
                <span>{copy.results.next}</span>
                <strong>{topFile.ticker}: {reviewStatusLabel(topFile, language)}</strong>
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
                {run.accepted ? `${copy.status.returned}: ${run.summary.returned}` : refusalLabel(run.refusal, language)}
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
                          <span>{row.name} · {opportunityTypeLabel(row, language)}</span>
                        </div>
                        <mark data-tier={row.tier}>{reviewStatusLabel(row, language)}</mark>
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
                <span>{refusalLabel(run.refusal, language)}</span>
                <strong>{refusalMessage(run.refusal, copy)}</strong>
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
