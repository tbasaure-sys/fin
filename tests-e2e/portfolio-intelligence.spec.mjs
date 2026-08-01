import { expect, test } from "@playwright/test";

test("public channel finder produces concrete, falsifiable research hypotheses", async ({ page }) => {
  await page.goto("/channels?lang=es");

  await expect(page.getByRole("heading", { name: /Dónde podrías ver algo antes o mejor que el mercado/i })).toBeVisible();
  await page.getByRole("button", { name: "Descubrir mis canales" }).click();

  for (const label of [
    "Flujo profesional",
    "Usuario u operador experto",
    "Sí, solo información pública y permitida",
    "Filings y reportes públicos",
    "Semanal",
    "Emisor, KPI y ventana temporal",
    "Puedo repetir predicciones comparables",
    "Interpretación especializada, con tiempo suficiente",
  ]) {
    await page.getByRole(/Filings y reportes públicos/.test(label) || label === "Flujo profesional" ? "checkbox" : "radio", { name: new RegExp(label, "i") }).check();
    const finish = label === "Interpretación especializada, con tiempo suficiente";
    await page.getByRole("button", { name: finish ? "Ver mi diagnóstico" : "Continuar" }).click();
  }

  await expect(page.getByRole("heading", { name: "Tu mapa de canales" })).toBeVisible();
  await expect(page.getByText("Plausible · no validado", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Canales plausibles para investigar" })).toBeVisible();
  await expect(page.getByText("Primera refutación", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Prueba de 45 minutos", { exact: true }).first()).toBeVisible();
});
