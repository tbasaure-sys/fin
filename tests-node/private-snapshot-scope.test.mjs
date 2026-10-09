import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
const moduleUrl = source => 'data:text/javascript,' + encodeURIComponent(source);
let session = null, loads = [];
globalThis.__privateSnapshotScopeFixture = { auth: () => session, load: workspaceId => { loads.push(workspaceId); return { workspace_summary: { id: workspaceId }, modules: { portfolio: { holdings: [{ ticker: 'OWNED-FIXTURE' }] } } }; } };
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('data:')) return next(specifier, context);
  if (specifier.includes('auth/session')) return { shortCircuit: true, url: moduleUrl('export const requireApiAuthSession=async()=>globalThis.__privateSnapshotScopeFixture.auth()||Response.json({error:"Authentication required"},{status:401});') };
  if (specifier.includes('dashboard-service')) return { shortCircuit: true, url: moduleUrl('export const getWorkspaceDashboard=async id=>globalThis.__privateSnapshotScopeFixture.load(id);') };
  if (specifier.includes('backend-snapshot')) return { shortCircuit: true, url: moduleUrl('export const buildUnavailableSnapshot=()=>({});') };
  if (specifier.includes('server/backend')) return { shortCircuit: true, url: moduleUrl('export const fetchBackendSnapshot=async()=>({portfolio:{holdings:[{ticker:"OTHER-OWNER-FIXTURE"}]}});') };
  return next(specifier, context);
}});
const route = await import(moduleUrl(await readFile(new URL('../app/api/snapshot/route.js', import.meta.url), 'utf8')));
test('legacy snapshot denies anonymous access and never returns the global owner portfolio to another account', async () => {
  assert.equal((await route.GET(new Request('https://example.invalid/api/snapshot'))).status, 401);
  assert.equal(loads.length, 0);
  session = { user: { id: 'account-fixture' }, workspace: { id: 'workspace-fixture' } };
  const response = await route.GET(new Request('https://example.invalid/api/snapshot'));
  const payload = await response.json();
  assert.equal(JSON.stringify(payload).includes('OTHER-OWNER-FIXTURE'), false);
  assert.deepEqual(loads, ['workspace-fixture']);
  assert.equal(payload.workspace_summary.id, 'workspace-fixture');
});
