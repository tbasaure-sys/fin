import { expect, test } from "@playwright/test";

const blockedValuation = {
  ok: true,
  ticker: "MU",
  generated_at: "2026-07-15T12:00:00Z",
  company_profile: {
    name: "Micron Technology, Inc.",
    industry: "Semiconductors",
    currency: "USD",
  },
  financials: {
    annual: [{ fiscal_year: 2025, revenue: 37_380_000_000 }],
    ratios: { latest_revenue: 37_380_000_000 },
  },
  valuation: {
    available: false,
    status: "not_decision_ready",
    currency: "USD",
    financial_data_as_of: "2025-08-28",
    blocking_gap: "structural_scale_bridge",
    pending_checks: [
      "structural_scale_bridge",
      "capacity_and_asset_turnover_support",
      "organic_or_acquisition_revenue_bridge",
      "segment_reconciliation",
    ],
    reliability: {
      status: "not_decision_ready",
      confidence_score: 63,
      limitations: ["El cambio de escala todavía no está reconciliado con evidencia operativa."],
    },
    market_requirements: {
      available: true,
      price_context: "provider_reconciled",
      reference_price: 120,
      market_data_as_of: "2026-07-14",
      implied_revenue_cagr: 0.184,
      normalized_margin: 0.265,
      discount_rate: 0.1,
      horizon_years: 5,
      terminal_growth: 0.03,
    },
  },
  sources: {
    coverage: {
      status: "pass",
      score: 100,
      expected_metrics: 19,
      covered_expected_metrics: 19,
      missing_expected_metrics: [],
      missing_required_formulas: [],
      missing_source_points: [],
      statement_source_provider: "fmp",
      statement_authority: "provider_reconciled_with_sec",
      sec_metadata_available: true,
    },
    records: [],
    data_points: [],
  },
  audit: {
    status: "pass",
    coverage: {
      status: "pass",
      score: 100,
      expected_metrics: 19,
      covered_expected_metrics: 19,
      missing_expected_metrics: [],
      missing_required_formulas: [],
      missing_source_points: [],
    },
    findings: [],
    quality_flags: [],
  },
  downloads: [],
  history: { persisted: false, run_count: 0, delta: { available: false, changes: [] } },
};

test("AURORA convierte una valoración retenida en próximos pasos y requisitos del precio", async ({ page }) => {
  await page.route("**/api/public/equity-research", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(blockedValuation),
    });
  });

  await page.goto("/aurora");
  await page.getByLabel("Ticker").fill("MU");
  await page.getByRole("button", { name: "Analizar" }).click();

  await expect(page.getByRole("tabpanel")).toContainText("Qué falta para continuar");
  await expect(page.getByRole("tabpanel")).toContainText("Explicar el cambio de escala");
  await expect(page.getByRole("tabpanel")).toContainText("Qué tendría que sostener el precio");
  await expect(page.getByRole("tabpanel")).toContainText("Crecimiento anual de ingresos");
  await expect(page.getByRole("tabpanel")).toContainText("No es una estimación de valor razonable");
  await expect(page.getByText("$31.83", { exact: true })).toHaveCount(0);

  await page.getByRole("tab", { name: /^Memo$/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Qué falta para continuar");

  await page.getByRole("tab", { name: /^Revisión/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Qué tendría que sostener el precio");
});
