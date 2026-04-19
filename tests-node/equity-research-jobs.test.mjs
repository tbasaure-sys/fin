import test from "node:test";
import assert from "node:assert/strict";

import {
  createEquityResearchJob,
  getEquityResearchJob,
  getEquityResearchJobByBackendRunId,
  updateEquityResearchJob,
} from "../lib/server/data/equity-research-jobs.js";
import {
  getWorkspaceEquityResearchJob,
  startWorkspaceEquityResearch,
} from "../lib/server/equity-research.js";

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

test("equity research job start timeout remains queued and retries with same client run id", async () => {
  const previousBackend = process.env.BLS_PRIME_STORAGE_BACKEND;
  const previousBackendUrl = process.env.BLS_PRIME_BACKEND_URL;
  const previousFetch = globalThis.fetch;
  process.env.BLS_PRIME_STORAGE_BACKEND = "memory";
  process.env.BLS_PRIME_BACKEND_URL = "https://research-backend.example";

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(String(options.body || "{}"));
    calls.push({ url: String(url), body });
    if (calls.length === 1) {
      throw new Error("simulated Railway cold-start timeout");
    }
    return new Response(
      JSON.stringify({
        ok: true,
        run_id: `research-${body.client_run_id}`,
        ticker: body.ticker,
        mode: body.mode,
        status: "running",
        started_at: "2026-04-19T12:00:00.000Z",
      }),
      { status: 202, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const started = await startWorkspaceEquityResearch("timeout-retry-ws", "unh", { mode: "full" });
    assert.equal(started.ok, true);
    assert.equal(started.status, "queued");
    assert.ok(started.run_id);
    assert.equal(calls[0].body.client_run_id, started.run_id);

    const polled = await getWorkspaceEquityResearchJob("timeout-retry-ws", "UNH", started.run_id);
    assert.equal(polled.ok, true);
    assert.equal(polled.status, "running");
    assert.equal(polled.run_id, started.run_id);
    assert.equal(polled.backend_run_id, `research-${started.run_id}`);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.client_run_id, started.run_id);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) {
      delete process.env.BLS_PRIME_STORAGE_BACKEND;
    } else {
      process.env.BLS_PRIME_STORAGE_BACKEND = previousBackend;
    }
    if (previousBackendUrl === undefined) {
      delete process.env.BLS_PRIME_BACKEND_URL;
    } else {
      process.env.BLS_PRIME_BACKEND_URL = previousBackendUrl;
    }
  }
});
