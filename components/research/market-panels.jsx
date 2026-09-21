"use client";
import { useEffect, useState } from "react";
import { QUARTER_METRICS, summarizeTone } from "@/lib/research/market-data.mjs";
import styles from "./terminal.module.css";
const fmt = (v, en, digits = 1) =>
  Number.isFinite(v)
    ? new Intl.NumberFormat(en ? "en-US" : "es-CL", {
        maximumFractionDigits: digits,
      }).format(v)
    : "—";
const pct = (v, en) => (Number.isFinite(v) ? `${fmt(v * 100, en)}%` : "—");
function useMarket(query) {
  const [attempt, setAttempt] = useState(0),
    [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    if (!query) {
      setState({ loading: false, data: null, error: null });
      return;
    }
    let live = true;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 55000);
    setState({ loading: true, data: null, error: null });
    fetch(`/api/research/market?${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok)
          throw Error(
            r.status === 401
              ? "AUTH_REQUIRED"
              : body.error || "SOURCE_UNAVAILABLE",
          );
        if (live) setState({ loading: false, data: body, error: null });
      })
      .catch((e) => {
        if (live) setState({ loading: false, data: null, error: e.message });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
function Status({ value, en }) {
  const copy = {
    not_configured: en ? "Provider not connected" : "Proveedor sin conectar",
    upgrade_required: en
      ? "Your data plan does not include this feed"
      : "El plan de datos no incluye esta fuente",
    access_denied: en
      ? "Provider access unavailable"
      : "Acceso al proveedor no disponible",
    rate_limited: en
      ? "Provider request limit reached"
      : "Límite de consultas del proveedor alcanzado",
    busy: en
      ? "Service busy; retry shortly"
      : "Servicio ocupado; reintenta en unos segundos",
    empty: en
      ? "No records available for this period"
      : "Sin registros disponibles para este período",
    unavailable: en
      ? "Source temporarily unavailable"
      : "Fuente temporalmente no disponible",
    available: en ? "Connected" : "Conectado",
    not_requested: en ? "Not used in this view" : "No se utiliza en esta vista",
  };
  return <span>{copy[value] || copy.unavailable}</span>;
}
function RequestState({ state, en }) {
  if (state.loading)
    return (
      <p role="status">{en ? "Retrieving data…" : "Consultando datos…"}</p>
    );
  if (state.error)
    return (
      <div role="alert">
        <p>
          {state.error === "AUTH_REQUIRED"
            ? en
              ? "Your session expired. Sign in again."
              : "Tu sesión expiró. Inicia sesión nuevamente."
            : en
              ? "This request could not be completed."
              : "No pudimos completar esta consulta."}
        </p>
        {state.error === "AUTH_REQUIRED" ? (
          <a href="/login">{en ? "Sign in" : "Iniciar sesión"}</a>
        ) : (
          <button onClick={state.retry}>{en ? "Retry" : "Reintentar"}</button>
        )}
      </div>
    );
  return null;
}
function SourceNote({ data, en }) {
  return (
    <p className={styles.caption}>
      FMP · {en ? "Retrieved" : "Consultado"}:{" "}
      {data?.asOf
        ? new Date(data.asOf).toLocaleString(en ? "en-US" : "es-CL")
        : "—"}{" "}
      ·{" "}
      <a
        href="https://financialmodelingprep.com/"
        target="_blank"
        rel="noreferrer"
      >
        {en ? "Data provider" : "Proveedor de datos"}
      </a>
    </p>
  );
}
function SegmentTable({ part, title, en }) {
  const rows = part?.data || [],
    names = [...new Set(rows.flatMap((r) => r.values.map((v) => v.name)))];
  return (
    <section className={styles.panel}>
      <h2>{title}</h2>
      {rows.length ? (
        <div className={styles.tableScroll}>
          <table>
            <caption>
              {en
                ? "Reported series, millions. Categories may overlap; do not add them together."
                : "Series publicadas, en millones. Las categorías pueden solaparse; no deben sumarse."}
            </caption>
            <thead>
              <tr>
                <th>{en ? "Series" : "Serie"}</th>
                {rows.map((r) => (
                  <th key={r.date}>
                    {r.date}
                    <br />
                    {r.currency}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {names.map((name) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  {rows.map((r) => (
                    <td key={r.date}>
                      {fmt(
                        r.values.find((v) => v.name === name)?.value / 1e6,
                        en,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          <Status value={part?.status} en={en} />
        </p>
      )}
    </section>
  );
}
export function IntegrationPanel({ ticker, language, kind }) {
  const en = language === "en",
    state = useMarket(new URLSearchParams({ ticker, kind }).toString()),
    data = state.data;
  return (
    <div className={styles.primary}>
      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <h2>
            {kind === "segments"
              ? en
                ? "Segments and business mix"
                : "Segmentos y composición del negocio"
              : en
                ? "Analyst consensus"
                : "Consenso de analistas"}
          </h2>
          <button onClick={state.retry} disabled={state.loading}>
            {en ? "Refresh" : "Actualizar"}
          </button>
        </div>
        <RequestState state={state} en={en} />
        {data ? (
          <>
            <SourceNote data={data} en={en} />
            {data.status !== "available" ? (
              <p>
                <Status value={data.status} en={en} />
              </p>
            ) : null}
          </>
        ) : null}
        {kind === "estimates" && data?.data?.length ? (
          <>
            <p>
              {en
                ? "Forecasts, not reported results. Currency is not specified by this feed; values remain in provider units and are not compared with SEC figures. Analyst counts differ by metric."
                : "Proyecciones, no resultados publicados. Esta fuente no especifica la moneda; los valores conservan las unidades del proveedor y no se comparan con cifras SEC. La cantidad de analistas varía por indicador."}
            </p>
            <div className={styles.tableScroll}>
              <table>
                <caption>
                  {en
                    ? "Revenue in millions; EPS in provider units per share. Low / average / high."
                    : "Ingresos en millones; BPA en unidades del proveedor por acción. Mínimo / promedio / máximo."}
                </caption>
                <thead>
                  <tr>
                    <th>{en ? "Fiscal year end" : "Cierre del ejercicio"}</th>
                    <th>{en ? "Revenue range" : "Rango de ingresos"}</th>
                    <th>{en ? "Analysts" : "Analistas"}</th>
                    <th>{en ? "EPS range" : "Rango de BPA"}</th>
                    <th>{en ? "Analysts" : "Analistas"}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((r) => (
                    <tr key={r.date}>
                      <th>{r.date}</th>
                      <td>
                        {[r.revenue.low, r.revenue.average, r.revenue.high]
                          .map((v) => fmt(v === null ? null : v / 1e6, en))
                          .join(" / ")}
                      </td>
                      <td>{fmt(r.revenue.analysts, en, 0)}</td>
                      <td>
                        {[r.eps.low, r.eps.average, r.eps.high]
                          .map((v) => fmt(v, en, 2))
                          .join(" / ")}
                      </td>
                      <td>{fmt(r.eps.analysts, en, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
      {kind === "segments" && data ? (
        <>
          <SegmentTable
            part={data.product}
            title={
              en
                ? "Products and operating segments"
                : "Productos y segmentos operativos"
            }
            en={en}
          />
          <SegmentTable
            part={data.geographic}
            title={en ? "Geographic revenue" : "Ingresos por geografía"}
            en={en}
          />
        </>
      ) : null}
    </div>
  );
}
export function QuarterlyPanel({ ticker, language }) {
  const en = language === "en",
    state = useMarket(
      new URLSearchParams({ ticker, kind: "quarters" }).toString(),
    ),
    [frequency, setFrequency] = useState("quarter"),
    data = state.data,
    quarters = data?.data,
    rows =
      frequency === "ttm"
        ? quarters?.ttm
          ? [quarters.ttm]
          : []
        : quarters?.rows || [];
  const last = rows[0],
    ratio = (key) =>
      last?.values.revenue > 0 && Number.isFinite(last?.values[key])
        ? last.values[key] / last.values.revenue
        : null;
  return (
    <section className={styles.panel}>
      <div className={styles.sectionHeading}>
        <h2>
          {en
            ? "Quarterly financials and KPIs"
            : "Finanzas trimestrales e indicadores"}
        </h2>
        <div className={styles.controls}>
          <label>
            {en ? "Period" : "Período"}
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              <option value="quarter">{en ? "Quarterly" : "Trimestral"}</option>
              <option value="ttm">
                {en ? "Trailing 12 months" : "Últimos 12 meses"}
              </option>
            </select>
          </label>
          <button onClick={state.retry} disabled={state.loading}>
            {en ? "Refresh" : "Actualizar"}
          </button>
        </div>
      </div>
      <RequestState state={state} en={en} />
      {data ? (
        <>
          <p>
            {en
              ? "FMP-normalized quarterly statements, in reporting currency. TTM requires four consecutive fiscal quarters in the same currency. Cash, debt and equity use the latest balance; missing values stay blank."
              : "Estados trimestrales normalizados por FMP, en moneda de reporte. Los últimos 12 meses requieren cuatro trimestres fiscales consecutivos en la misma moneda. Efectivo, deuda y patrimonio utilizan el último saldo; los datos ausentes quedan vacíos."}
          </p>
          {last ? (
            <div className={styles.stats}>
              {[
                ["revenue", en ? "Revenue" : "Ingresos"],
                ["netMargin", en ? "Net margin" : "Margen neto"],
                [
                  "cashMargin",
                  en ? "Operating cash / revenue" : "Caja operativa / ingresos",
                ],
                ["freeCashFlow", en ? "Free cash flow" : "Flujo de caja libre"],
              ].map(([id, label]) => (
                <div key={id}>
                  <span>{label}</span>
                  <strong>
                    {id === "netMargin"
                      ? pct(ratio("netIncome"), en)
                      : id === "cashMargin"
                        ? pct(ratio("operatingCash"), en)
                        : fmt(
                            Number.isFinite(last.values[id])
                              ? last.values[id] / 1e6
                              : null,
                            en,
                          )}
                  </strong>
                  <small>
                    {last.date} ·{" "}
                    {id.includes("Margin")
                      ? "%"
                      : `${last.currency} ${en ? "million" : "millones"}`}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p>
              {frequency === "ttm" ? (
                en ? (
                  "Four complete, consecutive quarters are not available."
                ) : (
                  "No hay cuatro trimestres completos y consecutivos disponibles."
                )
              ) : (
                <Status value={data.status} en={en} />
              )}
            </p>
          )}
          {rows.length ? (
            <div className={styles.tableScroll}>
              <table>
                <caption>
                  {en
                    ? "Millions of each column’s reporting currency. Provider categories may differ from annual SEC figures."
                    : "Millones de la moneda indicada en cada columna. Las categorías del proveedor pueden diferir de las cifras anuales SEC."}
                </caption>
                <thead>
                  <tr>
                    <th>{en ? "Metric" : "Indicador"}</th>
                    {rows.map((r) => (
                      <th key={`${r.date}-${r.currency}`}>
                        {r.quarter ? `Q${r.quarter} ${r.year}` : "TTM"}
                        <br />
                        {r.date} · {r.currency}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {QUARTER_METRICS.map((m) => (
                    <tr key={m.id}>
                      <th scope="row">{m[en ? "en" : "es"]}</th>
                      {rows.map((r) => (
                        <td
                          key={`${r.date}-${r.currency}`}
                          title={
                            r.filed?.[m.id]
                              ? `${en ? "Filed" : "Presentado"}: ${r.filed[m.id]}`
                              : r.periods
                                ? `${en ? "Quarter ends" : "Cierres trimestrales"}: ${r.periods.join(", ")}`
                                : undefined
                          }
                        >
                          {fmt(
                            Number.isFinite(r.values[m.id])
                              ? r.values[m.id] / 1e6
                              : null,
                            en,
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <SourceNote data={data} en={en} />
          {data.sources
            ? Object.entries(data.sources)
                .filter(([, s]) => !["available", "empty"].includes(s))
                .map(([s, v]) => (
                  <p key={s}>
                    {
                      {
                        income: en ? "Income statement" : "Resultados",
                        cash: en ? "Cash flow" : "Flujos de caja",
                        balance: en ? "Balance sheet" : "Balance",
                      }[s]
                    }
                    : <Status value={v} en={en} />
                  </p>
                ))
            : null}
        </>
      ) : null}
    </section>
  );
}
export function TranscriptPanel({ ticker, language }) {
  const en = language === "en",
    dates = useMarket(
      new URLSearchParams({ ticker, kind: "transcripts" }).toString(),
    ),
    [period, setPeriod] = useState(""),
    [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState(false),
    [year, quarter] = period.split("-"),
    content = useMarket(
      period
        ? new URLSearchParams({
            ticker,
            kind: "transcript",
            year,
            quarter,
          }).toString()
        : null,
    );
  const record = content.data?.data?.[0],
    paragraphs = record?.content.split(/\n+/).filter(Boolean) || [],
    matches = query
      ? paragraphs.filter((p) => p.toLowerCase().includes(query.toLowerCase()))
      : paragraphs;
  return (
    <section className={styles.panel}>
      <div className={styles.sectionHeading}>
        <h2>
          {en ? "Earnings call transcripts" : "Transcripciones de resultados"}
        </h2>
        <button onClick={dates.retry} disabled={dates.loading}>
          {en ? "Refresh" : "Actualizar"}
        </button>
      </div>
      <RequestState state={dates} en={en} />
      {dates.data ? (
        <>
          <SourceNote data={dates.data} en={en} />
          {dates.data.data?.length ? (
            <label>
              {en ? "Call" : "Presentación"}
              <select
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value);
                  setQuery("");
                  setExpanded(false);
                }}
              >
                <option value="">
                  {en ? "Choose a quarter" : "Selecciona un trimestre"}
                </option>
                {dates.data.data.map((r) => (
                  <option
                    key={`${r.year}-${r.quarter}`}
                    value={`${r.year}-${r.quarter}`}
                  >
                    {r.year} Q{r.quarter} · {r.date}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>
              <Status value={dates.data.status} en={en} />.{" "}
              {en
                ? "This connection uses the licensed FMP transcript feed."
                : "Esta conexión utiliza la fuente de transcripciones con licencia de FMP."}
            </p>
          )}
        </>
      ) : null}
      {period ? (
        <>
          <RequestState state={content} en={en} />
          {record ? (
            <>
              <label className={styles.searchLabel}>
                {en ? "Search transcript" : "Buscar en la transcripción"}
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setExpanded(false);
                  }}
                />
              </label>
              <p>
                {record.date} · {matches.length}{" "}
                {en ? "paragraphs" : "párrafos"}
              </p>
              <div className={styles.transcript}>
                {matches.slice(0, expanded ? undefined : 20).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              {matches.length > 20 ? (
                <button onClick={() => setExpanded(!expanded)}>
                  {expanded
                    ? en
                      ? "Show less"
                      : "Mostrar menos"
                    : en
                      ? "Read all matches"
                      : "Leer todos los resultados"}
                </button>
              ) : null}
            </>
          ) : content.data ? (
            <p>
              <Status value={content.data.status} en={en} />
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
const toneLabel = (value, en) =>
  ({
    positive: en ? "Positive" : "Positivo",
    negative: en ? "Negative" : "Negativo",
    mixed: en ? "Mixed" : "Mixto",
    unclassified: en ? "Unclassified" : "Sin clasificar",
  })[value];
function CrossSourcePanel({ ticker, scope, watchlist, en }) {
  const [requested, setRequested] = useState(false);
  const state = useMarket(
      requested
        ? new URLSearchParams({
            kind: "sentiment",
            scope,
            ...(scope === "stock"
              ? { ticker }
              : scope === "watchlist"
                ? { tickers: watchlist }
                : {}),
          }).toString()
        : null,
    ),
    data = state.data;
  const names = {
    reddit: "Reddit",
    x: "X",
    news: en ? "News" : "Noticias",
    polymarket: "Polymarket",
  };
  const trends = {
    rising: en ? "Increasing" : "En aumento",
    falling: en ? "Decreasing" : "En descenso",
    stable: en ? "Stable" : "Estable",
  };
  return (
    <section className={styles.panel}>
      <div className={styles.sectionHeading}>
        <h2>{en ? "Signals across sources" : "Señales de varias fuentes"}</h2>
        <button
          disabled={requested && state.loading}
          onClick={() => (requested ? state.retry() : setRequested(true))}
        >
          {requested
            ? en
              ? "Refresh signals"
              : "Actualizar señales"
            : en
              ? "Load source signals"
              : "Consultar señales por fuente"}
        </button>
      </div>
      <p>
        {en
          ? "Optional Adanos connection for Reddit, X, news and Polymarket. Queries the selected stock or the scanned portfolio/watchlist tickers on demand. Each platform is shown separately."
          : "Conexión opcional de Adanos para Reddit, X, noticias y Polymarket. Consulta a demanda la empresa seleccionada o los tickers consultados de tu cartera o seguimiento. Cada plataforma se presenta por separado."}
      </p>
      {requested ? <RequestState state={state} en={en} /> : null}
      {data ? (
        <>
          <p className={styles.caption}>
            Adanos · {data.from} / {data.to} UTC ·{" "}
            {en ? "Retrieved" : "Consultado"}:{" "}
            {new Date(data.asOf).toLocaleString(en ? "en-US" : "es-CL")} ·{" "}
            {en ? "Tickers omitted" : "Tickers omitidos"}: {data.omitted || 0}
          </p>
          {data.status !== "available" ? (
            <p>
              <Status value={data.status} en={en} />
              {data.status === "not_configured"
                ? en
                  ? ". Requires an Adanos API key with a plan licensed for this deployment."
                  : ". Requiere una clave de Adanos y un plan con licencia para este despliegue."
                : null}
            </p>
          ) : null}
          {data.rows?.length ? (
            <>
              <div className={styles.tableScroll}>
                <table>
                  <caption>
                    {en
                      ? "Attention measures activity, not bullishness. Percentages and trading signals are platform-specific; no cross-platform average is calculated. Zero activity has no sentiment score."
                      : "La atención mide actividad, no optimismo. Los porcentajes y las señales de negociación dependen de cada plataforma; no se calcula un promedio entre fuentes. La ausencia de actividad no tiene puntaje de sentimiento."}
                  </caption>
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>{en ? "Source" : "Fuente"}</th>
                      <th>{en ? "Attention / 100" : "Atención / 100"}</th>
                      <th>{en ? "Bullish %" : "Alcista %"}</th>
                      <th>{en ? "Bearish %" : "Bajista %"}</th>
                      <th>{en ? "Volume" : "Volumen"}</th>
                      <th>
                        {en ? "Activity trend" : "Tendencia de actividad"}
                      </th>
                      <th>{en ? "Coverage" : "Cobertura"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={`${r.ticker}:${r.source}`}>
                        <th>{r.ticker}</th>
                        <td>{names[r.source]}</td>
                        <td>{fmt(r.activity, en)}</td>
                        <td>{fmt(r.bullish, en)}</td>
                        <td>{fmt(r.bearish, en)}</td>
                        <td>
                          {fmt(r.count, en, 0)}{" "}
                          {r.unit === "trades"
                            ? en
                              ? "trades"
                              : "operaciones"
                            : en
                              ? "mentions"
                              : "menciones"}
                        </td>
                        <td>{trends[r.trend] || "—"}</td>
                        <td>
                          <Status value={r.status} en={en} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.caption}>
                {en
                  ? "Activity trend compares platform participation over time; it is not a price trend. These signals do not predict returns."
                  : "La tendencia compara la participación en la plataforma a lo largo del tiempo; no es una tendencia del precio. Estas señales no predicen retornos."}
              </p>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
export function NewsScreener({ ticker, language, initialScope = "stock" }) {
  const en = language === "en",
    [scope, setScope] = useState(
      ticker
        ? initialScope
        : ["portfolio", "watchlist"].includes(initialScope)
          ? initialScope
          : "market",
    ),
    [query, setQuery] = useState(""),
    [tone, setTone] = useState("all"),
    [provider, setProvider] = useState("all"),
    [days, setDays] = useState("7"),
    [symbol, setSymbol] = useState("all"),
    [watchlist, setWatchlist] = useState("");
  useEffect(() => {
    const read = () => {
      try {
        const items = JSON.parse(
          localStorage.getItem("bls-research-watchlist-v1") || "[]",
        );
        setWatchlist(
          Array.isArray(items)
            ? [
                ...new Set(
                  items.filter(
                    (t) =>
                      typeof t === "string" &&
                      /^[A-Z][A-Z0-9.-]{0,11}$/.test(t),
                  ),
                ),
              ]
                .slice(0, 30)
                .join(",")
            : "",
        );
      } catch {
        setWatchlist("");
      }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("bls-watchlist-changed", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("bls-watchlist-changed", read);
    };
  }, []);
  const state = useMarket(
      new URLSearchParams({
        kind: "news",
        scope,
        ...(scope === "stock"
          ? { ticker }
          : scope === "watchlist"
            ? { tickers: watchlist }
            : {}),
      }).toString(),
    ),
    data = state.data;
  const articles = (data?.articles || []).filter(
    (a) =>
      (tone === "all" || a.tone === tone) &&
      (provider === "all" ||
        (a.providers || [a.provider]).includes(provider)) &&
      (symbol === "all" || a.symbols.includes(symbol)) &&
      Date.parse(a.date) >= Date.now() - Number(days) * 864e5 &&
      `${a.title} ${a.publisher} ${a.symbols.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const summary = summarizeTone(articles),
    results = data?.results || [],
    social = data?.stocktwits;
  return (
    <div className={styles.primary}>
      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>
              {en
                ? "News and sentiment screener"
                : "Explorador de noticias y sentimiento"}
            </h2>
            <p>
              {en
                ? "Company headlines, portfolio coverage and licensed social signals."
                : "Titulares de empresas, cobertura de tu cartera y señales sociales con licencia."}
            </p>
          </div>
          <button onClick={state.retry} disabled={state.loading}>
            {en ? "Refresh" : "Actualizar"}
          </button>
        </div>
        <div className={styles.filters}>
          <label>
            {en ? "Universe" : "Universo"}
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setSymbol("all");
              }}
            >
              {ticker ? <option value="stock">{ticker}</option> : null}
              <option value="watchlist">
                {en ? "My watchlist" : "Mi seguimiento"}
              </option>
              <option value="portfolio">
                {en ? "My portfolio" : "Mi cartera"}
              </option>
              <option value="market">
                {en ? "Market headlines" : "Titulares del mercado"}
              </option>
            </select>
          </label>
          <label>
            {en ? "Window" : "Ventana"}
            <select value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="7">{en ? "7 days" : "7 días"}</option>
              <option value="3">{en ? "3 days" : "3 días"}</option>
            </select>
          </label>
          <label>
            {en ? "Source" : "Fuente"}
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="all">{en ? "All" : "Todas"}</option>
              <option>FMP</option>
              <option>Yahoo Finance</option>
            </select>
          </label>
          <label>
            {en ? "Headline tone" : "Tono del titular"}
            <select value={tone} onChange={(e) => setTone(e.target.value)}>
              <option value="all">{en ? "All" : "Todos"}</option>
              {["positive", "negative", "mixed", "unclassified"].map((t) => (
                <option key={t} value={t}>
                  {toneLabel(t, en)}
                </option>
              ))}
            </select>
          </label>
          {results.length ? (
            <label>
              {en ? "Holding" : "Posición"}
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              >
                <option value="all">{en ? "All" : "Todas"}</option>
                {results.map((r) => (
                  <option key={r.ticker}>{r.ticker}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className={styles.searchLabel}>
            {en ? "Search headlines" : "Buscar titulares"}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                en ? "Company, topic or publisher" : "Empresa, tema o medio"
              }
            />
          </label>
        </div>
        <RequestState state={state} en={en} />
        {data ? (
          <>
            <div className={styles.stats}>
              {[
                [en ? "Headlines shown" : "Titulares visibles", summary.total],
                [en ? "Positive" : "Positivos", summary.counts.positive],
                [en ? "Negative" : "Negativos", summary.counts.negative],
                [
                  en ? "Unclassified" : "Sin clasificar",
                  summary.counts.unclassified,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <details className={styles.method}>
              <summary>
                {en
                  ? "How headline tone is classified"
                  : "Cómo se clasifica el tono de los titulares"}
              </summary>
              <p className={styles.caption}>
                {en
                  ? "Headline tone uses a conservative English keyword rule, not an AI forecast or measured market sentiment. Negations, questions and unmatched titles stay unclassified; mixed titles count separately. Labels apply to the whole headline and may involve several companies. Duplicate headlines are collapsed. FMP times are shown at date precision because its feed omits a timezone."
                  : "El tono usa una regla conservadora de palabras en inglés; no es una predicción de IA ni una medición del sentimiento del mercado. Negaciones, preguntas y títulos sin coincidencias quedan sin clasificar; los títulos mixtos se cuentan por separado. La etiqueta describe el titular completo y puede involucrar varias empresas. Se eliminan titulares duplicados. FMP se muestra con precisión de fecha porque su fuente omite la zona horaria."}{" "}
                {en ? "Mixed" : "Mixtos"}: {summary.counts.mixed}.{" "}
                {en ? "Retrieved" : "Consultado"}:{" "}
                {new Date(data.asOf).toLocaleString(en ? "en-US" : "es-CL")}.
              </p>
            </details>
            {data.sources ? (
              <p className={styles.caption}>
                FMP: <Status value={data.sources.fmp} en={en} /> · Yahoo
                Finance: <Status value={data.sources.yahoo} en={en} />
              </p>
            ) : null}
            {social ? (
              <div className={styles.social}>
                <h3>Stocktwits</h3>
                {social.status === "available" ? (
                  <>
                    <strong>{fmt(social.data.sentiment, en, 0)} / 100</strong>
                    <p>
                      {en
                        ? "Normalized social sentiment"
                        : "Sentimiento social normalizado"}{" "}
                      · {en ? "Message volume" : "Volumen de mensajes"}:{" "}
                      {fmt(social.data.messageVolume, en, 0)} ·{" "}
                      {new Date(social.data.date).toLocaleString(
                        en ? "en-US" : "es-CL",
                      )}
                    </p>
                  </>
                ) : (
                  <p>
                    <Status value={social.status} en={en} />.{" "}
                    {en
                      ? "Requires licensed Stocktwits credentials. No social score is inferred from news."
                      : "Requiere credenciales de Stocktwits con licencia. No se infiere un puntaje social a partir de las noticias."}
                  </p>
                )}
              </div>
            ) : null}
            {data.universe ? (
              <>
                <p>
                  {scope === "watchlist"
                    ? en
                      ? "Watchlist coverage"
                      : "Cobertura de seguimiento"
                    : en
                      ? "Portfolio coverage"
                      : "Cobertura de cartera"}
                  : {data.coverage.withNews} / {data.universe.total}{" "}
                  {en
                    ? "eligible tickers have recent news"
                    : "tickers elegibles tienen noticias recientes"}{" "}
                  {scope === "portfolio" ? (
                    <>
                      {" "}
                      · {pct(data.coverage.coveredKnownValueWeight, en)}{" "}
                      {en
                        ? "of known positive USD value"
                        : "del valor positivo conocido en USD"}
                    </>
                  ) : null}
                  .
                </p>
                <p className={styles.caption}>
                  {scope === "watchlist"
                    ? en
                      ? "Scans up to 20 tickers from the watchlist stored in this browser. Only symbols are sent to providers."
                      : "Se consultan hasta 20 tickers del seguimiento guardado en este navegador. Solo se envían símbolos a los proveedores."
                    : en
                      ? "Scans up to 20 stock/ETF tickers, largest known holdings first. Weights use stored portfolio valuations, not live quotes; missing valuations are excluded from the weight denominator. News coverage is not an exposure or sentiment score. Only symbols are sent to news providers."
                      : "Se consultan hasta 20 tickers de acciones/ETF, empezando por las mayores posiciones conocidas. Los pesos usan valoraciones guardadas, no cotizaciones en vivo; las valoraciones ausentes se excluyen del denominador. La cobertura de noticias no es un puntaje de exposición ni de sentimiento. Solo se envían símbolos a los proveedores."}{" "}
                  {en ? "Omitted" : "Omitidos"}: {data.universe.omitted}{" "}
                  {scope === "portfolio" ? (
                    <>
                      · {en ? "Unpriced" : "Sin valoración positiva"}:{" "}
                      {data.universe.unpriced} ·{" "}
                      {en ? "Ineligible positions" : "Posiciones no elegibles"}:{" "}
                      {data.universe.excluded}
                    </>
                  ) : null}
                  .
                </p>
                {results.length ? (
                  <div className={styles.tableScroll}>
                    <table>
                      <thead>
                        <tr>
                          <th>{en ? "Holding" : "Posición"}</th>
                          {scope === "portfolio" ? (
                            <th>
                              {en
                                ? "Known portfolio weight"
                                : "Peso conocido en cartera"}
                            </th>
                          ) : null}
                          <th>{en ? "Headlines (7d)" : "Titulares (7d)"}</th>
                          <th>
                            {en
                              ? "Tone: positive / negative / mixed"
                              : "Tono: positivo / negativo / mixto"}
                          </th>
                          <th>{en ? "Classified" : "Clasificados"}</th>
                          <th>{en ? "News status" : "Estado de noticias"}</th>
                          <th>Stocktwits</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => (
                          <tr key={r.ticker}>
                            <th>
                              <button onClick={() => setSymbol(r.ticker)}>
                                {r.ticker}
                              </button>
                            </th>
                            {scope === "portfolio" ? (
                              <td>{pct(r.weight, en)}</td>
                            ) : null}
                            <td>{r.articles?.length || 0}</td>
                            <td>
                              {r.summary
                                ? `${r.summary.counts.positive} / ${r.summary.counts.negative} / ${r.summary.counts.mixed}`
                                : "—"}
                            </td>
                            <td>
                              {r.summary
                                ? `${r.summary.classified} / ${r.summary.total}`
                                : "—"}
                            </td>
                            <td>
                              <Status value={r.status} en={en} />
                            </td>
                            <td>
                              {r.stocktwits?.status === "available" ? (
                                `${fmt(r.stocktwits.data.sentiment, en, 0)} / 100`
                              ) : (
                                <Status value={r.stocktwits?.status} en={en} />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>
                    {scope === "watchlist"
                      ? en
                        ? "Use Follow company above to add companies to your browser watchlist."
                        : "Usa Seguir empresa para agregar empresas a tu seguimiento del navegador."
                      : en
                        ? "Add stock or ETF positions to your private portfolio to scan them here."
                        : "Agrega acciones o ETF a tu cartera privada para consultarlos aquí."}{" "}
                    <a href="/app">
                      {en ? "Open workspace" : "Abrir espacio privado"}
                    </a>
                  </p>
                )}
              </>
            ) : null}
          </>
        ) : null}
      </section>
      {data && scope !== "market" ? (
        <CrossSourcePanel
          key={`${scope}:${ticker}:${watchlist}`}
          ticker={ticker}
          scope={scope}
          watchlist={watchlist}
          en={en}
        />
      ) : null}
      {data ? (
        <section className={styles.panel}>
          <h2>{en ? "Latest headlines" : "Últimos titulares"}</h2>
          {articles.length ? (
            <ol className={styles.newsList}>
              {articles.map((a) => (
                <li key={a.url}>
                  <div className={styles.newsMeta}>
                    <span>{a.symbols.join(" · ") || "—"}</span>
                    <span data-tone={a.tone}>{toneLabel(a.tone, en)}</span>
                    <time dateTime={a.date}>
                      {a.datePrecision === "day"
                        ? a.date
                        : new Date(a.date).toLocaleString(
                            en ? "en-US" : "es-CL",
                          )}
                    </time>
                  </div>
                  <a href={a.url} target="_blank" rel="noreferrer">
                    {a.title}
                  </a>
                  <p>
                    {a.publisher} · {(a.providers || [a.provider]).join(" / ")}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p>
              {data.status === "unavailable" ? (
                <Status value={data.status} en={en} />
              ) : en ? (
                "No recent headlines match these filters. Missing coverage is not neutral sentiment."
              ) : (
                "No hay titulares recientes que coincidan con estos filtros. La ausencia de cobertura no significa sentimiento neutral."
              )}
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
