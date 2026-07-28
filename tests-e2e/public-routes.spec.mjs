import { test, expect } from "@playwright/test";

test("el HTML inicial de FactorLab y Stress respeta el locale solicitado", async ({ request }) => {
  const factorlabResponse = await request.get("/factorlab?lang=es");
  const factorlabHtml = await factorlabResponse.text();

  expect(factorlabResponse.ok()).toBeTruthy();
  expect(factorlabHtml).toContain("Encuentra empresas que vale la pena revisar");
  expect(factorlabHtml).not.toContain("Find companies worth reviewing");

  const stressResponse = await request.get("/stress?lang=es");
  const stressHtml = await stressResponse.text();

  expect(stressResponse.ok()).toBeTruthy();
  expect(stressHtml).toContain("Riesgo de cartera");
  expect(stressHtml).not.toContain("Portfolio risk");
});

test.describe("Rutas públicas", () => {
  test("landing carga el mapa de canales y los tres módulos", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto("/");
    await expect(page).toHaveTitle(/BLS Prime/);
    await expect(page.getByRole("link", { name: /Crear espacio de trabajo|Create workspace/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Analizar mi cartera|Analyze my portfolio/i })).toBeVisible();
    await expect(page.locator("text=AURORA").first()).toBeVisible();
    await expect(page.locator("text=FactorLab").first()).toBeVisible();
    await expect(page.locator("text=Stress").first()).toBeVisible();
    expect(errors, `Errores JS en consola: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("/aurora usa la valoración canónica y no publica el laboratorio heurístico", async ({ page }) => {
    await page.goto("/aurora");
    await expect(page).toHaveURL(/\/aurora$/);
    await expect(page.getByRole("heading", { name: /Un rango defendible/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Analizar" })).toBeVisible();
    await expect(page.getByLabel("Ticker")).toHaveValue("MU");
    await expect(page.locator("text=Hay algo acá, pero falta evidencia clave.")).toHaveCount(0);
  });

  test("/factorlab carga y expone el toggle de idioma", async ({ page }) => {
    await page.goto("/factorlab");
    await expect(page.getByRole("button", { name: "ES", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "ES", exact: true }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("blsprime_language_preference"))).toBe("es");
  });

  test("/channels es público y presenta portfolio intelligence sin pedir una cuenta", async ({ page }) => {
    await page.goto("/channels?lang=es");
    await expect(page).toHaveURL(/\/channels\?lang=es$/);
    await expect(
      page.getByRole("heading", { name: /Primero entiende qué apuestas tienes/i }),
    ).toBeVisible();
    await expect(page.getByText(/apuestas efectivas, clusters y correlaciones propias/i)).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("/channels no convierte una observación aislada en una cola de investigación", async ({ page }) => {
    await page.goto("/channels?lang=es");
    await page.getByRole("button", { name: "Probar descubrimiento" }).click();
    await page.getByRole("button", { name: /Flujos de salud/i }).click();
    await page.getByRole("button", { name: /Una herramienta está entrando/i }).click();
    await page.getByRole("button", { name: /Uso público/i }).click();
    await page.getByRole("button", { name: /Fue una observación aislada/i }).click();

    await expect(page.getByText(/Una observación aislada no crea un canal/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Nombres para investigar esta semana/i })).toHaveCount(0);
  });

  test("persistencia de idioma: ES sobrevive un reload", async ({ page }) => {
    await page.goto("/factorlab");
    await page.getByRole("button", { name: "ES", exact: true }).click();
    await page.reload();
    const stored = await page.evaluate(() => localStorage.getItem("blsprime_language_preference"));
    expect(stored).toBe("es");
  });

  test("/app sin sesión redirige a login con next=/app#holdings", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?.*next=%2Fapp%23holdings/);
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
