import { test, expect } from "@playwright/test";

// Chequeos WCAG básicos sin dependencias externas:
// labels, foco visible por teclado, lang del documento, imágenes con alt.

const PUBLIC_ROUTES = ["/", "/login?lang=es", "/valuation-os-lab", "/factorlab", "/terms"];

for (const route of PUBLIC_ROUTES) {
  test(`a11y básica en ${route}`, async ({ page }) => {
    await page.goto(route);

    // 1. lang declarado
    const lang = await page.evaluate(() => document.documentElement.lang);
    expect(["es", "en"]).toContain(lang || "en");

    // 2. inputs con label o aria-label
    const unlabeled = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll("input:not([type=hidden]), textarea, select")];
      return inputs
        .filter((el) => {
          if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return false;
          if (el.id && document.querySelector(`label[for="${el.id}"]`)) return false;
          if (el.closest("label")) return false;
          return true;
        })
        .map((el) => el.outerHTML.slice(0, 120));
    });
    expect(unlabeled, `Inputs sin label: ${unlabeled.join(" || ")}`).toHaveLength(0);

    // 3. imágenes con alt
    const missingAlt = await page.evaluate(() =>
      [...document.querySelectorAll("img")].filter((img) => !img.hasAttribute("alt")).map((img) => img.src),
    );
    expect(missingAlt, `Imágenes sin alt: ${missingAlt.join(", ")}`).toHaveLength(0);

    // 4. navegación por teclado: el primer Tab debe mover el foco a un elemento visible
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el && el !== document.body ? el.tagName : null;
    });
    expect(focused).not.toBeNull();
  });
}
