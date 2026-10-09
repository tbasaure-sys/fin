import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';

const moduleUrl = source => 'data:text/javascript,' + encodeURIComponent(source);
const secret = 'isolated-auth-test-secret';
const token = 'isolated-test-token';
const fixture = { hash: '', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), inserted: null };
globalThis.__privateSessionPolicyFixture = fixture;
fixture.sql = { async query(sql, args = []) {
  if (sql.includes('DELETE FROM bls_auth_sessions')) { fixture.deleted = args[0]; return []; }
  if (sql.includes('FROM bls_auth_sessions')) return args[0] === fixture.hash ? [{ session_id: 'session-fixture', user_id: 'user-fixture', email: 'fixture@example.invalid', display_name: 'Fixture', plan: 'free', created_at: fixture.createdAt, expires_at: fixture.expiresAt }] : [];
  if (sql.includes('WHERE w.owner_user_id')) return [{ id: 'workspace-fixture', name: 'Fixture workspace' }];
  if (sql.includes('FROM bls_user_profiles')) return [{ id: 'user-fixture', email: 'fixture@example.invalid', plan: 'free', password_hash: `scrypt$testsalt$${crypto.scryptSync('test-password', 'testsalt', 64).toString('hex')}` }];
  if (sql.includes('INSERT INTO bls_auth_sessions')) fixture.inserted = args;
  return [];
}};
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('data:')) return next(specifier, context);
  if (specifier === 'next/server') return { shortCircuit: true, url: import.meta.resolve('next/server.js') };
  if (specifier === '@/lib/server/auth/session') return { shortCircuit: true, url: new URL('../lib/server/auth/session.js', import.meta.url).href };
  if (specifier === '@/lib/company-reading/request-origin') return { shortCircuit: true, url: new URL('../lib/company-reading/request-origin.js', import.meta.url).href };
  if (!context.parentURL?.endsWith('/auth/session.js')) return next(specifier, context);
  if (specifier === 'next/headers') return { shortCircuit: true, url: moduleUrl('export const cookies=()=>({get:()=>null});') };
  if (specifier === 'next/navigation') return { shortCircuit: true, url: moduleUrl('export const redirect=url=>{throw Error(url)};') };
  if (specifier === '../billing.js') return { shortCircuit: true, url: moduleUrl('export const ensureBillingAccount=async()=>{}; export const buildPlanContext=async()=>({id:"free",access:{}}); export const normalizePlanSlug=x=>x; export const sessionHasPrivateWorkspaceAccess=()=>true;') };
  if (specifier === '../data/neon.js') return { shortCircuit: true, url: moduleUrl('export const usingNeonStorage=()=>true; export const getNeonSql=()=>globalThis.__privateSessionPolicyFixture.sql;') };
  if (specifier === '../data/workspaces.js') return { shortCircuit: true, url: moduleUrl('export const ensureWorkspaceRecord=async()=>{};') };
  if (specifier === '../config.js') return { shortCircuit: true, url: moduleUrl('export const getPublicAppUrl=()=>"https://www.blsprime.com"; export const getServerConfig=()=>({});') };
  return next(specifier, context);
}});
process.env.BLS_PRIME_AUTH_SECRET = secret;
const auth = await import('../lib/server/auth/session.js');
const request = { cookies: { get: () => ({ value: token }) } };
const hash = prefix => crypto.createHmac('sha256', secret).update(prefix + token).digest('hex');

test('sessions created under the old persistent authentication policy cannot reopen holdings', async () => {
  fixture.hash = hash('');
  assert.equal(await auth.getRequestAuthSession(request), null);
});
test('password sessions older than fifteen minutes fail even when database expiry is still in the future', async () => {
  fixture.hash = hash('password-session-v2:');
  fixture.createdAt = new Date(Date.now() - 16 * 60000).toISOString();
  assert.equal(await auth.getRequestAuthSession(request), null);
});
test('a recent password session resolves only its authenticated workspace', async () => {
  fixture.hash = hash('password-session-v2:'); fixture.createdAt = new Date().toISOString();
  const session = await auth.getRequestAuthSession(request);
  assert.equal(session.user.id, 'user-fixture'); assert.equal(session.workspace.id, 'workspace-fixture');
});
test('authentication cookie is a browser session cookie; deletion still expires it', () => {
  const options = auth.getSessionCookieOptions(new Date(Date.now() + 900000));
  assert.equal(options.httpOnly, true); assert.equal(options.path, '/');
  assert.equal(options.expires, undefined); assert.equal(options.maxAge, undefined);
  assert.equal(auth.getSessionCookieOptions(new Date(0)).expires.getTime(), 0);
});
test('successful password authentication caps server expiry at fifteen minutes despite legacy days setting', async () => {
  process.env.BLS_PRIME_SESSION_DAYS = '30'; const before = Date.now();
  const session = await auth.signInWithPassword({ email: 'fixture@example.invalid', password: 'test-password' });
  assert.ok(session.expiresAt.getTime() <= before + 900000 + 1000);
  assert.equal(fixture.inserted[1], crypto.createHmac('sha256', secret).update('password-session-v2:' + session.token).digest('hex'));
});
test('locking the view revokes its server token and expires its cookie; a foreign origin cannot issue the lock', async () => {
  const route = await import(moduleUrl(await readFile(new URL('../app/api/auth/lock/route.js', import.meta.url), 'utf8')));
  const { NextRequest } = await import('next/server.js');
  fixture.deleted = null;
  const foreign = new NextRequest('https://www.blsprime.com/api/auth/lock', { method: 'POST', headers: { host: 'www.blsprime.com', origin: 'https://other.invalid', cookie: `bls_prime_session=${token}` } });
  assert.equal((await route.POST(foreign)).status, 403); assert.equal(fixture.deleted, null);
  const own = new NextRequest('https://www.blsprime.com/api/auth/lock', { method: 'POST', headers: { host: 'www.blsprime.com', origin: 'https://www.blsprime.com', cookie: `bls_prime_session=${token}` } });
  const response = await route.POST(own);
  assert.equal(response.status, 200); assert.equal(fixture.deleted, hash('password-session-v2:'));
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.match(response.headers.get('cache-control'), /no-store/);
});
