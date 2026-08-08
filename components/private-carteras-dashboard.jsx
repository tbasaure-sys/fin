"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./private-carteras-dashboard.module.css";

const DONUT_COLORS = ["#77c9bd", "#80b9e5", "#e2b071", "#b8a4d8", "#738799", "#d87d83"];

function metricValue(metric) {
  return metric && Number.isFinite(Number(metric.value)) ? Number(metric.value) : null;
}
function formatMoney(value, currency) {
  if (!Number.isFinite(Number(value))) return "N/D";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
}

function formatPct(value) {
  if (!Number.isFinite(Number(value))) return "N/D";
  return `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(1).replace(".", ",")} %`;
}

function allocationGradient(allocation = []) {
  let cursor = 0;
  const stops = allocation.map((item, index) => {
    const start = cursor * 100;
    cursor += Number(item.weight) || 0;
    return `${DONUT_COLORS[index % DONUT_COLORS.length]} ${start.toFixed(2)}% ${(cursor * 100).toFixed(2)}%`;
  });
  return `conic-gradient(${stops.join(", ") || "#344453 0 100%"})`;
}

function Sparkline({ series = [] }) {
  const points = series.map((point) => Number(point.value)).filter(Number.isFinite);
  if (points.length < 2) return <div className={styles.sparklineEmpty}>Historial en construcción</div>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const path = points.map((point, index) => {
    const x = (index / (points.length - 1)) * 100;
    const y = 30 - ((point - min) / range) * 25;
    return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  return <svg className={styles.sparkline} viewBox="0 0 100 32" role="img" aria-label="Trayectoria de rendimiento"><path d={path} /></svg>;
}

function PortfolioPanel({ panel, currency }) {
  const value = metricValue(panel.value);
  const pnl = metricValue(panel.total_pnl);
  const ytd = metricValue(panel.ytd);
  const oneDay = metricValue(panel.one_day);
  return (
    <article className={styles.portfolioCard} aria-label={panel.name}>
      <div className={styles.cardHeader}>
        <div><span className={styles.eyebrow}>Cartera</span><h2>{panel.name}</h2></div>
        <span className={styles.dataState}>{panel.stale ? "Último dato" : "Actualizado"}</span>
      </div>
      <div className={styles.value}>{formatMoney(value, currency)}</div>
      <div className={styles.allocationRow}>
        <div className={styles.donut} style={{ background: allocationGradient(panel.allocation) }} aria-label={`Composición de ${panel.name}`}><span>{panel.positions_count || 0}<small>posiciones</small></span></div>
        <div className={styles.legend}>{(panel.allocation || []).slice(0, 5).map((item, index) => <div className={styles.legendItem} key={`${panel.key}-${item.ticker}`}><i style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} /> <span>{item.ticker}</span><strong>{Math.round((Number(item.weight) || 0) * 100)}%</strong></div>)}</div>
      </div>
      <div className={styles.metrics}>
        <div><span>P&amp;L total</span><strong className={pnl >= 0 ? styles.positive : styles.negative}>{formatMoney(pnl, currency)}</strong><small>bróker</small></div>
        <div><span>YTD</span><strong className={ytd >= 0 ? styles.positive : styles.negative}>{formatPct(ytd)}</strong><small>bróker</small></div>
        <div><span>1D</span><strong>{formatPct(oneDay)}</strong><small>parcial</small></div>
      </div>
      <div className={styles.chartHeader}><span>Trayectoria</span><span>Benchmark: {panel.benchmark || "SPY"}</span></div>
      <Sparkline series={panel.series} />
    </article>
  );
}

function riskScore(cell, lens) {
  if (!cell) return null;
  if (lens === "normal") return Number(cell.normal_correlation);
  if (lens === "stress") return Number(cell.stress_correlation);
  return Number(cell.value);
}

function cellTone(value) {
  if (!Number.isFinite(value)) return styles.riskEmpty;
  if (value >= .7) return styles.riskHigh;
  if (value >= .45) return styles.riskMedium;
  return styles.riskLow;
}

function findRiskCell(cells, left, right) {
  return (cells || []).find((cell) => (cell.left === left && cell.right === right) || (cell.left === right && cell.right === left));
}

function RiskMatrix({ risk }) {
  const [lens, setLens] = useState("scenario");
  const positions = risk?.positions || [];
  const label = lens === "scenario" ? "Riesgo por escenario" : lens === "normal" ? "Correlación normal" : "Correlación en estrés";
  return (
    <section className={styles.riskPanel} aria-labelledby="shared-risk-title">
      <div className={styles.sectionHeader}>
        <div><span className={styles.eyebrow}>Estructura de diversificación</span><h2 id="shared-risk-title">Riesgos compartidos</h2><p>Qué posiciones tenderían a moverse juntas si ocurre el escenario elegido.</p></div>
        <span className={styles.sourcePill}>{risk?.scenario || "Escenario"}</span>
      </div>
      <div className={styles.riskTabs} role="tablist" aria-label="Lente de riesgo">
        {[['scenario', 'Riesgo por escenario'], ['normal', 'Correlación normal'], ['stress', 'Correlación en estrés']].map(([key, text]) => <button type="button" key={key} role="tab" aria-selected={lens === key} className={lens === key ? styles.activeTab : ""} onClick={() => setLens(key)}>{text}</button>)}
      </div>
      <div className={styles.matrixWrap}>
        <table className={styles.matrix} aria-label={label}>
          <thead><tr><th>Posición</th>{positions.map((position) => <th key={position}>{position}</th>)}</tr></thead>
          <tbody>{positions.map((left) => <tr key={left}><th>{left}</th>{positions.map((right) => {
            if (left === right) return <td key={right} className={styles.diagonal}>—</td>;
            const value = riskScore(findRiskCell(risk?.cells, left, right), lens);
            return <td key={right} className={cellTone(value)}>{Number.isFinite(value) ? value.toFixed(2) : "N/D"}</td>;
          })}</tr>)}</tbody>
        </table>
      </div>
      <div className={styles.riskLegend}><span><i className={styles.legendLow} />Baja</span><span><i className={styles.legendMedium} />Media</span><span><i className={styles.legendHigh} />Alta</span><small>{label} no es una predicción ni una probabilidad.</small></div>
    </section>
  );
}

export default function PrivateCarterasDashboard({ initialData, user }) {
  const [currency, setCurrency] = useState("USD");
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currency === "USD") return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/carteras/dashboard?currency=${currency}`, { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("dashboard unavailable")))
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currency]);

  const total = useMemo(() => (data?.dashboard?.portfolios || []).reduce((sum, panel) => sum + (metricValue(panel.value) || 0), 0), [data]);
  const portfolios = data?.dashboard?.portfolios || [];
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div><span className={styles.eyebrow}>BLS Prime · privado</span><h1>Carteras</h1><p>IGMAR, MOM y YO en una sola lectura.</p></div>
        <div className={styles.topActions}><span>{user?.name || "Sesión privada"}</span><a href="/app">Volver al workspace</a></div>
      </header>
      <div className={styles.controls}>
        <span>Valor agregado: <strong>{formatMoney(total, currency)}</strong></span>
        <div className={styles.currency}><span>Moneda</span>{["USD", "CLP"].map((item) => <button type="button" key={item} className={currency === item ? styles.activeCurrency : ""} onClick={() => setCurrency(item)}>{item}</button>)}</div>
      </div>
      {loading ? <div className={styles.loading}>Actualizando conversión…</div> : null}
      <section className={styles.portfolioGrid}>{portfolios.map((panel) => <PortfolioPanel key={panel.key || panel.name} panel={panel} currency={currency} />)}</section>
      <RiskMatrix risk={data?.risk} />
      <footer className={styles.footer}><span>Fuente: {data?.source === "api" ? "Carteras API" : "último estado disponible"} · datos con fecha y procedencia.</span><span>Sin órdenes de inversión ni ejecución.</span></footer>
    </main>
  );
}
