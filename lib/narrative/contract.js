/**
 * BLS Prime — Company Narrative Contract v1
 * See BLS_Company_Narrative_Contract_v1.md
 *
 * Runtime guard for language-model prose about a company. The model may only
 * restate numbers that already exist in the deterministic fact table, must
 * preserve attribution for anything it did not measure itself, and can never
 * emit a recommendation.
 */

export const NARRATIVE_CONTRACT_VERSION = "bls_company_narrative_v1";

/** Fields that may never exist on a conforming narrative object. */
export const FORBIDDEN_FIELDS = Object.freeze([
  "rating",
  "recommendation",
  "action",
  "target_price",
  "fair_value_point_estimate",
  "position_size",
  "allocation",
  "conviction_level",
  "entry_price",
  "stop_loss",
]);

/** Unambiguous prescriptive phrasing. Any match rejects the object. */
export const PRESCRIPTIVE_PHRASES = Object.freeze([
  /\bstarter position\b/i,
  /\bposici[oó]n inicial\b/i,
  /\bprice target\b/i,
  /\bprecio objetivo\b/i,
  /\b(?:we|i)\s+(?:would\s+)?(?:recommend|suggest)\b/i,
  /\b(?:recomendamos|sugerimos|recomiendo)\b/i,
  /\b(?:i'?d|we'?d|i would|we would)\s+(?:buy|sell|add|trim)\b/i,
  /\b(?:sobreponderar|infraponderar|acumular)\b/i,
  /\b(?:overweight|underweight)\b/i,
  /\bworth\s+(?:buying|owning)\b/i,
  /\bvale la pena\s+comprar\b/i,
  /\b(?:one of the )?better setups?\b/i,
  /\bbuen punto de entrada\b/i,
]);

/** Ambiguous single words. Reported as warnings, not hard failures. */
export const PRESCRIPTIVE_SOFT_WORDS = Object.freeze([
  /\bbuy\b/i,
  /\bsell\b/i,
  /\bcomprar\b/i,
  /\bvender\b/i,
  /\bsetup\b/i,
]);

export const ATTRIBUTION_KINDS = Object.freeze([
  "reported_fact",
  "company_assertion",
  "third_party_opinion",
  "press_report",
  "our_estimate",
]);

/** Attributions that must never be stated as bare fact. */
const ATTRIBUTION_REQUIRED = Object.freeze([
  "company_assertion",
  "third_party_opinion",
  "press_report",
  "our_estimate",
]);

const MAGNITUDE = { k: 1e3, m: 1e6, b: 1e9, t: 1e12, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };

// The leading lookbehind keeps us out of alphanumeric labels: PS5, Q4, FY2026, V4.
const NUMERIC_PATTERN =
  /(?<![A-Za-z0-9])(-|−)?\s*([¥$€£])?\s*(\d[\d,]*(?:\.\d+)?)\s*(trillion|billion|million|thousand|[kmbt]\b|x\b|%)?/gi;

const RANGE_PATTERN =
  /([¥$€£])?\s*(\d[\d,]*(?:\.\d+)?)\s*[-–—]\s*(\d[\d,]*(?:\.\d+)?)\s*(trillion|billion|million|thousand|[kmbt]\b|x\b|%)/gi;

const APPROXIMATION_HINT = /[~≈]|\babout\b|\broughly\b|\bapprox|\bcerca de\b|\bunos\b/i;

/**
 * "¥1.9-2T" and "15-16x" carry the currency and the magnitude on one endpoint
 * only. Rewrite both endpoints in full so each is checked on its own terms.
 */
export function expandRanges(prose) {
  return String(prose || "").replace(
    RANGE_PATTERN,
    (_match, currency, low, high, suffix) =>
      `${currency || ""}${low}${suffix} ${currency || ""}${high}${suffix}`,
  );
}

function isYearLike(raw, suffix) {
  if (suffix) return false;
  if (!/^\d{4}$/.test(raw)) return false;
  const year = Number(raw);
  return year >= 1900 && year <= 2100;
}

/**
 * A bare one or two digit integer with no currency, magnitude or unit is a
 * count, a quarter, or a day — not a financial claim. Checking them produces
 * only false positives.
 */
function isImmaterialBareInteger(raw, suffix, currency) {
  if (suffix || currency) return false;
  return /^\d{1,2}$/.test(raw);
}

/**
 * Pull every numeric claim out of prose and normalize it to a comparable value.
 * "¥1,447B" -> 1.447e12, "25%" -> 0.25, "9.7x" -> 9.7, "1.5M" -> 1.5e6.
 */
export function extractNumerics(prose) {
  const found = [];
  const text = expandRanges(prose);
  for (const match of text.matchAll(NUMERIC_PATTERN)) {
    const [token, sign, currency, digits, rawSuffix] = match;
    if (!digits) continue;
    const suffix = rawSuffix ? rawSuffix.toLowerCase().trim() : null;
    if (isYearLike(digits, suffix)) continue;
    if (isImmaterialBareInteger(digits, suffix, currency)) continue;

    let value = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;

    let kind = "plain";
    if (suffix === "%") {
      value /= 100;
      kind = "percent";
    } else if (suffix === "x") {
      kind = "multiple";
    } else if (suffix && MAGNITUDE[suffix]) {
      value *= MAGNITUDE[suffix];
      kind = currency ? "currency" : "plain";
    } else if (currency) {
      kind = "currency";
    }

    if (sign) value = -value;

    found.push({
      token: token.trim(),
      value,
      kind,
      currency: currency || null,
      index: match.index,
    });
  }
  return found;
}

function factValues(fact) {
  const out = [];
  const push = (value) => {
    const number = Number(value);
    if (Number.isFinite(number)) out.push(number);
  };
  push(fact?.value);
  push(fact?.low);
  push(fact?.high);
  push(fact?.quantified_impact?.value);
  if (fact?.range) {
    push(fact.range.low);
    push(fact.range.high);
  }
  // A percentage stored as 0.25 is written as 25%; store both readings.
  for (const value of [...out]) {
    if (Math.abs(value) <= 1) push(value * 100);
    if (Math.abs(value) > 1 && Math.abs(value) <= 100) push(value / 100);
  }
  return out;
}

/** Build the set of numbers the prose is allowed to contain. */
export function buildFactIndex(facts = []) {
  const values = [];
  for (const fact of facts) {
    for (const value of factValues(fact)) {
      values.push({ value, factId: fact?.id || null });
    }
  }
  return values;
}

function matchesFact(candidate, index, tolerance) {
  for (const entry of index) {
    const target = entry.value;
    if (target === 0) {
      if (candidate === 0) return entry;
      continue;
    }
    if (Math.abs(candidate - target) / Math.abs(target) <= tolerance) return entry;
    // Sign-agnostic: prose says "fell 46%", the fact stores -0.46.
    if (Math.abs(Math.abs(candidate) - Math.abs(target)) / Math.abs(target) <= tolerance) return entry;
  }
  return null;
}

/**
 * Test 6 — Numeric grounding. Every figure in the prose must exist in the fact
 * table. This is the highest-yield check in the contract: a fabricated figure is
 * the most common and most expensive language-model failure on financial text.
 */
export function validateNumericGrounding(prose, facts, { tolerance = 0.05 } = {}) {
  const index = buildFactIndex(facts);
  const violations = [];
  const approximate = APPROXIMATION_HINT.test(String(prose || ""));
  const effectiveTolerance = approximate ? Math.max(tolerance, 0.08) : tolerance;

  for (const numeric of extractNumerics(prose)) {
    const hit = matchesFact(numeric.value, index, effectiveTolerance);
    if (!hit) {
      violations.push({
        rule: "numeric_grounding",
        severity: "error",
        token: numeric.token,
        value: numeric.value,
        message: `"${numeric.token}" no existe en la tabla de hechos.`,
      });
    }
  }
  return violations;
}

/** Test 7 — Attribution preserved. */
export function validateAttribution(prose, events = []) {
  const text = String(prose || "");
  const violations = [];
  for (const event of events) {
    if (!ATTRIBUTION_REQUIRED.includes(event?.attribution)) continue;
    const cues = [event?.attributed_to, event?.source?.publisher].filter(Boolean);
    const impact = Number(event?.quantified_impact?.value);
    if (!Number.isFinite(impact)) continue;

    const mentioned = extractNumerics(text).some(
      (numeric) => Math.abs(Math.abs(numeric.value) - Math.abs(impact)) / Math.abs(impact) <= 0.08,
    );
    if (!mentioned) continue;

    const attributed = cues.some((cue) => new RegExp(escapeRegExp(String(cue)), "i").test(text));
    if (!attributed) {
      violations.push({
        rule: "attribution_preserved",
        severity: "error",
        eventId: event?.id || null,
        message: `El evento ${event?.id} es "${event.attribution}" y aparece sin atribución en la prosa.`,
      });
    }
  }
  return violations;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Test 8 — No-advice boundary. */
export function validateNoAdvice(payload = {}, prose = "") {
  const violations = [];
  const walk = (node, path = "") => {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (FORBIDDEN_FIELDS.includes(key)) {
        violations.push({
          rule: "no_advice_fields",
          severity: "error",
          field: path ? `${path}.${key}` : key,
          message: `El campo "${key}" implica asesoría y no puede existir en el objeto.`,
        });
      }
      if (value && typeof value === "object") walk(value, path ? `${path}.${key}` : key);
    }
  };
  walk(payload);

  const text = String(prose || "");
  for (const pattern of PRESCRIPTIVE_PHRASES) {
    const match = text.match(pattern);
    if (match) {
      violations.push({
        rule: "no_advice_language",
        severity: "error",
        match: match[0],
        message: `Lenguaje prescriptivo: "${match[0]}".`,
      });
    }
  }
  for (const pattern of PRESCRIPTIVE_SOFT_WORDS) {
    const match = text.match(pattern);
    if (match) {
      violations.push({
        rule: "no_advice_language_soft",
        severity: "warning",
        match: match[0],
        message: `Revisar el uso de "${match[0]}": puede leerse como acción.`,
      });
    }
  }
  return violations;
}

/** Test 9 — Falsifiers must be observable on a future date. */
export function validateFalsifiers(falsifiers = [], now = new Date()) {
  const violations = [];
  if (!Array.isArray(falsifiers) || falsifiers.length === 0) {
    return [{ rule: "falsifiers_required", severity: "error", message: "La tesis no declara falsificadores." }];
  }
  for (const falsifier of falsifiers) {
    const date = new Date(falsifier?.next_observable_date);
    if (Number.isNaN(date.getTime())) {
      violations.push({
        rule: "falsifier_observable",
        severity: "error",
        message: `Falsificador sin next_observable_date válida: "${falsifier?.kpi || "sin KPI"}".`,
      });
      continue;
    }
    if (date < now) {
      violations.push({
        rule: "falsifier_observable",
        severity: "warning",
        message: `El falsificador "${falsifier?.kpi}" ya venció el ${falsifier.next_observable_date}.`,
      });
    }
    if (!falsifier?.where_it_appears) {
      violations.push({
        rule: "falsifier_observable",
        severity: "error",
        message: `Falsificador sin fuente donde aparecerá: "${falsifier?.kpi}".`,
      });
    }
  }
  return violations;
}

/** Test 10 — Risk classifications must carry a justification. */
export function validateRiskClassification(risks = []) {
  const violations = [];
  for (const risk of risks) {
    if (!["cyclical", "structural"].includes(risk?.classification)) {
      violations.push({
        rule: "risk_classification",
        severity: "error",
        message: `Riesgo "${risk?.label}" sin clasificación cyclical/structural.`,
      });
    }
    if (!String(risk?.justification || "").trim()) {
      violations.push({
        rule: "risk_classification",
        severity: "error",
        message: `Riesgo "${risk?.label}" clasificado sin justificación.`,
      });
    }
  }
  return violations;
}

/** Test 11 — No figure without a date and a source. */
export function validateFactProvenance(facts = []) {
  const violations = [];
  for (const fact of facts) {
    if (!fact?.as_of) {
      violations.push({
        rule: "fact_provenance",
        severity: "error",
        factId: fact?.id || null,
        message: `El hecho ${fact?.id} no declara as_of.`,
      });
    }
    if (!fact?.source?.type) {
      violations.push({
        rule: "fact_provenance",
        severity: "error",
        factId: fact?.id || null,
        message: `El hecho ${fact?.id} no declara fuente.`,
      });
    }
  }
  return violations;
}

/**
 * Run the full contract. Returns every violation rather than throwing on the
 * first, so a failing generation can be repaired or regenerated in one pass.
 */
export function validateNarrative({ prose = "", facts = [], events = [], thesis = {}, now = new Date() } = {}) {
  const violations = [
    ...validateFactProvenance(facts),
    ...validateNumericGrounding(prose, facts),
    ...validateAttribution(prose, events),
    ...validateNoAdvice(thesis, prose),
    ...validateFalsifiers(thesis?.falsifiers, now),
    ...validateRiskClassification(thesis?.risk_classification),
  ];

  const errors = violations.filter((violation) => violation.severity === "error");
  return {
    version: NARRATIVE_CONTRACT_VERSION,
    ok: errors.length === 0,
    errors,
    warnings: violations.filter((violation) => violation.severity === "warning"),
    violations,
  };
}
