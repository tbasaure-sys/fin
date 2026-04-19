import test from "node:test";
import assert from "node:assert/strict";

import {
  createEquityResearchJob,
  getEquityResearchJob,
  getEquityResearchJobByBackendRunId,
  updateEquityResearchJob,
} from "../lib/server/data/equity-research-jobs.js";

test("equity research jobs persist a durable local id and backend run mapping", async () => {
  const previousBackend = process.env.BLS_PRIME_STORAGE_BACKEND;
  process.env.BLS_PRIME_STORAGE_BACKEND = "memory";

  try {
    const created = await createEquityResearchJob("job-test-ws", " aapl ", "full", { status: "queued" });

    assert.equal(created.ticker, "AAPL");
    assert.equal(created.mode, "full");
    assert.equal(created.status, "queued");
    assert.ok(created.id);

    const running = await updateEquityResearchJob("job-test-ws", created.id, {
      status: "running",
      backendRunId: "railway-run-123",
      startedAt: "2026-04-19T12:00:00.000Z",
      payload: { backend: { status: "running" } },
    });

    assert.equal(running.id, created.id);
    assert.equal(running.backendRunId, "railway-run-123");

    const byLocalId = await getEquityResearchJob("job-test-ws", created.id);
    const byBackendId = await getEquityResearchJobByBackendRunId("job-test-ws", "railway-run-123");
    const wrongWorkspace = await getEquityResearchJob("other-ws", created.id);

    assert.equal(byLocalId.backendRunId, "railway-run-123");
    assert.equal(byBackendId.id, created.id);
    assert.equal(wrongWorkspace, null);
  } finally {
    if (previousBackend === undefined) {
      delete process.env.BLS_PRIME_STORAGE_BACKEND;
    } else {
      process.env.BLS_PRIME_STORAGE_BACKEND = previousBackend;
    }
  }
});

test("equity research jobs can persist completed artifact payloads", async () => {
  const previousBackend = process.env.BLS_PRIME_STORAGE_BACKEND;
  process.env.BLS_PRIME_STORAGE_BACKEND = "memory";

  try {
    const created = await createEquityResearchJob("artifact-test-ws", "msft", "quick");
    const completed = await updateEquityResearchJob("artifact-test-ws", created.id, {
      status: "succeeded",
      completedAt: "2026-04-19T12:05:00.000Z",
      payload: {
        ok: true,
        ticker: "MSFT",
        report_markdown: "# MSFT",
        downloads: [{ filename: "MSFT_report.md", content_base64: "IyBNU0ZU" }],
      },
      resultRunId: "6a85d266-6dbf-45b2-9243-fcf95fe14d57",
    });

    assert.equal(completed.status, "succeeded");
    assert.equal(completed.payload.report_markdown, "# MSFT");
    assert.equal(completed.payload.downloads[0].filename, "MSFT_report.md");
    assert.equal(completed.resultRunId, "6a85d266-6dbf-45b2-9243-fcf95fe14d57");
  } finally {
    if (previousBackend === undefined) {
      delete process.env.BLS_PRIME_STORAGE_BACKEND;
    } else {
      process.env.BLS_PRIME_STORAGE_BACKEND = previousBackend;
    }
  }
});
