import { expect, test } from '@playwright/test';

test('a hypothesis refutes conclusions and the explanation follows the new run', async ({ page }) => {
  await page.goto('/company/MSFT/thesis?view=historical&lang=es');
  await expect(page.getByRole('heading', { level: 1, name: 'Microsoft Corporation' })).toBeVisible();
  await expect(page.getByText('Corte histórico al 31/07/2024', { exact: false })).toBeVisible();
  const surface = page.getByTestId('company-thesis');
  const before = await surface.getAttribute('data-run-id');
  await page.getByRole('button', { name: 'Ver y escuchar la lectura' }).click();
  await expect(page.getByTestId('snapshot-player')).toHaveAttribute('data-run-id', before);
  await page.getByRole('button', { name: 'Capítulo 4: Un intervalo condicionado' }).click();
  await expect(page.getByRole('heading', { name: 'Un intervalo condicionado', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ensayar menor crecimiento y conversión' }).click();
  const after = await surface.getAttribute('data-run-id');
  expect(after).not.toBe(before);
  await expect(page.getByTestId('snapshot-player')).toHaveAttribute('data-run-id', after);
  await expect(page.getByTestId('thesis-conclusions').getByText('Deja de sostenerse')).toHaveCount(3);
  await expect(page.getByText('Video narrado del snapshot original')).toHaveCount(0);
  await page.getByRole('button', { name: 'Capítulo 5: El supuesto que más mueve la lectura' }).click();
  await expect(page.getByTestId('snapshot-player')).toContainText('No se sostiene');
  await page.getByRole('button', { name: 'Restablecer hipótesis' }).click();
  await expect(surface).toHaveAttribute('data-run-id', before);
});

test('ledger saves immutable versions and attaches later evidence to the selected thesis', async ({ page }) => {
  await page.goto('/company/MSFT/thesis?view=historical&lang=es');
  const fix = page.getByRole('button', { name: 'Fijar esta versión' });
  await expect(fix).toBeEnabled();
  await fix.click();
  await expect(page.getByTestId('frozen-version')).toContainText('v1');
  const original = await page.getByTestId('frozen-version').textContent();
  await page.getByRole('button', { name: 'Ensayar menor crecimiento y conversión' }).click();
  await fix.click();
  await expect(page.getByTestId('frozen-version')).toContainText('v2');
  await page.getByLabel('Versión a contrastar').selectOption('1');
  await expect(page.getByTestId('frozen-version')).toHaveText(original);
  await page.getByRole('button', { name: 'Añadir evidencia posterior FY2025' }).click();
  await expect(page.getByTestId('evidence-comparison')).toContainText('Refutada');
  await expect(page.getByTestId('evidence-comparison')).toContainText('No mide capacidad predictiva');
  await page.reload();
  await page.getByLabel('Versión a contrastar').selectOption('1');
  await expect(page.getByTestId('evidence-comparison')).toContainText('Refutada');
});

test('missing debt abstains without numerical valuation or a hypothetical portfolio effect', async ({ page }) => {
  await page.goto('/company/MSFT/thesis?case=missing-debt&lang=es');
  await expect(page.getByRole('heading', { name: 'No se publica rango ni impacto en cartera.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fijar esta versión' })).toBeDisabled();
  await expect(page.getByRole('slider')).toHaveCount(0);
  await expect(page.getByText('No disponible', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ver y escuchar la lectura' }).click();
  await expect(page.getByTestId('snapshot-player')).toContainText('Esta lectura se abstiene');
});

test('reading is responsive, source-linked and has no application errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/company/MSFT/thesis?view=historical&lang=es');
  await expect(page.getByRole('heading', { name: 'Intenta romper la tesis' })).toBeVisible();
  const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
  await page.locator('#reading-3').locator('details').first().locator('summary').click();
  await expect(page.locator('#reading-3').getByRole('link', { name: 'Yahoo Finance · cierre sin ajustar ↗' }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
