"use client";

import { useMemo, useState } from "react";

import { formatCurrency, formatDateTime, formatPct, safeList, statusTone } from "@/components/workspace/formatters";
import { parseResponse } from "@/components/workspace/live-data";
import styles from "@/components/workspace/shell.module.css";

const RESEARCH_TABS = ["Memo", "Value", "Debate", "Changes", "Sources", "Audit"];
const AGENT_STAGES = [
  { key: "intake", label: "Collect", detail: "Sources", threshold: 0 },
  { key: "normalize", label: "Clean", detail: "Statements", threshold: 18 },
  { key: "valuation", label: "Value", detail: "DCF / reverse", threshold: 40 },
  { key: "red_team", label: "Challenge", detail: "Risks", threshold: 62 },
  { key: "audit", label: "Verify", detail: "Ledger", threshold: 82 },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanTicker(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 16);
}

function compactCurrency(value) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (Math.abs(number) >= 1_000_000_000) return `${formatCurrency(number / 1_000_000_000)}B`;
  if (Math.abs(number) >= 1_000_000) return `${formatCurrency(number / 1_000_000)}M`;
  return formatCurrency(number);
}

function formatCoverageScore(score) {
  const number = Number(score);
  if (!Number.isFinite(number)) return "-";
  return `${Math.round(number)}%`;
}

function coverageTone(coverage) {
  const status = String(coverage?.status || "").toLowerCase();
  const score = Number(coverage?.score);
  if (status === "pass" || score >= 85) return "good";
  if (status === "needs_attention" || score < 60) return "bad";
  if (status === "partial" || score < 85) return "warn";
  return "neutral";
}

function humanizeToken(value) {
  const text = String(value || "")
    .replace(/[_\-]+/g, " ")
    .trim();
  if (!text) return "-";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function humanizeMetric(value) {
  const labels = {
    latest_revenue: "revenue",
    latest_diluted_shares: "diluted shares",
    latest_free_cash_flow: "free cash flow",
    revenue_cagr_5y: "5y revenue CAGR",
    gross_margin: "gross margin",
    operating_margin: "operating margin",
    fcf_margin: "FCF margin",
    base_intrinsic_value_per_share: "base value/share",
    reverse_dcf_implied_revenue_cagr: "reverse DCF growth",
    latest_sec_filing: "latest SEC filing",
  };
  return labels[value] || String(value || "").replace(/[_\-]+/g, " ");
}

function parseJsonish(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  const text = String(value || "").trim();
  if (!text) return {};
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return { memo_patch: text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim() };
  }
}

function finalAnalysisFrom(orchestrator) {
  const analysis = parseJsonish(orchestrator?.analysis);
  if (analysis.memo_patch && !analysis.executive_judgment) {
    const nested = parseJsonish(analysis.memo_patch);
    if (nested.executive_judgment || nested.strongest_points || nested.red_team || nested.open_questions) {
      return nested;
    }
  }
  return analysis;
}

const AGENT_DISPLAY_NAMES = {
  orchestrator: "Run coordinator",
  orchestrator_agent: "Run coordinator",
  company_profile_agent: "Business profile review",
  financial_quality_agent: "Financial quality review",
  valuation_agent: "Valuation review",
  risk_agent: "Risk review",
  catalyst_agent: "Filing and catalyst review",
  red_team_agent: "Red-team challenge",
  editor_auditor_agent: "Editor and audit gate",
};

function agentDisplayName(agent) {
  const fallback = firstUsefulText(agent?.name, "Analyst review").replace(/\s+Agent$/i, " review");
  return AGENT_DISPLAY_NAMES[agent?.id] || fallback;
}

function agentFriendlyNameFromText(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+Agent$/i, "_agent")
    .toLowerCase()
    .replace(/\s+/g, "_");
  return AGENT_DISPLAY_NAMES[normalized] || String(value || "").replace(/\s+Agent$/i, " review").trim();
}

function analysisItems(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const text = String(value || "").trim();
  return text ? [text] : [];
}

function finalEditorMarkdownFromAnalysis(value) {
  const analysis = finalAnalysisFrom({ analysis: value });
  const judgment = firstUsefulText(analysis.executive_judgment, analysis.memo_patch);
  const sections = [
    ["What supports the case:", analysisItems(analysis.strongest_points)],
    ["What could break the case:", analysisItems(analysis.red_team)],
    ["Open checks:", analysisItems(analysis.open_questions)],
  ];
  const lines = [
    "## Final editor synthesis",
    "One final editor call reads only the finished audit bundle. Specialist review roles challenge the case, but Python remains the calculation layer.",
  ];
  if (judgment) {
    lines.push("", `Executive judgment: ${judgment}`);
  }
  sections.forEach(([label, items]) => {
    if (!items.length) return;
    lines.push("", label, ...items.slice(0, 4).map((item) => `- ${item}`));
  });
  return lines.join("\n");
}

function cleanReportMarkdown(markdown) {
  let text = String(markdown || "No report text was returned.");
  text = text.replace(
    /(?:^|\n)-?\s*Final LLM orchestrator:\s*```(?:json)?\s*([\s\S]*?)```/gi,
    (_match, body) => `\n${finalEditorMarkdownFromAnalysis(body)}`,
  );
  text = text.replace(
    /(?:^|\n)-?\s*Final LLM orchestrator:\s*(\{[\s\S]*?\})(?=\n\n##|\n##|$)/gi,
    (_match, body) => `\n${finalEditorMarkdownFromAnalysis(body)}`,
  );
  text = text.replace(/## Agent research desk/gi, "## Analyst desk");
  text = text.replace(
    /^Agent layer:.*$/gim,
    "How to read this: Python pulls the data and calculates the metrics. The analyst desk is a set of reproducible review roles that read audited outputs, challenge the case, and point to open checks.",
  );
  text = text.replace(
    /^-\s*([^:\n]+(?:Agent|Orchestrator))\s*\[([^\]]+)\]:\s*/gim,
    (_match, name, status) => `- ${agentFriendlyNameFromText(name)} (${humanizeToken(status)}): `,
  );
  return text;
}

function firstUsefulText(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

function summarizeGaps(metrics, limit = 4) {
  const list = safeList(metrics).map(humanizeMetric);
  if (!list.length) return "No required evidence gaps.";
  const visible = list.slice(0, limit).join(", ");
  const remaining = list.length - limit;
  return remaining > 0 ? `${visible}, +${remaining} more` : visible;
}

function auditTone(status, coverage) {
  const value = String(status || "").toLowerCase();
  if (value === "pass") return "good";
  if (value === "needs_attention") return "bad";
  if (value === "partial") return "warn";
  return coverageTone(coverage);
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

function ResearchStage({ stage, state }) {
  return (
    <div className={styles.researchStage} data-state={state}>
      <span aria-hidden="true" />
      <strong>{stage.label}</strong>
      <small>{stage.detail}</small>
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

function renderMarkdownMemo(markdown) {
  const lines = cleanReportMarkdown(markdown).split(/\r?\n/);
  return lines.map((line, index) => {
    const key = `${index}-${line.slice(0, 12)}`;
    const trimmed = line.trim();
    if (!trimmed) return <div className={styles.researchMemoBreak} key={key} />;
    if (/^```/.test(trimmed) || /^[{}\[\],]+$/.test(trimmed)) return null;
    if (/^"?(executive_judgment|strongest_points|red_team|open_questions|memo_patch)"?\s*:/.test(trimmed)) return null;
    if (line.startsWith("# ")) return <h3 key={key}>{line.replace(/^#\s+/, "")}</h3>;
    if (line.startsWith("## ")) return <h4 key={key}>{line.replace(/^##\s+/, "")}</h4>;
    if (line.startsWith("- ")) return <p className={styles.researchMemoBullet} key={key}>{line.replace(/^-\s+/, "")}</p>;
    return <p key={key}>{line}</p>;
  });
}

function renderMemo(research) {
  if (!research) {
    return <p className={styles.emptyCopy}>Run a ticker to generate a sourced memo, valuation, sources ledger, and audit file.</p>;
  }
  const coverage = research?.sources?.coverage || research?.audit?.coverage || {};
  const findings = safeList(research?.audit?.findings);
  const degraded = coverageTone(coverage) === "bad" || research?.audit?.status === "needs_attention";
  return (
    <div className={styles.researchMemoReader} data-state={degraded ? "degraded" : "ready"}>
      {degraded ? (
        <div className={styles.researchAttentionCallout}>
          <span>Needs source-backed statements</span>
          <strong>{summarizeGaps(coverage.missing_expected_metrics, 3)}</strong>
          <p>{findings[0]?.message || coverage.statement_authority || "The run completed, but the evidence ledger is not strong enough for a valuation memo."}</p>
        </div>
      ) : null}
      {renderMarkdownMemo(research.report_markdown)}
    </div>
  );
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
  const coverage = research?.sources?.coverage || research?.audit?.coverage || {};
  const missingMetrics = safeList(coverage.missing_expected_metrics);

  if (!research) {
    return <p className={styles.emptyCopy}>Every number will appear here with source id, provider, endpoint, and claim tag.</p>;
  }

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchCoverageSummary}>
        <div>
          <span>Coverage</span>
          <strong>{formatCoverageScore(coverage.score)}</strong>
          <small>
            {coverage.covered_expected_metrics ?? 0}/{coverage.expected_metrics ?? 0} required metrics covered
          </small>
        </div>
        <div>
          <span>Statement authority</span>
          <strong>{coverage.statement_source_provider || "-"}</strong>
          <small>{coverage.statement_authority || "No source authority assessment returned."}</small>
        </div>
        <div>
          <span>Gaps</span>
          <strong>{missingMetrics.length}</strong>
          <small>{summarizeGaps(missingMetrics, 3)}</small>
        </div>
      </div>

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

function renderAgents(research) {
  const agentPayload = research?.agents || research?.sources?.agent_outputs || {};
  const agents = safeList(agentPayload.agents);
  const finalOrchestrator = agentPayload.final_orchestrator || {};
  const finalAnalysis = finalAnalysisFrom(finalOrchestrator);
  const strongestPoints = analysisItems(finalAnalysis.strongest_points);
  const redTeam = analysisItems(finalAnalysis.red_team);
  const openQuestions = analysisItems(finalAnalysis.open_questions);
  const sourceRecords = safeList(research?.sources?.records);
  const sourceErrors = sourceRecords.filter((source) => source.status === "error");
  const coverage = research?.sources?.coverage || research?.audit?.coverage || {};
  const statementProvider = coverage.statement_source_provider || (safeList(research?.financials?.annual).length ? "fmp" : null);
  const auditStatus = research?.audit?.status || "pending";
  const valuationReady = Boolean(research?.valuation?.available);
  const finalCallText = finalOrchestrator.enabled
    ? `${finalOrchestrator.call_budget?.actual_calls || 0}/${finalOrchestrator.call_budget?.max_calls || 1} final editor call`
    : "Final editor skipped";
  const processTone = auditStatus === "pass" ? "good" : auditStatus === "needs_attention" ? "warn" : "neutral";
  const finalTone =
    finalOrchestrator.status === "ok"
      ? "good"
      : finalOrchestrator.enabled
        ? "warn"
        : "neutral";

  if (!research) {
    return <p className={styles.emptyCopy}>The review debate appears after a run, with each specialist check preserved for reproducibility.</p>;
  }

  if (!agents.length) {
    return <p className={styles.emptyCopy}>No analyst review trace was emitted for this bundle.</p>;
  }

  const processSteps = [
    {
      key: "sources",
      label: "Sources gathered",
      detail: sourceErrors.length ? `${sourceErrors.length} source issue${sourceErrors.length === 1 ? "" : "s"}` : `${sourceRecords.filter((source) => source.status === "ok").length} live sources`,
      state: sourceErrors.length && !statementProvider ? "bad" : sourceErrors.length ? "warn" : "done",
    },
    {
      key: "statements",
      label: "Statements normalized",
      detail: statementProvider ? `${statementProvider.toUpperCase()} statement spine` : "Waiting for source-backed statements",
      state: statementProvider ? "done" : "bad",
    },
    {
      key: "valuation",
      label: "Valuation calculated",
      detail: valuationReady ? "DCF, reverse DCF, multiples" : "Blocked by missing inputs",
      state: valuationReady ? "done" : "bad",
    },
    {
      key: "challenge",
      label: "Thesis challenged",
      detail: `${agents.length} specialist review roles`,
      state: "done",
    },
    {
      key: "audit",
      label: "Audit packaged",
      detail: `${formatCoverageScore(coverage.score)} coverage`,
      state: auditStatus === "pass" ? "done" : "warn",
    },
    {
      key: "editor",
      label: "Final editor",
      detail: finalCallText,
      state: finalOrchestrator.status === "ok" ? "done" : finalOrchestrator.enabled ? "warn" : "idle",
    },
  ];

  const judgment = firstUsefulText(
    finalAnalysis.executive_judgment,
    finalAnalysis.memo_patch,
    auditStatus === "pass"
      ? "The report is ready for review. The deterministic engine produced source-backed statements, valuation, audit, and downloadable artifacts."
      : "The report is reproducible, but the audit still has open issues that should be resolved before relying on the memo.",
  );

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchProcessHero} data-tone={processTone}>
        <div>
          <span>Review debate</span>
          <strong>{auditStatus === "pass" ? "The case was challenged against the ledger" : "The review found open evidence gaps"}</strong>
          <p>These review roles do not invent numbers. They read the finished audited bundle, challenge the case, and surface what still needs proof.</p>
        </div>
        <div>
          <span>{formatCoverageScore(coverage.score)}</span>
          <small>{agents.length} review roles</small>
        </div>
      </div>

      <div className={styles.researchProcessRail}>
        {processSteps.map((step, index) => (
          <div className={styles.researchProcessStep} data-state={step.state} key={step.key}>
            <span>{index + 1}</span>
            <strong>{step.label}</strong>
            <small>{step.detail}</small>
          </div>
        ))}
      </div>

      <article className={styles.researchOrchestratorCard} data-tone={finalTone}>
        <div className={styles.researchAgentCardTop}>
          <div>
            <span>Final synthesis</span>
            <strong>{finalOrchestrator.status === "ok" ? "One synthesis call complete" : "Deterministic desk only"}</strong>
          </div>
          <small>{humanizeToken(finalOrchestrator.status || "deterministic")}</small>
        </div>
        {finalOrchestrator.status === "ok" ? (
          <>
            <p>{judgment}</p>
            <div className={styles.researchOrchestratorColumns}>
              <div>
                <span>What supports it</span>
                {strongestPoints.slice(0, 3).map((item, index) => (
                  <p key={`strong-${index}`}>{item}</p>
                ))}
              </div>
              <div>
                <span>What could break</span>
                {redTeam.slice(0, 3).map((item, index) => (
                  <p key={`red-team-${index}`}>{item}</p>
                ))}
              </div>
              <div>
                <span>Next checks</span>
                {openQuestions.slice(0, 3).map((item, index) => (
                  <p key={`open-${index}`}>{item}</p>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p>
            {finalOrchestrator.enabled
              ? finalOrchestrator.error || "The one-call final orchestrator was enabled but did not return a synthesis."
              : "No final editor synthesis was added. The deterministic analyst desk still ran from audited outputs."}
          </p>
        )}
      </article>

      <details className={styles.researchTechnicalTrace}>
        <summary>Show reproducibility details</summary>
        <div className={styles.researchTraceGrid}>
          <div>
            <span>Agent layer</span>
            <strong>{agentPayload.version || "v1"}</strong>
            <small>{humanizeToken(agentPayload.mode)}</small>
          </div>
          <div>
            <span>Calculation rule</span>
            <strong>Python only</strong>
            <small>{agentPayload.execution?.specialist_llm_calls ?? 0} specialist LLM calls</small>
          </div>
          <div>
            <span>Final editor</span>
            <strong>{finalOrchestrator.model || "Disabled"}</strong>
            <small>{finalCallText}</small>
          </div>
        </div>
        <div className={styles.researchAgentList}>
          {agents.map((agent) => {
            const questions = safeList(agent.open_questions);
            return (
              <div className={styles.researchAgentRow} data-tone={statusTone(agent.status)} key={agent.id}>
                <span>{humanizeToken(agent.status)}</span>
                <div>
                  <strong>{agentDisplayName(agent)}</strong>
                  <p>{agent.summary}</p>
                  {questions.length ? <small>{questions.slice(0, 2).join(" / ")}</small> : null}
                </div>
              </div>
            );
          })}
        </div>
      </details>
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
  const coverage = research?.audit?.coverage || research?.sources?.coverage || {};
  const sourceGaps = safeList(coverage.sourced_points_missing_ok_source);
  const formulaGaps = safeList(coverage.calculated_points_missing_formula);

  if (!research) {
    return <p className={styles.emptyCopy}>The audit will flag missing sources, provider errors, weak valuation inputs, and accounting quality issues.</p>;
  }

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchAuditBar}>
        <div>
          <span>Coverage score</span>
          <strong>{formatCoverageScore(coverage.score)}</strong>
        </div>
        <div>
          <span>Source-backed</span>
          <strong>{coverage.source_backed_points ?? 0}</strong>
        </div>
        <div>
          <span>Formula gaps</span>
          <strong>{formulaGaps.length}</strong>
        </div>
        <div>
          <span>Source gaps</span>
          <strong>{sourceGaps.length}</strong>
        </div>
      </div>

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
  const [statusMessage, setStatusMessage] = useState("");
  const [runProgress, setRunProgress] = useState(0);
  const [runSummary, setRunSummary] = useState("");

  async function runResearch(nextTicker = ticker) {
    const symbol = cleanTicker(nextTicker);
    if (!workspaceId || !symbol) return;
    setTicker(symbol);
    setPending(true);
    setError("");
    setRunSummary("");
    setRunProgress(6);
    setStatusMessage("Starting research job...");
    const startedAt = performance.now();
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/research/${encodeURIComponent(symbol)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ mode }),
      });
      const startPayload = await parseResponse(response);
      if (!startPayload.run_id) {
        if (startPayload.status === "failed" || startPayload.ok === false) {
          throw new Error(startPayload.error || "Research job failed to start.");
        }
        setResearch(startPayload);
        setActiveTab("Memo");
        setRunProgress(100);
        setRunSummary("Completed from synchronous backend response.");
        setStatusMessage("");
        return;
      }

      setRunProgress(18);
      for (let attempt = 0; attempt < 90; attempt += 1) {
        setRunProgress(Math.min(92, 18 + (attempt + 1) * 3));
        setStatusMessage(`Research job ${startPayload.status || "running"}...`);
        await sleep(2000);
        const pollResponse = await fetch(
          `/api/v1/workspaces/${workspaceId}/research/${encodeURIComponent(symbol)}?runId=${encodeURIComponent(startPayload.run_id)}`,
          { cache: "no-store" },
        );
        const pollPayload = await parseResponse(pollResponse);
        if (pollPayload.status === "running" || pollPayload.status === "queued") {
          continue;
        }
        if (pollPayload.status === "failed" || pollPayload.ok === false) {
          throw new Error(pollPayload.error || "Research job failed.");
        }
        setResearch(pollPayload);
        setActiveTab("Memo");
        setRunProgress(100);
        setRunSummary(`Completed in ${Math.max(1, Math.round((performance.now() - startedAt) / 1000))}s.`);
        setStatusMessage("");
        return;
      }
      throw new Error("Research job is still running. Try again in a moment.");
    } catch (requestError) {
      setResearch(null);
      setError(String(requestError?.message || requestError || "Research run failed."));
      setRunProgress(100);
      setRunSummary("Run stopped before a verified bundle was returned.");
    } finally {
      setPending(false);
      setStatusMessage("");
    }
  }

  const ratios = research?.financials?.ratios || {};
  const evidenceCount = safeList(research?.sources?.data_points).length;
  const auditFindings = safeList(research?.audit?.findings);
  const agentCount = safeList(research?.agents?.agents || research?.sources?.agent_outputs?.agents).length;
  const baseScenario = safeList(research?.valuation?.scenarios).find((scenario) => scenario.name === "base");
  const downloads = safeList(research?.downloads);
  const sourceRecords = safeList(research?.sources?.records);
  const annualRows = safeList(research?.financials?.annual);
  const deltaChanges = safeList(research?.history?.delta?.changes);
  const storedRunCount = Number(research?.history?.run_count || 0);
  const hasXlsx = downloads.some((artifact) => String(artifact.filename || "").endsWith(".xlsx"));
  const progressWidth = `${Math.max(0, Math.min(100, runProgress))}%`;
  const activeSource = sourceRecords.find((source) => source.status === "ok") || sourceRecords[0];
  const coverage = research?.sources?.coverage || research?.audit?.coverage || {};
  const hasStatementRows = annualRows.length > 0 && Number.isFinite(Number(ratios.latest_revenue));
  const statementProvider = hasStatementRows ? coverage.statement_source_provider || "fmp" : null;
  const sourceSpineLabel = statementProvider || (activeSource?.provider ? `${activeSource.provider} profile only` : "No source yet");
  const coverageWidth = `${Math.max(0, Math.min(100, Number(coverage.score) || 0))}%`;
  const missingRequiredMetrics = safeList(coverage.missing_expected_metrics);
  const coverageDetail =
    coverage.expected_metrics
      ? `${coverage.covered_expected_metrics}/${coverage.expected_metrics} required metrics`
      : `${evidenceCount} ledger points`;
  const finalOrchestrator = research?.agents?.final_orchestrator || research?.sources?.agent_outputs?.final_orchestrator || {};
  const finalAnalysis = finalAnalysisFrom(finalOrchestrator);
  const executiveJudgment = firstUsefulText(finalAnalysis.executive_judgment, finalAnalysis.memo_patch);
  const researchStateLabel = !research
    ? "Waiting for run"
    : research?.audit?.status === "pass"
      ? "Ready for review"
      : research?.audit?.status === "needs_attention"
        ? "Evidence gaps open"
        : "Partially reviewed";
  const openIssueLabel = missingRequiredMetrics.length
    ? summarizeGaps(missingRequiredMetrics, 3)
    : auditFindings[0]?.code || "No required gaps";
  const openIssueDetail = missingRequiredMetrics.length
    ? "These required metrics still need source-backed support."
    : auditFindings[0]?.message || coverage.statement_authority || "Required metrics are covered for the current run.";

  function stageState(stage, index) {
    const next = AGENT_STAGES[index + 1];
    if (error) return runProgress >= stage.threshold ? "bad" : "idle";
    if (research && !pending) return "done";
    if (!pending) return index === 0 ? "ready" : "idle";
    if (runProgress >= stage.threshold && (!next || runProgress < next.threshold)) return "running";
    if (runProgress > stage.threshold) return "done";
    return "idle";
  }

  return (
    <section className={`${styles.panel} ${styles.researchPanel}`}>
      <div className={styles.researchCommandSurface}>
        <div className={styles.researchIdentity}>
          <p className={styles.kicker}>Research desk</p>
          <h2>{research?.ticker || ticker || "Ticker"} research desk</h2>
          <p className={styles.supportText}>
            Run one company through statements, valuation, review debate, and audit. This should answer what the case is, what it is worth, and what is still unresolved.
          </p>
          <div className={styles.researchStatusLine}>
            <span data-tone={pending ? "warn" : research ? "good" : "neutral"}>{pending ? "Running" : research ? "Ready" : "Ready to run"}</span>
            <span>{mode === "full" ? "Full desk" : "Quick read"}</span>
            <span>{storedRunCount ? `${storedRunCount} stored runs` : "No stored run yet"}</span>
          </div>
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
              {pending ? "Running..." : "Run analysis"}
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
                title={option === "full" ? "Run the complete analyst bundle" : "Run a fast memo and valuation pass"}
              >
                {option === "full" ? "Full desk" : "Quick read"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.researchStageRail} aria-label="Research run pipeline">
        {AGENT_STAGES.map((stage, index) => (
          <ResearchStage key={stage.key} stage={stage} state={stageState(stage, index)} />
        ))}
      </div>

      {(pending || research || error || runSummary) ? (
        <div className={styles.researchProgressShell}>
          <div className={styles.researchProgressTrack} aria-hidden="true">
            <span style={{ width: progressWidth }} />
          </div>
          <p>{statusMessage || runSummary || (research ? `Generated ${formatDateTime(research.generated_at)}` : "Waiting for a run.")}</p>
        </div>
      ) : null}

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
          label="Business"
          tone={research ? "good" : "neutral"}
          value={research?.company_profile?.name || "No run yet"}
        />
        <ResearchMetric
          detail="Latest annual statement row."
          label="Latest revenue"
          value={compactCurrency(ratios.latest_revenue)}
        />
        <ResearchMetric
          detail="Base case deterministic DCF."
          label="Base value/share"
          tone={baseScenario ? "warn" : "neutral"}
          value={compactCurrency(baseScenario?.intrinsic_value_per_share)}
        />
        <ResearchMetric
          detail={`${coverageDetail}, ${auditFindings.length} audit finding${auditFindings.length === 1 ? "" : "s"}.`}
          label="Audit state"
          tone={auditTone(research?.audit?.status, coverage)}
          value={research ? humanizeToken(research?.audit?.status) : "Waiting"}
        />
      </div>

      {research ? (
        <div className={styles.researchCoverageRail} data-tone={coverageTone(coverage)}>
          <div>
            <span>Evidence coverage</span>
            <strong>{formatCoverageScore(coverage.score)}</strong>
          </div>
          <div className={styles.researchCoverageTrack} aria-hidden="true">
            <span style={{ width: coverageWidth }} />
          </div>
          <p>{missingRequiredMetrics.length ? `Open gaps: ${summarizeGaps(missingRequiredMetrics, 4)}` : coverage.statement_authority || "Ledger coverage is complete for required metrics."}</p>
        </div>
      ) : null}

      {research ? (
        <div className={styles.researchCoverageSummary}>
          <div>
            <span>Current answer</span>
            <strong>{researchStateLabel}</strong>
            <small>{executiveJudgment || "The run is assembling the memo, valuation, and audit bundle."}</small>
          </div>
          <div>
            <span>Best supported value</span>
            <strong>{compactCurrency(baseScenario?.intrinsic_value_per_share)}</strong>
            <small>
              {research?.valuation?.available
                ? `Reverse DCF implied growth ${formatPct(research?.valuation?.reverse_dcf?.implied_revenue_cagr)}.`
                : research?.valuation?.reason || "Valuation is waiting on missing inputs."}
            </small>
          </div>
          <div>
            <span>What still needs work</span>
            <strong>{openIssueLabel}</strong>
            <small>{openIssueDetail}</small>
          </div>
        </div>
      ) : null}

      <div className={styles.researchSignalGrid}>
        <div>
          <span>Coverage</span>
          <strong>{research ? formatCoverageScore(coverage.score) : "Waiting"}</strong>
        </div>
        <div>
          <span>Statement source</span>
          <strong>{sourceSpineLabel}</strong>
        </div>
        <div>
          <span>Prior changes</span>
          <strong>{deltaChanges.length ? `${deltaChanges.length} changes` : "No prior change"}</strong>
        </div>
        <div>
          <span>Downloads</span>
          <strong>{hasXlsx ? "Model ready" : "Not emitted"}</strong>
        </div>
      </div>

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
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`equity-research-tabpanel-${tab.toLowerCase()}`}
            id={`equity-research-tab-${tab.toLowerCase()}`}
            data-active={activeTab === tab}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            <span>{tab}</span>
            {tab === "Debate" && agentCount ? <small>{agentCount}</small> : null}
            {tab === "Sources" && evidenceCount ? <small>{evidenceCount}</small> : null}
            {tab === "Audit" && auditFindings.length ? <small>{auditFindings.length}</small> : null}
            {tab === "Changes" && deltaChanges.length ? <small>{deltaChanges.length}</small> : null}
          </button>
        ))}
      </div>

      <div className={styles.researchOutputShell}>
        <aside className={styles.researchEvidenceSpine}>
          <span>Run receipt</span>
          <strong>{research?.ticker || cleanTicker(ticker) || "No ticker"}</strong>
          <p>{research ? `${coverageDetail}; ${evidenceCount} ledger entries are kept for reproducibility.` : "Run a ticker to assemble a reproducible research pack."}</p>
          <dl>
            <div>
              <dt>Statements</dt>
              <dd>{statementProvider ? statementProvider.toUpperCase() : "-"}</dd>
            </div>
            <div>
              <dt>Filings</dt>
              <dd>{coverage.sec_metadata_available ? "SEC metadata" : "-"}</dd>
            </div>
            <div>
              <dt>Artifacts</dt>
              <dd>{hasXlsx ? "model + ledgers" : downloads.length ? "ledgers" : "-"}</dd>
            </div>
          </dl>
        </aside>
        <div
          className={styles.researchOutput}
          role="tabpanel"
          aria-labelledby={`equity-research-tab-${activeTab.toLowerCase()}`}
          id={`equity-research-tabpanel-${activeTab.toLowerCase()}`}
        >
          {activeTab === "Memo" ? renderMemo(research) : null}
          {activeTab === "Value" ? renderValuation(research) : null}
          {activeTab === "Debate" ? renderAgents(research) : null}
          {activeTab === "Changes" ? renderDelta(research) : null}
          {activeTab === "Sources" ? renderEvidence(research) : null}
          {activeTab === "Audit" ? renderAudit(research) : null}
        </div>
      </div>
    </section>
  );
}
