"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLanguagePreference } from "@/components/language-layer";
import styles from "@/components/mosaic-workspace.module.css";
import { buildWorldMonitorModel } from "@/lib/mosaic/world-monitor";

const COPY = {
  en: {
    back: "Decision workspace",
    title: "Global pressure monitor",
    subtitle: "Physical constraints, demand, liquidity, and the evidence behind every reading.",
    live: "Live snapshot",
    fallback: "Saved snapshot",
    refresh: "Refresh",
    refreshing: "Refreshing",
    global: "Global disequilibrium",
    change: "vs previous snapshot",
    conflict: "Signal conflict",
    coverage: "Markets covered",
    asOf: "Generated",
    marketMap: "Market map",
    ranked: "Ranked list",
    marketMapHelp: "Select a market to inspect its drivers, coverage, and sources.",
    pressure: "pressure",
    weak: "weak demand",
    neutral: "mixed",
    drivers: "Driver attribution",
    evidence: "Evidence coverage",
    sourceSeries: "Connected series",
    connectedLayers: "Connected layers",
    missingLayer: "Missing layer",
    nextConnector: "Next connector",
    researchAngle: "Research angle",
    caution: "Use with caution",
    quality: "Data quality",
    sourceHealth: "SourceHealth",
    sourceHealthTitle: "Source health",
    evidenceGaps: "Evidence gaps",
    nextActions: "Next actions",
    providers: "Providers",
    used: "used",
    monitored: "monitored",
    errors: "errors",
    warming: "warming",
    freshest: "Newest source",
    oldest: "Oldest used source",
    days: "days",
    noGap: "No material gap reported for this market.",
    regime: "Regime axes",
    supply: "Supply",
    demand: "Demand",
    liquidity: "Liquidity",
    tighter: "Tighter",
    looser: "Looser",
    stronger: "Stronger",
    weaker: "Weaker",
    macro: "Macro watch",
    theses: "Active theses",
    nextData: "Next data",
    confidence: "confidence",
    openAurora: "Open AURORA",
    stale: "The snapshot is stale. Market scoring is shown for audit only, not as a current signal.",
    auditOnly: "Audit only: this snapshot has no dated, identified, usable market evidence and is not a current signal.",
    error: "Live refresh failed. The last verified snapshot remains visible.",
    prev: "Previous",
    current: "Current",
    sources: "series",
    allRegions: "All regions",
    allSectors: "All sectors",
    allSignals: "All signals",
    pressureOnly: "Pressure",
    weakOnly: "Weak demand",
    movingOnly: "Changing now",
  },
  es: {
    back: "Espacio de decisión",
    title: "Monitor de presión global",
    subtitle: "Restricciones físicas, demanda, liquidez y la evidencia detrás de cada lectura.",
    live: "Foto en vivo",
    fallback: "Foto guardada",
    refresh: "Actualizar",
    refreshing: "Actualizando",
    global: "Desequilibrio global",
    change: "vs foto anterior",
    conflict: "Conflicto de señales",
    coverage: "Mercados cubiertos",
    asOf: "Generado",
    marketMap: "Mapa de mercados",
    ranked: "Lista ordenada",
    marketMapHelp: "Selecciona un mercado para revisar motores, cobertura y fuentes.",
    pressure: "presión",
    weak: "demanda floja",
    neutral: "mixto",
    drivers: "Atribución de motores",
    evidence: "Cobertura de evidencia",
    sourceSeries: "Series conectadas",
    connectedLayers: "Capas conectadas",
    missingLayer: "Capa faltante",
    nextConnector: "Próximo conector",
    researchAngle: "Ángulo de investigación",
    caution: "Usar con cautela",
    quality: "Calidad de datos",
    sourceHealth: "SourceHealth",
    sourceHealthTitle: "Salud de fuentes",
    evidenceGaps: "Brechas de evidencia",
    nextActions: "Próximas acciones",
    providers: "Proveedores",
    used: "usadas",
    monitored: "vigiladas",
    errors: "errores",
    warming: "en preparación",
    freshest: "Fuente más nueva",
    oldest: "Fuente usada más antigua",
    days: "días",
    noGap: "No se reporta una brecha material para este mercado.",
    regime: "Ejes de régimen",
    supply: "Oferta",
    demand: "Demanda",
    liquidity: "Liquidez",
    tighter: "Más estrecha",
    looser: "Más holgada",
    stronger: "Más fuerte",
    weaker: "Más débil",
    macro: "Vigilancia macro",
    theses: "Tesis activas",
    nextData: "Próximos datos",
    confidence: "confianza",
    openAurora: "Abrir AURORA",
    stale: "La foto está desactualizada. Los puntajes se muestran sólo para auditoría, no como señal vigente.",
    auditOnly: "Solo auditoría: esta foto no tiene evidencia de mercado fechada, identificada y utilizable; no es una señal vigente.",
    error: "Falló la actualización en vivo. La última foto verificada sigue visible.",
    prev: "Anterior",
    current: "Actual",
    sources: "series",
    allRegions: "Todas las regiones",
    allSectors: "Todos los sectores",
    allSignals: "Todas las señales",
    pressureOnly: "Presión",
    weakOnly: "Demanda débil",
    movingOnly: "Cambiando ahora",
  },
};

const DRIVER_LABELS = {
  price_acceleration: { en: "Price acceleration", es: "Aceleración de precios" },
  inventory_drawdown: { en: "Inventory drawdown", es: "Caída de inventarios" },
  delivery_stress: { en: "Delivery stress", es: "Estrés de entrega" },
  capacity_tightness: { en: "Capacity tightness", es: "Capacidad estrecha" },
  trade_stress: { en: "Trade stress", es: "Estrés comercial" },
  demand_slowdown: { en: "Demand slowdown", es: "Desaceleración de demanda" },
  inventory_buildup: { en: "Inventory buildup", es: "Acumulación de inventario" },
  margin_compression: { en: "Margin compression", es: "Compresión de márgenes" },
};

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function mosaicSnapshotTrust(snapshot) {
  const context = snapshot?.context || {};
  const contextMarkets = list(context.markets);
  const evidenceMarkets = contextMarkets.length ? contextMarkets : list(snapshot?.markets);
  const usableMarkets = evidenceMarkets.filter((market) => market?.freshness?.usable === true).length;
  const observedStates = [snapshot?.dataState, context.status, context.freshness?.status]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  const state = observedStates[0] || "unknown";
  const stateAllowsUse = observedStates.length > 0
    && observedStates.every((value) => ["current", "lagged", "mixed"].includes(value));
  const usable = snapshot?.live === true
    && context.freshness?.usable === true
    && usableMarkets > 0
    && stateAllowsUse;

  return { state, usableMarkets, usable, auditOnly: !usable };
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function signed(value) {
  const parsed = number(value);
  return `${parsed > 0 ? "+" : ""}${Math.round(parsed)}`;
}

function dateTime(value, language) {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.DateTimeFormat(language === "es" ? "es-CL" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function tone(score) {
  const value = number(score);
  if (value >= 55) return "hot";
  if (value >= 25) return "tight";
  if (value <= -25) return "loose";
  return "mixed";
}

function toneLabel(score, copy) {
  const value = number(score);
  if (value >= 25) return copy.pressure;
  if (value <= -25) return copy.weak;
  return copy.neutral;
}

function driverLabel(id, language) {
  return DRIVER_LABELS[id]?.[language] || String(id || "").replaceAll("_", " ");
}

function SnapshotLine({ current, delta, copy }) {
  const previous = number(current) - number(delta);
  const low = Math.min(previous, number(current), -5);
  const high = Math.max(previous, number(current), 5);
  const scale = (value) => 7 + ((value - low) / Math.max(1, high - low)) * 46;
  const y1 = 58 - scale(previous);
  const y2 = 58 - scale(number(current));

  return (
    <svg className={styles.snapshotLine} viewBox="0 0 100 58" role="img" aria-label={`${copy.prev} ${Math.round(previous)}, ${copy.current} ${Math.round(number(current))}`}>
      <line x1="7" x2="93" y1="51" y2="51" />
      <path d={`M 12 ${y1} L 88 ${y2}`} />
      <circle cx="12" cy={y1} r="3" />
      <circle cx="88" cy={y2} r="4" />
    </svg>
  );
}

function Axis({ label, value, positive, negative }) {
  const parsed = Math.max(-100, Math.min(100, number(value)));
  const width = `${Math.abs(parsed) / 2}%`;
  return (
    <div className={styles.axis}>
      <div className={styles.axisHead}>
        <span>{label}</span>
        <strong>{signed(parsed)}</strong>
      </div>
      <div className={styles.axisTrack}>
        <i data-side={parsed >= 0 ? "positive" : "negative"} style={{ "--axis-width": width }} />
      </div>
      <div className={styles.axisEnds}><span>{negative}</span><span>{positive}</span></div>
    </div>
  );
}

function WorldMap({ markets, onSelect, selectedId }) {
  return (
    <div className={styles.worldMap} aria-label="World pressure map">
      <svg aria-hidden="true" preserveAspectRatio="xMidYMid meet" viewBox="0 0 1000 520">
        <g className={styles.graticule}>
          {[100, 200, 300, 400].map((y) => <line key={`y-${y}`} x1="0" x2="1000" y1={y} y2={y} />)}
          {[125, 250, 375, 500, 625, 750, 875].map((x) => <line key={`x-${x}`} x1={x} x2={x} y1="0" y2="520" />)}
        </g>
        <g className={styles.continents}>
          <path d="M72 103 L139 60 226 76 292 127 262 177 209 188 181 242 139 214 94 162Z" />
          <path d="M234 255 L287 280 315 345 289 456 252 415 229 323Z" />
          <path d="M430 104 L496 83 548 115 533 157 477 164 444 143Z" />
          <path d="M464 178 L542 168 580 231 551 361 501 395 470 315 438 232Z" />
          <path d="M544 102 L659 69 811 91 915 148 878 207 778 221 719 183 645 230 571 189Z" />
          <path d="M792 330 L865 311 925 354 902 410 827 420 776 382Z" />
        </g>
      </svg>
      <div className={styles.mapNodes}>
        {markets.map((market) => (
          <button
            aria-label={`${market.name}: ${signed(market.score)}, ${market.trend}`}
            aria-pressed={selectedId === market.id}
            className={styles.mapNode}
            data-market-id={market.id}
            data-tone={tone(market.score)}
            data-trend={market.trend}
            key={market.id}
            onClick={() => onSelect(market.id)}
            style={{ left: `${market.x}%`, top: `${market.y}%` }}
            type="button"
          >
            <i />
            <span>{market.name}</span>
            <strong>{signed(market.score)}</strong>
            <em>{market.trend === "rising" ? "↗" : market.trend === "falling" ? "↘" : "→"}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function MarketHeatmap({ copy, markets, onSelect, selectedId, view }) {
  if (view === "ranked") {
    return (
      <div className={styles.rankedMarkets} aria-label="MOSAIC market heatmap">
        {markets.map((market, index) => (
          <button
            aria-pressed={selectedId === market.id}
            className={styles.rankedMarket}
            data-market-id={market.id}
            data-tone={tone(market.score)}
            key={market.id}
            onClick={() => onSelect(market.id)}
            type="button"
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{market.name}</strong><small>{market.region} · {market.sector}</small></div>
            <em>{market.reading}</em>
            <b>{signed(market.score)}</b>
          </button>
        ))}
      </div>
    );
  }

  return <WorldMap markets={markets} onSelect={onSelect} selectedId={selectedId} />;
}

function MarketInspector({ copy, language, market }) {
  const inspectorRef = useRef(null);
  const drivers = list(market?.drivers).slice(0, 8);
  const maxDriver = Math.max(1, ...drivers.map((item) => Math.abs(number(item.value))));

  useEffect(() => {
    if (!inspectorRef.current) return;
    inspectorRef.current.animate(
      [{ opacity: 0.35, transform: "translateX(12px)" }, { opacity: 1, transform: "translateX(0)" }],
      { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  }, [market?.id]);

  if (!market) return null;

  return (
    <aside className={styles.inspector} ref={inspectorRef} aria-live="polite">
      <div className={styles.inspectorHead}>
        <div>
          <span>{market.region} · {market.sector}</span>
          <h2>{market.name}</h2>
          <p>{market.why}</p>
        </div>
        <div className={styles.inspectorScore} data-tone={tone(market.score)}>
          <strong>{signed(market.score)}</strong>
          <span>{market.reading}</span>
        </div>
      </div>

      <div className={styles.inspectorMeta}>
        <span><b>{Math.round(number(market.quality))}</b>{copy.quality}</span>
        <span><b>{market.sources || 0}</b>{copy.sources}</span>
        <span><b>{signed(market.delta)}</b>{copy.change}</span>
      </div>

      {market.useWithCaution ? <p className={styles.caution}>{copy.caution}: {market.dataNote}</p> : null}

      <section className={styles.inspectorSection}>
        <div className={styles.sectionLabel}><span>01</span><h3>{copy.drivers}</h3></div>
        <div className={styles.drivers}>
          {drivers.map((driver) => (
            <div className={styles.driver} data-direction={number(driver.value) >= 0 ? "positive" : "negative"} key={driver.id}>
              <div><span>{driverLabel(driver.id, language)}</span><strong>{signed(driver.value)}</strong></div>
              <i><b style={{ "--driver-width": `${Math.abs(number(driver.value)) / maxDriver * 100}%` }} /></i>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.inspectorSection}>
        <div className={styles.sectionLabel}><span>02</span><h3>{copy.evidence}</h3></div>
        <dl className={styles.evidenceList}>
          <div><dt>{copy.sourceSeries}</dt><dd>{list(market.sourceIds).length}</dd></div>
          <div><dt>{copy.connectedLayers}</dt><dd>{list(market.coverage?.connectedLayers).join(" · ") || "—"}</dd></div>
          <div><dt>{copy.missingLayer}</dt><dd>{market.coverage?.missingLayer || copy.noGap}</dd></div>
          {market.coverage?.nextConnector ? <div><dt>{copy.nextConnector}</dt><dd>{market.coverage.nextConnector}</dd></div> : null}
        </dl>
        <details className={styles.seriesDisclosure}>
          <summary>{copy.sourceSeries} · {list(market.sourceIds).length}</summary>
          <div>{list(market.sourceIds).map((id) => <code key={id}>{id}</code>)}</div>
        </details>
      </section>

      {market.researchAngle ? (
        <section className={styles.researchAngle}>
          <span>{copy.researchAngle}</span>
          <p>{market.researchAngle}</p>
        </section>
      ) : null}
    </aside>
  );
}

function SourceHealth({ copy, snapshot }) {
  const health = snapshot?.sourceHealth || {};
  const providers = list(snapshot?.providers);
  return (
    <section className={styles.lowerPanel}>
      <div className={styles.lowerHead}>
        <div><span>{copy.sourceHealth}</span><h2>{copy.sourceHealthTitle}</h2></div>
        <strong data-ok={number(health.error) === 0}>{number(health.error) === 0 ? "OK" : `${health.error} ${copy.errors}`}</strong>
      </div>
      <div className={styles.healthStrip}>
        <span><b>{health.used || 0}</b>{copy.used}</span>
        <span><b>{health.watched || 0}</b>{copy.monitored}</span>
        <span><b>{health.watchedWarming || 0}</b>{copy.warming}</span>
        <span><b>{health.watchedError || 0}</b>{copy.errors}</span>
      </div>
      <div className={styles.providerList}>
        {providers.map((provider) => (
          <div key={provider.name}>
            <span className={styles.providerDot} data-active={provider.used > 0} />
            <div><strong>{provider.name}</strong><small>{provider.kind || copy.providers}</small></div>
            <span>{provider.used} {copy.sources}</span>
            <time>{provider.latest || "—"}</time>
          </div>
        ))}
      </div>
      <div className={styles.freshnessRow}>
        <span>{copy.freshest}<b>{health.newestDate || "—"}</b></span>
        <span>{copy.oldest}<b>{health.oldestAgeDays ?? "—"} {copy.days}</b></span>
      </div>
    </section>
  );
}

function GapsAndActions({ copy, snapshot }) {
  const gaps = list(snapshot?.gaps);
  const actions = list(snapshot?.actions);
  return (
    <section className={styles.lowerPanel}>
      <div className={styles.lowerHead}><div><span>Evidence</span><h2>{copy.evidenceGaps}</h2></div><strong>{gaps.length}</strong></div>
      <div className={styles.gapList}>
        {gaps.map((gap) => (
          <article key={`${gap.market}-${gap.missing}`}>
            <div><strong>{gap.market}</strong><span>{signed(gap.score)}</span></div>
            <p>{gap.missing}</p>
            {gap.nextConnector ? <small>{copy.nextConnector}: {gap.nextConnector}</small> : null}
          </article>
        ))}
      </div>
      <div className={styles.actionHead}><span>{copy.nextActions}</span></div>
      <div className={styles.actionList}>
        {actions.map((action, index) => (
          <article data-priority={action.priority} key={`${action.kind}-${action.marketId}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{action.title}</strong><p>{action.reason}</p></div>
            <em>{action.kind}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function MacroWatch({ copy, macro }) {
  const theses = list(macro?.theses).slice(0, 3);
  const checks = list(macro?.nextChecks).slice(0, 4);
  return (
    <section className={styles.macroWatch}>
      <div className={styles.macroWatchIntro}>
        <span>{copy.macro}</span>
        <h2>{macro?.shortRead || "—"}</h2>
        <p>{macro?.liquidity?.summary || macro?.stability?.read || ""}</p>
      </div>
      <div className={styles.macroColumn}>
        <h3>{copy.theses}</h3>
        {theses.map((thesis) => (
          <article key={thesis.id}><div><strong>{thesis.title}</strong><span>{Math.round(number(thesis.confidence))}% {copy.confidence}</span></div><p>{thesis.canBreak || thesis.why}</p></article>
        ))}
      </div>
      <div className={styles.macroColumn}>
        <h3>{copy.nextData}</h3>
        {checks.map((check) => <article key={`${check.event}-${check.timing}`}><div><strong>{check.event}</strong><span>{check.timing}</span></div></article>)}
      </div>
    </section>
  );
}

export default function MosaicWorkspace({ initialMacro, initialSnapshot, workspaceName }) {
  const { language } = useLanguagePreference();
  const copy = COPY[language] || COPY.es;
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [macro, setMacro] = useState(initialMacro);
  const [selectedId, setSelectedId] = useState(initialSnapshot?.markets?.[0]?.id || "");
  const [view, setView] = useState("map");
  const [regionFilter, setRegionFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [signalFilter, setSignalFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const allMarkets = useMemo(() => list(snapshot?.markets).slice().sort((left, right) => Math.abs(number(right.score)) - Math.abs(number(left.score))), [snapshot]);
  const monitorModel = useMemo(() => buildWorldMonitorModel(allMarkets, {
    region: regionFilter,
    sector: sectorFilter,
    signal: signalFilter,
  }), [allMarkets, regionFilter, sectorFilter, signalFilter]);
  const markets = monitorModel.markets;
  const selectedMarket = allMarkets.find((market) => market.id === selectedId) || markets[0] || allMarkets[0] || null;
  const axes = snapshot?.context?.axes || {};
  const history = snapshot?.historyDelta || {};
  const snapshotTrust = useMemo(() => mosaicSnapshotTrust(snapshot), [snapshot]);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [mosaicResponse, macroResponse] = await Promise.all([
        fetch(`/api/mosaic?ts=${Date.now()}`, { cache: "no-store" }),
        fetch(`/api/macro-brain?ts=${Date.now()}`, { cache: "no-store" }),
      ]);
      if (!mosaicResponse.ok || !macroResponse.ok) throw new Error("Live refresh failed");
      const [mosaicPayload, macroPayload] = await Promise.all([mosaicResponse.json(), macroResponse.json()]);
      setSnapshot(mosaicPayload);
      setMacro(macroPayload);
      setSelectedId((current) => list(mosaicPayload?.markets).some((item) => item.id === current) ? current : mosaicPayload?.markets?.[0]?.id || "");
    } catch {
      setError(copy.error);
    } finally {
      setLoading(false);
    }
  }, [copy.error]);

  useEffect(() => {
    const interval = window.setInterval(() => void refresh({ silent: true }), 120000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brandBlock}>
          <Link className={styles.brand} href="/app"><span>B</span><strong>BLS Prime</strong></Link>
          <i />
          <div><strong>MOSAIC</strong><span>{workspaceName}</span></div>
        </div>
        <nav aria-label="MOSAIC navigation">
          <Link href="/app">← {copy.back}</Link>
          <Link href="/aurora">{copy.openAurora}</Link>
          <button disabled={loading} onClick={() => refresh()} type="button"><span className={styles.refreshDot} />{loading ? copy.refreshing : copy.refresh}</button>
        </nav>
      </header>

      <section className={styles.commandHeader}>
        <div><span className={styles.eyebrow}>MOSAIC / GLOBAL OBSERVATORY</span><h1>{copy.title}</h1><p>{copy.subtitle}</p></div>
        <div className={styles.liveState} data-live={snapshotTrust.usable}><span />{snapshotTrust.usable ? copy.live : copy.fallback}</div>
      </section>

      {snapshotTrust.auditOnly ? <p className={styles.statusWarning} data-testid="mosaic-audit-only-warning">{copy.auditOnly}</p> : null}
      {error ? <p className={styles.statusWarning}>{error}</p> : null}

      <section className={styles.regimeStrip}>
        <article className={styles.gdiMetric}>
          <span>{copy.global}</span>
          <div><strong>{Math.round(number(snapshot?.index))}</strong><SnapshotLine copy={copy} current={history.current ?? snapshot?.index} delta={history.delta} /></div>
          <small><b>{signed(history.delta)}</b> {copy.change}</small>
        </article>
        <article><span>{copy.conflict}</span><strong>{Math.round(number(snapshot?.conflict))}</strong><i><b style={{ "--metric-width": `${Math.max(0, Math.min(100, number(snapshot?.conflict)))}%` }} /></i></article>
        <article><span>{copy.coverage}</span><strong>{allMarkets.length}<small>/ 9</small></strong><i><b style={{ "--metric-width": `${allMarkets.length / 9 * 100}%` }} /></i></article>
        <article><span>{copy.asOf}</span><time>{dateTime(snapshot?.generatedAt, language)}</time><small>{snapshot?.sourceHealth?.newestDate || "—"}</small></article>
      </section>

      <section className={styles.workspaceGrid}>
        <div className={styles.primarySurface}>
          <div className={styles.surfaceHead}>
            <div><span>01 / MARKET PRESSURE</span><h2>{copy.marketMap}</h2><p>{copy.marketMapHelp}</p></div>
            <div className={styles.viewSwitch}>
              <button aria-pressed={view === "map"} data-testid="mosaic-view-map" onClick={() => setView("map")} type="button">▦ {copy.marketMap}</button>
              <button aria-pressed={view === "ranked"} data-testid="mosaic-view-ranked" onClick={() => setView("ranked")} type="button">≡ {copy.ranked}</button>
            </div>
          </div>
          <div className={styles.monitorFilters} aria-label="MOSAIC filters">
            <select data-testid="mosaic-region-filter" onChange={(event) => setRegionFilter(event.target.value)} value={regionFilter}>
              <option value="all">{copy.allRegions}</option>
              {monitorModel.regions.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>
            <select onChange={(event) => setSectorFilter(event.target.value)} value={sectorFilter}>
              <option value="all">{copy.allSectors}</option>
              {monitorModel.sectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
            </select>
            <select onChange={(event) => setSignalFilter(event.target.value)} value={signalFilter}>
              <option value="all">{copy.allSignals}</option>
              <option value="pressure">{copy.pressureOnly}</option>
              <option value="weak">{copy.weakOnly}</option>
              <option value="moving">{copy.movingOnly}</option>
            </select>
            <span>{markets.length} / {monitorModel.total}</span>
          </div>
          <MarketHeatmap copy={copy} markets={markets} onSelect={setSelectedId} selectedId={selectedMarket?.id} view={view} />

          <div className={styles.movers}>
            <div className={styles.moversHead}><span>02 / SNAPSHOT MOVERS</span><strong>{copy.change}</strong></div>
            <div className={styles.moverGrid}>
              {list(snapshot?.movers).slice(0, 4).map((mover) => (
                <button key={mover.marketId} onClick={() => setSelectedId(mover.marketId)} type="button">
                  <div><span>{mover.name}</span><strong>{signed(mover.delta)}</strong></div>
                  <SnapshotLine copy={copy} current={mover.score} delta={mover.delta} />
                  <small>{mover.reading}</small>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.regimeAxes}>
            <div className={styles.moversHead}><span>03 / {copy.regime.toUpperCase()}</span><strong>{Math.round(number(snapshot?.context?.confidence) * 100)}% {copy.confidence}</strong></div>
            <Axis label={copy.supply} value={axes.supply} negative={copy.looser} positive={copy.tighter} />
            <Axis label={copy.demand} value={axes.demand} negative={copy.weaker} positive={copy.stronger} />
            <Axis label={copy.liquidity} value={axes.liquidity} negative={copy.weaker} positive={copy.stronger} />
          </div>
        </div>

        <MarketInspector copy={copy} language={language} market={selectedMarket} />
      </section>

      <section className={styles.lowerGrid}>
        <SourceHealth copy={copy} snapshot={snapshot} />
        <GapsAndActions copy={copy} snapshot={snapshot} />
      </section>

      <MacroWatch copy={copy} macro={macro} />

      <footer className={styles.footer}>
        <span>MOSAIC · {snapshot?.context?.version || "mosaic_context_v2"}</span>
        <p>Research only. Verify material signals against primary sources before acting.</p>
        <Link href="/terms">Method & terms →</Link>
      </footer>
    </main>
  );
}
