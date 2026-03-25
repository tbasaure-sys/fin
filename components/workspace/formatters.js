export const PORTFOLIO_RANGES = ["1D", "1W", "1M", "YTD", "ALL"];
const DEFAULT_LOCALE = process.env.NEXT_PUBLIC_BLS_FORMAT_LOCALE || "en-US";
const DEFAULT_CURRENCY = process.env.NEXT_PUBLIC_BLS_FORMAT_CURRENCY || "USD";

export function safeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function renderInlineItem(item) {
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

export function capitalize(value, fallback = "Unknown") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatPct(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "-";
  return `${(number * 100).toFixed(digits)}%`;
}

export function formatSignedPct(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "-";
  const prefix = number > 0 ? "+" : "";
  return `${prefix}${(number * 100).toFixed(digits)}%`;
}

export function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency: DEFAULT_CURRENCY,
    maximumFractionDigits: number >= 1000 ? 0 : 2,
  }).format(number);
}

export function formatDateTime(value) {
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

export function formatDate(value) {
  if (!value) return "No expiry";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export function parseDisplayPercent(value) {
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

export function formatSize(action) {
  if (!action) return "-";
  if (Number.isFinite(Number(action.sizeValue))) return formatPct(Number(action.sizeValue));
  return action.sizeLabel || action.size || "-";
}

export function actionTone(action) {
  if (!action) return "neutral";
  if (action.status === "blocked") return "bad";
  const tone = String(action.tone || "").toLowerCase();
  if (["add", "buy", "quality", "good"].includes(tone)) return "good";
  if (["trim", "hedge", "hold", "watch"].includes(tone)) return "warn";
  return "neutral";
}

export function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (["ready", "executed", "live", "fresh", "connected"].includes(value)) return "good";
  if (["staged", "briefing", "medium", "stale", "aging", "polling"].includes(value)) return "warn";
  if (["revoked", "cancelled", "expired", "high", "down", "error", "disconnected"].includes(value)) return "bad";
  return "neutral";
}

export function responseTone(response) {
  const value = String(response || "").toLowerCase();
  if (["staged", "executed"].includes(value)) return "good";
  if (["deferred", "noted"].includes(value)) return "warn";
  if (["rejected", "cancelled"].includes(value)) return "bad";
  return "neutral";
}

function parseSeriesDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function filterPortfolioSeries(series, range) {
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
