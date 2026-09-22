import test from 'node:test';
import assert from 'node:assert/strict';
import { getCarterasDashboard } from '../lib/server/carteras-api.js';

test('portfolio integration denies missing or mismatched ownership before fetching', async () => {
  const keys = ['CARTERAS_OWNER_USER_ID','CARTERAS_WORKSPACE_ID','CARTERAS_API_BASE_URL','CARTERAS_API_TOKEN'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    Object.assign(process.env, {CARTERAS_OWNER_USER_ID:'owner-test', CARTERAS_WORKSPACE_ID:'workspace-test', CARTERAS_API_BASE_URL:'https://portfolio.example', CARTERAS_API_TOKEN:'test-token'});
    globalThis.fetch = async () => { calls++; return Response.json({ portfolios: [{ name: 'Test portfolio' }] }); };
    for (const session of [null, {}, {user:{id:'other'},workspace:{id:'workspace-test'}}, {user:{id:'owner-test'},workspace:{id:'other'}}]) {
      const result = await getCarterasDashboard('USD', session);
      assert.deepEqual(result.dashboard.portfolios, []);
      assert.equal(result.source, 'unavailable');
    }
    assert.equal(calls, 0);
    const owner = {user:{id:'owner-test'},workspace:{id:'workspace-test'}};
    const allowed = await getCarterasDashboard('USD', owner);
    assert.equal(allowed.source, 'api');
    assert.equal(calls, 2);
    delete process.env.CARTERAS_OWNER_USER_ID;
    assert.deepEqual((await getCarterasDashboard('USD', owner)).dashboard.portfolios, []);
    assert.equal(calls, 2);
    process.env.CARTERAS_OWNER_USER_ID = 'owner-test';
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.deepEqual((await getCarterasDashboard('USD', owner)).dashboard.portfolios, []);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
