"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  PORTFOLIO_RANGES,
  actionTone,
  capitalize,
  filterPortfolioSeries,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPct,
  renderInlineItem,
  formatSignedPct,
  formatSize,
  parseDisplayPercent,
  responseTone,
  safeList,
  statusTone,
} from "@/components/workspace/formatters";
import { parseResponse, useWorkspaceLiveData } from "@/components/workspace/live-data";
import styles from "@/components/workspace/shell.module.css";
import PortfolioChat from "@/components/portfolio-chat";
import EquityResearchPanel from "@/components/equity-research-panel";
import { macroBrainSnapshot } from "@/lib/macro-brain-snapshot";

const RAW_APP_NAME = process.env.NEXT_PUBLIC_BLS_APP_NAME || "BLS Prime";
const DEFAULT_APP_NAME = /allocator workspace/i.test(RAW_APP_NAME) ? "BLS Prime" : RAW_APP_NAME;
const WORKSPACE_NAV = [
  {
    id: "today",
    href: "#today",
    label: "Resumen hoy",
    priority: "Inicio",
    detail: "Lectura y acción",
    title: "¿Qué hago hoy?",
    body: "La lectura en vivo y el movimiento que merece atención ahora.",
  },
  {
    id: "risk",
    href: "#risk",
    label: "Mi mayor riesgo",
    priority: "Auditar",
    detail: "Portafolio y solapamiento",
    title: "¿Qué domina mi portafolio?",
    body: "Rendimiento, concentración y diversificación real bajo estrés.",
  },
  {
    id: "candidates",
    href: "#candidates",
    label: "Candidatos",
    priority: "Explorar",
    detail: "Filtros e investigación",
    title: "¿Qué vale la pena considerar?",
    body: "Candidatos filtrados, investigación de compañía y señales macro.",
  },
  {
    id: "decisions",
    href: "#decisions",
    label: "Decisiones",
    priority: "Registrar",
    detail: "Historial y pendientes",
    title: "¿Qué he decidido y por qué?",
    body: "Acciones preparadas y decisiones registradas.",
  },
];

const WORKSPACE_NAV_ADVANCED = [
  {
    id: "holdings",
    href: "#holdings",
    label: "Posiciones",
    priority: "Actualizar",
    detail: "Tabla de posiciones",
    title: "Posiciones y edición directa",
    body: "Revisa, agrega y edita posiciones conectadas al espacio.",
  },
];

const ALL_NAV_IDS = [...WORKSPACE_NAV, ...WORKSPACE_NAV_ADVANCED].map((item) => item.id);

const LEGACY_HASH_REDIRECT = {
  cashflow: "today",
  money: "today",
  portfolio: "risk",
  diversification: "risk",
  research: "candidates",
  factorlab: "candidates",
  macrobrain: "candidates",
};

function ToneBadge({ tone = "neutral", children }) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {children}
    </span>
  );
}

function MetricTile({ label, value, detail, tone = "neutral" }) {
  const displayValue = value === null || value === undefined || value === "" ? "-" : value;
  return (
    <article className={styles.metricTile} data-tone={tone}>
      <span>{label}</span>
      <strong>{displayValue}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function InlineList({ items, emptyLabel }) {
  const values = safeList(items);
  if (!values.length) return <p className={styles.emptyCopy}>{emptyLabel}</p>;

  return (
    <ul className={styles.inlineList}>
      {values.map((item, index) => (
        <li key={`${renderInlineItem(item)}-${index}`}>{renderInlineItem(item)}</li>
      ))}
    </ul>
  );
}

function RangeTabs({ value, onChange }) {
  return (
    <div className={styles.rangeTabs} role="tablist" aria-label="Rango de cartera">
      {PORTFOLIO_RANGES.map((option) => (
        <button
          key={option}
          className={styles.rangeButton}
          role="tab"
          aria-selected={value === option}
          data-active={value === option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function PortfolioChart({ series, benchmarkSymbol }) {
  const width = 680;
  const height = 260;
  const paddingLeft = 48;
  const paddingRight = 36;
  const paddingTop = 20;
  const paddingBottom = 34;
  const rows = safeList(series)
    .map((row, index) => {
      const parsedDate = row?.date ? new Date(row.date) : null;
      return {
        id: `${row?.date || "point"}-${index}`,
        date: row.date,
        timestamp: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getTime() : null,
        portfolio: Number(row.portfolio),
        benchmark: Number(row.benchmark),
      };
    })
    .filter((row) => Number.isFinite(row.portfolio) || Number.isFinite(row.benchmark));

  const portfolioPoints = rows.filter((row) => Number.isFinite(row.portfolio));
  const benchmarkPoints = rows.filter((row) => Number.isFinite(row.benchmark));

  if (portfolioPoints.length < 2 && benchmarkPoints.length < 2) {
    return (
      <div className={styles.chartEmptyState}>
        <strong>La trayectoria del portafolio aparecerá aquí</strong>
        <p>Se necesitan fotos guardadas antes de dibujar rendimiento, diferencia contra referencia y dirección de tendencia.</p>
      </div>
    );
  }

  const normalizeSeries = (points, key) => {
    const first = Number(points[0]?.[key]);
    if (!Number.isFinite(first) || first <= 0) return [];
    return points.map((point) => ({
      ...point,
      display: (Number(point[key]) / first) - 1,
    }));
  };

  const normalizedPortfolio = normalizeSeries(portfolioPoints, "portfolio");
  const normalizedBenchmark = normalizeSeries(benchmarkPoints, "benchmark");
  const values = [...normalizedPortfolio, ...normalizedBenchmark].map((point) => point.display).filter(Number.isFinite);
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 0);
  const valuePadding = Math.max((rawMax - rawMin) * 0.14, 0.04);
  const min = rawMin - valuePadding;
  const max = rawMax + valuePadding;
  const safeRange = max - min || 1;
  const chartTimestamps = rows.map((row, index) => row.timestamp ?? index);
  const minTimestamp = Math.min(...chartTimestamps);
  const maxTimestamp = Math.max(...chartTimestamps);
  const safeTimeRange = maxTimestamp - minTimestamp || 1;
  const baseLineValue = min <= 0 && max >= 0 ? 0 : null;
  const chartBottom = height - paddingBottom;
  const chartTop = paddingTop;
  const chartLeft = paddingLeft;
  const chartRight = width - paddingRight;

  const pointX = (point, fallbackIndex) => {
    const timestamp = point.timestamp ?? fallbackIndex;
    return chartLeft + (((timestamp - minTimestamp) / safeTimeRange) * (chartRight - chartLeft));
  };

  const pointY = (value) => chartBottom - (((value - min) / safeRange) * (chartBottom - chartTop));

  const buildPath = (points) => points
    .map((point, index) => {
      const x = pointX(point, index);
      const y = pointY(point.display);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const portfolioPath = normalizedPortfolio.length >= 2 ? buildPath(normalizedPortfolio) : "";
  const benchmarkPath = normalizedBenchmark.length >= 2 ? buildPath(normalizedBenchmark) : "";
  const latest = normalizedPortfolio[normalizedPortfolio.length - 1];
  const firstPortfolio = normalizedPortfolio[0];
  const latestX = latest ? pointX(latest, portfolioPoints.length - 1) : null;
  const latestY = latest ? pointY(latest.display) : null;
  const hasBenchmark = normalizedBenchmark.length >= 2;
  const firstBenchmark = normalizedBenchmark[0] || null;
  const latestBenchmark = normalizedBenchmark[normalizedBenchmark.length - 1] || null;
  const portfolioChange = latest && firstPortfolio ? latest.display - firstPortfolio.display : null;
  const benchmarkChange = latestBenchmark && firstBenchmark ? latestBenchmark.display - firstBenchmark.display : null;
  const startLabel = rows[0]?.date ? formatDate(rows[0].date) : "";
  const endLabel = rows[rows.length - 1]?.date ? formatDate(rows[rows.length - 1].date) : "";
  const baseLineY = baseLineValue === null ? null : pointY(baseLineValue);
  const firstX = normalizedPortfolio[0] ? pointX(normalizedPortfolio[0], 0) : chartLeft;
  const lastX = latest ? pointX(latest, portfolioPoints.length - 1) : chartRight;
  const areaPath = portfolioPath
    ? `${portfolioPath} L ${lastX.toFixed(1)} ${chartBottom.toFixed(1)} L ${firstX.toFixed(1)} ${chartBottom.toFixed(1)} Z`
    : "";
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => min + (safeRange * ratio));
  const verticalGuides = [0, 0.5, 1].map((ratio) => chartLeft + ((chartRight - chartLeft) * ratio));
  const chartValueLabel = (value) => formatSignedPct(value, Math.abs(value) >= 1 ? 0 : 1);
  const benchmarkEndX = latestBenchmark ? pointX(latestBenchmark, normalizedBenchmark.length - 1) : null;
  const benchmarkEndY = latestBenchmark ? pointY(latestBenchmark.display) : null;

  return (
    <div className={styles.chartBlock}>
      <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Rendimiento del portafolio">
        <defs>
          <linearGradient id="workspaceChartLine" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="rgba(248, 200, 111, 0.95)" />
            <stop offset="100%" stopColor="rgba(122, 210, 194, 0.95)" />
          </linearGradient>
          <linearGradient id="workspaceChartArea" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(122, 210, 194, 0.22)" />
            <stop offset="100%" stopColor="rgba(122, 210, 194, 0)" />
          </linearGradient>
        </defs>
        <rect className={styles.chartPlot} x={chartLeft} y={chartTop} width={chartRight - chartLeft} height={chartBottom - chartTop} rx="10" />
        {gridValues.map((value) => {
          const y = pointY(value);
          return (
            <g key={`grid-${value.toFixed(4)}`}>
              <path className={styles.chartGrid} d={`M ${chartLeft} ${y.toFixed(1)} L ${chartRight} ${y.toFixed(1)}`} />
              <text className={styles.chartAxisLabel} x={chartLeft - 10} y={y + 4} textAnchor="end">
                {chartValueLabel(value)}
              </text>
            </g>
          );
        })}
        {verticalGuides.map((x) => (
          <path className={styles.chartGridVertical} d={`M ${x.toFixed(1)} ${chartTop} L ${x.toFixed(1)} ${chartBottom}`} key={`v-${x.toFixed(1)}`} />
        ))}
        {baseLineY !== null ? <path className={styles.chartReference} d={`M ${chartLeft} ${baseLineY.toFixed(1)} L ${chartRight} ${baseLineY.toFixed(1)}`} /> : null}
        {areaPath ? <path className={styles.chartArea} d={areaPath} /> : null}
        {hasBenchmark ? <path className={styles.chartBenchmark} d={benchmarkPath} /> : null}
        {portfolioPath ? <path className={styles.chartLine} d={portfolioPath} /> : null}
        {latestX !== null && latestY !== null ? <circle className={styles.chartPoint} cx={latestX} cy={latestY} r="4" /> : null}
        {latestX !== null && latestY !== null ? <circle className={styles.chartHaloPoint} cx={latestX} cy={latestY} r="7" /> : null}
        {latestX !== null && latestY !== null ? (
          <g transform={`translate(${Math.min(latestX + 8, chartRight - 98)} ${Math.max(latestY - 16, chartTop + 14)})`}>
            <rect className={styles.chartEndTag} height="18" rx="9" width="92" x="0" y="-12" />
            <text className={styles.chartLatestLabel} x="10" y="0">Portafolio {portfolioChange === null ? "-" : formatSignedPct(portfolioChange, 1)}</text>
          </g>
        ) : null}
        {benchmarkEndX !== null && benchmarkEndY !== null ? (
          <g transform={`translate(${Math.min(benchmarkEndX + 8, chartRight - 84)} ${Math.min(benchmarkEndY + 18, chartBottom - 4)})`}>
            <rect className={styles.chartBenchmarkTag} height="18" rx="9" width="78" x="0" y="-12" />
            <text className={styles.chartBenchmarkLabel} x="10" y="0">{benchmarkSymbol || "SPY"} {benchmarkChange === null ? "-" : formatSignedPct(benchmarkChange, 1)}</text>
          </g>
        ) : null}
      </svg>

      <div className={styles.chartSummary}>
        <span>{portfolioChange === null ? "Historial en construcción" : `Portafolio ${formatSignedPct(portfolioChange, 1)}`}</span>
        {hasBenchmark ? <span>{benchmarkSymbol || "SPY"} {benchmarkChange === null ? "seguimiento" : formatSignedPct(benchmarkChange, 1)}</span> : null}
      </div>
      <div className={styles.chartLegend}>
        <span><i className={styles.legendSwatch} data-series="portfolio" />Portafolio</span>
        {hasBenchmark ? <span><i className={styles.legendSwatch} data-series="benchmark" />{benchmarkSymbol || "SPY"}</span> : null}
      </div>
      <div className={styles.chartMeta}>
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

function normalizeWorkspaceName(value) {
  const text = String(value || "").trim();
  if (!text) return DEFAULT_APP_NAME;
  return /allocator workspace/i.test(text) ? "BLS Prime" : text;
}

function isTechnicalWorkspaceMessage(value) {
  return /runtime bootstrap|market:|alpha_volume_panel|fred request failed|internal server error|pipeline|traceback|exception|stack trace|\/api\/|railway|backend snapshot/i.test(String(value || ""));
}

function needsAutoRefresh(workspaceSummary) {
  const timestamp = workspaceSummary?.last_updated || workspaceSummary?.market_data_as_of;
  if (!timestamp) return true;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return true;

  const snapshotDate = new Date(parsed);
  const now = new Date();
  const sameDay = snapshotDate.toDateString() === now.toDateString();
  const ageHours = (now.getTime() - snapshotDate.getTime()) / (1000 * 60 * 60);

  return !sameDay || ageHours >= 4;
}

function HoldingsReturnBreakdown({ returns }) {
  const leaders = safeList(returns?.leaders);
  const detractors = safeList(returns?.detractors);
  const trackedCount = Number(returns?.trackedCount || 0);

  if (!leaders.length && !detractors.length) {
    return (
      <p className={styles.emptyCopy}>
        Los aportes por posición aparecerán cuando exista costo base guardado.
      </p>
    );
  }

  return (
    <div className={styles.returnBreakdown} aria-label="Desglose de retorno por posición">
      <article className={styles.returnColumn}>
        <div className={styles.returnColumnHead}>
          <strong>Mayores ganancias no realizadas</strong>
          <small>{trackedCount} con costo base guardado</small>
        </div>
        <div className={styles.returnList}>
          {leaders.map((row) => (
            <article className={styles.returnRow} key={`leader-${row.ticker}`}>
              <div>
                <strong>{row.ticker}</strong>
                <small>{row.sector}</small>
              </div>
              <div>
                <strong>{row.pnlLabel}</strong>
                <small>{row.returnLabel} desde costo base</small>
              </div>
            </article>
          ))}
        </div>
      </article>

      <article className={styles.returnColumn}>
        <div className={styles.returnColumnHead}>
          <strong>Mayores lastres</strong>
          <small>{detractors.length ? "Donde sigue la perdida no realizada" : "Sin lastres registrados ahora"}</small>
        </div>
        {detractors.length ? (
          <div className={styles.returnList}>
            {detractors.map((row) => (
              <article className={styles.returnRow} key={`detractor-${row.ticker}`}>
                <div>
                  <strong>{row.ticker}</strong>
                  <small>{row.sector}</small>
                </div>
                <div>
                  <strong>{row.pnlLabel}</strong>
                  <small>{row.returnLabel} desde costo base</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.emptyCopy}>No hay perdedores actuales con costo base guardado.</p>
        )}
      </article>
    </div>
  );
}

function holdingWeightValue(holding) {
  const direct = Number(holding?.weightValue);
  if (Number.isFinite(direct)) return direct;
  return parseDisplayPercent(holding?.weight) || 0;
}

function compactCurrency(value) {
  return Number.isFinite(Number(value)) ? formatCurrency(value) : "-";
}

function compactPercent(value, signed = false) {
  if (!Number.isFinite(Number(value))) return "-";
  return signed ? formatSignedPct(value) : formatPct(value);
}

function scoreLabel(value) {
  const score = Number(value);
  return Number.isFinite(score) ? `${Math.round(score)}/5` : "-";
}

function scoreTone(value, inverse = false) {
  const score = Number(value);
  if (!Number.isFinite(score)) return "neutral";
  if (inverse) {
    if (score >= 4) return "bad";
    if (score >= 3) return "warn";
    return "good";
  }
  if (score >= 4) return "good";
  if (score >= 3) return "warn";
  return "neutral";
}

function holdingName(holding) {
  return holding?.company || holding?.sector || holding?.assetType || "Posición";
}

function holdingActionLabel(holding) {
  if (holding?.currentAction) return cleanWorkspaceCopy(holding.currentAction);
  const risk = Number(holding?.riskScore);
  const weight = holdingWeightValue(holding);
  if (Number.isFinite(risk) && risk >= 4 && weight >= 0.035) return "Revisar tamaño";
  if (weight >= 0.055) return "Revisar peso";
  return "Mantener";
}

function holdingReviewReason(holding) {
  if (holding?.nextReviewTrigger) return cleanWorkspaceCopy(holding.nextReviewTrigger);
  if (holding?.thesis) return cleanWorkspaceCopy(holding.thesis);
  const risk = Number(holding?.riskScore);
  if (Number.isFinite(risk) && risk >= 4) return "Riesgo alto para su tamaño.";
  return holding?.theme || holding?.sector || "Sin nota cargada.";
}

function buildPortfolioExposures(holdings, key) {
  const groups = new Map();
  for (const holding of safeList(holdings)) {
    const label = String(holding?.[key] || "Sin clasificar").trim() || "Sin clasificar";
    const value = Number(holding?.marketValueUsd);
    const weight = holdingWeightValue(holding);
    const current = groups.get(label) || { label, value: 0, weight: 0, count: 0 };
    current.value += Number.isFinite(value) ? value : 0;
    current.weight += weight;
    current.count += 1;
    groups.set(label, current);
  }
  const rows = Array.from(groups.values()).sort((left, right) => right.weight - left.weight);
  const maxWeight = Math.max(...rows.map((row) => row.weight), 0.01);
  return rows.slice(0, 5).map((row) => ({
    ...row,
    width: `${Math.max(4, Math.min(100, (row.weight / maxWeight) * 100))}%`,
    weightLabel: formatPct(row.weight),
  }));
}

function buildReviewQueue(holdings) {
  return safeList(holdings)
    .map((holding) => ({
      ...holding,
      weightValue: holdingWeightValue(holding),
      actionLabel: holdingActionLabel(holding),
      reason: holdingReviewReason(holding),
      riskValue: Number(holding?.riskScore),
      qualityValue: Number(holding?.qualityScore),
    }))
    .sort((left, right) => {
      const riskDelta = (Number.isFinite(right.riskValue) ? right.riskValue : 0) - (Number.isFinite(left.riskValue) ? left.riskValue : 0);
      if (riskDelta) return riskDelta;
      const weightDelta = right.weightValue - left.weightValue;
      if (weightDelta) return weightDelta;
      return (Number.isFinite(left.qualityValue) ? left.qualityValue : 99) - (Number.isFinite(right.qualityValue) ? right.qualityValue : 99);
    })
    .slice(0, 6);
}

function buildPortfolioHorizonRows(analytics, returns, holdings) {
  const explicit = safeList(returns?.horizons)
    .filter((row) => row?.label)
    .map((row) => ({
      label: row.label,
      value: Number.isFinite(Number(row.value)) ? formatSignedPct(row.value) : "-",
      tone: Number(row.value) < 0 ? "bad" : Number(row.value) > 0 ? "good" : "neutral",
    }));
  if (explicit.length) return explicit.slice(0, 5);

  const weightedDay = safeList(holdings).reduce((sum, holding) => {
    const day = Number(holding?.dayReturn);
    return sum + (Number.isFinite(day) ? day * holdingWeightValue(holding) : 0);
  }, 0);
  return [
    { label: "Hoy", value: weightedDay ? formatSignedPct(weightedDay) : "-", tone: weightedDay < 0 ? "bad" : weightedDay > 0 ? "good" : "neutral" },
    { label: "1 semana", value: "-", tone: "neutral" },
    { label: "1 mes", value: "-", tone: "neutral" },
    { label: "Año", value: "-", tone: "neutral" },
    {
      label: "Desde inicio",
      value: analytics?.totalReturnInclDividends !== null && analytics?.totalReturnInclDividends !== undefined
        ? formatSignedPct(analytics.totalReturnInclDividends)
        : (analytics?.totalReturnLabel || analytics?.unrealizedReturnLabel || "-"),
      tone: "neutral",
    },
  ];
}

const PORTFOLIO_DONUT_COLORS = [
  "rgba(248, 200, 111, 0.95)",
  "rgba(122, 210, 194, 0.92)",
  "rgba(118, 169, 255, 0.88)",
  "rgba(245, 145, 120, 0.9)",
  "rgba(178, 142, 255, 0.86)",
  "rgba(129, 206, 134, 0.88)",
  "rgba(231, 165, 90, 0.88)",
  "rgba(156, 186, 210, 0.84)",
];

function numericValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function signedMoneyTone(value) {
  const parsed = numericValue(value);
  if (parsed === null) return "neutral";
  if (parsed < 0) return "bad";
  if (parsed > 0) return "good";
  return "neutral";
}

function buildPortfolioDonut(holdings) {
  const rows = [...safeList(holdings)]
    .map((holding) => ({
      ticker: holding?.ticker || "-",
      weight: Math.max(0, holdingWeightValue(holding)),
    }))
    .filter((row) => row.weight > 0)
    .sort((left, right) => right.weight - left.weight);

  if (!rows.length) {
    return {
      background: "rgba(255, 255, 255, 0.06)",
      rows: [],
    };
  }

  const top = rows.slice(0, 7);
  const otherWeight = rows.slice(7).reduce((sum, row) => sum + row.weight, 0);
  const segments = otherWeight > 0 ? [...top, { ticker: "Otros", weight: otherWeight }] : top;
  const total = segments.reduce((sum, row) => sum + row.weight, 0) || 1;
  let cursor = 0;
  const gradientStops = segments.map((row, index) => {
    const start = cursor;
    const span = (row.weight / total) * 100;
    cursor += span;
    const color = PORTFOLIO_DONUT_COLORS[index % PORTFOLIO_DONUT_COLORS.length];
    return `${color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });

  return {
    background: `conic-gradient(${gradientStops.join(", ")})`,
    rows: segments.map((row, index) => ({
      ...row,
      color: PORTFOLIO_DONUT_COLORS[index % PORTFOLIO_DONUT_COLORS.length],
      label: compactPercent(row.weight),
    })),
  };
}

function PortfolioDonutPanel({ holdings, topHolding }) {
  const donut = buildPortfolioDonut(holdings);
  return (
    <section className={styles.portfolioDonutPanel}>
      <div className={styles.portfolioDonutWrap}>
        <div className={styles.portfolioDonut} style={{ background: donut.background }}>
          <div>
            <span>Mayor peso</span>
            <strong>{topHolding?.ticker || "-"}</strong>
            <small>{topHolding ? topHolding.weight || compactPercent(holdingWeightValue(topHolding)) : "-"}</small>
          </div>
        </div>
      </div>
      <div className={styles.portfolioDonutLegend}>
        {donut.rows.length ? donut.rows.map((row) => (
          <span key={`donut-${row.ticker}`}>
            <i style={{ background: row.color }} />
            {row.ticker} {row.label}
          </span>
        )) : <p className={styles.emptyCopy}>Sin pesos cargados.</p>}
      </div>
    </section>
  );
}

function PortfolioPositionTable({ holdings }) {
  const rows = [...safeList(holdings)]
    .sort((left, right) => holdingWeightValue(right) - holdingWeightValue(left))
    .slice(0, 14);

  return (
    <section className={styles.portfolioTablePanel}>
      <div className={styles.portfolioSectionHead}>
        <div>
          <p className={styles.kicker}>Posiciones</p>
          <h3>{holdings.length ? `${holdings.length} conectadas` : "Sin posiciones"}</h3>
        </div>
      </div>
      {rows.length ? (
        <div className={styles.portfolioMatrix}>
          <div className={styles.portfolioMatrixHead}>
            <span>Nombre</span>
            <span>Tema</span>
            <span>Peso</span>
            <span>Valor</span>
            <span>Ganancia</span>
            <span>Acción</span>
          </div>
          {rows.map((holding) => (
            <article className={styles.portfolioMatrixRow} key={`portfolio-matrix-${holding.ticker}`}>
              <div>
                <strong>{holding.ticker}</strong>
                <span>{holdingName(holding)}</span>
              </div>
              <span>{holding.theme || holding.sector || holding.region || "-"}</span>
              <strong>{holding.weight || compactPercent(holdingWeightValue(holding))}</strong>
              <strong>{compactCurrency(holding.marketValueUsd)}</strong>
              <strong data-tone={signedMoneyTone(holding.unrealizedPnlUsd)}>
                {compactCurrency(holding.unrealizedPnlUsd)}
              </strong>
              <span>{holdingActionLabel(holding)}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.emptyCopy}>Agrega posiciones para ver pesos, valor y revisión.</p>
      )}
    </section>
  );
}

function PortfolioHorizonPanel({ analytics, holdings, returns }) {
  const rows = buildPortfolioHorizonRows(analytics, returns, holdings);
  return (
    <section className={styles.portfolioMiniPanel}>
      <div className={styles.portfolioMiniHead}>
        <p className={styles.kicker}>Retorno</p>
        <strong>{analytics?.totalReturnInclDividends !== null && analytics?.totalReturnInclDividends !== undefined ? formatSignedPct(analytics.totalReturnInclDividends) : analytics?.totalReturnLabel || "-"}</strong>
      </div>
      <div className={styles.portfolioHorizonRows}>
        {rows.map((row) => (
          <div className={styles.portfolioHorizonRow} data-tone={row.tone} key={`horizon-${row.label}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function PortfolioHoldingsPanel({ holdings }) {
  const topRows = [...safeList(holdings)]
    .sort((left, right) => holdingWeightValue(right) - holdingWeightValue(left))
    .slice(0, 10);

  return (
    <section className={styles.portfolioMiniPanel}>
      <div className={styles.portfolioMiniHead}>
        <p className={styles.kicker}>Posiciones</p>
        <strong>{holdings.length}</strong>
      </div>
      {topRows.length ? (
        <div className={styles.portfolioHoldingList}>
          {topRows.map((holding) => (
            <article className={styles.portfolioHoldingLine} key={`portfolio-line-${holding.ticker}`}>
              <div>
                <strong>{holding.ticker}</strong>
                <span>{holdingName(holding)}</span>
              </div>
              <div>
                <strong>{holding.weight || compactPercent(holdingWeightValue(holding))}</strong>
                <span>{compactCurrency(holding.marketValueUsd)}</span>
              </div>
              <div className={styles.portfolioBarTrack} aria-hidden="true">
                <span style={{ width: `${Math.max(2, Math.min(100, holdingWeightValue(holding) * 200))}%` }} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.emptyCopy}>Sin posiciones conectadas.</p>
      )}
    </section>
  );
}

function PortfolioExposurePanel({ holdings }) {
  const groups = [
    ["sector", "Sector"],
    ["region", "Region"],
    ["theme", "Tema"],
  ];

  return (
    <section className={styles.portfolioMiniPanel}>
      <div className={styles.portfolioMiniHead}>
        <p className={styles.kicker}>Exposicion</p>
        <strong>{holdings.length ? "Top" : "-"}</strong>
      </div>
      <div className={styles.portfolioExposureGrid}>
        {groups.map(([key, label]) => {
          const rows = buildPortfolioExposures(holdings, key);
          return (
            <div className={styles.portfolioExposureGroup} key={`exposure-${key}`}>
              <strong>{label}</strong>
              {rows.length ? rows.map((row) => (
                <div className={styles.portfolioExposureRow} key={`${key}-${row.label}`}>
                  <span>{row.label}</span>
                  <em>{row.weightLabel}</em>
                  <div className={styles.portfolioBarTrack} aria-hidden="true">
                    <span style={{ width: row.width }} />
                  </div>
                </div>
              )) : <small>Sin datos</small>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PortfolioReviewPanel({ holdings }) {
  const rows = buildReviewQueue(holdings);

  return (
    <section className={styles.portfolioMiniPanel}>
      <div className={styles.portfolioMiniHead}>
        <p className={styles.kicker}>Revisar</p>
        <strong>{rows.length || "-"}</strong>
      </div>
      {rows.length ? (
        <div className={styles.portfolioReviewList}>
          {rows.map((holding) => (
            <article className={styles.portfolioReviewRow} key={`review-${holding.ticker}`}>
              <div className={styles.portfolioReviewName}>
                <strong>{holding.ticker}</strong>
                <span>{holding.theme || holdingName(holding)}</span>
              </div>
              <div className={styles.portfolioScoreStrip}>
                <ToneBadge tone={scoreTone(holding.qualityScore)}>Calidad {scoreLabel(holding.qualityScore)}</ToneBadge>
                <ToneBadge tone={scoreTone(holding.riskScore, true)}>Riesgo {scoreLabel(holding.riskScore)}</ToneBadge>
              </div>
              <div className={styles.portfolioReviewAction}>
                <strong>{holding.actionLabel}</strong>
                <span>{holding.reason}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.emptyCopy}>La lista aparece cuando cada posición tenga notas de revisión.</p>
      )}
    </section>
  );
}

function PortfolioMoversPanel({ holdings }) {
  const movers = safeList(holdings)
    .filter((holding) => Number.isFinite(Number(holding?.dayPnlUsd)) || Number.isFinite(Number(holding?.dayReturn)))
    .sort((left, right) => Math.abs(Number(right.dayPnlUsd || right.dayReturn || 0)) - Math.abs(Number(left.dayPnlUsd || left.dayReturn || 0)))
    .slice(0, 5);

  return (
    <section className={styles.portfolioMiniPanel}>
      <div className={styles.portfolioMiniHead}>
        <p className={styles.kicker}>Hoy</p>
        <strong>{movers.length || "-"}</strong>
      </div>
      {movers.length ? (
        <div className={styles.portfolioCompactList}>
          {movers.map((holding) => (
            <article className={styles.portfolioCompactRow} key={`mover-${holding.ticker}`}>
              <div>
                <strong>{holding.ticker}</strong>
                <span>{holdingActionLabel(holding)}</span>
              </div>
              <div>
                <strong>{Number.isFinite(Number(holding.dayPnlUsd)) ? formatCurrency(holding.dayPnlUsd) : "-"}</strong>
                <span>{holding.dayReturnLabel || compactPercent(holding.dayReturn, true)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.emptyCopy}>Los movimientos diarios aparecen cuando llegue precio vivo.</p>
      )}
    </section>
  );
}

function PortfolioTransactionsPanel({ transactions }) {
  const rows = safeList(transactions).slice(0, 6);
  return (
    <section className={styles.portfolioMiniPanel}>
      <div className={styles.portfolioMiniHead}>
        <p className={styles.kicker}>Movimientos</p>
        <strong>{rows.length || "-"}</strong>
      </div>
      {rows.length ? (
        <div className={styles.portfolioCompactList}>
          {rows.map((row) => (
            <article className={styles.portfolioCompactRow} key={`tx-${row.id}-${row.ticker}`}>
              <div>
                <strong>{row.ticker}</strong>
                <span>{row.action} {row.date ? `- ${row.date}` : ""}</span>
              </div>
              <div>
                <strong>{compactCurrency(row.amountUsd)}</strong>
                <span>{row.source}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.emptyCopy}>Sin bitácora conectada.</p>
      )}
    </section>
  );
}

function FinancePlanField({ id, label, value, onChange, currency, inputMode = "decimal" }) {
  return (
    <label className={styles.financeField} htmlFor={id}>
      <span>{label}</span>
      <div className={styles.financeInputWrap}>
        {currency ? <small>{currency}</small> : null}
        <input
          className={styles.textInput}
          id={id}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      </div>
    </label>
  );
}

function PersonalFinancePanel({ financePlan, draft, pending, onChange, onSubmit }) {
  const plan = financePlan || {};
  const metrics = plan.metrics || {};
  const allocation = safeList(plan.allocation);
  const currency = sanitizeCurrencyInput(draft.baseCurrency) || sanitizeCurrencyInput(plan.inputs?.baseCurrency) || "USD";
  const hasIncome = draftMoney(plan.inputs?.monthlyIncome) > 0;
  const metricTone = financeMetricTone(plan);
  const allocationTotal = allocation.reduce((sum, item) => sum + Math.max(0, Number(item?.value) || 0), 0);
  const showAllocation = hasIncome && allocationTotal > 0;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Plan mensual de dinero</p>
          <h2>Define qué está realmente disponible para invertir</h2>
          <p className={styles.supportText}>
            Ingreso, cuentas fijas y gasto variable muestran cuánto queda para invertir.
          </p>
        </div>
        <ToneBadge tone={plan.tone || metricTone}>{cleanWorkspaceCopy(plan.title || "Plan no definido")}</ToneBadge>
      </div>

      <div className={styles.financePanelGrid}>
        <form
          className={styles.financeForm}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className={styles.financeInputGrid}>
            <FinancePlanField
              currency={currency}
              id="monthly-income"
              label="Ingreso mensual"
              onChange={(value) => onChange("monthlyIncome", value)}
              value={draft.monthlyIncome}
            />
            <FinancePlanField
              currency={currency}
              id="fixed-expenses"
              label="Gastos fijos"
              onChange={(value) => onChange("fixedExpenses", value)}
              value={draft.fixedExpenses}
            />
            <FinancePlanField
              currency={currency}
              id="variable-expenses"
              label="Gasto variable"
              onChange={(value) => onChange("variableExpenses", value)}
              value={draft.variableExpenses}
            />
            <FinancePlanField
              currency={currency}
              id="safety-buffer"
              label="Caja aparte"
              onChange={(value) => onChange("safetyBuffer", value)}
              value={draft.safetyBuffer}
            />
            <FinancePlanField
              currency={currency}
              id="target-investment"
              label="Aporte objetivo"
              onChange={(value) => onChange("targetMonthlyInvestment", value)}
              value={draft.targetMonthlyInvestment}
            />
            <FinancePlanField
              id="base-currency"
              inputMode="text"
              label="Moneda"
              onChange={(value) => onChange("baseCurrency", value)}
              value={draft.baseCurrency}
            />
          </div>

          <div className={styles.financeFormFooter}>
            <p>{cleanWorkspaceCopy(plan.body || "Guarda el plan para conectar flujo de caja personal con asignación de portafolio.")}</p>
            <button className={styles.primaryButton} disabled={pending} type="submit">
              {pending ? "Guardando..." : "Guardar plan"}
            </button>
          </div>
        </form>

        <div className={styles.financeReadout}>
          <div className={styles.financeMetricGrid}>
            <MetricTile
              detail="Caja que entra antes de cuentas y gasto variable."
              label="Ingreso mensual"
              value={formatMoney(plan.inputs?.monthlyIncome, currency)}
            />
            <MetricTile
              detail="Cuentas recurrentes y costos mensuales comprometidos."
              label="Costos fijos"
              value={formatMoney(plan.inputs?.fixedExpenses, currency)}
            />
            <MetricTile
              detail="Gasto flexible que todavía debe financiarse."
              label="Gasto variable"
              value={formatMoney(plan.inputs?.variableExpenses, currency)}
            />
            <MetricTile
              detail="Caja que se deja fuera del mercado."
              label="Caja aparte"
              value={formatMoney(plan.inputs?.safetyBuffer, currency)}
            />
            <MetricTile
              detail="Ingreso menos costos fijos, gasto variable y caja aparte."
              label="Disponible para invertir"
              tone={metricTone}
              value={formatMoney(metrics.monthlyInvestable, currency)}
            />
            <MetricTile
              detail="Gastos fijos y variables."
              label="Gasto mensual"
              value={formatMoney(metrics.monthlyOutflow, currency)}
            />
            <MetricTile
              detail="Caja invertible dividida por ingreso mensual."
              label="Tasa de ahorro"
              tone={metricTone}
              value={formatOptionalRatio(metrics.savingsRate, 0)}
            />
            <MetricTile
              detail="Aporte disponible frente a tu objetivo."
              label="Cobertura objetivo"
              tone={metricTone}
              value={metrics.targetCoverage === null ? "Definir objetivo" : formatOptionalRatio(metrics.targetCoverage, 0)}
            />
          </div>

          <div className={styles.financeAllocation}>
            <div className={styles.financeAllocationHead}>
              <div>
                <p className={styles.kicker}>Asignación mensual</p>
                <h3>{showAllocation ? "Dónde va el ingreso" : "Agrega ingreso para dibujar el plan"}</h3>
              </div>
              {Number.isFinite(Number(metrics.annualContributionRate)) ? (
                <ToneBadge tone="neutral">{formatOptionalRatio(metrics.annualContributionRate, 1)} del portafolio/año</ToneBadge>
              ) : null}
            </div>

            {showAllocation ? (
              <>
                <div className={styles.financeAllocationBar} aria-label="Asignación del ingreso mensual">
                  {allocation.map((item) => (
                    <span
                      data-segment={item.id}
                      key={item.id}
                      style={{ width: `${Math.max(4, Math.round((Number(item.ratio) || 0) * 100))}%` }}
                      title={`${item.label}: ${formatMoney(item.value, currency)}`}
                    />
                  ))}
                </div>
                <div className={styles.financeLegend}>
                  {allocation.map((item) => (
                    <span key={`legend-${item.id}`}>
                      <i data-segment={item.id} />
                      {item.label}: {formatMoney(item.value, currency)}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className={styles.emptyCopy}>Cuando ingreses el ingreso, esto se convierte en una barra de gasto, caja aparte y caja invertible.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatBreadth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toFixed(numeric >= 10 ? 1 : 2);
}

function formatWeightEditorValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toFixed(numeric >= 10 ? 1 : 2).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function sanitizeTickerInput(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 16);
}

function sanitizeDecimalInput(value) {
  return String(value || "").replace(/[^0-9.]/g, "").slice(0, 16);
}

function sanitizeCurrencyInput(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

function formatFinanceInputValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return "";
  return String(numeric).replace(/\.0+$/, "");
}

function financeDraftFromPlan(financePlan) {
  const inputs = financePlan?.inputs || {};
  return {
    monthlyIncome: formatFinanceInputValue(inputs.monthlyIncome),
    fixedExpenses: formatFinanceInputValue(inputs.fixedExpenses),
    variableExpenses: formatFinanceInputValue(inputs.variableExpenses),
    safetyBuffer: formatFinanceInputValue(inputs.safetyBuffer),
    targetMonthlyInvestment: formatFinanceInputValue(inputs.targetMonthlyInvestment),
    baseCurrency: sanitizeCurrencyInput(inputs.baseCurrency || "USD") || "USD",
  };
}

function draftMoney(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function formatMoney(value, currency = "USD") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: sanitizeCurrencyInput(currency) || "USD",
      maximumFractionDigits: numeric >= 1000 ? 0 : 2,
    }).format(numeric);
  } catch {
    return formatCurrency(numeric);
  }
}

function formatOptionalRatio(value, digits = 0) {
  return Number.isFinite(Number(value)) ? formatPct(Number(value), digits) : "-";
}

function financeMetricTone(financePlan) {
  const status = String(financePlan?.status || "");
  if (status === "target_funded" || status === "investable_ready") return "good";
  if (status === "cashflow_blocked") return "bad";
  return "warn";
}

const PHANTOM_MAX_HOLDINGS = 24;
const PHANTOM_CASHLIKE_TICKERS = new Set(["SGOV", "SHY", "BIL", "SHV", "VGSH", "JPST", "DWBDS"]);

function isExcludedPhantomHolding(holding) {
  const ticker = String(holding?.ticker || "").trim().toUpperCase();
  const assetType = String(holding?.assetType || holding?.asset_type || "").trim().toLowerCase();
  const sector = String(holding?.sector || "").trim().toLowerCase();
  if (!ticker) return true;
  if (assetType === "cash") return true;
  if (sector === "cash") return true;
  return PHANTOM_CASHLIKE_TICKERS.has(ticker);
}

function prepareDraftHoldings(holdings) {
  const connectedRows = safeList(holdings)
    .map((holding, index) => {
      const ticker = String(holding?.ticker || "").trim().toUpperCase();
      const weight = parseDisplayPercent(holding?.weight);
      if (!ticker || !(Number(weight) > 0)) return null;
      return {
        id: `${ticker}-${index}`,
        ticker,
        weightValue: Number(weight) || 0,
        weight: formatWeightEditorValue((Number(weight) || 0) * 100),
        excluded: isExcludedPhantomHolding(holding),
        sector: String(holding?.sector || "").trim(),
        country: String(holding?.country || "").trim(),
        proxy: String(holding?.sector || "").trim() && !["Unknown", "ETF", "Cash"].includes(String(holding?.sector || "").trim())
          ? String(holding?.sector || "").trim()
          : "",
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.weightValue - left.weightValue);

  const analyzable = connectedRows.filter((row) => !row.excluded);
  const selected = analyzable
    .slice(0, PHANTOM_MAX_HOLDINGS)
    .map(({ id, ticker, weight, sector, country, proxy }) => ({ id, ticker, weight, sector, country, proxy }));

  return {
    rows: selected,
    connectedCount: connectedRows.length,
    excludedCount: connectedRows.length - analyzable.length,
    overflowCount: Math.max(analyzable.length - selected.length, 0),
  };
}

function draftHoldingsKey(rows) {
  return JSON.stringify(
    safeList(rows).map((row) => ({
      ticker: String(row?.ticker || "").trim().toUpperCase(),
      weight: String(row?.weight || "").trim(),
      proxy: String(row?.proxy || "").trim(),
    })),
  );
}

function phantomTone(classification) {
  if (classification === "real-dominant") return "good";
  if (classification === "mixed") return "warn";
  if (classification === "phantom-dominant") return "bad";
  return "neutral";
}

function phantomClassificationLabel(classification, fallback) {
  if (classification === "real-dominant") return "Predomina lo real";
  if (classification === "mixed") return "Mixto";
  if (classification === "phantom-dominant") return "Mucho solapamiento oculto";
  return fallback ? cleanWorkspaceCopy(fallback) : "Sin clasificar";
}

function contributorTone(role) {
  if (role === "real diversifier") return "good";
  if (role === "phantom diversifier") return "warn";
  if (role === "crowding source") return "bad";
  return "neutral";
}

function contributorRoleLabel(role) {
  if (role === "real diversifier") return "Diversificador real";
  if (role === "phantom diversifier") return "Aporta menos proteccion";
  if (role === "crowding source") return "Fuente de concentración";
  return cleanWorkspaceCopy(role || "Sin rol");
}

function PhantomBreadthChart({ series }) {
  const rows = safeList(series);
  const width = 760;
  const height = 260;
  const paddingX = 22;
  const paddingY = 24;

  if (rows.length < 2) {
    return <p className={styles.emptyCopy}>Ejecuta el analisis para dibujar la brecha entre amplitud visible y real.</p>;
  }

  const maxValue = Math.max(
    ...rows.flatMap((row) => [Number(row.raw_breadth), Number(row.real_breadth)].filter(Number.isFinite)),
    1,
  );
  const minValue = Math.min(
    ...rows.flatMap((row) => [Number(row.raw_breadth), Number(row.real_breadth)].filter(Number.isFinite)),
    0,
  );
  const valueRange = maxValue - minValue || 1;
  const plotWidth = width - (paddingX * 2);
  const plotHeight = height - (paddingY * 2);

  const pointAt = (value, index) => {
    const x = paddingX + (plotWidth * index) / Math.max(rows.length - 1, 1);
    const y = height - paddingY - (((value - minValue) / valueRange) * plotHeight);
    return [x, y];
  };

  const linePath = (field) => rows
    .map((row, index) => {
      const [x, y] = pointAt(Number(row[field]) || 0, index);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const rawPoints = rows.map((row, index) => pointAt(Number(row.raw_breadth) || 0, index));
  const realPoints = rows.map((row, index) => pointAt(Number(row.real_breadth) || 0, index));
  const areaPath = [
    `M ${rawPoints[0][0].toFixed(1)} ${rawPoints[0][1].toFixed(1)}`,
    ...rawPoints.slice(1).map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`),
    ...realPoints.slice().reverse().map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`),
    "Z",
  ].join(" ");
  const latest = rows[rows.length - 1];
  const firstLabel = rows[0]?.date ? formatDate(rows[0].date) : "";
  const lastLabel = latest?.date ? formatDate(latest.date) : "";

  return (
    <div className={styles.phantomChartBlock}>
      <svg className={styles.phantomChart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Amplitud visible y real en el tiempo">
        <defs>
          <linearGradient id="phantomGapFill" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(248, 200, 111, 0.22)" />
            <stop offset="100%" stopColor="rgba(255, 134, 97, 0.08)" />
          </linearGradient>
        </defs>
        <path className={styles.phantomChartAxis} d={`M ${paddingX} ${height - paddingY} L ${width - paddingX} ${height - paddingY}`} />
        <path className={styles.phantomChartAxis} d={`M ${paddingX} ${paddingY} L ${paddingX} ${height - paddingY}`} />
        <path className={styles.phantomGapArea} d={areaPath} />
        <path className={styles.phantomRawLine} d={linePath("raw_breadth")} />
        <path className={styles.phantomRealLine} d={linePath("real_breadth")} />
      </svg>
      <div className={styles.chartLegend}>
        <span><i className={styles.legendSwatch} data-series="phantom-raw" />Amplitud visible</span>
        <span><i className={styles.legendSwatch} data-series="phantom-real" />Amplitud real</span>
        <span><i className={styles.legendSwatch} data-series="phantom-gap" />Solapamiento oculto</span>
      </div>
      <div className={styles.phantomChartMeta}>
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}

function PhantomDiversificationPanel({ portfolioModule, workspaceId }) {
  const draftDefaults = useMemo(() => prepareDraftHoldings(portfolioModule?.holdings), [portfolioModule?.holdings]);
  const baseRows = draftDefaults.rows;
  const baseKey = useMemo(() => draftHoldingsKey(baseRows), [baseRows]);
  const [draftRows, setDraftRows] = useState(baseRows);
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisPending, setAnalysisPending] = useState(false);
  const [activeTicker, setActiveTicker] = useState("");

  useEffect(() => {
    setDraftRows(baseRows);
    setAnalysis(null);
    setAnalysisError("");
    setActiveTicker("");
  }, [baseKey]);

  useEffect(() => {
    if (!workspaceId || baseRows.length < 3) return undefined;

    const controller = new AbortController();

    async function runInitialAnalysis() {
      setAnalysisPending(true);
      setAnalysisError("");
      try {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/phantom-diversification`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holdings: baseRows.map((row) => ({
              ticker: row.ticker,
              weight: Number.parseFloat(row.weight || "0"),
              sector: row.sector || "",
              country: row.country || "",
              proxy: row.proxy || "",
            })),
          }),
          signal: controller.signal,
        });
        const payload = await parseResponse(response);
        setAnalysis(payload);
        setActiveTicker(payload?.contributors?.[0]?.ticker || "");
      } catch (requestError) {
        if (requestError?.name === "AbortError") return;
        setAnalysis(null);
        setAnalysisError(String(requestError?.message || requestError || "Analysis failed."));
      } finally {
        if (!controller.signal.aborted) {
          setAnalysisPending(false);
        }
      }
    }

    void runInitialAnalysis();
    return () => controller.abort();
  }, [workspaceId, baseKey]);

  const totalWeight = draftRows.reduce((sum, row) => sum + (Number.parseFloat(row.weight) || 0), 0);
  const hasDraftRows = draftRows.length > 0;
  const positiveDraftCount = draftRows.filter((row) => String(row.ticker || "").trim() && (Number.parseFloat(row.weight) || 0) > 0).length;
  const draftIsReady = positiveDraftCount >= 3 && positiveDraftCount <= PHANTOM_MAX_HOLDINGS;
  const overDraftLimit = positiveDraftCount > PHANTOM_MAX_HOLDINGS;
  const activeContributor = safeList(analysis?.contributors).find((row) => row.ticker === activeTicker) || safeList(analysis?.contributors)[0] || null;

  function updateRow(id, field, nextValue) {
    setDraftRows((current) => current.map((row) => (
      row.id === id
        ? {
            ...row,
            [field]:
              field === "ticker"
                ? String(nextValue || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 16)
                : field === "weight"
                  ? String(nextValue || "").replace(/[^0-9.]/g, "").slice(0, 8)
                  : String(nextValue || "").slice(0, 48),
          }
        : row
    )));
  }

  function addRow() {
    setDraftRows((current) => [
      ...current,
      {
        id: `draft-${Date.now()}-${current.length}`,
        ticker: "",
        weight: "",
        sector: "",
        country: "",
        proxy: "",
      },
    ]);
  }

  function removeRow(id) {
    setDraftRows((current) => current.filter((row) => row.id !== id));
  }

  function resetRows() {
    setDraftRows(baseRows);
    setAnalysisError("");
  }

  async function runAnalysis() {
    if (!workspaceId) return;
    setAnalysisPending(true);
    setAnalysisError("");
    try {
      const holdings = draftRows
        .map((row) => ({
          ticker: String(row.ticker || "").trim().toUpperCase(),
          weight: Number.parseFloat(row.weight || "0"),
          sector: row.sector || "",
          country: row.country || "",
          proxy: row.proxy || "",
        }))
        .filter((row) => row.ticker && row.weight > 0);
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/phantom-diversification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings }),
      });
      const payload = await parseResponse(response);
      setAnalysis(payload);
      setActiveTicker(payload?.contributors?.[0]?.ticker || "");
    } catch (requestError) {
      setAnalysis(null);
      setAnalysisError(String(requestError?.message || requestError || "Analysis failed."));
    } finally {
      setAnalysisPending(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Solapamiento oculto</p>
          <h2>Revisa si tu diversificación es real o solo parece real</h2>
          <p className={styles.supportText}>
            Este módulo hace una pregunta simple: si el mercado se vuelve más difícil, ¿tus posiciones siguen siendo apuestas distintas o empiezan a moverse juntas?
          </p>
          <p className={styles.supportText}>
            {draftDefaults.connectedCount > PHANTOM_MAX_HOLDINGS || draftDefaults.excludedCount
              ? `Se cargaron ${baseRows.length} posiciones analizables desde ${draftDefaults.connectedCount} filas conectadas.`
              : `${baseRows.length} posiciones conectadas están listas para analizar.`}
            {draftDefaults.excludedCount ? ` ${draftDefaults.excludedCount} fila${draftDefaults.excludedCount === 1 ? "" : "s"} tipo caja excluida${draftDefaults.excludedCount === 1 ? "" : "s"} automáticamente.` : ""}
            {draftDefaults.overflowCount ? ` ${draftDefaults.overflowCount} posición${draftDefaults.overflowCount === 1 ? "" : "es"} menor${draftDefaults.overflowCount === 1 ? "" : "es"} quedó fuera hasta que la agregues manualmente.` : ""}
          </p>
        </div>
        <div className={styles.headerMeta}>
          <ToneBadge tone={analysis ? phantomTone(analysis?.current?.classification) : "neutral"}>
            {analysis ? phantomClassificationLabel(analysis?.current?.classification, analysis?.current?.classification_label) : "Esperando análisis"}
          </ToneBadge>
          <ToneBadge tone="neutral">{hasDraftRows ? `${draftRows.length} filas` : "Sin posiciones"}</ToneBadge>
        </div>
      </div>

      <div className={styles.phantomSurface}>
        <div className={styles.phantomDraftPane}>
          <div className={styles.phantomDraftHeader}>
            <div>
              <p className={styles.kicker}>Mezcla editable</p>
              <h3>Posiciones editables y precios de respaldo</h3>
            </div>
            <ToneBadge tone={Math.abs(totalWeight - 100) <= 0.5 ? "good" : "warn"}>
              {formatWeightEditorValue(totalWeight)}% ingresado
            </ToneBadge>
          </div>

          <div className={styles.phantomDraftTable}>
            <div className={styles.phantomDraftTableHeader}>
              <span>Ticker</span>
              <span>Peso %</span>
              <span>Proxy de respaldo</span>
              <span />
            </div>
            <div className={styles.phantomDraftRows}>
              {draftRows.map((row) => (
                <div className={styles.phantomDraftRow} key={row.id}>
                  <input
                    aria-label={`Ticker ${row.id}`}
                    className={styles.phantomInput}
                    onChange={(event) => updateRow(row.id, "ticker", event.target.value)}
                    placeholder="AAPL"
                    type="text"
                    value={row.ticker}
                  />
                  <input
                    aria-label={`Weight ${row.id}`}
                    className={styles.phantomInput}
                    inputMode="decimal"
                    onChange={(event) => updateRow(row.id, "weight", event.target.value)}
                    placeholder="12.5"
                    type="text"
                    value={row.weight}
                  />
                  <input
                    aria-label={`Proxy de respaldo ${row.id}`}
                    className={styles.phantomInput}
                    onChange={(event) => updateRow(row.id, "proxy", event.target.value)}
                    placeholder="Tecnologia / Canada / XLK"
                    type="text"
                    value={row.proxy || ""}
                  />
                  <button
                    aria-label={`Eliminar ${row.ticker || "fila"}`}
                    className={styles.textButton}
                    onClick={() => removeRow(row.id)}
                    type="button"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.phantomDraftActions}>
            <button className={styles.secondaryButton} onClick={addRow} type="button">Agregar posición</button>
            <button className={styles.textButton} onClick={resetRows} type="button">Restablecer posiciones conectadas</button>
          </div>

          <div className={styles.phantomActionBar}>
            <div>
              <strong>{overDraftLimit ? `Solo ${PHANTOM_MAX_HOLDINGS} posiciones positivas pueden probarse por corrida` : draftIsReady ? "Listo para probar" : "Se necesitan al menos 3 posiciones positivas"}</strong>
              <p className={styles.supportText}>
                Normalizamos pesos en el servidor. Ingresa porcentajes como piensas el portafolio; el modelo los reescala a 100%.
                {" "}Si un fondo o acción local no tiene historial usable, ingresa sector, país o ETF líquido en el proxy de respaldo.
                {overDraftLimit ? ` Quita ${positiveDraftCount - PHANTOM_MAX_HOLDINGS} posición${positiveDraftCount - PHANTOM_MAX_HOLDINGS === 1 ? "" : "es"} o vuelve a los mayores pesos conectados.` : ""}
              </p>
            </div>
            <button
              className={styles.primaryButton}
              disabled={!draftIsReady || analysisPending}
              onClick={runAnalysis}
              type="button"
            >
              {analysisPending ? "Analizando..." : "Analizar diversificación"}
            </button>
          </div>

          {analysisError ? <p className={styles.errorText}>{analysisError}</p> : null}
        </div>

        <div className={styles.phantomResultsPane}>
          <div className={styles.phantomResultBand}>
            <article className={styles.phantomResultMetric} data-tone="neutral">
              <span>Amplitud visible</span>
              <strong>{formatBreadth(analysis?.current?.holdings_hhi_breadth)}</strong>
              <small>{analysis?.copy?.naive_breadth || "Cómo se ve el portafolio si solo miras tamaños de posición."}</small>
            </article>
            <article className={styles.phantomResultMetric} data-tone="warn">
              <span>Amplitud de mercado</span>
              <strong>{formatBreadth(analysis?.current?.raw_breadth)}</strong>
              <small>{analysis?.copy?.raw_breadth || "Cuántas apuestas separadas sugiere el patrón de retornos en períodos normales."}</small>
            </article>
            <article className={styles.phantomResultMetric} data-tone={phantomTone(analysis?.current?.classification)}>
              <span>Amplitud bajo estrés</span>
              <strong>{formatBreadth(analysis?.current?.real_breadth)}</strong>
              <small>{analysis?.copy?.real_breadth || `${formatPct(analysis?.current?.tested_ratio || 0, 0)} de la diversificación resiste cuando las posiciones empiezan a moverse juntas.`}</small>
            </article>
            <article className={styles.phantomResultMetric} data-tone="bad">
              <span>Diversificación en riesgo</span>
              <strong>{formatPct(analysis?.current?.phantom_share || 0, 0)}</strong>
              <small>{cleanWorkspaceCopy(analysis?.copy?.phantom_share || `${formatBreadth(analysis?.current?.phantom_breadth)} puntos desaparecen cuando varias posiciones repiten el mismo riesgo.`)}</small>
            </article>
          </div>

          <div className={styles.phantomNarrative}>
            <div>
              <p className={styles.kicker}>Interpretación</p>
              <h3>{analysis ? phantomClassificationLabel(analysis?.current?.classification, analysis?.current?.classification_label) : (analysis?.copy?.verdict || "Ejecuta el módulo para puntuar la mezcla actual.")}</h3>
            </div>
            <div className={styles.phantomNarrativeCopy}>
              <p>{cleanWorkspaceCopy(analysis?.copy?.verdict || "Ejecuta el módulo para puntuar la mezcla actual.")}</p>
              <p>{cleanWorkspaceCopy(analysis?.copy?.phantom || "Si el score cae mucho desde amplitud de mercado a amplitud probada, varias posiciones repiten la misma apuesta de fondo.")}</p>
              <p>{cleanWorkspaceCopy(analysis?.copy?.improve || "Usa la tabla para ver qué posiciones agregan algo genuinamente distinto y cuáles repiten exposición existente.")}</p>
            </div>
          </div>

          {safeList(analysis?.diagnostics?.proxied_holdings).length ? (
            <div className={styles.phantomNarrative}>
              <div>
                <p className={styles.kicker}>Cobertura por proxy</p>
                <h3>Algunas posiciones se analizaron con proxies de sector o país</h3>
              </div>
              <div className={styles.phantomNarrativeCopy}>
                <p>{cleanWorkspaceCopy(analysis?.copy?.proxy_note || "Cuando un fondo o acción no tiene historial usable, el módulo estima diversificación con ETF sectorial, ETF país o proxy que indiques.")}</p>
                <p>
                  {safeList(analysis?.diagnostics?.proxied_holdings)
                    .map((row) => `${row.ticker} via ${row.history_label || row.history_symbol}`)
                    .join(" · ")}
                </p>
              </div>
            </div>
          ) : null}

          <div className={styles.phantomInsightStrip}>
            <div>
              <span>Al</span>
              <strong>{analysis?.as_of ? formatDate(analysis.as_of) : "Aún sin puntuar"}</strong>
            </div>
            <div>
              <span>Ventana</span>
              <strong>{analysis?.diagnostics?.window_days || 63} sesiones</strong>
            </div>
            <div>
              <span>Historial comun</span>
              <strong>{analysis?.diagnostics?.common_history_days || "-"}</strong>
            </div>
            <div>
              <span>Diversificación que resiste</span>
              <strong>{formatPct(analysis?.current?.tested_ratio || 0, 0)}</strong>
            </div>
            <div>
              <span>Fuente de precios</span>
              <strong>{safeList(analysis?.diagnostics?.source_labels).join(", ") || "No disponible"}</strong>
            </div>
          </div>

          <div className={styles.phantomChartShell}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Traza de amplitud</p>
                <h3>Cuánta diversificación queda cuando las posiciones se mueven juntas</h3>
              </div>
              {activeContributor ? (
                <div className={styles.phantomFocusBadge}>
                  <span>{activeContributor.ticker}</span>
                  <strong>{formatSignedPct(activeContributor.delta_real_breadth / Math.max(analysis?.current?.real_breadth || 1, 1), 0)}</strong>
                </div>
              ) : null}
            </div>
            <PhantomBreadthChart series={analysis?.series} />
          </div>

          <div className={styles.phantomContributorShell}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Quitar una por vez</p>
                <h3>Qué posiciones agregan algo realmente distinto</h3>
              </div>
              {activeContributor ? <ToneBadge tone={contributorTone(activeContributor.role)}>{contributorRoleLabel(activeContributor.role)}</ToneBadge> : null}
            </div>

            {activeContributor ? (
              <div className={styles.phantomContributorFocus}>
                <strong>{activeContributor.ticker}</strong>
                <p>{cleanWorkspaceCopy(activeContributor.role_summary || analysis?.copy?.leave_one_out || "Quita una posición por vez para ver si agrega diversificación real o si se solapa con el resto.")}</p>
                <p>Quitar este nombre cambia la amplitud visible en {formatBreadth(activeContributor.delta_raw_breadth)}, la diversificación que resiste en {formatBreadth(activeContributor.delta_real_breadth)} y el riesgo de solapamiento en {formatBreadth(activeContributor.delta_phantom_breadth)}.</p>
              </div>
            ) : null}

            {safeList(analysis?.contributors).length ? (
              <div className={styles.tableShell}>
                <div className={styles.phantomContributorHeader}>
                  <span>Ticker</span>
                  <span>Peso</span>
                  <span>Delta probado</span>
                  <span>Delta frágil</span>
                  <span>Rol</span>
                </div>
                <div className={styles.tableBody}>
                  {safeList(analysis?.contributors).map((row) => (
                    <article
                      className={styles.phantomContributorRow}
                      data-active={row.ticker === activeTicker}
                      key={`phantom-${row.ticker}`}
                      onFocus={() => setActiveTicker(row.ticker)}
                      onMouseEnter={() => setActiveTicker(row.ticker)}
                      tabIndex={0}
                    >
                      <strong>{row.ticker}</strong>
                      <span>{formatPct(row.weight || 0, 1)}</span>
                      <strong>{formatBreadth(row.delta_real_breadth)}</strong>
                      <span>{formatBreadth(row.delta_phantom_breadth)}</span>
                      <ToneBadge tone={contributorTone(row.role)}>{contributorRoleLabel(row.role)}</ToneBadge>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p className={styles.emptyCopy}>El diagnóstico por posición aparecerá después de un análisis exitoso.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function phantomSimpleGuidance(current) {
  const phantomShare = Number(current?.phantom_share);
  const testedRatio = Number(current?.tested_ratio);
  if (Number.isFinite(phantomShare) && phantomShare >= 0.92) {
    return {
      tone: "bad",
      title: "Reducir solapamiento antes de sumar riesgo",
      body: "El portafolio puede verse amplio, pero muchas posiciones todavía se parecen demasiado cuando llega el estrés.",
    };
  }
  if (Number.isFinite(testedRatio) && testedRatio >= 0.67) {
    return {
      tone: "good",
      title: "La diversificación está resistiendo",
      body: "La mezcla actual todavía se comporta como apuestas distintas cuando se incluye el estrés reciente.",
    };
  }
  if (Number.isFinite(testedRatio) && testedRatio >= 0.34) {
    return {
      tone: "warn",
      title: "Parte de la amplitud sigue siendo cosmetica",
      body: "Puedes mantener posiciones, pero no trates cada ticker como una apuesta independiente nueva.",
    };
  }
  return {
    tone: "warn",
    title: "Ejecutar el chequeo antes de aumentar tamaño",
    body: "La prueba usa las posiciones actuales y una ventana móvil de covarianza de 63 sesiones.",
  };
}

function SimplePhantomDiversificationPanel({ portfolioModule, workspaceId }) {
  const draftDefaults = useMemo(() => prepareDraftHoldings(portfolioModule?.holdings), [portfolioModule?.holdings]);
  const rows = draftDefaults.rows;
  const baseKey = useMemo(() => draftHoldingsKey(rows), [rows]);
  const [analysis, setAnalysis] = useState(null);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  useEffect(() => {
    setAnalysis(null);
    setAnalysisError("");
  }, [baseKey]);

  if (!workspaceId || rows.length < 3) return null;

  const current = analysis?.current || null;
  const diagnostics = analysis?.diagnostics || {};
  const guidance = phantomSimpleGuidance(current);
  const testedWidth = current ? Math.max(3, Math.min(100, Math.round((Number(current.tested_ratio) || 0) * 100))) : 0;
  const phantomWidth = current ? Math.max(0, 100 - testedWidth) : 0;
  const contributors = safeList(analysis?.contributors).slice(0, 3);
  const sources = safeList(diagnostics.source_labels);
  const supportedCount = safeList(diagnostics.supported_tickers).length;
  const coverageLabel = supportedCount
    ? `${supportedCount}/${rows.length} posiciones con historial usable`
    : `${rows.length} posiciones listas`;

  async function runAnalysis() {
    if (!workspaceId || analysisPending) return;
    setAnalysisPending(true);
    setAnalysisError("");
    try {
      const holdings = rows
        .map((row) => ({
          ticker: String(row.ticker || "").trim().toUpperCase(),
          weight: Number.parseFloat(row.weight || "0"),
          sector: row.sector || "",
          country: row.country || "",
          proxy: row.proxy || "",
        }))
        .filter((row) => row.ticker && row.weight > 0);
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/phantom-diversification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings }),
      });
      const payload = await parseResponse(response);
      setAnalysis(payload);
    } catch (requestError) {
      setAnalysis(null);
      setAnalysisError(String(requestError?.message || requestError || "Analysis failed."));
    } finally {
      setAnalysisPending(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Solapamiento estructural</p>
          <h2>Cuánta diversificación sobrevive cuando llega el estrés</h2>
          <p className={styles.supportText}>
            Mide si las posiciones siguen siendo apuestas distintas cuando los mercados se ponen nerviosos.
            Si varias se mueven juntas, la diversificación visible puede exagerar la protección real.
          </p>
        </div>
        <button className={styles.primaryButton} disabled={analysisPending} onClick={runAnalysis} type="button">
          {analysisPending ? "Revisando..." : analysis ? "Actualizar" : "Revisar estructura"}
        </button>
      </div>

      <div className={styles.phantomSimpleGrid}>
        <div className={styles.phantomSimpleMain}>
          <div className={styles.phantomSimpleVerdict}>
            <ToneBadge tone={analysis ? phantomTone(current?.classification) : "neutral"}>
              {current ? phantomClassificationLabel(current?.classification, current?.classification_label) : "Listo"}
            </ToneBadge>
            <strong>{analysis ? guidance.title : coverageLabel}</strong>
            <p>{analysis ? guidance.body : "Las posiciones tipo caja se excluyen. El servidor normaliza los pesos antes de calcular amplitud."}</p>
          </div>

          {analysisError ? <p className={styles.errorText}>{analysisError}</p> : null}

          {analysis ? (
            <>
              <div className={styles.phantomSimpleMetrics}>
                <MetricTile
                  detail="Apuestas independientes sugeridas por el historial de precios."
                  label="Apuestas visibles"
                  value={formatBreadth(current?.raw_breadth)}
                />
                <MetricTile
                  detail="Amplitud que sobrevive al ajuste de estrés."
                  label="Apuestas probadas"
                  tone={guidance.tone}
                  value={formatBreadth(current?.real_breadth)}
                />
                <MetricTile
                  detail="Amplitud visible que aún no queda validada."
                  label="En riesgo"
                  tone={guidance.tone}
                  value={formatPct(current?.phantom_share || 0, 0)}
                />
              </div>

              <div className={styles.phantomSimpleBar} aria-label="Amplitud probada versus solapamiento oculto">
                <span className={styles.phantomSimpleBarTested} style={{ width: `${testedWidth}%` }} />
                {phantomWidth ? <span className={styles.phantomSimpleBarRisk} style={{ width: `${phantomWidth}%` }} /> : null}
              </div>
              <div className={styles.phantomSimpleLegend}>
                <span>Probada: {formatBreadth(current?.real_breadth)}</span>
                <span>Oculto: {formatBreadth(current?.phantom_breadth)}</span>
              </div>
            </>
          ) : (
            <div className={styles.phantomSimpleEmpty}>
              <strong>Un clic, tres numeros.</strong>
              <p>Apuestas visibles, apuestas probadas y porcentaje de diversificación todavía en riesgo.</p>
            </div>
          )}
        </div>

        <aside className={styles.phantomSimpleAside}>
          <div>
            <p className={styles.kicker}>Lectura del portafolio</p>
            <strong>{analysis ? guidance.title : "Esperando prueba"}</strong>
            <p className={styles.supportText}>
              {analysis ? `Ventana: ${diagnostics.window_days || 63} sesiones. Al ${formatDate(analysis?.as_of)}.` : coverageLabel}
            </p>
          </div>

          {contributors.length ? (
            <div className={styles.phantomSimpleList}>
              {contributors.map((row) => (
                <article key={`simple-phantom-${row.ticker}`}>
                  <div>
                    <strong>{row.ticker}</strong>
                    <span>{cleanWorkspaceCopy(row.role_summary || row.role)}</span>
                  </div>
                  <ToneBadge tone={contributorTone(row.role)}>{contributorRoleLabel(row.role)}</ToneBadge>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>Las notas por posición aparecen después del chequeo.</p>
          )}

          <p className={styles.phantomSimpleSource}>
            {sources.length ? `Precios: ${sources.join(", ")}.` : "La fuente de precios aparecerá después del análisis."}
            {draftDefaults.excludedCount ? ` ${draftDefaults.excludedCount} posición${draftDefaults.excludedCount === 1 ? "" : "es"} tipo caja excluida${draftDefaults.excludedCount === 1 ? "" : "s"}.` : ""}
          </p>
        </aside>
      </div>
    </section>
  );
}

function AlertsPanel({ alerts }) {
  const values = safeList(alerts);
  if (!values.length) return null;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Alertas</p>
          <h2>Que necesita atencion ahora</h2>
        </div>
      </div>

      <div className={styles.alertStack}>
        {values.map((alert) => (
          <article className={styles.alertRow} key={alert.id}>
            <ToneBadge tone={statusTone(alert.severity)}>{capitalize(alert.severity)}</ToneBadge>
            <div>
              <strong>{alert.title}</strong>
              <p>{alert.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TodayDecisionPanel({ stateSummary, primaryAction, blockedAction, pendingKey, onStage, onDefer, onReject }) {
  const activeAction = primaryAction || blockedAction || null;
  const isBlocked = !primaryAction && Boolean(blockedAction);
  const title = cleanWorkspaceCopy(primaryAction?.title || blockedAction?.title || stateSummary?.stance || "Mantener linea");

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Frontera de accion</p>
          <h2>{title}</h2>
          <p className={styles.supportText}>El movimiento más claro que todavía sobrevive a la lectura actual.</p>
        </div>
        <ToneBadge tone={statusTone(isBlocked ? "briefing" : (primaryAction?.status || "ready"))}>
          {isBlocked ? "Esperar" : "Accionable"}
        </ToneBadge>
      </div>

      <p className={styles.lead}>
        {cleanWorkspaceCopy(primaryAction?.summary || blockedAction?.summary || stateSummary?.decisionSummary || "No hay un movimiento legitimo nuevo abierto ahora.")}
      </p>

      <div className={styles.decisionGrid}>
        <MetricTile
          detail={cleanWorkspaceCopy(primaryAction?.whyNow || stateSummary?.decisionSummary || "Esperar una estructura más limpia antes de ampliar riesgo.")}
          label="Decisión"
          value={cleanWorkspaceCopy(primaryAction?.title || "Proteger capital")}
        />
        <MetricTile
          detail={cleanWorkspaceCopy(primaryAction?.watchFor || blockedAction?.watchFor || "Confirmación de riesgo más fuerte y amplitud más limpia.")}
          label="Gatillo de revisión"
          value={activeAction ? formatSize(activeAction) : "Sin cambio de tamaño"}
        />
        <MetricTile
          detail={cleanWorkspaceCopy(activeAction?.funding || "Mantener el tamaño actual hasta que la estructura mejore.")}
          label="Fuente de financiamiento"
          value={cleanWorkspaceCopy(activeAction?.funding || "Sin cambio de financiamiento")}
        />
        <MetricTile
          detail={cleanWorkspaceCopy(blockedAction?.summary || "La estructura actual todavía no justifica ampliar riesgo.")}
          label="Postura del portafolio"
          value={cleanWorkspaceCopy(stateSummary?.stance || "Postura selectiva")}
        />
      </div>

      {primaryAction ? (
        <div className={styles.buttonRow}>
          <button className={styles.primaryButton} disabled={pendingKey !== null} onClick={() => onStage(primaryAction)} type="button">
            {pendingKey === `stage:${primaryAction.id}` ? "Preparando..." : "Preparar"}
          </button>
          <button className={styles.secondaryButton} disabled={pendingKey !== null} onClick={() => onDefer(primaryAction)} type="button">
            {pendingKey === `deferred:${primaryAction.id}` ? "Guardando..." : "Ahora no"}
          </button>
          <button className={styles.textButton} disabled={pendingKey !== null} onClick={() => onReject(primaryAction)} type="button">
            {pendingKey === `rejected:${primaryAction.id}` ? "Guardando..." : "Pasar"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function PortfolioPanelLegacy({ portfolioModule, range, onRangeChange, xray }) {
  const portfolio = portfolioModule || {};
  const portfolioXray = xray || {};
  const analytics = portfolio.analytics || {};
  const holdings = safeList(portfolio.holdings);
  const hasHoldings = holdings.length > 0;
  const topHoldings = holdings.slice(0, 5);
  const chartSeries = hasHoldings ? filterPortfolioSeries(portfolio?.charts?.growthComparison, range) : [];
  const currentGainLabel = analytics.unrealizedReturnLabel || "Costo base no disponible";
  const hasCostBasisReturn = hasHoldings && Boolean(analytics.unrealizedReturnLabel);
  const returnBreakdown = hasHoldings ? (portfolio?.returns || {}) : {};
  const topReturnLeader = safeList(returnBreakdown?.leaders)[0] || null;
  const roleBands = safeList(portfolioXray.roleBands).slice(0, 4);
  const carriers = safeList(portfolioXray.carriers).slice(0, 4);
  const fragilityLoad = safeList(portfolioXray.fragilityLoad).slice(0, 4);
  const recoveryDrivers = safeList(portfolioXray.recoveryDrivers).slice(0, 4);
  const concentrationWarnings = safeList(portfolioXray.concentrationWarnings).slice(0, 3);
  const concentration = portfolioXray.concentration || {};
  const recoveryShare = portfolioXray.recoveryShare || "-";
  const fragileShare = portfolioXray.fragileShare || "-";

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Radiografía del portafolio</p>
          <h2>{hasHoldings && analytics.totalValueUsd ? formatCurrency(analytics.totalValueUsd) : "Agrega posiciones para empezar"}</h2>
          <p className={styles.supportText}>
            {hasHoldings
              ? "Parte por lo que está cargando el portafolio; después lee rendimiento y comparación contra referencia."
              : "Ingresa posiciones antes de mostrar rendimiento personal o comparaciones contra referencia."}
          </p>
        </div>
        <div className={styles.headerMeta}>
          <ToneBadge tone={hasHoldings ? "good" : "warn"}>{hasHoldings ? `${analytics.holdingsCount || holdings.length} posiciones` : "Sin posiciones"}</ToneBadge>
          <ToneBadge tone="neutral">{hasHoldings ? (portfolio.chartSource || "Datos del portafolio cargando") : "Esperando posiciones"}</ToneBadge>
        </div>
      </div>

      <div className={styles.metricsGrid}>
        <MetricTile
          detail={hasHoldings ? (analytics.hasPerformanceHistory ? "Basado en fotos guardadas." : "Valor actual contra costo base guardado.") : "Agrega al menos una posición primero."}
          label={hasHoldings && analytics.hasPerformanceHistory ? "Retorno anualizado" : "Retorno desde costo base"}
          value={hasHoldings ? (analytics.hasPerformanceHistory ? analytics.annualReturnLabel : currentGainLabel) : "Sin posiciones"}
        />
        <MetricTile
          detail={hasHoldings && analytics.historySessions ? `${analytics.historySessions} observaciones guardadas` : "El historial empieza cuando las posiciones quedan conectadas."}
          label="Desde inicio del seguimiento"
          value={hasHoldings ? (analytics.totalReturnLabel || "Historial limitado") : "Esperando"}
        />
        <MetricTile
          detail={hasHoldings && analytics.hasBenchmarkHistory ? `${analytics.excessReturnLabel} vs ${analytics.benchmarkSymbol || "SPY"}` : "La comparación empieza cuando exista historial de posiciones."}
          label={`vs ${analytics.benchmarkSymbol || "SPY"}`}
          tone={hasHoldings && analytics.hasBenchmarkHistory ? "good" : "neutral"}
          value={hasHoldings && analytics.hasBenchmarkHistory ? analytics.excessReturnLabel : "Referencia limitada"}
        />
        <MetricTile
          detail={topReturnLeader ? `${topReturnLeader.returnLabel} desde costo base.` : "Guarda costo base para rankear ganancias no realizadas."}
          label="Mayor aporte al retorno"
          tone={topReturnLeader ? "good" : "neutral"}
          value={topReturnLeader ? `${topReturnLeader.ticker} ${topReturnLeader.pnlLabel}` : "Falta costo base"}
        />
      </div>

      <div className={styles.portfolioNarrative}>
        <div>
          <p className={styles.kicker}>Lectura estructural</p>
          <h3>
            {cleanWorkspaceCopy(
              portfolioXray.carryingNarrative
              || (hasHoldings
                ? "La radiografía está armando los motores reales del portafolio."
                : "Conecta posiciones para ver qué sostiene realmente el portafolio."),
            )}
          </h3>
        </div>

        <div className={styles.portfolioNarrativeStats}>
          <div>
            <span>Concentración</span>
            <strong>{concentration.verdict || "-"}</strong>
            <small>Top cinco: {concentration.topFive || "-"}</small>
          </div>
          <div>
            <span>Peso recuperable</span>
            <strong>{recoveryShare}</strong>
            <small>Peso que todavía agrega recuperabilidad.</small>
          </div>
          <div>
            <span>Peso fragil</span>
            <strong>{fragileShare}</strong>
            <small>Peso que puede reactivar fragilidad rapido.</small>
          </div>
          <div>
            <span>Protección</span>
            <strong>{concentration.ballast || "-"}</strong>
            <small>Protección dentro del portafolio actual.</small>
          </div>
        </div>

        {concentrationWarnings.length ? (
          <div className={styles.portfolioWarningList}>
            {concentrationWarnings.map((warning, index) => (
              <p key={`portfolio-warning-${index}`}>{cleanWorkspaceCopy(warning)}</p>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.portfolioGrid}>
        <div className={styles.chartPanel}>
          <RangeTabs onChange={onRangeChange} value={range} />
          <PortfolioChart benchmarkSymbol={analytics.benchmarkSymbol} series={chartSeries} />
          <p className={styles.supportText}>
            {!hasHoldings
              ? "No se muestra rendimiento personal hasta conectar posiciones. Así evitamos que una referencia compartida parezca tu retorno."
              : analytics.hasPerformanceHistory
              ? `El rendimiento se basa en ${analytics.historySessions} fotos guardadas del portafolio.`
              : hasCostBasisReturn
                ? `La ganancia actual es ${currentGainLabel}. El historial aún se está armando, por eso la referencia sigue limitada.`
                : "Falta costo base. La app necesita costo guardado o más historial antes de confiar en retornos."}
          </p>
          <div className={styles.returnDistributionShell}>
            <div>
              <p className={styles.kicker}>Retornos por posición</p>
              <h3>De dónde vienen ganancias y lastres no realizados</h3>
            </div>
            <HoldingsReturnBreakdown returns={returnBreakdown} />
          </div>
        </div>

        <aside className={styles.sidePanel}>
          <div className={styles.sidePanelHeader}>
            <div>
              <p className={styles.kicker}>Bandas de rol</p>
              <h3>Qué grupos sostienen el portafolio</h3>
            </div>
            <ToneBadge tone="neutral">{roleBands.length || topHoldings.length} visibles</ToneBadge>
          </div>

          {roleBands.length ? (
            <div className={styles.portfolioRoleBandList}>
              {roleBands.map((band) => (
                <article className={styles.portfolioRoleBand} key={`role-band-${band.id}`}>
                  <div>
                    <strong>{band.label}</strong>
                    <small>{safeList(band.names).join(", ") || band.description || "Banda de rol"}</small>
                  </div>
                  <div>
                    <strong>{band.weight || "-"}</strong>
                    <small>Fragilidad {band.fragilityLabel} / Recuperación {band.recoveryLabel}</small>
                  </div>
                </article>
              ))}
            </div>
          ) : topHoldings.length ? (
            <div className={styles.holdingStack}>
              {topHoldings.map((holding) => (
                <article className={styles.holdingRow} key={`hero-${holding.ticker}`}>
                  <div>
                    <strong>{holding.ticker}</strong>
                    <span>{holding.sector || "Posición"}</span>
                  </div>
                  <div>
                    <strong>{holding.weight || "-"}</strong>
                    <span>{holding.marketValueUsd ? formatCurrency(holding.marketValueUsd) : "Valor no disponible"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>No hay posiciones cargadas aún.</p>
          )}
        </aside>
      </div>

      {(carriers.length || fragilityLoad.length || recoveryDrivers.length) ? (
        <div className={styles.portfolioDriverGrid}>
          <section className={styles.portfolioDriverCard}>
            <div>
              <p className={styles.kicker}>Motores principales</p>
              <h3>Qué mueve realmente el portafolio</h3>
            </div>
            {carriers.length ? (
              <div className={styles.portfolioDriverList}>
                {carriers.map((item) => (
                  <article key={`carrier-${item.ticker}`}>
                    <div>
                      <strong>{item.ticker}</strong>
                      <small>{item.role || item.sector || "Motor"}</small>
                    </div>
                    <div>
                      <strong>{item.weight || "-"}</strong>
                      <small>Recuperación {item.recovery || "-"}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyCopy}>La lista de motores aparece cuando conectas posiciones.</p>
            )}
          </section>

          <section className={styles.portfolioDriverCard}>
            <div>
              <p className={styles.kicker}>Carga de fragilidad</p>
              <h3>Dónde el portafolio puede romperse más rápido</h3>
            </div>
            {fragilityLoad.length ? (
              <div className={styles.portfolioDriverList}>
                {fragilityLoad.map((item) => (
                  <article key={`fragility-${item.ticker}`}>
                    <div>
                      <strong>{item.ticker}</strong>
                      <small>{item.role || "Posición"}</small>
                    </div>
                    <div>
                      <strong>{item.load || "-"}</strong>
                      <small>Aporte a fragilidad</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyCopy}>El aporte a fragilidad aparecerá con la radiografía.</p>
            )}
          </section>

          <section className={styles.portfolioDriverCard}>
            <div>
              <p className={styles.kicker}>Motores de recuperacion</p>
              <h3>Qué todavía merece su lugar</h3>
            </div>
            {recoveryDrivers.length ? (
              <div className={styles.portfolioDriverList}>
                {recoveryDrivers.map((item) => (
                  <article key={`recovery-${item.ticker}`}>
                    <div>
                      <strong>{item.ticker}</strong>
                      <small>{item.role || "Posición"}</small>
                    </div>
                    <div>
                      <strong>{item.contribution || "-"}</strong>
                      <small>Aporte a recuperacion</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyCopy}>El aporte a recuperación aparecerá con la radiografía.</p>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function PortfolioPanel({ portfolioModule, range, onRangeChange, xray }) {
  const portfolio = portfolioModule || {};
  const analytics = portfolio.analytics || {};
  const holdings = safeList(portfolio.holdings);
  const transactions = safeList(portfolio.transactions);
  const hasHoldings = holdings.length > 0;
  const chartSeries = hasHoldings ? filterPortfolioSeries(portfolio?.charts?.growthComparison, range) : [];
  const returnBreakdown = hasHoldings ? (portfolio?.returns || {}) : {};
  const portfolioXray = xray || {};
  const concentration = portfolioXray.concentration || {};
  const totalValueLabel = hasHoldings && analytics.totalValueUsd ? formatCurrency(analytics.totalValueUsd) : "-";
  const activeCostBasisLabel = Number.isFinite(Number(analytics.activeCostBasisUsd))
    ? formatCurrency(analytics.activeCostBasisUsd)
    : "-";
  const totalPnlLabel = Number.isFinite(Number(analytics.totalPnlInclRealizedDividendsUsd))
    ? formatCurrency(analytics.totalPnlInclRealizedDividendsUsd)
    : (returnBreakdown?.totalPnlLabel || "-");
  const topHolding = [...holdings].sort((left, right) => holdingWeightValue(right) - holdingWeightValue(left))[0] || null;
  const reviewQueue = buildReviewQueue(holdings);
  const highRiskCount = reviewQueue.filter((holding) => Number(holding.riskScore) >= 4).length;
  const dayPnl = holdings.reduce((sum, holding) => {
    const value = Number(holding?.dayPnlUsd);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const hasDayPnl = holdings.some((holding) => Number.isFinite(Number(holding?.dayPnlUsd)));

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Mi cartera</p>
          <h2>{hasHoldings ? totalValueLabel : "Sin posiciones"}</h2>
          <p className={styles.supportText}>
            {hasHoldings ? `${holdings.length} posiciones. Valor, pesos, exposición y revisión en una sola vista.` : "Agrega posiciones para ver valor, pesos y revisión."}
          </p>
        </div>
        <div className={styles.headerMeta}>
          <ToneBadge tone={hasHoldings ? "good" : "warn"}>{hasHoldings ? "Activo" : "Vacío"}</ToneBadge>
          <ToneBadge tone="neutral">{portfolio.holdingsSource?.label || portfolio.chartSource || "Cartera"}</ToneBadge>
        </div>
      </div>

      <div className={styles.portfolioSummaryRail}>
        <MetricTile detail="Suma de posiciones." label="Valor" value={totalValueLabel} />
        <MetricTile
          detail={activeCostBasisLabel !== "-" ? `Base ${activeCostBasisLabel}` : "Falta costo base."}
          label="Resultado"
          tone={signedMoneyTone(analytics.totalPnlInclRealizedDividendsUsd)}
          value={totalPnlLabel}
        />
        <MetricTile
          detail={hasDayPnl ? "Precio diario cargado." : "Sin precio diario."}
          label="Hoy"
          tone={dayPnl < 0 ? "bad" : dayPnl > 0 ? "good" : "neutral"}
          value={hasDayPnl ? formatCurrency(dayPnl) : "-"}
        />
        <MetricTile
          detail={topHolding ? holdingName(topHolding) : "Sin dato."}
          label="Mayor peso"
          value={topHolding ? `${topHolding.ticker} ${topHolding.weight || compactPercent(holdingWeightValue(topHolding))}` : "-"}
        />
      </div>

      <div className={styles.portfolioDeskGrid}>
        <section className={styles.chartPanel}>
          <div className={styles.portfolioSectionHead}>
            <div>
              <p className={styles.kicker}>Historial</p>
              <h3>Cartera vs {analytics.benchmarkSymbol || "SPY"}</h3>
            </div>
            <RangeTabs onChange={onRangeChange} value={range} />
          </div>
          <PortfolioChart benchmarkSymbol={analytics.benchmarkSymbol} series={chartSeries} />
        </section>

        <PortfolioDonutPanel holdings={holdings} topHolding={topHolding} />
      </div>

      <PortfolioPositionTable holdings={holdings} />

      <div className={styles.portfolioTriageGrid}>
        <PortfolioExposurePanel holdings={holdings} />
        <PortfolioReviewPanel holdings={holdings} />
      </div>

      <div className={styles.portfolioLowerGrid}>
        <PortfolioHorizonPanel analytics={analytics} holdings={holdings} returns={returnBreakdown} />
        <PortfolioMoversPanel holdings={holdings} />
        <PortfolioTransactionsPanel transactions={transactions} />
      </div>

      {hasHoldings ? (
        <div className={styles.portfolioFooterStrip}>
          <span>Top 5: {concentration.topFive || "-"}</span>
          <span>Recuperación: {portfolioXray.recoveryShare || "-"}</span>
          <span>Fragilidad: {portfolioXray.fragileShare || "-"}</span>
          <span>Riesgo alto: {highRiskCount || "-"}</span>
        </div>
      ) : null}
    </section>
  );
}

function HoldingsPanel({
  portfolioModule,
  holdingDraft,
  onHoldingDraftChange,
  onSubmitHoldingDraft,
  tradeInstruction,
  onTradeInstructionChange,
  onSubmitTrade,
  pendingTrade,
  tradeError,
}) {
  const portfolio = portfolioModule || {};
  const holdings = safeList(portfolio.holdings);
  const sizingMode = holdingDraft?.sizing || "shares";
  const quantityValue = String(holdingDraft?.quantity || "");
  const targetValueInput = String(holdingDraft?.targetValueUsd || "");
  const priceValue = String(holdingDraft?.price || "");
  const tickerValue = String(holdingDraft?.ticker || "");
  const draftReady = Boolean(
    tickerValue &&
    ((sizingMode === "shares" && quantityValue !== "") || (sizingMode === "value" && targetValueInput !== "")),
  );

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Posiciones</p>
          <h2>{holdings.length ? "Todas las posiciones conectadas" : "Tus posiciones aparecerán aquí"}</h2>
          <p className={styles.supportText}>Revisa ticker, rol, peso, valor y precio en una sola vista.</p>
        </div>
        <ToneBadge tone="neutral">{holdings.length} posiciones</ToneBadge>
      </div>

      {holdings.length ? (
        <div className={styles.tableShell}>
          <div className={styles.tableHeader} role="row">
            <span>Ticker</span>
            <span>Tema</span>
            <span>Peso</span>
            <span>Valor</span>
            <span>Acción</span>
          </div>
          <div className={styles.tableBody}>
            {holdings.map((holding) => (
              <article className={styles.tableRow} key={`holding-row-${holding.ticker}`} role="row">
                <div className={styles.tablePrimary}>
                  <strong>{holding.ticker}</strong>
                  <span>{holding.company || holding.sector || holding.assetType || "Posición"}</span>
                </div>
                <span>{holding.theme || holding.thesisBucket || holding.industry || holding.region || "Sin tema"}</span>
                <strong>{holding.weight || "-"}</strong>
                <strong>{holding.marketValueUsd ? formatCurrency(holding.marketValueUsd) : "-"}</strong>
                <span>{holdingActionLabel(holding)}</span>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <p className={styles.emptyCopy}>Agrega una nota de operación o sincroniza tus posiciones privadas para armar la lista.</p>
      )}

      <form
        className={styles.tradeComposer}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitHoldingDraft();
        }}
      >
        <div className={styles.tradeCopy}>
          <p className={styles.kicker}>Edición directa</p>
          <h3>Define una posición directamente</h3>
          <p>Ingresa un ticker y acciones objetivo o valor objetivo en USD. Usa 0 para eliminar una posición limpiamente.</p>
        </div>
        <div className={styles.holdingQuickGrid}>
          <label className={styles.fieldStack}>
            <span>Ticker</span>
            <input
              className={styles.textInput}
              onChange={(event) => onHoldingDraftChange("ticker", event.target.value)}
              placeholder="AAPL"
              type="text"
              value={tickerValue}
            />
          </label>
          <div className={styles.fieldStack}>
            <span>Modo de entrada</span>
            <div className={styles.segmentedControl} role="tablist" aria-label="Modo de entrada de posición">
              <button
                className={styles.segmentButton}
                role="tab"
                aria-selected={sizingMode === "shares"}
                data-active={sizingMode === "shares"}
                onClick={() => onHoldingDraftChange("sizing", "shares")}
                type="button"
              >
                Acciones
              </button>
              <button
                className={styles.segmentButton}
                role="tab"
                aria-selected={sizingMode === "value"}
                data-active={sizingMode === "value"}
                onClick={() => onHoldingDraftChange("sizing", "value")}
                type="button"
              >
                USD objetivo
              </button>
            </div>
          </div>
          <label className={styles.fieldStack}>
            <span>{sizingMode === "shares" ? "Acciones objetivo" : "Valor objetivo"}</span>
            <input
              className={styles.textInput}
              inputMode="decimal"
              onChange={(event) => onHoldingDraftChange(sizingMode === "shares" ? "quantity" : "targetValueUsd", event.target.value)}
              placeholder={sizingMode === "shares" ? "12" : "5000"}
              type="text"
              value={sizingMode === "shares" ? quantityValue : targetValueInput}
            />
          </label>
          <label className={styles.fieldStack}>
            <span>Precio manual</span>
            <input
              className={styles.textInput}
              inputMode="decimal"
              onChange={(event) => onHoldingDraftChange("price", event.target.value)}
              placeholder="Opcional"
              type="text"
              value={priceValue}
            />
          </label>
        </div>
        <div className={styles.holdingQuickActions}>
          <button className={styles.primaryButton} disabled={pendingTrade || !draftReady} type="submit">
            {pendingTrade ? "Guardando..." : "Guardar posición"}
          </button>
          <p className={styles.supportHint}>Esta ruta actualiza la posición final directamente, sin intentar inferir una nota de operación.</p>
        </div>
        {tradeError ? <p className={styles.errorText}>{tradeError}</p> : null}
      </form>

      <form
        className={styles.tradeComposer}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitTrade();
        }}
      >
        <div className={styles.tradeCopy}>
          <p className={styles.kicker}>Actualización avanzada</p>
          <h3>Usa lenguaje simple para compras y ventas</h3>
          <p>Ejemplos: <em>compre 100 USD de NVDA</em> o <em>vendi 2 acciones de AAPL</em>.</p>
        </div>
        <div className={styles.tradeForm}>
          <input
            className={styles.textInput}
            onChange={(event) => onTradeInstructionChange(event.target.value)}
            placeholder="compre 100 USD de NVDA"
            type="text"
            value={tradeInstruction}
          />
          <button className={styles.secondaryButton} disabled={pendingTrade || !String(tradeInstruction || "").trim()} type="submit">
            {pendingTrade ? "Actualizando..." : "Actualizar desde texto"}
          </button>
        </div>
        {tradeError ? <p className={styles.errorText}>{tradeError}</p> : null}
      </form>
    </section>
  );
}

function CompactActionPanel({ title, kicker, emptyLabel, items, renderItem }) {
  const values = safeList(items);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>{kicker}</p>
          <h2>{title}</h2>
        </div>
      </div>

      {values.length ? (
        <div className={styles.compactStack}>
          {values.map(renderItem)}
        </div>
      ) : (
        <p className={styles.emptyCopy}>{emptyLabel}</p>
      )}
    </section>
  );
}

function WorkspaceSidebar({
  activeSection,
  alertCount,
  holdingsCount,
  onSelectSection,
  stagedCount,
  showChat,
  onOpenChat,
  onOpenGlossary,
  onOpenGuide,
  workspaceName,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <section className={styles.workspaceSidebar} aria-label="Navegacion del espacio">
      <div className={styles.workspaceSidebarTop}>
        <Link className={styles.workspaceBrand} href="/">
          <span className={styles.workspaceBrandMark} aria-hidden="true">B</span>
          <span>{workspaceName}</span>
        </Link>
        <p className={styles.supportText}>Espacio privado de decisión.</p>
      </div>

      <nav className={styles.workspaceSidebarNav} aria-label="Secciones del espacio">
        {WORKSPACE_NAV.map((item, index) => (
          <button
            className={styles.workspaceSidebarLink}
            data-active={activeSection === item.id}
            data-priority="primary"
            key={item.id}
            onClick={() => onSelectSection(item.id)}
            type="button"
          >
            <span className={styles.workspaceSidebarIndex}>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <span>{item.label}</span>
              <small>{item.detail}</small>
            </div>
            {item.id === "decisions" && stagedCount > 0 ? (
              <em data-tone="warn">{stagedCount}</em>
            ) : (
              <em>{item.priority}</em>
            )}
          </button>
        ))}

        {showAdvanced && WORKSPACE_NAV_ADVANCED.map((item) => (
          <button
            className={styles.workspaceSidebarLink}
            data-active={activeSection === item.id}
            data-priority="secondary"
            key={item.id}
            onClick={() => onSelectSection(item.id)}
            type="button"
          >
            <span className={styles.workspaceSidebarIndex}>—</span>
            <div>
              <span>{item.label}</span>
              <small>{item.detail}</small>
            </div>
            <em>{item.priority}</em>
          </button>
        ))}
      </nav>

      <div className={styles.workspaceSidebarMeta}>
        <article className={styles.workspaceSidebarStat}>
          <strong>{alertCount || "—"}</strong>
          <span>Alertas</span>
        </article>
        <article className={styles.workspaceSidebarStat}>
          <strong>{holdingsCount || "—"}</strong>
          <span>Posiciones</span>
        </article>
        <article className={styles.workspaceSidebarStat}>
          <strong>{stagedCount || "—"}</strong>
          <span>En espera</span>
        </article>
      </div>

      <div className={styles.workspaceSidebarActions}>
        <button className={styles.chatTrigger} data-active={showChat} onClick={onOpenChat} type="button">
          Preguntar al espacio
        </button>
        <div className={styles.workspaceSidebarUtility}>
          <button className={styles.glossaryTrigger} onClick={onOpenGlossary} type="button">
            Glosario
          </button>
          <button className={styles.welcomeTrigger} onClick={onOpenGuide} type="button">
            Guía
          </button>
          <button
            className={styles.glossaryTrigger}
            data-active={showAdvanced}
            onClick={() => setShowAdvanced((v) => !v)}
            type="button"
          >
            {showAdvanced ? "Ocultar avanzado" : "Avanzado"}
          </button>
        </div>
        <div className={styles.workspaceSidebarLinks}>
          <Link className={styles.secondaryLink} href="/terms">Términos</Link>
          <Link className={styles.secondaryLink} href="/">Inicio</Link>
        </div>
      </div>
    </section>
  );
}

function clampUnitInterval(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric));
}

function weightedRatio(entries, fallback = null) {
  let weighted = 0;
  let totalWeight = 0;

  for (const [value, weight] of Array.isArray(entries) ? entries : []) {
    const numeric = clampUnitInterval(value);
    const weightValue = Number(weight);
    if (numeric === null || !Number.isFinite(weightValue) || weightValue <= 0) continue;
    weighted += numeric * weightValue;
    totalWeight += weightValue;
  }

  if (!totalWeight) return fallback;
  return clampUnitInterval(weighted / totalWeight);
}

function formatScoreValue(value) {
  const numeric = clampUnitInterval(value);
  return numeric === null ? "-" : `${Math.round(numeric * 100)}`;
}

function diversificationRiskLabel(value) {
  const numeric = clampUnitInterval(value);
  if (numeric === null) return "Sin dato";
  if (numeric >= 0.68) return "Bajo";
  if (numeric >= 0.48) return "Moderado";
  return "Alto";
}

function structuralRiskLabel(value) {
  const numeric = clampUnitInterval(value);
  if (numeric === null) return "Sin dato";
  if (numeric >= 0.67) return "Alto";
  if (numeric >= 0.45) return "Medio";
  return "Contenido";
}

function truthTone(value) {
  const numeric = clampUnitInterval(value);
  if (numeric === null) return "neutral";
  if (numeric >= 0.67) return "good";
  if (numeric >= 0.45) return "warn";
  return "bad";
}

function diversificationStatusLabel(value) {
  const numeric = clampUnitInterval(value);
  if (numeric === null) return "Sin dato";
  if (numeric >= 0.67) return "Alta";
  if (numeric >= 0.45) return "Media";
  return "Baja";
}

function realityGapTone(value) {
  const numeric = clampUnitInterval(value);
  if (numeric === null) return "neutral";
  if (numeric >= 0.18) return "bad";
  if (numeric >= 0.08) return "warn";
  return "good";
}

function mapFilterTone(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "holdings") return "holdings";
  if (normalized === "watch") return "watch";
  if (normalized === "blocked") return "blocked";
  return "neutral";
}

function DiversificationClockCard({
  actualStructuralRisk,
  holdingsCount,
  recoveryShare,
  realityGap,
  structuralScore,
  visibleScore,
  xray,
}) {
  const visiblePct = visibleScore === null ? null : Math.round(clampUnitInterval(visibleScore) * 100);
  const realPct = structuralScore === null ? null : Math.round(clampUnitInterval(structuralScore) * 100);
  const gapPct = realityGap === null ? null : Math.round(clampUnitInterval(realityGap) * 100);
  const topCarrier = safeList(xray?.carriers)[0]?.ticker || safeList(xray?.fragilityLoad)[0]?.ticker || null;

  const W = 280;
  const ROW_H = 22;
  const ROW_GAP = 12;
  const TRACK_X = 88;
  const TRACK_W = W - TRACK_X;
  const H = ROW_H * 3 + ROW_GAP * 2;

  const rows = [
    { label: "Visible", pct: visiblePct, fill: "rgba(248,200,111,0.72)", text: "rgba(248,200,111,1)" },
    { label: "Real", pct: realPct, fill: "rgba(122,210,194,0.72)", text: "rgba(122,210,194,1)" },
    { label: "Brecha", pct: gapPct, fill: "rgba(220,85,85,0.60)", text: "rgba(220,110,110,1)" },
  ];

  return (
    <div className={styles.diversificationClockCard}>
      <svg
        className={styles.divClockSvg}
        viewBox={`0 0 ${W} ${H}`}
        aria-label={`Visible ${visiblePct ?? "—"} Real ${realPct ?? "—"} Brecha ${gapPct !== null ? `${gapPct}%` : "—"}`}
      >
        {rows.map((row, i) => {
          const y = i * (ROW_H + ROW_GAP);
          const barW = row.pct === null ? 3 : Math.max(3, (row.pct / 100) * TRACK_W);
          const numStr = row.pct === null ? "—" : `${row.pct}`;
          return (
            <g key={row.label}>
              <text x={0} y={y + ROW_H - 5} fontSize={11} fill="rgba(255,255,255,0.38)" fontFamily="inherit">{row.label}</text>
              <text x={TRACK_X - 6} y={y + ROW_H - 5} fontSize={14} fontWeight={700} fill={row.text} fontFamily="inherit" textAnchor="end">{numStr}</text>
              <rect x={TRACK_X} y={y} width={TRACK_W} height={ROW_H} rx={3} fill="rgba(255,255,255,0.05)" />
              <rect x={TRACK_X} y={y} width={barW} height={ROW_H} rx={3} fill={row.fill} />
            </g>
          );
        })}
      </svg>

      <div className={styles.diversificationClockCopy}>
        <p className={styles.kicker}>Solapamiento real</p>
        <h3>{realPct !== null ? realPct : "—"} de independencia real</h3>
        <p>
          {holdingsCount ? `${holdingsCount} posiciones` : "Sin posiciones"}
          {topCarrier ? ` · ${topCarrier} explica parte de la brecha` : ""}
          {" · "}
          {structuralRiskLabel(actualStructuralRisk)} riesgo estructural
        </p>
      </div>
    </div>
  );
}

function FactorLabWorkspacePanel({ portfolioModule }) {
  const [mode, setMode] = useState("ranked");
  const [selectedRule, setSelectedRule] = useState("momentum");
  const holdings = safeList(portfolioModule?.holdings).slice(0, 5);
  const candidates = holdings.length
    ? holdings.map((holding, index) => ({
      ticker: holding.ticker || `Activo ${index + 1}`,
      reason: holding.sector ? `Se compara contra ${holding.sector}.` : "Se compara contra el resto del portafolio.",
      score: `${Math.max(42, 84 - index * 9)}%`,
    }))
    : [
      { ticker: "E036", reason: "Buen impulso, calidad aceptable y volatilidad controlada.", score: "84%" },
      { ticker: "E001", reason: "Puntaje balanceado; necesita revisión de riesgo.", score: "71%" },
      { ticker: "E017", reason: "Candidato débil; aparece solo como referencia.", score: "56%" },
    ];
  const rules = [
    {
      id: "momentum",
      title: "Impulso",
      body: "Busca activos que vienen mejorando sin depender solo de un salto puntual.",
    },
    {
      id: "quality",
      title: "Calidad",
      body: "Premia señales de negocio más estables, como margen, deuda y flujo de caja.",
    },
    {
      id: "risk",
      title: "Riesgo",
      body: "Reduce prioridad cuando una idea se mueve igual que riesgos que ya tienes.",
    },
  ];
  const activeRule = rules.find((rule) => rule.id === selectedRule) || rules[0];

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Candidatos</p>
          <h2>¿Qué vale la pena considerar?</h2>
          <p className={styles.supportText}>
            Candidatos filtrados con reglas revisables. Descarta cálculos que usen datos posteriores a la fecha de decisión.
          </p>
        </div>
        <div className={styles.segmentedControl} role="tablist" aria-label="Modo de candidatos">
          <button data-active={mode === "ranked"} onClick={() => setMode("ranked")} type="button">Ranking</button>
          <button data-active={mode === "refusal"} onClick={() => setMode("refusal")} type="button">Señales rechazadas</button>
        </div>
      </div>

      <div className={styles.factorLabGrid}>
        <aside className={styles.factorLabExplainer}>
          <h3>Cómo funciona</h3>
          <ol>
            <li>Elige una señal de filtro.</li>
            <li>Calcula candidatos solo con datos disponibles al momento de decidir.</li>
            <li>Muestra por qué algo aparece, baja o queda descartado.</li>
          </ol>
        </aside>

        <div className={styles.factorLabRules}>
          {rules.map((rule) => (
            <button
              data-active={selectedRule === rule.id}
              key={rule.id}
              onClick={() => setSelectedRule(rule.id)}
              type="button"
            >
              <strong>{rule.title}</strong>
              <span>{rule.body}</span>
            </button>
          ))}
        </div>

        <section className={styles.factorLabResult}>
          {mode === "ranked" ? (
            <>
              <div>
                <p className={styles.kicker}>Regla activa</p>
                <h3>{activeRule.title}</h3>
                <p>{activeRule.body}</p>
              </div>
              <div className={styles.factorLabCandidateList}>
                {candidates.map((candidate) => (
                  <article key={candidate.ticker}>
                    <div>
                      <strong>{candidate.ticker}</strong>
                      <span>{candidate.reason}</span>
                    </div>
                    <b>{candidate.score}</b>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.factorLabRefusal}>
              <p className={styles.kicker}>Señal descartada</p>
              <h3>No se acepta una señal que usa datos del futuro.</h3>
              <p>
                Ejemplo: una regla tipo <code>lead()</code> usa datos posteriores a la fecha de decisión. Se descarta para que el análisis sea honesto: la señal no habría estado disponible cuando decidiste.
              </p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function MacroBrainWorkspacePanel() {
  const snapshot = macroBrainSnapshot;
  const openIdeas = safeList(snapshot.theses).filter((item) => item.state === "open").length;
  const watchedIdeas = safeList(snapshot.theses).filter((item) => item.state === "watch").length;
  const visualBars = safeList(snapshot.impulseChanges).slice(0, 5).map((item, index) => {
    const height = item.direction === "down" ? 6.2 - (index * 0.5) : item.direction === "flat" ? 3.5 : 2.4 + (index * 0.7);
    return {
      ...item,
      height: `${Math.max(2.2, height).toFixed(1)}rem`,
      delay: `${index * 70}ms`,
    };
  });

  return (
    <section className={styles.panel}>
      <div className={styles.macroBrainPanel}>
        <div className={styles.macroBrainLead}>
          <p className={styles.kicker}>Contexto macro</p>
          <h2>Mercado, en corto</h2>
          <p>{snapshot.shortRead}</p>
          <div className={styles.macroBrainStats}>
            <span><strong>{snapshot.seriesCount}</strong> señales</span>
            <span><strong>{openIdeas}</strong> abiertas</span>
            <span><strong>{watchedIdeas}</strong> en revisión</span>
          </div>
        </div>

        <div className={styles.macroBrainVisual} aria-label="Lectura visual de Macro Brain">
          {visualBars.map((item) => (
            <span
              data-direction={item.direction}
              key={`macro-pulse-${item.label}`}
              style={{ "--bar-height": item.height, "--macro-delay": item.delay }}
              title={`${item.label}: ${item.plain}`}
            />
          ))}
        </div>

        <div className={styles.macroBrainGrid}>
          <article>
            <h3>Qué cambió</h3>
            {safeList(snapshot.impulseChanges).slice(0, 5).map((item) => (
              <div className={styles.macroBrainRow} data-direction={item.direction} key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.plain}</span>
              </div>
            ))}
          </article>

          <article>
            <h3>Tesis</h3>
            {safeList(snapshot.theses).map((item) => (
              <div className={styles.macroBrainIdea} key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.state === "open" ? "Sigue abierta" : "Mirar de cerca"}</span>
              </div>
            ))}
          </article>

          <article>
            <h3>Próximos datos</h3>
            {safeList(snapshot.nextChecks).slice(0, 4).map((item) => (
              <div className={styles.macroBrainRow} key={item.event}>
                <strong>{item.event}</strong>
                <span>{item.timing}</span>
              </div>
            ))}
          </article>

          <article>
            <h3>Estrés</h3>
            <p>{snapshot.stability.read}</p>
            <div className={styles.macroBrainStatus}>
              <span>{snapshot.stability.status}</span>
              <strong>{snapshot.stability.pressure}%</strong>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function RecoverabilityMapFigure({ items }) {
  const points = safeList(items).map((item, index) => {
    const recovery = clampUnitInterval(item?.x);
    const fragility = clampUnitInterval(item?.y);
    const kind = mapFilterTone(item?.filter || item?.legitimacy || item?.kind);
    return {
      id: item?.id || `${item?.label || "item"}-${index}`,
      label: item?.label || item?.ticker || `Fila ${index + 1}`,
      meta: item?.meta || item?.quadrant || item?.kind || "Sin detalle",
      kind,
      recovery: recovery === null ? 0 : recovery,
      fragility: fragility === null ? 0 : fragility,
      priority: (fragility === null ? 0 : fragility) - (recovery === null ? 0 : recovery),
    };
  });
  const counts = points.reduce((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + 1;
    return acc;
  }, {});
  const rows = [...points]
    .sort((a, b) => (b.priority - a.priority) || (b.fragility - a.fragility) || a.label.localeCompare(b.label))
    .slice(0, 6);

  if (!points.length) {
    return (
      <div className={styles.truthMapEmpty}>
        <strong>Resumen pendiente.</strong>
        <p>Agrega posiciones o ideas y aquí aparecerá qué está firme, qué vigilar y qué queda bloqueado.</p>
      </div>
    );
  }

  return (
    <div className={styles.truthMapShell}>
      <div className={styles.truthMapSummary} aria-label="Resumen estructural del portafolio">
        <div>
          <strong>{counts.holdings || 0}</strong>
          <span>Posiciones</span>
        </div>
        <div>
          <strong>{counts.watch || 0}</strong>
          <span>En revisión</span>
        </div>
        <div>
          <strong>{counts.blocked || 0}</strong>
          <span>Bloqueado</span>
        </div>
      </div>

      <div className={styles.truthMapRows}>
        {rows.map((item) => (
          <article className={styles.truthMapRow} data-filter={item.kind} key={item.id}>
            <div className={styles.truthMapRowHead}>
              <strong>{item.label}</strong>
              <span>{item.kind === "holdings" ? "Posición" : item.kind === "watch" ? "En revisión" : "Bloqueado"}</span>
            </div>
            <p>{item.meta}</p>
            <div className={styles.truthMapBars}>
              <span>
                Recuperación
                <i><b style={{ "--bar-width": `${Math.round(item.recovery * 100)}%` }} /></i>
              </span>
              <span>
                Fragilidad
                <i><b style={{ "--bar-width": `${Math.round(item.fragility * 100)}%` }} /></i>
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function TruthInterfacePanel({
  blockedAction,
  dashboard,
  onSelectSection,
  personalFinance,
  portfolioModule,
  primaryAction,
  showChat,
  stateSummary,
  onToggleChat,
}) {
  const xray = dashboard?.xray || {};
  const frontier = dashboard?.frontier || {};
  const balanceSheet = dashboard?.recoverability_balance_sheet || {};
  const confidencePanel = dashboard?.confidence_panel || {};
  const riskCluster = dashboard?.modules?.risk?.clusterDecomposition || {};
  const recoverabilityMap = dashboard?.recoverability_map || {};
  const holdingsCount = Number(xray?.holdingsCount || stateSummary?.holdings || safeList(portfolioModule?.holdings).length || 0);
  const topFiveConcentration = parseDisplayPercent(xray?.concentration?.topFive);
  const recoveryShare = parseDisplayPercent(xray?.recoveryShare);
  const fragileShare = parseDisplayPercent(xray?.fragileShare);
  const phantomTax = parseDisplayPercent(balanceSheet?.phantomTax);
  const netFreedom = parseDisplayPercent(balanceSheet?.netFreedom);
  const optionalityReserve = parseDisplayPercent(balanceSheet?.optionalityReserve);
  const visibleScore = weightedRatio(
    [
      [holdingsCount ? Math.min(holdingsCount, 12) / 12 : null, 0.38],
      [topFiveConcentration === null ? null : 1 - topFiveConcentration, 0.62],
    ],
    holdingsCount ? Math.max(0.32, Math.min(0.84, holdingsCount / 10)) : 0.42,
  );
  const structuralScore = weightedRatio(
    [
      [recoveryShare, 0.34],
      [fragileShare === null ? null : 1 - fragileShare, 0.26],
      [phantomTax === null ? null : 1 - phantomTax, 0.24],
      [netFreedom, 0.16],
    ],
    visibleScore === null ? 0.38 : clampUnitInterval(visibleScore * 0.82),
  );
  const actualStructuralRisk = weightedRatio(
    [
      [riskCluster?.gScore, 0.44],
      [fragileShare, 0.24],
      [phantomTax, 0.18],
      [riskCluster?.rScore, 0.14],
    ],
    structuralScore === null ? 0.5 : clampUnitInterval(1 - structuralScore),
  );
  const realityGap = visibleScore !== null && structuralScore !== null
    ? clampUnitInterval(Math.max(visibleScore - structuralScore, 0))
    : null;
  const activeAction = primaryAction || blockedAction || safeList(frontier?.allItems)[0] || null;
  const investableCash = personalFinance?.metrics?.monthlyInvestable;
  const targetCoverage = personalFinance?.metrics?.targetCoverage;
  const portfolioAnalytics = portfolioModule?.analytics || {};
  const suggestionPrompts = [
    "¿Cuánto puedo invertir este mes?",
    "¿Dónde está el mayor solapamiento?",
    "Resume la lectura actual.",
  ];
  const briefNotes = safeList(dashboard?.evidence_drawer?.currentRead).slice(0, 3);
  const referenceItems = [
    {
      title: "Portafolio",
      detail: holdingsCount
        ? `${holdingsCount} posición${holdingsCount === 1 ? "" : "es"} conectada${holdingsCount === 1 ? "" : "s"}${portfolioAnalytics.chartSource ? ` · ${portfolioAnalytics.chartSource}` : ""}.`
        : "Agrega posiciones para desbloquear la lectura en vivo.",
    },
    {
      title: "Foto de mercado",
      detail: dashboard?.workspace_summary?.market_data_label || dashboard?.workspace_summary?.last_updated_label || "Sesión actual",
    },
    {
      title: "Lectura actual",
      detail: cleanWorkspaceCopy(
        briefNotes[0]
        || frontier?.subhead
        || "La lectura aparece aquí cuando la evidencia queda ensamblada.",
      ),
    },
  ];
  const decisionTitle = cleanWorkspaceCopy(activeAction?.title || stateSummary?.stance || "Lectura actual");
  const decisionCopy = cleanWorkspaceCopy(
    activeAction?.summary
    || stateSummary?.decisionSummary
    || balanceSheet?.headlineState
    || frontier?.subhead
    || "El espacio mostrará aquí la respuesta actual más clara.",
  );
  const reserveCopy = cleanWorkspaceCopy(balanceSheet?.spendRule || "Espera una señal más clara antes de sumar riesgo.");
  const investableDisplay = formatMoney(investableCash, personalFinance?.inputs?.baseCurrency);
  const realIndependenceLabel = formatScoreValue(structuralScore);
  const visibleIndependenceLabel = formatScoreValue(visibleScore);
  const gapLabel = realityGap === null ? "-" : `${Math.round(clampUnitInterval(realityGap) * 100)}%`;

  return (
    <section className={styles.truthSurface}>
      <div className={styles.answerWorkspace}>
        <div className={styles.answerWorkspaceHead}>
          <div>
            <p className={styles.kicker}>Respuesta actual</p>
            <h2>{decisionTitle}</h2>
            <p className={styles.supportText}>Caja, independencia y riesgo inmediato.</p>
          </div>
          <div className={styles.answerWorkspaceMeta}>
            <ToneBadge tone={truthTone(parseDisplayPercent(balanceSheet?.optionalityReserve))}>
              {cleanWorkspaceCopy(balanceSheet?.accountingState || "Lectura en vivo")}
            </ToneBadge>
            <ToneBadge tone="neutral">{cleanWorkspaceCopy(confidencePanel?.confidenceBand || "Evidencia usable")}</ToneBadge>
            <ToneBadge tone={realityGapTone(realityGap)}>
              {cleanWorkspaceCopy(riskCluster?.dominantLabel || "Lectura de riesgo pendiente")}
            </ToneBadge>
          </div>
        </div>

        <div className={styles.answerCommandRow}>
          <button className={styles.answerComposer} onClick={onToggleChat} type="button">
            {showChat ? "Ocultar preguntas" : "Preguntar"}
          </button>

          <div className={styles.answerSuggestions}>
            {suggestionPrompts.map((prompt) => (
              <button className={styles.answerSuggestion} key={prompt} onClick={onToggleChat} type="button">
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.answerGrid}>
          <div className={styles.answerMainColumn}>
            <article className={styles.answerCard}>
              <div className={styles.answerCardTop}>
                <div>
                  <p className={styles.answerCardTag}>Lectura</p>
                  <h3>{decisionTitle}</h3>
                </div>
                <div className={styles.answerCardSignal}>
                  <span>Independencia</span>
                  <strong>{realIndependenceLabel}</strong>
                </div>
              </div>
              <p className={styles.answerDecisionLine}>{decisionCopy}</p>

              <div className={styles.decisionPillarGrid} aria-label="Lectura principal del workspace">
                <div>
                  <span>Independencia real</span>
                  <strong>{realIndependenceLabel}</strong>
                  <small>Visible {visibleIndependenceLabel}; brecha {gapLabel}.</small>
                </div>
                <div>
                  <span>Riesgo dominante</span>
                  <strong>{cleanWorkspaceCopy(riskCluster?.dominantLabel || "Sin dato")}</strong>
                  <small>{structuralRiskLabel(actualStructuralRisk)} riesgo estructural.</small>
                </div>
                <div>
                  <span>Margen</span>
                  <strong>{balanceSheet?.optionalityReserve || balanceSheet?.spendingCapacity || "-"}</strong>
                  <small>{reserveCopy}</small>
                </div>
              </div>

              <div className={styles.answerCardActions}>
                <button className={styles.secondaryButton} onClick={() => onSelectSection("decisions")} type="button">
                  Decisiones
                </button>
                <button className={styles.secondaryButton} onClick={() => onSelectSection("risk")} type="button">
                  Mayor riesgo
                </button>
                <button className={styles.primaryButton} onClick={onToggleChat} type="button">
                  {showChat ? "Cerrar" : "Explicar"}
                </button>
              </div>
            </article>

            <div className={styles.answerModuleGrid}>
              <article className={styles.answerModule}>
                <p className={styles.kicker}>Estructura</p>
                <h3>Independencia real del portafolio</h3>
                <div className={styles.answerMetricList}>
                  <div>
                    <span>Amplitud visible</span>
                    <strong>{visibleIndependenceLabel}</strong>
                    <small>Pesos y cantidad de nombres.</small>
                  </div>
                  <div>
                    <span>Amplitud real</span>
                    <strong>{realIndependenceLabel}</strong>
                    <small>La parte que resiste bajo estrés.</small>
                  </div>
                  <div>
                    <span>Margen</span>
                    <strong>{balanceSheet?.optionalityReserve || balanceSheet?.spendingCapacity || "-"}</strong>
                    <small>{reserveCopy}</small>
                  </div>
                </div>
              </article>

              <article className={`${styles.answerModule} ${styles.answerModuleWide}`}>
                <DiversificationClockCard
                  actualStructuralRisk={actualStructuralRisk}
                  holdingsCount={holdingsCount}
                  recoveryShare={xray?.recoveryShare}
                  realityGap={realityGap}
                  structuralScore={structuralScore}
                  visibleScore={visibleScore}
                  xray={xray}
                />
              </article>

            </div>
          </div>

          <aside className={styles.answerSourcesCard}>
            <p className={styles.answerCardTag}>Fuentes</p>
            <div className={styles.answerReferenceList}>
              {referenceItems.map((item) => (
                <article className={styles.answerReferenceRow} key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{cleanWorkspaceCopy(item.detail)}</p>
                </article>
              ))}
            </div>

            <div className={styles.answerSourceFooter}>
              <RecoverabilityMapFigure items={recoverabilityMap?.items} />
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function joinedActionText(item) {
  return [
    item?.title,
    item?.summary,
    item?.slot,
    item?.status,
    item?.sizeLabel,
    item?.userResponse,
    item?.response,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizeWorkspaceCopyInput(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeWorkspaceCopyInput).filter(Boolean).join(" ");
  }

  if (value && typeof value === "object") {
    const preferredKeys = [
      "summary",
      "note",
      "title",
      "headline",
      "body",
      "detail",
      "description",
      "reason",
      "message",
      "text",
    ];

    for (const key of preferredKeys) {
      const candidate = normalizeWorkspaceCopyInput(value[key]);
      if (candidate) return candidate;
    }

    return "";
  }

  return String(value || "");
}

function cleanWorkspaceCopy(value) {
  return normalizeWorkspaceCopyInput(value)
    .replace(/\bphantom diversification\b/gi, "diversificación aparente")
    .replace(/\bphantom breadth\b/gi, "amplitud no probada")
    .replace(/\bphantom diversifier\b/gi, "posición con protección frágil")
    .replace(/\bdiversification\b/gi, "diversificación")
    .replace(/\bconcentration\b/gi, "concentración")
    .replace(/\brecoverability\b/gi, "capacidad de recuperación")
    .replace(/\bhealing velocity\b/gi, "velocidad de recuperación")
    .replace(/\bphantom\b/gi, "oculto")
    .replace(/\bfantasma\b/gi, "oculto")
    .replace(/\bFactorLab\b/g, "candidatos")
    .replace(/\bMacro Brain\b/gi, "contexto macro")
    .replace(/\blookahead bias\b/gi, "señal con datos inválidos")
    .replace(/\blookahead\b/gi, "datos futuros inválidos")
    .replace(/\bKeep\s+[A-Z0-9.-]+\s+as\s+(?:a\s+)?cash buffer\b/gi, "Mantén esa parte como caja aparte por ahora")
    .replace(/\bkeep\s+uup(?:\s+as\s+(?:a\s+)?cash buffer)?\.?/gi, "Mantén esa parte como caja aparte por ahora")
    .replace(/\b[A-Z0-9.-]+\s+is the sleeve keeping room to act later\.?/gi, "Esa parte mantiene margen para actuar después.")
    .replace(/\bReview again after healing velocity positive and budget recovers\.?/gi, "Revisar cuando mejore la tendencia y se recupere el presupuesto.")
    .replace(/\bremaining budget falls below ([0-9.]+%)\.?/gi, "el presupuesto restante cae bajo $1.")
    .replace(/\bDo not spend optionality on broad risk adds right now\.?/gi, "No uses el margen flexible para sumar riesgo amplio ahora.")
    .replace(/\bdo not spend optionality\b/gi, "no usar el margen flexible")
    .replace(/\bballast\b/gi, "caja aparte")
    .replace(/\bkeep risk elevated\b/gi, "Mantener riesgo alto, pero selectivo")
    .replace(/\bbroad beta\b/gi, "exposición amplia de mercado")
    .replace(/\bKeep cash flexible\b/gi, "Mantener caja disponible")
    .replace(/\bNo change is needed here unless a cleaner use for that capital appears\.?/gi, "Sin cambios hasta que aparezca un mejor uso para esa caja.")
    .replace(/\bWait for a cleaner state before spending optionality on new risk\.?/gi, "Espera una señal más clara antes de sumar riesgo.")
    .replace(/\bWait for a cleaner state\b/gi, "Esperar una señal más clara")
    .replace(/\bCurrent session\b/gi, "Sesión actual")
    .replace(/\bAvailable to invest\b/gi, "Disponible para invertir")
    .replace(/\bMonthly income\b/gi, "Ingreso mensual")
    .replace(/\bFixed costs\b/gi, "Costos fijos")
    .replace(/\bFixed expenses\b/gi, "Gastos fijos")
    .replace(/\bVariable spending\b/gi, "Gasto variable")
    .replace(/\bVariable expenses\b/gi, "Gasto variable")
    .replace(/\bCash buffer\b/gi, "Caja aparte")
    .replace(/\bTarget contribution\b/gi, "Aporte objetivo")
    .replace(/\bSavings rate\b/gi, "Tasa de ahorro")
    .replace(/\bTarget coverage\b/gi, "Cobertura objetivo")
    .replace(/\bPreserve the reserve sleeve\b/gi, "Mantener caja aparte")
    .replace(/\bPreserve the reserve\b/gi, "Mantener caja aparte")
    .replace(/\bStay\s+patient\b/gi, "Esperar señal más clara")
    .replace(/\bLive read\b/gi, "Lectura en vivo")
    .replace(/\bUsable evidence\b/gi, "Evidencia usable")
    .replace(/\bStressed\b/gi, "Bajo estrés")
    .replace(/\bThin\b/gi, "Limitada")
    .replace(/\bMixed\b/gi, "Mixta")
    .replace(/\bMedium\b/gi, "Medio")
    .replace(/\bHigh\b/gi, "Alto")
    .replace(/\bLow\b/gi, "Bajo")
    .replace(/\bContained\b/gi, "Contenido")
    .replace(/\bUnknown\b/gi, "Sin dato")
    .replace(/\bRecovery\b/gi, "Recuperación")
    .replace(/\bStructural pressure\b/gi, "Presión estructural")
    .replace(/\bShock pressure\b/gi, "Presión de shock")
    .replace(/\bNeed more confirmation\b/gi, "Hace falta más confirmación")
    .replace(/\bnone material\b/gi, "nada material")
    .replace(/\bCounterfactual ledger\b/gi, "Registro contrafactual")
    .replace(/\bSaved to Neon\b/gi, "Guardado")
    .replace(/\bLive sync paused\b/gi, "Sincronización pausada")
    .replace(/\bAwaiting refresh\b/gi, "Esperando actualización")
    .replace(/\bLive\b/gi, "En vivo")
    .replace(/\bdespues\b/gi, "después")
    .replace(/\bestres\b/gi, "estrés")
    .replace(/\bmas\b/gi, "más")
    .replace(/\baun\b/gi, "aún")
    .replace(/\btodavia\b/gi, "todavía");
}

function friendlyWorkspaceMessage(value, fallback = "") {
  const text = cleanWorkspaceCopy(value).trim();
  if (!text) return fallback;
  if (isTechnicalWorkspaceMessage(text)) {
    return fallback || "La actualización de mercado aún está alcanzando. Por ahora se usa la última sesión completa.";
  }
  return text;
}

function isExpiredTimestamp(value) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed < Date.now();
}

function hasDecisionSignal(item) {
  const text = joinedActionText(item);
  if (!text.trim()) return false;
  return !/ballast|no settled outcomes|outcome is still settling|temporarily unavailable/i.test(text);
}

function isActiveEscrowItem(item) {
  return hasDecisionSignal(item) && !isExpiredTimestamp(item?.expiresAt);
}

function isActionableQueueItem(action) {
  const text = joinedActionText(action);
  if (!hasDecisionSignal(action)) return false;
  if (/^blocked$/i.test(String(action?.status || ""))) return false;
  if (/\b(wait|watch|not yet|hold)\b/i.test(text)) return false;
  return Boolean(action?.ticker || action?.title);
}

function isSettledLedgerItem(item) {
  return hasDecisionSignal(item) && Boolean(item?.occurredAt || item?.title || item?.summary);
}

function ComplianceNotice() {
  return (
    <section className={styles.legalNotice}>
      <div>
        <strong>Para planificación e investigación.</strong>
        <p>
          Este espacio ayuda a ordenar caja, contexto de portafolio e investigación. No reemplaza asesoría individual de inversión, impuestos o legal.
        </p>
      </div>
      <Link className={styles.secondaryLink} href="/terms">Términos</Link>
    </section>
  );
}

export default function TerminalApp({ initialSession, initialDashboard }) {
  const workspaceId = initialDashboard?.workspace_summary?.id || initialSession?.workspace?.id;
  const { connection, dashboard, refreshSnapshot, setDashboard } = useWorkspaceLiveData({
    initialDashboard,
    workspaceId,
  });
  const autoRefreshRef = useRef(false);
  const [banner, setBanner] = useState("");
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState(null);
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [activeWorkspaceSection, setActiveWorkspaceSection] = useState(WORKSPACE_NAV[0].id);
  const [portfolioRange, setPortfolioRange] = useState("1M");
  const [financeDraft, setFinanceDraft] = useState(() => financeDraftFromPlan(initialDashboard?.personal_finance));
  const [financeDraftDirty, setFinanceDraftDirty] = useState(false);
  const [holdingDraft, setHoldingDraft] = useState({
    ticker: "",
    sizing: "shares",
    quantity: "",
    targetValueUsd: "",
    price: "",
  });
  const pendingSectionScrollRef = useRef(null);
  const [tradeInstruction, setTradeInstruction] = useState("");
  const [tradeError, setTradeError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!showGlossary) return undefined;

    function handleGlossaryKeydown(event) {
      if (event.key === "Escape") {
        setShowGlossary(false);
      }
    }

    window.addEventListener("keydown", handleGlossaryKeydown);
    return () => window.removeEventListener("keydown", handleGlossaryKeydown);
  }, [showGlossary]);

  const stateSummary = dashboard?.state_summary || {};
  const portfolioModule = dashboard?.modules?.portfolio || null;
  const personalFinance = dashboard?.personal_finance || null;
  const hasPortfolioHoldings = safeList(portfolioModule?.holdings).length > 0;
  const primaryAction = dashboard?.primary_action || null;
  const secondaryActions = hasPortfolioHoldings
    ? safeList(dashboard?.secondary_actions)
      .filter((action) => String(action?.sourceLabel || "").toLowerCase() !== "shared alpha")
      .filter(isActionableQueueItem)
      .slice(0, 4)
    : [];
  const blockedAction = dashboard?.blocked_action || null;
  const escrowItems = safeList(dashboard?.escrow?.items).filter(isActiveEscrowItem).slice(0, 4);
  const ledgerItems = safeList(dashboard?.counterfactual_ledger?.items).filter(isSettledLedgerItem).slice(0, 4);
  const alerts = safeList(dashboard?.decision_workspace?.alerts || dashboard?.alerts).slice(0, 3);
  const workspaceName = normalizeWorkspaceName(
    dashboard?.workspace_summary?.name || initialSession?.workspace?.name || DEFAULT_APP_NAME,
  );
  const holdingsCount = safeList(portfolioModule?.holdings).length;
  const activeSectionConfig = [...WORKSPACE_NAV, ...WORKSPACE_NAV_ADVANCED].find((item) => item.id === activeWorkspaceSection) || WORKSPACE_NAV[0];
  const currentBriefPanel = (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Resumen actual</p>
          <h2>{cleanWorkspaceCopy(stateSummary?.stance || "Esperar señal más clara")}</h2>
          <p className={styles.supportText}>La postura actual en lenguaje simple, junto con la evidencia que todavía la sostiene.</p>
        </div>
      </div>
      <p className={styles.lead}>
        {cleanWorkspaceCopy(
          stateSummary?.decisionSummary
          || "El espacio seguirá mostrando la acción más clara a medida que se actualice el análisis.",
        )}
      </p>
      <InlineList
        emptyLabel="Aun no hay notas de evidencia disponibles."
        items={safeList(dashboard?.evidence_drawer?.currentRead).slice(0, 3)}
      />
    </section>
  );

  const escrowPanel = escrowItems.length ? (
    <CompactActionPanel
      emptyLabel=""
      items={escrowItems}
      kicker="En espera"
      renderItem={(item) => (
        <article className={styles.compactRow} key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <p>{item.summary || item.slot || "Listo cuando quieras."}</p>
            <span>Expira {formatDate(item.expiresAt)}</span>
          </div>
          <div className={styles.compactActions}>
            <button
              className={styles.secondaryButton}
              disabled={pendingKey !== null}
              onClick={() => patchEscrow(item, { action: "execute" }, `${item.title} confirmado.`)}
              type="button"
            >
              {pendingKey === `execute:${item.id}` ? "Confirmando..." : "Confirmar"}
            </button>
            <button
              className={styles.textButton}
              disabled={pendingKey !== null}
              onClick={() => patchEscrow(item, { action: "cancel" }, `${item.title} cancelado.`)}
              type="button"
            >
              {pendingKey === `cancel:${item.id}` ? "Actualizando..." : "Cancelar"}
            </button>
          </div>
        </article>
      )}
      title={`${escrowItems.length} acción${escrowItems.length === 1 ? "" : "es"} guardada${escrowItems.length === 1 ? "" : "s"} para después`}
    />
  ) : null;

  let activeWorkspacePanels = null;
  switch (activeWorkspaceSection) {
    case "risk":
      activeWorkspacePanels = (
        <>
          <PortfolioPanel onRangeChange={setPortfolioRange} portfolioModule={portfolioModule} range={portfolioRange} xray={dashboard?.xray} />
          <SimplePhantomDiversificationPanel portfolioModule={portfolioModule} workspaceId={workspaceId} />
        </>
      );
      break;
    case "candidates":
      activeWorkspacePanels = (
        <>
          <FactorLabWorkspacePanel portfolioModule={portfolioModule} />
          <EquityResearchPanel dashboard={dashboard} workspaceId={workspaceId} />
          <MacroBrainWorkspacePanel />
        </>
      );
      break;
    case "decisions":
      activeWorkspacePanels = (
        <>
          <AlertsPanel alerts={alerts} />
          <TodayDecisionPanel
            blockedAction={blockedAction}
            onDefer={(action) => recordDecision(action, "deferred")}
            onReject={(action) => recordDecision(action, "rejected")}
            onStage={stageAction}
            pendingKey={pendingKey}
            primaryAction={primaryAction}
            stateSummary={stateSummary}
          />
          {escrowPanel}
          {ledgerItems.length ? (
            <CompactActionPanel
              emptyLabel=""
              items={ledgerItems}
              kicker="Actividad"
              renderItem={(item) => (
                <article className={styles.compactRow} key={item.id || item.title}>
                  <div>
                    <strong>{item.title || "Decisión registrada"}</strong>
                    <p>{item.summary || item.note || "El resultado todavía se está asentando."}</p>
                    <span>{formatDateTime(item.occurredAt)}</span>
                  </div>
                  <ToneBadge tone={responseTone(item.userResponse || item.response || "noted")}>
                    {item.resultLabel || capitalize(item.userResponse || item.response, "Registrado")}
                  </ToneBadge>
                </article>
              )}
              title="Historial reciente"
            />
          ) : null}
        </>
      );
      break;
    case "holdings":
      activeWorkspacePanels = (
        <>
          <HoldingsPanel
            holdingDraft={holdingDraft}
            onHoldingDraftChange={updateHoldingDraft}
            onSubmitHoldingDraft={submitHoldingDraft}
            onSubmitTrade={submitTradeInstruction}
            onTradeInstructionChange={setTradeInstruction}
            pendingTrade={Boolean(pendingKey?.startsWith("trade:"))}
            portfolioModule={portfolioModule}
            tradeError={tradeError}
            tradeInstruction={tradeInstruction}
          />
        </>
      );
      break;
    case "today":
    default:
      activeWorkspacePanels = (
        <>
          <AlertsPanel alerts={alerts} />
          <TodayDecisionPanel
            blockedAction={blockedAction}
            onDefer={(action) => recordDecision(action, "deferred")}
            onReject={(action) => recordDecision(action, "rejected")}
            onStage={stageAction}
            pendingKey={pendingKey}
            primaryAction={primaryAction}
            stateSummary={stateSummary}
          />
          {escrowPanel}
          {currentBriefPanel}
          {ledgerItems.length ? (
            <CompactActionPanel
              emptyLabel=""
              items={ledgerItems}
              kicker="Actividad"
              renderItem={(item) => (
                <article className={styles.compactRow} key={item.id || item.title}>
                  <div>
                    <strong>{item.title || "Evento de decisión"}</strong>
                    <p>{item.summary || item.note || "El resultado todavía se está asentando."}</p>
                    <span>{formatDateTime(item.occurredAt)}</span>
                  </div>
                  <ToneBadge tone={responseTone(item.userResponse || item.response || "noted")}>
                    {item.resultLabel || capitalize(item.userResponse || item.response, "Registrado")}
                  </ToneBadge>
                </article>
              )}
              title="Resultados recientes"
            />
          ) : null}
        </>
      );
      break;
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function applyHashSection() {
      const raw = window.location.hash.replace(/^#/, "");
      const hashSection = LEGACY_HASH_REDIRECT[raw] || raw;
      if (!ALL_NAV_IDS.includes(hashSection)) return;
      if (hashSection !== raw) {
        window.history.replaceState(null, "", `#${hashSection}`);
      }
      pendingSectionScrollRef.current = hashSection;
      setActiveWorkspaceSection(hashSection);
    }

    applyHashSection();
    window.addEventListener("hashchange", applyHashSection);
    return () => window.removeEventListener("hashchange", applyHashSection);
  }, []);

  useEffect(() => {
    if (pendingSectionScrollRef.current !== activeWorkspaceSection) return;
    pendingSectionScrollRef.current = null;
    scrollWorkspaceSection(activeWorkspaceSection);
  }, [activeWorkspaceSection]);

  useEffect(() => {
    if (financeDraftDirty) return;
    setFinanceDraft(financeDraftFromPlan(personalFinance));
  }, [
    personalFinance?.inputs?.updatedAt,
    personalFinance?.inputs?.monthlyIncome,
    personalFinance?.inputs?.fixedExpenses,
    personalFinance?.inputs?.variableExpenses,
    personalFinance?.inputs?.safetyBuffer,
    personalFinance?.inputs?.targetMonthlyInvestment,
    personalFinance?.inputs?.baseCurrency,
  ]);

  function scrollWorkspaceSection(sectionId) {
    if (typeof window === "undefined") return;

    window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function selectWorkspaceSection(sectionId) {
    const nextSection = ALL_NAV_IDS.includes(sectionId) ? sectionId : null;
    if (!nextSection) return;

    pendingSectionScrollRef.current = nextSection;
    setActiveWorkspaceSection(nextSection);

    if (typeof window !== "undefined" && window.location.hash !== `#${nextSection}`) {
      window.history.replaceState(null, "", `#${nextSection}`);
    }

    if (nextSection === activeWorkspaceSection) {
      pendingSectionScrollRef.current = null;
      scrollWorkspaceSection(nextSection);
    }
  }

  async function applyWorkspacePayload(payload, successMessage) {
    startTransition(() => {
      setDashboard(payload);
    });
    if (successMessage) setBanner(cleanWorkspaceCopy(successMessage));
  }

  async function requestLiveRefresh() {
    const refreshResponse = await fetch("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const refreshPayload = await parseResponse(refreshResponse);
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    const latestWorkspace = await refreshSnapshot();

    return {
      ...latestWorkspace,
      __refreshMessage:
        latestWorkspace?.workspace_summary?.last_updated
        && latestWorkspace.workspace_summary.last_updated !== dashboard?.workspace_summary?.last_updated
          ? "Sesión de mercado actualizada."
          : friendlyWorkspaceMessage(
            refreshPayload?.message,
            "Actualizando la última sesión de mercado en segundo plano.",
          ),
    };
  }

  async function runWorkspaceAction(key, requestFactory, successMessage) {
    if (!workspaceId) return;

    setPendingKey(key);
    setError("");
    if (!String(key).startsWith("trade:")) {
      setTradeError("");
    }

    try {
      const payload = await requestFactory();
      const nextBanner = payload?.__refreshMessage || successMessage;
      await applyWorkspacePayload(payload, nextBanner);
    } catch (requestError) {
      setError(friendlyWorkspaceMessage(requestError?.message || requestError, "La solicitud fallo."));
    } finally {
      setPendingKey(null);
    }
  }

  async function refreshWorkspace() {
    await runWorkspaceAction(
      "refresh",
      requestLiveRefresh,
      "Actualizando la última sesión de mercado.",
    );
  }

  useEffect(() => {
    if (!workspaceId || autoRefreshRef.current || !needsAutoRefresh(dashboard?.workspace_summary)) return;
    autoRefreshRef.current = true;
    setBanner("Sincronizando la última sesión de mercado...");

    void requestLiveRefresh()
      .then((payload) => applyWorkspacePayload(payload, payload?.__refreshMessage || "Sesión de mercado actualizada."))
      .catch(() => {
        setBanner("No se pudo actualizar al entrar. Por ahora se usa la última sesión completa.");
      });
  }, [
    dashboard?.workspace_summary?.last_updated,
    dashboard?.workspace_summary?.market_data_as_of,
    workspaceId,
  ]);

  function updateFinanceDraft(field, value) {
    setFinanceDraftDirty(true);
    setFinanceDraft((current) => ({
      ...current,
      [field]: field === "baseCurrency" ? sanitizeCurrencyInput(value) : sanitizeDecimalInput(value),
    }));
  }

  async function submitFinanceDraft() {
    if (!workspaceId) return;

    setPendingKey("finance-plan");
    setError("");

    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/finance-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyIncome: draftMoney(financeDraft.monthlyIncome),
          fixedExpenses: draftMoney(financeDraft.fixedExpenses),
          variableExpenses: draftMoney(financeDraft.variableExpenses),
          safetyBuffer: draftMoney(financeDraft.safetyBuffer),
          targetMonthlyInvestment: draftMoney(financeDraft.targetMonthlyInvestment),
          baseCurrency: financeDraft.baseCurrency || "USD",
        }),
      });
      const payload = await parseResponse(response);
      await applyWorkspacePayload(payload, "Plan mensual guardado.");
      setFinanceDraftDirty(false);
    } catch (requestError) {
      setError(friendlyWorkspaceMessage(requestError?.message || requestError, "No se pudo actualizar el plan de dinero."));
    } finally {
      setPendingKey(null);
    }
  }

  function updateHoldingDraft(field, value) {
    setHoldingDraft((current) => {
      if (field === "sizing") {
        return {
          ...current,
          sizing: value === "value" ? "value" : "shares",
        };
      }

      if (field === "ticker") {
        return {
          ...current,
          ticker: sanitizeTickerInput(value),
        };
      }

      if (field === "quantity" || field === "targetValueUsd" || field === "price") {
        return {
          ...current,
          [field]: sanitizeDecimalInput(value),
        };
      }

      return current;
    });
  }

  function resetHoldingDraft() {
    setHoldingDraft({
      ticker: "",
      sizing: "shares",
      quantity: "",
      targetValueUsd: "",
      price: "",
    });
  }

  async function submitHoldingDraft() {
    const ticker = sanitizeTickerInput(holdingDraft.ticker);
    const quantityText = String(holdingDraft.quantity || "").trim();
    const targetValueText = String(holdingDraft.targetValueUsd || "").trim();
    const priceText = String(holdingDraft.price || "").trim();
    const useQuantity = holdingDraft.sizing !== "value";
    const hasSizedValue = useQuantity ? quantityText !== "" : targetValueText !== "";

    if (!workspaceId || !ticker || !hasSizedValue) return;

    setPendingKey(`trade:${ticker}`);
    setTradeError("");
    setError("");

    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/portfolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          ...(useQuantity ? { quantity: Number(quantityText) } : { targetValueUsd: Number(targetValueText) }),
          ...(priceText ? { price: Number(priceText) } : {}),
        }),
      });
      const payload = await parseResponse(response);
      await applyWorkspacePayload(payload, payload?.holdings_update?.sync_label || "Posiciones guardadas.");
      resetHoldingDraft();
    } catch (requestError) {
      setTradeError(friendlyWorkspaceMessage(requestError?.message || requestError, "No se pudo actualizar la posición."));
    } finally {
      setPendingKey(null);
    }
  }

  async function submitTradeInstruction() {
    const trimmed = String(tradeInstruction || "").trim();
    if (!workspaceId || !trimmed) return;

    setPendingKey(`trade:${trimmed}`);
    setTradeError("");
    setError("");

    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/portfolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: trimmed }),
      });
      const payload = await parseResponse(response);
      await applyWorkspacePayload(payload, payload?.holdings_update?.sync_label || "Posiciones guardadas.");
      setTradeInstruction("");
    } catch (requestError) {
      setTradeError(friendlyWorkspaceMessage(requestError?.message || requestError, "No se pudo actualizar la operacion."));
    } finally {
      setPendingKey(null);
    }
  }

  async function stageAction(action) {
    await runWorkspaceAction(
      `stage:${action.id}`,
      async () => {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/escrow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            stateSummary,
          }),
        });
        return parseResponse(response);
      },
      `${action.title} moved into escrow.`,
    );
  }

  async function recordDecision(action, userResponse) {
    await runWorkspaceAction(
      `${userResponse}:${action.id}`,
      async () => {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/decisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            userResponse,
            stateSummary,
          }),
        });
        return parseResponse(response);
      },
      `${action.title} marcado como ${capitalize(userResponse, "Registrado").toLowerCase()}.`,
    );
  }

  async function patchEscrow(item, payload, successMessage) {
    await runWorkspaceAction(
      `${payload.action || "update"}:${item.id}`,
      async () => {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/escrow/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            stateSummary,
          }),
        });
        return parseResponse(response);
      },
      successMessage,
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.backdrop} aria-hidden="true" />

      <div className={styles.workspaceFrame}>
        <aside className={styles.sideColumn}>
          <WorkspaceSidebar
            activeSection={activeWorkspaceSection}
            alertCount={alerts.length}
            holdingsCount={holdingsCount}
            onOpenChat={() => setShowChat(true)}
            onOpenGlossary={() => setShowGlossary(true)}
            onOpenGuide={() => setShowWelcomeGuide(true)}
            onSelectSection={selectWorkspaceSection}
            showChat={showChat}
            stagedCount={escrowItems.length}
            workspaceName={workspaceName}
          />
        </aside>

        <div className={styles.workspaceContent}>
          <header className={styles.header}>
          <div>
              <p className={styles.eyebrow}>Espacio privado</p>
              <h1>{workspaceName}</h1>
              <p className={styles.subtitle}>Lectura clara. Una decisión a la vez.</p>
            </div>

            <div className={styles.headerActions}>
              <div className={styles.headerMeta}>
                <ToneBadge tone="neutral">{initialSession?.user?.name || "Usuario"}</ToneBadge>
                <ToneBadge tone={statusTone(dashboard?.workspace_summary?.backend_status)}>
                  {capitalize(cleanWorkspaceCopy(dashboard?.workspace_summary?.backend_status || "En vivo"))}
                </ToneBadge>
                <ToneBadge tone={connection.status === "live" ? "good" : connection.status === "polling" || connection.status === "warn" ? "warn" : "neutral"}>
                  {connection.label}
                </ToneBadge>
                <ToneBadge tone="neutral">{dashboard?.workspace_summary?.last_updated_label || "Sin hora de actualización"}</ToneBadge>
              </div>

              <div className={styles.buttonRow}>
                <button className={styles.primaryButton} disabled={pendingKey !== null} onClick={refreshWorkspace} type="button">
                  {pendingKey === "refresh" ? "Actualizando..." : "Actualizar"}
                </button>
                <form action="/api/auth/logout" method="post">
                  <button className={styles.textButton} type="submit">Cerrar sesión</button>
                </form>
              </div>
            </div>
          </header>

          {banner ? <div className={styles.banner}>{banner}</div> : null}
          {error ? <div className={styles.banner} data-tone="error">{error}</div> : null}

          {showWelcomeGuide && (
            <div className={styles.welcomeGuide}>
              <div className={styles.welcomeGuideInner}>
                <div className={styles.welcomeGuideHead}>
                  <span className={styles.welcomeGuideBadge}>Primer uso</span>
                  <button
                    aria-label="Cerrar guía inicial"
                    className={styles.welcomeGuideClose}
                    onClick={() => setShowWelcomeGuide(false)}
                    type="button"
                  >
                    Cerrar
                  </button>
                </div>
                <h2 className={styles.welcomeGuideTitle}>Tu espacio de decisión</h2>
                <p className={styles.welcomeGuideSubtitle}>
                  Tres pasos para recibir una lectura clara sin conocimiento técnico.
                </p>
                <ol className={styles.welcomeSteps}>
                  <li className={styles.welcomeStep}>
                    <span className={styles.welcomeStepNum}>1</span>
                    <div>
                      <strong>Agrega tus posiciones</strong>
                      <p>Dos o tres posiciones bastan para desbloquear la lectura en vivo.</p>
                    </div>
                  </li>
                  <li className={styles.welcomeStep}>
                    <span className={styles.welcomeStepNum}>2</span>
                    <div>
                      <strong>Lee el resumen de hoy</strong>
                      <p>La lectura en vivo responde qué domina tu portafolio y qué merece atención ahora.</p>
                    </div>
                  </li>
                  <li className={styles.welcomeStep}>
                    <span className={styles.welcomeStepNum}>3</span>
                    <div>
                      <strong>Registra tus decisiones</strong>
                      <p>Guarda lo que decidiste y por qué. Revísalo después para aprender del resultado.</p>
                    </div>
                  </li>
                </ol>
                <div className={styles.welcomeGuideFoot}>
                  <button
                    className={styles.welcomeGuideBtn}
                    onClick={() => setShowGlossary(true)}
                    type="button"
                  >
                    Abrir glosario
                  </button>
                  <button
                    className={styles.welcomeGuideDismiss}
                    onClick={() => setShowWelcomeGuide(false)}
                    type="button"
                  >
                    Ocultar guía
                  </button>
                </div>
              </div>
            </div>
          )}

          {showGlossary && (
            <div
              className={styles.glossaryOverlay}
              role="dialog"
              aria-label="Glosario de términos"
              aria-modal="true"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setShowGlossary(false);
                }
              }}
            >
              <div className={styles.glossaryPanel}>
                <div className={styles.glossaryPanelHead}>
                  <h2>Glosario simple</h2>
                  <button
                    aria-label="Cerrar glosario"
                    className={styles.glossaryCloseButton}
                    data-testid="glossary-close"
                    onClick={() => setShowGlossary(false)}
                    type="button"
                  >
                    Cerrar glosario
                  </button>
                </div>
                <p className={styles.glossaryPanelSub}>Cada término raro que usa este espacio, explicado sin jerga.</p>
                <dl className={styles.glossaryList}>
                  {[
                    { term: "Solapamiento de riesgo", def: "Cuando posiciones que se ven distintas reaccionan al mismo shock de mercado." },
                    { term: "Diversificación visible", def: "Lo amplio que parece el portafolio al mirar pesos y cantidad de nombres." },
                    { term: "Diversificación real", def: "La parte de esa amplitud que sigue funcionando cuando las posiciones empiezan a moverse juntas." },
                    { term: "Solapamiento oculto", def: "Diversificación que parecía existir, pero no queda probada bajo estrés." },
                    { term: "Candidatos", def: "Ideas filtradas con reglas revisables. Ordenadas por señal más fuerte; descarta cálculos que usen datos del futuro." },
                    { term: "Señal rechazada", def: "Un filtro que usaría información posterior a la fecha de decisión. Se descarta para mantener el análisis honesto." },
                    { term: "Acciones en espera", def: "Decisiones guardadas para revisar después; no son operaciones ejecutadas." },
                  ].map(({ term, def }) => (
                    <div className={styles.glossaryEntry} key={term}>
                      <dt className={styles.glossaryTerm}>{term}</dt>
                      <dd className={styles.glossaryDef}>{def}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          <TruthInterfacePanel
            blockedAction={blockedAction}
            dashboard={dashboard}
            onSelectSection={selectWorkspaceSection}
            personalFinance={personalFinance}
            portfolioModule={portfolioModule}
            primaryAction={primaryAction}
            showChat={showChat}
            stateSummary={stateSummary}
            onToggleChat={() => setShowChat((value) => !value)}
          />

          <section className={styles.statusGrid}>
            <MetricTile
              detail={holdingsCount ? "Conectadas a este espacio." : "Agrega posiciones para desbloquear la lectura."}
              label="Posiciones"
              tone={holdingsCount ? "good" : "warn"}
              value={holdingsCount ? `${holdingsCount} nombre${holdingsCount === 1 ? "" : "s"}` : "Sin posiciones"}
            />
            <MetricTile
              detail="Última fecha de mercado cargada."
              label="Foto de mercado"
              tone="neutral"
              value={dashboard?.workspace_summary?.market_data_label || "Sin fecha"}
            />
            <MetricTile
              detail={cleanWorkspaceCopy(stateSummary?.decisionSummary || connection.detail || "Listo para la próxima decisión.")}
              label="Postura"
              tone={statusTone(primaryAction?.status || connection.status || "neutral")}
              value={cleanWorkspaceCopy(stateSummary?.stance || connection.label || "En vivo")}
            />
            <MetricTile
              detail={escrowItems.length ? "Guardadas para después." : "Sin acciones en espera."}
              label="En espera"
              tone={escrowItems.length ? "warn" : "neutral"}
              value={escrowItems.length ? `${escrowItems.length} acción${escrowItems.length === 1 ? "" : "es"}` : "—"}
            />
          </section>

          <ComplianceNotice />

          <section className={styles.mainColumn}>
          <div className={styles.workspaceStageHeader}>
            <div>
              <p className={styles.kicker}>{activeSectionConfig.label}</p>
              <h2>{activeSectionConfig.title}</h2>
              <p className={styles.supportText}>{activeSectionConfig.body}</p>
            </div>
            <div className={styles.workspaceStageMeta}>
              <ToneBadge tone="neutral">{activeSectionConfig.detail}</ToneBadge>
              <ToneBadge tone={connection.status === "live" ? "good" : connection.status === "polling" || connection.status === "warn" ? "warn" : "neutral"}>
                {connection.label}
              </ToneBadge>
            </div>
          </div>

          <div className={styles.sectionAnchor} id={activeSectionConfig.id}>
            {activeWorkspacePanels}
          </div>
        </section>
        </div>
      </div>

      {isPending ? <div className={styles.pendingNote}>Aplicando actualizacion...</div> : null}

      {showChat && (
        <PortfolioChat
          dashboard={dashboard}
          onClose={() => setShowChat(false)}
          workspaceId={workspaceId}
        />
      )}
    </main>
  );
}
