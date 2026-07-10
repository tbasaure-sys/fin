export const BREAKPOINT_VERSION = "bls_breakpoint_run_v1";
export const BREAKPOINT_HURDLES = Object.freeze([0.08, 0.1, 0.12]);

export function cleanBreakpointTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 12);
}

export function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

export function cloneJson(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  return JSON.parse(JSON.stringify(value));
}
