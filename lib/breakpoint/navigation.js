function cleanTicker(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 16);
}

export function buildBreakpointCompanyLinks(ticker, language = "es") {
  const symbol = cleanTicker(ticker);
  const locale = language === "en" ? "en" : "es";
  const privateCompany = `/app/company/${encodeURIComponent(symbol)}`;
  return {
    company: `/company/${encodeURIComponent(symbol)}?lang=${locale}`,
    queue: `/login?intent=signin&next=${encodeURIComponent(privateCompany)}&lang=${locale}`,
  };
}
