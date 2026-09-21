"use client";
import {trackProductEvent} from '@/lib/product-events.mjs';
import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicSiteHeader } from "@/components/public-shell/public-site-header";
import { useLanguagePreference } from "@/components/language-layer";
import { TickerSearch } from "./ticker-search";
import { AnalysisPanel } from "./analysis-panel";
import { JevPanel } from './jev-panel';
import { ThesisWorkspace } from "./thesis-workspace";
import styles from "./research.module.css";
import {FinancialTerminal, CompanyComparison, Watchlist, useCompanyFinancials} from "./financial-terminal";

import {IntegrationPanel,QuarterlyPanel,TranscriptPanel,NewsScreener} from './market-panels';

const COPY = {
  es: {
    title: "Investigación de empresas",
    subtitle:
      "Cifras, documentos y decisiones en un solo lugar.",
    empty: "Abre un expediente por ticker",
    emptyBody:
      "Consulta el último informe anual y los trimestrales posteriores disponibles. Microsoft tiene una captura documental verificada para explorar el formato.",
    loading: "Consultando documentos de la empresa…",
    loadingBody:
      "La lectura está limitada a 50 segundos. Si una fuente falla, no completamos los huecos con suposiciones.",
    error: "No pudimos abrir el expediente",
    errors: {
      AUTH_REQUIRED: "Tu sesión expiró. Inicia sesión para continuar con esta empresa.",
      NO_ISSUER:
        "No encontramos ese ticker en el registro de empresas. Comprueba la clase de acción o prueba con otra empresa registrada.",
      BUSY: "Hay otra consulta en curso. Espera unos segundos y reintenta.",
      SOURCE_UNAVAILABLE:
        "La fuente documental no respondió o se alcanzó el límite de descarga. Puedes consultar el documento original o reintentar.",
      INVALID_TICKER: "El ticker no tiene un formato válido.",
    },
    retry: "Reintentar documentos",
    pending: "Análisis automático pendiente",
    pendingBody:
      "Los documentos ya están disponibles. Genera un informe cuando lo decidas. El análisis comienza únicamente al pulsar el botón; no se ha generado una valoración ni un diagnóstico de precio.",
    sections: ["Negocio y calidad", "Caja y capital", "Riesgos y tesis"],
    questions: [
      [
        "¿Qué explica el crecimiento: precio, volumen o adquisiciones?",
        "¿Qué evidencia respalda la recurrencia y la ventaja competitiva?",
        "¿Qué dato contradiría la lectura favorable?",
      ],
      [
        "¿Cuánta caja queda después de reinvertir?",
        "¿Qué inversión mantiene el negocio y cuál busca crecimiento?",
        "¿Deuda, arrendamientos o dilución cambian la caja del accionista?",
      ],
      [
        "¿Cuál es la hipótesis y su explicación alternativa?",
        "¿Qué hecho podría confirmarla o invalidarla?",
        "¿Qué precio y expectativas faltan para evaluar un posible descuento?",
      ],
    ],
    questionTitle: "Preguntas de investigación · no conclusiones",
    extracts: "Extractos seleccionados",
    noExtracts:
      "Sin extractos suficientes para esta sección. No implica ausencia de riesgos.",
    full: "Leer extracto completo",
    original: "Abrir documento original",
    sources: "Fuentes y cobertura",
    sourceCount: "documentos",
    coverage: "fragmentos seleccionados de",
    scope:
      "Lectura temática selectiva. No incluye todos los 8-K, anexos, proxy, competidores ni datos de mercado. Las citas no certifican una inferencia financiera.",
    captured: "Captura publicada",
    live: "Consulta documental",
    at: "Corte documental",
    filed: "Presentación aceptada",
    period: "Período económico",
    download: "Descargar expediente",
    research: "Investigación",
    disclaimer:
      "Material de investigación. No es una recomendación ni evidencia de alpha.",
  },
  en: {
    title: "Company research",
    subtitle: "Financials, documents and decisions in one place.",
    empty: "Open a company dossier",
    emptyBody:
      "Read the latest available annual filing and subsequent quarterly filings. Microsoft has a verified documentary capture to explore the format.",
    loading: "Retrieving company documents…",
    loadingBody:
      "Reads are limited to 50 seconds. When a source fails, we do not fill gaps with assumptions.",
    error: "Could not open the dossier",
    errors: {
      AUTH_REQUIRED: "Your session expired. Sign in to continue researching this company.",
      NO_ISSUER:
        "This ticker was not found in the company register. Check the share class or try another registered company.",
      BUSY: "Another request is running. Wait a few seconds and retry.",
      SOURCE_UNAVAILABLE:
        "The document source did not respond or the download limit was reached. Open the original document or retry.",
      INVALID_TICKER: "The ticker format is not valid.",
    },
    retry: "Retry documents",
    pending: "Automated analysis pending",
    pendingBody:
      "Documents are available now. Generate a report when you choose. Analysis starts only when you click the button; no valuation or price diagnosis has been generated.",
    sections: ["Business & quality", "Cash & capital", "Risks & thesis"],
    questions: [
      [
        "What drives growth: price, volume or acquisitions?",
        "What evidence supports recurring revenue and competitive advantage?",
        "What would contradict the favorable interpretation?",
      ],
      [
        "How much cash remains after reinvestment?",
        "Which investment maintains the business and which funds growth?",
        "Do debt, leases or dilution change shareholder cash generation?",
      ],
      [
        "What is the hypothesis and its alternative explanation?",
        "What event could confirm or invalidate it?",
        "Which prices and expectations are missing to assess a discount?",
      ],
    ],
    questionTitle: "Research questions · not conclusions",
    extracts: "Selected excerpts",
    noExtracts:
      "Insufficient excerpts for this section. This does not mean risks are absent.",
    full: "Read full excerpt",
    original: "Open original document",
    sources: "Sources & coverage",
    sourceCount: "documents",
    coverage: "selected chunks out of",
    scope:
      "Selective thematic reading. Does not include all 8-K filings, exhibits, proxies, competitors or market data. Quotes do not certify financial inferences.",
    captured: "Published capture",
    live: "Document retrieval",
    at: "Document cutoff",
    filed: "Filing accepted",
    period: "Economic period",
    download: "Download dossier",
    research: "Research",
    disclaimer: "Research material. Not a recommendation or evidence of alpha.",
  },
};
function date(value, language) {
  return value
    ? new Date(value).toLocaleDateString(
        language === "en" ? "en-US" : "es-CL",
        { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" },
      )
    : "—";
}
export function ResearchWorkspace({ initialLanguage = "es", ticker = "", initialView="overview", initialScope="stock" }) {
  const { language } = useLanguagePreference(initialLanguage),
    copy = COPY[language] || COPY.es;
  const [state, setState] = useState({
      loading: !!ticker,
      dossier: null,
      error: null,
    }),
    [active, setActive] = useState(0),
    [attempt, setAttempt] = useState(0);
  const [analysisStarted,setAnalysisStarted]=useState(false);
  const [workspaceView,setWorkspaceView]=useState(initialView);
  const [financialView,setFinancialView]=useState("annual");
  const financials=useCompanyFinancials(ticker);
  const [query,setQuery]=useState('');
  const [assistedReport,setAssistedReport]=useState(null);
  useEffect(() => {
    if (!ticker) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    let current = true;
    setState({ loading: true, dossier: null, error: null });
    setAnalysisStarted(false);
    setAssistedReport(null);
    fetch(`/api/public/research?ticker=${encodeURIComponent(ticker)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (response.status === 401) throw Error("AUTH_REQUIRED");
        if (!response.ok) throw Error(body.error || "SOURCE_UNAVAILABLE");
        if (current) {
          setState({ loading: false, dossier: body.dossier, ticket: body.ticket, available: body.analysisAvailable, error: null });
          trackProductEvent('research_loaded');
        }
      })
      .catch((error) => {
        if (current)
          setState({ loading: false, dossier: null, error: error.message });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [ticker, attempt]);
  const dossier = state.dossier,
    section = dossier?.sections[active];
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(dossier, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dossier.ticker}-evidence.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className={styles.workspace} data-no-translate>
      <PublicSiteHeader initialLanguage={initialLanguage} authenticated />
      <main className={styles.workInner}>
        <header className={styles.workHeading}>
          <div>

            <h1>{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </div>
          <TickerSearch language={language} initialTicker={ticker} />
        </header>
        <Watchlist ticker={ticker} language={language} />
        {ticker ? <>
          <div className={styles.companyHead}><div><span className={styles.symbol}>{ticker}</span><h2>{financials.company?.name || dossier?.name || ticker}</h2><p>{financials.company ? `${financials.company.namespace==='ifrs-full'?'IFRS':'US GAAP'} · ${financials.company.currency||'—'} · ${language==='en'?'Annual reporting':'Información anual'}` : copy.subtitle}</p></div>{dossier?<button className={styles.quietButton} onClick={download}>{copy.download}</button>:null}</div>
          <nav className={styles.workspaceTabs} aria-label={language==='en'?'Research workspace':'Espacio de investigación'}>
            {[['overview','Resumen','Overview'],['financials','Finanzas','Financials'],['documents','Documentos y análisis','Documents and analysis'],['thesis','Tesis y valoración','Thesis and valuation'],['segments','Segmentos','Segments'],['estimates','Consenso','Estimates'],['transcripts','Transcripciones','Transcripts'],['news','Noticias y sentimiento','News and sentiment'],['compare','Comparar','Compare']].map(([id,es,en])=><button key={id} aria-pressed={workspaceView===id} onClick={()=>setWorkspaceView(id)}>{language==='en'?en:es}</button>)}
          </nav>
          {workspaceView==='financials'?<div className={styles.financialFrequency}><button aria-pressed={financialView==='annual'} onClick={()=>setFinancialView('annual')}>{language==='en'?'Annual · SEC':'Anual · SEC'}</button><button aria-pressed={financialView==='quarter'} onClick={()=>setFinancialView('quarter')}>{language==='en'?'Quarterly / TTM · FMP':'Trimestral / 12 meses · FMP'}</button></div>:null}
          {workspaceView==='overview'||(workspaceView==='financials'&&financialView==='annual')?<FinancialTerminal state={financials} language={language} view={workspaceView} documentError={state.error} dossier={dossier} onView={setWorkspaceView} ticker={ticker}/>:null}
          {workspaceView==='financials'&&financialView==='quarter'?<div><QuarterlyPanel ticker={ticker} language={language}/></div>:null}
          {['segments','estimates'].includes(workspaceView)?<IntegrationPanel key={`${ticker}-${workspaceView}`} ticker={ticker} language={language} kind={workspaceView}/>:null}
          {workspaceView==='transcripts'?<TranscriptPanel ticker={ticker} language={language}/>:null}
          <div hidden={workspaceView!=='compare'}><CompanyComparison company={financials.company} language={language}/></div>
        </> : null}
        {workspaceView==='news'?<NewsScreener ticker={ticker} language={language} initialScope={initialScope}/>:null}
        {!ticker && workspaceView!=='news' ? (
          <section className={styles.empty}>
            <Link href={`/research?view=news&scope=market&lang=${language}`}>{language==='en'?'Open news screener':'Abrir explorador de noticias'}</Link>
            <h2>{copy.empty}</h2>
            <p>{copy.emptyBody}</p>
            <Link href={`/research?ticker=MSFT&lang=${language}`}>
              Microsoft · MSFT
            </Link>
          </section>
        ) : null}
        {state.loading && ['documents','thesis'].includes(workspaceView) ? (
          <section className={styles.empty} role="status">
            <div className={styles.progress} />
            <h2>{copy.loading}</h2>
            <p>{copy.loadingBody}</p>
          </section>
        ) : null}
        {state.error && ['documents','thesis'].includes(workspaceView) ? (
          <section className={styles.empty} role="alert">
            <h2>{copy.error}</h2>
            <p>{copy.errors[state.error] || copy.errors.SOURCE_UNAVAILABLE}</p>
            {state.error === 'AUTH_REQUIRED' ? <a href={`/login?intent=signin&lang=${language}&next=${encodeURIComponent(`/research?ticker=${ticker}&lang=${language}`)}`}>{language === 'en' ? 'Sign in' : 'Iniciar sesión'} </a> : <button onClick={() => setAttempt((n) => n + 1)}>
              {copy.retry}
            </button>}{" "}
            <a
              href={`https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(ticker)}`}
              target="_blank"
              rel="noreferrer"
            >
              {language==='en'?'Search original documents':'Buscar documentos originales'}
            </a>
          </section>
        ) : null}
        {dossier ? (
          <>
            <div hidden={workspaceView!=='thesis'}>
              <ThesisWorkspace key={dossier.packetHash} dossier={dossier} ticket={state.ticket} language={language} report={assistedReport} onRead={()=>setWorkspaceView('documents')} />
            </div>
            <div hidden={workspaceView!=='documents'}>
            <JevPanel kind="documents" language={language} dossier={dossier} ticket={state.ticket} ticker={ticker}/>
            <p className={styles.coverageNote}>{copy.at}: {date(dossier.asOf,language)} · {dossier.delivery==='published_capture'?copy.captured:copy.live}{dossier.unavailable?.length ? ` · ${dossier.unavailable.length} ${language==='en'?'documents unavailable':'documentos no disponibles'}`:''}</p>
            {dossier.scope?.startsWith('annual_and_latest_four')?<p className={styles.coverageNote}>{language==='en'?'Foreign issuer: annual report and up to four recent 6-K primary documents. Exhibits are not included.':'Emisor extranjero: informe anual y hasta cuatro documentos principales 6-K recientes. No se incluyen anexos.'}</p>:null}
            {!analysisStarted ? <div className={styles.notice}>
              <span aria-hidden="true">○</span>
              <div>
                <strong>{copy.pending}</strong>
                <p>{copy.pendingBody}</p>
              </div>
            </div> : null}
            <div className={styles.dossierLayout}>
              <aside className={styles.inspector}>
                <nav aria-label={copy.research}>
                  {copy.sections.map((name, i) => (
                    <button
                      key={name}
                      aria-pressed={active === i}
                      onClick={() => setActive(i)}
                    >
                      <span>0{i + 1}</span>
                      {name}

                    </button>
                  ))}
                </nav>
                <h3>{copy.sources}</h3>
                <p>
                  {dossier.coverage.documents} {copy.sourceCount}
                  <br />
                  {dossier.coverage.selectedChunks} {copy.coverage}{" "}
                  {dossier.coverage.totalChunks}
                </p>
                <p>{copy.scope}</p>
                {dossier.sources.map((source) => (
                  <details key={source.id}>
                    <summary>
                      {source.form} ·{" "}
                      {date(source.filedAt || source.acceptedAt, language)}
                    </summary>
                    <p>
                      {copy.filed}: {date(source.acceptedAt, language)}
                      <br />
                      {copy.period}: {date(source.periodEnd, language)}
                    </p>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {copy.original}
                    </a>
                    <p className={styles.hash}>SHA-256 {source.sha256}</p>
                  </details>
                ))}
              </aside>
              <article className={styles.reading}>
                <p className={styles.kicker}>
                  0{active + 1} / {copy.research}
                </p>
                <h2>{copy.sections[active]}</h2>
                <AnalysisPanel key={`${dossier.packetHash}:${language}`} dossier={dossier} ticket={state.ticket} available={state.available} language={language} sectionId={section.id} onStarted={()=>setAnalysisStarted(true)} onReport={setAssistedReport} />
                <div className={styles.questions}>
                  <h3>{copy.questionTitle}</h3>
                  <ul>
                    {copy.questions[active].map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
                <h3 className={styles.extractHeading}>
                  {copy.extracts} <span>{section.extracts.length}</span>
                </h3>
                <label className={styles.extractSearch}>{language==='en'?'Search selected excerpts':'Buscar en extractos seleccionados'}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={language==='en'?'Search in original language…':'Busca en el idioma original…'}/></label>
                {section.extracts.filter(e=>e.text.toLowerCase().includes(query.toLowerCase())).length ? (
                  section.extracts.filter(e=>e.text.toLowerCase().includes(query.toLowerCase())).map((extract) => {
                    const source = dossier.sources.find(
                      (s) => s.id === extract.id.split(":")[0],
                    );
                    return (
                      <section className={styles.extract} key={extract.id}>
                        <div className={styles.extractMeta}>
                          <span>
                            {source.form} · {extract.id}
                          </span>
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {copy.original}
                          </a>
                        </div>
                        <p className={styles.excerptPreview} lang="en">
                          {extract.text.slice(0, 320)}
                          {extract.text.length > 320 ? "…" : ""}
                        </p>
                        <details>
                          <summary>{copy.full}</summary>
                          <blockquote lang="en">{extract.text}</blockquote>
                        </details>
                      </section>
                    );
                  })
                ) : (
                  <p>{query?(language==='en'?'No excerpts match your search.':'Ningún extracto coincide con la búsqueda.'):copy.noExtracts}</p>
                )}
              </article>
            </div>
            </div>
          </>
        ) : null}
        <footer className={styles.workFooter}>
          {copy.disclaimer}
          <Link href={`/methodology?lang=${language}`}>
            {language === "en" ? "Methodology" : "Metodología"}
          </Link>
        </footer>
      </main>
    </div>
  );
}
