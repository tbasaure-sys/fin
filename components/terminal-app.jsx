"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

const PORTFOLIO_RANGES = ["1D", "1W", "1M", "YTD", "ALL"];

function formatPct(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "-";
  return `${(number * 100).toFixed(digits)}%`;
}

function formatSignedPct(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "-";
  const prefix = number > 0 ? "+" : "";
  return `${prefix}${(number * 100).toFixed(digits)}%`;
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: number >= 1000 ? 0 : 2,
  }).format(number);
}

function formatDateTime(value) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value) {
  if (!value) return "No expiry";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function formatSize(action) {
  if (!action) return "-";
  if (Number.isFinite(Number(action.sizeValue))) return formatPct(Number(action.sizeValue));
  return action.sizeLabel || "-";
}

function capitalize(value, fallback = "Unknown") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function actionToneClass(action) {
  if (!action) return "is-neutral";
  if (action.status === "blocked") return "is-bad";
  const tone = String(action.tone || "").toLowerCase();
  if (["add", "buy", "quality", "good"].includes(tone)) return "is-good";
  if (["trim", "hedge", "hold", "watch"].includes(tone)) return "is-warn";
  return "is-neutral";
}

function statusToneClass(status) {
  const value = String(status || "").toLowerCase();
  if (["ready", "executed", "live", "fresh"].includes(value)) return "is-good";
  if (["staged", "briefing", "medium"].includes(value)) return "is-warn";
  if (["revoked", "cancelled", "expired", "high", "down"].includes(value)) return "is-bad";
  if (["low"].includes(value)) return "is-low";
  return "is-neutral";
}

function responseToneClass(response) {
  const value = String(response || "").toLowerCase();
  if (["staged", "executed"].includes(value)) return "is-good";
  if (["deferred", "noted"].includes(value)) return "is-warn";
  if (["rejected", "cancelled"].includes(value)) return "is-bad";
  return "is-neutral";
}

function safeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function renderInlineItem(item) {
  if (item === null || item === undefined) return "";
  if (typeof item === "string" || typeof item === "number") return String(item);
  if (typeof item === "object") {
    const label = String(item.label || item.title || item.name || "").trim();
    const value = String(item.value || item.meaning || item.detail || "").trim();
    if (label && value) return `${label}: ${value}`;
    if (label) return label;
    if (value) return value;
  }
  return String(item);
}

function parseDisplayPercent(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.endsWith("%")) {
    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed / 100 : null;
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
}

async function parseResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function StateChip({ label, value, tone = "is-neutral" }) {
  return (
    <div className={`state-chip ${tone}`}>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function InlineList({ items, emptyLabel }) {
  const values = safeList(items);
  if (!values.length) return <p className="panel-empty">{emptyLabel}</p>;

  return (
    <ul className="inline-list">
      {values.map((item, index) => (
        <li key={`${renderInlineItem(item)}-${index}`}>{renderInlineItem(item)}</li>
      ))}
    </ul>
  );
}

function parseSeriesDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function filterPortfolioSeries(series, range) {
  const rows = safeList(series);
  if (!rows.length) return [];
  if (range === "1D") return rows.slice(-2);
  if (range === "1W") return rows.slice(-5);
  if (range === "1M") return rows.slice(-22);
  if (range === "YTD") {
    const currentYear = new Date().getFullYear();
    const filtered = rows.filter((row) => parseSeriesDate(row.date)?.getFullYear() === currentYear);
    return filtered.length ? filtered : rows.slice(-60);
  }
  return rows;
}

function buildLinePath(points, width, height, padding) {
  if (!points.length) return "";
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const safeRange = max - min || 1;

  return points
    .map((point, index) => {
      const x = padding + ((width - (padding * 2)) * index) / Math.max(points.length - 1, 1);
      const y = height - padding - (((point.value - min) / safeRange) * (height - (padding * 2)));
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function PortfolioMiniChart({ series, benchmarkSymbol }) {
  const width = 460;
  const height = 200;
  const padding = 18;
  const rows = safeList(series);

  const portfolioPoints = rows
    .map((row) => ({ date: row.date, value: Number(row.portfolio) }))
    .filter((row) => Number.isFinite(row.value));
  const benchmarkPoints = rows
    .map((row) => ({ date: row.date, value: Number(row.benchmark) }))
    .filter((row) => Number.isFinite(row.value));

  if (portfolioPoints.length < 2) {
    return <p className="panel-empty">Portfolio history is still building. This chart will fill in as live snapshots accumulate.</p>;
  }

  const portfolioPath = buildLinePath(portfolioPoints, width, height, padding);
  const benchmarkPath = buildLinePath(benchmarkPoints, width, height, padding);
  const latestPortfolio = portfolioPoints[portfolioPoints.length - 1];

  return (
    <div className="portfolio-hero-chart">
      <svg className="portfolio-hero-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Portfolio performance chart">
        <defs>
          <linearGradient id="portfolioHeroLine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(248, 200, 111, 0.85)" />
            <stop offset="100%" stopColor="rgba(122, 210, 194, 1)" />
          </linearGradient>
        </defs>
        <path className="portfolio-hero-gridline" d={`M ${padding} ${height - padding} L ${width - padding} ${height - padding}`} />
        {benchmarkPath ? <path className="portfolio-hero-benchmark" d={benchmarkPath} /> : null}
        <path className="portfolio-hero-line" d={portfolioPath} />
        <circle
          className="portfolio-hero-point"
          cx={padding + ((width - (padding * 2)) * (portfolioPoints.length - 1)) / Math.max(portfolioPoints.length - 1, 1)}
          cy={(() => {
            const values = portfolioPoints.map((point) => point.value);
            const min = Math.min(...values);
            const max = Math.max(...values);
            const safeRange = max - min || 1;
            return height - padding - (((latestPortfolio.value - min) / safeRange) * (height - (padding * 2)));
          })()}
          r="4"
        />
      </svg>

      <div className="portfolio-hero-legend">
        <span><i className="legend-swatch is-portfolio" />Your portfolio</span>
        <span><i className="legend-swatch is-benchmark" />{benchmarkSymbol || "SPY"}</span>
      </div>
    </div>
  );
}

function PortfolioHoldingsSpotlight({ portfolioModule }) {
  const portfolio = portfolioModule || {};
  const holdings = safeList(portfolio.holdings).slice(0, 6);
  const sectors = safeList(portfolio.sectorExposure).slice(0, 4);
  const analytics = portfolio.analytics || {};

  if (!holdings.length) return null;

  const shownWeight = holdings.reduce((sum, holding) => sum + (parseDisplayPercent(holding.weight) || 0), 0);

  return (
    <section className="portfolio-spotlight" aria-label="Portfolio holdings overview">
      <div className="portfolio-spotlight-header">
        <div>
          <span className="support-label">Composition</span>
          <h3>Largest positions and where the book is leaning.</h3>
        </div>
        <span className="info-chip">
          {holdings.length} of {analytics.holdingsCount || holdings.length} shown
        </span>
      </div>

      <div className="portfolio-spotlight-grid">
        <div className="portfolio-spotlight-stack" role="list" aria-label="Largest positions">
          {holdings.map((holding, index) => {
            const weightValue = parseDisplayPercent(holding.weight);
            const width = `${Math.max(16, Math.round((weightValue || 0.06) * 100))}%`;

            return (
              <article className="portfolio-spotlight-holding" key={holding.ticker} role="listitem">
                <div className="portfolio-spotlight-meter" aria-hidden="true">
                  <span style={{ width }} />
                </div>
                <div className="portfolio-spotlight-main">
                  <div className="portfolio-spotlight-symbol">
                    <strong>{holding.ticker}</strong>
                    <span>{holding.sector || "Unclassified"}</span>
                  </div>
                  <div className="portfolio-spotlight-meta">
                    <strong>{holding.weight || "-"}</strong>
                    <span>{holding.marketValueUsd ? formatCurrency(holding.marketValueUsd) : "Value pending"}</span>
                  </div>
                </div>
                <div className="portfolio-spotlight-rank" aria-label={`Rank ${index + 1}`}>
                  0{index + 1}
                </div>
              </article>
            );
          })}
        </div>

        <div className="portfolio-spotlight-sidebar">
          <div className="portfolio-spotlight-panel">
            <span className="support-label">Sector balance</span>
            <div className="portfolio-sector-list">
              {sectors.length ? sectors.map((sector) => (
                <div className="portfolio-sector-row" key={sector.label}>
                  <div className="portfolio-sector-copy">
                    <strong>{sector.label}</strong>
                    <span>{formatPct(sector.value || 0)}</span>
                  </div>
                  <div className="portfolio-sector-track" aria-hidden="true">
                    <span style={{ width: `${Math.max(10, Math.round((sector.normalized || sector.value || 0) * 100))}%` }} />
                  </div>
                </div>
              )) : <p className="panel-empty">Sector balance will appear as holdings metadata fills in.</p>}
            </div>
          </div>

          <div className="portfolio-spotlight-panel">
            <span className="support-label">Reading</span>
            <p className="portfolio-spotlight-note">
              The largest visible positions represent {formatPct(shownWeight)} of the current book
              {analytics.totalValueUsd ? ` across ${formatCurrency(analytics.totalValueUsd)} in tracked value.` : "."}
            </p>
          </div>
        </div>
      </div>

      <div className="portfolio-spotlight-ticker-row" aria-label="Holdings quick view">
        {holdings.map((holding) => (
          <span className="portfolio-spotlight-pill" key={`${holding.ticker}-pill`}>
            <strong>{holding.ticker}</strong>
            <span>{holding.weight || holding.sector || "-"}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

function PortfolioHero({ portfolioModule, range, onRangeChange }) {
  const portfolio = portfolioModule || {};
  const analytics = portfolio.analytics || {};
  const chartSeries = filterPortfolioSeries(portfolio?.charts?.growthComparison, range);
  const topHoldings = safeList(portfolio.holdings).slice(0, 6);
  const featuredHolding = topHoldings[0] || null;
  const supportingHoldings = topHoldings.slice(1, 6);
  const currentGainLabel = analytics.unrealizedReturnLabel || "Cost basis still syncing";
  const comparisonLabel = analytics.hasBenchmarkHistory
    ? `${analytics.excessReturnLabel} vs ${analytics.benchmarkSymbol || "SPY"}`
    : "Waiting for enough live history to compare against SPY";
  const performanceNarrative = analytics.hasPerformanceHistory
    ? `Live performance is based on ${analytics.historySessions} stored portfolio snapshots.`
    : `Current gain is ${currentGainLabel}. The app needs more stored sessions before performance and benchmark comparisons are reliable.`;

  return (
    <section className="workspace-portfolio-hero">
      <div className="card-header-row">
        <div>
          <p className="panel-kicker">Your portfolio</p>
          <h2>{analytics.totalValueUsd ? formatCurrency(analytics.totalValueUsd) : "Portfolio connected"}</h2>
        </div>
        <div className="chip-row">
          <span className="info-chip">{analytics.holdingsCount || 0} holdings</span>
          <span className="info-chip">{portfolio.chartSource || "Portfolio data loading"}</span>
        </div>
      </div>

      <div className="portfolio-hero-summary">
        <div className="portfolio-metric">
          <span>Annualized return</span>
          <strong>{analytics.hasPerformanceHistory ? analytics.annualReturnLabel : "Building history"}</strong>
          <small>{analytics.hasPerformanceHistory ? "Based on stored snapshots" : currentGainLabel}</small>
        </div>
        <div className="portfolio-metric">
          <span>Since tracking started</span>
          <strong>{analytics.totalReturnLabel || "History needed"}</strong>
          <small>{analytics.historySessions ? `${analytics.historySessions} stored observations` : "Holdings are connected"}</small>
        </div>
        <div className="portfolio-metric">
          <span>vs {analytics.benchmarkSymbol || "SPY"}</span>
          <strong>{analytics.hasBenchmarkHistory ? analytics.excessReturnLabel : "Not ready"}</strong>
          <small>{comparisonLabel}</small>
        </div>
      </div>

      <div className="portfolio-hero-main">
        <div className="portfolio-hero-holdings">
          <div className="portfolio-holdings-stage">
            <div className="portfolio-holdings-copy">
              <span className="support-label">Portfolio view</span>
              <h3>{featuredHolding?.ticker || "Holdings connected"}</h3>
              <p>
                {featuredHolding
                  ? `${featuredHolding.weight || "-"} of the book, ${featuredHolding.sector || "Unassigned sector"}`
                  : "Your private holdings are connected and ready to render here."}
              </p>
            </div>

            {featuredHolding ? (
              <div className="portfolio-holding-stage-card">
                <div className="holding-stage-top">
                  <strong>{featuredHolding.ticker}</strong>
                  <span>{featuredHolding.weight || "-"}</span>
                </div>
                <p>{featuredHolding.sector || "Unknown sector"}</p>
                <div className="holding-stage-meta">
                  <span>{featuredHolding.marketValueUsd ? formatCurrency(featuredHolding.marketValueUsd) : "Value syncing"}</span>
                  <span>{featuredHolding.currentPriceUsd ? formatCurrency(featuredHolding.currentPriceUsd) : "Price syncing"}</span>
                </div>
              </div>
            ) : null}

            {supportingHoldings.length ? (
              <div className="portfolio-holding-mosaic">
                {supportingHoldings.map((holding, index) => (
                  <article
                    className={`portfolio-holding-tile tile-${(index % 4) + 1}`}
                    key={holding.ticker}
                  >
                    <div>
                      <strong>{holding.ticker}</strong>
                      <span>{holding.sector || "Unknown sector"}</span>
                    </div>
                    <em>{holding.weight || "-"}</em>
                  </article>
                ))}
              </div>
            ) : (
              <p className="panel-empty">No holdings are loaded into this workspace yet.</p>
            )}
          </div>

          <div className="portfolio-hero-bottom">
            <div>
              <span className="support-label">Largest positions</span>
              {topHoldings.length ? (
                <ul className="portfolio-holding-inline-list">
                  {topHoldings.map((holding) => (
                    <li key={holding.ticker}>
                      <strong>{holding.ticker}</strong>
                      <span>{holding.weight || "-"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="panel-empty">No holdings are loaded into this workspace yet.</p>
              )}
            </div>

            <div>
              <span className="support-label">What this means</span>
              <p className="portfolio-hero-note">{performanceNarrative}</p>
            </div>
          </div>
        </div>

        <div className="portfolio-hero-chart-shell">
          <div className="portfolio-range-row" role="tablist" aria-label="Portfolio ranges">
            {PORTFOLIO_RANGES.map((option) => (
              <button
                key={option}
                className={`range-chip ${range === option ? "is-active" : ""}`}
                onClick={() => onRangeChange(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>

          <PortfolioMiniChart series={chartSeries} benchmarkSymbol={analytics.benchmarkSymbol} />
        </div>
      </div>
    </section>
  );
}

function ActionCard({
  action,
  label,
  description,
  showControls,
  pendingKey,
  onStage,
  onDefer,
  onReject,
}) {
  if (!action) {
    return (
      <article className="workspace-card action-card action-card-empty">
        <p className="panel-kicker">{label}</p>
        <h3>No action surfaced</h3>
        <p className="panel-empty">{description}</p>
      </article>
    );
  }

  const metaLines = [
    `Size ${formatSize(action)}`,
    action.funding ? `Funding ${action.funding}` : null,
    action.sourceLabel ? `Source ${action.sourceLabel}` : null,
  ].filter(Boolean);

  return (
    <article className={`workspace-card action-card ${actionToneClass(action)}`}>
      <div className="card-header-row">
        <div>
          <p className="panel-kicker">{label}</p>
          <h3>{action.title}</h3>
        </div>
        <span className={`status-pill ${statusToneClass(action.status)}`}>
          {capitalize(action.status === "allowed" ? action.slot : action.status)}
        </span>
      </div>

      <p className="card-summary">{action.summary || description}</p>

      <div className="chip-row">
        {action.ticker ? <span className="info-chip">{action.ticker}</span> : null}
        {metaLines.map((item) => (
          <span className="info-chip" key={item}>{item}</span>
        ))}
      </div>

      {action.whyNow ? (
        <div className="support-block">
          <span className="support-label">Why now</span>
          <p>{action.whyNow}</p>
        </div>
      ) : null}

      {safeList(action.effects).length ? (
        <div className="support-block">
          <span className="support-label">Likely effects</span>
          <InlineList items={safeList(action.effects).slice(0, 3)} emptyLabel="" />
        </div>
      ) : null}

      {safeList(action.evidenceLines).length ? (
        <div className="support-block">
          <span className="support-label">Evidence</span>
          <InlineList items={safeList(action.evidenceLines).slice(0, 3)} emptyLabel="" />
        </div>
      ) : null}

      {showControls ? (
        <div className="action-controls">
          <button
            className="primary-button"
            disabled={pendingKey !== null}
            onClick={() => onStage(action)}
            type="button"
          >
            {pendingKey === "stage" ? "Staging..." : "Stage"}
          </button>
          <button
            className="ghost-button"
            disabled={pendingKey !== null}
            onClick={() => onDefer(action)}
            type="button"
          >
            {pendingKey === "defer" ? "Saving..." : "Not now"}
          </button>
          <button
            className="text-button"
            disabled={pendingKey !== null}
            onClick={() => onReject(action)}
            type="button"
          >
            {pendingKey === "reject" ? "Saving..." : "Pass"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function EscrowCard({ item, pending, onExecute, onCancel, onToggleAuto }) {
  const terminal = ["executed", "cancelled", "expired", "revoked"].includes(item.status);
  const readiness = Math.max(0, Math.min(1, Number(item.readiness || 0)));
  const readinessLabel = `${Math.round(readiness * 100)}% ready`;

  return (
    <article className="workspace-card escrow-card">
      <div className="card-header-row">
        <div>
          <p className="panel-kicker">Escrow</p>
          <h3>{item.title}</h3>
        </div>
        <span className={`status-pill ${statusToneClass(item.status)}`}>{capitalize(item.status)}</span>
      </div>

      <p className="card-summary">{item.summary || "Waiting for state confirmation."}</p>

      <div className="chip-row">
        {item.ticker ? <span className="info-chip">{item.ticker}</span> : null}
        <span className="info-chip">Size {formatSize(item)}</span>
        <span className="info-chip">Expires {formatDate(item.expiresAt)}</span>
      </div>

      <div className="readiness-row">
        <div className="readiness-track">
          <span className="readiness-fill" style={{ width: `${readiness * 100}%` }} />
        </div>
        <strong>{readinessLabel}</strong>
      </div>

      <div className="escrow-details">
        <div>
          <span className="support-label">Maturity</span>
          <InlineList items={safeList(item.maturityConditions).slice(0, 2)} emptyLabel="No maturity condition set." />
        </div>
        <div>
          <span className="support-label">Invalidation</span>
          <InlineList items={safeList(item.invalidationConditions).slice(0, 2)} emptyLabel="No invalidation condition set." />
        </div>
      </div>

      <label className={`toggle-row ${terminal ? "is-disabled" : ""}`}>
        <input
          checked={Boolean(item.autoMature)}
          disabled={terminal || pending}
          onChange={() => onToggleAuto(item)}
          type="checkbox"
        />
        <span>Guarded auto-mature</span>
      </label>

      {item.autoMature && !terminal ? (
        <p className="support-note">
          Auto-mature is armed. The decision will still stay inside size caps and state rules.
        </p>
      ) : null}

      {!terminal ? (
        <div className="action-controls">
          <button
            className="primary-button"
            disabled={pending || item.status !== "ready"}
            onClick={() => onExecute(item)}
            type="button"
          >
            {pending && item.status === "ready" ? "Executing..." : "Execute"}
          </button>
          <button
            className="ghost-button"
            disabled={pending}
            onClick={() => onCancel(item)}
            type="button"
          >
            {pending ? "Updating..." : "Cancel"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function TerminalApp({ initialSession, initialDashboard }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [showEvidence, setShowEvidence] = useState(false);
  const [banner, setBanner] = useState("");
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState(null);
  const [portfolioRange, setPortfolioRange] = useState("1M");
  const [isPending, startTransition] = useTransition();

  const workspaceId = dashboard?.workspace_summary?.id || initialSession?.workspace?.id;
  const stateSummary = dashboard?.state_summary || {};
  const portfolioModule = dashboard?.modules?.portfolio || null;
  const primaryAction = dashboard?.primary_action || null;
  const secondaryActions = safeList(dashboard?.secondary_actions);
  const blockedAction = dashboard?.blocked_action || null;
  const evidence = dashboard?.evidence_drawer || {};
  const escrow = dashboard?.escrow || { items: [] };
  const memory = dashboard?.memory || {};
  const alerts = safeList(dashboard?.decision_workspace?.alerts || dashboard?.alerts).slice(0, 2);

  useEffect(() => {
    if (!workspaceId) return undefined;

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/workspace`, { cache: "no-store" });
        const payload = await parseResponse(response);
        startTransition(() => {
          setDashboard(payload);
        });
      } catch {
        // Keep the current snapshot if a background refresh fails.
      }
    }, 60000);

    return () => window.clearInterval(interval);
  }, [workspaceId]);

  async function runWorkspaceAction(key, requestFactory, successMessage) {
    if (!workspaceId) return;

    setPendingKey(key);
    setError("");

    try {
      const payload = await requestFactory();
      startTransition(() => {
        setDashboard(payload);
      });
      setBanner(successMessage);
    } catch (requestError) {
      setError(String(requestError?.message || requestError || "Request failed."));
    } finally {
      setPendingKey(null);
    }
  }

  async function refreshWorkspace() {
    await runWorkspaceAction(
      "refresh",
      async () => {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/workspace`, { cache: "no-store" });
        return parseResponse(response);
      },
      "Workspace refreshed.",
    );
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
      `${action.title} marked as ${capitalize(userResponse, "Noted").toLowerCase()}.`,
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
    <main className="workspace-shell">
      <div className="workspace-noise" aria-hidden="true" />

      <header className="workspace-header">
        <div>
          <p className="workspace-kicker">RecoveryOS</p>
          <h1>{dashboard?.workspace_summary?.name || initialSession?.workspace?.name || "BLS Prime"}</h1>
          <p className="workspace-subtitle">
            Your portfolio, your next move, and the live market context behind it.
          </p>
        </div>

        <div className="workspace-header-side">
          <div className="workspace-meta-row">
            <span className="info-chip">{initialSession?.user?.name || "Member workspace"}</span>
            <span className={`status-pill ${statusToneClass(dashboard?.workspace_summary?.backend_status)}`}>
              {capitalize(dashboard?.workspace_summary?.backend_status, "Live")}
            </span>
            <span className="info-chip">{dashboard?.workspace_summary?.last_updated_label || "No refresh time"}</span>
          </div>

          <div className="header-action-row">
            <button className="ghost-button" disabled={pendingKey !== null} onClick={refreshWorkspace} type="button">
              {pendingKey === "refresh" ? "Refreshing..." : "Refresh"}
            </button>
            <button
              className="ghost-button"
              onClick={() => setShowEvidence((current) => !current)}
              type="button"
            >
              {showEvidence ? "Hide evidence" : "Show evidence"}
            </button>
            <Link className="text-link" href="/legacy">Legacy surface</Link>
            <form action="/api/auth/logout" method="post">
              <button className="text-button" type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      {banner ? <div className="workspace-banner">{banner}</div> : null}
      {error ? <div className="workspace-banner is-error">{error}</div> : null}

      {alerts.length ? (
        <section className="workspace-alert-strip" aria-label="Current alerts">
          {alerts.map((alert) => (
            <article className="workspace-alert" key={alert.id}>
              <span className={`status-pill ${statusToneClass(alert.severity)}`}>{capitalize(alert.severity)}</span>
              <div>
                <strong>{alert.title}</strong>
                <p>{alert.body}</p>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="workspace-overview">
        <div className="workspace-overview-copy">
          <p className="panel-kicker">Now</p>
          <h2>{stateSummary.stance || "Stay patient"}</h2>
          <p>{stateSummary.decisionSummary || "No decision summary is available yet."}</p>
          <PortfolioHoldingsSpotlight portfolioModule={portfolioModule} />
        </div>

        <PortfolioHero
          onRangeChange={setPortfolioRange}
          portfolioModule={portfolioModule}
          range={portfolioRange}
        />

        <div className="state-chip-grid">
          <StateChip label="Mode" value={stateSummary.mode} tone="is-neutral" />
          <StateChip label="Recovery" value={stateSummary.recovery} tone="is-good" />
          <StateChip label="Ambiguity" value={stateSummary.ambiguity} tone="is-warn" />
          <StateChip label="Evidence" value={stateSummary.evidenceStrength} tone="is-neutral" />
          <StateChip label="Sponsorship" value={capitalize(stateSummary.sponsorship)} tone="is-neutral" />
        </div>
      </section>

      <div className="workspace-grid">
        <section className="workspace-panel workspace-panel-now">
          <div className="section-heading">
            <div>
              <p className="panel-kicker">Now</p>
              <h2>Current action rights</h2>
            </div>
            <div className="chip-row">
              <span className="info-chip">Holdings {stateSummary.holdings || "-"}</span>
              <span className="info-chip">Main risk {capitalize(stateSummary.mainRisk)}</span>
            </div>
          </div>

          <div className="action-grid">
            <ActionCard
              action={primaryAction}
              description="The engine has not surfaced a primary move yet."
              label="Primary action"
              onDefer={(action) => recordDecision(action, "deferred")}
              onReject={(action) => recordDecision(action, "rejected")}
              onStage={stageAction}
              pendingKey={pendingKey === `stage:${primaryAction?.id}` ? "stage" : pendingKey === `deferred:${primaryAction?.id}` ? "defer" : pendingKey === `rejected:${primaryAction?.id}` ? "reject" : null}
              showControls={Boolean(primaryAction)}
            />

            {secondaryActions.map((action) => (
              <ActionCard
                action={action}
                description="No secondary action surfaced."
                key={action.id || action.title}
                label="Also valid"
                onDefer={(value) => recordDecision(value, "deferred")}
                onReject={(value) => recordDecision(value, "rejected")}
                onStage={stageAction}
                pendingKey={pendingKey === `stage:${action.id}` ? "stage" : pendingKey === `deferred:${action.id}` ? "defer" : pendingKey === `rejected:${action.id}` ? "reject" : null}
                showControls
              />
            ))}

            <ActionCard
              action={blockedAction}
              description="No explicit blocked action surfaced."
              label="Blocked temptation"
              pendingKey={null}
              showControls={false}
            />
          </div>

          <div className="trigger-grid">
            <div className="workspace-card trigger-card">
              <p className="panel-kicker">Reopen risk</p>
              <p>{dashboard?.decision_workspace?.reopenTrigger || stateSummary.changeTrigger || "No reopen trigger available."}</p>
            </div>
            <div className="workspace-card trigger-card">
              <p className="panel-kicker">Close the range</p>
              <p>{dashboard?.decision_workspace?.closeTrigger || "No close trigger available."}</p>
            </div>
          </div>

          {showEvidence ? (
            <article className="workspace-card evidence-card">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">Evidence</p>
                  <h2>{evidence.headline || "Evidence drawer"}</h2>
                </div>
              </div>

              <p className="card-summary">{evidence.summary || "No evidence summary is available."}</p>

              <div className="evidence-grid">
                <div>
                  <span className="support-label">Current read</span>
                  <ul className="metric-list">
                    {safeList(evidence.currentRead).map((item) => (
                      <li key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <span className="support-label">Thresholds</span>
                  <ul className="metric-list">
                    {safeList(evidence.thresholds).map((item) => (
                      <li key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="support-block">
                <span className="support-label">Fiber read</span>
                <p>{evidence.fiberTakeaway || "No fiber read is available."}</p>
              </div>

              <div className="support-block">
                <span className="support-label">Top analog</span>
                <p>{evidence.topAnalog || "No analog available."}</p>
              </div>

              {safeList(evidence.memoryNarrative).length ? (
                <div className="support-block">
                  <span className="support-label">Memory narrative</span>
                  <InlineList items={safeList(evidence.memoryNarrative).slice(0, 4)} emptyLabel="" />
                </div>
              ) : null}
            </article>
          ) : null}
        </section>

        <aside className="workspace-side">
          <section className="workspace-panel">
            <div className="section-heading">
              <div>
                <p className="panel-kicker">Escrow</p>
                <h2>Staged decisions</h2>
              </div>
              <span className="info-chip">{escrow.summary || "No staged decisions yet."}</span>
            </div>

            <div className="stack-list">
              {safeList(escrow.items).length ? (
                safeList(escrow.items).map((item) => (
                  <EscrowCard
                    item={item}
                    key={item.id}
                    onCancel={(value) => patchEscrow(value, { action: "cancel" }, `${value.title} cancelled.`)}
                    onExecute={(value) => patchEscrow(value, { action: "execute" }, `${value.title} executed.`)}
                    onToggleAuto={(value) => patchEscrow(
                      value,
                      { autoMature: !value.autoMature },
                      `${value.title} ${value.autoMature ? "disarmed" : "armed"} for guarded auto-mature.`,
                    )}
                    pending={pendingKey?.endsWith(`:${item.id}`) || false}
                  />
                ))
              ) : (
                <article className="workspace-card empty-card">
                  <p className="panel-empty">No staged decisions yet. Stage only the moves that still look legitimate under the current state.</p>
                </article>
              )}
            </div>
          </section>

          <section className="workspace-panel">
            <div className="section-heading">
              <div>
                <p className="panel-kicker">Memory</p>
                <h2>Counterfactual learning</h2>
              </div>
              <span className="info-chip">
                {Number.isFinite(Number(memory.confidencePenalty)) ? `Penalty ${formatPct(memory.confidencePenalty)}` : "Learning live"}
              </span>
            </div>

            <div className="memory-stat-row">
              <StateChip label="Staged" value={String(memory?.stats?.staged ?? 0)} tone="is-neutral" />
              <StateChip label="Executed" value={String(memory?.stats?.executed ?? 0)} tone="is-good" />
              <StateChip label="Deferred" value={String(memory?.stats?.deferred ?? 0)} tone="is-warn" />
              <StateChip label="Cancelled" value={String(memory?.stats?.cancelled ?? 0)} tone="is-bad" />
            </div>

            <div className="memory-section">
              <span className="support-label">Weekly brief</span>
              <InlineList items={safeList(memory.weeklyBrief).slice(0, 4)} emptyLabel="No weekly brief has been generated yet." />
            </div>

            {memory.penaltyReason ? (
              <div className="support-block">
                <span className="support-label">Calibration note</span>
                <p>{memory.penaltyReason}</p>
              </div>
            ) : null}

            <div className="memory-section">
              <span className="support-label">Recent decisions</span>
              {safeList(memory.recentEvents).length ? (
                <ul className="memory-event-list">
                  {safeList(memory.recentEvents).map((event) => (
                    <li className="memory-event" key={event.id}>
                      <div>
                        <strong>{event.title}</strong>
                        <p>{event.note || "No note recorded."}</p>
                      </div>
                      <div className="memory-event-side">
                        <span className={`status-pill ${responseToneClass(event.responseKey)}`}>{event.response}</span>
                        <time>{formatDateTime(event.occurredAt)}</time>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="panel-empty">No decision history yet. The memory twin starts learning once you stage, defer, or pass on surfaced actions.</p>
              )}
            </div>
          </section>
        </aside>
      </div>

      {isPending ? <div className="workspace-footer-note">Applying update...</div> : null}
    </main>
  );
}
