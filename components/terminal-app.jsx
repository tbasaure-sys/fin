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

const RAW_APP_NAME = process.env.NEXT_PUBLIC_BLS_APP_NAME || "BLS Prime";
const DEFAULT_APP_NAME = /allocator workspace/i.test(RAW_APP_NAME) ? "BLS Prime" : RAW_APP_NAME;
const WORKSPACE_NAV = [
  {
    id: "today",
    href: "#today",
    label: "Today",
    priority: "Start",
    detail: "Brief and action",
    title: "Current brief and immediate move",
    body: "Start with the live read, the supporting notes, and the move that currently deserves attention.",
  },
  {
    id: "cashflow",
    href: "#cashflow",
    label: "Money plan",
    priority: "Fund",
    detail: "Income and investable cash",
    title: "Monthly cashflow and investable room",
    body: "Keep income, fixed costs, variable spending, and the funded contribution in one operating view.",
  },
  {
    id: "portfolio",
    href: "#portfolio",
    label: "Portfolio",
    priority: "Read",
    detail: "Path and carriers",
    title: "Performance, weight, and what is carrying the book",
    body: "Read the portfolio through performance, position weight, and the names doing the real work.",
  },
  {
    id: "diversification",
    href: "#diversification",
    label: "Overlap",
    priority: "Audit",
    detail: "Structural breadth",
    title: "Real breadth and overlap under stress",
    body: "Check whether the portfolio still has independent bets once hidden concentration is included.",
  },
  {
    id: "research",
    href: "#research",
    label: "Research",
    priority: "Explain",
    detail: "Company brief",
    title: "Company work in a concise research brief",
    body: "Open the current memo, the valuation debate, and the sources without leaving the workspace.",
  },
  {
    id: "holdings",
    href: "#holdings",
    label: "Holdings",
    priority: "Update",
    detail: "Positions and edits",
    title: "Direct position updates and stored holdings",
    body: "Review what is connected, add positions, and save sizing changes in the same operating surface.",
  },
];

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
    <div className={styles.rangeTabs} role="tablist" aria-label="Portfolio range">
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
        <strong>Portfolio path will appear here</strong>
        <p>Stored snapshots are needed before the app draws performance, benchmark spread, and trend direction.</p>
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
      <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Portfolio performance">
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
            <text className={styles.chartLatestLabel} x="10" y="0">Portfolio {portfolioChange === null ? "-" : formatSignedPct(portfolioChange, 1)}</text>
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
        <span>{portfolioChange === null ? "Portfolio building history" : `Portfolio ${formatSignedPct(portfolioChange, 1)}`}</span>
        {hasBenchmark ? <span>{benchmarkSymbol || "SPY"} {benchmarkChange === null ? "tracking" : formatSignedPct(benchmarkChange, 1)}</span> : null}
      </div>
      <div className={styles.chartLegend}>
        <span><i className={styles.legendSwatch} data-series="portfolio" />Portfolio</span>
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
        Position-level return leaders will appear once cost basis is stored for the holdings.
      </p>
    );
  }

  return (
    <div className={styles.returnBreakdown} aria-label="Holding return breakdown">
      <article className={styles.returnColumn}>
        <div className={styles.returnColumnHead}>
          <strong>Top unrealized gains</strong>
          <small>{trackedCount} tracked with cost basis</small>
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
                <small>{row.returnLabel} since cost basis</small>
              </div>
            </article>
          ))}
        </div>
      </article>

      <article className={styles.returnColumn}>
        <div className={styles.returnColumnHead}>
          <strong>Largest drags</strong>
          <small>{detractors.length ? "Where the unrealized drag still sits" : "No tracked drags right now"}</small>
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
                  <small>{row.returnLabel} since cost basis</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.emptyCopy}>No current losers with stored cost basis.</p>
        )}
      </article>
    </div>
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
          <p className={styles.kicker}>Monthly money plan</p>
          <h2>Know what is actually available to invest</h2>
          <p className={styles.supportText}>
            Income, fixed bills, variable spending, and buffer become one monthly contribution number before portfolio decisions.
          </p>
        </div>
        <ToneBadge tone={plan.tone || metricTone}>{plan.title || "Plan not set"}</ToneBadge>
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
              label="Monthly income"
              onChange={(value) => onChange("monthlyIncome", value)}
              value={draft.monthlyIncome}
            />
            <FinancePlanField
              currency={currency}
              id="fixed-expenses"
              label="Fixed expenses"
              onChange={(value) => onChange("fixedExpenses", value)}
              value={draft.fixedExpenses}
            />
            <FinancePlanField
              currency={currency}
              id="variable-expenses"
              label="Variable expenses"
              onChange={(value) => onChange("variableExpenses", value)}
              value={draft.variableExpenses}
            />
            <FinancePlanField
              currency={currency}
              id="safety-buffer"
              label="Cash buffer"
              onChange={(value) => onChange("safetyBuffer", value)}
              value={draft.safetyBuffer}
            />
            <FinancePlanField
              currency={currency}
              id="target-investment"
              label="Target contribution"
              onChange={(value) => onChange("targetMonthlyInvestment", value)}
              value={draft.targetMonthlyInvestment}
            />
            <FinancePlanField
              id="base-currency"
              inputMode="text"
              label="Currency"
              onChange={(value) => onChange("baseCurrency", value)}
              value={draft.baseCurrency}
            />
          </div>

          <div className={styles.financeFormFooter}>
            <p>{plan.body || "Save the plan to connect personal cashflow with portfolio allocation."}</p>
            <button className={styles.primaryButton} disabled={pending} type="submit">
              {pending ? "Saving..." : "Save money plan"}
            </button>
          </div>
        </form>

        <div className={styles.financeReadout}>
          <div className={styles.financeMetricGrid}>
            <MetricTile
              detail="Cash coming in before bills, spending, or buffer."
              label="Monthly income"
              value={formatMoney(plan.inputs?.monthlyIncome, currency)}
            />
            <MetricTile
              detail="Recurring bills and committed monthly costs."
              label="Fixed costs"
              value={formatMoney(plan.inputs?.fixedExpenses, currency)}
            />
            <MetricTile
              detail="Flexible spending that still needs to be funded."
              label="Variable spending"
              value={formatMoney(plan.inputs?.variableExpenses, currency)}
            />
            <MetricTile
              detail="Cash intentionally kept out of the market."
              label="Cash buffer"
              value={formatMoney(plan.inputs?.safetyBuffer, currency)}
            />
            <MetricTile
              detail="Income minus fixed costs, variable spending, and buffer."
              label="Available to invest"
              tone={metricTone}
              value={formatMoney(metrics.monthlyInvestable, currency)}
            />
            <MetricTile
              detail="Fixed and variable expenses before buffer."
              label="Monthly burn"
              value={formatMoney(metrics.monthlyOutflow, currency)}
            />
            <MetricTile
              detail="Investable cash divided by monthly income."
              label="Savings rate"
              tone={metricTone}
              value={formatOptionalRatio(metrics.savingsRate, 0)}
            />
            <MetricTile
              detail="Available contribution versus your target."
              label="Target coverage"
              tone={metricTone}
              value={metrics.targetCoverage === null ? "Set target" : formatOptionalRatio(metrics.targetCoverage, 0)}
            />
          </div>

          <div className={styles.financeAllocation}>
            <div className={styles.financeAllocationHead}>
              <div>
                <p className={styles.kicker}>Monthly allocation</p>
                <h3>{showAllocation ? "Where income goes" : "Add income to draw the plan"}</h3>
              </div>
              {Number.isFinite(Number(metrics.annualContributionRate)) ? (
                <ToneBadge tone="neutral">{formatOptionalRatio(metrics.annualContributionRate, 1)} of portfolio/year</ToneBadge>
              ) : null}
            </div>

            {showAllocation ? (
              <>
                <div className={styles.financeAllocationBar} aria-label="Monthly income allocation">
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
              <p className={styles.emptyCopy}>Once income is entered, this becomes a spend/buffer/investable bar instead of another abstract dashboard tile.</p>
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

function contributorTone(role) {
  if (role === "real diversifier") return "good";
  if (role === "phantom diversifier") return "warn";
  if (role === "crowding source") return "bad";
  return "neutral";
}

function PhantomBreadthChart({ series }) {
  const rows = safeList(series);
  const width = 760;
  const height = 260;
  const paddingX = 22;
  const paddingY = 24;

  if (rows.length < 2) {
    return <p className={styles.emptyCopy}>Run the analysis to draw the raw vs real breadth gap over time.</p>;
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
      <svg className={styles.phantomChart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Raw and real breadth over time">
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
        <span><i className={styles.legendSwatch} data-series="phantom-raw" />Raw breadth</span>
        <span><i className={styles.legendSwatch} data-series="phantom-real" />Real breadth</span>
        <span><i className={styles.legendSwatch} data-series="phantom-gap" />Phantom gap</span>
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
          <p className={styles.kicker}>Phantom diversification</p>
          <h2>Check whether your diversification is real or only looks real</h2>
          <p className={styles.supportText}>
            This module asks a simple question: if markets get harder, do your holdings still behave like different bets, or do they start moving together?
          </p>
          <p className={styles.supportText}>
            {draftDefaults.connectedCount > PHANTOM_MAX_HOLDINGS || draftDefaults.excludedCount
              ? `Loaded ${baseRows.length} analyzable holdings from ${draftDefaults.connectedCount} connected rows.`
              : `${baseRows.length} connected holdings are ready for analysis.`}
            {draftDefaults.excludedCount ? ` ${draftDefaults.excludedCount} cash-like row${draftDefaults.excludedCount === 1 ? "" : "s"} excluded automatically.` : ""}
            {draftDefaults.overflowCount ? ` ${draftDefaults.overflowCount} smaller position${draftDefaults.overflowCount === 1 ? "" : "s"} left out until you add them manually.` : ""}
          </p>
        </div>
        <div className={styles.headerMeta}>
          <ToneBadge tone={analysis ? phantomTone(analysis?.current?.classification) : "neutral"}>
            {analysis?.current?.classification_label || "Awaiting run"}
          </ToneBadge>
          <ToneBadge tone="neutral">{hasDraftRows ? `${draftRows.length} rows` : "No holdings"}</ToneBadge>
        </div>
      </div>

      <div className={styles.phantomSurface}>
        <div className={styles.phantomDraftPane}>
          <div className={styles.phantomDraftHeader}>
            <div>
              <p className={styles.kicker}>Draft mix</p>
              <h3>Editable holdings and fallback proxies</h3>
            </div>
            <ToneBadge tone={Math.abs(totalWeight - 100) <= 0.5 ? "good" : "warn"}>
              {formatWeightEditorValue(totalWeight)}% entered
            </ToneBadge>
          </div>

          <div className={styles.phantomDraftTable}>
            <div className={styles.phantomDraftTableHeader}>
              <span>Ticker</span>
              <span>Weight %</span>
              <span>Fallback proxy</span>
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
                    aria-label={`Fallback proxy ${row.id}`}
                    className={styles.phantomInput}
                    onChange={(event) => updateRow(row.id, "proxy", event.target.value)}
                    placeholder="Technology / Canada / XLK"
                    type="text"
                    value={row.proxy || ""}
                  />
                  <button
                    aria-label={`Remove ${row.ticker || "row"}`}
                    className={styles.textButton}
                    onClick={() => removeRow(row.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.phantomDraftActions}>
            <button className={styles.secondaryButton} onClick={addRow} type="button">Add holding</button>
            <button className={styles.textButton} onClick={resetRows} type="button">Reset to connected holdings</button>
          </div>

          <div className={styles.phantomActionBar}>
            <div>
              <strong>{overDraftLimit ? `Only ${PHANTOM_MAX_HOLDINGS} positive holdings can be tested per run` : draftIsReady ? "Ready to test" : "Need at least 3 positive holdings"}</strong>
              <p className={styles.supportText}>
                We normalize weights on the server. Enter percentages as you think about the book; the model rescales them to 100%.
                {" "}If a fund or local stock has no usable live history, enter a sector, a country, or a liquid ETF in the fallback proxy column.
                {overDraftLimit ? ` Remove ${positiveDraftCount - PHANTOM_MAX_HOLDINGS} holding${positiveDraftCount - PHANTOM_MAX_HOLDINGS === 1 ? "" : "s"} or reset to the connected top weights.` : ""}
              </p>
            </div>
            <button
              className={styles.primaryButton}
              disabled={!draftIsReady || analysisPending}
              onClick={runAnalysis}
              type="button"
            >
              {analysisPending ? "Analyzing..." : "Analyze diversification"}
            </button>
          </div>

          {analysisError ? <p className={styles.errorText}>{analysisError}</p> : null}
        </div>

        <div className={styles.phantomResultsPane}>
          <div className={styles.phantomResultBand}>
            <article className={styles.phantomResultMetric} data-tone="neutral">
              <span>Visible breadth</span>
              <strong>{formatBreadth(analysis?.current?.holdings_hhi_breadth)}</strong>
              <small>{analysis?.copy?.naive_breadth || "What the portfolio looks like if you only inspect position sizes."}</small>
            </article>
            <article className={styles.phantomResultMetric} data-tone="warn">
              <span>Market breadth</span>
              <strong>{formatBreadth(analysis?.current?.raw_breadth)}</strong>
              <small>{analysis?.copy?.raw_breadth || "How many separate bets the return pattern suggests in normal periods."}</small>
            </article>
            <article className={styles.phantomResultMetric} data-tone={phantomTone(analysis?.current?.classification)}>
              <span>Stress-tested breadth</span>
              <strong>{formatBreadth(analysis?.current?.real_breadth)}</strong>
              <small>{analysis?.copy?.real_breadth || `${formatPct(analysis?.current?.tested_ratio || 0, 0)} of your diversification still holds up when holdings start moving together.`}</small>
            </article>
            <article className={styles.phantomResultMetric} data-tone="bad">
              <span>Diversification at risk</span>
              <strong>{formatPct(analysis?.current?.phantom_share || 0, 0)}</strong>
              <small>{analysis?.copy?.phantom_share || `${formatBreadth(analysis?.current?.phantom_breadth)} diversification points disappear when holdings start behaving too much alike.`}</small>
            </article>
          </div>

          <div className={styles.phantomNarrative}>
            <div>
              <p className={styles.kicker}>Interpretation</p>
              <h3>{analysis?.current?.classification_label || analysis?.copy?.verdict || "Run the module to score the current mix."}</h3>
            </div>
            <div className={styles.phantomNarrativeCopy}>
              <p>{analysis?.copy?.verdict || "Run the module to score the current mix."}</p>
              <p>{analysis?.copy?.phantom || "If the score drops a lot from market breadth to stress-tested breadth, several holdings are giving you the same underlying bet."}</p>
              <p>{analysis?.copy?.improve || "Use the table below to see which holdings add something genuinely different and which mostly repeat exposure you already have."}</p>
            </div>
          </div>

          {safeList(analysis?.diagnostics?.proxied_holdings).length ? (
            <div className={styles.phantomNarrative}>
              <div>
                <p className={styles.kicker}>Proxy coverage</p>
                <h3>Some holdings were analyzed through sector or country proxies</h3>
              </div>
              <div className={styles.phantomNarrativeCopy}>
                <p>{analysis?.copy?.proxy_note || "When a fund or stock has no usable market history here, the module can still estimate diversification using a sector ETF, country ETF, or a proxy ticker you provide."}</p>
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
              <span>As of</span>
              <strong>{analysis?.as_of ? formatDate(analysis.as_of) : "Not scored yet"}</strong>
            </div>
            <div>
              <span>Window</span>
              <strong>{analysis?.diagnostics?.window_days || 63} sessions</strong>
            </div>
            <div>
              <span>Common history</span>
              <strong>{analysis?.diagnostics?.common_history_days || "-"}</strong>
            </div>
            <div>
              <span>Diversification that holds up</span>
              <strong>{formatPct(analysis?.current?.tested_ratio || 0, 0)}</strong>
            </div>
            <div>
              <span>Price source</span>
              <strong>{safeList(analysis?.diagnostics?.source_labels).join(", ") || "Unavailable"}</strong>
            </div>
          </div>

          <div className={styles.phantomChartShell}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Breadth trace</p>
                <h3>How much diversification remains when holdings move together</h3>
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
                <p className={styles.kicker}>Leave-one-out</p>
                <h3>Which holdings truly add something different</h3>
              </div>
              {activeContributor ? <ToneBadge tone={contributorTone(activeContributor.role)}>{activeContributor.role}</ToneBadge> : null}
            </div>

            {activeContributor ? (
              <div className={styles.phantomContributorFocus}>
                <strong>{activeContributor.ticker}</strong>
                <p>{activeContributor.role_summary || analysis?.copy?.leave_one_out || "Remove one holding at a time to see whether it adds real diversification or mostly overlaps with the rest of the portfolio."}</p>
                <p>Removing this name changes visible breadth by {formatBreadth(activeContributor.delta_raw_breadth)}, diversification that still holds up by {formatBreadth(activeContributor.delta_real_breadth)}, and overlap risk by {formatBreadth(activeContributor.delta_phantom_breadth)}.</p>
              </div>
            ) : null}

            {safeList(analysis?.contributors).length ? (
              <div className={styles.tableShell}>
                <div className={styles.phantomContributorHeader}>
                  <span>Ticker</span>
                  <span>Weight</span>
                  <span>Stress-tested delta</span>
                  <span>Fragile delta</span>
                  <span>Role</span>
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
                      <ToneBadge tone={contributorTone(row.role)}>{row.role}</ToneBadge>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p className={styles.emptyCopy}>Contributor diagnostics will appear after a successful analysis run.</p>
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
      title: "Reduce overlap before adding risk",
      body: "The book may look broad, but most of that breadth has not been stress-tested yet.",
    };
  }
  if (Number.isFinite(testedRatio) && testedRatio >= 0.67) {
    return {
      tone: "good",
      title: "Diversification is holding up",
      body: "The current mix still behaves like distinct bets when recent stress is included.",
    };
  }
  if (Number.isFinite(testedRatio) && testedRatio >= 0.34) {
    return {
      tone: "warn",
      title: "Some breadth is still cosmetic",
      body: "Keep the positions, but avoid treating every ticker as a new independent bet.",
    };
  }
  return {
    tone: "warn",
    title: "Run the check before sizing up",
    body: "The test uses the current holdings and a 63-day rolling covariance window.",
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
    ? `${supportedCount}/${rows.length} holdings with usable history`
    : `${rows.length} holdings ready`;

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
          <p className={styles.kicker}>Structural overlap</p>
          <h2>How much diversification actually survives stress</h2>
          <p className={styles.supportText}>
            Checks whether the current holdings still behave like separate bets once recent correlation stress is added.
          </p>
        </div>
        <button className={styles.primaryButton} disabled={analysisPending} onClick={runAnalysis} type="button">
          {analysisPending ? "Checking..." : analysis ? "Refresh" : "Check structure"}
        </button>
      </div>

      <div className={styles.phantomSimpleGrid}>
        <div className={styles.phantomSimpleMain}>
          <div className={styles.phantomSimpleVerdict}>
            <ToneBadge tone={analysis ? phantomTone(current?.classification) : "neutral"}>
              {current?.classification_label || "Ready"}
            </ToneBadge>
            <strong>{analysis ? guidance.title : coverageLabel}</strong>
            <p>{analysis ? guidance.body : "Cash-like holdings are excluded. The backend normalizes weights before calculating breadth."}</p>
          </div>

          {analysisError ? <p className={styles.errorText}>{analysisError}</p> : null}

          {analysis ? (
            <>
              <div className={styles.phantomSimpleMetrics}>
                <MetricTile
                  detail="Independent bets suggested by price history."
                  label="Visible bets"
                  value={formatBreadth(current?.raw_breadth)}
                />
                <MetricTile
                  detail="Breadth that survives the stress adjustment."
                  label="Tested bets"
                  tone={guidance.tone}
                  value={formatBreadth(current?.real_breadth)}
                />
                <MetricTile
                  detail="Visible breadth that has not been validated yet."
                  label="At risk"
                  tone={guidance.tone}
                  value={formatPct(current?.phantom_share || 0, 0)}
                />
              </div>

              <div className={styles.phantomSimpleBar} aria-label="Tested versus phantom breadth">
                <span className={styles.phantomSimpleBarTested} style={{ width: `${testedWidth}%` }} />
                {phantomWidth ? <span className={styles.phantomSimpleBarRisk} style={{ width: `${phantomWidth}%` }} /> : null}
              </div>
              <div className={styles.phantomSimpleLegend}>
                <span>Tested: {formatBreadth(current?.real_breadth)}</span>
                <span>Phantom: {formatBreadth(current?.phantom_breadth)}</span>
              </div>
            </>
          ) : (
            <div className={styles.phantomSimpleEmpty}>
              <strong>One click, three numbers.</strong>
              <p>Visible bets, tested bets, and the share of diversification still at risk.</p>
            </div>
          )}
        </div>

        <aside className={styles.phantomSimpleAside}>
          <div>
            <p className={styles.kicker}>Portfolio read</p>
            <strong>{analysis ? guidance.title : "Waiting for test"}</strong>
            <p className={styles.supportText}>
              {analysis ? `Window: ${diagnostics.window_days || 63} trading days. As of ${formatDate(analysis?.as_of)}.` : coverageLabel}
            </p>
          </div>

          {contributors.length ? (
            <div className={styles.phantomSimpleList}>
              {contributors.map((row) => (
                <article key={`simple-phantom-${row.ticker}`}>
                  <div>
                    <strong>{row.ticker}</strong>
                    <span>{row.role_summary || row.role}</span>
                  </div>
                  <ToneBadge tone={contributorTone(row.role)}>{row.role}</ToneBadge>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>Contributor notes appear after the check.</p>
          )}

          <p className={styles.phantomSimpleSource}>
            {sources.length ? `Prices: ${sources.join(", ")}.` : "Price source will be shown after the run."}
            {draftDefaults.excludedCount ? ` ${draftDefaults.excludedCount} cash-like holding${draftDefaults.excludedCount === 1 ? "" : "s"} excluded.` : ""}
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
          <p className={styles.kicker}>Alerts</p>
          <h2>What needs attention now</h2>
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
  const title = cleanWorkspaceCopy(primaryAction?.title || blockedAction?.title || stateSummary?.stance || "Hold the line");

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Action frontier</p>
          <h2>{title}</h2>
          <p className={styles.supportText}>The clearest move that still survives the current legitimacy surface.</p>
        </div>
        <ToneBadge tone={statusTone(isBlocked ? "briefing" : (primaryAction?.status || "ready"))}>
          {isBlocked ? "Wait" : "Actionable"}
        </ToneBadge>
      </div>

      <p className={styles.lead}>
        {cleanWorkspaceCopy(primaryAction?.summary || blockedAction?.summary || stateSummary?.decisionSummary || "No new legitimate move is open right now.")}
      </p>

      <div className={styles.decisionGrid}>
        <MetricTile
          detail={cleanWorkspaceCopy(primaryAction?.whyNow || stateSummary?.decisionSummary || "Wait for a cleaner setup before widening risk.")}
          label="Decision"
          value={cleanWorkspaceCopy(primaryAction?.title || "Protect capital")}
        />
        <MetricTile
          detail={cleanWorkspaceCopy(primaryAction?.watchFor || blockedAction?.watchFor || "Stronger risk confirmation and cleaner breadth confirmation.")}
          label="Review trigger"
          value={activeAction ? formatSize(activeAction) : "No size change"}
        />
        <MetricTile
          detail={cleanWorkspaceCopy(activeAction?.funding || "Preserve current sizing until the setup improves.")}
          label="Funding source"
          value={cleanWorkspaceCopy(activeAction?.funding || "No funding change")}
        />
        <MetricTile
          detail={cleanWorkspaceCopy(blockedAction?.summary || "The current structure still does not justify broader risk.")}
          label="Portfolio stance"
          value={cleanWorkspaceCopy(stateSummary?.stance || "Selective posture")}
        />
      </div>

      {primaryAction ? (
        <div className={styles.buttonRow}>
          <button className={styles.primaryButton} disabled={pendingKey !== null} onClick={() => onStage(primaryAction)} type="button">
            {pendingKey === `stage:${primaryAction.id}` ? "Staging..." : "Stage"}
          </button>
          <button className={styles.secondaryButton} disabled={pendingKey !== null} onClick={() => onDefer(primaryAction)} type="button">
            {pendingKey === `deferred:${primaryAction.id}` ? "Saving..." : "Not now"}
          </button>
          <button className={styles.textButton} disabled={pendingKey !== null} onClick={() => onReject(primaryAction)} type="button">
            {pendingKey === `rejected:${primaryAction.id}` ? "Saving..." : "Pass"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function PortfolioPanel({ portfolioModule, range, onRangeChange, xray }) {
  const portfolio = portfolioModule || {};
  const portfolioXray = xray || {};
  const analytics = portfolio.analytics || {};
  const holdings = safeList(portfolio.holdings);
  const hasHoldings = holdings.length > 0;
  const topHoldings = holdings.slice(0, 5);
  const chartSeries = hasHoldings ? filterPortfolioSeries(portfolio?.charts?.growthComparison, range) : [];
  const currentGainLabel = analytics.unrealizedReturnLabel || "Cost basis unavailable";
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
          <p className={styles.kicker}>Portfolio x-ray</p>
          <h2>{hasHoldings && analytics.totalValueUsd ? formatCurrency(analytics.totalValueUsd) : "Add holdings to start"}</h2>
          <p className={styles.supportText}>
            {hasHoldings
              ? "Start with what is carrying the book, then read performance and benchmark context."
              : "Enter positions below before the workspace shows portfolio performance or benchmark comparisons."}
          </p>
        </div>
        <div className={styles.headerMeta}>
          <ToneBadge tone={hasHoldings ? "good" : "warn"}>{hasHoldings ? `${analytics.holdingsCount || holdings.length} holdings` : "No holdings yet"}</ToneBadge>
          <ToneBadge tone="neutral">{hasHoldings ? (portfolio.chartSource || "Portfolio data loading") : "Waiting for positions"}</ToneBadge>
        </div>
      </div>

      <div className={styles.metricsGrid}>
        <MetricTile
          detail={hasHoldings ? (analytics.hasPerformanceHistory ? "Based on stored snapshots" : "Based on current value versus stored cost basis.") : "Add at least one position first."}
          label={hasHoldings && analytics.hasPerformanceHistory ? "Annualized return" : "Return since cost basis"}
          value={hasHoldings ? (analytics.hasPerformanceHistory ? analytics.annualReturnLabel : currentGainLabel) : "No holdings yet"}
        />
        <MetricTile
          detail={hasHoldings && analytics.historySessions ? `${analytics.historySessions} stored observations` : "Snapshot history starts after holdings are connected."}
          label="Since tracking started"
          value={hasHoldings ? (analytics.totalReturnLabel || "History limited") : "Waiting"}
        />
        <MetricTile
          detail={hasHoldings && analytics.hasBenchmarkHistory ? `${analytics.excessReturnLabel} vs ${analytics.benchmarkSymbol || "SPY"}` : "Benchmark comparison starts after position history exists."}
          label={`vs ${analytics.benchmarkSymbol || "SPY"}`}
          tone={hasHoldings && analytics.hasBenchmarkHistory ? "good" : "neutral"}
          value={hasHoldings && analytics.hasBenchmarkHistory ? analytics.excessReturnLabel : "Benchmark limited"}
        />
        <MetricTile
          detail={topReturnLeader ? `${topReturnLeader.returnLabel} since cost basis.` : "Save cost basis to rank which positions have created the most unrealized gain."}
          label="Top return contributor"
          tone={topReturnLeader ? "good" : "neutral"}
          value={topReturnLeader ? `${topReturnLeader.ticker} ${topReturnLeader.pnlLabel}` : "Cost basis needed"}
        />
      </div>

      <div className={styles.portfolioNarrative}>
        <div>
          <p className={styles.kicker}>Structural read</p>
          <h3>
            {cleanWorkspaceCopy(
              portfolioXray.carryingNarrative
              || (hasHoldings
                ? "The portfolio x-ray is building the real carriers of the book."
                : "Connect holdings to see what is actually carrying the book."),
            )}
          </h3>
        </div>

        <div className={styles.portfolioNarrativeStats}>
          <div>
            <span>Concentration</span>
            <strong>{concentration.verdict || "-"}</strong>
            <small>Top five: {concentration.topFive || "-"}</small>
          </div>
          <div>
            <span>Recovery share</span>
            <strong>{recoveryShare}</strong>
            <small>Book weight still adding recoverability.</small>
          </div>
          <div>
            <span>Fragile share</span>
            <strong>{fragileShare}</strong>
            <small>Weight that can reload fragility fast.</small>
          </div>
          <div>
            <span>Cash buffer</span>
            <strong>{concentration.ballast || "-"}</strong>
            <small>Protection sleeve inside the current book.</small>
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
              ? "No personal performance chart is shown until positions are connected. This prevents shared benchmark data from masquerading as your portfolio return."
              : analytics.hasPerformanceHistory
              ? `Live performance is based on ${analytics.historySessions} stored portfolio snapshots.`
              : hasCostBasisReturn
                ? `Current gain is ${currentGainLabel}. Snapshot history is still building, so benchmark performance remains limited.`
                : "Cost basis is missing. The app needs stored cost basis or more snapshot history before returns are reliable."}
          </p>
          <div className={styles.returnDistributionShell}>
            <div>
              <p className={styles.kicker}>Holding returns</p>
              <h3>Where unrealized gains and drags come from</h3>
            </div>
            <HoldingsReturnBreakdown returns={returnBreakdown} />
          </div>
        </div>

        <aside className={styles.sidePanel}>
          <div className={styles.sidePanelHeader}>
            <div>
              <p className={styles.kicker}>Role bands</p>
              <h3>Which sleeves are carrying the book</h3>
            </div>
            <ToneBadge tone="neutral">{roleBands.length || topHoldings.length} shown</ToneBadge>
          </div>

          {roleBands.length ? (
            <div className={styles.portfolioRoleBandList}>
              {roleBands.map((band) => (
                <article className={styles.portfolioRoleBand} key={`role-band-${band.id}`}>
                  <div>
                    <strong>{band.label}</strong>
                    <small>{safeList(band.names).join(", ") || band.description || "Role band"}</small>
                  </div>
                  <div>
                    <strong>{band.weight || "-"}</strong>
                    <small>Fragility {band.fragilityLabel} / Recovery {band.recoveryLabel}</small>
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
                    <span>{holding.sector || "Holding"}</span>
                  </div>
                  <div>
                    <strong>{holding.weight || "-"}</strong>
                    <span>{holding.marketValueUsd ? formatCurrency(holding.marketValueUsd) : "Value unavailable"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>No holdings loaded yet.</p>
          )}
        </aside>
      </div>

      {(carriers.length || fragilityLoad.length || recoveryDrivers.length) ? (
        <div className={styles.portfolioDriverGrid}>
          <section className={styles.portfolioDriverCard}>
            <div>
              <p className={styles.kicker}>Main carriers</p>
              <h3>What is actually driving the book</h3>
            </div>
            {carriers.length ? (
              <div className={styles.portfolioDriverList}>
                {carriers.map((item) => (
                  <article key={`carrier-${item.ticker}`}>
                    <div>
                      <strong>{item.ticker}</strong>
                      <small>{item.role || item.sector || "Carrier"}</small>
                    </div>
                    <div>
                      <strong>{item.weight || "-"}</strong>
                      <small>Recovery {item.recovery || "-"}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyCopy}>Carrier list appears after holdings are connected.</p>
            )}
          </section>

          <section className={styles.portfolioDriverCard}>
            <div>
              <p className={styles.kicker}>Fragility load</p>
              <h3>Where the portfolio can break fastest</h3>
            </div>
            {fragilityLoad.length ? (
              <div className={styles.portfolioDriverList}>
                {fragilityLoad.map((item) => (
                  <article key={`fragility-${item.ticker}`}>
                    <div>
                      <strong>{item.ticker}</strong>
                      <small>{item.role || "Holding"}</small>
                    </div>
                    <div>
                      <strong>{item.load || "-"}</strong>
                      <small>Fragility contribution</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyCopy}>Fragility contribution will appear with the x-ray.</p>
            )}
          </section>

          <section className={styles.portfolioDriverCard}>
            <div>
              <p className={styles.kicker}>Recovery drivers</p>
              <h3>What still earns its place in the book</h3>
            </div>
            {recoveryDrivers.length ? (
              <div className={styles.portfolioDriverList}>
                {recoveryDrivers.map((item) => (
                  <article key={`recovery-${item.ticker}`}>
                    <div>
                      <strong>{item.ticker}</strong>
                      <small>{item.role || "Holding"}</small>
                    </div>
                    <div>
                      <strong>{item.contribution || "-"}</strong>
                      <small>Recovery contribution</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyCopy}>Recovery contribution will appear with the x-ray.</p>
            )}
          </section>
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
          <p className={styles.kicker}>Holdings</p>
          <h2>{holdings.length ? "All connected positions" : "Your positions will appear here"}</h2>
          <p className={styles.supportText}>Scan ticker, role, weight, value, and price in one place.</p>
        </div>
        <ToneBadge tone="neutral">{holdings.length} positions</ToneBadge>
      </div>

      {holdings.length ? (
        <div className={styles.tableShell}>
          <div className={styles.tableHeader} role="row">
            <span>Ticker</span>
            <span>Role</span>
            <span>Weight</span>
            <span>Value</span>
            <span>Price</span>
          </div>
          <div className={styles.tableBody}>
            {holdings.map((holding) => (
              <article className={styles.tableRow} key={`holding-row-${holding.ticker}`} role="row">
                <div className={styles.tablePrimary}>
                  <strong>{holding.ticker}</strong>
                  <span>{holding.sector || holding.assetType || "Holding"}</span>
                </div>
                <span>{holding.thesisBucket || holding.industry || "Core exposure"}</span>
                <strong>{holding.weight || "-"}</strong>
                <strong>{holding.marketValueUsd ? formatCurrency(holding.marketValueUsd) : "-"}</strong>
                <span>{holding.currentPriceUsd ? formatCurrency(holding.currentPriceUsd) : "-"}</span>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <p className={styles.emptyCopy}>Add a trade note or sync your private holdings to start building the list.</p>
      )}

      <form
        className={styles.tradeComposer}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitHoldingDraft();
        }}
      >
        <div className={styles.tradeCopy}>
          <p className={styles.kicker}>Direct edit</p>
          <h3>Set a position directly</h3>
          <p>Enter a ticker and either target shares or target USD. Use 0 if you want to remove a holding cleanly.</p>
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
            <span>Input mode</span>
            <div className={styles.segmentedControl} role="tablist" aria-label="Holding input mode">
              <button
                className={styles.segmentButton}
                role="tab"
                aria-selected={sizingMode === "shares"}
                data-active={sizingMode === "shares"}
                onClick={() => onHoldingDraftChange("sizing", "shares")}
                type="button"
              >
                Shares
              </button>
              <button
                className={styles.segmentButton}
                role="tab"
                aria-selected={sizingMode === "value"}
                data-active={sizingMode === "value"}
                onClick={() => onHoldingDraftChange("sizing", "value")}
                type="button"
              >
                Target USD
              </button>
            </div>
          </div>
          <label className={styles.fieldStack}>
            <span>{sizingMode === "shares" ? "Target shares" : "Target value"}</span>
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
            <span>Price override</span>
            <input
              className={styles.textInput}
              inputMode="decimal"
              onChange={(event) => onHoldingDraftChange("price", event.target.value)}
              placeholder="Optional"
              type="text"
              value={priceValue}
            />
          </label>
        </div>
        <div className={styles.holdingQuickActions}>
          <button className={styles.primaryButton} disabled={pendingTrade || !draftReady} type="submit">
            {pendingTrade ? "Saving..." : "Save holding"}
          </button>
          <p className={styles.supportHint}>This path updates the final position directly instead of trying to infer a trade note.</p>
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
          <p className={styles.kicker}>Advanced update</p>
          <h3>Use plain English for buy and sell notes</h3>
          <p>Examples: <em>bought 100 USD of NVDA</em> or <em>sold 2 shares of AAPL</em>.</p>
        </div>
        <div className={styles.tradeForm}>
          <input
            className={styles.textInput}
            onChange={(event) => onTradeInstructionChange(event.target.value)}
            placeholder="bought 100 USD of NVDA"
            type="text"
            value={tradeInstruction}
          />
          <button className={styles.secondaryButton} disabled={pendingTrade || !String(tradeInstruction || "").trim()} type="submit">
            {pendingTrade ? "Updating..." : "Run text update"}
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
  return (
    <section className={styles.workspaceSidebar} aria-label="Workspace navigation">
      <div className={styles.workspaceSidebarTop}>
        <Link className={styles.workspaceBrand} href="/">
          <span className={styles.workspaceBrandMark} aria-hidden="true">B</span>
          <span>{workspaceName}</span>
        </Link>
        <p className={styles.supportText}>One decision surface. Open only the layer you need.</p>
      </div>

      <nav className={styles.workspaceSidebarNav} aria-label="Workspace sections">
        {WORKSPACE_NAV.map((item, index) => (
          <button
            className={styles.workspaceSidebarLink}
            data-active={activeSection === item.id}
            data-priority={index < 3 ? "primary" : "secondary"}
            key={item.id}
            onClick={() => onSelectSection(item.id)}
            type="button"
          >
            <span className={styles.workspaceSidebarIndex}>{String(index + 1).padStart(2, "0")}</span>
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
          <strong>{alertCount}</strong>
          <span>Alerts</span>
        </article>
        <article className={styles.workspaceSidebarStat}>
          <strong>{holdingsCount}</strong>
          <span>Holdings</span>
        </article>
        <article className={styles.workspaceSidebarStat}>
          <strong>{stagedCount}</strong>
          <span>Staged</span>
        </article>
      </div>

      <div className={styles.workspaceSidebarActions}>
        <button className={styles.chatTrigger} data-active={showChat} onClick={onOpenChat} type="button">
          Ask workspace
        </button>
        <div className={styles.workspaceSidebarUtility}>
          <button className={styles.glossaryTrigger} onClick={onOpenGlossary} type="button">
            Glossary
          </button>
          <button className={styles.welcomeTrigger} onClick={onOpenGuide} type="button">
            Guide
          </button>
        </div>
        <div className={styles.workspaceSidebarLinks}>
          <Link className={styles.secondaryLink} href="/terms">Terms</Link>
          <Link className={styles.secondaryLink} href="/">Home</Link>
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
  if (numeric === null) return "Unknown";
  if (numeric >= 0.68) return "Low";
  if (numeric >= 0.48) return "Moderate";
  return "High";
}

function structuralRiskLabel(value) {
  const numeric = clampUnitInterval(value);
  if (numeric === null) return "Unknown";
  if (numeric >= 0.67) return "High";
  if (numeric >= 0.45) return "Medium";
  return "Contained";
}

function truthTone(value) {
  const numeric = clampUnitInterval(value);
  if (numeric === null) return "neutral";
  if (numeric >= 0.67) return "good";
  if (numeric >= 0.45) return "warn";
  return "bad";
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

function RecoverabilityMapFigure({ items }) {
  const points = safeList(items).slice(0, 16);
  const width = 420;
  const height = 248;
  const paddingX = 36;
  const paddingTop = 22;
  const paddingBottom = 34;
  const plotWidth = width - (paddingX * 2);
  const plotHeight = height - paddingTop - paddingBottom;

  if (!points.length) {
    return (
      <div className={styles.truthMapEmpty}>
        <strong>Structural map pending.</strong>
        <p>Connect holdings or build a watchlist and the map will show what looks earned, fragile, or still blocked.</p>
      </div>
    );
  }

  return (
    <div className={styles.truthMapShell}>
      <div className={styles.truthMapLegend}>
        <span><i data-filter="holdings" />Holdings</span>
        <span><i data-filter="watch" />Watch ideas</span>
        <span><i data-filter="blocked" />Blocked</span>
      </div>

      <svg className={styles.truthMap} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recoverability map">
        <rect
          className={styles.truthMapFrame}
          height={plotHeight}
          rx="14"
          width={plotWidth}
          x={paddingX}
          y={paddingTop}
        />
        {[0.25, 0.5, 0.75].map((ratio) => {
          const x = paddingX + (plotWidth * ratio);
          const y = paddingTop + (plotHeight * ratio);
          return (
            <g key={`truth-map-grid-${ratio}`}>
              <path className={styles.truthMapGrid} d={`M ${x.toFixed(1)} ${paddingTop} L ${x.toFixed(1)} ${paddingTop + plotHeight}`} />
              <path className={styles.truthMapGrid} d={`M ${paddingX} ${y.toFixed(1)} L ${paddingX + plotWidth} ${y.toFixed(1)}`} />
            </g>
          );
        })}
        <text className={styles.truthMapAxisLabel} x={paddingX} y={height - 8}>Low recoverability</text>
        <text className={styles.truthMapAxisLabel} textAnchor="end" x={paddingX + plotWidth} y={height - 8}>High recoverability</text>
        <text
          className={styles.truthMapAxisLabel}
          textAnchor="middle"
          transform={`translate(14 ${(paddingTop + (plotHeight / 2)).toFixed(1)}) rotate(-90)`}
        >
          Fragility
        </text>
        <text className={styles.truthMapAxisLabel} x={paddingX + 10} y={paddingTop + 16}>Earned</text>
        <text className={styles.truthMapAxisLabel} textAnchor="end" x={paddingX + plotWidth - 10} y={paddingTop + plotHeight - 10}>Fragile</text>

        {points.map((item, index) => {
          const x = paddingX + ((clampUnitInterval(item?.x) || 0) * plotWidth);
          const y = paddingTop + ((1 - (clampUnitInterval(item?.y) || 0)) * plotHeight);
          const filterTone = mapFilterTone(item?.filter || item?.legitimacy || item?.kind);
          const showLabel = index < 7;
          return (
            <g key={item.id || `${item.label}-${index}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
              <title>{`${item.label}: ${item.meta || item.quadrant || item.kind || "Map point"}`}</title>
              <circle className={styles.truthMapPoint} data-filter={filterTone} r={showLabel ? 7 : 5.5} />
              {showLabel ? <text className={styles.truthMapLabel} x="10" y="4">{item.label}</text> : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TruthInterfacePanel({
  blockedAction,
  dashboard,
  ledgerItems,
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
  const capitalTwin = dashboard?.capital_twin || {};
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
  const latestCounterfactual = safeList(ledgerItems)[0] || safeList(dashboard?.counterfactual_ledger?.items)[0] || null;
  const scenarioHighlight = safeList(capitalTwin?.scenarios).find((item) => item.id === "phantom_rebound")
    || safeList(capitalTwin?.scenarios)[0]
    || null;
  const investableCash = personalFinance?.metrics?.monthlyInvestable;
  const targetCoverage = personalFinance?.metrics?.targetCoverage;
  const portfolioAnalytics = portfolioModule?.analytics || {};
  const suggestionPrompts = [
    "How much can I invest this month?",
    "Where is overlap highest right now?",
    "Summarize the current brief.",
  ];
  const briefNotes = safeList(dashboard?.evidence_drawer?.currentRead).slice(0, 3);
  const referenceItems = [
    {
      title: "Portfolio data",
      detail: holdingsCount
        ? `${holdingsCount} connected holdings${portfolioAnalytics.chartSource ? ` - ${portfolioAnalytics.chartSource}` : ""}.`
        : "Add holdings to unlock a live portfolio read.",
    },
    {
      title: "Money plan",
      detail: investableCash === null || investableCash === undefined
        ? "Set income, spending, and buffer to fund the monthly plan."
        : `${formatMoney(investableCash, personalFinance?.inputs?.baseCurrency)} available after burn and buffer.`,
    },
    {
      title: "Market snapshot",
      detail: dashboard?.workspace_summary?.market_data_label || dashboard?.workspace_summary?.last_updated_label || "Current session",
    },
    {
      title: "Current brief",
      detail: cleanWorkspaceCopy(
        briefNotes[0]
        || frontier?.subhead
        || "The current workspace read appears here once the latest evidence is assembled.",
      ),
    },
  ];

  return (
    <section className={styles.truthSurface}>
      <div className={styles.answerWorkspace}>
        <div className={styles.answerWorkspaceHead}>
          <div>
            <p className={styles.kicker}>Current answer</p>
            <h2>{cleanWorkspaceCopy(activeAction?.title || stateSummary?.stance || "Current workspace read")}</h2>
            <p className={styles.supportText}>Use the sidebar to open money plan, portfolio, research, or holdings one layer at a time.</p>
          </div>
          <div className={styles.answerWorkspaceMeta}>
            <ToneBadge tone={truthTone(parseDisplayPercent(balanceSheet?.optionalityReserve))}>
              {balanceSheet?.accountingState || "Live read"}
            </ToneBadge>
            <ToneBadge tone="neutral">{confidencePanel?.confidenceBand || "Usable evidence"}</ToneBadge>
            <ToneBadge tone={realityGapTone(realityGap)}>
              {riskCluster?.dominantLabel || "Cluster read pending"}
            </ToneBadge>
          </div>
        </div>

        <button className={styles.answerComposer} onClick={onToggleChat} type="button">
          {showChat ? "Keep asking about cashflow, portfolio, or a company" : "Ask about cashflow, portfolio, or a company"}
        </button>

        <div className={styles.answerSuggestions}>
          {suggestionPrompts.map((prompt) => (
            <button className={styles.answerSuggestion} key={prompt} onClick={onToggleChat} type="button">
              {prompt}
            </button>
          ))}
        </div>

        <div className={styles.answerGrid}>
          <div className={styles.answerMainColumn}>
            <article className={styles.answerCard}>
              <p className={styles.answerCardTag}>Executive answer</p>
              <h3>{cleanWorkspaceCopy(activeAction?.title || stateSummary?.decisionSummary || "Stay patient")}</h3>
              <p>
                {cleanWorkspaceCopy(
                  activeAction?.summary
                  || stateSummary?.decisionSummary
                  || balanceSheet?.headlineState
                  || frontier?.subhead
                  || "The workspace will surface the clearest current answer here.",
                )}
              </p>

              <div className={styles.answerCardActions}>
                <button className={styles.primaryButton} onClick={onToggleChat} type="button">
                  {showChat ? "Hide explanation" : "Open explanation"}
                </button>
                <button className={styles.secondaryButton} onClick={() => onSelectSection("today")} type="button">
                  Review decision
                </button>
                <button className={styles.secondaryButton} onClick={() => onSelectSection("diversification")} type="button">
                  Check overlap
                </button>
              </div>
            </article>

            <div className={styles.answerModuleGrid}>
              <article className={styles.answerModule}>
                <p className={styles.kicker}>Money plan</p>
                <h3>Available to invest this month</h3>
                <div className={styles.answerMetricList}>
                  <div>
                    <span>Investable cash</span>
                    <strong>{formatMoney(investableCash, personalFinance?.inputs?.baseCurrency)}</strong>
                    <small>After expenses and reserve.</small>
                  </div>
                  <div>
                    <span>Target coverage</span>
                    <strong>{targetCoverage === null || targetCoverage === undefined ? "Set target" : formatOptionalRatio(targetCoverage, 0)}</strong>
                    <small>Share of the planned contribution that is funded.</small>
                  </div>
                  <div>
                    <span>Optionality reserve</span>
                    <strong>{balanceSheet?.optionalityReserve || balanceSheet?.spendingCapacity || "-"}</strong>
                    <small>{cleanWorkspaceCopy(balanceSheet?.spendRule || "Keep reserve for a cleaner setup.")}</small>
                  </div>
                </div>
              </article>

              <article className={styles.answerModule}>
                <p className={styles.kicker}>Portfolio structure</p>
                <h3>How the portfolio reads right now</h3>
                <div className={styles.answerMetricList}>
                  <div>
                    <span>Perceived diversification</span>
                    <strong>{formatScoreValue(visibleScore)}</strong>
                    <small>{holdingsCount ? `${holdingsCount} holdings connected.` : "Connect holdings to estimate visible spread."}</small>
                  </div>
                  <div>
                    <span>Real diversification</span>
                    <strong>{formatScoreValue(structuralScore)}</strong>
                    <small>{cleanWorkspaceCopy(xray?.carryingNarrative || "Overlap and fragility are folded into the structural read.")}</small>
                  </div>
                  <div>
                    <span>Actual structural risk</span>
                    <strong>{structuralRiskLabel(actualStructuralRisk)}</strong>
                    <small>Reality gap: {realityGap === null ? "-" : formatPct(realityGap, 0)}.</small>
                  </div>
                </div>

                <div className={styles.answerTrackGroup}>
                  <div>
                    <label>Structural pressure</label>
                    <div className={styles.answerTrack}>
                      <span style={{ width: `${Math.round((clampUnitInterval(riskCluster?.gScore) || 0) * 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <label>Shock pressure</label>
                    <div className={styles.answerTrack}>
                      <span style={{ width: `${Math.round((clampUnitInterval(riskCluster?.rScore) || 0) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              </article>

              <article className={styles.answerModule}>
                <p className={styles.kicker}>Current brief</p>
                <h3>What deserves attention now</h3>
                {briefNotes.length ? (
                  <div className={styles.answerReferenceList}>
                    {briefNotes.map((item, index) => (
                      <article className={styles.answerReferenceRow} key={`brief-note-${index}`}>
                        <strong>Note {index + 1}</strong>
                        <p>{cleanWorkspaceCopy(item)}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className={styles.supportText}>
                    {cleanWorkspaceCopy(
                      scenarioHighlight?.explanation
                      || "The latest research brief and market notes will collect here as the workspace updates.",
                    )}
                  </p>
                )}

                <div className={styles.answerMicroMeta}>
                  <span>Next unlock: {cleanWorkspaceCopy(frontier?.nextUnlockCondition || "Need a cleaner state before adding more risk.")}</span>
                  <span>Close risk if: {cleanWorkspaceCopy(frontier?.closeCondition || stateSummary?.mainRisk || "If the structure weakens again.")}</span>
                  <span>{latestCounterfactual ? `${latestCounterfactual.verdict}: ${latestCounterfactual.excessDeltaLabel}.` : "Counterfactual ledger will appear as decisions accumulate."}</span>
                </div>
              </article>
            </div>
          </div>

          <aside className={styles.answerSourcesCard}>
            <p className={styles.answerCardTag}>References</p>
            <h3>What the answer is drawing from</h3>
            <div className={styles.answerReferenceList}>
              {referenceItems.map((item) => (
                <article className={styles.answerReferenceRow} key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
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

function cleanWorkspaceCopy(value) {
  return String(value || "")
    .replace(/\bballast\b/gi, "cash buffer")
    .replace(/\bkeep risk elevated\b/gi, "Risk-on, but selective")
    .replace(/\bbroad beta\b/gi, "broad market exposure");
}

function friendlyWorkspaceMessage(value, fallback = "") {
  const text = cleanWorkspaceCopy(value).trim();
  if (!text) return fallback;
  if (isTechnicalWorkspaceMessage(text)) {
    return fallback || "Live market refresh is still catching up. The workspace is using the latest completed session for now.";
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
        <strong>For planning and research.</strong>
        <p>
          This workspace helps organize cashflow, portfolio context, and research. It does not replace individualized investment, tax, or legal advice.
        </p>
      </div>
      <Link className={styles.secondaryLink} href="/terms">Terms</Link>
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
  const activeSectionConfig = WORKSPACE_NAV.find((item) => item.id === activeWorkspaceSection) || WORKSPACE_NAV[0];
  const currentBriefPanel = (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Current brief</p>
          <h2>{cleanWorkspaceCopy(stateSummary?.stance || "Stay patient")}</h2>
          <p className={styles.supportText}>The current posture in plain language, plus the evidence still supporting it.</p>
        </div>
      </div>
      <p className={styles.lead}>
        {cleanWorkspaceCopy(
          stateSummary?.decisionSummary
          || "The workspace will keep surfacing the clearest next action as live analysis refreshes.",
        )}
      </p>
      <InlineList
        emptyLabel="No evidence notes are available yet."
        items={safeList(dashboard?.evidence_drawer?.currentRead).slice(0, 3)}
      />
    </section>
  );

  let activeWorkspacePanels = null;
  switch (activeWorkspaceSection) {
    case "cashflow":
      activeWorkspacePanels = (
        <PersonalFinancePanel
          draft={financeDraft}
          financePlan={personalFinance}
          onChange={updateFinanceDraft}
          onSubmit={submitFinanceDraft}
          pending={pendingKey === "finance-plan"}
        />
      );
      break;
    case "portfolio":
      activeWorkspacePanels = (
        <PortfolioPanel onRangeChange={setPortfolioRange} portfolioModule={portfolioModule} range={portfolioRange} xray={dashboard?.xray} />
      );
      break;
    case "diversification":
      activeWorkspacePanels = (
        <SimplePhantomDiversificationPanel portfolioModule={portfolioModule} workspaceId={workspaceId} />
      );
      break;
    case "research":
      activeWorkspacePanels = (
        <>
          <EquityResearchPanel dashboard={dashboard} workspaceId={workspaceId} />
          {secondaryActions.length ? (
            <CompactActionPanel
              emptyLabel=""
              items={secondaryActions}
              kicker="Research queue"
              renderItem={(action) => (
                <article className={styles.compactRow} key={action.id}>
                  <div>
                    <strong>{action.ticker || action.title}</strong>
                    <p>{action.summary || action.slot || "Watch"}</p>
                  </div>
                  <ToneBadge tone={actionTone(action)}>{action.sizeLabel || formatSize(action)}</ToneBadge>
                </article>
              )}
              title="Live opportunities"
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
          {escrowItems.length ? (
            <CompactActionPanel
              emptyLabel=""
              items={escrowItems}
              kicker="Staged"
              renderItem={(item) => (
                <article className={styles.compactRow} key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.summary || item.slot || "Ready when you are."}</p>
                    <span>Expires {formatDate(item.expiresAt)}</span>
                  </div>
                  <div className={styles.compactActions}>
                    <button
                      className={styles.secondaryButton}
                      disabled={pendingKey !== null}
                      onClick={() => patchEscrow(item, { action: "execute" }, `${item.title} executed.`)}
                      type="button"
                    >
                      {pendingKey === `execute:${item.id}` ? "Executing..." : "Execute"}
                    </button>
                    <button
                      className={styles.textButton}
                      disabled={pendingKey !== null}
                      onClick={() => patchEscrow(item, { action: "cancel" }, `${item.title} cancelled.`)}
                      type="button"
                    >
                      {pendingKey === `cancel:${item.id}` ? "Updating..." : "Cancel"}
                    </button>
                  </div>
                </article>
              )}
              title={`${escrowItems.length} staged action${escrowItems.length === 1 ? "" : "s"}`}
            />
          ) : null}
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
          {escrowItems.length ? (
            <CompactActionPanel
              emptyLabel=""
              items={escrowItems}
              kicker="Staged"
              renderItem={(item) => (
                <article className={styles.compactRow} key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.summary || item.slot || "Ready when you are."}</p>
                    <span>Expires {formatDate(item.expiresAt)}</span>
                  </div>
                  <div className={styles.compactActions}>
                    <button
                      className={styles.secondaryButton}
                      disabled={pendingKey !== null}
                      onClick={() => patchEscrow(item, { action: "execute" }, `${item.title} executed.`)}
                      type="button"
                    >
                      {pendingKey === `execute:${item.id}` ? "Executing..." : "Execute"}
                    </button>
                    <button
                      className={styles.textButton}
                      disabled={pendingKey !== null}
                      onClick={() => patchEscrow(item, { action: "cancel" }, `${item.title} cancelled.`)}
                      type="button"
                    >
                      {pendingKey === `cancel:${item.id}` ? "Updating..." : "Cancel"}
                    </button>
                  </div>
                </article>
              )}
              title={`${escrowItems.length} staged action${escrowItems.length === 1 ? "" : "s"}`}
            />
          ) : null}
          {currentBriefPanel}
          {ledgerItems.length ? (
            <CompactActionPanel
              emptyLabel=""
              items={ledgerItems}
              kicker="Activity"
              renderItem={(item) => (
                <article className={styles.compactRow} key={item.id || item.title}>
                  <div>
                    <strong>{item.title || "Decision event"}</strong>
                    <p>{item.summary || item.note || "Outcome is still settling."}</p>
                    <span>{formatDateTime(item.occurredAt)}</span>
                  </div>
                  <ToneBadge tone={responseTone(item.userResponse || item.response || "noted")}>
                    {item.resultLabel || capitalize(item.userResponse || item.response, "Noted")}
                  </ToneBadge>
                </article>
              )}
              title="Recent outcomes"
            />
          ) : null}
        </>
      );
      break;
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function applyHashSection() {
      const hashSection = window.location.hash.replace(/^#/, "");
      if (!WORKSPACE_NAV.some((item) => item.id === hashSection)) return;
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
    const nextSection = WORKSPACE_NAV.find((item) => item.id === sectionId)?.id;
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
    if (successMessage) setBanner(successMessage);
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
          ? "Live market session refreshed."
          : friendlyWorkspaceMessage(
            refreshPayload?.message,
            "Refreshing the latest market session in the background.",
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
      setError(friendlyWorkspaceMessage(requestError?.message || requestError, "Request failed."));
    } finally {
      setPendingKey(null);
    }
  }

  async function refreshWorkspace() {
    await runWorkspaceAction(
      "refresh",
      requestLiveRefresh,
      "Refreshing the latest market session.",
    );
  }

  useEffect(() => {
    if (!workspaceId || autoRefreshRef.current || !needsAutoRefresh(dashboard?.workspace_summary)) return;
    autoRefreshRef.current = true;
    setBanner("Syncing the latest market session...");

    void requestLiveRefresh()
      .then((payload) => applyWorkspacePayload(payload, payload?.__refreshMessage || "Live market session refreshed."))
      .catch(() => {
        setBanner("Could not refresh on entry. The workspace is using the latest completed session for now.");
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
      await applyWorkspacePayload(payload, "Monthly money plan saved.");
      setFinanceDraftDirty(false);
    } catch (requestError) {
      setError(friendlyWorkspaceMessage(requestError?.message || requestError, "Money plan update failed."));
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
      await applyWorkspacePayload(payload, payload?.holdings_update?.sync_label || "Holdings saved.");
      resetHoldingDraft();
    } catch (requestError) {
      setTradeError(friendlyWorkspaceMessage(requestError?.message || requestError, "Holding update failed."));
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
      await applyWorkspacePayload(payload, payload?.holdings_update?.sync_label || "Holdings saved.");
      setTradeInstruction("");
    } catch (requestError) {
      setTradeError(friendlyWorkspaceMessage(requestError?.message || requestError, "Trade update failed."));
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
              <p className={styles.eyebrow}>Private workspace</p>
              <h1>{workspaceName}</h1>
              <p className={styles.subtitle}>Cash plan, portfolio structure, and research memory in one place.</p>
            </div>

            <div className={styles.headerActions}>
              <div className={styles.headerMeta}>
                <ToneBadge tone="neutral">{initialSession?.user?.name || "Member"}</ToneBadge>
                <ToneBadge tone={statusTone(dashboard?.workspace_summary?.backend_status)}>
                  {capitalize(dashboard?.workspace_summary?.backend_status, "Live")}
                </ToneBadge>
                <ToneBadge tone={connection.status === "live" ? "good" : connection.status === "polling" || connection.status === "warn" ? "warn" : "neutral"}>
                  {connection.label}
                </ToneBadge>
                <ToneBadge tone="neutral">{dashboard?.workspace_summary?.last_updated_label || "No refresh time"}</ToneBadge>
              </div>

              <div className={styles.buttonRow}>
                <button className={styles.primaryButton} disabled={pendingKey !== null} onClick={refreshWorkspace} type="button">
                  {pendingKey === "refresh" ? "Refreshing..." : "Refresh"}
                </button>
                <form action="/api/auth/logout" method="post">
                  <button className={styles.textButton} type="submit">Sign out</button>
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
                  <span className={styles.welcomeGuideBadge}>Getting started</span>
                  <button
                    aria-label="Dismiss welcome guide"
                    className={styles.welcomeGuideClose}
                    onClick={() => setShowWelcomeGuide(false)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
                <h2 className={styles.welcomeGuideTitle}>Welcome to your workspace</h2>
                <p className={styles.welcomeGuideSubtitle}>
                  Three steps to get the most out of this tool - no technical knowledge needed.
                </p>
                <ol className={styles.welcomeSteps}>
                  <li className={styles.welcomeStep}>
                    <span className={styles.welcomeStepNum}>1</span>
                    <div>
                      <strong>Set the monthly money plan</strong>
                      <p>Enter income, fixed costs, variable spending, buffer, and target contribution.</p>
                    </div>
                  </li>
                  <li className={styles.welcomeStep}>
                    <span className={styles.welcomeStepNum}>2</span>
                    <div>
                      <strong>Add your holdings</strong>
                      <p>Two or three positions are enough to unlock the live portfolio read.</p>
                    </div>
                  </li>
                  <li className={styles.welcomeStep}>
                    <span className={styles.welcomeStepNum}>3</span>
                    <div>
                      <strong>Read before action</strong>
                      <p>Use cashflow, overlap, and research before staging any move.</p>
                    </div>
                  </li>
                </ol>
                <div className={styles.welcomeGuideFoot}>
                  <button
                    className={styles.welcomeGuideBtn}
                    onClick={() => setShowGlossary(true)}
                    type="button"
                  >
                    Open glossary
                  </button>
                  <button
                    className={styles.welcomeGuideDismiss}
                    onClick={() => setShowWelcomeGuide(false)}
                    type="button"
                  >
                    Hide guide
                  </button>
                </div>
              </div>
            </div>
          )}

          {showGlossary && (
            <div className={styles.glossaryOverlay} role="dialog" aria-label="Term glossary">
              <div className={styles.glossaryPanel}>
                <div className={styles.glossaryPanelHead}>
                  <h2>Plain-English glossary</h2>
                  <button
                    aria-label="Close glossary"
                    className={styles.welcomeGuideClose}
                    onClick={() => setShowGlossary(false)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
                <p className={styles.glossaryPanelSub}>Every unusual term this workspace uses, explained in plain language.</p>
                <dl className={styles.glossaryList}>
                  {[
                    { term: "Monthly money plan", def: "Income minus expenses and cash buffer. The result is what the portfolio can receive." },
                    { term: "Risk overlap", def: "When holdings look different but react to the same market shock." },
                    { term: "Return since cost basis", def: "Current holding value compared with stored purchase cost." },
                    { term: "Benchmark history", def: "Portfolio comparison against SPY or another reference." },
                    { term: "Stance", def: "The current posture: cautious, neutral, or opportunistic." },
                    { term: "Staged moves", def: "Actions saved for later review." },
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
            ledgerItems={ledgerItems}
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
              detail="After expenses and reserve."
              label="Monthly room"
              tone={financeMetricTone(personalFinance)}
              value={formatMoney(personalFinance?.metrics?.monthlyInvestable, personalFinance?.inputs?.baseCurrency)}
            />
            <MetricTile
              detail={holdingsCount ? "Connected to this workspace." : "Add holdings to unlock the live read."}
              label="Holdings"
              tone={holdingsCount ? "good" : "warn"}
              value={holdingsCount ? `${holdingsCount} name${holdingsCount === 1 ? "" : "s"}` : "Not connected"}
            />
            <MetricTile
              detail="Latest loaded market date."
              label="Snapshot"
              tone="neutral"
              value={dashboard?.workspace_summary?.market_data_label || "No market timestamp"}
            />
            <MetricTile
              detail={cleanWorkspaceCopy(stateSummary?.decisionSummary || connection.detail || "Ready for the next decision.")}
              label="Posture"
              tone={statusTone(primaryAction?.status || connection.status || "neutral")}
              value={cleanWorkspaceCopy(stateSummary?.stance || connection.label || "Live workspace")}
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

      {isPending ? <div className={styles.pendingNote}>Applying update...</div> : null}

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
