import test from 'node:test';
import assert from 'node:assert/strict';
import { selectResearchQueue } from '../lib/g820/research-queue.js';

test('discount queue prioritizes testable valuation gaps, not market score or missing values', () => {
  const rows = [
    { ticker: 'EXPENSIVE', actualMos: -.8, mrMarketScore: 90, category: 'WATCH_FOR_PRICE' },
    { ticker: 'UNKNOWN', actualMos: null, mrMarketScore: 100, category: 'DATA_EXCEPTION' },
    { ticker: 'GAP', actualMos: .2, safetySurplus: -.1, category: 'DATA_EXCEPTION' },
    { ticker: 'TRAP', actualMos: .8, safetySurplus: .3, category: 'CHEAP_BUT_STRUCTURALLY_IMPAIRED' },
    { ticker: 'STALE', actualMos: .3, safetySurplus: -.2, dailyPrice: { actualMos: -.1, safetySurplus: -.6 }, category: 'DATA_EXCEPTION' },
  ];
  assert.deepEqual(selectResearchQueue(rows, 'discounts').map((row) => row.ticker), ['GAP']);
  assert.equal(rows[0].ticker, 'EXPENSIVE');
  assert.equal(selectResearchQueue(rows, 'all').length, 5);
});
