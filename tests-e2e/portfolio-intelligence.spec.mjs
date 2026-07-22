import { expect, test } from "@playwright/test";

test("public portfolio intelligence demo produces concrete research names", async ({ page }) => {
  await page.goto("/channels?lang=es");

  await expect(page.getByRole("heading", { name: /Primero entiende qué apuestas tienes/i })).toBeVisible();
  await expect(page.getByText("Sezzle", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Probar descubrimiento" }).click();

  await page.getByRole("button", { name: /Flujos de salud/i }).click();
  await page.getByRole("button", { name: /Una herramienta está entrando/i }).click();
  await page.getByRole("button", { name: /Uso público/i }).click();
  await page.getByRole("button", { name: /Puedo medirlo semanalmente/i }).click();

  await expect(page.getByRole("heading", { name: "Nombres para investigar esta semana" })).toBeVisible();
  await expect(page.getByText("Intuitive Surgical", { exact: true })).toBeVisible();
  await expect(page.getByText("KPI que debe moverse", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Descártalo si", { exact: true }).first()).toBeVisible();
});
