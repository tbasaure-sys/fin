import "server-only";

function unavailable(currency) {
  return { dashboard: { currency, as_of: "", portfolios: [] }, risk: null, source: "unavailable" };
}

// The upstream integration is single-account. Never share it across app users.
export async function getCarterasDashboard(currency = "USD", session = null) {
  const normalizedCurrency = String(currency).toUpperCase() === "CLP" ? "CLP" : "USD";
  const owner = String(process.env.CARTERAS_OWNER_USER_ID || "").trim();
  const workspace = String(process.env.CARTERAS_WORKSPACE_ID || "").trim();
  if (!owner || !workspace || session?.user?.id !== owner || session?.workspace?.id !== workspace) {
    return unavailable(normalizedCurrency);
  }
  const baseUrl = String(process.env.CARTERAS_API_BASE_URL || "").trim().replace(/\/$/, "");
  const token = String(process.env.CARTERAS_API_TOKEN || "").trim();
  if (!baseUrl || !token) return unavailable(normalizedCurrency);
  try {
    if (new URL(baseUrl).protocol !== "https:") return unavailable(normalizedCurrency);
    const fetchJson = async (path) => {
      const response = await fetch(`${baseUrl}${path}`, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Portfolio source unavailable");
      return response.json();
    };
    const [dashboard, risk] = await Promise.all([
      fetchJson(`/api/v1/dashboard?currency=${normalizedCurrency}`),
      fetchJson("/api/v1/risk/matrix?lens=scenario"),
    ]);
    if (!Array.isArray(dashboard?.portfolios)) return unavailable(normalizedCurrency);
    return { dashboard, risk, source: "api" };
  } catch {
    return unavailable(normalizedCurrency);
  }
}
