import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createReadingSnapshotStore, captureCompanyReading } from '../lib/server/company-reading-service.js';

test('capture calls canonical research for any ticker and persists a content-addressed immutable snapshot', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reading-capture-'));
  try {
    const store = createReadingSnapshotStore({ directory: dir });
    let requested;
    const s = await captureCompanyReading('AAPL', { store, backendLoader: async t => { requested = t; return { ticker: t, company_profile: { ticker: t, name: 'Test issuer', currency: 'USD' } }; }, secLoader: async () => null, now: () => '2026-10-07T12:00:00Z' });
    assert.equal(requested, 'AAPL');
    assert.match(s.id, /^snapshot-[a-f0-9]{64}$/);
    assert.deepEqual(await store.get(s.id, 'AAPL'), s);
    await assert.rejects(store.get(s.id, 'OTHER'), /empresa/i);
    assert.equal(s.facts.debt.value, null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('provider outage returns dated abstention, never the Microsoft case', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reading-outage-'));
  try {
    const s = await captureCompanyReading('ZZZZ', { store: createReadingSnapshotStore({ directory: dir }), backendLoader: async () => { throw new Error('private key must not leak'); }, secLoader: async () => { throw new Error('unavailable'); } });
    assert.equal(s.ticker, 'ZZZZ');
    assert.equal(s.facts.revenue.value, null);
    assert.ok(!JSON.stringify(s).includes('private key'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
