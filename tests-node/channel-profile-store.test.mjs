import assert from "node:assert/strict";
import test from "node:test";

process.env.BLS_PRIME_STORAGE_BACKEND = "memory";

const {
  deleteWorkspaceChannelProfile,
  getWorkspaceChannelProfile,
  saveWorkspaceChannelProfile,
} = await import("../lib/server/data/channel-profiles.js");

const completePublicAnswers = {
  version: "channel_profile_v1",
  archetypes: ["professional_workflow"],
  direct_experience: "operator",
  source_safety: "public_safe",
  public_sources: ["public_filings", "product_docs"],
  repeatability: "weekly",
  issuer_kpi_mapping: "issuer_kpi_timing",
  testability: "repeated_predictions",
  protection_time_fit: "specialized_fit",
};

test("channel profiles remain isolated by workspace and can be deleted", async () => {
  const firstWorkspace = "channel-profile-test-a";
  const secondWorkspace = "channel-profile-test-b";

  await deleteWorkspaceChannelProfile(firstWorkspace);
  await deleteWorkspaceChannelProfile(secondWorkspace);

  await saveWorkspaceChannelProfile(firstWorkspace, {
    schemaVersion: "channel_profile_v1",
    answers: completePublicAnswers,
    result: { status: "forged_status", safety: { blocked: false } },
  });
  await saveWorkspaceChannelProfile(secondWorkspace, {
    schemaVersion: "channel_profile_v1",
    answers: {
      ...completePublicAnswers,
      archetypes: ["technical_product"],
      public_sources: ["public_prices", "product_docs"],
    },
    result: { status: "forged_status", safety: { blocked: false } },
  });

  const first = await getWorkspaceChannelProfile(firstWorkspace);
  const second = await getWorkspaceChannelProfile(secondWorkspace);

  assert.equal(first.workspaceId, firstWorkspace);
  assert.deepEqual(first.answers.archetypes, ["professional_workflow"]);
  assert.deepEqual(second.answers.archetypes, ["technical_product"]);
  assert.equal(first.result.status, "probe_ready");
  assert.equal(second.result.status, "probe_ready");
  assert.equal(first.result.safety.blocked, false);
  assert.notDeepEqual(first.result, second.result);

  assert.equal(await deleteWorkspaceChannelProfile(firstWorkspace), true);
  assert.equal(await getWorkspaceChannelProfile(firstWorkspace), null);
  assert.ok(await getWorkspaceChannelProfile(secondWorkspace));

  await deleteWorkspaceChannelProfile(secondWorkspace);
});

test("direct channel-profile storage rejects sensitive answers even behind a forged allowed result", async () => {
  const cases = [
    {
      workspaceId: "channel-profile-sensitive-patient",
      answers: {
        ...completePublicAnswers,
        public_sources: ["public_filings", "product_docs", "patient"],
      },
    },
    {
      workspaceId: "channel-profile-sensitive-client",
      answers: {
        ...completePublicAnswers,
        source_safety: "client",
        public_sources: ["public_filings", "product_docs"],
      },
    },
  ];

  for (const fixture of cases) {
    await deleteWorkspaceChannelProfile(fixture.workspaceId);
    await assert.rejects(
      saveWorkspaceChannelProfile(fixture.workspaceId, {
        schemaVersion: "channel_profile_v1",
        answers: fixture.answers,
        result: {
          version: "channel_profile_v1",
          status: "probe_ready",
          safety: { blocked: false, reasons: [] },
          answers: completePublicAnswers,
        },
      }),
      /cannot be stored/i,
    );
    assert.equal(await getWorkspaceChannelProfile(fixture.workspaceId), null);
  }
});

test("direct channel-profile storage rejects malformed or incomplete answers before writing", async () => {
  const cases = [
    ["channel-profile-malformed", null],
    [
      "channel-profile-incomplete",
      {
        ...completePublicAnswers,
        testability: "",
      },
    ],
  ];

  for (const [workspaceId, answers] of cases) {
    await deleteWorkspaceChannelProfile(workspaceId);
    await assert.rejects(
      saveWorkspaceChannelProfile(workspaceId, {
        schemaVersion: "channel_profile_v1",
        answers,
        result: { status: "probe_ready", safety: { blocked: false } },
      }),
      /cannot be stored|complete/i,
    );
    assert.equal(await getWorkspaceChannelProfile(workspaceId), null);
  }
});

test("legacy sensitive or malformed memory profiles are never returned and are purged", async () => {
  const fixtures = [
    {
      workspaceId: "legacy-memory-sensitive",
      answers: {
        ...completePublicAnswers,
        public_sources: ["public_filings", "patient"],
      },
    },
    {
      workspaceId: "legacy-memory-malformed",
      answers: {
        ...completePublicAnswers,
        testability: "not-a-current-category",
      },
    },
  ];

  for (const fixture of fixtures) {
    globalThis.__BLS_CHANNEL_PROFILES__.set(fixture.workspaceId, {
      workspaceId: fixture.workspaceId,
      schemaVersion: "channel_profile_v1",
      answers: fixture.answers,
      result: {
        version: "channel_profile_v1",
        status: "probe_ready",
        safety: { blocked: false, reasons: [] },
      },
      updatedAt: "2026-07-01T00:00:00.000Z",
    });

    assert.equal(await getWorkspaceChannelProfile(fixture.workspaceId), null);
    assert.equal(globalThis.__BLS_CHANNEL_PROFILES__.has(fixture.workspaceId), false);
  }
});

test("legacy sensitive or malformed Neon rows are never returned and are deleted", async () => {
  const fixtures = [
    {
      workspaceId: "legacy-neon-sensitive",
      answers: {
        ...completePublicAnswers,
        source_safety: "client",
      },
    },
    {
      workspaceId: "legacy-neon-malformed",
      answers: {
        ...completePublicAnswers,
        public_sources: "public_filings",
      },
    },
  ];

  for (const fixture of fixtures) {
    const queries = [];
    const sql = {
      async query(statement, parameters) {
        queries.push({ statement, parameters });
        if (/^\s*SELECT\b/i.test(statement)) {
          return [{
            schema_version: "channel_profile_v1",
            answers: fixture.answers,
            result: {
              version: "channel_profile_v1",
              status: "probe_ready",
              safety: { blocked: false, reasons: [] },
            },
            updated_at: "2026-07-01T00:00:00.000Z",
          }];
        }
        if (/^\s*DELETE\b/i.test(statement)) return [{ workspace_id: fixture.workspaceId }];
        throw new Error(`Unexpected SQL in test: ${statement}`);
      },
    };

    assert.equal(await getWorkspaceChannelProfile(fixture.workspaceId, { sql }), null);
    assert.equal(queries.length, 2);
    assert.match(queries[0].statement, /SELECT schema_version, answers, result, updated_at/i);
    assert.match(queries[1].statement, /DELETE FROM bls_channel_profiles/i);
    assert.deepEqual(queries[1].parameters, [fixture.workspaceId]);
  }
});
