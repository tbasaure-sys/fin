"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLanguagePreference } from "@/components/language-layer";
import {
  CHANNEL_ARENAS,
  CHANNEL_CADENCES,
  CHANNEL_CHANGES,
  CHANNEL_EVIDENCE,
  discoverResearchCandidates,
} from "@/lib/channels/discovery-v2";
import {
  assessPortfolioFreshness,
  buildPortfolioDisplayRows,
  computePortfolioOverlapShare,
  normalizePortfolioDraft,
  summarizePortfolioWeights,
} from "@/lib/portfolio/intelligence";

import styles from "./portfolio-channel-workbench.module.css";

const CASH_LIKE = new Set(["SGOV", "BIL", "SHV", "SHY", "JPST", "VGSH", "CASH"]);
const MAX_ANALYSIS_HOLDINGS = 60;

const COPY = {
  es: {
    navHome: "Inicio",
    navWorkspace: "Workspace",
    signIn: "Iniciar sesión",
    eyebrow: "PORTFOLIO INTELLIGENCE",
    title: "Primero entiende qué apuestas tienes. Después busca una nueva.",
    intro: "La página parte de tus posiciones confirmadas, calcula concentración oculta y recién entonces construye una cola semanal de nombres que puedas investigar con una ventaja legítima.",
    dataStep: "01 · Fuente de verdad",
    structureStep: "02 · Estructura real",
    discoveryStep: "03 · Descubrimiento semanal",
    loading: "Cargando tu cartera…",
    noPortfolio: "Aún no hay una cartera confirmada.",
    staleTitle: "Tus posiciones están vencidas. El análisis está detenido.",
    staleBody: "Revisa la lista y confirma qué mantienes hoy. Los precios pueden actualizarse automáticamente; la cantidad de acciones nunca se adivina.",
    currentTitle: "Cartera confirmada",
    currentBody: "Todas las métricas de esta página se calculan desde estas posiciones. No se usan cifras de un portfolio compartido.",
    confirmed: "Confirmada",
    stale: "Vencida",
    unconfirmed: "Sin confirmar",
    updated: "Última confirmación",
    daysAgo: "días",
    edit: "Revisar posiciones",
    closeEditor: "Cerrar edición",
    confirm: "Confirmar cartera actual",
    confirming: "Guardando y recalculando…",
    addRow: "Agregar posición",
    importCsv: "Importar CSV",
    importHint: "Columnas aceptadas: ticker, quantity, avg_cost_usd, current_price_usd.",
    ticker: "Ticker",
    quantity: "Cantidad",
    avgCost: "Costo promedio",
    price: "Precio actual",
    value: "Valor",
    weight: "Peso",
    returnLabel: "Retorno",
    portfolioBreakdown: "Detalle de posiciones",
    remove: "Eliminar",
    saveError: "No pudimos confirmar la cartera.",
    csvError: "No pudimos leer el archivo. Revisa que incluya ticker y quantity.",
    analysisWaiting: "Confirma la cartera para desbloquear el diagnóstico.",
    analysisLoading: "Calculando correlaciones e historiales propios…",
    analysisError: "No pudimos calcular la estructura con estos datos.",
    holdings: "Posiciones",
    effectiveBets: "Apuestas efectivas",
    riskPositions: "Posiciones analizadas",
    effectiveDetail: "Cantidad de apuestas después de descontar correlación.",
    cash: "Caja y equivalentes",
    mainCluster: "Cluster principal",
    mainClusterDetail: "Peso de la agrupación más grande por movimiento conjunto.",
    visibleBreadth: "Diversificación por tamaño",
    visibleDetail: "Excluye caja y equivalentes; son los nombres comparados entre sí.",
    overlap: "Solapamiento implícito",
    overlapDetail: "Parte del número aparente de posiciones que desaparece al descontar correlaciones.",
    resultLead: (names, bets) => `${names} nombres se comportan como aproximadamente ${bets} apuestas distintas.`,
    clusterTitle: "Tus verdaderas apuestas",
    clusterIntro: "Agrupamos posiciones cuando su correlación reciente supera 0,65. Un cluster es una exposición compartida, no una lista de empresas.",
    correlationTitle: "Matriz de correlación",
    correlationIntro: "Cada celda proviene del historial de esta cartera. Verde significa comportamiento distinto; naranja, movimiento conjunto.",
    cluster: "Cluster",
    averageCorrelation: "Correlación media",
    independent: "Apuesta más independiente",
    scoutTitle: "Construye una cola que merezca tu atención",
    scoutIntro: "No te pedimos describir tu profesión. Elige una observación concreta que ya podrías repetir; la salida será una lista de emisores, KPI, prueba pública y falsificador.",
    observation: "¿Dónde tienes observaciones repetidas?",
    change: "¿Qué cambio viste?",
    evidence: "¿Con qué evidencia pública puedes comprobarlo?",
    cadence: "¿Puedes repetir la misma medición?",
    queueEmpty: "Completa las cuatro decisiones. Verás nombres concretos aquí mismo.",
    queueOneOff: "Una observación aislada no crea un canal. Vuelve cuando puedas repetir la misma medición.",
    weeklyContract: "Contrato de observación",
    queueTitle: "Nombres para investigar esta semana",
    kpi: "KPI que debe moverse",
    chain: "Cadena causal",
    publicTest: "Prueba pública",
    falsifier: "Descártalo si",
    newDriver: "Driver nuevo",
    sameCluster: "Mismo driver",
    addWatchlist: "Agregar a watchlist",
    added: "Agregado",
    watchError: "No se pudo guardar",
    demoTitle: "La experiencia completa comienza con tu cartera.",
    demoBody: "Inicia sesión para confirmar posiciones y obtener apuestas efectivas, clusters y correlaciones propias. Puedes probar abajo el generador de nombres sin guardar datos.",
    demoButton: "Probar descubrimiento",
    researchOnly: "Herramienta de investigación. No recomienda comprar, vender ni dimensionar posiciones.",
  },
  en: {
    navHome: "Home",
    navWorkspace: "Workspace",
    signIn: "Sign in",
    eyebrow: "PORTFOLIO INTELLIGENCE",
    title: "Understand the bets you own. Then look for a new one.",
    intro: "The page starts from confirmed holdings, measures hidden concentration, and only then builds a weekly queue of names you can investigate through a lawful edge.",
    dataStep: "01 · Source of truth",
    structureStep: "02 · Real structure",
    discoveryStep: "03 · Weekly discovery",
    loading: "Loading your portfolio…",
    noPortfolio: "There is no confirmed portfolio yet.",
    staleTitle: "Your positions are stale. Analysis is paused.",
    staleBody: "Review the list and confirm what you own today. Prices can refresh automatically; share counts are never guessed.",
    currentTitle: "Confirmed portfolio",
    currentBody: "Every metric on this page is computed from these holdings. Shared-portfolio figures are not used.",
    confirmed: "Confirmed",
    stale: "Stale",
    unconfirmed: "Unconfirmed",
    updated: "Last confirmation",
    daysAgo: "days",
    edit: "Review holdings",
    closeEditor: "Close editor",
    confirm: "Confirm current portfolio",
    confirming: "Saving and recalculating…",
    addRow: "Add holding",
    importCsv: "Import CSV",
    importHint: "Accepted columns: ticker, quantity, avg_cost_usd, current_price_usd.",
    ticker: "Ticker",
    quantity: "Quantity",
    avgCost: "Average cost",
    price: "Current price",
    value: "Value",
    weight: "Weight",
    returnLabel: "Return",
    portfolioBreakdown: "Holding breakdown",
    remove: "Remove",
    saveError: "We could not confirm the portfolio.",
    csvError: "We could not read the file. Check that it includes ticker and quantity.",
    analysisWaiting: "Confirm the portfolio to unlock the diagnostic.",
    analysisLoading: "Calculating portfolio-specific histories and correlations…",
    analysisError: "We could not calculate structure from these inputs.",
    holdings: "Holdings",
    effectiveBets: "Effective bets",
    riskPositions: "Positions analyzed",
    effectiveDetail: "Number of bets after accounting for correlation.",
    cash: "Cash and equivalents",
    mainCluster: "Largest cluster",
    mainClusterDetail: "Weight of the largest group by co-movement.",
    visibleBreadth: "Size-only breadth",
    visibleDetail: "Excludes cash and equivalents; these are the names compared with each other.",
    overlap: "Implied overlap",
    overlapDetail: "Share of the apparent holding count that disappears after accounting for correlation.",
    resultLead: (names, bets) => `${names} names behave like roughly ${bets} distinct bets.`,
    clusterTitle: "Your actual bets",
    clusterIntro: "We group positions when recent correlation exceeds 0.65. A cluster is a shared exposure, not a company list.",
    correlationTitle: "Correlation matrix",
    correlationIntro: "Every cell comes from this portfolio's history. Green means distinct behavior; orange means co-movement.",
    cluster: "Cluster",
    averageCorrelation: "Average correlation",
    independent: "Most independent bet",
    scoutTitle: "Build a queue worth your attention",
    scoutIntro: "We do not ask you to describe your profession. Choose a concrete observation you can repeat; the output is a list of issuers, KPIs, public tests, and falsifiers.",
    observation: "Where do you have repeated observations?",
    change: "What changed?",
    evidence: "What public evidence can confirm it?",
    cadence: "Can you repeat the same measurement?",
    queueEmpty: "Complete the four decisions. Concrete names will appear here.",
    queueOneOff: "A one-off observation is not a channel. Return when you can repeat the same measurement.",
    weeklyContract: "Observation contract",
    queueTitle: "Names to investigate this week",
    kpi: "KPI that must move",
    chain: "Causal chain",
    publicTest: "Public test",
    falsifier: "Reject it if",
    newDriver: "New driver",
    sameCluster: "Same driver",
    addWatchlist: "Add to watchlist",
    added: "Added",
    watchError: "Could not save",
    demoTitle: "The full experience starts with your portfolio.",
    demoBody: "Sign in to confirm holdings and get portfolio-specific effective bets, clusters, and correlations. You can test the name generator below without saving data.",
    demoButton: "Try discovery",
    researchOnly: "Research tool only. It does not recommend buying, selling, or sizing positions.",
  },
};

function localized(value, language) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value[language] || value.es || value.en || "";
  return String(value || "");
}

function formatPct(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: digits }).format(number);
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(number);
}

function formatDate(value, language) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-CL", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function buildDraftRows(holdings) {
  return (Array.isArray(holdings) ? holdings : []).map((holding, index) => ({
    id: `${holding.ticker || "row"}-${index}`,
    ticker: String(holding.ticker || "").toUpperCase(),
    quantity: holding.quantity ?? holding.shares ?? "",
    avgCostUsd: holding.avgCostUsd ?? "",
    currentPriceUsd: holding.currentPriceUsd ?? "",
    marketValueUsd: holding.marketValueUsd ?? "",
    sector: holding.sector || "Unknown",
    assetType: holding.assetType || "equity",
  }));
}

function analysisRows(holdings) {
  return [...(Array.isArray(holdings) ? holdings : [])]
    .filter((holding) => {
      const ticker = String(holding.ticker || "").toUpperCase();
      return ticker && !CASH_LIKE.has(ticker) && String(holding.assetType || "").toLowerCase() !== "cash";
    })
    .sort((left, right) => Number(right.weightValue || 0) - Number(left.weightValue || 0))
    .slice(0, MAX_ANALYSIS_HOLDINGS)
    .map((holding) => ({
      ticker: String(holding.ticker || "").toUpperCase(),
      weight: Number(holding.weightValue || 0),
      sector: holding.sector || "",
      country: holding.region || "",
    }))
    .filter((holding) => holding.ticker && holding.weight > 0);
}

function parseCsv(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("empty");
  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const find = (...names) => headers.findIndex((header) => names.includes(header));
  const tickerIndex = find("ticker", "symbol", "simbolo", "símbolo");
  const quantityIndex = find("quantity", "shares", "cantidad", "acciones");
  const avgCostIndex = find("avg_cost_usd", "avg_cost", "average_cost", "costo_promedio");
  const priceIndex = find("current_price_usd", "current_price", "price", "precio_actual");
  if (tickerIndex < 0 || quantityIndex < 0) throw new Error("headers");
  return lines.slice(1).map((line, index) => {
    const values = line.split(delimiter).map((value) => value.trim().replace(/^"|"$/g, ""));
    return {
      id: `csv-${index}-${Date.now()}`,
      ticker: String(values[tickerIndex] || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, ""),
      quantity: values[quantityIndex] || "",
      avgCostUsd: avgCostIndex >= 0 ? values[avgCostIndex] || "" : "",
      currentPriceUsd: priceIndex >= 0 ? values[priceIndex] || "" : "",
      marketValueUsd: "",
      sector: "Unknown",
      assetType: "equity",
    };
  }).filter((row) => row.ticker && Number(row.quantity) > 0);
}

function ChoiceGroup({ label, options, value, onChange, language }) {
  return (
    <fieldset className={styles.choiceGroup}>
      <legend>{label}</legend>
      <div className={styles.choiceGrid}>
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            className={styles.choice}
            data-active={value === option.value}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            <strong>{localized(option.label, language)}</strong>
            {option.detail ? <span>{localized(option.detail, language)}</span> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function PortfolioEditor({ copy, draftRows, onChange, onConfirm, onImport, pending, error }) {
  const fileRef = useRef(null);
  const normalized = useMemo(() => normalizePortfolioDraft(draftRows), [draftRows]);
  const byTicker = useMemo(() => new Map(normalized.map((row) => [row.ticker, row])), [normalized]);

  return (
    <div className={styles.editor}>
      <div className={styles.editorToolbar}>
        <div>
          <strong>{normalized.length} {copy.holdings.toLowerCase()}</strong>
          <span>{copy.importHint}</span>
        </div>
        <div className={styles.toolbarActions}>
          <input
            accept=".csv,text/csv"
            className={styles.fileInput}
            onChange={(event) => onImport(event.target.files?.[0] || null)}
            ref={fileRef}
            type="file"
          />
          <button className={styles.textButton} onClick={() => fileRef.current?.click()} type="button">{copy.importCsv}</button>
          <button className={styles.textButton} onClick={() => onChange("add")} type="button">+ {copy.addRow}</button>
        </div>
      </div>

      <div className={styles.editorTable} role="table">
        <div className={styles.editorHeader} role="row">
          <span>{copy.ticker}</span><span>{copy.quantity}</span><span>{copy.avgCost}</span><span>{copy.price}</span><span>{copy.value}</span><span />
        </div>
        {draftRows.map((row) => {
          const computed = byTicker.get(String(row.ticker || "").toUpperCase());
          return (
            <div className={styles.editorRow} key={row.id} role="row">
              <input aria-label={copy.ticker} onChange={(event) => onChange(row.id, "ticker", event.target.value)} value={row.ticker} />
              <input aria-label={copy.quantity} inputMode="decimal" onChange={(event) => onChange(row.id, "quantity", event.target.value)} value={row.quantity} />
              <input aria-label={copy.avgCost} inputMode="decimal" onChange={(event) => onChange(row.id, "avgCostUsd", event.target.value)} value={row.avgCostUsd} />
              <input aria-label={copy.price} inputMode="decimal" onChange={(event) => onChange(row.id, "currentPriceUsd", event.target.value)} value={row.currentPriceUsd} />
              <span>{computed ? formatMoney(computed.marketValueUsd) : "—"}</span>
              <button aria-label={`${copy.remove} ${row.ticker}`} onClick={() => onChange(row.id, "remove")} type="button">×</button>
            </div>
          );
        })}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <button className={styles.primaryButton} disabled={pending || !normalized.length} onClick={onConfirm} type="button">
        {pending ? copy.confirming : copy.confirm}
      </button>
    </div>
  );
}

function PortfolioHoldingsTable({ copy, rows }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="portfolio-holdings-title" className={styles.holdingsPanel} data-testid="portfolio-holdings-table">
      <div className={styles.holdingsHeader}>
        <h3 id="portfolio-holdings-title">{copy.portfolioBreakdown}</h3>
        <span>{rows.length} {copy.holdings.toLowerCase()}</span>
      </div>
      <div className={styles.holdingsTableWrap}>
        <table className={styles.holdingsTable}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{copy.ticker}</th>
              <th scope="col">{copy.quantity}</th>
              <th scope="col">{copy.value}</th>
              <th scope="col">{copy.weight}</th>
              <th scope="col">{copy.returnLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.ticker}>
                <td>{String(index + 1).padStart(2, "0")}</td>
                <th scope="row">
                  <strong>{row.ticker}</strong>
                  {row.company ? <span>{row.company}</span> : null}
                </th>
                <td>{new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(row.quantity)}</td>
                <td>{formatMoney(row.marketValueUsd)}</td>
                <td>{formatPct(row.weight, 1)}</td>
                <td data-tone={Number(row.totalReturn) > 0 ? "positive" : Number(row.totalReturn) < 0 ? "negative" : "neutral"}>
                  {row.totalReturnLabel || (row.totalReturn === null ? "—" : formatPct(row.totalReturn, 1))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CorrelationMatrix({ analysis, copy }) {
  const tickers = analysis?.correlation_matrix?.tickers || [];
  const values = analysis?.correlation_matrix?.values || [];
  if (!tickers.length) return null;
  return (
    <div className={styles.matrixWrap}>
      <table aria-label={copy.correlationTitle} className={styles.matrix}>
        <thead><tr><th />{tickers.map((ticker) => <th key={ticker} scope="col">{ticker}</th>)}</tr></thead>
        <tbody>
          {tickers.map((ticker, rowIndex) => (
            <tr key={ticker}>
              <th scope="row">{ticker}</th>
              {tickers.map((column, columnIndex) => {
                const value = Number(values?.[rowIndex]?.[columnIndex] || 0);
                return (
                  <td
                    key={column}
                    style={{ "--heat": Math.max(0, value), "--cool": Math.max(0, -value) }}
                    title={`${ticker} / ${column}: ${value.toFixed(2)}`}
                  >
                    {rowIndex === columnIndex ? "1" : value.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p>{copy.correlationIntro}</p>
    </div>
  );
}

function ChannelScout({ analysis, copy, language, session }) {
  const [answers, setAnswers] = useState({ arena: "", change: "", evidence: "", cadence: "" });
  const [saved, setSaved] = useState({});
  const heldTickers = analysis?.input?.holdings?.map((row) => row.ticker) || [];
  const clusterTickers = analysis?.clusters?.[0]?.tickers || [];
  const result = useMemo(() => discoverResearchCandidates({ ...answers, language, heldTickers, clusterTickers }), [answers, language, heldTickers.join("|"), clusterTickers.join("|")]);

  function setAnswer(key, value) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  async function saveCandidate(candidate) {
    if (!session?.workspace?.id) return;
    setSaved((current) => ({ ...current, [candidate.ticker]: "saving" }));
    try {
      const response = await fetch(`/api/v1/workspaces/${encodeURIComponent(session.workspace.id)}/watchlists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: candidate.ticker,
          company: candidate.name,
          thesis: candidate.causalChain,
          trigger: candidate.kpi,
          source: "channel-discovery-v2",
        }),
      });
      if (!response.ok) throw new Error("save");
      setSaved((current) => ({ ...current, [candidate.ticker]: "saved" }));
    } catch {
      setSaved((current) => ({ ...current, [candidate.ticker]: "error" }));
    }
  }

  return (
    <section className={styles.scoutSection} id="weekly-discovery">
      <div className={styles.sectionHeading}>
        <span>{copy.discoveryStep}</span>
        <h2>{copy.scoutTitle}</h2>
        <p>{copy.scoutIntro}</p>
      </div>

      <div className={styles.scoutGrid}>
        <div className={styles.scoutChoices}>
          <ChoiceGroup label={copy.observation} language={language} onChange={(value) => setAnswer("arena", value)} options={CHANNEL_ARENAS} value={answers.arena} />
          <ChoiceGroup label={copy.change} language={language} onChange={(value) => setAnswer("change", value)} options={CHANNEL_CHANGES} value={answers.change} />
          <ChoiceGroup label={copy.evidence} language={language} onChange={(value) => setAnswer("evidence", value)} options={CHANNEL_EVIDENCE} value={answers.evidence} />
          <ChoiceGroup label={copy.cadence} language={language} onChange={(value) => setAnswer("cadence", value)} options={CHANNEL_CADENCES} value={answers.cadence} />
        </div>

        <div className={styles.queue} aria-live="polite">
          {result.status === "research_queue" ? (
            <>
              <div className={styles.contractCard}>
                <span>{copy.weeklyContract}</span>
                <strong>{result.observationContract}</strong>
              </div>
              <div className={styles.queueHeader}>
                <span>{String(result.candidates.length).padStart(2, "0")}</span>
                <h3>{copy.queueTitle}</h3>
              </div>
              {result.candidates.map((candidate) => (
                <article className={styles.candidate} key={candidate.ticker}>
                  <header>
                    <div className={styles.tickerMark}>{candidate.ticker}</div>
                    <div><h4>{candidate.name}</h4><p>{candidate.whyThisName}</p></div>
                    <span className={styles.fitTag} data-fit={candidate.portfolioFit}>{candidate.portfolioFit === "same_cluster" ? copy.sameCluster : copy.newDriver}</span>
                  </header>
                  <dl>
                    <div><dt>{copy.kpi}</dt><dd>{candidate.kpi}</dd></div>
                    <div><dt>{copy.chain}</dt><dd>{candidate.causalChain}</dd></div>
                    <div><dt>{copy.publicTest}</dt><dd><ol>{candidate.publicTest.steps.slice(0, 2).map((step) => <li key={step}>{step}</li>)}</ol></dd></div>
                    <div><dt>{copy.falsifier}</dt><dd>{candidate.falsifier}</dd></div>
                  </dl>
                  {session?.workspace ? (
                    <button className={styles.watchButton} disabled={saved[candidate.ticker] === "saving" || saved[candidate.ticker] === "saved"} onClick={() => saveCandidate(candidate)} type="button">
                      {saved[candidate.ticker] === "saved" ? copy.added : saved[candidate.ticker] === "error" ? copy.watchError : copy.addWatchlist}
                    </button>
                  ) : null}
                </article>
              ))}
            </>
          ) : (
            <div className={styles.queuePlaceholder}>
              <span>+</span>
              <p>{answers.cadence === "one_off" ? copy.queueOneOff : copy.queueEmpty}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function PortfolioChannelWorkbench() {
  const { language, setLanguage } = useLanguagePreference();
  const copy = COPY[language] || COPY.es;
  const [session, setSession] = useState({ checking: true, workspace: null });
  const [portfolio, setPortfolio] = useState(null);
  const [draftRows, setDraftRows] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [demoOpen, setDemoOpen] = useState(false);

  const hydratePortfolio = useCallback((payload) => {
    const module = payload?.module || payload?.modules?.portfolio || null;
    const state = payload?.portfolio_state || null;
    const next = module ? {
      module,
      holdings: module.holdings || [],
      updatedAt: module?.holdingsSync?.updatedAt || state?.holdings_updated_at || null,
    } : null;
    setPortfolio(next);
    setDraftRows(buildDraftRows(next?.holdings || []));
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    let resolvedWorkspace = null;
    async function load() {
      try {
        const response = await fetch("/api/v1/session", { cache: "no-store" });
        const payload = response.ok ? await response.json() : null;
        if (!active) return;
        resolvedWorkspace = payload?.workspace || null;
        setSession({ checking: false, workspace: resolvedWorkspace });
        if (!resolvedWorkspace?.id) return;
        const portfolioResponse = await fetch(`/api/v1/workspaces/${encodeURIComponent(resolvedWorkspace.id)}/portfolio`, { cache: "no-store" });
        if (!portfolioResponse.ok) throw new Error("portfolio");
        const portfolioPayload = await portfolioResponse.json();
        if (active) hydratePortfolio(portfolioPayload);
      } catch {
        if (active) setSession({ checking: false, workspace: resolvedWorkspace });
      }
    }
    void load();
    return () => { active = false; };
  }, [hydratePortfolio]);

  const freshness = useMemo(() => assessPortfolioFreshness(portfolio?.updatedAt), [portfolio?.updatedAt]);
  const portfolioSummary = useMemo(() => summarizePortfolioWeights(portfolio?.holdings || []), [portfolio?.holdings]);
  const displayRows = useMemo(() => buildPortfolioDisplayRows(portfolio?.holdings || []), [portfolio?.holdings]);
  const rowsForAnalysis = useMemo(() => analysisRows(portfolio?.holdings || []), [portfolio?.holdings]);
  const analysisKey = JSON.stringify(rowsForAnalysis.map((row) => [row.ticker, row.weight]));

  useEffect(() => {
    if (!session.workspace?.id || !freshness.canAnalyze || rowsForAnalysis.length < 3) {
      setAnalysis(null);
      return undefined;
    }
    const controller = new AbortController();
    setAnalysisPending(true);
    setAnalysisError("");
    fetch(`/api/v1/workspaces/${encodeURIComponent(session.workspace.id)}/phantom-diversification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdings: rowsForAnalysis }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "analysis");
        setAnalysis(payload);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          setAnalysis(null);
          setAnalysisError(String(error?.message || copy.analysisError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setAnalysisPending(false);
      });
    return () => controller.abort();
  }, [session.workspace?.id, freshness.canAnalyze, analysisKey]);

  function changeDraft(id, field, value) {
    if (id === "add") {
      setDraftRows((current) => [...current, { id: `row-${Date.now()}`, ticker: "", quantity: "", avgCostUsd: "", currentPriceUsd: "", marketValueUsd: "", sector: "Unknown", assetType: "equity" }]);
      return;
    }
    if (field === "remove") {
      setDraftRows((current) => current.filter((row) => row.id !== id));
      return;
    }
    setDraftRows((current) => current.map((row) => row.id === id ? {
      ...row,
      [field]: field === "ticker"
        ? String(value || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 16)
        : String(value || "").replace(/[^0-9.]/g, ""),
    } : row));
  }

  async function importPortfolio(file) {
    if (!file) return;
    setSaveError("");
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error("empty");
      setDraftRows(rows);
      setEditorOpen(true);
    } catch {
      setSaveError(copy.csvError);
    }
  }

  async function confirmPortfolio() {
    if (!session.workspace?.id) return;
    const holdings = normalizePortfolioDraft(draftRows);
    if (!holdings.length) return;
    setSavePending(true);
    setSaveError("");
    try {
      const response = await fetch(`/api/v1/workspaces/${encodeURIComponent(session.workspace.id)}/portfolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replacePortfolio: true, holdings }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || copy.saveError);
      hydratePortfolio(payload);
      setEditorOpen(false);
    } catch (error) {
      setSaveError(String(error?.message || copy.saveError));
    } finally {
      setSavePending(false);
    }
  }

  const statusLabel = freshness.status === "current" ? copy.confirmed : freshness.status === "stale" ? copy.stale : copy.unconfirmed;
  const clusters = Array.isArray(analysis?.clusters) ? analysis.clusters : [];
  const mainCluster = clusters[0] || null;
  const independentCluster = [...clusters].sort((left, right) => left.average_correlation - right.average_correlation)[0] || null;
  const effectiveBreadth = Number(analysis?.current?.raw_breadth || 0);
  const overlapShare = computePortfolioOverlapShare(analysis?.current?.holdings_count, effectiveBreadth);

  return (
    <main className={`${styles.page} channels-route`} data-no-translate>
      <header className={styles.topbar}>
        <Link className={styles.logo} href="/">BL&apos;S</Link>
        <nav>
          <Link href="/">{copy.navHome}</Link>
          {session.workspace ? <Link href="/app">{copy.navWorkspace}</Link> : <Link href={`/login?lang=${language}&next=%2Fchannels`}>{copy.signIn}</Link>}
          <div className={styles.language} role="group">
            {["es", "en"].map((code) => <button aria-pressed={language === code} data-active={language === code} key={code} onClick={() => setLanguage(code)} type="button">{code.toUpperCase()}</button>)}
          </div>
        </nav>
      </header>

      <section className={styles.hero}>
        <p>{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <div><span /> <p>{copy.intro}</p></div>
      </section>

      {session.checking ? <div className={styles.loadingCard}>{copy.loading}</div> : null}

      {!session.checking && !session.workspace ? (
        <>
          <section className={styles.demoGate}>
            <div><span>{copy.dataStep}</span><h2>{copy.demoTitle}</h2><p>{copy.demoBody}</p></div>
            <div className={styles.demoActions}>
              <Link className={styles.primaryButton} href={`/login?lang=${language}&next=%2Fchannels`}>{copy.signIn}</Link>
              <button className={styles.textButton} onClick={() => setDemoOpen(true)} type="button">{copy.demoButton}</button>
            </div>
          </section>
          {demoOpen ? <ChannelScout analysis={null} copy={copy} language={language} session={session} /> : null}
        </>
      ) : null}

      {session.workspace ? (
        <>
          <section className={styles.sourceSection}>
            <div className={styles.sectionHeading}>
              <span>{copy.dataStep}</span>
              <h2>{freshness.canAnalyze ? copy.currentTitle : portfolio?.holdings?.length ? copy.staleTitle : copy.noPortfolio}</h2>
              <p>{freshness.canAnalyze ? copy.currentBody : copy.staleBody}</p>
            </div>
            <div className={styles.sourceStatus}>
              <div className={styles.statusSeal} data-status={freshness.status}><i />{statusLabel}</div>
              <div><span>{copy.updated}</span><strong>{formatDate(freshness.updatedAt, language)}</strong>{freshness.ageDays !== null ? <small>{freshness.ageDays} {copy.daysAgo}</small> : null}</div>
              <div><span>{copy.holdings}</span><strong>{portfolioSummary.holdingsCount}</strong><small>{formatMoney(portfolioSummary.totalValueUsd)}</small></div>
              <button className={styles.textButton} onClick={() => setEditorOpen((current) => !current)} type="button">{editorOpen ? copy.closeEditor : copy.edit}</button>
            </div>
            {editorOpen || !portfolio?.holdings?.length || !freshness.canAnalyze ? (
              <PortfolioEditor copy={copy} draftRows={draftRows} error={saveError} onChange={changeDraft} onConfirm={confirmPortfolio} onImport={importPortfolio} pending={savePending} />
            ) : null}
            {!editorOpen && displayRows.length ? <PortfolioHoldingsTable copy={copy} rows={displayRows} /> : null}
          </section>

          <section className={styles.structureSection}>
            <div className={styles.sectionHeading}>
              <span>{copy.structureStep}</span>
              <h2>{analysis ? copy.resultLead(analysis.current.holdings_count, Number(analysis.current.raw_breadth).toFixed(1)) : copy.analysisWaiting}</h2>
              {analysisError ? <p className={styles.error}>{analysisError}</p> : null}
            </div>

            {analysisPending ? <div className={styles.loadingCard}>{copy.analysisLoading}</div> : null}
            {analysis ? (
              <>
                <div className={styles.metrics}>
                  <article><span>{copy.riskPositions}</span><strong>{analysis.current.holdings_count}</strong><p>{copy.visibleDetail}</p></article>
                  <article className={styles.metricAccent}><span>{copy.effectiveBets}</span><strong>{Number(analysis.current.raw_breadth).toFixed(1)}</strong><p>{copy.effectiveDetail}</p></article>
                  <article><span>{copy.overlap}</span><strong>{formatPct(overlapShare)}</strong><p>{copy.overlapDetail}</p></article>
                  <article><span>{copy.mainCluster}</span><strong>{formatPct(mainCluster?.weight || 0)}</strong><p>{copy.mainClusterDetail}</p></article>
                  <article><span>{copy.cash}</span><strong>{formatPct(portfolioSummary.cashWeight)}</strong><p>{copy.visibleBreadth}: {portfolioSummary.sizeOnlyBreadth.toFixed(1)}</p></article>
                </div>

                <div className={styles.analysisGrid}>
                  <section className={styles.clusterPanel}>
                    <div><h3>{copy.clusterTitle}</h3><p>{copy.clusterIntro}</p></div>
                    <div className={styles.clusterList}>
                      {clusters.map((cluster, index) => (
                        <article key={cluster.id}>
                          <div className={styles.clusterIndex}>{String(index + 1).padStart(2, "0")}</div>
                          <div><strong>{cluster.label}</strong><p>{cluster.tickers.join(" · ")}</p></div>
                          <div><strong>{formatPct(cluster.weight)}</strong><span>{cluster.holdings_count} {copy.holdings.toLowerCase()}</span></div>
                          <div><strong>{cluster.average_correlation.toFixed(2)}</strong><span>{copy.averageCorrelation}</span></div>
                        </article>
                      ))}
                    </div>
                    {independentCluster ? <p className={styles.independentNote}>{copy.independent}: <strong>{independentCluster.label}</strong></p> : null}
                  </section>
                  <section className={styles.correlationPanel}>
                    <div><h3>{copy.correlationTitle}</h3></div>
                    <CorrelationMatrix analysis={analysis} copy={copy} />
                  </section>
                </div>
              </>
            ) : null}
          </section>

          {freshness.canAnalyze ? <ChannelScout analysis={analysis} copy={copy} language={language} session={session} /> : null}
        </>
      ) : null}

      <footer className={styles.footer}><span>BLS Prime</span><p>{copy.researchOnly}</p><Link href="/terms">Terms</Link></footer>
    </main>
  );
}
