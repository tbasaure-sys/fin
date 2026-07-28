import assert from "node:assert/strict";
import test from "node:test";

import { buildValuationSnapshot } from "../app/valuation-os-lab/api/snapshot/route.js";

function annual(value, fy, conceptUnit = "USD") {
  return {
    form: "10-K",
    fy,
    fp: "FY",
    start: `${fy}-01-01`,
    end: `${fy}-12-31`,
    filed: `${fy + 1}-02-15`,
    val: value,
    unit: conceptUnit,
  };
}

function concept(rows, unit = "USD") {
  return { units: { [unit]: rows } };
}

test("valuation snapshots expose the filed series FactorLab needs for live scoring", async () => {
  const previousFetch = globalThis.fetch;
  const previousFmp = process.env.FMP_API_KEY;
  const previousFred = process.env.FRED_API_KEY;
  delete process.env.FMP_API_KEY;
  delete process.env.FRED_API_KEY;

  const companyFacts = {
    entityName: "Live Systems",
    facts: {
      "us-gaap": {
        Revenues: concept([annual(80_000_000, 2023), annual(100_000_000, 2024), annual(130_000_000, 2025)]),
        GrossProfit: concept([annual(32_000_000, 2023), annual(42_000_000, 2024), annual(58_500_000, 2025)]),
        OperatingIncomeLoss: concept([annual(9_000_000, 2023), annual(14_000_000, 2024), annual(20_000_000, 2025)]),
        NetIncomeLoss: concept([annual(7_000_000, 2023), annual(11_000_000, 2024), annual(15_000_000, 2025)]),
        Assets: concept([annual(90_000_000, 2025)]),
        Liabilities: concept([annual(32_000_000, 2025)]),
        StockholdersEquity: concept([annual(58_000_000, 2025)]),
        NetCashProvidedByUsedInOperatingActivities: concept([annual(13_000_000, 2023), annual(18_000_000, 2024), annual(25_000_000, 2025)]),
        PaymentsToAcquirePropertyPlantAndEquipment: concept([annual(3_000_000, 2023), annual(4_000_000, 2024), annual(5_000_000, 2025)]),
        WeightedAverageNumberOfDilutedSharesOutstanding: concept([annual(9_200_000, 2023, "shares"), annual(9_500_000, 2024, "shares"), annual(10_000_000, 2025, "shares")], "shares"),
        CashAndCashEquivalentsAtCarryingValue: concept([annual(18_000_000, 2025)]),
        LongTermDebtCurrent: concept([annual(8_000_000, 2025)]),
      },
    },
  };

  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes("company_tickers.json")) return Response.json({ 0: { ticker: "LIVE", cik_str: 1234, title: "Live Systems" } });
    if (target.includes("companyfacts")) return Response.json(companyFacts);
    if (target.includes("submissions")) return Response.json({ sic: "3569", sicDescription: "Industrial machinery" });
    if (target.includes("query1.finance.yahoo.com")) return Response.json({ chart: { result: [{ meta: { regularMarketPrice: 24 } }] } });
    if (target.includes("home.treasury.gov")) return new Response("<feed><entry><d:NEW_DATE>2026-07-27T00:00:00</d:NEW_DATE><d:BC_10YEAR>4.20</d:BC_10YEAR></entry></feed>");
    throw new Error(`Unexpected request: ${target}`);
  };

  try {
    const snapshot = await buildValuationSnapshot("LIVE");

    assert.equal(snapshot.facts.grossProfitSeries.length, 3);
    assert.equal(snapshot.facts.operatingIncomeSeries.length, 3);
    assert.equal(snapshot.facts.cfoSeries.length, 3);
    assert.equal(snapshot.facts.capexSeries.length, 3);
    assert.equal(snapshot.facts.sharesSeries.length, 3);
    assert.equal(snapshot.facts.cash.value, 18_000_000);
    assert.equal(snapshot.facts.debt.value, 8_000_000);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousFmp === undefined) delete process.env.FMP_API_KEY;
    else process.env.FMP_API_KEY = previousFmp;
    if (previousFred === undefined) delete process.env.FRED_API_KEY;
    else process.env.FRED_API_KEY = previousFred;
  }
});
