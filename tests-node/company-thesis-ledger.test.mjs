import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCompanyThesisLedger } from '../lib/server/company-thesis-ledger.js';
import { buildCompanyReading } from '../lib/company-reading/engine.js';
import { getCompanyReadingSnapshot } from '../lib/company-reading/snapshots.js';

test('durable ledger freezes prior readings, links evidence to a version, rejects conflicts and isolates owners', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bls-thesis-test-'));
  try {
    const store = createCompanyThesisLedger({ directory: dir, now: () => '2026-10-07T12:00:00.000Z' });
    const owner = '11111111-1111-4111-8111-111111111111';
    const one = buildCompanyReading(getCompanyReadingSnapshot('MSFT'));
    const first = await store.commit({ owner, ticker: 'MSFT', expectedVersion: 0, reading: one, snapshot: getCompanyReadingSnapshot('MSFT') });
    const original = JSON.stringify(first.events[0]);
    const two = buildCompanyReading(getCompanyReadingSnapshot('MSFT'), { growth: .02 });
    await store.commit({ owner, ticker: 'MSFT', expectedVersion: 1, reading: two, snapshot: getCompanyReadingSnapshot('MSFT') });
    await assert.rejects(store.commit({ owner, ticker: 'MSFT', expectedVersion: 1, reading: two }), e => e.status === 409);
    await store.evidence({ owner, ticker: 'MSFT', expectedVersion: 2, thesisVersion: 1 });
    const persisted = await createCompanyThesisLedger({ directory: dir }).read(owner, 'MSFT');
    assert.equal(persisted.events.length, 3);
    assert.equal(JSON.stringify(persisted.events[0]), original);
    assert.equal(persisted.events[2].payload.thesisVersion, 1);
    assert.equal(persisted.events[2].payload.assessment.originalRunId, one.runId);
    assert.equal(persisted.events[1].previousHash, persisted.events[0].hash);
    assert.equal((await store.read('22222222-2222-4222-8222-222222222222', 'MSFT')).version, 0);
    await assert.rejects(store.evidence({ owner, ticker: 'MSFT', expectedVersion: 3, thesisVersion: 3 }), /versión de tesis/i);
    const file = store.fileFor(owner, 'MSFT');
    const data = JSON.parse(await readFile(file, 'utf8'));
    data.events[0].payload.reading.assumptions.growth = .8;
    await writeFile(file, JSON.stringify(data));
    await assert.rejects(store.read(owner, 'MSFT'), /integridad/i);
    await assert.rejects(store.read('../../', 'MSFT'), /identidad/i);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('concurrent commits cannot overwrite each other', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bls-thesis-concurrent-'));
  try {
    const store = createCompanyThesisLedger({ directory: dir });
    const args = { owner: '11111111-1111-4111-8111-111111111111', ticker: 'MSFT', expectedVersion: 0, reading: buildCompanyReading(getCompanyReadingSnapshot('MSFT')), snapshot: getCompanyReadingSnapshot('MSFT') };
    const results = await Promise.allSettled([store.commit(args), store.commit(args)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await store.read(args.owner, args.ticker)).version, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
