import { CHANNEL_QUESTIONS } from "./questions.js";

export const CHANNEL_PROFILE_VERSION = "channel_profile_v1";
export const CHANNEL_STORAGE_KEY = "blsprime.channel_profile.v1";

export const CHANNEL_PUBLIC_SOURCE_VALUES = Object.freeze([
  "public_filings",
  "government_records",
  "public_prices",
  "product_docs",
  "public_observation",
]);

export const CHANNEL_SENSITIVE_SOURCE_VALUES = Object.freeze([
  "internal_private",
  "patient",
  "client",
]);

const questionFields = Object.fromEntries(
  CHANNEL_QUESTIONS.map((question) => [
    question.id,
    Object.freeze({
      type: question.type,
      required: question.required,
      maxSelections: question.maxSelections ?? 1,
      values: Object.freeze(question.options.map((item) => item.value)),
    }),
  ]),
);

export const CHANNEL_ANSWER_SCHEMA = Object.freeze({
  version: CHANNEL_PROFILE_VERSION,
  storageKey: CHANNEL_STORAGE_KEY,
  kind: "categorical",
  fields: Object.freeze(questionFields),
});

const valueSets = Object.fromEntries(
  Object.entries(CHANNEL_ANSWER_SCHEMA.fields).map(([key, field]) => [key, new Set(field.values)]),
);

const PUBLIC_SOURCE_SET = new Set(CHANNEL_PUBLIC_SOURCE_VALUES);
const SENSITIVE_SOURCE_SET = new Set(CHANNEL_SENSITIVE_SOURCE_VALUES);
const PERSISTABLE_STATUS_SET = new Set(["insufficient", "channel_hypothesis", "probe_ready"]);

function normalizeCategory(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sanitizeSingle(field, value) {
  const normalized = normalizeCategory(value);
  return valueSets[field].has(normalized) ? normalized : "";
}

function uniqueKnownValues(field, value) {
  if (!Array.isArray(value)) return [];

  const known = [];
  const seen = new Set();
  for (const candidate of value) {
    const normalized = normalizeCategory(candidate);
    if (!normalized || seen.has(normalized) || !valueSets[field].has(normalized)) continue;
    seen.add(normalized);
    known.push(normalized);
  }
  return known;
}

function sanitizeArchetypes(value) {
  return uniqueKnownValues("archetypes", value).slice(
    0,
    CHANNEL_ANSWER_SCHEMA.fields.archetypes.maxSelections,
  );
}

function sanitizePublicSources(value) {
  const known = uniqueKnownValues("public_sources", value);
  const publicValues = known
    .filter((item) => PUBLIC_SOURCE_SET.has(item))
    .slice(0, CHANNEL_ANSWER_SCHEMA.fields.public_sources.maxSelections);
  const sensitiveValues = known.filter((item) => SENSITIVE_SOURCE_SET.has(item));
  const noneValue = known.includes("none") && publicValues.length === 0 ? ["none"] : [];

  // Restricted markers are deliberately preserved even beyond the UI selection cap.
  // Otherwise a crafted payload could hide a safety block behind extra public values.
  return [...publicValues, ...sensitiveValues, ...noneValue];
}

export function canPersistChannelProfile(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  if (result.version !== CHANNEL_PROFILE_VERSION) return false;
  if (!PERSISTABLE_STATUS_SET.has(result.status)) return false;
  if (result.safety?.blocked !== false) return false;
  if (!Array.isArray(result.safety?.reasons) || result.safety.reasons.length > 0) return false;

  const answers = result.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return false;
  if (normalizeCategory(answers.source_safety) !== "public_safe") return false;
  if (!Array.isArray(answers.public_sources)) return false;
  if (answers.public_sources.some((source) => SENSITIVE_SOURCE_SET.has(normalizeCategory(source)))) {
    return false;
  }

  return true;
}

export function createEmptyChannelAnswers() {
  return {
    version: CHANNEL_PROFILE_VERSION,
    archetypes: [],
    direct_experience: "",
    source_safety: "",
    public_sources: [],
    repeatability: "",
    issuer_kpi_mapping: "",
    testability: "",
    protection_time_fit: "",
  };
}

export function sanitizeChannelAnswers(raw) {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};

  return {
    version: CHANNEL_PROFILE_VERSION,
    archetypes: sanitizeArchetypes(input.archetypes),
    direct_experience: sanitizeSingle("direct_experience", input.direct_experience),
    source_safety: sanitizeSingle("source_safety", input.source_safety),
    public_sources: sanitizePublicSources(input.public_sources),
    repeatability: sanitizeSingle("repeatability", input.repeatability),
    issuer_kpi_mapping: sanitizeSingle("issuer_kpi_mapping", input.issuer_kpi_mapping),
    testability: sanitizeSingle("testability", input.testability),
    protection_time_fit: sanitizeSingle("protection_time_fit", input.protection_time_fit),
  };
}
