import { test, expect } from "@playwright/test";

test.describe("Rutas públicas", () => {
  test("landing carga y muestra los tres módulos", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto("/");
    await expect(page).toHaveTitle(/BLS Prime/);
    await expect(page.getByRole("link", { name: /Entrar a la terminal|Enter the terminal/i }).first()).toBeVisible();
    await expect(page.locator("text=AURORA").first()).toBeVisible();
    await expect(page.locator("text=FactorLab").first()).toBeVisible();
    await expect(page.locator("text=Stress").first()).toBeVisible();
    expect(errors, `Errores JS en consola: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("/aurora redirige a valuation-os-lab y renderiza el veredicto", async ({ page }) => {
    await page.goto("/aurora");
    await expect(page).toHaveURL(/valuation-os-lab/);
    await expect(page.locator("text=AURORA").first()).toBeVisible();
    // Copy corregido: sin errores de tildes en el veredicto por defecto.
    await expect(page.locator("text=Hay algo acá, pero falta evidencia clave.")).toBeVisible();
  });

  test("/factorlab carga y expone el toggle de idioma", async ({ page }) => {
    await page.goto("/factorlab");
    await expect(page.getByRole("button", { name: "ES", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "ES", exact: true }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("blsprime_language_preference"))).toBe("es");
  });

  test("persistencia de idioma: ES sobrevive un reload", async ({ page }) => {
    await page.goto("/factorlab");
    await page.getByRole("button", { name: "ES", exact: true }).click();
    await page.reload();
    const stored = await page.evaluate(() => localStorage.getItem("blsprime_language_preference"));
    expect(stored).toBe("es");
  });

  test("/app sin sesión redirige a login con next=/app#risk", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?.*next=%2Fapp%23risk/);
  });

  test("/terms renderiza las 7 secciones", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("text=7. ")).toBeVisible();
  });

  test("login: formulario accesible con labels y validación de email", async ({ page }) => {
    await page.goto("/login?lang=es");
    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.getByLabel(/Contraseña/i)).toBeVisible();
    await page.getByLabel(/Email/i).fill("no-es-un-email");
    await page.getByRole("button", { name: /Crear cuenta|Crear mi cuenta/i }).click();
    // La validación nativa debe impedir el submit.
    await expect(page).toHaveURL(/\/login/);
  });
});
