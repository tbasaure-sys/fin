import {
  fetchBackendEquityResearch,
  fetchBackendEquityResearchJob,
  startBackendEquityResearchJob,
} from "./backend.js";
import {
  appendEquityResearchRun,
  countEquityResearchRuns,
  getLatestEquityResearchRun,
} from "./data/equity-research-runs.js";
import {
  createEquityResearchJob,
  getEquityResearchJob,
  getEquityResearchJobByBackendRunId,
  updateEquityResearchJob,
} from "./data/equity-research-jobs.js";

function cleanTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 16);
}

function buildUnavailableBundle(ticker, mode, error) {
  const generatedAt = new Date().toISOString();
  const message = String(error?.message || error || "The equity research backend is unavailable.");
  const report = [
    `# ${ticker} research OS memo`,
    "",
    "## Status",
    "The deterministic research backend did not return source-backed data for this ticker.",
    "",
    "## What is missing",
    message,
    "",
    "No financial statement values, valuation outputs, or thesis claims were generated.",
    "",
  ].join("\n");
  const sources = {
    records: [
      {
        source_id: "railway:equity-research",
        provider: "railway-backend",
        endpoint_or_filing: "/api/equity-research",
        retrieved_at: generatedAt,
        status: "error",
        error: message,
      },
    ],
    data_points: [],
  };
  const audit = {
    generated_at: generatedAt,
    status: "needs_attention",
    findings: [
      {
        severity: "high",
        code: "backend_unavailable",
        message,
      },
    ],
  };
  const assumptionsYml = "assumptions: {}\n";
  const bundle = {
    ok: true,
    ticker,
    mode,
    generated_at: generatedAt,
    company_profile: {
      name: ticker,
      sector: null,
      industry: null,
      country: null,
      currency: null,
      exchange: null,
      beta: null,
      market_cap: null,
      description: null,
    },
    financials: {
      annual: [],
      ratios: {},
      quality_flags: [],
    },
    valuation: {
      available: false,
      reason: message,
      scenarios: [],
      reverse_dcf: {
        available: false,
        reason: message,
      },
      multiples: {},
    },
    checklist_score: {
      quality: 0,
      accounting_risk: 0,
      valuation: 0,
      evidence: 0,
    },
    report_markdown: report,
    sources,
    audit,
    assumptions: {},
    assumptions_yml: assumptionsYml,
    artifacts: {
      report_md: true,
      model_xlsx: false,
      sources_json: true,
      audit_json: true,
      assumptions_yml: true,
      note: "No XLSX export is emitted until the deterministic backend has source-backed statement data.",
    },
    downloads: [],
  };
  bundle.downloads = [
    textDownload(`${ticker || "ticker"}_report.md`, "text/markdown", report),
    textDownload(`${ticker || "ticker"}_sources.json`, "application/json", JSON.stringify(sources, null, 2)),
    textDownload(`${ticker || "ticker"}_audit.json`, "application/json", JSON.stringify(audit, null, 2)),
    textDownload(`${ticker || "ticker"}_assumptions.yml`, "application/yaml", assumptionsYml),
  ];
  return bundle;
}

function textDownload(filename, mediaType, text) {
  return {
    filename,
    media_type: mediaType,
    encoding: "base64",
    content_base64: Buffer.from(String(text || ""), "utf8").toString("base64"),
  };
}

function sanitizeReportMarkdown(markdown, ticker) {
  return String(markdown || "")
    .replace(/^#\s+(.+?)\s+research OS memo\s*$/gim, "# $1")
    .split(/\r?\n/)
    .filter((line) => !/one-call final editor|returned error|too many requests|client error|api\.openai|sources\.json|provider endpoints|row counts|coverage gaps/i.test(line))
    .join("\n")
    .replace(/^(?:-\s*)?Company:\s*/gim, "Compañía: ")
    .replace(/\bFinancial quality review\s*\(ready\):/gi, "Revisión financiera:")
    .replace(/\bLatest FCF margin\b/gi, "Margen FCF reciente")
    .replace(/\bROIC is\b/gi, "ROIC")
    .replace(/\bis\s+([0-9.,]+%)/gi, "es $1")
    .replace(/,\s*and\s+(\d+)\s+/gi, " y $1 ")
    .replace(/\baccounting flags were triggered\b/gi, "alertas contables activas")
    .replace(/^#\s*$/m, `# ${ticker || "Research"}`)
    .trimEnd();
}

function sanitizeResearchPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const reportMarkdown = sanitizeReportMarkdown(payload.report_markdown, payload.ticker);
  return {
    ...payload,
    report_markdown: reportMarkdown,
    downloads: updateReportDownload(payload.downloads, payload.ticker, reportMarkdown),
  };
}

function readPath(object, path) {
  return path.split(".").reduce((current, key) => current?.[key], object);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function envFlag(name, fallback = "auto") {
  return String(process.env[name] ?? fallback).trim().toLowerCase();
}

function equityResearchLlmConfig() {
  const apiKey = String(process.env.EQUITY_RESEARCH_LLM_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const enabledFlag = envFlag("EQUITY_RESEARCH_LLM_ENABLED");
  const timeoutMsRaw = Number(process.env.EQUITY_RESEARCH_LLM_TIMEOUT_MS);
  const timeoutSecondsRaw = Number(process.env.EQUITY_RESEARCH_LLM_TIMEOUT_SECONDS || 25);
  const enabled =
    ["0", "false", "no", "off", "disabled"].includes(enabledFlag)
      ? false
      : ["1", "true", "yes", "on", "enabled"].includes(enabledFlag)
        ? true
        : Boolean(apiKey);
  return {
    enabled,
    apiKey,
    model: String(process.env.EQUITY_RESEARCH_LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini").trim(),
    baseUrl: String(process.env.EQUITY_RESEARCH_LLM_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, ""),
    timeoutMs: Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.max(5000, timeoutMsRaw)
      : Math.max(5000, (Number.isFinite(timeoutSecondsRaw) && timeoutSecondsRaw > 0 ? timeoutSecondsRaw : 25) * 1000),
    maxTokens: Math.max(200, Math.min(2000, Number(process.env.EQUITY_RESEARCH_LLM_MAX_TOKENS || 900))),
  };
}

function compactJson(payload, limit = 12000) {
  const text = JSON.stringify(payload);
  return text.length <= limit ? text : `${text.slice(0, limit)}...[truncated]`;
}

function parseJsonishAnalysis(value) {
  if (!value) return {};
  if (typeof value === "object") {
    if (value.memo_patch && !value.executive_judgment) {
      const nested = parseJsonishAnalysis(value.memo_patch);
      if (nested.executive_judgment || nested.strongest_points || nested.red_team || nested.open_questions) {
        return nested;
      }
    }
    return value;
  }
  const text = String(value || "").trim();
  if (!text) return {};
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" ? parseJsonishAnalysis(parsed) : { memo_patch: text };
  } catch {
    return { memo_patch: text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim() };
  }
}

function finalOrchestratorInput(bundle) {
  const latest = latestAnnualRow(bundle) || {};
  const base = baseScenario(bundle) || {};
  return {
    ticker: bundle?.ticker,
    company: bundle?.company_profile || {},
    latest_period: latest.fiscal_year || latest.date || null,
    audit: {
      status: bundle?.audit?.status,
      coverage: bundle?.sources?.coverage || bundle?.audit?.coverage,
      findings: Array.isArray(bundle?.audit?.findings) ? bundle.audit.findings.slice(0, 8) : [],
    },
    financials: {
      latest_revenue: bundle?.financials?.ratios?.latest_revenue,
      latest_fcf: bundle?.financials?.ratios?.latest_fcf,
      revenue_cagr_5y: bundle?.financials?.ratios?.revenue_cagr_5y,
      fcf_margin: bundle?.financials?.ratios?.fcf_margin,
      roic: bundle?.financials?.ratios?.roic,
      cash_conversion: bundle?.financials?.ratios?.cash_conversion,
      net_debt: bundle?.financials?.ratios?.net_debt,
      latest_debt: latest.total_debt,
      latest_cash: latest.cash,
    },
    valuation: {
      available: bundle?.valuation?.available,
      current_price: bundle?.valuation?.current_price,
      base_intrinsic_value_per_share: base.intrinsic_value_per_share,
      reverse_dcf: bundle?.valuation?.reverse_dcf,
      multiples: bundle?.valuation?.multiples,
    },
    quality_flags: Array.isArray(bundle?.financials?.quality_flags) ? bundle.financials.quality_flags.slice(0, 8) : [],
    filings: Array.isArray(bundle?.filings?.recent) ? bundle.filings.recent.slice(0, 5) : [],
    agent_summaries: (Array.isArray(bundle?.agents?.agents) ? bundle.agents.agents : []).map((agent) => ({
      id: agent?.id,
      status: agent?.status,
      summary: agent?.summary,
      open_questions: Array.isArray(agent?.open_questions) ? agent.open_questions.slice(0, 4) : [],
    })),
  };
}

async function callFinalOrchestrator(bundle, config) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      cache: "no-store",
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              "You are the final orchestrator/editor for an equity research operating system. You receive only audited deterministic outputs. Do not invent data, do not recalculate numbers, and tag uncertainty explicitly. Return only valid JSON, without markdown fences, with keys: executive_judgment, strongest_points, red_team, open_questions, memo_patch.",
          },
          {
            role: "user",
            content: `Synthesize the finished bundle into a skeptical final analyst layer. Use only this JSON payload:\n${compactJson(finalOrchestratorInput(bundle))}`,
          },
        ],
        temperature: 0.2,
        max_tokens: config.maxTokens,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Final orchestrator failed (${response.status}): ${text.slice(0, 200)}`);
    }
    const data = await response.json();
    const rawText = String(data?.choices?.[0]?.message?.content || "").trim();
    return parseJsonishAnalysis(rawText);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      throw new Error(`Final orchestrator timed out after ${config.timeoutMs}ms.`);
    }
    throw error;
  }
}

async function attachFinalOrchestrator(bundle) {
  if (!bundle?.agents?.agents?.length) return bundle;
  const current = bundle.agents.final_orchestrator || {};
  const actualCalls = Number(current?.call_budget?.actual_calls || 0);
  if (current.status === "ok" || actualCalls >= 1) return bundle;

  const config = equityResearchLlmConfig();
  if (!config.enabled) return bundle;

  const finalOrchestrator = {
    enabled: true,
    status: "unavailable",
    model: config.model,
    base_url: config.baseUrl,
    runtime: "vercel",
    call_budget: { max_calls: 1, actual_calls: 0 },
    analysis: null,
  };

  if (!config.apiKey) {
    return {
      ...bundle,
      agents: {
        ...bundle.agents,
        final_orchestrator: {
          ...finalOrchestrator,
          error: "No EQUITY_RESEARCH_LLM_API_KEY or OPENAI_API_KEY configured in Vercel.",
        },
      },
    };
  }

  try {
    finalOrchestrator.call_budget.actual_calls = 1;
    finalOrchestrator.analysis = await callFinalOrchestrator(bundle, config);
    finalOrchestrator.status = "ok";
  } catch (error) {
    finalOrchestrator.call_budget.actual_calls = 1;
    finalOrchestrator.status = "error";
    finalOrchestrator.error = String(error?.message || error);
  }

  const reportMarkdown = appendFinalOrchestratorReport(bundle.report_markdown, finalOrchestrator);
  const downloads = updateReportDownload(bundle.downloads, bundle.ticker, reportMarkdown);

  return {
    ...bundle,
    report_markdown: reportMarkdown,
    downloads,
    agents: {
      ...bundle.agents,
      final_orchestrator: finalOrchestrator,
    },
    sources: {
      ...(bundle.sources || {}),
      agent_outputs: {
        ...(bundle.sources?.agent_outputs || bundle.agents || {}),
        final_orchestrator: finalOrchestrator,
      },
    },
  };
}

function asBulletLines(value) {
  const values = Array.isArray(value) ? value : [value].filter(Boolean);
  return values.slice(0, 4).map((item) => `- ${String(item)}`);
}

function appendFinalOrchestratorReport(markdown, finalOrchestrator) {
  if (finalOrchestrator.status !== "ok") return markdown;
  const sourceMarkdown = String(markdown || "").trimEnd()
    .replace(/\n## Final orchestrator[\s\S]*?(?=\n## |$)/i, "")
    .replace(/\n## Final editor synthesis[\s\S]*?(?=\n## |$)/i, "")
    .replace(/\n- Final LLM orchestrator:\s*```(?:json)?[\s\S]*?```/i, "")
    .replace(/## Agent research desk/gi, "## Analyst desk")
    .replace(
      /^Agent layer:.*$/gim,
      "How to read this: Python pulls the data and calculates the metrics. The analyst desk is a set of reproducible review roles that read audited outputs, challenge the case, and point to open checks.",
    );
  const analysis = parseJsonishAnalysis(finalOrchestrator.analysis || {});
  const section = [
    "",
    "## Final editor synthesis",
    "One final editor pass ran after the deterministic engine, source ledger, specialist reviews, and audit. Specialist review roles did not calculate numbers.",
    "",
    analysis.executive_judgment || analysis.memo_patch ? `Executive judgment: ${analysis.executive_judgment || analysis.memo_patch}` : "",
    "",
    "What supports the case:",
    ...asBulletLines(analysis.strongest_points),
    "",
    "What could break the case:",
    ...asBulletLines(analysis.red_team),
    "",
    "Open checks:",
    ...asBulletLines(analysis.open_questions),
  ].filter((line, index, lines) => line || lines[index - 1] !== "");
  return `${sourceMarkdown}\n${section.join("\n")}\n`;
}

function updateReportDownload(downloads, ticker, reportMarkdown) {
  const artifacts = Array.isArray(downloads) ? downloads : [];
  const filename = `${ticker || "ticker"}_report.md`;
  const updated = textDownload(filename, "text/markdown", reportMarkdown);
  let replaced = false;
  const next = artifacts.map((artifact) => {
    if (String(artifact?.filename || "") === filename || String(artifact?.filename || "").endsWith("_report.md")) {
      replaced = true;
      return updated;
    }
    return artifact;
  });
  return replaced ? next : [updated, ...next];
}

function baseScenario(bundle) {
  return Array.isArray(bundle?.valuation?.scenarios)
    ? bundle.valuation.scenarios.find((scenario) => scenario?.name === "base") || null
    : null;
}

function metricValue(bundle, path) {
  if (path === "valuation.base_value") {
    return numberOrNull(baseScenario(bundle)?.intrinsic_value_per_share);
  }
  return numberOrNull(readPath(bundle, path));
}

const DELTA_METRICS = [
  { key: "latest_revenue", label: "Latest revenue", path: "financials.ratios.latest_revenue", unit: "currency" },
  { key: "latest_fcf", label: "Latest FCF", path: "financials.ratios.latest_fcf", unit: "currency" },
  { key: "revenue_cagr_5y", label: "Revenue CAGR, 5y", path: "financials.ratios.revenue_cagr_5y", unit: "percent" },
  { key: "fcf_margin", label: "FCF margin", path: "financials.ratios.fcf_margin", unit: "percent" },
  { key: "roic", label: "ROIC", path: "financials.ratios.roic", unit: "percent" },
  { key: "base_value", label: "Base intrinsic value", path: "valuation.base_value", unit: "currency" },
  { key: "implied_growth", label: "Reverse DCF implied growth", path: "valuation.reverse_dcf.implied_revenue_cagr", unit: "percent" },
];

function latestAnnualRow(payload) {
  const rows = Array.isArray(payload?.financials?.annual) ? payload.financials.annual : [];
  return rows.length ? rows[rows.length - 1] : null;
}

export function buildEquityResearchDelta(currentPayload, previousRun) {
  const previousPayload = previousRun?.payload || null;
  if (!previousPayload) {
    return {
      available: false,
      reason: "No prior research run exists for this workspace and ticker.",
      changes: [],
    };
  }

  const changes = DELTA_METRICS.map((metric) => {
    const current = metricValue(currentPayload, metric.path);
    const previous = metricValue(previousPayload, metric.path);
    if (current === null || previous === null) return null;
    const absolute_change = current - previous;
    const pct_change = previous === 0 ? null : absolute_change / Math.abs(previous);
    return {
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      current,
      previous,
      absolute_change,
      pct_change,
      material: Math.abs(pct_change ?? 0) >= 0.05 || Math.abs(absolute_change) > 0,
    };
  }).filter(Boolean);

  const currentAudit = currentPayload?.audit?.status || null;
  const previousAudit = previousPayload?.audit?.status || null;
  const auditChanged = currentAudit && previousAudit && currentAudit !== previousAudit;
  const currentLatest = latestAnnualRow(currentPayload);
  const previousLatest = latestAnnualRow(previousPayload);
  const currentPeriod = currentLatest?.fiscal_year || currentLatest?.date || null;
  const previousPeriod = previousLatest?.fiscal_year || previousLatest?.date || null;

  return {
    available: true,
    previous_run_id: previousRun.id || null,
    previous_run_at: previousRun.generatedAt || previousRun.createdAt || null,
    previous_mode: previousRun.mode || null,
    period_changed: Boolean(currentPeriod && previousPeriod && currentPeriod !== previousPeriod),
    current_period: currentPeriod,
    previous_period: previousPeriod,
    audit_changed: auditChanged,
    previous_audit_status: previousAudit,
    current_audit_status: currentAudit,
    changes,
    summary: changes.length
      ? "Compared against the latest stored run for this workspace and ticker."
      : "Prior run exists, but comparable numeric fields were not available.",
  };
}

function attachHistory(payload, history) {
  return {
    ...payload,
    history: {
      persisted: Boolean(history?.currentRun?.id),
      current_run_id: history?.currentRun?.id || null,
      current_run_at: history?.currentRun?.generatedAt || history?.currentRun?.createdAt || payload?.generated_at || null,
      run_count: Number(history?.runCount || 0),
      delta: buildEquityResearchDelta(payload, history?.previousRun || null),
      storage_status: history?.storageStatus || "not_persisted",
    },
  };
}

async function persistResearchRun(workspaceId, symbol, reportMode, payload, previousRun) {
  const cleanPayload = sanitizeResearchPayload(payload);
  try {
    const currentRun = await appendEquityResearchRun(workspaceId, symbol, reportMode, cleanPayload);
    const runCount = await countEquityResearchRuns(workspaceId, symbol);
    return attachHistory(cleanPayload, {
      previousRun,
      currentRun,
      runCount,
      storageStatus: currentRun ? "persisted" : "not_persisted",
    });
  } catch (error) {
    return attachHistory(cleanPayload, {
      previousRun,
      currentRun: null,
      runCount: previousRun ? 1 : 0,
      storageStatus: `not_persisted: ${String(error?.message || error)}`,
    });
  }
}

export async function getWorkspaceEquityResearch(workspaceId, ticker, { mode = "quick" } = {}) {
  const symbol = cleanTicker(ticker);
  const reportMode = mode === "full" ? "full" : "quick";
  if (!symbol) {
    return buildUnavailableBundle("", reportMode, "Ticker is required.");
  }

  const previousRun = await getLatestEquityResearchRun(workspaceId, symbol).catch(() => null);

  try {
    const payload = await fetchBackendEquityResearch(symbol, reportMode);
    if (!payload || payload.ok === false) {
      const unavailable = buildUnavailableBundle(symbol, reportMode, payload?.error || "Backend returned an invalid research payload.");
      return persistResearchRun(workspaceId, symbol, reportMode, unavailable, previousRun);
    }
    const enrichedPayload = sanitizeResearchPayload(await attachFinalOrchestrator(payload));
    return persistResearchRun(workspaceId, symbol, reportMode, enrichedPayload, previousRun);
  } catch (error) {
    const unavailable = buildUnavailableBundle(symbol, reportMode, error);
    return persistResearchRun(workspaceId, symbol, reportMode, unavailable, previousRun);
  }
}

function serializedError(error) {
  return String(error?.message || error || "Unknown error");
}

function jobPollPayload(localJob, fields = {}) {
  return {
    ok: true,
    ticker: localJob?.ticker || fields.ticker || null,
    mode: localJob?.mode || fields.mode || "quick",
    status: fields.status || localJob?.status || "running",
    run_id: localJob?.id || fields.runId || null,
    backend_run_id: localJob?.backendRunId || fields.backendRunId || null,
    started_at: localJob?.startedAt || fields.startedAt || null,
    updated_at: localJob?.updatedAt || null,
    ...(fields.error ? { last_error: fields.error } : {}),
  };
}

async function attachBackendResearchJob(workspaceId, localJob, symbol, reportMode) {
  const job = await startBackendEquityResearchJob(symbol, reportMode, localJob.id);
  if (!job?.run_id) {
    throw new Error("Research backend did not return a job run_id.");
  }
  const startedAt = job.started_at || new Date().toISOString();
  const updatedJob = await updateEquityResearchJob(workspaceId, localJob.id, {
    status: job.status || "running",
    backendRunId: job.run_id || null,
    startedAt,
    error: null,
    payload: {
      ...(localJob.payload || {}),
      backend: job,
      requested_at: localJob.createdAt,
      ticker: symbol,
      mode: reportMode,
      last_start_attempt_at: new Date().toISOString(),
    },
  });
  return { localJob: updatedJob || localJob, backendJob: job };
}

export async function startWorkspaceEquityResearch(workspaceId, ticker, { mode = "quick" } = {}) {
  const symbol = cleanTicker(ticker);
  const reportMode = mode === "full" ? "full" : "quick";
  if (!symbol) {
    return {
      ok: false,
      status: "failed",
      error: "Ticker is required.",
    };
  }

  const localJob = await createEquityResearchJob(workspaceId, symbol, reportMode, {
    status: "queued",
    payload: {
      requested_at: new Date().toISOString(),
      ticker: symbol,
      mode: reportMode,
    },
  });

  try {
    const { localJob: updatedJob, backendJob: job } = await attachBackendResearchJob(workspaceId, localJob, symbol, reportMode);
    return {
      ok: true,
      ticker: symbol,
      mode: reportMode,
      status: updatedJob?.status || job.status || "running",
      run_id: updatedJob?.id || localJob.id,
      backend_run_id: updatedJob?.backendRunId || job.run_id || null,
      started_at: updatedJob?.startedAt || job.started_at || null,
    };
  } catch (error) {
    const message = serializedError(error);
    await updateEquityResearchJob(workspaceId, localJob.id, {
      status: "queued",
      error: message,
      payload: {
        requested_at: localJob.createdAt,
        ticker: symbol,
        mode: reportMode,
        last_start_error: message,
        last_start_attempt_at: new Date().toISOString(),
      },
    }).catch(() => null);
    return {
      ok: true,
      ticker: symbol,
      mode: reportMode,
      status: "queued",
      run_id: localJob.id,
      error: message,
    };
  }
}

export async function getWorkspaceEquityResearchJob(workspaceId, ticker, runId) {
  const symbol = cleanTicker(ticker);
  const localJob =
    (await getEquityResearchJob(workspaceId, runId).catch(() => null)) ||
    (await getEquityResearchJobByBackendRunId(workspaceId, runId).catch(() => null));
  let backendRunId = localJob?.backendRunId || (localJob ? "" : String(runId || "").trim());

  if (localJob?.status === "succeeded" && localJob.payload && Object.keys(localJob.payload).length) {
    return sanitizeResearchPayload(localJob.payload);
  }

  if (localJob?.status === "failed" && !backendRunId) {
    return {
      ok: false,
      ticker: symbol || localJob.ticker,
      mode: localJob.mode || "quick",
      status: "failed",
      run_id: localJob.id,
      error: localJob.error || "Research job failed before backend execution.",
    };
  }

  if (!backendRunId) {
    if (localJob) {
      try {
        const { localJob: updatedJob, backendJob } = await attachBackendResearchJob(
          workspaceId,
          localJob,
          symbol || localJob.ticker,
          localJob.mode || "quick",
        );
        backendRunId = updatedJob?.backendRunId || backendJob.run_id || "";
        return jobPollPayload(updatedJob, {
          ticker: symbol || localJob.ticker,
          mode: updatedJob?.mode || localJob.mode || "quick",
          status: updatedJob?.status || backendJob.status || "running",
          backendRunId,
          startedAt: updatedJob?.startedAt || backendJob.started_at || null,
        });
      } catch (error) {
        const message = serializedError(error);
        const updatedJob = await updateEquityResearchJob(workspaceId, localJob.id, {
          status: "queued",
          error: message,
          payload: {
            ...(localJob.payload || {}),
            last_start_error: message,
            last_start_attempt_at: new Date().toISOString(),
          },
        }).catch(() => localJob);
        return jobPollPayload(updatedJob, {
          ticker: symbol || localJob.ticker,
          mode: localJob.mode || "quick",
          status: "queued",
          error: message,
        });
      }
    }
    return jobPollPayload(localJob, {
      ticker: symbol,
      mode: localJob?.mode || "quick",
      status: "queued",
    });
  }

  let job;
  try {
    job = await fetchBackendEquityResearchJob(backendRunId);
  } catch (error) {
    const message = serializedError(error);
    if (localJob) {
      const updatedJob = await updateEquityResearchJob(workspaceId, localJob.id, {
        status: localJob.status === "queued" ? "queued" : "running",
        error: message,
        payload: {
          ...(localJob.payload || {}),
          last_poll_error: message,
          last_poll_at: new Date().toISOString(),
        },
      }).catch(() => localJob);
      return jobPollPayload(updatedJob, {
        ticker: symbol,
        mode: localJob.mode,
        status: updatedJob?.status || "running",
        error: message,
      });
    }
    return {
      ok: false,
      ticker: symbol,
      status: "failed",
      error: message,
    };
  }

  if (job.status === "succeeded" && job.payload) {
    const previousRun = await getLatestEquityResearchRun(workspaceId, symbol).catch(() => null);
    const enrichedPayload = sanitizeResearchPayload(await attachFinalOrchestrator(job.payload));
    const result = await persistResearchRun(workspaceId, symbol, enrichedPayload.mode || job.payload.mode || localJob?.mode || "quick", enrichedPayload, previousRun);
    if (localJob) {
      await updateEquityResearchJob(workspaceId, localJob.id, {
        status: "succeeded",
        completedAt: new Date().toISOString(),
        error: null,
        payload: result,
        resultRunId: result?.history?.current_run_id || null,
      }).catch(() => null);
    }
    return result;
  }
  if (job.status === "failed" || job.status === "not_found") {
    if (localJob) {
      await updateEquityResearchJob(workspaceId, localJob.id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        error: job.error || "Research job failed.",
        payload: {
          ...(localJob.payload || {}),
          backend: job,
          error: job.error || "Research job failed.",
        },
      }).catch(() => null);
    }
    return {
      ok: false,
      ticker: symbol,
      status: job.status,
      run_id: localJob?.id || runId,
      backend_run_id: backendRunId,
      error: job.error || "Research job failed.",
    };
  }
  const updatedJob = localJob
    ? await updateEquityResearchJob(workspaceId, localJob.id, {
        status: job.status || "running",
        backendRunId: job.run_id || backendRunId,
        startedAt: job.started_at || localJob.startedAt || null,
        payload: {
          ...(localJob.payload || {}),
          backend: job,
          last_poll_at: new Date().toISOString(),
        },
      }).catch(() => localJob)
    : null;
  return {
    ok: true,
    ticker: symbol,
    mode: updatedJob?.mode || job.mode || "quick",
    status: updatedJob?.status || job.status || "running",
    run_id: updatedJob?.id || runId,
    backend_run_id: updatedJob?.backendRunId || job.run_id || backendRunId,
    started_at: updatedJob?.startedAt || job.started_at || null,
  };
}
