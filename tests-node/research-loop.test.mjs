import test from "node:test";
import assert from "node:assert/strict";

import { buildResearchLoopIteration } from "../lib/server/research-loop.js";

test("research loop promotes a workspace action into a maker/checker task", () => {
  const loop = buildResearchLoopIteration(
    {
      workspace_summary: { last_updated: "2026-06-30T12:00:00.000Z" },
      state_summary: { stance: "Measured risk-on", decisionSummary: "Review ASML before adding exposure." },
      primary_action: { id: "asml-add", ticker: "ASML", title: "Review ASML add", confidence: 0.81 },
      evidence_drawer: { headline: "Bottleneck thesis active", currentRead: ["Demand pressure", "Capacity constraint"] },
      memory: { recentEvents: [{ title: "Prior ASML review" }] },
    },
    { now: "2026-06-30T14:00:00.000Z" },
  );

  assert.equal(loop.status, "ready");
  assert.equal(loop.activeTask.ticker, "ASML");
  assert.equal(loop.agents.maker.role, "research_maker");
  assert.equal(loop.agents.checker.role, "research_checker");
  assert.match(loop.nextRunPrompt, /asml-add/i);
});

test("research loop blocks thin evidence before promotion", () => {
  const loop = buildResearchLoopIteration(
    {
      workspace_summary: { last_updated: "2026-06-30T12:00:00.000Z" },
      alerts: [{ id: "thin", title: "Unexplained alert", severity: "high" }],
    },
    { now: "2026-06-30T14:00:00.000Z" },
  );

  assert.equal(loop.status, "blocked");
  assert.equal(loop.stopCondition.label, "Needs repair before promotion");
  assert.ok(loop.agents.checker.gates.some((gate) => gate.id === "evidence_floor" && gate.status === "fail"));
});

test("research loop returns idle when no task is available", () => {
  const loop = buildResearchLoopIteration({ workspace_summary: {} }, { now: "2026-06-30T14:00:00.000Z" });

  assert.equal(loop.status, "idle");
  assert.equal(loop.queue.length, 0);
});
