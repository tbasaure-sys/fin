import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchG820DailyPriceOverlay } from '../lib/g820/daily-refresh.js';

const all = JSON.parse(await readFile(new URL('../public/data/g820/current.json', import.meta.url), 'utf8'));
const fullRuntime = JSON.parse(await readFile(new URL(`../public/data/g820/snapshots/${all.meta.snapshotId}/runtime.json`, import.meta.url), 'utf8'));
const company = all.companies.find((row) => row.ticker === 'EMBC');
const index = { ...all, companies: [company] };
const runtime = { ...fullRuntime, contexts: { [company.id]: fullRuntime.contexts[company.id] } };
const options = { index, runtime, apiKey: 'test-secret', generatedAt: '2026-09-04T23:00:00Z' };

test('scheduled and bundled refresh use a dated quote and the same frozen engine context', async () => {
  const overlay = await fetchG820DailyPriceOverlay({ ...options, fetchImpl: async (url) => {
    assert.equal(url.searchParams.get('symbol'), 'EMBC');
    return { ok: true, json: async () => [{ symbol: 'EMBC', price: 5.8, date: '2026-09-04' }] };
  } });
  assert.equal(overlay.coverage.ratio, 1);
  assert.equal(overlay.schemaVersion, 'g820-daily-price-overlay-v2');
  assert.equal(overlay.companies[company.id].price, 5.8);
  assert.equal(overlay.companies[company.id].assessment.dualKey.chapter8, false);
  assert.equal(JSON.stringify(overlay).includes('test-secret'), false);
});

test('provider failure and identity mismatch fail the publication gate without leaking credentials', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('https://provider?apikey=test-secret'); },
    async () => ({ ok: true, json: async () => [{ symbol: 'WRONG', price: 5.8, date: '2026-09-04' }] }),
  ]) {
    await assert.rejects(fetchG820DailyPriceOverlay({ ...options, fetchImpl }), (error) => {
      assert.match(error.message, /coverage 0\/1/);
      assert.equal(error.message.includes('test-secret'), false);
      return true;
    });
  }
});

test('a missing engine context is not counted as a successful decision refresh', async () => {
  let calls = 0;
  await assert.rejects(fetchG820DailyPriceOverlay({ ...options, runtime: { ...runtime, contexts: {} },
    fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); },
  }), /coverage 0\/1/);
  assert.equal(calls, 0);
});
