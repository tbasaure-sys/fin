"use client";

import { useMemo, useState } from "react";

import { formatDateTime, formatPct, safeList, statusTone } from "@/components/workspace/formatters";
import { parseResponse } from "@/components/workspace/live-data";
import styles from "@/components/workspace/shell.module.css";
import { buildEquityValuationPresentation } from "@/lib/equity-valuation-presentation";

const RESEARCH_TABS = ["Memo", "Valor", "Debate", "Cambios", "Fuentes", "Auditoría"];
const TRUSTED_VALUATION_DELTA_KEYS = new Set(["valuation_low", "valuation_central", "valuation_high", "implied_growth"]);
const AGENT_STAGES = [
  { key: "intake", label: "Obtener", detail: "Fuentes", threshold: 0 },
  { key: "normalize", label: "Limpiar", detail: "Estados", threshold: 18 },
  { key: "valuation", label: "Valorar", detail: "DCF / inverso", threshold: 40 },
  { key: "red_team", label: "Cuestionar", detail: "Riesgos", threshold: 62 },
  { key: "audit", label: "Verificar", detail: "Registro", threshold: 82 },
];

function isRateLimitMessage(value) {
  return /429|rate[\s_-]*limit|too many requests|too many api request|límite|limitado/i.test(String(value || ""));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return await parseResponse(response);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function cleanTicker(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 16);
}

function compactCurrency(value, currency = "USD") {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  const currencyCode = /^[A-Z]{3}$/.test(String(currency || "").toUpperCase()) ? String(currency).toUpperCase() : "USD";
  const format = (nextValue) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: Math.abs(nextValue) >= 1000 ? 0 : 2,
  }).format(nextValue);
  if (Math.abs(number) >= 1_000_000_000) return `${format(number / 1_000_000_000)}B`;
  if (Math.abs(number) >= 1_000_000) return `${format(number / 1_000_000)}M`;
  return format(number);
}

function formatValuationRange(presentation) {
  if (!presentation?.showValuationFigures || !presentation.range) return "En revisión";
  return `${compactCurrency(presentation.range.low, presentation.currency)} – ${compactCurrency(presentation.range.high, presentation.currency)}`;
}

function formatMarketDate(value) {
  if (!value) return "Fecha pendiente";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha pendiente";
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function valuationStateLabel(presentation) {
  if (presentation?.state === "decision_ready") return "Lista para decisión";
  if (presentation?.state === "research_grade") return "Útil para investigar, con cautela";
  return "Valoración en revisión";
}

function formatCoverageScore(score) {
  const number = Number(score);
  if (!Number.isFinite(number)) return "-";
  return `${Math.round(number)}%`;
}

function buildClientUnavailableResearch(ticker, mode, reason) {
  const generatedAt = new Date().toISOString();
  const message = String(reason?.name === "AbortError"
    ? "El análisis directo tardó demasiado. Intenta de nuevo en un momento."
    : reason?.message || reason || "El análisis no respondió a tiempo.");
  return {
    ok: true,
    ticker,
    mode,
    generated_at: generatedAt,
    company_profile: { name: ticker, industry: "Sin fuente todavía" },
    financials: {
      annual: [],
      ratios: {},
      quality_flags: [],
    },
    valuation: {
      available: false,
      reason: message,
      scenarios: [],
      reverse_dcf: { available: false, reason: message },
      multiples: {},
    },
    report_markdown: [
      `# ${ticker}`,
      "",
      "## Estado",
      "El análisis no pudo completar la lectura con fuentes en esta sesión.",
      "",
      "## Qué falta",
      message,
      "",
      "No se generaron estados financieros, valoración ni tesis nuevas.",
    ].join("\n"),
    sources: {
      coverage: { score: 0, status: "needs_attention" },
      records: [{ source_id: "workspace:research-timeout", provider: "workspace", status: "error", error: message, retrieved_at: generatedAt }],
      data_points: [],
    },
    audit: {
      generated_at: generatedAt,
      status: "needs_attention",
      findings: [{ severity: "high", code: "research_timeout", message }],
    },
    downloads: [],
    artifacts: {
      report_md: true,
      model_xlsx: false,
      sources_json: false,
      audit_json: true,
    },
  };
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
    latest_revenue: "ingresos",
    latest_diluted_shares: "acciones diluidas",
    latest_free_cash_flow: "flujo libre de caja",
    revenue_cagr_5y: "CAGR ingresos 5a",
    gross_margin: "margen bruto",
    operating_margin: "margen operativo",
    fcf_margin: "margen FCF",
    base_intrinsic_value_per_share: "valor base/acción",
    reverse_dcf_implied_revenue_cagr: "crecimiento DCF inverso",
    latest_sec_filing: "último filing SEC",
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
  orchestrator: "Coordinador",
  orchestrator_agent: "Coordinador",
  company_profile_agent: "Perfil de negocio",
  financial_quality_agent: "Calidad financiera",
  valuation_agent: "Valoración",
  risk_agent: "Riesgos",
  catalyst_agent: "Archivos y catalizadores",
  red_team_agent: "Cuestionamiento",
  editor_auditor_agent: "Edición y auditoría",
};

function agentDisplayName(agent) {
  const fallback = firstUsefulText(agent?.name, "Revisión analítica").replace(/\s+Agent$/i, " revisión");
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
    ["Qué lo sustenta:", analysisItems(analysis.strongest_points)],
    ["Qué podría fallar:", analysisItems(analysis.red_team)],
    ["Pendientes:", analysisItems(analysis.open_questions)],
  ];
  const lines = [
    "## Síntesis final",
    "Una llamada final de edición lee solo el paquete de auditoría terminado. Los roles de revisión cuestionan el caso, pero Python sigue siendo la capa de cálculo.",
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
  let text = String(markdown || "No se generó texto de reporte.");
  text = text.replace(/^#\s+(.+?)\s+research OS memo\s*$/gim, "# $1");
  text = text.replace(
    /(?:^|\n)-?\s*Final LLM orchestrator:\s*```(?:json)?\s*([\s\S]*?)```/gi,
    (_match, body) => `\n${finalEditorMarkdownFromAnalysis(body)}`,
  );
  text = text.replace(
    /(?:^|\n)-?\s*Final LLM orchestrator:\s*(\{[\s\S]*?\})(?=\n\n##|\n##|$)/gi,
    (_match, body) => `\n${finalEditorMarkdownFromAnalysis(body)}`,
  );
  text = text.replace(/## Agent research desk/gi, "## Escritorio de análisis");
  text = text.replace(
    /^Agent layer:.*$/gim,
    "Cómo leerlo: Python extrae los datos y calcula las métricas. El escritorio de análisis es un conjunto de roles reproducibles que leen los resultados auditados, cuestionan el caso y señalan los pendientes.",
  );
  text = text.replace(
    /^-\s*([^:\n]+(?:Agent|Orchestrator))\s*\[([^\]]+)\]:\s*/gim,
    (_match, name, status) => `- ${agentFriendlyNameFromText(name)} (${humanizeToken(status)}): `,
  );
  text = text
    .split(/\r?\n/)
    .filter((line) => !/one-call final editor|returned error|too many requests|client error|api\.openai|sources\.json|provider endpoints|row counts|coverage gaps/i.test(line))
    .join("\n");
  text = text
    .replace(/^Company:\s*/gim, "Compañía: ")
    .replace(/\bFinancial quality review\b/gi, "Revisión financiera")
    .replace(/\bLatest FCF margin\b/gi, "Margen FCF reciente")
    .replace(/\baccounting flags were triggered\b/gi, "alertas contables activas");
  return text;
}

function firstUsefulText(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

function summarizeGaps(metrics, limit = 4) {
  const list = safeList(metrics).map(humanizeMetric);
  if (!list.length) return "Sin brechas de evidencia requeridas.";
  const visible = list.slice(0, limit).join(", ");
  const remaining = list.length - limit;
  return remaining > 0 ? `${visible}, +${remaining} more` : visible;
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
  if (!filename) return "Descargar";
  if (filename.endsWith(".xlsx")) return "Modelo";
  if (filename.endsWith("_report.md")) return "Memo";
  if (filename.endsWith("_sources.json")) return "Fuentes";
  if (filename.endsWith("_audit.json")) return "Auditoría";
  if (filename.endsWith("_assumptions.yml")) return "Supuestos";
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

function renderMemo(research, valuationPresentation) {
  if (!research) {
    return <p className={styles.emptyCopy}>Ingresa un ticker y haz clic en Analizar para generar el memo, valoración y auditoría.</p>;
  }
  if (!valuationPresentation?.backed) {
    return (
      <div className={styles.researchAttentionCallout}>
        <span>Memo en revisión</span>
        <strong>La narrativa queda pausada hasta validar la valoración</strong>
        <p>{valuationPresentation?.reason || "Faltan controles de datos o método."}</p>
      </div>
    );
  }
  const coverage = research?.sources?.coverage || research?.audit?.coverage || {};
  const findings = safeList(research?.audit?.findings);
  const degraded = coverageTone(coverage) === "bad" || research?.audit?.status === "needs_attention";
  return (
    <div className={styles.researchMemoReader} data-state={degraded ? "degraded" : "ready"}>
      {degraded ? (
        <div className={styles.researchAttentionCallout}>
          <span>Faltan estados con fuente</span>
          <strong>{summarizeGaps(coverage.missing_expected_metrics, 3)}</strong>
          <p>{findings[0]?.message || coverage.statement_authority || "El análisis se completó, pero el registro de evidencia no es suficiente para un memo de valoración."}</p>
        </div>
      ) : null}
      {renderMarkdownMemo(research.report_markdown)}
    </div>
  );
}

function renderValuation(research, valuationPresentation) {
  if (!research) {
    return <p className={styles.emptyCopy}>La valoración aparece después de analizar un ticker.</p>;
  }

  if (!valuationPresentation?.showValuationFigures) {
    return (
      <div className={styles.researchAttentionCallout}>
        <span>Valoración en revisión</span>
        <strong>No mostramos una cifra hasta validar datos y método</strong>
        <p>{valuationPresentation?.reason || "La valoración todavía no supera los controles necesarios."}</p>
      </div>
    );
  }

  const rangeRows = [
    { key: "low", label: "Rango bajo", value: valuationPresentation.range.low, tone: "bad" },
    ...(valuationPresentation.centralValue !== null
      ? [{ key: "central", label: "Estimación central", value: valuationPresentation.centralValue, tone: "warn" }]
      : []),
    { key: "high", label: "Rango alto", value: valuationPresentation.range.high, tone: "good" },
  ];

  return (
    <div className={styles.researchStack}>
      {valuationPresentation.state === "research_grade" ? (
        <div className={styles.researchAttentionCallout}>
          <span>Rango para investigación</span>
          <strong>Úsalo con cautela; todavía no es una cifra respaldada para decidir</strong>
          <p>{valuationPresentation.reason}</p>
        </div>
      ) : null}
      <div className={styles.researchScenarioGrid} data-count={rangeRows.length}>
        {rangeRows.map((row) => (
          <article className={styles.researchScenario} data-tone={row.tone} key={row.key}>
            <span>{row.label}</span>
            <strong>{compactCurrency(row.value, valuationPresentation.currency)}</strong>
            <small>{valuationPresentation.currency} por acción</small>
          </article>
        ))}
      </div>

      <div className={styles.researchDetailGrid}>
        <ResearchMetric
          detail={valuationPresentation.backed ? "Método principal después de contrastar referencias." : "Método principal sujeto a revisión adicional."}
          label="Método principal"
          tone={valuationPresentation.backed ? "good" : "warn"}
          value={valuationPresentation.primaryMethod}
        />
        <ResearchMetric
          detail={valuationPresentation.backed ? "Superó los controles para una lectura de decisión." : "Adecuada solo para seguir investigando."}
          label="Confianza de la valoración"
          tone={valuationPresentation.backed ? "good" : "warn"}
          value={formatPct(valuationPresentation.confidence, 0)}
        />
        <ResearchMetric
          detail={valuationPresentation.priceSource || `Precio ${valuationPresentation.priceValidationStatus}.`}
          label="Datos de mercado"
          tone={valuationPresentation.currentPrice === null ? "warn" : "good"}
          value={formatMarketDate(valuationPresentation.marketDataAsOf)}
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
    return <p className={styles.emptyCopy}>Cada número aparece aquí con fuente, proveedor, endpoint y etiqueta.</p>;
  }

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchCoverageSummary}>
        <div>
          <span>Cobertura</span>
          <strong>{formatCoverageScore(coverage.score)}</strong>
          <small>
            {coverage.covered_expected_metrics ?? 0}/{coverage.expected_metrics ?? 0} métricas requeridas cubiertas
          </small>
        </div>
        <div>
          <span>Autoridad de estados</span>
          <strong>{coverage.statement_source_provider || "-"}</strong>
          <small>{coverage.statement_authority || "Sin evaluación de autoridad de fuente."}</small>
        </div>
        <div>
          <span>Brechas</span>
          <strong>{missingMetrics.length}</strong>
          <small>{summarizeGaps(missingMetrics, 3)}</small>
        </div>
      </div>

      <div className={styles.researchTable}>
        <div className={styles.researchTableHeader}>
          <span>Fuente</span>
          <span>Proveedor</span>
          <span>Estado</span>
          <span>Filas</span>
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
          <span>Métrica</span>
          <span>Etiqueta</span>
          <span>Fuente</span>
          <span>Valor</span>
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

function renderAgents(research, valuationPresentation) {
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
    ? `${finalOrchestrator.call_budget?.actual_calls || 0}/${finalOrchestrator.call_budget?.max_calls || 1} llamada al editor final`
    : "Editor final omitido";
  const processTone = auditStatus === "pass" ? "good" : auditStatus === "needs_attention" ? "warn" : "neutral";
  const finalTone =
    finalOrchestrator.status === "ok"
      ? "good"
      : finalOrchestrator.enabled
        ? "warn"
        : "neutral";

  if (!research) {
    return <p className={styles.emptyCopy}>El debate aparece después del análisis, con cada verificación preservada para reproducibilidad.</p>;
  }

  if (!valuationPresentation?.backed) {
    return (
      <div className={styles.researchAttentionCallout}>
        <span>Revisión narrativa pausada</span>
        <strong>No usamos una síntesis externa para defender una valoración en revisión</strong>
        <p>{valuationPresentation?.reason || "La valoración todavía no está lista para una conclusión."}</p>
      </div>
    );
  }

  if (!agents.length) {
    return <p className={styles.emptyCopy}>No se emitió traza de revisión para este paquete.</p>;
  }

  const processSteps = [
    {
      key: "sources",
      label: "Fuentes recopiladas",
      detail: sourceErrors.length ? `${sourceErrors.length} problema${sourceErrors.length === 1 ? "" : "s"} de fuente` : `${sourceRecords.filter((source) => source.status === "ok").length} fuentes activas`,
      state: sourceErrors.length && !statementProvider ? "bad" : sourceErrors.length ? "warn" : "done",
    },
    {
      key: "statements",
      label: "Estados normalizados",
      detail: statementProvider ? `${statementProvider.toUpperCase()} como base` : "Esperando estados con respaldo de fuente",
      state: statementProvider ? "done" : "bad",
    },
    {
      key: "valuation",
      label: "Valoración calculada",
      detail: valuationReady ? "DCF, DCF inverso, múltiplos" : "Bloqueado por datos faltantes",
      state: valuationReady ? "done" : "bad",
    },
    {
      key: "challenge",
      label: "Tesis cuestionada",
      detail: `${agents.length} roles de revisión especializados`,
      state: "done",
    },
    {
      key: "audit",
      label: "Auditoría empaquetada",
      detail: `${formatCoverageScore(coverage.score)} cobertura`,
      state: auditStatus === "pass" ? "done" : "warn",
    },
    {
      key: "editor",
      label: "Editor final",
      detail: finalCallText,
      state: finalOrchestrator.status === "ok" ? "done" : finalOrchestrator.enabled ? "warn" : "idle",
    },
  ];

  const judgment = firstUsefulText(
    finalAnalysis.executive_judgment,
    finalAnalysis.memo_patch,
    auditStatus === "pass"
      ? "El reporte está listo. El motor determinístico generó estados con respaldo, valoración, auditoría y archivos descargables."
      : "El reporte es reproducible, pero la auditoría tiene pendientes que deben resolverse antes de confiar en el memo.",
  );

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchProcessHero} data-tone={processTone}>
        <div>
          <span>Debate de revisión</span>
          <strong>{auditStatus === "pass" ? "El caso fue cuestionado contra el registro" : "La revisión encontró brechas de evidencia abiertas"}</strong>
          <p>Estos roles no inventan números. Leen el paquete auditado terminado, cuestionan el caso y señalan lo que aún necesita evidencia.</p>
        </div>
        <div>
          <span>{formatCoverageScore(coverage.score)}</span>
          <small>{agents.length} roles de revisión</small>
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
            <span>Síntesis final</span>
            <strong>{finalOrchestrator.status === "ok" ? "Llamada de síntesis completada" : "Solo escritorio determinístico"}</strong>
          </div>
          <small>{humanizeToken(finalOrchestrator.status || "determinístico")}</small>
        </div>
        {finalOrchestrator.status === "ok" ? (
          <>
            <p>{judgment}</p>
            <div className={styles.researchOrchestratorColumns}>
              <div>
                <span>Qué lo sustenta</span>
                {strongestPoints.slice(0, 3).map((item, index) => (
                  <p key={`strong-${index}`}>{item}</p>
                ))}
              </div>
              <div>
                <span>Qué podría fallar</span>
                {redTeam.slice(0, 3).map((item, index) => (
                  <p key={`red-team-${index}`}>{item}</p>
                ))}
              </div>
              <div>
                <span>Pendientes</span>
                {openQuestions.slice(0, 3).map((item, index) => (
                  <p key={`open-${index}`}>{item}</p>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p>
            {finalOrchestrator.enabled
              ? finalOrchestrator.error || "El orquestador final fue activado pero no devolvió una síntesis."
              : "No se añadió síntesis de editor final. El escritorio determinístico ejecutó a partir de los resultados auditados."}
          </p>
        )}
      </article>

      <details className={styles.researchTechnicalTrace}>
        <summary>Ver detalles de reproducibilidad</summary>
        <div className={styles.researchTraceGrid}>
          <div>
            <span>Capa de agentes</span>
            <strong>{agentPayload.version || "v1"}</strong>
            <small>{humanizeToken(agentPayload.mode)}</small>
          </div>
          <div>
            <span>Regla de cálculo</span>
            <strong>Solo Python</strong>
            <small>{agentPayload.execution?.specialist_llm_calls ?? 0} llamadas LLM especializadas</small>
          </div>
          <div>
            <span>Editor final</span>
            <strong>{finalOrchestrator.model || "Desactivado"}</strong>
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
  if (value === null || value === undefined || value === "") return "-";
  if (!Number.isFinite(Number(value))) return "-";
  if (unit === "percent") return formatPct(value);
  if (unit === "currency") return compactCurrency(value);
  return Number(value).toFixed(2);
}

function isValuationDelta(change) {
  const key = String(change?.key || "").toLowerCase();
  const label = String(change?.label || "").toLowerCase();
  return TRUSTED_VALUATION_DELTA_KEYS.has(key)
    || /valuation|intrinsic|fair.?value|price.?target|base.?value|implied.?growth|upside|downside/.test(`${key} ${label}`);
}

function renderDelta(research, valuationPresentation) {
  const delta = research?.history?.delta || {};
  const comparableValuation = Boolean(
    valuationPresentation?.backed
    && delta.valuation?.comparable === true
    && delta.valuation?.current?.backed === true
    && delta.valuation?.previous?.backed === true,
  );
  const changes = safeList(delta.changes).filter((change) => {
    if (!isValuationDelta(change)) return true;
    return comparableValuation && TRUSTED_VALUATION_DELTA_KEYS.has(String(change?.key || "").toLowerCase());
  });

  if (!research) {
    return <p className={styles.emptyCopy}>Tras el segundo análisis de un ticker, esta pestaña mostrará los cambios respecto al reporte anterior.</p>;
  }

  if (!delta.available) {
    return <p className={styles.emptyCopy}>{delta.reason || "Aún no hay análisis previo almacenado."}</p>;
  }

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchDetailGrid}>
        <ResearchMetric
          detail={delta.previous_run_at ? `Análisis anterior ${formatDateTime(delta.previous_run_at)}` : "Marca de tiempo del análisis anterior no disponible."}
          label="Análisis guardados"
          tone="good"
          value={String(research.history?.run_count || 1)}
        />
        <ResearchMetric
          detail={delta.period_changed ? `${delta.previous_period} → ${delta.current_period}` : "El período fiscal más reciente no ha cambiado."}
          label="Período"
          tone={delta.period_changed ? "warn" : "neutral"}
          value={delta.current_period || "-"}
        />
        <ResearchMetric
          detail={delta.audit_changed ? `Era ${delta.previous_audit_status}` : "El estado de auditoría no ha cambiado."}
          label="Cambio en auditoría"
          tone={delta.audit_changed ? "warn" : "good"}
          value={delta.current_audit_status || "-"}
        />
      </div>

      <div className={styles.researchTable}>
        <div className={styles.researchTableHeader}>
          <span>Métrica</span>
          <span>Actual</span>
          <span>Anterior</span>
          <span>Cambio</span>
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
    return <p className={styles.emptyCopy}>La auditoría señalará fuentes faltantes, errores de proveedor, datos de valoración débiles y problemas de calidad contable.</p>;
  }

  return (
    <div className={styles.researchStack}>
      <div className={styles.researchAuditBar}>
        <div>
          <span>Puntaje de cobertura</span>
          <strong>{formatCoverageScore(coverage.score)}</strong>
        </div>
        <div>
          <span>Con respaldo de fuente</span>
          <strong>{coverage.source_backed_points ?? 0}</strong>
        </div>
        <div>
          <span>Brechas de fórmula</span>
          <strong>{formulaGaps.length}</strong>
        </div>
        <div>
          <span>Brechas de fuente</span>
          <strong>{sourceGaps.length}</strong>
        </div>
      </div>

      <div className={styles.researchFindingList}>
        {(findings.length ? findings : [{ severity: "info", message: "Sin hallazgos de auditoría." }]).map((finding, index) => (
          <article className={styles.researchFinding} data-tone={statusTone(finding.severity)} key={`${finding.code || "finding"}-${index}`}>
            <strong>{finding.code || finding.severity || "audit"}</strong>
            <p>{finding.message}</p>
          </article>
        ))}
      </div>

      <div className={styles.researchFindingList}>
        {(flags.length ? flags : [{ severity: "info", title: "No se activaron alertas de calidad contable." }]).map((flag, index) => (
          <article className={styles.researchFinding} data-tone={statusTone(flag.severity)} key={`${flag.title}-${index}`}>
            <strong>{flag.title}</strong>
            <p>{Number.isFinite(Number(flag.metric)) ? formatPct(flag.metric) : "Sin valor de métrica."}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function EquityResearchPanel({ dashboard, id = "aurora-research-desk", initialTicker = "", publicMode = false, workspaceId }) {
  const suggestions = useMemo(() => findSuggestedTickers(dashboard), [dashboard]);
  const [ticker, setTicker] = useState(cleanTicker(initialTicker) || suggestions[0] || "");
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
    if (!symbol || (!publicMode && !workspaceId)) return;
    if (publicMode) {
      setTicker(symbol);
      setPending(true);
      setError("");
      setRunSummary("");
      setRunProgress(10);
      setStatusMessage("Obteniendo datos y revisando la valoración...");
      const startedAt = performance.now();
      try {
        const payload = await fetchJsonWithTimeout(
          "/api/public/equity-research",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ ticker: symbol, mode }),
          },
          45_000,
        );
        if (!payload || payload.ok === false) {
          throw new Error(payload?.message || payload?.error || "No se pudo completar la valoración.");
        }
        setResearch(payload);
        setActiveTab("Valor");
        setRunProgress(100);
        setRunSummary(`Completado en ${Math.max(1, Math.round((performance.now() - startedAt) / 1000))}s. Esta sesión pública no se guarda.`);
      } catch (requestError) {
        setResearch(null);
        setError(String(requestError?.message || requestError || "No se pudo completar la valoración."));
        setRunProgress(100);
        setRunSummary("La lectura se detuvo antes de obtener datos suficientes.");
      } finally {
        setPending(false);
        setStatusMessage("");
      }
      return;
    }
    async function loadDirectResearch(summary = "Servicio async no disponible; se mostró el resultado directo.") {
      setStatusMessage("Usando modo directo...");
      let fallbackPayload;
      try {
        fallbackPayload = await fetchJsonWithTimeout(
          `/api/v1/workspaces/${workspaceId}/research/${encodeURIComponent(symbol)}?mode=${encodeURIComponent(mode)}`,
          { cache: "no-store" },
          15000,
        );
        if (fallbackPayload?.ok === false) {
          throw new Error(fallbackPayload.error || "No se pudo cargar el análisis.");
        }
      } catch (directError) {
        fallbackPayload = buildClientUnavailableResearch(symbol, mode, directError);
        summary = "La lectura directa no respondió; se mostró una ficha de estado.";
      }
      setResearch(fallbackPayload);
      setActiveTab("Memo");
      setRunProgress(100);
      setRunSummary(summary);
      setStatusMessage("");
    }
    setTicker(symbol);
    setPending(true);
    setError("");
    setRunSummary("");
    setRunProgress(6);
    setStatusMessage("Iniciando análisis...");
    const startedAt = performance.now();
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/research/${encodeURIComponent(symbol)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ mode }),
      });
      const startPayload = await parseResponse(response);
      if (startPayload.run_id && startPayload.error && (startPayload.status === "queued" || !startPayload.backend_run_id)) {
        const waitSeconds = Math.ceil(Number(startPayload.retry_after_ms || 0) / 1000);
        setRunSummary(
          isRateLimitMessage(startPayload.error)
            ? `El servicio está limitado. Reintento automático${waitSeconds ? ` en ${waitSeconds}s` : " en cola"}.`
            : "El servicio está en cola. Intentando enganchar el job async.",
        );
      }
      if (!startPayload.run_id) {
        if (startPayload.status === "failed" || startPayload.ok === false) {
          throw new Error(startPayload.error || "No se pudo iniciar el análisis.");
        }
        setResearch(startPayload);
        setActiveTab("Memo");
        setRunProgress(100);
        setRunSummary("Completado desde respuesta sincrónica del backend.");
        setStatusMessage("");
        return;
      }

      setRunProgress(18);
      let pollDelayMs = 3000;
      for (let attempt = 0; attempt < 36; attempt += 1) {
        setRunProgress(Math.min(92, 18 + (attempt + 1) * 3));
        setStatusMessage("Analizando...");
        await sleep(pollDelayMs);
        const pollResponse = await fetch(
          `/api/v1/workspaces/${workspaceId}/research/${encodeURIComponent(symbol)}?runId=${encodeURIComponent(startPayload.run_id)}`,
          { cache: "no-store" },
        );
        const pollPayload = await parseResponse(pollResponse);
        if (pollPayload.status === "running" || pollPayload.status === "queued") {
          const pollError = pollPayload.error || pollPayload.last_error;
          const retryAfterMs = Number(pollPayload.retry_after_ms || 0);
          if (retryAfterMs > 0 || isRateLimitMessage(pollError)) {
            const waitSeconds = Math.ceil(Math.max(retryAfterMs, pollDelayMs) / 1000);
            setRunSummary(`Servicio ocupado; próximo intento en ${waitSeconds}s.`);
            pollDelayMs = Math.min(15000, Math.max(5000, retryAfterMs || pollDelayMs + 1500));
            continue;
          }
          if (pollError && attempt >= 5) {
            await loadDirectResearch("El servicio async no respondió; se mostró el resultado directo.");
            return;
          }
          pollDelayMs = Math.min(8000, pollDelayMs + 500);
          continue;
        }
        if (pollPayload.status === "failed" || pollPayload.ok === false) {
          throw new Error(pollPayload.error || "Research job failed.");
        }
        setResearch(pollPayload);
        setActiveTab("Memo");
        setRunProgress(100);
        setRunSummary(`Completado en ${Math.max(1, Math.round((performance.now() - startedAt) / 1000))}s.`);
        setStatusMessage("");
        return;
      }
      throw new Error("El análisis sigue en proceso. Intenta de nuevo en un momento.");
    } catch (requestError) {
      setResearch(null);
      setError(String(requestError?.message || requestError || "El análisis no pudo completarse."));
      setRunProgress(100);
      setRunSummary("Análisis detenido antes de obtener un paquete verificado.");
    } finally {
      setPending(false);
      setStatusMessage("");
    }
  }

  const ratios = research?.financials?.ratios || {};
  const evidenceCount = safeList(research?.sources?.data_points).length;
  const auditFindings = safeList(research?.audit?.findings);
  const agentCount = safeList(research?.agents?.agents || research?.sources?.agent_outputs?.agents).length;
  const downloads = safeList(research?.downloads);
  const sourceRecords = safeList(research?.sources?.records);
  const annualRows = safeList(research?.financials?.annual);
  const deltaChanges = safeList(research?.history?.delta?.changes);
  const storedRunCount = Number(research?.history?.run_count || 0);
  const progressWidth = `${Math.max(0, Math.min(100, runProgress))}%`;
  const activeSource = sourceRecords.find((source) => source.status === "ok") || sourceRecords[0];
  const coverage = research?.sources?.coverage || research?.audit?.coverage || {};
  const hasStatementRows = annualRows.length > 0 && Number.isFinite(Number(ratios.latest_revenue));
  const statementProvider = hasStatementRows ? coverage.statement_source_provider || "fmp" : null;
  const sourceSpineLabel = statementProvider || (activeSource?.provider ? `Solo perfil de ${activeSource.provider}` : "Sin fuente todavía");
  const coverageWidth = `${Math.max(0, Math.min(100, Number(coverage.score) || 0))}%`;
  const missingRequiredMetrics = safeList(coverage.missing_expected_metrics);
  const coverageDetail =
    coverage.expected_metrics
      ? `${coverage.covered_expected_metrics}/${coverage.expected_metrics} required metrics`
      : `${evidenceCount} puntos de registro`;
  const finalOrchestrator = research?.agents?.final_orchestrator || research?.sources?.agent_outputs?.final_orchestrator || {};
  const finalAnalysis = finalAnalysisFrom(finalOrchestrator);
  const executiveJudgmentCandidate = firstUsefulText(finalAnalysis.executive_judgment, finalAnalysis.memo_patch);
  const valuationPresentation = useMemo(
    () => buildEquityValuationPresentation(research, { executiveJudgment: executiveJudgmentCandidate }),
    [executiveJudgmentCandidate, research],
  );
  const safeDownloads = valuationPresentation.backed ? downloads : downloads.filter((artifact) => (
    /_(sources|audit)\.json$|_assumptions\.yml$/i.test(String(artifact?.filename || ""))
  ));
  const hasXlsx = safeDownloads.some((artifact) => String(artifact.filename || "").endsWith(".xlsx"));
  const researchStateLabel = research ? valuationStateLabel(valuationPresentation) : "En espera";
  const openIssueLabel = missingRequiredMetrics.length
    ? summarizeGaps(missingRequiredMetrics, 3)
    : auditFindings[0]?.code || "Sin brechas requeridas";
  const openIssueDetail = missingRequiredMetrics.length
    ? "Estas métricas aún necesitan respaldo de fuente."
    : auditFindings[0]?.message || coverage.statement_authority || "Las métricas requeridas están cubiertas.";

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
    <section className={`${styles.panel} ${styles.researchPanel}`} id={id}>
      <div className={styles.researchCommandSurface}>
        <div className={styles.researchIdentity}>
          <p className={styles.kicker}>Investigación</p>
          <h2>{research?.ticker || ticker || "Ticker"}</h2>
          <p className={styles.supportText}>
            Analiza una compañía: estados financieros, valoración, debate y auditoría.
          </p>
          <div className={styles.researchStatusLine}>
            <span data-tone={pending ? "warn" : research ? "good" : "neutral"}>{pending ? "Procesando" : research ? "Listo" : "Listo para analizar"}</span>
            <span>{mode === "full" ? "Análisis completo" : "Vista rápida"}</span>
            <span>{publicMode ? "Sesión pública · no se guarda" : storedRunCount ? `${storedRunCount} análisis guardado${storedRunCount === 1 ? "" : "s"}` : "Sin análisis previo"}</span>
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
              {pending ? "Procesando..." : "Analizar"}
            </button>
          </div>
          {!publicMode ? (
            <div className={styles.segmentedControl}>
              <button
                className={styles.segmentButton}
                data-active={mode === "quick"}
                key="quick"
                onClick={() => setMode("quick")}
                type="button"
                title="Vista rápida: memo y valoración"
              >
                Rápido
              </button>
              <button
                className={styles.segmentButton}
                data-active={mode === "full"}
                key="full"
                onClick={() => setMode("full")}
                type="button"
                title="Análisis completo con auditoría"
              >
                Completo
              </button>
            </div>
          ) : (
            <p className={styles.publicModeBadge}>Vista pública · análisis rápido</p>
          )}
        </div>
      </div>

      <div className={styles.researchStageRail} aria-label="Proceso de análisis">
        {AGENT_STAGES.map((stage, index) => (
          <ResearchStage key={stage.key} stage={stage} state={stageState(stage, index)} />
        ))}
      </div>

      {(pending || research || error || runSummary) ? (
        <div className={styles.researchProgressShell}>
          <div className={styles.researchProgressTrack} aria-hidden="true">
            <span style={{ width: progressWidth }} />
          </div>
          <p>{statusMessage || runSummary || (research ? `Generado ${formatDateTime(research.generated_at)}` : "Esperando análisis.")}</p>
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
          detail={research?.company_profile?.industry || "Perfil cargado desde FMP vía backend Railway."}
          label="Empresa"
          tone={research ? "good" : "neutral"}
          value={research?.company_profile?.name || "Sin análisis"}
        />
        <ResearchMetric
          detail="Última fila del estado financiero anual."
          label="Ingresos recientes"
          value={compactCurrency(ratios.latest_revenue, research?.company_profile?.currency)}
        />
        <ResearchMetric
          detail={valuationPresentation.backed
            ? `Estimación central ${compactCurrency(valuationPresentation.centralValue, valuationPresentation.currency)} · ${valuationPresentation.primaryMethod}`
            : valuationPresentation.showValuationFigures
              ? `Método ${valuationPresentation.primaryMethod} · estimación central retenida hasta cerrar los controles`
              : valuationPresentation.reason}
          label="Rango estimado"
          tone={valuationPresentation.backed ? "good" : valuationPresentation.showValuationFigures ? "warn" : "neutral"}
          value={formatValuationRange(valuationPresentation)}
        />
        <ResearchMetric
          detail={research
            ? `${valuationStateLabel(valuationPresentation)} · datos al ${formatMarketDate(valuationPresentation.marketDataAsOf)}`
            : "La confianza aparece después del análisis."}
          label="Confianza de valoración"
          tone={valuationPresentation.backed ? "good" : valuationPresentation.showValuationFigures ? "warn" : "neutral"}
          value={valuationPresentation.showValuationFigures ? formatPct(valuationPresentation.confidence, 0) : "En revisión"}
        />
      </div>

      {research ? (
        <div className={styles.researchCoverageRail} data-tone={coverageTone(coverage)}>
          <div>
            <span>Cobertura de evidencia</span>
            <strong>{formatCoverageScore(coverage.score)}</strong>
          </div>
          <div className={styles.researchCoverageTrack} aria-hidden="true">
            <span style={{ width: coverageWidth }} />
          </div>
          <p>{missingRequiredMetrics.length ? `Brechas abiertas: ${summarizeGaps(missingRequiredMetrics, 4)}` : coverage.statement_authority || "La cobertura del registro es completa para las métricas requeridas."}</p>
        </div>
      ) : null}

      {research ? (
        <div className={styles.researchCoverageSummary}>
          <div>
            <span>Estado actual</span>
            <strong>{researchStateLabel}</strong>
            <small>{valuationPresentation.showExecutiveJudgment
              ? valuationPresentation.executiveJudgment
              : valuationPresentation.reason}</small>
          </div>
          <div>
            <span>{valuationPresentation.backed
              ? "Rango respaldado"
              : valuationPresentation.showValuationFigures
                ? "Rango orientativo"
                : "Valoración no publicada"}</span>
            <strong>{valuationPresentation.showValuationFigures ? formatValuationRange(valuationPresentation) : "—"}</strong>
            <small>{valuationPresentation.backed
              ? `Estimación central ${compactCurrency(valuationPresentation.centralValue, valuationPresentation.currency)} · ${valuationPresentation.primaryMethod}`
              : valuationPresentation.showValuationFigures
                ? `Método ${valuationPresentation.primaryMethod} · estimación central retenida`
                : "No se muestra una cifra hasta superar los controles."}</small>
          </div>
          <div>
            <span>Pendientes</span>
            <strong>{openIssueLabel}</strong>
            <small>{openIssueDetail}</small>
          </div>
        </div>
      ) : null}

      <div className={styles.researchSignalGrid}>
        <div>
          <span>Cobertura</span>
          <strong>{research ? formatCoverageScore(coverage.score) : "Esperando"}</strong>
        </div>
        <div>
          <span>Fuente de estados</span>
          <strong>{sourceSpineLabel}</strong>
        </div>
        <div>
          <span>Cambios anteriores</span>
          <strong>{deltaChanges.length ? `${deltaChanges.length} cambio${deltaChanges.length === 1 ? "" : "s"}` : "Sin cambios anteriores"}</strong>
        </div>
        <div>
          <span>Datos de mercado</span>
          <strong>{research ? formatMarketDate(valuationPresentation.marketDataAsOf) : "Esperando"}</strong>
        </div>
      </div>

      {safeDownloads.length ? (
        <div className={styles.researchDownloadBar} aria-label="Descargas del análisis">
          {safeDownloads.map((artifact) => (
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

      <div className={styles.researchTabs} role="tablist" aria-label="Pestañas de resultados">
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
            {tab === "Fuentes" && evidenceCount ? <small>{evidenceCount}</small> : null}
            {tab === "Auditoría" && auditFindings.length ? <small>{auditFindings.length}</small> : null}
            {tab === "Cambios" && deltaChanges.length ? <small>{deltaChanges.length}</small> : null}
          </button>
        ))}
      </div>

      <div className={styles.researchOutputShell}>
        <aside className={styles.researchEvidenceSpine}>
          <span>Resumen del análisis</span>
          <strong>{research?.ticker || cleanTicker(ticker) || "Sin ticker"}</strong>
          <p>{research ? `${coverageDetail}; ${evidenceCount} entradas de registro para reproducibilidad.` : "Analiza un ticker para ensamblar un paquete de investigación reproducible."}</p>
          <dl>
            <div>
              <dt>Estados</dt>
              <dd>{statementProvider ? statementProvider.toUpperCase() : "-"}</dd>
            </div>
            <div>
              <dt>Archivos SEC</dt>
              <dd>{coverage.sec_metadata_available ? "Metadatos SEC" : "-"}</dd>
            </div>
            <div>
              <dt>Archivos</dt>
              <dd>{hasXlsx ? "modelo + registros" : safeDownloads.length ? "registros" : "-"}</dd>
            </div>
          </dl>
        </aside>
        <div
          className={styles.researchOutput}
          role="tabpanel"
          aria-labelledby={`equity-research-tab-${activeTab.toLowerCase()}`}
          id={`equity-research-tabpanel-${activeTab.toLowerCase()}`}
        >
          {activeTab === "Memo" ? renderMemo(research, valuationPresentation) : null}
          {activeTab === "Valor" ? renderValuation(research, valuationPresentation) : null}
          {activeTab === "Debate" ? renderAgents(research, valuationPresentation) : null}
          {activeTab === "Cambios" ? renderDelta(research, valuationPresentation) : null}
          {activeTab === "Fuentes" ? renderEvidence(research) : null}
          {activeTab === "Auditoría" ? renderAudit(research) : null}
        </div>
      </div>
    </section>
  );
}
