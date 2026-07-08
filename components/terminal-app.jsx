"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

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
import { useLanguagePreference } from "@/components/language-layer";
import { InfoTip } from "@/components/ui/info-tip";
import { PlainMetric } from "@/components/ui/plain-metric";
import { macroBrainSnapshot } from "@/lib/macro-brain-snapshot";
import { mosaicObservatorySnapshot } from "@/lib/mosaic-observatory-snapshot";

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
    id: "macro",
    href: "#macro",
    label: "Macro",
    priority: "Contexto",
    detail: "MOSAIC y tesis",
    title: "¿Qué está cambiando afuera?",
    body: "Presiones globales, datos macro y tesis que pueden tocar el portafolio.",
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

const WORKSPACE_SHELL_COPY = {
  en: {
    sidebarAria: "Workspace navigation",
    sidebarSupport: "Private decision workspace.",
    auroraDetail: "Valuation, business quality, and thesis",
    principal: "Main",
    holdings: "Positions",
    staged: "Waiting",
    ask: "Ask workspace",
    glossary: "Glossary",
    guide: "Guide",
    hideAdvanced: "Hide advanced",
    advanced: "Advanced",
    terms: "Terms",
    home: "Home",
    privateSpace: "Private workspace",
    subtitle: "Clear read. One decision at a time.",
    userFallback: "User",
    liveFallback: "Live",
    noUpdate: "No update time",
    refreshing: "Refreshing...",
    refresh: "Refresh",
    logout: "Log out",
    syncedStatus: ({ count, date }) => {
      const label = String(date || "");
      const looksLikeStatus = /waiting|update|unavailable|no update|esperando|sin /i.test(label);
      return `Portfolio synced | ${count} positions | ${looksLikeStatus || !label ? label || "no update time" : `data as of ${label}`}`;
    },
    nav: {
      today: ["Today", "Read and act", "What should I do today?", "Live read and the move that deserves attention now.", "Start"],
      risk: ["My biggest risk", "Portfolio stress", "What dominates my portfolio?", "Performance, concentration, and real diversification under stress.", "Audit"],
      macro: ["Macro", "Outside context", "What is changing outside?", "Global pressure, macro data, and theses that can touch the portfolio.", "Context"],
      candidates: ["Candidates", "Screen and research", "What deserves a look?", "Filtered candidates, company research, and macro signals.", "Explore"],
      decisions: ["Decisions", "History and pending", "What have I decided and why?", "Prepared actions and recorded decisions.", "Log"],
      holdings: ["Holdings", "Edit positions", "Positions and direct editing", "Review, add, and edit positions connected to the workspace.", "Update"],
    },
  },
  es: {
    sidebarAria: "Navegación del espacio",
    sidebarSupport: "Espacio privado de decisión.",
    auroraDetail: "Valoración, calidad de negocio y tesis",
    principal: "Principal",
    holdings: "Posiciones",
    staged: "En espera",
    ask: "Preguntar al espacio",
    glossary: "Glosario",
    guide: "Guía",
    hideAdvanced: "Ocultar avanzado",
    advanced: "Avanzado",
    terms: "Términos",
    home: "Inicio",
    privateSpace: "Espacio privado",
    subtitle: "Lectura clara. Una decisión a la vez.",
    userFallback: "Usuario",
    liveFallback: "En vivo",
    noUpdate: "Sin hora de actualización",
    refreshing: "Actualizando...",
    refresh: "Actualizar",
    logout: "Cerrar sesión",
    syncedStatus: ({ count, date }) => {
      const label = String(date || "");
      const looksLikeStatus = /waiting|update|unavailable|esperando|actualizaci|sin /i.test(label);
      return `Portafolio sincronizado | ${count} posiciones | ${looksLikeStatus || !label ? label || "sin hora de actualización" : `datos al ${label}`}`;
    },
    nav: {
      today: ["Hoy", "Leer y actuar", "¿Qué hago hoy?", "La lectura en vivo y el movimiento que merece atención ahora.", "Inicio"],
      risk: ["Mi mayor riesgo", "Stress de cartera", "¿Qué domina mi portafolio?", "Rendimiento, concentración y diversificación real bajo stress.", "Auditar"],
      macro: ["Macro", "Contexto externo", "¿Qué está cambiando afuera?", "Presiones globales, datos macro y tesis que pueden tocar el portafolio.", "Contexto"],
      candidates: ["Candidatos", "Filtrar e investigar", "¿Qué vale la pena mirar?", "Candidatos filtrados, research de compañía y señales macro.", "Explorar"],
      decisions: ["Decisiones", "Historial y pendientes", "¿Qué he decidido y por qué?", "Acciones preparadas y decisiones registradas.", "Registrar"],
      holdings: ["Posiciones", "Editar cartera", "Posiciones y edición directa", "Revisa, agrega y edita posiciones conectadas al espacio.", "Actualizar"],
    },
  },
};

function localizedWorkspaceNav(baseItems, language) {
  const copy = WORKSPACE_SHELL_COPY[language] || WORKSPACE_SHELL_COPY.es;
  return baseItems.map((item) => {
    const [label, detail, title, body, priority] = copy.nav[item.id] || [];
    return {
      ...item,
      body: body || item.body,
      detail: detail || item.detail,
      label: label || item.label,
      priority: priority || item.priority,
      title: title || item.title,
    };
  });
}

const LEGACY_HASH_REDIRECT = {
  cashflow: "today",
  money: "today",
  portfolio: "risk",
  diversification: "risk",
  stress: "risk",
  "stress-engine": "risk",
  research: "candidates",
  factorlab: "candidates",
  macrobrain: "macro",
  mosaic: "macro",
  positions: "holdings",
  cartera: "holdings",
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

function RangeTabs({ value, onChange, language = "es" }) {
  const rangeLabels = language === "en"
    ? { ALL: "Since start" }
    : { "1W": "1S", ALL: "Inicio" };

  return (
    <div className={styles.rangeTabs} role="group" aria-label="Rango de cartera">
      {PORTFOLIO_RANGES.map((option) => (
        <button
          key={option}
          className={styles.rangeButton}
          aria-pressed={value === option}
          data-active={value === option}
          onClick={() => onChange(option)}
          type="button"
        >
          {rangeLabels[option] || option}
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
  const readChartNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const readIndexPoint = (value) => {
    const parsed = readChartNumber(value);
    return parsed !== null && parsed > 0 ? parsed : null;
  };

  const rows = safeList(series)
    .map((row, index) => {
      const parsedDate = row?.date ? new Date(row.date) : null;
      return {
        id: `${row?.date || "point"}-${index}`,
        date: row.date,
        timestamp: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getTime() : null,
        portfolio: readIndexPoint(row.portfolio),
        benchmark: readIndexPoint(row.benchmark),
      };
    })
    .filter((row) => Number.isFinite(row.portfolio) || Number.isFinite(row.benchmark));

  const portfolioPoints = rows.filter((row) => Number.isFinite(row.portfolio));
  const benchmarkPoints = rows.filter((row) => Number.isFinite(row.benchmark));

  const usablePointCount = Math.max(portfolioPoints.length, benchmarkPoints.length);

  if (usablePointCount < 3) {
    return (
      <div className={styles.chartEmptyState}>
        <strong>El historial real todavía es corto</strong>
        <p>Se necesitan al menos tres fotos válidas del valor de cartera antes de dibujar una trayectoria. La serie no inventa retornos faltantes ni convierte huecos en cero.</p>
      </div>
    );
  }

  const normalizeSeries = (points, key) => {
    const validPoints = points.filter((point) => Number.isFinite(point?.[key]));
    const first = Number(validPoints[0]?.[key]);
    if (!Number.isFinite(first)) return [];
    const indexLike = first > 0.5 && validPoints.every((point) => Number(point?.[key]) > 0);
    return validPoints.map((point) => ({
      ...point,
      display: indexLike ? (Number(point[key]) / first) - 1 : Number(point[key]) - first,
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
          <small>{detractors.length ? "Dónde sigue la pérdida no realizada" : "Sin lastres registrados ahora"}</small>
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

function cleanPortfolioLabel(value, fallback = "Sin clasificar") {
  const raw = String(value || "").trim();
  if (!raw || /^(unknown|n\/a|na|null|undefined)$/i.test(raw)) return fallback;
  return cleanWorkspaceCopy(raw);
}

function holdingName(holding) {
  return cleanPortfolioLabel(holding?.company || holding?.sector || holding?.assetType, "Posición");
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
  return cleanPortfolioLabel(holding?.theme || holding?.sector, "Sin nota cargada.");
}

function buildPortfolioExposures(holdings, key) {
  const groups = new Map();
  for (const holding of safeList(holdings)) {
    const label = cleanPortfolioLabel(holding?.[key], "Sin clasificar");
    const value = holdingAnalysisValue(holding);
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
      flagLabel: holdingReviewFlag(holding),
      triggerLabel: holdingReviewTrigger(holding),
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
      rawValue: Number.isFinite(Number(row.value)) ? Number(row.value) : null,
      value: Number.isFinite(Number(row.value)) ? formatSignedPct(row.value) : "-",
      tone: Number(row.value) < 0 ? "bad" : Number(row.value) > 0 ? "good" : "neutral",
    }));
  if (explicit.length) return explicit.slice(0, 5);

  const weightedDay = safeList(holdings).reduce((sum, holding) => {
    const day = Number(holding?.dayReturn);
    return sum + (Number.isFinite(day) ? day * holdingWeightValue(holding) : 0);
  }, 0);
  return [
    { label: "Hoy", rawValue: weightedDay || null, value: weightedDay ? formatSignedPct(weightedDay) : "-", tone: weightedDay < 0 ? "bad" : weightedDay > 0 ? "good" : "neutral" },
    { label: "1 semana", rawValue: null, value: "-", tone: "neutral" },
    { label: "1 mes", rawValue: null, value: "-", tone: "neutral" },
    { label: "Año", rawValue: null, value: "-", tone: "neutral" },
    {
      label: "Desde inicio",
      rawValue: analytics?.totalReturnInclDividends !== null && analytics?.totalReturnInclDividends !== undefined
        ? Number(analytics.totalReturnInclDividends)
        : null,
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

function firstFiniteNumber(...values) {
  for (const value of values) {
    const parsed = numericValue(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function holdingAnalysisValue(holding) {
  return firstFiniteNumber(holding?.analysisValueUsd, holding?.marketValueUsd, holding?.brokerValueUsd);
}

function holdingCostBasis(holding) {
  return firstFiniteNumber(holding?.costBasisUsd);
}

function holdingTotalPnlInclDividends(holding) {
  const direct = firstFiniteNumber(holding?.totalPnlInclDividendsUsd);
  if (direct !== null) return direct;
  const unrealized = firstFiniteNumber(holding?.unrealizedPnlUsd);
  const dividends = firstFiniteNumber(holding?.dividendsReceivedUsd);
  if (unrealized === null && dividends === null) return null;
  return (unrealized || 0) + (dividends || 0);
}

function holdingTotalReturnInclDividends(holding) {
  const direct = firstFiniteNumber(holding?.totalReturnInclDividends);
  if (direct !== null) return direct;
  const costBasis = holdingCostBasis(holding);
  const pnl = holdingTotalPnlInclDividends(holding);
  return costBasis && pnl !== null ? pnl / costBasis : null;
}

function holdingValueSourceLabel(holding) {
  const source = cleanPortfolioLabel(holding?.valueSource, "");
  if (/live|google|price|mercado|market/i.test(source)) return "Precio vivo";
  if (/broker|snapshot|captura/i.test(source)) return "Snapshot broker";
  if (source) return source;
  if (firstFiniteNumber(holding?.currentPriceUsd) !== null) return "Precio vivo";
  if (firstFiniteNumber(holding?.brokerValueUsd) !== null) return "Snapshot broker";
  return "Sin fuente";
}

function holdingReviewFlag(holding) {
  const weight = holdingWeightValue(holding);
  const risk = Number(holding?.riskScore);
  if (weight > 0.25) return "Concentración";
  if (Number.isFinite(risk) && risk >= 4) return "Riesgo alto";
  return "Normal";
}

function holdingReviewTrigger(holding) {
  if (holding?.nextReviewTrigger) return cleanWorkspaceCopy(holding.nextReviewTrigger);
  const weight = holdingWeightValue(holding);
  const risk = Number(holding?.riskScore);
  if (weight > 0.25) return "Revisar tamaño y banda de rebalanceo.";
  if (Number.isFinite(risk) && risk >= 4) return "Revisar tras resultados o movimiento mayor a 15%.";
  return "Revisión trimestral.";
}

function formatMarketCap(value) {
  const parsed = numericValue(value);
  if (parsed === null) return "-";
  if (Math.abs(parsed) >= 1_000_000_000_000) return `${(parsed / 1_000_000_000_000).toFixed(1)} T`;
  if (Math.abs(parsed) >= 1_000_000_000) return `${(parsed / 1_000_000_000).toFixed(0)} B`;
  if (Math.abs(parsed) >= 1_000_000) return `${(parsed / 1_000_000).toFixed(0)} M`;
  return formatCurrency(parsed);
}

function formatRatio(value, suffix = "x") {
  const parsed = numericValue(value);
  if (parsed === null) return "-";
  return `${parsed.toFixed(Math.abs(parsed) >= 10 ? 1 : 2)}${suffix}`;
}

function holdingMarketMetaLabel(holding) {
  const parts = [];
  if (firstFiniteNumber(holding?.marketCapUsd) !== null) parts.push(`Cap ${formatMarketCap(holding.marketCapUsd)}`);
  if (firstFiniteNumber(holding?.peRatio) !== null) parts.push(`P/E ${formatRatio(holding.peRatio)}`);
  if (firstFiniteNumber(holding?.eps) !== null) parts.push(`EPS ${formatCurrency(holding.eps)}`);
  return parts.join(" · ");
}

function formatFxRate(value) {
  const parsed = numericValue(value);
  if (parsed === null) return "-";
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(parsed);
}

function buildPortfolioExecutiveRead({ analytics, holdings, hasDayPnl, dayPnl, topHolding, reviewQueue }) {
  if (!safeList(holdings).length) return [];
  const totalValue = firstFiniteNumber(analytics?.totalValueUsd);
  const totalReturn = firstFiniteNumber(analytics?.totalReturnInclDividends, analytics?.unrealizedReturn);
  const liveCount = safeList(holdings).filter((holding) => holdingValueSourceLabel(holding) === "Precio vivo").length;
  const snapshotCount = safeList(holdings).filter((holding) => holdingValueSourceLabel(holding) === "Snapshot broker").length;
  const bullets = [];
  bullets.push(
    totalReturn !== null
      ? `La cartera vale ${compactCurrency(totalValue)} y acumula ${formatSignedPct(totalReturn)} incluyendo dividendos y P&L realizado cuando está disponible.`
      : `La cartera vale ${compactCurrency(totalValue)}; falta costo base suficiente para calcular retorno total confiable.`,
  );
  if (topHolding) {
    const weight = holdingWeightValue(topHolding);
    bullets.push(`${topHolding.ticker} es el mayor peso (${compactPercent(weight)}). ${weight > 0.25 ? "Requiere revisión de concentración." : "No supera el umbral crítico de 25%."}`);
  }
  if (hasDayPnl) {
    bullets.push(`El movimiento intradía agregado es ${formatCurrency(dayPnl)}; úsalo solo como lectura táctica, no como tesis.`);
  } else {
    bullets.push("No hay movimiento intradía útil; la pantalla no convierte datos ausentes en 0%.");
  }
  if (liveCount || snapshotCount) {
    bullets.push(`${liveCount} posiciones usan precio vivo y ${snapshotCount} usan snapshot del broker; la fuente queda visible por holding.`);
  }
  const reviewCount = safeList(reviewQueue).filter((holding) => holding.flagLabel !== "Normal").length;
  if (reviewCount) bullets.push(`${reviewCount} posiciones entran a revisión por concentración o riesgo alto.`);
  return bullets.slice(0, 5);
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

  const segments = rows;
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
      <div className={styles.portfolioMiniHead}>
        <div>
          <p className={styles.kicker}>Asignación</p>
          <strong>{donut.rows.length ? "Por holding" : "-"}</strong>
        </div>
      </div>
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
          <p className={styles.kicker}>Top holdings</p>
          <h3>{holdings.length ? "Valor, retorno y próxima acción" : "Sin posiciones"}</h3>
        </div>
      </div>
      {rows.length ? (
        <div aria-label="Resumen de posiciones de cartera" className={styles.portfolioMatrix} role="table">
          <div className={styles.portfolioMatrixHead} role="row">
            <span role="columnheader">Nombre</span>
            <span role="columnheader">Tema</span>
            <span role="columnheader">Peso</span>
            <span role="columnheader">Valor</span>
            <span role="columnheader">Costo</span>
            <span role="columnheader">Retorno total</span>
            <span role="columnheader">Fuente</span>
            <span role="columnheader">Acción</span>
          </div>
          <div role="rowgroup">
            {rows.map((holding) => {
              const totalReturn = holdingTotalReturnInclDividends(holding);
              const totalPnl = holdingTotalPnlInclDividends(holding);
              return (
                <article className={styles.portfolioMatrixRow} key={`portfolio-matrix-${holding.ticker}`} role="row">
                  <div role="cell">
                    <strong>{holding.ticker}</strong>
                    <span>{holdingName(holding)}</span>
                  </div>
                  <span role="cell">{cleanPortfolioLabel(holding.theme || holding.sector || holding.region, "-")}</span>
                  <strong role="cell">{holding.weight || compactPercent(holdingWeightValue(holding))}</strong>
                  <strong role="cell">{compactCurrency(holdingAnalysisValue(holding))}</strong>
                  <span role="cell">{compactCurrency(holdingCostBasis(holding))}</span>
                  <strong data-tone={signedMoneyTone(totalPnl)} role="cell">
                    {totalReturn !== null ? `${formatSignedPct(totalReturn)} (${compactCurrency(totalPnl)})` : "-"}
                  </strong>
                  <span role="cell">{holdingValueSourceLabel(holding)}</span>
                  <span role="cell">{holdingActionLabel(holding)}</span>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <p className={styles.emptyCopy}>Agrega posiciones para ver pesos, valor y revisión.</p>
      )}
    </section>
  );
}

function PortfolioHorizonPanel({ analytics, holdings, returns }) {
  const rows = buildPortfolioHorizonRows(analytics, returns, holdings);
  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.rawValue || 0)), 0.01);
  return (
    <section className={styles.portfolioMiniPanel}>
      <div className={styles.portfolioMiniHead}>
        <p className={styles.kicker}>Retornos</p>
        <strong>{analytics?.totalReturnInclDividends !== null && analytics?.totalReturnInclDividends !== undefined ? formatSignedPct(analytics.totalReturnInclDividends) : analytics?.totalReturnLabel || "-"}</strong>
      </div>
      <div className={styles.portfolioHorizonRows}>
        {rows.map((row) => (
          <div className={styles.portfolioHorizonRow} data-tone={row.tone} key={`horizon-${row.label}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <div className={styles.portfolioBarTrack} aria-hidden="true">
              <span style={{ width: row.rawValue === null ? "0%" : `${Math.max(3, Math.min(100, (Math.abs(row.rawValue) / maxAbs) * 100))}%` }} />
            </div>
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
    ["region", "Región"],
    ["theme", "Tema"],
  ];

  return (
    <section className={styles.portfolioMiniPanel}>
      <div className={styles.portfolioMiniHead}>
        <p className={styles.kicker}>Exposición</p>
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
                <span>{cleanPortfolioLabel(holding.theme, holdingName(holding))}</span>
              </div>
              <div className={styles.portfolioScoreStrip}>
                <ToneBadge tone={holding.flagLabel === "Concentración" || holding.flagLabel === "Riesgo alto" ? "warn" : "neutral"}>{holding.flagLabel}</ToneBadge>
                <ToneBadge tone={scoreTone(holding.qualityScore)}>Calidad {scoreLabel(holding.qualityScore)}</ToneBadge>
                <ToneBadge tone={scoreTone(holding.riskScore, true)}>Riesgo {scoreLabel(holding.riskScore)}</ToneBadge>
              </div>
              <div className={styles.portfolioReviewAction}>
                <strong>{holding.actionLabel}</strong>
                <span>{holding.triggerLabel}</span>
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
    .filter((holding) => {
      const dayPnl = Number(holding?.dayPnlUsd);
      const dayReturn = Number(holding?.dayReturn);
      return (Number.isFinite(dayPnl) && Math.abs(dayPnl) > 0.005)
        || (Number.isFinite(dayReturn) && Math.abs(dayReturn) > 0.00005);
    })
    .sort((left, right) => Math.abs(Number(right.dayPnlUsd || right.dayReturn || 0)) - Math.abs(Number(left.dayPnlUsd || left.dayReturn || 0)))
    .slice(0, 5);

  return (
    <section className={styles.portfolioMiniPanel}>
      <div className={styles.portfolioMiniHead}>
        <p className={styles.kicker}>Hoy</p>
        <strong>{movers.length ? movers.length : "Sin dato"}</strong>
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
    return <p className={styles.emptyCopy}>Ejecuta el análisis para dibujar la brecha entre amplitud visible y real.</p>;
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

          {analysis && (analysis?.current?.conditional_fragility_flag || Number(analysis?.current?.phantom_share) >= 0.92) ? (
            <div className={styles.phantomNarrative} data-tone="bad">
              <div>
                <p className={styles.kicker}>Fragilidad condicional</p>
                <h3>Diversificación sin validar en zona de riesgo</h3>
              </div>
              <div className={styles.phantomNarrativeCopy}>
                <p>
                  Más del 92% de la amplitud visible de este portafolio no ha sido validada por stress. Según la evidencia del paper de Phantom Diversification, dentro de regímenes calmos ese umbral marca un salto en la probabilidad de drawdowns futuros de mediano plazo (de ~2% a ~11% para caídas de 15% en 63 días). No significa que la crisis ya empezó: significa que la diversificación aparente es menos confiable como mitigación de riesgo justo ahora.
                </p>
                <p>
                  Acción concreta: revisa la tabla de abajo y reemplaza los nombres marcados como solapamiento por exposiciones con drivers distintos, o reduce el tamaño de la apuesta latente común antes de agregar posiciones nuevas.
                </p>
              </div>
            </div>
          ) : null}

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
              <strong>Un clic, tres números.</strong>
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

function TodayDecisionPanel({ stateSummary, primaryAction, blockedAction, pendingKey, onStage, onDefer, onReject }) {
  const activeAction = primaryAction || blockedAction || null;
  const isBlocked = !primaryAction && Boolean(blockedAction);
  const title = cleanWorkspaceCopy(primaryAction?.title || blockedAction?.title || stateSummary?.stance || "Mantener linea");

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Frontera de acción</p>
          <h2>{title}</h2>
          <p className={styles.supportText}>El movimiento más claro que todavía sobrevive a la lectura actual.</p>
        </div>
        <ToneBadge tone={statusTone(isBlocked ? "briefing" : (primaryAction?.status || "ready"))}>
          {isBlocked ? "Esperar" : "Accionable"}
        </ToneBadge>
      </div>

      <p className={styles.lead}>
        {cleanWorkspaceCopy(primaryAction?.summary || blockedAction?.summary || stateSummary?.decisionSummary || "No hay un movimiento legítimo nuevo abierto ahora.")}
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
  const performanceIsFlowAdjusted = String(analytics.performanceMethod || "").includes("external_flow");
  const performanceMethodLabel = performanceIsFlowAdjusted ? "TWR ajustado por flujos" : "TWR sin flujos registrados";

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
          detail={hasHoldings ? (analytics.hasPerformanceHistory ? performanceMethodLabel : "Valor actual contra costo base guardado.") : "Agrega al menos una posición primero."}
          label={hasHoldings && analytics.hasPerformanceHistory ? "Retorno anualizado" : "Retorno desde costo base"}
          value={hasHoldings ? (analytics.hasPerformanceHistory ? analytics.annualReturnLabel : currentGainLabel) : "Sin posiciones"}
        />
        <MetricTile
          detail={hasHoldings && analytics.historySessions ? `${analytics.historySessions} observaciones · ${performanceMethodLabel}` : "El historial empieza cuando las posiciones quedan conectadas."}
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
              ? `La serie usa ${analytics.historySessions} fotos guardadas del valor de cartera. Es historial de valor, no TWR puro.`
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
                    <span>{cleanPortfolioLabel(holding.sector, "Posición")}</span>
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
                      <small>{cleanPortfolioLabel(item.role || item.sector, "Motor")}</small>
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
                      <small>{cleanPortfolioLabel(item.role, "Posición")}</small>
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
              <p className={styles.kicker}>Motores de recuperación</p>
              <h3>Qué todavía merece su lugar</h3>
            </div>
            {recoveryDrivers.length ? (
              <div className={styles.portfolioDriverList}>
                {recoveryDrivers.map((item) => (
                  <article key={`recovery-${item.ticker}`}>
                    <div>
                      <strong>{item.ticker}</strong>
                      <small>{cleanPortfolioLabel(item.role, "Posición")}</small>
                    </div>
                    <div>
                      <strong>{item.contribution || "-"}</strong>
                      <small>Aporte a recuperación</small>
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

function PortfolioPanel({ portfolioModule, range, onRangeChange, xray, compact = false, showAuroraAction = false, onOpenRisk = null, language = "es" }) {
  const portfolio = portfolioModule || {};
  const analytics = portfolio.analytics || {};
  const holdings = safeList(portfolio.holdings);
  const transactions = safeList(portfolio.transactions);
  const hasHoldings = holdings.length > 0;
  const chartSeries = hasHoldings ? filterPortfolioSeries(portfolio?.charts?.growthComparison, range) : [];
  const performanceReport = portfolio?.performanceReport || null;
  const performanceIsReconstructed = String(analytics.performanceMethod || "") === "reconstructed_holdings_history";
  const performanceIsFlowAdjusted = String(analytics.performanceMethod || "").includes("external_flow");
  const performanceMethodLabel = performanceIsReconstructed
    ? "Trayectoria reconstruida (posiciones + precios reales)"
    : performanceIsFlowAdjusted ? "TWR ajustado por flujos" : "TWR sin flujos registrados";
  const performanceCopy = PERFORMANCE_READING_COPY[language] || PERFORMANCE_READING_COPY.es;
  const performanceInputActions = performanceReport?.inputs?.actions || [];
  const returnBreakdown = hasHoldings ? (portfolio?.returns || {}) : {};
  const portfolioXray = xray || {};
  const concentration = portfolioXray.concentration || {};
  const totalValueLabel = hasHoldings && firstFiniteNumber(analytics.totalValueUsd) !== null ? formatCurrency(analytics.totalValueUsd) : "-";
  const hasHoldingCostBasisData = holdings.some((holding) => holdingCostBasis(holding) !== null);
  const activeCostBasisValue = firstFiniteNumber(analytics.activeCostBasisUsd) !== null
    ? firstFiniteNumber(analytics.activeCostBasisUsd)
    : hasHoldingCostBasisData
      ? holdings.reduce((sum, holding) => sum + (holdingCostBasis(holding) || 0), 0)
      : null;
  const activeCostBasisLabel = activeCostBasisValue !== null ? formatCurrency(activeCostBasisValue) : "-";
  const totalPnlLabel = Number.isFinite(Number(analytics.totalPnlInclRealizedDividendsUsd))
    ? formatCurrency(analytics.totalPnlInclRealizedDividendsUsd)
    : (returnBreakdown?.totalPnlLabel || "-");
  const hasUnrealizedPnlData = Number.isFinite(Number(analytics.unrealizedPnlUsd))
    || holdings.some((holding) => numericValue(holding?.unrealizedPnlUsd) !== null);
  const unrealizedPnlValue = Number.isFinite(Number(analytics.unrealizedPnlUsd))
    ? Number(analytics.unrealizedPnlUsd)
    : holdings.reduce((sum, holding) => sum + (numericValue(holding?.unrealizedPnlUsd) || 0), 0);
  const unrealizedPnlLabel = hasUnrealizedPnlData
    ? formatCurrency(unrealizedPnlValue)
    : "-";
  const realizedDividendValue = firstFiniteNumber(analytics.realizedPnlUsd) !== null || firstFiniteNumber(analytics.dividendsUsd) !== null
    ? (firstFiniteNumber(analytics.realizedPnlUsd) || 0) + (firstFiniteNumber(analytics.dividendsUsd) || 0)
    : null;
  const realizedDividendLabel = realizedDividendValue !== null ? formatCurrency(realizedDividendValue) : "-";
  const usdClpLabel = firstFiniteNumber(analytics.usdClp) !== null ? formatFxRate(analytics.usdClp) : "-";
  const currentPerformanceValue = Number.isFinite(Number(analytics.totalReturnInclDividends))
    ? Number(analytics.totalReturnInclDividends)
    : Number.isFinite(Number(analytics.unrealizedReturn))
      ? Number(analytics.unrealizedReturn)
      : null;
  const currentPerformanceLabel = currentPerformanceValue !== null
    ? formatSignedPct(currentPerformanceValue)
    : null;
  const topHolding = [...holdings].sort((left, right) => holdingWeightValue(right) - holdingWeightValue(left))[0] || null;
  const reviewQueue = buildReviewQueue(holdings);
  const highRiskCount = reviewQueue.filter((holding) => Number(holding.riskScore) >= 4).length;
  const dayPnl = holdings.reduce((sum, holding) => {
    const value = Number(holding?.dayPnlUsd);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const hasDayPnl = holdings.some((holding) => {
    const dayPnlValue = Number(holding?.dayPnlUsd);
    const dayReturnValue = Number(holding?.dayReturn);
    return (Number.isFinite(dayPnlValue) && Math.abs(dayPnlValue) > 0.005)
      || (Number.isFinite(dayReturnValue) && Math.abs(dayReturnValue) > 0.00005);
  });
  const performanceSeriesWarning = analytics.performanceSeriesWarning;
  const executiveRead = buildPortfolioExecutiveRead({ analytics, holdings, hasDayPnl, dayPnl, topHolding, reviewQueue });

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
          <ToneBadge tone="neutral">{cleanPortfolioLabel(portfolio.holdingsSource?.label || portfolio.chartSource, "Cartera")}</ToneBadge>
          {showAuroraAction ? (
            <Link className={styles.secondaryLink} href="/aurora">
              Abrir AURORA
            </Link>
          ) : null}
          {onOpenRisk ? (
            <button className={styles.secondaryButton} onClick={onOpenRisk} type="button">
              Abrir Stress Engine
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.portfolioSummaryRail}>
        <MetricTile detail="Suma de posiciones activas." label="Valor total" value={totalValueLabel} />
        <MetricTile detail="Capital invertido en posiciones activas." label="Costo base" value={activeCostBasisLabel} />
        <MetricTile
          detail="Resultado abierto de las posiciones actuales."
          label="P&L no realizado"
          tone={hasUnrealizedPnlData ? signedMoneyTone(unrealizedPnlValue) : "neutral"}
          value={unrealizedPnlLabel}
        />
        <MetricTile
          detail="Ganancias cerradas más dividendos cargados."
          label="Realizado + dividendos"
          tone={signedMoneyTone(realizedDividendValue)}
          value={realizedDividendLabel}
        />
        <MetricTile
          detail={currentPerformanceLabel ? `Sobre base ${activeCostBasisLabel}.` : "Falta costo base para calcular performance."}
          label="P&L total"
          tone={signedMoneyTone(currentPerformanceValue)}
          value={totalPnlLabel}
        />
        <MetricTile
          detail="Incluye dividendos cuando están cargados."
          label="Retorno total"
          tone={signedMoneyTone(currentPerformanceValue)}
          value={currentPerformanceLabel || "-"}
        />
        <MetricTile
          detail={firstFiniteNumber(analytics.totalValueClp) !== null ? `Valor CLP ${formatFxRate(analytics.totalValueClp)}.` : "Conversión local si está cargada."}
          label="USD/CLP"
          value={usdClpLabel}
        />
      </div>

      {executiveRead.length ? (
        <section className={styles.portfolioExecutiveRead}>
          <div>
            <p className={styles.kicker}>Lectura ejecutiva</p>
            <h3>Qué significan estos números</h3>
          </div>
          <ul>
            {executiveRead.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className={styles.portfolioDeskGrid}>
        <section className={styles.chartPanel}>
          <div className={styles.portfolioSectionHead}>
            <div>
              <p className={styles.kicker}>Historial</p>
              <h3>{analytics.hasPerformanceHistory ? `${performanceMethodLabel} vs ${analytics.benchmarkSymbol || "SPY"}` : "Performance actual"}</h3>
            </div>
            <RangeTabs language={language} onChange={onRangeChange} value={range} />
          </div>
          <PortfolioChart benchmarkSymbol={analytics.benchmarkSymbol} series={chartSeries} />
          <p className={styles.supportText}>
            {analytics.hasPerformanceHistory
              ? performanceIsReconstructed
                ? `Serie reconstruida desde tus posiciones (fecha de compra + costo base) con precios históricos reales. No depende de fotos guardadas. El benchmark invierte los mismos aportes en las mismas fechas.`
                : `Serie basada en ${analytics.historySessions} fotos guardadas. ${performanceIsFlowAdjusted ? `Ajusta ${analytics.externalFlowCount || 0} flujo${analytics.externalFlowCount === 1 ? "" : "s"} externo${analytics.externalFlowCount === 1 ? "" : "s"}.` : "No hay aportes o retiros registrados en el periodo."}${analytics.moneyWeightedReturnLabel ? ` MWR/XIRR: ${analytics.moneyWeightedReturnLabel}.` : ""}`
              : performanceSeriesWarning
                ? "Ocultamos la trayectoria histórica porque los snapshots alternan de forma artificial. La performance actual sigue disponible desde costo base."
              : currentPerformanceLabel
                ? `Performance actual: ${currentPerformanceLabel} (${totalPnlLabel}). ${performanceInputActions.length ? performanceInputActions[0] : "Todavía no hay trayectoria histórica comparable."}`
                : performanceInputActions.length
                  ? performanceInputActions.join(" ")
                  : "Conecta posiciones con costo base para mostrar performance actual; la fecha de compra permite reconstruir trayectoria y benchmark sin fotos guardadas."}
          </p>
          {performanceReport?.explanation?.length ? (
            <div className={styles.performanceExplainer}>
              <strong>Lectura profesional</strong>
              <span>{performanceReport.explanation.join(" ")}</span>
            </div>
          ) : null}
          {performanceReport?.reconstructed || performanceReport?.current?.winners?.length || performanceReport?.current?.losers?.length ? (
            <div className={styles.performanceBenchmarkStrip} aria-label="Métricas profesionales de performance">
              {performanceReport?.reconstructed ? (
                <>
                  <span>
                    <strong>Anualizado</strong>
                    <em>{performanceReport.reconstructed.annualizedReturnLabel || "-"}</em>
                  </span>
                  <span>
                    <strong>Drawdown máx.</strong>
                    <em>{performanceReport.reconstructed.maxDrawdownLabel || "-"}</em>
                  </span>
                  <span>
                    <strong>Volatilidad</strong>
                    <em>{performanceReport.reconstructed.annualVolatilityLabel || "-"}</em>
                  </span>
                  <span>
                    <strong>vs {performanceReport.benchmarkSymbol || "SPY"}</strong>
                    <em data-tone={signedMoneyTone(performanceReport.reconstructed.benchmarkSpread)}>{performanceReport.reconstructed.benchmarkSpreadLabel || "-"}</em>
                  </span>
                </>
              ) : null}
              {performanceReport?.current?.winners?.[0] ? (
                <span>
                  <strong>Mejor aporte</strong>
                  <em>{performanceReport.current.winners[0].ticker} {performanceReport.current.winners[0].contributionLabel || performanceReport.current.winners[0].returnLabel || ""}</em>
                </span>
              ) : null}
              {performanceReport?.current?.losers?.[0] ? (
                <span>
                  <strong>Peor aporte</strong>
                  <em>{performanceReport.current.losers[0].ticker} {performanceReport.current.losers[0].contributionLabel || performanceReport.current.losers[0].returnLabel || ""}</em>
                </span>
              ) : null}
            </div>
          ) : null}
          {analytics.hasPerformanceHistory ? (
            <div className={styles.performanceExplainer}>
              <strong>{performanceCopy.title}</strong>
              <span>
                {performanceCopy.body({
                  benchmark: analytics.benchmarkSymbol || "SPY",
                  externalFlows: analytics.externalFlowCount,
                  moneyWeighted: analytics.moneyWeightedReturnLabel,
                  sessions: analytics.historySessions,
                  totalReturn: analytics.totalReturnLabel,
                })}
              </span>
            </div>
          ) : performanceSeriesWarning ? (
            <div className={styles.performanceExplainer}>
              <strong>Trayectoria en revisión</strong>
              <span>
                La serie de snapshots no pasa control de calidad para TWR. Mostramos la performance actual, pero no usamos esa trayectoria para comparar contra benchmark hasta corregir los datos históricos.
              </span>
            </div>
          ) : currentPerformanceLabel ? (
            <div className={styles.performanceExplainer}>
              <strong>Qué significa esta performance</strong>
              <span>
                Es el resultado acumulado de las posiciones cargadas contra su costo base. No es TWR ni compara contra benchmark todavía; sirve para saber si la cartera actual gana o pierde dinero antes de tener suficientes fotos históricas.
              </span>
            </div>
          ) : null}
          {analytics.hasBenchmarkHistory ? (
            <div className={styles.performanceBenchmarkStrip} aria-label="Comparación contra referencia de mercado">
              <span>
                <strong>{analytics.benchmarkSymbol || "SPY"}</strong>
                <em>{analytics.benchmarkReturnLabel || "-"}</em>
              </span>
              <span>
                <strong>Diferencia</strong>
                <em data-tone={signedMoneyTone(analytics.excessReturn)}>{analytics.excessReturnLabel || "-"}</em>
              </span>
              <span>
                <strong>Lectura</strong>
                <em>{Number(analytics.excessReturn) >= 0 ? "La cartera supera la referencia en este rango." : "La cartera queda bajo la referencia en este rango."}</em>
              </span>
            </div>
          ) : null}
        </section>

        <PortfolioDonutPanel holdings={holdings} topHolding={topHolding} />
      </div>

      <PortfolioPositionTable holdings={holdings} />

      {compact ? null : (
        <>
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
        </>
      )}
    </section>
  );
}

const MARKET_STRESS_COPY = {
  en: {
    kicker: "Stress Engine",
    title: "Regime-conditioned scenarios for tail risk",
    body: "5,000 synthetic paths per run. CVaR 5%/1%, drawdown probability, historical replay, and tail attribution by position.",
    run: "Run stress test",
    running: "Running...",
    error: "Could not run the stress simulation.",
    regime: "Regime",
    horizon: "Horizon",
    tailIntensity: "Tail intensity",
    days10: "10 days",
    days20: "20 days",
    days60: "60 days",
    preparing: "Preparing",
    heroDetail: "Average loss in the lower tail over the selected horizon. Research artifact, not advice.",
    loss: "Loss",
    scenarios: "scenarios",
    median: "Median return",
    medianDetail: "Median synthetic path.",
    var1: "VaR 1%",
    var1Detail: "First percentile terminal return.",
    drawdown: "DD -10%",
    drawdownDetail: "Probability of max drawdown <= -10%.",
    replayCoverage: "Replay status",
    replayCoverageDetail: "V8 stress-floor check; not episode-conditioned crisis replay.",
    worstReplay: "Worst replay",
    worstReplayDetail: "Most severe historical episode in validation.",
    runtime: "Runtime",
    runtimeDetail: "Served engine.",
    proxy: "Proxy",
    pytorch: "PyTorch",
    tailContributors: "Tail contributors",
    tailContribution: "weighted CVaR contribution",
    tailEmpty: "Run a stress test to see tail contributors.",
    worstPaths: "Worst paths",
    maxDrawdown: "Max drawdown",
    pathEmpty: "Extreme paths will appear after simulation.",
    historicalReplay: "Historical replay",
    actual: "actual",
    synthetic: "synthetic q01",
    covered: "floor",
    notCovered: "miss",
    universe: "Universe used",
    universeEmpty: "No connected positions.",
    diagnostics: "Model diagnostics",
    diagnosticsHint: "Kept below the fold because these grade model-selection evidence, not the stress decision output.",
    mmdRatio: "DDPM gap vs champion",
    corrFidelity: "Target corr fidelity",
    coverage: "Bin coverage",
    source: "Input source",
    methodology: "Methodology",
  },
  es: {
    kicker: "Stress Engine",
    title: "Escenarios por régimen para riesgo de cola",
    body: "5.000 trayectorias sintéticas por corrida. CVaR 5%/1%, probabilidad de drawdown, replay histórico y atribución de cola por posición.",
    run: "Correr stress test",
    running: "Corriendo...",
    error: "No se pudo correr la simulación de stress.",
    regime: "Régimen",
    horizon: "Horizonte",
    tailIntensity: "Intensidad de cola",
    days10: "10 días",
    days20: "20 días",
    days60: "60 días",
    preparing: "Preparando",
    heroDetail: "Pérdida promedio en la cola inferior del horizonte elegido. Artefacto de investigación, no pronóstico.",
    loss: "Pérdida",
    scenarios: "escenarios",
    median: "Retorno mediano",
    medianDetail: "Trayectoria sintética mediana.",
    var1: "VaR 1%",
    var1Detail: "Percentil 1 del retorno terminal.",
    drawdown: "DD -10%",
    drawdownDetail: "Probabilidad de drawdown máximo <= -10%.",
    replayCoverage: "Estado replay",
    replayCoverageDetail: "Chequeo v8 de piso de stress; no es replay condicionado por episodio.",
    worstReplay: "Peor replay",
    worstReplayDetail: "Episodio histórico más severo en validación.",
    runtime: "Runtime",
    runtimeDetail: "Motor servido.",
    proxy: "Proxy",
    pytorch: "PyTorch",
    tailContributors: "Quién pega en la cola",
    tailContribution: "aporte ponderado en CVaR",
    tailEmpty: "Corre un stress test para ver aportes de cola.",
    worstPaths: "Peores trayectorias",
    maxDrawdown: "Drawdown máximo",
    pathEmpty: "Las trayectorias extremas aparecerán después de correr.",
    historicalReplay: "Replay histórico",
    actual: "real",
    synthetic: "q01 sintético",
    covered: "piso",
    notCovered: "falla",
    universe: "Universo usado",
    universeEmpty: "Sin posiciones conectadas.",
    diagnostics: "Diagnósticos del modelo",
    diagnosticsHint: "Quedan bajo el fold porque evalúan el challenger DDPM, no la decisión de stress.",
    mmdRatio: "Brecha DDPM vs champion",
    corrFidelity: "Fidelidad corr objetivo",
    coverage: "Cobertura bins",
    source: "Fuente de input",
    methodology: "Metodología",
  },
};

function MarketDiffusionPanel({ workspaceId }) {
  const [regime, setRegime] = useState("crisis");
  const [horizonDays, setHorizonDays] = useState(20);
  const [tailIntensity, setTailIntensity] = useState(1.0);
  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { language } = useLanguagePreference();
  const copy = MARKET_STRESS_COPY[language] || MARKET_STRESS_COPY.en;

  const runSimulation = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        regime,
        horizonDays: String(horizonDays),
        tailIntensity: String(tailIntensity),
        nScenarios: "5000",
        stratifiedStress: "true",
      });
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/market-simulation?${params}`, { cache: "no-store" });
      const payload = await parseResponse(response);
      setSimulation(payload);
    } catch (requestError) {
      setError(friendlyWorkspaceMessage(requestError?.message || requestError, copy.error));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, regime, horizonDays, tailIntensity, copy.error]);

  useEffect(() => {
    if (!workspaceId || simulation || loading) return;
    void runSimulation();
  }, [workspaceId, simulation, loading, runSimulation]);

  const risk = simulation?.risk || {};
  const diagnostics = simulation?.diagnostics || {};
  const deployment = simulation?.deployment || {};
  const validation = simulation?.validation || {};
  const historicalReplay = validation?.historicalReplay || {};
  const baselineComparison = validation?.baselineComparison || diagnostics?.baselineComparison || {};
  const replayRows = safeList(historicalReplay?.rows);
  const worstReplay = replayRows
    .slice()
    .sort((left, right) => Number(left.actualMin || 0) - Number(right.actualMin || 0))[0];
  const mmdRatio = Number(baselineComparison?.ddpmVsChampionMmdRatio ?? baselineComparison?.gaussianMmdRatio);
  const tailContributors = safeList(simulation?.tailContributors);
  const samplePaths = safeList(simulation?.samplePaths);
  const universe = safeList(simulation?.universe);

  return (
    <section className={styles.panel} data-no-translate>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>{copy.kicker}</p>
          <h2>{copy.title}</h2>
          <p className={styles.supportText}>{copy.body}</p>
        </div>
        <button className={styles.primaryButton} disabled={loading || !workspaceId} onClick={runSimulation} type="button">
          {loading ? copy.running : copy.run}
        </button>
      </div>

      <div className={styles.diffusionControls}>
        <label>
          <span>{copy.regime}</span>
          <select className={styles.textInput} onChange={(event) => setRegime(event.target.value)} value={regime}>
            <option value="crisis">Crisis</option>
            <option value="baseline">Baseline</option>
            <option value="recovery">Recovery</option>
            <option value="inflation">Inflation shock</option>
          </select>
        </label>
        <label>
          <span>{copy.horizon}</span>
          <select className={styles.textInput} onChange={(event) => setHorizonDays(Number(event.target.value))} value={horizonDays}>
            <option value={10}>{copy.days10}</option>
            <option value={20}>{copy.days20}</option>
            <option value={60}>{copy.days60}</option>
          </select>
        </label>
        <label>
          <span>{copy.tailIntensity}</span>
          <input
            className={styles.textInput}
            max="4"
            min="0.5"
            onChange={(event) => setTailIntensity(Number(event.target.value))}
            step="0.1"
            type="number"
            value={tailIntensity}
          />
        </label>
      </div>

      {error ? <div className={styles.banner} data-tone="error">{error}</div> : null}

      <div className={styles.diffusionGrid}>
        <article className={styles.diffusionHero}>
          <p className={styles.kicker}>{simulation?.regimeLabel || copy.preparing}</p>
          <h3>{risk.cvar5Label || "-"} CVaR 5%</h3>
          <p>{copy.heroDetail}</p>
          <div className={styles.researchLoopMeta}>
            <ToneBadge tone="bad">VaR 5% {risk.var5Label || "-"}</ToneBadge>
            <ToneBadge tone="warn">{copy.loss} {risk.probabilityLossLabel || "-"}</ToneBadge>
            <ToneBadge tone="neutral">{simulation?.model?.nScenarios || 5000} {copy.scenarios}</ToneBadge>
            <ToneBadge tone={validation?.endpointGate?.ready ? "good" : "warn"}>
              {validation?.endpointGate?.statusLabel || "Research gate"}
            </ToneBadge>
          </div>
          {simulation?.runId ? (
            <div className={styles.diffusionAuditTrail}>
              <span>run {simulation.runId}</span>
              <span>seed {simulation.seed}</span>
            </div>
          ) : null}
        </article>

        <div className={styles.diffusionMetricGrid}>
          <MetricTile detail={copy.medianDetail} label={copy.median} value={risk.medianReturnLabel || "-"} />
          <MetricTile detail={copy.var1Detail} label={copy.var1} tone="bad" value={risk.var1Label || "-"} />
          <MetricTile detail={copy.drawdownDetail} label={copy.drawdown} tone="warn" value={risk.probabilityDrawdown10Label || "-"} />
          <MetricTile detail={historicalReplay?.methodologyNote || copy.replayCoverageDetail} label={copy.replayCoverage} tone={historicalReplay?.methodologyValidated ? "good" : "warn"} value={historicalReplay?.coverageLabel || "-"} />
          <MetricTile detail={copy.worstReplayDetail} label={copy.worstReplay} tone="bad" value={worstReplay?.actualMinLabel || "-"} />
          <MetricTile detail={copy.runtimeDetail} label={copy.runtime} tone={simulation?.model?.trainedCheckpointServed ? "good" : "warn"} value={simulation?.model?.trainedCheckpointServed ? copy.pytorch : copy.proxy} />
        </div>

        <article className={styles.diffusionCard}>
          <h3>{copy.tailContributors}</h3>
          {tailContributors.length ? (
            <div className={styles.diffusionList}>
              {tailContributors.map((item) => (
                <div key={item.ticker}>
                  <strong>{item.ticker}</strong>
                  <span>{item.contributionLabel} {copy.tailContribution}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>{copy.tailEmpty}</p>
          )}
        </article>

        <article className={styles.diffusionCard}>
          <h3>{copy.worstPaths}</h3>
          {samplePaths.length ? (
            <div className={styles.diffusionList}>
              {samplePaths.slice(0, 5).map((path) => (
                <div key={path.id}>
                  <strong>{path.portfolioReturnLabel}</strong>
                  <span>{copy.maxDrawdown} {path.maxDrawdownLabel}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>{copy.pathEmpty}</p>
          )}
        </article>

        <article className={styles.diffusionCard}>
          <h3>{copy.historicalReplay}</h3>
          {replayRows.length ? (
            <div className={styles.diffusionList}>
              {replayRows.map((row) => (
                <div key={row.id}>
                  <strong>{row.episode}</strong>
                  <span>{copy.actual} {row.actualMinLabel} · {copy.synthetic} {row.syntheticQ01Label} · {row.covered ? copy.covered : copy.notCovered}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>-</p>
          )}
        </article>

        <article className={styles.diffusionCard}>
          <h3>{copy.universe}</h3>
          {universe.length ? (
            <div className={styles.diffusionUniverse}>
              {universe.slice(0, 8).map((asset) => (
                <span key={asset.ticker}>
                  <strong>{asset.ticker}</strong>
                  {asset.weightLabel}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>{copy.universeEmpty}</p>
          )}
        </article>

        <details className={styles.diffusionDiagnostics}>
          <summary>{copy.diagnostics}</summary>
          <p>{copy.diagnosticsHint}</p>
          <div className={styles.diffusionMetricGrid}>
            <MetricTile detail={baselineComparison?.championModel || "V8 champion baseline diagnostic."} label={copy.mmdRatio} tone="warn" value={Number.isFinite(mmdRatio) ? `${mmdRatio.toFixed(2)}x` : baselineComparison?.ddpmVsChampionMmdRatioLabel || baselineComparison?.gaussianMmdRatioLabel || "-"} />
            <MetricTile detail="Sampler convergence against runtime target matrix." label={copy.corrFidelity} value={diagnostics.correlationFidelityLabel || "-"} />
            <MetricTile detail="Internal dispersion bin occupancy." label={copy.coverage} value={diagnostics.distributionCoverageLabel || "-"} />
            <MetricTile detail={simulation?.inputSources?.universePolicy || "-"} label={copy.source} value={simulation?.inputSources?.correlationSource || "-"} />
          </div>
          <Link className={styles.inlineLink} href="/stress#methodology">
            {copy.methodology}
          </Link>
        </details>
      </div>
    </section>
  );
}

const STRESS_SEVERITY_OPTIONS = [
  { id: "standard", value: 1.0 },
  { id: "harsh", value: 1.6 },
  { id: "extreme", value: 2.5 },
];

const STRESS_ENGINE_COPY = {
  en: {
    kicker: "Stress Engine",
    title: "How bad can this portfolio get?",
    body: "Stress test your actual holdings against simulated market weather. Scenarios, not predictions.",
    run: "Run stress test",
    running: "Simulating 5,000 scenarios...",
    error: "Could not run the stress test. Check that the workspace has holdings, then try again.",
    answer: ({ regimeLabel, cvar5, horizonDays }) =>
      `In a simulated ${regimeLabel}, this portfolio loses ${cvar5} in the worst 5% of the next ${horizonDays} days.`,
    soWhat: "What this means for you",
    soWhatHighTitle: "Do not add risk casually.",
    soWhatHighBody: ({ lossValue, horizonDays, topDriver }) =>
      `The bad-case loss is large for a ${horizonDays}-day window${lossValue ? `: about ${lossValue} on the current portfolio` : ""}. The warning is not that this will happen; it is that the portfolio has little room for a correlated shock${topDriver ? `, with ${topDriver} leading the damage` : ""}.`,
    soWhatMediumTitle: "Risk can stay, but sizing needs a reason.",
    soWhatMediumBody: ({ lossValue, horizonDays, topDriver }) =>
      `The portfolio can absorb normal noise, but the stress run still shows meaningful downside over ${horizonDays} days${lossValue ? `, roughly ${lossValue} in bad scenarios` : ""}${topDriver ? `. Start by reviewing ${topDriver}` : ""}.`,
    soWhatLowTitle: "The portfolio is not flashing red in this setup.",
    soWhatLowBody: ({ horizonDays }) =>
      `This run does not show an urgent stress warning over ${horizonDays} days. Keep watching concentration and rerun the test before adding a large new position.`,
    warningLabel: "Warning",
    actionLabel: "Next action",
    highAction: "Pause new risk, review the top contributors, and reduce or hedge only if the thesis has not changed.",
    mediumAction: "Keep the position plan selective. Add only where the new idea reduces concentration or clearly earns its risk.",
    lowAction: "No immediate defensive move from this stress run. Recheck after price moves, new deposits, or portfolio changes.",
    dollarsAtRisk: "Approx. bad-case dollars",
    topDrivers: "Main stress drivers",
    notForecast: "This is an adverse scenario read, not a forecast.",
    testAgainst: "Test against",
    overNext: "Over the next",
    severity: "Severity",
    severityCaption: "Severity changes how harsh the stress ladder is. The raw engine value is in diagnostics.",
    standard: "Standard",
    harsh: "Harsh",
    extreme: "Extreme",
    custom: "Custom",
    rawTailIntensity: "Raw tail intensity",
    rawTailHelp: "Power-user control. Higher values make the engine push deeper into stress tails.",
    days10: "10 days",
    days20: "20 days",
    days60: "60 days",
    preparing: "Preparing",
    lossChancePlain: "How often the simulated book ends below zero.",
    drawdownPlain: "How often the path falls at least 10% from a high.",
    worstPathPlain: "The ugliest terminal result across the run.",
    loss: "Chance of loss",
    scenarios: "scenarios",
    damageTitle: "What hurts most in the bad scenarios",
    tailContribution: "drives {value} of tail loss",
    tailEmpty: "No tail contributors yet. Run the stress test after adding holdings.",
    worstPaths: "The five ugliest simulations",
    pathCaption: "Each line is one of the worst cumulative simulated paths.",
    maxDrawdown: "Max drawdown",
    pathEmpty: "Worst paths will appear after the simulation runs.",
    distribution: "Where the 5,000 simulations ended",
    distributionCaption: "Each bar shows how many simulations ended in that return range.",
    historicalReplay: "Historical stress floor",
    scenarioBank: "Factor scenario bank",
    scenarioBankCaption: ({ coverage, source }) =>
      `${coverage || "-"} of portfolio weight matched the validated bank. Source: ${source || "factor bank"}.`,
    scenarioBankCvar: "Overlay CVaR 5%",
    scenarioBankVar: "Overlay VaR 5%",
    scenarioBankUnavailable: "No matching scenario-bank coverage for this portfolio yet.",
    actual: "real",
    synthetic: "stress floor",
    covered: "floor",
    notCovered: "miss",
    universe: "Positions included",
    universeEmpty: "No positions yet. Add holdings in the Holdings tab and the risk engine will pick them up automatically.",
    diagnostics: "Model diagnostics",
    diagnosticsFor: "For quants and auditors.",
    diagnosticsHint: "These keep model-selection evidence visible without making the risk decision harder to read.",
    mmdRatio: "Engine fit vs baselines",
    corrFidelity: "Correlation fidelity",
    coverage: "Distribution coverage",
    runtime: "Runtime",
    runtimeDetail: "Served engine.",
    endpointGate: "Endpoint gate",
    multiplierMix: "Stress multiplier mix",
    checkpoints: "Artifacts",
    proxy: "Proxy",
    pytorch: "PyTorch",
    source: "Input source",
    methodology: "Methodology",
    warnings: "Warnings",
    noWarnings: "No runtime warnings.",
    trustRibbon: ({ runId, seed }) =>
      `Simulated scenarios, not predictions | Engine: validated PIT FHS factor bank | Run ${runId || "-"} | seed ${seed || "-"}`,
    chartAria: "Worst simulated cumulative paths",
    histogramAria: "Histogram of simulated terminal returns",
    regimes: [
      ["baseline", "Calm market", "Baseline conditions with normal volatility."],
      ["crisis", "Crisis", "Correlated selloff and heavier tails."],
      ["recovery", "Recovery", "Improving market with residual volatility."],
      ["inflation", "Inflation shock", "Rates and inflation pressure across assets."],
    ],
  },
  es: {
    kicker: "Stress Engine",
    title: "¿Qué tan mal puede salir esta cartera?",
    body: "Prueba tus posiciones reales contra clima de mercado simulado. Escenarios, no predicciones.",
    run: "Correr stress test",
    running: "Simulando 5.000 escenarios...",
    error: "No se pudo correr el stress test. Revisa que el workspace tenga posiciones e intenta de nuevo.",
    answer: ({ regimeLabel, cvar5, horizonDays }) =>
      `En un escenario simulado de ${String(regimeLabel || "").toLowerCase()}, esta cartera pierde ${cvar5} en el peor 5% de los próximos ${horizonDays} días.`,
    soWhat: "Qué significa para ti",
    soWhatHighTitle: "No conviene sumar riesgo sin una razón muy fuerte.",
    soWhatHighBody: ({ lossValue, horizonDays, topDriver }) =>
      `La pérdida de caso malo es grande para una ventana de ${horizonDays} días${lossValue ? `: cerca de ${lossValue} sobre la cartera actual` : ""}. La advertencia no es que esto vaya a pasar; es que la cartera tiene poco margen ante un shock correlacionado${topDriver ? `, con ${topDriver} liderando el daño` : ""}.`,
    soWhatMediumTitle: "El riesgo puede seguir, pero el tamaño necesita justificación.",
    soWhatMediumBody: ({ lossValue, horizonDays, topDriver }) =>
      `La cartera puede tolerar ruido normal, pero el stress todavía muestra una pérdida potencial relevante en ${horizonDays} días${lossValue ? `, cerca de ${lossValue} en escenarios malos` : ""}${topDriver ? `. Parte revisando ${topDriver}` : ""}.`,
    soWhatLowTitle: "Esta corrida no prende una alerta roja.",
    soWhatLowBody: ({ horizonDays }) =>
      `Esta simulación no muestra una alerta urgente de stress en ${horizonDays} días. Mantén vigilancia sobre concentración y vuelve a correrla antes de sumar una posición grande.`,
    warningLabel: "Advertencia",
    actionLabel: "Siguiente acción",
    highAction: "Pausar nuevo riesgo, revisar los principales contribuidores y reducir o cubrir solo si la tesis ya no compensa el daño.",
    mediumAction: "Mantener una postura selectiva. Agregar solo donde la nueva idea reduzca concentración o pague claramente el riesgo.",
    lowAction: "No hay una acción defensiva inmediata desde esta corrida. Revisa de nuevo tras movimientos de precio, aportes o cambios de cartera.",
    dollarsAtRisk: "Dólares aprox. en riesgo",
    topDrivers: "Principales fuentes de stress",
    notForecast: "Es una lectura de escenario adverso, no un pronóstico.",
    testAgainst: "Probar contra",
    overNext: "Durante los próximos",
    severity: "Severidad",
    severityCaption: "La severidad cambia qué tan dura es la escalera de stress. El valor crudo vive en diagnósticos.",
    standard: "Estándar",
    harsh: "Duro",
    extreme: "Extremo",
    custom: "Custom",
    rawTailIntensity: "Intensidad cruda de cola",
    rawTailHelp: "Control avanzado. Valores más altos empujan el motor a colas más severas.",
    days10: "10 días",
    days20: "20 días",
    days60: "60 días",
    preparing: "Preparando",
    lossChancePlain: "Con qué frecuencia la cartera simulada termina bajo cero.",
    drawdownPlain: "Con qué frecuencia la ruta cae al menos 10% desde un máximo.",
    worstPathPlain: "El peor resultado terminal de la corrida.",
    loss: "Probabilidad de pérdida",
    scenarios: "escenarios",
    damageTitle: "Qué duele más en los escenarios malos",
    tailContribution: "empuja {value} de la pérdida de cola",
    tailEmpty: "No hay contribuidores de cola todavía. Corre el stress test después de agregar posiciones.",
    worstPaths: "Las cinco simulaciones más feas",
    pathCaption: "Cada línea es una de las peores rutas acumuladas simuladas.",
    maxDrawdown: "Drawdown máximo",
    pathEmpty: "Las peores rutas aparecerán después de correr la simulación.",
    distribution: "Dónde terminaron las 5.000 simulaciones",
    distributionCaption: "Cada barra muestra cuántas simulaciones terminaron en ese rango de retorno.",
    historicalReplay: "Piso histórico de stress",
    scenarioBank: "Banco factorial de escenarios",
    scenarioBankCaption: ({ coverage, source }) =>
      `${coverage || "-"} del peso de la cartera calza con el banco validado. Fuente: ${source || "banco factorial"}.`,
    scenarioBankCvar: "CVaR 5% overlay",
    scenarioBankVar: "VaR 5% overlay",
    scenarioBankUnavailable: "Todavía no hay cobertura del banco de escenarios para esta cartera.",
    actual: "real",
    synthetic: "piso stress",
    covered: "piso",
    notCovered: "falla",
    universe: "Posiciones incluidas",
    universeEmpty: "No hay posiciones todavía. Agrégalas en Posiciones y el motor de riesgo las tomará automáticamente.",
    diagnostics: "Diagnósticos del modelo",
    diagnosticsFor: "Para quants y auditores.",
    diagnosticsHint: "Esto mantiene visible la evidencia de selección sin ensuciar la decisión de riesgo.",
    mmdRatio: "Brecha DDPM vs champion",
    corrFidelity: "Fidelidad de correlación",
    coverage: "Cobertura de distribución",
    runtime: "Runtime",
    runtimeDetail: "Motor servido.",
    endpointGate: "Gate del endpoint",
    multiplierMix: "Mix de multiplicadores",
    checkpoints: "Artefactos",
    proxy: "Proxy",
    pytorch: "PyTorch",
    source: "Fuente de input",
    methodology: "Metodología",
    warnings: "Warnings",
    noWarnings: "Sin warnings del runtime.",
    trustRibbon: ({ runId, seed }) =>
      `Escenarios simulados, no predicciones | Motor: banco factorial FHS validado | Run ${runId || "-"} | seed ${seed || "-"}`,
    chartAria: "Peores rutas acumuladas simuladas",
    histogramAria: "Histograma de retornos terminales simulados",
    regimes: [
      ["baseline", "Mercado calmo", "Condiciones base con volatilidad normal."],
      ["crisis", "Crisis", "Venta correlacionada y colas más pesadas."],
      ["recovery", "Recuperación", "Mercado mejorando con volatilidad residual."],
      ["inflation", "Shock inflacionario", "Presión de tasas e inflación sobre activos."],
    ],
  },
};

function StressPathChart({ copy, paths }) {
  const visiblePaths = safeList(paths).slice(0, 5).filter((path) => safeList(path.cumulativePath).length);
  if (!visiblePaths.length) return <p className={styles.emptyCopy}>{copy.pathEmpty}</p>;
  const width = 360;
  const height = 150;
  const padding = 12;
  const allValues = visiblePaths.flatMap((path) => [0, ...safeList(path.cumulativePath).map(Number).filter(Number.isFinite)]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues, 0.01);
  const range = Math.max(max - min, 0.01);
  const toY = (value) => padding + (1 - (value - min) / range) * (height - padding * 2);

  return (
    <div className={styles.stressPathChart}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={copy.chartAria}>
        <line x1={padding} x2={width - padding} y1={toY(0)} y2={toY(0)} />
        {visiblePaths.map((path, index) => {
          const values = [0, ...safeList(path.cumulativePath).map(Number).filter(Number.isFinite)];
          const d = values.map((value, pointIndex) => {
            const x = padding + (pointIndex / Math.max(values.length - 1, 1)) * (width - padding * 2);
            return `${pointIndex === 0 ? "M" : "L"}${x.toFixed(1)},${toY(value).toFixed(1)}`;
          }).join(" ");
          return <path d={d} data-index={index} key={path.id || index} />;
        })}
      </svg>
      <p>{copy.pathCaption}</p>
      <div className={styles.stressPathList}>
        {visiblePaths.map((path) => (
          <span key={path.id}>
            <strong>{path.portfolioReturnLabel}</strong>
            {copy.maxDrawdown} {path.maxDrawdownLabel}
          </span>
        ))}
      </div>
    </div>
  );
}

function StressDistributionStrip({ copy, risk }) {
  const histogram = safeList(risk?.histogram);
  if (!histogram.length) return <p className={styles.emptyCopy}>-</p>;
  const maxCount = Math.max(...histogram.map((row) => Number(row.count) || 0), 1);
  const min = Math.min(...histogram.map((row) => Number(row.min)).filter(Number.isFinite));
  const max = Math.max(...histogram.map((row) => Number(row.max)).filter(Number.isFinite));
  const range = Math.max(max - min, 0.01);
  const markers = [
    { label: "CVaR", value: Number(risk?.cvar5), tone: "bad" },
    { label: "VaR 5", value: Number(risk?.var5), tone: "warn" },
    { label: "Median", value: Number(risk?.medianReturn), tone: "neutral" },
  ].filter((marker) => Number.isFinite(marker.value));

  return (
    <div className={styles.stressDistribution}>
      <div className={styles.stressHistogram} role="img" aria-label={copy.histogramAria}>
        {histogram.map((row, index) => (
          <span
            aria-label={`${row.midpointLabel}: ${row.countLabel}`}
            key={`${row.min}-${row.max}-${index}`}
            style={{ "--bar-height": `${Math.max(8, (Number(row.count) / maxCount) * 100)}%` }}
          />
        ))}
        {markers.map((marker) => (
          <em
            data-tone={marker.tone}
            key={marker.label}
            style={{ left: `${((marker.value - min) / range) * 100}%` }}
          >
            {marker.label}
          </em>
        ))}
      </div>
      <p>{copy.distributionCaption}</p>
    </div>
  );
}

function buildStressUserMeaning({ copy, risk, tailContributors, portfolioValueUsd, horizonDays }) {
  const cvar = parseDisplayPercent(risk?.cvar5Label ?? risk?.cvar5);
  const lossChance = parseDisplayPercent(risk?.probabilityLossLabel ?? risk?.probabilityLoss);
  const drawdownChance = parseDisplayPercent(risk?.probabilityDrawdown10Label ?? risk?.probabilityDrawdown10);
  const topDriver = safeList(tailContributors)[0]?.ticker || "";
  const topDrivers = safeList(tailContributors).slice(0, 3).map((item) => item.ticker).filter(Boolean).join(", ");
  const lossValue = Number.isFinite(Number(portfolioValueUsd)) && Number.isFinite(cvar)
    ? formatCurrency(Math.abs(cvar) * Number(portfolioValueUsd))
    : "";
  const isHigh = (Number.isFinite(cvar) && cvar <= -0.25)
    || (Number.isFinite(drawdownChance) && drawdownChance >= 0.6)
    || (Number.isFinite(lossChance) && lossChance >= 0.55);
  const isMedium = !isHigh && ((Number.isFinite(cvar) && cvar <= -0.12) || (Number.isFinite(lossChance) && lossChance >= 0.35));
  const tone = isHigh ? "bad" : isMedium ? "warn" : "good";
  const title = isHigh ? copy.soWhatHighTitle : isMedium ? copy.soWhatMediumTitle : copy.soWhatLowTitle;
  const body = isHigh
    ? copy.soWhatHighBody({ lossValue, horizonDays, topDriver })
    : isMedium
      ? copy.soWhatMediumBody({ lossValue, horizonDays, topDriver })
      : copy.soWhatLowBody({ horizonDays });
  const action = isHigh ? copy.highAction : isMedium ? copy.mediumAction : copy.lowAction;
  return { action, body, lossValue, title, tone, topDrivers };
}

function StressEnginePanel({ portfolioValueUsd, workspaceId }) {
  const [regime, setRegime] = useState("crisis");
  const [horizonDays, setHorizonDays] = useState(20);
  const [severity, setSeverity] = useState("standard");
  const [customTailIntensity, setCustomTailIntensity] = useState(1.0);
  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { language } = useLanguagePreference();
  const copy = STRESS_ENGINE_COPY[language] || STRESS_ENGINE_COPY.en;
  const severityOption = STRESS_SEVERITY_OPTIONS.find((item) => item.id === severity);
  const tailIntensity = severityOption?.value ?? customTailIntensity;

  const runSimulation = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        regime,
        horizonDays: String(horizonDays),
        tailIntensity: String(tailIntensity),
        nScenarios: "5000",
        stratifiedStress: "true",
      });
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/market-simulation?${params}`, { cache: "no-store" });
      const payload = await parseResponse(response);
      setSimulation(payload);
    } catch (requestError) {
      setError(friendlyWorkspaceMessage(requestError?.message || requestError, copy.error));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, regime, horizonDays, tailIntensity, copy.error]);

  useEffect(() => {
    if (!workspaceId || simulation || loading) return;
    void runSimulation();
  }, [workspaceId, simulation, loading, runSimulation]);

  const risk = simulation?.risk || {};
  const diagnostics = simulation?.diagnostics || {};
  const deployment = simulation?.deployment || {};
  const validation = simulation?.validation || {};
  const historicalReplay = validation?.historicalReplay || {};
  const baselineComparison = validation?.baselineComparison || diagnostics?.baselineComparison || {};
  const replayRows = safeList(historicalReplay?.rows);
  const mmdRatio = Number(baselineComparison?.ddpmVsChampionMmdRatio ?? baselineComparison?.gaussianMmdRatio);
  const tailContributors = safeList(simulation?.tailContributors);
  const samplePaths = safeList(simulation?.samplePaths);
  const universe = safeList(simulation?.universe);
  const scenarioBankOverlay = simulation?.scenarioBankOverlay || {};
  const scenarioBankRisk = scenarioBankOverlay?.risk || {};
  const warnings = safeList(simulation?.warnings);
  const multiplierCounts = simulation?.model?.stressMultiplierCounts || deployment?.stressBook?.requestedMultiplierCounts || {};
  const endpointGateReason = String(validation?.endpointGate?.reason || "-")
    .replace(/;\s*static scenario books remain diagnostic\.?/gi, ". Daily VaR is validated separately with rolling conditional volatility.")
    .replace(/static scenario books remain diagnostic/gi, "daily VaR is validated separately")
    .replace(/unconditional books remain diagnostic until train-only validation clears/gi, "daily VaR is validated separately with rolling conditional volatility");
  const currentRegime = copy.regimes.find(([id]) => id === regime) || copy.regimes[1];
  const regimeLabel = simulation?.regimeLabel || currentRegime?.[1] || copy.preparing;
  const answer = copy.answer({
    regimeLabel,
    cvar5: risk.cvar5Label || "-",
    horizonDays,
  });
  const userMeaning = buildStressUserMeaning({
    copy,
    horizonDays,
    portfolioValueUsd,
    risk,
    tailContributors,
  });

  return (
    <section className={styles.panel} data-no-translate id="stress-engine-panel">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>{copy.kicker}</p>
          <h2>{copy.title}</h2>
          <p className={styles.supportText}>{copy.body}</p>
        </div>
        <button className={styles.primaryButton} disabled={loading || !workspaceId} onClick={runSimulation} type="button">
          {loading ? copy.running : copy.run}
        </button>
      </div>

      {simulation?.inputSources?.portfolioBasis === "demo_fallback" ? (
        <article className={styles.stressMeaning} data-tone="warn">
          <div>
            <p className={styles.kicker}>{language === "es" ? "Cartera demo" : "Demo portfolio"}</p>
            <h3>{language === "es" ? "Este resultado no es tu riesgo real" : "This result is not your real risk"}</h3>
            <span>{simulation.inputSources.portfolioBasisLabel}</span>
          </div>
        </article>
      ) : null}

      <article className={styles.stressAnswer}>
        <p>{answer}</p>
        <strong>{risk.cvar5Label || "-"}</strong>
        <span>
          CVaR 5% | {simulation?.model?.nScenarios || 5000} {copy.scenarios} | {regimeLabel}
          <InfoTip definitionKey="cvar5" language={language} />
        </span>
      </article>

      <article className={styles.stressMeaning} data-tone={userMeaning.tone}>
        <div>
          <p className={styles.kicker}>{copy.soWhat}</p>
          <h3>{userMeaning.title}</h3>
          <span>{userMeaning.body}</span>
        </div>
        <div className={styles.stressMeaningGrid}>
          <div>
            <span>{copy.warningLabel}</span>
            <strong>{copy.notForecast}</strong>
          </div>
          <div>
            <span>{copy.dollarsAtRisk}</span>
            <strong>{userMeaning.lossValue || "-"}</strong>
          </div>
          <div>
            <span>{copy.topDrivers}</span>
            <strong>{userMeaning.topDrivers || "-"}</strong>
          </div>
          <div>
            <span>{copy.actionLabel}</span>
            <strong>{userMeaning.action}</strong>
          </div>
        </div>
      </article>

      <div className={styles.stressChipGrid}>
        <PlainMetric definitionKey="probabilityLoss" language={language} plain={copy.lossChancePlain} techLabel={copy.loss} tone="warn" value={risk.probabilityLossLabel || "-"} />
        <PlainMetric definitionKey="drawdown" language={language} plain={copy.drawdownPlain} techLabel={language === "es" ? "Caída -10%" : "Drawdown -10%"} tone="bad" value={risk.probabilityDrawdown10Label || "-"} />
        <PlainMetric definitionKey="var1" language={language} plain={copy.worstPathPlain} techLabel="Worst simulated path" tone="bad" value={risk.worstReturnLabel || "-"} />
      </div>

      <div className={styles.stressControls}>
        <label>
          <span>{copy.testAgainst}</span>
          <select className={styles.textInput} onChange={(event) => setRegime(event.target.value)} value={regime}>
            {copy.regimes.map(([id, label, description]) => (
              <option key={id} value={id}>{label} - {description}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.overNext}</span>
          <select className={styles.textInput} onChange={(event) => setHorizonDays(Number(event.target.value))} value={horizonDays}>
            <option value={10}>{copy.days10}</option>
            <option value={20}>{copy.days20}</option>
            <option value={60}>{copy.days60}</option>
          </select>
        </label>
        <div className={styles.stressSeverity}>
          <span>{copy.severity}</span>
          <div role="group" aria-label={copy.severity}>
            {STRESS_SEVERITY_OPTIONS.map((option) => (
              <button data-active={severity === option.id} key={option.id} onClick={() => setSeverity(option.id)} type="button">
                {copy[option.id]}
              </button>
            ))}
          </div>
          <small>{copy.severityCaption}</small>
        </div>
      </div>

      {loading ? <div className={styles.stressProgress}><span /></div> : null}
      {error ? <div className={styles.banner} data-tone="error">{error}</div> : null}

      <div className={styles.stressDamageGrid}>
        <article className={styles.stressDamagePanel}>
          <h3>{copy.damageTitle}</h3>
          {tailContributors.length ? (
            <div className={styles.stressContributorList}>
              {tailContributors.map((item) => (
                <div key={item.ticker} style={{ "--damage": `${Math.min(100, Math.abs(Number(item.contribution) || 0) * 450)}%` }}>
                  <span>
                    <strong>{item.ticker}</strong>
                    {copy.tailContribution.replace("{value}", item.contributionLabel || "-")}
                  </span>
                  <em />
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>{copy.tailEmpty}</p>
          )}
        </article>

        <article className={styles.stressDamagePanel}>
          <h3>{copy.worstPaths}</h3>
          <StressPathChart copy={copy} paths={samplePaths} />
        </article>

        <article className={styles.stressDamagePanel}>
          <h3>{copy.distribution}</h3>
          <StressDistributionStrip copy={copy} risk={risk} />
        </article>

        <article className={styles.stressDamagePanel}>
          <h3>{copy.historicalReplay}</h3>
          {replayRows.length ? (
            <div className={styles.diffusionList}>
              {replayRows.map((row) => (
                <div key={row.id}>
                  <strong>{row.episode}</strong>
                  <span>{copy.actual} {row.actualMinLabel} | {copy.synthetic} {row.syntheticQ01Label} | {row.covered ? copy.covered : copy.notCovered}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>-</p>
          )}
        </article>

        <article className={styles.stressDamagePanel}>
          <h3>{copy.scenarioBank}</h3>
          {scenarioBankOverlay?.available && scenarioBankOverlay?.matchedWeightCoverage ? (
            <div className={styles.diffusionList}>
              <div>
                <strong>{scenarioBankRisk.cvar5Label || "-"}</strong>
                <span>{copy.scenarioBankCvar}</span>
              </div>
              <div>
                <strong>{scenarioBankRisk.var5Label || "-"}</strong>
                <span>{copy.scenarioBankVar}</span>
              </div>
              <div>
                <strong>{scenarioBankOverlay.matchedWeightCoverageLabel || "-"}</strong>
                <span>{copy.scenarioBankCaption({ coverage: scenarioBankOverlay.matchedWeightCoverageLabel, source: scenarioBankOverlay.sourceArray })}</span>
              </div>
            </div>
          ) : (
            <p className={styles.emptyCopy}>{copy.scenarioBankUnavailable}</p>
          )}
        </article>

        <article className={styles.stressDamagePanel}>
          <h3>{copy.universe}</h3>
          {universe.length ? (
            <div className={styles.diffusionUniverse}>
              {universe.slice(0, 8).map((asset) => (
                <span key={asset.ticker}>
                  <strong>{asset.ticker}</strong>
                  {asset.weightLabel}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>{copy.universeEmpty}</p>
          )}
        </article>

        <details className={styles.diffusionDiagnostics}>
          <summary>
            <span>{copy.diagnostics}</span>
            <em>{copy.diagnosticsFor}</em>
          </summary>
          <p>{copy.diagnosticsHint}</p>
          <div className={styles.stressDiagnosticsGrid}>
            <PlainMetric definitionKey="mmd" detail={baselineComparison?.championModel || "Champion baseline diagnostic."} language={language} plain={copy.mmdRatio} techLabel="MMD" tone="warn" value={Number.isFinite(mmdRatio) ? `${mmdRatio.toFixed(2)}x` : baselineComparison?.ddpmVsChampionMmdRatioLabel || baselineComparison?.gaussianMmdRatioLabel || "-"} />
            <PlainMetric definitionKey="correlationFidelity" detail="Sampler convergence against the runtime target matrix." language={language} plain={copy.corrFidelity} techLabel={copy.corrFidelity} value={diagnostics.correlationFidelityLabel || "-"} />
            <PlainMetric definitionKey="distributionCoverage" detail="Internal dispersion bin occupancy." language={language} plain={copy.coverage} techLabel={copy.coverage} value={diagnostics.distributionCoverageLabel || "-"} />
            <PlainMetric definitionKey="endpointGate" detail={endpointGateReason} language={language} plain={copy.endpointGate} techLabel="Gate" tone={validation?.endpointGate?.ready ? "good" : "warn"} value={validation?.endpointGate?.statusLabel || "-"} />
            <PlainMetric definitionKey="calibratedStressEngine" detail={copy.runtimeDetail} language={language} plain={copy.runtime} techLabel={simulation?.model?.championModel || "-"} tone="good" value={simulation?.model?.trainedCheckpointServed ? copy.pytorch : copy.proxy} />
            <PlainMetric detail={simulation?.inputSources?.universePolicy || "-"} language={language} plain={copy.source} techLabel={copy.source} value={simulation?.inputSources?.correlationSource || "-"} />
          </div>
          <div className={styles.stressEngineRoom}>
            <div>
              <strong>{copy.rawTailIntensity}</strong>
              <input
                className={styles.textInput}
                max="4"
                min="0.5"
                onChange={(event) => {
                  setCustomTailIntensity(Number(event.target.value));
                  setSeverity("custom");
                }}
                step="0.1"
                type="number"
                value={customTailIntensity}
              />
              <span>{copy.rawTailHelp}</span>
            </div>
            <div>
              <strong>{copy.multiplierMix}</strong>
              <span>{Object.entries(multiplierCounts).map(([key, value]) => `${key}: ${value}`).join(" | ") || "-"}</span>
            </div>
            <div>
              <strong>{copy.checkpoints}</strong>
              <span>{deployment?.runtime?.checkpointPath || "-"}</span>
              <span>{deployment?.runtime?.manifestPath || simulation?.inputSources?.manifestSource || "-"}</span>
            </div>
            <div>
              <strong>{copy.warnings}</strong>
              {warnings.length ? warnings.map((warning) => <span key={warning}>{friendlyWorkspaceMessage(warning, warning)}</span>) : <span>{copy.noWarnings}</span>}
            </div>
          </div>
          <Link className={styles.inlineLink} href="/stress#methodology">
            {copy.methodology}
          </Link>
        </details>
      </div>

      <div className={styles.stressTrustRibbon}>
        <span>{copy.trustRibbon({ runId: simulation?.runId, seed: simulation?.seed })}</span>
        <InfoTip definitionKey="notPrediction" language={language} />
        <InfoTip definitionKey="calibratedStressEngine" language={language} />
        <InfoTip definitionKey="runFingerprint" language={language} />
      </div>
    </section>
  );
}

const PERFORMANCE_READING_COPY = {
  en: {
    title: "How to read this chart",
    body: ({ totalReturn, benchmark, moneyWeighted, sessions, externalFlows }) =>
      `The line is the portfolio's tracked return from saved snapshots${totalReturn ? ` (${totalReturn})` : ""}${benchmark ? ` versus ${benchmark}` : ""}. MWR/XIRR${moneyWeighted ? ` (${moneyWeighted})` : ""} measures capital timing and cash flows, so do not compare it one-for-one with the line. ${sessions ? `${sessions} snapshots are included.` : ""}${externalFlows ? ` External flows recorded: ${externalFlows}.` : ""}`,
  },
  es: {
    title: "Cómo leer este gráfico",
    body: ({ totalReturn, benchmark, moneyWeighted, sessions, externalFlows }) =>
      `La línea muestra el retorno seguido desde fotos guardadas${totalReturn ? ` (${totalReturn})` : ""}${benchmark ? ` contra ${benchmark}` : ""}. MWR/XIRR${moneyWeighted ? ` (${moneyWeighted})` : ""} mide el momento de entrada del capital y los flujos, así que no se compara uno a uno con la línea. ${sessions ? `${sessions} fotos incluidas.` : ""}${externalFlows ? ` Flujos externos registrados: ${externalFlows}.` : ""}`,
  },
};

function HoldingsPanel({
  portfolioModule,
  holdingDraft,
  onHoldingDraftChange,
  onSubmitHoldingDraft,
  tradeInstruction,
  onTradeInstructionChange,
  onSubmitTrade,
  pendingTrade,
  holdingDraftError,
  tradeInstructionError,
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
          <h2>{holdings.length ? "Análisis de holdings" : "Tus posiciones aparecerán aquí"}</h2>
          <p className={styles.supportText}>Valor, costo base, fuente de precio, exposición y próxima acción por posición.</p>
        </div>
        <ToneBadge tone="neutral">{holdings.length} posiciones</ToneBadge>
      </div>

      {holdings.length ? (
        <div aria-label="Posiciones conectadas" className={`${styles.tableShell} ${styles.holdingsAnalysisTable}`} role="table">
          <div className={styles.tableHeader} role="row">
            <span role="columnheader">Ticker</span>
            <span role="columnheader">Tema</span>
            <span role="columnheader">Sector</span>
            <span role="columnheader">Región</span>
            <span role="columnheader">Acciones</span>
            <span role="columnheader">Costo prom.</span>
            <span role="columnheader">Valor</span>
            <span role="columnheader">Retorno total</span>
            <span role="columnheader">Fuente</span>
            <span role="columnheader">Acción</span>
          </div>
          <div className={styles.tableBody} role="rowgroup">
            {[...holdings].sort((left, right) => holdingWeightValue(right) - holdingWeightValue(left)).map((holding) => {
              const totalReturn = holdingTotalReturnInclDividends(holding);
              const totalPnl = holdingTotalPnlInclDividends(holding);
              return (
                <article className={styles.tableRow} key={`holding-row-${holding.ticker}`} role="row">
                  <div className={styles.tablePrimary} role="cell">
                    <strong>{holding.ticker}</strong>
                    <span>{holdingName(holding)}</span>
                  </div>
                  <span role="cell">{cleanPortfolioLabel(holding.theme || holding.thesisBucket || holding.industry || holding.region, "Sin tema")}</span>
                  <span role="cell">{cleanPortfolioLabel(holding.sector, "-")}</span>
                  <span role="cell">{cleanPortfolioLabel(holding.region, "-")}</span>
                  <strong role="cell">{firstFiniteNumber(holding.shares, holding.quantity) !== null ? firstFiniteNumber(holding.shares, holding.quantity).toFixed(4).replace(/\.?0+$/, "") : "-"}</strong>
                  <span role="cell">{compactCurrency(holding.avgCostUsd)}</span>
                  <strong role="cell">{compactCurrency(holdingAnalysisValue(holding))}</strong>
                  <strong data-tone={signedMoneyTone(totalPnl)} role="cell">
                    {totalReturn !== null ? `${formatSignedPct(totalReturn)} (${compactCurrency(totalPnl)})` : "-"}
                  </strong>
                  <span role="cell">
                    {holdingValueSourceLabel(holding)}
                    {holdingMarketMetaLabel(holding) ? ` · ${holdingMarketMetaLabel(holding)}` : ""}
                  </span>
                  <span role="cell">{holdingActionLabel(holding)}</span>
                </article>
              );
            })}
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
            <div className={styles.segmentedControl} role="group" aria-label="Modo de entrada de posición">
              <button
                className={styles.segmentButton}
                aria-pressed={sizingMode === "shares"}
                data-active={sizingMode === "shares"}
                onClick={() => onHoldingDraftChange("sizing", "shares")}
                type="button"
              >
                Acciones
              </button>
              <button
                className={styles.segmentButton}
                aria-pressed={sizingMode === "value"}
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
        {holdingDraftError ? <p className={styles.errorText}>{holdingDraftError}</p> : null}
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
            aria-label="Nota de compra o venta en lenguaje simple"
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
        {tradeInstructionError ? <p className={styles.errorText}>{tradeInstructionError}</p> : null}
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
  advancedItems,
  copy,
  holdingsCount,
  navItems,
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
    <section className={styles.workspaceSidebar} aria-label={copy.sidebarAria}>
      <div className={styles.workspaceSidebarTop}>
        <Link className={styles.workspaceBrand} href="/">
          <span className={styles.workspaceBrandMark} aria-hidden="true">B</span>
          <span>{workspaceName}</span>
        </Link>
        <p className={styles.supportText}>{copy.sidebarSupport}</p>
      </div>

      <Link className={styles.valuationOsLaunch} href="/aurora">
        <span className={styles.valuationOsLaunchIndex}>01</span>
        <div>
          <strong>AURORA</strong>
          <small>{copy.auroraDetail}</small>
        </div>
        <em>{copy.principal}</em>
      </Link>

      <nav className={styles.workspaceSidebarNav} aria-label={copy.sidebarAria}>
        {navItems.map((item, index) => (
          <button
            className={styles.workspaceSidebarLink}
            data-active={activeSection === item.id}
            data-priority="primary"
            key={item.id}
            onClick={() => onSelectSection(item.id)}
            type="button"
          >
            <span className={styles.workspaceSidebarIndex}>{String(index + 2).padStart(2, "0")}</span>
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

        {showAdvanced && advancedItems.map((item) => (
          <button
            className={styles.workspaceSidebarLink}
            data-active={activeSection === item.id}
            data-priority="secondary"
            key={item.id}
            onClick={() => onSelectSection(item.id)}
            type="button"
          >
            <span className={styles.workspaceSidebarIndex}>-</span>
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
          <strong>{holdingsCount || "-"}</strong>
          <span>{copy.holdings}</span>
        </article>
        <article className={styles.workspaceSidebarStat}>
          <strong>{stagedCount || "-"}</strong>
          <span>{copy.staged}</span>
        </article>
      </div>

      <div className={styles.workspaceSidebarActions}>
        <button className={styles.chatTrigger} data-active={showChat} onClick={onOpenChat} type="button">
          {copy.ask}
        </button>
        <div className={styles.workspaceSidebarUtility}>
          <button className={styles.glossaryTrigger} onClick={onOpenGlossary} type="button">
            {copy.glossary}
          </button>
          <button className={styles.welcomeTrigger} onClick={onOpenGuide} type="button">
            {copy.guide}
          </button>
          <button
            className={styles.glossaryTrigger}
            data-active={showAdvanced}
            onClick={() => setShowAdvanced((v) => !v)}
            type="button"
          >
            {showAdvanced ? copy.hideAdvanced : copy.advanced}
          </button>
        </div>
        <div className={styles.workspaceSidebarLinks}>
          <Link className={styles.secondaryLink} href="/terms">{copy.terms}</Link>
          <Link className={styles.secondaryLink} href="/">{copy.home}</Link>
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
  const cleanSector = (sector) => {
    const value = String(sector || "").trim();
    return value && !["unknown", "sin dato", "n/a", "na"].includes(value.toLowerCase()) ? value : "";
  };
  const candidates = holdings.length
    ? holdings.map((holding, index) => ({
      ticker: holding.ticker || `Activo ${index + 1}`,
      reason: cleanSector(holding.sector) ? `Se compara contra ${cleanSector(holding.sector)}.` : "Se compara contra el resto del portafolio.",
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
        <div className={styles.segmentedControl} role="group" aria-label="Modo de candidatos">
          <button aria-pressed={mode === "ranked"} data-active={mode === "ranked"} onClick={() => setMode("ranked")} type="button">Ranking</button>
          <button aria-pressed={mode === "refusal"} data-active={mode === "refusal"} onClick={() => setMode("refusal")} type="button">Señales rechazadas</button>
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

        <section className={styles.factorLabResult} data-mode={mode}>
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

function ResearchLoopPanel({ workspaceId }) {
  const [loop, setLoop] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runLoop = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/research-loop`, { cache: "no-store" });
      const payload = await parseResponse(response);
      setLoop(payload);
    } catch (requestError) {
      setError(friendlyWorkspaceMessage(requestError?.message || requestError, "No se pudo correr el loop de investigacion."));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || loop || loading) return;
    void runLoop();
  }, [workspaceId, loop, loading, runLoop]);

  const gates = safeList(loop?.agents?.checker?.gates);
  const queue = safeList(loop?.queue);
  const architecture = loop?.architecture || {};

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Research loop</p>
          <h2>Sistema maker/checker para ideas</h2>
          <p className={styles.supportText}>
            Convierte el workspace en una cola verificable: un agente redacta, otro rechaza o aprueba, y nada se promueve sin criterio de parada.
          </p>
        </div>
        <button className={styles.primaryButton} disabled={loading || !workspaceId} onClick={runLoop} type="button">
          {loading ? "Corriendo..." : "Correr iteracion"}
        </button>
      </div>

      {error ? <div className={styles.banner} data-tone="error">{error}</div> : null}

      <div className={styles.researchLoopGrid}>
        <article className={styles.researchLoopHero}>
          <p className={styles.kicker}>{loop?.status || "preparando"}</p>
          <h3>{loop?.headline || "Preparando la primera iteracion"}</h3>
          <p>{loop?.stopCondition?.reason || "El loop leerá acciones, alertas, posiciones y candidatos antes de redactar cualquier memo."}</p>
          <div className={styles.researchLoopMeta}>
            <ToneBadge tone={loop?.status === "ready" ? "good" : loop?.status === "blocked" ? "bad" : loop?.status === "review" ? "warn" : "neutral"}>
              {loop?.stopCondition?.label || "Esperando"}
            </ToneBadge>
            <ToneBadge tone="neutral">{queue.length} tarea{queue.length === 1 ? "" : "s"}</ToneBadge>
          </div>
        </article>

        <article className={styles.researchLoopCard}>
          <h3>Arquitectura</h3>
          <div className={styles.researchLoopStack}>
            <span><strong>Heartbeat</strong>{architecture.heartbeat || "Disparo manual o por refresh."}</span>
            <span><strong>Memoria</strong>{architecture.memory || "Estado escrito fuera del prompt."}</span>
            <span><strong>Isolation</strong>{architecture.isolation || "Una linea por tarea."}</span>
          </div>
        </article>

        <article className={styles.researchLoopCard}>
          <h3>Maker / checker</h3>
          <div className={styles.researchLoopAgents}>
            <span>
              <strong>{loop?.agents?.maker?.role || "research_maker"}</strong>
              {loop?.agents?.maker?.objective || "Redacta el memo minimo util."}
            </span>
            <span>
              <strong>{loop?.agents?.checker?.role || "research_checker"}</strong>
              {loop?.agents?.checker?.stopCondition || "Rechaza si falta evidencia, hay leakage o no hay stop condition."}
            </span>
          </div>
        </article>

        <article className={styles.researchLoopCard}>
          <h3>Gates externos</h3>
          {gates.length ? (
            <div className={styles.researchLoopGates}>
              {gates.map((gate) => (
                <div data-status={gate.status} key={gate.id}>
                  <strong>{gate.label}</strong>
                  <span>{gate.detail}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>Los gates aparecen despues de la primera iteracion.</p>
          )}
        </article>

        <article className={styles.researchLoopCard}>
          <h3>Cola</h3>
          {queue.length ? (
            <div className={styles.researchLoopQueue}>
              {queue.slice(0, 5).map((task) => (
                <div key={task.id}>
                  <span>{task.type}</span>
                  <strong>{task.ticker}: {task.title}</strong>
                  <small>{task.hypothesis}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>Sin tareas activas en la foto actual.</p>
          )}
        </article>
      </div>
    </section>
  );
}

function useMacroBrainLiveSnapshot() {
  const [state, setState] = useState({
    snapshot: macroBrainSnapshot,
    loading: true,
    error: "",
  });

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setState((current) => ({ ...current, loading: true, error: "" }));
    }

    try {
      const response = await fetch(`/api/macro-brain?ts=${Date.now()}`, { cache: "no-store" });
      const payload = await parseResponse(response);
      setState({
        snapshot: { ...macroBrainSnapshot, ...payload },
        loading: false,
        error: "",
      });
    } catch (requestError) {
      setState((current) => ({
        ...current,
        loading: false,
        error: friendlyWorkspaceMessage(
          requestError?.message || requestError,
          "No pude leer Macro Brain en vivo. Se usa la última foto guardada.",
        ),
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh({ silent: true });
    }, 60000);

    return () => window.clearInterval(interval);
  }, [refresh]);

  return { ...state, refresh };
}

function MacroBrainWorkspacePanel() {
  const { snapshot, loading, error, refresh } = useMacroBrainLiveSnapshot();
  const openIdeas = safeList(snapshot.theses).filter((item) => item.state === "open").length;
  const watchedIdeas = safeList(snapshot.theses).filter((item) => item.state === "watch").length;
  const observationLabel = Number.isFinite(Number(snapshot.observations))
    ? Number(snapshot.observations).toLocaleString("es-CL")
    : "-";
  const runLabel = snapshot.runDate ? formatDate(snapshot.runDate) : "Fecha guardada";
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
          <div>
            <p className={styles.kicker}>Macro Brain</p>
            <h2>Última lectura macro</h2>
            <p>{snapshot.shortRead}</p>
            <div className={styles.macroBrainSource}>
              <strong>{snapshot.sourceLabel}</strong>
              <span>{snapshot.freshnessLabel || runLabel}</span>
              <small>{loading ? "Actualizando..." : snapshot.dataStatus}</small>
              <button
                className={styles.macroBrainRefresh}
                disabled={loading}
                onClick={() => refresh()}
                type="button"
              >
                {loading ? "Actualizando" : "Actualizar"}
              </button>
            </div>
            {error ? <p className={styles.macroBrainError}>{error}</p> : null}
          </div>
          <div className={styles.macroBrainStats}>
            <span><strong>{snapshot.seriesCount}</strong> series</span>
            <span><strong>{observationLabel}</strong> datos</span>
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

function mosaicTone(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "neutral";
  if (value >= 75) return "bad";
  if (value >= 30 || value <= -30) return "warn";
  return "neutral";
}

function mosaicScoreLabel(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "-";
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
}

function useMosaicLiveSnapshot() {
  const [state, setState] = useState({
    snapshot: mosaicObservatorySnapshot,
    loading: true,
    error: "",
  });

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setState((current) => ({ ...current, loading: true, error: "" }));
    }

    try {
      const response = await fetch(`/api/mosaic?ts=${Date.now()}`, { cache: "no-store" });
      const payload = await parseResponse(response);
      setState({
        snapshot: { ...mosaicObservatorySnapshot, ...payload },
        loading: false,
        error: "",
      });
    } catch (requestError) {
      setState((current) => ({
        ...current,
        loading: false,
        error: friendlyWorkspaceMessage(
          requestError?.message || requestError,
          "No pude leer MOSAIC en vivo. Se usa la última foto guardada.",
        ),
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh({ silent: true });
    }, 120000);

    return () => window.clearInterval(interval);
  }, [refresh]);

  return { ...state, refresh };
}

function MosaicObservatoryPanel() {
  const { snapshot, loading, error, refresh } = useMosaicLiveSnapshot();
  const topMarkets = safeList(snapshot.markets).slice(0, 5);
  const softMarkets = safeList(snapshot.markets).filter((item) => Number(item.score) < 0).slice(0, 3);
  const scoreGuide = safeList(snapshot.scoreGuide);
  const providerText = safeList(snapshot.providers)
    .slice(0, 4)
    .map((item) => `${item.name} ${item.used}`)
    .join(" / ");

  return (
    <section className={styles.panel}>
      <div className={styles.mosaicPanel}>
        <div className={styles.mosaicLead}>
          <div>
            <p className={styles.kicker}>MOSAIC</p>
            <h2>Presiones globales</h2>
            <p>{snapshot.headline}</p>
          </div>
          <div className={styles.mosaicDial} aria-label={`Indice MOSAIC ${snapshot.index}`}>
            <strong>{snapshot.index}</strong>
            <span>global</span>
          </div>
        </div>

        <div className={styles.mosaicSummary}>
          <span>{snapshot.sourceLine}</span>
          <span>{snapshot.freshness}</span>
          <span>{providerText}</span>
          <span>
            {loading ? "Actualizando..." : snapshot.dataStatus || "Live"}
            <button
              className={styles.macroBrainRefresh}
              disabled={loading}
              onClick={() => refresh()}
              type="button"
            >
              {loading ? "Actualizando" : "Actualizar"}
            </button>
          </span>
        </div>

        {error ? <p className={styles.macroBrainError}>{error}</p> : null}

        <div className={styles.mosaicPlainNote}>
          <strong>Qué significa la primera alerta</strong>
          <span>{snapshot.glossary?.gridEquipment}</span>
        </div>

        <div className={styles.mosaicGuide} aria-label="Guía de puntajes MOSAIC">
          {scoreGuide.map((item) => (
            <div className={styles.mosaicGuideItem} key={item.range}>
              <strong>{item.range}</strong>
              <span>{item.label}</span>
              <small>{item.meaning}</small>
            </div>
          ))}
        </div>

        <p className={styles.mosaicScoreNote}>{snapshot.scoreExample}</p>

        <div className={styles.mosaicLayout}>
          <article className={styles.mosaicMain}>
            <h3>Presión arriba</h3>
            <div className={styles.mosaicRows}>
              {topMarkets.map((item) => (
                <div className={styles.mosaicRow} data-tone={mosaicTone(item.score)} key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.why}</span>
                  </div>
                  <div>
                    <strong>{mosaicScoreLabel(item.score)}</strong>
                    <span>{item.reading}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <aside className={styles.mosaicSide}>
            <div>
              <h3>Demanda floja</h3>
              {softMarkets.map((item) => (
                <div className={styles.mosaicMiniRow} key={item.id}>
                  <span>{item.name}</span>
                  <strong>{mosaicScoreLabel(item.score)}</strong>
                </div>
              ))}
            </div>

            <div>
              <h3>Falta mejorar</h3>
              {safeList(snapshot.gaps).map((item) => (
                <div className={styles.mosaicGap} key={item.market}>
                  <strong>{item.market}</strong>
                  <span>{item.missing}</span>
                </div>
              ))}
            </div>
          </aside>
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
        ? `${holdingsCount} ${holdingsCount === 1 ? "posición conectada" : "posiciones conectadas"}${portfolioAnalytics.chartSource ? ` · ${portfolioAnalytics.chartSource}` : ""}.`
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
  const reserveCopy = cleanWorkspaceCopy(balanceSheet?.spendRule || "Sin cambios hasta que el riesgo sea más claro.");
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
                  Abrir Stress Engine
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
    .replace(/\bWait for a cleaner state before spending optionality on new risk\.?/gi, "Sin cambios hasta que el riesgo sea más claro.")
    .replace(/\bWait for a cleaner state\b/gi, "Sin cambios por ahora")
    .replace(/\bEspera una señal más clara antes de sumar riesgo\.?/gi, "Sin cambios por ahora.")
    .replace(/\bCurrent session\b/gi, "Sesión actual")
    .replace(/\bAvailable to invest\b/gi, "Disponible para invertir")
    .replace(/\bMonthly income\b/gi, "Ingreso mensual")
    .replace(/\bFixed costs\b/gi, "Costos fijos")
    .replace(/\bFixed expenses\b/gi, "Gastos fijos")
    .replace(/\bVariable spending\b/gi, "Gasto variable")
    .replace(/\bVariable expenses\b/gi, "Gasto variable")
    .replace(/\bCash buffer\b/gi, "Reserva disponible")
    .replace(/\bTarget contribution\b/gi, "Aporte objetivo")
    .replace(/\bSavings rate\b/gi, "Ritmo de inversión")
    .replace(/\bTarget coverage\b/gi, "Cobertura objetivo")
    .replace(/\bPreserve the reserve sleeve\b/gi, "Mantener reserva disponible")
    .replace(/\bPreserve the reserve\b/gi, "Mantener reserva disponible")
    .replace(/\bStay\s+patient\b/gi, "Sin cambios por ahora")
    .replace(/\bStay defensive\b/gi, "No sumar riesgo")
    .replace(/\bStay measured\b/gi, "Riesgo acotado")
    .replace(/\bAdd selectively\b/gi, "Agregar selectivamente")
    .replace(/\bRisk-on, but selective\b/gi, "Riesgo alto, selectivo")
    .replace(/\bTake moderate risk\b/gi, "Riesgo acotado")
    .replace(/\bLean into opportunities\b/gi, "Oportunidades puntuales")
    .replace(/\bTake higher risk\b/gi, "Riesgo alto, selectivo")
    .replace(/\bDo not add risk yet\b/gi, "No sumar riesgo")
    .replace(/\bNo valid repair is open\b/gi, "No hay ajuste claro abierto")
    .replace(/\bWatch for confirmation before adding risk\b/gi, "Esperar confirmación antes de sumar riesgo")
    .replace(/\bStart small and keep changes funded\b/gi, "Empezar chico y financiado")
    .replace(/\bRisk can be added selectively\b/gi, "Se puede agregar riesgo de forma selectiva")
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
    .replace(/\bCounterfactual ledger\b/gi, "Historial de decisiones")
    .replace(/\bSaved to Neon\b/gi, "Guardado")
    .replace(/\bPrivate workspace\b/gi, "Espacio privado")
    .replace(/\bConnecting live data\b/gi, "Conectando datos")
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

function ComplianceNotice({ copy }) {
  return (
    <section className={styles.legalNotice}>
      <div>
        <strong>Para planificación e investigación.</strong>
        <p>
          Este espacio ayuda a ordenar caja, contexto de portafolio e investigación. No reemplaza asesoría individual de inversión, impuestos o legal.
        </p>
      </div>
      <Link className={styles.secondaryLink} href="/terms">{copy.terms}</Link>
    </section>
  );
}

export default function TerminalApp({ initialSession, initialDashboard }) {
  const workspaceId = initialDashboard?.workspace_summary?.id || initialSession?.workspace?.id;
  const { language } = useLanguagePreference();
  const shellCopy = WORKSPACE_SHELL_COPY[language] || WORKSPACE_SHELL_COPY.es;
  const workspaceNav = useMemo(() => localizedWorkspaceNav(WORKSPACE_NAV, language), [language]);
  const workspaceNavAdvanced = useMemo(() => localizedWorkspaceNav(WORKSPACE_NAV_ADVANCED, language), [language]);
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
  const [holdingDraft, setHoldingDraft] = useState({
    ticker: "",
    sizing: "shares",
    quantity: "",
    targetValueUsd: "",
    price: "",
  });
  const pendingSectionScrollRef = useRef(null);
  const [tradeInstruction, setTradeInstruction] = useState("");
  const [holdingDraftError, setHoldingDraftError] = useState("");
  const [tradeInstructionError, setTradeInstructionError] = useState("");
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
  const workspaceName = normalizeWorkspaceName(
    dashboard?.workspace_summary?.name || initialSession?.workspace?.name || DEFAULT_APP_NAME,
  );
  const holdingsCount = safeList(portfolioModule?.holdings).length;
  const activeSectionConfig = [...workspaceNav, ...workspaceNavAdvanced].find((item) => item.id === activeWorkspaceSection) || workspaceNav[0];
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
        emptyLabel="Aún no hay notas de evidencia disponibles."
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
          <StressEnginePanel portfolioValueUsd={portfolioModule?.analytics?.totalValueUsd} workspaceId={workspaceId} />
          <PortfolioPanel compact language={language} onRangeChange={setPortfolioRange} portfolioModule={portfolioModule} range={portfolioRange} xray={dashboard?.xray} />
          <SimplePhantomDiversificationPanel portfolioModule={portfolioModule} workspaceId={workspaceId} />
        </>
      );
      break;
    case "candidates":
      activeWorkspacePanels = (
        <>
          <FactorLabWorkspacePanel portfolioModule={portfolioModule} />
          <ResearchLoopPanel workspaceId={workspaceId} />
          <EquityResearchPanel dashboard={dashboard} workspaceId={workspaceId} />
        </>
      );
      break;
    case "macro":
      activeWorkspacePanels = (
        <>
          <MosaicObservatoryPanel />
          <MacroBrainWorkspacePanel />
        </>
      );
      break;
    case "decisions":
      activeWorkspacePanels = (
        <>
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
          <PortfolioPanel
            compact
            onRangeChange={setPortfolioRange}
            language={language}
            onOpenRisk={() => selectWorkspaceSection("risk")}
            portfolioModule={portfolioModule}
            range={portfolioRange}
            showAuroraAction
            xray={dashboard?.xray}
          />
          <HoldingsPanel
            holdingDraft={holdingDraft}
            onHoldingDraftChange={updateHoldingDraft}
            onSubmitHoldingDraft={submitHoldingDraft}
            onSubmitTrade={submitTradeInstruction}
            onTradeInstructionChange={setTradeInstruction}
            pendingTrade={Boolean(pendingKey?.startsWith("trade:"))}
            portfolioModule={portfolioModule}
            holdingDraftError={holdingDraftError}
            tradeInstructionError={tradeInstructionError}
            tradeInstruction={tradeInstruction}
          />
        </>
      );
      break;
    case "today":
    default:
      activeWorkspacePanels = (
        <>
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
    if (!portfolioModule || holdingsCount > 0 || activeWorkspaceSection !== "risk") return;

    pendingSectionScrollRef.current = "holdings";
    setActiveWorkspaceSection("holdings");
    if (typeof window !== "undefined" && window.location.hash !== "#holdings") {
      window.history.replaceState(null, "", "#holdings");
    }
  }, [activeWorkspaceSection, holdingsCount, portfolioModule]);

  useEffect(() => {
    if (pendingSectionScrollRef.current !== activeWorkspaceSection) return;
    pendingSectionScrollRef.current = null;
    scrollWorkspaceSection(activeWorkspaceSection);
  }, [activeWorkspaceSection]);

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
      setHoldingDraftError("");
      setTradeInstructionError("");
    }

    try {
      const payload = await requestFactory();
      const nextBanner = payload?.__refreshMessage || successMessage;
      await applyWorkspacePayload(payload, nextBanner);
    } catch (requestError) {
      setError(friendlyWorkspaceMessage(requestError?.message || requestError, "La solicitud falló."));
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
    setHoldingDraftError("");
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
      setHoldingDraftError(friendlyWorkspaceMessage(requestError?.message || requestError, "No se pudo actualizar la posición."));
    } finally {
      setPendingKey(null);
    }
  }

  async function submitTradeInstruction() {
    const trimmed = String(tradeInstruction || "").trim();
    if (!workspaceId || !trimmed) return;

    setPendingKey(`trade:${trimmed}`);
    setTradeInstructionError("");
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
      setTradeInstructionError(friendlyWorkspaceMessage(requestError?.message || requestError, "No se pudo actualizar la operación."));
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
      `${action.title} quedó en espera para revisar después.`,
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
            advancedItems={workspaceNavAdvanced}
            copy={shellCopy}
            holdingsCount={holdingsCount}
            navItems={workspaceNav}
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
              <p className={styles.eyebrow}>{shellCopy.privateSpace}</p>
              <h1>{workspaceName}</h1>
              <p className={styles.subtitle}>
                {shellCopy.syncedStatus({
                  count: holdingsCount,
                  date: dashboard?.workspace_summary?.last_updated_label || shellCopy.noUpdate,
                })}
              </p>
            </div>

            <div className={styles.headerActions}>
              <div className={styles.headerMeta}>
                <ToneBadge tone="neutral">{initialSession?.user?.name || shellCopy.userFallback}</ToneBadge>
                <ToneBadge tone={statusTone(dashboard?.workspace_summary?.backend_status)}>
                  {capitalize(cleanWorkspaceCopy(dashboard?.workspace_summary?.backend_status || shellCopy.liveFallback))}
                </ToneBadge>
                <ToneBadge tone={connection.status === "live" ? "good" : connection.status === "polling" || connection.status === "warn" ? "warn" : "neutral"}>
                  {connection.label}
                </ToneBadge>
                <ToneBadge tone="neutral">{dashboard?.workspace_summary?.last_updated_label || shellCopy.noUpdate}</ToneBadge>
              </div>

              <div className={styles.buttonRow}>
                <button className={styles.primaryButton} disabled={pendingKey !== null} onClick={refreshWorkspace} type="button">
                  {pendingKey === "refresh" ? shellCopy.refreshing : shellCopy.refresh}
                </button>
                <form action="/api/auth/logout" method="post">
                  <button className={styles.textButton} type="submit">{shellCopy.logout}</button>
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

          <ComplianceNotice copy={shellCopy} />

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

      {isPending ? <div className={styles.pendingNote}>Aplicando actualización...</div> : null}

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
