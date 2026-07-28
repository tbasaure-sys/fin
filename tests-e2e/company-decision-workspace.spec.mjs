import { expect, test } from "@playwright/test";

test("the frozen TXN demo exposes one complete decision surface", async ({ page }) => {
  await page.goto("/company/TXN?demo=1&lang=es");

  await expect(page.getByRole("heading", { level: 1, name: "Texas Instruments Incorporated" })).toBeVisible();
  await expect(page.getByText("Ejemplo congelado")).toBeVisible();
  await expect(page.getByText("Datos ilustrativos al 30 de junio de 2026. No son datos en vivo.")).toBeVisible();
  await expect(page.getByText("Lista para decisión")).toBeVisible();
  await expect(page.getByText("Lectura incierta", { exact: true })).toBeVisible();
  await expect(page.getByText("RANGO DEFENDIBLE", { exact: true })).toBeVisible();
  await expect(page.getByText("US$168", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Guardar en un workspace" })).toHaveAttribute("href", /signup/);

  await page.getByRole("tab", { name: "Evidencia" }).click();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByText("Sin brechas requeridas.")).toBeVisible();

  await page.getByRole("tab", { name: "Auditoría" }).click();
  await expect(page.getByText("institutional_valuation_v3")).toBeVisible();
  await expect(page.getByText("La auditoría no registra hallazgos abiertos.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("ASML");
});

test("the company surface remains within the mobile viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile layout contract");
  await page.goto("/company/TXN?demo=1&lang=es");
  await expect(page.getByRole("heading", { level: 1, name: "Texas Instruments Incorporated" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});

test("a private company URL preserves its exact destination when authentication is required", async ({ page }) => {
  await page.goto("/app/company/TXN");
  await expect(page).toHaveURL(/\/login\?.*next=%2Fapp%2Fcompany%2FTXN/);
});
