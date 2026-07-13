import assert from "node:assert/strict";
import test from "node:test";

process.env.BLS_PRIME_STORAGE_BACKEND = "memory";

const {
  deleteWorkspaceChannelProfile,
  getWorkspaceChannelProfile,
  saveWorkspaceChannelProfile,
} = await import("../lib/server/data/channel-profiles.js");

test("channel profiles remain isolated by workspace and can be deleted", async () => {
  const firstWorkspace = "channel-profile-test-a";
  const secondWorkspace = "channel-profile-test-b";

  await deleteWorkspaceChannelProfile(firstWorkspace);
  await deleteWorkspaceChannelProfile(secondWorkspace);

  await saveWorkspaceChannelProfile(firstWorkspace, {
    schemaVersion: "channel_profile_v1",
    answers: { safety: "public_only", domains: ["healthcare"] },
    result: { status: "probe_ready", hypotheses: [{ id: "workflow" }] },
  });
  await saveWorkspaceChannelProfile(secondWorkspace, {
    schemaVersion: "channel_profile_v1",
    answers: { safety: "public_only", domains: ["software"] },
    result: { status: "channel_hypothesis", hypotheses: [{ id: "technical_product" }] },
  });

  const first = await getWorkspaceChannelProfile(firstWorkspace);
  const second = await getWorkspaceChannelProfile(secondWorkspace);

  assert.equal(first.workspaceId, firstWorkspace);
  assert.deepEqual(first.answers.domains, ["healthcare"]);
  assert.deepEqual(second.answers.domains, ["software"]);
  assert.notDeepEqual(first.result, second.result);

  assert.equal(await deleteWorkspaceChannelProfile(firstWorkspace), true);
  assert.equal(await getWorkspaceChannelProfile(firstWorkspace), null);
  assert.ok(await getWorkspaceChannelProfile(secondWorkspace));

  await deleteWorkspaceChannelProfile(secondWorkspace);
});
