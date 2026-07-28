import assert from "node:assert/strict";
import test from "node:test";

import {
  expandRanges,
  extractNumerics,
  validateAttribution,
  validateFalsifiers,
  validateNarrative,
  validateNoAdvice,
  validateNumericGrounding,
  validateRiskClassification,
} from "../lib/narrative/contract.js";

const source = { type: "company_filing", publisher: "Sony Group Corporation", url: "https://example.invalid" };
const fact = (id, value, extra = {}) => ({ id, value, as_of: "2026-07-25", source, ...extra });

/** Fact table backing the Sony narrative used as a fixture. */
const SONY_FACTS = [
  fact("fy2025.revenue", 12.5e12),
  fact("fy2025.operating_income", 1.447e12),
  fact("fy2026.guidance.operating_income", 1.6e12),
  fact("fy2026.guidance.operating_income_growth", 0.11),
  fact("fy2026.buyback", 500e9),
  fact("fy2025.music.operating_income", 447e9),
  fact("fy2025.music.operating_income_growth", 0.25),
  fact("fy2025.sensing.operating_income", 357e9),
  fact("fy2025.sensing.operating_income_growth", 0.37),
  fact("market.price_adr", 21),
  fact("market.cap", 123e9),
  fact("fy2026.guidance.net_income", 1.16e12),
  fact("fy2026.guidance.net_income_usd", 7.8e9),
  fact("multiple.forward_pe_low", 15),
  fact("multiple.forward_pe_high", 16),
  fact("multiple.ev_ebitda", 9.7),
  fact("multiple.roic", 0.148),
  fact("price.ytd_2026", -0.23),
  fact("price.prior_years_gain", 0.2),
  fact("price.drawdown_from_high", -0.3),
  fact("ps5.memory_cost_per_unit", 100),
  fact("ps5.price_usd", 650),
  fact("ps5.q4_unit_decline", -0.46),
  fact("ps5.q4_units", 1.5e6),
  fact("bungie.impairment", 765e6),
  fact("bungie.acquisition_price", 3.6e9),
  fact("psn.mau", 125e6),
  fact("fy2026.memory_impact_company_stated", -30e9),
  fact("scenario.base.operating_income_low", 1.9e12),
  fact("scenario.base.operating_income_high", 2e12),
  fact("scenario.base.share_count_cagr", -0.03),
  fact("consensus.target_usd", 30),
];

const SONY_PROSE = `The structural story: post the financial-arm spin-off, this is a diversified IP compounder bolted to a near-monopoly in premium image sensors. FY2025 was a record year: ¥12.5T sales, ¥1,447B operating income; guidance for FY2026 is ¥1.6T OP (+11%), a ¥500B buyback, and a new TSMC joint venture. Music OP grew 25% to ¥447B and sensors 37% to ¥357B.
The cyclical story: the stock is down ~23% in 2026 after three straight years of 20%+ gains, roughly -30% from November's high. The PS5 carries ~$100 of memory per unit and Bernstein expects DRAM prices to rise several-fold; two price hikes pushed the standard PS5 to $650 and Q4 unit sales fell 46% to 1.5M. Add the $765M Bungie impairment on a $3.6B acquisition.
MAUs hit a record 125M, and Sony says the memory impact on FY2026 is contained to ~¥30B.
Valuation: ~$21 ADR, ~$123B cap against guided net of ¥1.16T (~$7.8B) is ~15-16x forward, EV/EBITDA ~9.7x, ROIC ~14.8%. Three years out, the base case arithmetic points to an OP path toward ¥1.9-2T with buybacks shrinking the share count ~3%/yr. Consensus targets near $30 already imply that framing.`;

const SONY_THESIS = {
  decomposition: "Console hardware carries the drawdown; music, pictures and sensing carry the durable economics.",
  dominant_assumption: "Memory pricing normalizes before the PS6 cost curve is set.",
  risk_classification: [
    {
      label: "Live-service execution",
      classification: "structural",
      justification: "Concord, Bungie and Marathon form a repeated pattern across independent titles, not a single miss.",
    },
    {
      label: "Memory supercycle",
      classification: "cyclical",
      justification: "DRAM and NAND pricing has mean-reverted in every prior supercycle within eight quarters.",
    },
  ],
  falsifiers: [
    {
      kpi: "Impacto de costo de memoria informado en Game & Network Services",
      public_test: "Desglose de margen de GN&S en resultados Q1 FY2026",
      threshold: "impacto anualizado materialmente por encima de ¥30B",
      next_observable_date: "2026-08-06",
      where_it_appears: "Sony Q1 FY2026 consolidated results",
    },
  ],
};

test("range notation is expanded so both endpoints carry unit and currency", () => {
  assert.match(expandRanges("~15-16x forward"), /15x 16x/);
  assert.match(expandRanges("toward ¥1.9-2T"), /¥1\.9T ¥2T/);
});

test("alphanumeric labels are not read as financial figures", () => {
  const tokens = extractNumerics("PS5 and PS6 in Q4 FY2026 on a V4 board").map((entry) => entry.token);
  assert.deepEqual(tokens, [], `unexpected numeric tokens: ${JSON.stringify(tokens)}`);
});

test("magnitudes, percentages and multiples normalize to comparable values", () => {
  const byToken = Object.fromEntries(extractNumerics("¥1,447B, 25%, 9.7x, 1.5M").map((n) => [n.token, n.value]));
  assert.equal(byToken["¥1,447B"], 1.447e12);
  assert.equal(byToken["25%"], 0.25);
  assert.equal(byToken["9.7x"], 9.7);
  assert.equal(byToken["1.5M"], 1.5e6);
});

test("a fully grounded narrative passes the numeric check", () => {
  const violations = validateNumericGrounding(SONY_PROSE, SONY_FACTS);
  assert.deepEqual(
    violations.map((violation) => violation.token),
    [],
    `ungrounded figures: ${JSON.stringify(violations.map((v) => v.token))}`,
  );
});

test("a fabricated figure is rejected", () => {
  const tampered = SONY_PROSE.replace("EV/EBITDA ~9.7x", "EV/EBITDA ~4.2x");
  const violations = validateNumericGrounding(tampered, SONY_FACTS);
  assert.equal(violations.length, 1);
  assert.match(violations[0].token, /4\.2x/);
  assert.equal(violations[0].rule, "numeric_grounding");
});

test("a third-party opinion stated as fact loses its attribution", () => {
  const events = [
    {
      id: "event.bernstein.downgrade",
      attribution: "third_party_opinion",
      attributed_to: "Bernstein",
      quantified_impact: { value: -30e9, unit: "JPY" },
      source: { type: "press_report", publisher: "Bernstein" },
    },
  ];
  assert.deepEqual(validateAttribution(SONY_PROSE, events), []);

  const stripped = SONY_PROSE.replace(/Bernstein expects/g, "It is established that");
  const violations = validateAttribution(stripped, events);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "attribution_preserved");
});

test("the closing paragraph of the sample is rejected as advice", () => {
  const closing =
    "For a starter position, this is one of the better setups I can point to right now: you're paying a de-rated multiple for the best diversified entertainment IP portfolio in the world.";
  const violations = validateNoAdvice({}, closing);
  const errors = violations.filter((violation) => violation.severity === "error");
  assert.ok(errors.length >= 2, "starter position and better setup must both trip the boundary");
  assert.ok(errors.some((violation) => /starter position/i.test(violation.match)));
  assert.ok(errors.some((violation) => /better setup/i.test(violation.match)));
});

test("the descriptive rewrite of that paragraph passes", () => {
  const rewritten =
    "Lo que el precio está descontando es la transición de consola. El próximo dato observable sobre esa transición son los resultados del 6 de agosto.";
  const errors = validateNoAdvice({}, rewritten).filter((violation) => violation.severity === "error");
  assert.deepEqual(errors, []);
});

test("advice-shaped fields are rejected anywhere in the object", () => {
  const violations = validateNoAdvice({ thesis: { valuation: { target_price: 30 } } }, "");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].field, "thesis.valuation.target_price");
});

test("a falsifier without a future observable date is not a falsifier", () => {
  const now = new Date("2026-07-27T00:00:00Z");
  assert.deepEqual(validateFalsifiers(SONY_THESIS.falsifiers, now), []);
  assert.equal(validateFalsifiers([], now)[0].rule, "falsifiers_required");

  const vague = [{ kpi: "Sentimiento del mercado", where_it_appears: "prensa" }];
  assert.equal(validateFalsifiers(vague, now)[0].rule, "falsifier_observable");
});

test("risk classification without justification is rejected", () => {
  assert.deepEqual(validateRiskClassification(SONY_THESIS.risk_classification), []);
  const violations = validateRiskClassification([{ label: "Sensor yields", classification: "structural" }]);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /sin justificación/);
});

test("facts without as_of or source are rejected", () => {
  const result = validateNarrative({
    prose: "Operating income was ¥1,447B.",
    facts: [{ id: "orphan", value: 1.447e12 }],
    thesis: SONY_THESIS,
    now: new Date("2026-07-27T00:00:00Z"),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.rule === "fact_provenance"));
});

test("the full contract accepts the descriptive narrative and rejects the advisory one", () => {
  const now = new Date("2026-07-27T00:00:00Z");
  const clean = validateNarrative({ prose: SONY_PROSE, facts: SONY_FACTS, thesis: SONY_THESIS, now });
  assert.equal(clean.ok, true, `unexpected errors: ${JSON.stringify(clean.errors, null, 2)}`);

  const advisory = validateNarrative({
    prose: `${SONY_PROSE}\nFor a starter position, this is one of the better setups I can point to right now.`,
    facts: SONY_FACTS,
    thesis: SONY_THESIS,
    now,
  });
  assert.equal(advisory.ok, false);
  assert.ok(advisory.errors.every((error) => error.rule === "no_advice_language"));
});
