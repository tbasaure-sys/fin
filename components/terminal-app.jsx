"use client";

import Link from "next/link";
import { startTransition, useEffect, useState, useTransition } from "react";

function formatPct(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "-";
  return `${(number * 100).toFixed(digits)}%`;
}

function formatSignedPct(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "-";
  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(digits)}%`;
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatUsd(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `$${number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function severityClass(severity) {
  if (severity === "high") return "is-high";
  if (severity === "medium") return "is-medium";
  return "is-low";
}

function statusClass(status) {
  if (status === "fresh" || status === "live") return "is-good";
  if (status === "preferred") return "is-good";
  if (status === "aging" || status === "briefing" || status === "cache" || status === "heartbeat") return "is-warn";
  if (status === "active") return "is-warn";
  if (status === "stale" || status === "down" || status === "reconnecting") return "is-bad";
  return "is-neutral";
}

function TermHelp({ label, tip }) {
  return (
    <span className="term-help" data-tooltip={tip} tabIndex={0}>
      {label}
    </span>
  );
}

function scoreTone(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return "neutral";
  if (numeric >= 0.72) return "good";
  if (numeric >= 0.5) return "warn";
  return "bad";
}

function resolveModuleId(moduleRefs, rawValue) {
  const value = rawValue.trim().toLowerCase();
  if (!value) return null;

  return moduleRefs.find((item) => {
    const title = item.title.toLowerCase();
    const kicker = item.kicker.toLowerCase();
    return item.id === value || title === value || title.includes(value) || kicker === value;
  })?.id || null;
}

function polarPoint(cx, cy, radius, angle) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + (radius * Math.cos(radians)),
    y: cy + (radius * Math.sin(radians)),
  };
}

function describeRiskState(metrics = []) {
  const drawdown = Number.parseFloat(metrics.find((item) => /drop/i.test(item.label))?.value || "");
  const stress = Number.parseFloat(metrics.find((item) => /stress/i.test(item.label))?.value || "");

  if (Number.isFinite(drawdown) && drawdown <= -15) return "Pressure";
  if (Number.isFinite(stress) && stress <= -3) return "Guarded";
  return "Contained";
}

function isDashboardPayload(payload) {
  return Boolean(
    payload
      && typeof payload === "object"
      && payload.workspace_summary?.id
      && Array.isArray(payload.module_refs)
      && payload.modules
  );
}

function ModuleCard({ moduleRef, status, focused, onFocus, children }) {
  return (
    <section
      id={`module-${moduleRef.id}`}
      className={`terminal-module ${focused ? "is-focused" : ""}`}
    >
      <header className="module-header">
        <div>
          <p className="module-kicker">{moduleRef.kicker}</p>
          <h2>{moduleRef.title}</h2>
        </div>
        <div className="module-header-actions">
          <span className={`status-pill ${statusClass(status?.status)}`}>
            {status?.status || "unknown"}
          </span>
          <button className="ghost-button" onClick={() => onFocus(moduleRef.id)}>
            {focused ? "Close" : "Focus"}
          </button>
        </div>
      </header>
      <div className="module-body">{children}</div>
    </section>
  );
}

function DonutGauge({ value = 0, label, valueLabel, tone = "accent" }) {
  const ratio = Math.max(0, Math.min(1, Number(value) || 0));
  const endAngle = 360 * ratio;
  const start = polarPoint(40, 40, 31, 0);
  const end = polarPoint(40, 40, 31, endAngle);
  const largeArc = ratio > 0.5 ? 1 : 0;
  const path = ratio === 0
    ? ""
    : `M ${start.x} ${start.y} A 31 31 0 ${largeArc} 1 ${end.x} ${end.y}`;

  return (
    <div className={`donut-card tone-${tone}`}>
      <svg viewBox="0 0 80 80" className="donut-gauge" aria-hidden="true">
        <circle cx="40" cy="40" r="31" className="donut-track" />
        {path ? <path d={path} className="donut-progress" /> : null}
      </svg>
      <div>
        <span>{label}</span>
        <strong>{valueLabel}</strong>
      </div>
    </div>
  );
}

function TopHoldingsStrip({ holdings = [] }) {
  return (
    <div className="holding-strip">
      {holdings.slice(0, 4).map((holding) => (
        <div className="holding-chip" key={holding.ticker}>
          <div>
            <strong>{holding.ticker}</strong>
            <span>{holding.sector}</span>
          </div>
          <b>{holding.weight}</b>
        </div>
      ))}
    </div>
  );
}

function EdgeBoard({ board, onSelect }) {
  const lanes = [
    { id: "sectors", title: "Sectors", rows: board?.sectors || [] },
    { id: "countries", title: "Countries", rows: board?.countries || [] },
    { id: "currencies", title: "Currencies", rows: board?.currencies || [] },
    { id: "stocks", title: "Stocks", rows: board?.stocks || [] },
  ];

  return (
    <section className="edge-board premium-card">
      <div className="section-topline">
        <div>
          <p className="eyebrow">Best Opportunities To Review</p>
          <strong>{board?.headline}</strong>
          {board?.explanation ? <p className="support-copy">{board.explanation}</p> : null}
        </div>
      </div>
      <div className="edge-board-grid">
        {lanes.map((lane) => (
          <div className="edge-lane" key={lane.id}>
            <div className="edge-lane-header">
              <p className="block-title">{lane.title}</p>
              <span>{lane.rows.length} live</span>
            </div>
            <div className="edge-lane-stack">
              {lane.rows.map((row, index) => (
                <button className="edge-row edge-row-button" key={row.id || `${lane.id}-${row.label}`} onClick={() => onSelect(row)}>
                  <div className="edge-row-copy">
                    <span className="edge-rank">0{index + 1}</span>
                    <div>
                      <strong>{row.label}</strong>
                      <span>{row.note}</span>
                    </div>
                  </div>
                  <div className="edge-score-block">
                    <strong>{row.scoreLabel}</strong>
                    <span>{row.ticker || row.expression || "Open"}</span>
                    <div className="edge-score-meter">
                      <div className={`edge-score-fill tone-${scoreTone(row.score)}`} style={{ width: `${Math.max((Number(row.score) || 0) * 100, 8)}%` }} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EdgeDetailOverlay({ edge, onClose, onJump }) {
  if (!edge) return null;

  const laneTitleMap = {
    sectors: "Sector edge",
    countries: "Country edge",
    currencies: "FX edge",
    stocks: "Stock edge",
  };

  return (
    <div className="focus-overlay" onClick={onClose}>
      <div className="focus-surface edge-detail-surface" onClick={(event) => event.stopPropagation()}>
        <section className="terminal-module is-focused">
          <header className="module-header">
            <div>
              <p className="module-kicker">{laneTitleMap[edge.lane] || "Edge"}</p>
              <h2>{edge.label}</h2>
            </div>
            <div className="module-header-actions">
              <span className="status-pill is-good">{edge.scoreLabel}</span>
              <button className="ghost-button" onClick={onClose}>Close</button>
            </div>
          </header>
          <div className="module-body">
            <div className="hero-strip">
              <div>
                <p className="eyebrow">Why this edge</p>
                <div className="hero-readout edge-expression">{edge.expression || edge.ticker || edge.label}</div>
                <p className="support-copy">{edge.note}</p>
              </div>
              <div className="hero-grid">
                <div><span>Lane</span><strong>{laneTitleMap[edge.lane] || "Edge"}</strong></div>
                <div><span>Edge score</span><strong>{edge.scoreLabel}</strong></div>
                <div><span>Expression</span><strong>{edge.ticker || edge.expression || edge.label}</strong></div>
                <div><span>Use case</span><strong>{edge.lane === "stocks" ? "Name selection" : edge.lane === "currencies" ? "Macro expression" : "Allocation tilt"}</strong></div>
              </div>
            </div>
            <div className="panel-block">
              <p className="block-title">Confirming signals</p>
              <ul className="signal-list">
                {(edge.support || []).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="edge-detail-actions">
              <button className="primary-button" onClick={() => onJump(edge.lane === "stocks" ? "scanner" : edge.lane === "currencies" ? "risk" : edge.lane === "countries" ? "international" : "themes")}>
                Open supporting module
              </button>
              <button className="ghost-button" onClick={() => onJump("actions")}>
                Compare with next moves
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SparklineComparison({ series = [] }) {
  if (!series.length) {
    return <p className="chart-empty">Portfolio vs benchmark will appear after live history is promoted.</p>;
  }

  const values = series.flatMap((point) => [Number(point.portfolio), Number(point.benchmark)]).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const paddedMin = min - (range * 0.1);
  const paddedMax = max + (range * 0.1);
  const paddedRange = paddedMax - paddedMin || 1;

  function yFor(value) {
    return 92 - (((Number(value) - paddedMin) / paddedRange) * 78);
  }

  function linePath(key) {
    return series
      .map((point, index) => {
        const x = 8 + ((index / Math.max(series.length - 1, 1)) * 84);
        return `${index === 0 ? "M" : "L"} ${x} ${yFor(point[key])}`;
      })
      .join(" ");
  }

  function areaPath(key) {
    return `${linePath(key)} L 92 92 L 8 92 Z`;
  }

  return (
    <div className="chart-shell">
      <div className="chart-header">
        <strong>Portfolio vs SPY</strong>
        <span>Last {series.length} sessions</span>
      </div>
      <svg className="line-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="portfolioArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(250, 200, 111, 0.38)" />
            <stop offset="100%" stopColor="rgba(250, 200, 111, 0)" />
          </linearGradient>
        </defs>
        <path className="line-grid" d="M 8 20 L 92 20 M 8 46 L 92 46 M 8 72 L 92 72 M 8 92 L 92 92" />
        <path className="line-axis" d="M 8 8 L 8 92 L 92 92" />
        <path className="line-area" d={areaPath("portfolio")} />
        <path className="line-benchmark" d={linePath("benchmark")} />
        <path className="line-portfolio" d={linePath("portfolio")} />
      </svg>
      <div className="chart-scale">
        <span>{formatNumber(paddedMax, 2)}</span>
        <span>{formatNumber((paddedMax + paddedMin) / 2, 2)}</span>
        <span>{formatNumber(paddedMin, 2)}</span>
      </div>
      <div className="chart-legend">
        <span><i className="swatch portfolio" />Portfolio</span>
        <span><i className="swatch benchmark" />SPY</span>
      </div>
    </div>
  );
}

function DistributionBars({ title, subtitle, rows = [], tone = "accent" }) {
  if (!rows.length) {
    return <p className="chart-empty">{subtitle}</p>;
  }

  const max = Math.max(...rows.map((row) => Number(row.ratio) || 0), 1);

  return (
    <div className="chart-shell">
      <div className="chart-header">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="bar-list">
        {rows.map((row) => {
          const width = ((Number(row.ratio) || 0) / max) * 100;
          return (
            <div className="bar-list-row" key={row.id || row.label}>
              <div className="bar-list-copy">
                <strong>{row.label}</strong>
                <span>{row.valueLabel || row.count}</span>
              </div>
              <div className="bar-list-track">
                <div className={`bar-list-fill tone-${tone}`} style={{ width: `${Math.max(width, 8)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IdeaScatter({ points = [] }) {
  if (!points.length) {
    return <p className="chart-empty">Value-vs-momentum map will appear when live idea rows are populated.</p>;
  }

  const xs = points.map((point) => Number(point.x)).filter(Number.isFinite);
  const ys = points.map((point) => Number(point.y)).filter(Number.isFinite);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  return (
    <div className="chart-shell">
      <div className="chart-header">
        <strong>Idea map</strong>
        <span>Value gap vs momentum</span>
      </div>
      <svg className="scatter-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="0" width="50" height="50" className="quadrant preferred" />
        <rect x="50" y="0" width="50" height="50" className="quadrant chase" />
        <rect x="0" y="50" width="50" height="50" className="quadrant cold" />
        <rect x="50" y="50" width="50" height="50" className="quadrant avoid" />
        <path className="line-grid" d="M 50 0 L 50 100 M 0 50 L 100 50" />
        {points.map((point) => {
          const cx = 8 + (((Number(point.x) - minX) / rangeX) * 84);
          const cy = 92 - (((Number(point.y) - minY) / rangeY) * 84);
          const radius = 4 + ((Number(point.size) || 0) * 6);
          return (
            <g key={point.ticker}>
              <circle cx={cx} cy={cy} r={radius} className="scatter-dot" />
              <text x={cx} y={Math.max(cy - radius - 2, 6)} className="scatter-label">{point.ticker}</text>
            </g>
          );
        })}
      </svg>
      <div className="chart-legend compact">
        <span>Top left = cheap + strong</span>
        <span>Bottom right = expensive + weak</span>
      </div>
    </div>
  );
}

function ConfirmationMatrix({ rows = [] }) {
  if (!rows.length) {
    return <p className="chart-empty">Fundamental confirmation bars will appear with richer screener signals.</p>;
  }

  return (
    <div className="confirmation-stack">
      {rows.map((row) => (
        <div className="confirmation-card" key={row.ticker}>
          <div className="confirmation-topline">
            <strong>{row.ticker}</strong>
          </div>
          <div className="confirmation-grid">
            {row.signals.map((signal) => (
              <div className="confirmation-row" key={`${row.ticker}-${signal.id}`}>
                <span>{signal.label}</span>
                <div className="metric-bar-track">
                  <div className="metric-bar-fill is-good" style={{ width: `${signal.value * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SignalBars({ bars = [] }) {
  if (!bars.length) {
    return <p className="chart-empty">Live risk bars will appear when structural inputs are populated.</p>;
  }

  return (
    <div className="chart-shell">
      <div className="chart-header">
        <strong>Live risk stack</strong>
        <span>Main conditions now</span>
      </div>
      <div className="risk-bars">
        {bars.map((bar) => (
          <div className="risk-bar-row" key={bar.id}>
            <div className="risk-bar-copy">
              <strong>{bar.label}</strong>
              <span>{bar.valueLabel}</span>
            </div>
            <div className="risk-bar-track">
              <div className={`risk-bar-fill tone-${bar.tone}`} style={{ width: `${Math.max((Number(bar.ratio) || 0) * 100, 10)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClusterBalance({ cluster }) {
  if (!cluster) return null;

  return (
    <div className="cluster-balance">
      <div className="cluster-balance-row">
        <div className="cluster-balance-copy">
          <strong>Internal weakness</strong>
          <span>{cluster.gLabel}</span>
          {cluster.gMeaning ? <p className="support-copy">{cluster.gMeaning}</p> : null}
        </div>
        <div className="risk-bar-track">
          <div className="risk-bar-fill tone-warn" style={{ width: `${Math.max(cluster.gScore * 100, 10)}%` }} />
        </div>
      </div>
      <div className="cluster-balance-row">
        <div className="cluster-balance-copy">
          <strong>Shock pressure</strong>
          <span>{cluster.rLabel}</span>
          {cluster.rMeaning ? <p className="support-copy">{cluster.rMeaning}</p> : null}
        </div>
        <div className="risk-bar-track">
          <div className="risk-bar-fill tone-bad" style={{ width: `${Math.max(cluster.rScore * 100, 10)}%` }} />
        </div>
      </div>
    </div>
  );
}

function ScoreHistoryChart({ title, subtitle, rows = [], primaryLabel = "Score", secondaryLabel = "" }) {
  if (!rows.length) {
    return <p className="chart-empty">{subtitle}</p>;
  }

  const allValues = rows.flatMap((row) => [Number(row.value), Number(row.secondary)]).filter(Number.isFinite);
  const min = Math.min(...allValues, 0);
  const max = Math.max(...allValues, 1);
  const range = max - min || 1;

  function linePath(key) {
    return rows
      .map((row, index) => {
        const value = Number(row[key]);
        const x = 8 + ((index / Math.max(rows.length - 1, 1)) * 84);
        const y = 92 - ((((value - min) / range)) * 78);
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }

  const hasSecondary = rows.some((row) => Number.isFinite(Number(row.secondary)));

  return (
    <div className="chart-shell">
      <div className="chart-header">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <svg className="line-chart compact-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path className="line-grid" d="M 8 20 L 92 20 M 8 46 L 92 46 M 8 72 L 92 72 M 8 92 L 92 92" />
        <path className="line-axis" d="M 8 8 L 8 92 L 92 92" />
        {hasSecondary ? <path className="line-secondary" d={linePath("secondary")} /> : null}
        <path className="line-portfolio" d={linePath("value")} />
      </svg>
      <div className="chart-legend compact">
        <span><i className="swatch portfolio" />{primaryLabel}</span>
        {hasSecondary ? <span><i className="swatch benchmark" />{secondaryLabel}</span> : null}
      </div>
    </div>
  );
}

function JustAdviceCard({ module }) {
  if (!module) return null;

  return (
    <section className="stress-mode-card premium-card">
      <div className="section-topline">
        <div>
          <p className="eyebrow">{module.kicker || "Advice"}</p>
          <strong>{module.title || "Just advice"}</strong>
        </div>
      </div>
      <div className="panel-block intro-block">
        <p className="block-title">What to do with this portfolio now</p>
        <p className="support-copy">{module.headline}</p>
        <p className="support-copy">{module.summary}</p>
        {module.changeTrigger ? <p className="support-copy">This changes if: {module.changeTrigger}</p> : null}
      </div>
      <div className="metric-grid">
        {(module.currentRead || []).map((item) => (
          <div className="metric-tile" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            {item.detail ? <p className="support-copy">{item.detail}</p> : null}
          </div>
        ))}
      </div>
      <div className="action-stack">
        {(module.moves || []).map((move) => (
          <article className={`action-card action-${move.tone}`} key={move.id}>
            <div className="action-topline">
              <div className="action-tags">
                <span className={`status-pill is-${move.slotTone}`}>{move.slot}</span>
                {move.sourceLabel ? <span className="action-source">{move.sourceLabel}</span> : null}
              </div>
            </div>
            <div className="action-header">
              <strong>{move.title}</strong>
              <span>{move.ticker || ""}</span>
            </div>
            <div className="action-grid">
              <div><span>Size</span><strong>{move.size || "-"}</strong></div>
              <div><span>Funding</span><strong>{move.funding || "-"}</strong></div>
            </div>
            <p className="action-conviction">{move.summary}</p>
            <ul className="signal-list">
              {move.why ? <li>{move.why}</li> : null}
              {move.watchFor ? <li>{move.watchFor}</li> : null}
              {move.fiberLine ? <li>{move.fiberLine}</li> : null}
            </ul>
            <div className="action-grid">
              {(move.effects || []).map((effect) => (
                <div key={`${move.id}-${effect.label}`}>
                  <span>{effect.label}</span>
                  <strong>{effect.value}</strong>
                </div>
              ))}
            </div>
            {move.trigger ? (
              <div className="action-invalidation">
                <span>What would make this change</span>
                <strong>{move.trigger}</strong>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <div className="panel-block">
        <p className="block-title">How to read this</p>
        <ul className="signal-list">
          {(module.thresholds || []).map((item) => (
            <li key={item.id}>
              <strong>{item.label}</strong>: {item.meaning}{item.active ? " You are here." : ""}
            </li>
          ))}
        </ul>
      </div>
      {(module.memoryNarrative || []).length ? (
        <div className="panel-block">
          <p className="block-title">Decision memory</p>
          <ul className="signal-list">
            {(module.memoryNarrative || []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {module.memory?.penaltyReason ? <p className="support-copy">Calibration note: {module.memory.penaltyReason}</p> : null}
          {module.fiberTakeaway ? <p className="support-copy">Visible fiber: {module.fiberTakeaway}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function DecisionMemoryCard({ packet }) {
  if (!packet) return null;
  const memory = packet.memory || {};
  const recentDecisions = Array.isArray(memory.recentDecisions) ? memory.recentDecisions : [];
  const accuracyLabel = memory.accuracyOverall === null || memory.accuracyOverall === undefined ? "-" : `${(Number(memory.accuracyOverall) * 100).toFixed(1)}%`;
  const calibrationLabel = memory.calibrationGap === null || memory.calibrationGap === undefined ? "-" : `${(Number(memory.calibrationGap) * 100).toFixed(1)}%`;

  return (
    <section className="cockpit-card premium-card">
      <div className="section-topline">
        <div>
          <p className="eyebrow">Decision memory</p>
          <strong>What the system is learning</strong>
        </div>
        <span className={`section-chip ${memory.available ? "is-good" : "is-warn"}`}>
          {memory.available ? "Live" : "Cold start"}
        </span>
      </div>
      <div className="cockpit-note-list">
        {(packet.memoryNarrative || []).slice(0, 3).map((line) => <p key={line}>{line}</p>)}
      </div>
      <div className="mini-framework">
        <div className="mini-framework-card">
          <span>Accuracy</span>
          <strong>{accuracyLabel}</strong>
        </div>
        <div className="mini-framework-card">
          <span>Calibration gap</span>
          <strong>{calibrationLabel}</strong>
        </div>
        <div className="mini-framework-card">
          <span>Recent errors</span>
          <strong>{memory.recentConsecutiveErrors === null || memory.recentConsecutiveErrors === undefined ? "-" : String(memory.recentConsecutiveErrors)}</strong>
        </div>
      </div>
      <div className="panel-block">
        <p className="block-title">Recent decisions</p>
        <ul className="signal-list">
          {recentDecisions.length ? recentDecisions.slice(0, 4).map((item) => (
            <li key={`${item.date}-${item.recommended}`}>
              <strong>{item.date}</strong>: {item.recommended} {item.was_correct === false ? "missed" : item.was_correct === true ? "held up" : "pending"} ex-post.
            </li>
          )) : <li>No decision history available yet.</li>}
        </ul>
      </div>
      {memory.penaltyReason ? <p className="support-copy">Calibration note: {memory.penaltyReason}</p> : null}
    </section>
  );
}

function formatDecisionEvent(event) {
  if (!event) return "No event available.";
  if (event.kind === "snapshot_refresh") {
    const action = event.recommended_action || "advice";
    const recovery = event.recovery_chance || "-";
    return `${event.occurred_at || event.as_of_date || "Refresh"}: ${action} at recovery chance ${recovery}.`;
  }
  if (event.kind === "decision_outcome") {
    const verdict = event.was_correct === false ? "missed" : event.was_correct === true ? "held up" : "pending";
    return `${event.date || "Outcome"}: ${event.recommended_action || "advice"} ${verdict} ex-post.`;
  }
  return event.headline || event.summary || "Decision event.";
}

function DecisionEventCard({ log, holdingsSource }) {
  if (!log) return null;
  const events = Array.isArray(log.events) ? log.events : [];
  const latestRefresh = log.latest_refresh || events.find((item) => item.kind === "snapshot_refresh") || null;
  const latestOutcome = log.latest_outcome || events.find((item) => item.kind === "decision_outcome") || null;
  const counts = log.counts || {};
  const holdingsSourceLabel = typeof holdingsSource === "object" ? holdingsSource?.label : holdingsSource;
  const holdingsSourceDetail = typeof holdingsSource === "object" ? holdingsSource?.detail : null;

  return (
    <section className="cockpit-card premium-card">
      <div className="section-topline">
        <div>
          <p className="eyebrow">Decision events</p>
          <strong>What changed since the last refresh</strong>
        </div>
        <span className={`section-chip ${log.available ? "is-good" : "is-warn"}`}>
          {log.available ? "Live trail" : "Cold start"}
        </span>
      </div>
      <div className="cockpit-note-list">
        {(log.narrative || []).slice(0, 2).map((line) => <p key={line}>{line}</p>)}
        {holdingsSourceLabel ? <p>Holdings source: {holdingsSourceLabel}</p> : null}
        {holdingsSourceDetail ? <p>{holdingsSourceDetail}</p> : null}
      </div>
      <div className="mini-framework">
        <div className="mini-framework-card">
          <span>Refreshes</span>
          <strong>{counts.refresh === undefined || counts.refresh === null ? "-" : String(counts.refresh)}</strong>
        </div>
        <div className="mini-framework-card">
          <span>Outcomes</span>
          <strong>{counts.outcome === undefined || counts.outcome === null ? "-" : String(counts.outcome)}</strong>
        </div>
        <div className="mini-framework-card">
          <span>Latest outcome</span>
          <strong>{latestOutcome ? (latestOutcome.was_correct === false ? "Missed" : latestOutcome.was_correct === true ? "Held up" : "Pending") : "-"}</strong>
        </div>
      </div>
      <div className="panel-block">
        <p className="block-title">Recent trail</p>
        <ul className="signal-list">
          {events.length ? events.slice(-4).reverse().map((event) => (
            <li key={event.id || `${event.kind}-${event.occurred_at || event.date || event.headline}`}>
              <strong>{event.kind === "snapshot_refresh" ? "Refresh" : "Outcome"}</strong>: {formatDecisionEvent(event)}
            </li>
          )) : <li>No decision events available yet.</li>}
        </ul>
      </div>
      {latestRefresh ? (
        <p className="support-copy">Latest refresh: {formatDecisionEvent(latestRefresh)}</p>
      ) : null}
    </section>
  );
}

function OverviewHero({ dashboard, session, onRefresh, onJump, isPending }) {
  const topEdge = dashboard.edge_board?.drilldowns?.[0];
  const topMove = dashboard.just_advice?.moves?.[0];
  const accessProvider = session?.access?.provider;

  return (
    <section className="hero-panel premium-card">
      <div className="hero-panel-main">
        <div className="hero-panel-copy">
          <p className="eyebrow">BLS Prime</p>
          <h1>BLS Prime</h1>
          <strong>Your next portfolio decision, in one view.</strong>
        </div>
        <div className="hero-badge-grid hero-summary-grid">
          <div className="hero-badge">
            <span>Stance</span>
            <strong>{dashboard.workspace_summary.primary_stance}</strong>
          </div>
          <div className="hero-badge">
            <span>Next</span>
            <strong>{topMove?.title || "Review today's plan"}</strong>
          </div>
          <div className="hero-badge">
            <span>Updated</span>
            <strong>{dashboard.workspace_summary.last_updated_label}</strong>
          </div>
        </div>
        <div className="hero-cta-row hero-action-row">
          <button className="primary-button" onClick={() => onJump("actions")}>Plan</button>
          <button className="ghost-button" onClick={() => onJump("portfolio", true)}>Portfolio</button>
          <button className="ghost-button" onClick={onRefresh} disabled={isPending}>
            {isPending ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
      <div className="hero-panel-side">
        <div className="hero-session-card">
          <span className="section-chip is-good">{accessProvider === "shared-link" ? "Private access" : "Restricted access"}</span>
          <strong>{dashboard.workspace_summary.primary_stance}</strong>
          <p>{dashboard.market_brief?.headline}</p>
        </div>
        {topEdge ? (
          <button className="hero-edge-callout hero-top-edge" onClick={() => onJump(topEdge.lane === "stocks" ? "scanner" : topEdge.lane === "currencies" ? "risk" : topEdge.lane === "countries" ? "international" : "themes", true)}>
            <span>Focus</span>
            <strong>{topEdge.label}</strong>
            <b>{topEdge.scoreLabel}</b>
          </button>
        ) : null}
      </div>
    </section>
  );
}

function GuidedBrief({ dashboard, onJump }) {
  const advice = dashboard.just_advice || {};
  const stressMode = dashboard.stress_mode || {};
  const decisionLog = dashboard.decision_event_log || {};
  const protocol = dashboard.modules?.command || {};
  const latestRefresh = decisionLog.latest_refresh || (decisionLog.events || []).find((item) => item.kind === "snapshot_refresh");
  const currentRead = (advice.currentRead || []).slice(0, 3);
  const topMoves = (advice.moves || []).slice(0, 1);
  const bestAction = stressMode.topMove?.summary || topMoves[0]?.title || "Stay on the current plan";
  const mainWatch = stressMode.mainRisk || advice.changeTrigger || stressMode.whatNeedsToImprove || "Wait for new evidence before changing the plan.";

  return (
    <section className="briefing-board premium-card" id="module-guidance">
      <div className="section-topline">
        <div>
          <p className="eyebrow">Today</p>
          <strong>What to do now</strong>
        </div>
        <div className="briefing-toolbar">
          <span className={`section-chip ${String(stressMode.contractStatus).startsWith("canonical") ? "is-good" : "is-warn"}`}>
            {stressMode.contractStatusLabel || stressMode.contractStatus || "Live"}
          </span>
          <button className="ghost-button" onClick={() => onJump("actions")}>Plan</button>
        </div>
      </div>

      <div className="briefing-summary-strip">
        <div className="briefing-stat">
          <span>Stance</span>
          <strong>{stressMode.mode || dashboard.workspace_summary.primary_stance}</strong>
        </div>
        <div className="briefing-stat">
          <span>Action</span>
          <strong>{bestAction}</strong>
        </div>
        <div className="briefing-stat">
          <span>Watch</span>
          <strong>{mainWatch}</strong>
        </div>
      </div>

      <div className="briefing-main-grid">
        <div className="panel-block intro-block briefing-lead-card">
          <p className="block-title">Now</p>
          <div className="briefing-headline">{stressMode.decisionSummary || advice.title || "Stay on the current plan"}</div>
          {stressMode.topMove?.summary ? <p className="support-copy">{stressMode.topMove.summary}</p> : null}
          {advice.changeTrigger || stressMode.changeTrigger ? (
            <p className="support-copy"><strong>Change if:</strong> {advice.changeTrigger || stressMode.changeTrigger}</p>
          ) : null}
          <div className="edge-detail-actions">
            <button className="primary-button" onClick={() => onJump("actions")}>Plan</button>
            <button className="ghost-button" onClick={() => onJump("command")}>Rules</button>
          </div>
        </div>

        <div className="panel-block">
          <p className="block-title">Why</p>
          <div className="briefing-metric-grid">
            {currentRead.map((item) => (
              <div className="metric-tile" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {topMoves.length ? (
        <div className="briefing-move-grid">
          {topMoves.map((move) => (
            <article className={`action-card action-${move.tone}`} key={move.id}>
              <div className="action-topline">
                <div className="action-tags">
                  <span className={`status-pill is-${move.slotTone}`}>{move.slot}</span>
                  {move.sourceLabel ? <span className="action-source">{move.sourceLabel}</span> : null}
                </div>
              </div>
              <div className="action-header">
                <strong>{move.title}</strong>
                <span>{move.ticker || "Move"}</span>
              </div>
              <p className="action-conviction">{move.summary}</p>
              {move.size || move.funding ? (
                <div className="action-grid">
                  <div><span>Size</span><strong>{move.size || "-"}</strong></div>
                  <div><span>Funding</span><strong>{move.funding || "-"}</strong></div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      <div className="briefing-footnote-grid">
        <div className="briefing-footnote">
          <span>Rule</span>
          <strong>{protocol.decisionRights || "Stay disciplined"}</strong>
        </div>
        {latestRefresh ? (
          <div className="briefing-footnote">
            <span>Refresh</span>
            <strong>{formatDecisionEvent(latestRefresh)}</strong>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StressModeCard({ stressMode }) {
  if (!stressMode) return null;
  const blocked = stressMode.repairState === "frontier_blocked";

  return (
    <section className="stress-mode-card premium-card">
      <div className="section-topline">
        <div>
          <p className="eyebrow">Current Decision</p>
          <strong>{stressMode.decisionSummary}</strong>
        </div>
        <span className={`section-chip ${String(stressMode.contractStatus).startsWith("canonical") ? "is-good" : "is-warn"}`}>
          {stressMode.contractStatusLabel || stressMode.contractStatus}
        </span>
      </div>
      <div className="stress-mode-grid">
        <div className="metric-tile">
          <span>Current stance</span>
          <strong>{stressMode.mode}</strong>
        </div>
        <div className="metric-tile">
          <span><TermHelp label="Recovery chance" tip="Estimated chance that the portfolio can recover from here without needing a much worse path first." /></span>
          <strong>{stressMode.recoverability}</strong>
        </div>
        <div className="metric-tile">
          <span><TermHelp label="Room to act" tip="How much flexibility the portfolio still has before risk should be cut, not added." /></span>
          <strong>{stressMode.roomToAct}</strong>
        </div>
        <div className="metric-tile">
          <span><TermHelp label="Risk of a false rebound" tip="Chance that prices improve briefly without a real improvement underneath." /></span>
          <strong>{stressMode.phantom}</strong>
        </div>
        <div className="metric-tile">
          <span><TermHelp label="Can we add risk?" tip="Whether the system currently allows new risk, not whether an idea looks attractive." /></span>
          <strong>{stressMode.canAddRisk}</strong>
        </div>
        <div className="metric-tile">
          <span><TermHelp label="Defensive moves" tip="Whether trims, hedges, or defensive changes are allowed right now." /></span>
          <strong>{stressMode.defensiveState}</strong>
        </div>
      </div>
      <div className="grid-two">
        <div className="panel-block">
          <p className="block-title">What to do now</p>
          <p className="support-copy">Best action now: {stressMode.topMove?.summary || "No repair candidate yet"}</p>
          {blocked ? <p className="support-copy">No valid action is open under the current rules.</p> : null}
          {stressMode.topMove?.reason ? <p className="support-copy">{stressMode.topMove.reason}</p> : null}
          {stressMode.topMove?.classification ? <p className="support-copy">Type: {stressMode.topMove.classification}</p> : null}
          {stressMode.topMove?.firstConstraint ? <p className="support-copy">Constraint: {stressMode.topMove.firstConstraint}</p> : null}
          {stressMode.topMove?.firstInvalidation ? <p className="support-copy">What would reopen the range: {stressMode.topMove.firstInvalidation}</p> : null}
          <p className="support-copy">Review cadence: {stressMode.cadence}</p>
        </div>
        <div className="panel-block">
          <p className="block-title">What this means</p>
          <p className="support-copy"><TermHelp label="What is driving the rebound" tip="The system's read on whether this move is being supported by broad participation, narrow leadership, policy support, or something mixed." />: {stressMode.reboundDriver}</p>
          <p className="support-copy"><TermHelp label="Main risk" tip="The most likely way the current stance or a premature action could go wrong." />: {stressMode.mainRisk}</p>
          <p className="support-copy">What needs to improve: {stressMode.whatNeedsToImprove}</p>
          <p className="support-copy">Current confirmation rule: {stressMode.confirmation}</p>
          {stressMode.changeTrigger ? <p className="support-copy">This view changes if: {stressMode.changeTrigger}</p> : null}
          <p className="support-copy">Closest comparable case: {stressMode.topAnalog}</p>
        </div>
      </div>
    </section>
  );
}

function WorkspaceNavigator({ dashboard, activeModule, onJump, onFocus }) {
  const descriptions = {
    actions: "Today's moves.",
    command: "Portfolio rules.",
    portfolio: "Holdings and exposure.",
    scanner: "New ideas.",
    risk: "Risk and pressure.",
    spectral: "Diversification.",
    themes: "Theme leadership.",
    international: "Global markets.",
    audit: "Research trail.",
  };

  return (
    <section className="rail-card premium-card">
      <div className="section-topline">
        <div>
          <p className="rail-title">Details</p>
        </div>
      </div>
      <div className="module-directory">
        {dashboard.module_refs.map((item) => {
          const isActive = activeModule === item.id;
          const status = dashboard.module_status.find((moduleStatus) => moduleStatus.id === item.id);
          const openInPlace = item.id === "actions" || item.id === "command";

          return (
            <button
              className={`module-directory-card ${isActive ? "is-active" : ""}`}
              key={item.id}
              onClick={() => (openInPlace ? onJump(item.id) : onFocus(item.id))}
            >
              <div className="module-directory-header">
                <span>{item.kicker}</span>
                <span className={`status-pill ${statusClass(status?.status)}`}>{status?.status || "ready"}</span>
              </div>
              <strong>{item.title}</strong>
              <p>{descriptions[item.id] || "Open the detailed view."}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function WatchNextCard({ dashboard, onJump, onSelectEdge }) {
  const edges = (dashboard.edge_board?.drilldowns || []).slice(0, 3);
  const ideas = (dashboard.alpha_briefing?.topIdeas || []).slice(0, 3);
  const items = edges.length
    ? edges.map((edge) => ({
        id: edge.id || edge.label,
        title: edge.label,
        detail: edge.note,
        badge: edge.scoreLabel,
        action: () => onSelectEdge(edge),
      }))
    : ideas.map((idea) => ({
        id: idea.symbol,
        title: idea.symbol,
        detail: idea.conviction || idea.lastSignal || "Watch this idea.",
        badge: idea.name || "Idea",
        action: () => onJump("scanner", true),
      }));

  return (
    <section className="watch-next-card premium-card">
      <div className="section-topline">
        <div>
          <p className="eyebrow">Watchlist</p>
          <strong>Next up</strong>
        </div>
      </div>
      <div className="watch-next-list">
        {items.length ? items.map((item) => (
          <button className="watch-next-row" key={item.id} onClick={item.action}>
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
            <span>{item.badge}</span>
          </button>
        )) : (
          <div className="panel-block">
            <p className="support-copy">No live ideas are available yet.</p>
          </div>
        )}
      </div>
      <div className="edge-detail-actions">
        <button className="ghost-button" onClick={() => onJump("scanner", true)}>Ideas</button>
      </div>
    </section>
  );
}

function DataStatusPanel({ dashboard, connectionState, onRefresh, isPending }) {
  return (
    <section className="rail-card premium-card">
      <div className="section-topline">
        <div>
          <p className="rail-title">Status</p>
        </div>
      </div>
      <div className="mini-stat-grid">
        <div className="mini-stat">
          <span>Analysis</span>
          <strong>{dashboard.data_control.analysisSource}</strong>
        </div>
        <div className="mini-stat">
          <span>Prices</span>
          <strong>{dashboard.data_control.marketData?.freshnessLabel || "Awaiting market data"}</strong>
        </div>
        <div className="mini-stat">
          <span>Refresh</span>
          <strong>{dashboard.data_control.lastRefreshLabel}</strong>
        </div>
        <div className="mini-stat">
          <span>Connection</span>
          <strong>{connectionState}</strong>
        </div>
      </div>
      <div className="rail-actions">
        <button className="primary-button" onClick={() => onRefresh()} disabled={isPending}>
          {isPending ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      <div className="edge-detail-actions">
        <Link href="/legacy" className="legacy-anchor">Older view</Link>
      </div>
    </section>
  );
}

function PortfolioPulse({ module }) {
  const analytics = module?.analytics || {};
  const holdings = module?.holdings || [];
  const holdingsSource = module?.holdingsSource || {};

  return (
    <section className="cockpit-card premium-card">
      <div className="section-topline">
        <div>
          <p className="eyebrow">Portfolio</p>
          <strong>At a glance</strong>
        </div>
        <span className={`section-chip ${holdingsSource.connected ? "is-good" : "is-warn"}`}>{analytics.holdingsCount} holdings</span>
      </div>
      <div className="cockpit-kpis">
        <DonutGauge value={Math.min(Math.abs(Number(analytics.annualReturn) || 0) / 0.2, 1)} label="Annual return" valueLabel={module.analytics?.annualReturn || analytics.annualReturn ? formatPct(analytics.annualReturn) : "-"} tone="good" />
        <DonutGauge value={Math.min((Number(analytics.annualVolatility) || 0) / 0.35, 1)} label="Volatility" valueLabel={analytics.annualVolatility ? formatPct(analytics.annualVolatility) : "-"} tone="warn" />
        <DonutGauge value={Math.min(Math.abs(Number(analytics.maxDrawdown) || 0) / 0.25, 1)} label="Max drawdown" valueLabel={analytics.maxDrawdown ? formatPct(analytics.maxDrawdown) : "-"} tone="bad" />
      </div>
      <div className="cockpit-note-list">
        {(module.notes || []).slice(0, 1).map((note) => <p key={note}>{note}</p>)}
        {holdingsSource.label ? <p>{holdingsSource.label}</p> : null}
      </div>
      <TopHoldingsStrip holdings={holdings} />
    </section>
  );
}

function RiskPulse({ module }) {
  const riskState = describeRiskState(module?.metrics || []);

  return (
    <section className="cockpit-card premium-card">
      <div className="section-topline">
        <div>
          <p className="eyebrow">Risk</p>
          <strong>Current pressure</strong>
        </div>
        <span className={`section-chip is-${riskState === "Contained" ? "good" : riskState === "Guarded" ? "warn" : "bad"}`}>{riskState}</span>
      </div>
      <div className="risk-metric-stack">
        {(module.metrics || []).slice(0, 4).map((metric) => (
          <div className="risk-metric-row" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      <div className="cockpit-note-list">
        {(module.narrative || []).slice(0, 1).map((line) => <p key={line}>{line}</p>)}
      </div>
      <div className="mini-framework">
              <div className="mini-framework-card">
                <span>Cluster</span>
                <strong>{module.clusterDecomposition?.dominantLabel || module.clusterDecomposition?.dominant || "-"}</strong>
              </div>
        <div className="mini-framework-card">
          <span>Bounce check</span>
          <strong>{module.reboundConfidence?.state || "-"}</strong>
        </div>
      </div>
      <ClusterBalance cluster={module.clusterDecomposition} />
      <SignalBars bars={(module.signalBars || []).slice(0, 4)} />
    </section>
  );
}

function ActionsModule({ module }) {
  return (
    <>
      <div className="panel-block intro-block">
        <p className="block-title">Best actions now</p>
        <p className="support-copy">{module.subtitle}</p>
        {module.blocked ? <p className="support-copy">The canonical frontier is closed. No fallback legacy action is being injected.</p> : null}
        <div className="mini-framework">
          <div className="mini-framework-card">
            <span>Cluster</span>
            <strong>{module.framework?.cluster?.dominantLabel || module.framework?.cluster?.dominant || "-"}</strong>
          </div>
          <div className="mini-framework-card">
            <span>Bounce read</span>
            <strong>
              {module.framework?.reboundConfidence?.state || "-"}
              {" / "}
              {module.framework?.reboundQuality?.state || "-"}
            </strong>
          </div>
        </div>
      </div>
      <div className="action-stack">
        {(module.actions || []).map((action) => (
          <article className={`action-card action-${action.type}`} key={action.id}>
            <div className="action-topline">
              <span className="action-rank">{action.priority}</span>
              <div className="action-tags">
                <span className={`status-pill ${action.type === "add" ? "is-good" : action.type === "trim" ? "is-medium" : "is-neutral"}`}>
                  {action.plainLabel}
                </span>
                <span className="action-source">{action.sourceLabel}</span>
              </div>
            </div>
            <div className="action-header">
              <strong>{action.ticker}</strong>
              <span>{action.company}</span>
            </div>
            <div className="action-grid">
              <div><span>Size</span><strong>{action.size}</strong></div>
              <div><span>Funding</span><strong>{action.funding}</strong></div>
              <div><span>Role</span><strong>{action.role}</strong></div>
            </div>
            <p className="action-conviction">{action.conviction}</p>
            <ul className="signal-list">
              <li>{action.whyNow}</li>
              <li>{action.watchFor}</li>
            </ul>
            <div className="action-invalidation">
              <span>What would make this change</span>
              <strong>{action.invalidation}</strong>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function ProtocolModule({ module }) {
  return (
    <>
      <div className="hero-strip">
        <div>
          <p className="eyebrow">Decision Rules</p>
          <div className="hero-readout">{module.protocolLabel}</div>
          <p className="support-copy">{module.notes?.[0]}</p>
        </div>
        <div className="hero-grid">
          <div><span>Trust state</span><strong>{module.trustState}</strong></div>
          <div><span>Decision rights</span><strong>{module.decisionRights}</strong></div>
          <div><span>Autonomy</span><strong>{module.autonomyScore}</strong></div>
          <div><span>Frontier</span><strong>{module.frontierDistance}</strong></div>
        </div>
      </div>
      <div className="grid-two">
        <div className="panel-block">
          <p className="block-title">Support dependency</p>
          <div className="metric-list">
            {(module.supportDependency || []).map((item) => (
              <div className="metric-row" key={item.id}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.value}</span>
                </div>
                <div className="metric-bar-track">
                  <div className="metric-bar-fill" style={{ width: `${item.numeric * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel-block">
          <p className="block-title">Protective value</p>
          <div className="metric-list">
            {(module.protectiveValue || []).map((item) => (
              <div className="metric-row" key={item.id}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.value}</span>
                </div>
                <div className="metric-bar-track">
                  <div className="metric-bar-fill is-good" style={{ width: `${item.numeric * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel-block">
        <p className="block-title">Step-down trials</p>
        <div className="scenario-list">
          {(module.stepDownTrials || []).map((scenario) => (
            <div className="scenario-row" key={scenario.name}>
              <div>
                <strong>{scenario.name}</strong>
                <span>{scenario.shock}</span>
              </div>
              <strong>{scenario.verdict}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="grid-two">
        <div className="panel-block">
          <p className="block-title">Disproof sleeve</p>
          <ul className="signal-list">
            {(module.disproofSleeve || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className="panel-block">
          <p className="block-title">Market read</p>
          <ul className="signal-list">
            {(module.playbook?.summary || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
    </>
  );
}

function DecisionWorkflow({ dashboard, activeModule, onJump, onFocus }) {
  const sections = [
    {
      id: "actions",
      eyebrow: "Step 01",
      title: "Best next moves",
      status: dashboard.module_status.find((item) => item.id === "actions"),
      body: <ActionsModule module={dashboard.modules.actions} />,
    },
    {
      id: "command",
      eyebrow: "Step 02",
      title: "Risk guardrails",
      status: dashboard.module_status.find((item) => item.id === "command"),
      body: <ProtocolModule module={dashboard.modules.command} />,
    },
  ];

  return (
    <section className="workflow-shell premium-card">
      <div className="section-topline">
        <div>
          <p className="eyebrow">Decision Playbook</p>
          <strong>Start with the recommended move, then confirm the portfolio is still inside the allowed risk range</strong>
          <p className="support-copy">The first panel is the plain-language action plan. The second explains the rules that can block or reopen risk.</p>
        </div>
      </div>
      <div className="workflow-nav">
        {sections.map((section, index) => (
          <button
            className={`workflow-tab ${activeModule === section.id ? "is-active" : ""}`}
            key={section.id}
            onClick={() => onJump(section.id)}
          >
            <span>{`0${index + 1}`}</span>
            <strong>{section.title}</strong>
          </button>
        ))}
      </div>
      <div className="workflow-stack">
        {sections.map((section) => (
          <section className={`workflow-stage ${activeModule === section.id ? "is-active" : ""}`} id={`module-${section.id}`} key={section.id}>
            <header className="workflow-stage-header">
              <div>
                <p className="module-kicker">{section.eyebrow}</p>
                <h2>{section.title}</h2>
              </div>
              <div className="module-header-actions">
                <span className={`status-pill ${statusClass(section.status?.status)}`}>
                  {section.status?.status || "unknown"}
                </span>
                <button className="ghost-button" onClick={() => onFocus(section.id)}>
                  Focus
                </button>
              </div>
            </header>
            <div className="module-body">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function PortfolioModule({ module, workspaceId, onUpdateHoldings }) {
  const [draftValues, setDraftValues] = useState({});
  const [editingTicker, setEditingTicker] = useState(null);
  const [editFeedback, setEditFeedback] = useState("");

  useEffect(() => {
    const initialDrafts = Object.fromEntries(
      (module.holdings || [])
        .filter((row) => row?.ticker)
        .map((row) => [row.ticker, row.marketValueUsd !== null && row.marketValueUsd !== undefined ? String(row.marketValueUsd) : ""]),
    );
    setDraftValues(initialDrafts);
    setEditingTicker(null);
    setEditFeedback("");
  }, [module.holdings]);

  async function saveHolding(row) {
    if (!onUpdateHoldings || !workspaceId) return;
    const rawValue = draftValues[row.ticker];
    const targetValue = Number(rawValue);
    if (!Number.isFinite(targetValue) || targetValue < 0) {
      setEditFeedback(`Enter a valid dollar value for ${row.ticker}.`);
      return;
    }
    setEditFeedback("Updating holding...");
    try {
      const feedback = await onUpdateHoldings({
        ticker: row.ticker,
        target_value_usd: targetValue,
      });
      setEditFeedback(feedback || `${row.ticker} updated.`);
      setEditingTicker(null);
    } catch (error) {
      setEditFeedback(error?.message || `Could not update ${row.ticker}.`);
    }
  }

  return (
    <>
      <div className="metric-band emphasis-band">
        <div><span>Annual return</span><strong>{module.analytics.annualReturn}</strong></div>
        <div><span>Typical swings</span><strong>{module.analytics.annualVolatility}</strong></div>
        <div><span>Reward vs risk</span><strong>{module.analytics.sharpeRatio}</strong></div>
        <div><span>Holdings</span><strong>{module.analytics.holdingsCount}</strong></div>
      </div>
      <div className="data-table compact-table">
        <div className="data-row data-head">
          <span>Ticker</span><span>Sector</span><span>Weight</span><span>Value</span><span>Action</span>
        </div>
        {(module.holdings || []).map((row) => (
          <div className="portfolio-holding-group" key={row.ticker}>
            <div className="data-row">
              <span>{row.ticker}</span>
              <span>{row.sector}</span>
              <span>{row.weight}</span>
              <span>{formatUsd(row.marketValueUsd, 0)}</span>
              <span>
                <button className="ghost-button mini-button" onClick={() => setEditingTicker(editingTicker === row.ticker ? null : row.ticker)}>
                  {editingTicker === row.ticker ? "Close" : "Edit"}
                </button>
              </span>
            </div>
            {editingTicker === row.ticker ? (
              <div className="portfolio-inline-editor">
                <div className="portfolio-inline-summary">
                  <div>
                    <span>Current shares</span>
                    <strong>{formatNumber(row.quantity, 2)}</strong>
                  </div>
                  <div>
                    <span>Current value</span>
                    <strong>{formatUsd(row.marketValueUsd, 0)}</strong>
                  </div>
                  <div>
                    <span>Current price</span>
                    <strong>{formatUsd(row.currentPriceUsd, 2)}</strong>
                  </div>
                </div>
                <label className="portfolio-edit-field">
                  <span>Target value</span>
                  <input
                    className="holding-edit-input"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={draftValues[row.ticker] ?? ""}
                    onChange={(event) => setDraftValues((current) => ({ ...current, [row.ticker]: event.target.value }))}
                    placeholder="Enter target USD value"
                  />
                </label>
                <div className="portfolio-edit-actions">
                  <button className="primary-button mini-button" onClick={() => saveHolding(row)}>
                    Save
                  </button>
                  <button className="ghost-button mini-button" onClick={() => setEditingTicker(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {editFeedback ? <p className="support-copy chart-source">{editFeedback}</p> : null}
      <div className="panel-block">
        <p className="block-title">Portfolio read</p>
        <ul className="signal-list">
          {(module.notes || []).map((note) => <li key={note}>{note}</li>)}
        </ul>
      </div>
      <div className="grid-two">
        <div className="panel-block">
          <p className="block-title">Hidden assets</p>
          <ul className="signal-list">
            {(module.shadowBalance?.assets || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className="panel-block">
          <p className="block-title">Hidden liabilities</p>
          <ul className="signal-list">
            {(module.shadowBalance?.liabilities || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
      <div className="grid-two">
        <div className="panel-block">
          <SparklineComparison series={module.charts?.growthComparison} />
          <p className="support-copy chart-source">{module.chartSource}</p>
        </div>
        <div className="panel-block">
          <DistributionBars
            title="Sector exposure"
            subtitle="Largest sleeves in the portfolio"
            rows={module.charts?.sectorExposure}
            tone="good"
          />
          <p className="support-copy chart-source">{module.chartSource}</p>
        </div>
      </div>
      <div className="panel-block">
        <DistributionBars
          title="Valuation spread"
          subtitle="How upside is distributed across holdings"
          rows={module.charts?.valuationDistribution}
          tone="accent"
        />
        <p className="support-copy chart-source">{module.chartSource}</p>
      </div>
    </>
  );
}

function ScannerModule({ module }) {
  return (
    <>
      <div className="panel-block intro-block">
        <p className="block-title">Idea summary</p>
        <p className="support-copy">{module.insight}</p>
        <p className="support-copy chart-source">{module.sourceLabel}</p>
      </div>
      <div className="grid-two">
        <div className="panel-block">
          <IdeaScatter points={module.ideaMap} />
        </div>
        <div className="panel-block">
          <p className="block-title">Fundamental confirmation</p>
          <ConfirmationMatrix rows={module.confirmation} />
        </div>
      </div>
      <div className="data-table">
        <div className="data-row data-head">
          <span>Ticker</span><span>Type</span><span>Score</span><span>Value gap</span><span>Momentum</span>
        </div>
        {(module.rows || []).map((row) => (
          <div className="data-row" key={row.ticker}>
            <span>{row.ticker}</span><span>{row.bucket}</span><span>{formatNumber(row.discovery, 2)}</span><span>{row.valuationGap}</span><span>{row.momentum}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function RiskModule({ module }) {
  return (
    <>
      <div className="metric-grid">
        {(module.metrics || []).map((metric) => (
          <div className="metric-tile" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      <div className="grid-two">
        <div className="panel-block">
          <p className="block-title">Volatility Cluster Decomposition</p>
          <div className="framework-state-row">
            <span className="section-chip">{module.clusterDecomposition?.dominant}</span>
            <strong>{module.clusterDecomposition?.stance}</strong>
          </div>
          <ClusterBalance cluster={module.clusterDecomposition} />
          <ul className="signal-list">
            {(module.clusterDecomposition?.drivers || []).map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
        <div className="panel-block">
          <p className="block-title">Bounce check</p>
          <div className="framework-metric-grid">
            <div><span>Confidence</span><strong>{module.reboundConfidence?.state}</strong></div>
            <div><span>Score</span><strong>{module.reboundConfidence?.scoreLabel}</strong></div>
            <div><span>Expected horizon</span><strong>{module.reboundConfidence?.horizon}</strong></div>
          </div>
          <p className="support-copy">{module.reboundConfidence?.note}</p>
          <ScoreHistoryChart
            title="Bounce history"
            subtitle="Confidence vs VIX backdrop"
            rows={(module.reboundConfidence?.history || []).map((row) => ({
              date: row.date,
              value: row.value,
              secondary: Number.isFinite(Number(row.vix)) ? Math.max(0, Math.min(1, Number(row.vix) / 50)) : null,
            }))}
            primaryLabel="Confidence"
            secondaryLabel="VIX / 50"
          />
        </div>
      </div>
      <div className="panel-block">
        <SignalBars bars={module.signalBars} />
        <p className="support-copy chart-source">{module.chartSource}</p>
      </div>
      <div className="panel-block">
        <p className="block-title">Risk read</p>
        <ul className="signal-list">
          {(module.narrative || []).length
            ? module.narrative.map((line) => <li key={line}>{line}</li>)
            : <li>Risk module is mounted and waiting for full structural narratives.</li>}
        </ul>
      </div>
    </>
  );
}

function SpectralModule({ module }) {
  return (
    <>
      <div className="metric-grid">
        <div className="metric-tile"><span>Concentration</span><strong>{module.compressionScore}</strong></div>
        <div className="metric-tile"><span>Room to diversify</span><strong>{module.freedomScore}</strong></div>
        <div className="metric-tile"><span>True variety</span><strong>{module.effectiveDimension ?? "-"}</strong></div>
        <div className="metric-tile"><span>Top factor share</span><strong>{module.eig1Share}</strong></div>
      </div>
      <div className="panel-block">
        <p className="block-title">Balance read</p>
        <ul className="signal-list">
          {(module.narrative || []).length
            ? module.narrative.map((line) => <li key={line}>{line}</li>)
            : <li>Structural diversification narrative will appear as spectral artifacts are promoted.</li>}
        </ul>
      </div>
    </>
  );
}

function ThemesModule({ module }) {
  return (
    <div className="theme-grid">
      {(module.rows || []).map((row) => (
        <div className="theme-card" key={row.label}>
          <span className={`status-pill ${statusClass(row.signal)}`}>{row.signal}</span>
          <strong>{row.label}</strong>
          <span>{formatNumber(row.score, 2)}</span>
        </div>
      ))}
    </div>
  );
}

function InternationalModule({ module }) {
  return (
    <>
      <div className="data-table">
        <div className="data-row data-head">
          <span>Market</span><span>Ticker</span><span>Score</span><span>Momentum</span>
        </div>
        {(module.rows || []).map((row) => (
          <div className="data-row" key={`${row.label}-${row.ticker}`}>
            <span>{row.label}</span><span>{row.ticker}</span><span>{formatNumber(row.score, 2)}</span><span>{row.momentum}</span>
          </div>
        ))}
      </div>
      <p className="support-copy">{module.note}</p>
    </>
  );
}

function AuditModule({ module }) {
  return (
    <div className="panel-block">
      <p className="block-title">Research log</p>
      <ul className="signal-list">
        {(module.lines || []).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </div>
  );
}

function renderModule(moduleRef, moduleData, status, focused, onFocus, workspaceId, onUpdateHoldings) {
  const bodyById = {
    actions: <ActionsModule module={moduleData} />,
    command: <ProtocolModule module={moduleData} />,
    portfolio: <PortfolioModule module={moduleData} workspaceId={workspaceId} onUpdateHoldings={onUpdateHoldings} />,
    scanner: <ScannerModule module={moduleData} />,
    risk: <RiskModule module={moduleData} />,
    spectral: <SpectralModule module={moduleData} />,
    themes: <ThemesModule module={moduleData} />,
    international: <InternationalModule module={moduleData} />,
    audit: <AuditModule module={moduleData} />,
  };

  return (
    <ModuleCard
      key={moduleRef.id}
      moduleRef={moduleRef}
      status={status}
      focused={focused}
      onFocus={onFocus}
    >
      {bodyById[moduleRef.id]}
    </ModuleCard>
  );
}

export default function TerminalApp({ initialSession, initialDashboard }) {
  const readyDashboard = isDashboardPayload(initialDashboard) ? initialDashboard : null;
  const [session] = useState(initialSession || null);
  const [dashboard, setDashboard] = useState(readyDashboard);
  const [activeModule, setActiveModule] = useState(readyDashboard?.module_refs?.[0]?.id || "actions");
  const [focusedModule, setFocusedModule] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [density, setDensity] = useState("dense");
  const [connectionState, setConnectionState] = useState("connected");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandText, setCommandText] = useState("");
  const [commandFeedback, setCommandFeedback] = useState("Type an action like `refresh`, `view portfolio`, or `add NVDA`.");
  const [isPending, startRefresh] = useTransition();

  function ingestDashboard(payload, invalidMessage = "Live data is temporarily unavailable. Please refresh.") {
    if (!isDashboardPayload(payload)) {
      setConnectionState("reconnecting");
      setCommandFeedback(invalidMessage);
      return false;
    }
    setDashboard(payload);
    return true;
  }

  if (!dashboard) {
    return (
      <main className="terminal-root">
        <div className="terminal-noise" />
        <section className="access-card premium-card">
          <p className="eyebrow">Workspace unavailable</p>
          <h1>BLS Prime</h1>
          <p className="support-copy">The live workspace could not be loaded. Refresh the page and try again.</p>
          <div className="hero-cta-row">
            <button className="primary-button" onClick={() => window.location.reload()}>
              Reload
            </button>
            <Link href="/legacy" className="ghost-button">Older view</Link>
          </div>
        </section>
      </main>
    );
  }

  async function rememberCommand(command) {
    const response = await fetch(`/api/v1/workspaces/${dashboard.workspace_summary.id}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    const payload = await response.json();
    setDashboard((current) => ({
      ...current,
      command_history: payload.history || current.command_history,
    }));
  }

  function jumpToModule(moduleId, focus = false) {
    setActiveModule(moduleId);
    setFocusedModule(focus ? moduleId : null);
    setSelectedEdge(null);
    setTimeout(() => {
      document.getElementById(`module-${moduleId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  async function loadDashboard() {
    const response = await fetch(`/api/v1/workspaces/${dashboard.workspace_summary.id}/dashboard`, { cache: "no-store" });
    const payload = await response.json();
    ingestDashboard(payload, "The latest dashboard payload was incomplete.");
    return payload;
  }

  async function applyHoldingsUpdate(instruction) {
    const body = typeof instruction === "string" ? { instruction } : instruction;
    const response = await fetch(`/api/v1/workspaces/${dashboard.workspace_summary.id}/portfolio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Could not update holdings.");
    }
    const payload = await response.json();
    ingestDashboard(payload, "The portfolio update returned incomplete live data.");
    const sourceLabel = payload?.portfolio_state?.holdings_source_label || "Holdings updated";
    const syncLabel = payload?.portfolio_state?.holdings_sync_label || "";
    return syncLabel ? `${sourceLabel} · ${syncLabel}` : sourceLabel;
  }

  function cycleModule(direction) {
    const currentIndex = dashboard.module_refs.findIndex((item) => item.id === activeModule);
    const nextIndex = (currentIndex + direction + dashboard.module_refs.length) % dashboard.module_refs.length;
    jumpToModule(dashboard.module_refs[nextIndex].id);
  }

  function applySavedView(viewId) {
    const presets = {
      "founder-tape": { moduleId: "actions", alerts: true, densityMode: "dense" },
      "barbell-book": { moduleId: "portfolio", alerts: true, densityMode: "dense" },
      "discovery-lab": { moduleId: "scanner", alerts: false, densityMode: "compact" },
      "live-command": { moduleId: "actions", alerts: true, densityMode: "dense" },
      "scanner-deep-dive": { moduleId: "scanner", alerts: false, densityMode: "compact" },
    };
    const preset = presets[viewId];
    if (!preset) return;
    setDensity(preset.densityMode);
    setAlertsOpen(preset.alerts);
    jumpToModule(preset.moduleId);
    setCommandFeedback(`Loaded ${viewId.replace(/-/g, " ")}.`);
  }

  useEffect(() => {
    if (!dashboard?.workspace_summary?.id) return undefined;
    const workspaceId = dashboard.workspace_summary.id;
    const source = new EventSource(`/api/v1/workspaces/${workspaceId}/stream`);

    source.addEventListener("connection_state_changed", (event) => {
      const payload = JSON.parse(event.data);
      setConnectionState(payload.state);
    });

    source.addEventListener("module_refresh_started", () => {
      setConnectionState("briefing");
    });

    source.addEventListener("alert_created", (event) => {
      const payload = JSON.parse(event.data);
      startTransition(() => {
        setDashboard((current) => ({
          ...current,
          alerts: [payload.alert, ...current.alerts]
            .filter((alert, index, items) => items.findIndex((item) => item.id === alert.id) === index)
            .slice(0, 20),
        }));
      });
    });

    source.addEventListener("module_refresh_completed", async () => {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/dashboard`, { cache: "no-store" });
      const payload = await response.json();
      startTransition(() => {
        ingestDashboard(payload, "The refresh completed, but the dashboard payload was incomplete.");
      });
    });

    source.onerror = () => setConnectionState("reconnecting");
    return () => source.close();
  }, [dashboard.workspace_summary.id]);

  useEffect(() => {
    if (!dashboard?.workspace_summary?.id) return undefined;
    const refreshSeconds = Number(dashboard.status?.auto_refresh_seconds || 0);
    if (!Number.isFinite(refreshSeconds) || refreshSeconds <= 0) return undefined;

    let cancelled = false;
    let inFlight = false;

    async function runAutoRefresh() {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        await fetch("/api/refresh", { method: "POST" });
        const response = await fetch(`/api/v1/workspaces/${dashboard.workspace_summary.id}/dashboard`, { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;
        startTransition(() => {
          if (ingestDashboard(payload, "Auto-refresh returned incomplete data.")) {
            setConnectionState("live");
          }
        });
      } catch (_error) {
        if (!cancelled) setConnectionState("reconnecting");
      } finally {
        inFlight = false;
      }
    }

    const intervalId = window.setInterval(() => {
      void runAutoRefresh();
    }, refreshSeconds * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [dashboard.status?.auto_refresh_seconds, dashboard.workspace_summary.id]);

  useEffect(() => {
    function onKeyDown(event) {
      const tagName = event.target?.tagName?.toLowerCase();
      const isTyping = tagName === "input" || tagName === "textarea";

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }

      if (!isTyping && event.key === "/") {
        event.preventDefault();
        setCommandOpen(true);
      }

      if (!isTyping && event.key === "[") {
        event.preventDefault();
        cycleModule(-1);
      }

      if (!isTyping && event.key === "]") {
        event.preventDefault();
        cycleModule(1);
      }

      if (!isTyping && /^[1-9]$/.test(event.key)) {
        const target = dashboard.module_refs[Number(event.key) - 1];
        if (target) {
          event.preventDefault();
          jumpToModule(target.id, event.shiftKey);
        }
      }

      if (event.key === "Escape") {
        setFocusedModule(null);
        setSelectedEdge(null);
        setCommandOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeModule, dashboard.module_refs]);

  async function refreshTerminal() {
    startRefresh(async () => {
      await fetch("/api/refresh", { method: "POST" });
      await loadDashboard();
      setConnectionState("live");
      setCommandFeedback("Workspace refreshed.");
    });
  }

  async function addWatchlistSymbol(symbolInput) {
    const symbol = symbolInput.trim().toUpperCase();
    if (!symbol) return;

    await fetch(`/api/v1/workspaces/${dashboard.workspace_summary.id}/watchlists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, name: symbol, conviction: "User added", lastSignal: "Watching" }),
    });

    await loadDashboard();
    setCommandText("");
    setCommandOpen(false);
    setCommandFeedback(`${symbol} added to the watchlist.`);
  }

  async function runCommand(rawValue = commandText) {
    const value = rawValue.trim();
    if (!value) return;

    const normalized = value.toLowerCase();
    const moduleId = resolveModuleId(dashboard.module_refs, normalized);

    if (normalized === "refresh" || normalized === "sync") {
      await rememberCommand(value);
      await refreshTerminal();
      setCommandOpen(false);
      return;
    }

    if (normalized === "dense" || normalized === "compact") {
      await rememberCommand(value);
      setDensity(normalized);
      setCommandFeedback(`Density switched to ${normalized}.`);
      setCommandText("");
      setCommandOpen(false);
      return;
    }

    if (normalized === "alerts") {
      await rememberCommand(value);
      setAlertsOpen(true);
      setCommandFeedback("Alerts drawer opened.");
      setCommandText("");
      setCommandOpen(false);
      return;
    }

    if (normalized.startsWith("focus ")) {
      const target = resolveModuleId(dashboard.module_refs, normalized.replace(/^focus\s+/, ""));
      if (target) {
        await rememberCommand(value);
        jumpToModule(target, true);
        setCommandFeedback(`Focused ${target}.`);
        setCommandText("");
        setCommandOpen(false);
        return;
      }
    }

    if (normalized.startsWith("view ") || normalized.startsWith("open ")) {
      const target = resolveModuleId(dashboard.module_refs, normalized.replace(/^(view|open)\s+/, ""));
      if (target) {
        await rememberCommand(value);
        jumpToModule(target);
        setCommandFeedback(`Jumped to ${target}.`);
        setCommandText("");
        setCommandOpen(false);
        return;
      }
    }

    if (moduleId) {
      await rememberCommand(value);
      jumpToModule(moduleId);
      setCommandFeedback(`Jumped to ${moduleId}.`);
      setCommandText("");
      setCommandOpen(false);
      return;
    }

    if (normalized.startsWith("add ")) {
      await rememberCommand(value);
      await addWatchlistSymbol(normalized.replace(/^add\s+/, ""));
      return;
    }

    if (/(?:\bbuy\b|\bbought\b|\bsell\b|\bsold\b|\btrim\b|\breduce\b|\bclose\b)/i.test(value) && /\b[A-Z]{1,6}\b/.test(value)) {
      await rememberCommand(value);
      const feedback = await applyHoldingsUpdate(value);
      setCommandFeedback(feedback || "Holdings updated.");
      setCommandText("");
      setCommandOpen(false);
      return;
    }

    if (/^[a-z.]{1,8}$/i.test(value)) {
      await rememberCommand(`add ${value.toUpperCase()}`);
      await addWatchlistSymbol(value);
      return;
    }

    if (normalized.startsWith("view:")) {
      const viewId = normalized.replace(/^view:/, "").trim();
      await rememberCommand(value);
      applySavedView(viewId);
      setCommandText("");
      setCommandOpen(false);
      return;
    }

    if (normalized.startsWith("edge ")) {
      const target = normalized.replace(/^edge\s+/, "").trim();
      const match = (dashboard.edge_board?.drilldowns || []).find((item) => {
        const haystack = [item.label, item.ticker, item.expression].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(target);
      });
      if (match) {
        await rememberCommand(value);
        setSelectedEdge(match);
        setCommandFeedback(`Opened edge drilldown for ${match.label}.`);
        setCommandText("");
        setCommandOpen(false);
        return;
      }
    }

    setCommandFeedback("Command not recognized. Try `view actions`, `view command`, `refresh`, or a ticker.");
  }

  const commandPresets = [
    { label: "Refresh", command: "refresh" },
    { label: "Recommendation", command: "view actions" },
    { label: "Portfolio", command: "view portfolio" },
    { label: "Guardrails", command: "view command" },
    { label: "Add NVDA", command: "add NVDA" },
  ];

  return (
    <main className={`terminal-root density-${density}`}>
      <div className="terminal-noise" />
      <div className="terminal-grid">
        <aside className="terminal-rail terminal-rail-left">
          <PortfolioPulse module={dashboard.modules.portfolio} />
        </aside>

        <section className="terminal-center">
          <OverviewHero
            dashboard={dashboard}
            session={session}
            onRefresh={refreshTerminal}
            onJump={jumpToModule}
            isPending={isPending}
          />

          <GuidedBrief dashboard={dashboard} onJump={jumpToModule} />

          <details className="advanced-shell premium-card">
            <summary className="advanced-summary">
              <div>
                <p className="eyebrow">More</p>
                <strong>Open the full workspace</strong>
              </div>
              <span className="section-chip is-neutral">Open</span>
            </summary>
            <div className="advanced-shell-body">
              <div className="advanced-main-grid">
                <DecisionWorkflow
                  dashboard={dashboard}
                  activeModule={activeModule}
                  onJump={jumpToModule}
                  onFocus={(moduleId) => setFocusedModule(moduleId)}
                />

                <aside className="advanced-side-stack">
                  <WorkspaceNavigator
                    dashboard={dashboard}
                    activeModule={activeModule}
                    onJump={jumpToModule}
                    onFocus={(moduleId) => setFocusedModule(moduleId)}
                  />
                </aside>
              </div>
            </div>
          </details>
        </section>

        <aside className="terminal-rail terminal-rail-right">
          <WatchNextCard
            dashboard={dashboard}
            onJump={jumpToModule}
            onSelectEdge={setSelectedEdge}
          />
          <RiskPulse module={dashboard.modules.risk} />
          <DataStatusPanel
            dashboard={dashboard}
            connectionState={connectionState}
            onRefresh={refreshTerminal}
            isPending={isPending}
          />
        </aside>
      </div>

      {focusedModule ? (
        <div className="focus-overlay" onClick={() => setFocusedModule(null)}>
          <div className="focus-surface" onClick={(event) => event.stopPropagation()}>
            {renderModule(
              dashboard.module_refs.find((item) => item.id === focusedModule),
              dashboard.modules[focusedModule],
              dashboard.module_status.find((item) => item.id === focusedModule),
              true,
              () => setFocusedModule(null),
              dashboard.workspace_summary.id,
              applyHoldingsUpdate,
            )}
          </div>
        </div>
      ) : null}

      <EdgeDetailOverlay edge={selectedEdge} onClose={() => setSelectedEdge(null)} onJump={jumpToModule} />

      {commandOpen ? (
        <div className="command-overlay" onClick={() => setCommandOpen(false)}>
          <div className="command-shell" onClick={(event) => event.stopPropagation()}>
            <div className="command-header">
              <strong>Workspace shortcuts</strong>
              <span>Open a section, record a trade, or refresh data.</span>
            </div>
            <div className="command-input-row">
              <input
                autoFocus
                value={commandText}
                onChange={(event) => setCommandText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    runCommand();
                  }
                }}
                placeholder="Try: view actions, view portfolio, refresh, or add NVDA"
              />
              <button className="primary-button" onClick={() => runCommand()}>Run</button>
            </div>
            <p className="command-feedback">{commandFeedback}</p>
            <div className="command-presets">
              {commandPresets.map((preset) => (
                <button
                  className="preset-chip"
                  key={preset.command}
                  onClick={() => {
                    setCommandText(preset.command);
                    runCommand(preset.command);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="command-shortcuts">
              {dashboard.module_refs.map((item) => (
                <button
                  className="shortcut-card"
                  key={item.id}
                  onClick={() => {
                    jumpToModule(item.id);
                    setCommandOpen(false);
                  }}
                >
                  <span>{item.kicker}</span>
                  <strong>{item.title}</strong>
                </button>
              ))}
            </div>
            <div className="command-history-list is-inline">
              {(dashboard.command_history || []).slice(0, 4).map((entry) => (
                <button
                  className="history-row"
                  key={entry.id}
                  onClick={() => {
                    setCommandText(entry.command);
                  }}
                >
                  <strong>{entry.command}</strong>
                  <span>{new Date(entry.createdAt).toLocaleTimeString()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
