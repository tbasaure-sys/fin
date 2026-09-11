import test from "node:test";
import assert from "node:assert/strict";
import { compileDossier, cleanTicker } from "../lib/research/dossier.js";

const input = () => ({
  ticker: "ACME",
  name: "Acme",
  asOf: "2026-08-01T00:00:00Z",
  sources: [
    {
      id: "D1",
      form: "10-K",
      acceptedAt: "2026-07-01T12:00:00Z",
      url: "https://www.sec.gov/Archives/edgar/data/1/example.htm",
      sha256: "a".repeat(64),
    },
  ],
  chunks: [
    {
      id: "D1:0",
      text: "Revenue increased 12% with recurring subscription revenue. Cash from operations increased $20 million. Capital expenditure and debt obligations are material risks.",
      blockStart: 0,
      blockEnd: 0,
    },
  ],
});
test("ticker input cannot become a path or a remote URL", () => {
  assert.equal(cleanTicker(" msft "), "MSFT");
  assert.equal(cleanTicker("BRK.B"), "BRK.B");
  for (const value of ["../MSFT", "https://a.test", "A/B", ""])
    assert.equal(cleanTicker(value), null);
});
test("document extraction never masquerades as an investment conclusion", () => {
  const result = compileDossier(input());
  assert.equal(result.analysis.status, "pending_provider");
  assert.equal(result.analysis.valuation, null);
  assert.equal(result.performance, null);
  assert.equal(result.sections.length, 3);
  assert.equal(result.coverage.selectedChunks, 1);
  assert.equal(result.sections[0].extracts[0].text, input().chunks[0].text);
});
test("future filings and orphan chunks fail closed", () => {
  const future = input();
  future.sources[0].acceptedAt = "2027-01-01T00:00:00Z";
  assert.throws(() => compileDossier(future), /FUTURE_SOURCE/);
  const orphan = input();
  orphan.chunks[0].id = "D2:0";
  assert.throws(() => compileDossier(orphan), /ORPHAN_CHUNK/);
});
test("source links cannot point to an arbitrary domain", () => {
  const bad = input();
  bad.sources[0].url = "https://evil.test/filing";
  assert.throws(() => compileDossier(bad), /INVALID_SOURCE/);
});
test("empty thematic evidence remains unknown", () => {
  const empty = input();
  empty.chunks = [];
  const result = compileDossier(empty);
  assert.equal(result.coverage.selectedChunks, 0);
  assert.ok(result.sections.every((s) => s.status === "no_extracts"));
});

test('the latest quarterly disclosure is not displaced by a verbose annual report',()=>{
  const packet=input();packet.sources.push({...packet.sources[0],id:'D2',form:'10-Q',acceptedAt:'2026-07-20T12:00:00Z'});
  packet.chunks=[0,1,2].map(i=>({...packet.chunks[0],id:`D1:${i}`}));
  packet.chunks.push({id:'D2:0',text:'Revenue declined as customer demand softened in the current quarter.',blockStart:0,blockEnd:0});
  const report=compileDossier(packet);
  assert.ok(report.sections[0].extracts.some(c=>c.id==='D2:0'));
  assert.ok(report.sections[0].extracts.length<=3);
});
