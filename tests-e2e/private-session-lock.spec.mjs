import { expect, test } from '@playwright/test';
test.skip(process.env.BLS_PRIVATE_SESSION_FIXTURE !== '1', 'Requires the isolated privacy fixture, which is never published.');
const content = page => page.getByTestId('private-session-content');
async function sessionFixture(page, { status = 200, scope = 'fixture-scope', ttl = 60000 } = {}) {
  let locks = 0;
  await page.route('**/api/auth/status', route => route.fulfill({ status, json: { scope, expiresAt: new Date(Date.now() + ttl).toISOString() } }));
  await page.route('**/api/auth/lock', route => { locks++; return route.fulfill({ json: { locked: true } }); });
  return () => locks;
}
test('leaving the tab masks private data immediately and revokes the session', async ({ page }) => {
  const locks = await sessionFixture(page);
  await page.goto('/qa-private-session');
  await expect(content(page)).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(content(page)).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Tu cartera está bloqueada' })).toBeVisible();
  await expect.poll(locks).toBe(1);
});
test('a browser history restore cannot reveal cached holdings', async ({ page }) => {
  const locks = await sessionFixture(page);
  await page.goto('/qa-private-session'); await expect(content(page)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(content(page)).toBeHidden(); await expect.poll(locks).toBe(1);
});
test('an expired session hides the already visible private view', async ({ page }) => {
  const locks = await sessionFixture(page, { ttl: 1500 });
  await page.goto('/qa-private-session'); await expect(content(page)).toBeVisible();
  await expect(content(page)).toBeHidden(); await expect.poll(locks).toBe(1);
});
for (const [label, options] of [['anonymous', { status: 401 }], ['another account', { scope: 'different-account' }]]) {
  test(`${label} cannot open the server-rendered private view`, async ({ page }) => {
    await sessionFixture(page, options); await page.goto('/qa-private-session');
    await expect(page.getByRole('heading', { name: 'Tu cartera está bloqueada' })).toBeVisible();
    await expect(page.getByText('Private fixture holdings')).toHaveCount(0);
  });
}
test('public navigation locks the session and cached return keeps private data hidden', async ({ page }) => {
  const locks = await sessionFixture(page);
  await page.goto('/qa-private-session'); await expect(content(page)).toBeVisible();
  await page.getByRole('link', { name: 'Public fixture' }).click();
  await expect(page.getByText('Public fixture view')).toBeVisible(); await expect.poll(locks).toBe(1);
  await page.goBack(); await expect(content(page)).toBeHidden();
});
test('a lock in another tab also masks this private view', async ({ page }) => {
  const locks = await sessionFixture(page);
  await page.goto('/qa-private-session'); await expect(content(page)).toBeVisible();
  await page.evaluate(() => { const sender = new BroadcastChannel('bls-private-lock'); sender.postMessage('lock'); setTimeout(() => sender.close(), 100); });
  await expect(content(page)).toBeHidden(); await expect.poll(locks).toBe(1);
});
