import { cleanBreakpointTicker, isFiniteNumber } from "./contract.js";

function finiteOr(value, fallback = null) {
  return isFiniteNumber(value) ? Number(value) : fallback;
}

function evidenceText(item = {}) {
  return [item.title, item.summary, item.description, item.text].filter(Boolean).join(". ");
}

export function buildBreakpointInputFromSnapshot(snapshot = {}) {
  const revenueSeries = Array.isArray(snapshot?.facts?.revenueSeries) ? snapshot.facts.revenueSeries : [];
  const latestEbit = finiteOr(snapshot?.facts?.operatingIncome?.value, null);
  const incomeStatements = revenueSeries
    .filter((entry) => isFiniteNumber(entry?.value))
    .map((entry, index) => ({
      date: entry.end || entry.filed || `reported-${index}`,
      revenue: Number(entry.value),
      ebit: index === revenueSeries.length - 1 ? latestEbit : Number(entry.value) * finiteOr(snapshot?.drivers?.margin, 0.1),
    }));
  const evidence = Array.isArray(snapshot?.catalystEvidence?.items) ? snapshot.catalystEvidence.items : [];

  return {
    company: {
      ticker: cleanBreakpointTicker(snapshot?.company?.ticker),
      name: snapshot?.company?.entityName || snapshot?.company?.name || snapshot?.company?.ticker || "Unknown company",
      sector: snapshot?.company?.industry || snapshot?.assumptions?.industry?.label || "Unknown",
      industry: snapshot?.company?.industry || snapshot?.assumptions?.industry?.label || "Unknown",
    },
    market: {
      price: finiteOr(snapshot?.quote?.price, finiteOr(snapshot?.drivers?.price, null)),
      beta: finiteOr(snapshot?.assumptions?.wacc?.beta, finiteOr(snapshot?.drivers?.beta, 1)),
    },
    macro: {
      riskFreeRate: finiteOr(snapshot?.riskFree?.value, finiteOr(snapshot?.assumptions?.riskFree?.value, 0.04)),
      equityRiskPremium: finiteOr(snapshot?.assumptions?.wacc?.equityRiskPremium, 0.05),
      inflation: 0.02,
    },
    financials: {
      incomeStatements,
      balanceSheets: [{
        date: snapshot?.company?.filedAt || snapshot?.asOf || "reported",
        totalDebt: finiteOr(snapshot?.facts?.liabilities?.value, 0),
        totalStockholdersEquity: finiteOr(snapshot?.facts?.equity?.value, 0),
        cashAndCashEquivalents: 0,
      }],
      cashFlows: [{
        date: snapshot?.company?.filedAt || snapshot?.asOf || "reported",
        operatingCashFlow: finiteOr(snapshot?.facts?.cfo?.value, 0),
        capitalExpenditure: -Math.abs(finiteOr(snapshot?.facts?.capex?.value, 0)),
      }],
    },
    documents: evidence
      .map((item) => ({ type: item.type || "source record", source: item.source || item.provider || "source record", text: evidenceText(item) }))
      .filter((item) => item.text),
    observations: {
      asOfDate: snapshot?.asOf || null,
      metrics: {
        revenue_growth: finiteOr(snapshot?.drivers?.revenueCagr, null),
        operating_margin: finiteOr(snapshot?.drivers?.margin, null),
        roic: finiteOr(snapshot?.drivers?.roic, null),
        reinvestment_rate: finiteOr(snapshot?.drivers?.reinvestment, null),
      },
    },
  };
}

export function buildBreakpointSources(snapshot = {}) {
  const sources = [];
  if (snapshot?.coverage?.secCompanyFacts) sources.push({ label: "SEC company facts", date: snapshot?.company?.filedAt || null, category: "reported" });
  if (snapshot?.quote?.source) sources.push({ label: snapshot.quote.source, date: snapshot?.asOf || null, category: "market" });
  if (snapshot?.riskFree?.source) sources.push({ label: snapshot.riskFree.source, date: snapshot.riskFree.date || null, category: "assumption" });
  return sources;
}
