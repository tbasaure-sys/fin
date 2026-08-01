import { test, expect } from "@playwright/test";

test("el HTML inicial de FactorLab y Stress respeta el locale solicitado", async ({ request }) => {
  const factorlabResponse = await request.get("/factorlab?lang=es");
  const factorlabHtml = await factorlabResponse.text();

  expect(factorlabResponse.ok()).toBeTruthy();
  expect(factorlabHtml).toContain("<title>Descubrimiento de empresas | BLS Prime</title>");
  expect(factorlabHtml).toContain("Descubre qué empresa merece tu próxima hora");
  expect(factorlabHtml).not.toContain("Discover which company deserves your next hour");

  const stressResponse = await request.get("/stress?lang=es");
  const stressHtml = await stressResponse.text();

  expect(stressResponse.ok()).toBeTruthy();
  expect(stressHtml).toContain("<title>Riesgo de cartera | BLS Prime</title>");
  expect(stressHtml).toContain("Riesgo de cartera");
  expect(stressHtml).not.toContain("Portfolio risk");
});

test("privacidad declara las fronteras reales de eliminación, logs y proveedores de IA", async ({ request }) => {
  const response = await request.get("/privacy?lang=es");
  const html = await response.text();

  expect(response.ok()).toBeTruthy();
  expect(html).toContain("todavía no ofrece eliminación autoservicio de la cuenta");
  expect(html).toContain("chat de cartera con un proveedor de IA configurado");
  expect(html).toContain("no define cuánto tiempo conserva esos registros la plataforma de alojamiento");
  expect(html).not.toContain("Al eliminar tu cuenta se borran las posiciones");
  expect(html).not.toContain("privacy@blsprime.com");
  expect(html).not.toContain("registro de decisiones");
  expect(html).not.toContain("decision journal");
});

test.describe("Rutas públicas", () => {
  test("la portada presenta una sola decisión, sin ASML precargado ni cifras que parezcan en vivo", async ({ page }) => {
    await page.goto("/?lang=es");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Antes de invertir, entiende qué necesita el precio.",
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByText(/monitoreo|monitorear/i)).toHaveCount(0);
    await expect(page.getByLabel("Ticker estadounidense")).toHaveValue("");
    await expect(page.getByText("ASML", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Explorar una demo" })).toHaveAttribute("href", "#demo");

    for (const guarantee of [
      "Primera lectura sin cuenta",
      "Fecha, fuente y supuestos visibles",
      "Si falta evidencia, te decimos exactamente cuál",
    ]) {
      await expect(page.getByText(guarantee, { exact: true })).toBeVisible();
    }

    for (const step of ["Descubrir", "Entender el precio", "Construir la tesis", "Medir el riesgo"]) {
      await expect(page.getByRole("heading", { name: step, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Monitorear", exact: true })).toHaveCount(0);

    await expect(page.getByText("Ejemplo congelado", { exact: false })).toBeVisible();
    await expect(
      page.getByText("Ejemplo congelado · 30 de junio de 2026 · No son datos en vivo.", { exact: true }),
    ).toBeVisible();
  });

  test("landing carga el flujo de decisión y sus motores", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto("/");
    await expect(page).toHaveTitle(/BLS Prime/);
    await expect(page.getByRole("link", { name: /Crear espacio de trabajo|Create workspace/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Analizar mi cartera|Analyze my portfolio/i })).toBeVisible();
    await expect(page.locator("text=AURORA").first()).toBeVisible();
    await expect(page.locator("text=FactorLab").first()).toBeVisible();
    await expect(page.locator("text=Stress").first()).toBeVisible();
    expect(errors, `Errores JS en consola: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("/aurora usa la valoración canónica y no publica el laboratorio heurístico", async ({ page }) => {
    await page.goto("/aurora");
    await expect(page).toHaveURL(/\/aurora$/);
    await expect(page.getByRole("heading", { name: /Una lectura de valor para cada empresa/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Analizar" })).toBeVisible();
    await expect(page.getByLabel("Ticker")).toHaveValue("MU");
    await expect(page.locator("text=Hay algo acá, pero falta evidencia clave.")).toHaveCount(0);
  });

  test("/factorlab carga y expone el toggle de idioma", async ({ page }) => {
    await page.goto("/factorlab");
    const spanishButton = page.getByRole("button", { name: "ES", exact: true });
    if (!(await spanishButton.isVisible())) {
      await page.getByRole("button", { name: /Abrir navegación|Open navigation/i }).click();
    }
    await expect(spanishButton).toBeVisible();
    await spanishButton.click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("blsprime_language_preference"))).toBe("es");
  });

  test("/channels es público y presenta el diagnóstico de canales sin pedir una cuenta", async ({ page }) => {
    await page.goto("/channels?lang=es");
    await expect(page).toHaveURL(/\/channels\?lang=es$/);
    await expect(
      page.getByRole("heading", { name: /Dónde podrías ver algo antes o mejor que el mercado/i }),
    ).toBeVisible();
    await expect(page.getByText("Privado por defecto", { exact: true })).toBeVisible();
    await expect(page.getByText("El resultado aparece sin crear una cuenta.", { exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("/channels no convierte una observación aislada en una cola de investigación", async ({ page }) => {
    await page.goto("/channels?lang=es");
    await page.getByRole("button", { name: "Descubrir mis canales" }).click();
    for (let index = 0; index < 8; index += 1) {
      await page.locator("fieldset input:not([disabled])").first().check();
      await page.getByRole("button", { name: index === 7 ? "Ver mi diagnóstico" : "Continuar" }).click();
    }

    await expect(page.getByRole("heading", { name: "Tu mapa de canales" })).toBeVisible();
    await expect(page.getByText("Aún no aparece un canal defendible", { exact: true })).toBeVisible();
    await expect(page.getByText(/no conectan una observación pública, repetible y falsable/i)).toBeVisible();
    await expect(page.getByText(/cola de investigación/i)).toHaveCount(0);
  });

  test("/channels no persiste un resultado sensible y elimina cualquier perfil local pendiente", async ({ page }) => {
    let postCount = 0;
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ workspace: { id: "privacy-test-workspace" } }),
      }),
    );
    await page.route("**/api/v1/workspaces/privacy-test-workspace/channels", async (route) => {
      if (route.request().method() === "POST") postCount += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(route.request().method() === "GET" ? { profile: null } : { profile: {} }),
      });
    });

    await page.goto("/channels?lang=es&save=1");
    await page.evaluate(() => {
      localStorage.setItem("blsprime.channel_profile.v1", JSON.stringify({ stale: true }));
      sessionStorage.setItem("blsprime.channel_profile.v1:pending-save", "1");
    });

    await page.getByRole("button", { name: "Descubrir mis canales" }).click();
    await page.locator('fieldset input[value="professional_workflow"]').check();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.locator('fieldset input[value="operator"]').check();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.locator('fieldset input[value="patient"]').check();
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByText("Perfil bloqueado por fuente sensible", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          local: localStorage.getItem("blsprime.channel_profile.v1"),
          pending: sessionStorage.getItem("blsprime.channel_profile.v1:pending-save"),
        })),
      )
      .toEqual({ local: null, pending: null });
    expect(postCount).toBe(0);
  });

  test("/channels rechaza un perfil sensible heredado aunque la API lo devuelva", async ({ page }) => {
    let getCount = 0;
    await page.route("**/api/v1/session", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ workspace: { id: "legacy-privacy-workspace" } }),
      }),
    );
    await page.route("**/api/v1/workspaces/legacy-privacy-workspace/channels", async (route) => {
      if (route.request().method() === "GET") getCount += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          profile: {
            schemaVersion: "channel_profile_v1",
            answers: {
              version: "channel_profile_v1",
              archetypes: ["professional_workflow"],
              direct_experience: "operator",
              source_safety: "public_safe",
              public_sources: ["public_filings", "patient"],
              repeatability: "weekly",
              issuer_kpi_mapping: "issuer_kpi_timing",
              testability: "repeated_predictions",
              protection_time_fit: "specialized_fit",
            },
            result: {
              version: "channel_profile_v1",
              status: "probe_ready",
              safety: { blocked: false, reasons: [] },
            },
          },
        }),
      });
    });

    await page.goto("/channels?lang=es");

    await expect.poll(() => getCount).toBe(1);
    await expect(
      page.getByRole("heading", { name: /Dónde podrías ver algo antes o mejor que el mercado/i }),
    ).toBeVisible();
    await expect(page.getByText("Perfil bloqueado por fuente sensible", { exact: true })).toHaveCount(0);
  });

  test("persistencia de idioma: ES sobrevive un reload", async ({ page }) => {
    await page.goto("/factorlab");
    const spanishButton = page.getByRole("button", { name: "ES", exact: true });
    if (!(await spanishButton.isVisible())) {
      await page.getByRole("button", { name: /Abrir navegación|Open navigation/i }).click();
    }
    await spanishButton.click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("blsprime_language_preference"))).toBe("es");
    await expect(page).toHaveURL(/(?:\?|&)lang=es(?:&|$)/);
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
    await expect(page).toHaveTitle("Acceso al workspace | BLS Prime");
    await expect(page.getByText("Riesgo de cartera", { exact: true })).toBeVisible();
    await expect(page.getByText("Monitoreo y falsificadores", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.getByLabel(/Contraseña/i)).toBeVisible();
    await page.getByLabel(/Email/i).fill("no-es-un-email");
    await page.getByRole("button", { name: /Crear cuenta|Crear mi cuenta/i }).click();
    // La validación nativa debe impedir el submit.
    await expect(page).toHaveURL(/\/login/);
  });
});
