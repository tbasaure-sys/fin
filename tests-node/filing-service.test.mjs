import test from "node:test";
import assert from "node:assert/strict";
import { createFilingService } from "../lib/server/filing-dossier-service.js";
import {revenueFixture} from './fixtures/revenue-html.mjs';
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

test('the documentary dossier carries a revenue decomposition from its actual fetched source',async()=>{
 const network=fixtureFetch();
 const load=createFilingService({now:()=> '2026-08-01T00:00:00Z',fetcher:async url=>url.includes('/Archives/')
  ?new Response(revenueFixture().replaceAll('-09-30','-06-30')):network(url)});
 const dossier=await load('ACME');
 assert.equal(dossier.revenueBreakdown?.status,'available');
 assert.equal(dossier.revenueBreakdown.sourceId,dossier.sources[0].id);
 assert.equal(dossier.revenueBreakdown.partitions[0].rows[1].change,10e6);
});

test('simultaneous readers of one issuer share one documentary fetch instead of receiving BUSY',async()=>{
 const network=fixtureFetch();let release,entered;
 const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r),urls=[];
 const load=createFilingService({now:()=> '2026-08-01T00:00:00Z',fetcher:async url=>{
  urls.push(url);if(url.endsWith('company_tickers.json')){entered();await gate;}return network(url);
 }});
 const first=load('ACME');await started;
 const pair=Promise.allSettled([first,load('acme')]);
 // Another issuer remains subject to the resource bound; this is not more I/O.
 await assert.rejects(load('OTHER'),/BUSY/);
 release();const results=await pair;
 assert.deepEqual(results.map(r=>r.status),['fulfilled','fulfilled']);
 assert.equal(results[0].value.packetHash,results[1].value.packetHash);
 assert.equal(urls.length,3);
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

test('live dossier construction keeps the cash statement intact through the service boundary', async () => {
 const network = fixtureFetch();
 const rows = Array.from({length:60},(_,i)=>`<tr><td>Cash flow adjustment ${i}</td><td>${i}</td><td>${i+1}</td></tr>`).join('');
 const load = createFilingService({now:()=> '2026-08-01T00:00:00Z',fetcher: async url =>
   url.includes('/Archives/') ? new Response(`<h2>Item 1. Business</h2><p>We manufacture household appliances and sell maintenance services to customers worldwide.</p><h2>CONSOLIDATED STATEMENTS OF CASH FLOWS</h2><p>In millions</p><table><tr><td>Year ended</td><td>2026</td><td>2025</td></tr>${rows}<tr><td>Cash from operating activities</td><td>100</td><td>90</td></tr></table>`) : network(url)});
 const dossier = await load('ACME');
 const cash = dossier.sections.find(s=>s.id==='cash');
 assert.equal(cash.coverage?.roles.find(r=>r.id==='cash_flow_statement')?.status,'selected');
 const statement=cash.extracts.find(c=>c.text.includes('Cash from operating activities'));
 assert.ok(statement.text.includes('Year ended | 2026 | 2025'));
 assert.ok(statement.text.includes('Cash flow adjustment 0'));
 assert.equal(statement.table?.complete,true);
});
