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

test("an approximate valuation leads with a range, its drivers, and honest confidence", async ({ page }) => {
  await page.route("**/api/public/equity-research", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        ok: true,
        ticker: "BIOX",
        company_profile: {
          name: "Bio X",
          ticker: "BIOX",
          exchange: "NASDAQ",
          currency: "USD",
          sector: "Healthcare",
          industry: "Biotechnology",
          market_cap: 50_000_000,
        },
        financials: { annual: [], ratios: {} },
        valuation: {
          available: false,
          status: "not_decision_ready",
          currency: "USD",
          current_price: 5,
          market_data_as_of: "2026-07-28",
          price_validation: {
            status: "provider_reconciled",
            research_usable: true,
            usable_for_context: true,
            source: "Yahoo Finance chart",
          },
          reliability: { usable: false, status: "blocked", score: 0.2, reasons: [] },
        },
        sources: {
          coverage: { status: "market_only", score: 20, expected_metrics: 1, covered_expected_metrics: 1, missing_expected_metrics: [] },
          records: [{ provider: "Yahoo Finance", status: "ok", label: "Cotización fechada" }],
          data_points: [],
        },
        audit: { status: "indicative", findings: [] },
        aurora: {
          explanation: {
            provider: "huggingface",
            model: "Qwen/Qwen2.5-7B-Instruct:fastest",
            summary: "El valor depende de hitos, financiación y dilución.",
            why: [
              { title: "Hitos", explanation: "Cambian la probabilidad de éxito del activo." },
              { title: "Caja", explanation: "Define el runway antes de una nueva financiación." },
            ],
            risks: ["Dilución", "Fallo clínico"],
            confidenceExplanation: "La confianza es baja porque el rango usa un prior sectorial amplio.",
          },
        },
      }),
    });
  });

  await page.goto("/company/BIOX?lang=es");

  await expect(page.getByRole("heading", { level: 1, name: "Bio X" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Valor" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("RANGO APROXIMADO", { exact: true })).toBeVisible();
  await expect(page.getByText("Centro US$5", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Por qué da este rango" })).toBeVisible();
  await expect(page.getByText("Hitos", { exact: true })).toBeVisible();
  await expect(page.getByText("La confianza es baja porque el rango usa un prior sectorial amplio.", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Faltan datos|No se publica un rango/i);
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
