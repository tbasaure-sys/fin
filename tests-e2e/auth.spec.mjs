import { test, expect } from "@playwright/test";

const EMAIL = process.env.BLS_E2E_EMAIL;
const PASSWORD = process.env.BLS_E2E_PASSWORD;

test.describe("Autenticación", () => {
  test("login con contraseña incorrecta muestra error y no entra", async ({ page }) => {
    test.skip(!EMAIL, "Define BLS_E2E_EMAIL");
    await page.goto("/login?intent=signin&lang=es");
    await page.getByLabel(/Email/i).fill(EMAIL);
    await page.getByLabel(/Contraseña/i).fill("contrasena-incorrecta-123");
    await page.getByRole("button", { name: /Iniciar sesión/i }).click();
    await expect(page).toHaveURL(/\/login/);
    // Debe mostrarse el mensaje mapeado (código -> copy propio), no el error crudo.
    await expect(page.locator("main")).toContainText(
      /Revisa tu email y contraseña|Check your email and password|No se pudo iniciar sesión|Could not sign in/i,
    );
    // El código en la URL debe ser uno conocido, nunca texto libre.
    await expect(page).toHaveURL(/error=(invalid_credentials|generic|validation)/);
  });

  test("login correcto aterriza en /app#holdings y logout vuelve al público", async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, "Define BLS_E2E_EMAIL y BLS_E2E_PASSWORD");
    await page.goto("/login?intent=signin&lang=es");
    await page.getByLabel(/Email/i).fill(EMAIL);
    await page.getByLabel(/Contraseña/i).fill(PASSWORD);
    await page.getByRole("button", { name: /Iniciar sesión/i }).click();
    await expect(page).toHaveURL(/\/app/);
    await expect(page.locator("h1").first()).toBeVisible();

    await page.getByRole("button", { name: /Cerrar sesión|Log out/i }).click();
    await expect(page).not.toHaveURL(/\/app/);
  });

  test("open redirect bloqueado: next=//evil.com se descarta", async ({ page }) => {
    await page.goto("/login?intent=signin&lang=es&next=%2F%2Fevil.com");
    const hiddenNext = await page.locator('input[name="next"]').inputValue();
    expect(hiddenNext).toBe("/app#holdings");
  });

  test("recuperación de contraseña: la página existe y acepta un email", async ({ page }) => {
    await page.goto("/forgot-password?lang=es");
    const emailField = page.locator('input[type="email"]');
    await expect(emailField).toBeVisible();
    await emailField.fill("qa+reset@example.com");
    await page.getByRole("button", { name: /enlace|reset|recuper/i }).click();
    // Respuesta neutral (no filtra si la cuenta existe).
    await expect(page.locator("main")).toContainText(/camino|instrucciones|exists|enviaremos|If the account/i);
  });
});
