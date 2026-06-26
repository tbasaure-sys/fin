export const dynamic = "force-dynamic";

const SEC_TICKER_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_FACTS_BASE = "https://data.sec.gov/api/xbrl/companyfacts";

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

async function fetchRiskFreeRate() {
  const apiKey = cleanEnv(process.env.FRED_API_KEY);
  if (!apiKey) return null;
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
  try {
    const data = await fetchJson(url, { timeoutMs: 8000, headers: { "user-agent": "BLS Prime ValuationOS" } });
    const obs = data?.observations?.find((row) => Number.isFinite(Number(row.value)));
    if (!obs) return null;
    return {
      date: obs.date,
      value: Number(obs.value) / 100,
      source: "FRED DGS10",
    };
  } catch {
    return null;
  }
}

function deriveDrivers(facts, quote, riskFree) {
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
  const riskFreeRate = riskFree?.value || 0.042;
  const wacc = clamp(riskFreeRate + 0.047 + Math.max(0, 0.12 - Number(roic || 0)) * 0.08, 0.065, 0.14);
  const terminalRoic = clamp((roic || 0.12) * 0.76 + wacc * 0.24, 0.06, 0.24);
  const moatHalfLife = clamp(2 + Math.max(0, Number(roic || 0) - wacc) * 80, 2, 15);
  const factsPresent = [revenue, operatingIncome, netIncome, assets, equity, cfo, capex, shares].filter(Boolean).length;

  const drivers = {
    price: quote?.price || null,
    baseFcf: baseFcf && baseFcf > 0 ? baseFcf : null,
    revenueCagr: revenueCagr === null ? null : clamp(revenueCagr, -0.02, 0.18),
    margin: margin === null ? null : clamp(margin, 0.02, 0.42),
    roic: roic === null ? null : clamp(roic, 0.03, 0.34),
    terminalRoic,
    wacc,
    terminalGrowth: clamp((riskFree?.value || 0.04) * 0.45, 0.012, 0.035),
    reinvestment: capexToRevenue === null ? null : clamp(capexToRevenue * 3.8, 0.12, 0.72),
    dilution: 0,
    moatHalfLife,
    dataQuality: clamp(0.26 + factsPresent * 0.085 + (quote ? 0.08 : 0) + (riskFree ? 0.06 : 0), 0.25, 0.95),
    modelRisk: clamp(0.52 - factsPresent * 0.025 - Math.max(0, Number(roic || 0) - wacc) * 0.6, 0.18, 0.58),
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
      revenueSeries: revenueSeries.slice(-4),
    },
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tickerInfo = await findTicker(searchParams.get("ticker") || "AAPL");
    const [facts, quote, riskFree] = await Promise.all([
      fetchJson(`${SEC_FACTS_BASE}/CIK${tickerInfo.cik}.json`),
      fetchQuote(tickerInfo.ticker),
      fetchRiskFreeRate(),
    ]);
    const derived = deriveDrivers(facts, quote, riskFree);

    return Response.json({
      ok: true,
      asOf: new Date().toISOString(),
      ...derived,
      company: {
        ...tickerInfo,
        entityName: facts.entityName || tickerInfo.name,
        ...derived.company,
      },
      quote,
      riskFree,
      coverage: {
        secCompanyFacts: true,
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
