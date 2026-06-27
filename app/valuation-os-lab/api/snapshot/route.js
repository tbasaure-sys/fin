import { buildAssumptionPolicy } from "../../assumption-policy.js";

export const dynamic = "force-dynamic";

const SEC_TICKER_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_FACTS_BASE = "https://data.sec.gov/api/xbrl/companyfacts";
const SEC_SUBMISSIONS_BASE = "https://data.sec.gov/submissions";

function cleanEnv(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  if (/^(dummy|replace_me|your_key_here|your_email@example\.com)$/i.test(cleaned)) return "";
  return cleaned;
}

function secUserAgent() {
  return (
    cleanEnv(process.env.SEC_USER_AGENT) ||
    cleanEnv(process.env.SEC_EDGAR_USER_AGENT) ||
    cleanEnv(process.env.BLS_PRIME_SEC_USER_AGENT) ||
    cleanEnv(process.env.META_ALLOCATOR_SEC_USER_AGENT) ||
    "BLS Prime ValuationOS local lab contact@example.invalid"
  );
}

function fmpApiKey() {
  return cleanEnv(process.env.FMP_API_KEY) || cleanEnv(process.env.FINANCIAL_MODELING_PREP_API_KEY);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs || 12000),
    headers: {
      accept: "application/json",
      "user-agent": secUserAgent(),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${url} failed with ${response.status}: ${text.slice(0, 180)}`);
  }
  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs || 12000),
    headers: {
      accept: options.accept || "text/plain",
      "user-agent": secUserAgent(),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${url} failed with ${response.status}: ${text.slice(0, 180)}`);
  }
  return response.text();
}

function normalizeCik(cik) {
  return String(cik || "").padStart(10, "0");
}

async function findTicker(ticker) {
  const raw = String(ticker || "").trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,12}$/.test(raw)) {
    throw new Error("Ticker must be 1-12 letters/numbers/dot/dash.");
  }
  const lookup = raw.replace(/\./g, "-");
  const data = await fetchJson(SEC_TICKER_URL);
  const match = Object.values(data).find((entry) => String(entry.ticker || "").toUpperCase() === lookup);
  if (!match) throw new Error(`SEC ticker mapping did not find ${raw}.`);
  return {
    requestedTicker: raw,
    ticker: String(match.ticker || raw).toUpperCase(),
    cik: normalizeCik(match.cik_str),
    name: String(match.title || raw),
  };
}

function factUnits(facts, concept, unit = "USD") {
  const item =
    facts?.facts?.["us-gaap"]?.[concept]
    || facts?.facts?.["ifrs-full"]?.[concept]
    || facts?.facts?.dei?.[concept];
  if (!item?.units) return [];
  if (item.units[unit]) return item.units[unit];
  const first = Object.values(item.units).find((values) => Array.isArray(values));
  return first || [];
}

function isAnnualFiling(form) {
  return /^(10-K|20-F|40-F)(\/A)?$/i.test(String(form || "").trim());
}

function yearFromDate(value) {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(String(value || ""));
  return match ? Number(match[1]) : null;
}

function effectiveFiscalYear(row) {
  const frameMatch = /^CY(\d{4})$/i.exec(String(row?.frame || ""));
  if (frameMatch) return Number(frameMatch[1]);
  return yearFromDate(row?.end) || Number(row?.fy);
}

function annualDurationDays(row) {
  const start = Date.parse(row?.start || "");
  const end = Date.parse(row?.end || "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return (end - start) / 86400000;
}

function annualFacts(facts, concepts, unit = "USD") {
  return concepts.flatMap((concept) =>
    factUnits(facts, concept, unit)
      .filter((row) => {
        if (!isAnnualFiling(row.form) || !Number.isFinite(Number(row.val))) return false;
        const duration = annualDurationDays(row);
        return duration === null || duration >= 300;
      })
      .map((row) => ({
        concept,
        fy: effectiveFiscalYear(row),
        fp: row.fp,
        filed: row.filed,
        end: row.end,
        value: Number(row.val),
        accn: row.accn,
      }))
      .filter((row) => Number.isFinite(row.fy)),
  );
}

function latestAnnual(facts, concepts, unit = "USD") {
  return annualFacts(facts, concepts, unit).sort((a, b) => {
    if (b.fy !== a.fy) return b.fy - a.fy;
    return String(b.filed || "").localeCompare(String(a.filed || ""));
  })[0] || null;
}

function annualSeries(facts, concepts, unit = "USD") {
  const byYear = new Map();
  for (const row of annualFacts(facts, concepts, unit)) {
    const prior = byYear.get(row.fy);
    if (
      !prior
      || String(row.filed || "") > String(prior.filed || "")
      || (String(row.filed || "") === String(prior.filed || "") && String(row.end || "") > String(prior.end || ""))
    ) {
      byYear.set(row.fy, row);
    }
  }
  return [...byYear.values()].sort((a, b) => a.fy - b.fy);
}

function safeRatio(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || Math.abs(d) < 1e-9) return null;
  return n / d;
}

function clamp(value, min, max) {
  if (!Number.isFinite(Number(value))) return min;
  return Math.min(Math.max(Number(value), min), max);
}

async function fetchQuote(ticker) {
  const apiKey = fmpApiKey();
  if (apiKey) {
    const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
    try {
      const data = await fetchJson(url, { timeoutMs: 8000, headers: { "user-agent": "BLS Prime ValuationOS" } });
      const quote = Array.isArray(data) ? data[0] : null;
      const price = Number(quote?.price);
      if (Number.isFinite(price) && price > 0) {
        return {
          price,
          marketCap: Number.isFinite(Number(quote.marketCap)) ? Number(quote.marketCap) : null,
          source: "FMP stable quote",
        };
      }
    } catch {
      // Fall through to the public price-only check below.
    }
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
    const data = await fetchJson(url, { timeoutMs: 8000, headers: { "user-agent": "BLS Prime ValuationOS" } });
    const meta = data?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice || meta?.previousClose);
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      price,
      marketCap: null,
      source: "Yahoo chart price fallback",
    };
  } catch {
    return null;
  }
}

export function parseTreasuryYieldCurve10Year(xml) {
  const entries = String(xml || "").match(/<entry>[\s\S]*?<\/entry>/g) || [];
  let latest = null;
  for (const entry of entries) {
    const date = /<d:NEW_DATE[^>]*>(\d{4}-\d{2}-\d{2})T/.exec(entry)?.[1];
    const rate = Number(/<d:BC_10YEAR[^>]*>([-0-9.]+)<\/d:BC_10YEAR>/.exec(entry)?.[1]);
    if (!date || !Number.isFinite(rate)) continue;
    if (!latest || date > latest.date) latest = { date, value: rate / 100 };
  }
  return latest;
}

function treasuryMonthString(offsetMonths = 0) {
  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offsetMonths, 1));
  const year = month.getUTCFullYear();
  const monthNumber = String(month.getUTCMonth() + 1).padStart(2, "0");
  return `${year}${monthNumber}`;
}

async function fetchTreasuryYieldCurveRate() {
  for (const offsetMonths of [0, 1]) {
    const month = treasuryMonthString(offsetMonths);
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${month}`;
    try {
      const xml = await fetchText(url, { timeoutMs: 8000, accept: "application/xml" });
      const latest = parseTreasuryYieldCurve10Year(xml);
      if (latest) {
        return {
          ...latest,
          source: "U.S. Treasury daily yield curve 10Y",
        };
      }
    } catch {
      // Try the previous month before giving up.
    }
  }
  return null;
}

async function fetchMarketTenYearRate() {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?range=5d&interval=1d";
    const data = await fetchJson(url, { timeoutMs: 8000, headers: { "user-agent": "BLS Prime ValuationOS" } });
    const meta = data?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice || meta?.previousClose);
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      date: meta?.regularMarketTime ? new Date(Number(meta.regularMarketTime) * 1000).toISOString().slice(0, 10) : null,
      value: price / 100,
      source: "Market proxy CBOE 10Y Treasury index (^TNX)",
    };
  } catch {
    return null;
  }
}

async function fetchRiskFreeRate() {
  const apiKey = cleanEnv(process.env.FRED_API_KEY);
  if (apiKey) {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
    try {
      const data = await fetchJson(url, { timeoutMs: 8000, headers: { "user-agent": "BLS Prime ValuationOS" } });
      const obs = data?.observations?.find((row) => Number.isFinite(Number(row.value)));
      if (obs) {
        return {
          date: obs.date,
          value: Number(obs.value) / 100,
          source: "FRED DGS10",
        };
      }
    } catch {
      // Fall through to the public Treasury curve below.
    }
  }
  return (await fetchTreasuryYieldCurveRate()) || (await fetchMarketTenYearRate());
}

async function fetchSubmissions(cik) {
  try {
    return await fetchJson(`${SEC_SUBMISSIONS_BASE}/CIK${normalizeCik(cik)}.json`, { timeoutMs: 8000 });
  } catch {
    return null;
  }
}

function deriveDrivers(facts, quote, riskFree, metadata = {}) {
  const revenueSeries = annualSeries(facts, [
    "Revenues",
    "Revenue",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractsWithCustomers",
    "SalesRevenueNet",
  ]);
  const revenue = revenueSeries.at(-1) || null;
  const revenueStart = revenueSeries.length >= 4 ? revenueSeries.at(-4) : revenueSeries.at(0);
  const operatingIncome = latestAnnual(facts, [
    "OperatingIncomeLoss",
    "ProfitLossFromOperatingActivities",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
  ]);
  const netIncome = latestAnnual(facts, ["NetIncomeLoss", "ProfitLoss", "ProfitLossAttributableToOwnersOfParent"]);
  const assets = latestAnnual(facts, ["Assets"]);
  const liabilities = latestAnnual(facts, ["Liabilities"]);
  const equity = latestAnnual(facts, [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    "Equity",
    "EquityAttributableToOwnersOfParent",
  ]);
  const cfo = latestAnnual(facts, [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    "CashFlowsFromUsedInOperatingActivities",
    "CashFlowsFromUsedInOperatingActivitiesContinuingOperations",
  ]);
  const capex = latestAnnual(facts, [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
    "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
    "PurchaseOfPropertyPlantAndEquipmentIntangibleAssetsOtherThanGoodwillInvestmentPropertyAndOtherNoncurrentAssets",
  ]);
  const shares = latestAnnual(facts, [
    "WeightedAverageNumberOfDilutedSharesOutstanding",
    "WeightedAverageNumberOfSharesOutstandingDiluted",
    "AdjustedWeightedAverageShares",
    "WeightedAverageNumberOfOrdinarySharesOutstanding",
    "NumberOfSharesOutstanding",
    "EntityCommonStockSharesOutstanding",
  ], "shares");

  const revenueCagr =
    revenue && revenueStart && revenue.fy > revenueStart.fy && revenueStart.value > 0
      ? Math.pow(revenue.value / revenueStart.value, 1 / (revenue.fy - revenueStart.fy)) - 1
      : null;
  const margin = safeRatio(operatingIncome?.value, revenue?.value);
  const capexValue = Math.abs(Number(capex?.value || 0));
  const fcf = Number(cfo?.value || 0) - capexValue;
  const dilutedShares = Number(shares?.value || 0);
  const baseFcf = dilutedShares > 0 ? fcf / dilutedShares : null;
  const capitalBase = Number(equity?.value || 0) || Number(assets?.value || 0) - Number(liabilities?.value || 0);
  const nopat = Number(operatingIncome?.value || netIncome?.value || 0) * 0.79;
  const roic = safeRatio(nopat, Math.abs(capitalBase));
  const capexToRevenue = safeRatio(capexValue, revenue?.value);
  const factsPresent = [revenue, operatingIncome, netIncome, assets, equity, cfo, capex, shares].filter(Boolean).length;
  const assumptionPolicy = buildAssumptionPolicy({
    name: metadata.name || facts?.entityName,
    sicDescription: metadata.sicDescription,
    riskFreeRate: riskFree?.value,
    roic,
    capexToRevenue,
    factsPresent,
  });
  const wacc = assumptionPolicy.wacc;
  const terminalRoic = assumptionPolicy.terminalRoic;
  const moatHalfLife = assumptionPolicy.moatHalfLife;
  const roicSpread = roic === null ? 0 : Number(roic) - wacc;
  const industryKey = assumptionPolicy.industryKey;
  const bottleneckBase =
    industryKey === "semiconductors"
      ? 0.72
      : industryKey === "software"
        ? 0.56
        : industryKey === "utility"
          ? 0.62
          : industryKey === "bank"
            ? 0.28
            : 0.46;
  const demandBase =
    industryKey === "semiconductors"
      ? 0.68
      : industryKey === "software"
        ? 0.62
        : industryKey === "healthcare"
          ? 0.64
          : industryKey === "bank"
            ? 0.42
            : 0.5;
  const thesisQuality = clamp(0.46 + Math.max(0, roicSpread) * 1.15 + assumptionPolicy.confidence * 0.2, 0.25, 0.92);
  const demandSupply = clamp(demandBase + Number(revenueCagr || 0) * 0.8 - Math.max(0, Number(capexToRevenue || 0) - 0.12) * 0.35, 0.2, 0.94);
  const bottleneckPower = clamp(bottleneckBase + Math.max(0, roicSpread) * 0.9 + Math.min(0.12, Number(capexToRevenue || 0)) * 0.5, 0.15, 0.96);

  const drivers = {
    price: quote?.price || null,
    baseFcf: baseFcf && baseFcf > 0 ? baseFcf : null,
    revenueCagr: revenueCagr === null ? null : clamp(revenueCagr, -0.02, 0.18),
    margin: margin === null ? null : clamp(margin, 0.02, 0.42),
    roic: roic === null ? null : clamp(roic, 0.03, 0.34),
    terminalRoic,
    wacc,
    terminalGrowth: assumptionPolicy.terminalGrowth,
    reinvestment: assumptionPolicy.reinvestment,
    dilution: 0,
    beta: assumptionPolicy.beta,
    moatHalfLife,
    thesisQuality,
    demandSupply,
    bottleneckPower,
    dataQuality: clamp(0.22 + factsPresent * 0.075 + (quote ? 0.08 : 0) + (riskFree ? 0.06 : 0) + assumptionPolicy.confidence * 0.12, 0.25, 0.95),
    modelRisk: clamp(0.58 - factsPresent * 0.025 - Math.max(0, Number(roic || 0) - wacc) * 0.45 + (1 - assumptionPolicy.confidence) * 0.18, 0.16, 0.62),
  };
  const missingDrivers = Object.entries({
    price: drivers.price,
    baseFcf: drivers.baseFcf,
    revenueCagr: drivers.revenueCagr,
    margin: drivers.margin,
    roic: drivers.roic,
    reinvestment: drivers.reinvestment,
  })
    .filter(([, value]) => value === null || value === undefined)
    .map(([key]) => key);

  return {
    company: {
      fiscalYear: revenue?.fy || operatingIncome?.fy || null,
      filedAt: revenue?.filed || operatingIncome?.filed || null,
    },
    drivers,
    missingDrivers,
    valuationReady: missingDrivers.length === 0,
    assumptions: {
      industry: {
        key: assumptionPolicy.industryKey,
        label: assumptionPolicy.label,
        sic: metadata.sic || null,
        sicDescription: metadata.sicDescription || null,
        confidence: assumptionPolicy.confidence,
      },
      riskFree: {
        value: assumptionPolicy.riskFreeRate,
        source: riskFree?.source || "Explicit USD 10Y fallback",
        date: riskFree?.date || null,
      },
      wacc: {
        value: assumptionPolicy.wacc,
        beta: assumptionPolicy.beta,
        equityRiskPremium: assumptionPolicy.equityRiskPremium,
        debtWeight: assumptionPolicy.debtWeight,
        debtSpread: assumptionPolicy.debtSpread,
        taxRate: assumptionPolicy.taxRate,
        range: assumptionPolicy.waccRange,
        formula: "risk-free + beta-adjusted ERP + after-tax debt spread",
      },
      terminalRoic: {
        value: assumptionPolicy.terminalRoic,
        range: assumptionPolicy.terminalRoicRange,
      },
      terminalGrowth: {
        value: assumptionPolicy.terminalGrowth,
        range: assumptionPolicy.terminalGrowthRange,
      },
      sources: assumptionPolicy.sources,
    },
    facts: {
      revenue,
      operatingIncome,
      netIncome,
      assets,
      liabilities,
      equity,
      cfo,
      capex,
      shares,
      fcf,
      capexToRevenue,
      revenueSeries: revenueSeries.slice(-4),
    },
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tickerInfo = await findTicker(searchParams.get("ticker") || "AAPL");
    const [facts, submissions, quote, riskFree] = await Promise.all([
      fetchJson(`${SEC_FACTS_BASE}/CIK${tickerInfo.cik}.json`),
      fetchSubmissions(tickerInfo.cik),
      fetchQuote(tickerInfo.ticker),
      fetchRiskFreeRate(),
    ]);
    const derived = deriveDrivers(facts, quote, riskFree, {
      name: facts.entityName || tickerInfo.name,
      sic: submissions?.sic,
      sicDescription: submissions?.sicDescription,
    });

    return Response.json({
      ok: true,
      asOf: new Date().toISOString(),
      ...derived,
      company: {
        ...tickerInfo,
        entityName: facts.entityName || tickerInfo.name,
        industry: derived.assumptions?.industry?.label || null,
        sic: submissions?.sic || null,
        sicDescription: submissions?.sicDescription || null,
        ...derived.company,
      },
      quote,
      riskFree,
      coverage: {
        secCompanyFacts: true,
        secSubmissions: Boolean(submissions),
        quoteSource: quote?.source || null,
        fmpConfigured: Boolean(fmpApiKey()),
        fredConfigured: Boolean(cleanEnv(process.env.FRED_API_KEY)),
        secUserAgentConfigured: Boolean(cleanEnv(process.env.SEC_USER_AGENT) || cleanEnv(process.env.SEC_EDGAR_USER_AGENT)),
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown valuation snapshot error",
        coverage: {
          fmpConfigured: Boolean(fmpApiKey()),
          fredConfigured: Boolean(cleanEnv(process.env.FRED_API_KEY)),
          secUserAgentConfigured: Boolean(cleanEnv(process.env.SEC_USER_AGENT) || cleanEnv(process.env.SEC_EDGAR_USER_AGENT)),
        },
      },
      { status: 400 },
    );
  }
}
