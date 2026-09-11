import "server-only";
import { compileDossier, cleanTicker } from "../research/dossier.js";
import {
  selectFilings,
  documentBlocks,
  makeChunks,
  hash,
} from "../research/filing-engine.mjs";

// Bounded public documentary reads; no credentials, local-model calls or paid API.
// Instance-local admission/cache are resource controls, not distributed rate limiting.
export function createFilingService({
  fetcher = fetch,
  now = () => new Date().toISOString(),
} = {}) {
  const cache = new Map();
  let active = false,
    lastStarted = 0;
  return async function load(raw) {
    const ticker = cleanTicker(raw);
    if (!ticker) throw Error("INVALID_TICKER");
    const cached = cache.get(ticker);
    if (cached && Date.now() - cached.at < 3600000) return cached.value;
    if (active || Date.now() - lastStarted < 10000) throw Error("BUSY");
    active = true;
    lastStarted = Date.now();
    const asOf = now(),
      signal = AbortSignal.timeout(50000);
    let totalBytes = 0,
      lastFetch = 0;
    async function get(url) {
      const delay = lastFetch + 400 - Date.now();
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      lastFetch = Date.now();
      const r = await fetcher(url, {
        headers: { "User-Agent": "BLS-Prime-Research/1.0 tbasaure@uc.cl" },
        redirect: "error",
        signal,
        cache: "no-store",
      });
      if (!r.ok) throw Error(`SEC_HTTP_${r.status}`);
      const parts = [];
      let bytes = 0;
      for await (const part of r.body) {
        bytes += part.length;
        totalBytes += part.length;
        if (bytes > 20000000 || totalBytes > 40000000)
          throw Error("DOCUMENT_BUDGET");
        parts.push(part);
      }
      return Buffer.concat(parts);
    }
    try {
      const directory = JSON.parse(
        (
          await get("https://www.sec.gov/files/company_tickers.json")
        ).toString(),
      );
      const issuer = Object.values(directory).find(
        (row) => row.ticker === ticker,
      );
      if (!issuer) throw Error("NO_ISSUER");
      const cik = Number(issuer.cik_str);
      if (!Number.isSafeInteger(cik) || cik < 1) throw Error("INVALID_CIK");
      const submissions = JSON.parse(
        (
          await get(
            `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`,
          )
        ).toString(),
      );
      const filings = selectFilings(submissions.filings.recent, asOf),
        sources = [],
        chunks = [];
      for (const [i, filing] of filings.entries()) {
        if (
          !/^\d{10}-\d{2}-\d{6}$/.test(filing.accession) ||
          !/^[\w.-]+\.html?$/.test(filing.document)
        )
          throw Error("INVALID_FILING");
        const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${filing.accession.replaceAll("-", "")}/${filing.document}`;
        const raw = await get(url),
          id = `D${i + 1}`,
          blocks = documentBlocks(raw.toString());
        sources.push({
          ...filing,
          id,
          url,
          sha256: hash(raw),
          retrievedAt: now(),
        });
        chunks.push(...makeChunks(blocks, id));
      }
      const value = {
        ...compileDossier({
          ticker,
          cik,
          name: submissions.name,
          asOf,
          sources,
          chunks,
        }),
        delivery: "live_fetch",
      };
      if (cache.size >= 16) cache.delete(cache.keys().next().value);
      cache.set(ticker, { at: Date.now(), value });
      return value;
    } finally {
      active = false;
    }
  };
}
export const loadFilingDossier = createFilingService();
