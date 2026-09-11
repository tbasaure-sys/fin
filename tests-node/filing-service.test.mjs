import test from "node:test";
import assert from "node:assert/strict";
import { createFilingService } from "../lib/server/filing-dossier-service.js";
const annual = {
  form: ["10-K"],
  accessionNumber: ["0000000001-26-000001"],
  primaryDocument: ["annual.htm"],
  filingDate: ["2026-07-01"],
  acceptanceDateTime: ["2026-07-01T12:00:00Z"],
  reportDate: ["2026-06-30"],
};
function fixtureFetch() {
  return async (url) => {
    if (url === "https://www.sec.gov/files/company_tickers.json")
      return Response.json({
        0: { cik_str: 1, ticker: "ACME", title: "Acme" },
      });
    if (url === "https://data.sec.gov/submissions/CIK0000000001.json")
      return Response.json({ name: "Acme", filings: { recent: annual } });
    if (
      url ===
      "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/annual.htm"
    )
      return new Response(
        "<html><p>Revenue increased 10% with subscription revenue. Cash from operations increased $2 million. Debt and impairment are risks.</p></html>",
      );
    throw Error("UNEXPECTED_REQUEST");
  };
}
test("complete SEC reading yields evidence without inventing interpretation", async () => {
  const load = createFilingService({
    fetcher: fixtureFetch(),
    now: () => "2026-08-01T00:00:00Z",
  });
  const dossier = await load("acme");
  assert.equal(dossier.ticker, "ACME");
  assert.equal(dossier.coverage.documents, 1);
  assert.match(dossier.sections[0].extracts[0].text, /Revenue increased 10%/);
  assert.equal(dossier.analysis.valuation, null);
  assert.equal(dossier.delivery, "live_fetch");
  assert.deepEqual(await load("ACME"), dossier);
});
test("bad ticker is rejected before external I/O", async () => {
  const load = createFilingService({
    fetcher: () => {
      throw Error("NETWORK_SHOULD_NOT_RUN");
    },
  });
  await assert.rejects(load("../MSFT"), /INVALID_TICKER/);
});
test("a missing filing does not publish a partial dossier", async () => {
  const source = fixtureFetch();
  const load = createFilingService({
    fetcher: (url) =>
      url.includes("/Archives/")
        ? Promise.resolve(new Response("", { status: 403 }))
        : source(url),
    now: () => "2026-08-01T00:00:00Z",
  });
  await assert.rejects(load("ACME"), /SEC_HTTP_403/);
});
test("unknown SEC ticker remains an error rather than an invented company", async () => {
  const load = createFilingService({ fetcher: fixtureFetch() });
  await assert.rejects(load("ZZNOTREAL"), /NO_ISSUER/);
});
