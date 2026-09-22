import test from "node:test";
import assert from "node:assert/strict";
import { candidateClaims, eventKey, evidenceStatus, newSources } from "../lib/research/living-case.mjs";
import { createLivingCaseService } from "../lib/server/living-case-service.js";
import { signDossier, verifyDossier } from "../lib/server/filing-analysis.js";
import { THESIS_VERSION } from "../lib/server/investment-thesis.js";
import { makeRecord, reportKey } from "../lib/server/filing-report-cache.js";
import { hash } from "../lib/research/filing-engine.mjs";

test("new SEC accessions are compared with the baseline and idempotent event keys", () => {
  const baseline = { asOf: "2026-09-01T00:00:00Z", sources: [{ accession: "old", sha256: "a" }], sections: [{ id: "thesis", findings: [{ premise: "Membership revenue grew with paid renewals", text: "If renewals persist, cash flow may improve", kind: "conditional" }] }] };
  const source = { id: "D2", accession: "new", sha256: "b", acceptedAt: "2026-09-05T00:00:00Z" };
  const dossier = { sources: [{ id: "D1", accession: "old", sha256: "a", acceptedAt: "2026-08-01T00:00:00Z" }, source], sections: [{ id: "business", extracts: [{ id: "D2:1", text: "Membership revenue and paid renewals increased in the quarter." }] }] };
  assert.deepEqual(newSources(baseline, dossier).map((item) => item.accession), ["new"]);
  assert.equal(candidateClaims(baseline, dossier, source)[0].id, "thesis:0");
  assert.equal(eventKey("w", "COST", "b", "new", "thesis:0"), eventKey("w", "COST", "b", "new", "thesis:0"));
  assert.equal(evidenceStatus({ status: "available", answers: { relation: { choice: "contradicts", uncertain: false } } }), "possible_contradiction");
  assert.equal(evidenceStatus({ status: "unavailable" }), "needs_review");
});

test("living cases fail closed before reading a different workspace", async () => {
  const queries = [];
  const service = createLivingCaseService({ storageAvailable: () => true, getSql: () => ({ query: async (text, params) => { queries.push([text, params]); return []; } }) });
  await assert.rejects(service.list({ user: { id: "other" }, workspace: { id: "w" } }), /ACCESS_DENIED/);
  assert.equal(queries.length, 1);
  assert.ok(queries[0][0].includes("owner_user_id=$2"));
  assert.deepEqual(queries[0][1], ["w", "other"]);
});

test("a signed generated thesis is saved under its owner and a new filing creates a review event", async () => {
  const session = { user: { id: "11111111-1111-4111-8111-111111111111" }, workspace: { id: "private-one" } };
  const asOf = "2026-09-01T00:00:00Z";
  const old = { id: "D1", accession: "0000000001-26-000001", form: "10-K", acceptedAt: "2026-08-20T00:00:00Z", url: "https://www.sec.gov/old", sha256: "a".repeat(64) };
  const fresh = { id: "D2", accession: "0000000001-26-000002", form: "10-Q", acceptedAt: "2026-09-05T00:00:00Z", url: "https://www.sec.gov/new", sha256: "b".repeat(64) };
  const dossier = { ticker: "COST", asOf, sources: [old], sections: [], packetHash: "old" };
  const analysis = { status: "draft", version: THESIS_VERSION, language: "es", dossierHash: hash(dossier), sections: [{ id: "thesis", findings: [{ premise: "Membership revenue grew with paid renewals", text: "If renewals persist, cash flow may improve", kind: "conditional" }] }] };
  const record = makeRecord(dossier, analysis);
  const baseline = { version: THESIS_VERSION, language: "es", asOf, sources: [old], sections: analysis.sections };
  const queries = [], sent = [];
  const sql = { query: async (statement, parameters) => {
    queries.push({ statement, parameters });
    if (statement.includes("SELECT id FROM bls_workspaces")) return [{ id: session.workspace.id }];
    if (statement.includes("INSERT INTO bls_living_cases_v1")) return [{ ticker: "COST" }];
    if (statement.includes("SELECT ticker, baseline, created_at")) return [{ ticker: "COST", baseline, created_at: asOf, last_checked_at: null }];
    if (statement.includes("SELECT ticker, payload, created_at")) return [];
    if (statement.includes("SELECT baseline, baseline_key")) return [{ baseline, baseline_key: hash(baseline), last_checked_at: null }];
    if (statement.includes("SELECT DISTINCT source_accession")) return [];
    if (statement.includes("INSERT INTO bls_living_case_events_v1")) return [{ event_key: parameters[0] }];
    return [];
  } };
  const service = createLivingCaseService({
    storageAvailable: () => true, getSql: () => sql,
    verifyTicket: (candidate, ticket) => verifyDossier(candidate, ticket, "test-secret"),
    reportStore: { get: async (key) => key === reportKey(dossier, "es", THESIS_VERSION) ? record : null },
    loadDossier: async () => ({ ticker: "COST", asOf: "2026-09-06T00:00:00Z", sources: [old, fresh], sections: [{ id: "business", extracts: [{ id: "D2:1", text: "Membership revenue and paid renewals increased in the quarter." }] }] }),
    jev: { evaluate: async (_, items) => { sent.push(...items); return { items: items.map((item) => ({ id: item.id, status: "available", answers: { relation: { choice: "supports", uncertain: false } } })) }; } },
    clock: () => new Date("2026-09-06T01:00:00Z"),
  });
  const followed = await service.follow(session, { dossier, ticket: signDossier(dossier, "test-secret"), language: "es" });
  assert.equal(followed.status, "following");
  const listed = await service.list(session);
  assert.equal(listed.cases[0].baselineSections[0].findings[0].premise, analysis.sections[0].findings[0].premise);
  const checked = await service.refresh(session, "COST");
  assert.equal(checked.status, "checked");
  assert.equal(checked.newSources, 1);
  assert.equal(checked.newEvents, 2);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].ticker, "COST");
  assert.equal(JSON.stringify(sent).includes(session.workspace.id), false);
  const inserts = queries.filter((query) => query.statement.includes("INSERT INTO bls_living_case_events_v1"));
  assert.equal(inserts.length, 2);
  for (const { parameters } of inserts) assert.deepEqual(parameters.slice(1, 4), [session.workspace.id, session.user.id, "COST"]);
  assert.equal(JSON.parse(inserts[1].parameters[6]).reviewStatus, "possible_support");
  await assert.rejects(service.follow(session, { dossier, ticket: "invalid", language: "es" }), /INVALID_DOSSIER/);
});
