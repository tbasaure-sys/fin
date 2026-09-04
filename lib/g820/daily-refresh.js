import { buildG820DailyPriceOverlay, normalizeFmpQuote, selectG820DailyUniverse } from './daily-price-overlay.js';

// Shared by the protected production cron and an explicit, reproducible bundle refresh.
export async function fetchG820DailyPriceOverlay({ index, runtime, apiKey, fetchImpl = fetch,
  generatedAt = new Date().toISOString(), concurrency = 10, minimumCoverage = 0.8 }) {
  if (!apiKey) throw new Error('FMP_API_KEY is required for the G820 daily refresh.');
  if (!runtime || runtime.snapshotId !== index?.meta?.snapshotId
    || runtime.config?.engineVersion !== index?.meta?.engineVersion) throw new Error('G820 runtime identity mismatch');
  const frontier = selectG820DailyUniverse(index);
  const quotes = Array(frontier.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < frontier.length) {
      const position = cursor++;
      const company = frontier[position];
      // No partial v2 refresh may count a price without its reproducible decision context.
      if (!runtime.contexts?.[company.id]) continue;
      const url = new URL('https://financialmodelingprep.com/stable/quote');
      url.searchParams.set('symbol', company.ticker);
      url.searchParams.set('apikey', apiKey);
      try {
        const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
        if (response.ok) quotes[position] = normalizeFmpQuote(await response.json(), company.ticker);
      } catch {
        // Never serialize provider URLs: they contain the credential.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(20, concurrency, frontier.length)) }, worker));
  const overlay = buildG820DailyPriceOverlay(index, quotes, generatedAt, runtime);
  if (overlay.coverage.ratio < minimumCoverage) {
    throw new Error(`G820 refresh coverage ${overlay.coverage.succeeded}/${overlay.coverage.requested} is below the publish gate.`);
  }
  return overlay;
}
