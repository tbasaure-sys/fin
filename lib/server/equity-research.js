import { fetchBackendEquityResearch } from "./backend.js";
import {
  appendEquityResearchRun,
  countEquityResearchRuns,
  getLatestEquityResearchRun,
} from "./data/equity-research-runs.js";

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
  { key: "revenue_cagr", label: "Revenue CAGR", path: "financials.ratios.revenue_cagr", unit: "percent" },
  { key: "fcf_margin", label: "FCF margin", path: "financials.ratios.fcf_margin", unit: "percent" },
  { key: "roic", label: "ROIC", path: "financials.ratios.roic", unit: "percent" },
  { key: "base_value", label: "Base intrinsic value", path: "valuation.base_value", unit: "currency" },
  { key: "implied_growth", label: "Reverse DCF implied growth", path: "valuation.reverse_dcf.implied_revenue_cagr", unit: "percent" },
];

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
  const currentPeriod = currentPayload?.financials?.annual?.[0]?.fiscal_year || currentPayload?.financials?.annual?.[0]?.date || null;
  const previousPeriod = previousPayload?.financials?.annual?.[0]?.fiscal_year || previousPayload?.financials?.annual?.[0]?.date || null;

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
