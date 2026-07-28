import { test, expect } from "@playwright/test";

const liveRun = {
  mode: "live",
  generatedAt: "2026-07-28T14:05:00.000Z",
  datasetAsOf: "2026-07-28",
  frequency: "Actualización bajo demanda · caché máxima 15 min",
  providerStatus: { requested: 4, succeeded: 3, failed: 1 },
  accepted: true,
  spec: {
    name: "FactorLab",
    version: "0.4",
    sources: {
      market: { adapter: "Yahoo Finance chart" },
      fundamentals: { adapter: "SEC company facts" },
    },
  },
  summary: { universeTotal: 3, eligible: 3, returned: 3, abstain: 0 },
  pipeline: [{ id: "gates", plain: "Controls current liquidity and evidence coverage." }],
  audit: ["3 live files evaluated."],
  candidates: ["LIVE", "NOW", "SEC"].map((ticker, index) => ({
    ticker,
    name: `${ticker} Systems`,
    globalRank: index + 1,
    rankWithinType: index + 1,
    opportunityTypeLabel: { es: "Mejora operativa", en: "Operating inflection" },
    opportunityScore: 72 - index,
    dataCompleteness: 0.82,
    marketCapUsd: 240_000_000 + index * 20_000_000,
    advUsd: 4_800_000,
    fcfYield: 0.08,
    narrative: {
      es: { thesis: "Tesis construida desde datos presentados.", whyNow: "El filing actual muestra mejora.", killCriteria: "La mejora se revierte." },
      en: { thesis: "Thesis built from filed data.", whyNow: "The current filing shows improvement.", killCriteria: "The improvement reverses." },
    },
  })),
};

async function serveLiveFactorLab(page) {
  await page.route("**/api/public/factorlab**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, run: liveRun }),
  }));
}

test.describe("FactorLab decision workspace", () => {
  test("declara datos live, separa ambos rankings y conserva filtros compartibles", async ({ page }) => {
    await serveLiveFactorLab(page);
    await page.goto(
      "/factorlab?lang=es&universe=tradable&topK=3&minAdvUsd=250000&maxMarketCapUsd=2000000000&maxResidualVol=0.7&diagnostics=0",
    );

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Descubre qué empresa merece tu próxima hora.");
    await expect(page.getByLabel("Estado de los datos").getByText("Live", { exact: true })).toBeVisible();
    await expect(page.getByText(/Datos de mercado al 28 jul 2026/)).toBeVisible();
    await expect(page.getByText(/3 de 4 empresas actualizadas/)).toBeVisible();
    await expect(page.locator("main").getByText("Demo", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Ranking global", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Dentro de su arquetipo", { exact: true }).first()).toBeVisible();
    await expect(page.locator("article[data-candidate]")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Abrir ficha" }).first()).toHaveAttribute("href", /\/company\/[A-Z0-9.-]+\?lang=es/);
    await expect(page.getByRole("link", { name: /Añadir a cola · requiere cuenta/ }).first()).toHaveAttribute("href", /\/login\?/);
    await expect(page.locator("main pre, section pre")).toHaveCount(0);
    await expect(page).toHaveURL(/topK=3/);
    await expect(page).not.toHaveURL(/asof=/);
  });

  test("mueve parámetros y JSON a Metodología y auditoría", async ({ page }) => {
    await serveLiveFactorLab(page);
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
