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

function ActionFrontierPanel({
  frontier,
  actionLookup,
  escrowLookup,
  pendingKey,
  onStage,
  onDefer,
  onReject,
  onExecuteEscrow,
  onCancelEscrow,
  onSelectStory,
}) {
  const lanes = safeList(frontier?.lanes);

  return (
    <section className="decision-panel frontier-panel">
      <div className="decision-panel-header">
        <div>
          <p className="panel-kicker">Action frontier</p>
          <h2>{frontier?.headline || "Action frontier"}</h2>
          <p>{frontier?.subhead || "See what is unlocked, staged, or blocked before you move."}</p>
        </div>
        <div className="chip-row">
          {safeList(frontier?.laneSummary).map((lane) => (
            <span className="info-chip" key={lane.id}>{lane.label} {lane.count}</span>
          ))}
        </div>
      </div>

      <div className="frontier-lanes">
        {lanes.map((lane) => (
          <section className={`frontier-lane lane-${lane.id}`} key={lane.id}>
            <div className="frontier-lane-header">
              <div>
                <span className="support-label">{lane.label}</span>
                <strong>{safeList(lane.items).length ? `${safeList(lane.items).length} live` : "Empty"}</strong>
              </div>
            </div>

            <div className="frontier-lane-stack">
              {safeList(lane.items).length ? safeList(lane.items).map((item) => {
                const liveAction = item?.id ? actionLookup.get(item.id) : null;
                const liveEscrow = item?.id ? escrowLookup.get(item.id) : null;
                return (
                  <article className={`frontier-card lane-${lane.id}`} key={item.id}>
                    <div className="frontier-card-head">
                      <div>
                        <span className="support-label">{item.laneLabel}</span>
                        <h3>{item.title}</h3>
                      </div>
                      {item.ticker ? (
                        <button className="info-chip frontier-ticker-button" onClick={() => onSelectStory(item.ticker)} type="button">
                          {item.ticker}
                        </button>
                      ) : null}
                    </div>

                    <p className="frontier-summary">{item.summary || item.whyLane}</p>

                    <div className="chip-row">
                      <span className="info-chip">Size {item.sizeLabel || "-"}</span>
                      <span className="info-chip">{item.funding || "No funding note"}</span>
                      <span className="info-chip">{item.evidenceBand || "Usable"} confidence</span>
                    </div>

                    <div className="frontier-meta-grid">
                      <div>
                        <span className="support-label">Why it sits here</span>
                        <p>{item.whyLane}</p>
                      </div>
                      <div>
                        <span className="support-label">What would make it wrong</span>
                        <p>{item.disproofCondition || "No disproof condition published yet."}</p>
                      </div>
                    </div>

                    {item.watchFor ? (
                      <div className="frontier-support-line">
                        <span className="support-label">Watch for</span>
                        <p>{item.watchFor}</p>
                      </div>
                    ) : null}

                    {lane.id === "unlocked" && liveAction ? (
                      <div className="action-controls">
                        <button
                          className="primary-button"
                          disabled={pendingKey !== null}
                          onClick={() => onStage(liveAction)}
                          type="button"
                        >
                          {pendingKey === `stage:${liveAction.id}` ? "Staging..." : "Stage"}
                        </button>
                        <button
                          className="ghost-button"
                          disabled={pendingKey !== null}
                          onClick={() => onDefer(liveAction)}
                          type="button"
                        >
                          {pendingKey === `deferred:${liveAction.id}` ? "Saving..." : "Not now"}
                        </button>
                        <button
                          className="text-button"
                          disabled={pendingKey !== null}
                          onClick={() => onReject(liveAction)}
                          type="button"
                        >
                          {pendingKey === `rejected:${liveAction.id}` ? "Saving..." : "Pass"}
                        </button>
                      </div>
                    ) : null}

                    {lane.id === "staged" && liveEscrow ? (
                      <div className="action-controls">
                        <button
                          className="ghost-button"
                          disabled={pendingKey !== null}
                          onClick={() => onExecuteEscrow(liveEscrow)}
                          type="button"
                        >
                          {pendingKey === `execute:${liveEscrow.id}` ? "Executing..." : "Execute"}
                        </button>
                        <button
                          className="text-button"
                          disabled={pendingKey !== null}
                          onClick={() => onCancelEscrow(liveEscrow)}
                          type="button"
                        >
                          {pendingKey === `cancel:${liveEscrow.id}` ? "Updating..." : "Cancel"}
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              }) : (
                <article className="frontier-card is-empty">
                  <p className="panel-empty">No items in this lane right now.</p>
                </article>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="frontier-footer">
        <div>
          <span className="support-label">Next unlock condition</span>
          <p>{frontier?.nextUnlockCondition || "Waiting for a cleaner recoverability signal."}</p>
        </div>
        <div>
          <span className="support-label">What closes the range again</span>
          <p>{frontier?.closeCondition || "A weaker structure would close the range again."}</p>
        </div>
      </div>
    </section>
  );
}

function PortfolioXRayPanel({ xray, onSelectStory }) {
  return (
    <section className="decision-panel xray-panel">
      <div className="decision-panel-header">
        <div>
          <p className="panel-kicker">Portfolio X-Ray</p>
          <h2>{xray?.headline || "What is carrying the book"}</h2>
          <p>{xray?.subhead || "Read the book by role, concentration, fragility, and recovery."}</p>
        </div>
      </div>

      <div className="xray-summary-grid">
        <article>
          <span className="support-label">Book value</span>
          <strong>{xray?.totalValueUsd ? formatCurrency(xray.totalValueUsd) : "Connected"}</strong>
        </article>
        <article>
          <span className="support-label">Holdings</span>
          <strong>{xray?.holdingsCount || 0}</strong>
        </article>
        <article>
          <span className="support-label">Top five</span>
          <strong>{xray?.concentration?.topFive || "-"}</strong>
        </article>
        <article>
          <span className="support-label">Ballast</span>
          <strong>{xray?.concentration?.ballast || "-"}</strong>
        </article>
      </div>

      <div className="xray-role-stack">
        {safeList(xray?.roleBands).map((band) => (
          <article className="xray-role-row" key={band.id}>
            <div className="xray-role-copy">
              <strong>{band.label}</strong>
              <span>{band.description}</span>
            </div>
            <div className="xray-role-track" aria-hidden="true">
              <span style={{ width: `${Math.max(8, Math.round((Number(band.weightValue || 0)) * 100))}%` }} />
            </div>
            <div className="xray-role-metrics">
              <strong>{band.weight}</strong>
              <span>Recovery {band.recoveryLabel}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="xray-carriers">
        <div>
          <span className="support-label">Main carriers</span>
          <div className="xray-carrier-list">
            {safeList(xray?.carriers).map((carrier) => (
              <button className="xray-carrier" key={carrier.ticker} onClick={() => onSelectStory(carrier.ticker)} type="button">
                <div>
                  <strong>{carrier.ticker}</strong>
                  <span>{carrier.role}</span>
                </div>
                <em>{carrier.weight}</em>
              </button>
            ))}
          </div>
        </div>

        <div className="xray-warning-stack">
          <span className="support-label">Concentration watch</span>
          {safeList(xray?.concentrationWarnings).length ? (
            <InlineList items={safeList(xray.concentrationWarnings)} emptyLabel="" />
          ) : (
            <p className="panel-empty">No concentration warning is firing right now.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function TruthfulConfidencePanelRail({ confidence, evidenceDrawer, showEvidence, onToggleEvidence }) {
  return (
    <section className="decision-panel confidence-panel">
      <div className="decision-panel-header">
        <div>
          <p className="panel-kicker">Truthful confidence</p>
          <h2>{confidence?.confidenceBand || "Usable"}</h2>
          <p>{confidence?.note || "Confidence stays paired with disproof conditions."}</p>
        </div>
        <button className="ghost-button" onClick={onToggleEvidence} type="button">
          {showEvidence ? "Hide evidence" : "Show evidence"}
        </button>
      </div>

      <div className="confidence-grid">
        <StateChip label="Trust" value={confidence?.trustState || "-"} tone="is-neutral" />
        <StateChip label="Rights" value={confidence?.decisionRights || "-"} tone="is-neutral" />
        <StateChip label="Tier" value={confidence?.evidenceTier || "-"} tone="is-neutral" />
        <StateChip label="Analogs" value={String(confidence?.analogCount ?? 0)} tone="is-neutral" />
      </div>

      <div className="support-block">
        <span className="support-label">Disproof conditions</span>
        <InlineList items={safeList(confidence?.disproofConditions)} emptyLabel="No disproof conditions are available yet." />
      </div>

      {showEvidence ? (
        <div className="confidence-evidence">
          <div>
            <span className="support-label">Current read</span>
            <InlineList items={safeList(evidenceDrawer?.currentRead)} emptyLabel="No current read published." />
          </div>
          <div>
            <span className="support-label">Thresholds</span>
            <InlineList items={safeList(evidenceDrawer?.thresholds)} emptyLabel="No thresholds published." />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CapitalTwinRail({ twin, portfolioModule, range, onRangeChange }) {
  const chartSeries = filterPortfolioSeries(portfolioModule?.charts?.growthComparison, range);
  return (
    <section className="decision-panel twin-panel">
      <div className="decision-panel-header">
        <div>
          <p className="panel-kicker">Capital twin</p>
          <h2>{twin?.currentValueUsd ? formatCurrency(twin.currentValueUsd) : "Current live book"}</h2>
          <p>{twin?.baselineLabel || twin?.subhead || "Compared with the current connected book."}</p>
        </div>
      </div>

      <div className="support-block twin-live-note">
        <span className="support-label">What this is comparing</span>
        <p>{twin?.historyLabel || "The chart is the stored portfolio path versus the benchmark. The scenarios below are projected against the current live book, not against SPY."}</p>
      </div>

      <div className="portfolio-range-row" role="tablist" aria-label="Twin ranges">
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

      <span className="support-label twin-history-label">Stored history vs {portfolioModule?.analytics?.benchmarkSymbol || "SPY"}</span>
      <PortfolioMiniChart benchmarkSymbol={portfolioModule?.analytics?.benchmarkSymbol} series={chartSeries} />

      {safeList(twin?.scenarios).length ? (
        <div className="twin-scenario-stack">
          {safeList(twin?.scenarios).map((scenario) => (
            <article className="twin-scenario" key={scenario.id}>
              <div>
                <strong>{scenario.label}</strong>
                <p>{scenario.explanation}</p>
              </div>
              <div className="twin-scenario-side">
                <strong>{scenario.deltaLabel}</strong>
                <span>{scenario.projectedValueUsd ? formatCurrency(scenario.projectedValueUsd) : "Projected"}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="panel-empty">Twin scenarios will appear once the live state and stored portfolio history are both available.</p>
      )}

      <div className="twin-exposure-list">
        {safeList(twin?.exposures).map((item) => (
          <div className="twin-exposure" key={item.label}>
            <strong>{item.label}</strong>
            <span>{item.weight}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MandateQuickSelect({ mandate, pending, onChange }) {
  return (
    <section className="decision-panel mandate-panel">
      <div className="decision-panel-header">
        <div>
          <p className="panel-kicker">Mandate engine</p>
          <h2>{mandate?.label || "Active mandate"}</h2>
          <p>{mandate?.statement || "The current mandate shapes ranking, staging, and scenario language."}</p>
        </div>
      </div>

      <div className="mandate-option-row" role="tablist" aria-label="Mandate options">
        {safeList(mandate?.options).map((option) => (
          <button
            key={option.id}
            className={`range-chip ${mandate?.id === option.id ? "is-active" : ""}`}
            disabled={pending}
            onClick={() => onChange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="support-block">
        <span className="support-label">Guardrails</span>
        <InlineList items={safeList(mandate?.guardrails)} emptyLabel="No guardrails configured yet." />
      </div>
    </section>
  );
}

function PositionStoriesRail({ stories, selectedTicker, onSelectTicker }) {
  const items = safeList(stories?.items);
  const activeStory = items.find((item) => item.ticker === selectedTicker) || items[0] || null;

  return (
    <section className="decision-panel stories-panel">
      <div className="decision-panel-header">
        <div>
          <p className="panel-kicker">Position stories</p>
          <h2>{stories?.headline || "Position stories"}</h2>
          <p>{stories?.subhead || "Every major position should explain itself."}</p>
        </div>
      </div>

      <div className="stories-layout">
        <div className="story-tab-list" role="tablist" aria-label="Holdings stories">
          {items.map((story) => (
            <button
              className={`story-tab ${story.ticker === activeStory?.ticker ? "is-active" : ""}`}
              key={story.ticker}
              onClick={() => onSelectTicker(story.ticker)}
              type="button"
            >
              <strong>{story.ticker}</strong>
              <span>{story.role}</span>
            </button>
          ))}
        </div>

        <div className="story-detail">
          {activeStory ? (
            <>
              <div className="story-hero">
                <div>
                  <span className="support-label">{activeStory.role}</span>
                  <h3>{activeStory.ticker}</h3>
                  <p>{activeStory.roleDescription}</p>
                </div>
                <div className="story-hero-side">
                  <strong>{activeStory.weight || "-"}</strong>
                  <span>{activeStory.marketValueUsd ? formatCurrency(activeStory.marketValueUsd) : "Value syncing"}</span>
                </div>
              </div>

              <div className="story-grid">
                <div>
                  <span className="support-label">Why it exists</span>
                  <InlineList items={safeList(activeStory.whyExists)} emptyLabel="No rationale saved yet." />
                </div>
                <div>
                  <span className="support-label">What would break it</span>
                  <InlineList items={safeList(activeStory.whatBreaks)} emptyLabel="No break condition saved yet." />
                </div>
                <div>
                  <span className="support-label">What could replace it</span>
                  <InlineList items={safeList(activeStory.whatCouldReplace)} emptyLabel="No replacement candidates yet." />
                </div>
                <div>
                  <span className="support-label">What improves confidence</span>
                  <InlineList items={safeList(activeStory.improvesConfidence)} emptyLabel="No confidence triggers yet." />
                </div>
              </div>
            </>
          ) : (
            <p className="panel-empty">No holding stories are available yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function CounterfactualLedgerRail({ ledger }) {
  return (
    <section className="decision-panel ledger-panel">
      <div className="decision-panel-header">
        <div>
          <p className="panel-kicker">Counterfactual ledger</p>
          <h2>{ledger?.headline || "Counterfactual ledger"}</h2>
          <p>{ledger?.subhead || "Track what your decisions taught the system."}</p>
        </div>
      </div>

      {safeList(ledger?.items).length ? (
        <div className="ledger-stack">
          {safeList(ledger?.items).map((item) => (
            <article className="ledger-row" key={item.id}>
              <div>
                <div className="chip-row">
                  <span className={`status-pill ${responseToneClass(item.responseKey)}`}>{item.response}</span>
                  <span className="info-chip">{formatDateTime(item.occurredAt)}</span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.lesson}</p>
              </div>
              <div className="ledger-side">
                <strong>{item.excessDeltaLabel}</strong>
                <span>{item.verdict}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="panel-empty">No settled decision outcomes yet. This ledger fills in after you act, wait, or pass.</p>
      )}
    </section>
  );
}

function MemoryGuidanceRail({ guidance }) {
  return (
    <section className="decision-panel memory-guidance-panel">
      <div className="decision-panel-header">
        <div>
          <p className="panel-kicker">Memory-driven guidance</p>
          <h2>{guidance?.profileLabel || "Still learning"}</h2>
          <p>{guidance?.profileSummary || "The system is still learning your decision pattern."}</p>
        </div>
      </div>

      <div className="support-block">
        <span className="support-label">Behavior overlay</span>
        <InlineList items={safeList(guidance?.overlays)} emptyLabel="No overlays yet." />
      </div>

      {safeList(guidance?.warnings).length ? (
        <div className="support-block">
          <span className="support-label">Warnings</span>
          <InlineList items={safeList(guidance?.warnings)} emptyLabel="" />
        </div>
      ) : null}

      <div className="support-block">
        <span className="support-label">Live brief</span>
        <InlineList items={safeList(guidance?.brief)} emptyLabel="No weekly guidance note yet." />
      </div>
    </section>
  );
}

function RecoverabilityMapRail({ map, filterId, onFilterChange }) {
  const filters = safeList(map?.filters);
  const visibleItems = safeList(map?.items).filter((item) => item.filter === filterId);

  return (
    <section className="decision-panel recoverability-panel">
      <div className="decision-panel-header">
        <div>
          <p className="panel-kicker">Recoverability map</p>
          <h2>{map?.headline || "Recoverability map"}</h2>
          <p>{map?.subhead || "Read holdings and ideas by recoverability and phantom rebound risk."}</p>
        </div>
      </div>

      <div className="mandate-option-row" role="tablist" aria-label="Recoverability filters">
        {filters.map((item) => (
          <button
            className={`range-chip ${filterId === item.id ? "is-active" : ""}`}
            key={item.id}
            onClick={() => onFilterChange(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="recoverability-map-shell">
        <div className="recoverability-axis axis-x">Recoverability</div>
        <div className="recoverability-axis axis-y">Phantom rebound risk</div>
        <div className="recoverability-plane">
          {visibleItems.map((item) => (
            <div
              className={`recoverability-point is-${item.legitimacy}`}
              key={item.id}
              style={{ left: `${Math.max(6, Math.min(94, item.x * 100))}%`, top: `${Math.max(6, Math.min(94, (1 - item.y) * 100))}%` }}
              title={`${item.label} · ${item.meta}`}
            >
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FrontierLane({
  lane,
  heading,
  summary,
  items,
  actionLookup,
  escrowLookup,
  pendingKey,
  onStage,
  onDefer,
  onReject,
  onExecuteEscrow,
  onCancelEscrow,
  onOpenStory,
}) {
  const values = safeList(items);

  return (
    <section className="frontier-lane">
      <div className="frontier-lane-header">
        <div>
          <span className="support-label">{heading}</span>
          <h3>{heading}</h3>
        </div>
        <span className="info-chip">{values.length}</span>
      </div>
      <p className="frontier-lane-summary">{summary}</p>

      <div className="frontier-lane-stack">
        {values.length ? values.map((item) => {
          const action = actionLookup[item.id];
          const escrowItem = escrowLookup[item.id];
          const isUnlocked = lane === "unlocked" && action;
          const isStaged = lane === "staged" && escrowItem;
          const currentPending = isUnlocked
            ? pendingKey === `stage:${action.id}` ? "stage" : pendingKey === `deferred:${action.id}` ? "defer" : pendingKey === `rejected:${action.id}` ? "reject" : null
            : null;

          return (
            <article className={`frontier-item ${lane}`} key={item.id}>
              <div className="frontier-item-top">
                <div>
                  <span className="frontier-item-kicker">{item.ticker || item.laneLabel}</span>
                  <h4>{item.title}</h4>
                </div>
                <span className={`status-pill ${statusToneClass(item.status || lane)}`}>
                  {capitalize(item.status || item.laneLabel)}
                </span>
              </div>

              <p className="frontier-item-summary">{item.summary || item.rationale}</p>

              <div className="frontier-item-meta">
                <span>Size {item.sizeLabel}</span>
                <span>{item.funding}</span>
                <span>{item.evidenceBand}</span>
              </div>

              <div className="frontier-item-details">
                <div>
                  <span className="support-label">Why it belongs here</span>
                  <p>{item.whyItBelongsHere}</p>
                </div>
                <div>
                  <span className="support-label">What would make this wrong</span>
                  <p>{item.disproofCondition}</p>
                </div>
              </div>

              {safeList(item.effects).length ? (
                <div className="frontier-item-effects">
                  {safeList(item.effects).map((effect, index) => (
                    <span className="info-chip" key={`${item.id}-effect-${index}`}>
                      {renderInlineItem(effect)}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="frontier-item-actions">
                {item.ticker ? (
                  <button className="text-button" onClick={() => onOpenStory(item.ticker)} type="button">
                    Open story
                  </button>
                ) : <span />}

                {isUnlocked ? (
                  <div className="frontier-button-row">
                    <button className="primary-button" disabled={pendingKey !== null} onClick={() => onStage(action)} type="button">
                      {currentPending === "stage" ? "Staging..." : "Stage"}
                    </button>
                    <button className="ghost-button" disabled={pendingKey !== null} onClick={() => onDefer(action)} type="button">
                      {currentPending === "defer" ? "Saving..." : "Not now"}
                    </button>
                    <button className="text-button" disabled={pendingKey !== null} onClick={() => onReject(action)} type="button">
                      {currentPending === "reject" ? "Saving..." : "Pass"}
                    </button>
                  </div>
                ) : null}

                {isStaged ? (
                  <div className="frontier-button-row">
                    <button
                      className="ghost-button"
                      disabled={pendingKey?.endsWith(`:${escrowItem.id}`) || escrowItem.status !== "ready"}
                      onClick={() => onExecuteEscrow(escrowItem)}
                      type="button"
                    >
                      Execute
                    </button>
                    <button
                      className="text-button"
                      disabled={pendingKey?.endsWith(`:${escrowItem.id}`) || false}
                      onClick={() => onCancelEscrow(escrowItem)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          );
        }) : <p className="panel-empty">No items in this lane right now.</p>}
      </div>
    </section>
  );
}

function ActionFrontier({
  frontier,
  actionLookup,
  escrowLookup,
  pendingKey,
  onStage,
  onDefer,
  onReject,
  onExecuteEscrow,
  onCancelEscrow,
  onOpenStory,
}) {
  return (
    <section className="decision-surface frontier-surface">
      <div className="surface-heading">
        <div>
          <p className="panel-kicker">Action Frontier</p>
          <h2>{frontier?.headline || "Wait for a cleaner state"}</h2>
        </div>
        <p className="surface-summary">{frontier?.summary || "The frontier separates what is legitimate now from what only feels tempting."}</p>
      </div>

      <div className="frontier-grid">
        <FrontierLane
          actionLookup={actionLookup}
          escrowLookup={escrowLookup}
          heading={frontier?.unlocked?.lane || "Unlocked"}
          items={frontier?.unlocked?.items}
          lane="unlocked"
          onCancelEscrow={onCancelEscrow}
          onDefer={onDefer}
          onExecuteEscrow={onExecuteEscrow}
          onOpenStory={onOpenStory}
          onReject={onReject}
          onStage={onStage}
          pendingKey={pendingKey}
          summary={frontier?.unlocked?.summary}
        />
        <FrontierLane
          actionLookup={actionLookup}
          escrowLookup={escrowLookup}
          heading={frontier?.staged?.lane || "Staged"}
          items={frontier?.staged?.items}
          lane="staged"
          onCancelEscrow={onCancelEscrow}
          onDefer={onDefer}
          onExecuteEscrow={onExecuteEscrow}
          onOpenStory={onOpenStory}
          onReject={onReject}
          onStage={onStage}
          pendingKey={pendingKey}
          summary={frontier?.staged?.summary}
        />
        <FrontierLane
          actionLookup={actionLookup}
          escrowLookup={escrowLookup}
          heading={frontier?.illegitimate?.lane || "Illegitimate"}
          items={frontier?.illegitimate?.items}
          lane="illegitimate"
          onCancelEscrow={onCancelEscrow}
          onDefer={onDefer}
          onExecuteEscrow={onExecuteEscrow}
          onOpenStory={onOpenStory}
          onReject={onReject}
          onStage={onStage}
          pendingKey={pendingKey}
          summary={frontier?.illegitimate?.summary}
        />
      </div>
    </section>
  );
}

function PortfolioXRay({ xray, selectedStoryTicker, onSelectStory }) {
  return (
    <section className="decision-surface xray-surface">
      <div className="surface-heading">
        <div>
          <p className="panel-kicker">Portfolio X-Ray</p>
          <h2>{xray?.totalValueLabel || "Portfolio connected"}</h2>
        </div>
        <div className="chip-row">
          <span className="info-chip">{xray?.holdingsCount || 0} holdings</span>
          <span className="info-chip">Top five {xray?.concentration?.topFiveWeightLabel || "-"}</span>
        </div>
      </div>

      <div className="xray-warning-stack">
        {safeList(xray?.concentration?.warnings).map((warning, index) => (
          <p className="support-note" key={`xray-warning-${index}`}>{warning}</p>
        ))}
      </div>

      <div className="xray-role-list" role="list">
        {safeList(xray?.roleMap).map((holding) => (
          <button
            className={`xray-role-item ${selectedStoryTicker === holding.ticker ? "is-selected" : ""}`}
            key={holding.ticker}
            onClick={() => onSelectStory(holding.ticker)}
            type="button"
          >
            <div className="xray-role-top">
              <div>
                <strong>{holding.ticker}</strong>
                <span>{holding.roleLabel}</span>
              </div>
              <em>{holding.weightLabel}</em>
            </div>
            <div className="xray-role-meter">
              <span style={{ width: `${Math.max(10, Math.round((holding.weight || 0.05) * 100))}%` }} />
            </div>
            <div className="xray-role-bottom">
              <span>Fragility {holding.fragilityLabel}</span>
              <span>Recovery {holding.recoveryContributionLabel}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="xray-sector-balance">
        <span className="support-label">Sector balance</span>
        {safeList(xray?.sectorBalance).map((sector) => (
          <div className="portfolio-sector-row" key={sector.id}>
            <div className="portfolio-sector-copy">
              <strong>{sector.label}</strong>
              <span>{sector.weightLabel}</span>
            </div>
            <div className="portfolio-sector-track" aria-hidden="true">
              <span style={{ width: `${Math.max(10, Math.round(sector.ratio * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TruthfulConfidencePanel({ confidence }) {
  return (
    <section className="decision-surface confidence-surface">
      <div className="surface-heading compact">
        <div>
          <p className="panel-kicker">Truthful Confidence</p>
          <h2>{confidence?.bandLabel || "Thin evidence"}</h2>
        </div>
      </div>

      <div className="confidence-grid">
        <StateChip label="Tier" tone="is-neutral" value={confidence?.evidenceTier || "-"} />
        <StateChip label="Authority" tone="is-neutral" value={confidence?.authorityLabel || "-"} />
        <StateChip label="Samples" tone="is-neutral" value={String(confidence?.sampleBasis?.packageSamples ?? "-")} />
      </div>

      <div className="support-block">
        <span className="support-label">Analog read</span>
        <p>{confidence?.analogRead || "No analog read yet"}</p>
      </div>

      <div className="support-block">
        <span className="support-label">What would make this wrong</span>
        <InlineList emptyLabel="No disproof condition yet." items={safeList(confidence?.disproofs).slice(0, 3)} />
      </div>

      <div className="support-block">
        <span className="support-label">Benchmark honesty</span>
        <p>{confidence?.benchmarkNote || "Relative performance remains hidden until enough history exists."}</p>
      </div>
    </section>
  );
}

function CapitalTwinPanel({ twin, portfolioModule, range, onRangeChange }) {
  const chartSeries = filterPortfolioSeries(portfolioModule?.charts?.growthComparison, range);
  return (
    <section className="decision-surface twin-surface">
      <div className="surface-heading compact">
        <div>
          <p className="panel-kicker">Capital Twin</p>
          <h2>{twin?.currentValueLabel || "Portfolio connected"}</h2>
        </div>
        <span className="info-chip">{range}</span>
      </div>

      <p className="surface-summary">{twin?.note || "This twin shadows the live book without executing anything on its own."}</p>

      <div className="portfolio-range-row" role="tablist" aria-label="Twin ranges">
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

      <PortfolioMiniChart benchmarkSymbol={portfolioModule?.analytics?.benchmarkSymbol} series={chartSeries} />

      <div className="twin-scenario-grid">
        {safeList(twin?.scenarios).map((scenario) => (
          <article className="twin-scenario" key={scenario.id}>
            <span className="support-label">{scenario.label}</span>
            <strong>{scenario.returnRange}</strong>
            <p>{scenario.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PositionStoriesPanel({ stories, selectedStoryTicker, onSelectStory }) {
  const selectedStory = safeList(stories?.items).find((item) => item.ticker === selectedStoryTicker) || safeList(stories?.items)[0];

  return (
    <section className="decision-surface stories-surface">
      <div className="surface-heading compact">
        <div>
          <p className="panel-kicker">Position Stories</p>
          <h2>{selectedStory?.ticker || "Select a holding"}</h2>
        </div>
      </div>

      <div className="story-selector-row">
        {safeList(stories?.items).map((story) => (
          <button
            className={`story-chip ${selectedStory?.ticker === story.ticker ? "is-active" : ""}`}
            key={story.ticker}
            onClick={() => onSelectStory(story.ticker)}
            type="button"
          >
            {story.ticker}
          </button>
        ))}
      </div>

      {selectedStory ? (
        <div className="story-detail-grid">
          <div className="story-detail-panel">
            <span className="support-label">Why it exists</span>
            <p>{selectedStory.whyItExists}</p>
          </div>
          <div className="story-detail-panel">
            <span className="support-label">What would break it</span>
            <p>{selectedStory.whatWouldBreakIt}</p>
          </div>
          <div className="story-detail-panel">
            <span className="support-label">What could replace it</span>
            <p>{selectedStory.whatCouldReplaceIt}</p>
          </div>
          <div className="story-detail-panel">
            <span className="support-label">What would improve confidence</span>
            <p>{selectedStory.confidenceUpgrade}</p>
          </div>
        </div>
      ) : <p className="panel-empty">No position stories are available yet.</p>}
    </section>
  );
}

function CounterfactualLedgerPanel({ ledger }) {
  return (
    <section className="decision-surface ledger-surface">
      <div className="surface-heading compact">
        <div>
          <p className="panel-kicker">Counterfactual Ledger</p>
          <h2>{ledger?.title || "Decision outcomes"}</h2>
        </div>
      </div>
      <p className="surface-summary">{ledger?.summary || "Decision outcomes will settle against the stored portfolio history."}</p>

      <div className="ledger-list">
        {safeList(ledger?.items).length ? safeList(ledger?.items).map((item) => (
          <article className="ledger-item" key={item.id}>
            <div className="ledger-item-top">
              <div>
                <strong>{item.title}</strong>
                <p>{item.note}</p>
              </div>
              <span className={`status-pill ${responseToneClass(item.response)}`}>{item.response}</span>
            </div>
            <div className="ledger-item-metrics">
              <span>Portfolio {item.portfolioMoveLabel}</span>
              <span>Benchmark {item.benchmarkMoveLabel}</span>
              <span>Spread {item.spreadLabel}</span>
            </div>
            <p className="support-note">{item.verdict}</p>
          </article>
        )) : <p className="panel-empty">No decision outcomes are available yet.</p>}
      </div>
    </section>
  );
}

function MemoryGuidancePanel({ guidance }) {
  return (
    <section className="decision-surface guidance-surface">
      <div className="surface-heading compact">
        <div>
          <p className="panel-kicker">Memory-Driven Guidance</p>
          <h2>{guidance?.tone || "Learning"}</h2>
        </div>
      </div>
      <p className="surface-summary">{guidance?.overlay || "Behavior changes framing and staging guidance, not the underlying policy rules."}</p>
      <InlineList emptyLabel="No guidance yet." items={safeList(guidance?.habits)} />
      {safeList(guidance?.recentLearnings).length ? (
        <div className="support-block">
          <span className="support-label">Recent learnings</span>
          <InlineList emptyLabel="" items={safeList(guidance?.recentLearnings)} />
        </div>
      ) : null}
    </section>
  );
}

function RecoverabilityMapPanel({ map }) {
  const width = 420;
  const height = 240;
  const padding = 28;

  return (
    <section className="decision-surface map-surface">
      <div className="surface-heading compact">
        <div>
          <p className="panel-kicker">Recoverability Map</p>
          <h2>{map?.title || "Recoverability Map"}</h2>
        </div>
      </div>
      <p className="surface-summary">
        Holdings, watch ideas, and blocked temptations are plotted by recoverability contribution and phantom rebound risk.
      </p>

      <div className="recoverability-map-shell">
        <svg className="recoverability-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recoverability map">
          <path className="recoverability-axis" d={`M ${padding} ${height - padding} L ${width - padding} ${height - padding}`} />
          <path className="recoverability-axis" d={`M ${padding} ${height - padding} L ${padding} ${padding}`} />
          {safeList(map?.points).map((point) => {
            const x = padding + ((width - (padding * 2)) * clamp01(point.x));
            const y = height - padding - ((height - (padding * 2)) * clamp01(point.y));
            return (
              <g className={`recoverability-point ${point.legitimacy}`} key={point.id}>
                <circle cx={x} cy={y} r="6" />
                <text x={x + 10} y={y - 6}>{point.label}</text>
              </g>
            );
          })}
        </svg>
        <div className="recoverability-legend">
          {safeList(map?.legend).map((item) => (
            <span className={`info-chip ${item.tone ? `tone-${item.tone}` : ""}`} key={item.id}>{item.label}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function MandatePanel({ mandate, draft, onDraftChange, onSave, saving }) {
  return (
    <section className="decision-surface mandate-surface">
      <div className="surface-heading compact">
        <div>
          <p className="panel-kicker">Mandate Engine</p>
          <h2>{mandate?.title || "Active mandate"}</h2>
        </div>
        <span className="info-chip">{mandate?.source || "workspace"}</span>
      </div>

      <p className="surface-summary">{mandate?.summary || "One active mandate governs how the frontier is ordered and how the twin is framed."}</p>

      <div className="mandate-form-grid">
        <label className="access-field">
          <span>Mandate title</span>
          <input
            onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
            type="text"
            value={draft?.title || ""}
          />
        </label>
        <label className="access-field">
          <span>Mandate summary</span>
          <input
            onChange={(event) => onDraftChange({ ...draft, summary: event.target.value })}
            type="text"
            value={draft?.summary || ""}
          />
        </label>
        <label className="access-field">
          <span>Min recoverability</span>
          <input
            max="1"
            min="0"
            onChange={(event) => onDraftChange({
              ...draft,
              thresholds: { ...(draft?.thresholds || {}), minRecoverability: Number(event.target.value) },
            })}
            step="0.01"
            type="number"
            value={draft?.thresholds?.minRecoverability ?? 0.48}
          />
        </label>
        <label className="access-field">
          <span>Max phantom rebound</span>
          <input
            max="1"
            min="0"
            onChange={(event) => onDraftChange({
              ...draft,
              thresholds: { ...(draft?.thresholds || {}), maxPhantomRebound: Number(event.target.value) },
            })}
            step="0.01"
            type="number"
            value={draft?.thresholds?.maxPhantomRebound ?? 0.38}
          />
        </label>
      </div>

      <div className="support-block">
        <span className="support-label">Guardrails</span>
        <InlineList emptyLabel="No guardrails configured." items={safeList(mandate?.guardrails)} />
      </div>

      <div className="header-action-row">
        <button className="primary-button" disabled={saving} onClick={onSave} type="button">
          {saving ? "Saving..." : "Save mandate"}
        </button>
      </div>
    </section>
  );
}

export default function TerminalApp({ initialSession, initialDashboard }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [showEvidence, setShowEvidence] = useState(false);
  const [banner, setBanner] = useState("");
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState(null);
  const [portfolioRange, setPortfolioRange] = useState("1M");
  const [selectedStoryTicker, setSelectedStoryTicker] = useState(null);
  const [recoverabilityFilter, setRecoverabilityFilter] = useState("holdings");
  const [isPending, startTransition] = useTransition();

  const workspaceId = dashboard?.workspace_summary?.id || initialSession?.workspace?.id;
  const stateSummary = dashboard?.state_summary || {};
  const portfolioModule = dashboard?.modules?.portfolio || null;
  const primaryAction = dashboard?.primary_action || null;
  const secondaryActions = safeList(dashboard?.secondary_actions);
  const blockedAction = dashboard?.blocked_action || null;
  const evidence = dashboard?.evidence_drawer || {};
  const escrow = dashboard?.escrow || { items: [] };
  const alerts = safeList(dashboard?.decision_workspace?.alerts || dashboard?.alerts).slice(0, 2);
  const frontier = dashboard?.frontier || {};
  const xray = dashboard?.xray || {};
  const confidencePanel = dashboard?.confidence_panel || {};
  const capitalTwin = dashboard?.capital_twin || {};
  const positionStories = dashboard?.position_stories || { items: [] };
  const ledger = dashboard?.counterfactual_ledger || { items: [] };
  const memoryGuidance = dashboard?.memory_guidance || {};
  const recoverabilityMap = dashboard?.recoverability_map || { items: [] };
  const mandate = dashboard?.mandate || {};
  const actionLookup = Object.fromEntries([primaryAction, ...secondaryActions].filter(Boolean).map((action) => [action.id, action]));
  const escrowLookup = Object.fromEntries(safeList(escrow.items).map((item) => [item.id, item]));

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

  useEffect(() => {
    const firstStory = safeList(positionStories?.items)[0]?.ticker || null;
    setSelectedStoryTicker((current) => {
      if (current && safeList(positionStories?.items).some((story) => story.ticker === current)) return current;
      return firstStory;
    });
  }, [positionStories]);

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

  async function updateMandate(activeMandateId) {
    if (!workspaceId) return;
    await runWorkspaceAction(
      "mandate",
      async () => {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/mandate`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activeMandateId }),
        });
        const payload = await parseResponse(response);
        return {
          ...dashboard,
          mandate: payload?.mandate || dashboard?.mandate,
          frontier: payload?.frontier || dashboard?.frontier,
          capital_twin: payload?.capital_twin || dashboard?.capital_twin,
        };
      },
      "Mandate updated.",
    );
  }

  return (
    <main className="workspace-shell decision-os-shell">
      <div className="workspace-noise decision-os-noise" aria-hidden="true" />

      <header className="workspace-header decision-os-header">
        <div>
          <p className="workspace-kicker">Decision OS</p>
          <h1>{dashboard?.workspace_summary?.name || initialSession?.workspace?.name || "BLS Prime"}</h1>
          <p className="workspace-subtitle">A personal operating system for capital under uncertainty.</p>
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

      <section className="decision-os-intro">
        <div>
          <p className="panel-kicker">Current mandate</p>
          <h2>{stateSummary.stance || mandate?.label || "Stay patient"}</h2>
        </div>
        <p>{stateSummary.decisionSummary || mandate?.statement || "The workspace is waiting for the next legitimate move."}</p>
      </section>

      <section className="decision-os-hero">
        <PortfolioXRayPanel onSelectStory={setSelectedStoryTicker} xray={xray} />

        <ActionFrontierPanel
          actionLookup={new Map(Object.entries(actionLookup))}
          escrowLookup={new Map(Object.entries(escrowLookup))}
          frontier={frontier}
          onCancelEscrow={(value) => patchEscrow(value, { action: "cancel" }, `${value.title} cancelled.`)}
          onDefer={(action) => recordDecision(action, "deferred")}
          onExecuteEscrow={(value) => patchEscrow(value, { action: "execute" }, `${value.title} executed.`)}
          onReject={(action) => recordDecision(action, "rejected")}
          onSelectStory={setSelectedStoryTicker}
          onStage={stageAction}
          pendingKey={pendingKey}
        />

        <div className="decision-os-right-rail">
          <TruthfulConfidencePanelRail
            confidence={confidencePanel}
            evidenceDrawer={evidence}
            onToggleEvidence={() => setShowEvidence((current) => !current)}
            showEvidence={showEvidence}
          />
          <CapitalTwinRail
            onRangeChange={setPortfolioRange}
            portfolioModule={portfolioModule}
            range={portfolioRange}
            twin={capitalTwin}
          />
          <MandateQuickSelect
            mandate={mandate}
            onChange={updateMandate}
            pending={pendingKey === "mandate"}
          />
        </div>
      </section>

      <section className="decision-os-lower-grid">
        <PositionStoriesRail
          onSelectTicker={setSelectedStoryTicker}
          selectedTicker={selectedStoryTicker}
          stories={positionStories}
        />
        <CounterfactualLedgerRail ledger={ledger} />
        <MemoryGuidanceRail guidance={memoryGuidance} />
        <RecoverabilityMapRail
          filterId={recoverabilityFilter}
          map={recoverabilityMap}
          onFilterChange={setRecoverabilityFilter}
        />
      </section>

      {isPending ? <div className="workspace-footer-note">Applying update...</div> : null}
    </main>
  );
}
