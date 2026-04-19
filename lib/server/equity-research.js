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

function readPath(object, path) {
  return path.split(".").reduce((current, key) => current?.[key], object);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
  try {
    const currentRun = await appendEquityResearchRun(workspaceId, symbol, reportMode, payload);
    const runCount = await countEquityResearchRuns(workspaceId, symbol);
    return attachHistory(payload, {
      previousRun,
      currentRun,
      runCount,
      storageStatus: currentRun ? "persisted" : "not_persisted",
    });
  } catch (error) {
    return attachHistory(payload, {
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
    return persistResearchRun(workspaceId, symbol, reportMode, payload, previousRun);
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
    const job = await startBackendEquityResearchJob(symbol, reportMode);
    if (!job?.run_id) {
      throw new Error("Research backend did not return a job run_id.");
    }
    const startedAt = job.started_at || new Date().toISOString();
    const updatedJob = await updateEquityResearchJob(workspaceId, localJob.id, {
      status: job.status || "running",
      backendRunId: job.run_id || null,
      startedAt,
      payload: {
        backend: job,
        requested_at: localJob.createdAt,
        ticker: symbol,
        mode: reportMode,
      },
    });
    return {
      ok: true,
      ticker: symbol,
      mode: reportMode,
      status: updatedJob?.status || job.status || "running",
      run_id: updatedJob?.id || localJob.id,
      backend_run_id: updatedJob?.backendRunId || job.run_id || null,
      started_at: updatedJob?.startedAt || startedAt,
    };
  } catch (error) {
    await updateEquityResearchJob(workspaceId, localJob.id, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: serializedError(error),
      payload: {
        requested_at: localJob.createdAt,
        ticker: symbol,
        mode: reportMode,
        error: serializedError(error),
      },
    }).catch(() => null);
    return {
      ok: false,
      ticker: symbol,
      mode: reportMode,
      status: "failed",
      run_id: localJob.id,
      error: serializedError(error),
    };
  }
}

export async function getWorkspaceEquityResearchJob(workspaceId, ticker, runId) {
  const symbol = cleanTicker(ticker);
  const localJob =
    (await getEquityResearchJob(workspaceId, runId).catch(() => null)) ||
    (await getEquityResearchJobByBackendRunId(workspaceId, runId).catch(() => null));
  const backendRunId = localJob?.backendRunId || String(runId || "").trim();

  if (localJob?.status === "succeeded" && localJob.payload && Object.keys(localJob.payload).length) {
    return localJob.payload;
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
    const result = await persistResearchRun(workspaceId, symbol, job.payload.mode || localJob?.mode || "quick", job.payload, previousRun);
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
