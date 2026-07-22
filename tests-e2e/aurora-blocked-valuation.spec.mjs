import { expect, test } from "@playwright/test";

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDateDaysAgo = (days) => new Date(Date.now() - (days * DAY_MS)).toISOString().slice(0, 10);
const RECENT_MARKET_DATE = isoDateDaysAgo(1);
const RECENT_FINANCIAL_DATE = isoDateDaysAgo(45);
const RECENT_RETRIEVED_AT = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
const RECENT_MARKET_DATE_LABEL = new Date(`${RECENT_MARKET_DATE}T12:00:00Z`).toLocaleDateString("es-CL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const blockedCoverage = {
  status: "partial",
  score: 84,
  expected_metrics: 19,
  covered_expected_metrics: 16,
  missing_expected_metrics: ["valuation_range_central", "ev_to_sales", "price_to_fcf"],
  sourced_points_missing_ok_source: [],
  calculated_points_missing_formula: [],
  statement_source_provider: "FMP + SEC",
  statement_authority: "Estados normalizados con datos FMP y SEC",
  sec_metadata_available: true,
};

const blockedValuation = {
  ok: true,
  ticker: "MU",
  generated_at: RECENT_RETRIEVED_AT,
  company_profile: {
    name: "Micron Technology, Inc.",
    industry: "Semiconductors",
    currency: "USD",
  },
  financials: {
    annual: [{ fiscal_year: Number(RECENT_FINANCIAL_DATE.slice(0, 4)), revenue: 37_380_000_000 }],
    ratios: { latest_revenue: 37_380_000_000 },
  },
  valuation: {
    available: false,
    status: "not_decision_ready",
    current_price: 120,
    currency: "USD",
    market_data_as_of: RECENT_MARKET_DATE,
    financial_data_as_of: RECENT_FINANCIAL_DATE,
    blocking_gap: "structural_scale_bridge",
    pending_checks: [
      "structural_scale_bridge",
      "capacity_and_asset_turnover_support",
      "organic_or_acquisition_revenue_bridge",
      "segment_reconciliation",
    ],
    price_validation: {
      status: "provider_reconciled",
      usable: false,
      research_usable: true,
      usable_for_context: true,
      sources: ["FMP"],
    },
    reliability: {
      usable: false,
      status: "blocked",
      score: 0,
      reasons: [],
      limitations: ["El cambio de escala todavía no está reconciliado con evidencia operativa."],
      readiness_gates: {
        structural_scale_bridge: { passed: false },
      },
      decision_ready_blockers: ["structural_scale_bridge"],
    },
    market_requirements: {
      available: true,
      status: "solved",
      price_context: "contextual",
      reference_price: 120,
      market_data_as_of: RECENT_MARKET_DATE,
      currency: "USD",
      implied_revenue_cagr: 0.184,
      normalized_cash_flow_margin: 0.265,
      discount_rate: 0.1,
      horizon_years: 5,
      terminal_growth: 0.03,
      assets_added: 26_100_000_000,
      obligations_deducted: 7_500_000_000,
    },
  },
  sources: {
    coverage: { ...blockedCoverage },
    records: [
      { source_id: "fmp:quote", provider: "FMP", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 1 },
      { source_id: "fmp:prices", provider: "FMP", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 5 },
      { source_id: "fmp:income:quarterly", provider: "FMP", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 4 },
      { source_id: "fmp:balance:quarterly", provider: "FMP", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 4 },
      { source_id: "fmp:balance:ttm", provider: "FMP", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 1 },
      { source_id: "sec:companyfacts:income", provider: "SEC EDGAR", status: "ok", retrieved_at: RECENT_RETRIEVED_AT, row_count: 4 },
    ],
    data_points: [
      { metric: "financials.ttm.revenue", normalized_value: 90_274_000_000, unit: "USD", source_ids: ["fmp:income:quarterly", "sec:companyfacts:income"], claim_tag: "calculated_metric" },
      { metric: "financials.ttm.diluted_shares", normalized_value: 1_120_000_000, unit: "shares", source_ids: ["fmp:income:quarterly", "sec:companyfacts:income"], claim_tag: "calculated_metric" },
      { metric: "financials.ttm.cash", normalized_value: 26_100_000_000, unit: "USD", source_ids: ["fmp:balance:quarterly", "fmp:balance:ttm"], claim_tag: "calculated_metric" },
      { metric: "financials.ttm.total_debt", normalized_value: 7_500_000_000, unit: "USD", source_ids: ["fmp:balance:quarterly", "fmp:balance:ttm"], claim_tag: "calculated_metric" },
      { metric: "fcf_margin", normalized_value: 0.265, unit: "ratio", claim_tag: "calculated_metric" },
    ],
  },
  audit: {
    status: "needs_attention",
    coverage: { ...blockedCoverage },
    findings: [
      {
        severity: "medium",
        code: "valuation_unavailable",
        message: "La valoración no puede publicarse hasta completar los controles pendientes.",
      },
      {
        severity: "high",
        code: "valuation_not_decision_ready",
        message: "La valoración aún no supera los controles necesarios para publicar un valor razonable.",
      },
    ],
    quality_flags: [],
  },
  downloads: [],
  history: { persisted: false, run_count: 0, delta: { available: false, changes: [] } },
};

test("la primera visita no fuerza una limpieza de caché ni una recarga", async ({ page }) => {
  const documentRequests = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.resourceType() === "document" && request.frame() === page.mainFrame()) {
      documentRequests.push(request.url());
    }
  });

  await page.goto("/aurora");
  await expect(page.getByLabel("Ticker")).toBeVisible();

  const auroraRequests = documentRequests.filter((url) => new URL(url).pathname === "/aurora");
  expect(auroraRequests).toHaveLength(1);
  expect(auroraRequests[0]).not.toContain("cache_recovered=");
});

test("AURORA convierte una valoración retenida en próximos pasos y requisitos del precio", async ({ page }, testInfo) => {
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

  await expect(page.getByRole("tabpanel")).toContainText("Qué falta para una valoración completa");
  await expect(page.getByRole("tabpanel")).toContainText("Explicar el cambio de escala");
  await expect(page.getByRole("tabpanel")).toContainText("Qué tendría que sostener el precio");
  await expect(page.getByRole("tabpanel")).toContainText("Crecimiento anual de ingresos");
  await expect(page.getByRole("tabpanel")).toContainText("precio del proveedor");
  await expect(page.getByRole("tabpanel")).toContainText("$120.00");
  await expect(page.getByRole("tabpanel")).toContainText(RECENT_MARKET_DATE_LABEL);
  await expect(page.getByRole("tabpanel")).toContainText("Margen de caja normalizado");
  await expect(page.getByRole("tabpanel")).toContainText("26,5%");
  await expect(page.getByRole("tabpanel")).toContainText("Caja e inversiones sumadas");
  await expect(page.getByRole("tabpanel")).toContainText("Deuda y otros compromisos restados");
  await expect(page.getByRole("tabpanel")).toContainText("Paso a valor del accionista");
  await expect(page.getByRole("tabpanel")).toContainText("Sumado");
  await expect(page.getByRole("tabpanel")).toContainText("Restado");
  await expect(page.getByRole("tabpanel")).toContainText("No es una estimación de valor razonable");
  await expect(page.getByText("Pendientes", { exact: true }).locator("..")).toContainText("Explicar el cambio de escala");
  await expect(page.getByText("Los datos base están cubiertos; las cifras derivadas permanecen retenidas por los controles de valoración.")).toBeVisible();
  await expect(page.getByText("$31.83", { exact: true })).toHaveCount(0);

  await page.getByRole("tab", { name: /^Memo$/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Qué falta para una valoración completa");

  await page.getByRole("tab", { name: /^Revisión/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Qué tendría que sostener el precio");

  await page.getByRole("tab", { name: /^Fuentes/ }).click();
  const sourceTable = page.getByRole("table", { name: "Fuentes consultadas" });
  const valueTable = page.getByRole("table", { name: "Valores y procedencia" });
  await expect(sourceTable).toContainText("Estado y consulta");
  await expect(sourceTable).toContainText("Consulta:");
  await expect(sourceTable).toContainText("Disponible");
  await expect(sourceTable).toContainText("SEC EDGAR");
  await expect(valueTable).toContainText("$90.27B");
  await expect(valueTable).toContainText("1.120.000.000 acciones");
  await expect(valueTable).toContainText(/26,5\s*%/);
  await expect(valueTable).toContainText("$26.10B");
  await expect(valueTable).toContainText("$7.50B");

  if (testInfo.project.name === "mobile") {
    await expect(page.getByText("Desliza para ver todas las columnas →")).toBeVisible();
    const dimensions = await valueTable.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
    await valueTable.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    expect(await valueTable.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expect(valueTable.getByRole("cell", { name: "$90.27B" })).toBeVisible();
  }
});

test("AURORA no muestra requisitos del precio mientras ingresos y acciones TTM no estén conciliados", async ({ page }) => {
  const ttmBlockedValuation = structuredClone(blockedValuation);
  ttmBlockedValuation.valuation.blocking_gap = "ttm_scale_inputs_reconciliation";
  ttmBlockedValuation.valuation.pending_checks = [
    "ttm_scale_inputs_reconciliation",
    "structural_scale_bridge",
  ];
  ttmBlockedValuation.valuation.market_requirements = null;

  await page.route("**/api/public/equity-research", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ttmBlockedValuation),
    });
  });

  await page.goto("/aurora");
  await page.getByLabel("Ticker").fill("MU");
  await page.getByRole("button", { name: "Analizar" }).click();

  await expect(page.getByRole("tabpanel")).toContainText("Conciliar ingresos y acciones de los últimos doce meses");
  await expect(page.getByRole("tabpanel")).toContainText("Confirmar ingresos y acciones de cada trimestre");
  await expect(page.getByRole("tabpanel")).not.toContainText("Qué tendría que sostener el precio");
  await expect(page.getByText("$31.83", { exact: true })).toHaveCount(0);
});

test("AURORA explica brechas de datos aunque el backend no entregue una brecha de modelo", async ({ page }) => {
  const genericBlockedValuation = structuredClone(blockedValuation);
  genericBlockedValuation.valuation.blocking_gap = null;
  genericBlockedValuation.valuation.pending_checks = [];
  genericBlockedValuation.valuation.market_requirements = null;
  genericBlockedValuation.sources.coverage = {
    ...genericBlockedValuation.sources.coverage,
    score: 84,
    status: "partial",
    covered_expected_metrics: 16,
    missing_expected_metrics: ["wacc", "terminal_growth", "latest_sec_filing"],
  };
  genericBlockedValuation.audit.coverage = { ...genericBlockedValuation.sources.coverage };

  await page.route("**/api/public/equity-research", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(genericBlockedValuation),
    });
  });

  await page.goto("/aurora");
  await page.getByLabel("Ticker").fill("MU");
  await page.getByRole("button", { name: "Analizar" }).click();

  await expect(page.getByRole("tabpanel")).toContainText("Qué falta para una valoración completa");
  await expect(page.getByRole("tabpanel")).toContainText("Tasa de descuento");
  await expect(page.getByRole("tabpanel")).toContainText("Crecimiento de largo plazo");
  await expect(page.getByRole("tabpanel")).toContainText("Último informe presentado ante la SEC");
});

test("AURORA conserva a la vez brechas de valoración, precio, cobertura y fuente", async ({ page }) => {
  const multiGapValuation = structuredClone(blockedValuation);
  multiGapValuation.valuation.price_validation = {
    status: "stale",
    usable: false,
    research_usable: false,
    usable_for_context: false,
    sources: ["FMP"],
  };
  multiGapValuation.valuation.market_requirements = null;
  multiGapValuation.sources.coverage = {
    ...multiGapValuation.sources.coverage,
    missing_expected_metrics: ["wacc"],
    covered_expected_metrics: 18,
    score: 95,
  };
  multiGapValuation.audit.coverage = { ...multiGapValuation.sources.coverage };
  multiGapValuation.sources.records[0].status = "stale";

  await page.route("**/api/public/equity-research", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(multiGapValuation),
    });
  });

  await page.goto("/aurora");
  await page.getByLabel("Ticker").fill("MU");
  await page.getByRole("button", { name: "Analizar" }).click();

  const panel = page.getByRole("tabpanel");
  await expect(panel).toContainText("Explicar el cambio de escala");
  await expect(panel).toContainText("Precio actual");
  await expect(panel).toContainText("Tasa de descuento");
  await expect(panel).not.toContainText("Esta fuente está vencida");
});

test("AURORA explica un bloqueo no estructural sin caer en un mensaje genérico", async ({ page }) => {
  const estimateBlockedValuation = structuredClone(blockedValuation);
  estimateBlockedValuation.valuation.blocking_gap = "future_estimate_support";
  estimateBlockedValuation.valuation.pending_checks = [
    "future_estimate_support",
    "stock_compensation_treatment",
  ];
  estimateBlockedValuation.valuation.market_requirements = null;
  estimateBlockedValuation.sources.coverage = {
    ...estimateBlockedValuation.sources.coverage,
    score: 100,
    status: "complete",
    covered_expected_metrics: 19,
    missing_expected_metrics: [],
  };
  estimateBlockedValuation.audit.coverage = { ...estimateBlockedValuation.sources.coverage };

  await page.route("**/api/public/equity-research", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(estimateBlockedValuation),
    });
  });

  await page.goto("/aurora");
  await page.getByLabel("Ticker").fill("MU");
  await page.getByRole("button", { name: "Analizar" }).click();

  await expect(page.getByRole("tabpanel")).toContainText("Estimaciones financieras futuras");
  await expect(page.getByRole("tabpanel")).toContainText("Compensación en acciones");
  await expect(page.getByRole("tabpanel")).not.toContainText("el sistema no recibió una brecha más específica");
});

test("AURORA ofrece una lectura útil y móvil para una empresa pre-revenue sin inventar valor razonable", async ({ page }, testInfo) => {
  const earlyStageValuation = structuredClone(blockedValuation);
  earlyStageValuation.ticker = "EARLY";
  earlyStageValuation.company_profile = {
    name: "Example Early Stage Biotech",
    industry: "Biotechnology",
    currency: "USD",
  };
  earlyStageValuation.valuation.current_price = 8;
  earlyStageValuation.valuation.market_data_as_of = RECENT_MARKET_DATE;
  earlyStageValuation.valuation.blocking_gap = "future_estimate_support";
  earlyStageValuation.valuation.pending_checks = ["future_estimate_support", "share_dilution_support"];
  earlyStageValuation.valuation.market_requirements = null;
  earlyStageValuation.valuation.price_validation = {
    status: "provider_reconciled",
    usable: false,
    research_usable: true,
    usable_for_context: true,
    sources: ["Yahoo Finance"],
  };
  earlyStageValuation.valuation.screening_analysis = {
    version: "screening_analysis_v1",
    available: true,
    posture: "screen_grade",
    kind: "early_stage",
    fair_value_published: false,
    currency: "USD",
    market_data_as_of: RECENT_MARKET_DATE,
    financial_data_as_of: RECENT_FINANCIAL_DATE,
    observed: {
      current_price: 8,
      market_cap: 400_000_000,
      revenue: 0,
      free_cash_flow: -40_000_000,
      cash: 120_000_000,
      total_debt: 10_000_000,
      diluted_shares: 50_000_000,
      net_cash: 110_000_000,
      enterprise_value: 290_000_000,
    },
    ratios: { ev_to_revenue: null, fcf_yield: -0.1, net_cash_to_market_cap: 0.275 },
    runway: {
      annual_burn: 40_000_000,
      years: 3,
      months: 36,
      funding_need_for_24_months: 0,
      illustrative_dilution_at_20pct_discount: 0,
      pressure: "manageable",
    },
    market_read: {
      operations_value: 290_000_000,
      cash_per_share: 2.4,
      net_cash_per_share: 2.2,
      premium_to_net_cash: 2.6363636364,
    },
  };

  await page.route("**/api/public/equity-research", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(earlyStageValuation),
    });
  });

  await page.goto("/aurora");
  await page.getByLabel("Ticker").fill("EARLY");
  await page.getByRole("button", { name: "Analizar" }).click();

  const panel = page.getByRole("tabpanel");
  await expect(panel).toContainText("Lectura disponible ahora");
  await expect(panel).toContainText("Caja, consumo y riesgo de financiación");
  await expect(panel).toContainText("No es un valor razonable");
  await expect(panel).toContainText("$8.00");
  await expect(panel).toContainText("$400.00M");
  await expect(panel).toContainText("Sin ingresos informados");
  await expect(panel).toContainText("No aplica sin ingresos");
  await expect(panel).toContainText("$110.00M");
  await expect(panel).toContainText("$40.00M");
  await expect(panel).toContainText("3.0 años");
  await expect(panel).toContainText("No necesaria con la caja actual");
  await expect(panel).toContainText("Qué falta para una valoración completa");
  await expect(panel).not.toContainText("Obtener un precio reciente");
  await expect(panel.locator("details")).not.toHaveAttribute("open", "");

  if (testInfo.project.name === "mobile") {
    const viewport = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth + 1);
  }
});
