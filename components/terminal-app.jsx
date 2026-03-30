"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

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

const DEFAULT_APP_NAME = process.env.NEXT_PUBLIC_BLS_APP_NAME || "Allocator Workspace";

function ToneBadge({ tone = "neutral", children }) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {children}
    </span>
  );
}

function MetricTile({ label, value, detail, tone = "neutral" }) {
  return (
    <article className={styles.metricTile} data-tone={tone}>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
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
  const width = 640;
  const height = 220;
  const padding = 18;
  const rows = safeList(series);
  const portfolioPoints = rows
    .map((row) => ({ date: row.date, value: Number(row.portfolio) }))
    .filter((row) => Number.isFinite(row.value));
  const benchmarkPoints = rows
    .map((row) => ({ date: row.date, value: Number(row.benchmark) }))
    .filter((row) => Number.isFinite(row.value));

  if (portfolioPoints.length < 2) {
    return <p className={styles.emptyCopy}>Portfolio history is still limited. Stored snapshots will populate this chart.</p>;
  }

  const values = portfolioPoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const safeRange = max - min || 1;

  const buildPath = (points) => points
    .map((point, index) => {
      const x = padding + ((width - (padding * 2)) * index) / Math.max(points.length - 1, 1);
      const y = height - padding - (((point.value - min) / safeRange) * (height - (padding * 2)));
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const latest = portfolioPoints[portfolioPoints.length - 1];
  const latestX = padding + ((width - (padding * 2)) * (portfolioPoints.length - 1)) / Math.max(portfolioPoints.length - 1, 1);
  const latestY = height - padding - (((latest.value - min) / safeRange) * (height - (padding * 2)));
  const hasBenchmark = benchmarkPoints.length >= 3;

  return (
    <div className={styles.chartBlock}>
      <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Portfolio performance">
        <defs>
          <linearGradient id="workspaceChartLine" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="rgba(248, 200, 111, 0.95)" />
            <stop offset="100%" stopColor="rgba(122, 210, 194, 0.95)" />
          </linearGradient>
        </defs>
        <path className={styles.chartGrid} d={`M ${padding} ${height - padding} L ${width - padding} ${height - padding}`} />
        {hasBenchmark ? <path className={styles.chartBenchmark} d={buildPath(benchmarkPoints)} /> : null}
        <path className={styles.chartLine} d={buildPath(portfolioPoints)} />
        <circle className={styles.chartPoint} cx={latestX} cy={latestY} r="4" />
      </svg>

      <div className={styles.chartLegend}>
        <span><i className={styles.legendSwatch} data-series="portfolio" />Portfolio</span>
        {hasBenchmark ? <span><i className={styles.legendSwatch} data-series="benchmark" />{benchmarkSymbol || "SPY"}</span> : null}
      </div>
    </div>
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
  const title = primaryAction?.title || blockedAction?.title || stateSummary?.stance || "Hold the line";

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Recommended move</p>
          <h2>{title}</h2>
          <p className={styles.supportText}>The clearest action the current market read supports right now.</p>
        </div>
        <ToneBadge tone={statusTone(isBlocked ? "briefing" : (primaryAction?.status || "ready"))}>
          {isBlocked ? "Wait" : "Actionable"}
        </ToneBadge>
      </div>

      <p className={styles.lead}>
        {primaryAction?.summary || blockedAction?.summary || stateSummary?.decisionSummary || "No new legitimate move is open right now."}
      </p>

      <div className={styles.decisionGrid}>
        <MetricTile
          detail={primaryAction?.whyNow || stateSummary?.decisionSummary || "Wait for a cleaner setup before widening risk."}
          label="Action"
          value={primaryAction?.title || "Protect capital"}
        />
        <MetricTile
          detail={primaryAction?.watchFor || blockedAction?.watchFor || "A stronger recoverability read and cleaner breadth confirmation."}
          label="What would change it"
          value={activeAction ? formatSize(activeAction) : "No size change"}
        />
        <MetricTile
          detail={activeAction?.funding || "Preserve current sizing until the setup improves."}
          label="How to fund it"
          value={activeAction?.funding || "No funding change"}
        />
        <MetricTile
          detail={blockedAction?.summary || "The current structure still does not justify broader risk."}
          label="Current stance"
          value={stateSummary?.stance || "Selective posture"}
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

function PortfolioPanel({ portfolioModule, range, onRangeChange }) {
  const portfolio = portfolioModule || {};
  const analytics = portfolio.analytics || {};
  const holdings = safeList(portfolio.holdings);
  const topHoldings = holdings.slice(0, 5);
  const chartSeries = filterPortfolioSeries(portfolio?.charts?.growthComparison, range);
  const currentGainLabel = analytics.unrealizedReturnLabel || "Cost basis unavailable";

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Portfolio</p>
          <h2>{analytics.totalValueUsd ? formatCurrency(analytics.totalValueUsd) : "Portfolio connected"}</h2>
          <p className={styles.supportText}>Total value, tracked performance, and the positions currently driving the portfolio.</p>
        </div>
        <div className={styles.headerMeta}>
          <ToneBadge tone={holdings.length ? "good" : "warn"}>{analytics.holdingsCount || holdings.length} holdings</ToneBadge>
          <ToneBadge tone="neutral">{portfolio.chartSource || "Portfolio data loading"}</ToneBadge>
        </div>
      </div>

      <div className={styles.metricsGrid}>
        <MetricTile
          detail={analytics.hasPerformanceHistory ? "Based on stored snapshots" : currentGainLabel}
          label="Annualized return"
          value={analytics.hasPerformanceHistory ? analytics.annualReturnLabel : "History limited"}
        />
        <MetricTile
          detail={analytics.historySessions ? `${analytics.historySessions} stored observations` : "Holdings are connected"}
          label="Since tracking started"
          value={analytics.totalReturnLabel || "History limited"}
        />
        <MetricTile
          detail={analytics.hasBenchmarkHistory ? `${analytics.excessReturnLabel} vs ${analytics.benchmarkSymbol || "SPY"}` : "Benchmark comparison needs more stored history."}
          label={`vs ${analytics.benchmarkSymbol || "SPY"}`}
          tone={analytics.hasBenchmarkHistory ? "good" : "neutral"}
          value={analytics.hasBenchmarkHistory ? analytics.excessReturnLabel : "Benchmark limited"}
        />
      </div>

      <div className={styles.portfolioGrid}>
        <div className={styles.chartPanel}>
          <RangeTabs onChange={onRangeChange} value={range} />
          <PortfolioChart benchmarkSymbol={analytics.benchmarkSymbol} series={chartSeries} />
          <p className={styles.supportText}>
            {analytics.hasPerformanceHistory
              ? `Live performance is based on ${analytics.historySessions} stored portfolio snapshots.`
              : `Current gain is ${currentGainLabel}. The app needs more stored sessions before performance and benchmark comparisons are reliable.`}
          </p>
        </div>

        <aside className={styles.sidePanel}>
          <div className={styles.sidePanelHeader}>
            <div>
              <p className={styles.kicker}>Largest positions</p>
              <h3>Top positions by weight</h3>
            </div>
            <ToneBadge tone="neutral">{topHoldings.length} shown</ToneBadge>
          </div>

          {topHoldings.length ? (
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
    </section>
  );
}

function HoldingsPanel({ portfolioModule, tradeInstruction, onTradeInstructionChange, onSubmitTrade, pendingTrade, tradeError }) {
  const portfolio = portfolioModule || {};
  const holdings = safeList(portfolio.holdings);

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
          onSubmitTrade();
        }}
      >
        <div className={styles.tradeCopy}>
          <p className={styles.kicker}>Quick update</p>
          <h3>Write the trade naturally</h3>
          <p>For example: “compre 100 usd de NVDA” or “sold 2 shares of AAPL”. The app will translate it into a holdings update.</p>
        </div>
        <div className={styles.tradeForm}>
          <input
            className={styles.textInput}
            onChange={(event) => onTradeInstructionChange(event.target.value)}
            placeholder="compre 100 usd de NVDA"
            type="text"
            value={tradeInstruction}
          />
          <button className={styles.primaryButton} disabled={pendingTrade || !String(tradeInstruction || "").trim()} type="submit">
            {pendingTrade ? "Updating..." : "Update holdings"}
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

export default function TerminalApp({ initialSession, initialDashboard }) {
  const workspaceId = initialDashboard?.workspace_summary?.id || initialSession?.workspace?.id;
  const { connection, dashboard, refreshSnapshot, setDashboard } = useWorkspaceLiveData({
    initialDashboard,
    workspaceId,
  });
  const [banner, setBanner] = useState("");
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState(null);
  const [portfolioRange, setPortfolioRange] = useState("1M");
  const [tradeInstruction, setTradeInstruction] = useState("");
  const [tradeError, setTradeError] = useState("");
  const [isPending, startTransition] = useTransition();

  const stateSummary = dashboard?.state_summary || {};
  const portfolioModule = dashboard?.modules?.portfolio || null;
  const primaryAction = dashboard?.primary_action || null;
  const secondaryActions = safeList(dashboard?.secondary_actions).slice(0, 4);
  const blockedAction = dashboard?.blocked_action || null;
  const escrowItems = safeList(dashboard?.escrow?.items).slice(0, 4);
  const ledgerItems = safeList(dashboard?.counterfactual_ledger?.items).slice(0, 4);
  const alerts = safeList(dashboard?.decision_workspace?.alerts || dashboard?.alerts).slice(0, 3);
  const dataControl = dashboard?.data_control || {};

  async function applyWorkspacePayload(payload, successMessage) {
    startTransition(() => {
      setDashboard(payload);
    });
    if (successMessage) setBanner(successMessage);
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
      setError(String(requestError?.message || requestError || "Request failed."));
    } finally {
      setPendingKey(null);
    }
  }

  async function refreshWorkspace() {
    await runWorkspaceAction(
      "refresh",
      async () => {
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
            latestWorkspace?.workspace_summary?.last_updated &&
            latestWorkspace.workspace_summary.last_updated !== dashboard?.workspace_summary?.last_updated
              ? "Live analysis refreshed."
              : refreshPayload?.message || "Refresh queued. Analysis is still rebuilding.",
        };
      },
      "Live refresh requested.",
    );
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
      await applyWorkspacePayload(payload, "Holdings updated from your trade note.");
      setTradeInstruction("");
    } catch (requestError) {
      setTradeError(String(requestError?.message || requestError || "Trade update failed."));
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

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Private workspace</p>
          <h1>{dashboard?.workspace_summary?.name || initialSession?.workspace?.name || DEFAULT_APP_NAME}</h1>
          <p className={styles.subtitle}>One workspace to read the market, understand the portfolio, and act without switching tools.</p>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.headerMeta}>
            <ToneBadge tone="neutral">{initialSession?.user?.name || "Member workspace"}</ToneBadge>
            <ToneBadge tone={statusTone(dashboard?.workspace_summary?.backend_status)}>
              {capitalize(dashboard?.workspace_summary?.backend_status, "Live")}
            </ToneBadge>
            <ToneBadge tone={connection.status === "live" ? "good" : connection.status === "polling" ? "warn" : "neutral"}>
              {connection.label}
            </ToneBadge>
            <ToneBadge tone="neutral">{dashboard?.workspace_summary?.last_updated_label || "No refresh time"}</ToneBadge>
          </div>

          <div className={styles.buttonRow}>
            <button className={styles.primaryButton} disabled={pendingKey !== null} onClick={refreshWorkspace} type="button">
              {pendingKey === "refresh" ? "Refreshing..." : "Refresh"}
            </button>
            <Link className={styles.secondaryLink} href="/">Home</Link>
            <form action="/api/auth/logout" method="post">
              <button className={styles.textButton} type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      {banner ? <div className={styles.banner}>{banner}</div> : null}
      {error ? <div className={styles.banner} data-tone="error">{error}</div> : null}

      <section className={styles.statusGrid}>
        <MetricTile
          detail={dataControl.notes?.[0] || "Refresh asks Railway to rebuild the analysis snapshot."}
          label="Analysis source"
          tone={statusTone(dashboard?.workspace_summary?.backend_status)}
          value={dataControl.analysisSource || "Status unavailable"}
        />
        <MetricTile
          detail={dataControl.notes?.[3] || "Private holdings overlay is not connected."}
          label="Holdings source"
          tone={portfolioModule?.analytics?.holdingsCount ? "good" : "warn"}
          value={dataControl.holdingsSource?.label || "No private holdings source"}
        />
        <MetricTile
          detail={dataControl.notes?.[1] || "Price tiles use the latest market date in the snapshot."}
          label="Market date"
          tone="neutral"
          value={dashboard?.workspace_summary?.market_data_label || "No market timestamp"}
        />
        <MetricTile
          detail={connection.detail}
          label="Connection"
          tone={connection.status === "live" ? "good" : connection.status === "polling" ? "warn" : "neutral"}
          value={connection.label}
        />
      </section>

      <div className={styles.layout}>
        <section className={styles.mainColumn}>
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
          <PortfolioPanel onRangeChange={setPortfolioRange} portfolioModule={portfolioModule} range={portfolioRange} />
          <PhantomDiversificationPanel portfolioModule={portfolioModule} workspaceId={workspaceId} />
          <HoldingsPanel
            onSubmitTrade={submitTradeInstruction}
            onTradeInstructionChange={setTradeInstruction}
            pendingTrade={Boolean(pendingKey?.startsWith("trade:"))}
            portfolioModule={portfolioModule}
            tradeError={tradeError}
            tradeInstruction={tradeInstruction}
          />
        </section>

        <aside className={styles.sideColumn}>
          <CompactActionPanel
            emptyLabel="Nothing is staged yet. Save a move here when you want to prepare it before acting."
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
            title={escrowItems.length ? `${escrowItems.length} staged actions` : "No staged actions"}
          />

          <CompactActionPanel
            emptyLabel={
              dashboard?.workspace_summary?.backend_status === "briefing" || dashboard?.workspace_summary?.backend_status === "stale"
                ? `We are refreshing the market view${dashboard?.workspace_summary?.last_updated_label ? ` from ${dashboard.workspace_summary.last_updated_label}` : ""}. New ideas will appear here after the refresh finishes.`
                : "Nothing new needs attention right now."
            }
            items={secondaryActions}
            kicker="Watch next"
            renderItem={(action) => (
              <article className={styles.compactRow} key={action.id}>
                <div>
                  <strong>{action.ticker || action.title}</strong>
                  <p>{action.summary || action.slot || "Watch"}</p>
                </div>
                <ToneBadge tone={actionTone(action)}>{action.sizeLabel || formatSize(action)}</ToneBadge>
              </article>
            )}
            title={secondaryActions.length ? "Ideas to watch" : "No fresh ideas today"}
          />

          <CompactActionPanel
            emptyLabel="Your timeline starts after your first trade note, staged move, or decision."
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
            title={ledgerItems.length ? "Recent outcomes" : "No settled outcomes yet"}
          />

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Current brief</p>
                <h2>{stateSummary?.stance || "Stay patient"}</h2>
                <p className={styles.supportText}>The short read behind the current posture and the evidence supporting it.</p>
              </div>
            </div>
            <p className={styles.lead}>{stateSummary?.decisionSummary || "The workspace will keep surfacing the clearest next action as live analysis refreshes."}</p>
            <InlineList
              emptyLabel="No evidence notes are available yet."
              items={safeList(dashboard?.evidence_drawer?.currentRead).slice(0, 3)}
            />
          </section>
        </aside>
      </div>

      {isPending ? <div className={styles.pendingNote}>Applying update...</div> : null}
    </main>
  );
}
