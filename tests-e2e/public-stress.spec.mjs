import { expect, test } from "@playwright/test";

test("Stress recalcula una cartera editable con el motor público real", async ({ page }) => {
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(String(error)));

  await page.goto("/stress?lang=es");
  await expect(page).toHaveTitle("Riesgo de cartera | BLS Prime");
  await expect(page.getByRole("heading", { level: 1, name: "Riesgo de cartera" })).toBeVisible();
  await expect(page.getByText("Procedencia del cálculo", { exact: true })).toBeVisible();
  await expect(page.getByText("Cartera de ejemplo editable", { exact: false })).toBeVisible();

  await page.getByLabel("Peso MSFT", { exact: true }).fill("35");
  await page.getByLabel("Empresa a evaluar", { exact: true }).selectOption("AMD");
  await page.getByLabel("Peso propuesto", { exact: true }).selectOption("15");
  await expect(page.getByText("Hay cambios sin calcular.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Recalcular", exact: true }).click();
  await expect(page.getByText("Agregar AMD", { exact: true })).toBeVisible();
  await expect(page.getByText("Con la empresa: AMD", { exact: true })).toBeVisible();
  await expect(page.getByText("Hay cambios sin calcular.", { exact: true })).toHaveCount(0);
  expect(runtimeErrors, `Errores JS: ${runtimeErrors.join("; ")}`).toHaveLength(0);
});

test("Stress permanece dentro del viewport móvil", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Contrato responsive móvil");
  await page.goto("/stress?lang=es");
  await expect(page.getByText("Procedencia del cálculo", { exact: true })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});
