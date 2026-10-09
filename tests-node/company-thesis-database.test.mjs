import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanyThesisLedger } from '../lib/server/company-thesis-ledger.js';
import { getCompanyReadingSnapshot } from '../lib/company-reading/snapshots.js';
import { buildCompanyReading } from '../lib/company-reading/engine.js';
import { createCompanyReadingRepository, accountThesisOwner } from '../lib/server/data/company-reading.js';

test('account identity is stable across browsers, distinct by workspace, with an isolated guest namespace', () => {
  const session = { user: { id: 'user-1' }, workspace: { id: 'workspace-1' } };
  assert.equal(accountThesisOwner(session), accountThesisOwner(structuredClone(session)));
  assert.match(accountThesisOwner(session), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.notEqual(accountThesisOwner(session), accountThesisOwner({ ...session, workspace: { id: 'other' } }));
  const queries = [];
  const sql = { query: async (query, params) => { queries.push({ query, params }); return []; } };
  return createCompanyReadingRepository({ sql, scope: 'guest' }).load(accountThesisOwner(session), 'MSFT').then(() => { assert.ok(queries.at(-1).params.includes('guest')); });
});
test('database ledger uses optimistic append and verifies frozen history after reloading', async () => {
  let data = null;
  const repository = { load: async () => data, compareAndAppend: async (_, __, expected, next) => { if ((data?.version || 0) !== expected) return false; data = structuredClone(next); return true; } };
  const store = createCompanyThesisLedger({ repository, now: () => '2026-10-07T12:00:00Z' });
  const snapshot = getCompanyReadingSnapshot('MSFT'), reading = buildCompanyReading(snapshot);
  const owner = '11111111-1111-4111-8111-111111111111';
  await store.commit({ owner, ticker: 'MSFT', expectedVersion: 0, reading, snapshot });
  const first = JSON.stringify(data.events[0]);
  await store.evidence({ owner, ticker: 'MSFT', expectedVersion: 1, thesisVersion: 1 });
  assert.equal(JSON.stringify((await store.read(owner, 'MSFT')).events[0]), first);
  await assert.rejects(store.commit({ owner, ticker: 'MSFT', expectedVersion: 1, reading, snapshot }), e => e.status === 409);
  data.events[0].payload.reading.valuation.central.value = 1;
  await assert.rejects(store.read(owner, 'MSFT'), /integridad/i);
});
