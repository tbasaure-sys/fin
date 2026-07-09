import { test, expect } from "@playwright/test";

const EMAIL = process.env.BLS_E2E_EMAIL;
const PASSWORD = process.env.BLS_E2E_PASSWORD;

test.describe("Workspace autenticado", () => {
  test.skip(!EMAIL || !PASSWORD, "Define BLS_E2E_EMAIL y BLS_E2E_PASSWORD");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login?intent=signin&lang=es");
    await page.getByLabel(/Email/i).fill(EMAIL);
    await page.getByLabel(/Contraseña/i).fill(PASSWORD);
    await page.getByRole("button", { name: /Iniciar sesión/i }).click();
    await page.waitForURL(/\/app/);
  });

  test("navegación por secciones actualiza el hash y el contenido", async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    for (const section of ["holdings", "aurora", "mosaic"]) {
      await page.goto(`/app#${section}`);
      await expect(page.locator(`#${section}`)).toBeVisible();
    }
    const critical = consoleErrors.filter((t) => !/favicon|net::ERR_ABORTED/.test(t));
    expect(critical, `Errores de consola: ${critical.join("; ")}`).toHaveLength(0);
  });

  test("stress engine corre y muestra CVaR", async ({ page }) => {
    await page.goto("/app#holdings");
    const panel = page.locator("#stress-engine-panel");
    await expect(panel).toBeVisible();
    // El CVaR aparece como valor fuerte dentro del panel de respuesta.
    await expect(panel.locator("article").first().locator("strong").first()).not.toHaveText("-", { timeout: 45_000 });
  });

  test("agregar y eliminar una posición vía edición directa", async ({ page }) => {
    await page.goto("/app#holdings");
    const tickerInput = page.getByPlaceholder("AAPL").first();
    await tickerInput.fill("SPY");
    await page.getByPlaceholder("12").fill("1");
    await page.getByRole("button", { name: /Guardar posición/i }).click();
    await expect(page.locator("text=SPY").first()).toBeVisible({ timeout: 30_000 });

    // Limpieza: cantidad 0 elimina la posición.
    await tickerInput.fill("SPY");
    await page.getByPlaceholder("12").fill("0");
    await page.getByRole("button", { name: /Guardar posición/i }).click();
    await expect(page.locator('[role="row"]', { hasText: "SPY" })).toHaveCount(0, { timeout: 30_000 });
  });

  test("refresh manual no rompe la sesión", async ({ page }) => {
    await page.goto("/app#holdings");
    await page.getByRole("button", { name: /Actualizar$|Refresh$/ }).first().click();
    await expect(page.locator("main")).not.toContainText(/Traceback|Internal Server Error/i);
    await expect(page).toHaveURL(/\/app/);
  });

  test("sin errores de red 5xx al cargar el workspace", async ({ page }) => {
    const failures = [];
    page.on("response", (res) => {
      if (res.status() >= 500) failures.push(`${res.status()} ${res.url()}`);
    });
    await page.goto("/app#holdings");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(failures, failures.join("; ")).toHaveLength(0);
  });
});
