import assert from "node:assert/strict";
import test from "node:test";

import {
  CHANNEL_ANSWER_SCHEMA,
  CHANNEL_PROFILE_VERSION,
  CHANNEL_STORAGE_KEY,
  createEmptyChannelAnswers,
  sanitizeChannelAnswers,
} from "../lib/channels/contract.js";
import { CHANNEL_QUESTIONS } from "../lib/channels/questions.js";
import { evaluateChannelProfile } from "../lib/channels/scoring.js";

const strongWorkflowAnswers = {
  version: CHANNEL_PROFILE_VERSION,
  archetypes: ["professional_workflow"],
  direct_experience: "operator",
  source_safety: "public_safe",
  public_sources: ["public_filings", "government_records", "product_docs"],
  repeatability: "weekly",
  issuer_kpi_mapping: "issuer_kpi_timing",
  testability: "repeated_predictions",
  protection_time_fit: "specialized_fit",
};

test("channel questionnaire is a versioned eight-question categorical contract", () => {
  assert.equal(CHANNEL_PROFILE_VERSION, "channel_profile_v1");
  assert.equal(CHANNEL_STORAGE_KEY, "blsprime.channel_profile.v1");
  assert.equal(CHANNEL_ANSWER_SCHEMA.version, CHANNEL_PROFILE_VERSION);
  assert.equal(CHANNEL_QUESTIONS.length, 8);
  assert.deepEqual(
    CHANNEL_QUESTIONS.map((question) => question.id),
    [
      "archetypes",
      "direct_experience",
      "source_safety",
      "public_sources",
      "repeatability",
      "issuer_kpi_mapping",
      "testability",
      "protection_time_fit",
    ],
  );

  for (const question of CHANNEL_QUESTIONS) {
    assert.ok(["single", "multi"].includes(question.type));
    assert.equal(question.required, true);
    assert.ok(question.prompt.es.length > 10);
    assert.ok(question.prompt.en.length > 10);
    assert.ok(question.help.es.length > 10);
    assert.ok(question.help.en.length > 10);
    assert.ok(question.options.length >= 4);
    assert.equal(new Set(question.options.map((option) => option.value)).size, question.options.length);
    for (const option of question.options) {
      assert.ok(option.label.es);
      assert.ok(option.label.en);
      assert.ok(option.description.es);
      assert.ok(option.description.en);
    }
  }

  assert.deepEqual(createEmptyChannelAnswers(), {
    version: CHANNEL_PROFILE_VERSION,
    archetypes: [],
    direct_experience: "",
    source_safety: "",
    public_sources: [],
    repeatability: "",
    issuer_kpi_mapping: "",
    testability: "",
    protection_time_fit: "",
  });
});

test("sanitizeChannelAnswers keeps only current categorical values and never drops sensitive markers", () => {
  const raw = {
    version: "obsolete_or_injected",
    archetypes: [
      " consumer_behavior ",
      "professional_workflow",
      "consumer_behavior",
      "bogus",
      "technical_product",
      "local_geographic",
    ],
    direct_experience: " OPERATOR ",
    source_safety: "PUBLIC_SAFE",
    public_sources: [
      "product_docs",
      "bogus",
      "public_filings",
      "patient",
      "public_prices",
      "client",
      "government_records",
    ],
    repeatability: "weekly",
    issuer_kpi_mapping: "issuer_kpi_timing",
    testability: "repeated_predictions",
    protection_time_fit: "specialized_fit",
    injected: "must disappear",
  };

  const clean = sanitizeChannelAnswers(raw);

  assert.deepEqual(clean, {
    version: CHANNEL_PROFILE_VERSION,
    archetypes: ["consumer_behavior", "professional_workflow", "technical_product"],
    direct_experience: "operator",
    source_safety: "public_safe",
    public_sources: ["product_docs", "public_filings", "public_prices", "patient", "client"],
    repeatability: "weekly",
    issuer_kpi_mapping: "issuer_kpi_timing",
    testability: "repeated_predictions",
    protection_time_fit: "specialized_fit",
  });
  assert.equal(raw.direct_experience, " OPERATOR ");
  assert.equal(Object.hasOwn(clean, "injected"), false);
});

test("evaluation hard-blocks sensitive sources even when public-safe was selected", () => {
  const result = evaluateChannelProfile({
    ...strongWorkflowAnswers,
    public_sources: ["product_docs", "patient"],
  });

  assert.equal(result.status, "blocked_sensitive");
  assert.equal(result.safety.blocked, true);
  assert.equal(result.score, 0);
  assert.equal(result.hypotheses.length, 0);
  assert.ok(result.safety.reasons.some((reason) => reason.code === "sensitive_source_patient"));
});

test("evaluation blocks a profile unless public-safe use is explicit", () => {
  const result = evaluateChannelProfile({
    ...strongWorkflowAnswers,
    source_safety: "unsure",
  });

  assert.equal(result.status, "blocked_sensitive");
  assert.ok(result.safety.reasons.some((reason) => reason.code === "public_safety_not_confirmed"));
  assert.equal(result.hypotheses.length, 0);
});

test("weak public-safe observations remain insufficient rather than becoming an edge claim", () => {
  const result = evaluateChannelProfile({
    archetypes: ["professional_workflow"],
    direct_experience: "occasional",
    source_safety: "public_safe",
    public_sources: ["public_observation"],
    repeatability: "one_off",
    issuer_kpi_mapping: "none",
    testability: "narrative",
    protection_time_fit: "none",
  });

  assert.equal(result.status, "insufficient");
  assert.equal(result.safety.blocked, false);
  assert.ok(result.score < 40);
  assert.equal(result.hypotheses.length, 0);
  assert.match(result.scoreDefinition.es, /aptitud de investigación/i);
  assert.match(result.scoreDefinition.en, /research aptitude/i);
});

test("strong healthcare-like workflow experience becomes probe-ready, never a validated edge", () => {
  const result = evaluateChannelProfile(strongWorkflowAnswers);

  assert.equal(result.status, "probe_ready");
  assert.equal(result.safety.blocked, false);
  assert.equal(result.score, 98);
  assert.equal(
    Object.values(result.scores).reduce((total, criterion) => total + criterion.max, 0),
    100,
  );
  assert.equal(result.hypotheses.length, 1);
  assert.equal(result.hypotheses[0].archetype, "professional_workflow");
  assert.equal(result.hypotheses[0].stage, "unvalidated_hypothesis");
  assert.ok(result.hypotheses[0].title.es);
  assert.ok(result.hypotheses[0].title.en);
  assert.match(result.hypotheses[0].summary.es, /no es una ventaja validada/i);
  assert.match(result.hypotheses[0].summary.en, /not a validated edge/i);
  for (const field of [
    "protection",
    "observable",
    "publicProof",
    "economicLink",
    "falsifier",
    "firstProbe45m",
    "radarSeed",
  ]) {
    assert.ok(result.hypotheses[0][field].es);
    assert.ok(result.hypotheses[0][field].en);
  }
  assert.ok(result.hypotheses[0].sources.length > 0);
  assert.ok(result.hypotheses[0].sources[0].es);
  assert.ok(result.hypotheses[0].sources[0].en);
});

test("evaluation returns at most three deterministically ranked hypotheses", () => {
  const answers = {
    ...strongWorkflowAnswers,
    archetypes: [
      "consumer_behavior",
      "professional_workflow",
      "technical_product",
      "local_geographic",
      "public_records",
    ],
    public_sources: ["product_docs", "public_observation", "public_prices"],
  };

  const first = evaluateChannelProfile(answers);
  const second = evaluateChannelProfile(answers);

  assert.deepEqual(first, second);
  assert.equal(first.hypotheses.length, 3);
  assert.deepEqual(first.hypotheses.map((hypothesis) => hypothesis.rank), [1, 2, 3]);
  assert.deepEqual(
    first.hypotheses.map((hypothesis) => hypothesis.archetype),
    ["professional_workflow", "technical_product", "consumer_behavior"],
  );
});
