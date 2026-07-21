import { expect, test } from "@playwright/test";

const WORKSPACE_ID = process.env.BLS_PRIME_E2E_WORKSPACE_ID || "workspace-e2e-portfolio-isolation";

test.describe("Portfolio aislado por workspace", () => {
  test.skip(process.env.BLS_E2E_LOCAL_BYPASS !== "1", "Requiere el bypass local de autenticación");

  test("un usuario vacío no hereda holdings y su cartera desbloquea el diagnóstico completo", async ({ page }, testInfo) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto("/app?lang=es#holdings");
    await expect(page.getByRole("heading", { name: "Tus posiciones aparecerán aquí" })).toBeVisible();
    await expect(page.getByText("SEZL", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("portfolio-empty-hero")).toBeVisible();
    await expect(page.getByTestId("portfolio-structure-empty")).toBeVisible();
    await expect(page.getByText("Amplitud visible", { exact: true })).toHaveCount(0);
    await testInfo.attach("workspace-vacio", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

    const response = await page.request.post(`/api/v1/workspaces/${WORKSPACE_ID}/portfolio`, {
      data: {
        replacePortfolio: true,
        holdings: [
          { ticker: "AAPL", quantity: 10, avgCostUsd: 180, currentPriceUsd: 210 },
          { ticker: "MSFT", quantity: 6, avgCostUsd: 410, currentPriceUsd: 495 },
          { ticker: "GOOGL", quantity: 12, avgCostUsd: 165, currentPriceUsd: 190 },
          { ticker: "XLV", quantity: 20, avgCostUsd: 145, currentPriceUsd: 155 },
          { ticker: "SGOV", quantity: 25, avgCostUsd: 100, currentPriceUsd: 100.5 },
        ],
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId("portfolio-only-workspace")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Análisis de holdings" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Posiciones conectadas" })).toContainText("AAPL");
    await expect(page.getByTestId("portfolio-return-contribution-chart")).toBeVisible();
    await expect(page.getByText("Retorno total", { exact: true }).locator("..")).toContainText(/[+-]\d+[.,]\d%/);
    await expect(page.getByText("P&L total", { exact: true }).locator("..")).not.toContainText(/\$0(?:[.,]00)?/);
    await expect(page.getByText("Respuesta actual", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Stress Engine", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("portfolio-effective-bets")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("portfolio-cluster-list")).toBeVisible();
    await expect(page.getByTestId("portfolio-correlation-matrix")).toBeVisible();
    await expect(page.getByRole("table", { name: "Matriz de correlación del portfolio" })).toContainText("MSFT");
    await testInfo.attach("workspace-con-cartera", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

    const critical = consoleErrors.filter((message) => !/favicon|net::ERR_ABORTED/.test(message));
    expect(critical, `Errores de consola: ${critical.join("; ")}`).toHaveLength(0);
  });
});
