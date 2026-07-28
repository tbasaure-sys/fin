import { test, expect } from "@playwright/test";

test.describe("FactorLab decision workspace", () => {
  test("declara el snapshot demo, separa ambos rankings y conserva filtros compartibles", async ({ page }) => {
    await page.goto(
      "/factorlab?lang=es&asof=2026-06-24&universe=tradable&topK=3&minAdvUsd=250000&maxMarketCapUsd=2000000000&maxResidualVol=0.7&diagnostics=0",
    );

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Descubre qué empresa merece tu próxima hora.");
    await expect(page.getByLabel("Estado de los datos").getByText("Demo", { exact: true })).toBeVisible();
    await expect(page.getByText("Datos al 24 jun 2026", { exact: true })).toBeVisible();
    await expect(page.getByText("Snapshot fijo · sin actualización automática", { exact: true })).toBeVisible();
    await expect(page.getByText("Ranking global", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Dentro de su arquetipo", { exact: true }).first()).toBeVisible();
    await expect(page.locator("article[data-candidate]")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Abrir ficha" }).first()).toHaveAttribute("href", /\/company\/[A-Z0-9.-]+\?lang=es/);
    await expect(page.getByRole("link", { name: /Añadir a cola · requiere cuenta/ }).first()).toHaveAttribute("href", /\/login\?/);
    await expect(page.locator("main pre, section pre")).toHaveCount(0);
    await expect(page).toHaveURL(/topK=3/);
  });

  test("mueve parámetros y JSON a Metodología y auditoría", async ({ page }) => {
    await page.goto("/factorlab?lang=es");
    await page.getByRole("button", { name: "Metodología y auditoría" }).click();

    await expect(page.getByRole("dialog", { name: "Metodología y auditoría" })).toBeVisible();
    await expect(page.getByText("Versión del modelo", { exact: true })).toBeVisible();
    await expect(page.getByText("0.4", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar JSON" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Descargar JSON" })).toBeVisible();
  });

  test("el workspace privado exige sesión y conserva el destino", async ({ page }) => {
    await page.goto("/app/discover?lang=es&topK=4");
    await expect(page).toHaveURL(/\/login\?.*next=%2Fapp%2Fdiscover/);
  });
});
