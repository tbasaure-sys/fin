import "server-only";

const fallbackDashboard = {
  currency: "USD",
  as_of: "",
  portfolios: [
    { key: "igmar", name: "IGMAR", value: { value: 31097.34, currency: "USD", status: "broker_reported" }, total_pnl: { value: 4820, currency: "USD", status: "broker_reported" }, ytd: { value: 9.8, currency: "%", status: "broker_reported" }, one_day: { value: null, currency: "%", status: "partial" }, positions_count: 33, cash: 0, allocation: [{ ticker: "NBIS", weight: .27 }, { ticker: "ASML", weight: .20 }, { ticker: "UNH", weight: .16 }, { ticker: "MELI", weight: .13 }, { ticker: "Otros", weight: .24 }], series: [] },
    { key: "mom", name: "MOM", value: { value: 7100.97, currency: "USD", status: "broker_reported" }, total_pnl: { value: 930, currency: "USD", status: "broker_reported" }, ytd: { value: 6.1, currency: "%", status: "broker_reported" }, one_day: { value: null, currency: "%", status: "partial" }, positions_count: 25, cash: 0, allocation: [{ ticker: "ASML", weight: .24 }, { ticker: "NBIS", weight: .19 }, { ticker: "ISRG", weight: .16 }, { ticker: "MELI", weight: .12 }, { ticker: "Otros", weight: .29 }], series: [] },
    { key: "yo", name: "YO", value: { value: 7991.82, currency: "USD", status: "broker_reported" }, total_pnl: { value: 1410, currency: "USD", status: "broker_reported" }, ytd: { value: 11.7, currency: "%", status: "broker_reported" }, one_day: { value: null, currency: "%", status: "partial" }, positions_count: 33, cash: 218.36, allocation: [{ ticker: "NBIS", weight: .26 }, { ticker: "UNH", weight: .22 }, { ticker: "MELI", weight: .18 }, { ticker: "NOW", weight: .12 }, { ticker: "Otros", weight: .22 }], series: [] },
  ],
};

const fallbackRisk = {
  scope: "family",
  lens: "scenario",
  scenario: "China/EM slowdown",
  positions: ["NBIS", "ASML", "BAI", "CQQQ", "UNH", "MELI"],
  cells: [
    ["NBIS", "ASML", .86, .58, .78], ["NBIS", "BAI", .79, .61, .82], ["NBIS", "CQQQ", .82, .45, .74], ["NBIS", "UNH", .47, .12, .49], ["NBIS", "MELI", .76, .24, .72],
    ["ASML", "BAI", .75, .66, .84], ["ASML", "CQQQ", .77, .35, .69], ["ASML", "UNH", .39, .08, .46], ["ASML", "MELI", .72, .31, .67],
    ["BAI", "CQQQ", .73, .41, .77], ["BAI", "UNH", .37, .05, .42], ["BAI", "MELI", .68, .29, .71], ["CQQQ", "UNH", .35, .02, .37], ["CQQQ", "MELI", .67, .46, .79], ["UNH", "MELI", .43, .18, .54],
  ].map(([left, right, value, normal_correlation, stress_correlation]) => ({ left, right, value, normal_correlation, stress_correlation, confidence: "high", shared_drivers: [] })),
};

function configuredBaseUrl() {
  return String(process.env.CARTERAS_API_BASE_URL || "").trim().replace(/\/$/, "");
}

function configuredApiToken() {
  return String(process.env.CARTERAS_API_TOKEN || "").trim();
}

async function fetchJson(path) {
  const baseUrl = configuredBaseUrl();
  if (!baseUrl) return null;
  const token = configuredApiToken();
  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error(`Carteras API ${response.status}`);
  return response.json();
}

export async function getCarterasDashboard(currency = "USD") {
  const normalizedCurrency = String(currency || "USD").toUpperCase() === "CLP" ? "CLP" : "USD";
  if (!configuredBaseUrl()) {
    return {
      dashboard: { ...fallbackDashboard, currency: normalizedCurrency },
      risk: fallbackRisk,
      source: "fallback",
    };
  }
  try {
    const [dashboard, risk] = await Promise.all([
      fetchJson(`/api/v1/dashboard?currency=${normalizedCurrency}`),
      fetchJson("/api/v1/risk/matrix?lens=scenario"),
    ]);
    return {
      dashboard: dashboard || { ...fallbackDashboard, currency: normalizedCurrency },
      risk: risk || fallbackRisk,
      source: "api",
    };
  } catch {
    return {
      dashboard: { ...fallbackDashboard, currency: normalizedCurrency },
      risk: fallbackRisk,
      source: "fallback",
    };
  }
}
