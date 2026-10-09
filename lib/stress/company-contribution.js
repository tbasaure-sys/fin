// Deterministic mark-to-scenario attribution; never a VaR or a price forecast.
export function companyScenarioContribution({ price, scenarioValue, weight }) {
  if (![price, scenarioValue, weight].every(v => typeof v === 'number' && Number.isFinite(v)) || price <= 0 || weight < 0 || weight > 1) return null;
  const companyChange = Math.max(-1, scenarioValue / price - 1);
  return { companyChange, contribution: companyChange * weight, restOfPortfolioChange: null, totalPortfolioChange: null };
}
