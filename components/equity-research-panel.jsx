"use client";

import { useMemo, useState } from "react";

import { formatCurrency, formatDateTime, formatPct, safeList, statusTone } from "@/components/workspace/formatters";
import { parseResponse } from "@/components/workspace/live-data";
import styles from "@/components/workspace/shell.module.css";

const RESEARCH_TABS = ["Memo", "Valuation", "Delta", "Evidence", "Audit"];

function cleanTicker(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 16);
}

function compactCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (Math.abs(number) >= 1_000_000_000) return `${formatCurrency(number / 1_000_000_000)}B`;
  if (Math.abs(number) >= 1_000_000) return `${formatCurrency(number / 1_000_000)}M`;
  return formatCurrency(number);
}

function ResearchMetric({ label, value, detail, tone = "neutral" }) {
  return (
    <div className={styles.researchMetric} data-tone={tone}>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function findSuggestedTickers(dashboard) {
  const tickers = [
    dashboard?.primary_action?.ticker,
    ...safeList(dashboard?.secondary_actions).map((item) => item?.ticker),
    ...safeList(dashboard?.modules?.portfolio?.holdings).map((item) => item?.ticker || item?.symbol),
    ...safeList(dashboard?.modules?.scanner?.rows).map((item) => item?.ticker),
  ]
    .map(cleanTicker)
    .filter(Boolean);
  return [...new Set(tickers)].slice(0, 6);
}

function scenarioTone(name) {
  if (name === "bull") return "good";
  if (name === "bear") return "bad";
  return "warn";
}

function downloadArtifact(artifact) {
  if (!artifact?.content_base64 || !artifact?.filename) return;
  const binary = window.atob(artifact.content_base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: artifact.media_type || "application/octet-stream" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = artifact.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function artifactLabel(filename) {
  if (!filename) return "Download";
  if (filename.endsWith(".xlsx")) return "Model";
  if (filename.endsWith("_report.md")) return "Report";
  if (filename.endsWith("_sources.json")) return "Sources";
  if (filename.endsWith("_audit.json")) return "Audit";
  if (filename.endsWith("_assumptions.yml")) return "Assumptions";
  return filename;
}

function renderMemo(research) {
  if (!research) {
    return <p className={styles.emptyCopy}>Run a ticker to generate a sourced memo, valuation, sources ledger, and audit file.</p>;
  }
  return <pre className={styles.researchMemo}>{research.report_markdown || "No report text was returned."}</pre>;
}

function renderValuation(research) {
  const valuation = research?.valuation || {};
  const scenarios = safeList(valuation.scenarios);
  const reverse = valuation.reverse_dcf || {};

  if (!research) {
    return <p className={styles.emptyCopy}>The valuation tab will populate after a research run.</p>;
  }

  if (!valuation.available) {
    return <p className={styles.emptyCopy}>{valuation.reason || "Valuation is unavailable because required inputs are missing."}</p>;
  }

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchScenarioGrid}>
        {scenarios.map((scenario) => (
          <article className={styles.researchScenario} data-tone={scenarioTone(scenario.name)} key={scenario.name}>
            <span>{scenario.name}</span>
            <strong>{compactCurrency(scenario.intrinsic_value_per_share)}</strong>
            <small>
              Growth {formatPct(scenario.assumptions?.revenue_growth)} / margin {formatPct(scenario.assumptions?.terminal_fcf_margin)}
            </small>
          </article>
        ))}
      </div>

      <div className={styles.researchDetailGrid}>
        <ResearchMetric
          detail={reverse.status || reverse.reason || "Current price solved against the base DCF structure."}
          label="Implied revenue CAGR"
          tone={reverse.available ? "warn" : "neutral"}
          value={reverse.available ? formatPct(reverse.implied_revenue_cagr) : "-"}
        />
        <ResearchMetric
          detail="Enterprise value divided by latest sourced revenue."
          label="EV / sales"
          value={Number.isFinite(Number(valuation.multiples?.ev_to_sales)) ? `${Number(valuation.multiples.ev_to_sales).toFixed(1)}x` : "-"}
        />
        <ResearchMetric
          detail="Market cap divided by latest deterministic FCF."
          label="P / FCF"
          value={Number.isFinite(Number(valuation.multiples?.price_to_fcf)) ? `${Number(valuation.multiples.price_to_fcf).toFixed(1)}x` : "-"}
        />
      </div>
    </div>
  );
}

function renderEvidence(research) {
  const records = safeList(research?.sources?.records);
  const points = safeList(research?.sources?.data_points);

  if (!research) {
    return <p className={styles.emptyCopy}>Every number will appear here with source id, provider, endpoint, and claim tag.</p>;
  }

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchTable}>
        <div className={styles.researchTableHeader}>
          <span>Source</span>
          <span>Provider</span>
          <span>Status</span>
          <span>Rows</span>
        </div>
        {records.map((source) => (
          <div className={styles.researchTableRow} key={source.source_id}>
            <strong>{source.source_id}</strong>
            <span>{source.provider}</span>
            <span>{source.status}</span>
            <span>{source.row_count ?? "-"}</span>
          </div>
        ))}
      </div>

      <div className={styles.researchTable}>
        <div className={styles.researchTableHeader}>
          <span>Metric</span>
          <span>Tag</span>
          <span>Source</span>
          <span>Value</span>
        </div>
        {points.map((point) => (
          <div className={styles.researchTableRow} key={`${point.metric}-${point.claim_tag}`}>
            <strong>{point.metric}</strong>
            <span>{point.claim_tag}</span>
            <span>{point.source_id || "formula"}</span>
            <span>{point.normalized_value === null || point.normalized_value === undefined ? "-" : String(point.normalized_value).slice(0, 32)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDeltaValue(value, unit) {
  if (!Number.isFinite(Number(value))) return "-";
  if (unit === "percent") return formatPct(value);
  if (unit === "currency") return compactCurrency(value);
  return Number(value).toFixed(2);
}

function renderDelta(research) {
  const delta = research?.history?.delta || {};
  const changes = safeList(delta.changes);

  if (!research) {
    return <p className={styles.emptyCopy}>After the second run for a ticker, this tab will show what changed since the prior stored report.</p>;
  }

  if (!delta.available) {
    return <p className={styles.emptyCopy}>{delta.reason || "No prior stored run is available yet."}</p>;
  }

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchDetailGrid}>
        <ResearchMetric
          detail={delta.previous_run_at ? `Previous run ${formatDateTime(delta.previous_run_at)}` : "Previous run timestamp unavailable."}
          label="Stored runs"
          tone="good"
          value={String(research.history?.run_count || 1)}
        />
        <ResearchMetric
          detail={delta.period_changed ? `${delta.previous_period} -> ${delta.current_period}` : "Latest fiscal period is unchanged."}
          label="Period"
          tone={delta.period_changed ? "warn" : "neutral"}
          value={delta.current_period || "-"}
        />
        <ResearchMetric
          detail={delta.audit_changed ? `Was ${delta.previous_audit_status}` : "Audit status is unchanged."}
          label="Audit delta"
          tone={delta.audit_changed ? "warn" : "good"}
          value={delta.current_audit_status || "-"}
        />
      </div>

      <div className={styles.researchTable}>
        <div className={styles.researchTableHeader}>
          <span>Metric</span>
          <span>Current</span>
          <span>Previous</span>
          <span>Change</span>
        </div>
        {changes.map((change) => (
          <div className={styles.researchTableRow} key={change.key}>
            <strong>{change.label}</strong>
            <span>{formatDeltaValue(change.current, change.unit)}</span>
            <span>{formatDeltaValue(change.previous, change.unit)}</span>
            <span>{formatDeltaValue(change.absolute_change, change.unit)}</span>
          </div>
        ))}
      </div>

      {changes.length ? null : <p className={styles.emptyCopy}>{delta.summary}</p>}
    </div>
  );
}

function renderAudit(research) {
  const findings = safeList(research?.audit?.findings);
  const flags = safeList(research?.financials?.quality_flags);

  if (!research) {
    return <p className={styles.emptyCopy}>The audit will flag missing sources, provider errors, weak valuation inputs, and accounting quality issues.</p>;
  }

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchFindingList}>
        {(findings.length ? findings : [{ severity: "info", message: "No audit findings." }]).map((finding, index) => (
          <article className={styles.researchFinding} data-tone={statusTone(finding.severity)} key={`${finding.code || "finding"}-${index}`}>
            <strong>{finding.code || finding.severity || "audit"}</strong>
            <p>{finding.message}</p>
          </article>
        ))}
      </div>

      <div className={styles.researchFindingList}>
        {(flags.length ? flags : [{ severity: "info", title: "No accounting quality flags were triggered." }]).map((flag, index) => (
          <article className={styles.researchFinding} data-tone={statusTone(flag.severity)} key={`${flag.title}-${index}`}>
            <strong>{flag.title}</strong>
            <p>{Number.isFinite(Number(flag.metric)) ? formatPct(flag.metric) : "No metric value returned."}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function EquityResearchPanel({ dashboard, workspaceId }) {
  const suggestions = useMemo(() => findSuggestedTickers(dashboard), [dashboard]);
  const [ticker, setTicker] = useState(suggestions[0] || "");
  const [mode, setMode] = useState("quick");
  const [activeTab, setActiveTab] = useState("Memo");
  const [research, setResearch] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function runResearch(nextTicker = ticker) {
    const symbol = cleanTicker(nextTicker);
    if (!workspaceId || !symbol) return;
    setTicker(symbol);
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/research/${encodeURIComponent(symbol)}?mode=${mode}`, {
        cache: "no-store",
      });
      const payload = await parseResponse(response);
      setResearch(payload);
      setActiveTab("Memo");
    } catch (requestError) {
      setResearch(null);
      setError(String(requestError?.message || requestError || "Research run failed."));
    } finally {
      setPending(false);
    }
  }

  const ratios = research?.financials?.ratios || {};
  const evidenceCount = safeList(research?.sources?.data_points).length;
  const auditFindings = safeList(research?.audit?.findings);
  const baseScenario = safeList(research?.valuation?.scenarios).find((scenario) => scenario.name === "base");
  const downloads = safeList(research?.downloads);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Equity research OS</p>
          <h2>Run a company through the deterministic ledger</h2>
          <p className={styles.supportText}>
            Ticker in, source-backed memo out: statements, valuation, reverse DCF, red-team prompts, sources, and audit.
          </p>
        </div>
        <div className={styles.researchRunBox}>
          <div className={styles.researchTickerRow}>
            <input
              aria-label="Ticker"
              className={styles.textInput}
              onChange={(event) => setTicker(cleanTicker(event.target.value))}
              placeholder="ASML"
              value={ticker}
            />
            <button className={styles.primaryButton} disabled={pending || !ticker} onClick={() => runResearch()} type="button">
              {pending ? "Running..." : "Run"}
            </button>
          </div>
          <div className={styles.segmentedControl}>
            {["quick", "full"].map((option) => (
              <button
                className={styles.segmentButton}
                data-active={mode === option}
                key={option}
                onClick={() => setMode(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      {suggestions.length ? (
        <div className={styles.researchSuggestions}>
          {suggestions.map((symbol) => (
            <button className={styles.rangeButton} disabled={pending} key={symbol} onClick={() => runResearch(symbol)} type="button">
              {symbol}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className={styles.errorText}>{error}</p> : null}

      <div className={styles.researchMetricGrid}>
        <ResearchMetric
          detail={research?.company_profile?.industry || "Profile loads from FMP via the Railway backend."}
          label="Company"
          tone={research ? "good" : "neutral"}
          value={research?.company_profile?.name || "No run yet"}
        />
        <ResearchMetric
          detail="Latest annual statement row."
          label="Revenue"
          value={compactCurrency(ratios.latest_revenue)}
        />
        <ResearchMetric
          detail="Base case deterministic DCF."
          label="Base value"
          tone={baseScenario ? "warn" : "neutral"}
          value={compactCurrency(baseScenario?.intrinsic_value_per_share)}
        />
        <ResearchMetric
          detail={`${evidenceCount} evidence points, ${auditFindings.length} audit finding${auditFindings.length === 1 ? "" : "s"}.`}
          label="Audit"
          tone={statusTone(research?.audit?.status)}
          value={research?.audit?.status || "Waiting"}
        />
      </div>

      {research?.generated_at ? <p className={styles.supportHint}>Generated {formatDateTime(research.generated_at)}</p> : null}

      {downloads.length ? (
        <div className={styles.researchDownloadBar} aria-label="Research artifact downloads">
          {downloads.map((artifact) => (
            <button
              className={styles.secondaryButton}
              key={artifact.filename}
              onClick={() => downloadArtifact(artifact)}
              type="button"
            >
              {artifactLabel(artifact.filename)}
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.researchTabs} role="tablist" aria-label="Research output tabs">
        {RESEARCH_TABS.map((tab) => (
          <button
            className={styles.rangeButton}
            data-active={activeTab === tab}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      <div className={styles.researchOutput}>
        {activeTab === "Memo" ? renderMemo(research) : null}
        {activeTab === "Valuation" ? renderValuation(research) : null}
        {activeTab === "Delta" ? renderDelta(research) : null}
        {activeTab === "Evidence" ? renderEvidence(research) : null}
        {activeTab === "Audit" ? renderAudit(research) : null}
      </div>
    </section>
  );
}
